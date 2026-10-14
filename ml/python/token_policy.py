"""Cards as tokens, actions as pointers: the stage-1 policy from
`docs/ai-roadmap.md`, with the stage-2 asymmetric critic.

The flat pointer policy in `candidate_policy.py` reads an 849-float bag-of-cards
vector and scores each legal action from a one-hot of the card it names. This
policy reads the position as a *set*: one token per card instance the viewer
can see, each embedded from an append-only card table plus the derived printed
facts (`cardFeatures` in `tokens.ts`) plus its live state, run through a small
transformer encoder. An action is scored from the encoded tokens it points at
-- attacker and target for an attack, the hand card for a play -- together with
the engine's combat arithmetic for that action.

Two properties this buys, both measured against the flat policy in the roadmap
gate rather than assumed:

  * A card the policy never trained on arrives with its facts filled and a
    fresh embedding row, so a new set is playable at reduced strength on day
    one instead of after a retrain. The card table is append-only, so old rows
    keep their meaning across sets.
  * The observation is the same width for a 90-card format and the whole
    1,122-card registry.

The critic is asymmetric: it encodes the public tokens *and* the privileged
tokens the bridge reads from the true state (opponent's hand, both Life stacks,
the next deck cards). Those never reach the actor -- `_split` hands the actor
the public tokens only, and `test/rl-tokens.test.ts` holds that the public
encoding is independent of the hidden zones -- so hidden information stays
enforced at play, where only the actor runs. What the critic gains is a value
target that knows whether the Counter is in hand.
"""

from __future__ import annotations

from functools import partial
from typing import Any

import numpy as np
import torch as th
from gymnasium import spaces
from sb3_contrib.common.maskable.policies import MaskableActorCriticPolicy
from stable_baselines3.common.torch_layers import FlattenExtractor
from torch import nn

from token_layout import (
    TOKEN_CARD,
    TOKEN_HEADER,
    TOKEN_OWNER,
    TOKEN_ZONE,
    ZONE_COUNT,
    TokenLayout,
)


class TokenEncoder(nn.Module):
    """Embeds a padded token set and runs it through a transformer encoder.

    Position 0 of the output is the global token, which doubles as the pooled
    summary of the position: attention lets it read every card, and reading it
    back is cheaper and less lossy than a mean over padded rows.
    """

    def __init__(
        self,
        layout: TokenLayout,
        card_embedding: nn.Embedding,
        card_features: th.Tensor,
        d_model: int,
        n_heads: int,
        n_layers: int,
    ) -> None:
        super().__init__()
        self.layout = layout
        self.card_embedding = card_embedding
        self.register_buffer("card_features", card_features, persistent=False)
        state_size = layout.token_wire_size - TOKEN_HEADER
        token_in = (
            ZONE_COUNT
            + 2
            + state_size
            + int(card_features.shape[1])
            + card_embedding.embedding_dim
        )
        self.token_proj = nn.Linear(token_in, d_model)
        self.global_proj = nn.Linear(layout.global_size, d_model)
        layer = nn.TransformerEncoderLayer(
            d_model,
            n_heads,
            dim_feedforward=2 * d_model,
            dropout=0.0,
            batch_first=True,
            norm_first=True,
        )
        self.encoder = nn.TransformerEncoder(
            layer, num_layers=n_layers, enable_nested_tensor=False
        )
        self.norm = nn.LayerNorm(d_model)

    def embed_tokens(self, rows: th.Tensor) -> th.Tensor:
        """(B, N, W) wire rows -> (B, N, d_model) before attention."""
        zone = rows[..., TOKEN_ZONE].long().clamp(0, ZONE_COUNT - 1)
        owner = rows[..., TOKEN_OWNER].long().clamp(0, 1)
        card = (
            rows[..., TOKEN_CARD]
            .long()
            .clamp(0, self.card_embedding.num_embeddings - 1)
        )
        state = rows[..., TOKEN_HEADER:]
        parts = [
            nn.functional.one_hot(zone, ZONE_COUNT).to(rows.dtype),
            nn.functional.one_hot(owner, 2).to(rows.dtype),
            state,
            self.card_features[card],
            self.card_embedding(card),
        ]
        return self.token_proj(th.cat(parts, dim=-1))

    def forward(
        self,
        global_part: th.Tensor,
        token_groups: list[tuple[th.Tensor, th.Tensor]],
    ) -> th.Tensor:
        """Encodes [global, *tokens] and returns (B, 1 + N, d_model).

        `token_groups` is a list of (rows (B, N_i, W), counts (B,)) so the
        critic can append the privileged tokens after the public ones without a
        second code path. Padded rows are masked out of attention.
        """
        batch = global_part.shape[0]
        embedded = [self.global_proj(global_part).unsqueeze(1)]
        keep = [th.ones(batch, 1, dtype=th.bool, device=global_part.device)]
        for rows, counts in token_groups:
            embedded.append(self.embed_tokens(rows))
            positions = th.arange(rows.shape[1], device=rows.device).unsqueeze(0)
            keep.append(positions < counts.long().unsqueeze(1))
        sequence = th.cat(embedded, dim=1)
        padding = ~th.cat(keep, dim=1)
        encoded = self.encoder(sequence, src_key_padding_mask=padding)
        return self.norm(encoded)


