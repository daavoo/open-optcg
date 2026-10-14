"""Every saved checkpoint of a run against the one `--back` iterations older.

    .venv/bin/python -m sys1.h2h_watch checkpoints/compact-ppo --back 20

`compact_ppo` does this at each check itself; this sidecar gives a run that
was started without it the same series, appended to `<run>/h2h.jsonl`, and
keeps watching until the run's `<run>.done` marker appears.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("run")
    parser.add_argument("--back", type=int, default=20)
    parser.add_argument("--games", type=int, default=2480)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    os.environ.setdefault("SYS1_RENDERS", "none")
    os.environ.setdefault("SYS1_COMPACT", "1")
    from .env import VectorEnv
    from .evaluate import head_to_head
    from .policy import load_policy

    run = Path(args.run)
    log = run / "h2h.jsonl"
    done = {json.loads(line)["iteration"] for line in log.read_text().splitlines()} if log.exists() else set()
    env = VectorEnv(args.workers)
    try:
        while True:
            iterations = sorted(int(m.group(1)) for p in run.glob("iter-*") if (m := re.fullmatch(r"iter-(\d+)", p.name)))
            todo = [i for i in iterations if i not in done and i - args.back in iterations and (run / f"iter-{i:04d}" / "weights.safetensors").exists()]
            for i in todo:
                newer, older = run / f"iter-{i:04d}", run / f"iter-{i - args.back:04d}"
                duel = head_to_head(load_policy(newer), load_policy(older), env, args.games, seed=f"ch2h-{i}")
                row = {"iteration": i, "against": older.name, "win_rate": duel["win_rate"], "ci95": duel["ci95"], "games": duel["games"]}
                with log.open("a") as handle:
                    handle.write(json.dumps(row) + "\n")
                print(json.dumps(row), flush=True)
                done.add(i)
            if Path(f"{run}.done").exists() and not todo:
                break
            time.sleep(60)
    finally:
        env.close()


if __name__ == "__main__":
    main()
