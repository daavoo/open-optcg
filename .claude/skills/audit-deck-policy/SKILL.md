---
name: audit-deck-policy
description: "Audit and improve a deck's rules agent in Open OPTCG. Use when a deck underperforms in the benchmark, when a policy's decisions look wrong in a trace, when deciding whether a matchup module still earns its keep, or when a proposed heuristic needs measuring. Starts by locating the deck's decision surface with `pnpm census`, then covers reading a deck's engine before its policy, researching how the archetype is actually piloted and turning that into measurable rules, scoping each new rule to one deck while it is measured and widening it only once it has a sign, checking turn sequencing against the rules engine, and paired A/B measurement."
argument-hint: "Deck ID (e.g. ST34), optionally a specific matchup or symptom"
---

# Audit a Deck Policy

A losing deck is usually a policy that has never been checked against its own
deck. **Find where its decisions are and who is answering them, before reading a
line of the policy.** Tuning card values is the last resort, not the first move.

Two worked examples run through this file. ST32 went from 35.2% to 66.4% on turn
sequencing alone. OP-14 Green Mihawk went from 53.9% to 57.2% on a single rule,
after four other hypotheses were measured and refuted -- and the defect was
visible in the first ninety seconds from the command in section 1, which that
audit ran last.

## 1. Find the Decision Surface

Run this before anything else, including before reading a trace.

```bash
pnpm census --deck <ID> --seeds 20
```

It answers three questions at once, and each has caught a real fault:

**Is anyone driving?** The first table ranks decks by the share of decisions no
rule scoped to them touched. Mihawk read **34.2% "no rule at all", the
least-piloted deck in the field**, against 0.0% for ST32. A deck with a high
share does not need this audit's later sections -- it needs a policy, and
sections 2 to 4 are how to write one.

**Where do its decisions live?** The decision-surface table ranks
`<phase>:<actionType>` by volume, per game, with the unruled share of each. A
rule is worth (how often the decision occurs) x (how much a better answer is
worth), and **only the first factor is knowable before you write the rule**.
Mihawk's top row was `main:resolve-effect` at 27.8 per game with **68.8% no rule
at all** -- more than twice the next surface, and almost entirely unpiloted. That
is where its win rate was. Start at the top row.

**What is registered and never fires?** `silentModules` names modules registered
for the deck that never decided or narrowed anything. Dead weight, or a gate that
never opened; both worth knowing and neither visible from the registry.

Forced moves are excluded from every figure, and the count is shown separately.
This matters more than it sounds: Mihawk's block phase reads 99.4% unpiloted, and
**1622 of those 1693 decisions offered only `pass`**, because every attack
against a seat raises a block decision whether or not it holds a [Blocker]. A gap
made of forced moves is not a gap.

## 1b. Baseline, and Keep the Report

```bash
pnpm deck:benchmark run --deck <ID> --seeds 300 --output analysis/<id>-baseline.json
```

Paired games against every other deck the app ships. The benchmark is
seed-deterministic, so this file is not just a number: it is the **control**.
Every later run plays the same games, which makes each comparison paired.

`--field format` narrows to the six starter decks, and exists only to reproduce
measurements taken before the roster grew. Do not use it to judge a deck: the
default field is the one the deck is actually asked to beat, and the difference
is not cosmetic. Mihawk reads **68.9% against the six and 53.9% against the
roster**, and the two matchups it loses worst -- OP-17 Ace and OP-17 Sabo Elbaph
-- are not in the six at all. `--opponents A,B` picks a specific field when a
matchup is the whole question.

`analysis/` is gitignored, which is what it is for: the report is a local
artefact of this audit, and the numbers you take out of it are what ship (see
section 10). Keep the file until the audit is finished -- a paired diff needs
both reports on disk -- and expect it to go no further. **Comments citing
`analysis/<deck>-policy-<date>.md` are dangling references**; those files were
never committed. Delete such a citation when you touch it -- the measurement it
points at belongs in the commit that made the change, not in the source.

Note the per-matchup rates, not just the overall. A deck that is even across the
field has a different problem from one that is 48% against four decks and 17%
against the fifth.

