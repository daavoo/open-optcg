"""PPO against the rules agents, starting from a behaviour-cloned scorer.

    .venv/bin/python -m sys1.ppo --init checkpoints/bc-17m --out checkpoints/ppo-17m

A collector process keeps `--concurrent` games in flight -- each a random
pairing of two distinct selectable decks, the scorer on a random seat and that
deck's rules agent on the other -- and starts a new one as each ends. Every
`--decisions` of the scorer's decisions from finished games become one
iteration's batch, which the trainer runs clipped PPO over. The collector
picks up each update between steps, so a trajectory can span weight versions;
every decision keeps the probability its own version gave it, and decisions
more than `--max-staleness` versions old are not trained on.

The reward is the result alone: +1 for a win, -1 for a loss, 0 for a game cut
off at the action cap. With no discount the value head is a win-probability
estimate (scaled to [-1, 1]) for the seat to move, which is also what the
behaviour-cloning warm start already taught it.
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import os
import time
from queue import Empty
from functools import partial
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np
from mlx.utils import tree_flatten, tree_map

from .data import token_budget_batches, collate
from .env import VectorEnv
from .evaluate import DeckFilter, catalog, head_to_head, paired_difference, play_vs_rules
from .matchups import Pairings, matchup_matrix
from .model import MixedPrecision
from .policy import Policy

# The length of `bridge/privileged.ts`'s vector (`PRIVILEGED_FEATURES` there).
PRIVILEGED_FEATURES = 68


def ppo_losses(model, batch, card_text, clip: float, value_coef: float, entropy_coef: float):
    logits, values = model(batch, card_text, detach_value=True)
    logp_all = logits - mx.logsumexp(logits, axis=-1, keepdims=True)
    logp = mx.take_along_axis(logp_all, batch["chosen"][:, None], axis=-1).squeeze(-1)
    ratio = mx.exp(logp - batch["old_logp"])
    advantage = batch["advantage"]
    policy_loss = -mx.minimum(ratio * advantage, mx.clip(ratio, 1 - clip, 1 + clip) * advantage)
    probs = mx.exp(logp_all) * batch["option_mask"]
    entropy = -(probs * mx.where(batch["option_mask"], logp_all, 0.0)).sum(axis=-1)
    value_loss = (values - batch["returns"]) ** 2
    weight = batch["weight"]
    total = mx.maximum(weight.sum(), 1.0)

    def mean(x):
        return (x * weight).sum() / total

    loss = mean(policy_loss) + value_coef * mean(value_loss) - entropy_coef * mean(entropy)
    approx_kl = mean(batch["old_logp"] - logp)
    return loss, (mean(policy_loss), mean(value_loss), mean(entropy), approx_kl)


def feedback_losses(model, batch, card_text, beta: float, coef: float):
    """The loss on moves a person flagged as misplays (`--feedback`).

    `chosen` is the flagged move and `good` the one the reviewer preferred,
    or -1 when they only said the move was wrong. With a preferred move the
    loss is a pairwise preference on the gap between the two log-probabilities,
    measured against the gap the starting checkpoint had (`ref_margin`), so it
    asks for the preference to grow rather than for either probability to
    reach an extreme; without one it lowers the flagged move's probability and
    lets the other options share what it gives up.
    """
    logits, _ = model(batch, card_text, detach_value=True)
    logp_all = logits - mx.logsumexp(logits, axis=-1, keepdims=True)
    bad = mx.take_along_axis(logp_all, batch["chosen"][:, None], axis=-1).squeeze(-1)
    good_index = batch["good"].astype(mx.int32)
    has_good = good_index >= 0
    good = mx.take_along_axis(logp_all, mx.maximum(good_index, 0)[:, None], axis=-1).squeeze(-1)
    preference = -nn.log_sigmoid(beta * ((good - bad) - batch["ref_margin"]))
    unlikelihood = -mx.log(mx.maximum(1 - mx.exp(bad), 1e-6))
    per_flag = mx.where(has_good, preference, unlikelihood)
    weight = batch["weight"]
    total = mx.maximum(weight.sum(), 1.0)
    loss = coef * (per_flag * weight).sum() / total
    # How many preferred moves the policy now ranks above the flagged one.
    agree = ((good > bad) * has_good * weight).sum() / mx.maximum((has_good * weight).sum(), 1.0)
    return loss, (loss, agree)


def load_feedback(policy: Policy, path: Path) -> dict | None:
    """The flagged positions in `path` (one JSON record each, from
    `bridge/feedback.ts`) as a corpus for `feedback_losses`.

    The reference gap is the starting checkpoint's, read once here: the loss
    asks every later version to prefer the reviewer's move by more than the
    policy the flags were written against did.
    """
    records = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    if not records:
        return None
    corpus = policy.corpus(records)
    corpus.chosen[:] = [r["bad"] for r in records]
    probs, _ = policy.score(records)
    margin = [
        float(np.log(max(p[r["good"]], 1e-12)) - np.log(max(p[r["bad"]], 1e-12))) if r["good"] >= 0 else 0.0
        for r, p in zip(records, probs)
    ]
    return {
        "corpus": corpus,
        "indices": np.arange(len(records)),
        "extras": {
            "good": np.array([r["good"] for r in records], dtype=np.float32),
            "ref_margin": np.array(margin, dtype=np.float32),
        },
    }


def make_step(model, optimizer, loss_fn, precision: MixedPrecision):
    """One compiled optimizer step on `loss_fn`.

    Every step of a run shares one `precision`: it holds the float32 master
    weights the optimizer steps, and two masters would each overwrite the
    model with their own copy.
    """
    grad_fn = nn.value_and_grad(model, loss_fn)
    state = [model.state, optimizer.state, precision.state]

    @partial(mx.compile, inputs=state, outputs=state)
    def compiled(batch, card_text):
        (loss, stats), grads = grad_fn(model, batch, card_text)
        grads, _ = optim.clip_grad_norm(grads, 0.5)
        precision.apply(optimizer, grads)
        return loss, stats

    return compiled


def make_accumulating_step(model, optimizer, loss_fn, precision: MixedPrecision):
    """`make_step` split in two, for `--accumulate`: a compiled gradient on one
    minibatch, and a compiled optimizer step on gradients summed over several.

    The policy gradient's noise scale (`noise_stats`) is tens of thousands of
    decisions, and one token-budget minibatch holds a few hundred, so a step
    per minibatch is mostly noise. Summing minibatches until a step averages
    `--accumulate` decisions buys a step whose direction is mostly signal, at
    the same cost per decision.
    """
    grad_fn = nn.value_and_grad(model, loss_fn)

    # value_and_grad swaps parameters into the model while it traces, so the
    # model's state is an output as well as an input.
    @partial(mx.compile, inputs=[model.state], outputs=[model.state])
    def gradient(batch, card_text):
        (loss, stats), grads = grad_fn(model, batch, card_text)
        return loss, stats, grads

    state = [model.state, optimizer.state, precision.state]

    @partial(mx.compile, inputs=state, outputs=state)
    def apply(grads):
        grads, _ = optim.clip_grad_norm(grads, 0.5)
        precision.apply(optimizer, grads)

    return gradient, apply


def policy_sq_norm(grads) -> mx.array:
    """The squared norm of a gradient over the policy's parameters: the value
    head and critic, which only the value loss reaches, are left out, so the
    noise scale is the policy gradient's."""
    leaves = [v for k, v in tree_flatten(grads) if not k.startswith(("value", "critic"))]
    return sum((v.astype(mx.float32) ** 2).sum() for v in leaves)


