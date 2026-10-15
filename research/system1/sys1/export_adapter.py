"""A deck adapter for the browser: the low-rank update `compact_ppo --lora`
trained over a base pack, without the base.

    .venv/bin/python -m sys1.export_adapter checkpoints/lora-mon/final checkpoints/mon-adapter.json \\
        --deck mon --base checkpoints/aux2-scorer-model.json \\
        --samples data/distill-v2 --parity checkpoints/mon-adapter-parity.json

Each adapted layer travels as two factors in the pack's float16 blob, already
in the browser's (in, out) orientation and scaled: `<layer>.a` is (in, rank)
and `<layer>.b` is (rank, out), and the layer's weight is `<layer>.w + a @ b`
(`packages/agents/src/scorer/pack.ts`). An adapter trained with
`compact_ppo --train-cards` also carries those cards' card-table rows,
`card.rows` in the order of its `cardRows`, which the app puts in place of
the base's only in the model the adapter makes. The adapter names the base pack it
was trained over and carries its deck's list, which the app matches a seat's
deck against. `--parity` writes samples scored by the adapted model, which
`bridge/parity-compact.ts` scores again with the base pack and this adapter.
"""

from __future__ import annotations

import argparse
import base64
import json
import subprocess
from pathlib import Path

import numpy as np

import mlx.core as mx

from .compact import CompactCorpus, CompactPolicy, lora_layers
from .export_compact import samples, trained_on_printed_text

ROOT = Path(__file__).resolve().parents[3]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint")
    parser.add_argument("out")
    parser.add_argument("--deck", required=True, help="the training deck id it pilots (bridge/decks.ts)")
    parser.add_argument("--base", required=True, help="the base pack (export_compact) the adapter goes over")
    parser.add_argument("--samples", help="a compact corpus directory to draw parity samples from")
    parser.add_argument("--parity", help="where to write the parity samples")
    parser.add_argument("--count", type=int, default=64)
    args = parser.parse_args()

    checkpoint = Path(args.checkpoint)
    policy = CompactPolicy(checkpoint)
    config = policy.config
    if not config.get("lora"):
        raise SystemExit(f"{checkpoint} has no adapter: it was not trained with compact_ppo --lora")
    base = json.loads(Path(args.base).read_text())
    # A continued adapter's start is the earlier adapter; `base` names the pack under both.
    over = config["lora"].get("base", config["init"])
    if base.get("source") != over:
        raise SystemExit(f"{args.base} was exported from {base.get('source')}; the adapter was trained over {over}")
    manifest = json.loads(subprocess.run(
        ["pnpm", "exec", "tsx", "research/system1/bridge/deck-manifest.ts", args.deck],
        cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip().splitlines()[-1])

    tensors: dict[str, np.ndarray] = {}
    for name, m in lora_layers(policy.model):
        tensors[f"{name}.a"] = np.array(m.lora_a).T
        tensors[f"{name}.b"] = (m.lora_scale * np.array(m.lora_b)).T
    card_rows = config.get("trained_cards") or []
    if card_rows:
        # Row order is the base pack's card list (`cards.json` sorted), which
        # the checkpoint's table shares.
        table = np.array(policy.model.card.weight.astype(mx.float32))
        if table.shape[0] != len(base["cards"]) + 1:
            raise SystemExit(f"the checkpoint's card table has {table.shape[0]} rows; {args.base} has {len(base['cards'])} cards")
        tensors["card.rows"] = table[[base["cards"].index(c) for c in card_rows]]
    blob, entries, offset = [], {}, 0
    for name in sorted(tensors):
        value = tensors[name].astype(np.float16)
        entries[name] = {"offset": offset, "shape": list(value.shape)}
        blob.append(value.ravel())
        offset += value.size
    printed = trained_on_printed_text(checkpoint)
    adapter = {
        "kind": "compact-adapter",
        "version": 1,
        "deck": manifest,
        "base": over,
        "source": str(checkpoint),
        "trainedOnPrintedText": printed,
        "rank": config["lora"]["rank"],
        **({"cardRows": card_rows} if card_rows else {}),
        "tensors": entries,
        "data": base64.b64encode(np.concatenate(blob).astype("<f2").tobytes()).decode("ascii"),
    }
    Path(args.out).write_text(json.dumps(adapter))
    size = Path(args.out).stat().st_size / 1e3
    print(f"wrote {args.out}: {args.deck} over {over}, {offset / 1e3:.0f}k parameters"
          + (f" ({len(card_rows)} card rows)" if card_rows else "") + f", {size:.0f} KB"
          + (", trained on printed text" if printed else ""))
    if args.parity:
        if not args.samples:
            raise SystemExit("--parity needs --samples")
        corpus = CompactCorpus.load(sorted(Path(args.samples).glob("shard-*.npz"))[:1])
        rows = samples(policy, corpus, args.count)
        Path(args.parity).write_text(json.dumps(rows))
        print(f"wrote {len(rows)} parity samples to {args.parity}")


if __name__ == "__main__":
    main()
