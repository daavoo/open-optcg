"""Trains a masked-PPO policy against the repo's rules agents.

Why PPO with an action mask, and not AlphaZero or MuZero:

  * AlphaZero's MCTS assumes both players see the whole state. This game hides
    hands, deck order and face-down Life, so a search over the true state is
    searching a state the agent is not entitled to know.
  * MuZero learns a dynamics model because it has no simulator. This repo *is* a
    simulator -- deterministic, seeded, replayable, and hidden-information-safe
    (`GameService.simulatorFor`). Training a network to approximate a model you
    can already call exactly is paying for something you have.

That leaves policy-gradient self-play, which is what this is. It does not
converge to a Nash equilibrium in an imperfect-information game -- nothing this
cheap does -- but "beats the shipped rules agents" is the actual bar, and it is
a bar a masked PPO policy can clear on CPU.

The opponent starts as the deck's rules agent, played inside the Node process.
That is a curriculum and an evaluation metric at once: win rate against
`RegistryRulesAgent` is directly comparable to the numbers `deck:benchmark` and
`analytics:baseline` already report.

    python train.py --timesteps 200000 --deck ST31 --opponent-deck ST32
"""

from __future__ import annotations

import argparse
import os
import random
import time
from pathlib import Path
from typing import Any, ClassVar

import gymnasium as gym
import numpy as np
import torch
from gymnasium import spaces
from sb3_contrib import MaskablePPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv, VecEnv

from bridge import EngineBridge
from bridge_vec_env import BridgeVecEnv, EpisodeConfig, OpponentPool
from candidate_policy import CandidateActorCriticPolicy
from magnet_ppo import MagnetMaskablePPO
from token_policy import TokenActorCriticPolicy

FORMAT_DECKS = ("ST31", "ST32", "ST33", "ST34", "ST35", "ST36")

# Dense-reward weights (potential-based -- see env._shaped). Life is the real
# score, board power is a cheap proxy for board advantage, and hand count is
# card advantage: public information and the strongest known predictor in the
# genre (what Hearthstone value nets learn first).
LIFE_WEIGHT = 0.2  # per life card
POWER_WEIGHT = 1e-4  # per power point: a 5,000-power swing is worth 0.5
HAND_WEIGHT = 0.05  # per card
GAMMA = 0.997  # matches the PPO discount; keep env and model in sync


class MaskCachingVecEnv(SubprocVecEnv):
    """SubprocVecEnv that serves action masks from the parent's cache.

    The child already ships the mask for the observation it returns (in the
    step payload); re-asking every child at the top of the next rollout step is
    a full pipe round trip that returns data the parent already holds. This
    subclass caches masks from step/reset replies and answers
    env_method("action_masks") from the cache, halving per-step pipe traffic.
    """

    def __init__(self, env_fns):
        super().__init__(env_fns)
        self._masks: list[np.ndarray] = [np.zeros(0, dtype=bool)] * self.num_envs

    def reset(self):
        obs = super().reset()
        self._masks = [info.get("mask") for info in self.reset_infos]
        return obs

    def step_wait(self):
        result = super().step_wait()
        _, _, dones, infos = result
        # For an env that just ended, the child auto-resets and the *new*
        # episode's mask arrives in reset_infos, not infos.
        masks = []
        for i in range(self.num_envs):
            info = self.reset_infos[i] if dones[i] else infos[i]
            masks.append(info.get("mask"))
        self._masks = masks
        return result

    def env_method(self, method_name, *args, indices=None, **kwargs):
        if method_name == "action_masks" and self._masks is not None:
            idxs = self._get_indices(indices)
            return [self._masks[i] for i in idxs]
        return super().env_method(method_name, *args, indices=indices, **kwargs)


