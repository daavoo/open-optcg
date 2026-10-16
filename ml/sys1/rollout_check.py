"""CPU-only check of `compact_ppo.Rollouts`: the bridge protocol the trainer
drives, played by a uniform-random policy so no model runs.

    .venv/bin/python -m sys1.rollout_check --collections 6 --decisions 20000
    .venv/bin/python -m sys1.rollout_check --league 0.3 --pilot-decks meta-decks.txt

`Rollouts.collect` keeps two groups of games in flight and restarts a game
inside the step that ends it (server.ts `step`'s `next`), so a bookkeeping
slip shows up as a deadlock, a trajectory cut short, or a slot that is never
played again rather than as an error. After every collection this checks:

- every trajectory ends with a reward of +1, -1 or 0 and has 0 before that;
- each self-play game gave two trajectories with opposite results;
- every slot is either open on a decision or waiting on a relaunch, and an
  open decision is the learner's, a league opponent's (never recorded), or,
  with pilot decks, a self-play seat on a deck that is not one;
- with `--league`, league games were played and every member was scored by
  its own policy; with `--pilot-decks`, every trajectory piloted one;
- most games restarted through `next` rather than through a relaunch.
"""

from __future__ import annotations

import argparse
import os
import time
from collections import Counter

import numpy as np


class RandomPolicy:
    """`Policy.score`'s shape: uniform over each decision's options, value 0.
    `scored` counts the decisions it was given."""

    scored = 0

    def score(self, decisions: list[dict]):
        self.scored += len(decisions)
        probs = [np.full(len(d["compact"]["options"]), 1.0 / len(d["compact"]["options"])) for d in decisions]
        return probs, np.zeros(len(decisions), dtype=np.float32)


