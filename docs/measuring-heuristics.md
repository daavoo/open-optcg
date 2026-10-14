# Measuring a heuristic change

Someone plays the app, sees a move that looks wrong, and reports it. This is how
the fix gets judged.

## Why not just run the benchmark

`pnpm deck:benchmark` reports a deck's win rate against the field. That answers
"should we ship this". A reported misplay asks something else: "was that one
decision wrong". The two numbers can be wildly different. The first rule
measured both ways read **-0.6pt** on win rate and **-11.8pt** at the decision
it changed.

The reason is dilution. The engine is seed-deterministic, so a game where the
rule never fires replays identically in both arms -- same actions, same winner.
Those games tell you nothing about the rule, but they still sit in the
denominator. When a rule fires in 7% of games, 93% of the run is noise you paid
for.

## The four rules

### 1. Turn the fix on for the reported deck only

The module goes in the shared `format-heuristics.ts` so other decks can adopt it
later. Its registration names one Leader:

```ts
registerPolicy({ deck: "OP17-079", priority: 191, create: createMyRuleModule });
```

Use `EVERY_DECK` and both arms change for all 26 seats. A real gain for your
deck then cancels against opponents getting the same gain. This is not
theoretical: a search change made inside `createSearchValueModule` -- shared by
ten decks, nine of them opponents -- measured +0.1pt for exactly that reason.

Widening the scope later is a new claim, so measure it again. `audit-deck-policy`
§6b says which rules can skip this and start format-wide.

### 2. Measure the decision, not the game

```bash
pnpm heuristic:probe --deck "<ID>" --module <module-id> --seeds 50
```

The game is played by the **control** agent -- your deck's policy with the
candidate switched off. At every decision the candidate is asked what it would
do instead. Both see the same position and the policy is deterministic, so any
disagreement is the candidate's doing.

At the **first** disagreement the game forks. Both branches share the same
history up to that point, which is what makes them comparable. After the fork,
both branches are finished by the control agent, so the whole comparison differs
by exactly one action.

### 3. Read reach before value

The probe prints a funnel. Read it first:

```
focus-seat decisions with a choice   162734
decisions of the forked kind           1210  (0.7% of decisions)
the rule changed the choice             203  (16.8% of those)
games reaching the situation            187  (7.2% of games)
```

A null result means nothing until you have read this. A silent rule can be
wrong, or gated too tightly, or written for an action shape the engine never
offers. Those need different fixes and a win rate cannot tell them apart.

Changed the choice at 0%? Reach problem -- fix the gate, not the decision.
At 90%? The rule has no restraint in it.

### 4. Trust the exact binomial

The probe prints an exact two-sided binomial and says when there are too few
forks to call. `benchmark:diff`'s McNemar `z` flatters small counts: +6/-15
prints `z = -1.96 *` but is really p = 0.078.

## When the probe does not apply

The probe works by switching one module off, so it can only measure a rule that
_is_ a whole module. Two shapes fall outside it:

**A rule that has to see every candidate.** `decide` modules are handed the
actions that survived ranking, not the full set. A search preference written as
a `decide` therefore sees one option where the engine offered three, and stays
silent forever -- the funnel reports `changed the choice 0`, which is the
correct answer to the wrong question. Rules like this belong inside the existing
ranker, summed into its single contribution.

**A second ranker that disagrees with an existing one.** `applyRanking` protects
each subset ranker's own top candidate from being hidden by another, so two
rankers that disagree leave _both_ winners standing and the choice falls to the
order the engine offered. That is neither rule's intent, and measuring it
measures a build that does something nobody asked for.

For both, the rule goes inside the module that already owns the decision, behind
a per-deck flag, and the measurement is two builds joined with
`benchmark:diff`. Recover the funnel from the reports themselves -- games where
`eventHash` differs are exactly the games the rule changed:

```bash
node -e "const a=require('./before.json'),b=require('./after.json'),D='<deck>';
const k=g=>g.seed+'|'+g.p1Deck+'|'+g.p2Deck, m=new Map(b.games.map(g=>[k(g),g]));
const mine=a.games.filter(g=>g.p1Deck===D||g.p2Deck===D);
const d=mine.filter(g=>m.get(k(g))?.eventHash!==g.eventHash);
const w=gs=>gs.filter(g=>g.winnerDeck===D).length/gs.length*100;
console.log('fired in',d.length,'of',mine.length,'|',w(d).toFixed(1),'->',
  w(d.map(g=>m.get(k(g)))).toFixed(1))"
```

## What this cannot tell you

Both branches are played out by heuristic opponents. A decision that only pays
against someone who punishes the alternative is being graded by someone who may
not.

**So a negative number is not proof the reporter was wrong.** It says what the
current field does with the change.

Only `pnpm puzzles` escapes this, because there the win is forced against every
defence and the answer is proven rather than sampled.

That is why a report leaves two things behind, judged separately:

- **A policy test** asserting the action the reporter said was right
  (`audit-deck-policy` §9). This records the human call.
- **A probe result** recording what the field does with it.

Agree: ship it. Disagree: that is a fact worth keeping, not an automatic
rejection. Put it in the commit message with the funnel and the arm size, so the
next reader can tell a rule that lost from a rule that was never reached.

## Cost

Whole-game A/B runs the field twice and spends most of it on games the rule never
touches. The probe runs the field once and forks only where the rule speaks.

Measured on the same rule: two 90-seed benchmark arms took ~10 minutes across 8
cores and gave a win-rate delta. A 50-seed probe took 2.5 minutes on one core,
reached a smaller p-value, and produced the funnel as well.
