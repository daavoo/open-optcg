"""Tokenising rendered decisions, and each card's own input text.

A rendered state or action writes every card as a `[[CARD-NUMBER]]`
placeholder. Here each placeholder becomes one CARD_SLOT token whose embedding
the model replaces with that card's vector, so a board of ten cards costs ten
tokens rather than ten paragraphs of printed text. The card vectors come from
encoding each card's own text -- stats from `cards.json`, plus the printed
words when a local pack is supplied -- with the same backbone.

Printed text is read from the player's pack at run time and never written
anywhere under the repo.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer

PLACEHOLDER = re.compile(r"\[\[([^\]]+)\]\]")

# Ettin's vocabulary is padded past the tokenizer's last real id; one of the
# padding rows is the slot a card vector is written into.
CARD_SLOT = 50300
CLS = 50281
SEP = 50282
PAD = 50283

DEFAULT_PACK = Path.home() / "Desktop/open-optcg/open-optcg-assets/printed-text.json"


@lru_cache(maxsize=None)
def tokenizer(repo: str = "jhu-clsp/ettin-encoder-68m") -> Tokenizer:
    return Tokenizer.from_file(hf_hub_download(repo, "tokenizer.json"))


@dataclass
class Encoded:
    ids: list[int]
    cards: list[str]  # the card number behind each CARD_SLOT, in order


def encode(text: str, tok: Tokenizer | None = None) -> Encoded:
    """Word-piece ids for `text` with each placeholder as one CARD_SLOT."""
    tok = tok or tokenizer()
    ids: list[int] = []
    cards: list[str] = []
    cursor = 0
    for match in PLACEHOLDER.finditer(text):
        if match.start() > cursor:
            ids.extend(tok.encode(text[cursor : match.start()], add_special_tokens=False).ids)
        ids.append(CARD_SLOT)
        cards.append(match.group(1))
        cursor = match.end()
    if cursor < len(text):
        ids.extend(tok.encode(text[cursor:], add_special_tokens=False).ids)
    return Encoded(ids, cards)


def load_card_table(path: Path) -> dict[str, dict]:
    return json.loads(path.read_text())


def load_printed_text(path: Path | None = DEFAULT_PACK) -> dict[str, dict]:
    """The player's local pack, or nothing: the model runs text-free without it."""
    if path is None or not path.exists():
        return {}
    return json.loads(path.read_text())["cards"]


def card_text(number: str, facts: dict, printed: dict[str, dict]) -> str:
    """One card's input text: functional facts, then its printed words if known."""
    parts = [
        facts["name"],
        facts["category"].lower(),
        f"cost {facts['cost']}",
    ]
    if facts["power"]:
        parts.append(f"power {facts['power']}")
    if facts["counter"]:
        parts.append(f"counter {facts['counter']}")
    parts.append("/".join(facts["colors"]).lower())
    if facts["types"]:
        parts.append("/".join(facts["types"]))
    if facts["keywords"]:
        parts.append(", ".join(k.lower() for k in facts["keywords"]))
    text = " | ".join(parts)
    words = printed.get(number)
    if words:
        if words.get("effect"):
            text += f"\n{words['effect']}"
        if words.get("trigger"):
            text += f"\n[Trigger] {words['trigger']}"
    return text
