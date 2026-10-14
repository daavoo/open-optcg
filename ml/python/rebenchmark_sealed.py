"""Re-evaluates an existing sealed checkpoint against the rules agent, without
retraining -- for confirming an engine-side fix (e.g. the counter-phase
wasteful-Counter-card guard) didn't need a new run to show up in the number.

    python rebenchmark_sealed.py --checkpoint checkpoints/op17-sealed-ppo --episodes 200
"""

from __future__ import annotations

import argparse

from sb3_contrib import MaskablePPO

from train import build_env, evaluate_wins


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default="checkpoints/op17-sealed-ppo")
    parser.add_argument("--episodes", type=int, default=200)
    parser.add_argument("--num-envs", type=int, default=8)
    parser.add_argument("--deterministic", action="store_true")
    args = parser.parse_args()

    env_args = argparse.Namespace(
        deck="ST31",
        opponent_deck="ST32",
        seed_prefix="rebench-sealed",
        shaped_reward=False,
        policy="pointer",
        num_slots=24,
        gamma=0.997,
        sealed=True,
    )
    env = build_env(env_args, args.num_envs, "rules")
    model = MaskablePPO.load(args.checkpoint, env=env, device="cpu")
    rate = evaluate_wins(model, env, args.episodes, deterministic=args.deterministic)
    env.close()

    mode = "deterministic" if args.deterministic else "stochastic"
    print(
        f"win rate vs RegistryRulesAgent(SEALED_LEADER), mirrored deck, "
        f"{mode}: {rate:.1%} over {args.episodes} games"
    )


if __name__ == "__main__":
    main()
