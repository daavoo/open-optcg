# Stronger rules agents, using the learned model

A plan, started 2026-09-30: use the System-1 model (`long-ppo/best`, the
current web model) to find where the rules agents misplay, turn what it finds
into rules the usual way, and only then return to training the model. The
training experiments this defers are at the end, so they are not lost.

## Where this stands (2026-09-30)

- **Done:** Step 1, and Step 3 for the first target (the late-game Counter
  window of Enel and Kuzan ST-33): PR #410, results under "Step 3 results"
  below.
- **Done also:** target 2, the effect-choice clusters: one rule shipped
  (Kaido, PR #414), three leads measured and dropped. See "Step 3 results:
  effect choices".
- **Next:** rerun the census and forks on main after #410 and #414 (Step 4)
  -- it needs the GPU, so after the running PPO arm -- then target 3
  (Rebecca, Vivi, Imu, Law) through the ordinary playbook.
- **Tool:** `bridge/reasons.ts` replays a cluster's targets and writes the
  rules agent's module and reason at each; group forks by it before reading
  any position.
- **Code:** branch `rules-from-model` (worktree
  `worktrees/rules-from-model`), not yet merged. The census and fork tools
  are `ml/sys1/census.py`, `sys1/forks.py`,
  `bridge/fork.ts` and `bridge/rules-game.ts`.
- **Data** (gitignored, under `ml/`, which links `data/` and
  `checkpoints/` to `worktrees/system1/research/system1/`):
  - `data/census-long-ppo/`: the 5,304 recorded games;
  - `data/census-long-ppo-report/report.md` and `rows.jsonl.gz`: the census,
    one row per disagreement with its game's seed and decision index;
  - `data/census-forks/targets.jsonl`, `result-*.jsonl`, `report.md`: the
    forks. A target's `seed` and `decision` find its position in the
    recorded games; `sys1.forks read` rebuilds the table.
- **Model:** `checkpoints/batch2-ppo/iter-0020`, the current web model
  (shipped 2026-10-01; its pack matches MLX on 48 of 48 export samples).
  The census above was scored with `long-ppo/best`, the one before.

## Why the rules agents come first

The rules agents do three jobs, and a stronger one improves all three:

1. **The model's starting point on a deck it has never played.** A new deck
   enters training at the level its rules agent plays it. On arrival Jinbe
   was 0.09, Imu 0.19 and Vivi 0.26 for the model against the rules agents.
2. **Most of the model's training opponents.** 70% of every PPO batch is
   against them, and the model now wins 76% of those games.
3. **The AI opponent for everyone without the model pack**, and the baseline
   every deck's standing is measured against.

The model already pilots most decks well above their rules agent: on the
weak starters it is 20-45pt ahead of the rules agents' standing (Luffy
ST-29 0.71 against 0.24, Luffy ST-18 0.56 against 0.28, Katakuri ST-34 0.48
against 0.26). That gap is knowledge a rules agent could have. The two
numbers are not the same test -- the standings play within a division, the
model's evaluation across both -- so the gap is a pointer, not a measurement.

## What the last training run showed

`long-ppo` (`ml/EXPERIMENTS.md` entry 9): `distill-ppo/best`
trained 120 more iterations on all 52 decks, fourteen of them new to it.
Paired on 3,720 unseen games against the rules agents:

| Decks          | Before | After | Paired change |
| -------------- | ------ | ----- | ------------- |
| All 52         | 0.731  | 0.762 | +3.1pt ± 0.7  |
| 14 new         | 0.595  | 0.694 | +10.0pt ± 1.5 |
| 38 old         | 0.779  | 0.786 | +0.6pt ± 0.8  |
| 10 weakest old | 0.609  | 0.616 | +0.4pt ± 1.7  |

- **Playing a deck is what teaches it; more iterations did not.** The old
  decks were flat over 120 iterations, and the in-run checks flattened after
  iteration 100.
- **The weakest decks are weak for both pilots.** Rebecca (model 0.37, rules
  agents 0.31 in the standings), Vivi (0.39, 0.18), Imu (0.41, 0.22), Law
  (0.44, 0.45). The model learned these from their rules agents and trains
  against rules agents; where the rules agent is weak it has little to start
  from. These want an ordinary policy audit, not the census below: the model
  is no authority on them.
- **The model has stopped moving.** Against its own snapshots (0-40
  iterations old) it wins 0.475-0.515 in every block of 10 iterations. Each
  update moves the policy about 0.003 in KL against a guard of 0.02, and
  entropy and value loss stay flat. See "Deferred" below.

## Step 1: a disagreement census, then forks

Where does the model, reading the same position, prefer a different move from
the rules agent -- and would the rules agent win more by making it?

