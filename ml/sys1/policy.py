"""A trained scorer as a policy over rendered decisions."""

from __future__ import annotations

import json
from pathlib import Path

import mlx.core as mx
import numpy as np

from .data import LENGTHS, RENDER_VERSION, SUPPORTED_RENDERS, CardTexts, Corpus, bucket, check_render, collate
from .features import CardFeatures, build_vocab
from .model import Scorer, load_encoder
from .text import load_card_table, load_printed_text

DATA = Path(__file__).resolve().parent.parent / "data"


class Policy:
    def __init__(
        self,
        checkpoint: Path | None,
        model: str = "17m",
        text: str = "pack",
        card_features: bool = False,
        privileged: int = 0,
    ):
        """`card_features` adds the structured card features (`features.py`)
        to a checkpoint that has none; one that has them always keeps them.
        `privileged` likewise adds a critic over that many whole-state features
        (`bridge/privileged.ts`) to a checkpoint without one."""
        config = {}
        if checkpoint:
            config = json.loads((checkpoint / "config.json").read_text())
            model, text = config["model"], config["text"]
        # A new model reads the current render; a checkpoint, the one it was trained on.
        self.render = int(config.get("render", 1)) if checkpoint else RENDER_VERSION
        if checkpoint:
            check_render(self.render, str(checkpoint), SUPPORTED_RENDERS)
        self.card_texts = CardTexts(
            load_card_table(DATA / "cards.json"), load_printed_text() if text == "pack" else {}
        )
        if checkpoint and config["cards"] != self.card_texts.numbers:
            raise SystemExit("card table changed since this checkpoint was trained")
        vocab = config.get("card_feature_vocab") or (build_vocab() if card_features else None)
        adding = vocab is not None and "card_feature_vocab" not in config
        self.privileged = config.get("privileged_features") or privileged
        adding = adding or (self.privileged > 0 and "privileged_features" not in config)
        self.feature_vocab = vocab
        features = CardFeatures.load(self.card_texts.numbers, vocab) if vocab is not None else None
        self.model = Scorer(
            load_encoder(f"jhu-clsp/ettin-encoder-{model}"), len(self.card_texts.numbers), features,
            self.privileged,
        )
        self.model.set_dtype(mx.bfloat16)
        if checkpoint:
            # A checkpoint gaining the features or the critic has none of
            # their weights; they keep their zero start.
            self.model.load_weights(str(checkpoint / "weights.safetensors"), strict=not adding)
        self.refresh()
        # A mask over the card table (`ppo.card_keep`): when set, every
        # decision this policy scores zeroes the learned embedding of the
        # cards it drops. Only a PPO collector sets it.
        self.card_keep: np.ndarray | None = None
        # The model's state is a declared input: without it `compile` bakes
        # the weights in at first trace, and a policy being trained would keep
        # playing its first version.
        self._forward = mx.compile(lambda b, c: self.model(b, c), inputs=[self.model.state])

    def refresh(self) -> None:
        self.card_text = self.card_texts.restore_order(self.model.encode_cards(self.card_texts.chunks()))

    def tokens_of(self, decision: dict):
        """A bridge decision's tokens in this policy's render version: `tokens`
        is in the version `render` names, `tokens_v<n>` in version n."""
        if decision.get("render", RENDER_VERSION) == self.render:
            return decision["tokens"]
        key = f"tokens_v{self.render}"
        if key not in decision:
            raise SystemExit(f"a policy reading render version {self.render} needs the bridge to send {key}")
        return decision[key]

    def corpus(self, decisions: list[dict]) -> Corpus:
        if decisions and "tokens" in decisions[0]:
            if any(d.get("render", RENDER_VERSION) != self.render for d in decisions):
                decisions = [{**d, "tokens": self.tokens_of(d)} for d in decisions]
            return Corpus.from_token_records(
                [{**d, "chosen": 0, "outcome": 0.0, "game": 0} for d in decisions]
            )
        return Corpus.from_records(
            [{**d, "chosen": 0, "outcome": 0.0, "game": 0} for d in decisions],
            self.card_texts.rows,
        )

    def score(self, decisions: list[dict], budget: int = 16384) -> tuple[list[np.ndarray], np.ndarray]:
        """Probabilities over each decision's legal actions, and state values.

        The cost of a forward pass is its padded tokens, so padding is what
        this minimises: decisions are sorted by length and cut into chunks of
        about `budget` tokens, each padded to its own longest member, and each
        chunk's row count rounds up to a multiple of 16 rather than a power of
        two. (Rollouts score a few dozen decisions at a time; power-of-two rows
        and one shared width left most of each batch empty.) Every chunk is
        queued before a single evaluation, so the GPU runs them back to back.
        """
        corpus = self.corpus(decisions)
        # The critic's features, when the decisions carry them; only the value
        # reads them, so the probabilities are the same either way.
        extras = (
            {"privileged": np.array([d["privileged"] for d in decisions], dtype=np.float32)}
            if self.privileged and decisions and "privileged" in decisions[0]
            else None
        )
        order = np.argsort(corpus.lengths, kind="stable")
        chunks: list[np.ndarray] = []
        start = 0
        while start < len(order):
            end = start + 1
            while end < len(order):
                width = bucket(int(corpus.lengths[order[end]]), LENGTHS)
                if width * (end - start + 1) > budget:
                    break
                end += 1
            chunks.append(order[start:end])
            start = end
        pending = []
        for group in chunks:
            padded = -(-len(group) // 16) * 16
            batch = collate(corpus, group, padded, extras)
            if self.card_keep is not None:
                batch["card_keep"] = mx.array(np.broadcast_to(self.card_keep, (padded, len(self.card_keep))))
            logits, value = self._forward(batch, self.card_text)
            pending.append((group, mx.softmax(logits, axis=-1), value))
        mx.eval([(p, v) for _, p, v in pending])
        probs: list[np.ndarray] = [np.empty(0)] * len(decisions)
        values = np.zeros(len(decisions), dtype=np.float32)
        for group, p, value in pending:
            p, value = np.array(p), np.array(value)
            for row, index in enumerate(group):
                probs[index] = p[row, : corpus.options[index]]
                values[index] = value[row]
        return probs, values


def load_policy(checkpoint: Path | None):
    """A text-scorer `Policy`, or a `compact.CompactPolicy` for a checkpoint of the small scorer."""
    from .compact import CompactPolicy, is_compact

    if checkpoint is not None and is_compact(checkpoint):
        return CompactPolicy(checkpoint)
    return Policy(checkpoint)
