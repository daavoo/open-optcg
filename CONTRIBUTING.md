# Contributing

The most useful contributions are card and rules fixes. There are thousands of
cards and a new set every few weeks, so the engine is never finished, and a bug
report with a trace attached helps even if you never open the code.

## Reporting a bug

Export the trace from the game's top bar and attach it to an
[issue](https://github.com/daavoo/open-optcg/issues/new/choose), with the card
number and what you expected. The trace replays the exact game, so the bug can
become a test.

Traces are stamped with the engine's rules version and hashes of the card data,
so a trace recorded before a rules change says so on load instead of failing
partway through. The replay corpus under `fixtures/replay/` is the same idea
for CI: `pnpm fixtures:check` gates it, and `pnpm fixtures:record` refreshes it
after a deliberate rules change.

## Setup

```sh
pnpm install
pnpm verify
```

Requires Node 22+ and pnpm. `pnpm verify` runs formatting, lint, typecheck and
the test suite, the same check CI runs. `pnpm verify:browser` also builds the
web app and runs the Playwright suite (`pnpm exec playwright install chromium`
once beforehand).

CI runs Playwright against an art-free build, so a test that asserts on card
art is tagged `@art` and skipped there. Keep e2e tests art-agnostic where you
can; the drawn card faces carry the card's name and number.

## How the repo fits together

```
packages/engine-core   the rules engine: state, legal actions, effects, replay
packages/protocol      shared types and the JSONL process API schema
packages/cards         card records and their derived rules; no printed text
packages/decks         deck manifests, sealed pools, deck provenance
packages/agents        AI opponents: rules policies and the LLM agent
packages/referee       online 1v1: referee and match host, reached by seat links
packages/web           the browser app (built into one HTML file)
packages/cli           terminal play
tools/                 build, data fetching, simulation and analysis scripts
ml/                    the learned opponent's training (System-1 scorer)
test/                  the suite; card tests mirror the coverage gates
```

The engine is a deterministic state machine that stops at every decision. It
owns legality and transitions; the caller (a person, a policy, a model) owns
selection:

1. `game.create` or `game.observe` returns a player-safe observation.
2. The observation carries `legalActions`.
3. The caller picks one opaque `actionId`.
4. `game.act` takes the id and the observed revision.
5. Repeat until `phase` is `finished`.

Setup is the same loop (a new game starts in `mulligan`), and so are card-effect
choices. Nothing advances on its own, which is what makes every game replayable
from its seed and action list.

Hidden information is enforced in `observe()`, not by convention. Randomness is
seeded and serialized into the state, so a state hash is a real fingerprint.

Support **fails closed**. The engine implements a slice of the card pool
completely and refuses the rest: a deck stays `UNSUPPORTED_DECK` until its
manifest, text provenance, effects, timing rules and scenario tests are all
committed. New sets are unplayable until someone implements them. That is
deliberate; a simulator that silently misresolves a card is worse than one that
declines.

The same loop is available over stdin/stdout as line-delimited JSON, which is
how a bot or another language binds to the engine:

```sh
echo '{"v":"1","id":"1","method":"game.create","params":{"p1Deck":"ST31","p2Deck":"ST32","seed":"demo"}}' | pnpm jsonl
```

## Card and deck data

Card records and deck manifests are generated from Bandai's public card list by
`tools/fetch-reference` and `tools/audit-cards`, cross-checked against a
secondary source and stamped with provenance:

```sh
pnpm reference:fetch
pnpm reference:audit
```

The printed text itself is not committed. The audit derives everything the
rules need from it into each record's `rules` block (`deriveRules` in
`packages/cards/src/rules-derivation.ts`: keywords, DON!! requirement, clause
list, and so on), commits that with a hash of the text, and writes the words to
the gitignored `packages/cards/printed-text.json`. Tests that quote text read
that cache and skip without it. The app loads the same file as an
[asset pack](docs/asset-packs.md). If you need a new fact from the text, add a
field to `CardRules` and derive it; never regex `effect` at runtime.

Don't hand-edit the `generated*.ts` files. Re-run the pipeline. The weekly
`Reference text check` workflow re-derives them from a fresh fetch and fails on
a difference. `fixtures/reference/<date>/manifest.json` records every source URL
with its SHA-256; the raw snapshots are gitignored.

There is no per-card support level. A card is in the registry or it is not, and
a card in it runs its printed text: `test/card-support.test.ts` fails a card
whose printed clause has no handler, and `pnpm coverage:clauses --check` fails a
clause no test claims with `covers()`. The one sanctioned exception is
`UNIMPLEMENTED_CLAUSES`, a short ratcheted list naming each dropped clause and
why. `pnpm decks:provenance:check` covers where each deck's text was read from.

### Rotation and formats

The audit also stamps every card's **block icons**, one per printing, into
`packages/cards/src/generated-blocks.ts`. Legality is a property of a printing:
a card is Standard-legal if any printing sits in a block at or above the floor,
or carries the `X` icon that never rotates. Bandai's block-number update page
is folded in as one more icon per identity, so a block-1 card ruled into block
4 (OP01-055) reads as legal without a special case. The floor lives in
`packages/cards/src/block-icons.ts` with a `reviewBy` date, and
`test/block-icons.test.ts` fails once the card data is newer than that date.