## 1c. Ask Whether the Deck Is Executing Its Own Plan

Before concluding a deck is mispiloted, check that the plan happens at all. Count
the engine pieces its dossier names, per game, per matchup. Mihawk's read 4.36
Leader restands, 5.30 cost-5 bodies and 4.10 lock activations per game -- healthy
-- which is what redirected that audit away from "the plan never happens" and
toward "the plan happens with the wrong cards".

The losing matchups showed the same pieces at **half the rate over three fewer
turns**, which is the signature of a deck dying before its engine pays rather
than one misplaying it. That is a tempo problem, and no amount of decision tuning
in the deck's own phase will fix it.

## 2. Read the Deck Before You Read the Policy

This is the step that is skipped, and it is the one that finds the bug. Do not
open the policy yet.

1. Get the decklist from `packages/decks/src/generated.ts`.
2. Read the printed text of **every** card in it, plus the Leader, from
   `packages/cards/src/generated.ts`.
3. Write down, in one paragraph, what the deck's engine is: which resource
   converts into which other resource, and which cards do the converting.

For ST32 that paragraph is: the Leader restands once per turn if it battled a
Character, but only at three attached DON!!; Tashigi and Kuina both give the
Leader up to three DON!! _from the rested pool_; DON!! becomes rested by being
spent. So the three DON!! that switch the Leader on are free, provided something
has already been paid for this turn.

Every sequencing rule in the rebuilt policy follows from that paragraph. None of
them are visible from the policy file.

## 3. Look Up How the Deck Is Actually Piloted

Search the web before you write a heuristic. The paragraph from step 2 tells you
what the deck _can_ do; players who have piloted the archetype tell you which of
those lines is the one that wins, and that is knowledge no amount of reading the
engine will produce.

Search for the Leader by card number and by name, plus the set code -- e.g.
`OP12-040 Kuzan ST-33 deck guide`, `"Blue Kuzan" one piece tcg how to play`,
`ST-33 starter deck strategy`. Useful sources are matchup primers, tournament
reports and deck-tech articles. What you are looking for is a **sequencing or
priority claim**, not a decklist: "trash first, then play the discounted body",
"hold the Counter Event for the turn they commit", "this deck wins on card
advantage, not board".

Then map each claim to a rule you can measure:

1. **Write it as a sentence about a game state**, in the vocabulary `Tactics`
   already has: Life totals, Counter cards in hand, DON!! on field, blockers,
   `attackPressure`. If the claim cannot be phrased that way it is not yet a
   rule, it is a slogan.
2. **Decide the tier.** A preference among candidates of one kind is `rank`; a
   "never do this here" is `never`/`veto`. Both are one expression in
   `heuristics.ts`.
3. **Decide the scope**, using section 6 below. Most community advice is written
   about _archetypes_ ("against aggro, keep a blocker"), which is
   `forArchetype`, not a matchup module.
4. **Measure it like anything else.** Published advice is written for the real
   card pool, a much larger format, and a human opponent who bluffs. It is a
   hypothesis generator with a good prior, not an authority. A rule that
   everyone agrees on can still be a large negative here: this deck's audit
   killed "attach DON!! only where it crosses a Counter threshold", which is
   both a community fundamental and an already-shipped module, at **-7.5pt**.

Name the source in the commit message alongside the measurement, so the next
person can tell a rule that came from evidence from one that came from a guess
-- and can tell which community claims did not survive measurement here.

## 4. Confirm the Engine, Not the Card Text

Printed text tells you the intent; `packages/engine-core/src/engine.ts` tells you
what actually happens, and the difference is where free value hides. Grep for the
card number and read the handler.

Two examples from ST32, both load-bearing:

- Kuina's handler is `player.restedDon.splice(0, 3)`. That is what proves the
  DON!! comes from the rested pool and that activating it on an empty pool moves
  **zero** DON!! rather than falling back to active.
- `resolveBattle` pushes `OP12-020:battled-character` _before_ it compares power.
  The restand is therefore earned on declaration, so a Leader battling a body it
  cannot beat still buys a whole extra attack.

