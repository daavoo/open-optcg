"""A VecEnv over one Node engine process, stepping every environment in one
round trip, with an opponent pool sampled by how hard each opponent is.

Three stage-2 pieces from `docs/ai-roadmap.md` live here:

**A few processes, one round trip each per vector step.** The existing trainer
runs one Node process per environment behind `SubprocVecEnv`, and the pipe
round trip is the cost that matters (~2,000 learner steps/s against ~4,000 the
engine can do). `rl-server.ts` now takes `step_all`, so the environments of one
process cost one line each way; `engines` processes share the environments
round-robin, every process is sent its batch before any reply is read, and so
they work in parallel while Python waits once. No subprocesses on the Python
side.

**An opponent pool with prioritised fictitious self-play.** Each episode draws
its opponent from a pool: the deck's rules agent (played inside Node), the
random agent, and snapshots of the learner saved during the run (played here,
batched across environments). The draw is weighted by how often each opponent
beats the learner -- AlphaStar's PFSP "hard" weighting, `(1 - win rate)^2` --
so the rules agents stay in the curriculum for as long as they win, and a
snapshot the learner has already solved is rarely drawn. The lesson this
encodes is the ByteRL one: a policy fitted to a single fixed opponent learns
that opponent's mistakes, and the arena finds out later.

**Diverse starts.** `start_turn_max` lets an episode begin at a turn the rules
agents played to, so the learner sees mid-game boards it would otherwise reach
only after learning to survive the opening.

Both seats alternate per episode so the learner sees both turn orders; the
payload is always from the seat to move, so an opponent snapshot reads the
same observation the learner would in its place.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from gymnasium import spaces
from stable_baselines3.common.vec_env.base_vec_env import VecEnv

from bridge import EngineBridge
from token_layout import TokenLayout

FORMAT_DECKS = ("ST31", "ST32", "ST33", "ST34", "ST35", "ST36")

# Dense-reward weights, shared with `train.py`'s single-env path.
LIFE_WEIGHT = 0.2
POWER_WEIGHT = 1e-4
HAND_WEIGHT = 0.05


@dataclass
class OpponentPool:
    """Who the learner may face, and how each of them has been doing.

    `snapshot_dir` is rescanned at every episode start, so a snapshot the
    trainer saves mid-run joins the pool without a restart. Win records are
    per opponent id with a one-win, one-loss prior so a fresh entry is drawn
    at roughly even odds until it has a record.
    """

    kinds: tuple[str, ...] = ("rules",)
    snapshot_dir: Path | None = None
    max_snapshots: int = 8
    pfsp_power: float = 2.0
    pfsp_floor: float = 0.02
    records: dict[str, tuple[int, int]] = field(default_factory=dict)

    def entries(self) -> list[str]:
        out = [kind for kind in self.kinds if kind != "snapshots"]
        if "snapshots" in self.kinds and self.snapshot_dir is not None:
            paths = sorted(
                self.snapshot_dir.glob("*.zip"), key=lambda p: p.stat().st_mtime
            )
            out.extend(f"snapshot:{path}" for path in paths[-self.max_snapshots :])
        return out or ["rules"]

    def learner_win_rate(self, entry: str) -> float:
        wins, games = self.records.get(entry, (0, 0))
        return (wins + 1) / (games + 2)

    def sample(self, rng: random.Random) -> str:
        entries = self.entries()
        weights = [
            (1.0 - self.learner_win_rate(entry)) ** self.pfsp_power + self.pfsp_floor
            for entry in entries
        ]
        return rng.choices(entries, weights=weights, k=1)[0]

    def record(self, entry: str, learner_won: bool) -> None:
        wins, games = self.records.get(entry, (0, 0))
        self.records[entry] = (wins + int(learner_won), games + 1)

    def summary(self) -> str:
        parts = []
        for entry in self.entries():
            wins, games = self.records.get(entry, (0, 0))
            name = Path(entry.split(":", 1)[1]).stem if ":" in entry else entry
            parts.append(f"{name} {wins}/{games}")
        return ", ".join(parts)


@dataclass(frozen=True)
class EpisodeConfig:
    deck: str = "ST31"
    opponent_deck: str = "ST32"
    sealed: bool = False
    sealed_expansion: str = "OP17"
    seed_prefix: str = "train"
    alternate_seats: bool = True
    shaped_reward: bool = False
    gamma: float = 0.997
    start_turn_max: int = 1


class BridgeVecEnv(VecEnv):
    """`num_envs` token-encoded games in one Node process."""

    def __init__(
        self,
        num_envs: int,
        config: EpisodeConfig,
        pool: OpponentPool,
        num_slots: int = 32,
        rng_seed: int = 0,
        engines: int = 1,
    ) -> None:
        self.bridges = [EngineBridge() for _ in range(max(1, min(engines, num_envs)))]
        self.spec = self.bridges[0].spec
        self.token_spec = self.bridges[0].token_spec
        self.layout = TokenLayout.from_spec(self.token_spec, num_slots)
        self.config = config
        self.pool = pool
        self.render_mode = None
        self._rng = random.Random(rng_seed)
        self._episode = [0] * num_envs
        self._seat = ["p1"] * num_envs
        self._opponent = ["rules"] * num_envs
        self._deck = [config.deck] * num_envs
        self._last: list[dict[str, Any]] = [{} for _ in range(num_envs)]
        self._prev_potential: list[float | None] = [None] * num_envs
        self._actions: np.ndarray | None = None
        self._snapshots: dict[str, Any] = {}
        self.truncated_action_lists = 0
        observation_space = spaces.Box(
            low=-10.0, high=10.0, shape=(self.layout.size,), dtype=np.float32
        )
        super().__init__(num_envs, observation_space, spaces.Discrete(num_slots))

    # -- Talking to the engines ------------------------------------------------

    def _bridge_of(self, index: int) -> EngineBridge:
        return self.bridges[index % len(self.bridges)]

    def _fan_out(self, cmd: str, key: str, items: list[dict[str, Any]]) -> None:
        """Sends `items` to the processes that own their envs, then collects
        every reply into `_last`. All sends go out before the first read, so
        the processes run their batches concurrently."""
        if not items:
            return
        grouped: dict[int, list[dict[str, Any]]] = {}
        for item in items:
            grouped.setdefault(int(item["env"]) % len(self.bridges), []).append(item)
        for which, batch in grouped.items():
            self.bridges[which].send({"cmd": cmd, key: batch})
        for which in grouped:
            for result in self.bridges[which].recv()["results"]:
                self._last[int(result["env"])] = result

    # -- Episode setup ---------------------------------------------------------

    def _reset_params(self, index: int) -> dict[str, Any]:
        self._episode[index] += 1
        episode = self._episode[index]
        cfg = self.config
        seat = "p1" if not cfg.alternate_seats or episode % 2 == 1 else "p2"
        opponent_seat = "p2" if seat == "p1" else "p1"
        self._seat[index] = seat
        deck = cfg.deck if cfg.deck != "all" else self._rng.choice(FORMAT_DECKS)
        opponent_deck = (
            cfg.opponent_deck
            if cfg.opponent_deck != "all"
            else self._rng.choice(FORMAT_DECKS)
        )
        self._deck[index] = "SEALED" if cfg.sealed else deck
        opponent = self.pool.sample(self._rng)
        self._opponent[index] = opponent
        self._prev_potential[index] = None
        params: dict[str, Any] = {
            "env": index,
            "p1Deck": deck if seat == "p1" else opponent_deck,
            "p2Deck": opponent_deck if seat == "p1" else deck,
            "seed": (
                f"{cfg.seed_prefix}-{index}-{episode}-{self._rng.randrange(1 << 30)}"
            ),
            "startingPlayer": "random",
            "encoding": "token",
        }
        if cfg.sealed:
            params["sealed"] = True
            params["sealedExpansion"] = cfg.sealed_expansion
        if cfg.start_turn_max > 1:
            params["startTurn"] = self._rng.randint(1, cfg.start_turn_max)
        # Node-side opponents are fast-forwarded inside the engine process;
        # snapshots are played from here, so their seat is left undriven.
        if opponent in ("rules", "random", "first"):
            params["opponentSeat"] = opponent_seat
            params["opponentKind"] = opponent
        return params

    def _snapshot_model(self, entry: str) -> Any:
        model = self._snapshots.get(entry)
        if model is None:
            # Imported here so the env module does not need torch to import.
            from magnet_ppo import MagnetMaskablePPO

            path = entry.split(":", 1)[1]
            model = MagnetMaskablePPO.load(path, device="cpu")
            self._snapshots[entry] = model
            if len(self._snapshots) > self.pool.max_snapshots + 2:
                oldest = next(iter(self._snapshots))
                del self._snapshots[oldest]
        return model

    def _needs_python_opponent(self, index: int) -> bool:
        last = self._last[index]
        return (
            not last.get("done")
            and last.get("toPlay") != self._seat[index]
            and self._opponent[index].startswith("snapshot:")
        )

    def _advance_python_opponents(self) -> None:
        """Plays every snapshot-driven seat until the learner is to move.

        Batched by snapshot so one forward pass serves every environment that
        opponent is playing, and one `step_all` applies all of their moves.
        """
        while True:
            pending = [
                i for i in range(self.num_envs) if self._needs_python_opponent(i)
            ]
            if not pending:
                return
            steps: list[dict[str, Any]] = []
            by_model: dict[str, list[int]] = {}
            for index in pending:
                by_model.setdefault(self._opponent[index], []).append(index)
            for entry, indices in by_model.items():
                model = self._snapshot_model(entry)
                obs = np.stack([self.layout.pack(self._last[i]) for i in indices])
                masks = np.stack([self.layout.mask(self._last[i]) for i in indices])
                actions, _ = model.predict(obs, action_masks=masks, deterministic=False)
                for index, action in zip(
                    indices, np.asarray(actions).reshape(-1), strict=True
                ):
                    steps.append({"env": index, "action": int(action)})
            self._fan_out("step_all", "steps", steps)

    def _potential(self, last: dict[str, Any]) -> float:
        return (
            LIFE_WEIGHT * (last.get("selfLife", 0) - last.get("oppLife", 0))
            + POWER_WEIGHT * (last.get("selfPower", 0) - last.get("oppPower", 0))
            + HAND_WEIGHT * (last.get("selfHand", 0) - last.get("oppHand", 0))
        )

    def _shaped(self, index: int) -> float:
        current = self._potential(self._last[index])
        previous = self._prev_potential[index]
        self._prev_potential[index] = current
        if previous is None:
            return 0.0
        return self.config.gamma * current - previous

    # -- VecEnv API ------------------------------------------------------------

    def reset(self) -> np.ndarray:
        params = [self._reset_params(i) for i in range(self.num_envs)]
        self._fan_out("reset_all", "resets", params)
        self._advance_python_opponents()
        self.reset_infos = [
            {"mask": self.layout.mask(self._last[i])} for i in range(self.num_envs)
        ]
        return self._observations()

    def _observations(self) -> np.ndarray:
        return np.stack([self.layout.pack(last) for last in self._last])

    def step_async(self, actions: np.ndarray) -> None:
        self._actions = np.asarray(actions).reshape(-1)

    def step_wait(
        self,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[dict[str, Any]]]:
        assert self._actions is not None
        steps = [
            {"env": index, "action": int(action)}
            for index, action in enumerate(self._actions)
        ]
        self._fan_out("step_all", "steps", steps)
        self._advance_python_opponents()

        rewards = np.zeros(self.num_envs, dtype=np.float32)
        dones = np.zeros(self.num_envs, dtype=bool)
        infos: list[dict[str, Any]] = [{} for _ in range(self.num_envs)]
        to_reset: list[dict[str, Any]] = []
        for index in range(self.num_envs):
            last = self._last[index]
            if int(last.get("legalCount", 0)) > self.layout.num_slots:
                self.truncated_action_lists += 1
            if last.get("done"):
                winner = last.get("winner")
                truncated = bool(last.get("truncated"))
                won = winner == self._seat[index]
                rewards[index] = 0.0 if winner is None else (1.0 if won else -1.0)
                dones[index] = True
                if not truncated:
                    self.pool.record(self._opponent[index], won)
                infos[index] = {
                    "win": won,
                    "turns": last.get("turn"),
                    "result_reason": last.get("resultReason"),
                    "seat": self._seat[index],
                    "deck": self._deck[index],
                    "opponent": self._opponent[index],
                    "terminal_observation": self.layout.pack(last),
                    "TimeLimit.truncated": truncated and winner is None,
                }
                to_reset.append(self._reset_params(index))
            elif self.config.shaped_reward:
                rewards[index] = self._shaped(index)

        if to_reset:
            self._fan_out("reset_all", "resets", to_reset)
            self._advance_python_opponents()
        for index in range(self.num_envs):
            infos[index]["mask"] = self.layout.mask(self._last[index])
        return self._observations(), rewards, dones, infos

    def action_masks(self) -> list[np.ndarray]:
        return [self.layout.mask(last) for last in self._last]

    def close(self) -> None:
        for bridge in self.bridges:
            bridge.close()

    def get_attr(self, attr_name: str, indices: Any = None) -> list[Any]:
        count = len(list(self._get_indices(indices)))
        return [getattr(self, attr_name)] * count

    def set_attr(self, attr_name: str, value: Any, indices: Any = None) -> None:
        setattr(self, attr_name, value)

    def env_method(
        self, method_name: str, *args: Any, indices: Any = None, **kwargs: Any
    ) -> list[Any]:
        if method_name == "action_masks":
            masks = self.action_masks()
            return [masks[i] for i in self._get_indices(indices)]
        method = getattr(self, method_name)
        return [method(*args, **kwargs) for _ in self._get_indices(indices)]

    def env_is_wrapped(self, wrapper_class: type, indices: Any = None) -> list[bool]:
        return [False] * len(list(self._get_indices(indices)))
