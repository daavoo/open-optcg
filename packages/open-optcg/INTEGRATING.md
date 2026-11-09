# Putting open-optcg behind an existing app

This guide is for an app that already has a board UI, a game server and its own
lobby, and wants `open-optcg` to own the rules. Your UI, accounts, matchmaking,
clocks and chat stay as they are. The engine replaces the code that decides
what is legal and what happens next.

## How the engine sees a game

- The engine stops at every decision. The seat to act gets a **view**
  (`GameObservation`): its own hand, both boards, Life counts, and
  `legalActions`, every move it may make right now.
- A move is one of those actions, sent back by its opaque `actionId` together
  with the view's `revision`.
- Nothing else advances the game. There is no timer and no background step, so
  the same seed and the same `actionId`s always produce the same game.

## On the server

Your server holds the games. Each client only ever receives its own view.

```ts
import { EngineError, GameService, type SavedGame } from "open-optcg/engine";
import { resolveDeck, parseDeckList } from "open-optcg/decks";
import type { GameObservation, PlayerId } from "open-optcg/protocol";

const service = new GameService();

// `send` is your transport: a WebSocket per player, a queue, anything.
type Send = (seat: PlayerId, view: GameObservation) => void;

export function startGame(listP1: string, listP2: string, send: Send) {
  const deck = (list: string, id: string) => {
    const parsed = parseDeckList(list);
    return resolveDeck(id, { id, leader: parsed.leader, cards: parsed.cards });
  };
  const view = service.create({
    p1: deck(listP1, "p1-deck"),
    p2: deck(listP2, "p2-deck"),
    seed: crypto.randomUUID(),
    startingPlayer: "random",
  });
  broadcast(view.gameId, send);
  return view.gameId;
}

// A client's move: the actionId it picked and the revision it saw.
export function onMove(
  gameId: string,
  seat: PlayerId,
  move: { actionId: string; revision: number },
  send: Send,
) {
  const current = service.observe(gameId, seat);
  if (current.activePlayer !== seat) return; // not this player's decision
  try {
    service.act(gameId, move.revision, move.actionId);
  } catch (error) {
    // STALE_ACTION: the client acted on an old view, so resend the fresh one.
    // ILLEGAL_ACTION: not an offered move. GAME_FINISHED: the game is over.
    if (error instanceof EngineError) return send(seat, current);
    throw error;
  }
  broadcast(gameId, send);
}

function broadcast(gameId: string, send: Send) {
  for (const seat of ["p1", "p2"] as const) {
    send(seat, service.observe(gameId, seat));
  }
}

// Checkpoints: store `save` as JSON; `restore` resumes it after a restart.
export const checkpoint = (gameId: string): string =>
  JSON.stringify(service.save(gameId));
export const resume = (json: string) =>
  service.restore(JSON.parse(json) as SavedGame);
```

Each player's view withholds what that seat can't see: the opponent's hand,
face-down Life, and deck order. Only the seat to act gets a non-empty
`legalActions`.

`restore` refuses a save made by a different engine version or with different
card data, with `INCOMPATIBLE_SAVE`. Finish or abandon those games before you
upgrade.

## On the client: clicks to actions

Your board already renders cards by id. Each `LegalAction` names the card
instances it involves, so clickability comes straight from the list:

| Action type              | First click                         | Second click       |
| ------------------------ | ----------------------------------- | ------------------ |
| `play-card`              | `cardInstanceId` (the card in hand) |                    |
| `attach-don`             | `targetInstanceId` (who gets DON!!) |                    |
| `attack`                 | `attackerInstanceId`                | `targetInstanceId` |
| `block`                  | `blockerInstanceId`                 |                    |
| `counter`                | `cardInstanceId` (the Counter card) |                    |
| `activate-counter-event` | `eventInstanceId`                   |                    |
| `activate-main`          | `sourceInstanceId`                  |                    |

Everything else is a button: `pass`, keep or mulligan (`mulligan-decision`),
effect choices (`resolve-effect`) and Trigger choices (`resolve-trigger`).
Every action has a `summary` you can use as its label, so a button can carry
its `actionId` directly.

