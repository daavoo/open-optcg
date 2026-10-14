"""Can't or won't: how often the pilot takes a play or a block with given cards
when the engine offers it, read off the decisions themselves (no traces needed).

    cd research/system1 && .venv/bin/python ../../.claude/skills/evaluate-deck-list/scripts/offered_chosen.py \
        mon OP17-062 OP08-119 --pilot checkpoints/lora-mon-cards/final --opponent-pilot checkpoints/v4-ppo/final \
        --against checkpoints/lora-eval/mon/targets2.txt --seeds 16

A card held all game may be one the engine rarely lets you play (its cost, its
condition) or one the pilot declines; per-game use rates cannot tell them apart.
"""
import argparse, json, os, sys
from collections import Counter
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("deck")
parser.add_argument("cards", nargs="+")
parser.add_argument("--pilot", required=True)
parser.add_argument("--opponent-pilot", required=True)
parser.add_argument("--against", required=True)
parser.add_argument("--seeds", type=int, default=16)
parser.add_argument("--opponent-pilot-for", action="append", default=[], metavar="DECK=CKPT",
                    help="pilot one target deck with its own checkpoint (e.g. its adapter); repeatable")
parser.add_argument("--variants")
args = parser.parse_args()
if args.variants:
    os.environ["SYS1_EXTRA_DECKS"] = str(Path(args.variants).resolve())
sys.path.insert(0, ".")
from sys1.compact import CompactPolicy, DATA  # noqa: E402
from sys1.env import VectorEnv  # noqa: E402
from sys1.evaluate import play, read_deck_list  # noqa: E402

table = sorted(json.loads((DATA / "cards.json").read_text()))
ROW = {c: table.index(c) for c in args.cards}
KINDS = {1: "play", 4: "block"}  # option types (packages/agents/src/scorer/compact.ts TYPES)
pols = {"pilot": CompactPolicy(Path(args.pilot)), "opp": CompactPolicy(Path(args.opponent_pilot))}
opp_seat = {}
for item in args.opponent_pilot_for:
    deck_id, ckpt = item.split("=", 1)
    pols[f"opp:{deck_id}"] = CompactPolicy(Path(ckpt))
    opp_seat[deck_id] = f"opp:{deck_id}"
specs = []
for opp in sorted(read_deck_list(Path(args.against))):
    for s in range(args.seeds):
        for mine, other in (("p1", "p2"), ("p2", "p1")):
            specs.append({mine: args.deck, other: opp, "seed": f"listab-{opp}-{s}", "rules": "none",
                          "seats": {mine: "pilot", other: opp_seat.get(opp, "opp")}, "mine": mine})
mine = {i: sp["mine"] for i, sp in enumerate(specs)}
tally = Counter()

def on(open_, actions):
    for r in open_:
        if r["seat"] != mine[r["id"]]:
            continue
        cards, options = r["compact"]["cards"], r["compact"]["options"]
        def card_of(o):  # ptr1 points at a card token; its first column is the card's table row
            p = int(o[2])
            return int(cards[p][0]) if 0 <= p < len(cards) else -1
        for name, row in ROW.items():
            for kind, label in KINDS.items():
                offered = [i for i, o in enumerate(options) if int(o[0]) == kind and card_of(o) == row]
                if offered:
                    tally[(name, label, "offered")] += 1
                    tally[(name, label, "chosen")] += actions[r["id"]] in offered

env = VectorEnv(12)
try:
    play(env, specs, pols, concurrent=256, on_decision=on)
finally:
    env.close()
for name in ROW:
    for label in KINDS.values():
        o, c = tally[(name, label, "offered")], tally[(name, label, "chosen")]
        if o:
            print(f"{name} {label}: chosen at {c} of {o} decisions where offered ({c / o:.0%})")
