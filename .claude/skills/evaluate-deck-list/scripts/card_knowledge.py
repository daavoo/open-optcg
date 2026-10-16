"""How much has the model learned each card: how far its card-table row has
moved from the table the compact models started from, against every card's.

    cd ml && .venv/bin/python ../../.claude/skills/evaluate-deck-list/scripts/card_knowledge.py \
        checkpoints/v4-ppo/final OP16-069 OP09-119 ST26-005 [--adapter checkpoints/lora-mon-cards/final]

A row that has barely moved is a card the model knows only by its start (a
card no training list plays, or one added to a list recently). A deck adapter
trains rows only with `compact_ppo --train-cards`; `--adapter` reads its rows.
"""
import argparse, json
import numpy as np
import mlx.core as mx
import sys
sys.path.insert(0, ".")
from sys1.compact import DATA  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("checkpoint")
parser.add_argument("cards", nargs="+")
parser.add_argument("--adapter")
parser.add_argument("--start", default="checkpoints/league1-b/iter-0060", help="the card table compact training started from")
args = parser.parse_args()
cards = sorted(json.loads((DATA / "cards.json").read_text()))
table = lambda p: np.array(mx.load(f"{p}/weights.safetensors")["card.weight"].astype(mx.float32))
start, now = table(args.start), table(args.adapter or args.checkpoint)
moved = np.linalg.norm(now - start, axis=1)
print(f"every card: median moved {np.median(moved):.3f}, 90th percentile {np.percentile(moved, 90):.3f}")
for c in args.cards:
    i = cards.index(c)
    print(f"{c}: moved {moved[i]:.3f} (more than {100 * (moved < moved[i]).mean():.0f}% of cards)")
