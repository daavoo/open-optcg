# Learned opponents (experimental)

A third kind of opponent alongside the rules policies and the LLM agent: a small
neural policy trained by self-play against the engine. This is a research
sidecar, not part of the app — nothing here is needed to play, build, or test
Open OPTCG.

It works end to end. A pointer-policy agent trained with MaskablePPO beats the
shipped `RegistryRulesAgent` at 60% (ST31 vs ST32, ~1.4M steps, ~10 minutes on
CPU), and 77% on OP17 sealed with the deck mirrored to both seats so the result
measures piloting rather than pool luck. Closing that gap against the rules
agents was the point.

The trained sealed policy can be exported into the browser build as a **Learned
model** opponent (see below).

## Architecture

```
Python trainer  ──NDJSON over stdio──▶  Node engine process
  MaskablePPO                            ml/bridge/rl-server.ts
  Gymnasium / PettingZoo env             ├── encode.ts  (features + action rows)
                                         └── GameService (unmodified)
```

The engine is not reimplemented in Python. Two things make the bridge cheap
enough to train over:

- **Encode on the Node side.** A raw `GameObservation` is ~23 KB of JSON. The
  bridge instead sends an ~849-float global vector plus one feature row per legal
  action, so the training budget does not go into `json.loads`.
- **Fast-forward the opponent inside Node.** When a rules agent holds the other
  seat, the server runs it in-process and returns only when the learner is to
  move. That removes about half the IPC, and the policy trains against the exact
  agent the rest of the repo benchmarks.

Measured: ~2,000 learner-steps/sec including IPC, against 4,052 raw
engine-actions/sec in-process.

The default head is a **pointer policy**: the observation is the global state
vector plus one row per legal action (111 floats: action type, engine-computed
combat arithmetic, card identity), padded to 24 slots, and softmax runs over the
legal slots only. Decisions have a mean of 3.7 legal actions and a measured max of
15, so this is a ~4-way choice rather than a classification over a frozen table
where 99.7% of the logits are masked. New cards need no table regeneration.
`--policy flat` keeps the older fixed 2,044-key action table for A/B measurement;
the pointer head wins.

`optcg_env.py` is a PettingZoo AEC env rather than a parallel one because the
engine is strictly sequential — it hands the seat to the defender mid-turn for
blocks and counters, so modelling a turn as simultaneous moves would be wrong.

## Running it

```sh
pnpm rl:action-table --seeds 20 --sealed-seeds 150   # writes ml/bridge/action-table.json

python3 -m venv ml/.venv
ml/.venv/bin/pip install numpy gymnasium pettingzoo torch sb3-contrib

cd ml/python
../.venv/bin/python train.py --timesteps 200000 --deck ST31 --opponent-deck ST32

# OP17 sealed instead of a fixed matchup: a fresh random pool per episode,
# auto-built and mirrored to both seats.
../.venv/bin/python train.py --sealed --timesteps 2000000 --num-envs 8 \
  --max-minutes 28 --patience 6

# Self-play against a frozen snapshot of an earlier checkpoint.
../.venv/bin/python train.py --sealed --opponent self \
  --frozen-checkpoint checkpoints/op17-sealed-ppo
```

Each `--num-envs` runs its own Node engine process, so they are genuinely
parallel. `--max-minutes` and `--patience` stop a run once the eval win rate
plateaus instead of spending the whole budget. `rebenchmark_sealed.py` and
`rebenchmark_selfplay.py` re-measure a checkpoint against the rules agent or
against a frozen checkpoint.

The default device is `cpu` and should stay there: the GPU wins the batch math
and loses the game, because the per-step numpy↔Metal ping-pong (~600 µs) dwarfs
both the forward pass and the engine step (~490 µs). `--device mps` exists for
when the policy is large enough to amortize that.

Rebuild the action table whenever card behaviour or `encode.ts` changes, and
run `pnpm rl:card-index` after a set import.
`rl-server.ts` refuses to start when the table's `observationSize` disagrees with
what `encode.ts` currently produces, because a checkpoint read against a shifted
feature layout produces nonsense rather than an error.

Verified on Python 3.14 with gymnasium 1.3.0, pettingzoo 1.27.0, torch 2.13.0,
sb3-contrib 2.9.0.

## Results

