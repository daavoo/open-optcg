"""PettingZoo AEC environment over the One Piece rules engine.

AEC rather than parallel because the engine is strictly sequential: exactly one
seat is ever to move. `state.activePlayer` is not "whose turn is it" but "who
must decide next", and the engine reassigns it to the defender for blocks and
counters (engine.ts:481, 2204). So a turn is not a round of simultaneous moves,
and modelling it as one would be wrong.

Action masking is not optional here. The action space is ~1,800 frozen keys
while a typical decision offers about 6 legal actions -- mean 6.1, max ~143 over
60k measured decisions. An unmasked policy would spend essentially all of its
probability mass on illegal actions.
"""

from __future__ import annotations

from typing import Any, ClassVar

import numpy as np
from gymnasium import spaces
from pettingzoo import AECEnv

from bridge import EngineBridge

AGENTS = ["p1", "p2"]


class OptcgAECEnv(AECEnv):
    metadata: ClassVar[dict[str, Any]] = {
        "render_modes": [],
        "name": "optcg_v0",
        "is_parallelizable": False,
    }

    def __init__(
        self,
        bridge: EngineBridge,
        env_id: int = 0,
        p1_deck: str = "ST31",
        p2_deck: str = "ST32",
        seed_prefix: str = "train",
    ) -> None:
        super().__init__()
        self._bridge = bridge
        self._env_id = env_id
        self._p1_deck = p1_deck
        self._p2_deck = p2_deck
        self._seed_prefix = seed_prefix
        self._episode = 0
        self._last: dict[str, Any] = {}

        spec = bridge.spec
        self.possible_agents = list(AGENTS)
        self._obs_size = spec.obs_size
        self._action_size = spec.action_size

        # The mask travels inside the observation because that is the convention
        # SB3's MaskablePPO and Tianshou both read, and it keeps the mask
        # attached to the state it was derived from.
        self.observation_spaces = {
            agent: spaces.Dict(
                {
                    "observation": spaces.Box(
                        low=-10.0, high=10.0, shape=(spec.obs_size,), dtype=np.float32
                    ),
                    "action_mask": spaces.Box(
                        low=0, high=1, shape=(spec.action_size,), dtype=np.int8
                    ),
                }
            )
            for agent in AGENTS
        }
        self.action_spaces = {
            agent: spaces.Discrete(spec.action_size) for agent in AGENTS
        }

    # -- PettingZoo API -------------------------------------------------

    def observation_space(self, agent: str) -> spaces.Space:
        return self.observation_spaces[agent]

    def action_space(self, agent: str) -> spaces.Space:
        return self.action_spaces[agent]

    def reset(self, seed: int | None = None, options: dict | None = None) -> None:
        self.agents = list(self.possible_agents)
        self.rewards = {agent: 0.0 for agent in self.agents}
        self._cumulative_rewards = {agent: 0.0 for agent in self.agents}
        self.terminations = {agent: False for agent in self.agents}
        self.truncations = {agent: False for agent in self.agents}
        self.infos: dict[str, dict[str, Any]] = {agent: {} for agent in self.agents}

        # The engine seeds its own shuffle, so the episode seed is a string it
        # hashes rather than a numpy seed. Distinct seeds per episode matter:
        # reusing one trains the policy on a single shuffle.
        self._episode += 1
        episode_seed = (
            f"{self._seed_prefix}-{seed}-{self._episode}"
            if seed is not None
            else f"{self._seed_prefix}-{self._episode}"
        )
        self._last = self._bridge.reset(
            self._env_id, self._p1_deck, self._p2_deck, episode_seed
        )

        # No `agent_selector`: turn order is not round-robin. The engine hands
        # the seat to the defender mid-turn for blocks and counters, so the only
        # correct source for `agent_selection` is the engine itself.
        self.agent_selection = self._last["toPlay"]

    def observe(self, agent: str) -> dict[str, np.ndarray]:
        mask = np.zeros(self._action_size, dtype=np.int8)
        # Only the seat to move has a decision, so everyone else sees an empty
        # mask. PettingZoo only ever queries the selected agent in an AEC loop.
        if agent == self._last.get("toPlay") and not self._last.get("done"):
            mask[np.asarray(self._last["mask"], dtype=np.int64)] = 1
        return {
            "observation": np.asarray(self._last["obs"], dtype=np.float32),
            "action_mask": mask,
        }

    def action_mask(self, agent: str | None = None) -> np.ndarray:
        return self.observe(agent or self.agent_selection)["action_mask"]

    def step(self, action: int | None) -> None:
        if (
            self.terminations[self.agent_selection]
            or self.truncations[self.agent_selection]
        ):
            self._was_dead_step(action)
            return

        # Only a dead step, handled above, may pass `None` in the AEC contract.
        if action is None:
            raise ValueError("step() needs an action index outside a dead step")

        self._last = self._bridge.step(self._env_id, int(action))
        # AEC accumulates into `_cumulative_rewards`; reset per-step rewards so a
        # non-terminal step does not re-award the previous terminal payoff.
        self.rewards = {agent: 0.0 for agent in self.agents}

        if self._last["done"]:
            winner = self._last.get("winner")
            if winner is None:
                # Truncated at the step cap, or a draw. Scoring this as a loss
                # for both would teach the policy to stall; zero is the honest
                # value for "no result".
                payoff = {"p1": 0.0, "p2": 0.0}
            else:
                loser = "p2" if winner == "p1" else "p1"
                payoff = {winner: 1.0, loser: -1.0}
            self.rewards = payoff
            self.terminations = {agent: True for agent in self.agents}
            self.truncations = {
                agent: bool(self._last.get("truncated")) for agent in self.agents
            }
            self.infos = {
                agent: {
                    "winner": winner,
                    "result_reason": self._last.get("resultReason"),
                    "turns": self._last.get("turn"),
                    "oov_actions": self._last.get("oov", 0),
                }
                for agent in self.agents
            }
        else:
            self.agent_selection = self._last["toPlay"]

        self._accumulate_rewards()

    def close(self) -> None:
        self._bridge.close_env(self._env_id)


def env(**kwargs: Any) -> OptcgAECEnv:
    return OptcgAECEnv(**kwargs)