def noise_stats(sq_sum: float, weight: float, count: int, mean_sq: float) -> tuple[float, float] | None:
    """trΣ (per decision) and an unbiased |G|² from one accumulated step.

    The minibatch gradients g_i, each a mean over b_i decisions, have
    variance trΣ / b_i around the true G, so with N = Σ b_i and Ḡ their
    b-weighted mean, (Σ b_i |g_i|² - N |Ḡ|²) / (M - 1) estimates trΣ, and
    |Ḡ|² - trΣ / N estimates |G|² (McCandlish et al. 2018, appendix A).
    """
    if count < 2:
        return None
    trace = (sq_sum - weight * mean_sq) / (count - 1)
    return trace, mean_sq - trace / weight


def set_learning_rate(optimizer, lr: float) -> None:
    # A MultiOptimizer's last member is the one holding the shared `--lr`.
    target = optimizer.optimizers[-1] if hasattr(optimizer, "optimizers") else optimizer
    target.learning_rate = lr


class Pool:
    """A fixed number of games always in flight, each replaced as it ends.

    Game `slot` lives on worker `slot % workers` for the pool's lifetime, so a
    replacement lands on the worker whose game just finished and the load stays
    even; its seed carries the slot's generation, so no pairing repeats. Each
    game's opponent is the other deck's rules agent, or -- with probability
    `self_play` -- a frozen earlier snapshot of the scorer, which Python plays
    too. Only the learner's decisions are recorded, each tagged with the
    weight version that chose it: a game can outlive several versions.
    """

    def __init__(
        self, env: VectorEnv, concurrent: int, seed: str, rng, self_play: float = 0.0,
        pairings: Pairings | None = None,
    ):
        self.env = env
        self.concurrent = concurrent
        self.seed = seed
        self.rng = rng
        self.self_play = self_play
        # None leaves the pairing to the bridge: two distinct decks, uniformly.
        self.pairings = pairings
        self.generation = [0] * concurrent
        # slot -> (learner seat, snapshot index or None for the rules agent,
        # the game's importance weight towards uniform distinct pairings)
        self.seating: dict[int, tuple[str, int | None, float]] = {}
        self.steps: dict[int, list[dict]] = {}
        self.started = 0
        self.finished = 0
        self.open: list[dict] = []
        self.results = self._no_results()

    @staticmethod
    def _no_results() -> dict:
        # `uniform_*` sum the rules-agent games' importance weights (`w`, `ww`
        # its square, `won` over the wins): the win rate over uniform distinct
        # pairings, whatever the sampler drew.
        return {
            "won": 0, "lost": 0, "truncated": 0, "failed": 0, "self_won": 0, "self_lost": 0, "games": 0,
            "uniform_w": 0.0, "uniform_ww": 0.0, "uniform_won": 0.0,
        }

    def take_results(self) -> dict:
        results, self.results = self.results, self._no_results()
        return results

    def _launch(self, slots: list[int], snapshots: int) -> list[dict]:
        specs = []
        for slot in slots:
            learner = "p1" if self.rng.random() < 0.5 else "p2"
            snapshot = (
                int(self.rng.integers(snapshots)) if snapshots and self.rng.random() < self.self_play else None
            )
            p1, p2 = self.pairings.draw(self.rng) if self.pairings else ("random", "random")
            weight = self.pairings.importance(p1, p2) if self.pairings else 1.0
            self.seating[slot] = (learner, snapshot, weight)
            self.steps[slot] = []
            specs.append(
                {
                    "id": slot,
                    "p1": p1,
                    "p2": p2,
                    "seed": f"{self.seed}-{slot}-{self.generation[slot]}",
                    "rules": "none" if snapshot is not None else ("p2" if learner == "p1" else "p1"),
                }
            )
            self.generation[slot] += 1
            self.started += 1
        return self.env.reset(specs) if specs else []

    def _settle(self, pending: list[dict], snapshots: int) -> list[list[dict]]:
        """Record finished games and replace them; returns their trajectories."""
        finished: list[list[dict]] = []
        while pending:
            ended: list[int] = []
            for result in pending:
                if not result["done"]:
                    self.open.append(result)
                    continue
                slot = result["id"]
                steps = self.steps.pop(slot)
                _, snapshot, weight = self.seating.pop(slot)
                self.finished += 1
                ended.append(slot)
                if "failed" in result:
                    # The engine threw (see env.FAILED): the game has no
                    # result to learn from, so its decisions are dropped.
                    self.results["failed"] += 1
                    continue
                if not steps:
                    continue
                self.results["games"] += 1
                if result["truncated"] or result["winner"] is None:
                    self.results["truncated"] += 1
                    outcome = 0.0
                else:
                    outcome = 1.0 if result["winner"] == steps[0]["seat"] else -1.0
                    prefix = "self_" if snapshot is not None else ""
                    self.results[prefix + ("won" if outcome > 0 else "lost")] += 1
                    if snapshot is None:
                        self.results["uniform_w"] += weight
                        self.results["uniform_ww"] += weight * weight
                        self.results["uniform_won"] += weight * (outcome > 0)
                steps[-1]["reward"] = outcome
                finished.append(steps)
            # A replacement can end before its first real decision; settle it too.
            pending = self._launch(ended, snapshots)
        return finished

    def start(self, snapshots: int = 0) -> list[list[dict]]:
        return self._settle(self._launch(list(range(self.concurrent)), snapshots), snapshots)

    def step(self, policy: Policy, version: int, snapshots: list[Policy]) -> list[list[dict]]:
        """Score every open decision, play them, and return the games that ended."""
        open_, self.open = self.open, []
        actions: dict[int, int] = {}
        mine = [r for r in open_ if r["seat"] == self.seating[r["id"]][0]]
        by_snapshot: dict[int, list[dict]] = {}
        for r in open_:
            if r["seat"] != self.seating[r["id"]][0]:
                by_snapshot.setdefault(self.seating[r["id"]][1], []).append(r)
        for index, group in by_snapshot.items():
            probs, _ = snapshots[index].score(group)
            for result, p in zip(group, probs):
                p = p.astype(np.float64)
                actions[result["id"]] = int(self.rng.choice(len(p), p=p / p.sum()))
        if mine:
            probs, values = policy.score(mine)
            for result, p, v in zip(mine, probs, values):
                p = p.astype(np.float64)
                p /= p.sum()
                action = int(self.rng.choice(len(p), p=p))
                actions[result["id"]] = action
                self.steps[result["id"]].append(
                    {
                        **(
                            {"tokens": policy.tokens_of(result)}
                            if "tokens" in result
                            else {"state": result["state"], "actions": result["actions"]}
                        ),
                        "seat": result["seat"],
                        "chosen": action,
                        "old_logp": float(np.log(max(p[action], 1e-12))),
                        "value": float(v),
                        **({"privileged": result["privileged"]} if "privileged" in result else {}),
                        "reward": 0.0,
                        "version": version,
                    }
                )
        return self._settle(self.env.step(actions), len(snapshots))

    def in_flight(self) -> int:
        return len(self.seating)