| Opponent                                                        | Policy  | Steps               | Win rate                  | Wall clock      |
| --------------------------------------------------------------- | ------- | ------------------- | ------------------------- | --------------- |
| `SeededRandomAgent`                                             | flat    | 60k                 | 42% → **100%**            | 80s, CPU        |
| `RegistryRulesAgent` (ST32)                                     | flat    | 30k                 | 0% → 1%                   | ~40s, CPU       |
| `RegistryRulesAgent` (ST32)                                     | pointer | 1.43M               | → **60%**                 | ~10 min, 8 envs |
| `RegistryRulesAgent(SEALED_LEADER)`, OP17 sealed, mirrored deck | pointer | 440k, early-stopped | → **77%** (200-game eval) | ~4m45s, 8 envs  |

For calibration, the rules agent beats the random agent 20–0. Read these with the
noise in mind: 50-game evals bounce 30–66% on a hidden-information game, which is
why the headline numbers use 200-game evals and why `--eval-episodes` defaults to 200.

## The token policy (roadmap stages 1 and 2)

`--policy token` is the second generation of the sidecar, implementing stages
1 and 2 of [docs/ai-roadmap.md](../docs/ai-roadmap.md). It changes the
representation, the critic, the opponents and the plumbing; the algorithm is
still masked PPO.

```
Python trainer  ──NDJSON, one line per vector step──▶  N Node engine processes
  MagnetMaskablePPO                                      ml/bridge/rl-server.ts
  TokenActorCriticPolicy                                 ├── tokens.ts      (card tokens, action pointers,
  BridgeVecEnv + OpponentPool                            │                   privileged critic tokens)
                                                         ├── card-table.ts  (append-only card index)
                                                         └── encode.ts      (the flat encoding, unchanged)
```

**Cards as tokens.** A position is a set of card tokens rather than bags over
a frozen vocabulary: one token per card instance the viewer can see, carrying
its zone, owner, live state (rested, attached DON!!, current power and cost,
keywords in force) and a row in `card-index.ts`, an append-only table over
every registered card. The row indexes a learned embedding _and_ a table of
derived printed facts (`cardFeatures`: category, stats, colours, attribute,
keywords, `[DON!! xN]`, clause markers, the boolean fields of `CardRules`),
shipped once with the spec. So a card the policy never trained on arrives
described, and a new set appends rows instead of renumbering columns.
`pnpm rl:card-index` appends the registry's new cards; `test/rl-tokens.test.ts`
fails when the table is stale, and every checkpoint records the table's
fingerprint and refuses to load against a different one.

**Actions as pointers.** A legal action is (type, the engine's combat
arithmetic, option shape) plus up to two references into the token list --
attacker and target, the hand card played, the DON!! target -- and the row of
the card it names when that card is in no visible zone (a search result). The
policy scores an action from the encoded tokens it points at, so "attack
_that_ with _this_" is read off the two cards' states rather than off a
one-hot of their identities. The opponent's hand and face-down Life are
tokens too, with the identity row set to _unknown_.

**An asymmetric critic.** The server also emits _privileged_ tokens read from
the true `GameState`: the opponent's hand with identities, both Life stacks
face-up, the next three cards of each deck. Only the critic reads them, only
during training. The actor's encoding is a function of `observe()`'s
projection alone, and `test/rl-tokens.test.ts` holds that rearranging the
hidden zones moves the privileged tokens and nothing the actor sees. Hidden
information is enforced at play exactly as before; what changes is that the
value target knows whether the Counter is in hand.

**An opponent pool with PFSP.** Each episode draws its opponent from a pool
-- the deck's rules agent (played inside Node), the random agent, and
snapshots of the learner saved every `--snapshot-every` steps (played from
Python, batched) -- weighted by `(1 - win rate)^2`, AlphaStar's "hard"
prioritised fictitious self-play. The rules agents stay in the curriculum for
as long as they win; a solved snapshot is rarely drawn. The per-opponent
record is printed at every eval.

**A magnet.** `MagnetMaskablePPO` adds a KL penalty from the policy to an
exponential moving average of itself (`--magnet-coef`, `--magnet-tau`), the
regularisation from magnetic mirror descent; `--magnet-coef 0` is plain
MaskablePPO.

**Diverse starts.** `--start-turn-max N` starts some episodes at a turn the
rules agents played both seats to, so mid-game boards are seen early.

**Plumbing.** `BridgeVecEnv` holds every environment in `--engines` Node
processes (default: cores minus one), sends each process its whole batch as
one `step_all` line and reads the replies once, so the pipe is paid per
vector step per process rather than per environment. `--sealed-expansion any`
draws a pool from every supported expansion per episode.

