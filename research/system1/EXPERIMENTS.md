# Next experiments

A queue for overnight runs, in the order to run them. Each entry says the
question, the command, what to read and what decides it. Run **one job at a
time**: every PPO run is a trainer plus a collector holding GPU memory, and
two at once has starved the machine (check `pgrep -fl "sys1\."` first).

## Ground rules

- **Seeds.** `holdout` has been used to compare checkpoints and is no longer
  untouched. `test` is for the one number reported at the end of a line of
  work. For comparing arms, give each comparison its own seed name
  (`--seed compare-<n>`) and evaluate both arms on it, so the difference is
  paired: `evaluate.paired_difference` reads two `--out` JSONs' `outcomes`.
- **Start point.** Unless an entry says otherwise, arms start from
  `checkpoints/batch2-ppo/iter-0020`, the current web model: `long-ppo/best`
  trained 40 iterations at three times the batch and the minibatch
  (`--decisions 73728 --budget 196608`; RULES-AGENT-PLAN.md, 2026-10-01). On
  the unseen `compare-batch2` seeds it wins 0.768 against the rules agents
  where `long-ppo/best` wins 0.751 (paired +1.7pt ± 0.6), and 52.7% ± 1.6 of
  3,720 games head to head. `long-ppo` (entry 9) was the one before; its pack
  is `checkpoints/long-scorer-model.json`.
- **Resolution.** 1,240 games is about ±2.6pt on its own; a paired
  difference on the same seeds is tighter, but under ~2pt still needs a
  second seed set before it is believed.

```sh
cd research/system1
# Paired difference of two evaluations on the same seeds:
.venv/bin/python -c "import json,sys; from sys1.evaluate import paired_difference as d; \
a,b=(json.load(open(p))['outcomes'] for p in sys.argv[1:]); print('gain %.3f ± %.3f over %d pairs' % d(a,b))" A.json B.json
```

## Runnable now

### 1. Is the 17M model the limit? Behaviour-cloning scale check

- **Question.** On the same corpus and budget, does `ettin-32m` clone the
  rules agents better than `ettin-17m`?