def collector_main(args: dict, queue, ready, stop) -> None:
    """The rollout process: keeps `concurrent` games in flight across updates
    and hands the trainer every `decisions` decisions from finished games.

    Games still in progress at a handover carry on into the next batch, so the
    GPU always scores a full pool rather than the few long games at the end of
    a batch. Between steps it loads any newly published weights without
    draining the pool; a trajectory can then span versions, which PPO handles
    through each decision's recorded `old_logp`, and the trainer drops
    decisions too many versions old.

    A batch is handed over only when the trainer asks for one (`ready`). A
    full batch the trainer is not yet ready for pauses the pool: playing on
    would compete with the update for the GPU, and whatever it played would
    be on weights the update is about to replace. A game lasts about one
    batch, so a batch's decisions come from the last two versions: most are
    one or two behind, a few games run longer and reach `--max-staleness`.
    The pool never waits when the collector is the slower side.
    """
    init = Path(args["init"])
    out = Path(args["out"])
    privileged = PRIVILEGED_FEATURES if args["privileged"] else 0
    policy = Policy(init, card_features=args["card_features"], privileged=privileged)
    snapshots: list[Policy] = (
        [Policy(init, card_features=args["card_features"], privileged=privileged)] if args["self_play"] > 0 else []
    )
    if privileged:
        # The workers inherit it: each decision then carries the critic's
        # whole-state features beside its tokens.
        os.environ["SYS1_PRIVILEGED"] = "1"
    env = VectorEnv(args["workers"])
    rng = np.random.default_rng(args["seed"])
    pairings = None
    deck_filter = DeckFilter.from_files(None, args["exclude_decks"])
    if args["mirror"] > 0 or args["matchups"] or deck_filter.exclude:
        decks, _ = catalog(env)
        deck_filter.check(decks)
        decks = [deck for deck in decks if deck not in deck_filter.exclude]
        matrix = matchup_matrix(Path(args["matchups"])) if args["matchups"] else None
        pairings = Pairings(decks, args["mirror"], matrix, args["uniform_floor"])
    pool = Pool(env, args["concurrent"], "ppo", rng, args["self_play"], pairings)
    version = -1

    def refresh_weights() -> None:
        nonlocal version
        published = read_version(out)
        if published > version:
            policy.model.load_weights(str(out / f"weights-{published}.safetensors"))
            policy.refresh()
            version = published
            if args["id_dropout"] > 0:
                policy.card_keep = card_keep(version, args["id_dropout"], len(policy.card_texts.numbers))

    try:
        while read_version(out) < 0:
            if stop.wait(0.2):
                return
        refresh_weights()
        batch: list[list[dict]] = pool.start(len(snapshots))
        completed, recorded, handed = sum(map(len, batch)), 0, 0
        started = time.perf_counter()
        while not stop.is_set():
            refresh_weights()
            finished = pool.step(policy, version, snapshots)
            batch.extend(finished)
            completed += sum(map(len, finished))
            if completed < args["decisions"]:
                continue
            records = []
            for traj, steps in enumerate(batch):
                for record in steps:
                    record["traj"] = traj
                    records.append(record)
            results = pool.take_results()
            recorded += len(batch)
            # Every game started is recorded once it ends or is still in the pool.
            results["started"], results["recorded"], results["in_flight"] = (
                pool.started, pool.finished, pool.in_flight()
            )
            assert pool.started == pool.finished + pool.in_flight()
            elapsed = round(time.perf_counter() - started, 1)
            while not ready.wait(0.2):
                if stop.is_set():
                    return
            ready.clear()
            queue.put((version, records, results, elapsed))
            batch, completed = [], 0
            started = time.perf_counter()
            handed += 1
            if snapshots and handed % args["snapshot_every"] == 0:
                snapshot = (
                    snapshots.pop(0)
                    if len(snapshots) >= args["pool"]
                    else Policy(init, card_features=args["card_features"], privileged=privileged)
                )
                snapshot.model.load_weights(list(tree_flatten(policy.model.parameters())))
                snapshot.refresh()
                snapshots.append(snapshot)
    finally:
        env.close()


