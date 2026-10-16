---
name: evaluate-deck-list
description: "Evaluate and improve a deck list as the learned model (System 1 compact scorer, plus its deck adapter) pilots it. Use when asked how a deck does against the meta, which of its cards earn their slot, what to replace a card with, why a matchup is lost, or whether a list change helps. Covers the per-matchup baseline, the per-card draw/use/impact table from recorded games, telling 'can't play it' from 'won't play it' from 'doesn't know the card', choosing replacement candidates the model already knows, the paired list A/B that decides, confirming how a winning card is actually used, and deep-diving one matchup with traces and an analysis agent. Not for the hand-written rules agents (that is audit-deck-policy)."
argument-hint: "Training deck id (e.g. mon), optionally a card or a matchup"
---

# Evaluate a Deck List with the Learned Model

The question is never "is this card good" in the abstract. It is "does this
list, **as the learned model pilots it**, win more against the decks it will
meet". Every step below answers a part of that with games, and the decision
is made by one measurement only: **a paired list A/B with the same pilot and the
same seeds** (step 5). The rest finds what is worth measuring.

The worked example throughout is `mon` (Leader OP09-061), Oct 2026: 37.4% against
the meta. Three slots looked dead, and the card-table training aimed at them
changed nothing. The win came from a swap the per-card table pointed to:
4 Doflamingo OP16-069 out and 4 2000-Counter bodies in, worth **+8.7 ± 1.3
points**. A removal Event that read well on paper lost 3.

Scripts live in `scripts/` beside this file. The Python ones run from
`ml` with `.venv/bin/python`, and the TypeScript ones from the
repo root with `pnpm exec tsx`.

## 0. Know your pilots and your field

- **The pilots.** Use the checkpoints the app ships:
  - the general pack's `source` in `packages/web/src/scorer-model.json`;
  - the deck's adapter in `packages/web/src/scorer-adapters/<deck>.json` (`source`, over `base`).

  Pass the adapter checkpoint as `--pilot` (it carries its base) and the general
  model as `--opponent-pilot`. Both sides play greedily, so a seed replays
  nearly the same game. That is what makes paired comparisons cheap. Not
  exactly the same: the models score in bfloat16, and how decisions are
  batched together can flip a near-tie. The same list rerun gave 933 and then
  928 wins of 2,048. Compare lists within one run where you can, and treat
  under ~0.5 point between runs as nothing.

- **The field.** A deck list file of the opponents that matter: tournament
  lists, plus anything the user plays. For mon it is
  `ml/checkpoints/lora-eval/mon/targets2.txt`, 16 decks. Weigh
  whole-field results separately; a list tuned for the meta can lose elsewhere.
- **Variants** never go in a tracked file. Write scratch manifests to a JSON
  `{id: {id, leader, cards}}` and pass `--variants` (scripts), or set
  `SYS1_EXTRA_DECKS=<file>` (TypeScript and the bridge). `bridge/decks.ts` reads
  them as training-only lists. A list must total 50 cards and match the Leader's
  colours.

## 1. Baseline, per matchup

```bash
cd ml
.venv/bin/python ../.claude/skills/evaluate-deck-list/scripts/list_ab.py mon \
  --pilot <adapter ckpt> --opponent-pilot <general ckpt> --against <targets> --seeds 64
```

- **Precision:** 64 seeds × 16 decks × 2 seats = 2,048 games, enough for about ±1 point overall.
- **Per-matchup rows** (128 games each) carry about ±5 points of noise. Read
  patterns across several rows, not one row.
- **Cost:** a run is about 5 minutes with the machine to itself. Training
  running alongside roughly doubles it.

## 2. The per-card table

```bash
.venv/bin/python ../.claude/skills/evaluate-deck-list/scripts/record_traces.py mon \
  --pilot ... --opponent-pilot ... --against ... --seeds 32 --out checkpoints/mon-traces   # 1,024 games, ~5 min
cd .. && pnpm exec tsx ml/bridge/card-usage.ts ml/checkpoints/mon-traces
```

For each card the table gives:

- how often it is drawn;
- how often it is **used when drawn**;
- how it is used: played, Counter, cast, discarded, attacks, blocks (per game);
- the win rate with the card drawn against without it, as **impact**.

How to read it:

- **A dead card** is a low use rate together with negative impact. For mon:
  - Kaido & Linlin OP08-119: used in 2% of draws;
  - Doflamingo OP16-069 and Luffy OP09-119: 30% each;
  - all three read −7 to −10.
- **"Discarded" ≈ "played"** means the card is mostly fodder for discard costs.
- **Impact is a correlation.** A card drawn mostly in long games, or from behind,
  takes those games' results. It is also relative to the list's own average:
  add four Counters and every other Counter's impact falls, though they are used
  just as often.
- **Counter cards look backwards** on "used vs unused": when mon is winning it
  does not need to Counter. Compare drawn with not drawn instead.

## 3. Why a card is dead: can't, won't, or doesn't know it

- **Can't vs won't.** Run `scripts/offered_chosen.py <deck> <cards>`. Of the
  decisions where the engine offered a play or a block with the card, how many
  did the pilot take?
  - Kaido & Linlin was taken at 4% of its offers. The OP17-062 Kaido that
    replaced it was played at 50% and blocked at 44%.
  - Low offers mean the card's cost or condition is the problem. Low takes with
    plenty of offers mean the pilot declines it.
- **Does the model know the card?** Two checks:
  - `scripts/card_knowledge.py <general ckpt> <cards>` shows how far each card's
    row has moved from where compact training started. Mon's core moved 0.54–0.72.
    Its three 9 Oct cards moved 0.09–0.16, about the level of cards no list plays.
  - `ml/bridge/deck-candidates.ts --leader <L> --cards <cards>` counts the other training
    lists that play each card.

  A card only this deck plays is learned only through it, and an adapter leaves
  the card table frozen.

