# Agent guide

Read this once at the start of a session; it is the map, not the manual.
[CONTRIBUTING.md](CONTRIBUTING.md) explains the same repo for humans and goes
deeper on the data pipeline and the coverage gates.

## What this is

A deterministic rules engine for the One Piece Card Game, plus AI opponents, a
browser app and a terminal client. The engine is a state machine that stops at
every decision: it owns legality and transitions, and a caller (person, policy,
model) picks one opaque `actionId` from `legalActions`. Nothing advances on its
own, which is why every game replays from its seed and its action list.

## Package map

```
packages/engine-core   the rules kernel: state, legal actions, effects, replay
packages/protocol      shared types and the JSONL process API schema
packages/cards         card records and their derived rules (per-set modules); no printed text
packages/decks         deck manifests, sealed pools, deck provenance
packages/agents        AI opponents: rules policies and the LLM agent
packages/referee       online 1v1: referee and match host, reached by seat links
packages/web           the browser app (built into one HTML file)
packages/cli           terminal play
tools/                 build, data fetching, simulation and analysis scripts
ml/                    an experimental reinforcement-learning sidecar (Python)
test/                  the suite; card tests mirror the coverage gates
test/support/          the scenario builder every new test should use
```

Card _behaviour_ lives in `packages/engine-core/src/mechanics/<set>-*.ts`, keyed
by card number: programs per timing window, plus `<set>-static.ts` for
continuous text and immunities and `<set>-reactions.ts` for unmarked "when X
happens" clauses. `mechanics/index.ts` merges and registers them. A card-number
literal anywhere else in `engine-core/src` is held to a per-file budget that
only shrinks (`test/kernel-card-literals.test.ts`). One transition per action type
lives in `packages/engine-core/src/actions/<type>.ts`. Card _data_ lives in
`packages/cards/src/<set>.ts`. A card fix usually touches one of each plus one
test — not the whole engine.

## Non-negotiables

- **Never hand-edit generated files.** `packages/cards/src/generated.ts`,
  `generated-op17.ts`, `generated-community.ts` and
  `packages/decks/src/generated.ts` come out of
  `pnpm reference:fetch` + `pnpm reference:audit`. Editing them by hand loses the
  provenance stamp and is reverted by the next pipeline run.
- **Printed card text is a runtime asset, not data in the repo.** Records carry
  a derived `rules` block; the words live in the gitignored
  `packages/cards/printed-text.json` the audit writes, and the app loads them
  as an asset pack. Never regex `effect` at runtime -- add a field to
  `CardRules` and derive it in `rules-derivation.ts`. See docs/asset-packs.md.
- **Every rules-behaviour change gets a test.** A card is not implemented until a
  scenario test drives the engine to the decision and asserts on the resulting
  events and state.
- **Every printed clause of a card gets its own test, and says so.** A test
  declares what it exercises with `covers("OP17-042", "[On Play]")` from
  `test/support`; `pnpm coverage:clauses --check` derives the required clauses
  from the printed text and fails on one with no test. A card with an `[On Play]`
  and a `[Trigger]` needs both, and an interaction test that needs a second
  specific card is fine — coverage is per clause, not per file.
- **Commit with the repo's own git identity.** Signing is on
  (`commit.gpgsign`), and the key is bound to the configured `user.email`, so a
  commit made with `-c user.email=...`, `--author` or `--reset-author` is signed
  and still shows as _Unverified_ on GitHub -- verification needs the committer
  email to match an identity on the key. Nothing needs overriding; check with
  `git log --format='%h %G? %ae %s'` and expect `G` beside the configured
  address.
- **`pnpm verify` before you call anything done** — format, lint, typecheck,
  tests. Web-facing changes also need `pnpm verify:browser`.
- **No `Math.random`.** Randomness comes from the serialized engine RNG; lint
  enforces it. Same reason: no wall-clock reads inside engine code.
- **Card art and printed card text are never committed or published.** The
  hosted page, the releases and `dist/open-optcg.html` ship without them; the
  player loads an asset pack zip. `local-art/` is gitignored and filled only
  by `pnpm art:download`; the build never fetches, and
  `pnpm web:build --with-art` (art) and `--with-text` (a text pack) are for a
  personal copy only.
- **Don't reach into `GameState` to set up a test.** Use `test/support/`; a
  position the engine could never produce makes a green test worthless.

## Fast feedback

