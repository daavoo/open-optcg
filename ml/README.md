# The learned opponent: System-1 scorer

A learned opponent in the shape of the non-autoregressive "System 1" decision
models: an encoder reads the position once and scores every legal action in
one forward pass, and the answer is a probability over the engine's
`legalActions` -- never text, never an illegal move. It trains on Apple silicon
with [MLX](https://github.com/ml-explore/mlx) and plays inside the single-file
browser app, on WebGPU where the browser has it.

It is the app's default opponent where a build carries a model pack. The
training side is not part of the app, the build or the test suite; the
in-browser seat lives in `packages/agents/src/scorer/` and is covered by the
suite.

## Shape

```
engine (Node or the browser)                scorer
  observe() ──► scorer/render.ts ─ text ─►   Ettin encoder (ModernBERT)
  legalActions    state + one line             [CLS] state [SEP] a1 a2 … aK
  − dominated     per action                   each action sees state + itself
    (dominance.ts)                             ──► one logit per action, a value
```

- **Rendering** (`packages/agents/src/scorer/render.ts`). A decision is a short
  state and one line per legal action, built from `observe()` alone, so hidden
  information is withheld by the engine. Every card is a `[[CARD-NUMBER]]`
  placeholder, never its printed text, and about 220 tokens a decision. A
  corpus, a checkpoint and a model pack each record the render version they
  were written in (`RENDER_VERSION`), and only the current one is supported:
  one written in another is refused, never misread. Bump it whenever the text
  for a decision changes.
- **Cards** (`sys1/text.py`). Each placeholder becomes one token whose embedding
  is that card's vector: the backbone's encoding of the card's facts -- plus
  its printed text with `--text pack` -- projected, plus a learned per-card
  embedding. Text encodings are refreshed every few hundred steps rather than
  recomputed per batch, which would cost more tokens than the batch.
- **Order invariance** (`sys1/model.py`). An action's positions restart where the
  state ends, and its attention is limited to the state and to its own tokens, so
  each probability is a function of (state, action) alone and reordering the
  legal list changes nothing. `sys1/parity.py` checks this and checks the MLX
  encoder against `transformers`.
- **Dominated actions** (`packages/agents/src/scorer/dominance.ts`). Moves that
  are provably worse than passing are removed before the model sees the list,
  in play and in training. Today that is two rules: a Character attack that
  cannot land and triggers nothing, and a Character Counter that cannot save
  the battle even with every other Counter on offer (steps aside whenever a
  [Counter] Event is offered). `bridge/attack-audit.ts` checks the attack rule
  against the engine by declaring every candidate on a copy of the state
  (`sys1.audit_attacks`); the Counter rule has no such audit yet.

## Setup

```sh
cd ml
uv venv --python 3.12 .venv && uv sync --all-groups
pnpm exec tsx ml/bridge/cards.ts   # from the repo root: card facts
```

`data/`, `checkpoints/` and `.venv` are gitignored (they may also be symlinks,
e.g. to a worktree holding a run in progress). `--text pack` trains on the
card text in the local asset pack; `--text none` on card facts alone.

## The training run

One command runs every step with the current settings, resuming where it
stopped:

```sh
.venv/bin/python -m sys1.pipeline --name run2 --text none
```

| step | what                                                     | module / script        | time (M5 Pro) |
| ---- | -------------------------------------------------------- | ---------------------- | ------------- |
| 1    | rules agent vs rules agent, every deck pairing, rendered | `bridge/dump.ts`       | ~3 min        |
| 2    | tokenise to flat `.npz` corpora                          | `sys1.data`            | ~3 min        |
| 3    | behaviour cloning warm start, a third of a pass          | `sys1.train_bc`        | ~35 min       |
| 4    | PPO against the rules agents, stops at a plateau         | `sys1.ppo`             | ~1 h          |
| 5    | PPO with half the games against snapshots                | `sys1.ppo --self-play` | ~1 h          |
| 6    | 1,240 paired games on untouched seeds                    | `sys1.evaluate`        | ~2 min        |
| 7    | export the in-browser model pack                         | `sys1.export_web`      | ~2 min        |

Steps 3-5 are estimates: the checkpoint in use was trained before the
current defaults (one full behaviour-cloning pass, about 1 h 45 min; fixed
iteration counts in steps 4 and 5, about 1 h 30 min and 1 h 45 min at the
iteration speed of the time). The defaults below have not yet been through a
full run.

### What each step does, and its settings

1. **Corpus.** 30,000 games by default, walking every ordered pair of distinct
   selectable decks, with every real decision (two or more legal actions)
   written as rendered text plus the rules agent's choice and the result.
   About 30,000 decisions a second across 10-12 Node processes.
2. **Tokenise.** Each shard becomes uint16 token ids and card rows, about 4M
   decisions in a few GB.
3. **Behaviour cloning** (`--epochs 0.3`). Cross-entropy on the rules agent's
   choice plus the game result for the value head. Agreement with the teacher on
   held-out games rises fast and then flattens (83% by 10k steps, 92% by 40k,
   95.5% after the full pass); RL takes over from well before the end.
4. **PPO against the rules agents.** A separate collector process keeps 384
   games in flight, starting a new one as each ends, and hands over every
   24,576 decisions from finished games; games still running carry on into
   the next batch. It loads each update between steps, so a game can span
   weight versions: each decision keeps the probability its own version gave
   it, and decisions more than 2 updates old are not trained on. Each batch
   gets one KL-bounded pass (64k-token minibatches, lr 5e-6, target KL 0.02).
   The value head learns without moving the backbone. Every 25 iterations
   the candidate and the checkpoint in `best/` (at first, the starting
   checkpoint) each play the same 1,240 paired games against the rules
   agents, on seeds no earlier evaluation used. The candidate replaces the
   best when it wins more of those games (the difference is read per
   seat-swapped pair, so a game the decks decide cancels), unless it clearly
   loses to it head to head -- a sequential test between 40% and 50% on
   featured pairings that stops once decided, which would mean it gained on
   the rules agents by exploiting them. Head to head is a veto rather than a
   bar, because 25 iterations of real progress win only about 52-55%
   against the checkpoint before. Every candidate that beat the best is
   also kept as `iter-NNNN/` for `sys1.ladder`. The run stops when the
   rollouts stop gaining: the win rate against the rules agents over the
   last 50 iterations (about 18,000 games) against the 50 before, once a
   one-sided 95% bound puts the gain below 1 point, or at 300 iterations.
   Each rollout game is weighted towards uniform distinct pairings, so
   `--mirror` and `--matchups` change what the run trains on, not what the
   stop rule measures. The rollouts sample where the evaluations play
   greedily; each evaluation logs the gap between the two (`sample_gap`).
5. **Self-play.** The same, with half the games against a pool of 4 frozen
   snapshots refreshed every 10 iterations, and the other half against the
   rules agents so it keeps beating them.
6. **Test.** 1,240 paired games on the `test` seeds, which nothing is
   compared or selected on. Report this number, not the in-training
   evaluation, which picked the checkpoint. Seeds are free, so a question
   asked of several checkpoints -- which is better -- gets seeds of its own
   rather than the `test` ones.
7. **Export.** Float16 weights, only the embedding rows the renderer can produce
   (about 2,900 of 50,368), card vectors precomputed: about 14 MB.

### Stopping and resuming

The small scorer's trainers, `sys1.compact train` (distillation) and
`sys1.compact_ppo` (self-play), can run in sessions rather than one
uninterrupted night.

- **Stop**: send SIGTERM to the Python process (`kill <pid>`), or press
  Ctrl-C in its terminal. It finishes the step or iteration in progress,
  writes `<out>/resume` and exits; a `compact_ppo` iteration can take a few
  minutes, so wait for the process to exit rather than copying its weights at
  once. A second signal stops `compact_ppo` without waiting, and the run then
  resumes from the last iteration written.
- **Resume**: run the same command again. Redirect its log with `>>`, not
  `>`, so the resumed run appends to it: `compact_ppo`'s per-iteration JSON
  lines carry on from the last one, and `grep -c '"decisions"'` still counts
  the run's iterations.
- **The same run only**: `compact_ppo` refuses to resume when an argument that
  defines the run differs from the one recorded (`--iterations`, the
  learning-rate schedule, `--init`, `--out`, `--concurrent`, `--league`,
  `--league-seed`, `--kick`, `--lora`, `--aux-hidden`: `RESUME_ARGS`), and
  lists the differences; `compact train` checks its step count. A script that
  sizes `--iterations` to the time left must fix it for the whole run instead.
  Once a `compact_ppo` run has written `final`, its resume state is marked
  done and the same command does nothing.
- **What is saved**: the weights (deck-adapter factors included) and the
  optimizer's moments and step. `compact train` also keeps the shuffled order,
  the position in it and its generator. `compact_ppo` keeps the iteration
  (which places the learning-rate and `--kick` schedules and names the
  snapshots), the log so far, the generator behind the rollouts' draws and
  the minibatch order, each game slot's seed counter, the deck and matchup
  statistics behind `--deck-power`, `--close` and `--matchup-power`, and the
  league's members, PFSP results and generator. `--resume-every` sets how
  often it is written (`compact_ppo`: every iteration by default).

Games in flight when `compact_ppo` stops are dropped; the resumed run starts
new ones whose seeds carry on from each slot's counter, so no seed is played
twice. Rollouts are not bit-for-bit reproducible even uninterrupted (the
games' timing decides which finish in which batch), so a resumed run follows
the same schedule rather than the same games.

### Playing it

```sh
cp checkpoints/<run>-scorer-model.json ../packages/web/src/scorer-model.json
pnpm web:build            # or --with-art for a personal copy with card images
```

The build inlines the pack into the worker and the match setup offers a
"Learned model" opponent, the default when present. The pack is gitignored;
`pnpm model:fetch` downloads the published one instead.

### Publishing it

The published model is the newest GitHub release whose tag starts with
`model-`, carrying the pack as `scorer-model.json` and any deck adapters over it
as `scorer-adapter-<deck>.json`. The hosted page's build (`pages.yml`) runs
`pnpm model:fetch` and redeploys whenever a release is published. It builds
with `--external-model`, which publishes the pack and adapters beside the page
as `learned-model.json` rather than inlining them: the page draws first, fetches
the model after, and keeps it in Cache Storage under its content hash, so a new
release is fetched once and the old copy dropped
(`packages/web/src/learned-model.ts`). A plain `pnpm web:build` still inlines it.

```sh
mkdir -p /tmp/model && cp checkpoints/<run>-scorer-model.json /tmp/model/scorer-model.json
gh release create model-<run> /tmp/model/scorer-model.json \
  --title "Learned model: <run>" --notes "..."
```

`gh` names an asset after the file (a `#` suffix is only a display label), and
those names are what `tools/fetch-model.ts` looks for.

## Using the Mac

- **MLX, not PyTorch MPS.** MLX drives the M5 GPU's neural accelerators, which
  run bf16 matrix multiplies at about 30 TFLOPS on an M5 Pro. The encoder is
  written in MLX so the scorer can use per-token positions and arbitrary masks,
  which no MLX encoder library exposes.
- **One compiled step per batch shape.** Batches are padded to a fixed set of
  length and option buckets, so `mx.compile` builds a few dozen fused step
  variants once and reuses them. A compiled function that reads the model must
  declare `inputs=[model.state]`, or it bakes in the weights of its first trace.
- **bf16 compute, float32 master weights.** Adam steps a float32 copy; a bf16
  weight cannot resolve a 1e-5 update.
- **CPU for the engine, GPU for the model.** `sys1/env.py` spreads games over
  several Node processes, which play the rules agents' seats in-process and
  take forced moves themselves, so the GPU only sees real decisions.
- **Tokenise where the text is made.** The Node workers send token ids and card
  rows (`bridge/decision-tokens.ts`), not text, so the Python process that
  drives the GPU never tokenises during play. `bridge/bpe.ts` reproduces the
  reference tokenizer exactly; `bridge/bpe-parity.ts` checks it.
- **Pad as little as possible at inference.** Rollouts score a few hundred
  decisions at a time; chunks are length-sorted and padded to a multiple of 16
  rows, because the forward pass costs its padded tokens.

Measured on an M5 Pro (20-core GPU, 48 GB), 16k-token batches:

| backbone  | params | train decisions/s | forward decisions/s |
| --------- | -----: | ----------------: | ------------------: |
| ettin-17m |  17.5M |              ~610 |               ~3700 |
| ettin-32m |  33.1M |              ~290 |               ~1480 |
| ettin-68m |  70.0M |               ~93 |                ~563 |

In the browser the same 17m model takes about 65 ms a decision on WebGPU and
several seconds on the CPU fallback.

## Results so far

Win rate against the rules agents from 1,240 paired, seat-swapped games on
the `holdout` seeds (`sys1.evaluate --seed holdout`), over the
whole catalog and over featured-vs-featured pairings only (`--decks
featured`); ettin-17m, trained with `--text pack` by `sys1.pipeline`:

| checkpoint                                       | all pairings | featured only |
| ------------------------------------------------ | -----------: | ------------: |
| behaviour cloning, 30k rules-vs-rules games      |        0.442 |         0.435 |
| + PPO against the rules agents, 200 iterations   |        0.667 |         0.685 |
| + self-play, 150 iterations (`checkpoints/play`) |        0.683 |         0.696 |

Each is ± 0.026. With wasted Counters pruned as well the last is 0.689 on the
same games. These figures predate the `test` seeds, and the `holdout`
seeds have since been used to compare checkpoints, so they are no longer
untouched. The model's edge over the rules agents piloting the same deck in
the same games (`--baseline`) is about +0.16 on featured decks and +0.25 on
starters.

## Reviewing its games

A person can flag the scorer's misplays and train on them:

1. `sys1.evaluate <checkpoint> --traces data/traces/<name>` writes every game
   the checkpoint lost as a trace the app replays, each of its decisions
   carrying the probability it gave every option and its own win estimate.
   `index.json` lists each game's steepest falls in that estimate, the moves
   its own judgement says turned the game: the ones worth reviewing first.
2. In the app, load a trace and choose **Watch it back**. The strip beside
   the board shows the move about to be played and the model's view of it;
   **Flag this move** records the move the reviewer would have made (or only
   that this one was wrong), and **Hide their hand** draws the far hand face
   down, as the model saw it. **Download flags** saves them all.
3. `pnpm exec tsx ml/bridge/feedback.ts <flags.jsonl ...> --out
data/feedback.jsonl` rebuilds each flagged position from the file and
   renders it as the trainer does.
4. `sys1.ppo --feedback data/feedback.jsonl` trains on every flag after every
   update: a pairwise preference for the reviewer's move over the flagged one,
   measured against the starting checkpoint's, or a push away from the
   flagged move when no alternative was named. `feedback_agree` in the log is
   the share of flags whose preferred move the policy now ranks higher.
   The flags' steps are outside PPO's KL bound, so a few flags at a high
   `--feedback-weight` move the policy quickly: start at 1 and watch
   `approx_kl`.

## Tools

| command                   | what it answers                                                         |
| ------------------------- | ----------------------------------------------------------------------- |
| `sys1.stats`              | token budget of a corpus                                                |
| `sys1.bench`              | train and forward throughput per backbone on this machine               |
| `sys1.parity`             | MLX encoder vs `transformers`, and order invariance                     |
| `sys1.evaluate`           | paired win rate vs the rules agents, per deck                           |
| `sys1.evaluate --against` | paired win rate of one checkpoint against another                       |
| `sys1.ladder`             | Elo ratings and a win-rate matrix over checkpoints and the rules agents |
| `sys1.audit_attacks`      | doomed attacks chosen, and the dominance rule's false alarms            |
| `bridge/parity-web.ts`    | the TypeScript/WebGPU scorer vs the MLX model it came from              |
| `bridge/bpe-parity.ts`    | the Node tokenizer vs the reference, over corpus text                   |
| `bridge/server.ts`        | stepped games over stdio for the Python trainer                         |