Also check how the engine _offers_ the action. Legal-action generation encodes
restrictions the observation does not expose -- ST32's used restand is detectable
only because it stops offering Characters with a base cost of 7 or less as Leader
targets.

## 5. Audit the Ladder Against That Paragraph

Deck policies are first-match-wins ladders, so their **order is the behaviour**.
Read it top to bottom and check each of these:

- **Does it develop before it powers up?** Spending DON!! on attachment before
  plays caps development at the remainder. This is also what fills the rested
  pool for any deck whose abilities consume rested DON!!.
- **Do abilities that consume rested DON!! run after costs are paid?** At the top
  of a turn every DON!! is active and the rested pool is empty.
- **Does it attach DON!! before the attack it is meant to improve?** An
  attachment below the attack steps is power that never swings.
- **Can the attachment reach a threshold at all?** Counter is spent in whole
  cards: against a 5000 Leader, 5000 and 6000 both cost one card. One DON!!
  toward a `[DON!! x3]` ability that will not be completed buys nothing.
- **Are effect options split by `effectKind`?** A single "highest cost wins" sort
  answers "which card do I free-play?" and "which card do I trash?" identically.
  ST32 was trashing the best card in its hand to Kin'emon.
- **Is the effect's _kind_ read from `effectKind`, or guessed?** A policy that
  infers "this is a search result" from a field being populated, or from the
  summary text, is depending on an engine detail rather than the contract. ST33
  detected searches as `optionCardNumber !== undefined`; when the engine began
  setting that field for every option naming a card, one branch swallowed 96% of
  ST33's effect decisions and answered every discard with the _best_ card in
  hand. It cost 22.8pt and no test failed. Classify with `effectKind` and the
  typed `option` descriptor (`optionCard`, `isOptionCardIn`).
- **Do non-main phases fall through to `chooseGenericRules`?** Its Counter policy
  has an empty protected-card set, so the deck will never spend Counter to save
  its own engine pieces.
- **Are targets and plays chosen, or taken first-offered?**

Prefer `rank`/`veto` heuristic modules over editing a ladder where you can --
`packages/agents/src/heuristics.ts` explains why, and they compose. A whole-turn
sequencing fix is one of the few things that genuinely needs `decide`.

## 6. Register a Rule at the Widest Scope That Is True

This section is about where a rule **ships**. Where it is **measured** is a
different question with a different answer, and section 6b is that answer: a
rule found in one deck's trace is registered for that deck alone until it has a
sign. Widen it here only once it does.

A rule buried in a matchup module only ever fires in one of five matchups, never
composes, and silently stops inheriting every later improvement to the deck
policy. Most rules written as matchup knowledge are not matchup knowledge.

Before adding an `opponent:`-scoped registration, say the rule out loud and look
at what it actually names:

| The rule names                                                           | Register as                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------- |
| A game-state property -- Life, Counter in hand, blockers, DON!! on field | `EVERY_DECK`, gated with `.when(...)`           |
| A way the opponent plays -- aggro, control                               | `forArchetype`, using `archetypeOf`             |
| A card's printed text, whoever is holding it                             | `EVERY_DECK`; the engine resolves text globally |
| One specific Leader's ability changing the arithmetic                    | `opponent:` -- a real matchup module            |

Only the last row earns a matchup module. The test is counterfactual: **if a
seventh deck joined the format tomorrow with the same property, should the rule
fire?** If yes, it is a format rule with a gate, and writing it as a matchup
module is a bug that will not show up as one.

Two pieces of evidence from this repository:

- `st32-into-st31` is 700 hand-tuned lines that measured as a **wash** (-0.8pt,
  z = -0.57, 1200 games) once the deck policy underneath it was fixed. Its
  content had become general, and the general version was better.
- ST33's one genuinely matchup-shaped finding is that Katakuri answers an attack
  by permanently returning a DON!! to the deck, so cheap early Leader attacks are
  DON!! denial. Even that is better stated as a property -- "the defending Leader
  pays a resource to survive" -- than as "the opponent is ST34".

