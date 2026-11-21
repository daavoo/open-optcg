/**
 * One decision for the sim: import the snapshot, ask the learned model, and
 * translate its pick back into a move the plugin can perform.
 */
import {
  applyAction,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import type {
  GameObservation,
  LegalAction,
  Phase,
  PlayerId,
} from "@one-piece-sim/protocol";
import {
  adapterFor,
  CompactScorerAgent,
  loadCompact,
  type CompactAdapter,
  type CompactPack,
} from "@one-piece-sim/agents/scorer";
import { readModelFiles, type ModelLocation } from "./model-source.js";
import { engineCardNumber, importPosition } from "./position.js";
import type { SimMove, SimStep, TableSnapshot } from "./snapshot.js";

type EffectStep = Extract<SimStep, { kind: "effect" }>;

/**
 * The model's last table move, kept so the effect it starts can be replayed
 * in the engine: the sim shows the effect's prompt, and the engine -- given
 * the same move from the same position -- reaches its own version of it.
 */
interface Replay {
  state: GameState;
  action: LegalAction;
  simIds: Map<string, string>;
  seat: PlayerId;
  deck: { leader: string; cards: Record<string, number> };
}

/** An effect the engine is part-way through, for its next choice. */
interface InEffect {
  state: GameState;
  simIds: Map<string, string>;
  seat: PlayerId;
  deck: Replay["deck"];
}

export interface Decision {
  move: SimMove;
  /** The engine's summary of the action the model picked, for the sim's log. */
  summary: string;
  /** The model's estimate for its own seat, in [-1, 1]. */
  value?: number;
  /** Every action the engine offered, so a wrong pick can be read back. */
  offered: string[];
}

export class Decider {
  readonly #pack: CompactPack;
  readonly #adapters: CompactAdapter[];
  readonly #release: string;
  readonly #models = new Map<string, CompactScorerAgent>();
  #replay: Replay | undefined;
  #inEffect: InEffect | undefined;
  /** Moves the sim has refused at the decision it is on, by summary. */
  readonly #refused = new Set<string>();

  /** A pack file and the folder of adapters beside it. */
  constructor(modelPath: string, adapterDir?: string);
  /** Packs already in hand, as `resolveModel` returns them. */
  constructor(model: ModelLocation);
  constructor(first: string | ModelLocation, adapterDir?: string) {
    const model =
      typeof first === "string"
        ? { ...readModelFiles(first, adapterDir), release: "local" }
        : first;
    this.#pack = model.pack;
    this.#adapters = model.adapters;
    this.#release = model.release;
  }

  get source(): string {
    return this.#pack.source;
  }

  /** The `model-*` release the pack came from, or `"local"`. */
  get release(): string {
    return this.#release;
  }

  /** The model's pick among an observation's legal actions, for `deck`'s pilot. */
  async choose(
    observation: GameObservation,
    deck: { leader: string; cards: Record<string, number> },
  ): Promise<{ action: LegalAction; value?: number }> {
    const seat = this.#seat(deck);
    const action = await seat.chooseAction(observation);
    return {
      action,
      ...(seat.lastValue === undefined ? {} : { value: seat.lastValue }),
    };
  }

  async decide(snapshot: TableSnapshot): Promise<Decision> {
    if (snapshot.step.kind === "effect") {
      return this.#decideEffect(snapshot, snapshot.step);
    }
    if (snapshot.step.kind === "trigger") {
      // A Trigger is printed to be worth taking, and the rebuilt position has
      // no hit in progress to ask the engine about.
      return {
        move: { kind: "trigger", activate: true },
        summary: "took the [Trigger]",
        offered: [],
      };
    }
    const { state, simIds, ownDeck } = importPosition(snapshot);
    // A move the sim did not take is not offered again at this decision.
    if (snapshot.refused && this.#replay) {
      this.#refused.add(this.#replay.action.summary);
    } else {
      this.#refused.clear();
    }
    const seen = observe(state, snapshot.seat);
    const observation = {
      ...seen,
      legalActions: seen.legalActions.filter(
        (action) => !this.#refused.has(action.summary),
      ),
    };
    if (observation.legalActions.length === 0) {
      return {
        move: { kind: "defer", reason: "the engine offers no action here" },
        summary: "",
        offered: [],
      };
    }
    const leader = snapshot.players[snapshot.seat].leader.cardNumber;
    const seat = this.#seat({ leader, cards: ownDeck });
    const action = await seat.chooseAction(observation);
    this.#replay = {
      state: structuredClone(state),
      action,
      simIds,
      seat: snapshot.seat,
      deck: { leader, cards: ownDeck },
    };
    this.#inEffect = undefined;
    return {
      move: simMove(action, simIds, state.phase),
      summary: action.summary,
      ...(seat.lastValue === undefined ? {} : { value: seat.lastValue }),
      offered: observation.legalActions.map((offered) => offered.summary),
    };
  }

  /**
   * A choice inside the model's own effect. The engine replays the move that
   * started it, with the cards the sim revealed placed on top of the engine's
   * deck so a search sees the same cards, and the model picks among the
   * engine's options; the pick is then named in the sim's ids. An effect the
   * replay cannot reach -- one the model's move did not start, or a prompt
   * the two rules engines draw differently -- is answered by `#guess`, so the
   * seat never stops for the person.
   */
  async #decideEffect(
    snapshot: TableSnapshot,
    step: EffectStep,
  ): Promise<Decision> {
    let context = this.#effectContext(snapshot, step);
    if (!context)
      return this.#guess(
        snapshot,
        step,
        "the engine cannot replay this effect",
      );
    for (let depth = 0; depth < 6; depth++) {
      const observation = observe(context.state, context.seat);
      const offered = observation.legalActions;
      if (
        !offered.some(
          (action) =>
            action.type === "resolve-effect" ||
            action.type === "resolve-trigger",
        )
      ) {
        return this.#guess(snapshot, step, "the engine's effect has ended");
      }
      const action = await this.#seat(context.deck).chooseAction(observation);
      const next: GameState = applyAction(context.state, {
        ...action,
        revision: context.state.revision,
      }).state;
      const advance = (): void => {
        this.#inEffect = { ...context!, state: next };
      };
      const decision = (move: SimMove): Decision => ({
        move,
        summary: action.summary,
        offered: offered.map((entry) => entry.summary),
      });
      if (action.type !== "resolve-effect") {
        advance();
        return decision({ kind: "choose", cards: [] });
      }
      const option = action.option;
      switch (option.kind) {
        case "card": {
          const id = context.simIds.get(option.card.instanceId);
          if (!id || !step.candidates.includes(id)) {
            return this.#guess(
              snapshot,
              step,
              "the engine chose a card the sim does not offer",
            );
          }
          advance();
          return decision({ kind: "choose", cards: [id] });
        }
        case "skip":
          advance();
          return decision({ kind: "choose", cards: [], decline: true });
        case "confirm":
          // "Activate" or "apply" opens the effect the sim is already
          // showing the targets of: take it and answer the next choice.
          if (option.choice !== "done") {
            context = { ...context, state: next };
            continue;
          }
          advance();
          return decision({ kind: "choose", cards: [] });
        case "order":
        case "position":
          advance();
          return decision({ kind: "choose", cards: [] });
        default:
          return this.#guess(
            snapshot,
            step,
            `the sim has no prompt for the engine's ${option.kind} choice`,
          );
      }
    }
    return this.#guess(snapshot, step, "the effect asked too many choices");
  }

  #effectContext(
    snapshot: TableSnapshot,
    step: EffectStep,
  ): InEffect | undefined {
    const pending = (state: GameState, seat: PlayerId): boolean =>
      observe(state, seat).legalActions.some(
        (action) =>
          action.type === "resolve-effect" || action.type === "resolve-trigger",
      );
    if (this.#inEffect && pending(this.#inEffect.state, this.#inEffect.seat)) {
      return this.#inEffect;
    }
    const replay = this.#replay;
    if (!replay || replay.seat !== snapshot.seat) return undefined;
    const state = structuredClone(replay.state);
    const simIds = new Map(replay.simIds);
    const deck = state.players[replay.seat].deck;
    for (const [index, revealed] of step.revealed.entries()) {
      let number: string;
      try {
        number = engineCardNumber(revealed.cardNumber);
      } catch {
        return undefined;
      }
      const at = deck.findIndex(
        (card, position) => position >= index && card.cardNumber === number,
      );
      if (at < 0) return undefined;
      [deck[index], deck[at]] = [deck[at]!, deck[index]!];
      simIds.set(deck[index].instanceId, revealed.id);
    }
    let next: GameState;
    try {
      next = applyAction(state, {
        ...replay.action,
        revision: state.revision,
      }).state;
    } catch {
      return undefined;
    }
    if (!pending(next, replay.seat)) return undefined;
    return { state: next, simIds, seat: replay.seat, deck: replay.deck };
  }

  /**
   * An effect choice without the engine: the strongest of the opponent's
   * Characters for an effect aimed at them (a K.O., a rest, a debuff), the
   * first revealed card for a search, and otherwise the first card the sim
   * offers.
   */
  #guess(snapshot: TableSnapshot, step: EffectStep, why: string): Decision {
    const opponent = snapshot.seat === "p1" ? "p2" : "p1";
    const theirs = snapshot.players[opponent].characters
      .filter((card) => step.candidates.includes(card.id))
      .sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    const revealed = step.revealed.find((card) =>
      step.candidates.includes(card.id),
    );
    const pick = theirs[0]?.id ?? revealed?.id ?? step.candidates[0];
    return {
      move: { kind: "choose", cards: pick ? [pick] : [] },
      summary: `guessed (${why})`,
      offered: [],
    };
  }

  #seat(deck: {
    leader: string;
    cards: Record<string, number>;
  }): CompactScorerAgent {
    const adapter = adapterFor(this.#adapters, deck);
    const key = adapter?.deck.id ?? "";
    let model = this.#models.get(key);
    if (!model) {
      model = new CompactScorerAgent(loadCompact(this.#pack, adapter));
      this.#models.set(key, model);
    }
    return model.withDeck(deck.cards);
  }
}

/**
 * The engine's action in the sim's terms. Anything inside a pending effect
 * defers: the plugin performs table actions, and an effect's choices are
 * prompts the sim draws its own way.
 */
export function simMove(
  action: LegalAction,
  simIds: ReadonlyMap<string, string>,
  phase: Phase,
): SimMove {
  const sim = (instanceId: string): string => {
    const id = simIds.get(instanceId);
    if (!id) throw new Error(`no sim card for ${instanceId}`);
    return id;
  };
  switch (action.type) {
    case "mulligan-decision":
      return { kind: action.decision };
    case "play-card":
      return { kind: "play", card: sim(action.cardInstanceId) };
    case "attach-don":
      return { kind: "attach-don", target: sim(action.targetInstanceId) };
    case "attack":
      return {
        kind: "attack",
        attacker: sim(action.attackerInstanceId),
        target: sim(action.targetInstanceId),
      };
    case "block":
      return { kind: "block", blocker: sim(action.blockerInstanceId) };
    case "counter":
      return {
        kind: "counter",
        card: sim(action.cardInstanceId),
        ...(action.targetInstanceId
          ? { target: sim(action.targetInstanceId) }
          : {}),
      };
    case "activate-counter-event":
      return { kind: "counter", card: sim(action.eventInstanceId) };
    case "activate-main":
      return {
        kind: "activate",
        card: sim(action.sourceInstanceId),
        ...(action.targetInstanceId
          ? { target: sim(action.targetInstanceId) }
          : {}),
      };
    case "pass":
      if (phase === "block") return { kind: "no-block" };
      if (phase === "counter") return { kind: "no-counter" };
      if (phase === "main") return { kind: "end-turn" };
      return { kind: "defer", reason: action.summary };
    default:
      return { kind: "defer", reason: action.summary };
  }
}