```ts
import type { GameObservation, LegalAction } from "open-optcg/protocol";

/** The card ids a click on the board can start an action from. */
export function firstClick(action: LegalAction): string | undefined {
  switch (action.type) {
    case "play-card":
    case "counter":
      return action.cardInstanceId;
    case "attach-don":
      return action.targetInstanceId;
    case "attack":
      return action.attackerInstanceId;
    case "block":
      return action.blockerInstanceId;
    case "activate-counter-event":
      return action.eventInstanceId;
    case "activate-main":
      return action.sourceInstanceId;
    default:
      return undefined;
  }
}

/** Which cards to highlight as clickable. */
export const selectable = (view: GameObservation): Set<string> =>
  new Set(view.legalActions.map(firstClick).filter((id) => id !== undefined));

/** Moves that are buttons rather than cards. */
export const buttons = (view: GameObservation): LegalAction[] =>
  view.legalActions.filter((action) => firstClick(action) === undefined);

/**
 * A click on the board. Returns the action to send, or the cards to highlight
 * for the second click when the first click starts more than one action --
 * an attacker with several targets, a card with two activations.
 */
export function click(
  view: GameObservation,
  cardId: string,
  armed: LegalAction[] | undefined,
): { send: LegalAction } | { arm: LegalAction[]; highlight: string[] } | null {
  if (armed) {
    const chosen = armed.find(
      (action) =>
        action.type === "attack" && action.targetInstanceId === cardId,
    );
    return chosen ? { send: chosen } : null;
  }
  const started = view.legalActions.filter(
    (action) => firstClick(action) === cardId,
  );
  if (started.length === 0) return null;
  if (started.length === 1) return { send: started[0]! };
  const targets = started.flatMap((action) =>
    action.type === "attack" ? [action.targetInstanceId] : [],
  );
  // Several non-attack actions on one card: show their summaries as a menu.
  return { arm: started, highlight: targets };
}
```

Some effects ask for an arrangement, such as putting cards on the top or bottom
of the deck in an order. The engine offers that as one `resolve-effect` action
whose option has `kind: "order"`. The player may submit any arrangement of the
offered cards. No card the engine supports asks a player to type a card's name.

For a battle panel, `view.activeBattle` holds the attack in progress. The
`counter` actions carry `attackPower`, `targetPower` and `counterShortfall`, so
the panel can show what each Counter card would add.

## The game log

`view.publicEvents` lists what happened, in order, as structured events with
card numbers and instance ids, such as `{ type: "don-attached", playerId,
targetInstanceId, count }`. Render them in your own words and languages. The
engine never gives you prose to parse.

## A computer opponent

The learned opponent is a separate package, `open-optcg-model`. It reads the
same view a player gets, so it plays fair, and its whole interface is one call.
Run it on the server, or in a Web Worker so the page stays responsive:

```ts
import { loadModel, type LearnedModel } from "open-optcg-model";
import type { GameObservation } from "open-optcg/protocol";

let model: Promise<LearnedModel> | undefined;

/** The CPU's move for the seat whose view this is. */
export async function cpuMove(
  view: GameObservation,
  deck: { leader: string; cards: Record<string, number> },
): Promise<string> {
  model ??= loadModel("/models/scorer-model.json");
  const agent = (await model).agentFor(deck);
  return (await agent.chooseAction(view)).actionId;
}
```

Host the weights (`scorer-model.json` from a `model-*` release on GitHub)
yourself, because GitHub doesn't serve release files to browsers from other
sites.

## Cards the engine doesn't ship yet

Card numbers are Bandai's, so your images and deck lists map one to one. For a
card the engine doesn't have, call `registerCards` once at startup, before the
first game:

```ts
import { registerCards } from "open-optcg/cards";

registerCards([
  {
    cardNumber: "HOST-001",
    name: "Training Dummy",
    category: "character",
    cost: 1,
    power: 3000,
    counter: 1000,
    colors: ["Red"],
    types: ["Training"],
    attribute: "Strike",
    effect: "[Blocker]",
    trigger: "",
  },
]);
```

A registered card plays its stats and the keywords derived from its text, such
as `[Blocker]` or `[Rush]`. Its other effects don't run until the engine
supports that card. Card behaviour is engine code, written and tested clause by
clause. A card number the engine already ships is refused rather than replaced.

Contributions are welcome, and that includes new cards once they are
officially released.
