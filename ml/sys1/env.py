"""Many engine games across several Node processes, stepped in lockstep.

Each worker is one `bridge/server.ts` process holding a slice of the games.
A vector step writes every worker's request before reading any reply, so the
workers' engines and rules agents run in parallel on the CPU cores while the
GPU is scoring the previous batch's decisions.
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
from pathlib import Path

import numpy as np

from huggingface_hub import hf_hub_download

from .data import SUPPORTED_RENDERS

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[2]
SERVER = "ml/bridge/server.ts"
# Games the engine threw on, one JSON line each with what replays them.
FAILED = ROOT / "checkpoints" / "failed-games.jsonl"


# Must match bridge/compact.ts; repeated here so the workers' protocol does not
# import MLX.
GLOBAL_NUMBERS = 45
CARD_WIDTH = 29
OPTION_WIDTH = 52


def unpack(results: list[dict]) -> list[dict]:
    """Each decision's packed `compact` (server.ts `pack`) as the arrays
    {global, cards, options} it encodes, in place; returns `results`."""
    for r in results:
        packed = r.get("compact")
        if packed is not None and "packed" in packed:
            values = np.frombuffer(base64.b64decode(packed["packed"]), dtype=np.float32)
            cards_end = GLOBAL_NUMBERS + packed["cards"] * CARD_WIDTH
            r["compact"] = {
                "global": values[:GLOBAL_NUMBERS],
                "cards": values[GLOBAL_NUMBERS:cards_end].reshape(packed["cards"], CARD_WIDTH),
                "options": values[cards_end:].reshape(packed["options"], OPTION_WIDTH),
            }
        if "next" in r:
            unpack([r["next"]])
    return results


def record_failures(results: list[dict]) -> list[dict]:
    """Appends every failed game in `results` to FAILED; returns `results`.

    A failed game comes back done and truncated, so the caller carries on;
    the file is how an engine bug met in a long run gets reported.
    """
    failed = [r["failed"] for r in results if "failed" in r]
    if failed:
        with FAILED.open("a") as handle:
            for entry in failed:
                handle.write(json.dumps(entry) + "\n")
    return results


class Worker:
    def __init__(self, tokens: bool = True):
        env = dict(os.environ)
        if env.get("SYS1_LAST_STEP"):
            # The workers run from the repo root, not from here.
            env["SYS1_LAST_STEP"] = str(Path(env["SYS1_LAST_STEP"]).resolve())
        # Every decision in each supported render version, current first: a
        # policy reads its own (`Policy.tokens_of`).
        env.setdefault("SYS1_RENDERS", ",".join(map(str, SUPPORTED_RENDERS)))
        # And the small scorer's encoding (bridge/compact.ts), which is cheap.
        env.setdefault("SYS1_COMPACT", "1")
        if tokens:
            # Decisions arrive as token ids (bridge/decision-tokens.ts), exact
            # against the tokenizer the corpus was made with.
            env["SYS1_TOKENIZER"] = hf_hub_download("jhu-clsp/ettin-encoder-68m", "tokenizer.json")
            env["SYS1_CARDS"] = str(ROOT / "data" / "cards.json")
        self.process = subprocess.Popen(
            ["pnpm", "exec", "tsx", SERVER],
            cwd=REPO,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

    def send(self, request: dict) -> None:
        assert self.process.stdin
        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()

    def receive(self) -> dict:
        assert self.process.stdout
        reply = json.loads(self.process.stdout.readline())
        if "error" in reply:
            raise RuntimeError(reply["error"])
        unpack(reply.get("results", []))
        return reply

    def close(self) -> None:
        self.process.terminate()


class VectorEnv:
    """Game `i` lives on worker `i % workers`."""

    def __init__(self, workers: int, tokens: bool = True):
        """`tokens` has the workers send token ids rather than text."""
        self.workers = [Worker(tokens) for _ in range(workers)]

    def _fan(self, per_worker: dict[int, dict]) -> list[dict]:
        for index, request in per_worker.items():
            self.workers[index].send(request)
        results: list[dict] = []
        for index in per_worker:
            results.extend(self.workers[index].receive()["results"])
        return record_failures(results)

    def reset(self, specs: list[dict]) -> list[dict]:
        """`specs`: {id, p1, p2, seed, rules}; decks may be "random"."""
        grouped: dict[int, list[dict]] = {}
        for spec in specs:
            grouped.setdefault(spec["id"] % len(self.workers), []).append(spec)
        return self._fan({w: {"cmd": "reset", "games": g} for w, g in grouped.items()})

    def step(self, actions: dict[int, int]) -> list[dict]:
        return self.receive(self.send_step(actions))

    def send_step(self, actions: dict[int, int], nexts: dict[int, dict] | None = None) -> list[int]:
        """Start a step without waiting; pass the result to `receive`.

        Lets a caller score one group of games on the GPU while the workers
        holding another group are still playing their engines forward.
        """
        grouped: dict[int, list[dict]] = {}
        for game, action in actions.items():
            entry = {"id": game, "action": action}
            if nexts and game in nexts:
                # Started in the slot if this move ends its game (server.ts `step`).
                entry["next"] = nexts[game]
            grouped.setdefault(game % len(self.workers), []).append(entry)
        for index, entries in grouped.items():
            self.workers[index].send({"cmd": "step", "actions": entries})
        return list(grouped)

    def receive(self, workers: list[int]) -> list[dict]:
        results: list[dict] = []
        for index in workers:
            results.extend(self.workers[index].receive()["results"])
        return record_failures(results)

    def fork(self, forks: list[dict]) -> list[dict]:
        """`forks`: {from, actions}, each a game waiting on a decision and
        indices into its offered actions. Every action is played on a copy
        that both rules agents finish (server.ts `fork`); the game itself is
        untouched. Returns {from, outcomes: [{action, winner, truncated}]}."""
        grouped: dict[int, list[dict]] = {}
        for entry in forks:
            grouped.setdefault(entry["from"] % len(self.workers), []).append(entry)
        return self._fan({w: {"cmd": "fork", "forks": g} for w, g in grouped.items()})

    def close(self) -> None:
        for worker in self.workers:
            worker.close()
