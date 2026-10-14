---
name: add-card-support
description: "Add or implement a One Piece card in Open OPTCG. Use when importing card metadata, translating card text into engine mechanics, deciding whether existing mechanics are sufficient, extending the mechanic DSL or engine for a new rule, writing card tests, or promoting card support status."
argument-hint: "Card number(s), source/deck, and desired support level"
---

# Add Card Support

Implement printed card text as rules, not as an approximation. A card is not
done until every gameplay-relevant clause is represented and tested.

## Inputs

Establish these before editing:

- Card number and printed name.
- Authoritative effect and Trigger text, including errata.
- Card category, colors, cost, power, counter, types, and attribute.
- Owning deck or set.

If the printed text is unclear, ask rather than infer rules from deck strategy.

## 1. Locate the Card Record

1. Search `packages/cards/src/generated.ts`,
   `packages/cards/src/generated-op17.ts`,
   `packages/cards/src/generated-community.ts`, and the hand-authored card files
   under `packages/cards/src/` for the card number.
2. For Bandai reference data, use `pnpm reference:fetch` followed by
   `pnpm reference:audit`. The audit owns generated card/deck files and their
   `officialTextHash` and `sourceMatch`; never hand-edit generated files.
3. Follow an existing hand-authored set/deck file when official import is not
   available. Preserve source provenance and do not claim `sourceMatch: true`
   without the audit evidence.
4. Confirm the record through `requireKnownCard` and inspect the derived
   `cardFacts` in `packages/cards/src/index.ts`.

A card record carries no support flag. Being in `cardRegistry` is the claim, and
`test/card-support.test.ts` is what holds it: a card whose printed clause has no
registered handler fails the suite. If a clause genuinely cannot be expressed
yet, declare it in `packages/cards/src/unimplemented-clauses.ts` with the reason
— that list is ratcheted and reviewed, and the LLM agent renders each entry as
an explicit `<unimplemented>` note so nothing plans around a clause that will
not fire.

## 2. Turn Printed Text Into a Rule Checklist

Split the text into independently testable clauses:

1. Timing: static, setup, On Play, When Attacking, On K.O., Trigger,
   Activate: Main, Event Main/Counter, replacement, or another rules window.
2. Preconditions: leader name/type/color, zone counts, attached or field DON!!,
   opponent state, once-per-turn state, and source state.
3. Costs: rested DON!!, `DON!! -N`, Life/hand/trash movement, resting the
   source, or another irreversible payment.
4. Choice: mandatory versus "up to", optional "may", eligible zones, owner,
   target filters, target count, and whether the source is eligible.
5. Result: move/play/draw/K.O., DON!! movement, stat change, keyword,
   restriction, reveal/search order, or rule replacement.
6. Duration and cleanup: this turn, until another turn, while a condition is
   true, or permanent.
7. Chaining: signals such as card played, moved, or K.O.'d that can trigger
   another effect.

Compare every clause with the exact official text. A card is not implemented if
a trailing cost, conditional sentence, cleanup rule, or no-target behavior is
missing.

## 3. Decide Whether Existing Mechanics Fit

Search by behavior before card number. Inspect nearby programs and tests.

### Derived printed facts

Use or extend `cardFacts` in `packages/cards/src/index.ts` for immutable facts
that can be derived from printed text before a game starts, such as keywords,
DON!! requirements, Trigger presence, or a Leader setup value. Add protocol
fields and `test/card-facts.test.ts` coverage when exposing a new fact.

### Generic mechanic program

Prefer a program in the card's set module under
`packages/engine-core/src/mechanics/` when the text is a composition of existing
selectors, conditions, and effects from `packages/engine-core/src/mechanics.ts`.
`pnpm new:card <CARD>` writes the stub in the right module, under the right
clause, plus a matching test; `mechanics/README.md` is the layout.

Available composition includes:

- Selectors over deck, hand, Life, board, and trash, filtered by card identity,
  category, type, color, cost, power, state, Trigger, position, or source.
- Conditions for zone counts, Leader name/type/multicolor, combined Life,
  attached DON!!, and field DON!!.
- Effects for sequencing, conditions, optional choices, automatic selection,
  player choices, movement, play, draw, K.O., power changes, DON!! movement,
  restrictions, state updates, and temporary keywords.

Register the program under the matching clause key of the set module's
`SetMechanics`:

- `onPlay`
- `onKo`
- `trigger`
- `whenAttacking`
- `activateMain`
- `eventMain`
- `counterEvent`
- `onOpponentAttack`
- `onEndOfYourTurn`
- `leaderWatcher`

Registering the same clause for the same card twice is an error at import time,
so a card that already has a program for that timing has to be edited rather
than added to.

Check both action discovery and resolution. A program that exists but is never
offered, cannot collect its choices, or does not resume pending effects is not
support.

### Existing engine subsystem

Use the subsystem that owns the rule when it depends on a live game window or
changes general rules:

- `queries.ts`: derived cost, power, targeting and immunity. A conditional
  static ability is a row in `mechanics/<set>-static.ts`, which
  `static-abilities.ts` folds into those queries.
