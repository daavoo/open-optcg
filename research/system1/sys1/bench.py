"""Training and inference throughput of the scorer on this machine.

    .venv/bin/python -m sys1.bench --models 17m,32m,68m --budget 16384

Measures decisions/second for the compiled training step `train_bc` runs and
for a compiled forward pass alone, over real rendered decisions. Batches cycle
through the bucket shapes a real run sees, so compile cost is paid up front
and excluded.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import mlx.core as mx
import mlx.optimizers as optim
import numpy as np
from mlx.utils import tree_flatten

from .data import CardTexts, Corpus, collate, token_budget_batches
from .model import Scorer, load_encoder
from .text import load_card_table, load_printed_text
from .train_bc import losses, make_step, refresh_cards


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="a tokenised corpus directory, e.g. data/corpus-<key>")
    parser.add_argument("--models", default="17m,32m,68m")
    parser.add_argument("--budget", type=int, default=16384)
    parser.add_argument("--steps", type=int, default=60)
    args = parser.parse_args()

    corpus = Corpus.load(sorted(Path(args.data).glob("*.npz"))[:1])
    indices = np.arange(len(corpus))
    card_texts = CardTexts(load_card_table(Path(args.data).parent / "cards.json"), load_printed_text())
    batches = []
    for group, rows in token_budget_batches(corpus, indices, args.budget, np.random.default_rng(0)):
        batches.append((collate(corpus, group, rows), len(group)))
        if len(batches) >= args.steps:
            break
    shapes = {tuple(b["ids"].shape) + (b["pool"].shape[1],) for b, _ in batches}
    print(f"{len(corpus)} decisions, {len(batches)} batches over {len(shapes)} shapes")

    for size in args.models.split(","):
        model = Scorer(load_encoder(f"jhu-clsp/ettin-encoder-{size}"), len(card_texts.numbers))
        model.set_dtype(mx.bfloat16)
        t = time.perf_counter()
        card_text = refresh_cards(model, card_texts)
        cards_s = time.perf_counter() - t
        step = make_step(model, optim.AdamW(learning_rate=1e-5))
        forward = mx.compile(lambda b, c: losses(model, b, c)[1])

        def run(fn):
            for batch, _ in batches:  # compile every shape once
                mx.eval(fn(batch))
            start, seen = time.perf_counter(), 0
            for batch, n in batches:
                mx.eval(fn(batch))
                seen += n
            return seen / (time.perf_counter() - start)

        train = run(lambda b: (step(b, card_text), model.parameters()))
        infer = run(lambda b: forward(b, card_text))
        params = sum(v.size for _, v in tree_flatten(model.parameters()))
        print(
            f"ettin-{size:5s} {params / 1e6:6.1f}M | train {train:6.0f} decisions/s | "
            f"forward {infer:6.0f} decisions/s | card refresh {cards_s:.1f}s | "
            f"peak {mx.get_peak_memory() / 1e9:.1f} GB",
            flush=True,
        )
        mx.reset_peak_memory()


if __name__ == "__main__":
    main()
