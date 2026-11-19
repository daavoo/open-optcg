/**
 * The recorded game (`tools/optcgsim/shadow.ts`), followed through a stand-in
 * for the sim: a second engine game dealt from another seed, which shows the
 * snapshots the plugin would and performs the moves it is told. The record
 * must stay equal to that game, deal by deal and move by move, and load as a
 * match of its own.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  currentPower,
  donPowerApplies,
  findOfferedAction,
  getLegalActions,
  type GameState,
} from "@one-piece-sim/engine-core";
import { resolveDeck } from "@one-piece-sim/decks";
import {
  nextInt,
  seedRng,
  type LegalAction,
  type PlayerId,
} from "@one-piece-sim/protocol";
import { BrowserGameController } from "../packages/web/src/controller.js";
import { parseExportedMatch } from "../packages/web/src/diagnostics.js";
import { simMove } from "../tools/optcgsim/decide.js";
import {
  differences,
  ShadowGame,
  type Chooser,
} from "../tools/optcgsim/shadow.js";
import type {
  SimMove,
  SimSide,
  SimStep,
  TableSnapshot,
} from "../tools/optcgsim/snapshot.js";

const DECKS = {
  p1: "(Red) Monkey.D.Luffy - Starter Deck 31",
  p2: "(Green) Roronoa Zoro - Starter Deck 32",
} as const;

const simId = (instanceId: string): string => `sim:${instanceId}`;

/** The stand-in sim: an engine game, and the table the plugin would read off it. */
class StandIn {
  state: GameState;
  /** A [Trigger] was taken and the sim is asking which card it is aimed at. */
  #aimingTrigger = false;

  constructor(seed: string) {
    this.state = createGame({
      gameId: "stand-in",
      p1: resolveDeck(DECKS.p1),
      p2: resolveDeck(DECKS.p2),
      seed,
      startingPlayer: "p2",
    });
  }

  get over(): boolean {
    return this.state.phase === "finished";
  }

