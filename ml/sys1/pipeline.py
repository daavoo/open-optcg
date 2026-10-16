"""The whole training run, start to finish, with the current recommended settings.

    .venv/bin/python -m sys1.pipeline --name run2 [--text none] [--games 30000]

Each step writes into `checkpoints/<name>-*` and is skipped when its output
already exists, so an interrupted run resumes where it stopped. The corpus
(steps 1-2) is shared: it lives in `data/corpus-<key>/`, where the key hashes
its sources (the engine, cards, decks and rules agents, uncommitted changes
included), the render version and its size, so any run that would build the
same corpus reuses it. The steps, and roughly how long each takes on an M5 Pro:

1. corpus    rules agent vs rules agent over every deck pairing   ~3 min
2. tokenise  rendered text -> .npz corpora                        ~3 min
3. bc        behaviour cloning warm start (a third of a pass)     ~35 min
4. ppo       PPO against the rules agents, plateau-stopped        ~1 h
5. selfplay  PPO, half the games against snapshots, plateau-stopped ~1 h
6. test      1,240 paired games on seeds nothing was selected on  ~2 min
7. export    the in-browser model pack                            ~2 min

The timings for 3-5 are estimates from the runs that produced the current
checkpoint, scaled for the settings here; see README.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from .data import RENDER_VERSION

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent


def run(command: list[str], cwd: Path, log: Path | None = None) -> None:
    """Runs a step; with `log`, its output goes to the terminal and to the log."""
    print("$", " ".join(command), flush=True)
    if not log:
        subprocess.run(command, cwd=cwd, check=True)
        return
    with log.open("w") as handle:
        process = subprocess.Popen(
            command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
        )
        assert process.stdout
        for line in process.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            handle.write(line)
            handle.flush()
        if process.wait():
            raise subprocess.CalledProcessError(process.returncode, command)


# Everything a corpus is a function of: the rules, the cards and decks, the
# rules agents that play both seats, and the renderer and script that write it.
CORPUS_SOURCES = [
    "packages/engine-core",
    "packages/cards",
    "packages/decks",
    "packages/agents",
    "packages/protocol",
    "packages/cli/src/agent-factory.ts",
    "ml/bridge/dump.ts",
]


def corpus_key(games: int, shards: int) -> str:
    """A content hash of the corpus's inputs, uncommitted changes included.

    Git's tree hashes name the committed sources exactly, so the key survives
    commits that touch nothing a game reads; the diff covers a dirty tree.
    """
    trees = subprocess.run(
        ["git", "rev-parse", *(f"HEAD:{path}" for path in CORPUS_SOURCES)],
        cwd=REPO, check=True, capture_output=True, text=True,
    ).stdout
    dirty = subprocess.run(
        ["git", "diff", "HEAD", "--", *CORPUS_SOURCES], cwd=REPO, check=True, capture_output=True
    ).stdout
    render = RENDER_VERSION
    digest = hashlib.sha256(trees.encode() + dirty + f"{render}|{games}|{shards}".encode())
    return f"r{render}-{games}-{digest.hexdigest()[:12]}"


# What a behaviour-cloning checkpoint is a function of, besides its corpus and
# arguments: the training settings live in train_bc's defaults.
BC_SOURCES = ["sys1/train_bc.py", "sys1/model.py", "sys1/data.py", "sys1/text.py"]


def bc_key(corpus: Path, model: str, text: str) -> str:
    digest = hashlib.sha256(f"{corpus.name}|{model}|{text}".encode())
    for source in BC_SOURCES:
        digest.update((ROOT / source).read_bytes())
    if text == "pack":
        from .text import DEFAULT_PACK

        digest.update(DEFAULT_PACK.read_bytes())
    return f"bc-{corpus.name.removeprefix('corpus-')}-{model}-{text}-{digest.hexdigest()[:8]}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--games", type=int, default=30000)
    parser.add_argument("--shards", type=int, default=12)
    parser.add_argument("--model", default="17m")
    parser.add_argument("--text", choices=["pack", "none"], default="none")
    parser.add_argument("--corpus", help="a corpus directory under data/ to use instead of the cached one")
    args = parser.parse_args()

    python = str(ROOT / ".venv/bin/python")
    # The corpus does not depend on --text or on anything trained, so every
    # run with the same sources, render and size shares one.
    data = Path(args.corpus) if args.corpus else ROOT / "data" / (
        "corpus-" + corpus_key(args.games, args.shards)
    )
    print(f"corpus: {data}", flush=True)
    ckpt = ROOT / "checkpoints"
    data.mkdir(parents=True, exist_ok=True)
    ckpt.mkdir(exist_ok=True)

    # 1. corpus: shards run in parallel, one Node process each.
    if not list(data.glob("*.jsonl.gz")):
        per_shard = -(-args.games // args.shards)
        procs = [
            subprocess.Popen(
                ["pnpm", "exec", "tsx", "ml/bridge/dump.ts",
                 "--games", str(per_shard), "--shard", f"{i}/{args.shards}",
                 "--seed", data.name,
                 "--out", str(data / f"shard-{i:02d}.jsonl.gz")],
                cwd=REPO,
            )
            for i in range(args.shards)
        ]
        if any(p.wait() for p in procs):
            sys.exit("corpus generation failed")
    (ROOT / "data" / "cards.json").exists() or run(
        ["pnpm", "exec", "tsx", "ml/bridge/cards.ts", str(ROOT / "data/cards.json")], REPO
    )

    # 2. tokenise
    missing = [p for p in data.glob("*.jsonl.gz") if not p.with_suffix("").with_suffix(".npz").exists()]
    if missing:
        run([python, "-m", "sys1.data", *map(str, missing)], ROOT)

    # 3. behaviour cloning, shared like the corpus: every run with the same
    # corpus, model, text and training code starts from one checkpoint, and
    # `<name>-bc` links to it.
    bc = ckpt / f"{args.name}-bc"
    if not (bc / "weights.safetensors").exists():
        if args.text == "pack":
            from .text import DEFAULT_PACK

            if not DEFAULT_PACK.exists():
                sys.exit(f"--text pack, but there is no printed-text pack at {DEFAULT_PACK}")
        shared = ckpt / bc_key(data, args.model, args.text)
        print(f"behaviour cloning: {shared}", flush=True)
        if not (shared / "weights.safetensors").exists():
            run([python, "-m", "sys1.train_bc", "--data", str(data), "--model", args.model,
                 "--text", args.text, "--out", str(shared)], ROOT, ckpt / f"{shared.name}.log")
            config = json.loads((shared / "config.json").read_text())
            (shared / "config.json").write_text(json.dumps({**config, "corpus": data.name}))
        if bc.is_symlink():
            bc.unlink()
        bc.symlink_to(shared.name)

    # 4. PPO against the rules agents, then 5. with self-play mixed in.
    ppo = ckpt / f"{args.name}-ppo"
    if not (ppo / "config.json").exists():
        run([python, "-m", "sys1.ppo", "--init", str(bc), "--out", str(ppo)], ROOT, ckpt / f"{args.name}-ppo.log")
    ppo_best = ppo / "best" if (ppo / "best").exists() else ppo
    selfplay = ckpt / f"{args.name}-selfplay"
    if not (selfplay / "config.json").exists():
        run([python, "-m", "sys1.ppo", "--init", str(ppo_best), "--out", str(selfplay), "--self-play", "0.5"],
            ROOT, ckpt / f"{args.name}-selfplay.log")
    final = selfplay / "best" if (selfplay / "best").exists() else selfplay

    # 6. test, 7. export
    run([python, "-m", "sys1.evaluate", str(final), "--games", "1240", "--seed", "test"],
        ROOT, ckpt / f"{args.name}-test.txt")
    run([python, "-m", "sys1.export_web", str(final), str(ckpt / f"{args.name}-scorer-model.json")], ROOT)
    print((ckpt / f"{args.name}-test.txt").read_text())


if __name__ == "__main__":
    main()