The same applies in reverse when a matchup module already exists: if you fix
something in one, check whether the deck policy has the same fault, and fix it
there instead. ST32's `effectKind` split lived only in its ST31 matchup module
for months while the deck policy trashed its best card in the other four.

## 6b. Scope It to One Deck to Measure It

Shared code, per-deck registration. The module goes in `format-heuristics.ts`
where any deck can adopt it later; its registration names **one Leader** while
it is being measured:

```ts
registerPolicy({ deck: "OP17-079", priority: 191, create: createMyRuleModule });
```

**Why.** The benchmark reports the focus deck's win rate against 25 other seats.
Register at `EVERY_DECK` and both arms change for _every_ seat, so a real gain
for your deck cancels against opponents getting the same gain. Two different
questions, and the first has to be answered first:

| Question                    | Who may differ between arms |
| --------------------------- | --------------------------- |
| Is this better play?        | the focus seat only         |
| What happens if we ship it? | everyone who would get it   |

**One combination is silently invalid**: an `EVERY_DECK` registration measured
by diffing two `deck:benchmark` builds. Either of these is fine; mixing them is
not.

- Register for one Leader, then two builds joined with `benchmark:diff`.
- Register at `EVERY_DECK`, then `pnpm deck:ab --disable <module-id>`, which
  switches it off on the focus seat only.

A duplicate-demotion added inside `createSearchValueModule` -- shared by ten
decks, nine of them opponents -- measured +0.1pt (z = 0.22, 4680 games) for
exactly this reason.

**Which rules can start format-wide.** Split on dominance versus trade:

- A **dominance** rule gives nothing up, so no deck can price it differently.
  `free-block` is one: the Blocker outpowers the attack, nothing else can swing,
  so it survives and nothing is spent. Ship it format-wide on the argument.
- A **trade** rule spends one resource for another -- a card for a Life, DON!!
  for power, tempo for cards. The exchange rate belongs to the deck's plan, not
  to the rules, and a racing deck prices it opposite to a control deck. Opt-in,
  one deck at a time.

`createDonThresholdModule` is why this matters: shared code, registered for ST35
alone, measured **+5.4pt for ST35, -5.4pt for ST36, -7.5pt for ST33**. One
module, three decks, three signs.

Widening later is a new claim, so measure it again. A rule worth +2pt for one
deck can be a wash field-wide with nothing wrong in either number.

**Narrowing is a new claim in the same way, and a null is not the end of one.**
A predicate that is too wide dilutes its own signal: the positions where the
rule is right are averaged with positions it should never have spoken at, and
the arm reads as a wash. Before abandoning a null, ask what the _narrowest_
version of the claim is and price that separately. `ko-payoff-target` is the
worked case -- "do not attack a body whose `[On K.O.]` pays its controller"
measured -0.6pt and +1.9pt over 131 cards; narrowed to the 29 whose replacement
arrives **active** and can block the next attack, the same rule measured
**+8.0pt (+21/-4, p = 0.0009)**. Same finding, three predicates, and only the
third is true.

Then measure the rule at the decision it changes, not at the win rate:

```bash
pnpm heuristic:probe --deck "<ID>" --module <module-id> --seeds 50
```

It forks at the first decision where the rule disagrees with the agent that
lacks it, finishes both branches with the control agent, and prints how often
the situation arose and how often the rule spoke. Read that funnel before the
delta: a silent rule can be wrong, gated too tightly, or written for an action
shape the engine never offers, and a win rate cannot tell those apart. Full
method in `docs/measuring-heuristics.md`.

## 7. Measure One Change at a Time

**Search the history before you run the arm.** Every wash and every negative is
recorded in a commit message, and a rule that reads as an obvious improvement
has often been measured already. `git log -S` over the gate you are about to
change -- or over the test that pins it -- is the cheapest instrument in this
file:

```bash
git log -S"koRefundsDefender" -p -- packages/agents/src/rules/format-heuristics.ts
git log -S"<phrase from the test comment>" -- test/<pinning>.test.ts
```

