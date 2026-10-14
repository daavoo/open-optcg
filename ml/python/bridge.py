"""Client for the Node-side RL bridge (`ml/bridge/rl-server.ts`).

The rules engine is TypeScript and is not going to be reimplemented in Python,
so training talks to it over a pipe. One long-lived Node process serves many
environments addressed by integer id, which keeps process startup off the
per-episode path -- it dominates everything else at ~180 steps per game.

The Node side sends encoded float vectors rather than game observations. That is
the whole reason this is affordable: a raw observation is ~23 KB of JSON and the
engine produces ~4,000 decisions/sec/core, so shipping observations would spend
the training budget in `json.loads`.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
SERVER = REPO_ROOT / "ml" / "bridge" / "rl-server.ts"


@dataclass(frozen=True)
class Spec:
    obs_size: int
    action_size: int
    action_feature_size: int
    oov_index: int
    decks: tuple[str, ...]


class EngineBridge:
    """A Node subprocess hosting one or more environments."""

    def __init__(self, node_cmd: tuple[str, ...] = ("npx", "tsx")) -> None:
        self._proc = subprocess.Popen(
            [*node_cmd, str(SERVER)],
            cwd=REPO_ROOT,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            # stderr is left attached to the parent so a crash in the engine is
            # visible instead of being swallowed into a pipe nobody drains.
            text=True,
            bufsize=1,
        )
        raw = self._call({"cmd": "spec"})
        self.spec = Spec(
            obs_size=raw["obsSize"],
            action_size=raw["actionSize"],
            action_feature_size=raw["actionFeatureSize"],
            oov_index=raw["oovIndex"],
            decks=tuple(raw["decks"]),
        )
        # The token encoding's sizes and the card-feature table, shipped once.
        # See `TokenLayout.from_spec` and `TokenActorCriticPolicy`.
        self.token_spec: dict[str, Any] = raw["token"]
        self.sealed_expansions: tuple[str, ...] = tuple(raw.get("sealedExpansions", ()))

    def send(self, payload: dict[str, Any]) -> None:
        """Writes one request without waiting for its reply.

        Split from `recv` so a caller holding several engine processes can put
        a request on every pipe and only then block on the replies: the
        processes then work in parallel instead of one at a time.
        """
        assert self._proc.stdin
        if self._proc.poll() is not None:
            raise RuntimeError(f"engine exited with code {self._proc.returncode}")
        self._proc.stdin.write(json.dumps(payload) + "\n")
        self._proc.stdin.flush()

    def recv(self) -> dict[str, Any]:
        """Reads the reply to the oldest unanswered `send`."""
        assert self._proc.stdout
        line = self._proc.stdout.readline()
        if not line:
            raise RuntimeError("engine closed the pipe")
        result: dict[str, Any] = json.loads(line)
        if "error" in result:
            raise RuntimeError(f"engine error: {result['error']}")
        return result

    def _call(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.send(payload)
        return self.recv()

    def reset(
        self,
        env: int,
        p1_deck: str,
        p2_deck: str,
        seed: str,
        starting_player: str = "random",
        opponent_seat: str | None = None,
        opponent_kind: str = "none",
        sealed: bool = False,
    ) -> dict[str, Any]:
        """Start an episode.

        `opponent_seat` + `opponent_kind` hand one seat to an agent running
        inside the Node process, which then fast-forwards that seat's moves so
        they never cross the pipe. Omit them to drive both seats from Python.

        `sealed=True` ignores `p1_deck`/`p2_deck` server-side: the Node bridge
        opens one random OP17 pool, auto-builds a deck from it, and mirrors
        that same deck to both seats, so the episode's outcome measures
        piloting rather than pool strength.
        """
        payload: dict[str, Any] = {
            "cmd": "reset",
            "env": env,
            "p1Deck": p1_deck,
            "p2Deck": p2_deck,
            "seed": seed,
            "startingPlayer": starting_player,
        }
        if sealed:
            payload["sealed"] = True
        if opponent_seat is not None and opponent_kind != "none":
            payload["opponentSeat"] = opponent_seat
            payload["opponentKind"] = opponent_kind
        return self._call(payload)

    def step(self, env: int, action: int) -> dict[str, Any]:
        return self._call({"cmd": "step", "env": env, "action": int(action)})

    def reset_all(self, resets: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Many resets, one round trip. Each entry is a `reset` payload minus `cmd`."""
        if not resets:
            return []
        result = self._call({"cmd": "reset_all", "resets": resets})
        return list(result["results"])

    def step_all(self, steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Many steps, one round trip. Each entry is `{"env": id, "action": index}`."""
        if not steps:
            return []
        result = self._call({"cmd": "step_all", "steps": steps})
        return list(result["results"])

    def close_env(self, env: int) -> None:
        self._call({"cmd": "close", "env": env})

    def close(self) -> None:
        if self._proc.poll() is None:
            assert self._proc.stdin
            self._proc.stdin.close()
            self._proc.wait(timeout=10)

    def __enter__(self) -> EngineBridge:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