A deck manifest declares `format: "standard" | "extra"`, defaulting to Standard.
`pnpm decks:legality --check` fails a Standard deck that names a rotated-out
printing. Rotation changes no rule, so the engine never sees a block.
`.github/workflows/rotation.yml` re-reads Bandai's list weekly and opens a PR
when the icons change; `pnpm rotation:report` is the same check by hand. See
[rotation](docs/rules-map/rotation.md) for what to do when the floor moves.

## Adding or fixing a card

Card behaviour lives in `packages/engine-core/src/mechanics/<set>.ts`, one module
per set, merged by `card-mechanics.ts`. See
[mechanics/README.md](packages/engine-core/src/mechanics/README.md) for the
layout, and `pnpm new:card OP17-042` to scaffold the mechanic stub, the registry
entry and the test file.

Each card gets a scenario test built with
[test/support](test/support/README.md): build a position, drive it to the
decision, assert on the resulting events and state.

One test per **printed clause**, not per card. Each test declares what it
drives with `covers("<card>", "<clause>")`, and `pnpm coverage:clauses --check`
(part of `pnpm verify`) fails on a clause nothing covers. A card with an
`[On Play]` and a `[Trigger]` needs both. An interaction that needs a second
specific card belongs wherever the interaction lives; `covers()` may name the
same clause from several files.

`.claude/skills/` holds two step-by-step playbooks (adding card support,
auditing a deck policy) written for coding agents that read fine as human
checklists.

## Card art and the hosted app

`pnpm web:build` never fetches art and inlines none. The hosted page
(`.github/workflows/pages.yml`, deployed from `main`), the `get-cards.js` it
serves and `dist/open-optcg.html` all ship without card art or printed text; the player
loads an [asset pack](docs/asset-packs.md). `pnpm art:download --all BOOSTERS`
fetches art into the gitignored `local-art/`, and `pnpm web:build --with-art`
inlines it into a personal copy -- taking the union of `local-art/` and the
`open-optcg-assets/art/` that `pnpm assets:download` writes, so whichever of
the two commands you ran last is the one that supplies a newly imported deck.
`--with-text` does the same for a text pack, so a personal copy can be one file
that needs no pack loaded at the other end.
Art is re-encoded to WebP on the way in, which halves the size with no visible
difference; `--raw` keeps the source format. [Art
anchors](docs/art-anchors.md) lists the non-card surfaces.

Players build their pack with the **Get cards** bookmarklet: `pnpm
get-cards:build` bundles `tools/get-cards.ts` into `dist/get-cards.js`, which
the Pages workflow serves beside the app, and the bookmark fetches and runs it
on Bandai's card list. `pnpm assets:download` writes the same pack from a
checkout.

## Online play

A 1v1 over the network runs through a server-side referee (a Cloudflare
Worker), so neither client ever holds the other's hand. `pnpm referee:local
--app` serves the app and the server on one origin for local play, and
`pnpm test:session` runs that layer's tests. A match is reached by a seat link
rather than from the lobby, and the plain `pnpm web:build` has no server, so it
leaves a seat link unopened. [docs/online-play.md](docs/online-play.md) is the
map of what exists and what is still missing.

## Releases

The game is the hosted page and nothing else: every push to `main` redeploys
it. A GitHub release is only for the learned model: the newest `model-*`
release's `scorer-model.json` is what the page inlines (see
`ml/README.md`).
`pnpm web:serve` is a checkout's way to play against an LLM: its loopback
server keeps the key in `~/.open-optcg/llm.json` and the page only ever sees its
last four characters.

## Pull requests

- Keep changes scoped; a bug fix doesn't need a refactor riding along.
- Add or update tests for any rules-engine behaviour change.
- Run `pnpm verify` before opening a PR.
- If the change affects how a deck plays, say so with numbers.
  [Theorycrafting](docs/theorycrafting.md) has the paired-comparison tools.

The [PR template](.github/pull_request_template.md) restates these.

### Looking at a change to a screen

A diff does not show a panel that draws the same card twice, a heading that
repeats the row under it, or a surface nothing ever renders, so look at a
changed screen in the running app, from a position the engine actually
produced. The app is a single file and the Playwright suite already drives it:
`pnpm web:build && pnpm web:build:server`, then a throwaway spec in `test/e2e/`
(`testDir` is `./e2e`) that opens `dist/open-optcg.html` and drives the app to
the position. Delete the spec before committing, unless the position is worth
asserting on for good. Screenshots do not go in PRs or the repository.

To reach a mid-game position without playing it by hand, seat a rules agent on
_both_ sides. The form fixes the player's seat, but `p1Controller` is read
straight off it and the worker pilots either seat, so before clicking **Start
match**:

```ts
await page.evaluate(() => {
  const write = (id: string, value: string) => {
    document.querySelector<HTMLInputElement>(`#${id}`)!.value = value;
  };
  write("p1-controller", "rules");
  write("p1-deck", "(Purple/Black) Monkey.D.Luffy - Starter Deck 26");
});
```

The match then plays itself with p1 as the viewer, which is also the only way
to see a surface that only appears on the viewer's own turn. Let the agents
answer the mulligan: clicking "Keep these cards" yourself races the agent and
the stale action raises an `Unknown action:` alert that pauses the AI. Loop on
the surface you are waiting for, dismissing any notice modal in the way.

[SECURITY.md](SECURITY.md) covers what counts as a vulnerability and how to
report one privately; [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) is the short
version of being decent to each other.
