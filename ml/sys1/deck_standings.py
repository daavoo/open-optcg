"""How a checkpoint does with each selectable deck, for the app's deck picker.

    .venv/bin/python -m sys1.deck_standings checkpoints/<run>/final --games 10 \\
        --model model-<run> --out data/deck-standings.json

The checkpoint pilots both seats of every game, so a deck's rate says how the
model plays that list against the rest of the field, not how the rules agents
do. Every ordered pairing of two distinct selectable decks -- the decks a
player can pick in the app, without the training-only lists and variants --
is played `--games` times, so each deck plays every other `--games` times from
each seat. The seed depends on the two decks and the repetition, not on which
sits on p1, so a pairing and its seat swap are the same game with the seats
traded and the first-player edge cancels out of the rates.

A deck's win rate is over all its finished games, both seats. A game with no
winner (truncated at the turn limit) counts for neither deck and is reported
in `truncated`.

The output is the `deck-standings.json` release asset beside
`scorer-model.json` (ml/README.md, "Publishing it"):

    {"model": "model-<run>", "decks": {"<deck id>": {"winRate": 0.57, "games": 980}}}

`pnpm model:fetch` downloads it and the web build orders the deck picker's
Community shelf by `winRate`. `--decks FILE` (one deck id a line) limits the
field, for a smoke run.

The planned game count is printed first. SIGTERM or Ctrl-C stops the run at
the next step and writes what has finished, marked `partial`; the games are
ordered repetition by repetition, so a run cut short has played every pairing
about as often.
"""

from __future__ import annotations

import argparse
import json
import signal
import time
from pathlib import Path

from .env import VectorEnv
from .evaluate import play, read_deck_list, selectable_decks
from .policy import load_policy


def plan(decks: list[str], games: int, seed: str) -> list[dict]:
    """Every game: repetition by repetition, each ordered pairing once per
    repetition, with a pairing and its seat swap on one seed."""
    specs = []
    for rep in range(games):
        for p1 in decks:
            for p2 in decks:
                if p1 == p2:
                    continue
                first, second = sorted((p1, p2))
                specs.append({
                    "p1": p1, "p2": p2, "seed": f"{seed}-{first}-{second}-{rep}", "rules": "none",
                    "seats": {"p1": "model", "p2": "model"},
                })
    return specs


def standings(decks: list[str], games: list[dict]) -> tuple[dict[str, dict], int]:
    """Per deck {winRate, games, truncated}, and the count of games with no
    winner. A deck with no finished game is left out: it has no rate to sort
    on."""
    won = {d: 0 for d in decks}
    played = {d: 0 for d in decks}
    cut = {d: 0 for d in decks}
    truncated = 0
    for game in games:
        spec = game["spec"]
        if game["truncated"]:
            truncated += 1
            cut[spec["p1"]] += 1
            cut[spec["p2"]] += 1
            continue
        for seat in ("p1", "p2"):
            played[spec[seat]] += 1
            won[spec[seat]] += int(game["winner"] == seat)
    rows = {
        d: {"winRate": won[d] / played[d], "games": played[d], "truncated": cut[d]}
        for d in decks
        if played[d]
    }
    return rows, truncated


def model_name(checkpoint: str) -> str:
    """`checkpoints/<run>/final` is named after its run."""
    path = Path(checkpoint)
    return path.parent.name if path.name == "final" else path.name


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("checkpoint", help="the model that pilots both seats of every game")
    parser.add_argument("--games", type=int, default=10,
                        help="games per ordered pairing, so twice this per pair of decks")
    parser.add_argument("--decks", help="a deck list file: only these decks (default: every selectable deck)")
    parser.add_argument("--model", help="the release the standings ship with (default: the run's name)")
    parser.add_argument("--seed", default="deck-standings")
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--concurrent", type=int, default=320)
    parser.add_argument("--out", required=True, help="where to write deck-standings.json")
    args = parser.parse_args()
    if args.games < 1:
        raise SystemExit("--games must be at least 1")

    env = VectorEnv(args.workers)
    decks = selectable_decks(env)
    if args.decks:
        wanted = read_deck_list(Path(args.decks))
        if unknown := wanted - set(decks):
            raise SystemExit(f"not selectable decks: {sorted(unknown)}")
        decks = [d for d in decks if d in wanted]
    if len(decks) < 2:
        raise SystemExit("need at least two decks")
    specs = plan(decks, args.games, args.seed)
    print(f"{len(specs)} games planned: {len(decks)} decks, {len(decks) * (len(decks) - 1)} ordered pairings, "
          f"{args.games} per pairing", flush=True)

    policy = load_policy(Path(args.checkpoint))
    stop = {"asked": False}

    def ask_stop(signum, frame) -> None:
        stop["asked"] = True
        print("stopping: writing the games finished so far", flush=True)
        signal.signal(signal.SIGTERM, signal.SIG_DFL)
        signal.signal(signal.SIGINT, signal.default_int_handler)

    signal.signal(signal.SIGTERM, ask_stop)
    signal.signal(signal.SIGINT, ask_stop)

    started = time.perf_counter()
    games = play(env, specs, {"model": policy}, concurrent=args.concurrent, stop=lambda: stop["asked"])
    seconds = time.perf_counter() - started
    env.close()

    rows, truncated = standings(decks, games)
    result = {
        "model": args.model or model_name(args.checkpoint),
        "checkpoint": args.checkpoint,
        "seed": args.seed,
        "games_per_pairing": args.games,
        "games_planned": len(specs),
        "games_played": len(games),
        "truncated": truncated,
        "partial": len(games) < len(specs),
        "seconds": seconds,
        "decks": dict(sorted(rows.items(), key=lambda item: -item[1]["winRate"])),
    }
    Path(args.out).write_text(json.dumps(result, indent=1))
    print(f"{len(games)} games in {seconds:.0f}s, {truncated} truncated"
          + (" (partial: stopped early)" if result["partial"] else ""), flush=True)
    for deck, row in result["decks"].items():
        print(f'{row["winRate"]:.3f}  {row["games"]:>5}  {deck}')


if __name__ == "__main__":
    main()
