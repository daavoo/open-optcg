"""How a checkpoint does across decks, not only on average, from
`sys1.evaluate --out` results.

    .venv/bin/python -m sys1.breadth control.json arm-a.json arm-b.json \\
      --group weak-decks.txt --floor 0.6

Per result: the win rate, the win rate over the `--group` decks (games pooled,
binomial standard error), and how many decks are below `--floor`. Results
against the rules agents carry every game's outcome, so each one after the
first is also compared with the first on the same games: the paired
difference overall and on the group. A head-to-head result reports its
overall rate alone: its per-deck rate is the first checkpoint's record with a
deck against the second piloting the other, which carries the deck's strength
as well as the pilot's, so a weak deck reads low even between two equal
checkpoints.

The group comes from a file rather than from the results, so no arm's own
games choose the decks it is scored on: the first result's worst decks are
partly its bad luck on those seeds, which any other arm would then gain on.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .evaluate import paired_difference, read_deck_list


def pooled(result: dict, decks: frozenset[str]) -> tuple[float, float, int]:
    wins = sum(result["per_deck"][d] * result["per_deck_n"][d] for d in decks if d in result["per_deck"])
    games = sum(result["per_deck_n"][d] for d in decks if d in result["per_deck"])
    rate = wins / max(1, games)
    return rate, (rate * (1 - rate) / max(1, games)) ** 0.5, games


def only(outcomes: dict[str, int], piloted: dict[str, str], decks: frozenset[str]) -> dict[str, int]:
    """The games in which the learner piloted one of `decks`. Both results
    played the same games, so `paired_difference` still compares each one
    with itself; a pair then contributes the one game or both."""
    return {key: won for key, won in outcomes.items() if piloted[key] in decks}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("results", nargs="+", help="`sys1.evaluate --out` files; the first is the reference")
    parser.add_argument("--group", required=True, help="a deck list file: the decks the group rate pools")
    parser.add_argument("--floor", type=float, required=True, help="count the decks below this win rate")
    args = parser.parse_args()
    group = read_deck_list(Path(args.group))
    name = Path(args.group).stem
    results = [json.loads(Path(path).read_text()) for path in args.results]
    reference = results[0]
    for path, result in zip(args.results, results):
        if "against" in result:
            print(f"{path}: {result['win_rate']:.3f} ± {result['ci95']:.3f} over {result['games']} games against {result['against']}")
            continue
        rate, se, games = pooled(result, group)
        below = sorted(d for d, r in result["per_deck"].items() if r < args.floor)
        print(
            f"{path}: {result['win_rate']:.3f} over {result['games']} games; {name} "
            f"{rate:.3f} ± {se:.3f} over {games}; {len(below)} of {len(result['per_deck'])} decks below {args.floor}"
        )
        if result is not reference and "outcomes" in result and "outcomes" in reference:
            gain, gain_se, pairs = paired_difference(result["outcomes"], reference["outcomes"])
            print(f"  paired against {args.results[0]}: {gain:+.3f} ± {gain_se:.3f} over {pairs} pairs")
            group_gain, group_se, group_pairs = paired_difference(
                only(result["outcomes"], result["piloted"], group),
                only(reference["outcomes"], reference["piloted"], group),
            )
            print(f"  on {name}: {group_gain:+.3f} ± {group_se:.3f} over {group_pairs} pairs")
        if below:
            print("  below the floor: " + ", ".join(f"{d} {result['per_deck'][d]:.2f}" for d in below))


if __name__ == "__main__":
    main()
