/**
 * What the value head may know that the player may not: a fixed-length
 * summary of the whole game state, for the PPO critic only (`--privileged`).
 *
 * A value estimate from one seat's view has to average over every hand the
 * opponent might hold and every card its own Life might turn up, and the PPO
 * advantages it feeds carry that guess as noise. Training the critic on the
 * full state removes it -- an asymmetric actor-critic. The policy never sees
 * these numbers: they travel beside the decision's tokens, the trainer hands
 * them to the value head alone, and nothing that plays a game (the web
 * scorer, the evaluations) computes them. That is what keeps reading hidden
 * zones here from leaking into play, which `observe()` forbids.
 *
 * Every number is from the deciding seat's side ("me" first, then "op"),
 * scaled to roughly unit size so no input dominates the first layer.
 */
import { cardRegistry } from "@one-piece-sim/cards";
import type { GameState } from "@one-piece-sim/engine-core";
import type { PlayerId } from "@one-piece-sim/protocol";

const DECK_TOP = 5;

type PlayerState = GameState["players"]["p1"];

function card(cardNumber: string) {
  return cardRegistry.get(cardNumber);
}

/** Counter total, Counter Events, Trigger cards and Characters of a zone. */
function zone(numbers: readonly string[]): number[] {
  let counter = 0;
  let counterEvents = 0;
  let triggers = 0;
  let characters = 0;
  let blockers = 0;
  let cost = 0;
  for (const n of numbers) {
    const def = card(n);
    if (!def) continue;
    counter += def.counter ?? 0;
    counterEvents += def.rules.hasCounterEvent ? 1 : 0;
    triggers += def.rules.hasTrigger ? 1 : 0;
    characters += def.category === "character" ? 1 : 0;
    blockers += def.rules.keywords.includes("Blocker") ? 1 : 0;
    cost += def.cost ?? 0;
  }
  return [
    numbers.length / 10,
    counter / 10000,
    counterEvents / 5,
    triggers / 5,
    characters / 10,
    blockers / 5,
    cost / Math.max(1, numbers.length) / 10,
  ];
}

function player(p: PlayerState): number[] {
  let power = 0;
  let blockers = 0;
  let rested = 0;
  let attached = 0;
  for (const body of p.board) {
    const def = card(body.cardNumber);
    power += (def?.power ?? 0) + 1000 * (body.attachedDon?.length ?? 0);
    blockers += def?.rules.keywords.includes("Blocker") ? 1 : 0;
    rested += body.rested ? 1 : 0;
    attached += body.attachedDon?.length ?? 0;
  }
  const leader = card(p.leaderCardNumber);
  return [
    ...zone(p.hand.map((c) => c.cardNumber)),
    ...zone(p.life.map((c) => c.cardNumber)),
    ...zone(p.deck.slice(0, DECK_TOP).map((c) => c.cardNumber)),
    p.deck.length / 50,
    p.trash.length / 20,
    p.board.length / 5,
    power / 30000,
    blockers / 3,
    rested / 5,
    ((leader?.power ?? 0) + 1000 * p.leaderAttachedDon.length) / 10000,
    p.leaderRested ? 1 : 0,
    p.activeDon.length / 10,
    p.restedDon.length / 10,
    (attached + p.leaderAttachedDon.length) / 10,
    p.donDeck.length / 10,
  ];
}

export function privilegedFeatures(state: GameState, seat: PlayerId): number[] {
  const op: PlayerId = seat === "p1" ? "p2" : "p1";
  return [
    state.turn / 20,
    state.turnPlayerId === seat ? 1 : 0,
    ...player(state.players[seat]),
    ...player(state.players[op]),
  ];
}

/** The vector's length, for the trainer to size the critic's input. */
export const PRIVILEGED_FEATURES = 2 + 2 * (3 * 7 + 12);
