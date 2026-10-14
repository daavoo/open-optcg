"""MaskablePPO with a KL penalty towards a slowly moving copy of itself.

The regularisation from magnetic mirror descent (Sokota et al.), in the form
that drops into PPO: on top of the clipped surrogate, penalise the KL from the
current policy to a "magnet" policy that trails it as an exponential moving
average of its weights. R-NaD (DeepNash) is the same idea with a periodically
reset reference. The finding behind it -- over thousands of runs, regularised
policy gradient is competitive with the CFR- and fictitious-play-based deep RL
methods in hidden-information games, and plain PPO is not far behind -- is
what `docs/ai-roadmap.md` cites for keeping PPO as the base.

Why it matters here specifically: the Block and Counter steps are the part of
this game that is a game of bluff, and an unregularised self-play policy is
most likely to cycle there. The magnet damps that without changing the
optimum the way a dense reward would.

`magnet_coef=0` recovers MaskablePPO exactly; the magnet is then never
consulted.

`train()` is a copy of `MaskablePPO.train` from sb3-contrib 2.9 with the KL
term added, because the base method offers no hook between the surrogate loss
and the optimiser step. Keep it in step with the upstream version when
upgrading.
"""

from __future__ import annotations

import copy
from typing import Any

import numpy as np
import torch as th
from gymnasium import spaces
from sb3_contrib import MaskablePPO
from stable_baselines3.common.utils import explained_variance
from torch.distributions import kl_divergence
from torch.nn import functional as F