A prior refutation is not a reason to stop. It tells you which version lost and
why, which is what makes the next arm a different claim rather than the same one
run twice: #149 measured a body-replacing `[On K.O.]` gate at -2.0pt vs ST36
against a _text_ gate, and the reason it lost -- OP12-113's replacement arrives
rested -- is exactly the line the version that wins is drawn on.

```bash
pnpm deck:benchmark run --deck <ID> --seeds 300 --output analysis/<id>-v1.json
pnpm benchmark:diff --deck <ID> analysis/<id>-baseline.json analysis/<id>-v1.json
```

`benchmark:diff` joins the two reports game by game and reports McNemar's z over
the games the change actually flipped. Concordant games carry no information
about the change; testing the two win rates as independent samples folds every
shared seed back into the variance and needs roughly an order of magnitude more
games for the same power.

For a change expressed as a registered module, A/B it directly without two
builds:

```bash
pnpm deck:ab --deck <ID> --disable <module-id> --seeds 300
```

Treatment is as-shipped, control is the same agent minus that module. Use it for
matchup modules too -- that is how `st32-into-st31` was shown to be a wash.

Resist bundling. Each of ST32's four steps was measured separately, and the one
that read as the cleverest contributed nothing.

## 8. Check Containment

A change scoped to the deck policy **must** show 0 flipped games in any matchup
that a higher-priority module intercepts. `policiesForDeck` orders matchup
modules ahead of the deck module, so those games never reach it.

If a scoped change moves a matchup it should not have touched, the change is not
scoped -- find out why before trusting any of its other rows. A zero-flip column
is evidence the measurement is sound, not a missing result.

To distinguish "no decisions changed" from "same winners, different games",
compare `eventHash` rather than `winnerDeck`:

```bash
node -e "const a=require('./before.json'),b=require('./after.json');
const m=new Map(b.games.map(g=>[g.seed+'|'+g.p1Deck+'|'+g.p2Deck,g]));
console.log(a.games.filter(g=>m.get(g.seed+'|'+g.p1Deck+'|'+g.p2Deck)?.eventHash!==g.eventHash).length)"
```

Use this to prove a refactor is behaviour-preserving, and to tell a rule that
never fires apart from one that fires and does not matter.

**A deck with no matchup modules has no zero-flip column**, so this control is
simply unavailable -- ST33 is one. Do not read "every matchup moved" as a fault
there; read the `eventHash` percentage instead, and check it against what the
change should touch. A defensive change that alters 86% of games is plausible; a
change to one effect's targeting that alters 99% is not, and means the branch is
firing somewhere you did not intend.

Also confirm nothing moved underneath the comparison. The benchmark is
seed-deterministic given the same engine, agents and registrations, so a paired
diff is only paired if all three were identical for both runs. Check the
modification times of `packages/engine-core`, `packages/agents` and
`registry.ts` against the two report timestamps before believing a delta; a
concurrent edit to any of them invalidates the pairing rather than adding noise.

## 9. Pin the Judgements With Tests

Add a policy test per fixed judgement, posing a board rather than playing a game.
Follow `test/st32-policy.test.ts`. Choose an opponent deck whose matchup module
will not intercept, and remember a Character's card number on the opposing board
is independent of that deck's list -- the engine resolves text globally.

Test the decision, not the outcome: assert the chosen action, and where the
reason string is the point, assert that too.

## 10. Report What Moved, Including Zeros

A change that changes nothing is a result. Record it with its measurement rather
than dropping it or quietly keeping it as an improvement.

**Record it in the commit, not in a comment.** `analysis/` is gitignored -- it
holds run artefacts, and a write-up put there is deleted with the next clone --
but the answer is not to move the write-up into the source. A measurement is
dated evidence: it belongs where the date, the diff and the base commit travel
with it. Every finding has a place that ships with it:

- **Every measurement -- a shipped rule's delta, flipped counts and z, and every
  variant that measured as a wash or a negative** -- goes in the commit message
  and the PR body, with the arm sizes and enough of the reasoning that the next
  reader can tell what was actually tested. That is the whole audit record, and
  `git log -p` over the deck's policy file is how it is read back.
