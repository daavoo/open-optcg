"""A round-robin between checkpoints and the rules agents, fitted to Elo.

    .venv/bin/python -m sys1.ladder checkpoints/bc-17m-30k checkpoints/run2-ppo/iter-* \\
        checkpoints/run2-ppo/best --games 620

Every pair of entries plays the same paired, seat-swapped games (`evaluate.
head_to_head`; the rules agents enter through `play_vs_rules`), and the
results are fitted to a Bradley-Terry model on the Elo scale with the rules
agents pinned at 0. A single number against one fixed opponent cannot show a
checkpoint that gains on the rules agents by exploiting them, or two that
beat each other in a cycle; the matrix beside the ratings shows both.

Results are kept in `--out` keyed by each checkpoint's weights file, so adding
an entry plays only the pairs it is in, and a checkpoint rewritten in place
is played again.
"""

from __future__ import annotations

import argparse
import itertools
import json
from pathlib import Path

import numpy as np

from .env import VectorEnv
from .evaluate import head_to_head, play_vs_rules
from .policy import Policy, load_policy

RULES = "rules"


def key(entry: str) -> str:
    if entry == RULES:
        return RULES
    weights = Path(entry) / "weights.safetensors"
    stat = weights.stat()
    return f"{weights.resolve()}:{stat.st_size}:{int(stat.st_mtime)}"


def fit(names: list[str], wins: np.ndarray, anchor: int) -> tuple[np.ndarray, np.ndarray]:
    """Elo ratings and standard errors from a matrix of wins (row beat column).

    Newton's method on the Bradley-Terry log-likelihood with one rating held
    at 0; the errors are from the inverse Fisher information of the rest.
    """
    n = len(names)
    scale = np.log(10) / 400
    ratings = np.zeros(n)
    free = [i for i in range(n) if i != anchor]
    games = wins + wins.T
    for _ in range(100):
        p = 1 / (1 + np.exp(-scale * (ratings[:, None] - ratings[None, :])))
        grad = scale * (wins - games * p).sum(axis=1)
        info = scale**2 * games * p * (1 - p)
        hessian = np.diag(info.sum(axis=1)) - info
        h = hessian[np.ix_(free, free)] + 1e-9 * np.eye(len(free))
        step = np.linalg.solve(h, grad[free])
        ratings[free] += step
        if np.abs(step).max() < 1e-6:
            break
    errors = np.zeros(n)
    errors[free] = np.sqrt(np.diag(np.linalg.inv(h)))
    return ratings, errors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("entries", nargs="+", help="checkpoint directories")
    parser.add_argument("--no-rules", action="store_true", help="leave the rules agents out")
    parser.add_argument("--games", type=int, default=620, help="paired games per pair of entries")
    parser.add_argument("--seed", default="ladder")
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--out", default="checkpoints/ladder.json")
    args = parser.parse_args()

    names = ([] if args.no_rules else [RULES]) + [str(Path(e)) for e in args.entries]
    keys = [key(name) for name in names]
    out = Path(args.out)
    store = json.loads(out.read_text()) if out.exists() else {}
    results: dict = store.get("results", {})

    def cache_key(a: str, b: str) -> str:
        return f"{a}|{b}|{args.seed}|{args.games}"

    todo = [
        (i, j)
        for i, j in itertools.combinations(range(len(names)), 2)
        if cache_key(keys[i], keys[j]) not in results and cache_key(keys[j], keys[i]) not in results
    ]
    if todo:
        policies = {i: load_policy(Path(names[i])) for i in range(len(names)) if names[i] != RULES}
        env = VectorEnv(args.workers)
        try:
            for i, j in todo:
                if names[i] == RULES:
                    i, j = j, i
                if names[j] == RULES:
                    r = play_vs_rules(policies[i], env, args.games, args.seed)
                else:
                    r = head_to_head(policies[i], policies[j], env, args.games, args.seed)
                results[cache_key(keys[i], keys[j])] = {"wins": r["wins"], "losses": r["games"] - r["wins"]}
                print(f"{names[i]} vs {names[j]}: {r['win_rate']:.3f} ± {r['ci95']:.3f}", flush=True)
                out.write_text(json.dumps({"results": results}, indent=1))
        finally:
            env.close()

    wins = np.zeros((len(names), len(names)))
    for i, j in itertools.permutations(range(len(names)), 2):
        r = results.get(cache_key(keys[i], keys[j]))
        if r:
            wins[i, j] += r["wins"]
            wins[j, i] += r["losses"]
    # Half a win each way per pair played keeps a clean sweep finite.
    played = (wins + wins.T) > 0
    ratings, errors = fit(names, wins + 0.5 * played, 0)
    order = np.argsort(-ratings)
    labels = {i: chr(ord("A") + rank) for rank, i in enumerate(order)}

    pinned = "the rules agents" if names[0] == RULES else names[0]
    print(f"\n{'':3} {'Elo':>6} {'±':>4}  entry  ({pinned} pinned at 0)")
    for i in order:
        print(f"{labels[i]:3} {ratings[i]:6.0f} {1.96 * errors[i]:4.0f}  {names[i]}")
    print("\nrow's win rate against column")
    print("    " + "".join(f"{labels[j]:>6}" for j in order))
    for i in order:
        cells = []
        for j in order:
            games = wins[i, j] + wins[j, i]
            cells.append("     -" if i == j or not games else f"{wins[i, j] / games:6.2f}")
        print(f"{labels[i]:3} " + "".join(cells))

    out.write_text(
        json.dumps(
            {
                "results": results,
                "ladder": [
                    {"entry": names[i], "elo": float(ratings[i]), "ci95": float(1.96 * errors[i])}
                    for i in order
                ],
            },
            indent=1,
        )
    )


if __name__ == "__main__":
    main()
