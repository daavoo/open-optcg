"""Token budget of the rendered corpus: what sizes the model's sequences.

    .venv/bin/python -m sys1.stats data/corpus-<key>
"""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import numpy as np

from .text import card_text, encode, load_card_table, load_printed_text, tokenizer


def pct(values, name):
    a = np.asarray(values)
    print(
        f"{name:28s} n={len(a):>8d} mean={a.mean():7.1f} p50={np.percentile(a, 50):6.0f} "
        f"p95={np.percentile(a, 95):6.0f} p99={np.percentile(a, 99):6.0f} max={a.max():6d}"
    )


def main(root: str) -> None:
    tok = tokenizer()
    state_len, action_len, option_count, total_len, slot_count = [], [], [], [], []
    distinct_cards: set[str] = set()
    games = 0
    for path in sorted(Path(root).glob("*.jsonl.gz")):
        with gzip.open(path, "rt") as handle:
            for line in handle:
                game = json.loads(line)
                games += 1
                for decision in game["decisions"]:
                    state = encode(decision["state"], tok)
                    actions = [encode(a, tok) for a in decision["actions"]]
                    state_len.append(len(state.ids))
                    option_count.append(len(actions))
                    action_len.extend(len(a.ids) for a in actions)
                    total_len.append(len(state.ids) + sum(len(a.ids) for a in actions))
                    slot_count.append(len(state.cards))
                    distinct_cards.update(state.cards)
                    for a in actions:
                        distinct_cards.update(a.cards)
    print(f"{games} games, {len(state_len)} decisions, {len(distinct_cards)} distinct cards seen")
    pct(state_len, "state tokens")
    pct(slot_count, "card slots in state")
    pct(option_count, "legal options")
    pct(action_len, "tokens per action")
    pct(total_len, "state + all actions")

    table = load_card_table(Path(root).parent / "cards.json")
    printed = load_printed_text()
    with_text = [len(tok.encode(card_text(n, table[n], printed)).ids) for n in table]
    without = [len(tok.encode(card_text(n, table[n], {})).ids) for n in table]
    pct(without, "card text (facts only)")
    pct(with_text, f"card text (+pack, {len(printed)})")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python -m sys1.stats <corpus directory>")
    main(sys.argv[1])