class OptcgSingleAgentEnv(gym.Env):
    """One seat of the game, with the other seat played inside the engine.

    Single-agent rather than AEC because the opponent is fixed within an episode
    and the Node side fast-forwards its moves. That halves the IPC on the hot
    path and lets SB3's ordinary single-agent machinery apply unchanged.
    """

    metadata: ClassVar[dict[str, Any]] = {"render_modes": []}

    def __init__(
        self,
        bridge: EngineBridge,
        env_id: int,
        deck: str,
        opponent_deck: str,
        opponent_kind: str = "rules",
        seed_prefix: str = "train",
        alternate_seats: bool = True,
        shaped_reward: bool = False,
        policy: str = "flat",
        num_slots: int = 24,
        gamma: float = GAMMA,
        sealed: bool = False,
        frozen_checkpoint: str | None = None,
    ) -> None:
        super().__init__()
        self._bridge = bridge
        self._env_id = env_id
        self._deck = deck
        self._opponent_deck = opponent_deck
        self._opponent_kind = opponent_kind
        self._seed_prefix = seed_prefix
        self._alternate_seats = alternate_seats
        self._shaped_reward = shaped_reward
        self._policy = policy
        self._num_slots = num_slots
        self._gamma = gamma
        self._sealed = sealed
        # Loaded per-process (not passed in already-constructed) because a
        # live MaskablePPO instance is dragged through SubprocVecEnv's
        # closure pickling otherwise -- loading from the checkpoint file
        # inside each child process sidesteps that entirely, at the cost of
        # `num_envs` redundant loads of a network small enough not to matter.
        self._frozen_model = (
            MaskablePPO.load(frozen_checkpoint, device="cpu")
            if opponent_kind == "self" and frozen_checkpoint
            else None
        )
        self._episode = 0
        self._rng = random.Random(env_id)
        self._last: dict = {}
        self._seat = "p1"
        self._current_deck = deck
        # Previous (selfLife, oppLife, selfPower, oppPower, selfHand, oppHand)
        # for the dense potential.
        self._prev: tuple[float, float, float, float, float, float] | None = None

        spec = bridge.spec
        self.global_size = spec.obs_size
        self.row_size = spec.action_feature_size
        self._pointer = policy == "pointer"
        # Pointer mode: the observation is the global vector plus one feature
        # row per candidate slot (zero-padded beyond the legal count). The
        # action space becomes Discrete(num_slots): action k means "take the
        # k-th legal action", and the mask marks k < len(legal).
        obs_shape = spec.obs_size + (
            num_slots * spec.action_feature_size if self._pointer else 0
        )
        self.observation_space = spaces.Box(
            low=-10.0, high=10.0, shape=(obs_shape,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(
            num_slots if self._pointer else spec.action_size
        )
        self._action_size = spec.action_size

    def _obs(self) -> np.ndarray:
        obs = np.asarray(self._last["obs"], dtype=np.float32)
        if not self._pointer:
            return obs
        rows = np.asarray(self._last.get("actionFeatures") or [], dtype=np.float32)
        padded = np.zeros((self._num_slots, self.row_size), dtype=np.float32)
        n = min(rows.shape[0], self._num_slots)
        if n:
            padded[:n] = rows[:n]
        return np.concatenate([obs, padded.reshape(-1)])

    def action_masks(self) -> np.ndarray:
        indices = self._last.get("mask") or []
        if self._pointer:
            mask = np.zeros(self._num_slots, dtype=bool)
            mask[: min(len(indices), self._num_slots)] = True
            if mask.any() or self._last.get("done"):
                return mask
            # Should not happen: a live state always offers at least `pass`.
            raise RuntimeError("live state with no legal actions")
        mask = np.zeros(self._action_size, dtype=bool)
        if indices:
            mask[np.asarray(indices, dtype=np.int64)] = True
        elif not self._last.get("done"):
            # Should not happen: a live state always offers at least `pass`.
            # Leaving the mask all-False would make MaskablePPO sample from an
            # all-zero distribution, so fail loudly instead of silently.
            raise RuntimeError("live state with no legal actions")
        return mask

    def _table_index_for(self, action: int) -> int:
        """Maps a pointer slot index (or a flat action) to the server's table
        index, the same way `step()` does for the learner's own action."""
        if not self._pointer:
            return action
        mask = self._last.get("mask") or [0]
        return int(mask[min(action, len(mask) - 1)])

    def _advance_opponent(self) -> None:
        """Plays the frozen snapshot's turn(s), for `opponent_kind == "self"`.

        The server always observes from the seat about to move (`viewer` in
        `rl-server.ts`'s payload), so the exact same `_obs()`/`action_masks()`
        the learner uses already describe the opponent's decision correctly --
        no seat-relative bookkeeping needed here, just "whoever's turn it
        isn't mine, ask the frozen model."
        """
        if self._frozen_model is None:
            return
        while not self._last.get("done") and self._last.get("toPlay") != self._seat:
            action, _ = self._frozen_model.predict(
                self._obs(), action_masks=self.action_masks(), deterministic=False
            )
            table_index = self._table_index_for(int(np.asarray(action).item()))
            self._last = self._bridge.step(self._env_id, table_index)

    def _shaped(self, last: dict) -> float:
        """Potential-based dense reward: r += gamma*Phi(s') - Phi(s).

        Phi(s) = LIFE_WEIGHT*(selfLife-oppLife)
               + POWER_WEIGHT*(selfPower-oppPower)
               + HAND_WEIGHT*(selfHand-oppHand)

        Potential-based shaping (Ng, Harada, Russell 1999) provably preserves
        the optimal policy, so the dense signal cannot teach the policy to game
        the proxy instead of winning -- unlike a raw delta, which can.
        """
        cur = (
            last.get("selfLife", 0),
            last.get("oppLife", 0),
            last.get("selfPower", 0),
            last.get("oppPower", 0),
            last.get("selfHand", 0),
            last.get("oppHand", 0),
        )
        if self._prev is None:
            self._prev = cur
            return 0.0
        prev = self._prev
        self._prev = cur

        def phi(s: tuple[float, float, float, float, float, float]) -> float:
            return (
                LIFE_WEIGHT * (s[0] - s[1])
                + POWER_WEIGHT * (s[2] - s[3])
                + HAND_WEIGHT * (s[4] - s[5])
            )

        return self._gamma * phi(cur) - phi(prev)

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        self._episode += 1

        # Alternate seats so the policy sees both turn orders. Going first is a
        # real advantage in this format -- it is the whole reason the analytics
        # matrix reports play/draw separately -- and a policy trained only on p1
        # would never learn the other side of it.
        self._seat = (
            "p1" if not self._alternate_seats or self._episode % 2 == 1 else "p2"
        )
        opponent_seat = "p2" if self._seat == "p1" else "p1"

        # "all" trains one policy across the whole format instead of one per
        # matchup. Only ~4% of the action space is shared between decks, but
        # that 4% -- attacks, DON!! attachment, blocks, pass -- carries about
        # 37% of all decisions, so the mechanics are worth learning once from
        # every matchup rather than six times from a sixth of the data each.
        # The Leader one-hot in the observation is what lets a single policy
        # tell the archetypes apart; without it this would train an average.
        deck = self._deck if self._deck != "all" else self._rng.choice(FORMAT_DECKS)
        opponent_deck = (
            self._opponent_deck
            if self._opponent_deck != "all"
            else self._rng.choice(FORMAT_DECKS)
        )
        self._current_deck = "SEALED" if self._sealed else deck

        p1_deck = deck if self._seat == "p1" else opponent_deck
        p2_deck = opponent_deck if self._seat == "p1" else deck

        # "self" has no Node-side counterpart (`rl-server.ts`'s `OpponentKind`
        # is only none/rules/random/first) -- the frozen snapshot plays
        # entirely from Python, via `_advance_opponent()`, so both seats are
        # left undriven server-side here.
        self_play = self._opponent_kind == "self"
        self._last = self._bridge.reset(
            self._env_id,
            p1_deck,
            p2_deck,
            f"{self._seed_prefix}-{self._env_id}-{self._episode}"
            f"-{self._rng.randrange(1 << 30)}",
            starting_player="random",
            sealed=self._sealed,
            **(
                {}
                if self_play
                else {
                    "opponent_seat": opponent_seat,
                    "opponent_kind": self._opponent_kind,
                }
            ),
        )
        self._prev = None
        self._advance_opponent()
        return self._obs(), {"mask": self.action_masks()}

    def step(self, action: int):
        table_index = self._table_index_for(int(action))
        self._last = self._bridge.step(self._env_id, table_index)
        self._advance_opponent()
        done = bool(self._last["done"])
        reward = 0.0
        info: dict = {}
        if done:
            winner = self._last.get("winner")
            reward = 0.0 if winner is None else (1.0 if winner == self._seat else -1.0)
            info = {
                "win": winner == self._seat,
                "turns": self._last.get("turn"),
                "result_reason": self._last.get("resultReason"),
                "seat": self._seat,
                "deck": self._current_deck,
            }
        elif self._shaped_reward:
            reward = self._shaped(self._last)
        truncated = bool(self._last.get("truncated"))
        info["mask"] = self.action_masks()
        return self._obs(), reward, done and not truncated, truncated, info

    def close(self) -> None:
        # Shut down the Node engine process this env owns. SubprocVecEnv calls
        # this on each sub-env when the VecEnv closes.
        self._bridge.close()


def make_env(args: argparse.Namespace, env_id: int):
    def _init() -> gym.Env:
        # One engine process per environment. Each subprocess owns its own Node
        # bridge, which is what makes the envs actually parallel: a shared
        # bridge would serialize every step behind one event loop.
        bridge = EngineBridge()
        return OptcgSingleAgentEnv(
            bridge,
            env_id=env_id,
            deck=args.deck,
            opponent_deck=args.opponent_deck,
            opponent_kind=args.opponent,
            seed_prefix=args.seed_prefix,
            shaped_reward=args.shaped_reward,
            policy=args.policy,
            num_slots=args.num_slots,
            gamma=args.gamma,
            sealed=args.sealed,
            frozen_checkpoint=getattr(args, "frozen_checkpoint", None),
        )

    return _init


def build_env(args: argparse.Namespace, num_envs: int, opponent: str):
    """Fresh envs with the given opponent; each env owns its own engine.

    `--policy token` takes the other route: one engine process for all envs,
    stepped in one round trip, with the opponent drawn per episode from a pool
    (`opponent` then names the pool: `"pool"` for the configured one, anything
    else for a single-entry pool of that kind).
    """
    if args.policy == "token":
        kinds = (
            tuple(args.pool.split(","))
            if opponent == "pool"
            else (opponent if opponent != "self" else "snapshots",)
        )
        pool = OpponentPool(
            kinds=kinds,
            snapshot_dir=Path(args.snapshot_dir),
            pfsp_power=args.pfsp_power,
        )
        config = EpisodeConfig(
            deck=args.deck,
            opponent_deck=args.opponent_deck,
            sealed=args.sealed,
            sealed_expansion=args.sealed_expansion,
            seed_prefix=args.seed_prefix,
            shaped_reward=args.shaped_reward,
            gamma=args.gamma,
            start_turn_max=args.start_turn_max,
        )
        return BridgeVecEnv(
            num_envs, config, pool, num_slots=args.num_slots, engines=args.engines
        )
    env_args = argparse.Namespace(**vars(args))
    env_args.opponent = opponent
    if num_envs > 1:
        return MaskCachingVecEnv([make_env(env_args, i) for i in range(num_envs)])
    # Always a VecEnv: `evaluate_wins` relies on the auto-reset a VecEnv does
    # when an episode ends, and a bare env left the loop stepping a finished
    # game.
    return DummyVecEnv([make_env(env_args, 0)])


class SnapshotCallback(BaseCallback):
    """Saves the learner every `every` steps into the pool's snapshot directory.

    The pool rescans that directory at each episode start, so a snapshot joins
    the opponent draw as soon as it is written. Only the last `keep` are kept,
    which bounds both disk and how stale the weakest snapshot can be.
    """

    def __init__(self, directory: Path, every: int, keep: int) -> None:
        super().__init__()
        self.directory = directory
        self.every = every
        self.keep = keep
        self._last_saved = 0

    def _on_step(self) -> bool:
        if self.num_timesteps - self._last_saved >= self.every:
            self._last_saved = self.num_timesteps
            self.directory.mkdir(parents=True, exist_ok=True)
            self.model.save(str(self.directory / f"step-{self.num_timesteps:010d}"))
            snapshots = sorted(self.directory.glob("step-*.zip"))
            for stale in snapshots[: -self.keep]:
                stale.unlink()
        return True


def env_attr(env, name: str):
    """Read an attribute off a single env or any VecEnv."""
    if isinstance(env, VecEnv):
        return env.get_attr(name)[0]
    return getattr(env, name)


def evaluate_wins(model, env, n_episodes: int, deterministic: bool = False) -> float:
    """Terminal win rate counted from infos, correct under shaped rewards.

    With `--shaped-reward` the reward is no longer +1/-1, so the usual
    (mean+1)/2 conversion is meaningless (it printed "-82%"). The win flag is
    set on terminal steps regardless of shaping, so count those directly.
    Truncated episodes (engine step cap) count as losses.
    """
    vec = isinstance(env, VecEnv)
    num_envs = env.num_envs if vec else 1
    episodes_done = 0
    wins = 0
    if vec:
        obs = env.reset()
    else:
        # A bare Gymnasium env returns `(obs, info)`; only the VecEnv returns
        # the batch directly.
        first, _ = env.reset()
        obs = first[None]
    steps = 0
    while episodes_done < n_episodes and steps < 200_000:
        if vec:
            masks = np.stack(env.env_method("action_masks"))
            actions, _ = model.predict(
                obs, action_masks=masks, deterministic=deterministic
            )
            obs, _, dones, infos = env.step(actions)
        else:
            action, _ = model.predict(
                obs[0],
                action_masks=env.action_masks(),
                deterministic=deterministic,
            )
            obs, _, terminated, truncated, info = env.step(
                int(np.asarray(action).item())
            )
            dones = np.array([terminated or truncated])
            infos = [info]
            obs = obs[None]
        for i in range(num_envs):
            if dones[i]:
                episodes_done += 1
                if infos[i].get("win"):
                    wins += 1
        steps += 1
    return wins / max(1, episodes_done)


def format_eta(seconds: float) -> str:
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds}s"
    return f"{seconds // 60}m{seconds % 60:02d}s"


def run_stage(
    model,
    env,
    args: argparse.Namespace,
    opponent: str,
    budget: int,
    advance_at: float | None,
    eval_every: int,
    max_minutes: float | None = None,
    patience: int | None = None,
    eval_env=None,
    callback=None,
) -> dict:
    """Train against one opponent for `budget` steps.

    Eval every `eval_every` steps; if win rate reaches `advance_at`, return
    early (the stage is proven). Also stops early if `max_minutes` elapses, or
    if the best-so-far win rate hasn't improved for `patience` consecutive
    evals (a plateaued/stuck run, not worth spending the rest of the budget
    on). Returns a stats dict for the final report.
    """
    start = time.time()
    eval_env = eval_env if eval_env is not None else env
    starting = evaluate_wins(model, eval_env, min(30, args.eval_episodes))
    print(f"[stage {opponent}] starting win rate {starting:.1%}")
    done_steps = 0
    advanced = False
    stopped_reason = None
    last_rate = starting
    best_rate = starting
    stale_evals = 0
    while done_steps < budget:
        batch = min(eval_every, budget - done_steps)
        model.learn(
            total_timesteps=batch,
            progress_bar=False,
            callback=callback,
            reset_num_timesteps=False,
        )
        done_steps += batch
        elapsed = time.time() - start
        rate = evaluate_wins(model, eval_env, min(args.eval_episodes, 50))
        if isinstance(env, BridgeVecEnv):
            print(f"[stage {opponent}] pool: {env.pool.summary()}")
        last_rate = rate
        fps = done_steps / elapsed if elapsed > 0 else 0.0
        remaining = (budget - done_steps) / fps if fps > 0 else 0.0
        print(
            f"[stage {opponent}] {done_steps:>10,}/{budget:>10,} "
            f"({100.0 * done_steps / budget:5.1f}%)  win {rate:5.1%}  "
            f"fps {fps:5,.0f}  eta {format_eta(remaining)}  "
            f"(elapsed {format_eta(elapsed)})"
        )
        if advance_at is not None and rate >= advance_at:
            advanced = True
            break
        if rate > best_rate:
            best_rate = rate
            stale_evals = 0
        else:
            stale_evals += 1
        if max_minutes is not None and elapsed >= max_minutes * 60:
            stopped_reason = f"max-minutes ({max_minutes:.0f}m) reached"
            break
        if patience is not None and stale_evals >= patience:
            stopped_reason = (
                f"no improvement over best {best_rate:.1%} for "
                f"{stale_evals} consecutive evals (patience={patience})"
            )
            break
    if stopped_reason:
        print(f"[stage {opponent}] stopping early: {stopped_reason}")
    return {
        "opponent": opponent,
        "steps": done_steps,
        "win": last_rate,
        "elapsed": time.time() - start,
        "advanced": advanced,
        "stopped_reason": stopped_reason,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    # "all" resamples the deck every episode, training one policy for the whole
    # format rather than one per matchup.
    parser.add_argument("--deck", default="ST31", choices=(*FORMAT_DECKS, "all"))
    parser.add_argument(
        "--opponent-deck", default="ST32", choices=(*FORMAT_DECKS, "all")
    )
    parser.add_argument(
        "--opponent",
        default="rules",
        choices=("rules", "random", "first", "self"),
    )
    parser.add_argument(
        "--init-checkpoint",
        default=None,
        help="Continue training from this checkpoint instead of random init.",
    )
    parser.add_argument(
        "--frozen-checkpoint",
        default=None,
        help=(
            "Checkpoint the '--opponent self' opponent plays from, fixed for "
            "the whole run (no periodic snapshot refresh yet). Defaults to "
            "--init-checkpoint."
        ),
    )
    parser.add_argument("--timesteps", type=int, default=200_000)
    parser.add_argument("--eval-episodes", type=int, default=200)
    parser.add_argument("--eval-every", type=int, default=20_000)
    parser.add_argument("--num-envs", type=int, default=1)
    parser.add_argument("--n-epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--torch-threads", type=int, default=4)
    parser.add_argument("--shaped-reward", action="store_true")
    # "flat" scores legal actions as classes in the frozen 2,044-key action
    # table; "pointer" scores the actual legal actions via the shared slot
    # head (see candidate_policy.py). Pointer needs no table regeneration for
    # new cards and no OOV bucket; flat is kept for A/B measurement.
    parser.add_argument(
        "--policy", default="pointer", choices=("flat", "pointer", "token")
    )
    parser.add_argument("--num-slots", type=int, default=24)
    # --policy token: cards as tokens, actions as pointers, an asymmetric
    # critic, one engine process for every env, and an opponent pool. See
    # docs/ai-roadmap.md stages 1 and 2 and the module headers.
    parser.add_argument(
        "--pool",
        default="rules,snapshots",
        help=(
            "Comma-separated opponent kinds for --policy token: rules, random, "
            "first, snapshots (checkpoints saved by --snapshot-every)."
        ),
    )
    parser.add_argument(
        "--engines",
        type=int,
        default=max(1, (os.cpu_count() or 2) - 1),
        help="Engine processes the token envs are spread over (--policy token).",
    )
    parser.add_argument("--snapshot-every", type=int, default=100_000)
    parser.add_argument("--snapshot-keep", type=int, default=8)
    parser.add_argument("--snapshot-dir", default="snapshots")
    parser.add_argument(
        "--pfsp-power",
        type=float,
        default=2.0,
        help="PFSP exponent: opponents are drawn with weight (1 - win rate)^p.",
    )
    parser.add_argument(
        "--start-turn-max",
        type=int,
        default=1,
        help=(
            "Start some episodes mid-game: a turn in [1, N] is drawn and the "
            "rules agents play both seats up to it."
        ),
    )
    parser.add_argument(
        "--magnet-coef",
        type=float,
        default=0.05,
        help="KL penalty towards the EMA magnet policy; 0 is plain MaskablePPO.",
    )
    parser.add_argument("--magnet-tau", type=float, default=0.05)
    parser.add_argument("--d-model", type=int, default=96)
    parser.add_argument("--n-layers", type=int, default=2)
    parser.add_argument("--n-heads", type=int, default=4)
    parser.add_argument(
        "--sealed-expansion",
        default="OP17",
        help="Sealed set for --policy token; 'any' draws one per episode.",
    )
    parser.add_argument("--seed-prefix", default="train")
    parser.add_argument("--out", default="checkpoints/optcg-ppo")
    parser.add_argument(
        "--gamma",
        type=float,
        default=GAMMA,
        help="PPO discount; the env's dense-reward potential uses the same value",
    )
    parser.add_argument(
        "--sealed",
        action="store_true",
        help=(
            "OP17 sealed instead of a fixed constructed deck: each episode opens "
            "a fresh random pool and mirrors the same auto-built deck to both "
            "seats, so --deck/--opponent-deck are ignored and win rate measures "
            "piloting rather than pool strength."
        ),
    )
    parser.add_argument(
        "--max-minutes",
        type=float,
        default=None,
        help="Wall-clock cap; stop (and still save/report) once exceeded.",
    )
    parser.add_argument(
        "--patience",
        type=int,
        default=None,
        help=(
            "Stop early if the best eval win rate hasn't improved for this many "
            "consecutive evals (a plateau/stuck run)."
        ),
    )
    # "mps" is Apple Silicon's GPU. It is a net *loss* for the current setup,
    # not a win: measured on an M5 Pro, the batch update is 3x faster on MPS
    # (1,514 vs 511 steps/s at batch 256) but the per-step hot path -- numpy
    # obs -> tensor -> forward -> masked sample -> numpy -- is 10x slower
    # (624 vs 59 us) because every tiny op is a separate GPU launch/sync, and
    # the engine+IPC step (~490 us) dominates anyway. Default stays "cpu"
    # until the policy is big enough (pointer net / transformer) or envs are
    # parallel enough that the ping-pong amortizes. A checkpoint trained on
    # "mps" loads fine on "cpu" -- SB3 state dicts are device-agnostic.
    parser.add_argument("--device", default="cpu", choices=("cpu", "mps"))
    args = parser.parse_args()
    if args.opponent == "self":
        args.frozen_checkpoint = args.frozen_checkpoint or args.init_checkpoint
        if not args.frozen_checkpoint:
            parser.error(
                "--opponent self needs --frozen-checkpoint or --init-checkpoint"
            )

    # The per-step forward is a batch-`num_envs` pass over a 2k-wide head and
    # the update processes batch-512 minibatches; both are small matmuls where
    # 18 torch threads mostly contend. Measured on an M5 Pro: threads=4 is
    # ~35% faster than the default for this workload.
    if args.device == "cpu":
        torch.set_num_threads(args.torch_threads)

    if args.policy == "token":
        # The pool is the training opponent; `--opponent` is kept for the
        # flat and pointer paths and ignored here beyond the eval baseline.
        stages = [("pool", None)]
        if args.num_slots == 24:
            # 24 was measured for the deduplicated table; the token path keeps
            # every legal action, and the rules agents see a p95 of 21.
            args.num_slots = 32
    else:
        stages = [(args.opponent, None)]
    per_stage = args.timesteps
    env = build_env(args, args.num_envs, stages[0][0])
    eval_env = (
        build_env(args, args.num_envs, "rules") if args.policy == "token" else None
    )
    callback = (
        SnapshotCallback(
            Path(args.snapshot_dir), args.snapshot_every, args.snapshot_keep
        )
        if args.policy == "token" and "snapshots" in args.pool
        else None
    )
    if args.policy == "token":
        assert isinstance(env, BridgeVecEnv)
        print(
            f"env: token layout {env.layout.size} floats ({env.layout.max_tokens} "
            f"tokens x {env.layout.token_wire_size}, {args.num_slots} action slots, "
            f"{env.layout.max_privileged} privileged tokens), {args.num_envs} env(s) "
            f"in one engine process, pool: {args.pool}, card table "
            f"{env.token_spec['cardTableFingerprint']}"
        )
    elif args.policy == "pointer":
        print(
            f"env: obs {env.observation_space.shape[0]} floats "
            f"({env_attr(env, 'global_size')} global + {args.num_slots} "
            f"candidate rows), Discrete({args.num_slots}), {args.num_envs} "
            f"env(s), stages: {', '.join(k for k, _ in stages)}"
        )
    else:
        print(
            f"env: obs {env.observation_space.shape[0]} floats, "
            f"{env.action_space.n - 1} actions + OOV, {args.num_envs} env(s), "
            f"stages: {', '.join(k for k, _ in stages)}"
        )

    common_kwargs = dict(
        n_steps=1024,
        batch_size=args.batch_size,
        n_epochs=args.n_epochs,
        learning_rate=3e-4,
        gamma=args.gamma,  # ~180 decisions per game; reward is mostly terminal.
        ent_coef=0.01,
        verbose=1,
        device=args.device,
    )
    if args.init_checkpoint:
        # `.load` restores the saved policy_kwargs (net_arch, global/row size,
        # ...) itself, so none of it needs restating here -- only the env and
        # the training hyperparameters that aren't part of the checkpoint.
        loader = MagnetMaskablePPO if args.policy == "token" else MaskablePPO
        model = loader.load(args.init_checkpoint, env=env, device=args.device)
        model.n_epochs = args.n_epochs
        model.gamma = args.gamma
        if isinstance(env, BridgeVecEnv):
            saved = getattr(model.policy, "card_table_fingerprint", None)
            live = env.token_spec["cardTableFingerprint"]
            if saved != live:
                # The embedding rows are indexed by the card table; a different
                # table reads every row against the wrong card.
                raise SystemExit(
                    f"checkpoint card table {saved} != engine card table {live}; "
                    "the table is append-only, so this means a reorder or a "
                    "different checkout. Retrain, or check out the table the "
                    "checkpoint was trained against."
                )
        print(f"resumed from {args.init_checkpoint}")
    elif args.policy == "token":
        assert isinstance(env, BridgeVecEnv)
        model = MagnetMaskablePPO(
            TokenActorCriticPolicy,
            env,
            policy_kwargs={
                "layout": env.layout.__dict__,
                "card_feature_table": env.token_spec["cardFeatures"],
                "card_table_fingerprint": env.token_spec["cardTableFingerprint"],
                "d_model": args.d_model,
                "n_heads": args.n_heads,
                "n_layers": args.n_layers,
            },
            magnet_coef=args.magnet_coef,
            magnet_tau=args.magnet_tau,
            **common_kwargs,
        )
    elif args.policy == "pointer":
        model = MaskablePPO(
            CandidateActorCriticPolicy,
            env,
            policy_kwargs={
                "net_arch": [256, 256],
                "global_size": env_attr(env, "global_size"),
                "row_size": env_attr(env, "row_size"),
                "num_slots": args.num_slots,
                "slot_hidden": 128,
            },
            **common_kwargs,
        )
    else:
        model = MaskablePPO(
            "MlpPolicy",
            env,
            # Small net: the observation is mostly-sparse features and the
            # decision is shallow. Capacity is not the bottleneck here, sample
            # throughput is.
            policy_kwargs={"net_arch": [256, 256]},
            **common_kwargs,
        )

    leftover = args.timesteps
    total_start = time.time()
    stage_stats: list[dict] = []
    for idx, (opponent, advance_at) in enumerate(stages):
        if idx > 0:
            env.close()
            env = build_env(args, args.num_envs, opponent)
            model.set_env(env)
        # The final stage gets whatever earlier stages did not spend.
        budget = leftover if idx == len(stages) - 1 else min(per_stage, leftover)
        stats = run_stage(
            model,
            env,
            args,
            opponent,
            budget,
            advance_at,
            args.eval_every,
            max_minutes=args.max_minutes,
            patience=args.patience,
            eval_env=eval_env,
            callback=callback,
        )
        stage_stats.append(stats)
        leftover -= stats["steps"]
    if isinstance(env, BridgeVecEnv):
        print(f"final pool record: {env.pool.summary()}")
        if env.truncated_action_lists:
            print(
                f"decisions with more legal actions than slots: "
                f"{env.truncated_action_lists} (raise --num-slots if this is not rare)"
            )
    env.close()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    model.save(str(out))

    # The number that matters: final win rate against the shipped rules agent.
    rules_env = (
        eval_env if eval_env is not None else build_env(args, args.num_envs, "rules")
    )
    model.set_env(rules_env)
    final = evaluate_wins(model, rules_env, args.eval_episodes)
    rules_env.close()

    # Structured final report.
    total_elapsed = time.time() - total_start
    total_steps = sum(s["steps"] for s in stage_stats)
    policy_desc = {
        "pointer": f"pointer ({args.num_slots} slots)",
        "token": (
            f"token ({args.num_slots} slots, d={args.d_model}, "
            f"{args.n_layers} layers, magnet {args.magnet_coef})"
        ),
    }.get(args.policy, "flat")
    print()
    print("=== TRAINING REPORT ===")
    print(
        f"policy: {policy_desc} | envs: {args.num_envs} | "
        f"obs: {env.observation_space.shape[0]} floats | device: {args.device}"
    )
    deck_desc = (
        "OP17 sealed (mirrored random pool per episode)"
        if args.sealed
        else f"{args.deck} vs {args.opponent_deck}"
    )
    print(f"deck: {deck_desc} | shaped-reward: {args.shaped_reward}")
    print(f"stages: {' -> '.join(k for k, _ in stages)}")
    for s in stage_stats:
        note = "  (advanced)" if s["advanced"] else ""
        if s.get("stopped_reason"):
            note += f"  (stopped early: {s['stopped_reason']})"
        print(
            f"  stage {s['opponent']:<8} steps {s['steps']:>10,}  "
            f"win {s['win']:6.1%}  {format_eta(s['elapsed'])}{note}"
        )
    print(
        f"total steps: {total_steps:,} | wall: {format_eta(total_elapsed)} | "
        f"avg fps: {total_steps / total_elapsed:,.0f}"
    )
    print(f"final win rate vs rules: {final:.1%}")
    print(f"checkpoint: {out}.zip")


if __name__ == "__main__":
    main()