```sh
pnpm test:card ST35        # one deck's card tests
pnpm test:engine           # the rules-kernel tests only
pnpm test:session          # the online session layer (referee, clock, workerd)
pnpm referee:local --app   # the app and the match server on one origin, locally
pnpm lint:changed          # eslint on files changed vs the merge base
pnpm test -- engine.test   # any vitest filename filter
pnpm verify                # the full gate CI runs
pnpm decks:provenance      # where each deck's printed text came from
pnpm decks:legality        # each deck's format, and its cards' block icons
pnpm rotation:report       # has Bandai's block data or the Standard floor moved
pnpm heuristic:probe       # a candidate rule at the decision it changes, not the win rate
pnpm coverage:clauses      # which printed clause has no test, per card
pnpm standings:check       # are the two committed deck-standings CSVs current
pnpm standings --group X   # rewrite one division only: featured or starter
```

The whole suite is ~90s -- most of it the two whole-format simulations, which
play every deck pairing. Prefer running it over reasoning about whether a change
is safe; use the narrower commands above for a tight loop.

## Playbooks

`.claude/skills/` holds two step-by-step playbooks, and they are the best
starting point for the two most common tasks:

- `add-card-support` — importing a card, translating its text into mechanics,
  writing the test, promoting its support status.
- `audit-deck-policy` — diagnosing and improving a deck's rules agent, with the
  paired A/B measurement it needs.

`pnpm new:card OP17-042` scaffolds the mechanic stub, the registry entry and a
test file in the right per-set locations, so you fill in blanks instead of
inferring conventions.

## Conventions that are easy to miss

- There is no support ladder. A card is in `cardRegistry` or it is not, and a
  card in it runs its printed text: `test/card-support.test.ts` fails a card
  whose printed clause has no registered handler, and `UNIMPLEMENTED_CLAUSES` is
  the only way to declare a clause the engine drops -- a reviewable admission,
  held to a ratchet that will not let the list grow.
- Comments explain _why_, not what. If you encode a workaround, say what would
  let it be removed.
- **A comment describes the code that is there, not the code that isn't.** No
  "tried and rejected", no "an earlier version did X", no "this used to be Y",
  no measured deltas for a variant that is not in the file (`-4.7pt`, `z =`,
  paired-game counts). Git history, the PR body and the benchmark output are
  where an abandoned attempt is recorded, and they carry the date, the diff and
  the run that produced the number; a comment carries none of that and outlives
  all of it. It also reads to the next contributor -- and to the next agent --
  as a settled verdict, so a dead end that was measured against one card pool,
  one policy ladder or one engine version quietly forecloses the question after
  the ground under it has moved. Keep the reason the current code is shaped this
  way, in terms of the rules, the cards or the engine; drop the account of what
  else was attempted. A test may say which bug it pins -- that is what the test
  is for -- but not carry the log of the alternatives that lost.
- **A dossier is a prompt, and the same rule binds it harder.** The strings in
  `packages/agents/src/llm/dossiers/` are sent to a model, so a number in one
  is a citation its reader cannot check: it has no `git log` and no way to
  learn the figure was measured against a card pool two sets ago, or against a
  different agent entirely. Write the instruction and the reason it is true of
  the cards -- "at 10 cost it is the card you are least often able to cast, and
  the Leader asks for fuel every turn" -- and stop there. Never cite a delta, a
  z, or what the _rules_ agent did; the LLM seat is not that agent and cannot
  act on its history. The `sources` array is where a dossier carries evidence,
  and it is the right shape for it: a URL, a `retrievedAt` date, and what the
  claim was taken from.
- **A new policy rule is scoped to one deck until it has a sign.** The module
  goes in the shared `format-heuristics.ts` so any deck can adopt it, but its
  `registerPolicy` entry names one Leader while it is measured — that is the
  only arm in which the focus seat is the only thing that differs.
  `createDonThresholdModule` is the shape: shared code, registered for ST35
  alone, because the same rule measures +5.4pt there and −7.5pt for ST33.
  Registering at `EVERY_DECK` and then diffing two `deck:benchmark` builds is
  the one invalid combination: both arms change for all 26 seats, so a real
  per-deck gain cancels against opponents getting it too. Widen the scope only
  after, and re-measure — it is a different claim. See `audit-deck-policy` §6b.
- Hidden information is enforced in `observe()`. Never let an agent or a UI read
  a field that `observe()` withholds.
- The app's styling lives in `packages/web/src/styles/`, one file per surface.
  `styles/index.css` is both the map -- where to change what -- and the cascade:
  the build concatenates its `@import`s in the order written, and fails on a
  stylesheet in that directory that nothing imports. Design tokens live in
  `styles/tokens.css`, and deck colour only in `styles/mat-skins.css`.
- Traces are the project's bug-report currency. They are stamped with the engine
  revision and card-data hash that produced them, and the loader reports an
  incompatible trace as such rather than failing mid-replay.
