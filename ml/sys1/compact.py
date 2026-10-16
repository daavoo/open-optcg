"""The small scorer: a few million parameters over the compact input.

    .venv/bin/python -m sys1.compact train data/distill-compact --teacher checkpoints/batch2-ppo/iter-0020 \\
        --out checkpoints/compact-bc

The text scorer reads ~220 BPE tokens a decision through a 17M encoder, which
caps training at a few hundred decisions a second -- far below what a policy
gradient whose noise scale is tens of thousands of decisions needs. This one
reads `bridge/compact.ts`'s encoding: a global token, a token per visible card
and a token per offered option, about 33 tokens of a few dozen numbers, through
four layers of width 256. Tokens carry no positions, so reordering the options
or the cards changes nothing; an option points at the card tokens it acts on.

A card's embedding starts from the text scorer's own vector for it (its text
projection, learned embedding and card features summed), so the student begins
knowing every card the teacher knew; it is trained from there.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from dataclasses import dataclass
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np
from mlx.utils import tree_flatten

DATA = Path(__file__).resolve().parent.parent / "data"

# Must match bridge/compact.ts.
COMPACT_VERSION = 4
ZONES = 28
# Version 2 appends zones after every version-1 token (bridge/compact.ts), so
# a model trained on the first 16 reads a version-2 decision with the rest
# dropped: `CompactPolicy` does that for an older checkpoint.
V1_ZONES = 16
# Version 3 appends four more: my-played, my-activated, my-attacker and
# my-don-returned, what the seat did so far this turn.
V2_ZONES = 24
# Where a version-2 start's zone table gets a version-3 zone's first row: the
# opponent-side zone counting the same kind of thing (op-played,
# op-activated, op-attacker), and none for my-don-returned (`load_widened`).
V3_ZONE_INIT = (13, 21, 18, None)
# my-unseen and op-unseen: each is summed into one token before the blocks
# rather than read as a token a card -- ~30 tokens a decision that would
# otherwise more than double what a forward pass costs.
POOLED_ZONES = (16, 17)

# What a player cannot see but can infer, from the bridge's privileged vector
# (bridge/privileged.ts: [turn, my turn, me x 33, op x 33]; a side's first 21
# are its hand, Life and top-5-of-deck summaries, 7 numbers each): the
# opponent's hand and Life, and my own Life and deck top. An auxiliary head
# predicts them (`compact_ppo --aux-hidden`); nothing that plays reads it.
HIDDEN_INDICES = (*range(35, 49), *range(9, 23))
AUX_DIM = len(HIDDEN_INDICES)
TYPES = 11
KINDS = 12
CARD_INDEX = 2  # [row, zone]
CARD_NUMBERS = 20
OPTION_INDEX = 5  # [type, kind, ptr1, ptr2, row]
# Version 4 appends what an optional costs, by amount (DON!! returned, hand
# cards trashed, DON!! rested), and one flag per payoff kind it buys
# (protocol `PAYOFF_KINDS`), after every version-3 option number: an older
# checkpoint reads a version-4 decision with them dropped (`CompactPolicy`),
# and starts a version-4 run with zero weight on them (`load_widened`).
V3_OPTION_NUMBERS = 28
PAYOFF_KINDS = 16
OPTION_NUMBERS = V3_OPTION_NUMBERS + 3 + PAYOFF_KINDS
# An option number that is a card row (a searched card's), not a quantity.
OPTION_ROW_COLUMN = 22
GLOBAL_NUMBERS = 35
# Version 3 appends each Leader's base power and whether its once-per-turn
# reaction is spent after every version-2 global number, so an older
# checkpoint reads a version-3 decision with them dropped (`CompactPolicy`),
# and starts a version-3 run with zero weight on them (`load_widened`).
V2_GLOBAL_NUMBERS = 31

# Steps of 8: a padded token costs as much as a real one, and most decisions
# hold ~24 cards and ~8 options. More shapes only means more compiled traces.
CARD_BUCKETS = tuple(range(8, 129, 8))
OPTION_BUCKETS = tuple(range(8, 129, 8))


def fit(n: int, sizes: tuple[int, ...]) -> int:
    for size in sizes:
        if n <= size:
            return size
    return int(math.ceil(n / 32) * 32)


@dataclass
class CompactCorpus:
    """Decisions back to back: `card_start`/`option_start` (n + 1) split the
    flat card and option rows. `probs` (sum of options) is the teacher's
    distribution when the corpus was distilled, `chosen` the move to learn
    otherwise."""

    glob: np.ndarray  # (n, GLOBAL_NUMBERS) float16
    card_idx: np.ndarray  # (C, 2) int16
    card_num: np.ndarray  # (C, CARD_NUMBERS) float16
    option_idx: np.ndarray  # (O, 6) int16: type, kind, ptr1, ptr2, row, searched row
    option_num: np.ndarray  # (O, OPTION_NUMBERS) float16
    card_start: np.ndarray
    option_start: np.ndarray
    probs: np.ndarray  # (O,) float32
    outcome: np.ndarray  # (n,) float32
    game: np.ndarray  # (n,) int64

    def __len__(self) -> int:
        return len(self.glob)

    @classmethod
    def from_records(cls, records: list[dict]) -> "CompactCorpus":
        cards = [np.asarray(r["compact"]["cards"], dtype=np.float32).reshape(-1, CARD_INDEX + CARD_NUMBERS) for r in records]
        options = [np.asarray(r["compact"]["options"], dtype=np.float32) for r in records]
        card_rows = np.concatenate(cards)
        option_rows = np.concatenate(options)
        searched = option_rows[:, OPTION_INDEX + OPTION_ROW_COLUMN : OPTION_INDEX + OPTION_ROW_COLUMN + 1]
        option_num = option_rows[:, OPTION_INDEX:].copy()
        option_num[:, OPTION_ROW_COLUMN] = 0
        return cls(
            glob=np.asarray([r["compact"]["global"] for r in records], dtype=np.float16),
            card_idx=card_rows[:, :CARD_INDEX].astype(np.int16),
            card_num=card_rows[:, CARD_INDEX:].astype(np.float16),
            option_idx=np.concatenate([option_rows[:, :OPTION_INDEX], searched], axis=1).astype(np.int16),
            option_num=option_num.astype(np.float16),
            card_start=np.concatenate([[0], np.cumsum([len(c) for c in cards])]).astype(np.int64),
            option_start=np.concatenate([[0], np.cumsum([len(o) for o in options])]).astype(np.int64),
            probs=np.concatenate([r.get("probs", np.zeros(len(o))) for r, o in zip(records, options)]).astype(np.float32),
            outcome=np.asarray([r.get("outcome", 0.0) for r in records], dtype=np.float32),
            game=np.asarray([r.get("game", 0) for r in records], dtype=np.int64),
        )

    def save(self, path: Path) -> None:
        np.savez(path, version=np.array(COMPACT_VERSION), **self.__dict__)

    @classmethod
    def load(cls, paths: list[Path]) -> "CompactCorpus":
        parts = [np.load(p) for p in paths]
        for p, part in zip(paths, parts):
            if int(part["version"]) != COMPACT_VERSION:
                raise SystemExit(f"{p} is compact version {int(part['version'])}, not {COMPACT_VERSION}")
        fields = [f for f in cls.__dataclass_fields__]
        merged = {}
        for f in fields:
            arrays = [part[f] for part in parts]
            if f in ("card_start", "option_start"):
                offset, pieces = 0, []
                for i, a in enumerate(arrays):
                    pieces.append(a[(0 if i == 0 else 1):] + offset)
                    offset += a[-1]
                merged[f] = np.concatenate(pieces)
            else:
                merged[f] = np.concatenate(arrays)
        return cls(**merged)

    def options(self, d: int) -> int:
        return int(self.option_start[d + 1] - self.option_start[d])


def size_order(corpus: "CompactCorpus", indices: np.ndarray) -> np.ndarray:
    """`indices` ordered so that neighbours pad to nearly the same shape.

    Grouped by option bucket first, then by card count: a batch cut from the
    result pads both of its axes to close to its rows' own sizes, where an
    order by the summed sizes leaves neither maximum tight.
    """
    cards = np.diff(corpus.card_start)[indices]
    options = np.diff(corpus.option_start)[indices]
    bucket = np.searchsorted(np.array(OPTION_BUCKETS), options)
    return indices[np.lexsort((cards, bucket))]


def collate(corpus: CompactCorpus, indices: np.ndarray, extras: dict[str, np.ndarray] | None = None) -> dict[str, mx.array]:
    """Padded tensors for `indices`: cards to a bucket of C, options to one of K."""
    B = len(indices)
    cs, os_ = corpus.card_start, corpus.option_start
    C = fit(int(max(cs[d + 1] - cs[d] for d in indices)), CARD_BUCKETS)
    K = fit(int(max(os_[d + 1] - os_[d] for d in indices)), OPTION_BUCKETS)
    card_idx = np.full((B, C, CARD_INDEX), -1, dtype=np.int32)
    card_num = np.zeros((B, C, CARD_NUMBERS), dtype=np.float32)
    card_mask = np.zeros((B, C), dtype=bool)
    option_idx = np.full((B, K, 6), -1, dtype=np.int32)
    option_num = np.zeros((B, K, corpus.option_num.shape[1]), dtype=np.float32)
    option_mask = np.zeros((B, K), dtype=bool)
    probs = np.zeros((B, K), dtype=np.float32)
    for b, d in enumerate(indices):
        c0, c1, o0, o1 = cs[d], cs[d + 1], os_[d], os_[d + 1]
        card_idx[b, : c1 - c0] = corpus.card_idx[c0:c1]
        card_num[b, : c1 - c0] = corpus.card_num[c0:c1]
        card_mask[b, : c1 - c0] = True
        option_idx[b, : o1 - o0] = corpus.option_idx[o0:o1]
        option_num[b, : o1 - o0] = corpus.option_num[o0:o1]
        option_mask[b, : o1 - o0] = True
        probs[b, : o1 - o0] = corpus.probs[o0:o1]
    batch = {
        "glob": mx.array(corpus.glob[indices].astype(np.float32)),
        "card_idx": mx.array(card_idx),
        "card_num": mx.array(card_num),
        "card_mask": mx.array(card_mask),
        "option_idx": mx.array(option_idx),
        "option_num": mx.array(option_num),
        "option_mask": mx.array(option_mask),
        "probs": mx.array(probs),
        "outcome": mx.array(corpus.outcome[indices]),
    }
    for name, values in (extras or {}).items():
        batch[name] = mx.array(values[indices])
    return batch


class Linear(nn.Linear):
    """`nn.Linear` in its input's dtype. The weights stay float32 -- the copy
    the optimizer steps and the checkpoint holds -- and are cast per call, so
    a bfloat16 forward pass trains float32 weights."""

    def __call__(self, x):
        weight = self.weight.astype(x.dtype)
        y = mx.addmm(self.bias.astype(x.dtype), x, weight.T) if "bias" in self else x @ weight.T
        if "lora_a" in self:
            y = y + ((x @ self.lora_a.astype(x.dtype).T) @ self.lora_b.astype(x.dtype).T) * self.lora_scale
        return y


def lora_target(name: str) -> bool:
    """The layers a deck adapter changes: every block and the two heads. The
    card table and the input projections stay shared, so an adapter plays the
    same cards the base model reads."""
    return name.startswith(("blocks.", "policy", "value"))


def add_lora(model: nn.Module, rank: int, alpha: float) -> list[str]:
    """Gives each target `Linear` a low-rank update, weight + (alpha / rank) *
    B @ A, B zero so the model starts as it was; freezes everything else. Returns
    the adapted layers' names."""
    model.freeze()
    names = []
    for name, module in model.named_modules():
        if isinstance(module, Linear) and lora_target(name):
            out, inp = module.weight.shape
            module.lora_a = mx.random.normal((rank, inp), key=mx.random.key(len(names))) * inp**-0.5
            module.lora_b = mx.zeros((out, rank))
            module.lora_scale = alpha / rank
            module.unfreeze(recurse=False, keys=["lora_a", "lora_b"])
            names.append(name)
    return names