class MagnetMaskablePPO(MaskablePPO):
    def __init__(
        self,
        *args: Any,
        magnet_coef: float = 0.0,
        magnet_tau: float = 0.05,
        **kwargs: Any,
    ) -> None:
        self.magnet_coef = magnet_coef
        self.magnet_tau = magnet_tau
        super().__init__(*args, **kwargs)

    def _setup_model(self) -> None:
        super()._setup_model()
        # A deep copy at setup, re-synced from the live policy before the first
        # update: `load()` calls `_setup_model()` before it restores the saved
        # weights, so a copy taken here would be a magnet on random init.
        self.magnet = copy.deepcopy(self.policy)
        for parameter in self.magnet.parameters():
            parameter.requires_grad_(False)
        self._magnet_synced = False

    def _excluded_save_params(self) -> list[str]:
        return [*super()._excluded_save_params(), "magnet", "_magnet_synced"]

    def _sync_magnet(self) -> None:
        self.magnet.load_state_dict(self.policy.state_dict())
        self.magnet.eval()
        self._magnet_synced = True

    def _update_magnet(self) -> None:
        with th.no_grad():
            for target, source in zip(
                self.magnet.parameters(), self.policy.parameters(), strict=True
            ):
                target.mul_(1.0 - self.magnet_tau).add_(source, alpha=self.magnet_tau)

    def train(self) -> None:
        if not self._magnet_synced:
            self._sync_magnet()
        self.policy.set_training_mode(True)
        self._update_learning_rate(self.policy.optimizer)
        clip_range = self.clip_range(self._current_progress_remaining)
        if self.clip_range_vf is not None:
            clip_range_vf = self.clip_range_vf(self._current_progress_remaining)

        entropy_losses = []
        pg_losses, value_losses, magnet_kls = [], [], []
        clip_fractions = []
        continue_training = True
        approx_kl_divs: list[float] = []
        loss = th.zeros(())

        for epoch in range(self.n_epochs):
            approx_kl_divs = []
            for rollout_data in self.rollout_buffer.get(self.batch_size):
                actions = rollout_data.actions
                if isinstance(self.action_space, spaces.Discrete):
                    actions = rollout_data.actions.long().flatten()

                if self.magnet_coef > 0:
                    # One actor forward serves the surrogate and the KL term:
                    # `evaluate_actions` would compute the same distribution
                    # and throw it away.
                    current = self.policy.get_distribution(
                        rollout_data.observations,
                        action_masks=rollout_data.action_masks,
                    )
                    values = self.policy.predict_values(rollout_data.observations)
                    log_prob = current.log_prob(actions)
                    entropy = current.entropy()
                else:
                    current = None
                    values, log_prob, entropy = self.policy.evaluate_actions(
                        rollout_data.observations,
                        actions,
                        action_masks=rollout_data.action_masks,
                    )
                values = values.flatten()
                advantages = rollout_data.advantages
                if self.normalize_advantage:
                    advantages = (advantages - advantages.mean()) / (
                        advantages.std() + 1e-8
                    )

                ratio = th.exp(log_prob - rollout_data.old_log_prob)
                policy_loss_1 = advantages * ratio
                policy_loss_2 = advantages * th.clamp(
                    ratio, 1 - clip_range, 1 + clip_range
                )
                policy_loss = -th.min(policy_loss_1, policy_loss_2).mean()
                pg_losses.append(policy_loss.item())
                clip_fraction = th.mean((th.abs(ratio - 1) > clip_range).float()).item()
                clip_fractions.append(clip_fraction)

                if self.clip_range_vf is None:
                    values_pred = values
                else:
                    values_pred = rollout_data.old_values + th.clamp(
                        values - rollout_data.old_values, -clip_range_vf, clip_range_vf
                    )
                value_loss = F.mse_loss(rollout_data.returns, values_pred)
                value_losses.append(value_loss.item())

                if entropy is None:
                    entropy_loss = -th.mean(-log_prob)
                else:
                    entropy_loss = -th.mean(entropy)
                entropy_losses.append(entropy_loss.item())

                loss = (
                    policy_loss
                    + self.ent_coef * entropy_loss
                    + self.vf_coef * value_loss
                )

                if current is not None:
                    # KL(pi || magnet) over the legal actions of each position.
                    # Both distributions carry the same mask, so a masked slot
                    # has zero probability under both and contributes nothing.
                    with th.no_grad():
                        reference = self.magnet.get_distribution(
                            rollout_data.observations,
                            action_masks=rollout_data.action_masks,
                        )
                    magnet_kl = kl_divergence(
                        current.distribution, reference.distribution
                    ).mean()
                    magnet_kls.append(magnet_kl.item())
                    loss = loss + self.magnet_coef * magnet_kl

                with th.no_grad():
                    log_ratio = log_prob - rollout_data.old_log_prob
                    approx_kl_div = (
                        th.mean((th.exp(log_ratio) - 1) - log_ratio).cpu().numpy()
                    )
                    approx_kl_divs.append(float(approx_kl_div))

                if self.target_kl is not None and approx_kl_div > 1.5 * self.target_kl:
                    continue_training = False
                    if self.verbose >= 1:
                        print(
                            f"Early stopping at step {epoch} due to reaching max kl: "
                            f"{approx_kl_div:.2f}"
                        )
                    break

                self.policy.optimizer.zero_grad()
                loss.backward()
                th.nn.utils.clip_grad_norm_(
                    self.policy.parameters(), self.max_grad_norm
                )
                self.policy.optimizer.step()

            self._n_updates += 1
            if not continue_training:
                break

        if self.magnet_coef > 0:
            self._update_magnet()

        explained_var = explained_variance(
            self.rollout_buffer.values.flatten(), self.rollout_buffer.returns.flatten()
        )
        self.logger.record("train/entropy_loss", np.mean(entropy_losses))
        self.logger.record("train/policy_gradient_loss", np.mean(pg_losses))
        self.logger.record("train/value_loss", np.mean(value_losses))
        self.logger.record("train/approx_kl", np.mean(approx_kl_divs))
        self.logger.record("train/clip_fraction", np.mean(clip_fractions))
        self.logger.record("train/loss", loss.item())
        self.logger.record("train/explained_variance", explained_var)
        if magnet_kls:
            self.logger.record("train/magnet_kl", np.mean(magnet_kls))
        self.logger.record("train/n_updates", self._n_updates, exclude="tensorboard")
        self.logger.record("train/clip_range", clip_range)
        if self.clip_range_vf is not None:
            self.logger.record("train/clip_range_vf", clip_range_vf)
