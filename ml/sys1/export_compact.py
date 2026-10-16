"""The small scorer's in-browser pack, and the samples that check it.

    .venv/bin/python -m sys1.export_compact checkpoints/compact-ppo/iter-0080 \\
        checkpoints/compact-scorer-model.json --samples data/distill-compact --parity checkpoints/compact-parity.json

Weights travel as one base64 blob of little-endian float16, as the text
scorer's do (`export_web.py`); Linear weights are transposed to (in, out) and
named `<module>.w`/`<module>.b`, embeddings and layer norms keep their names
(`packages/agents/src/scorer/compact-model.ts` reads them). `--parity` writes
decisions from a compact corpus with the MLX model's probabilities and value,
which `bridge/parity-compact.ts` scores again in TypeScript.

The pack records, as `trainedOnPrintedText`, whether any card table it
descends from was trained with the printed-text pack (`--text pack`).
"""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path

import mlx.core as mx
import numpy as np
from mlx.utils import tree_flatten

from .compact import (
    OPTION_INDEX,
    OPTION_ROW_COLUMN,
    CompactCorpus,
    CompactPolicy,
    collate,
    merge_lora,
)

DATA = Path(__file__).resolve().parent.parent / "data"
EMBEDDINGS = {"card", "zone", "type", "kind"}


def tensors_of(policy: CompactPolicy) -> dict[str, np.ndarray]:
    # A deck adapter's checkpoint (`compact_ppo --lora`) exports as the whole
    # model it makes with its base; `export_adapter` writes the adapter alone.
    merge_lora(policy.model)
    params = {name: np.array(value.astype(mx.float32)) for name, value in tree_flatten(policy.model.parameters())}
    linear = {
        name[: -len(".weight")]
        for name, value in params.items()
        if name.endswith(".weight") and value.ndim == 2 and name[: -len(".weight")] not in EMBEDDINGS
    }
    out: dict[str, np.ndarray] = {}
    for name, value in params.items():
        # The aux head (compact_ppo --aux-hidden) is a training loss only; the
        # browser never runs it.
        if name.startswith("aux_"):
            continue
        module, _, leaf = name.rpartition(".")
        if module in linear:
            out[f"{module}.{'w' if leaf == 'weight' else 'b'}"] = value.T if leaf == "weight" else value
        else:
            out[name] = value
    return out


def trained_on_printed_text(checkpoint: Path, seen: set[str] | None = None) -> bool:
    """Whether any card table this checkpoint descends from read the printed-text pack.

    A card table can come from a text teacher, a compact checkpoint (`compact
    train --card-init`) or the run's start (`init`); every parent is followed,
    since a clean one does not clear another."""
    seen = set() if seen is None else seen
    config = json.loads((checkpoint / "config.json").read_text())
    for parent in (config.get(k) for k in ("teacher", "card_init", "init")):
        if not parent or parent in seen:
            continue
        seen.add(parent)
        path = Path(parent) / "config.json"
        if not path.exists():
            return True  # unknown provenance: say so rather than guess it is safe
        if json.loads(path.read_text()).get("text") == "pack" or trained_on_printed_text(Path(parent), seen):
            return True
    return False


def samples(policy: CompactPolicy, corpus: CompactCorpus, count: int) -> list[dict]:
    """`count` decisions spread over option counts, in the encoder's row format, with MLX's answers."""
    rng = np.random.default_rng(0)
    options = np.diff(corpus.option_start)
    picked: list[int] = []
    for k in sorted(set(options.tolist())):
        where = np.flatnonzero(options == k)
        picked.extend(rng.choice(where, size=min(len(where), max(1, count // 12)), replace=False).tolist())
    picked = picked[:count]
    out = []
    for d in picked:
        c0, c1 = corpus.card_start[d], corpus.card_start[d + 1]
        o0, o1 = corpus.option_start[d], corpus.option_start[d + 1]
        cards = np.concatenate([corpus.card_idx[c0:c1].astype(np.float32), corpus.card_num[c0:c1].astype(np.float32)], axis=1)
        numbers = corpus.option_num[o0:o1].astype(np.float32).copy()
        numbers[:, OPTION_ROW_COLUMN] = corpus.option_idx[o0:o1, 5]
        options_rows = np.concatenate([corpus.option_idx[o0:o1, :OPTION_INDEX].astype(np.float32), numbers], axis=1)
        decision = {"global": corpus.glob[d].astype(np.float32).tolist(), "cards": cards.tolist(), "options": options_rows.tolist()}
        # Through `score`, which reads the decision as the checkpoint's own
        # encoding version would: what the browser does too.
        (probs,), (value,) = policy.score([{"compact": decision}])
        out.append({
            "decision": {
                "global": corpus.glob[d].astype(np.float32).tolist(),
                "cards": cards.tolist(),
                "options": options_rows.tolist(),
            },
            "probs": probs.tolist(),
            "value": float(value),
        })
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint")
    parser.add_argument("out")
    parser.add_argument("--samples", help="a compact corpus directory (sys1.distill --compact) to draw parity samples from")
    parser.add_argument("--parity", help="where to write the parity samples")
    parser.add_argument("--count", type=int, default=64)
    args = parser.parse_args()

    checkpoint = Path(args.checkpoint)
    policy = CompactPolicy(checkpoint)
    config = policy.config
    tensors = tensors_of(policy)
    blob, entries, offset = [], {}, 0
    for name in sorted(tensors):
        value = tensors[name].astype(np.float16)
        entries[name] = {"offset": offset, "shape": list(value.shape)}
        blob.append(value.ravel())
        offset += value.size
    data = np.concatenate(blob).astype("<f2").tobytes()
    cards = sorted(json.loads((DATA / "cards.json").read_text()))
    if len(cards) != config["cards"]:
        raise SystemExit(f"cards.json has {len(cards)} cards; the checkpoint was trained on {config['cards']}")
    printed = trained_on_printed_text(checkpoint)
    pack = {
        "kind": "compact",
        "version": 1,
        "compactVersion": config.get("compact_version", 1),
        "source": str(checkpoint),
        "trainedOnPrintedText": printed,
        "config": {"d": config["d"], "layers": config["layers"], "heads": config["heads"], "cards": config["cards"]},
        "cards": cards,
        "tensors": entries,
        "data": base64.b64encode(data).decode("ascii"),
    }
    Path(args.out).write_text(json.dumps(pack))
    size = Path(args.out).stat().st_size / 1e6
    print(f"wrote {args.out}: {offset / 1e6:.2f}M parameters, {size:.1f} MB" + (", trained on printed text" if printed else ""))
    if args.parity:
        if not args.samples:
            raise SystemExit("--parity needs --samples")
        corpus = CompactCorpus.load(sorted(Path(args.samples).glob("shard-*.npz"))[:1])
        rows = samples(policy, corpus, args.count)
        Path(args.parity).write_text(json.dumps(rows))
        print(f"wrote {len(rows)} parity samples to {args.parity}")


if __name__ == "__main__":
    main()