```sh
cd ml/python
../.venv/bin/python train.py --policy token --timesteps 2000000 --num-envs 32 \
  --engines 7 --pool rules,snapshots --snapshot-every 100000 \
  --start-turn-max 6 --magnet-coef 0.05 --out checkpoints/st31-token
../.venv/bin/python train.py --policy token --sealed --sealed-expansion any \
  --deck all --opponent-deck all --timesteps 2000000 --num-envs 32
```

Measured on a 4-core container, ST31 vs ST32, the rules agent as opponent,
16 environments over 3 engine processes: 630 learner steps/s from the
environments (the rules agent's own thinking is most of that), a 5 ms policy
forward for the batch of 16, and 0.75 s per 256-sample minibatch of training
for the default 409k-parameter model (d=96, two layers, four heads). One
2,048-step rollout plus its update is about 12 s, so a 2M-step run is an
afternoon on this box and less on a laptop with more cores. Decisions with
more legal actions than `--num-slots` (32) were 0.2% of the smoke run.

Not measured yet, and the roadmap's stage gates are exactly this: whether the
token policy matches the flat policy's 60% and 77% within noise, and whether it
plays an unseen sealed expansion above the random agent. The smoke runs here
only prove the loop -- train, snapshot, pool, eval, save, resume -- end to end.

Not implemented from stage 2: two-seat self-play into one rollout buffer
(SB3's on-policy loop assumes one seat per environment, so the learner still
faces snapshots rather than its live self), and episode starts from the trace
corpus (`--start-turn-max` plays the rules agents forward instead).

## Playing against a checkpoint in the browser

The sealed pointer policy is two small `tanh` MLPs, small enough to hand-port to
TypeScript rather than ship an ONNX runtime into a "no server, no account" static
HTML file:

```sh
cd ml/python
../.venv/bin/python export_web_policy.py \
  checkpoints/op17-sealed-ppo.zip \
  ../../packages/web/src/learned-sealed-policy.json
pnpm web:build
```

`export_web_policy.py` drops the critic and writes the actor's weights as JSON.
`packages/agents/src/learned-sealed-agent.ts` ports the forward pass, reusing
`ml/bridge/encode.ts` directly — the weights are only meaningful against the exact
feature layout they were trained on. The build inlines the JSON into the Web
Worker bundle, so the page needs no network fetch. Play is greedy rather than
sampled, so it is at least as strong as the reported win rate. If the JSON is
absent the build still succeeds and the sealed opponent select simply does not
offer "Learned model". Where no LLM opponent can be reached -- the hosted page,
or the artifact opened from disk -- a fresh sealed run defaults to this
checkpoint rather than to the rules agent.

## Why not AlphaZero, MuZero, or RLCard

**AlphaZero's MCTS searches the true game state.** Here the opponent's hand, both
deck orders and face-down Life are hidden, and the engine enforces that in
`observe()`. A search over the true state searches what the agent is not entitled
to know; a search over the observation searches a state that is not Markov. The
principled fixes are the CFR family or IS-MCTS, not vanilla AlphaZero.

**MuZero learns a dynamics model because it has no simulator.** This repo _is_ a
simulator: deterministic, seeded, replayable, hidden-information-safe. Training a
network to approximate a model you can call exactly is spending compute to
reconstruct what you already have. If search is wanted later, run it against the
real engine.

**RLCard is dormant** — no release since April 2023. The stack here is PettingZoo,
Gymnasium and `sb3-contrib` MaskablePPO instead. OpenSpiel is the serious
alternative and the only actively maintained library with tested NFSP and Deep
CFR; it is a worse fit for a TypeScript engine, because its headline CFR
algorithms need `State.clone()` and cheap tree traversal, which over a subprocess
boundary means serializing full game state at every node.

That leaves masked policy-gradient self-play, which does not converge to a Nash
equilibrium — nothing at this compute budget does — but clears the bar that matters
here on a laptop.

## Where this could go

[docs/ai-roadmap.md](../docs/ai-roadmap.md) is the staged plan: measurement
first, then cards as tokens, an asymmetric critic and an opponent pool, then
determinized search at decision time, then shipping. The three items below are
the short version.

1. **More steps.** The policy still looks like it is improving at 2M.
2. **Card embeddings.** The observation is one-hot bags over the card vocabulary;
   embedding card text (`llm-dossiers.ts` already produces it) would shrink the
   observation and give the pointer head dense features.
3. **Longer self-play ladders** from the frozen-snapshot tooling above.

The evaluation target stays the existing one: win rate against the rules agents,
comparable to what `deck:benchmark` and `analytics:baseline` already report.