class TokenActorCriticPolicy(MaskableActorCriticPolicy):
    """Actor-critic over the token layout with a pointer head over legal actions."""

    def __init__(
        self,
        observation_space: spaces.Space,
        action_space: spaces.Space,
        lr_schedule: Any,
        net_arch: Any = None,
        activation_fn: type[nn.Module] = nn.Tanh,
        ortho_init: bool = True,
        features_extractor_class: type = FlattenExtractor,
        features_extractor_kwargs: dict[str, Any] | None = None,
        share_features_extractor: bool = True,
        normalize_images: bool = True,
        optimizer_class: type[th.optim.Optimizer] = th.optim.Adam,
        optimizer_kwargs: dict[str, Any] | None = None,
        *,
        layout: dict[str, int],
        card_feature_table: list[list[float]],
        card_table_fingerprint: str,
        d_model: int = 96,
        n_heads: int = 4,
        n_layers: int = 2,
        card_dim: int = 32,
        head_hidden: int = 128,
    ) -> None:
        self.layout = TokenLayout(**layout)
        self.layout_dict = dict(layout)
        self.card_feature_table = card_feature_table
        self.card_table_fingerprint = card_table_fingerprint
        self.d_model = d_model
        self.n_heads = n_heads
        self.n_layers = n_layers
        self.card_dim = card_dim
        self.head_hidden = head_hidden
        assert int(observation_space.shape[0]) == self.layout.size, (
            "observation must match the token layout"
        )
        assert int(action_space.n) == self.layout.num_slots, (
            "action space must be Discrete(num_slots)"
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

    def _build(self, lr_schedule: Any) -> None:
        card_features = th.as_tensor(
            np.asarray(self.card_feature_table, dtype=np.float32)
        )
        table_size = int(card_features.shape[0])
        # One embedding table shared by the actor's tokens, the critic's tokens
        # and the card an action names, so "this card" means the same thing in
        # all three places.
        self.card_embedding = nn.Embedding(table_size, self.card_dim, padding_idx=0)
        self.actor_encoder = TokenEncoder(
            self.layout,
            self.card_embedding,
            card_features,
            self.d_model,
            self.n_heads,
            self.n_layers,
        )
        self.critic_encoder = TokenEncoder(
            self.layout,
            self.card_embedding,
            card_features,
            self.d_model,
            self.n_heads,
            self.n_layers,
        )
        head_in = 3 * self.d_model + self.layout.action_feature_size + self.card_dim
        self.action_head = nn.Sequential(
            nn.Linear(head_in, self.head_hidden),
            nn.GELU(),
            nn.Linear(self.head_hidden, 1),
        )
        self.value_net = nn.Linear(self.d_model, 1)

        if self.ortho_init:
            # Transformers do not want orthogonal init; only the heads take it,
            # with the small output gain SB3 uses so the initial policy is near
            # uniform over the legal slots.
            self.action_head.apply(partial(self.init_weights, gain=np.sqrt(2)))
            nn.init.orthogonal_(self.action_head[-1].weight, gain=0.01)
            self.value_net.apply(partial(self.init_weights, gain=1))

        self.optimizer = self.optimizer_class(
            self.parameters(),
            lr=lr_schedule(1),
            **self.optimizer_kwargs,
        )

    # -- Splitting the flat observation --------------------------------------

    def _split(self, features: th.Tensor) -> dict[str, th.Tensor]:
        lay = self.layout
        batch = features.shape[0]
        return {
            "global": features[:, lay.off_global : lay.off_tokens],
            "tokens": features[:, lay.off_tokens : lay.off_token_count].reshape(
                batch, lay.max_tokens, lay.token_wire_size
            ),
            "token_count": features[:, lay.off_token_count],
            "actions": features[:, lay.off_actions : lay.off_action_refs].reshape(
                batch, lay.num_slots, lay.action_feature_size
            ),
            "action_refs": features[
                :, lay.off_action_refs : lay.off_action_cards
            ].reshape(batch, lay.num_slots, 2),
            "action_cards": features[:, lay.off_action_cards : lay.off_legal_count],
            "privileged": features[
                :, lay.off_privileged : lay.off_privileged_count
            ].reshape(batch, lay.max_privileged, lay.token_wire_size),
            "privileged_count": features[:, lay.off_privileged_count],
        }

    # -- Actor and critic ------------------------------------------------------

    def _action_logits(self, parts: dict[str, th.Tensor]) -> th.Tensor:
        encoded = self.actor_encoder(
            parts["global"], [(parts["tokens"], parts["token_count"])]
        )  # (B, 1 + T, d)
        pooled = encoded[:, 0]  # (B, d)
        # A ref of -1 means "no token"; +1 shifts every ref past the global
        # token at position 0, so -1 lands on the global token itself.
        refs = (parts["action_refs"].long() + 1).clamp(0, encoded.shape[1] - 1)
        slots = refs.shape[1]
        flat = encoded.unsqueeze(1).expand(-1, slots, -1, -1)  # (B, K, 1+T, d)
        subject = th.gather(
            flat, 2, refs[..., 0:1].unsqueeze(-1).expand(-1, -1, -1, encoded.shape[-1])
        ).squeeze(2)
        obj = th.gather(
            flat, 2, refs[..., 1:2].unsqueeze(-1).expand(-1, -1, -1, encoded.shape[-1])
        ).squeeze(2)
        cards = (
            parts["action_cards"]
            .long()
            .clamp(0, self.card_embedding.num_embeddings - 1)
        )
        head_in = th.cat(
            [
                pooled.unsqueeze(1).expand(-1, slots, -1),
                subject,
                obj,
                parts["actions"],
                self.card_embedding(cards),
            ],
            dim=-1,
        )
        return self.action_head(head_in).squeeze(-1)  # (B, K)

    def _values(self, parts: dict[str, th.Tensor]) -> th.Tensor:
        encoded = self.critic_encoder(
            parts["global"],
            [
                (parts["tokens"], parts["token_count"]),
                (parts["privileged"], parts["privileged_count"]),
            ],
        )
        return self.value_net(encoded[:, 0])

    def _distribution(self, logits: th.Tensor, action_masks: Any = None) -> Any:
        dist = self.action_dist.proba_distribution(action_logits=logits)
        if action_masks is not None:
            dist.apply_masking(action_masks)
        return dist

    def forward(
        self, obs: th.Tensor, deterministic: bool = False, action_masks: Any = None
    ) -> tuple[th.Tensor, th.Tensor, th.Tensor]:
        parts = self._split(self.extract_features(obs))
        dist = self._distribution(self._action_logits(parts), action_masks)
        actions = dist.get_actions(deterministic=deterministic)
        log_prob = dist.log_prob(actions)
        values = self._values(parts)
        actions = actions.reshape((-1, *self.action_space.shape))
        return actions, values, log_prob

    def evaluate_actions(
        self, obs: th.Tensor, actions: th.Tensor, action_masks: Any = None
    ) -> tuple[th.Tensor, th.Tensor, th.Tensor | None]:
        parts = self._split(self.extract_features(obs))
        dist = self._distribution(self._action_logits(parts), action_masks)
        return self._values(parts), dist.log_prob(actions), dist.entropy()

    def get_distribution(self, obs: th.Tensor, action_masks: Any = None) -> Any:
        parts = self._split(self.extract_features(obs))
        return self._distribution(self._action_logits(parts), action_masks)

    def predict_values(self, obs: th.Tensor) -> th.Tensor:
        return self._values(self._split(self.extract_features(obs)))

    def _get_constructor_parameters(self) -> dict[str, Any]:
        data = super()._get_constructor_parameters()
        data.update(
            layout=self.layout_dict,
            card_feature_table=self.card_feature_table,
            card_table_fingerprint=self.card_table_fingerprint,
            d_model=self.d_model,
            n_heads=self.n_heads,
            n_layers=self.n_layers,
            card_dim=self.card_dim,
            head_hidden=self.head_hidden,
        )
        return data
