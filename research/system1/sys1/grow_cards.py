"""Carry a compact checkpoint onto a larger card table.

    .venv/bin/python -m sys1.grow_cards checkpoints/compact2-ppo/iter-0100 checkpoints/<out> \\
      --old-cards <the cards.json it was trained on>

A card's row is its place in `cards.json` sorted by number, so a card added
to the registry shifts every row after it, and a checkpoint read against a
regenerated table looks up the wrong vector for those cards. This rewrites
the table in the new order: each card keeps its trained row, and a card the
checkpoint never had starts from the unknown-card row, which is the row it
was being read as. The grown checkpoint therefore plays exactly as the old
one did, and training is what gives the new cards rows of their own.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import mlx.core as mx
import numpy as np

from .compact import DATA


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint")
    parser.add_argument("out")
    parser.add_argument("--old-cards", required=True, help="the cards.json the checkpoint was trained on")
    parser.add_argument("--new-cards", default=str(DATA / "cards.json"))
    args = parser.parse_args()

    source, out = Path(args.checkpoint), Path(args.out)
    config = json.loads((source / "config.json").read_text())
    old = sorted(json.loads(Path(args.old_cards).read_text()))
    new = sorted(json.loads(Path(args.new_cards).read_text()))
    if len(old) != config["cards"]:
        raise SystemExit(f"{args.old_cards} has {len(old)} cards; the checkpoint was trained on {config['cards']}")
    missing = set(old) - set(new)
    if missing:
        raise SystemExit(f"cards the new table drops: {sorted(missing)[:10]}")

    weights = dict(mx.load(str(source / "weights.safetensors")))
    table = np.array(weights["card.weight"])
    row = {number: index for index, number in enumerate(old)}
    unknown = table[len(old)]
    grown = np.stack([table[row[n]] if n in row else unknown for n in new] + [unknown])
    weights["card.weight"] = mx.array(grown.astype(table.dtype))

    out.mkdir(parents=True, exist_ok=True)
    mx.save_safetensors(str(out / "weights.safetensors"), weights)
    added = [n for n in new if n not in row]
    (out / "config.json").write_text(json.dumps({**config, "cards": len(new), "grown_from": str(source), "cards_added": added}))
    print(f"{source} -> {out}: {len(old)} -> {len(new)} cards, {len(added)} new from the unknown row")


if __name__ == "__main__":
    main()
