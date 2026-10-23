"""Which build of each training deck's Leader plays best, as a checkpoint pilots it.

    .venv/bin/python -m sys1.best_variants checkpoints/<run>/final --games 20 \\
        --out data/best-variants.json --report data/best-variants.md

A training deck's variants (`bridge/deck-variants.ts`, `bridge/deck-pool-scan.ts`)
are other builds of the same Leader. Every base deck that has any plays its
shipped list and each variant against the same opponent field, with the
checkpoint on both seats of every game, so what differs between builds is
the 50 cards and nothing else.

Each (build, opponent) pairing is `--games` games: `--games / 2` seeds, each
played with the build on p1 and then on p2. The seeds depend on the opponent
and the repetition, not the build, so every build of a Leader plays the very
same games. A variant's difference from the shipped list is then read per
seat-swapped pair of games (`evaluate.paired_difference`), where a game its
opponent's draw decided comes out the same for both builds and cancels.

The field is every selectable deck but the one under test, or `--field FILE`
(one deck id a line, e.g. the Leaders most played). `--decks FILE` limits the
run to some base decks.

The planned game count is printed first. SIGTERM or Ctrl-C stops the run at
the next step and writes what has finished, marked `partial`; the paired
estimates only use pairs both builds finished, so a cut-short run is still
read on identical games, just fewer of them.

The best build is the one with the largest paired difference, and it is a
candidate to ship when that difference is above 2 standard errors. With ten
variants, the best of ten noisy estimates is biased upwards: a margin just
past 2 SE on a Leader with many variants deserves a second run on fresh
seeds (`--seed`) before it ships.
"""

from __future__ import annotations

import argparse
import json
import signal
import time
from pathlib import Path

import numpy as np

from .env import VectorEnv
from .evaluate import catalog, deck_variants, paired_difference, play, read_deck_list
from .policy import load_policy