- **Cost.** About 75 min (32m trains at about half the 17m's speed), plus
  two 2-min evaluations.
- **Run.**
  ```sh
  .venv/bin/python -m sys1.train_bc --data data/manual-try --model 32m --text pack \
    --out checkpoints/bc-32m-r2 > checkpoints/bc-32m-r2.log 2>&1
  for c in manual-try-bc bc-32m-r2; do
    .venv/bin/python -m sys1.evaluate checkpoints/$c --games 1240 --seed compare-1 --out /tmp/$c.json
  done
  ```
- **Read.** The last `val` line of each BC log (teacher agreement and CE),
  and the paired difference on `compare-1`.
- **Decides.** Clearly better (agreement +1pt or more, win rate +3pt or
  more): capacity matters, and a matched-wall-clock PPO run with 32m is the
  next test. Close: size is not the limit yet; spend on signal instead.
  Either way the browser budget (17m is about 65 ms a decision on WebGPU)
  means a bigger model ships only through distillation.

### 2. Learning signal for every deck: mirrors, close matchups, per-deck normalisation

- **Why.** The reward is the result, each decision's advantage is measured
  against the value head, and advantages are normalised across the batch. A
  weak deck against a strong one is a game the value head soon calls right,
  so its decisions get advantages near zero and barely move the update; the
  open games, mostly between strong decks, take the signal. Win rate against
  the rules agents cannot show it: it saturates at 85-90%, where piloting a
  weak deck badly and well read the same.
- **Measure first.** `sys1.piloting` plays every deck X on both seats against
  drawn opponents, once with the candidate piloting X and once with the
  baseline, the other seat always a fixed reference: per-deck paired gains,
  and the weakest quarter by the baseline's rate on its own.
- **Question.** From the same start, does `--mirror 0.15 --close 0.35
--deck-norm --rules 0` (mirror games, the opponent deck nearest the pilot's
  in training win rate, advantages normalised within each pilot deck, no
  rules-agent games) pilot the weak decks better than the uniform recipe
  (`--rules 0.05`)?
- **Run.** `checkpoints/v2-run.sh` (2026-10-05): both arms from `v2-bc`, 80
  iterations each, the Stage A schedule and league.
- **Read.** `v2-eval/piloting-sig-ctl.txt`: the weakest quarter's gain, and
  the whole table; then `sig-vs-ctl` head to head, and both arms against the
  rules agents to check nothing else fell.
- **Decides.** Keep the flags if the weakest quarter's gain is positive by
  two standard errors and the overall piloting gain is not negative; a wash
  on the weak decks with a loss elsewhere drops them. Shaped rewards (points
  for ramping) are not on this list: the reward stays the result.
- **Next, if it holds.** Deck-specific exploiters: an exploiter trained
  against the main piloting the weakest quarter, in the main's league.

### 2b. A floor for every deck, without the rules agents

- **Why.** The goal is every deck piloted near its best, not the highest win
  rate against weak pilots. The rules agents cannot judge that: some deck
  policies are untuned, and beating them rewards their particular mistakes.
  The standard here is another model: a deck the current model pilots worse
  than another checkpoint does, on the same games, is a deck it plays badly
  by a bar that is known to be reachable.
- **Run.** `checkpoints/floor-run.sh` (2026-10-06), from `v2-sig/iter-0080`:
  per-deck piloting against `v2-ctl` and Stage B; `--deck-weights` of
  `1 + clip(z, 0, 2)` from each deck's larger deficit in standard errors;
  100 iterations of the sig recipe with those weights.
- **Read.** `floor-eval/result.txt`: every deck against the start (80 games
  a deck), the weighted-up decks on their own, the decks down by more than
  two standard errors, and the count of decks still behind Stage B.
- **Decides.** Adopt the final iterate if the weighted-up decks gain, the
  count of decks down by more than 2 SE is at chance (~1-2 of 59), and head
  to head against the start is not below 50%. A deck that falls is the next
  deck-specific exploiter's target (`--opponent-decks`).

### 3. Does human feedback move the model? Once there are flags

- **Needs.** 30 or more flags from reviewed traces (`sys1.evaluate --traces`,
  then the replay), converted with `bridge/feedback.ts`. Hold one in five
  out: convert those to a separate file.
- **Run.** 25 iterations with `--feedback data/feedback-train.jsonl
--feedback-weight 1`, and a control of the same 25 iterations without.
- **Read.** `feedback_agree` in the log (training flags) and the held-out
  flags' agreement (score them with a small script over
  `ppo.load_feedback`), plus the paired difference on a `compare-<n>` set.
- **Decides.** Keep if held-out agreement rises and win rate holds within a
  point. Agreement on the training flags alone only shows they were
  memorised. Watch `approx_kl`: the flag steps are outside PPO's KL bound.

### 9. Train longer, on the whole pool

**Done, 2026-09-30: shipped.** Against the rules agents, paired with
`distill-ppo/best` on `compare-long`: +3.1pt ± 0.7 overall, +10.0pt ± 1.5 on
the new decks (0.595 → 0.694), +0.6pt ± 0.8 on the old ones and +0.4pt ±
1.7 on `weak-decks.txt`; 9 decks below 0.6 where there were 11. Jinbe went
0.09 → 0.47, Imu 0.19 → 0.41, Black Yamato 0.44 → 0.65. The gain is the new
decks having been played, not the length: the in-run checks were flat from
iteration 100 (0.769, then 0.760 at 120). Still lowest: Rebecca 0.37, Vivi
0.39, Imu 0.41, Law 0.44. Its web pack (`checkpoints/long-scorer-model.json`) agrees with
MLX on 47 of 48 export samples, worst probability gap 0.017; the other is a
decision MLX splits 0.01 between its top two.

- **Why.** `distill-ppo` stopped at its 80-iteration cap, not at the plateau
  rule, still gaining +0.6 to +1.2pt (each ± 1.0) per 20 iterations. The pool
  has since grown from 38 decks to 52: fourteen it has never played
  (`new-decks.txt`).
- **Question.** Does continuing `distill-ppo/best` for 120 more iterations,
  with uniform pairings over every deck, beat it: overall, on the new decks,
  and on the weakest ones?
