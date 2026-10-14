"""Which deck pairings the PPO rollouts play.

By default the bridge draws two distinct decks uniformly. A `Pairings`
sampler draws them in Python instead, from two ingredients:

- mirrors: a share of games puts the same deck on both sides. Deck strength
  cancels, so the result is the pilots' alone.
- variance weighting: the other games favour close matchups, weighted by
  p(1 - p), where p is one deck's win rate against the other in the
  rules-vs-rules corpus. A matchup one deck wins nine times in ten is mostly
  decided before either pilot moves; the value head learns that and the
  game's advantages come out near zero, so it costs rollout time and teaches
  little. A uniform floor keeps every pairing in the mix, so no matchup is
  forgotten and a prior that is wrong about one cannot starve it.

The weights come from the rules agents on both seats, not from the learner:
they measure the decks, which is what makes a matchup lopsided whoever
pilots it.
"""

from __future__ import annotations

import gzip
import json
import re
from pathlib import Path

import numpy as np

HEADER = re.compile(r'"p1":\s*"((?:[^"\\]|\\.)*)",\s*"p2":\s*"((?:[^"\\]|\\.)*)".*?"winner":\s*(null|"p1"|"p2")')


def matchup_matrix(corpus: Path) -> dict[tuple[str, str], tuple[int, int]]:
    """(deck a, deck b) -> (a's wins, games) over every game between them,
    either seat, from a rendered corpus's shards."""
    counts: dict[tuple[str, str], list[int]] = {}
    for shard in sorted(corpus.glob("*.jsonl.gz")):
        with gzip.open(shard, "rt") as handle:
            for line in handle:
                # Each line carries every decision of the game; only its
                # header is needed, which precedes them.
                match = HEADER.search(line, 0, 2000)
                if not match or match.group(3) == "null":
                    continue
                p1, p2 = json.loads(f'"{match.group(1)}"'), json.loads(f'"{match.group(2)}"')
                winner = p1 if match.group(3) == '"p1"' else p2
                for a, b in ((p1, p2), (p2, p1)):
                    entry = counts.setdefault((a, b), [0, 0])
                    entry[0] += winner == a
                    entry[1] += 1
    return {pair: (wins, games) for pair, (wins, games) in counts.items()}


class Pairings:
    def __init__(
        self,
        decks: list[str],
        mirror: float = 0.0,
        matrix: dict[tuple[str, str], tuple[int, int]] | None = None,
        floor: float = 1.0,
    ):
        self.decks = decks
        self.mirror = mirror
        self.pairs = [(a, b) for a in decks for b in decks if a != b]
        self.index = {pair: i for i, pair in enumerate(self.pairs)}
        uniform = np.full(len(self.pairs), 1.0 / len(self.pairs))
        if matrix is None or floor >= 1.0:
            self.weights = uniform
        else:
            # A pair missing from the corpus, or seen a handful of times,
            # reads as even: the smoothing pulls it towards 0.5.
            p = np.array([(matrix.get(pair, (0, 0))[0] + 2) / (matrix.get(pair, (0, 0))[1] + 4) for pair in self.pairs])
            variance = p * (1 - p)
            self.weights = floor * uniform + (1 - floor) * variance / variance.sum()

    def importance(self, p1: str, p2: str) -> float:
        """The weight that turns a game drawn here into one drawn uniformly
        over distinct pairs: the uniform probability over the probability
        this sampler gave it. A mirror is outside that distribution: 0."""
        if p1 == p2:
            return 0.0
        drawn = (1 - self.mirror) * self.weights[self.index[(p1, p2)]]
        return (1.0 / len(self.pairs)) / drawn

    def draw(self, rng) -> tuple[str, str]:
        if rng.random() < self.mirror:
            deck = self.decks[int(rng.integers(len(self.decks)))]
            return deck, deck
        return self.pairs[int(rng.choice(len(self.pairs), p=self.weights))]

    def summary(self) -> dict:
        """How the non-mirror games split by how lopsided their matchup is."""
        return {"mirror": self.mirror, "pairs": len(self.pairs), "max_weight_ratio": float(self.weights.max() / self.weights.min())}