  #offers(): LegalAction[] {
    return getLegalActions(this.state, this.state.activePlayer);
  }

  #take(action: LegalAction): void {
    this.state = applyAction(this.state, {
      ...action,
      revision: this.state.revision,
    }).state;
  }

  #side(player: PlayerId): SimSide {
    const side = this.state.players[player];
    const card = (entry: { instanceId: string; cardNumber: string }) => ({
      id: simId(entry.instanceId),
      cardNumber: entry.cardNumber,
    });
    return {
      deckList: [...resolveDeck(DECKS[player]).cards],
      leader: {
        id: simId(`${player}-leader`),
        cardNumber: side.leaderCardNumber,
        rested: side.leaderRested,
        don: side.leaderAttachedDon.length,
        power: currentPower(
          this.state,
          player,
          `${player}-leader`,
          donPowerApplies(this.state, player),
        ),
      },
      hand: side.hand.map(card),
      characters: side.board.map((entry) => ({
        ...card(entry),
        rested: entry.rested,
        don: entry.attachedDon?.length ?? 0,
        power: currentPower(
          this.state,
          player,
          entry.instanceId,
          donPowerApplies(this.state, player),
        ),
      })),
      stage: side.stage
        ? { ...card(side.stage), rested: side.stage.rested }
        : null,
      trash: side.trash.map(card),
      life: side.life.length,
      deckCount: side.deck.length,
      // A table shows no DON!! before a player's first DON!! Phase; the
      // engine has dealt that phase's first one already.
      don: {
        active:
          side.activeDon.length -
          (this.state.phase === "mulligan" ||
          (this.state.turn === 1 && player !== this.state.turnPlayerId)
            ? 1
            : 0),
        rested: side.restedDon.length,
      },
      deck: side.deck.map(card),
      lifeCards: side.life.map(card),
    };
  }

  #step(): SimStep {
    const state = this.state;
    if (state.phase === "mulligan") return { kind: "mulligan" };
    if (state.pendingEffect) {
      const offered = this.#offers().flatMap((offer) =>
        offer.type === "resolve-effect" && offer.option.kind === "card"
          ? [offer.option.card]
          : [],
      );
      // Cards the effect holds are in no zone; the sim shows them apart.
      const placed = new Set(
        (["p1", "p2"] as const).flatMap((player) => {
          const side = state.players[player];
          return [
            ...side.hand,
            ...side.board,
            ...side.trash,
            ...side.deck,
            ...side.life,
            ...(side.stage ? [side.stage] : []),
          ].map((card) => card.instanceId);
        }),
      );
      return {
        kind: "effect",
        source: "",
        candidates: offered.map((card) => simId(card.instanceId)),
        revealed: offered
          .filter(
            (card) =>
              !placed.has(card.instanceId) &&
              !card.instanceId.endsWith("-leader"),
          )
          .map((card) => ({
            id: simId(card.instanceId),
            cardNumber: card.cardNumber,
          })),
        remaining: 1,
      };
    }
    if (state.phase === "trigger" && this.#aimingTrigger) {
      return {
        kind: "effect",
        source: simId(state.pendingTrigger!.card.instanceId),
        candidates: this.#triggerTargets().map((offer) =>
          simId(offer.targetInstanceId!),
        ),
        revealed: [],
        remaining: 1,
      };
    }
    if (state.phase === "trigger") {
      const card = state.pendingTrigger!.card;
      return {
        kind: "trigger",
        card: { id: simId(card.instanceId), cardNumber: card.cardNumber },
      };
    }
    if (state.phase === "block" || state.phase === "counter") {
      const attack = state.activeAttack!;
      return {
        kind: state.phase,
        attacker: simId(attack.attackerInstanceId),
        target: simId(attack.targetInstanceId),
        attackPower:
          currentPower(
            state,
            attack.attackerPlayerId,
            attack.attackerInstanceId,
          ) + attack.battleAttackBonus,
        counterPower: attack.counterPower,
      };
    }
    return { kind: "main" };
  }

  /** A move of the person's: a click the bridge is never told about. */
  click(pick: (offers: number) => number): void {
    const offers = this.#offers();
    this.#take(offers[pick(offers.length)]!);
  }

  snapshot(person?: PlayerId): TableSnapshot {
    return {
      ...(person ? { person } : {}),
      version: 1,
      turn: this.state.turn,
      turnPlayer: this.state.turnPlayerId,
      seat: this.state.activePlayer,
      step: this.#step(),
      players: { p1: this.#side("p1"), p2: this.#side("p2") },
      record: true,
      game: "stand-in",
      first: "p2",
    };
  }

  #triggerTargets(): Extract<LegalAction, { type: "resolve-trigger" }>[] {
    return this.#offers().filter(
      (offer): offer is Extract<LegalAction, { type: "resolve-trigger" }> =>
        offer.type === "resolve-trigger" &&
        offer.targetInstanceId !== undefined,
    );
  }

  /** Performs a move the way the plugin's clicks would. */
  perform(move: SimMove): void {
    if (move.kind === "trigger") {
      // An aimed [Trigger] is taken first and aimed at the sim's next prompt.
      if (move.activate && this.#triggerTargets().length > 0) {
        this.#aimingTrigger = true;
        return;
      }
      this.#take(
        this.#offers().find(
          (offer) =>
            offer.type === "resolve-trigger" &&
            (offer.optionId !== "skip") === move.activate,
        )!,
      );
      return;
    }
    if (move.kind === "choose" && this.#aimingTrigger) {
      this.#aimingTrigger = false;
      this.#take(
        this.#triggerTargets().find(
          (offer) => simId(offer.targetInstanceId!) === move.cards[0],
        )!,
      );
      return;
    }
    if (move.kind === "choose") {
      this.#choose(move);
      return;
    }
    const ids = new Map<string, string>();
    for (const player of ["p1", "p2"] as const) {
      const side = this.state.players[player];
      ids.set(`${player}-leader`, simId(`${player}-leader`));
      for (const card of [...side.hand, ...side.board, ...side.trash]) {
        ids.set(card.instanceId, simId(card.instanceId));
      }
      if (side.stage)
        ids.set(side.stage.instanceId, simId(side.stage.instanceId));
    }
    const wanted = JSON.stringify(move);
    const action = this.#offers().find((offer) => {
      try {
        return JSON.stringify(simMove(offer, ids, this.state.phase)) === wanted;
      } catch {
        return false;
      }
    });
    if (!action) throw new Error(`the stand-in has no action for ${wanted}`);
    this.#take(action);
  }

  #choose(move: Extract<SimMove, { kind: "choose" }>): void {
    for (let guard = 0; guard < 3; guard++) {
      const offers = this.#offers().filter(
        (offer): offer is Extract<LegalAction, { type: "resolve-effect" }> =>
          offer.type === "resolve-effect",
      );
      // The sim's own prompt, with no effect of the stand-in's behind it.
      if (offers.length === 0) return;
      const wanted = offers.find((offer) =>
        move.cards.length > 0
          ? offer.option.kind === "card" &&
            simId(offer.option.card.instanceId) === move.cards[0]
          : move.decline
            ? offer.option.kind === "skip"
            : (offer.option.kind === "confirm" &&
                offer.option.choice === "done") ||
              offer.option.kind === "order",
      );
      if (wanted) {
        // The sim arranges cards its own way: here, the reverse of the order
        // they were offered in.
        if (wanted.option.kind === "order") {
          const cut = wanted.actionId.lastIndexOf(":");
          const [list = "", split] = wanted.actionId.slice(cut + 1).split("|");
          const reversed = findOfferedAction(
            this.#offers(),
            `${wanted.actionId.slice(0, cut + 1)}${list.split(",").reverse().join(",")}${split === undefined ? "" : `|${split}`}`,
          );
          this.#take(reversed ?? wanted);
        } else {
          this.#take(wanted);
        }
        return;
      }
      const opener = offers.find(
        (offer) =>
          offer.option.kind === "confirm" && offer.option.choice !== "done",
      );
      if (opener) {
        this.#take(opener);
        continue;
      }
      // A prompt confirmed as it stands: the sim's own first answer.
      if (move.cards.length === 0 && !move.decline) {
        this.#take(offers[0]!);
        return;
      }
      throw new Error(
        `the stand-in cannot answer ${JSON.stringify(move)} among ${offers.map((offer) => offer.summary).join(" | ")}`,
      );
    }
  }
}