def plan(base_decks: list[str], variants: dict[str, list[str]], field: dict[str, list[str]], games: int,
         seed: str) -> list[dict]:
    """Every game, ordered so that a run cut short has played every build of
    every base deck about as often: repetition by repetition, and within one
    the builds of a Leader side by side on the same seed."""
    specs = []
    for rep in range(games // 2):
        for base in base_decks:
            for opponent in field[base]:
                game_seed = f"{seed}-{opponent}-{rep}"
                for build in [base, *variants[base]]:
                    for order in ("p1", "p2"):
                        p1, p2 = (build, opponent) if order == "p1" else (opponent, build)
                        specs.append({
                            "p1": p1, "p2": p2, "seed": game_seed, "rules": "none",
                            "seats": {"p1": "model", "p2": "model"},
                            "base": base, "build": build, "opponent": opponent, "order": order, "rep": rep,
                        })
    return specs


def outcomes_by_build(games: list[dict]) -> tuple[dict[str, dict[str, int]], int]:
    """Per build, per game "<opponent>|<rep>|<seat>": 1 if the build won.
    Truncated games are left out, as `play_vs_rules` does."""
    by_build: dict[str, dict[str, int]] = {}
    truncated = 0
    for game in games:
        spec = game["spec"]
        if game["truncated"]:
            truncated += 1
            continue
        key = f'{spec["opponent"]}|{spec["rep"]}|{spec["order"]}'
        by_build.setdefault(spec["build"], {})[key] = int(game["winner"] == spec["order"])
    return by_build, truncated


def win_rate(outcomes: dict[str, int]) -> dict:
    """The build's win rate, with a 95% interval whose standard error is taken
    over seat-swapped pairs, the unit that is independent."""
    pairs: dict[str, list[int]] = {}
    for key, won in outcomes.items():
        pairs.setdefault(key.rsplit("|", 1)[0], []).append(won)
    means = np.array([np.mean(p) for p in pairs.values()])
    games = len(outcomes)
    rate = sum(outcomes.values()) / games if games else 0.0
    se = float(means.std(ddof=1) / np.sqrt(len(means))) if len(means) > 1 else float("inf")
    return {"games": games, "pairs": len(means), "win_rate": rate, "ci95": 1.96 * se}


def per_opponent(outcomes: dict[str, int]) -> dict[str, float]:
    by: dict[str, list[int]] = {}
    for key, won in outcomes.items():
        by.setdefault(key.split("|", 1)[0], []).append(won)
    return {opponent: float(np.mean(r)) for opponent, r in sorted(by.items())}


def summarise(base_decks: list[str], variants: dict[str, list[str]], games: list[dict]) -> tuple[list[dict], int]:
    by_build, truncated = outcomes_by_build(games)
    decks = []
    for base in base_decks:
        shipped = by_build.get(base, {})
        builds = []
        for build in [base, *variants[base]]:
            outcomes = by_build.get(build, {})
            entry = {"build": build, "shipped": build == base, **win_rate(outcomes),
                     "per_opponent": per_opponent(outcomes)}
            if build == base:
                entry.update(diff=0.0, diff_se=0.0, diff_pairs=entry["pairs"])
            else:
                diff, se, n = paired_difference(outcomes, shipped)
                entry.update(diff=diff, diff_se=se, diff_pairs=n)
            builds.append(entry)
        best = max(builds, key=lambda b: (b["diff"], b["shipped"]))
        decks.append({
            "base": base,
            "builds": sorted(builds, key=lambda b: -b["diff"]),
            "best": best["build"],
            # A finite SE needs two pairs; with fewer, nothing is clear.
            "clear": not best["shipped"] and best["diff"] > 2 * best["diff_se"],
        })
    return decks, truncated


def markdown(result: dict) -> str:
    decks = result["decks"]
    clear = [d for d in decks if d["clear"]]
    lines = [
        "# Best list per Leader",
        "",
        f'Checkpoint `{result["checkpoint"]}`, {result["games_played"]} of {result["games_planned"]} games'
        f' ({result["games_per_pairing"]} per build and opponent), seed `{result["seed"]}`'
        + (", **partial: stopped early**" if result["partial"] else "") + ".",
        "",
        f"## Ship a variant: {len(clear)} of {len(decks)} Leaders",
        "",
    ]
    if clear:
        lines += ["| Leader (shipped list) | shipped | best variant | variant | paired diff |",
                  "| --- | ---: | --- | ---: | ---: |"]
        for d in sorted(clear, key=lambda d: -d["builds"][0]["diff"]):
            best = d["builds"][0]
            shipped = next(b for b in d["builds"] if b["shipped"])
            lines.append(
                f'| {d["base"]} | {shipped["win_rate"]:.3f} | {best["build"].split(" ~ ", 1)[-1]} '
                f'| {best["win_rate"]:.3f} | {best["diff"]:+.3f} ± {best["diff_se"]:.3f} |'
            )
    else:
        lines.append("No variant beats its shipped list by more than 2 SE.")
    lines += ["", "## Every Leader", "",
              "| Leader (shipped list) | shipped ± 95% | best build | paired diff ± SE | builds |",
              "| --- | ---: | --- | ---: | ---: |"]
    for d in decks:
        best = d["builds"][0]
        shipped = next(b for b in d["builds"] if b["shipped"])
        name = "(shipped)" if best["shipped"] else best["build"].split(" ~ ", 1)[-1]
        lines.append(
            f'| {d["base"]} | {shipped["win_rate"]:.3f} ± {shipped["ci95"]:.3f} | {name} '
            f'| {best["diff"]:+.3f} ± {best["diff_se"]:.3f}{" **clear**" if d["clear"] else ""} '
            f'| {len(d["builds"])} |'
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("checkpoint", help="the model that pilots both seats of every game")
    parser.add_argument("--games", type=int, default=20,
                        help="games per (build, opponent) pairing, half with the build on each seat")
    parser.add_argument("--field", help="a deck list file: the opponents (default: every selectable deck)")
    parser.add_argument("--decks", help="a deck list file: only these base decks")
    parser.add_argument("--seed", default="best-variants")
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--concurrent", type=int, default=320)
    parser.add_argument("--out", help="write the full result as JSON")
    parser.add_argument("--report", help="write the markdown summary here instead of stdout")
    args = parser.parse_args()
    if args.games < 2 or args.games % 2:
        raise SystemExit("--games must be even: each seed is played from both seats")

    env = VectorEnv(args.workers)
    deck_ids, _ = catalog(env)
    variants = {base: v for base, v in deck_variants(env).items() if v}
    base_decks = [d for d in deck_ids if d in variants]
    if args.decks:
        wanted = read_deck_list(Path(args.decks))
        if unknown := wanted - set(deck_ids):
            raise SystemExit(f"not selectable decks: {sorted(unknown)}")
        base_decks = [d for d in base_decks if d in wanted]
    pool = deck_ids
    if args.field:
        pool = sorted(read_deck_list(Path(args.field)))
        if unknown := set(pool) - set(deck_ids):
            raise SystemExit(f"not selectable decks: {sorted(unknown)}")
    field = {base: [d for d in pool if d != base] for base in base_decks}
    specs = plan(base_decks, variants, field, args.games, args.seed)
    builds = sum(1 + len(variants[b]) for b in base_decks)
    print(f"{len(specs)} games planned: {len(base_decks)} base decks, {builds} builds, "
          f"{len(pool)}-deck field, {args.games} per pairing", flush=True)

    policy = load_policy(Path(args.checkpoint))
    stop = {"asked": False}

    def ask_stop(signum, frame) -> None:
        stop["asked"] = True
        print("stopping: writing the games finished so far", flush=True)
        signal.signal(signal.SIGTERM, signal.SIG_DFL)
        signal.signal(signal.SIGINT, signal.default_int_handler)

    signal.signal(signal.SIGTERM, ask_stop)
    signal.signal(signal.SIGINT, ask_stop)

    started = time.perf_counter()
    games = play(env, specs, {"model": policy}, concurrent=args.concurrent, stop=lambda: stop["asked"])
    seconds = time.perf_counter() - started
    env.close()

    decks, truncated = summarise(base_decks, variants, games)
    result = {
        "checkpoint": args.checkpoint,
        "seed": args.seed,
        "games_per_pairing": args.games,
        "field": pool,
        "games_planned": len(specs),
        "games_played": len(games),
        "truncated": truncated,
        "partial": len(games) < len(specs),
        "seconds": seconds,
        "games_per_second": len(games) / seconds if seconds else 0.0,
        "decks": decks,
    }
    if args.out:
        Path(args.out).write_text(json.dumps(result, indent=1))
    print(f"{len(games)} games in {seconds:.0f}s ({result['games_per_second']:.1f}/s), "
          f"{truncated} truncated", flush=True)
    text = markdown(result)
    if args.report:
        Path(args.report).write_text(text)
    else:
        print(text)


if __name__ == "__main__":
    main()