- `engine.ts` with `legal-actions/` and `actions/`: what is offered in each
  phase, and what applying one action does. One module per phase and per action
  type; `actions/README.md` explains the seam.
- `effects.ts` with `resolve-effect/`: effect queues, reveal/search flows,
  replacements, and one resolver per pending-effect kind.
- `removal.ts`: K.O. and removal behavior.
- `don.ts`: DON!! accounting and movement.
- `model.ts` and `protocol`: durable state or public action/event contracts.

Avoid isolated card-number branches when a nearby table, query, or reusable
rule expresses the behavior accurately.

## 4. Introduce a New Mechanic When Needed

A new mechanic is required when at least one checklist clause cannot be
expressed without weakening its timing, eligibility, payment, ordering, or
duration.

Choose the smallest correct abstraction:

1. Extend a selector or condition for a reusable predicate.
2. Add a `MechanicEffect` node for a reusable state transition.
3. Add a shared query for a continuous or derived rule.
4. Add an engine/effect rule for a timing window, replacement, setup rewrite,
   or interaction that must coordinate multiple subsystems.
5. Extend model/protocol types only when the rule needs persistent state or
   consumers must observe/choose something new.

For a DSL extension, update its discriminated union, evaluator, choice-option
handling if applicable, emitted events/signals, and focused tests in
`test/mechanics.test.ts`. Preserve exhaustive handling and invariants such as
board limits, DON!! conservation, ownership, target immunity, and effect order.

For engine rules, make legal-action generation and action application agree on
the same prerequisites and costs. Prefer existing mutation helpers so attached
DON!!, events, signals, and cleanup are not skipped.

If a faithful implementation would require speculative rules or a large
unrelated redesign, declare the clause in
`packages/cards/src/unimplemented-clauses.ts` with the reason. Never silently
no-op unsupported text.

## 5. Add Card-Level Tests

Build the position with `test/support` -- `scenario()` plus the `with*` setters,
documented in `test/support/README.md`. It reaches turns by playing them out and
checks the engine's own invariants at `build()`, so a scenario cannot assert on a
board the engine could never produce. Do not assign to `GameState` fields from a
test; if no setter covers the position, add one there.

Name tests so the positive and boundary cases are identifiable from the report,
and run them with `pnpm test:card <deck-or-card>` while iterating.

Declare what each test drives with `covers("<card>", "<clause>")` from
`test/support`, one clause per call argument, placed next to the case that drives
it. `pnpm coverage:clauses --check` derives the required clause list from the
printed text -- every clause marker, every printed keyword, and `static` for
untimed text -- and fails while any clause of a deck card has no test, so the
card is not finished until every printed clause is claimed. The call throws if
the card does not print the clause named, and the tool fails on a claim whose
file no longer drives it. A clause that only does anything against one specific
card is covered wherever that interaction is tested; several files may claim the
same clause.

Cover as applicable:

- Positive resolution and every printed clause.
- Failed condition and insufficient-cost paths.
- Declining optional costs/effects.
- Zero eligible targets and fewer targets than the printed maximum.
- Invalid target rejection, source exclusion, immunity, and board limit.
- Correct zone order, ownership, visibility, and emitted event/signal.
- Once-per-turn reset, expiration, cleanup, and opponent-turn timing.
- Trigger and chained On Play/On K.O. behavior.
- Regression for existing cards that share a new primitive or query.

Test the primitive in `test/mechanics.test.ts` and the real card through public
engine actions. Primitive-only tests do not prove that dispatch and timing are
wired correctly.

## 6. Record Its Provenance

There is no status to promote: the card is done when its clauses are registered
and covered. What still has to be true is where its text came from.

1. Ensure the record carries an `officialTextHash` and `sourceMatch: true` from
   `pnpm reference:audit`. `pnpm decks:provenance:check` fails a deck card
   without them.
2. If Bandai has genuinely not published the card in English, name it in
   `SECONDARY_SOURCE_ONLY` in `packages/decks/src/deck-provenance.ts` and in the
   owning deck's `secondaryOnly` list in `tools/audit-cards/src/index.ts`. That
   is a reviewable admission, not a shortcut -- keep the list as short as the
   facts allow.

## 7. Validate

Run the narrowest checks first, substituting the actual test files:

```bash
pnpm exec prettier --check packages/cards/src packages/engine-core/src test
pnpm vitest run test/card-facts.test.ts test/mechanics.test.ts test/<deck>.test.ts
pnpm typecheck
pnpm decks:provenance:check
pnpm coverage:clauses:check
```

Then run `pnpm verify`. If the change affects browser exports or user-visible actions, also run
`pnpm verify:browser`.

For deck integration, run a deterministic trace before a benchmark:

```bash
pnpm trace:match --p1 <deck> --p2 <opponent> --seed <seed>
pnpm deck:benchmark run --deck <deck> --seeds <count>
```

Inspect traces for offered-but-useless actions, skipped costs, unresolved
choices, and cards that are never used. Benchmarks are regression and
completion evidence, not proof that card text is correct.

## Completion Report

Report:

- Card numbers and final statuses.
- Which clauses reused existing mechanics and which new primitive/rule was
  introduced.
- Implementation and test files changed.
- Focused and full validation results.
- Any unsupported clause or source limitation.