/** A pilot that takes any legal action, so a game wanders through the rules. */
function wanderer(seed: string): Chooser {
  let rng = seedRng(seed);
  return (observation) => {
    const drawn = nextInt(rng, observation.legalActions.length);
    rng = drawn.state;
    return Promise.resolve({ action: observation.legalActions[drawn.value]! });
  };
}

export async function follow(
  seed: string,
  decisions: number,
): Promise<{ sim: StandIn; shadow: ShadowGame; last: TableSnapshot }> {
  const sim = new StandIn(`stand-in-${seed}`);
  let snapshot = sim.snapshot();
  const shadow = new ShadowGame(snapshot, wanderer(seed), `record-${seed}`);
  for (let count = 0; count < decisions && !sim.over; count++) {
    snapshot = sim.snapshot();
    const decision = await shadow.decide(snapshot);
    if (!decision) break;
    sim.perform(decision.move);
  }
  return { sim, shadow, last: snapshot };
}

/** A game with a person in `person`'s seat, clicking for themselves. */
export async function followWithPerson(
  seed: string,
  person: PlayerId,
  decisions: number,
): Promise<{ sim: StandIn; shadow: ShadowGame }> {
  const sim = new StandIn(`stand-in-${seed}`);
  const shadow = new ShadowGame(
    sim.snapshot(person),
    wanderer(seed),
    `record-${seed}`,
  );
  let rng = seedRng(`person-${seed}`);
  for (let count = 0; count < decisions && !sim.over; count++) {
    if (sim.state.activePlayer === person) {
      sim.click((offers) => {
        const drawn = nextInt(rng, offers);
        rng = drawn.state;
        return drawn.value;
      });
      // The plugin shows the table at each decision of the person's.
      if (sim.state.activePlayer === person) {
        shadow.follow(sim.snapshot(person));
      }
      continue;
    }
    const decision = await shadow.decide(sim.snapshot(person));
    if (!decision) break;
    sim.perform(decision.move);
  }
  return { sim, shadow };
}

