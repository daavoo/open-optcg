"""Games the scorer played, written as traces the browser app replays.

    .venv/bin/python -m sys1.evaluate checkpoints/play --traces data/traces/play

A trace is the app's JSONL export (`packages/web/src/diagnostics.ts`): a
header naming the decks, seed and rules, then one line per action. The app
rebuilds the game from those alone, so a trace from the bridge loads through
the same "load a trace" dialog as one downloaded from a match. Each decision
the scorer made also carries `scorer`: the probability it gave every action
it was offered and its value estimate, which the replay shows beside the move
and which the ranking here reads.

The value head estimates the seat to move's result in [-1, 1]; as a win
probability that is (v + 1) / 2. A decision after which the next estimate of
the same seat falls sharply is where the scorer's own judgement says the game
turned, so `rank` lists those first: they are the decisions most worth a
person's review. The last decision is read against the result itself.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path


def annotated(game: dict) -> list[dict]:
    """The trace's actions, each scorer decision joined with its note.

    The bridge marks the decisions Python made with `offered`; `notes` holds
    one entry per such decision in the same order.
    """
    learner = game["spec"]["learner"]
    won = game["winner"] == learner
    # Both seats' decisions are noted when Python plays both (one model
    # against another); only the learner's join its lines.
    notes = iter([n for n in game["notes"] if n.get("seat", learner) == learner])
    lines: list[dict] = []
    for action in game["trace"]["actions"]:
        line = {
            "kind": "decision",
            "revision": action["revision"],
            "actionId": action["actionId"],
            "turn": action["turn"],
            "player": action["player"],
            "events": [],
        }
        if "offered" in action and action["player"] == learner:
            note = next(notes)
            line["scorer"] = {
                "options": [
                    {"actionId": offered, "p": round(p, 4)}
                    for offered, p in zip(action["offered"], note["probs"])
                ],
                "winProbability": round((note["value"] + 1) / 2, 4),
            }
        lines.append(line)
    # Each decision's drop: its win probability less the next one's, or less
    # the result after the last.
    mine = [line for line in lines if "scorer" in line]
    for here, after in zip(mine, mine[1:] + [None]):
        later = after["scorer"]["winProbability"] if after else (1.0 if won else 0.0)
        here["scorer"]["drop"] = round(here["scorer"]["winProbability"] - later, 4)
    return lines


def write_trace(game: dict, path: Path, checkpoint: str | None) -> list[dict]:
    """Writes one game as a trace; returns its scorer decisions."""
    spec = game["spec"]
    learner = spec["learner"]
    rules = "p2" if learner == "p1" else "p1"
    header = {
        "kind": "header",
        "version": 2,
        "exportedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "config": {
            "p1Deck": spec["p1"],
            "p2Deck": spec["p2"],
            f"{learner}Controller": "scorer",
            f"{rules}Controller": "rules",
            "seed": spec["seed"],
            "startingPlayer": "random",
        },
        "rules": game["trace"]["rules"],
        "events": [],
        "scorer": {"checkpoint": checkpoint, "seat": learner, "won": game["winner"] == learner},
    }
    lines = annotated(game)
    path.write_text("\n".join(json.dumps(line) for line in [header, *lines]) + "\n")
    return [line for line in lines if "scorer" in line]


def rank(entries: list[dict], per_game: int = 3) -> list[dict]:
    """Each game's `per_game` largest drops, largest first across games."""
    picked: list[dict] = []
    for entry in entries:
        steepest = sorted(entry["decisions"], key=lambda d: -d["scorer"]["drop"])[:per_game]
        for decision in steepest:
            options = sorted(decision["scorer"]["options"], key=lambda o: -o["p"])
            picked.append({
                "trace": entry["file"],
                "deck": entry["deck"],
                "opponent": entry["opponent"],
                "turn": decision["turn"],
                "revision": decision["revision"],
                "drop": decision["scorer"]["drop"],
                "chosen": decision["actionId"],
                "top": options[:3],
            })
    return sorted(picked, key=lambda d: -d["drop"])
