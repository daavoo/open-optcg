"""Paired list A/B: several lists of one deck, one pilot, the same seeds against every target deck.

    cd research/system1 && .venv/bin/python ../../.claude/skills/evaluate-deck-list/scripts/list_ab.py \
        --pilot checkpoints/lora-mon-cards/final --opponent-pilot checkpoints/v4-ppo/final \
        --against checkpoints/lora-eval/mon/targets2.txt --seeds 64 --variants /tmp/variants.json \
        mon mk-a mk-b

The first list is the base; every other is compared with it game for game (same opponent, seed and seat).
Variants (a JSON {id: {id, leader, cards}}) are read by the bridge through SYS1_EXTRA_DECKS, so no tracked
file is edited. Play is greedy on both sides, so a seed replays nearly the same game for the same
lists (bfloat16 scoring can flip a near-tie: reruns agree within about half a point).
"""
import argparse, json, math, os, sys
from collections import defaultdict
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("lists", nargs="+")
parser.add_argument("--pilot", required=True, help="checkpoint piloting the lists (an adapter or a general model)")
parser.add_argument("--opponent-pilot", required=True, help="checkpoint piloting every target deck")
parser.add_argument("--against", required=True, help="a deck list file of target decks")
parser.add_argument("--seeds", type=int, default=64, help="seeds per target deck; each is played from both seats")
parser.add_argument("--opponent-pilot-for", action="append", default=[], metavar="DECK=CKPT",
                    help="pilot one target deck with its own checkpoint (e.g. its adapter); repeatable")
parser.add_argument("--variants", help="JSON of scratch deck manifests the lists may name")
parser.add_argument("--out", help="write the per-game results here (JSON)")
args = parser.parse_args()
if args.variants:
    os.environ["SYS1_EXTRA_DECKS"] = str(Path(args.variants).resolve())
sys.path.insert(0, ".")
from sys1.compact import CompactPolicy  # noqa: E402
from sys1.env import VectorEnv  # noqa: E402
from sys1.evaluate import play, read_deck_list  # noqa: E402

targets = sorted(read_deck_list(Path(args.against)))
pols = {"pilot": CompactPolicy(Path(args.pilot)), "opp": CompactPolicy(Path(args.opponent_pilot))}
opp_seat = {}
for item in args.opponent_pilot_for:
    deck_id, ckpt = item.split("=", 1)
    pols[f"opp:{deck_id}"] = CompactPolicy(Path(ckpt))
    opp_seat[deck_id] = f"opp:{deck_id}"
env = VectorEnv(12)
res: dict[str, dict] = {}
try:
    for deck in args.lists:
        specs = []
        for opp in targets:
            for s in range(args.seeds):
                for mine, other in (("p1", "p2"), ("p2", "p1")):
                    specs.append({mine: deck, other: opp, "seed": f"listab-{opp}-{s}", "rules": "none",
                                  "seats": {mine: "pilot", other: opp_seat.get(opp, "opp")}, "mine": mine, "opp": opp, "s": s})
        games = play(env, specs, pols, concurrent=256)
        # `play` returns games in the order they finish; key each by its spec.
        res[deck] = {f"{g['spec']['opp']}|{g['spec']['s']}|{g['spec']['mine']}": int(g["winner"] == g["spec"]["mine"]) for g in games}
        won = sum(res[deck].values())
        print(f"{deck}: {won}/{len(games)} ({won / len(games):.1%})", flush=True)
finally:
    env.close()
base = res[args.lists[0]]
for other in args.lists[1:]:
    b = res[other]
    keys = sorted(set(base) & set(b))
    diffs = [b[k] - base[k] for k in keys]
    m = sum(diffs) / len(diffs)
    se = math.sqrt(sum((d - m) ** 2 for d in diffs) / (len(diffs) - 1) / len(diffs))
    print(f"\n{other} - {args.lists[0]}: {100 * m:+.1f} ± {100 * se:.1f} points over {len(keys)} paired games")
    by = defaultdict(lambda: [0, 0, 0])
    for k in keys:
        opp = k.split("|")[0]
        by[opp][0] += base[k]; by[opp][1] += b[k]; by[opp][2] += 1
    for opp, (x, y, n) in sorted(by.items(), key=lambda kv: -(kv[1][1] - kv[1][0])):
        print(f"  {x / n:4.0%} -> {y / n:4.0%}  {100 * (y - x) / n:+4.0f}  {opp}")
if args.out:
    Path(args.out).write_text(json.dumps(res))