- **Run.** `checkpoints/long-run.sh`, which resumes stage by stage:
  ```sh
  .venv/bin/python -m sys1.ppo --init checkpoints/distill-ppo/best --out checkpoints/long-ppo \
    --iterations 120 --eval-every 20 --self-play 0.3 > checkpoints/long-ppo.log 2>&1
  O=checkpoints/long-eval
  for c in distill-ppo long-ppo; do
    .venv/bin/python -m sys1.evaluate checkpoints/$c/best --games 3720 --seed compare-long --out $O/$c.json
  done
  .venv/bin/python -m sys1.evaluate checkpoints/long-ppo/best --against checkpoints/distill-ppo/best \
    --games 3720 --seed compare-long-h2h --out $O/h2h.json
  for group in weak-decks new-decks; do
    .venv/bin/python -m sys1.breadth $O/distill-ppo.json $O/long-ppo.json --group $group.txt --floor 0.6
    .venv/bin/python -m sys1.breadth $O/h2h.json --group $group.txt --floor 0.4
  done
  ```
  About 3 h 30 for the run: `distill-ppo` took 2 h 15 for 80 iterations,
  each ~92 s of training with the next batch's games played alongside it, and
  a check every 20 iterations of 2-3 min. About 10 min for the three
  evaluations (1,240 games take ~50 s). 3,720 games give about 70 a deck
  (±12pt), about 700 on the weak decks and 1,000 on the new ones (±3-4pt).
- **Read.** Against the rules agents: the paired difference overall, on
  `weak-decks.txt` and on `new-decks.txt`, and the decks below 0.6. Head to
  head: the win rate against `distill-ppo/best`. The log's `eval_win_rate` at each check shows where the run
  flattened.
- **Decides.** Ship it if it is ahead of `distill-ppo/best` against the rules
  agents by more than two standard errors, wins more than half its games head
  to head, and neither group of decks is behind. The old decks' gain is the
  longer training; the new decks' gain is that plus having played them, so a
  gain much larger there than elsewhere says the pool was the lever. Flat
  overall with the new decks up: the pool helped and the length did not, and
  the next run need not be longer.

## Need code first

### 4. Let the value head train the backbone

The value head is a head on frozen features (`detach_value=True`); its loss
stayed flat at 0.12-0.13 for a whole run while win rate rose 22 points, and
every advantage PPO computes comes from it. Add `--value-backbone <coef>`
(the value loss flowing into the encoder at a small weight) or a separate
small value tower, then A/B for 40 iterations as in (2). A diagnostic first:
the value's explained variance against final results on one rollout batch.

### 5. What the renderer leaves out

No run can recover what the text rendering (about 222 tokens a decision)
omits. Audit `packages/agents/src/scorer/render.ts` against `observe()`
field by field -- trash contents, effects still pending, once-per-turn
state, the opponent's known cards -- and list what is dropped. CPU only.
Audited in `RENDERER-GAPS.md`, which carries the gaps and the plan.

### 6. Held-out decks: does the model generalise to decks it has not played?

Add `--exclude-decks` to `sys1.ppo` (the pairing sampler draws neither
seat from them), fine-tune 40 iterations without 3-4 decks, and compare the
win rate on those decks with the rest. A small gap means the model already
reads decks rather than recognising them, and more lists add little; a
large one makes the next entry worth it.

### 7. Deck variety for players: variants of the existing lists

Generate realistic variants of the 31 lists (swap 10-15 cards for same-colour,
similar-cost cards from the pool) and real tournament lists (optcg.gg's
API), and train about 70% of games on the core 31, 30% on the wider pool.
Measure on held-out variants and on the core 31: keep if the variants
improve and the core holds within a point or two. 1,725 of the 2,139 cards
are in no training deck today, so their learned card embedding is still
zero.

### 8. A meta fine-tune, later

A short second stage from the broad model: the learner's deck from the top
10 meta lists most of the time, the opponent's from the whole pool, and 20-30%
of games from the broad mix against forgetting. Keep it if meta play gains
clearly and all-deck play drops no more than a point or two; one meta list
held out tests the archetype rather than the list. Whether it ships beside
the broad model is a product call: each model pack adds about 14 MB to the
single HTML file.
