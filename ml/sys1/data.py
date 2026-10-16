"""Tokenised decisions, and their packing into batches the scorer runs on.

A decision is packed as one sequence: `[CLS] state [SEP]` then every action's
tokens back to back. Each action's positions restart where the state ends and
its tokens attend only to the state and to themselves, so the scorer reads
each (state, action) pair independently while paying for the state once.

A corpus is held as flat arrays rather than Python objects -- uint16 token ids
and a parallel uint16 card-row array, one entry per token -- so millions of
decisions fit in a few GB and a shard tokenised once (`python -m sys1.data`)
loads in seconds.

Shapes are padded to a fixed set of buckets because `mx.compile` specialises
on shape: a batch's length is rounded up to one of LENGTHS, its option count to
one of OPTIONS, and its row count follows from the token budget, so a whole
training run compiles a few dozen step variants once each rather than one per
batch.
"""

from __future__ import annotations

import gzip
import json
import sys
import time
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator

import mlx.core as mx
import numpy as np

from .text import CARD_SLOT, CLS, PAD, PLACEHOLDER, SEP, card_text, load_card_table, tokenizer

LENGTHS = (128, 192, 256, 320, 384, 448, 512, 640, 768, 1024, 1536)
OPTIONS = (8, 16, 32, 64, 128)


# The render version this code reads: `RENDER_VERSION` in
# packages/agents/src/scorer/render.ts, which writes the text. A corpus must be
# in it; a checkpoint may be in any of `SUPPORTED_RENDERS`, which the bridge
# renders side by side (`env.VectorEnv`), so a model trained on an earlier
# version can still play, teach and be measured against. Anything else is
# refused.
RENDER_VERSION = 4
SUPPORTED_RENDERS = (4, 2)


def check_render(version: int, what: str, supported: tuple[int, ...] = (RENDER_VERSION,)) -> None:
    if int(version) not in supported:
        raise SystemExit(
            f"{what} is in render version {version}; only {' or '.join(map(str, supported))} is supported. "
            "Regenerate it (a corpus) or retrain it (a checkpoint)."
        )


def bucket(value: int, sizes: tuple[int, ...]) -> int:
    for size in sizes:
        if value <= size:
            return size
    raise ValueError(f"{value} exceeds the largest bucket {sizes[-1]}")


def _split(text: str) -> tuple[list[str], list[str]]:
    """Text pieces between placeholders, and the card numbers in order."""
    pieces, cards, cursor = [], [], 0
    for match in PLACEHOLDER.finditer(text):
        pieces.append(text[cursor : match.start()])
        cards.append(match.group(1))
        cursor = match.end()
    pieces.append(text[cursor:])
    return pieces, cards


def tokenize_texts(texts: list[str], card_rows: dict[str, int]) -> list[tuple[list[int], list[int]]]:
    """Token ids and card rows (0 off a slot) per text; placeholders become CARD_SLOT.

    Identical texts are tokenised once: action lines repeat heavily ("don to
    b1", "keep hand"), and the Rust tokenizer's batch call does the rest in
    parallel.
    """
    tok = tokenizer()
    unique = list(dict.fromkeys(texts))
    splits = [_split(text) for text in unique]
    flat = [piece for pieces, _ in splits for piece in pieces]
    encoded = tok.encode_batch(flat, add_special_tokens=False)
    table: dict[str, tuple[list[int], list[int]]] = {}
    cursor = 0
    for text, (pieces, cards) in zip(unique, splits):
        ids: list[int] = []
        rows: list[int] = []
        for index in range(len(pieces)):
            piece = encoded[cursor + index].ids
            ids.extend(piece)
            rows.extend([0] * len(piece))
            if index < len(cards):
                ids.append(CARD_SLOT)
                rows.append(card_rows[cards[index]])
        cursor += len(pieces)
        table[text] = (ids, rows)
    return [table[text] for text in texts]


def read_games(paths: Iterable[Path]) -> Iterator[dict]:
    for path in paths:
        with gzip.open(path, "rt") as handle:
            for line in handle:
                yield json.loads(line)


