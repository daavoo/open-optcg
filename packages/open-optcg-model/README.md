# open-optcg-model

The learned One Piece Card Game opponent from
[Open OPTCG](https://github.com/daavoo/open-optcg), for the
[`open-optcg`](https://www.npmjs.com/package/open-optcg) engine. MIT licensed.

It is a small neural scorer: given what its seat can see, it ranks the actions
the engine offers and plays the best one. It sees only that seat's view, so it
plays fair.

```sh
npm install open-optcg open-optcg-model
```

## Play a game

```ts
import { GameService } from "open-optcg/engine";
import { deckManifests, resolveDeck, STARTER_DECK_IDS } from "open-optcg/decks";
import { fetchLatestModel } from "open-optcg-model";

const model = await fetchLatestModel();
const [deck1, deck2] = STARTER_DECK_IDS;
const seats = {
  p1: model.agentFor(deckManifests[deck1]!),
  p2: model.agentFor(deckManifests[deck2]!),
};

const service = new GameService();
let view = service.create({
  p1: resolveDeck(deck1),
  p2: resolveDeck(deck2),
  seed: "readme",
});
for (let step = 0; view.phase !== "finished" && step < 5000; step++) {
  const action = await seats[view.activePlayer].chooseAction(view);
  view = service.act(view.gameId, view.revision, action.actionId);
}
console.log(`${model.release}: ${view.winner} wins on turn ${view.turn}`);
```

`agentFor(deck)` returns an `Agent`, the same contract any player implements
(`open-optcg/protocol`). A human seat and a model seat are interchangeable in
that loop.

## Weights

The package holds the code. The weights are a separate download of about 12 MB,
published as `model-*` releases on GitHub and retrained more often than the
engine changes:

- `scorer-model.json`: the base model.
- `scorer-adapter-*.json`: optional deck adapters, each trained piloting one
  Leader's list. `agentFor` uses the matching one when it was loaded.

`fetchLatestModel()` downloads the newest release from GitHub, so it suits Node
and other servers. GitHub serves release assets without CORS headers, so a
browser app should host the files itself and load them by URL:

```ts
import { loadModel } from "open-optcg-model";

const model = await loadModel("/models/scorer-model.json", {
  adapters: ["/models/scorer-adapter-st31.json"],
});
```

`loadModel` also accepts the parsed JSON objects. It refuses a pack trained on
an input encoding this version of the code can't read, with an error naming the
mismatch, instead of playing badly.

## Versions

`open-optcg-model` is a peer of `open-optcg` at a matching minor version.
Install both, and your app runs one engine that both the game and the model
use.
