"""Head-to-head: a checkpoint vs a fixed frozen opponent checkpoint (both
sealed, mirrored deck), for measuring whether a self-play run actually
improved over the checkpoint it started from.

    python rebenchmark_selfplay.py --checkpoint checkpoints/op17-sealed-selfplay-ppo \
        --frozen-checkpoint checkpoints/op17-sealed-ppo --episodes 200
"""

from __future__ import annotations

import argparse

from sb3_contrib import MaskablePPO

from train import build_env, evaluate_wins


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--frozen-checkpoint", required=True)
    parser.add_argument("--episodes", type=int, default=200)
    parser.add_argument("--num-envs", type=int, default=8)
    parser.add_argument("--deterministic", action="store_true")
    args = parser.parse_args()

    env_args = argparse.Namespace(
        deck="ST31",
        opponent_deck="ST32",
        seed_prefix="rebench-selfplay",
        shaped_reward=False,
        policy="pointer",
        num_slots=24,
        gamma=0.997,
        sealed=True,
        frozen_checkpoint=args.frozen_checkpoint,
    )
    env = build_env(env_args, args.num_envs, "self")
    model = MaskablePPO.load(args.checkpoint, env=env, device="cpu")
    rate = evaluate_wins(model, env, args.episodes, deterministic=args.deterministic)
    env.close()

    mode = "deterministic" if args.deterministic else "stochastic"
    print(
        f"{args.checkpoint} vs {args.frozen_checkpoint} (frozen), mirrored deck, "
        f"{mode}: {rate:.1%} over {args.episodes} games"
    )


if __name__ == "__main__":
    main()