```sh
# From the repo root: 5,304 games in 12 shards.
for i in $(seq 0 11); do
  pnpm exec tsx ml/bridge/dump.ts --prune --games 442 --shard $i/12 --seed census \
    --out ml/data/census-long-ppo/shard-$(printf %02d $i).jsonl.gz &
done; wait
cd ml
.venv/bin/python -m sys1.census data/census-long-ppo --checkpoint checkpoints/long-ppo/best \
  --eval checkpoints/long-eval/long-ppo.json --out data/census-long-ppo-report
.venv/bin/python -m sys1.forks pick data/census-long-ppo-report data/census-long-ppo \
  --clusters 60 --per 500 --out data/census-forks/targets.jsonl
for i in $(seq 0 11); do
  (cd ../.. && pnpm exec tsx ml/bridge/fork.ts --shard $i/12 \
    --targets ml/data/census-forks/targets.jsonl \
    --out ml/data/census-forks/result-$(printf %02d $i).jsonl) &
done; wait
.venv/bin/python -m sys1.forks read data/census-forks/targets.jsonl data/census-forks/result-*.jsonl
```

- **Games.** `bridge/dump.ts --prune` plays the rules agents against each
  other on every ordered pairing of the 52 decks, twice (5,304 games), and
  records every decision as the scorer's seat is offered it: the provably
  dominated moves (`dominance.ts`) dropped, as in training.
- **Census** (`sys1.census`). `long-ppo/best` scores every decision; a
  disagreement is one where its top option is not the rules agent's. They
  are grouped by deck × turns (1-2, 3-4, 5+) × the kind of each move, from
  the first word of its option text: `no counter -> counter` is a Counter
  the rules agent declined and the model would play.
- **Forks** (`sys1.forks`, `bridge/fork.ts`). The census ranks by how sure
  the model is, which is not whether it is right. So each of the largest
  clusters is sampled, and every sampled game is replayed to its decision
  (`bridge/rules-game.ts`, the loop `dump.ts` recorded it with), the model's
  move is made instead, and the rules agents finish the game. The paired
  difference from the recorded result is what that one move, followed by the
  rules agent, is worth -- the thing a rule making it would buy.

### First results (2026-09-30)

668,439 decisions; the model disagrees on 36% of them, and on 20% with a
probability gap of 0.5 or more. That is too many to read, and only 4% of it
is two identical cards under different slot names. The rules agents played
51 provably dominated moves in 5,304 games.

The forks, 500 per cluster over the 60 largest (29,971 games, 90 seconds on
12 processes). Every cluster is turn 5 or later. With 60 clusters about three
clear |z| 2 by chance, so these are leads, not findings:

| deck             | rules -> model        | change per fork | z    |
| ---------------- | --------------------- | --------------- | ---- |
| Enel (Official)  | no counter -> counter | +6.4pt ± 1.8    | 3.6  |
| Kuzan ST-33      | no counter -> counter | +4.6pt ± 1.4    | 3.3  |
| Kaido (Official) | effect -> effect      | +4.2pt ± 1.3    | 3.2  |
| Doflamingo       | effect -> effect      | +4.0pt ± 1.3    | 3.1  |
| Enel (EU 1st)    | no counter -> counter | +5.2pt ± 1.7    | 3.1  |
| Newgate          | effect -> effect      | +3.6pt ± 1.3    | 2.8  |
| Jinbe            | effect -> effect      | +4.0pt ± 1.5    | 2.7  |
| Trafalgar Law    | effect -> effect      | -5.2pt ± 1.7    | -3.1 |
| Enel (EU 1st)    | activate -> activate  | -4.4pt ± 1.5    | -2.9 |
| Imu              | effect -> effect      | -4.0pt ± 1.5    | -2.7 |

- **Declined Counters are the pattern.** `no counter -> counter` is positive
  on Enel twice, Kuzan, and Luffy & Ace ST-30 (+3.6 ± 1.6), weaker on
  Luffy ST-31 and Black Yamato. The Enel positions read alike: 3-4 Life, a
  hand of seven to nine, an attack on the Leader short by 1 or 1,001 power,
  and the rules agent taking the hit.
- **The model is wrong on Law and Imu**, where it pilots no better than
  their rules agents: following it there loses.
- A fork measures one move. A rule fires at every such decision in a game,
  so its effect on the win rate compounds or cancels; that is what Step 3
  measures.

## Step 2: pick the targets

In order:

1. **The Counter phase late in the game**, starting with Enel (Official)
   and Kuzan ST-33: the strongest and most repeated fork result, on decks
   the model pilots 26-41pt above their standing.
2. **The positive effect-choice clusters** (Kaido, Doflamingo, Newgate,
   Jinbe): which target or card an effect takes. Read what the model picks
   before anything else; some will be offer order deciding for the rules
   agent.