- **The deck's engine paragraph from step 2** goes at the top of the deck's
  policy file, because every rule in it follows from that paragraph -- as a
  standing description of how the deck works, with no numbers in it.
- **Why a shipped rule is shaped the way it is** goes in its doc comment, stated
  as a claim about the cards, the engine or the format: "the Leader asks for
  fuel every turn, so a card held for Counter is a turn of the plan skipped".
  Not "+4.4pt (z = 6.50)", and not the list of shapes that lost to it.

**Do not leave a rejected variant behind in a comment.** No "tried and
rejected", no "an earlier version did X", no delta for code that is not in the
file. A comment carries no date and no base commit, so a dead end measured
against one card pool, one ladder and one engine outlives every one of them and
reads to the next contributor -- and the next agent -- as a settled verdict.
That is the opposite of the goal: it forecloses the question instead of
recording the answer. The commit message is the record; the file describes what
it does.

Older comments in this repository still cite `analysis/<deck>-policy-<date>.md`
documents by name. Those files were never committed and no longer exist. Delete
such a citation when you touch it, along with the measurement narration around
it.

## Measurement Traps

Every one of these produced a confident, well-formatted, wrong number during the
Mihawk audit. Each was caught only because the output happened to look
impossible.

**Read the exact binomial, not the normal-approximation `z`, under ~50 flipped
games.** `benchmark:diff` prints McNemar's `z` and stars it at p<0.05. On a
small discordant count that approximation flatters the result: +6/-15 prints
`z = -1.96 *` and its exact two-sided binomial p is **0.078**. A rule firing in
1% of games produces exactly that regime, and a starred row there is a
hypothesis, not a finding. Check it in one line before believing a star:

```bash
python3 -c "from math import comb; k,n=6,21; print(2*sum(comb(n,i) for i in range(k+1))/2**n)"
```

**A rare rule is invisible to a win rate, whatever the arm size.** A module that
changes ~20 of 1560 games cannot move an aggregate enough to be resolved, even
when it is correct every time it fires. Two things follow: escalate seeds until
the _discordant_ count is large enough to test (not the game count), and where
it cannot be, measure the decision instead of the game -- enumerate the
positions where the rule fires and check them directly, with
`pnpm heuristic:probe` at the decision and a policy test that pins it.

**An aggregate wash can be two real effects cancelling.** Before trusting a
null, check the fire rate and the per-matchup rows. A change measuring +0.1pt
field-wide because every opponent got the same improvement is not the same
result as one that never fired, and the ALL row cannot tell them apart.

**`heuristic:ab` cannot see a rule whose trigger is a card in the _opponent's_
deck.** Its arms are mirror matches, so the only opponent a focus deck ever
faces is itself: a rule that fires on something the opponent's board holds is
unreachable for every deck that does not run that card, and those rows come back
at exactly 50.0% because the two arms played identical games.
`ko-payoff-target` reads 50.0% for 22 of 28 decks for this reason, and 50.1%
overall -- a number that says nothing about a rule measuring +8.0pt at the
decision. Tell the two apart by the row value: an exact 50.0% is a rule that
never fired, not a rule that did nothing. Where the trigger belongs to the
opponent, `pnpm heuristic:probe` is the measurement and `heuristic:ab` is only
the check that no deck regresses.

**`deck:ab` disables modules on the focus seat only.** The opponents keep
whatever the build has. That is right for its purpose and wrong the moment it is
used to compare two _builds_ of a shared module, because the control arms then
differ between builds. Used that way, two supposedly identical controls read
43.1% and 43.4%. For a change to a module that other decks also use, run
`deck:benchmark` on both builds and join them with `benchmark:diff`.

**Nothing stamps `packages/agents`.** A benchmark report carries `rulesVersion`,
`cardDataHash` and `programHash`, none of which covers the policy code -- so a
report produced with a policy change is indistinguishable from one produced
without it, and a paired diff of a build against itself looks like a clean null
result. Until that is fixed, **print the working directory and a marker of the
change in the same command that runs the benchmark**:

