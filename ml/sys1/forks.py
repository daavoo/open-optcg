"""Would the rules agent win more by following the model? The census's
clusters, measured by replaying their positions.

    .venv/bin/python -m sys1.forks pick data/census-long-ppo-report data/census-long-ppo \\
      --clusters 30 --per 300 --out data/census-forks/targets.jsonl
    pnpm exec tsx ml/bridge/fork.ts --targets .../targets.jsonl --shard 0/12 \\
      --out .../result-00.jsonl   # x12
    .venv/bin/python -m sys1.forks read data/census-forks/targets.jsonl data/census-forks/result-*.jsonl

`pick` takes the census's largest clusters (deck x turns x rules kind ->
model kind, by disagreement mass) and draws a sample of each one's
disagreements. `fork.ts` replays each game to its decision, plays the
model's option instead of the rules agent's, and lets the rules agents
finish. `read` compares each fork's result with the recorded game's.

Both games are the same up to the fork and are played by the same agents
after it, so the paired difference is the effect of that one move followed
by the rules agent -- which is what a rule making that move would buy. The
engine's random draws after the fork differ between the two, which adds
noise but no bias. A game cut off at the action cap counts half.
"""

from __future__ import annotations

import argparse
import gzip
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from .census import games, kind, turns


def cluster_of(row: dict) -> tuple[str, str, str, str]:
    return (row["deck"], turns(row["turn"]), kind(row["rules"]), kind(row["model"]))


def score(winner: str | None, truncated: bool, seat: str) -> float:
    return 0.5 if truncated or winner is None else float(winner == seat)


def pick(args) -> None:
    rows = [json.loads(line) for line in gzip.open(Path(args.report) / "rows.jsonl.gz", "rt")]
    mass: dict[tuple, float] = defaultdict(float)
    members: dict[tuple, list[dict]] = defaultdict(list)
    for row in rows:
        mass[cluster_of(row)] += row["p_model"] - row["p_rules"]
        members[cluster_of(row)].append(row)
    chosen = sorted(mass, key=lambda c: -mass[c])[: args.clusters]
    recorded = {
        game["seed"]: {key: game[key] for key in ("p1", "p2", "winner", "truncated")}
        for game in games(Path(args.corpus))
    }
    rng = np.random.default_rng(args.seed)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with out.open("w") as handle:
        for cluster in chosen:
            pool = members[cluster]
            for i in rng.choice(len(pool), size=min(args.per, len(pool)), replace=False):
                row = pool[int(i)]
                game = recorded[row["seed"]]
                seat = "p1" if game["p1"] == row["deck"] else "p2"
                handle.write(json.dumps({
                    "id": count, "cluster": list(cluster), "seed": row["seed"], "p1": game["p1"], "p2": game["p2"],
                    "seat": seat, "decision": row["decision"], "rules": row["rules"], "model": row["model"],
                    "gap": round(row["p_model"] - row["p_rules"], 4),
                    "base": score(game["winner"], game["truncated"], seat),
                }) + "\n")
                count += 1
    print(f"{count} targets from {len(chosen)} clusters -> {out}")


def read(args) -> None:
    targets = {t["id"]: t for t in map(json.loads, Path(args.targets).read_text().splitlines())}
    by_cluster: dict[tuple, list[float]] = defaultdict(list)
    diverged: dict[tuple, int] = defaultdict(int)
    base: dict[tuple, list[float]] = defaultdict(list)
    for path in args.results:
        for line in Path(path).read_text().splitlines():
            result = json.loads(line)
            target = targets[result["id"]]
            cluster = tuple(target["cluster"])
            if result["status"] != "forked":
                diverged[cluster] += 1
                continue
            fork = score(result["winner"], result["truncated"], target["seat"])
            by_cluster[cluster].append(fork - target["base"])
            base[cluster].append(target["base"])
    rows = []
    for cluster, diffs in by_cluster.items():
        d = np.array(diffs)
        se = d.std(ddof=1) / np.sqrt(len(d)) if len(d) > 1 else float("inf")
        rows.append((cluster, len(d), float(np.mean(base[cluster])), float(d.mean()), float(se)))
    rows.sort(key=lambda r: -r[3] / r[4] if r[4] > 0 else 0)
    lines = [
        "| deck | turns | rules -> model | forks | recorded win | change | ± |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for (deck, bucket, rules_kind, model_kind), n, won, change, se in rows:
        lines.append(
            f"| {deck} | {bucket} | {rules_kind} -> {model_kind} | {n} | {won:.2f} | {change:+.3f} | {se:.3f} |"
        )
    total = sum(len(d) for d in by_cluster.values())
    lines.append("")
    lines.append(f"{total} forks played, {sum(diverged.values())} diverged before their decision.")
    text = "\n".join(lines) + "\n"
    if args.out:
        Path(args.out).write_text(text)
    print(text)


def main() -> None:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("pick", help="sample the census's largest clusters into fork targets")
    p.add_argument("report", help="a `sys1.census --out` directory")
    p.add_argument("corpus", help="the `dump.ts --prune` corpus the census scored")
    p.add_argument("--clusters", type=int, default=30)
    p.add_argument("--per", type=int, default=300, help="disagreements sampled per cluster")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--out", required=True)
    r = commands.add_parser("read", help="each cluster's paired change in the rules agent's win rate")
    r.add_argument("targets")
    r.add_argument("results", nargs="+")
    r.add_argument("--out")
    args = parser.parse_args()
    pick(args) if args.command == "pick" else read(args)


if __name__ == "__main__":
    main()