@dataclass
class Corpus:
    """Decisions as flat arrays.

    Segment `i` is `tokens[seg_start[i]:seg_start[i + 1]]`; decision `d` owns
    segments `first_seg[d]` (its state) through `first_seg[d] + options[d]`
    (its actions).
    """

    tokens: np.ndarray  # uint16
    rows: np.ndarray  # uint16, card row for a CARD_SLOT token
    seg_start: np.ndarray  # int64, one past the end as the last entry
    first_seg: np.ndarray  # int64
    options: np.ndarray  # int32
    chosen: np.ndarray  # int32
    outcome: np.ndarray  # float32: +1 the deciding seat won, -1 lost, 0 unfinished
    game: np.ndarray  # int32
    lengths: np.ndarray  # int32, packed sequence length incl. CLS/SEP
    render: np.ndarray  # int32 scalar: the render version the text was written in (RENDER_VERSION)

    def __len__(self) -> int:
        return len(self.chosen)

    @classmethod
    def from_records(cls, records: list[dict], card_rows: dict[str, int]) -> "Corpus":
        """Records carry `state`, `actions`, `chosen`, `outcome`, `game`."""
        texts: list[str] = []
        for r in records:
            texts.append(r["state"])
            texts.extend(r["actions"])
        encoded = tokenize_texts(texts, card_rows)
        seg_lengths = np.fromiter((len(ids) for ids, _ in encoded), dtype=np.int64, count=len(encoded))
        seg_start = np.zeros(len(encoded) + 1, dtype=np.int64)
        np.cumsum(seg_lengths, out=seg_start[1:])
        tokens = np.fromiter((t for ids, _ in encoded for t in ids), dtype=np.uint16, count=int(seg_start[-1]))
        rows = np.fromiter((r for _, rs in encoded for r in rs), dtype=np.uint16, count=int(seg_start[-1]))
        options = np.array([len(r["actions"]) for r in records], dtype=np.int32)
        first_seg = np.zeros(len(records), dtype=np.int64)
        np.cumsum(options[:-1] + 1, out=first_seg[1:])
        lengths = np.array(
            [seg_start[f + o + 1] - seg_start[f] + 2 for f, o in zip(first_seg, options)], dtype=np.int32
        )
        return cls(
            tokens=tokens,
            rows=rows,
            seg_start=seg_start,
            first_seg=first_seg,
            options=options,
            chosen=np.array([r["chosen"] for r in records], dtype=np.int32),
            outcome=np.array([r["outcome"] for r in records], dtype=np.float32),
            game=np.array([r["game"] for r in records], dtype=np.int32),
            lengths=lengths,
            render=np.array(RENDER_VERSION, dtype=np.int32),
        )

    @classmethod
    def from_token_records(cls, records: list[dict]) -> "Corpus":
        """Records whose `tokens` the bridge already produced (`decision-tokens.ts`):
        `{"state": [ids, rows], "actions": [[ids, rows], ...]}`, plus `chosen`,
        `outcome` and `game` as in `from_records`."""
        segments: list[list[int]] = []
        seg_rows: list[list[int]] = []
        for r in records:
            state_ids, state_rows = r["tokens"]["state"]
            segments.append(state_ids)
            seg_rows.append(state_rows)
            for ids, rows in r["tokens"]["actions"]:
                segments.append(ids)
                seg_rows.append(rows)
        seg_lengths = np.fromiter((len(s) for s in segments), dtype=np.int64, count=len(segments))
        seg_start = np.zeros(len(segments) + 1, dtype=np.int64)
        np.cumsum(seg_lengths, out=seg_start[1:])
        tokens = np.fromiter((t for s in segments for t in s), dtype=np.uint16, count=int(seg_start[-1]))
        rows = np.fromiter((t for s in seg_rows for t in s), dtype=np.uint16, count=int(seg_start[-1]))
        options = np.array([len(r["tokens"]["actions"]) for r in records], dtype=np.int32)
        first_seg = np.zeros(len(records), dtype=np.int64)
        np.cumsum(options[:-1] + 1, out=first_seg[1:])
        ends = seg_start[first_seg + options + 1]
        lengths = (ends - seg_start[first_seg] + 2).astype(np.int32)
        return cls(
            tokens=tokens,
            rows=rows,
            seg_start=seg_start,
            first_seg=first_seg,
            options=options,
            chosen=np.array([r["chosen"] for r in records], dtype=np.int32),
            outcome=np.array([r["outcome"] for r in records], dtype=np.float32),
            game=np.array([r["game"] for r in records], dtype=np.int32),
            lengths=lengths,
            render=np.array(RENDER_VERSION, dtype=np.int32),
        )

    @classmethod
    def from_games(cls, games: Iterable[dict], card_rows: dict[str, int]) -> "Corpus":
        records = []
        for game in games:
            check_render(game.get("render", 1), f"game {game['seed']}")
            winner = game["winner"]
            for d in game["decisions"]:
                records.append(
                    {
                        **d,
                        "outcome": 0.0 if winner is None else (1.0 if winner == d["seat"] else -1.0),
                        # Seeds are unique across corpora where game indices are not.
                        "game": zlib.crc32(game["seed"].encode()) & 0x7FFFFFFF,
                    }
                )
        return cls.from_records(records, card_rows)

    def save(self, path: Path) -> None:
        np.savez(path, **{field: getattr(self, field) for field in self.__dataclass_fields__})

    @classmethod
    def load(cls, paths: Iterable[Path]) -> "Corpus":
        paths = list(paths)
        parts = [np.load(p) for p in paths]
        for path, part in zip(paths, parts):
            # Shards tokenised before render versions existed are version 1.
            check_render(int(part["render"]) if "render" in part else 1, str(path))
        render = np.array(RENDER_VERSION, dtype=np.int32)
        if len(parts) == 1:
            return cls(
                **{f: parts[0][f] for f in cls.__dataclass_fields__ if f != "render"}, render=render
            )
        seg_offset = token_offset = 0
        pieces: dict[str, list[np.ndarray]] = {f: [] for f in cls.__dataclass_fields__ if f != "render"}
        for part in parts:
            for f in ("tokens", "rows", "options", "chosen", "outcome", "game", "lengths"):
                pieces[f].append(part[f])
            pieces["seg_start"].append(part["seg_start"][:-1] + token_offset)
            pieces["first_seg"].append(part["first_seg"] + seg_offset)
            token_offset += int(part["seg_start"][-1])
            seg_offset += len(part["seg_start"]) - 1
        pieces["seg_start"].append(np.array([token_offset], dtype=np.int64))
        return cls(**{f: np.concatenate(v) for f, v in pieces.items()}, render=render)

    def subset(self, mask: np.ndarray) -> np.ndarray:
        """Decision indices where `mask` holds; batches index the full arrays."""
        return np.nonzero(mask)[0]


