import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { requireKnownCard } from "@one-piece-sim/cards";
import type {
  Callback,
  GameState,
  GameTransitionEvent,
} from "@one-piece-sim/engine-core";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";

export type TraceController =
  | "human"
  | "llm-agent"
  | "rules-agent"
  | "st31-agent"
  | "st32-agent"
  | "automatic";

interface TraceTransition {
  controller: TraceController;
  decision?: { reasons: string[] };
  action: GameTransitionEvent["action"];
  legalAction: LegalAction;
  events: GameTransitionEvent["result"]["events"];
  stateBefore: Omit<GameState, "events">;
  stateAfter: Omit<GameState, "events">;
}

interface TraceCard {
  instanceId: string;
  cardNumber: string;
  name: string;
}

function stateSnapshot(state: GameState): Omit<GameState, "events"> {
  const snapshot: Partial<GameState> = structuredClone(state);
  delete snapshot.events;
  return snapshot as Omit<GameState, "events">;
}

export class TraceRecorder implements Callback<GameTransitionEvent> {
  readonly #filePath: string;
  readonly #seed: string;
  readonly #decks: { p1: string; p2: string };
  #initialObservation: GameObservation | null = null;
  #initialState: Omit<GameState, "events"> | null = null;
  #openingHands: { p1: TraceCard[]; p2: TraceCard[] } | null = null;
  #controller: TraceController = "automatic";
  #decision: { reasons: string[] } | undefined;
  #transitions: TraceTransition[] = [];

  constructor(
    filePath: string,
    seed: string,
    decks = {
      p1: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p2: "(Green) Roronoa Zoro - Starter Deck 32",
    },
  ) {
    this.#filePath = resolve(filePath);
    this.#seed = seed;
    this.#decks = decks;
    mkdirSync(dirname(this.#filePath), { recursive: true });
  }

  setInitialObservation(observation: GameObservation): void {
    this.#initialObservation = structuredClone(observation);
    this.write();
  }

  setController(controller: TraceController): void {
    this.#controller = controller;
  }

  setDecision(decision: { reasons: string[] } | undefined): void {
    this.#decision = decision ? { reasons: [...decision.reasons] } : undefined;
  }

  handle(event: GameTransitionEvent): void {
    this.#initialState ??= stateSnapshot(event.previousState);
    this.#openingHands ??= {
      p1: event.previousState.players.p1.hand.map((card) => ({
        ...card,
        name: requireKnownCard(card.cardNumber).name,
      })),
      p2: event.previousState.players.p2.hand.map((card) => ({
        ...card,
        name: requireKnownCard(card.cardNumber).name,
      })),
    };
    this.#transitions.push({
      controller: this.#controller,
      ...(this.#decision ? { decision: this.#decision } : {}),
      action: event.action,
      legalAction: event.legalAction,
      events: event.result.events,
      stateBefore: stateSnapshot(event.previousState),
      stateAfter: stateSnapshot(event.result.state),
    });
    this.#decision = undefined;
    this.write();
  }

  finish(observation: GameObservation, stopped: boolean): void {
    this.write(observation, stopped);
  }

  get filePath(): string {
    return this.#filePath;
  }

  private write(
    finalObservation: GameObservation | null = null,
    stopped = false,
  ): void {
    writeFileSync(
      this.#filePath,
      `${JSON.stringify(
        {
          version: 1,
          seed: this.#seed,
          decks: this.#decks,
          initialObservation: this.#initialObservation,
          initialState: this.#initialState,
          openingHands: this.#openingHands,
          transitions: this.#transitions,
          finalObservation,
          stopped,
        },
        null,
        2,
      )}\n`,
    );
  }
}
