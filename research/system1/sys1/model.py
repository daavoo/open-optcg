"""A ModernBERT/Ettin encoder in MLX, and the System-1 scorer built on it.

Written out rather than taken from a library because the scorer needs two
things stock encoders do not expose: per-token position ids (each action's
positions restart where the state ends, so an action is read the same way
wherever it sits in the list) and an arbitrary attention mask (an action sees
the state and itself, never another action). Together they make the score of
an action a function of (state, action) alone -- reordering the legal list
cannot change any probability -- and they let a whole decision be scored in
one forward pass.

The weights load directly from the Hugging Face `ModernBertForMaskedLM`
checkpoints (`jhu-clsp/ettin-encoder-*`); `parity.py` checks the forward pass
against the reference implementation.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
from huggingface_hub import snapshot_download

from .features import CardFeatures
from .text import CARD_SLOT


@dataclass
class Config:
    vocab_size: int
    hidden_size: int
    num_hidden_layers: int
    num_attention_heads: int
    intermediate_size: int
    global_attn_every_n_layers: int
    local_attention: int
    global_rope_theta: float
    local_rope_theta: float
    norm_eps: float

    @classmethod
    def from_json(cls, path: Path) -> "Config":
        raw = json.loads(path.read_text())
        return cls(**{field: raw[field] for field in cls.__dataclass_fields__})


def rope_tables(positions: mx.array, dim: int, theta: float) -> tuple[mx.array, mx.array]:
    """cos/sin for arbitrary per-token positions, shape (B, 1, L, dim)."""
    inv = 1.0 / (theta ** (mx.arange(0, dim, 2, dtype=mx.float32) / dim))
    freqs = positions[..., None].astype(mx.float32) * inv  # (B, L, dim/2)
    emb = mx.concatenate([freqs, freqs], axis=-1)[:, None]
    return mx.cos(emb), mx.sin(emb)


def apply_rope(x: mx.array, cos: mx.array, sin: mx.array) -> mx.array:
    half = x.shape[-1] // 2
    rotated = mx.concatenate([-x[..., half:], x[..., :half]], axis=-1)
    return (x * cos + rotated * sin).astype(x.dtype)


class Attention(nn.Module):
    def __init__(self, config: Config):
        super().__init__()
        self.heads = config.num_attention_heads
        self.head_dim = config.hidden_size // self.heads
        self.Wqkv = nn.Linear(config.hidden_size, 3 * config.hidden_size, bias=False)
        self.Wo = nn.Linear(config.hidden_size, config.hidden_size, bias=False)

    def __call__(self, x, cos, sin, mask):
        B, L, _ = x.shape
        qkv = self.Wqkv(x).reshape(B, L, 3, self.heads, self.head_dim)
        q, k, v = (qkv[:, :, i].transpose(0, 2, 1, 3) for i in range(3))
        q, k = apply_rope(q, cos, sin), apply_rope(k, cos, sin)
        out = mx.fast.scaled_dot_product_attention(
            q, k, v, scale=self.head_dim**-0.5, mask=mask
        )
        return self.Wo(out.transpose(0, 2, 1, 3).reshape(B, L, -1))


class MLP(nn.Module):
    def __init__(self, config: Config):
        super().__init__()
        self.Wi = nn.Linear(config.hidden_size, 2 * config.intermediate_size, bias=False)
        self.Wo = nn.Linear(config.intermediate_size, config.hidden_size, bias=False)

    def __call__(self, x):
        value, gate = mx.split(self.Wi(x), 2, axis=-1)
        return self.Wo(nn.gelu(value) * gate)


class Layer(nn.Module):
    def __init__(self, config: Config, index: int):
        super().__init__()
        self.is_global = index % config.global_attn_every_n_layers == 0
        # ModernBERT's first layer reads the embedding norm's output directly.
        self.attn_norm = (
            None if index == 0 else nn.LayerNorm(config.hidden_size, config.norm_eps, bias=False)
        )
        self.attn = Attention(config)
        self.mlp_norm = nn.LayerNorm(config.hidden_size, config.norm_eps, bias=False)
        self.mlp = MLP(config)

    def __call__(self, x, rope_global, rope_local, mask_global, mask_local):
        cos, sin = rope_global if self.is_global else rope_local
        mask = mask_global if self.is_global else mask_local
        h = x if self.attn_norm is None else self.attn_norm(x)
        x = x + self.attn(h, cos, sin, mask)
        return x + self.mlp(self.mlp_norm(x))


class Embeddings(nn.Module):
    def __init__(self, config: Config):
        super().__init__()
        self.tok_embeddings = nn.Embedding(config.vocab_size, config.hidden_size)
        self.norm = nn.LayerNorm(config.hidden_size, config.norm_eps, bias=False)


class Encoder(nn.Module):
    def __init__(self, config: Config):
        super().__init__()
        self.config = config
        self.embeddings = Embeddings(config)
        self.layers = [Layer(config, i) for i in range(config.num_hidden_layers)]
        self.final_norm = nn.LayerNorm(config.hidden_size, config.norm_eps, bias=False)

    def __call__(self, embeds: mx.array, positions: mx.array, allowed: mx.array) -> mx.array:
        """`embeds` (B, L, H) before the embedding norm; `allowed` (B, L, L) bool."""
        c = self.config
        head_dim = c.hidden_size // c.num_attention_heads
        rope_global = rope_tables(positions, head_dim, c.global_rope_theta)
        rope_local = (
            rope_global
            if c.local_rope_theta == c.global_rope_theta
            else rope_tables(positions, head_dim, c.local_rope_theta)
        )
        window = c.local_attention // 2
        distance = mx.abs(positions[:, :, None] - positions[:, None, :])
        local = mx.logical_and(allowed, distance <= window)
        neg = mx.array(-1e9 if embeds.dtype == mx.float32 else -3e4, dtype=embeds.dtype)
        zero = mx.array(0, dtype=embeds.dtype)
        mask_global = mx.where(allowed, zero, neg)[:, None]
        mask_local = mx.where(local, zero, neg)[:, None]
        x = self.embeddings.norm(embeds)
        for layer in self.layers:
            x = layer(x, rope_global, rope_local, mask_global, mask_local)
        return self.final_norm(x)


CACHE = Path(__file__).resolve().parent.parent / "checkpoints" / "base"


def base_weights(repo: str) -> tuple[Config, Path]:
    """The checkpoint's config and an MLX-loadable copy of its weights.

    The Ettin repos publish only `pytorch_model.bin`, which MLX cannot read,
    so it is converted to safetensors once and kept under the gitignored
    checkpoints directory. Needs torch for that one conversion.
    """
    root = Path(snapshot_download(repo, allow_patterns=["*.json", "*.safetensors", "*.bin"]))
    config = Config.from_json(root / "config.json")
    published = sorted(root.glob("*.safetensors"))
    if published:
        return config, published[0]
    converted = CACHE / f"{repo.replace('/', '--')}.safetensors"
    if not converted.exists():
        import numpy as np
        import torch

        state = torch.load(root / "pytorch_model.bin", map_location="cpu", weights_only=True)
        converted.parent.mkdir(parents=True, exist_ok=True)
        mx.save_safetensors(
            str(converted),
            {name: mx.array(tensor.float().numpy().astype(np.float32)) for name, tensor in state.items()},
        )
    return config, converted


def load_encoder(repo: str, dtype=mx.bfloat16) -> Encoder:
    config, path = base_weights(repo)
    encoder = Encoder(config)
    weights = [
        (name[len("model.") :], value)
        for name, value in mx.load(str(path)).items()
        if name.startswith("model.")
    ]
    encoder.load_weights(weights, strict=True)
    encoder.set_dtype(dtype)
    return encoder


class Scorer(nn.Module):
    """Scores every legal action of a decision in one pass, plus a state value.

    Cards enter as vectors written into the CARD_SLOT positions. A card's
    vector is its text encoding -- the same backbone reading its facts and
    printed words, mean-pooled -- projected, plus a learned per-card
    embedding that starts at zero. The text encodings are computed without
    gradient and refreshed every so often (`encode_cards`), because encoding
    every card in a batch on every step costs more tokens than the batch
    itself; the per-card embedding is what lets game experience reach a card
    directly in between.
    """

    def __init__(
        self, encoder: Encoder, card_count: int, features: CardFeatures | None = None, privileged: int = 0
    ):
        super().__init__()
        h = encoder.config.hidden_size
        self.encoder = encoder
        self.card_proj = nn.Linear(h, h)
        self.card_embed = nn.Embedding(card_count, h)
        self.card_embed.weight = mx.zeros_like(self.card_embed.weight)
        self.card_features = features
        if features is not None:
            # Row 0 matches no card (`CardFeatures.hot` column 0 is always 0).
            self.feature_embed = nn.Embedding(len(features.vocab) + 1, h)
            self.feature_embed.weight = mx.zeros_like(self.feature_embed.weight)
            self.number_mlp = nn.Sequential(nn.Linear(features.numbers.shape[1], h), nn.GELU(), nn.Linear(h, h))
            last = self.number_mlp.layers[2]
            last.weight = mx.zeros_like(last.weight)
            last.bias = mx.zeros_like(last.bias)
        self.policy = nn.Sequential(nn.Linear(h, h), nn.GELU(), nn.Linear(h, 1))
        self.value = nn.Sequential(nn.Linear(h, h), nn.GELU(), nn.Linear(h, 1))
        if privileged:
            # The critic's view of the whole state (`bridge/privileged.ts`),
            # added to the value head's pre-activation. Its last layer starts
            # at zero, so a checkpoint gaining it values every position as it
            # did and learns only the correction the hidden zones buy.
            self.critic = nn.Sequential(nn.Linear(h + privileged, h), nn.GELU(), nn.Linear(h, 1))
            last = self.critic.layers[2]
            last.weight = mx.zeros_like(last.weight)
            last.bias = mx.zeros_like(last.bias)

    def shared_cards(self) -> mx.array | None:
        """Every card's structured-feature vector, (N, H), or None without them."""
        f = self.card_features
        if f is None:
            return None
        weight = self.feature_embed.weight
        tokens = f.hot.astype(weight.dtype) @ weight
        return tokens + self.number_mlp(f.numbers.astype(weight.dtype))

    def encode_cards(self, card_batches) -> mx.array:
        """Mean-pooled text encodings of every card, (N, H), without gradient."""
        pooled = []
        for batch in card_batches:
            embeds = self.encoder.embeddings.tok_embeddings(batch["ids"])
            hidden = self.encoder(embeds, batch["positions"], batch["allowed"])
            lengths = batch["lengths"]
            keep = (mx.arange(batch["ids"].shape[1])[None] < lengths[:, None]).astype(hidden.dtype)
            pooled.append((hidden * keep[..., None]).sum(axis=1) / lengths[:, None].astype(hidden.dtype))
            mx.eval(pooled[-1])
        return mx.stop_gradient(mx.concatenate(pooled))

    def __call__(self, batch: dict, card_text: mx.array, detach_value: bool = False):
        """Logits (B, K) over the padded options, and values (B,).

        `detach_value` stops the value loss at the value head, so it cannot
        move the backbone the policy reads -- used in PPO, where a
        behaviour-cloned backbone is being fine-tuned by the policy gradient.

        `batch` holds the packed decision tensors from `data.collate`:
        ids/positions/allowed as for the encoder, `slot_card` (B, L) naming the
        card row behind every CARD_SLOT token, `pool` (B, K, L) mean-pooling
        weights per option, and `state_pool` (B, L) for the value head. With
        `privileged` (B, P) and a critic, the value also reads the whole state;
        the logits never do.
        """
        ids = batch["ids"]
        embeds = self.encoder.embeddings.tok_embeddings(ids)
        rows = batch["slot_card"]
        learned = self.card_embed(rows)
        if "card_keep" in batch:
            # PPO with `--id-dropout` only: `card_keep` (B, cards) is 0 for a
            # card whose learned embedding is zeroed in that decision, so it
            # is read from its text alone and the text path keeps carrying
            # the cards the model will meet unseen.
            keep = mx.take_along_axis(batch["card_keep"], rows.astype(mx.int32), axis=1)
            learned = learned * keep[..., None].astype(learned.dtype)
        shared = self.shared_cards()
        if shared is not None:
            learned = learned + shared[rows]
        cards = self.card_proj(card_text[rows]) + learned
        embeds = mx.where((ids == CARD_SLOT)[..., None], cards.astype(embeds.dtype), embeds)
        hidden = self.encoder(embeds, batch["positions"], batch["allowed"])
        options = batch["pool"].astype(hidden.dtype) @ hidden  # (B, K, H)
        logits = self.policy(options).squeeze(-1).astype(mx.float32)
        logits = mx.where(batch["option_mask"], logits, -1e9)
        state = (batch["state_pool"].astype(hidden.dtype)[:, None] @ hidden).squeeze(1)
        if detach_value:
            state = mx.stop_gradient(state)
        value = self.value(state)
        if "privileged" in batch and "critic" in self:
            value = value + self.critic(mx.concatenate([state, batch["privileged"].astype(state.dtype)], axis=-1))
        values = mx.tanh(value.squeeze(-1).astype(mx.float32))
        return logits, values


class MixedPrecision:
    """bf16 compute with float32 master weights.

    The M5 GPU runs bf16 matmuls about 1.5x faster than float32, but a bf16
    weight has only 8 bits of mantissa: an Adam step of 1e-5 against a weight
    of 0.05 is below its resolution, so updates either vanish or land a whole
    ulp at a time. The optimizer therefore steps a float32 copy, and the bf16
    model is re-cast from it after every update.
    """

    def __init__(self, model: nn.Module):
        from mlx.utils import tree_map

        self.model = model
        # A dict mutated in place, so `mx.compile(inputs=..., outputs=...)`
        # sees the new master tree on every call, as it does optimizer.state.
        self.state = {"master": tree_map(lambda p: p.astype(mx.float32), model.trainable_parameters())}

    def apply(self, optimizer, grads) -> None:
        from mlx.utils import tree_map

        grads = tree_map(lambda g: g.astype(mx.float32), grads)
        self.state["master"] = optimizer.apply_gradients(grads, self.state["master"])
        self.model.update(tree_map(lambda p: p.astype(mx.bfloat16), self.state["master"]))
