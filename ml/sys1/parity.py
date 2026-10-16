"""The MLX encoder against Hugging Face's ModernBERT, on the same text.

    .venv/bin/python -m sys1.parity jhu-clsp/ettin-encoder-68m

Needs the `parity` dependency group (torch, transformers). Runs in float32 on
the CPU so the comparison measures the implementation: the M5 GPU's float32
matmuls are not bit-faithful, and their drift is reported separately. Two checks:
a plain sentence longer than the local window (so both attention kinds and
their masks are exercised), and the invariance the scorer relies on -- an
action scored after the state gives the same hidden states wherever it sits.
"""

from __future__ import annotations

import sys

import mlx.core as mx
import numpy as np
import torch
from transformers import AutoModelForMaskedLM

from .model import load_encoder
from .text import tokenizer


def main(repo: str) -> None:
    tok = tokenizer(repo)
    text = " ".join(
        ["The Leader attacks with four DON!! attached and the defender counters."] * 20
    )
    ids = tok.encode(text).ids
    print(f"{len(ids)} tokens")

    reference = AutoModelForMaskedLM.from_pretrained(repo, attn_implementation="eager").eval()
    with torch.no_grad():
        expected = reference.model(torch.tensor([ids])).last_hidden_state[0].numpy()

    mx.set_default_device(mx.cpu)
    encoder = load_encoder(repo, dtype=mx.float32)
    x = mx.array([ids])
    L = len(ids)
    got = encoder(
        encoder.embeddings.tok_embeddings(x),
        mx.arange(L)[None],
        mx.ones((1, L, L), dtype=mx.bool_),
    )[0]
    got = np.array(got)
    err = np.abs(got - expected).max()
    cos = (got * expected).sum(-1) / (np.linalg.norm(got, axis=-1) * np.linalg.norm(expected, axis=-1))
    print(f"max abs err {err:.2e}, min cosine {cos.min():.6f}")
    assert cos.min() > 0.9999, "MLX encoder disagrees with the reference"

    mx.set_default_device(mx.gpu)
    gpu = np.array(
        load_encoder(repo, dtype=mx.float32)(
            encoder.embeddings.tok_embeddings(x), mx.arange(L)[None], mx.ones((1, L, L), dtype=mx.bool_)
        )[0]
    )
    gpu_cos = (gpu * expected).sum(-1) / (
        np.linalg.norm(gpu, axis=-1) * np.linalg.norm(expected, axis=-1)
    )
    print(f"GPU float32 min cosine {gpu_cos.min():.6f} (informational)")
    mx.set_default_device(mx.cpu)

    # Order invariance: state S, actions A and B packed as S|A|B and S|B|A.
    state = tok.encode("turn 3 yours | main", add_special_tokens=False).ids
    a = tok.encode("attack b1 -> op-leader", add_special_tokens=False).ids
    b = tok.encode("play h2", add_special_tokens=False).ids

    def run(first, second):
        seq = state + first + second
        seg = [0] * len(state) + [1] * len(first) + [2] * len(second)
        pos = list(range(len(state))) + [len(state) + i for i in range(len(first))] + [
            len(state) + i for i in range(len(second))
        ]
        seg_a = mx.array(seg)
        allowed = mx.logical_or(
            seg_a[None, :] == seg_a[:, None],
            mx.logical_and(seg_a[None, :] == 0, seg_a[:, None] != 0),
        )
        out = encoder(
            encoder.embeddings.tok_embeddings(mx.array([seq])),
            mx.array([pos]),
            allowed[None],
        )[0]
        return np.array(out)

    ab, ba = run(a, b), run(b, a)
    s = len(state)
    diff = np.abs(ab[s : s + len(a)] - ba[s + len(b) : s + len(b) + len(a)]).max()
    print(f"action A hidden-state drift under reordering: {diff:.2e}")
    assert diff < 1e-4


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "jhu-clsp/ettin-encoder-68m")
