# open-optcg

A deterministic rules engine for the One Piece Card Game, from the
[Open OPTCG](https://github.com/daavoo/open-optcg) project. MIT licensed.

The engine owns legality and transitions. Whenever a decision is due, it stops
and offers the seat to act a list of legal actions, and the caller (a person, a
bot or a model) picks one by its opaque `actionId`. Nothing advances on its own,
so every game replays exactly from its seed and the actions taken.

```sh
npm install open-optcg
```

## Play a game

```ts
import { GameService } from "open-optcg/engine";
import { resolveDeck, STARTER_DECK_IDS } from "open-optcg/decks";

const [deck1, deck2] = STARTER_DECK_IDS;
const service = new GameService();
let view = service.create({
  p1: resolveDeck(deck1),
  p2: resolveDeck(deck2),
  seed: "readme",
});

// `view` is what the seat to act may see: its own hand, both boards, and the
// actions it may take. This loop always takes the first one.
for (let step = 0; view.phase !== "finished" && step < 5000; step++) {
  const action = view.legalActions[0]!;
  view = service.act(view.gameId, view.revision, action.actionId);
}
console.log(`${view.winner} wins on turn ${view.turn} (${view.resultReason})`);
```

To play against the learned opponent, see
[`open-optcg-model`](https://www.npmjs.com/package/open-optcg-model).

To put the engine behind an app that already has its own board UI and game
server, see [INTEGRATING.md](./INTEGRATING.md).

## Entry points

| Import                | What it is                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open-optcg/engine`   | `GameService` (create, act, observe), and the functions under it for callers that hold the state themselves: `createGame`, `getLegalActions`, `applyAction`, `observe`, `replayActions`. |
| `open-optcg/protocol` | The types the engine and a caller exchange: `GameObservation`, `LegalAction`, events, and the `Agent` contract any player implements.                                                    |
| `open-optcg/cards`    | Card records by card number, with the rules derived from each card.                                                                                                                      |
| `open-optcg/decks`    | The deck lists the project ships, and `parseDeckList` for the plain-text format deck builders export (`4x OP01-016` per line).                                                           |

## Hidden information

`observe(state, seat)`, and every view `GameService` returns, withholds what that
seat cannot see: the opponent's hand, face-down Life and deck order. An online
game keeps the state on the server and sends each player only their own view.

## Card text and art

The package carries no printed card text and no card art. Records hold each
card's number, stats and derived rules. An app that shows card text loads a
text pack at runtime with `loadPrintedText`, and brings its own art. See
[asset packs](https://github.com/daavoo/open-optcg/blob/main/docs/asset-packs.md).

## Versions

While the version is `0.x`:

- The `LegalAction` and `GameObservation` types change only in a minor version,
  with a changelog entry.
- An `actionId` is opaque and valid only for the view that offered it. Don't
  parse it or store it across versions.
- A replay records the engine's rules stamp, and `replayActions` refuses a
  replay from an incompatible version instead of diverging silently.

One Piece Card Game is a trademark of Bandai. This project is not affiliated
with or endorsed by Bandai.
