"""Pointer-style masked policy over a fixed-size candidate-action list.

The flat alternative scores every legal action as a class in a frozen ~2,044
table; the pointer policy instead scores the *actual legal actions* of the
current decision. The bridge already ships one feature row per legal action
(see `encode.ts` -- action-type one-hot, engine-computed combat arithmetic,
card one-hot), so the policy:

  * embeds the global observation (life, board, DON, hand/deck/trash bags,
    leader identity) into a context vector,
  * scores each of the K candidate slots with a *shared* slot MLP over
    (context, slot row),
  * softmaxes over the legal slots only, via the standard maskable
    distribution.

The observation layout is [global (G), row_0 (R), ..., row_{K-1} (R)] with the
rows zero-padded beyond the current legal count, and the action space is
Discrete(K): action k means "take the k-th legal action". The mask marks
k < len(legal), so the policy can never select a padded slot.

Why this is worth it over the flat table (measured in the repo):

  * legal actions per decision average ~3.7 and max 15 across all 36 ordered
    deck pairs, so a softmax over the legal list is a ~4-way decision, not a
    2,044-class one where 99.7% of logits are masked away;
  * new cards/decks produce new rows instead of new table keys -- no table
    regeneration, no OOV bucket, no 12% key-sharing ambiguity hack;
  * the ~143-way `resolve-effect` tail becomes a longer softmax rather than a
    sparsity problem.

It subclasses MaskableActorCriticPolicy and overrides the hooks that build the
logits (`forward`, `evaluate_actions`, `get_distribution`), so MaskablePPO's
rollout, masking, and training machinery apply unchanged.
"""

from __future__ import annotations

from functools import partial

import numpy as np
import torch as th
from gymnasium import spaces
from sb3_contrib.common.maskable.policies import MaskableActorCriticPolicy
from stable_baselines3.common.torch_layers import FlattenExtractor
from torch import nn


def _mlp(
    in_dim: int, widths: list[int], activation_fn, out: int | None = None
) -> nn.Sequential:
    layers: list[nn.Module] = []
    for width in widths:
        layers += [nn.Linear(in_dim, width), activation_fn()]
        in_dim = width
    if out is not None:
        layers.append(nn.Linear(in_dim, out))
    return nn.Sequential(*layers)


class CandidateActorCriticPolicy(MaskableActorCriticPolicy):
    """Actor-critic whose actor scores the K candidate-action rows."""

    def __init__(
        self,
        observation_space: spaces.Space,
        action_space: spaces.Space,
        lr_schedule,
        net_arch=None,
        activation_fn=nn.Tanh,
        ortho_init: bool = True,
        features_extractor_class=FlattenExtractor,
        features_extractor_kwargs=None,
        share_features_extractor: bool = True,
        normalize_images: bool = True,
        optimizer_class=th.optim.Adam,
        optimizer_kwargs=None,
        global_size: int = 849,
        row_size: int = 111,
        num_slots: int = 24,
        slot_hidden: int = 128,
    ):
        self.global_size = global_size
        self.row_size = row_size
        self.num_slots = num_slots
        self.slot_hidden = slot_hidden
        assert int(observation_space.shape[0]) == global_size + num_slots * row_size, (
            "observation must be global + num_slots candidate rows"
        )
        super().__init__(
            observation_space,
            action_space,
            lr_schedule,
            net_arch=net_arch,
            activation_fn=activation_fn,
            ortho_init=ortho_init,
            features_extractor_class=features_extractor_class,
            features_extractor_kwargs=features_extractor_kwargs,
            share_features_extractor=share_features_extractor,
            normalize_images=normalize_images,
            optimizer_class=optimizer_class,
            optimizer_kwargs=optimizer_kwargs,
        )
        assert int(action_space.n) == num_slots, (
            "action space must be Discrete(num_slots)"
        )

    def _build(self, lr_schedule) -> None:
        # Replace the base mlp_extractor/action_net with the pointer nets.
        arch = self.net_arch
        if isinstance(arch, list):
            arch = {"pi": arch, "vf": arch}
        pi = arch.get("pi", [256, 256])
        vf = arch.get("vf", [256, 256])

        self.context_net = _mlp(self.global_size, pi, self.activation_fn)
        self.slot_net = _mlp(
            pi[-1] + self.row_size, [self.slot_hidden], self.activation_fn, out=1
        )
        self.critic_net = _mlp(self.global_size, vf, self.activation_fn)
        self.value_net = nn.Linear(vf[-1], 1)

        if self.ortho_init:
            module_gains = {
                self.context_net: np.sqrt(2),
                self.slot_net: np.sqrt(2),
                self.critic_net: np.sqrt(2),
                self.value_net: 1,
            }
            for module, gain in module_gains.items():
                module.apply(partial(self.init_weights, gain=gain))

        self.optimizer = self.optimizer_class(
            self.parameters(),
            lr=lr_schedule(1),
            **self.optimizer_kwargs,
        )

    def _split(self, features: th.Tensor) -> tuple[th.Tensor, th.Tensor]:
        """features: (B, G + K*R) -> global (B, G), rows (B, K, R)."""
        global_part = features[:, : self.global_size]
        rows = features[:, self.global_size :].reshape(
            -1, self.num_slots, self.row_size
        )
        return global_part, rows

    def _action_logits(self, global_part: th.Tensor, rows: th.Tensor) -> th.Tensor:
        context = self.context_net(global_part)  # (B, H)
        ctx = context.unsqueeze(1).expand(-1, self.num_slots, -1)  # (B, K, H)
        scores = self.slot_net(th.cat([ctx, rows], dim=-1)).squeeze(-1)  # (B, K)
        return scores

    def _distribution(self, logits: th.Tensor, action_masks=None):
        dist = self.action_dist.proba_distribution(action_logits=logits)
        if action_masks is not None:
            dist.apply_masking(action_masks)
        return dist

    def forward(self, obs, deterministic: bool = False, action_masks=None):
        features = self.extract_features(obs)
        global_part, rows = self._split(features)
        dist = self._distribution(self._action_logits(global_part, rows), action_masks)
        actions = dist.get_actions(deterministic=deterministic)
        log_prob = dist.log_prob(actions)
        values = self.value_net(self.critic_net(global_part))
        actions = actions.reshape((-1, *self.action_space.shape))
        return actions, values, log_prob

    def evaluate_actions(self, obs, actions, action_masks=None):
        features = self.extract_features(obs)
        global_part, rows = self._split(features)
        dist = self._distribution(self._action_logits(global_part, rows), action_masks)
        log_prob = dist.log_prob(actions)
        values = self.value_net(self.critic_net(global_part))
        return values, log_prob, dist.entropy()

    def get_distribution(self, obs, action_masks=None):
        features = self.extract_features(obs)
        global_part, rows = self._split(features)
        return self._distribution(self._action_logits(global_part, rows), action_masks)

    def predict_values(self, obs) -> th.Tensor:
        features = self.extract_features(obs)
        global_part, _ = self._split(features)
        return self.value_net(self.critic_net(global_part))

    def _get_constructor_parameters(self) -> dict:
        data = super()._get_constructor_parameters()
        data.update(
            dict(
                global_size=self.global_size,
                row_size=self.row_size,
                num_slots=self.num_slots,
                slot_hidden=self.slot_hidden,
            )
        )
        return data
