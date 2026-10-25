"""Win rate of a checkpoint against the rules agents across the whole catalog.

    .venv/bin/python -m sys1.evaluate checkpoints/bc-17m --games 620 --workers 12
    .venv/bin/python -m sys1.evaluate checkpoints/new --against checkpoints/old

Every game pairs two distinct selectable decks. Each pairing is played twice
on the same seed with the seats swapped -- the scorer pilots p1 in one and p2
in the other against that deck's rules agent -- so deck strength and the
first-player edge cancel and the number measures piloting. The pairings and
seeds are fixed, so two checkpoints are compared on identical games.

With `--against`, the same pairings are played between two checkpoints
instead, each piloting both sides of every pairing (`head_to_head`).

`--exclude-decks FILE` plays only pairings with neither deck in the file,
`--only-decks FILE` only those with at least one: with `heldout-decks.txt`,
the decks a model was trained without and the rest.
"""

from __future__ import annotations

import argparse
import itertools
import json
import time
from dataclasses import dataclass
from pathlib import Path

import mlx.core as mx
import numpy as np

from .env import VectorEnv
from .policy import Policy, load_policy
from .traces import rank, write_trace


def catalog(env: VectorEnv) -> tuple[list[str], dict[str, str]]:
    """The selectable decks, and each one's division ("featured" or "starter")."""
    env.workers[0].send({"cmd": "decks"})
    reply = env.workers[0].receive()
    return reply["decks"], reply["divisions"]


def selectable_decks(env: VectorEnv) -> list[str]:
    """The decks a player can pick in the app: `catalog` without the
    training-only lists and scratch variants, in the app's order."""
    env.workers[0].send({"cmd": "decks"})
    return env.workers[0].receive()["selectable"]


def deck_variants(env: VectorEnv) -> dict[str, list[str]]:
    """Variant ids by base deck (`bridge/deck-variants.ts`): other builds of a
    training deck, resolvable by id but never in the catalog on their own."""
    env.workers[0].send({"cmd": "decks"})
    return env.workers[0].receive().get("variants", {})


def kind(p1: str, p2: str, divisions: dict[str, str]) -> str:
    """A pairing's kind: featured vs featured, starter vs starter, or cross."""
    a, b = divisions[p1], divisions[p2]
    return "cross" if a != b else ("featured" if a == "featured" else "starter")


def read_deck_list(path: Path) -> frozenset[str]:
    """Deck ids, one a line; `#` starts a comment line."""
    lines = (line.strip() for line in Path(path).read_text().splitlines())
    return frozenset(line for line in lines if line and not line.startswith("#"))


@dataclass(frozen=True)
class DeckFilter:
    """Which pairings to play: `only` keeps those with at least one of its
    decks, `exclude` drops those with any of its decks."""

    only: frozenset[str] | None = None
    exclude: frozenset[str] = frozenset()

    @classmethod
    def from_files(cls, only: str | None, exclude: str | None) -> "DeckFilter":
        return cls(read_deck_list(Path(only)) if only else None, read_deck_list(Path(exclude)) if exclude else frozenset())

    def check(self, deck_ids: list[str]) -> None:
        unknown = ((self.only or frozenset()) | self.exclude) - set(deck_ids)
        if unknown:
            raise SystemExit(f"not selectable decks: {sorted(unknown)}")

    def keeps(self, p1: str, p2: str) -> bool:
        if p1 in self.exclude or p2 in self.exclude:
            return False
        return self.only is None or p1 in self.only or p2 in self.only


