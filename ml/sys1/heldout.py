"""The generalisation gap on held-out decks (CARD-REPRESENTATION.md step 1).

    .venv/bin/python -m sys1.heldout checkpoints/heldout-eval

Reads the four evaluations `checkpoints/heldout-run.sh` writes -- the model
and the rules agents on both seats, on the pairings with a held-out deck
(`only`) and on the rest (`exclude`), all on the same seeds -- and prints the
model's paired edge over the rules pilot in three places: piloting a
held-out deck, piloting a trained deck against one, and on pairings with
none. The first against the last is the gap.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .evaluate import paired_difference, read_deck_list

HELD_OUT = Path(__file__).resolve().parent.parent / "heldout-decks.txt"


def edge(model: dict, rules: dict, keep) -> str:
    keys = [key for key in model["outcomes"] if key in rules["outcomes"] and keep(model["piloted"][key])]
    a = {key: model["outcomes"][key] for key in keys}
    b = {key: rules["outcomes"][key] for key in keys}
    gain, se, n = paired_difference(a, b)
    rate = sum(a.values()) / max(1, len(a))
    return f"model {rate:.3f}, edge over the rules pilot {gain:+.3f} ± {1.96 * se:.3f} ({n} pairs)"


def main(directory: str, held_out_file: str | None = None) -> None:
    root = Path(directory)
    held_out = read_deck_list(Path(held_out_file) if held_out_file else HELD_OUT)
    load = lambda name: json.loads((root / f"{name}.json").read_text())  # noqa: E731
    model_only, rules_only = load("model-only"), load("rules-only")
    model_rest, rules_rest = load("model-exclude"), load("rules-exclude")
    print("piloting a held-out deck:      ", edge(model_only, rules_only, lambda deck: deck in held_out))
    print("piloting against a held-out one:", edge(model_only, rules_only, lambda deck: deck not in held_out))
    print("pairings with no held-out deck: ", edge(model_rest, rules_rest, lambda deck: True))


if __name__ == "__main__":
    main(*sys.argv[1:])
