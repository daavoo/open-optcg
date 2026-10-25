"""Where the learned model would move differently from the rules agents.

    pnpm exec tsx ml/bridge/dump.ts --prune --games 442 --shard 0/12 \\
      --seed census --out ml/data/census/shard-00.jsonl.gz   # x12
    .venv/bin/python -m sys1.census data/census --checkpoint checkpoints/long-ppo/best \\
      --eval checkpoints/long-eval/long-ppo.json --out data/census-report

The games are rules agent against rules agent (`dump.ts --prune`, which
offers each decision's options as the scorer's seat sees them). The model
scores every decision, and a decision is a disagreement when its top option
is not the one the rules agent chose. Each is tagged with the deck that made
it, the turn, and the kind of each move -- the first word of its option
text, so `end turn -> attack` is a turn the rules agent ended where the model
would have attacked.

The report ranks clusters (deck x turns x rules kind -> model kind) by their
disagreement mass: the summed gap between the model's probability for its
own choice and for the rules agent's. It is a pointer to positions worth
reading, not a verdict: the model's probabilities are a policy, not a value
per move, and on a deck the model pilots no better than its rules agent (the
`model` and `rules` columns) a disagreement is weak evidence. `rules` is read
from the corpus itself: the deck's win rate in these rules-against-rules
games. Every rule it suggests is measured on its own (`pnpm heuristic:probe`).

`rows.jsonl.gz` holds every disagreement with its game's seed and decision
index, to find the position again.
"""

from __future__ import annotations

import argparse
import gzip
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from .policy import Policy

# A gap this large is the model all but sure of a move the rules agent did not make.
CONFIDENT = 0.5


def kind(option: str) -> str:
    words = option.split()
    return " ".join(words[:2]) if words[0] in ("no", "end", "keep") else words[0]


def turns(turn: int) -> str:
    return "1-2" if turn <= 2 else "3-4" if turn <= 4 else "5+"


