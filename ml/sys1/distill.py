"""A corpus of a trained scorer's own games, for behaviour cloning a student.

    .venv/bin/python -m sys1.distill checkpoints/web-3/best data/distill-web3 --games 30000

Cloning the rules agents starts a student at their level, and PPO then has to
climb from there; cloning a trained scorer starts it at the teacher's. This
plays the teacher -- against the rules agents, and a share of games against
itself (`--self-play`) -- through the same bridge the PPO rollouts use, and
records every decision it makes: the tokens, the teacher's probability over
every offered option, and the game's result for the deciding seat.

Moves are sampled from the teacher's probabilities, as PPO rollouts sample,
so the corpus covers the positions its policy actually reaches rather than
only its argmax line. The label is the whole distribution, not the move
played: `train_bc --soft` fits it, so the student learns how sure the teacher
was, not only what it picked.

Each shard is `shard-NN.npz`, a `Corpus` in the usual format with `chosen` set
to the teacher's top option, and `shard-NN.soft.npy`, the probabilities of
every decision's options back to back (`Corpus.options` gives the split).
"""

from __future__ import annotations

import argparse
import os
import time
import zlib
from pathlib import Path

import numpy as np

from .compact import CompactCorpus, CompactPolicy, is_compact
from .data import Corpus
from .env import VectorEnv
from .policy import Policy


def save_shard(records: list[dict], out: Path, index: int, compact: bool = False) -> None:
    if compact:
        CompactCorpus.from_records(records).save(out / f"shard-{index:02d}.npz")
        return
    corpus = Corpus.from_token_records(records)
    corpus.save(out / f"shard-{index:02d}.npz")
    np.save(out / f"shard-{index:02d}.soft.npy", np.concatenate([r["probs"] for r in records]).astype(np.float32))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("teacher", help="the checkpoint whose games are recorded")
    parser.add_argument("out")
    parser.add_argument("--games", type=int, default=30000)
    # Decisions are held as Python token lists until their shard is written,
    # so shards are kept small.
    parser.add_argument("--shards", type=int, default=60)
    parser.add_argument("--self-play", type=float, default=0.3, help="share of games the teacher plays both seats")
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--concurrent", type=int, default=384)
    parser.add_argument("--seed", default="distill")
    parser.add_argument(
        "--compact", action="store_true",
        help="record the compact encoding (bridge/compact.ts) for sys1.compact rather than the text",
    )
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if is_compact(Path(args.teacher)):
        # A small scorer teaching a small scorer: the corpus is the current
        # compact encoding, and a teacher trained on an earlier one reads it
        # with the zones it never saw dropped (`CompactPolicy`).
        if not args.compact:
            raise SystemExit("a compact teacher records only --compact corpora")
        teacher = CompactPolicy(Path(args.teacher))
        os.environ["SYS1_RENDERS"] = "none"
        os.environ["SYS1_COMPACT"] = "1"
    else:
        teacher = Policy(Path(args.teacher))
    if args.compact and not is_compact(Path(args.teacher)):
        # The teacher reads its own render; nobody reads the others.
        os.environ["SYS1_RENDERS"] = str(teacher.render)
        os.environ["SYS1_COMPACT"] = "1"
    env = VectorEnv(args.workers)
    rng = np.random.default_rng(zlib.crc32(args.seed.encode()))
    per_shard = -(-args.games // args.shards)

    started = 0
    # slot -> the seats the teacher plays, and its decisions so far
    seats: dict[int, set[str]] = {}
    steps: dict[int, list[dict]] = {}
    game_ids: dict[int, int] = {}
    finished: list[dict] = []
    shard = kept = dropped = 0
    t0 = time.perf_counter()

    def launch(slots: list[int]) -> list[dict]:
        nonlocal started
        specs = []
        for slot in slots:
            if started >= args.games:
                continue
            seed = f"{args.seed}-{started}"
            if rng.random() < args.self_play:
                seats[slot], rules = {"p1", "p2"}, "none"
            else:
                learner = "p1" if rng.random() < 0.5 else "p2"
                seats[slot], rules = {learner}, "p2" if learner == "p1" else "p1"
            steps[slot] = []
            game_ids[slot] = zlib.crc32(seed.encode()) & 0x7FFFFFFF
            specs.append({"id": slot, "p1": "random", "p2": "random", "seed": seed, "rules": rules})
            started += 1
        return env.reset(specs) if specs else []

    def settle(results: list[dict]) -> list[dict]:
        """Record finished games, replace them, and return the still-open decisions."""
        nonlocal kept, dropped
        open_: list[dict] = []
        while results:
            ended: list[int] = []
            for r in results:
                if not r["done"]:
                    open_.append(r)
                    continue
                slot = r["id"]
                ended.append(slot)
                records = steps.pop(slot)
                seats.pop(slot)
                if "failed" in r:
                    dropped += 1
                    continue
                winner = None if r["truncated"] else r["winner"]
                for record in records:
                    record["outcome"] = 0.0 if winner is None else (1.0 if winner == record["seat"] else -1.0)
                finished.extend(records)
                kept += 1
            results = launch(ended)
        return open_

    open_ = settle(launch(list(range(args.concurrent))))
    while open_ or steps:
        mine = [r for r in open_ if r["seat"] in seats[r["id"]]]
        actions: dict[int, int] = {}
        if mine:
            probs, _ = teacher.score(mine)
            for r, p in zip(mine, probs):
                p = p.astype(np.float64)
                p /= p.sum()
                actions[r["id"]] = int(rng.choice(len(p), p=p))
                steps[r["id"]].append(
                    {
                        **({"compact": r["compact"]} if args.compact else {"tokens": r["tokens"]}),
                        "seat": r["seat"],
                        "chosen": int(np.argmax(p)),
                        "probs": p.astype(np.float32),
                        "game": game_ids[r["id"]],
                    }
                )
        # A decision for a seat the teacher does not play cannot be open here:
        # the bridge plays the rules agent's seat itself.
        open_ = settle(env.step(actions)) if actions else []
        while len(finished) and kept >= per_shard * (shard + 1):
            save_shard(finished, out, shard, args.compact)
            print(
                f"shard {shard}: {kept} games ({dropped} failed), {len(finished)} decisions, "
                f"{time.perf_counter() - t0:.0f}s",
                flush=True,
            )
            finished, shard = [], shard + 1
        if not open_ and not steps:
            break
    if finished:
        save_shard(finished, out, shard, args.compact)
        print(f"shard {shard}: {kept} games ({dropped} failed), {len(finished)} decisions", flush=True)
    env.close()


if __name__ == "__main__":
    main()
