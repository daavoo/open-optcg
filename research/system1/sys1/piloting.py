"""How well a checkpoint pilots each deck, against another pilot of the same deck.

    .venv/bin/python -m sys1.piloting checkpoints/<candidate> --baseline checkpoints/<baseline> \\
        --reference checkpoints/<reference> --pairs 20 --out <file.json>

Win rate against the rules agents saturates early -- at 85-90% both a good
and a bad pilot of a weak deck read the same -- and head to head between two
checkpoints mixes how each pilots both decks of a game. Here only one pilot
differs. For each deck X, `--pairs` opponents Y are drawn; every (X, Y, seed)
is played with X on either seat, once with the candidate piloting X and once
with the baseline, the other seat always played by the fixed reference. The
engine's randomness is in its seed, so the two arms see the same draws and the
difference per deck is the candidate's piloting of X minus the baseline's,
paired by game, with its standard error over the pairs.

With `--against-decks` the opponents are fixed instead: a deck-specific
exploiter (`compact_ppo --opponent-decks`) as the candidate, the main as
baseline and reference, against the deck it was trained to beat, measures
how far the main's piloting of that deck is from unexploitable.

A deck the baseline mostly loses with is where the learning signal is
thinnest (`compact_ppo --deck-norm`); the per-deck table shows whether a
change moved those decks or only the ones that already win.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from .evaluate import catalog, play, read_deck_list
from .policy import load_policy


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("candidate")
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--reference", help="the pilot of the other deck in every game (default: the baseline)")
    parser.add_argument("--decks", help="a deck list: only these are piloted (default: every training deck)")
    parser.add_argument("--against-decks", help="a deck list: opponents are drawn only from these")
    parser.add_argument("--pairs", type=int, default=20, help="opponents drawn per deck; each is played on both seats")
    parser.add_argument("--seed", default="piloting")
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--concurrent", type=int, default=240)
    parser.add_argument("--out")
    args = parser.parse_args()

    from .env import VectorEnv

    env = VectorEnv(args.workers)
    try:
        deck_ids, _ = catalog(env)
        piloted = sorted(read_deck_list(Path(args.decks))) if args.decks else deck_ids
        against = sorted(read_deck_list(Path(args.against_decks))) if args.against_decks else deck_ids
        policies = {
            "cand": load_policy(Path(args.candidate)),
            "base": load_policy(Path(args.baseline)),
            "ref": load_policy(Path(args.reference or args.baseline)),
        }
        rng = np.random.default_rng(0)
        specs = []
        for deck in piloted:
            others = [d for d in against if d != deck] or list(against)
            for k, opponent in enumerate(rng.choice(others, size=args.pairs, replace=len(others) < args.pairs)):
                seed = f"{args.seed}-{deck}-{k}"
                for seat in ("p1", "p2"):
                    other = "p2" if seat == "p1" else "p1"
                    decks = {seat: deck, other: str(opponent)}
                    for arm in ("cand", "base"):
                        specs.append({**decks, "seed": seed, "rules": "none", "seats": {seat: arm, other: "ref"},
                                      "deck": deck, "seat": seat, "arm": arm})
        games = play(env, specs, policies, concurrent=args.concurrent)
    finally:
        env.close()

    # outcome[(deck, seed, seat)][arm] = 1 if the pilot of `deck` won
    outcome: dict[tuple, dict[str, int]] = {}
    for game in games:
        spec = game["spec"]
        if game["truncated"]:
            continue
        key = (spec["deck"], spec["seed"], spec["seat"])
        outcome.setdefault(key, {})[spec["arm"]] = int(game["winner"] == spec["seat"])
    rows = []
    for deck in piloted:
        pairs = [v for (d, _, _), v in outcome.items() if d == deck and len(v) == 2]
        if not pairs:
            continue
        diff = np.array([v["cand"] - v["base"] for v in pairs], dtype=np.float64)
        rows.append({
            "deck": deck,
            "games": len(pairs),
            "candidate": float(np.mean([v["cand"] for v in pairs])),
            "baseline": float(np.mean([v["base"] for v in pairs])),
            "gain": float(diff.mean()),
            "se": float(diff.std(ddof=1) / np.sqrt(len(diff))) if len(diff) > 1 else float("nan"),
        })
    rows.sort(key=lambda r: r["baseline"])
    every = np.concatenate([[v["cand"] - v["base"]] for v in outcome.values() if len(v) == 2])
    weakest = rows[: max(1, len(rows) // 4)]
    weak = np.array([v["cand"] - v["base"] for (d, _, _), v in outcome.items()
                     if len(v) == 2 and d in {r["deck"] for r in weakest}], dtype=np.float64)
    summary = {
        "candidate": args.candidate, "baseline": args.baseline, "reference": args.reference or args.baseline,
        "gain": float(every.mean()), "se": float(every.std(ddof=1) / np.sqrt(len(every))),
        "weakest_quarter": [r["deck"] for r in weakest],
        "weakest_quarter_gain": float(weak.mean()), "weakest_quarter_se": float(weak.std(ddof=1) / np.sqrt(len(weak))),
        "decks": rows,
    }
    print(f"{args.candidate} piloting, against {args.baseline} piloting the same decks "
          f"(other seat: {summary['reference']})")
    print(f"  every deck: {summary['gain']:+.3f} ± {summary['se']:.3f} over {len(every)} paired games")
    print(f"  weakest quarter (by the baseline's rate): {summary['weakest_quarter_gain']:+.3f} ± "
          f"{summary['weakest_quarter_se']:.3f}")
    for r in rows:
        print(f"  {r['baseline']:.2f} -> {r['candidate']:.2f}  {r['gain']:+.3f} ± {r['se']:.3f}  n={r['games']:3d}  {r['deck']}")
    if args.out:
        Path(args.out).write_text(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
