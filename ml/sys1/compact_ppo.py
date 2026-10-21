"""Self-play PPO for the small scorer (`compact.py`).

    .venv/bin/python -m sys1.compact_ppo --init checkpoints/compact-bc --out checkpoints/compact-ppo

The text scorer trains on a few hundred decisions a second against a policy
gradient whose noise scale is tens of thousands of decisions; this trainer
exists to spend samples instead. The small model plays both seats of most
games (`--rules` is the share against a rules agent, kept so the evaluations'
opponent stays in the mix), and both seats' decisions are trained on, so a
self-play game gives twice the data of a game against a frozen opponent.

Games are split into two groups that alternate: the GPU scores one group's
decisions while the bridge workers play the other's forward. Each decision
keeps the probability and value of the weights that chose it, so a game can
span an update; decisions more than `--max-staleness` versions old are not
trained on. Rewards are the result alone, +1 or -1: see `ppo.outcome`.

Three game kinds share the slots: self-play, `--rules` against a rules agent,
and `--league` against a frozen checkpoint (`League`), the learner's seat
only. `--pilot-decks` narrows the decks the learner is trained piloting while
its opponents keep drawing from the whole pool: see `Rollouts.next_spec`.

A run can be stopped and continued: it writes `<out>/resume` after every
`--resume-every` iterations, and after the iteration in progress when it is
sent SIGTERM or SIGINT, and the same command run again continues from there
(`resume_identity`, `save_resume`).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import signal
import time
from functools import partial
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np
from mlx.utils import tree_flatten, tree_map, tree_unflatten

from .compact import (AUX_DIM, CARD_NUMBERS, COMPACT_VERSION, DATA, GLOBAL_NUMBERS, HIDDEN_INDICES, OPTION_NUMBERS, V2_ZONES, ZONES,
                      CompactCorpus, CompactPolicy, CompactScorer, add_lora, cards_of, collate, globals_of, load_widened, options_of,
                      size_order, zones_of)
from .evaluate import catalog, deck_variants, head_to_head, paired_difference, play_vs_rules, read_deck_list
from .ppo import gae, outcome
from . import timers
from .timers import timed


def learning_rate(schedule: str, iteration: int, iterations: int, peak: float, final: float, start: float, warmup: float) -> float:
    """The rate for `iteration` (from 1) of `iterations`.

    "onecycle" is Smith's one-cycle as PyTorch's `OneCycleLR` draws it: a
    cosine rise from `start` to `peak` over the first `warmup` share of the
    run, then a cosine fall to `final`. The rise is what lets a warm restart
    reach a peak it could not start at: a trained student's first updates at
    full rate overshoot the KL guard and spend the run's entropy.
    """
    t = (iteration - 1) / max(iterations - 1, 1)
    if schedule == "constant":
        return peak
    if schedule == "linear":
        return peak + (final - peak) * t
    if t < warmup:
        return start + (peak - start) * (1 - math.cos(math.pi * t / warmup)) / 2
    return final + (peak - final) * (1 + math.cos(math.pi * (t - warmup) / max(1 - warmup, 1e-9))) / 2


class League:
    """Frozen opponents for the learner, picked by prioritised fictitious
    self-play (AlphaStar's PFSP): member `m` is drawn with weight
    `(1 - P[learner beats m]) ** power`, so the games go to the opponents the
    learner has not yet beaten, and one it beats every time is left alone
    without being forgotten.

    P is read off the training games themselves, sampled play on both sides,
    as a decayed count with a uniform prior: the learner moves, so an old
    result should fade. Members are kept as policies, and one evicted while a
    game against it is in flight still finishes that game.
    """

    def __init__(self, rng, power: float = 2.0, decay: float = 0.995, size: int = 16):
        self.rng, self.power, self.decay, self.size = rng, power, decay, size
        self.members: dict[str, dict] = {}

    def add(self, name: str, policy, path: Path | None = None) -> None:
        # `path`, the member's checkpoint, is what a resumed run reloads it from.
        self.members[name] = {"policy": policy, "path": str(path.resolve()) if path else None, "wins": 0.0, "games": 0.0}
        if len(self.members) > self.size:
            # The one the learner beats most teaches least. The newcomer has
            # only its prior, so it is not the one judged.
            del self.members[max((n for n in self.members if n != name), key=self.win_rate)]

    def win_rate(self, name: str) -> float:
        m = self.members[name]
        return (m["wins"] + 1) / (m["games"] + 2)

    def pick(self) -> tuple[str, object]:
        names = list(self.members)
        weights = np.array([(1 - self.win_rate(n)) ** self.power for n in names])
        name = names[int(self.rng.choice(len(names), p=weights / weights.sum()))]
        return name, self.members[name]["policy"]

    def record(self, name: str, won: bool) -> None:
        if name in self.members:
            m = self.members[name]
            m["wins"] = m["wins"] * self.decay + won
            m["games"] = m["games"] * self.decay + 1

    def table(self) -> dict[str, list[float]]:
        return {n: [round(self.win_rate(n), 3), round(m["games"], 1)] for n, m in self.members.items()}

    def state(self) -> dict:
        # In order: `pick` draws an index into the members as they were added.
        return {"rng": self.rng.bit_generator.state,
                "members": [[n, m["path"], m["wins"], m["games"]] for n, m in self.members.items()]}

    def restore(self, state: dict, load) -> None:
        """The members, their results and the generator `state` recorded;
        `load` reads a member's policy back from its checkpoint."""
        self.rng.bit_generator.state = state["rng"]
        self.members = {name: {"policy": load(Path(path)), "path": path, "wins": wins, "games": games}
                        for name, path, wins, games in state["members"]}


class LivePolicy(CompactPolicy):
    """`CompactPolicy` over a model being trained, rather than one loaded from disk."""

    def __init__(self, model: CompactScorer):
        self.model = model
        # The run trains at the current encoding: an older start is widened
        # to it before the first step, so the model reads every zone and number.
        self.zones = ZONES
        self.globs = GLOBAL_NUMBERS
        self.opts = OPTION_NUMBERS
        self.card_nums = CARD_NUMBERS
        self.render = None
        self._forward = mx.compile(lambda b: self.model(b), inputs=[self.model.state])


def losses(model, batch, clip: float, value_coef: float, entropy_coef: float, aux_coef: float = 0.0, kick_coef: float = 0.0):
    if aux_coef:
        logits, values, aux = model(batch, with_aux=True)
        aux_loss = ((aux - batch["aux_target"]) ** 2).mean()
    else:
        logits, values = model(batch)
        aux_loss = mx.array(0.0)
    logp_all = logits - mx.logsumexp(logits, axis=-1, keepdims=True)
    logp = mx.take_along_axis(logp_all, batch["chosen"][:, None].astype(mx.int32), axis=-1).squeeze(-1)
    ratio = mx.exp(logp - batch["old_logp"])
    advantage = batch["advantage"]
    policy_loss = -mx.minimum(ratio * advantage, mx.clip(ratio, 1 - clip, 1 + clip) * advantage).mean()
    value_loss = ((values - batch["returns"]) ** 2).mean()
    probs = mx.exp(logp_all) * batch["option_mask"]
    entropy = -(probs * mx.where(batch["option_mask"], logp_all, 0.0)).sum(axis=-1).mean()
    approx_kl = (batch["old_logp"] - logp).mean()
    clipped = (mx.abs(ratio - 1) > clip).mean()
    # Kickstarting (`--teacher`): on a decision whose deck has a specialist,
    # `probs` holds the specialist's policy and the learner is pulled toward
    # it by cross-entropy; every other row's `probs` is zero and adds nothing.
    # Averaged over the whole batch, so each such row weighs what a PPO row does;
    # `kick_w` is this iteration's weight (`--kick` annealed to `--kick-final`).
    kick_rows = -(batch["probs"] * mx.where(batch["option_mask"], logp_all, 0.0)).sum(axis=-1)
    kick_loss = kick_rows.mean()
    kick_term = (batch["kick_w"] * kick_rows).mean() if kick_coef else mx.array(0.0)
    loss = policy_loss + value_coef * value_loss - entropy_coef * entropy + aux_coef * aux_loss + kick_term
    return loss, (policy_loss, value_loss, entropy, approx_kl, clipped, aux_loss, kick_loss)


class Rollouts:
    """`concurrent` games in flight in two alternating groups.

    Each move sent carries the spec of the game to start in its slot should
    the move end the one there (server.ts `step`'s `next`), so no reset is ever
    sent while the other group's step is in flight. A slot whose replacement
    fails to start is relaunched by `relaunch`, once nothing is in flight.

    `league` (with a `league_share` of games) and `pilot` are optional: with
    neither, every game is self-play or against a rules agent on decks the
    server draws. `deck_ids` is the whole pool, needed only with `pilot`.
    """

    def __init__(
        self, env, concurrent: int, workers: int, rules: float, rng, seed: str,
        league: League | None = None, league_share: float = 0.0,
        pilot: list[str] | None = None, deck_ids: list[str] | None = None,
        mirror: float = 0.0, close: float = 0.0, opponent_pilot: list[str] | None = None,
        deck_weights: dict[str, float] | None = None, matchup_power: float = 0.0, deck_power: float = 0.0,
        teachers: dict[str, object] | None = None,
        variants: dict[str, list[str]] | None = None, variant_share: float = 0.0,
    ):
        self.env, self.concurrent, self.workers, self.rules, self.rng, self.seed = env, concurrent, workers, rules, rng, seed
        self.league, self.league_share = league, league_share if league else 0.0
        self.pilot, self.deck_ids = pilot, deck_ids
        self.mirror, self.close = mirror, close
        # A league opponent pilots only these (a deck-specific exploiter's target).
        self.opponent_pilot = opponent_pilot
        # Opponent deck -> [learner wins, games] in league games, decayed:
        # with `matchup_power`, a target deck is drawn with weight
        # (1 - P[learner beats it]) ** power, PFSP over decks rather than pilots.
        self.matchup_power = matchup_power
        self.vs_deck: dict[str, list[float]] = {}
        # Deck -> the specialist whose policy the learner is pulled toward
        # whenever it pilots that deck (`--teacher`).
        self.teachers = teachers or {}
        # Python draws both decks (rather than the server) whenever the pairing
        # is chosen, so every trajectory knows the deck it piloted.
        # A drawn deck is played as one of its variants (`--variant-share`):
        # another real build of it. Everything that keys on a deck -- weights,
        # teachers, matchup rates, per-deck normalisation -- keeps the base.
        self.variants = {base: ids for base, ids in (variants or {}).items() if ids}
        self.variant_share = variant_share if self.variants else 0.0
        self.base_of = {v: base for base, ids in self.variants.items() for v in ids}
        # Slots whose game in flight plays a variant, counted when it ends.
        self.varied: set[int] = set()
        self.draws = bool(pilot or mirror or close or opponent_pilot or deck_weights or deck_power or teachers
                          or self.variant_share)
        # How often each deck is the learner's: weighted where it is piloted
        # furthest behind (`--deck-weights`), otherwise uniform.
        # With `deck_power` the weights follow training instead: each draw
        # multiplies a deck's fixed weight by (1 - its win rate in training
        # games) ** power, so the decks losing most are piloted most, and one
        # stops being favoured as soon as it starts winning.
        self.pilot_p = None
        self.deck_power = deck_power
        self.pilot_pool = pilot or deck_ids
        self.pilot_w = None
        if deck_weights or deck_power:
            self.pilot_w = np.array([(deck_weights or {}).get(d, 1.0) for d in self.pilot_pool], dtype=np.float64)
            self.pilot_p = self.pilot_w / self.pilot_w.sum()
        if self.draws and not deck_ids:
            raise ValueError("drawing decks needs the whole pool")
        # deck -> [wins, games], decayed: how the deck fares in training games,
        # whoever pilots it, for choosing close matchups (`--close`).
        self.strength: dict[str, list[float]] = {}
        self.generation = [0] * concurrent
        # slot -> seats the learner plays; trajectories per (slot, seat)
        self.learner: dict[int, set[str]] = {}
        self.steps: dict[tuple[int, str], list[dict]] = {}
        self.open: dict[int, dict] = {}
        # slot -> the game to start there next ({seats, spec, kind, opponent}), made once and kept until used
        self.upcoming: dict[int, dict] = {}
        self.dead: list[int] = []
        # slot -> the seed of the game in it, carried on its decisions
        self.game: dict[int, str] = {}
        # slot -> "self", "rules" or "league"
        self.kind: dict[int, str] = {}
        # slot -> seat -> the deck id the spec named ("random": the server draws)
        self.decks: dict[int, dict[str, str]] = {}
        # slot -> (seat, member name, policy) of a league game's frozen opponent
        self.opponent: dict[int, tuple[str, str, object]] = {}
        self.results = {"self_games": 0, "rules_games": 0, "rules_won": 0, "league_games": 0, "league_won": 0,
                        "truncated": 0, "failed": 0, "variant_games": 0}

    def group(self, slot: int) -> int:
        # Each worker holds games of both groups, so neither phase idles half of them.
        return (slot // self.workers) % 2

    def next_spec(self, slot: int) -> dict:
        """The game to start in `slot` next.

        With `pilot`, the learner's seat gets one of those decks and the other
        seat any deck of the pool: the specialist is trained piloting only the
        lists it is for, against everything it may meet. A self-play game's
        other seat is still played by the learner, but is trained on only if
        its deck is a pilot deck too.
        """
        if slot not in self.upcoming:
            draw = self.rng.random()
            if draw < self.rules + self.league_share or self.draws:
                seat = "p1" if self.rng.random() < 0.5 else "p2"
            else:
                seat = "p1"
            other = "p2" if seat == "p1" else "p1"
            opponent = None
            if draw < self.rules:
                kind, seats, rules = "rules", {seat}, other
            elif draw < self.rules + self.league_share:
                kind, seats, rules = "league", {seat}, "none"
                opponent = (other, *self.league.pick())
            else:
                kind, seats, rules = "self", {"p1", "p2"}, "none"
            decks = {"p1": "random", "p2": "random"}
            if self.draws and kind == "league" and self.opponent_pilot:
                # The frozen opponent pilots the target deck; the learner any.
                p = None
                if self.matchup_power:
                    w = np.array([(1 - self.vs_rate(d)) ** self.matchup_power for d in self.opponent_pilot])
                    p = w / w.sum()
                theirs = str(self.rng.choice(self.opponent_pilot, p=p))
                decks = {seat: str(self.rng.choice(self.pilot or self.deck_ids)), other: theirs}
            elif self.draws:
                mine = str(self.rng.choice(self.pilot_pool, p=self.pilot_probs()))
                decks = {seat: mine, other: self.opponent_deck(mine)}
                if self.pilot and kind == "self" and decks[other] not in self.pilot:
                    seats = {seat}
            if self.variant_share:
                decks = {seat: self.vary(deck) for seat, deck in decks.items()}
            spec = {"id": slot, **decks, "rules": rules, "seed": f"{self.seed}-{slot}-{self.generation[slot]}"}
            self.generation[slot] += 1
            self.upcoming[slot] = {"seats": seats, "spec": spec, "kind": kind, "opponent": opponent}
        return self.upcoming[slot]

    def pilot_probs(self) -> np.ndarray | None:
        if not self.deck_power:
            return self.pilot_p
        w = self.pilot_w * np.array([(1 - self.deck_rate(d)) ** self.deck_power for d in self.pilot_pool])
        return w / w.sum()

    def pilot_table(self) -> dict[str, list[float]]:
        """Each pilot deck's training win rate and its share of the learner's draws."""
        p = self.pilot_probs()
        return {d: [round(self.deck_rate(d), 3), round(float(p[i]), 4)] for i, d in enumerate(self.pilot_pool)}

    def vary(self, deck: str) -> str:
        ids = self.variants.get(deck)
        if ids and self.rng.random() < self.variant_share:
            return str(self.rng.choice(ids))
        return deck

    def vs_rate(self, deck: str) -> float:
        wins, games = self.vs_deck.get(deck, (0.0, 0.0))
        return (wins + 1) / (games + 2)

    def vs_table(self) -> dict[str, list[float]]:
        return {d: [round(self.vs_rate(d), 3), round(g[1], 1)] for d, g in sorted(self.vs_deck.items())}

    def deck_rate(self, deck: str) -> float:
        wins, games = self.strength.get(deck, (0.0, 0.0))
        return (wins + 1) / (games + 2)

    def opponent_deck(self, mine: str) -> str:
        """The deck across from `mine`: itself (`--mirror`), the closest of
        eight in training win rate (`--close`), or any other.

        A game whose result the value head can already call -- a weak deck
        against a strong one -- gives its decisions advantages near zero; a
        mirror or an even matchup is open by construction, so every pilot's
        decisions carry signal there."""
        draw = self.rng.random()
        if draw < self.mirror:
            return mine
        pool = [d for d in self.deck_ids if d != mine]
        if draw < self.mirror + self.close:
            candidates = [str(d) for d in self.rng.choice(pool, size=min(8, len(pool)), replace=False)]
            return min(candidates, key=lambda d: abs(self.deck_rate(d) - self.deck_rate(mine)))
        return str(self.rng.choice(pool))

    def record_decks(self, decks: dict[str, str] | None, winner: str | None, decay: float = 0.999) -> None:
        if not decks or decks["p1"] == decks["p2"] or "random" in decks.values() or winner is None:
            return
        for seat, deck in decks.items():
            entry = self.strength.setdefault(deck, [0.0, 0.0])
            entry[0] = entry[0] * decay + (winner == seat)
            entry[1] = entry[1] * decay + 1

    def begin(self, slot: int) -> None:
        """The slot's upcoming game has started: its seats and trajectories begin."""
        upcoming = self.upcoming.pop(slot)
        self.learner[slot] = upcoming["seats"]
        self.game[slot] = upcoming["spec"]["seed"]
        self.kind[slot] = upcoming["kind"]
        played = {seat: upcoming["spec"][seat] for seat in ("p1", "p2")}
        self.decks[slot] = {seat: self.base_of.get(deck, deck) for seat, deck in played.items()}
        if any(deck in self.base_of for deck in played.values()):
            self.varied.add(slot)
        if upcoming["opponent"]:
            self.opponent[slot] = upcoming["opponent"]
        for seat in upcoming["seats"]:
            self.steps[(slot, seat)] = []

    def relaunch(self) -> list[list[dict]]:
        """Start games in dead slots; call only with no step in flight."""
        slots, self.dead = self.dead, []
        if not slots:
            return []
        specs = [self.next_spec(slot)["spec"] for slot in slots]
        for slot in slots:
            self.begin(slot)
        return self.settle(self.env.reset(specs))

    def settle(self, results: list[dict]) -> list[list[dict]]:
        finished = []
        queue = list(results)
        while queue:
            r = queue.pop()
            if not r["done"]:
                self.open[r["id"]] = r
                continue
            slot = r["id"]
            seats = self.learner.pop(slot, set())
            kind = self.kind.pop(slot, None)
            decks = self.decks.pop(slot, None)
            if slot in self.varied:
                self.varied.discard(slot)
                self.results["variant_games"] += 1
            if "failed" not in r and not r["truncated"]:
                self.record_decks(decks, r["winner"])
            opponent = self.opponent.pop(slot, None)
            trajectories = [self.steps.pop((slot, seat), []) for seat in seats]
            if "failed" in r:
                self.results["failed"] += 1
            elif seats:
                truncated = r["truncated"] or r["winner"] is None
                self.results["truncated"] += int(truncated)
                if kind == "self":
                    self.results["self_games"] += 1
                else:
                    won = not truncated and r["winner"] in seats
                    self.results[f"{kind}_games"] += 1
                    self.results[f"{kind}_won"] += int(won)
                    if opponent and not truncated:
                        self.league.record(opponent[1], won)
                        if decks and opponent[0] in decks:
                            entry = self.vs_deck.setdefault(decks[opponent[0]], [0.0, 0.0])
                            entry[0] = entry[0] * 0.995 + won
                            entry[1] = entry[1] * 0.995 + 1
                for seat, steps in zip(seats, trajectories):
                    if steps:
                        steps[-1]["reward"] = outcome(r, seat)
                        finished.append(steps)
            if "next" in r:
                self.begin(slot)
                queue.append(r["next"])
            else:
                self.dead.append(slot)
        return finished

    def start(self) -> list[list[dict]]:
        self.dead = list(range(self.concurrent))
        return self.relaunch()

    def play(self, policy, version: int, group: int) -> list[int] | None:
        """Score `group`'s open decisions and send its moves; returns the workers to read."""
        mine = [r for slot, r in self.open.items() if self.group(slot) == group]
        if not mine:
            return None
        for r in mine:
            del self.open[r["id"]]
        # The learner's decisions in one batch, each frozen opponent's in its own.
        by_policy: dict[int, tuple[object, list[dict]]] = {id(policy): (policy, [])}
        for r in mine:
            opponent = self.opponent.get(r["id"])
            chooser = opponent[2] if opponent and opponent[0] == r["seat"] else policy
            by_policy.setdefault(id(chooser), (chooser, []))[1].append(r)
        actions, nexts = {}, {}
        # The specialist's view of the learner's own decisions on its deck.
        by_teacher: dict[str, list[dict]] = {}
        for r in by_policy[id(policy)][1] if self.teachers else ():
            deck = self.decks[r["id"]][r["seat"]]
            if deck in self.teachers and r["seat"] in self.learner[r["id"]]:
                by_teacher.setdefault(deck, []).append(r)
        # Every policy's forward passes queued, then one wait on the GPU: a
        # league member or a teacher scores a few dozen decisions a group,
        # and waiting on each in turn costs more than computing them.
        choosing = [(chooser, decisions, chooser.dispatch(decisions)) for chooser, decisions in by_policy.values() if decisions]
        teaching = [(self.teachers[deck], decisions, self.teachers[deck].dispatch(decisions)) for deck, decisions in by_teacher.items()]
        with timed("gpu"):
            mx.eval([scoring["arrays"] for *_, scoring in choosing + teaching])
        taught: dict[int, np.ndarray] = {}
        for teacher, decisions, scoring in teaching:
            tprobs, _ = teacher.finish(scoring)
            for r, t in zip(decisions, tprobs):
                t = t.astype(np.float64)
                taught[r["id"]] = (t / t.sum()).astype(np.float32)
        for chooser, decisions, scoring in choosing:
            probs, values = chooser.finish(scoring)
            with timed("sample"):
                # One uniform draw per decision, read against its cumulative
                # probabilities: `rng.choice` per decision costs more than the rest of this loop.
                draws = self.rng.random(len(decisions))
                for r, p, v, u in zip(decisions, probs, values, draws):
                    cumulative = np.cumsum(p, dtype=np.float64)
                    action = min(int(np.searchsorted(cumulative, u * cumulative[-1], side="right")), len(p) - 1)
                    actions[r["id"]] = action
                    nexts[r["id"]] = self.next_spec(r["id"])["spec"]
                    if chooser is policy and r["seat"] in self.learner[r["id"]]:
                        hidden = {"hidden": np.asarray(r["privileged"], dtype=np.float32)[list(HIDDEN_INDICES)]} if "privileged" in r else {}
                        self.steps[(r["id"], r["seat"])].append({**hidden,
                            "compact": r["compact"], "seat": r["seat"], "game_seed": self.game[r["id"]], "deck": self.decks[r["id"]][r["seat"]], "chosen": action, "old_logp": float(np.log(max(p[action] / cumulative[-1], 1e-12))),
                            "value": float(v), "reward": 0.0, "version": version,
                            **({"probs": taught[r["id"]]} if r["id"] in taught else {}),
                        })
        return self.env.send_step(actions, nexts)

    def collect(self, policy, version: int, decisions: int, batch: list[list[dict]]) -> list[list[dict]]:
        """Play until `batch` holds `decisions` decisions from finished games;
        returns it with nothing left in flight, so the caller may update the
        weights. Games still running carry on into the next call."""
        collected = sum(map(len, batch))
        pending: list[list[int] | None] = [None, None]
        while collected < decisions:
            # Group 0 scored while group 1's moves are played, and the other way round.
            for group in (0, 1):
                if pending[group] is not None:
                    results = self.env.receive(pending[group])
                    with timed("settle"):
                        finished = self.settle(results)
                    pending[group] = None
                    batch.extend(finished)
                    collected += sum(map(len, finished))
                pending[group] = self.play(policy, version, group)
            if pending == [None, None]:
                # Nothing open and nothing in flight: every slot is waiting on
                # a relaunch, which is safe only now.
                finished = self.relaunch()
                batch.extend(finished)
                collected += sum(map(len, finished))
                if not self.open:
                    raise RuntimeError("no game could be started")
        # Nothing may be in flight while the slots that failed to restart
        # are relaunched, or a reset would read a step's reply.
        for group in (0, 1):
            if pending[group] is not None:
                batch.extend(self.settle(self.env.receive(pending[group])))
        batch.extend(self.relaunch())
        return batch

    def take_results(self) -> dict:
        out = self.results
        self.results = {k: 0 for k in out}
        return out

    def state(self) -> dict:
        """What accumulates across collections. The games in flight are not
        part of it: a resumed run starts fresh ones, and since each slot's
        generation counter carries on, no seed is played twice. The generator
        is the trainer's own and is saved with it."""
        return {"generation": self.generation, "results": self.results, "strength": self.strength,
                "vs_deck": self.vs_deck}

    def restore(self, state: dict) -> None:
        self.generation = list(state["generation"])
        self.results = dict(state["results"])
        self.strength = {d: list(v) for d, v in state["strength"].items()}
        self.vs_deck = {d: list(v) for d, v in state["vs_deck"].items()}


def breakdown(wall: float, workers: int) -> dict:
    """Where a collection's `wall` seconds went (`timers`): this process's
    stages, `other` for the rest of its loop, and with `--profile` each
    worker's own stages as a mean over the workers, `idle` being the rest of
    `wall` (a worker's own idle count would include the update before)."""
    mine, theirs = timers.take()
    out = {stage: round(seconds, 2) for stage, seconds in sorted(mine.items())}
    out["other"] = round(wall - sum(mine.values()), 2)
    theirs.pop("idle", None)
    if theirs:
        busy = {stage: seconds / workers for stage, seconds in sorted(theirs.items())}
        out["worker"] = {**{stage: round(s, 2) for stage, s in busy.items()}, "idle": round(wall - sum(busy.values()), 2)}
    return out


def normalised(adv: np.ndarray, records: list[dict], per_deck: bool) -> np.ndarray:
    """Advantages scaled to unit variance: across the batch, or with
    `per_deck` within each pilot deck. A deck whose games the value head
    mostly calls right has small advantages, and across the batch its
    decisions barely move the update; within its own deck they count as much
    as any other deck's. A deck with too few decisions this update for a
    stable spread is scaled with the batch."""
    out = (adv - adv.mean()) / (adv.std() + 1e-8)
    if per_deck:
        decks = np.array([r.get("deck", "random") for r in records])
        for deck in np.unique(decks):
            mask = decks == deck
            if deck != "random" and mask.sum() >= 256:
                a = adv[mask]
                out[mask] = (a - a.mean()) / (a.std() + 1e-8)
    return out.astype(np.float32)


# The arguments a resumed run must share with the one it continues: the
# learning-rate and `--kick` schedules are functions of the iteration and of
# `--iterations`, the generation counters are one per `--concurrent` slot, the
# weights saved have the shape `--lora` and `--aux-hidden` give the model, and
# the league is restored rather than rebuilt from `--league-seed`.
RESUME_ARGS = ("init", "out", "iterations", "lr", "lr_final", "lr_schedule", "lr_div", "warmup", "kick", "kick_final",
               "concurrent", "lora", "lora_alpha", "aux_hidden", "league", "league_seed")


def resume_identity(args: argparse.Namespace, schedule: str, lr_final: float) -> dict:
    """`RESUME_ARGS` as this command gives them, with the schedule's defaults
    resolved and paths made absolute, so the same run named another way matches."""
    values = {k: getattr(args, k) for k in RESUME_ARGS}
    values.update(lr_schedule=schedule, lr_final=lr_final, init=str(Path(args.init).resolve()),
                  out=str(Path(args.out).resolve()), league_seed=[str(Path(p).resolve()) for p in args.league_seed])
    return values


def resume_mismatches(recorded: dict, current: dict) -> list[str]:
    """Each argument that differs, as `--flag: recorded -> current`."""
    return [f"--{k.replace('_', '-')}: {recorded.get(k)!r} -> {current[k]!r}"
            for k in current if recorded.get(k) != current[k]]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--init", required=True, help="a compact checkpoint (sys1.compact train)")
    parser.add_argument("--out", required=True)
    parser.add_argument("--iterations", type=int, default=200)
    parser.add_argument("--decisions", type=int, default=196608, help="decisions per update")
    parser.add_argument("--minibatch", type=int, default=8192, help="decisions an optimizer step averages")
    parser.add_argument("--micro", type=int, default=1024, help="decisions per forward/backward pass")
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--lr", type=float, default=3e-5)
    parser.add_argument("--lr-final", type=float, default=None)
    parser.add_argument(
        "--lr-schedule", choices=["constant", "linear", "onecycle"], default=None,
        help="default: linear to --lr-final if given, else constant. onecycle: cosine rise from --lr/--lr-div "
             "to --lr over --warmup of the run, then cosine fall to --lr-final (default --lr/10)",
    )
    parser.add_argument("--lr-div", type=float, default=10.0, help="onecycle: the starting rate is --lr over this")
    parser.add_argument("--warmup", type=float, default=0.3, help="onecycle: the share of iterations spent rising")
    parser.add_argument("--clip", type=float, default=0.2)
    parser.add_argument("--value-coef", type=float, default=0.5)
    parser.add_argument("--entropy-coef", type=float, default=0.01)
    parser.add_argument("--lam", type=float, default=0.95)
    parser.add_argument("--target-kl", type=float, default=0.02)
    parser.add_argument("--max-staleness", type=int, default=1)
    parser.add_argument("--rules", type=float, default=0.15, help="share of games against a rules agent")
    parser.add_argument("--concurrent", type=int, default=1024)
    parser.add_argument("--workers", type=int, default=14)
    parser.add_argument("--eval-every", type=int, default=10, help="0: no checks, not even the start's")
    parser.add_argument("--eval-games", type=int, default=1240)
    parser.add_argument("--eval-workers", type=int, default=6)
    parser.add_argument(
        "--h2h-back", type=int, default=20,
        help="each check also plays the checkpoint this many iterations older head to head (0: off)",
    )
    parser.add_argument("--h2h-games", type=int, default=2480)
    parser.add_argument(
        "--compute", choices=("bfloat16", "float32"), default="bfloat16",
        help="dtype of the blocks' activations in rollouts and updates; checks score the saved weights in float32",
    )
    parser.add_argument("--league", type=float, default=0.0, help="share of games against a frozen league member (0: off)")
    parser.add_argument("--league-seed", nargs="*", default=[], help="checkpoints the league starts with, beside --init")
    parser.add_argument("--league-every", type=int, default=10, help="add the learner to the league every this many iterations (0: never)")
    parser.add_argument("--league-size", type=int, default=16, help="members kept; past it the most-beaten one leaves")
    parser.add_argument("--league-power", type=float, default=2.0, help="PFSP weight (1 - win rate) ** this")
    parser.add_argument(
        "--pilot-decks",
        help="a deck list (one id a line): the learner is trained only piloting these, against the whole pool",
    )
    parser.add_argument(
        "--stop-league-win", type=float, default=None,
        help="end the run once the league win rate over the last --stop-window iterations reaches this "
             "(an exploiter's target: AlphaStar's 70%%)",
    )
    parser.add_argument("--stop-window", type=int, default=5)
    parser.add_argument("--mirror", type=float, default=0.0, help="share of games with the same deck on both seats")
    parser.add_argument(
        "--close", type=float, default=0.0,
        help="share of games against the deck, of eight drawn, closest in training win rate to the pilot's",
    )
    parser.add_argument("--deck-norm", action="store_true", help="normalise advantages within each pilot deck")
    parser.add_argument(
        "--aux-hidden", type=float, default=0.0,
        help="weight of an auxiliary loss predicting what the seat cannot see (the opponent's hand and Life, its own "
             "Life and deck top) from the global token; dense targets for every decision, unused in play",
    )
    parser.add_argument(
        "--lora", type=int, default=0,
        help="train only a rank-N low-rank update of the blocks and heads (a deck adapter over a shared base; 0: off)",
    )
    parser.add_argument("--lora-alpha", type=float, default=32.0, help="the update's scale is this over --lora")
    parser.add_argument(
        "--deck-weights",
        help="a JSON {deck: weight}: how often each deck is the learner's (default 1); the decks it pilots worst",
    )
    parser.add_argument(
        "--opponent-decks",
        help="a deck list: league opponents pilot only these (a deck-specific exploiter: the main on its weak decks)",
    )
    parser.add_argument(
        "--deck-power", type=float, default=0.0,
        help="draw the learner's deck with its --deck-weights weight times (1 - its training win rate) ** this (0: fixed weights)",
    )
    parser.add_argument(
        "--matchup-power", type=float, default=0.0,
        help="with --opponent-decks: draw a target deck with weight (1 - learner's win rate against it) ** this (0: uniform)",
    )
    parser.add_argument(
        "--teacher", nargs="*", default=[],
        help="deck=checkpoint: whenever the learner pilots that deck, pull it toward that specialist's policy (kickstarting)",
    )
    parser.add_argument(
        "--train-cards", nargs="*", default=[],
        help="with --lora: also train these cards' card-table rows (cards only the adapter's deck plays)",
    )
    parser.add_argument(
        "--variant-share", type=float, default=0.0,
        help="share of drawn decks played as one of their variants (bridge/deck-variants.ts), where a deck has any",
    )
    parser.add_argument("--kick", type=float, default=1.0, help="weight of the --teacher cross-entropy")
    parser.add_argument(
        "--kick-final", type=float, default=None,
        help="the --teacher weight at the last iteration, reached linearly from --kick (default: --kick throughout): "
             "the learner copies the specialist first, then improves on it",
    )
    parser.add_argument("--resume-every", type=int, default=1, help="iterations between resume checkpoints in <out>/resume")
    parser.add_argument(
        "--profile", action="store_true",
        help="the bridge workers time their own stages too (engine, encoding, JSON, idle), in collect_breakdown.worker",
    )
    args = parser.parse_args()
    schedule = args.lr_schedule or ("linear" if args.lr_final is not None else "constant")
    lr_final = args.lr_final if args.lr_final is not None else (args.lr / 10 if schedule == "onecycle" else args.lr)

    # A stopped run left `<out>/resume`; this command continues it, and only
    # if it is the same run. `resume.old` is the previous one, kept only
    # while a new one is moved into place (`save_resume`).
    out = Path(args.out)
    identity = resume_identity(args, schedule, lr_final)
    resume_dir, resume = out / "resume", None
    for candidate in (resume_dir, out / "resume.old"):
        if (candidate / "state.json").exists():
            resume = json.loads((candidate / "state.json").read_text())
            resume_from = candidate
            break
    if resume is not None:
        differ = resume_mismatches(resume["run"], identity)
        if differ:
            raise SystemExit(f"{resume_from} continues a run with other arguments:\n  " + "\n  ".join(differ)
                             + f"\nRun the command that started it to resume, or remove {resume_from} to start over.")
        if resume["done"]:
            print(f"{out} finished at iteration {resume['iteration']}/{args.iterations}; nothing to resume", flush=True)
            return

    # An uncapped buffer cache beside the bridge workers pushes the machine into swap.
    mx.set_cache_limit(8 << 30)
    os.environ["SYS1_RENDERS"] = "none"
    os.environ["SYS1_COMPACT"] = "1"
    if args.profile:
        os.environ["SYS1_PROFILE"] = "1"
    if args.aux_hidden:
        # The bridge sends each decision's full-state summary; only the
        # auxiliary head's targets are read from it.
        os.environ["SYS1_PRIVILEGED"] = "1"
    from .env import VectorEnv

    init = Path(args.init)
    config = json.loads((init / "config.json").read_text())
    if zones_of(config) not in (V2_ZONES, ZONES):
        raise SystemExit(f"{init} reads {zones_of(config)} zones; train from a compact version 2 or {COMPACT_VERSION} checkpoint")
    if (globals_of(config) < GLOBAL_NUMBERS or zones_of(config) < ZONES or options_of(config) < OPTION_NUMBERS
            or cards_of(config) < CARD_NUMBERS):
        # An older start, widened to read the current version (`load_widened`).
        # An adapter cannot be: it trains low-rank updates over a base that
        # stays at its own version in the app and never reads what was added.
        if config.get("lora") or args.lora:
            raise SystemExit(f"{init} reads compact version {config.get('compact_version', 1)}; "
                             f"an adapter needs a compact version {COMPACT_VERSION} base")
        config = {**config, "compact_version": COMPACT_VERSION, "globals": GLOBAL_NUMBERS, "zones": ZONES,
                  "options": OPTION_NUMBERS, "card_numbers": CARD_NUMBERS}
    if args.aux_hidden:
        config = {**config, "aux": AUX_DIM}
    model = CompactScorer(config["cards"], config["d"], config["layers"], config["heads"], compute=getattr(mx, args.compute),
                          aux=config.get("aux", 0))
    resumed = config.get("lora")
    if resumed:
        # Continuing a deck adapter: its factors load with its base's weights
        # and stay the only thing that trains. `base` names the pack it goes
        # over (export_adapter), which is no longer this run's start.
        if args.lora and args.lora != resumed["rank"]:
            raise SystemExit(f"{init} carries a rank-{resumed['rank']} adapter, not rank {args.lora}")
        add_lora(model, resumed["rank"], resumed["alpha"])
        config = {**config, "lora": {**resumed, "base": resumed.get("base", config["init"])}}
    # A start without the auxiliary head loads everything else; the head starts fresh.
    load_widened(model, init / "weights.safetensors", strict=not args.aux_hidden)
    if args.lora and not resumed:
        # A deck adapter: the start's weights frozen, only the low-rank updates train.
        config = {**config, "lora": {"rank": args.lora, "alpha": args.lora_alpha, "base": args.init}}
        adapted = add_lora(model, args.lora, args.lora_alpha)
        trainable = sum(v.size for _, v in tree_flatten(model.trainable_parameters()))
        print(f"lora rank {args.lora} on {len(adapted)} layers: {trainable / 1e3:.0f}k trainable parameters", flush=True)
    # A deck adapter may also train the card-table rows of cards only its deck
    # plays: LoRA leaves the table frozen, and the general run, where the deck is
    # a few percent of games, barely moves a card no other list carries. Every
    # other row's gradient is zeroed, so no other deck's cards change.
    card_rows = None
    if args.train_cards:
        if not config.get("lora"):
            raise SystemExit("--train-cards trains rows beside a deck adapter (--lora)")
        names = sorted(json.loads((DATA / "cards.json").read_text()))
        unknown = [c for c in args.train_cards if c not in names]
        if unknown:
            raise SystemExit(f"--train-cards: unknown cards {unknown}")
        model.card.unfreeze(keys=["weight"])
        mask = np.zeros((model.card.weight.shape[0], 1), dtype=np.float32)
        mask[[names.index(c) for c in args.train_cards]] = 1.0
        card_rows = mx.array(mask)
        config = {**config, "trained_cards": sorted(set(config.get("trained_cards", [])) | set(args.train_cards))}
    if resume is not None:
        # The model is built as the run built it (widened, adapter, aux head),
        # then takes the weights it had reached, adapter factors included.
        model.load_weights(str(resume_from / "weights.safetensors"))
    mx.eval(model.parameters())
    policy = LivePolicy(model)
    optimizer = optim.AdamW(learning_rate=args.lr, weight_decay=0.0)
    if resume is not None:
        # Before `apply` is compiled below: it captures `optimizer.state` as it
        # is defined. The moments and the step continue where they stopped.
        optimizer.state = tree_unflatten(list(mx.load(str(resume_from / "optimizer.safetensors")).items()))
        mx.eval(optimizer.state)
    grad_fn = nn.value_and_grad(model, partial(losses, clip=args.clip, value_coef=args.value_coef,
                                               entropy_coef=args.entropy_coef, aux_coef=args.aux_hidden,
                                               kick_coef=1.0 if args.teacher else 0.0))
    # One optimizer step averages `--minibatch` decisions, taken in chunks of
    # `--micro` in size order: a chunk pads only to its neighbours, where one
    # random minibatch would pad every row to its largest decision.
    @partial(mx.compile, inputs=[model.state], outputs=[model.state])
    def gradient(batch):
        (loss, stats), grads = grad_fn(model, batch)
        return loss, stats, grads

    state = [model.state, optimizer.state]

    @partial(mx.compile, inputs=state, outputs=state)
    def apply(grads):
        grads, _ = optim.clip_grad_norm(grads, 1.0)
        optimizer.update(model, grads)

    def step(indices: np.ndarray, extras: dict) -> np.ndarray:
        indices = size_order(corpus, indices)
        total, stats_sum = None, np.zeros(7)
        for c in range(0, len(indices), args.micro):
            chunk = indices[c : c + args.micro]
            share = len(chunk) / len(indices)
            _, stats, grads = gradient(collate(corpus, chunk, extras))
            scaled = tree_map(lambda g: g * share, grads)
            total = scaled if total is None else tree_map(mx.add, total, scaled)
            mx.eval(total, stats)
            stats_sum += np.array([x.item() for x in stats]) * share
        if card_rows is not None:
            total["card"]["weight"] = total["card"]["weight"] * card_rows
        apply(total)
        mx.eval(model.parameters(), optimizer.state)
        return stats_sum

    out.mkdir(parents=True, exist_ok=True)
    history: list[dict] = resume["history"] if resume is not None else []

    def save(directory: Path) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        model.save_weights(str(directory / "weights.safetensors"))
        (directory / "config.json").write_text(json.dumps({**config, "init": args.init, "compact_ppo": history}))

    rng = np.random.default_rng(1)
    env = VectorEnv(args.workers)
    eval_env = VectorEnv(args.eval_workers)
    deck_ids, _ = catalog(env)
    pilot = None
    if args.pilot_decks:
        pilot = sorted(read_deck_list(Path(args.pilot_decks)))
        unknown = set(pilot) - set(deck_ids)
        if unknown:
            raise SystemExit(f"not training decks: {sorted(unknown)}")
    league = None
    if args.league > 0:
        league = League(np.random.default_rng(2), args.league_power, size=args.league_size)
        # AlphaStar's league starts from the supervised agent; here, the run's
        # start -- or, for a deck adapter, the base it goes over: the adapter
        # is tuned to its own deck, and as an opponent it would pilot every
        # other deck worse than the generalist does.
        start = Path(config["lora"]["base"]) if config.get("lora") else init
        if resume is not None:
            league.restore(resume["league"], CompactPolicy)
        else:
            league.add("init", CompactPolicy(start), start)
            for seed_path in map(Path, args.league_seed):
                if seed_path.resolve() == start.resolve():
                    continue
                league.add(f"{seed_path.parent.name}/{seed_path.name}", CompactPolicy(seed_path), seed_path)
    teachers = {}
    for spec in args.teacher:
        deck, _, path = spec.partition("=")
        if deck not in deck_ids:
            raise SystemExit(f"--teacher {spec}: {deck} is not a training deck")
        teachers[deck] = CompactPolicy(Path(path))
    rollouts = Rollouts(env, args.concurrent, args.workers, args.rules, rng, "cppo",
                        league=league, league_share=args.league, pilot=pilot, deck_ids=deck_ids,
                        mirror=args.mirror, close=args.close,
                        opponent_pilot=sorted(read_deck_list(Path(args.opponent_decks))) if args.opponent_decks else None,
                        deck_weights=json.loads(Path(args.deck_weights).read_text()) if args.deck_weights else None,
                        matchup_power=args.matchup_power, deck_power=args.deck_power, teachers=teachers,
                        variants=deck_variants(env) if args.variant_share else None, variant_share=args.variant_share)

    # Everything that carries from one iteration to the next, so a run that
    # stops and resumes is the run that did not: the weights, the optimizer's
    # moments and step, the iteration (which places the learning-rate and
    # `--kick` schedules and names the snapshots), the log so far, the
    # generator shared by the rollouts' draws and the update's minibatch
    # order, the rollouts' counters and deck statistics, and the league's
    # members, results and generator. Teachers and frozen opponents are
    # checkpoints read from disk and change nothing as they play. Written to
    # `resume.new` and then moved into place, so a process killed while
    # writing leaves the previous one whole.
    def save_resume(iteration: int, done: bool = False) -> None:
        new, old = out / "resume.new", out / "resume.old"
        shutil.rmtree(new, ignore_errors=True)
        new.mkdir()
        model.save_weights(str(new / "weights.safetensors"))
        mx.save_safetensors(str(new / "optimizer.safetensors"), dict(tree_flatten(optimizer.state)))
        (new / "state.json").write_text(json.dumps({
            "iteration": iteration, "done": done, "run": identity, "history": history,
            "rng": rng.bit_generator.state, "rollouts": rollouts.state(),
            "league": league.state() if league else None,
        }))
        shutil.rmtree(old, ignore_errors=True)
        if resume_dir.exists():
            resume_dir.rename(old)
        new.rename(resume_dir)
        shutil.rmtree(old, ignore_errors=True)

    first = 1
    if resume is not None:
        rng.bit_generator.state = resume["rng"]
        rollouts.restore(resume["rollouts"])
        first = resume["iteration"] + 1
        print(f"resumed {out} after iteration {resume['iteration']}/{args.iterations}", flush=True)
    else:
        if args.eval_every > 0:
            start_eval = play_vs_rules(CompactPolicy(init), eval_env, args.eval_games, seed="ceval-0")
            print(json.dumps({"iteration": 0, "eval_win_rate": start_eval["win_rate"]}), flush=True)
        save(out / "iter-0000")

    # A stop asked for is taken after the iteration in progress, whose games
    # and update are half done. A second signal is not caught, for a stop
    # that cannot wait: the run then resumes from the last iteration saved.
    stop = {"asked": False}

    def ask_stop(signum, frame) -> None:
        stop["asked"] = True
        signal.signal(signal.SIGTERM, signal.SIG_DFL)
        signal.signal(signal.SIGINT, signal.default_int_handler)

    signal.signal(signal.SIGTERM, ask_stop)
    signal.signal(signal.SIGINT, ask_stop)

    batch: list[list[dict]] = rollouts.start()
    iteration = first - 1
    try:
        for iteration in range(first, args.iterations + 1):
            version = iteration - 1
            timers.take()
            t0 = time.perf_counter()
            batch = rollouts.collect(policy, version, args.decisions, batch)
            t1 = time.perf_counter()
            collect_breakdown = breakdown(t1 - t0, args.workers)

            records = []
            for traj, steps in enumerate(batch):
                for record in steps:
                    record["traj"] = traj
                    records.append(record)
            batch = []
            adv, returns = gae(records, args.lam)
            behind = version - np.array([r["version"] for r in records])
            keep = np.flatnonzero(behind <= args.max_staleness)
            records = [records[i] for i in keep]
            adv, returns = adv[keep], returns[keep]
            corpus = CompactCorpus.from_records(records)
            extras = {
                "chosen": np.array([r["chosen"] for r in records], dtype=np.int32),
                "old_logp": np.array([r["old_logp"] for r in records], dtype=np.float32),
                "advantage": normalised(adv, records, args.deck_norm),
                "returns": returns.astype(np.float32),
                **({"aux_target": np.stack([r["hidden"] for r in records])} if args.aux_hidden else {}),
            }
            kick = None
            if args.teacher:
                final_kick = args.kick if args.kick_final is None else args.kick_final
                kick = args.kick + (final_kick - args.kick) * (iteration - 1) / max(args.iterations - 1, 1)
                extras["kick_w"] = np.full(len(records), kick, dtype=np.float32)
            optimizer.learning_rate = learning_rate(
                schedule, iteration, args.iterations, args.lr, lr_final, args.lr / args.lr_div, args.warmup)
            sums, n, stopped = np.zeros(7), 0, False
            for epoch in range(args.epochs):
                order = rng.permutation(len(records))
                kls = []
                for s in range(0, len(order) - args.minibatch + 1, args.minibatch):
                    values = step(order[s : s + args.minibatch], extras)
                    sums += values
                    n += 1
                    # The KL is read on minibatches the update has not stepped on
                    # yet, so it runs ahead of the drift; a short running mean
                    # keeps one noisy minibatch from ending the update.
                    kls = (kls + [values[3]])[-4:]
                    if len(kls) >= 2 and np.mean(kls) > args.target_kl:
                        stopped = True
                        break
                if stopped:
                    break
            t2 = time.perf_counter()
            results = rollouts.take_results()
            n = max(n, 1)
            entry = {
                "iteration": iteration, "decisions": len(records), "stale_dropped": int((behind > args.max_staleness).sum()),
                **results,
                "rules_win_rate": results["rules_won"] / max(results["rules_games"], 1),
                **({"league_win_rate": results["league_won"] / max(results["league_games"], 1),
                    "league": league.table()} if league else {}),
                "policy_loss": sums[0] / n, "value_loss": sums[1] / n, "entropy": sums[2] / n,
                "approx_kl": sums[3] / n, "clipped": sums[4] / n, "aux_loss": sums[5] / n,
                **({"kick_loss": sums[6] / n, "kick": kick, "taught": sum("probs" in r for r in records)} if args.teacher else {}),
                **({"vs_deck": rollouts.vs_table()} if args.matchup_power else {}),
                **({"pilot_deck": rollouts.pilot_table()} if args.deck_power else {}),
                "steps": n, "stopped_early": stopped,
                "collect_s": round(t1 - t0, 1), "train_s": round(t2 - t1, 1),
                "decisions_per_s": round(len(records) / max(t1 - t0, 1e-9)),
                "collect_breakdown": collect_breakdown,
                "lr": float(optimizer.learning_rate.item() if hasattr(optimizer.learning_rate, "item") else optimizer.learning_rate),
            }
            if args.eval_every > 0 and iteration % args.eval_every == 0:
                # The pool keeps playing on the bridge workers; evaluations use
                # their own. They read the checkpoint back in float32, as the
                # web pack runs it, whatever `--compute` trained it in.
                seed = f"ceval-{iteration}"
                save(out / f"iter-{iteration:04d}")
                current = CompactPolicy(out / f"iter-{iteration:04d}")
                now = play_vs_rules(current, eval_env, args.eval_games, seed=seed)
                start = play_vs_rules(CompactPolicy(init), eval_env, args.eval_games, seed=seed)
                gain, se, _ = paired_difference(now["outcomes"], start["outcomes"])
                entry.update({"eval_win_rate": now["win_rate"], "start_eval_win_rate": start["win_rate"],
                              "gain_vs_start": gain, "gain_vs_start_se": se})
                if pilot:
                    # The same games, only those the learner piloted a pilot deck in:
                    # the specialist's own claim, beside the whole-pool one above.
                    keys = {k for k, deck in now["piloted"].items() if deck in pilot}
                    mine = {k: now["outcomes"][k] for k in keys}
                    gain, se, _ = paired_difference(mine, {k: start["outcomes"][k] for k in keys & start["outcomes"].keys()})
                    entry.update({"pilot_eval_win_rate": float(np.mean(list(mine.values()))) if mine else None,
                                  "pilot_gain_vs_start": gain, "pilot_gain_vs_start_se": se, "pilot_eval_games": len(mine)})
                # Against the rules agents the gain can level off while the
                # policy keeps improving at what they do not punish: the
                # checkpoint `--h2h-back` iterations older is the other measure.
                older = out / f"iter-{iteration - args.h2h_back:04d}"
                if args.h2h_back > 0 and older.exists():
                    duel = head_to_head(current, CompactPolicy(older), eval_env, args.h2h_games, seed=f"ch2h-{iteration}")
                    entry.update({"h2h_back": older.name, "h2h_back_win_rate": duel["win_rate"], "h2h_back_ci95": duel["ci95"]})
            if league and args.league_every > 0 and iteration % args.league_every == 0:
                member = out / "league" / f"iter-{iteration:04d}"
                save(member)
                league.add(member.name, CompactPolicy(member), member)
            history.append(entry)
            print(json.dumps(entry), flush=True)
            (out / "config.json").write_text(json.dumps({**config, "init": args.init, "compact_ppo": history}))
            model.save_weights(str(out / "weights.safetensors"))
            if args.stop_league_win is not None and len(history) >= args.stop_window:
                recent = history[-args.stop_window:]
                won, games = sum(e["league_won"] for e in recent), sum(e["league_games"] for e in recent)
                if games and won / games >= args.stop_league_win:
                    print(json.dumps({"stopped": iteration, "league_win_rate": won / games}), flush=True)
                    break
            if stop["asked"] or iteration % args.resume_every == 0:
                save_resume(iteration)
            if stop["asked"] and iteration < args.iterations:
                print(f"stopped after iteration {iteration}/{args.iterations}; run the same command again to resume",
                      flush=True)
                return
        # Whatever ended the run, `final` is its last weights; the resume
        # state is marked done, so the same command run again does nothing.
        save(out / "final")
        save_resume(iteration, done=True)
    finally:
        env.close()
        eval_env.close()


if __name__ == "__main__":
    main()
