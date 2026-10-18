# test/support

The single documented path for building a position in a test.

```ts
import { character, scenario } from "./support/index.js";

const game = scenario()
  .decks(
    "(Red/Black) Sabo - Starter Deck 35",
    "(Red) Monkey.D.Luffy - Starter Deck 31",
  )
  .seed("st35-playable")
  .atTurn(3, { active: "p1" })
  .withBoard("p1", [character("morley", "OP12-093")])
  .build();

game.play({ type: "play-card", cardNumber: "OP13-004" });
expect(game.state.players.p1.board).toHaveLength(2);
```

## Why it exists

Before it, every card test hand-rolled its own `submit`, `character`,
`requireAction` and `scenario` (22, 24, 14 and 16 copies respectively), and
reached its position by assigning to `GameState` fields. Two costs: any change to
the state shape broke dozens of files at once, and nothing stopped a test from
constructing a board the engine could never produce — which makes a green test
weaker evidence than it looks.

## The two rules

1. **Reach positions through legal actions when you can.** `keepBothHands()` and
   `atTurn()` submit the engine's own actions, so DON!!, draws and refreshes are
   the ones a real game would have.
2. **Name every exception.** Putting a specific card on the board or in the trash
   is not reachable from a seeded game, so those are `with*` setters: deliberate,
   in one place, and invariant-checked by `build()` via
   `assertGameStateInvariants`.

`withState()` is the escape hatch. If you reach for it twice, add a named setter
to `scenario.ts` instead — a `with*` name says what the position is, an inline
mutation says only that the state shape allowed it.

## API

| Call                                              | What it does                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `scenario()`                                      | Starts a builder; defaults to ST31 vs ST32 on seed `scenario`.                  |
| `.decks(p1, p2)` `.seed(s)` `.gameId(id)`         | Match setup, as `createGame` takes it.                                          |
| `.startingPlayer(p)`                              | Who acts first; the engine defaults to `p1`.                                    |
| `.timeLimit(turns)`                               | Plays under the tournament time limit: time is called as that turn begins.      |
| `.keepBothHands()`                                | Takes both mulligan decisions as `keep`.                                        |
| `.atTurn(n, { active })`                          | Passes turns until that turn (implies `keepBothHands()`).                       |
| `.withLeader/Board/Stage/Hand/Trash/DeckTop`      | Labelled setup for a zone.                                                      |
| `.withLife(count \| cards)`                       | Life off the top of the deck, or exact cards.                                   |
| `.withDraw(p, count)`                             | Moves cards from the top of the deck into hand, as a draw does.                 |
| `.bareTable()`                                    | Empties both sides and activates every DON!!, for one interaction in isolation. |
| `.withActiveAttack(attack, phase)`                | A battle in progress, for the [Blocker] and [Counter] windows.                  |
| `fabricatedAttack(state, attack)`                 | The same conversion, for a test that assigns `state.activeAttack` itself.       |
| `.withRestedLeader(p)`                            | Rests a Leader, as swinging with it does; `withActiveAttack` does not.          |
| `.withDon(p, { active, rested, leaderAttached })` | Moves DON!! out of the DON!! deck, keeping the Leader's printed total.          |
| `.allowPartialState()`                            | Relaxes the invariant check for a deliberately partial board.                   |
| `.build()`                                        | Checks invariants and returns a `Game`.                                         |
| `game.state`                                      | The current `GameState`.                                                        |
| `game.action(matcher)`                            | One legal action, or an error listing what was offered.                         |
| `game.submit(action)` / `game.play(matcher)`      | Applies it and advances the game.                                               |
| `game.pass()`                                     | Ends the turn.                                                                  |
| `game.legalActions()` / `game.summaries()`        | What is on offer now.                                                           |
| `covers(cardNumber, ...clauses)`                  | Declares which printed clauses the surrounding tests drive.                     |

A matcher is either a predicate or the fields to match: `{ type: "attack" }`,
`{ type: "resolve-effect", optionId: "done" }`, `{ summary: "Blocker" }`
(substring), or `{ type: "play-card", cardNumber: "OP13-004" }`, which resolves
the card number against the acting player's hand.

`character()`, `instance()` and `copies()` build cards for the `with*` setters.

## Declaring what a test covers

```ts
describe("ST36-002 Killer", () => {
  covers("ST36-002", "[On Play]", "[Trigger]");
  it("banks the top card of the deck on Life", () => { ... });
});
```

`pnpm coverage:clauses --check` reads these annotations off disk, derives the
clause list of every card in every deck from its printed text, and fails on a
clause nothing claims — which is what makes "a new card ships with tests for all
of its effects" a gate rather than a habit. `test/clause-coverage.test.ts` runs
it inside `pnpm verify`.

Two things keep the annotation honest. It throws when the card does not print
the clause, so it cannot survive the card text changing under it; and the tool
fails on a _stale_ claim too, so a clause cannot be listed as covered by a file
that no longer drives it. Put the call next to the case that drives the clause.
One clause may be claimed by several files: a clause that only does anything
against one specific card belongs wherever that interaction is tested.