def check(rollouts, batch: list[list[dict]], pilot: frozenset[str] | None = None) -> dict:
    rewards = Counter()
    for steps in batch:
        assert steps, "an empty trajectory was returned"
        assert all(s["reward"] == 0.0 for s in steps[:-1]), "a reward before the last decision"
        assert steps[-1]["reward"] in (1.0, -1.0, 0.0), f"last reward {steps[-1]['reward']}"
        assert len({s["seat"] for s in steps}) == 1, "a trajectory mixes seats"
        if pilot:
            assert steps[0]["deck"] in pilot, f"a trajectory piloted {steps[0]['deck']}, not a pilot deck"
        rewards[steps[-1]["reward"]] += 1
    # Nothing is in flight after `collect`: every slot is open or dead.
    open_, dead = set(rollouts.open), set(rollouts.dead)
    assert not open_ & dead, "a slot is both open and dead"
    assert open_ | dead == set(range(rollouts.concurrent)), (
        f"slots neither open nor dead: {sorted(set(range(rollouts.concurrent)) - open_ - dead)[:10]}"
    )
    for slot, decision in rollouts.open.items():
        assert slot in rollouts.learner, f"open slot {slot} has no learner seats"
        seat, opponent = decision["seat"], rollouts.opponent.get(slot)
        if opponent and opponent[0] == seat:
            assert seat not in rollouts.learner[slot], f"slot {slot} records its league opponent's seat"
            assert rollouts.kind[slot] == "league", f"slot {slot} has an opponent but is {rollouts.kind[slot]}"
        elif seat not in rollouts.learner[slot]:
            assert pilot and rollouts.kind[slot] == "self", f"slot {slot} is open on a seat nobody records"
            assert rollouts.decks[slot][seat] not in pilot, f"slot {slot} drops a pilot deck's seat"
        else:
            assert (slot, seat) in rollouts.steps, f"slot {slot} has no trajectory for its seat"
    return {"trajectories": len(batch), "decisions": sum(map(len, batch)), "rewards": dict(rewards)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--collections", type=int, default=6)
    parser.add_argument("--decisions", type=int, default=20000)
    parser.add_argument("--concurrent", type=int, default=256)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--rules", type=float, default=0.3)
    parser.add_argument("--league", type=float, default=0.0, help="share of games against league members")
    parser.add_argument("--pilot-decks")
    parser.add_argument("--mirror", type=float, default=0.0)
    parser.add_argument("--close", type=float, default=0.0)
    args = parser.parse_args()

    os.environ["SYS1_RENDERS"] = "none"
    os.environ["SYS1_COMPACT"] = "1"
    from .compact_ppo import League, Rollouts
    from .env import VectorEnv
    from .evaluate import catalog, read_deck_list

    env = VectorEnv(args.workers)
    deck_ids, _ = catalog(env)
    pilot = read_deck_list(args.pilot_decks) if args.pilot_decks else None
    league, members = None, {}
    if args.league > 0:
        league = League(np.random.default_rng(1), size=3)
        # Four members into a league of three: one is evicted, possibly mid-game.
        for name in ("a", "b", "c", "d"):
            members[name] = RandomPolicy()
            league.add(name, members[name])
    rollouts = Rollouts(env, args.concurrent, args.workers, args.rules, np.random.default_rng(0), "rollout-check",
                        league=league, league_share=args.league,
                        pilot=sorted(pilot) if pilot else None, deck_ids=deck_ids,
                        mirror=args.mirror, close=args.close)
    begun_by_next = 0
    begin = rollouts.begin

    def counting_begin(slot: int) -> None:
        nonlocal begun_by_next
        begun_by_next += 1
        begin(slot)

    policy = RandomPolicy()
    try:
        t0 = time.perf_counter()
        batch = rollouts.start()
        rollouts.begin = counting_begin  # from here on, `begin` only runs for a `next` or a relaunch
        relaunched = 0
        relaunch = rollouts.relaunch

        def counting_relaunch():
            nonlocal relaunched
            relaunched += len(rollouts.dead)
            return relaunch()

        rollouts.relaunch = counting_relaunch
        for collection in range(args.collections):
            batch = rollouts.collect(policy, collection, args.decisions, batch)
            report = check(rollouts, batch, pilot)
            results = rollouts.take_results()
            # Both seats of a self-play game are recorded, with opposite results.
            by_game: dict[str, list[float]] = {}
            for steps in batch:
                by_game.setdefault(steps[0]["game_seed"], []).append(steps[-1]["reward"])
            pairs = [r for r in by_game.values() if len(r) == 2]
            assert all(a == -b for a, b in pairs), "a self-play game's two seats did not get opposite results"
            assert all(len(r) <= 2 for r in by_game.values()), "a game gave more than two trajectories"
            report["self_play_pairs"] = len(pairs)
            if rollouts.draws:
                # Python drew every pairing, so every trajectory names its deck.
                assert all(steps[0]["deck"] != "random" for steps in batch), "a drawn game's deck is unknown"
                by_seed: dict[str, set[str]] = {}
                for steps in batch:
                    by_seed.setdefault(steps[0]["game_seed"], set()).add(steps[0]["deck"])
                report["mirror_pairs"] = sum(len(r) == 2 and len(by_seed[seed]) == 1 for seed, r in by_game.items())
                report["decks_rated"] = len(rollouts.strength)
            if league:
                report["league"] = league.table()
            print({"collection": collection, **report, **results, "dead_now": len(rollouts.dead)}, flush=True)
            assert results["failed"] == 0, "the engine threw in a game"
            if league:
                assert results["league_games"] > 0, "no league game finished"
            batch = []
        elapsed = time.perf_counter() - t0
        restarts = begun_by_next
        print({
            "seconds": round(elapsed, 1),
            "restarts_through_next_or_relaunch": restarts,
            "slots_relaunched": relaunched,
            "share_through_next": round(1 - relaunched / max(restarts, 1), 3),
        })
        assert relaunched < restarts / 2, "most games restarted through a relaunch, not through `next`"
        if args.mirror:
            assert report["mirror_pairs"] > 0, "no mirror game was played"
        if league:
            kept = [m["policy"] for m in league.members.values()]
            assert all(m.scored for m in kept), "a league member was never asked for a move"
        print("ok")
    finally:
        env.close()


if __name__ == "__main__":
    main()
