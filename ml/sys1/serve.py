"""A checkpoint as a line-oriented scoring service, for the TypeScript seat.

    .venv/bin/python -m sys1.serve checkpoints/play

Each input line is one rendered decision, `{"state": .., "actions": [..]}`;
each output line is `{"probs": [..], "value": v}` in the same order. The
value is the scorer's estimate for the seat to move, from -1 (lost) to +1.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .policy import Policy


def main(checkpoint: str) -> None:
    policy = Policy(Path(checkpoint))
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        if not line.strip():
            continue
        decision = json.loads(line)
        probs, values = policy.score([decision])
        print(json.dumps({"probs": probs[0].tolist(), "value": float(values[0])}), flush=True)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "checkpoints/play")