def card_keep(version: int, dropout: float, cards: int) -> np.ndarray:
    """Which cards keep their learned embedding under weight `version`, with
    `--id-dropout`: a pure function of the version, so the collector that
    played a decision and the update that trains on it zero the same cards,
    and the PPO ratio compares the policy with itself rather than with the
    policy's undropped twin."""
    keep = np.random.default_rng([version, 0x1D]).random(cards) >= dropout
    return keep.astype(np.float32)


def read_version(out: Path) -> int:
    path = out / "version"
    return int(path.read_text()) if path.exists() else -1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--init", required=True, help="starting checkpoint")
    parser.add_argument("--out", required=True)
    parser.add_argument("--iterations", type=int, default=300)
    parser.add_argument("--decisions", type=int, default=24576, help="scorer decisions per iteration")
    parser.add_argument("--concurrent", type=int, default=384)
    parser.add_argument("--workers", type=int, default=12, help="Node processes for rollouts")
    parser.add_argument("--eval-workers", type=int, default=6)
    parser.add_argument("--epochs", type=int, default=1)
    # Large minibatches and a small step: each update then covers most of the
    # batch before the KL guard stops it, rather than a few small minibatches.
    parser.add_argument("--budget", type=int, default=65536, help="padded tokens per minibatch")
    parser.add_argument("--lr", type=float, default=5e-6)
    parser.add_argument(
        "--lr-final", type=float, default=None,
        help="decay the learning rate linearly from --lr to this over --iterations (default: constant)",
    )
    parser.add_argument(
        "--cache-gb", type=float, default=8,
        help="cap on MLX's buffer cache: uncapped, a 196k-token minibatch leaves ~35 GB cached beside a ~22 GB peak",
    )
    parser.add_argument(
        "--accumulate", type=int, default=0,
        help="decisions an optimizer step averages, summed over minibatches (0: one step per minibatch)",
    )
    parser.add_argument("--target-kl", type=float, default=0.02, help="stop an update early past this")
    parser.add_argument("--clip", type=float, default=0.2)
    parser.add_argument("--value-coef", type=float, default=0.5)
    parser.add_argument("--entropy-coef", type=float, default=0.01)
    parser.add_argument("--lam", type=float, default=0.95)
    parser.add_argument("--eval-every", type=int, default=25, help="iterations between paired evaluations")
    parser.add_argument("--eval-games", type=int, default=1240)
    parser.add_argument(
        "--plateau-window", type=int, default=50,
        help="iterations of rollouts against the rules agents compared with the window before",
    )
    parser.add_argument(
        "--min-gain", type=float, default=0.01,
        help="stop once the rollout win rate is confidently gaining less than this per window",
    )
    parser.add_argument(
        "--veto", type=float, default=0.45,
        help="a checkpoint that beats the best is not promoted if it wins less than this head to head against it",
    )
    parser.add_argument(
        "--veto-decks", choices=["all", "featured", "starter", "cross"], default="featured",
        help="the kind of pairing the head-to-head veto plays",
    )
    parser.add_argument("--self-play", type=float, default=0.0, help="share of games against a snapshot")
    parser.add_argument("--snapshot-every", type=int, default=10)
    parser.add_argument("--pool", type=int, default=4, help="snapshots kept")
    parser.add_argument("--mirror", type=float, default=0.0, help="share of games with the same deck on both sides")
    parser.add_argument(
        "--matchups", help="a rules-vs-rules corpus under data/: weight pairings by p(1 - p) of their matchup"
    )
    parser.add_argument(
        "--uniform-floor", type=float, default=0.3,
        help="with --matchups, the share of the pairing weight kept uniform",
    )
    parser.add_argument(
        "--max-staleness", type=int, default=2, help="oldest weight version trained on, in updates behind"
    )
    parser.add_argument(
        "--feedback", help="flagged misplays from bridge/feedback.ts: trained on after every update"
    )
    parser.add_argument(
        "--feedback-weight", type=float, default=1.0,
        help="the flags' loss against one PPO minibatch's; each flag is one decision among ~25,000 a batch",
    )
    parser.add_argument("--feedback-beta", type=float, default=1.0, help="the preference loss's temperature")
    parser.add_argument(
        "--exclude-decks",
        help="a deck list file: neither seat of a rollout or an evaluation is ever one of its decks",
    )
    parser.add_argument(
        "--card-features", action="store_true",
        help="add the structured card features (features.py) to a checkpoint that has none",
    )
    parser.add_argument(
        "--feature-lr", type=float, default=None,
        help="a learning rate of their own for the card-feature tables (default: --lr)",
    )
    parser.add_argument(
        "--privileged", action="store_true",
        help="train the value head on the whole state too (bridge/privileged.ts); the policy never reads it",
    )
    parser.add_argument("--critic-lr", type=float, default=3e-4, help="with --privileged, the critic's learning rate")
    parser.add_argument(
        "--id-dropout", type=float, default=0.0,
        help="per minibatch, the share of cards whose learned embedding is zeroed in training",
    )
    args = parser.parse_args()
    deck_filter = DeckFilter.from_files(None, args.exclude_decks)
    # With the collector and the evaluation games beside it, an uncapped cache
    # pushes the trainer into swap on a 48 GB machine.
    mx.set_cache_limit(int(args.cache_gb * (1 << 30)))

    privileged = PRIVILEGED_FEATURES if args.privileged else 0
    policy = Policy(Path(args.init), card_features=args.card_features, privileged=privileged)
    model = policy.model
    optimizer = optim.AdamW(learning_rate=args.lr, weight_decay=0.0)
    # Tables that start at zero on a checkpoint gaining them barely move at
    # PPO's learning rate in a run, so each gets its own and the rest of the
    # model keeps `--lr`: the structured card features (`--feature-lr`), and
    # the critic (`--critic-lr`), which only the value loss reaches -- a
    # larger step there moves the value estimate, never the policy.
    own: list[tuple[float, tuple[str, ...]]] = []
    if args.feature_lr and policy.feature_vocab is not None:
        own.append((args.feature_lr, ("feature_embed", "number_mlp")))
    if privileged:
        own.append((args.critic_lr, ("critic",)))
    if own:
        optimizer = optim.MultiOptimizer(
            [optim.AdamW(learning_rate=lr, weight_decay=0.0) for lr, _ in own] + [optimizer],
            [lambda path, _, prefixes=prefixes: path.startswith(prefixes) for _, prefixes in own],
        )
    precision = MixedPrecision(model)
    losses = partial(ppo_losses, clip=args.clip, value_coef=args.value_coef, entropy_coef=args.entropy_coef)
    step = make_step(model, optimizer, losses, precision)
    accumulating = make_accumulating_step(model, optimizer, losses, precision) if args.accumulate > 0 else None
    feedback = load_feedback(policy, Path(args.feedback)) if args.feedback else None
    feedback_step = (
        make_step(
            model, optimizer,
            partial(feedback_losses, beta=args.feedback_beta, coef=args.feedback_weight),
            precision,
        )
        if feedback
        else None
    )
    rng = np.random.default_rng(0)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    config = json.loads((Path(args.init) / "config.json").read_text())
    if policy.feature_vocab is not None:
        config["card_feature_vocab"] = policy.feature_vocab
    if args.id_dropout > 0:
        config["id_dropout"] = args.id_dropout
    if privileged:
        config["privileged_features"] = privileged
    if deck_filter.exclude:
        config["held_out_decks"] = sorted(deck_filter.exclude)
    history: list[dict] = []

    def publish(version: int) -> None:
        # The collector loads whenever it sees a new version, including while
        # the next one is being written, so each version has its own file,
        # complete before the version number that names it is replaced.
        model.save_weights(str(out / f"weights-{version}.safetensors"))
        (out / "version.tmp").write_text(str(version))
        os.replace(out / "version.tmp", out / "version")
        model.save_weights(str(out / "weights.tmp.safetensors"))
        os.replace(out / "weights.tmp.safetensors", out / "weights.safetensors")
        (out / f"weights-{version - 3}.safetensors").unlink(missing_ok=True)

    publish(0)
    context = mp.get_context("spawn")
    queue = context.Queue(maxsize=1)
    ready = context.Event()
    stop = context.Event()
    collector = context.Process(
        target=collector_main,
        args=(
            {
                "init": args.init, "out": args.out, "workers": args.workers, "seed": 1,
                "decisions": args.decisions, "concurrent": args.concurrent,
                "self_play": args.self_play, "snapshot_every": args.snapshot_every, "pool": args.pool,
                "mirror": args.mirror, "matchups": args.matchups, "uniform_floor": args.uniform_floor,
                "exclude_decks": args.exclude_decks, "id_dropout": args.id_dropout,
                "card_features": args.card_features, "privileged": args.privileged,
            },
            queue,
            ready,
            stop,
        ),
        daemon=True,
    )
    collector.start()

    eval_env = VectorEnv(args.eval_workers)
    # The starting point is the first best: a run that never beats it hands
    # on what it started from, not its last iterate.
    best_policy = Policy(Path(args.init), card_features=args.card_features, privileged=privileged)
    best_iteration = 0
    start = play_vs_rules(policy, eval_env, args.eval_games, seed="eval-0", deck_filter=deck_filter)["win_rate"]
    # The stop rule reads the rollouts: per iteration, the rules-agent games'
    # summed importance weights, their squares, and the weighted wins.
    rollouts: list[tuple[float, float, float]] = []

    def save(directory: Path) -> None:
        directory.mkdir(exist_ok=True)
        model.save_weights(str(directory / "weights.safetensors"))
        (directory / "config.json").write_text(json.dumps({**config, "init": args.init, "ppo": history}))

    save(out / "best")
    print(json.dumps({"iteration": 0, "eval_win_rate": start}), flush=True)

    try:
        for iteration in range(1, args.iterations + 1):
            t0 = time.perf_counter()
            if args.lr_final is not None:
                done = (iteration - 1) / max(args.iterations - 1, 1)
                set_learning_rate(optimizer, args.lr + (args.lr_final - args.lr) * done)
            ready.set()
            while True:
                try:
                    version, records, results, collect_s = queue.get(timeout=30)
                    break
                except Empty:
                    if not collector.is_alive():
                        raise SystemExit(f"the rollout collector died (exit code {collector.exitcode})")
            t1 = time.perf_counter()

            # Advantages use every decision's value, stale or not: the later
            # decisions of a trajectory are what carry its result back.
            adv, returns = gae(records, args.lam)
            behind = (iteration - 1) - np.array([r["version"] for r in records])
            keep = np.flatnonzero(behind <= args.max_staleness)
            trained = [records[i] for i in keep]
            adv, returns = adv[keep], returns[keep]
            norm = (adv - adv.mean()) / (adv.std() + 1e-8)
            corpus = policy.corpus(trained)
            corpus.chosen[:] = [r["chosen"] for r in trained]
            extras = {
                "advantage": norm,
                "returns": returns,
                "old_logp": np.array([r["old_logp"] for r in trained], dtype=np.float32),
            }
            if privileged:
                extras["privileged"] = np.array([r["privileged"] for r in trained], dtype=np.float32)
                assert extras["privileged"].shape[1] == privileged, "bridge/privileged.ts changed length"
            indices = np.arange(len(corpus))
            keeps = (
                {v: card_keep(v, args.id_dropout, len(policy.card_texts.numbers))
                 for v in {r["version"] for r in trained}}
                if args.id_dropout > 0 else {}
            )
            stats_sum = np.zeros(4)
            n_steps = 0
            stopped = False
            noise: list[tuple[float, float]] = []
            optimizer_steps = 0
            for _ in range(args.epochs if accumulating is None else 0):
                recent: list[float] = []
                for group, rows in token_budget_batches(corpus, indices, args.budget, rng):
                    batch = collate(corpus, group, rows, extras)
                    if args.id_dropout > 0:
                        # Each decision under the mask it was played with;
                        # padding rows take the first row's.
                        masks = [keeps[trained[i]["version"]] for i in group]
                        masks += [masks[0]] * (batch["chosen"].shape[0] - len(masks))
                        batch["card_keep"] = mx.array(np.stack(masks))
                    loss, stats = step(batch, policy.card_text)
                    mx.eval(loss, stats, model.parameters(), optimizer.state)
                    values = np.array([s.item() for s in stats])
                    stats_sum += values
                    n_steps += 1
                    # The KL against the rollout policy is measured on
                    # minibatches the step has not yet trained on, so it runs
                    # ahead of the true drift; a short running mean keeps one
                    # noisy batch from ending the update.
                    recent = (recent + [values[3]])[-8:]
                    if len(recent) >= 4 and np.mean(recent) > args.target_kl:
                        stopped = True
                        break
                if stopped:
                    break
            if accumulating is not None:
                gradient, apply = accumulating
                for epoch in range(args.epochs):
                    # One step per `--accumulate` decisions: minibatch
                    # gradients are summed, each weighted by its decisions,
                    # and the mean is stepped. The KL guard reads each step's
                    # minibatches, measured before the step moves the policy.
                    pending, weight, sq_sum, count, kl = None, 0.0, 0.0, 0, []
                    batches = list(token_budget_batches(corpus, indices, args.budget, rng))
                    for position, (group, rows) in enumerate(batches):
                        batch = collate(corpus, group, rows, extras)
                        if args.id_dropout > 0:
                            masks = [keeps[trained[i]["version"]] for i in group]
                            masks += [masks[0]] * (batch["chosen"].shape[0] - len(masks))
                            batch["card_keep"] = mx.array(np.stack(masks))
                        loss, stats, grads = gradient(batch, policy.card_text)
                        b = float(len(group))
                        scaled = tree_map(lambda g: g.astype(mx.float32) * b, grads)
                        pending = scaled if pending is None else tree_map(mx.add, pending, scaled)
                        sq = policy_sq_norm(grads)
                        mx.eval(pending, sq, stats)
                        values = np.array([s.item() for s in stats])
                        stats_sum += values
                        n_steps += 1
                        kl.append(values[3])
                        sq_sum += b * sq.item()
                        weight += b
                        count += 1
                        last = position == len(batches) - 1
                        if weight < args.accumulate and not last:
                            continue
                        if last and weight < args.accumulate / 2 and optimizer_steps > 0:
                            # A short remainder would be a noisy step; it waits
                            # for the next epoch's shuffle instead.
                            break
                        mean = tree_map(lambda g: g / weight, pending)
                        mean_sq = policy_sq_norm(mean).item()
                        estimate = noise_stats(sq_sum, weight, count, mean_sq)
                        if estimate and epoch == 0:
                            # Later epochs revisit decisions the policy has
                            # already stepped on, so only the first is read.
                            noise.append(estimate)
                        if np.mean(kl) > args.target_kl:
                            stopped = True
                            break
                        apply(mean)
                        mx.eval(model.parameters(), optimizer.state)
                        optimizer_steps += 1
                        pending, weight, sq_sum, count, kl = None, 0.0, 0.0, 0, []
                    if stopped:
                        break
            feedback_stats = None
            if feedback:
                # Every flag, every update: a few hundred of them against
                # ~25,000 rollout decisions, so each is revisited rather than
                # sampled. The agreement is read before each step, so it is
                # the policy's standing on the flags as the update found it.
                sums, count = np.zeros(2), 0
                for group, rows in token_budget_batches(
                    feedback["corpus"], feedback["indices"], args.budget, rng
                ):
                    loss, stats = feedback_step(
                        collate(feedback["corpus"], group, rows, feedback["extras"]), policy.card_text
                    )
                    mx.eval(loss, stats, model.parameters(), optimizer.state)
                    sums += np.array([s.item() for s in stats])
                    count += 1
                feedback_stats = sums / max(count, 1)
            policy.refresh()
            publish(iteration)
            t2 = time.perf_counter()
            n_steps = max(n_steps, 1)

            played = results["won"] + results["lost"]
            self_played = results["self_won"] + results["self_lost"]
            entry = {
                "iteration": iteration,
                "rollout_version": version,
                "versions_behind": np.bincount(behind).tolist(),
                "stale_dropped": len(records) - len(trained),
                "games": played,
                "win_rate": results["won"] / max(1, played),
                "self_games": self_played,
                "self_win_rate": results["self_won"] / max(1, self_played),
                "truncated": results["truncated"],
                "failed": results["failed"],
                "decisions": len(records),
                "decisions_per_s": round(len(records) / max(collect_s, 1e-9)),
                "games_started": results["started"],
                "games_recorded": results["recorded"],
                "games_in_flight": results["in_flight"],
                "policy_loss": stats_sum[0] / n_steps,
                "value_loss": stats_sum[1] / n_steps,
                "entropy": stats_sum[2] / n_steps,
                "approx_kl": stats_sum[3] / n_steps,
                "steps": n_steps,
                **(
                    {
                        "optimizer_steps": optimizer_steps,
                        "lr": float(args.lr if args.lr_final is None else
                                    args.lr + (args.lr_final - args.lr) * (iteration - 1) / max(args.iterations - 1, 1)),
                    }
                    if accumulating is not None else {}
                ),
                **(
                    {
                        # Ratio of means: each step's estimate alone is noisy.
                        "noise_trace": float(np.mean([n[0] for n in noise])),
                        "noise_g2": float(np.mean([n[1] for n in noise])),
                        "noise_scale": float(np.mean([n[0] for n in noise]) / np.mean([n[1] for n in noise]))
                        if np.mean([n[1] for n in noise]) > 0 else None,
                    }
                    if noise else {}
                ),
                "stopped_early": stopped,
                "collect_s": collect_s,
                "wait_s": round(t1 - t0, 1),
                "train_s": round(t2 - t1, 1),
            }
            if feedback_stats is not None:
                entry["feedback_loss"], entry["feedback_agree"] = map(float, feedback_stats)
            rollouts.append((results["uniform_w"], results["uniform_ww"], results["uniform_won"]))
            entry["uniform_win_rate"] = results["uniform_won"] / max(results["uniform_w"], 1e-9)
            plateau = False
            if iteration % args.eval_every == 0:
                trend = rollout_gain(rollouts, args.plateau_window)
                if trend:
                    entry["rollout_gain"], entry["rollout_gain_se"] = trend
                    # One-sided 95%: stop only once even the optimistic end of
                    # the gain is below `min_gain`.
                    plateau = trend[0] + 1.645 * trend[1] < args.min_gain
                # The candidate and the best play the same fresh games: seeds
                # no earlier evaluation used, so no checkpoint is promoted on
                # the luck of a draw it has already been measured on, and a
                # game the decks decide cancels between the two.
                seed = f"eval-{iteration}"
                evaluation = play_vs_rules(policy, eval_env, args.eval_games, seed=seed, deck_filter=deck_filter)
                reference = play_vs_rules(best_policy, eval_env, args.eval_games, seed=seed, deck_filter=deck_filter)
                gain, gain_se, _ = paired_difference(evaluation["outcomes"], reference["outcomes"])
                entry["eval_win_rate"] = evaluation["win_rate"]
                entry["eval_ci95"] = evaluation["ci95"]
                entry["best_eval_win_rate"] = reference["win_rate"]
                entry["paired_gain"], entry["paired_gain_se"] = gain, gain_se
                # The rollouts sample and the evaluation plays greedily; the
                # gap is logged so a drift between them is visible.
                recent = rollout_rate(rollouts[-args.eval_every :])
                entry["sample_gap"] = evaluation["win_rate"] - recent[0]
                # A checkpoint that beats the best on the same games replaces
                # it, unless it clearly loses to it head to head: that is a
                # policy gaining on the rules agents by exploiting them. Head
                # to head is a veto, not a bar to clear, because 25 iterations
                # of real progress win only a few points more than half their
                # games against the checkpoint before.
                entry["promoted"] = False
                if gain > 0:
                    duel = head_to_head(
                        policy, best_policy, eval_env, args.eval_games, seed=f"h2h-{iteration}",
                        gate=args.veto, decks=args.veto_decks, deck_filter=deck_filter,
                    )
                    entry["h2h_win_rate"] = duel["win_rate"]
                    entry["h2h_games"] = duel["games"]
                    entry["promoted"] = duel["passed"]
                    entry["vetoed"] = not duel["passed"]
            history.append(entry)
            print(json.dumps(entry), flush=True)
            (out / "config.json").write_text(json.dumps({**config, "init": args.init, "ppo": history}))
            if "eval_win_rate" in entry:
                # Every evaluated checkpoint is kept, promoted or not: for
                # `sys1.ladder`, and so two runs can be compared at the same
                # iteration whatever either did.
                save(out / f"iter-{iteration:04d}")
                if entry["promoted"]:
                    best_iteration = iteration
                    save(out / "best")
                    best_policy.model.load_weights(list(tree_flatten(model.parameters())))
                    best_policy.refresh()
                if plateau:
                    print(
                        json.dumps({"stopped": "plateau", "best": best_iteration, "gain": entry["rollout_gain"]}),
                        flush=True,
                    )
                    break
    finally:
        stop.set()
        # Unblock a collector waiting to put its last batch.
        while collector.is_alive():
            try:
                queue.get(timeout=1)
            except Exception:
                pass
            collector.join(timeout=1)
        eval_env.close()
        for stale in out.glob("weights-*.safetensors"):
            stale.unlink()