def pairings(
    env: VectorEnv, games: int, seed: str, decks: str = "all", deck_filter: DeckFilter = DeckFilter()
) -> list[tuple[str, str, str]]:
    """`games // 2` (p1 deck, p2 deck, seed) triples, each to be played twice.

    `decks` is "all" or one kind of pairing ("featured", "starter", "cross"),
    and `deck_filter` narrows the decks further. The pairs are shuffled once
    with a fixed seed, so every checkpoint plays the same ones.
    """
    deck_ids, divisions = catalog(env)
    deck_filter.check(deck_ids)
    pairs = [pair for pair in itertools.permutations(deck_ids, 2) if deck_filter.keeps(*pair)]
    if decks != "all":
        pairs = [pair for pair in pairs if kind(*pair, divisions) == decks]
    np.random.default_rng(0).shuffle(pairs)
    return [(*pairs[index % len(pairs)], f"{seed}-{index}") for index in range(games // 2)]


def play(
    env: VectorEnv,
    specs: list[dict],
    policies: dict[str, Policy],
    sample: bool = False,
    concurrent: int = 240,
    on_decision=None,
    enough=None,
    stop=None,
) -> list[dict]:
    """Plays every spec to the end; returns one {spec, winner, truncated} each.

    `enough`, if given, is asked after every step with the finished games in
    spec order up to the first unfinished one; when it answers true the rest
    are abandoned. Only an unbroken prefix counts, because the games that end
    first are the short ones, and a test stopped on them would be judged on a
    biased sample.

    `stop`, if given, is asked after every step; when it answers true, the
    games finished so far come back, in the order they ended, and the rest
    are abandoned. It is for cutting a long run short, not for a test.

    A spec is {p1, p2, seed, rules, seats}, where `seats` names the entry of
    `policies` that plays each seat Python plays; the other seats are played by
    their deck's rules agent on the worker. Each step scores every open
    decision with the policy of the seat to move.

    A spec with `record` comes back with `trace` (the bridge's action log) and
    `notes`: the probabilities and value the policy gave each of its own
    decisions, in play order, for `write_trace`.
    """
    rng = np.random.default_rng(0)
    queue = list(enumerate(specs))
    live: dict[int, dict] = {}
    finished: list[dict] = []
    done_by_id: dict[int, dict] = {}
    notes: dict[int, list[dict]] = {}
    prefix = 0

    def launch(count: int) -> list[dict]:
        batch = []
        while queue and count > 0:
            gid, spec = queue.pop(0)
            live[gid] = spec
            batch.append({"id": gid, **{k: spec[k] for k in ("p1", "p2", "seed", "rules", "record") if k in spec}})
            count -= 1
        return env.reset(batch) if batch else []

    pending = launch(concurrent)
    while pending:
        open_: list[dict] = []
        while pending:
            result = pending.pop()
            if not result["done"]:
                open_.append(result)
                continue
            game = {
                "spec": live.pop(result["id"]),
                "winner": result["winner"],
                "truncated": result["truncated"] or result["winner"] is None,
            }
            if "trace" in result:
                game["trace"] = result["trace"]
                game["notes"] = notes.pop(result["id"], [])
            finished.append(game)
            done_by_id[result["id"]] = game
            pending.extend(launch(1))
        if enough:
            while prefix in done_by_id:
                prefix += 1
            if enough([done_by_id[i] for i in range(prefix)]):
                return [done_by_id[i] for i in range(prefix)]
        if stop and stop():
            return finished
        if not open_:
            break
        by_policy: dict[str, list[dict]] = {}
        for r in open_:
            by_policy.setdefault(live[r["id"]]["seats"][r["seat"]], []).append(r)
        actions: dict[int, int] = {}
        for name, group in by_policy.items():
            probs, values = policies[name].score(group)
            for r, p, v in zip(group, probs, values):
                actions[r["id"]] = int(rng.choice(len(p), p=p / p.sum())) if sample else int(np.argmax(p))
                if live[r["id"]].get("record"):
                    notes.setdefault(r["id"], []).append({"seat": r["seat"], "probs": p.tolist(), "value": float(v)})
        if on_decision:
            on_decision(open_, actions)
        pending = env.step(actions)
    return finished


def play_vs_rules(
    policy: Policy | None,
    env: VectorEnv,
    games: int = 620,
    seed: str = "eval",
    sample: bool = False,
    concurrent: int = 240,
    on_decision=None,
    decks: str = "all",
    traces: Path | None = None,
    trace_games: str = "losses",
    checkpoint: str | None = None,
    deck_filter: DeckFilter = DeckFilter(),
) -> dict:
    """The paired win rate against the rules agents, overall, per deck, and
    per kind of pairing.

    With `traces`, the games the policy lost (or all, with `trace_games`) are
    written there as traces the app replays, with `index.json` listing each
    game's steepest drops in the scorer's win estimate: see `traces.py`.

    A pair of seat-swapped games that splits one each was decided by the
    decks, not the pilot: the same deck won with either seat, so it says
    nothing about how well the scorer plays. `split_rate` per kind is the share
    of pairs that did, which is how little signal that kind carries.

    With no `policy`, the rules agents play both seats of the same games: the
    baseline a per-deck rate is read against. A deck's rate mixes the pilot
    with the deck's strength against the opponents it drew, and only the
    difference from the baseline on the same games is the pilot's.
    """
    _, divisions = catalog(env)
    specs = []
    for p1, p2, game_seed in pairings(env, games, seed, decks, deck_filter):
        for learner, rules in (("p1", "p2"), ("p2", "p1")):
            specs.append(
                {"p1": p1, "p2": p2, "seed": game_seed, "rules": rules if policy else "both",
                 "learner": learner, "seats": {learner: "policy"} if policy else {},
                 **({"record": True} if traces and policy else {})}
            )
    started = time.perf_counter()
    decisions = 0

    def count(open_, actions):
        nonlocal decisions
        decisions += len(open_)
        if on_decision:
            on_decision(open_, actions)

    wins = losses = truncated = 0
    per_deck: dict[str, list[int]] = {}
    per_pair: dict[str, list[int]] = {}
    outcomes: dict[str, int] = {}
    piloted: dict[str, str] = {}
    written: list[dict] = []
    if traces:
        traces.mkdir(parents=True, exist_ok=True)
    for game in play(env, specs, {"policy": policy} if policy else {}, sample, concurrent, count):
        spec = game["spec"]
        if game["truncated"]:
            truncated += 1
            continue
        won = game["winner"] == spec["learner"]
        wins += won
        losses += not won
        per_deck.setdefault(spec[spec["learner"]], []).append(int(won))
        per_pair.setdefault(spec["seed"], []).append(int(won))
        outcomes[f'{spec["seed"]}|{spec["learner"]}'] = int(won)
        piloted[f'{spec["seed"]}|{spec["learner"]}'] = spec[spec["learner"]]
        if "trace" in game and (trace_games == "all" or not won):
            name = f'{spec["seed"]}-{spec["learner"]}.jsonl'
            written.append({
                "file": name,
                "deck": spec[spec["learner"]],
                "opponent": spec["p2" if spec["learner"] == "p1" else "p1"],
                "decisions": write_trace(game, traces / name, checkpoint),
            })

    if traces:
        (traces / "index.json").write_text(json.dumps(rank(written), indent=1))
    by_kind: dict[str, dict] = {}
    pair_kind = {spec["seed"]: kind(spec["p1"], spec["p2"], divisions) for spec in specs}
    for pair_seed, results in per_pair.items():
        entry = by_kind.setdefault(pair_kind[pair_seed], {"wins": 0, "games": 0, "pairs": 0, "splits": 0})
        entry["wins"] += sum(results)
        entry["games"] += len(results)
        if len(results) == 2:
            entry["pairs"] += 1
            entry["splits"] += sum(results) == 1
    for entry in by_kind.values():
        entry["win_rate"] = entry["wins"] / max(1, entry["games"])
        entry["split_rate"] = entry["splits"] / max(1, entry["pairs"])

    played = wins + losses
    rate = wins / max(1, played)
    return {
        "games": played,
        "wins": wins,
        "win_rate": rate,
        "ci95": 1.96 * (rate * (1 - rate) / max(1, played)) ** 0.5,
        "truncated": truncated,
        "decisions": decisions,
        "seconds": time.perf_counter() - started,
        "per_deck": {deck: float(np.mean(r)) for deck, r in per_deck.items()},
        "per_deck_n": {deck: len(r) for deck, r in per_deck.items()},
        "divisions": divisions,
        "by_kind": by_kind,
        # Per game, keyed "<pair seed>|<learner seat>", for `paired_difference`.
        "outcomes": outcomes,
        # The deck the learner piloted in each of those games.
        "piloted": piloted,
    }


def sprt(wins: int, losses: int, p0: float, p1: float, alpha: float = 0.05, beta: float = 0.05) -> str | None:
    """Wald's sequential test of win rate p0 against p1: "p0", "p1" or None (go on)."""
    llr = wins * np.log(p1 / p0) + losses * np.log((1 - p1) / (1 - p0))
    if llr >= np.log((1 - beta) / alpha):
        return "p1"
    if llr <= np.log(beta / (1 - alpha)):
        return "p0"
    return None


def paired_difference(a: dict[str, int], b: dict[str, int]) -> tuple[float, float, int]:
    """How much more often `a` won than `b` on the same games, from two
    `play_vs_rules` results' `outcomes`: the mean difference, its standard
    error, and the pairs it was read from.

    Both played the same seats of the same seeded games, so a game the decks
    decide comes out the same for both and cancels; what is left is the
    pilots. The unit is the seat-swapped pair, whose two games are not
    independent: the standard error is taken over pairs.
    """
    pairs: dict[str, list[int]] = {}
    for key in a.keys() & b.keys():
        pairs.setdefault(key.rsplit("|", 1)[0], []).append(a[key] - b[key])
    diffs = np.array([np.mean(d) for d in pairs.values()])
    if len(diffs) < 2:
        return 0.0, float("inf"), len(diffs)
    return float(diffs.mean()), float(diffs.std(ddof=1) / np.sqrt(len(diffs))), len(diffs)


def head_to_head(
    a: Policy,
    b: Policy,
    env: VectorEnv,
    games: int = 620,
    seed: str = "h2h",
    concurrent: int = 240,
    gate: float | None = None,
    margin: float = 0.05,
    decks: str = "all",
    deck_filter: DeckFilter = DeckFilter(),
) -> dict:
    """Paired games between two checkpoints: `a`'s win rate against `b`.

    Each pairing and seed is played twice, `a` on p1's deck and seat and then
    on p2's, so deck strength and the first-player edge cancel, as against
    the rules agents. Both play greedily, so a checkpoint against itself
    scores exactly 0.5.

    With `gate`, the question is only whether `a` clears it, and the games
    stop as soon as a sequential test between `gate - margin` and `gate +
    margin` decides (`passed`); a clear result takes a fraction of `games`.
    One that is still open at `games` is decided on the rate against `gate`.
    The test treats games as independent, which the seat-swapped pairs are
    not quite: it errs slightly towards stopping early.

    `decks` limits the games to one kind of pairing, as in `play_vs_rules`.
    Within a division fewer pairs split 1-1 on deck strength alone, so the
    same number of games says more about which checkpoint plays better.
    """
    specs = []
    for p1, p2, game_seed in pairings(env, games, seed, decks, deck_filter):
        for seats in ({"p1": "a", "p2": "b"}, {"p1": "b", "p2": "a"}):
            specs.append({"p1": p1, "p2": p2, "seed": game_seed, "rules": "none", "seats": seats})
    started = time.perf_counter()

    def tally(finished: list[dict]) -> tuple[int, int, int]:
        wins = losses = truncated = 0
        for game in finished:
            if game["truncated"]:
                truncated += 1
            elif game["spec"]["seats"][game["winner"]] == "a":
                wins += 1
            else:
                losses += 1
        return wins, losses, truncated

    def enough(finished: list[dict]) -> bool:
        wins, losses, _ = tally(finished)
        return sprt(wins, losses, gate - margin, gate + margin) is not None

    finished = play(
        env, specs, {"a": a, "b": b}, concurrent=concurrent, enough=enough if gate is not None else None
    )
    wins, losses, truncated = tally(finished)
    # `a`'s record by the deck it piloted: whether it holds its own on every
    # deck, not only on average.
    per_deck: dict[str, list[int]] = {}
    for game in finished:
        if not game["truncated"]:
            seats = game["spec"]["seats"]
            seat = "p1" if seats["p1"] == "a" else "p2"
            per_deck.setdefault(game["spec"][seat], []).append(int(game["winner"] == seat))
    played = wins + losses
    rate = wins / max(1, played)
    extra = {}
    if gate is not None:
        verdict = sprt(wins, losses, gate - margin, gate + margin)
        extra["passed"] = verdict == "p1" if verdict else rate >= gate
    return {
        **extra,
        "games": played,
        "wins": wins,
        "win_rate": rate,
        "ci95": 1.96 * (rate * (1 - rate) / max(1, played)) ** 0.5,
        "truncated": truncated,
        "seconds": time.perf_counter() - started,
        "per_deck": {deck: float(np.mean(r)) for deck, r in per_deck.items()},
        "per_deck_n": {deck: len(r) for deck, r in per_deck.items()},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint", nargs="?")
    parser.add_argument("--against", help="a second checkpoint: paired head-to-head instead of the rules agents")
    parser.add_argument("--games", type=int, default=620)
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--concurrent", type=int, default=240)
    parser.add_argument("--sample", action="store_true", help="sample instead of argmax")
    parser.add_argument("--seed", default="eval")
    parser.add_argument(
        "--decks", choices=["all", "featured", "starter", "cross"], default="all",
        help="play every pairing, or only one kind: featured vs featured, starter vs starter, or cross",
    )
    parser.add_argument("--only-decks", help="a deck list file: only pairings with at least one of its decks")
    parser.add_argument("--exclude-decks", help="a deck list file: only pairings with none of its decks")
    parser.add_argument(
        "--no-card-embed", action="store_true",
        help="zero every learned card embedding: the cards are read from their text alone",
    )
    parser.add_argument("--out", help="write the full result as JSON")
    parser.add_argument("--traces", help="a directory: write the games lost as traces the app replays")
    parser.add_argument("--trace-games", choices=["losses", "all"], default="losses")
    parser.add_argument(
        "--baseline", action="store_true", help="the rules agents on both seats of the same games, no checkpoint"
    )
    args = parser.parse_args()
    deck_filter = DeckFilter.from_files(args.only_decks, args.exclude_decks)

    if args.baseline:
        env = VectorEnv(args.workers)
        result = play_vs_rules(None, env, args.games, args.seed, concurrent=args.concurrent, decks=args.decks,
                                deck_filter=deck_filter)
        env.close()
        if args.out:
            Path(args.out).write_text(json.dumps({"checkpoint": "rules", **result}, indent=1))
        print(f"rules agents on both seats: {result['games']} games")
        return
    policy = load_policy(Path(args.checkpoint) if args.checkpoint else None)
    if args.no_card_embed:
        policy.model.card_embed.weight = mx.zeros_like(policy.model.card_embed.weight)
    env = VectorEnv(args.workers)
    if args.against:
        other = load_policy(Path(args.against))
        result = head_to_head(policy, other, env, args.games, args.seed, args.concurrent, decks=args.decks,
                              deck_filter=deck_filter)
        env.close()
        if args.out:
            Path(args.out).write_text(
                json.dumps({"checkpoint": args.checkpoint, "against": args.against, **result}, indent=1)
            )
        print(
            f"{result['games']} paired games: {args.checkpoint} won {result['wins']}, win rate "
            f"{result['win_rate']:.3f} ± {result['ci95']:.3f} against {args.against} "
            f"({result['truncated']} truncated, {result['seconds']:.0f}s)"
        )
        return
    result = play_vs_rules(
        policy, env, args.games, args.seed, args.sample, args.concurrent, decks=args.decks,
        traces=Path(args.traces) if args.traces else None, trace_games=args.trace_games,
        checkpoint=args.checkpoint, deck_filter=deck_filter,
    )
    env.close()
    if args.out:
        Path(args.out).write_text(json.dumps({"checkpoint": args.checkpoint, **result}, indent=1))
    print(
        f"{result['games']} games vs rules agents: {result['wins']} won, win rate "
        f"{result['win_rate']:.3f} ± {result['ci95']:.3f} ({result['truncated']} truncated, "
        f"{result['decisions']} scored decisions, {result['seconds']:.0f}s)"
    )
    print("by kind of pairing (split: the same deck won both seats, so the pilot did not decide it)")
    for name, entry in sorted(result["by_kind"].items()):
        print(
            f"  {name:9s} win rate {entry['win_rate']:.3f} over {entry['games']:4d} games, "
            f"split {entry['split_rate']:.2f} of {entry['pairs']} pairs"
        )
    for division in ("featured", "starter"):
        decks = [d for d in result["per_deck"] if result["divisions"][d] == division]
        if not decks:
            continue
        n = sum(result["per_deck_n"][d] for d in decks)
        rate = sum(result["per_deck"][d] * result["per_deck_n"][d] for d in decks) / n
        print(f"{division} decks piloted: win rate {rate:.3f} over {n} games")
        for deck in sorted(decks, key=lambda d: -result["per_deck"][d]):
            print(f"  {result['per_deck'][deck]:.2f} n={result['per_deck_n'][deck]:3d}  {deck}")


if __name__ == "__main__":
    main()