def lora_layers(model: nn.Module) -> list[tuple[str, Linear]]:
    return [(name, m) for name, m in model.named_modules() if isinstance(m, Linear) and "lora_a" in m]


def merge_lora(model: nn.Module) -> None:
    """Folds each adapted layer's update into its weight and drops the
    factors, leaving the plain model the adapter and its base make together."""
    for _, m in lora_layers(model):
        m.weight = m.weight + m.lora_scale * (m.lora_b @ m.lora_a)
        m.pop("lora_a")
        m.pop("lora_b")


class LayerNorm(nn.LayerNorm):
    """`nn.LayerNorm` in its input's dtype; see `Linear`."""

    def __call__(self, x):
        return mx.fast.layer_norm(x, self.weight.astype(x.dtype), self.bias.astype(x.dtype), self.eps)


def mlp(inp: int, out: int) -> nn.Sequential:
    return nn.Sequential(Linear(inp, out), nn.GELU(), Linear(out, out))


class Block(nn.Module):
    def __init__(self, d: int, heads: int):
        super().__init__()
        self.heads = heads
        self.norm1 = LayerNorm(d)
        self.qkv = Linear(d, 3 * d)
        self.out = Linear(d, d)
        self.norm2 = LayerNorm(d)
        self.ff = nn.Sequential(Linear(d, 4 * d), nn.GELU(), Linear(4 * d, d))

    def __call__(self, x, mask):
        B, T, d = x.shape
        q, k, v = mx.split(self.qkv(self.norm1(x)).reshape(B, T, 3, self.heads, d // self.heads).transpose(2, 0, 3, 1, 4), 3)
        attended = mx.fast.scaled_dot_product_attention(
            q.squeeze(0), k.squeeze(0), v.squeeze(0), scale=(d // self.heads) ** -0.5, mask=mask
        )
        x = x + self.out(attended.transpose(0, 2, 1, 3).reshape(B, T, d))
        return x + self.ff(self.norm2(x))


class CompactScorer(nn.Module):
    """`compute` is the dtype of the blocks' activations. At this width the
    blocks are bound by moving activations rather than by their matmuls, so
    bfloat16 takes ~40% off a training step; the weights, the embeddings' sums
    and the heads stay float32. The web pack's forward pass is float32
    whatever this was."""

    def __init__(self, cards: int, d: int = 256, layers: int = 4, heads: int = 8, compute=mx.float32, zones: int = ZONES,
                 aux: int = 0, globs: int = GLOBAL_NUMBERS, opts: int = OPTION_NUMBERS):
        super().__init__()
        self.compute = compute
        # The last row is a card with no row: an unknown number.
        self.card = nn.Embedding(cards + 1, d)
        self.zone = nn.Embedding(zones, d)
        self.card_num = mlp(CARD_NUMBERS, d)
        self.glob = mlp(globs, d)
        self.type = nn.Embedding(TYPES, d)
        self.kind = nn.Embedding(KINDS, d)
        self.option_num = mlp(opts, d)
        self.option_card = Linear(d, d)
        self.searched_card = Linear(d, d)
        self.ptr1 = Linear(d, d)
        self.ptr2 = Linear(d, d)
        self.blocks = [Block(d, heads) for _ in range(layers)]
        self.norm = LayerNorm(d)
        self.policy = mlp(d, d)
        self.policy_out = Linear(d, 1)
        self.value = mlp(d, d)
        self.value_out = Linear(d, 1)
        self.unknown = cards
        self.aux = aux
        if aux:
            self.aux_head = mlp(d, d)
            self.aux_out = Linear(d, aux)
        self.pooled = zones > V1_ZONES
        if self.pooled:
            self.pool = Linear(d, d)

    def _card(self, rows):
        return self.card(mx.where(rows < 0, self.unknown, rows))

    def __call__(self, batch: dict, with_aux: bool = False):
        ci, oi = batch["card_idx"], batch["option_idx"]
        cards = self._card(ci[..., 0]) + self.zone(mx.maximum(ci[..., 1], 0)) + self.card_num(batch["card_num"])
        B, C, d = cards.shape

        def pointed(ptr):
            gathered = mx.take_along_axis(cards, mx.maximum(ptr, 0)[..., None].astype(mx.int32), axis=1)
            return gathered * (ptr >= 0)[..., None]

        has_row = (oi[..., 4] >= 0)[..., None]
        has_searched = (oi[..., 5] >= 0)[..., None]
        options = (
            self.type(mx.maximum(oi[..., 0], 0))
            + self.kind(mx.maximum(oi[..., 1], 0))
            + self.option_num(batch["option_num"])
            + self.ptr1(pointed(oi[..., 2]))
            + self.ptr2(pointed(oi[..., 3]))
            + self.option_card(self._card(oi[..., 4])) * has_row
            + self.searched_card(self._card(oi[..., 5])) * has_searched
        )
        glob = self.glob(batch["glob"])[:, None]
        card_keep = batch["card_mask"]
        pools, pool_keep = [], []
        if self.pooled:
            # Each pooled zone's cards become one token, their sum projected;
            # the cards themselves leave the sequence. The browser drops them
            # outright (compact-model.ts), which is the same thing.
            zone = ci[..., 1]
            for z in POOLED_ZONES:
                member = card_keep & (zone == z)
                pools.append(self.pool((cards * member[..., None]).sum(axis=1))[:, None])
                pool_keep.append(member.any(axis=1)[:, None])
                card_keep = card_keep & (zone != z)
        x = mx.concatenate([glob, cards, *pools, options], axis=1).astype(self.compute)
        keep = mx.concatenate([mx.ones((B, 1), dtype=mx.bool_), card_keep, *pool_keep, batch["option_mask"]], axis=1)
        mask = mx.where(keep, 0.0, -1e9)[:, None, None, :].astype(x.dtype)
        for block in self.blocks:
            x = block(x, mask)
        x = self.norm(x.astype(mx.float32))
        logits = self.policy_out(self.policy(x[:, 1 + C + len(pools) :])).squeeze(-1)
        logits = mx.where(batch["option_mask"], logits, -1e9)
        values = mx.tanh(self.value_out(self.value(x[:, 0])).squeeze(-1))
        if with_aux:
            return logits, values, self.aux_out(self.aux_head(x[:, 0]))
        return logits, values


def teacher_card_vectors(teacher: Path) -> np.ndarray:
    """Each card's input vector in the text scorer, (cards, hidden)."""
    from .policy import Policy

    policy = Policy(teacher)
    model = policy.model
    vectors = model.card_proj(policy.card_text) + model.card_embed.weight
    shared = model.shared_cards()
    if shared is not None:
        vectors = vectors + shared
    return np.array(vectors.astype(mx.float32))


def zones_of(config: dict) -> int:
    """The zone table a checkpoint was trained with: 16 before version 2, 24
    before version 3."""
    version = config.get("compact_version", 1)
    return config.get("zones", V1_ZONES if version == 1 else V2_ZONES if version == 2 else ZONES)


def globals_of(config: dict) -> int:
    """The global numbers a checkpoint was trained with: 31 before version 3."""
    return config.get("globals", V2_GLOBAL_NUMBERS if config.get("compact_version", 1) < 3 else GLOBAL_NUMBERS)


def options_of(config: dict) -> int:
    """The option numbers a checkpoint was trained with: 28 before version 4."""
    return config.get("options", V3_OPTION_NUMBERS if config.get("compact_version", 1) < 4 else OPTION_NUMBERS)


def known_options(decisions: list[dict], opts: int) -> list[dict]:
    """`decisions` with option numbers past `opts` dropped; they come after
    every earlier one."""
    if opts >= OPTION_NUMBERS:
        return decisions
    return [{**d, "compact": {**d["compact"], "options": np.asarray(d["compact"]["options"])[:, : OPTION_INDEX + opts]}}
            for d in decisions]


def known_globals(decisions: list[dict], globs: int) -> list[dict]:
    """`decisions` with global numbers past `globs` dropped; they come after
    every earlier one."""
    if globs >= GLOBAL_NUMBERS:
        return decisions
    return [{**d, "compact": {**d["compact"], "global": np.asarray(d["compact"]["global"])[:globs]}} for d in decisions]


def load_widened(model: "CompactScorer", path: Path, strict: bool = True) -> None:
    """`path`'s weights into `model`, widened from an older checkpoint's.

    The global and option input layers get zero columns for the numbers they
    never saw, so those change nothing until they train. The zone table gets a row for each
    version-3 zone, copied from the opponent-side zone counting the same thing
    (`V3_ZONE_INIT`). That start is not exact -- a version-3 decision carries
    tokens in those zones, and they join the sequence whatever their row says
    -- so the run's first evaluation is the version-2 model's on new input."""
    weights = dict(mx.load(str(path)))
    for key, layer in (("glob.layers.0.weight", model.glob.layers[0]), ("option_num.layers.0.weight", model.option_num.layers[0])):
        have, want = weights[key], layer.weight.shape
        if have.shape[1] < want[1]:
            weights[key] = mx.concatenate([have, mx.zeros((have.shape[0], want[1] - have.shape[1]), dtype=have.dtype)], axis=1)
    table = weights["zone.weight"]
    rows = model.zone.weight.shape[0]
    if table.shape[0] == V2_ZONES and rows == ZONES:
        extra = [table[source] if source is not None else mx.zeros_like(table[0]) for source in V3_ZONE_INIT]
        weights["zone.weight"] = mx.concatenate([table, mx.stack(extra)], axis=0)
    model.load_weights(list(weights.items()), strict=strict)


def known_zones(decisions: list[dict], zones: int) -> list[dict]:
    """`decisions` with card tokens in zones past `zones` dropped. They come
    after every earlier token, so the options' card pointers still hold."""
    if zones >= ZONES:
        return decisions
    out = []
    for d in decisions:
        cards = np.asarray(d["compact"]["cards"], dtype=np.float32).reshape(-1, CARD_INDEX + CARD_NUMBERS)
        options = np.asarray(d["compact"]["options"], dtype=np.float32).copy()
        # Before version 2 "no searched card" was row 0, not -1.
        if zones <= V1_ZONES:
            searched = options[:, OPTION_INDEX + OPTION_ROW_COLUMN]
            searched[searched < 0] = 0
        out.append({**d, "compact": {**d["compact"], "cards": cards[cards[:, 1] < zones], "options": options}})
    return out


class CompactPolicy:
    """`Policy`'s interface (`score`) over bridge decisions' `compact` field."""

    def __init__(self, checkpoint: Path):
        config = json.loads((checkpoint / "config.json").read_text())
        self.config = config
        self.render = None
        self.zones = zones_of(config)
        self.globs = globals_of(config)
        self.opts = options_of(config)
        self.model = CompactScorer(config["cards"], config["d"], config["layers"], config["heads"], zones=self.zones,
                                   aux=config.get("aux", 0), globs=self.globs, opts=self.opts)
        if config.get("lora"):
            add_lora(self.model, config["lora"]["rank"], config["lora"]["alpha"])
        self.model.load_weights(str(checkpoint / "weights.safetensors"))
        mx.eval(self.model.parameters())
        self._forward = mx.compile(lambda b: self.model(b), inputs=[self.model.state])

    def refresh(self) -> None:
        pass

    def score(self, decisions: list[dict], chunk: int = 128) -> tuple[list[np.ndarray], np.ndarray]:
        """Chunks of `chunk` in size order, so each pads close to its own
        decisions; each chunk's rows are padded to a multiple of 32 (repeats
        of its last row, dropped after) so the compiled forward pass sees a
        few batch shapes, not a new one every call."""
        corpus = CompactCorpus.from_records(
            known_options(known_globals(known_zones(decisions, self.zones), self.globs), self.opts))
        probs: list[np.ndarray] = [np.empty(0)] * len(decisions)
        values = np.zeros(len(decisions), dtype=np.float32)
        order = size_order(corpus, np.arange(len(decisions)))
        pending = []
        for start in range(0, len(order), chunk):
            group = order[start : start + chunk]
            rows = np.concatenate([group, np.repeat(group[-1:], -len(group) % 32)])
            logits, value = self._forward(collate(corpus, rows))
            pending.append((group, mx.softmax(logits, axis=-1), value))
        mx.eval([(p, v) for _, p, v in pending])
        for group, p, v in pending:
            p, v = np.array(p), np.array(v)
            for row, index in enumerate(group):
                probs[index] = p[row, : corpus.options(index)]
                values[index] = v[row]
        return probs, values


def is_compact(checkpoint: Path) -> bool:
    path = checkpoint / "config.json"
    return path.exists() and json.loads(path.read_text()).get("model") == "compact"


def distill_loss(model, batch, value_coef: float):
    logits, values = model(batch)
    logp = logits - mx.logsumexp(logits, axis=-1, keepdims=True)
    mask = batch["option_mask"]
    ce = -(batch["probs"] * mx.where(mask, logp, 0.0)).sum(axis=-1).mean()
    value = ((values - batch["outcome"]) ** 2).mean()
    agree = (mx.argmax(logits, axis=-1) == mx.argmax(batch["probs"], axis=-1)).mean()
    return ce + value_coef * value, (ce, value, agree)


def train(args) -> None:
    # Every batch shape leaves buffers in MLX's cache; uncapped it grew past
    # 40 GB over a v2 distillation and the machine swapped.
    mx.set_cache_limit(8 << 30)
    shards = sorted(Path(args.data).glob("shard-*.npz"))
    corpus = CompactCorpus.load(shards)
    games = np.unique(corpus.game)
    rng = np.random.default_rng(0)
    val_games = set(rng.choice(games, size=min(args.val_games, len(games) // 10), replace=False).tolist())
    is_val = np.array([g in val_games for g in corpus.game])
    train_idx, val_idx = np.flatnonzero(~is_val), np.flatnonzero(is_val)
    print(f"{len(train_idx)} train / {len(val_idx)} val decisions from {len(games)} games", flush=True)

    cards = len(json.loads((DATA / "cards.json").read_text()))
    model = CompactScorer(cards, args.d, args.layers, args.heads)
    if args.card_init:
        # A compact checkpoint's own card table: what it learned of every card.
        source = dict(mx.load(str(Path(args.card_init) / "weights.safetensors")))["card.weight"]
        if source.shape != model.card.weight.shape:
            raise SystemExit(f"--card-init's card table is {source.shape}, this model's {model.card.weight.shape}")
        model.card.weight = source
    if args.teacher:
        vectors = teacher_card_vectors(Path(args.teacher))
        if vectors.shape[1] != args.d:
            raise SystemExit(f"teacher card vectors are {vectors.shape[1]}-d; use --d {vectors.shape[1]}")
        weight = np.zeros((cards + 1, args.d), dtype=np.float32)
        weight[:cards] = vectors / max(np.linalg.norm(vectors, axis=1).mean(), 1e-6)
        model.card.weight = mx.array(weight)
    mx.eval(model.parameters())
    params = sum(v.size for _, v in tree_flatten(model.parameters()))
    print(f"{params / 1e6:.2f}M parameters", flush=True)

    steps = int(len(train_idx) * args.epochs / args.batch)
    schedule = optim.join_schedules(
        [optim.linear_schedule(1e-7, args.lr, args.warmup), optim.cosine_decay(args.lr, max(steps - args.warmup, 1), args.lr / 20)],
        [args.warmup],
    )
    optimizer = optim.AdamW(learning_rate=schedule, weight_decay=0.01)
    grad_fn = nn.value_and_grad(model, lambda m, b: distill_loss(m, b, args.value_coef))
    state = [model.state, optimizer.state]

    from functools import partial

    @partial(mx.compile, inputs=state, outputs=state)
    def step(batch):
        (loss, stats), grads = grad_fn(model, batch)
        grads, _ = optim.clip_grad_norm(grads, 1.0)
        optimizer.update(model, grads)
        return loss, stats

    def evaluate() -> dict:
        sums, n = np.zeros(3), 0
        for start in range(0, len(val_idx), 2048):
            group = val_idx[start : start + 2048]
            _, stats = distill_loss(model, collate(corpus, group), args.value_coef)
            sums += np.array([s.item() for s in stats]) * len(group)
            n += len(group)
        return dict(zip(["ce", "value_mse", "agreement"], (sums / n).tolist()))

    def save(out: Path) -> None:
        out.mkdir(parents=True, exist_ok=True)
        model.save_weights(str(out / "weights.safetensors"))
        (out / "config.json").write_text(json.dumps({
            "model": "compact", "compact_version": COMPACT_VERSION, "zones": ZONES, "globals": GLOBAL_NUMBERS,
            "options": OPTION_NUMBERS,
            "cards": cards,
            "card_init": args.card_init,
            "d": args.d, "layers": args.layers, "heads": args.heads, "teacher": args.teacher, "data": args.data,
        }))

    print("before training:", evaluate(), flush=True)
    t0 = time.perf_counter()
    order = rng.permutation(train_idx)
    cursor = 0
    for i in range(1, steps + 1):
        if cursor + args.batch > len(order):
            order, cursor = rng.permutation(train_idx), 0
        group = order[cursor : cursor + args.batch]
        cursor += args.batch
        loss, stats = step(collate(corpus, group))
        mx.eval(loss, stats)
        if i % 500 == 0:
            rate = i * args.batch / (time.perf_counter() - t0)
            print(f"step {i}/{steps} loss {loss.item():.4f} agree {stats[2].item():.3f} {rate:.0f} decisions/s", flush=True)
        if i % args.eval_every == 0:
            print("val", {**evaluate(), "step": i}, flush=True)
            save(Path(args.out) / f"step-{i:06d}")
    print("val", {**evaluate(), "step": steps}, flush=True)
    save(Path(args.out))
    print(f"saved {args.out}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train", help="distil a teacher's recorded games (sys1.distill --compact)")
    t.add_argument("data")
    t.add_argument("--out", required=True)
    t.add_argument("--teacher", help="a text-scorer checkpoint whose card vectors start the card table")
    t.add_argument("--card-init", help="a compact checkpoint whose card table starts this one's")
    t.add_argument("--d", type=int, default=256)
    t.add_argument("--layers", type=int, default=4)
    t.add_argument("--heads", type=int, default=8)
    t.add_argument("--epochs", type=float, default=3.0)
    t.add_argument("--batch", type=int, default=512)
    t.add_argument("--lr", type=float, default=3e-4)
    t.add_argument("--warmup", type=int, default=500)
    t.add_argument("--value-coef", type=float, default=0.5)
    t.add_argument("--val-games", type=int, default=600)
    t.add_argument("--eval-every", type=int, default=5000)
    args = parser.parse_args()
    if args.cmd == "train":
        train(args)


if __name__ == "__main__":
    main()
