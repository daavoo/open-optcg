# What the scorer does not see: the plan

What the System-1 state text leaves out, compared with `observe()` and with
the LLM seat's request, and the order to add it. This is entry 5 of
`EXPERIMENTS.md` done as an audit; the ground rules there (one job at a
time, a fresh `compare-<n>` seed set per comparison, `test` seeds only for
the final number) apply here too.

The files compared:

- `packages/agents/src/scorer/render.ts` -- the scorer's text (`renderState`,
  `renderAction`).
- `packages/agents/src/llm/render.ts` -- the LLM request
  (`renderDecisionRequest`), plus the Match Context from
  `llm/dossiers/prompt.ts` and the SITUATION figures from `turnBrief` in
  `llm/agent.ts`.
- `GameObservation` in `packages/protocol/src/index.ts`.

## Where things stand

Already in the scorer's text: both trashes (as card and count pairs), face-up
Life, known deck tops, board power with given DON!! and the modifier total,
rested / sick / noattack / negated / changed cost, keywords in force, hand
cost changes, the battle in front of a defender, and the engine's numbers
on each action (attack power, shortfall, counter power, the end-turn audit).

Every missing piece below is either information the pilot legitimately
has, or a field the engine already computes. Nothing here needs a hidden
field; everything goes through `observe()`.

## The gaps, by likely value

### 1. History: what happened since my last turn

The LLM gets every public event since its own previous turn began,
phrased by `eventText`. The scorer reads one snapshot and has no memory,
so it cannot see:

- what the opponent played, countered or triggered last turn -- which
  Counters left their hand, and how many Counter cards they are still
  likely to hold;
- cards a search revealed into the opponent's hand, the only way it
  learns what is in that hand;
- what it has itself done earlier this turn, beyond what the board shows.

Shape: a compact line per event, card placeholders and labels only, capped
(the opponent's last turn plus this turn so far). This is the most tokens of
anything here, so measure the length it adds before deciding on the cap.

### 2. My own deck: what is left in it

The LLM gets its exact card list with printed text; the scorer gets
nothing. The useful form is the remainder -- the list minus hand, board,
trash, Stage and known Life -- as `[[X]]x3` pairs, about 30-50 tokens. It
feeds search picks, mulligans, and deck-out.

Expect little on the 31 training lists, where the Leader nearly
identifies the list and the per-card embeddings have memorised it. The
payoff is on decks the model has not played, so measure it with the
held-out-deck evaluation (`EXPERIMENTS.md` entry 6) rather than on the
usual seeds.

Not the opponent's list: the pilot does not know it. The LLM gets
archetype-level scouting only, and the opposing Leader already carries that
much.

### 3. Cheap flags already in the observation

A few tokens each:

- **Dormant abilities.** `dormant` is written on the Leader only, with no
  reason. The LLM gets `dormantAbility.clause` and `.reason` for the
  Leader, every board card and the Stage. At minimum put `dormant` on board
  cards and the Stage; the reason ("needs 1 given DON!!") is short text.
- **`conditionalKeywords`.** A card whose own text can switch on [Rush]
  or [Blocker] reads as having neither.
- **Stage state.** The Stage line has no rested flag and no dormant flag.
- **`donHeldFromRefresh`.** The one term of "DON!! next turn" that cannot
  be derived from the rest of the text.
- **Modifier duration.** `powerText` sums every modifier into one number,
  so a boost that ends this turn reads the same as one lasting through the
  opponent's turn. Split by `expiresAtTurn`.
- **Rendered by neither renderer:** `onPlayNegated`, `extraTurns`,
  `installedReplacements`, `leaderReactionSpent`, `cannotRestUntilTurn`,
  and hand `currentCounter` (differs from the printed Counter for three
  cards: OP16-118, OP17-063, OP17-118).

### 4. Counter arithmetic on actions

`brief()` strips the engine summary's parentheticals, so a counter line
says `+2000` and not whether the rest of the hand can close the gap. The
LLM also gets `counterPowerInHand` and the Blocker counts. The model can
in principle learn these sums from the card vectors; the question is
whether writing them saves it the trouble. Lowest priority, and the one
most likely to measure as a wash.

## Not worth adding

- The LLM's dossier strategy (game plan, priorities, counterplay): a
  policy is supposed to learn this, not read it.
- The previous decision and the turn plan: devices for an LLM that has no
  memory between calls and must reason each step again. A scorer's
  history is item 1.
- Printed card text: the card vector already covers it (facts, and text
  with `--text pack`); see `CARD-REPRESENTATION.md`.

## The plan, in order

Every change to the text needs a `RENDER_VERSION` bump in `render.ts`,
which refuses every corpus, checkpoint and model pack written in the old
version. So batch, and pay for the retrain once per batch.

1. **Batch A: items 3 and 2.** The flags and the deck remainder are small,
   low-risk and fixed-length. Bump the version, re-dump the corpus, BC then
   PPO from scratch to the usual budget, and compare with the current best
   on a fresh `compare-<n>` seed set and on the held-out decks. Keep if
   neither drops by more than the resolution in `EXPERIMENTS.md`; the
   held-out gain is what decides it.
2. **Batch B: item 1.** History changes the text's length and
   variability, so run it as its own arm on top of whichever batch A
   kept. First measure the token cost per decision and the collector
   throughput it costs, and choose the event cap from that.
3. **Item 4** only if batch A or B leaves Counter-phase play as the clear
   weak spot (`sys1.audit_attacks` and the flagged-misplay review show
   where).

A diagnostic before any of it, CPU only: sample 200 decisions from a
current corpus and count how often each field in item 3 is non-default.
A flag that is set in 0.1% of decisions will not show up in a win rate, so
leave it for a later batch rather than bumping the version for it.

## Results

**Diagnostic (2026-09-27, `bridge/gap-census.ts`, 13,371 decisions from 300
rules-agent games).** Set in a share of decisions worth a flag: conditional
keywords (18-20%), a dormant ability on a board Character (17.5%), a rested
(6-8%) or dormant (5%) Stage, On Play negated (about 3%), a changed hand
Counter (2.8%), a modifier lasting past this turn (about 1.5%), a spent
Leader reaction (about 1%), cannot-rest (about 0.7%). Never set: DON!! held
from refresh, extra turns, installed replacements. A card with both a
lasting and a this-turn modifier: under 0.1%. `observe()` reports dormant
abilities on the viewer's own cards only, so those flags are one-sided.

**Batch A (render version 3, branch `research/renderer-batch-a`): not
kept.** The flags above plus the own-deck remainder, trained with the step-3
card features (BC from scratch on a v3 corpus and 40 PPO iterations, both
without `heldout-decks.txt`) against the step-3 features arm as control,
paired on two seed sets. Pooled over `compare-4` and `compare-5`: -2.1pt ±
2.6 piloting a held-out deck, -0.9pt ± 2.7 piloting against one, +0.8pt ±
1.7 on pairings with no held-out deck. The remainder was expected to pay on
decks the model has not played; it does not, and the interval rules out the
gain it was for. A decision is 24% longer in v3 (274 tokens against about
222), which every stage pays. The branch is kept; the flags may still
matter against human play, which the rules agents do not represent.