def rollout_rate(chunk: list[tuple[float, float, float]]) -> tuple[float, float]:
    """The importance-weighted win rate over some iterations' rollouts, and
    its variance: the binomial variance scaled by the weights' spread."""
    w = sum(c[0] for c in chunk)
    if w <= 0:
        return 0.0, float("inf")
    ww = sum(c[1] for c in chunk)
    p = sum(c[2] for c in chunk) / w
    return p, p * (1 - p) * ww / (w * w)


def rollout_gain(rollouts: list[tuple[float, float, float]], window: int) -> tuple[float, float] | None:
    """The rollout win rate against the rules agents over the last `window`
    iterations minus the `window` before, and its standard error; None until
    there are two windows.

    Each game is weighted towards uniform distinct pairings (mirrors, which
    lie outside it, count zero), so the rate measures what the evaluations
    measure however the rollouts were drawn. It is what the stop rule reads
    rather than the evaluations: a window is about 18,000 games to an
    evaluation's 1,240. The rollouts sample where the evaluation plays
    greedily; `sample_gap` in each evaluation's entry shows whether the two
    still move together.
    """
    if len(rollouts) < 2 * window:
        return None
    recent, recent_var = rollout_rate(rollouts[-window:])
    before, before_var = rollout_rate(rollouts[-2 * window : -window])
    return recent - before, (recent_var + before_var) ** 0.5


def gae(records: list[dict], lam: float) -> tuple[np.ndarray, np.ndarray]:
    """GAE with no discount over each game's scorer decisions, in play order."""
    games: dict[int, list[int]] = {}
    for index, record in enumerate(records):
        games.setdefault(record["traj"], []).append(index)
    adv = np.zeros(len(records), dtype=np.float32)
    for members in games.values():
        running, next_value = 0.0, 0.0
        for i in reversed(members):
            delta = records[i]["reward"] + next_value - records[i]["value"]
            running = delta + lam * running
            adv[i] = running
            next_value = records[i]["value"]
    values = np.array([r["value"] for r in records], dtype=np.float32)
    return adv, adv + values


if __name__ == "__main__":
    main()
