"""Behaviour cloning: teach the scorer the rules agent's choices.

    .venv/bin/python -m sys1.train_bc --model 32m --epochs 2 --out checkpoints/bc-32m

The warm start before any RL. The policy head learns the rules agent's choice
at each decision (cross-entropy over the legal options); the value head learns
the eventual result from the deciding seat's side. Validation holds out whole
games, so a decision never shares a game with one it was trained on.

Efficiency on Apple silicon, in order of what it buys:
- one compiled training step per batch shape (see `data.token_budget_batches`),
- card text encoded once per refresh rather than per step,
- bf16 weights and activations throughout (the M5's matmul units run bf16 and
  fp16 at the same rate; bf16 is used for its range).
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import re
import time
import zlib
from functools import partial
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np
from mlx.utils import tree_flatten

from .data import CardTexts, Corpus, collate, token_budget_batches
from .evaluate import read_deck_list
from .features import CardFeatures, build_vocab
from .model import MixedPrecision, Scorer, load_encoder
from .text import load_card_table, load_printed_text

VALUE_WEIGHT = 0.5


def losses(model: Scorer, batch, card_text):
    logits, values = model(batch, card_text)
    weight = batch["weight"]
    total = mx.maximum(weight.sum(), 1.0)
    if "soft" in batch:
        # A teacher's whole distribution (`sys1.distill`): padded options have
        # probability zero, so their -1e9 logits add nothing.
        logp = logits - mx.logsumexp(logits, axis=-1, keepdims=True)
        per_row = -(batch["soft"] * logp).sum(axis=-1)
    else:
        per_row = nn.losses.cross_entropy(logits, batch["chosen"], reduction="none")
    ce = (per_row * weight).sum() / total
    mse = (((values - batch["outcome"]) ** 2) * weight).sum() / total
    correct = ((mx.argmax(logits, axis=-1) == batch["chosen"]) * weight).sum()
    return ce + VALUE_WEIGHT * mse, (ce, mse, correct)


def make_step(model: Scorer, optimizer: optim.Optimizer):
    def loss_only(m, batch, card_text):
        return losses(m, batch, card_text)[0]

    grad_fn = nn.value_and_grad(model, loss_only)
    precision = MixedPrecision(model)
    state = [model.state, optimizer.state, precision.state]

    @partial(mx.compile, inputs=state, outputs=state)
    def compiled(batch, card_text):
        loss, grads = grad_fn(model, batch, card_text)
        grads, _ = optim.clip_grad_norm(grads, 1.0)
        precision.apply(optimizer, grads)
        return loss

    return compiled


def refresh_cards(model: Scorer, card_texts: CardTexts) -> mx.array:
    return card_texts.restore_order(model.encode_cards(card_texts.chunks()))


def evaluate(model: Scorer, batches, card_text) -> dict[str, float]:
    ce_sum = mse_sum = correct = count = 0.0
    forward = mx.compile(lambda b, c: losses(model, b, c)[1], inputs=[model.state])
    for batch, n in batches:
        ce, mse, right = forward(batch, card_text)
        mx.eval(ce, mse, right)
        ce_sum += ce.item() * n
        mse_sum += mse.item() * n
        correct += right.item()
        count += n
    return {"ce": ce_sum / count, "value_mse": mse_sum / count, "accuracy": correct / count}


GAME_HEADER = re.compile(r'"seed":\s*"((?:[^"\\]|\\.)*)",\s*"p1":\s*"((?:[^"\\]|\\.)*)",\s*"p2":\s*"((?:[^"\\]|\\.)*)"')


def games_with_decks(data: Path, decks: frozenset[str]) -> np.ndarray:
    """The corpus game ids (as `Corpus.from_games` writes them) of the games
    in the rendered shards beside the `.npz` corpora that played any of `decks`."""
    unseen = set(decks)
    ids = []
    for shard in sorted(data.glob("*.jsonl.gz")):
        with gzip.open(shard, "rt") as handle:
            for line in handle:
                # Only the header, which precedes the game's decisions.
                seed, p1, p2 = (json.loads(f'"{field}"') for field in GAME_HEADER.search(line, 0, 2000).groups())
                unseen.discard(p1)
                unseen.discard(p2)
                if p1 in decks or p2 in decks:
                    ids.append(zlib.crc32(seed.encode()) & 0x7FFFFFFF)
    if unseen:
        raise SystemExit(f"decks in no game of {data}: {sorted(unseen)}")
    return np.array(ids, dtype=np.int32)


class SoftTargets:
    """Per-option teacher probabilities beside a corpus's shards (`sys1.distill`)."""

    def __init__(self, flat: np.ndarray, corpus: Corpus):
        self.flat = flat
        self.start = np.zeros(len(corpus) + 1, dtype=np.int64)
        np.cumsum(corpus.options, out=self.start[1:])
        if self.start[-1] != len(flat):
            raise SystemExit(f"soft targets hold {len(flat)} options, the corpus {self.start[-1]}")
        self.options = corpus.options

    @classmethod
    def load(cls, paths: list[Path], corpus: Corpus) -> "SoftTargets":
        missing = [p for p in paths if not p.with_name(p.stem + ".soft.npy").exists()]
        if missing:
            raise SystemExit(f"--soft, but no soft targets beside {missing[0]}")
        return cls(np.concatenate([np.load(p.with_name(p.stem + ".soft.npy")) for p in paths]), corpus)

    def matrix(self, group: np.ndarray, rows: int, width: int) -> mx.array:
        out = np.zeros((rows, width), dtype=np.float32)
        for row, d in enumerate(group):
            k = int(self.options[d])
            out[row, :k] = self.flat[self.start[d] : self.start[d] + k]
        return mx.array(out)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="a tokenised corpus directory, e.g. data/corpus-<key>")
    parser.add_argument("--model", default="32m")
    # A third of a pass: the warm start only has to put the policy in range for
    # RL, most of the agreement with the teacher arrives early in the pass, and
    # RL leaves the teacher behind anyway.
    parser.add_argument("--epochs", type=float, default=0.3)
    parser.add_argument("--budget", type=int, default=16384, help="padded tokens per batch")
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--warmup", type=int, default=200)
    parser.add_argument("--card-refresh", type=int, default=500, help="steps between card re-encodes")
    parser.add_argument("--val-games", type=int, default=150)
    parser.add_argument("--max-games", type=int, default=0)
    parser.add_argument("--out", default=None)
    parser.add_argument("--text", choices=["pack", "none"], default="pack")
    parser.add_argument(
        "--exclude-decks", help="a deck list file: drop every game either seat of which played one of its decks"
    )
    parser.add_argument("--card-features", action="store_true", help="the structured card features (features.py)")
    parser.add_argument(
        "--soft", action="store_true",
        help="fit the teacher's distributions in shard-NN.soft.npy (sys1.distill) rather than the move played",
    )
    args = parser.parse_args()

    paths = sorted(Path(args.data).glob("*.npz"))
    if not paths:
        raise SystemExit(f"no .npz corpora in {args.data}; run `python -m sys1.data {args.data}/*.jsonl.gz`")
    t0 = time.perf_counter()
    corpus = Corpus.load(paths)
    soft = SoftTargets.load(paths, corpus) if args.soft else None
    games = np.unique(corpus.game)
    held_out = read_deck_list(Path(args.exclude_decks)) if args.exclude_decks else frozenset()
    if held_out:
        dropped = games_with_decks(Path(args.data), held_out)
        before = len(games)
        games = games[~np.isin(games, dropped)]
        print(f"dropped {before - len(games)} of {before} games with a held-out deck")
    if args.max_games:
        games = games[: args.max_games]
    val_games = games[: args.val_games]
    in_play = np.isin(corpus.game, games)
    is_val = np.isin(corpus.game, val_games)
    train = corpus.subset(in_play & ~is_val)
    val = corpus.subset(is_val)
    print(
        f"{len(train)} train / {len(val)} val decisions from {len(games)} games, "
        f"loaded in {time.perf_counter() - t0:.1f}s"
    )

    printed = load_printed_text() if args.text == "pack" else {}
    card_texts = CardTexts(load_card_table(Path(args.data).parent / "cards.json"), printed)
    print(f"{len(card_texts.numbers)} cards, printed text for {len(printed)}")

    vocab = build_vocab() if args.card_features else None
    features = CardFeatures.load(card_texts.numbers, vocab) if vocab is not None else None
    model = Scorer(load_encoder(f"jhu-clsp/ettin-encoder-{args.model}"), len(card_texts.numbers), features)
    model.set_dtype(mx.bfloat16)
    params = sum(v.size for _, v in tree_flatten(model.parameters()))
    print(f"ettin-{args.model}: {params / 1e6:.1f}M parameters")

    rng = np.random.default_rng(0)
    steps_per_epoch = sum(1 for _ in token_budget_batches(corpus, train, args.budget, np.random.default_rng(0)))
    total_steps = max(1, int(steps_per_epoch * args.epochs))
    schedule = optim.join_schedules(
        [
            optim.linear_schedule(1e-7, args.lr, args.warmup),
            optim.cosine_decay(args.lr, max(1, total_steps - args.warmup), args.lr * 0.05),
        ],
        [args.warmup],
    )
    optimizer = optim.AdamW(learning_rate=schedule, weight_decay=0.01)
    step = make_step(model, optimizer)
    def batch_of(group, rows):
        batch = collate(corpus, group, rows)
        if soft is not None:
            batch["soft"] = soft.matrix(group, rows, batch["option_mask"].shape[1])
        return batch

    val_batches = [
        (batch_of(group, rows), len(group))
        for group, rows in token_budget_batches(corpus, val, args.budget, np.random.default_rng(1))
    ]

    card_text = refresh_cards(model, card_texts)
    print(f"before training: {evaluate(model, val_batches, card_text)}")

    done, seen, started = 0, 0, time.perf_counter()
    log_loss, log_n = 0.0, 0
    history = []
    while done < total_steps:
        for group, rows in token_budget_batches(corpus, train, args.budget, rng):
            batch = batch_of(group, rows)
            loss = step(batch, card_text)
            mx.eval(loss, model.parameters(), optimizer.state)
            done += 1
            seen += len(group)
            log_loss += loss.item()
            log_n += 1
            if done % args.card_refresh == 0:
                card_text = refresh_cards(model, card_texts)
            if done % 100 == 0:
                elapsed = time.perf_counter() - started
                print(
                    f"step {done}/{total_steps} loss {log_loss / log_n:.4f} "
                    f"lr {optimizer.learning_rate.item():.2e} {seen / elapsed:.0f} decisions/s",
                    flush=True,
                )
                log_loss, log_n = 0.0, 0
            if done % 1000 == 0 or done == total_steps:
                card_text = refresh_cards(model, card_texts)
                metrics = evaluate(model, val_batches, card_text)
                metrics["step"] = done
                history.append(metrics)
                print(f"val {metrics}", flush=True)
            if done >= total_steps:
                break

    if args.out:
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        model.save_weights(str(out / "weights.safetensors"))
        (out / "config.json").write_text(
            json.dumps(
                {
                    "model": args.model,
                    "text": args.text,
                    "render": int(corpus.render),
                    "cards": card_texts.numbers,
                    "history": history,
                    **({"held_out_decks": sorted(held_out)} if held_out else {}),
                    **({"card_feature_vocab": vocab} if vocab is not None else {}),
                }
            )
        )
        print(f"saved {out}")


if __name__ == "__main__":
    main()
