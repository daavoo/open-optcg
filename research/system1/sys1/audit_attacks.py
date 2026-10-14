"""How often the scorer declares a doomed attack, and whether the cheap rule is safe.

    .venv/bin/python -m sys1.audit_attacks checkpoints/play --games 620

Plays the paired evaluation with the bridge's attack audit switched on (see
bridge/attack-audit.ts) and tallies, over the scorer's own decisions:
- how often it chose a Character attack that the engine confirms is doomed;
- how often the cheap rule would have pruned an attack that did something on
  declaration -- the rule's false positives, which must be zero to ship it.
"""

from __future__ import annotations

import argparse
import collections
import json
import os
from pathlib import Path

from .env import VectorEnv
from .evaluate import play_vs_rules
from .policy import Policy


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint")
    parser.add_argument("--games", type=int, default=620)
    parser.add_argument("--seed", default="audit")
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()

    os.environ["SYS1_AUDIT"] = "1"
    policy = Policy(Path(args.checkpoint))
    env = VectorEnv(args.workers)
    tally = collections.Counter()
    fired_events = collections.Counter()
    false_positives = collections.Counter()
    examples: list[dict] = []

    def on_decision(open_, actions):
        for result in open_:
            audit = result.get("audit") or []
            chosen = actions[result["id"]]
            tally["decisions"] += 1
            attack_offered = any(True for _ in audit)
            if attack_offered:
                tally["decisions with a failing Character attack offered"] += 1
            for entry in audit:
                key = ("rule" if entry["rule"] else "exempt") + "/" + ("fired" if entry["fired"] else "dead")
                tally[f"offered {key}"] += 1
                if entry["index"] == chosen:
                    tally[f"CHOSEN {key}"] += 1
                    if len(examples) < 8 and not entry["fired"] and "state" in result:
                        examples.append({"state": result["state"], "chosen": result["actions"][chosen]})
                if entry["fired"]:
                    fired_events[" ".join(sorted(set(entry["events"])))] += 1
                if entry["fired"] and entry["rule"]:
                    false_positives[(entry.get("attacker"), entry.get("reason"))] += 1

    result = play_vs_rules(policy, env, args.games, args.seed, on_decision=on_decision)
    env.close()
    print(f"win rate {result['win_rate']:.3f} over {result['games']} games")
    for key, value in sorted(tally.items()):
        print(f"  {key:55s} {value}")
    print("event sets when something fired:")
    for key, value in fired_events.most_common(10):
        print(f"  {value:5d}  {key}")
    print("rule false positives by attacker and reason:")
    for key, value in false_positives.most_common(20):
        print(f"  {value:5d}  {key}")
    Path("data/audit-examples.json").write_text(json.dumps(examples, indent=1))


if __name__ == "__main__":
    main()