3. **Rebecca, Vivi, Imu and Law**, each through the `audit-deck-policy`
   playbook from its losses, without leaning on the model's opinion.
4. **The opening turns.** No cluster from turns 1-4 reached the 60 largest,
   so the census does not point there; mulligans (`keep hand -> mulligan`,
   0.36 a game) are a candidate for their own forks.

## Step 3: turn a cluster into a rule

The `audit-deck-policy` playbook, unchanged:

- Replay the cluster's positions, and find the reason in the cards. A rule
  that only copies the model's number with no card reason behind it is not
  written.
- The module goes in the shared format heuristics; its `registerPolicy` entry
  names one Leader while it is measured.
- `pnpm heuristic:probe` measures it at the decision it changes; then the
  paired `deck:ab` or `deck:benchmark` the playbook asks for.
- One PR per deck, with the census rows that prompted it in the body.
  `pnpm standings` is rerun when a PR changes a deck's standing.

### Step 3 results: the Counter window (2026-09-30, PR #410)

Grouping each cluster's forks by the rules agent's own reason string was
what found both defects; grouping by Life, hand size or shortfall only
blurred them.

- **Enel: a Counter Event line needing a second Event was judged
  impossible.** `chooseGenericCounter` added one Event to the ordinary
  Counter cards and never counted the others, so a seat at 0 Life holding
  three +2000 Events passed a lethal hit. Forks with the reason "cannot save
  the target": 215, +12.1pt; "take nonlethal Life": 279, +1.4pt. Fixed in
  shared code: Enel (Official) +5.2pt (+415/-158), Enel (EU 1st) +4.8pt
  (+416/-183).
- **Kuzan: a protected body was priced at one 1000 card.** The gain was
  only where one card closed the gap. `characterDefensePower` at 4000 (Ice
  Block, the deck's largest Counter): +4.5pt (+299/-79); the bracket
  peaks there (2000 +2.6, 3000 +1.4, 4000 +0.5, 5000 -1.9, each on the
  last).
- **Not reached:** Kuzan's one-card _Leader_ saves (+5.5pt a fork on
  "take nonlethal Life"). The aggro-gated `one-card-life-save` is a wash
  there (+0.3pt, +119/-106), so it wants its own reading, and so do the
  `counter-budget` vetoes at 1-2 Life (45 Kuzan forks, +8.9pt).
- The other `no counter -> counter` clusters (Luffy & Ace ST-30, Luffy
  ST-31, Black Yamato) were not read; Step 4's rerun says whether they
  survive the Event fix.

### Step 3 results: effect choices (2026-10-01, PR #414)

Each cluster, grouped by the module and reason that answered the fork:

- **Kaido -- shipped.** 176 forks under `op17-kaido-defense`'s "-2000
  changes nothing here" were +10.2pt: the rule priced the Leader's debuff
  against the battle alone, never the Counter step after it (3001 short is
  two cards, 1001 one). Paying whenever a Character's attack lands:
  Official +1.7pt (+200/-119), Open +0.1pt (a wash).
- **Doflamingo -- refuted.** The redirect at 4 Life (62 forks, +8.1pt for
  skipping): ranking the Leader hit above a dying payoff body -1.6pt,
  stopping the pay alone -1.1pt. The model's "take the Life" does not carry
  over to this pilot.
- **Jinbe -- no card reason.** The gift's recipient (287 forks, +5.2pt for
  the Leader) is chosen by `rested-don-gift`; the Leader has no DON!!
  clause, and steering the gift onto it reopens the deck's gift gate and
  dumps the hand (-25.6pt). A sequencing question, not a rule.
- **Newgate -- nothing to write.** Search picks scatter into groups of 2-5.

Two of four leads were the model being right for a reason the pilot cannot
use. The reason string separates the two only once an arm is measured.

## Step 4: re-measure, then train again

- Rerun the census after each batch of rules: the disagreement mass on an
  audited deck should fall, and a cluster that stays is a rule that missed.
- Once the rules agents have moved, the model has a harder opponent and a
  better starting point for new decks. Then the deferred training runs.

## Deferred: the training experiments

In the order to run them, once Step 3 has shipped a batch of rules:

1. **How many iterations does a new deck need?** Done 2026-09-30:
   every saved `long-ppo` checkpoint on the same 1,860 games with a new deck
   in them (`checkpoints/onboard-eval/`). The model's win rate piloting a new
   deck, paired against the start: +2.4pt at 20 iterations, +4.0 at 40,
   +6.5 at 60, +7.6 at 80, +8.2 at 100, +8.4 at 120 (each ± 1.2-1.4). A
   batch of new decks costs about 60-80 iterations; the last 40 of the 120
   bought about a point. Jinbe sat near 0.25 until iteration 60 and reached
   0.46 at 80; Vivi climbed to 100 (0.21 to 0.40). Doflamingo (0.66 to 0.57)
   and Roger (0.93 to 0.86) drifted down, within the ±8pt of about 130
   games a deck but steadily. The old decks in the same games held at
   0.76-0.79 throughout.
