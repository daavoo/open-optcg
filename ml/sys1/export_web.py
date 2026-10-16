"""Export a checkpoint as the in-browser scorer's model pack.

    .venv/bin/python -m sys1.export_web checkpoints/play ../packages/web/src/scorer-model.json

The pack (read by packages/agents/src/scorer/pack.ts) holds:
- the encoder and heads as float16, Linear weights transposed to (in, out) so
  the TypeScript matmul walks them row by row;
- each card's vector precomputed -- the projected text encoding plus the
  learned per-card embedding -- so the browser never encodes card text;
- only the embedding rows the renderer can produce, with a table from each
  pre-tokenised word seen in the corpus to its token ids (see tokenizer.ts).

With `--parity out.json` it also writes sample decisions and the MLX model's
probabilities for them, for `ml/bridge/parity-web.ts`.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
from pathlib import Path

import mlx.core as mx
import numpy as np

from .data import RENDER_VERSION
from .policy import Policy
from .text import CARD_SLOT, CLS, PLACEHOLDER, SEP, tokenizer

DATA = Path(__file__).resolve().parent.parent / "data"


def corpus_texts(paths: list[Path]) -> list[str]:
    texts: set[str] = set()
    for path in paths:
        with gzip.open(path, "rt") as handle:
            for line in handle:
                game = json.loads(line)
                if game.get("render", 1) != RENDER_VERSION:
                    raise SystemExit(f"{path} is in render version {game.get('render', 1)}, not {RENDER_VERSION}")
                for decision in game["decisions"]:
                    texts.add(decision["state"])
                    texts.update(decision["actions"])
    return sorted(texts)


def words_of(texts: list[str]) -> set[str]:
    tok = tokenizer()
    words: set[str] = set()
    for text in texts:
        for piece in PLACEHOLDER.split(text)[::2]:
            words.update(w for w, _ in tok.pre_tokenizer.pre_tokenize_str(tok.normalizer.normalize_str(piece)))
    return words


def word_table(texts: list[str], extra_words: list[str]) -> dict[str, list[int]]:
    tok = tokenizer()
    words: set[str] = set()
    pieces: set[str] = set()
    for text in texts:
        pieces.update(PLACEHOLDER.split(text)[::2])
    pieces.update(extra_words)
    for piece in pieces:
        for word, _ in tok.pre_tokenizer.pre_tokenize_str(tok.normalizer.normalize_str(piece)):
            words.add(word)
    return {word: [t.id for t in tok.model.tokenize(word)] for word in sorted(words)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint")
    parser.add_argument("out")
    parser.add_argument(
        "--corpus", default=str(DATA / "manual-try"),
        help="a rendered corpus in the current render version: its words are the pack's vocabulary",
    )
    parser.add_argument("--shards", type=int, default=6, help="corpus shards scanned for words")
    parser.add_argument("--parity", default=None)
    args = parser.parse_args()

    policy = Policy(Path(args.checkpoint))
    model = policy.model
    config = model.encoder.config
    tok = tokenizer()

    # The browser tokenises a word outside this table byte by byte, which is
    # not what the model was trained on, so the table must cover every word
    # the renderer writes: scanned from `--shards` shards and checked on
    # another one, and a pack that misses a word there is refused.
    shards = sorted(Path(args.corpus).glob("*.jsonl.gz"))
    if len(shards) < 2:
        raise SystemExit(f"--corpus {args.corpus} needs at least two rendered shards (*.jsonl.gz)")
    scanned, check = shards[: min(args.shards, len(shards) - 1)], shards[-1]
    texts = corpus_texts(scanned)
    card_table = json.loads((DATA / "cards.json").read_text())
    names = [facts["name"] for facts in card_table.values()]
    numbers = [str(n) for n in range(0, 300)] + [str(n) for n in range(300, 30001, 100)]
    numbers += [str(n + 1) for n in range(0, 30001, 1000)]
    extra = names + [f" {n}" for n in names] + [f" {n}" for n in numbers] + numbers
    words = word_table(texts, extra)
    missing = words_of(corpus_texts([check])) - words.keys()
    if missing:
        raise SystemExit(f"{len(missing)} words in {check.name} are not in the table: {sorted(missing)[:20]}")

    # Byte-level single characters, for the unseen-word fallback.
    vocab = tok.get_vocab()
    byte_tokens = {token: index for token, index in vocab.items() if len(token) == 1}

    used = sorted({CLS, SEP, CARD_SLOT, *byte_tokens.values(), *(i for ids in words.values() for i in ids)})
    remap = {old: new for new, old in enumerate(used)}
    print(f"{len(words)} words, {len(used)} of {config.vocab_size} embedding rows kept")

    params = dict(__import__("mlx.utils", fromlist=["tree_flatten"]).tree_flatten(model.parameters()))
    f32 = lambda a: np.array(a.astype(mx.float32))  # noqa: E731

    tensors: dict[str, np.ndarray] = {}
    tensors["embed"] = f32(params["encoder.embeddings.tok_embeddings.weight"])[np.array(used)]
    tensors["embed_norm"] = f32(params["encoder.embeddings.norm.weight"])
    for i in range(config.num_hidden_layers):
        p = f"encoder.layers.{i}"
        if i > 0:
            tensors[f"layers.{i}.attn_norm"] = f32(params[f"{p}.attn_norm.weight"])
        tensors[f"layers.{i}.wqkv.w"] = f32(params[f"{p}.attn.Wqkv.weight"]).T
        tensors[f"layers.{i}.wo.w"] = f32(params[f"{p}.attn.Wo.weight"]).T
        tensors[f"layers.{i}.mlp_norm"] = f32(params[f"{p}.mlp_norm.weight"])
        tensors[f"layers.{i}.wi.w"] = f32(params[f"{p}.mlp.Wi.weight"]).T
        tensors[f"layers.{i}.wo2.w"] = f32(params[f"{p}.mlp.Wo.weight"]).T
    tensors["final_norm"] = f32(params["encoder.final_norm.weight"])
    for head in ("policy", "value"):
        for layer in ("0", "2"):
            tensors[f"{head}.{layer}.w"] = f32(params[f"{head}.layers.{layer}.weight"]).T
            tensors[f"{head}.{layer}.b"] = f32(params[f"{head}.layers.{layer}.bias"])
    rows = mx.arange(len(policy.card_texts.numbers))
    cards = model.card_proj(policy.card_text) + model.card_embed(rows)
    shared = model.shared_cards()
    if shared is not None:
        cards = cards + shared
    tensors["cards"] = f32(cards)

    blob = bytearray()
    index = {}
    offset = 0
    for name, array in tensors.items():
        array = np.ascontiguousarray(array, dtype=np.float32)
        index[name] = {"offset": offset, "shape": list(array.shape)}
        blob += array.astype("<f2").tobytes()
        offset += array.size
    pack = {
        "version": 1,
        "source": str(Path(args.checkpoint)),
        "trainedOnPrintedText": json.loads((Path(args.checkpoint) / "config.json").read_text()).get("text")
        == "pack",
        "config": {
            "hidden": config.hidden_size,
            "layers": config.num_hidden_layers,
            "heads": config.num_attention_heads,
            "intermediate": config.intermediate_size,
            "globalEvery": config.global_attn_every_n_layers,
            "window": config.local_attention // 2,
            "ropeTheta": config.global_rope_theta,
            "normEps": config.norm_eps,
            "cls": remap[CLS],
            "sep": remap[SEP],
            "cardSlot": remap[CARD_SLOT],
            "render": RENDER_VERSION,
        },
        "cards": policy.card_texts.numbers,
        "tokenizer": {
            "words": {w: [remap[i] for i in ids] for w, ids in words.items()},
            "bytes": {c: remap[i] for c, i in byte_tokens.items()},
            "cardSlot": remap[CARD_SLOT],
        },
        "tensors": index,
        "data": base64.b64encode(bytes(blob)).decode("ascii"),
    }
    out = Path(args.out)
    out.write_text(json.dumps(pack, separators=(",", ":")))
    print(f"{offset / 1e6:.1f}M values, {out.stat().st_size / 1e6:.1f} MB -> {out}")

    if args.parity:
        samples = []
        with gzip.open(check, "rt") as handle:
            for line in handle:
                for decision in json.loads(line)["decisions"][::15]:
                    samples.append({"state": decision["state"], "actions": decision["actions"]})
                if len(samples) >= 40:
                    break
        probs, values = policy.score(samples)
        Path(args.parity).write_text(
            json.dumps(
                [{**s, "probs": p.tolist(), "value": float(v)} for s, p, v in zip(samples, probs, values)]
            )
        )
        print(f"parity samples -> {args.parity}")


if __name__ == "__main__":
    main()
