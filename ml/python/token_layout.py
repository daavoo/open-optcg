"""The flat observation the token policy reads, and how a bridge payload
becomes one.

SB3 wants a single `Box` per observation, so the token encoding's parts --
global scalars, card tokens, action pointers, privileged tokens -- are packed
into one float vector at fixed offsets. `TokenLayout` is the one place those
offsets are computed; `token_policy.py` splits by it and `bridge_vec_env.py`
packs by it, so the two cannot drift.

Integers (zone, owner, card row, pointer refs) travel as floats and are cast
back with `.long()` on the torch side. Every one of them is small enough to be
exact in float32.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

# Columns of a token wire row, matching `tokenWire` in `ml/bridge/tokens.ts`.
TOKEN_ZONE = 0
TOKEN_OWNER = 1
TOKEN_CARD = 2
TOKEN_HEADER = 3
ZONE_COUNT = 7


@dataclass(frozen=True)
class TokenLayout:
    global_size: int
    token_wire_size: int
    max_tokens: int
    max_privileged: int
    action_feature_size: int
    num_slots: int

    @classmethod
    def from_spec(cls, token_spec: dict[str, Any], num_slots: int) -> TokenLayout:
        return cls(
            global_size=int(token_spec["globalSize"]),
            token_wire_size=int(token_spec["tokenWireSize"]),
            max_tokens=int(token_spec["maxTokens"]),
            max_privileged=int(token_spec["maxPrivilegedTokens"]),
            action_feature_size=int(token_spec["actionFeatureSize"]),
            num_slots=num_slots,
        )

    # Offsets, in order. Each section starts where the previous one ends.
    @property
    def off_global(self) -> int:
        return 0

    @property
    def off_tokens(self) -> int:
        return self.off_global + self.global_size

    @property
    def off_token_count(self) -> int:
        return self.off_tokens + self.max_tokens * self.token_wire_size

    @property
    def off_actions(self) -> int:
        return self.off_token_count + 1

    @property
    def off_action_refs(self) -> int:
        return self.off_actions + self.num_slots * self.action_feature_size

    @property
    def off_action_cards(self) -> int:
        return self.off_action_refs + self.num_slots * 2

    @property
    def off_legal_count(self) -> int:
        return self.off_action_cards + self.num_slots

    @property
    def off_privileged(self) -> int:
        return self.off_legal_count + 1

    @property
    def off_privileged_count(self) -> int:
        return self.off_privileged + self.max_privileged * self.token_wire_size

    @property
    def size(self) -> int:
        return self.off_privileged_count + 1

    def pack(self, payload: dict[str, Any]) -> np.ndarray:
        """One bridge payload (token encoding) as the flat observation."""
        out = np.zeros(self.size, dtype=np.float32)
        out[self.off_global : self.off_tokens] = payload["global"]

        tokens = payload["tokens"][: self.max_tokens]
        if tokens:
            rows = np.asarray(tokens, dtype=np.float32)
            start = self.off_tokens
            out[start : start + rows.size] = rows.reshape(-1)
        out[self.off_token_count] = len(tokens)

        actions = payload["actions"][: self.num_slots]
        if actions:
            rows = np.asarray(actions, dtype=np.float32)
            start = self.off_actions
            out[start : start + rows.size] = rows.reshape(-1)
            refs = np.asarray(payload["actionRefs"][: self.num_slots], dtype=np.float32)
            start = self.off_action_refs
            out[start : start + refs.size] = refs.reshape(-1)
            cards = np.asarray(
                payload["actionCards"][: self.num_slots], dtype=np.float32
            )
            start = self.off_action_cards
            out[start : start + cards.size] = cards
        out[self.off_legal_count] = min(len(payload["actions"]), self.num_slots)

        privileged = payload.get("privileged", [])[: self.max_privileged]
        if privileged:
            rows = np.asarray(privileged, dtype=np.float32)
            start = self.off_privileged
            out[start : start + rows.size] = rows.reshape(-1)
        out[self.off_privileged_count] = len(privileged)
        return out

    def mask(self, payload: dict[str, Any]) -> np.ndarray:
        """Legal slots: the first `legalCount` of `num_slots`, capped."""
        mask = np.zeros(self.num_slots, dtype=bool)
        mask[: min(int(payload.get("legalCount", 0)), self.num_slots)] = True
        return mask