2. **Why the model stopped moving.** Arm A done 2026-09-30: `long-ppo/best`
   for 40 iterations at `--lr 1.5e-5` (`checkpoints/lr-ppo`). It lost to its
   start at both checks, -7.5pt ± 1.3 at 20 and -6.0 ± 1.3 at 40, so nothing
   was promoted. The KL guard stopped 39 of the 40 updates after 4-46 of
   ~94 steps; entropy rose from 0.64 to 0.77-0.86 and the win rate while
   training fell from 0.70 to about 0.64. Three times the rate gave about
   twenty times the KL in a twentieth of the steps: the gradient is noisy
   enough that a larger step along it does harm, so the step size was not
   the limit. Arm B (`--epochs 2`) takes more steps along the same noisy
   gradient and is not worth running; arm C (`--self-play 0.5`) is still
   open.

   **The larger batch, done 2026-10-01** (`checkpoints/batch-ppo`): 20
   iterations from `long-ppo/best` at `--decisions 73728 --budget 196608`,
   three times the games an update and three times the decisions each
   gradient step averages, at the default rate -- about the games of 60
   ordinary iterations. Its iteration 20 against its start on `compare-batch`
   (3,720 games): +1.5pt ± 0.6 overall, +2.3 ± 1.4 on `weak-decks.txt`, +1.9
   ± 1.1 on the new decks, decks below 0.6 from 8 to 6; 50.7% ± 1.6 head to
   head, not significant. Both in-run checks promoted (+2.0, +0.6) and every
   update ran its ~97 steps under the guard. Noise was part of the limit, so
   larger batches should be the default; the gain is too small to ship alone.
   (`--decisions` without `--budget` only lengthens an update with more
   steps of the same size: the KL guard ended those after 13-28 steps.)

   **Run longer, done 2026-10-01** (`checkpoints/batch2-ppo`): 20 more
   iterations of the same settings from `batch-ppo`'s iteration 20, stopped
   there because neither in-run check promoted (-1.0pt, -0.7pt). On fresh
   seeds (`compare-batch2`, 3,720 games), paired against `long-ppo/best`:
   `batch-ppo` +1.4pt ± 0.6 (the first result, replicated), `batch2-ppo`
   +1.7pt ± 0.6, +3.4 ± 1.4 on the weak decks, +2.2 ± 1.3 on the new ones, and
   52.7% ± 1.6 head to head. The larger batch bought one step and flattened
   about 1.5pt above the old recipe; `batch2-ppo`'s iteration 20 clears
   entry 9's shipping bar.

3. **An asymmetric critic** (`--privileged`), done 2026-10-01
   (`checkpoints/critic-ppo`). The value head gains a branch over 68
   whole-state features (`bridge/privileged.ts`: both hands, both Life zones,
   the deck tops, board and DON!!), which the game servers send beside each
   decision during training only; the policy never reads them, and the web
   export leaves the branch out. Its last layer starts at zero and it trains
   at `--critic-lr` (3e-4). On `batch-ppo`'s settings, start and seeds it made
   no difference: -0.1pt ± 0.5 against `batch-ppo`'s iteration 20 on the same
   3,720 games, 1,861 of 3,720 head to head, and the value loss only 0.114-0.118
   against 0.117-0.120. The value estimate's noise is mostly what has not
   happened yet -- draws, Triggers off Life, choices to come -- not the hidden
   cards, so a better-informed value head buys little; the larger batch,
   which averages that noise, is the lever. The flag stays, off by default.
4. **Let the value head train the backbone** -- unlikely to pay, for the
   same reason as 3. (`EXPERIMENTS.md` entry 4): its
   loss is flat at 0.12-0.13 in every run, and every advantage PPO computes
   comes from it.
5. **An exploiter, done 2026-10-01** (`checkpoints/exploit-ppo`):
   `batch2-ppo`'s iteration 20, the web model, trained only against a frozen
   copy of itself (`--self-play 1.0 --snapshot-every 1000000 --pool 1`) at
   the larger-batch settings, stopped at 10 iterations (about 11,800 games).
   Its training games against the frozen copy held at 50.4% with no trend;
   head to head it won 51.2% ± 1.6 of 3,720 games; against the rules agents
   0.776 to its start's 0.780. The web model has no hole this PPO finds even
   with a fixed target, so the plateaus were not the self-play opponents
   moving. What is left on the training side is a stronger improvement
   signal than the policy gradient -- search-made targets, or learning from
   actual results (DouZero's Deep Monte-Carlo) -- each a project, not a run.
