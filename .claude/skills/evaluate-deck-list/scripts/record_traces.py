"""Record a list's games against every target deck as bridge traces, for card-usage.ts and trace-text.ts.

    cd ml && .venv/bin/python ../.claude/skills/evaluate-deck-list/scripts/record_traces.py \
        mon --pilot checkpoints/lora-mon-cards/final --opponent-pilot checkpoints/v4-ppo/final \
        --against checkpoints/lora-eval/mon/targets2.txt --seeds 32 --out checkpoints/mon-traces
"""
import argparse, os, sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("deck")
parser.add_argument("--pilot", required=True)
parser.add_argument("--opponent-pilot", required=True)
parser.add_argument("--against", required=True)
parser.add_argument("--seeds", type=int, default=32)
parser.add_argument("--out", required=True)
parser.add_argument("--opponent-pilot-for", action="append", default=[], metavar="DECK=CKPT",
                    help="pilot one target deck with its own checkpoint (e.g. its adapter); repeatable")
parser.add_argument("--variants", help="JSON of scratch deck manifests (SYS1_EXTRA_DECKS)")
args = parser.parse_args()
if args.variants:
    os.environ["SYS1_EXTRA_DECKS"] = str(Path(args.variants).resolve())
sys.path.insert(0, ".")
from sys1.compact import CompactPolicy  # noqa: E402
from sys1.env import VectorEnv  # noqa: E402
from sys1.evaluate import play, read_deck_list  # noqa: E402
from sys1.traces import write_trace  # noqa: E402

out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
pols = {"pilot": CompactPolicy(Path(args.pilot)), "opp": CompactPolicy(Path(args.opponent_pilot))}
opp_seat = {}
for item in args.opponent_pilot_for:
    deck_id, ckpt = item.split("=", 1)
    pols[f"opp:{deck_id}"] = CompactPolicy(Path(ckpt))
    opp_seat[deck_id] = f"opp:{deck_id}"
specs = []
for i, opp in enumerate(sorted(read_deck_list(Path(args.against)))):
    for s in range(args.seeds):
        for mine, other in (("p1", "p2"), ("p2", "p1")):
            specs.append({mine: args.deck, other: opp, "seed": f"listab-{opp}-{s}", "rules": "none",
                          "seats": {mine: "pilot", other: opp_seat.get(opp, "opp")}, "record": True, "learner": mine})
env = VectorEnv(12)
try:
    games = play(env, specs, pols, concurrent=256)
finally:
    env.close()
# A game the engine stopped (an error, a turn cap) comes back without a trace.
failed = [g for g in games if "trace" not in g]
for g in failed:
    print(f"no trace: {g['spec'][g['spec']['learner']]} vs {g['spec']}: {g.get('failed') or g.get('error') or sorted(g)}")
games = [g for g in games if "trace" in g]
for k, g in enumerate(games):
    won = g["winner"] == g["spec"]["learner"]
    write_trace(g, out / f"{args.deck}-{k}-{'won' if won else 'lost'}.jsonl", f"{args.pilot} vs {args.opponent_pilot}")
won = sum(g["winner"] == g["spec"]["learner"] for g in games)
print(f"{args.deck}: {won}/{len(games)} won; {len(games)} traces in {out}")
