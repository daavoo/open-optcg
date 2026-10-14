"""Each card's structured features: the `CardRules` half of its vector.

`bridge/card-features.ts` writes, per card, a bag of feature tokens (its
facts, printed clauses and derived flags, and what its engine program does)
and a few numbers. A token becomes a learned vector and the card's vectors
are summed; the numbers go through a small MLP. Both start at zero, so a
checkpoint that gains them plays exactly as before until they are trained.

Only tokens at least `MIN_CARDS` cards share enter the vocabulary: a token
on one card is that card's identity again, and cannot help a card that has
not been played. The vocabulary is fixed when the features are first added
and travels in the checkpoint's config, so a token the exporter learns to
write later is ignored rather than shifting every row.
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import mlx.core as mx
import numpy as np

DATA = Path(__file__).resolve().parent.parent / "data"
FEATURES = DATA / "card-features.json"
MIN_CARDS = 2
# cost, power / 1000, counter / 1000, DON!! requirement, each scaled to about 1.
NUMBER_SCALE = np.array([10.0, 10.0, 2.0, 10.0], dtype=np.float32)


def build_vocab(path: Path = FEATURES) -> list[str]:
    table = json.loads(path.read_text())
    counts = Counter(token for entry in table.values() for token in entry["tokens"])
    return sorted(token for token, n in counts.items() if n >= MIN_CARDS)


@dataclass
class CardFeatures:
    """`hot` (cards, vocab + 1): 1 where the card has the token, column 0
    always 0; `numbers` (cards, 4). A card's token vector is then one matmul
    against the embedding table, which is far cheaper on every training step
    than gathering a (cards, tokens, hidden) tensor and summing it.

    A plain holder rather than module attributes: an `mx.array` on an
    `nn.Module` would be saved and trained as a parameter.
    """

    vocab: list[str]
    hot: mx.array
    numbers: mx.array

    @classmethod
    def load(cls, numbers: list[str], vocab: list[str], path: Path = FEATURES) -> "CardFeatures":
        if not path.exists():
            raise SystemExit(f"no {path}; run `pnpm exec tsx research/system1/bridge/card-features.ts`")
        table = json.loads(path.read_text())
        index = {token: i + 1 for i, token in enumerate(vocab)}
        rows = [[index[t] for t in table[n]["tokens"] if t in index] if n in table else [] for n in numbers]
        hot = np.zeros((len(numbers), len(vocab) + 1), dtype=np.float32)
        for r, row in enumerate(rows):
            hot[r, row] = 1.0
        figures = np.array(
            [table[n]["numbers"] if n in table else [0, 0, 0, 0] for n in numbers], dtype=np.float32
        )
        return cls(vocab, mx.array(hot), mx.array(figures / NUMBER_SCALE))