describe("OPTCGSim recorded game with a person", () => {
  it.each([
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
  ])(
    "follows the person's clicks from the table alone (seed %s)",
    async (seed) => {
      const { sim, shadow } = await followWithPerson(seed, "p1", 400);
      expect(shadow.divergence).toBeUndefined();
      expect(
        shadow.plays.filter((play) => play.by === "person").length,
      ).toBeGreaterThan(5);
      if (sim.over) {
        shadow.finish(sim.state.winner);
        expect(shadow.ended).toMatchObject({ agrees: true });
      }
    },
  );
});

describe("OPTCGSim recorded game", () => {
  it.each([
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
  ])(
    "stays the sim's game through its shuffles and choices (seed %s)",
    async (seed) => {
      const { sim, shadow } = await follow(seed, 400);
      expect(shadow.divergence).toBeUndefined();
      expect(shadow.actionCount).toBeGreaterThan(20);
      if (sim.over) {
        shadow.finish(sim.state.winner);
        expect(shadow.ended).toMatchObject({ agrees: true });
      }
    },
  );

  it("exports a match that loads and replays to the sim's table", async () => {
    const { sim, shadow } = await follow("a", 60);
    expect(shadow.divergence).toBeUndefined();
    const saved = parseExportedMatch(shadow.trace("2026-01-01T00:00:00.000Z"));
    expect(saved.actions).toHaveLength(shadow.actionCount);
    const config = saved.config;
    expect(config.p1Deck).toBe(DECKS.p1);
    expect(config.recordedShuffles?.p1.length).toBeGreaterThan(0);

    const loaded = BrowserGameController.load(saved);
    for (const player of ["p1", "p2"] as const) {
      const ours = loaded.observe(player).self;
      const theirs = sim.state.players[player];
      expect(ours.hand.map((card) => card.cardNumber).sort()).toEqual(
        theirs.hand.map((card) => card.cardNumber).sort(),
      );
      expect(ours.board.map((card) => card.cardNumber).sort()).toEqual(
        theirs.board.map((card) => card.cardNumber).sort(),
      );
      expect(ours.lifeCount).toBe(theirs.life.length);
    }
  });

  it("stops, and says where, when the sim's table is not the engine's", async () => {
    const { sim, shadow } = await follow("a", 30);
    const snapshot = sim.snapshot();
    // The sim rules a card into the trash that the engine left in hand.
    const side = snapshot.players[snapshot.seat];
    const moved = (side.hand as { id: string; cardNumber: string }[]).pop()!;
    side.trash.push(moved);
    expect(await shadow.decide(snapshot)).toBeUndefined();
    expect(shadow.divergence).toMatchObject({
      why: "the engine's table is not the sim's",
      seat: snapshot.seat,
    });
    expect(shadow.divergence!.differences.join("\n")).toContain("trash");
  });

  it("reads no difference between a game and its own snapshot", () => {
    const sim = new StandIn("same");
    const found = differences(sim.state, sim.snapshot());
    expect(found).toEqual({ table: [], hidden: { p1: [], p2: [] }, notes: [] });
  });
});