```bash
echo "PWD=$(pwd) RULE=$(grep -c myNewRule packages/agents/src/rules/decks/<deck>.ts)" \
  && pnpm deck:benchmark run --deck <ID> --seeds 300 --output after.json
```

Three runs in that audit measured the wrong build because a shell's working
directory moved between commands. One reported that a change measuring z = 4.11
had moved nothing field-wide.

**`--disable` matches an id or an `id#` prefix, so coupled rules give a broken
control.** Two rules that only work together -- a `prefer` that hides
candidates and a `mustAct` that forces the survivor -- switched off one at a
time leave the other standing, and the arm measures the _broken_ build rather
than the absence of the rule. That reads as an enormous delta. Check what the
control build actually does before believing a large number.

**A fire rate is not an effect.** Four `counter-event-reserve` variants fired
constantly -- one changed 13% of all games -- and every one measured as nothing.
Reachability says a rule _can_ matter; only the paired A/B says it does.

**Card text does not predict behaviour.** A rule keyed to "this Event has a
`[Main]` clause, so it will be spent before the Counter step" is right for some
decks and inverted for others: OP-15 Enel casts **99.0%** of its dual-purpose
Counter Events in the Main phase, OP-17 Xebec **16.9%**. Whether a card is spent
early is a property of the policy, not the printed text. Measure per deck.

**Prefer the mechanism you can state.** One variant measured +0.8pt at 1200 games
while its per-matchup rows contradicted the explanation given for it -- it was
meant to help the losing matchup and leave the won ones alone, and did the
reverse. At 3600 games it was +0.4pt (z = 1.35) with the key matchup at exactly
0.0pt. Treat the contradiction as the result, not the noise.

**A rebase invalidates a paired measurement.** The benchmark is deterministic
given the same engine, agents and registrations. If `main` moved any of them,
both arms must be re-run on the new base -- the numbers do not carry over. Check
this before updating a PR body rather than after.

**Watch what `rankAmong` actually hides.** It hides only the candidates the rule
_scored_, leaving unscored ones in the running for the generic ladder to take
first-offered. A rule meant to force a choice has to score **every** candidate in
its group, not just the ones it likes. Mihawk's search rule scores all of them
for exactly this reason, and one of its tests pins it.

## Validate

```bash
pnpm exec prettier --check packages/agents/src test
pnpm vitest run test/<deck>-policy.test.ts test/policy-registry.test.ts
pnpm typecheck && pnpm lint
pnpm verify
```

Then confirm the field, because improving one deck moves everyone's numbers:

```bash
pnpm deck:benchmark run --all --seeds 100
```

## Pitfalls

- **Tuning the card-value table first.** It is the visible knob and rarely the
  fault. ST32's table was already reasonable; the ladder around it was not.
- **Trusting a matchup module because it is long.** Measure it against the deck
  policy. Seven hundred hand-tuned lines can be worth 0.8pt of noise.
- **Reading `optionId` instead of the typed action fields.** `optionId` is opaque
  by contract; use `sourceCardNumber`, `sourceInstanceId`, `targetInstanceId`,
  and the `option` descriptor.
- **Re-deriving Counter or power arithmetic.** `tactics.ts` owns it. A second
  copy with different rounding is the drift that file exists to prevent.
- **Registering a format-wide `rank` module for one deck without checking what it
  hides.** `rank` removes every candidate below the best in its action type, so a
  rule that scores Leader attachments highly will hide Character attachments
  entirely.
- **Writing a general rule into a matchup module.** See section 6. It fires in
  one matchup in five, composes with nothing, and stops inheriting every later
  fix to the deck policy underneath it.
- **Assuming a shipped module generalises.** `createDonThresholdModule` is a
  community fundamental and is registered for exactly one deck, because it is
  measured at +5.4pt for ST35, -5.4pt for ST36 and -7.5pt for ST33. "It helped
  another deck" is not evidence about this one.
- **Believing a passing test suite means the policy still works.** ST33's 17
  tests passed throughout a 22.8pt collapse, because every one of them posed a
  board and asserted an action while the fault was in which _branch_ classified
  the option. Add a test that discriminates the branch, not just the outcome.