- **Unknown is not always the reason.** Training mon's adapter with its own card
  rows (`compact_ppo --train-cards`, shipped in the adapter as `cardRows`) gave
  the shipped adapter +2–3 points. It did **not** change how often the three dead
  cards were played. They were weak in this list, not misread.
- **Read the card.** Use the local printed-text pack (never commit it). Dead
  cards usually show it plainly:
  - Kaido & Linlin needs DON!! −10;
  - Doflamingo is a 7-cost body with no Counter, in a deck that dies holding too
    few Counters.

## 4. Choose candidates

```bash
pnpm exec tsx ml/bridge/deck-candidates.ts --leader OP09-061 --deck mon
```

Prefer cards that meet all four:

1. They are legal under the Leader's colours.
2. **The model has trained with them** (other training lists play them). An unknown card is
   piloted from its starting vector: Ragnaraku, in no list, lost 3 points.
3. They fill a gap the games showed. Mon died 1–3,000 Counter short, so 2000-Counter
   bodies were the obvious test.
4. They don't depend on a Leader type or a board the deck never has (Elbaph,
   cost-12 Characters).

Test cheap fixes before clever ones: a vanilla 2000-Counter body beat both
removal Events.

## 5. Decide with a paired list A/B

```bash
.venv/bin/python ../.claude/skills/evaluate-deck-list/scripts/list_ab.py base v1 v2 v3 \
  --variants /tmp/variants.json --pilot ... --opponent-pilot ... --against ... --seeds 64
```

- **The base is the current best list.** Build each round on the last winner:
  mon went base → Kaido swap → the Doflamingo slot → the Kaido/Kid slots.
- **One swap per variant, then combinations.** Four copies out and four in.
- **Read the paired difference.** The script's ± is the standard error. About
  2 SE is a result; inside 1 SE is a wash. A wash is not a refutation, so keep
  the change if the user prefers the card.
- **Confirm a combination; don't add up its parts.** For mon, Kaido → Morley
  was +8.0 and Kid → Pudding +2.5, but the pair together measured +8.1.
- **Same pilot, no retraining,** so the comparison is the list. An adapter can
  later be fine-tuned on the new list for more.

## 6. Confirm the mechanism

Before writing up why a swap won, record games of the winning list
(`record_traces.py --variants`) and run `ml/bridge/card-usage.ts` on them.

- Fra-Nosuke and Kamazo were each used as a **Counter about once a game**.
  Fra-Nosuke was never attacked with; Kamazo was played in about 1 game in 10.
  So the gain was the Counters, not their effects.
- Report that plainly. The user asked exactly this.

## 7. Ship, or not

- **The list is the user's; propose, don't change it.** The app picks an adapter
  by Leader alone, so a new list is already piloted by the deck's adapter.
  There is nothing to ship to play it.
- **To make it the training list,** edit the deck's manifest in
  `ml/bridge/decks.ts`. Then optionally fine-tune the adapter on it:
  `compact_ppo --init <adapter> --lora 16 --train-cards <the list's cards> ...`,
  then `export_adapter`, a parity check, install, and `pnpm web:build`.

## A lost matchup, in depth

When one matchup is far below the rest (mon vs Xebec, 6–8%):

1. **Swap the pilots.** Play the matchup with each side piloted by the model and
   by its rules agent (`play` specs with `"rules": "p1" | "p2" | "both"`). For
   mon vs Xebec:
   - rules agents on both sides: 10%;
   - mon's adapter vs Xebec's rules agent: 55%;
   - mon's rules agent vs the model's Xebec: 0%.

   So the matchup is lopsided and the model pilots Xebec very well. Also check
   how the other meta decks fare against the same opponent.

2. **Record and analyse about 100 games.**
   - Record with `record_traces.py --against` a file holding just that deck.
   - Render readable logs with `pnpm exec tsx ml/bridge/trace-text.ts <dir>`.
   - Hand the logs to an analysis agent. Ask for: how games are lost (turn, mechanism), the
     opponent's key cards, recurring misplays with counts and file+turn examples, what the
     wins have in common, a structural-or-fixable verdict, and engine-bug suspicions.
   - The agent cannot write files; save its report yourself.
3. **Verify the agent's surprising claims before acting.** "All 8 wins came from
   seat p2" vanished on 300 fresh games: 4% vs 7%.
4. **Count a suspected blunder across the whole meta before writing a rule.**
   "Ends the turn at 0 Life without attacking" happened 2 times in 100 Xebec games and
   0 in 384 meta games. Not worth a rule.
5. **Check whether a leak generalises.** Wasted Counter saves (47% vs Xebec, 38%
   vs the meta) and an uncastable Gum-Gum Giant (45–50%) were general. The list
   change that fixed the Counter shortfall helped against almost every deck.

## Pitfalls that cost time

- **Game order.** `play()` returns games in the order they finish, not spec
  order. Key results by the spec (`g["spec"]`), never by index.
- **Traces with the model on both sides.** Since cddef02f, `write_trace`
  annotations keep only the traced seat's notes. Older traces of a two-model game
  carry the other seat's probabilities on the traced seat's lines.
- **Leftover scratch lists.** A scratch list written into a tracked file outlives
  the test and leaks into `deck-candidates.ts` counts. That is why variants go through
  `SYS1_EXTRA_DECKS`.
- **Deck ids.** A deck id is the catalog's full name (e.g. `(Blue) Rocks.D.Xebec - Open OPTCG`).
- **Card-table rows.** `cards.json` sorted is the card table's row order, and
  the pack's `cards` list is the same order.
- **The checkpoints live in `worktrees/system1`** behind symlinks. Never delete
  `worktrees/` to tidy up.