class CardTexts:
    """Every card's tokenised input text, in a fixed row order.

    `rows` maps a card number to its row in the card-vector table the scorer
    reads; `chunks` yields the whole table as padded batches for
    `Scorer.encode_cards`.
    """

    def __init__(self, table: dict[str, dict], printed: dict[str, dict], max_len: int = 192):
        tok = tokenizer()
        self.numbers = sorted(table)
        self.rows = {n: i for i, n in enumerate(self.numbers)}
        encoded = tok.encode_batch([card_text(n, table[n], printed) for n in self.numbers])
        self.ids = [e.ids[:max_len] for e in encoded]

    def chunks(self, size: int = 128) -> Iterator[dict[str, mx.array]]:
        order = sorted(range(len(self.ids)), key=lambda i: len(self.ids[i]))
        pieces: list[tuple[int, dict]] = []
        for start in range(0, len(order), size):
            rows = order[start : start + size]
            width = -(-max(len(self.ids[r]) for r in rows) // 16) * 16
            ids = np.full((len(rows), width), PAD, dtype=np.int32)
            allowed = np.zeros((len(rows), width, width), dtype=bool)
            for i, r in enumerate(rows):
                ids[i, : len(self.ids[r])] = self.ids[r]
                allowed[i, : len(self.ids[r]), : len(self.ids[r])] = True
            pieces.append(
                (
                    start,
                    {
                        "ids": mx.array(ids),
                        "positions": mx.broadcast_to(mx.arange(width)[None], (len(rows), width)),
                        "allowed": mx.array(allowed),
                        "lengths": mx.array([len(self.ids[r]) for r in rows]),
                    },
                )
            )
        self.order = order
        for _, piece in pieces:
            yield piece

    def restore_order(self, encoded: mx.array) -> mx.array:
        """`encoded` rows come out length-sorted; put them back in row order."""
        inverse = np.empty(len(self.order), dtype=np.int32)
        inverse[np.asarray(self.order)] = np.arange(len(self.order))
        return encoded[mx.array(inverse)]


def collate(
    corpus: Corpus,
    indices: np.ndarray,
    rows: int | None = None,
    extras: dict[str, np.ndarray] | None = None,
) -> dict[str, mx.array]:
    """Packed decision tensors for `indices`, padded to `rows` decisions when given.

    `extras` are per-decision float arrays over the whole corpus (advantages,
    old log-probabilities, the critic's privileged features) carried into the
    batch under their own names; a row may be a vector.
    """
    B = rows or len(indices)
    L = bucket(int(corpus.lengths[indices].max()), LENGTHS)
    K = bucket(int(corpus.options[indices].max()), OPTIONS)
    ids = np.full((B, L), PAD, dtype=np.int32)
    positions = np.zeros((B, L), dtype=np.int32)
    segment = np.full((B, L), -1, dtype=np.int32)
    slot_card = np.zeros((B, L), dtype=np.int32)
    pool = np.zeros((B, K, L), dtype=np.float32)
    state_pool = np.zeros((B, L), dtype=np.float32)
    option_mask = np.zeros((B, K), dtype=bool)
    weight = np.zeros((B,), dtype=np.float32)
    seg_start = corpus.seg_start

    for row, d in enumerate(indices):
        first = int(corpus.first_seg[d])
        k_count = int(corpus.options[d])
        a, b = int(seg_start[first]), int(seg_start[first + 1])
        S = b - a + 2
        ids[row, 0] = CLS
        ids[row, 1 : S - 1] = corpus.tokens[a:b]
        ids[row, S - 1] = SEP
        slot_card[row, 1 : S - 1] = corpus.rows[a:b]
        positions[row, :S] = np.arange(S)
        segment[row, :S] = 0
        state_pool[row, :S] = 1.0 / S
        cursor = S
        for k in range(k_count):
            a, b = int(seg_start[first + 1 + k]), int(seg_start[first + 2 + k])
            n = b - a
            ids[row, cursor : cursor + n] = corpus.tokens[a:b]
            slot_card[row, cursor : cursor + n] = corpus.rows[a:b]
            positions[row, cursor : cursor + n] = S + np.arange(n)
            segment[row, cursor : cursor + n] = k + 1
            pool[row, k, cursor : cursor + n] = 1.0 / n
            cursor += n
        option_mask[row, :k_count] = True
        weight[row] = 1.0
    # Padding rows get one live option and weight zero, so they add nothing.
    option_mask[len(indices) :, 0] = True
    chosen = np.zeros((B,), dtype=np.int32)
    outcome = np.zeros((B,), dtype=np.float32)
    chosen[: len(indices)] = corpus.chosen[indices]
    outcome[: len(indices)] = corpus.outcome[indices]

    seg_q = segment[:, :, None]
    seg_k = segment[:, None, :]
    # A token sees its own segment; an action token also sees the state.
    allowed = (seg_q == seg_k) | ((seg_k == 0) & (seg_q > 0))
    batch = {
        "ids": mx.array(ids),
        "positions": mx.array(positions),
        "allowed": mx.array(allowed),
        "slot_card": mx.array(slot_card),
        "pool": mx.array(pool),
        "state_pool": mx.array(state_pool),
        "option_mask": mx.array(option_mask),
        "chosen": mx.array(chosen),
        "outcome": mx.array(outcome),
        "weight": mx.array(weight),
    }
    for name, values in (extras or {}).items():
        padded = np.zeros((B, *values.shape[1:]), dtype=np.float32)
        padded[: len(indices)] = values[indices]
        batch[name] = mx.array(padded)
    return batch


def rows_for(length: int, tokens_per_batch: int) -> int:
    """Decisions per batch at a length bucket: the budget over the width, as a
    multiple of 8 so the row count is one of a few values too."""
    return max(8, (tokens_per_batch // length) // 8 * 8)


def token_budget_batches(
    corpus: Corpus, indices: np.ndarray, tokens_per_batch: int, rng: np.random.Generator
) -> Iterator[tuple[np.ndarray, int]]:
    """Shuffled batches of decision indices grouped by length bucket, with
    their padded row count. Every batch in a bucket has the same shape, so
    each bucket compiles once."""
    widths = np.array([bucket(int(n), LENGTHS) for n in corpus.lengths[indices]])
    batches = []
    for length in np.unique(widths):
        group = indices[widths == length].copy()
        rng.shuffle(group)
        rows = rows_for(int(length), tokens_per_batch)
        for start in range(0, len(group), rows):
            batches.append((group[start : start + rows], rows))
    order = rng.permutation(len(batches))
    for i in order:
        yield batches[i]


def card_rows_for(cards_json: Path) -> dict[str, int]:
    return {n: i for i, n in enumerate(sorted(load_card_table(cards_json)))}


def main(paths: list[str]) -> None:
    """Tokenise rendered shards into `.npz` corpora beside them."""
    for raw in paths:
        path = Path(raw)
        card_rows = card_rows_for(path.parent.parent / "cards.json")
        start = time.perf_counter()
        corpus = Corpus.from_games(read_games([path]), card_rows)
        out = path.with_suffix("").with_suffix(".npz")
        corpus.save(out)
        print(f"{path.name}: {len(corpus)} decisions, {len(corpus.tokens)} tokens, {time.perf_counter() - start:.1f}s")


if __name__ == "__main__":
    main(sys.argv[1:])
