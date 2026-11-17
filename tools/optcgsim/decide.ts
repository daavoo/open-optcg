/**
 * One decision for the sim: import the snapshot, ask the learned model, and
 * translate its pick back into a move the plugin can perform.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction, Phase } from "@one-piece-sim/protocol";
import {
  adapterFor,
  CompactScorerAgent,
  isCompactPack,
  loadCompact,
  type CompactAdapter,
  type CompactPack,
  type ScorerPack,
} from "@one-piece-sim/agents/scorer";
import { importPosition } from "./position.js";
import type { SimMove, TableSnapshot } from "./snapshot.js";

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
  readonly #models = new Map<string, CompactScorerAgent>();

  constructor(modelPath: string, adapterDir?: string) {
    const pack = JSON.parse(readFileSync(modelPath, "utf8")) as
      CompactPack | ScorerPack;
    if (!isCompactPack(pack)) {
      throw new Error(
        `${modelPath} is a text-scorer pack; the bridge plays the compact one`,
      );
    }
    this.#pack = pack;
    this.#adapters = adapterDir
      ? readdirSync(adapterDir)
          .filter((file) => file.endsWith(".json"))
          .map(
            (file) =>
              JSON.parse(
                readFileSync(join(adapterDir, file), "utf8"),
              ) as CompactAdapter,
          )
          .filter((adapter) => adapter.base === pack.source)
      : [];
  }

  get source(): string {
    return this.#pack.source;
  }

  async decide(snapshot: TableSnapshot): Promise<Decision> {
    const { state, simIds, ownDeck } = importPosition(snapshot);
    const observation = observe(state, snapshot.seat);
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
    return {
      move: simMove(action, simIds, state.phase),
      summary: action.summary,
      ...(seat.lastValue === undefined ? {} : { value: seat.lastValue }),
      offered: observation.legalActions.map((offered) => offered.summary),
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
