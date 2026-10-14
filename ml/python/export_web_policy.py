"""Exports a trained sealed checkpoint's actor to a JSON weight file the
browser can run without any Python/torch/ONNX runtime.

The actor (`CandidateActorCriticPolicy` in `candidate_policy.py`) is small
enough -- two small `tanh` MLPs, no attention, no normalization layers -- that
hand-porting the forward pass to plain TypeScript is simpler and lighter than
shipping an ONNX runtime into a "no server, no account" static HTML artifact.
Only the actor (`context_net` + `slot_net`) is exported; the critic
(`critic_net` + `value_net`) only matters for training, not for choosing a
move, so it is dropped.

    python export_web_policy.py checkpoints/op17-sealed-ppo.zip \
        ../../packages/web/src/learned-sealed-policy.json
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from sb3_contrib import MaskablePPO

from candidate_policy import CandidateActorCriticPolicy


def _mlp_layers(sequential: Iterable[Any]) -> list[dict[str, Any]]:
    """One entry per `nn.Linear` in a `_mlp(...)` Sequential, skipping the
    `Tanh` modules the browser side re-applies by convention (every layer but
    the last is followed by tanh; see `learned-sealed-agent.ts`)."""
    layers: list[dict[str, Any]] = []
    for module in sequential:
        if module.__class__.__name__ != "Linear":
            continue
        weight = module.weight.detach().cpu().numpy()  # (out, in)
        bias = module.bias.detach().cpu().numpy()  # (out,)
        layers.append(
            {
                "inDim": int(weight.shape[1]),
                "outDim": int(weight.shape[0]),
                # Row-major (out, in), matching a plain JS nested-loop matvec.
                "weight": [[round(float(v), 6) for v in row] for row in weight],
                "bias": [round(float(v), 6) for v in bias],
            }
        )
    return layers


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint")
    parser.add_argument("out")
    args = parser.parse_args()

    model = MaskablePPO.load(args.checkpoint, device="cpu")
    policy = model.policy
    if not isinstance(policy, CandidateActorCriticPolicy):
        raise SystemExit(
            "export_web_policy only supports the pointer/CandidateActorCriticPolicy "
            f"checkpoints; got {type(policy).__name__}"
        )

    context_layers = _mlp_layers(policy.context_net)
    slot_layers = _mlp_layers(policy.slot_net)
    payload = {
        "globalSize": policy.global_size,
        "rowSize": policy.row_size,
        "numSlots": policy.num_slots,
        "contextLayers": context_layers,
        "slotLayers": slot_layers,
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload))

    context_params = sum(
        len(layer["bias"]) * (layer["inDim"] + 1) for layer in context_layers
    )
    slot_params = sum(
        len(layer["bias"]) * (layer["inDim"] + 1) for layer in slot_layers
    )
    print(
        f"wrote {out_path} ({out_path.stat().st_size / 1024:.0f} KB): "
        f"global={payload['globalSize']} row={payload['rowSize']} "
        f"slots={payload['numSlots']} params={context_params + slot_params:,}"
    )


if __name__ == "__main__":
    main()