def games(corpus: Path):
    for shard in sorted(corpus.glob("*.jsonl.gz")):
        with gzip.open(shard, "rt") as handle:
            for line in handle:
                yield json.loads(line)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("corpus", help="a directory of `dump.ts --prune` shards")
    parser.add_argument("--checkpoint", default="checkpoints/long-ppo/best")
    parser.add_argument("--eval", help="a `sys1.evaluate --out` result of the checkpoint: its per-deck rate")
    parser.add_argument("--out", required=True, help="a directory for report.md and rows.jsonl.gz")
    parser.add_argument("--chunk", type=int, default=20000, help="decisions scored per call")
    parser.add_argument("--top", type=int, default=60, help="clusters in the report")
    args = parser.parse_args()
    policy = Policy(Path(args.checkpoint))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    decks_games: dict[str, int] = defaultdict(int)
    decks_wins: dict[str, int] = defaultdict(int)
    decks_decisions: dict[str, int] = defaultdict(int)
    decks_disagree: dict[str, int] = defaultdict(int)
    decks_confident: dict[str, int] = defaultdict(int)
    decks_dominated: dict[str, int] = defaultdict(int)
    # (deck, turns, rules kind) -> decisions; (..., model kind) -> [count, mass, confident]
    offered: dict[tuple, int] = defaultdict(int)
    clusters: dict[tuple, list[float]] = defaultdict(lambda: [0, 0.0, 0])
    rows = gzip.open(out / "rows.jsonl.gz", "wt")
    pending: list[tuple[dict, dict, int]] = []

    def flush() -> None:
        probs, values = policy.score([decision for _, decision, _ in pending])
        for (game, decision, index), p, value in zip(pending, probs, values):
            deck = game[decision["seat"]]
            rules = decision["chosen"]
            top = int(np.argmax(p))
            bucket = turns(decision["turn"])
            rules_kind = kind(decision["actions"][rules])
            offered[(deck, bucket, rules_kind)] += 1
            if top == rules:
                continue
            gap = float(p[top] - p[rules])
            decks_disagree[deck] += 1
            decks_confident[deck] += gap >= CONFIDENT
            entry = clusters[(deck, bucket, rules_kind, kind(decision["actions"][top]))]
            entry[0] += 1
            entry[1] += gap
            entry[2] += gap >= CONFIDENT
            rows.write(json.dumps({
                "seed": game["seed"], "decision": index, "deck": deck,
                "opponent": game["p2" if decision["seat"] == "p1" else "p1"], "turn": decision["turn"],
                "rules": decision["actions"][rules], "model": decision["actions"][top],
                "p_rules": round(float(p[rules]), 4), "p_model": round(float(p[top]), 4),
                "value": round(float(value), 4), "options": len(decision["actions"]),
            }) + "\n")
        pending.clear()

    for game in games(Path(args.corpus)):
        for seat in ("p1", "p2"):
            decks_games[game[seat]] += 1
        if game["winner"] in ("p1", "p2"):
            decks_wins[game[game["winner"]]] += 1
        for index, decision in enumerate(game["decisions"]):
            deck = game[decision["seat"]]
            decks_decisions[deck] += 1
            if decision["chosen"] < 0:
                decks_dominated[deck] += 1
                continue
            pending.append((game, decision, index))
        if len(pending) >= args.chunk:
            flush()
    if pending:
        flush()
    rows.close()

    model = json.loads(Path(args.eval).read_text())["per_deck"] if args.eval else {}
    lines = [
        f"# Census: {args.checkpoint} against the rules agents",
        "",
        f"{sum(decks_games.values()) // 2} games, {sum(decks_decisions.values())} decisions, "
        f"{sum(decks_disagree.values())} disagreements ({sum(decks_confident.values())} with a gap of "
        f"{CONFIDENT} or more), {sum(decks_dominated.values())} dominated moves by the rules agents.",
        "",
        "## Per deck",
        "",
        "Per game the deck played. `model` is the checkpoint's win rate piloting the deck against the "
        "rules agents (`--eval`), `rules` its rules agent's win rate in this corpus (rules agents on "
        "both seats, an unfinished game a loss): not the same test, but a deck where `model` is not well above `rules` is one "
        "where the model is no authority.",
        "",
        "| deck | model | rules | decisions | disagree | confident | dominated |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for deck in sorted(decks_games, key=lambda d: -decks_confident[d] / decks_games[d]):
        n = decks_games[deck]
        lines.append(
            f"| {deck} | {model.get(deck, float('nan')):.2f} | {decks_wins[deck] / n:.2f} | "
            f"{decks_decisions[deck] / n:.1f} | {decks_disagree[deck] / n:.2f} | "
            f"{decks_confident[deck] / n:.2f} | {decks_dominated[deck] / n:.2f} |"
        )
    lines += [
        "",
        f"## The {args.top} largest clusters",
        "",
        "By disagreement mass per game the deck played. `share` is the cluster's disagreements over "
        "every decision of that deck, turns and rules kind.",
        "",
        "| deck | turns | rules -> model | per game | share | mean gap | confident |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    ranked = sorted(clusters.items(), key=lambda kv: -kv[1][1] / decks_games[kv[0][0]])
    for (deck, bucket, rules_kind, model_kind), (count, mass, confident) in ranked[: args.top]:
        lines.append(
            f"| {deck} | {bucket} | {rules_kind} -> {model_kind} | {count / decks_games[deck]:.2f} | "
            f"{count / offered[(deck, bucket, rules_kind)]:.2f} | {mass / count:.2f} | {int(confident)} |"
        )
    by_kind: dict[tuple, list[float]] = defaultdict(lambda: [0, 0.0])
    for (_, bucket, rules_kind, model_kind), (count, mass, _) in clusters.items():
        by_kind[(bucket, rules_kind, model_kind)][0] += count
        by_kind[(bucket, rules_kind, model_kind)][1] += mass
    total_games = sum(decks_games.values())
    lines += [
        "",
        "## Across every deck",
        "",
        "| turns | rules -> model | per game | mean gap |",
        "| --- | --- | --- | --- |",
    ]
    for (bucket, rules_kind, model_kind), (count, mass) in sorted(by_kind.items(), key=lambda kv: -kv[1][1])[:30]:
        lines.append(f"| {bucket} | {rules_kind} -> {model_kind} | {count / total_games:.2f} | {mass / count:.2f} |")
    (out / "report.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines[:3]))
    print(f"report -> {out / 'report.md'}")


if __name__ == "__main__":
    main()
