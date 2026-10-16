# Next training: a card-features model for the web

**Done, 2026-09-28: shipped.** The run below took about 3.5 hours. The
distilled student started at 0.728 against the rules agents (web-3: 0.732 on
the same seeds), PPO promoted at every check (20, 40, 60, 80), and on the
unseen `web-final-2` seeds it wins 0.786 where web-3 wins 0.722 (paired
+6.5pt ± 2.4) and 54.7% ± 2.8 head to head. Its pack matches MLX on 48/48
export samples and on 300/300 positions from real games, with no missing
words. It is now `EXPERIMENTS.md`'s start point; "After this one" lists what
could come next.

The next model to train, why it is next, how to run it, and what decides
whether it ships. The ground rules in `EXPERIMENTS.md` apply (one GPU job at
a time, fresh seeds for every comparison); the evidence is in
`CARD-REPRESENTATION.md`.

## Why this one

The web model today is `web-3`: push-2 fine-tuned on all 35 decks, 0.755
against the rules agents on unseen seeds and 53% head to head against push-2.
Its gain is on the decks it trained on. It still knows a card mainly through
that card's learned embedding, and a card it never played has none -- which
is 1,725 of the 2,139 cards, and every custom deck a player builds from
outside the 35 lists (trace 18 is one).

The card features (`features.py`) are the one change that carried to unseen
cards: +6.4pt ± 3.5 piloting a held-out deck, and a model that plays as well
with its per-card embeddings zeroed. They have to be there from behaviour
cloning: added to a trained checkpoint during PPO they spend each update's
KL budget on the new tables (tried on push-2 at two learning rates;
`--feature-lr` exists but did not rescue it).

So the student is behaviour-cloned with the features on -- but from `web-3`'s
own games rather than the rules agents' (`sys1.distill`, `train_bc --soft`).
Cloning the rules agents starts a model at their level, about 0.45 against
them, and push-2's lineage then needed about 620 PPO iterations (roughly 28
GPU-hours) to climb to web-3; cloning web-3 starts the student near 0.75, so
PPO only has to recover what cloning loses and let the features settle.

## What it costs

About 5-6 hours of GPU in one run. Nothing else can use the GPU meanwhile,
including the web build's scorer: close the app while it trains.

| stage | what                                                                    | time       |
| ----- | ----------------------------------------------------------------------- | ---------- |
| 1     | record 30,000 `web-3` games, 30% against itself, with its probabilities | ~30-40 min |
| 2     | behaviour cloning on them with `--card-features --soft`                 | ~1 h       |
| 3     | PPO with 30% self-play, 80 iterations, from stage 2                     | ~4 h       |
| 4     | compare with `web-3`; export and parity                                 | ~15 min    |

If the student is well short of `web-3` after stage 2 (PPO's iteration-0
evaluation reads it), distillation is not carrying enough of web-3 over and
the from-scratch line is the fallback: cloning the rules agents with the
features, then PPO and self-play stages to web-3's budget, two or three
nights.

## How to run it

`checkpoints/distill-run.sh`, from the checkout the code is in. Every stage
skips itself when its output exists, so it resumes after a stop.

```sh
#!/bin/sh
set -e
cd /path/to/open-optcg/ml   # the checkout, not the shared checkpoints/ symlink
PY=.venv/bin/python
O=checkpoints/distill-eval
export HF_HUB_OFFLINE=1                     # a dropped Hub connection must not end a run
export SYS1_LAST_STEP=$O/last-step
mkdir -p $O
D=data/distill-web3
[ -f $D/DONE ] || { rm -rf $D; $PY -m sys1.distill checkpoints/web-3/best $D --games 30000 --self-play 0.3 \
  > checkpoints/distill-record.log 2>&1 && touch $D/DONE; }
[ -f checkpoints/distill-bc/weights.safetensors ] || $PY -m sys1.train_bc --data $D --model 17m --text pack \
  --card-features --soft --epochs 0.5 --out checkpoints/distill-bc > checkpoints/distill-bc.log 2>&1
[ -f checkpoints/distill-ppo.done ] || { $PY -m sys1.ppo --init checkpoints/distill-bc --out checkpoints/distill-ppo \
  --iterations 80 --eval-every 20 --self-play 0.3 > checkpoints/distill-ppo.log 2>&1; touch checkpoints/distill-ppo.done; }
```

The student reads the printed-text pack (`--text pack`), so it is for a
personal build, as `web-3` is.

## Watching it

Arm a watcher that reads the logs, not only the end marker
(`checkpoints/web3-run.sh`'s watcher is the template), and alert on:

- the log unchanged for 15 minutes, or the script gone without its marker;
- the mean steps per update over the last five below 10 once past iteration
  8 (single short updates are normal, runs of them are not);
- any new line in `checkpoints/failed-games.jsonl` (replay it with
  `bridge/replay-failed.ts`);
- a `Traceback` or `SystemExit` in a log.

Read iterations 1-10 before leaving it: the first update should take 10-25
steps at a KL near 0.015, and entropy swings between 0.35 and 0.6 early in
every run.

To stop a run, kill the trainer **and** its collector and bridges, then check
nothing is left -- the collector is a `multiprocessing` child that
`pkill -f sys1.ppo` does not match:

```sh
pkill -f sys1.ppo; pkill -f spawn_main; pkill -f ml/bridge/server.ts
pgrep -fl "sys1\.|spawn_main|bridge/server"      # expect nothing
```

## What decides it

After stage 3, on seeds no run has used (`web-final-2`):

```sh
$PY -m sys1.evaluate checkpoints/distill-ppo/best --games 1240 --seed web-final-2 --out /tmp/new.json
$PY -m sys1.evaluate checkpoints/web-3/best --games 1240 --seed web-final-2 --out /tmp/web3.json
$PY -m sys1.evaluate checkpoints/distill-ppo/best --against checkpoints/web-3/best --games 1240 --seed web-h2h-2
```

- **Ship** if the paired difference against `web-3` is positive and the
  head-to-head is at least 50%.
- **Keep training** (another PPO stage from its best, fresh seeds) if it is
  within about 2pt below `web-3` and the last evaluations were still
  promoting.
- **Stop** if it is more than 2pt below and has stopped promoting: the
  features cost more on known decks than they give, and `web-3` stays.

The held-out decks cannot be measured here (this line trains on all of
them); the unseen-card evidence is step 3's, and a player's custom decks are
the check that matters in practice.

## Shipping it

```sh
$PY -m sys1.export_web checkpoints/distill-ppo/best checkpoints/distill-scorer-model.json \
  --parity checkpoints/distill-eval/parity.json
cd .. && pnpm exec tsx ml/bridge/parity-web.ts \
  ml/checkpoints/distill-scorer-model.json ml/checkpoints/distill-eval/parity.json
```

Expect 48/48 on the export's own samples. Then run the same comparison on
positions from real games (the human traces), which is what caught nothing
wrong with `web-3`: 1,129 of 1,136 top actions and a worst gap of 0.054.
Copy the pack to `packages/web/src/scorer-model.json` and
`pnpm web:build --with-art --with-text=open-optcg-assets/printed-text.json`.
Keep the `web-3` pack (`checkpoints/web-3-scorer-model.json`) to go back to.

## After this one

- **Step 4's probe** (`CARD-REPRESENTATION.md`): whether fine-tuning erodes
  the encoder's reading of card text, which decides whether a frozen text
  encoder is worth building.
- **Deck variants** (`EXPERIMENTS.md` entry 7): more lists in training, for
  the custom decks players actually build.
