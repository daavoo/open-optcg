import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { currentPower, getLegalActions } from "@one-piece-sim/engine-core";
import { deckManifests } from "@one-piece-sim/decks";
import {
  engineCardNumber,
  importPosition,
} from "../tools/optcgsim/position.js";
import { Decider, simMove } from "../tools/optcgsim/decide.js";
import type { SimSide, TableSnapshot } from "../tools/optcgsim/snapshot.js";

const LUFFY = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ZORO = "(Green) Roronoa Zoro - Starter Deck 32";

function list(deckId: string): string[] {
  return Object.entries(deckManifests[deckId]!.cards).flatMap(
    ([card, copies]) => Array<string>(copies).fill(card),
  );
}

function side(deckId: string, overrides: Partial<SimSide>): SimSide {
  return {
    deckList: list(deckId),
    leader: {
      id: `${deckId}-leader`,
      cardNumber: deckManifests[deckId]!.leader,
      rested: false,
      don: 0,
    },
    hand: 5,
    characters: [],
    stage: null,
    trash: [],
    life: 5,
    deckCount: 40,
    don: { active: 0, rested: 0 },
    ...overrides,
  };
}

/** Turn 3, Luffy's second turn: three DON!!, a Character from turn 1. */
function luffyMain(): TableSnapshot {
  return {
    version: 1,
    turn: 3,
    turnPlayer: "p1",
    seat: "p1",
    step: { kind: "main" },
    players: {
      p1: side(LUFFY, {
        hand: [
          { id: "h1", cardNumber: "ST31-003" },
          { id: "h2", cardNumber: "OP11-009" },
          { id: "h3", cardNumber: "P-101" },
          { id: "h4", cardNumber: "OP04-016" },
          { id: "h5", cardNumber: "ST23-004" },
        ],
        characters: [
          {
            id: "c1",
            cardNumber: "ST31-002",
            rested: false,
            don: 0,
          },
        ],
        deckCount: 38,
        don: { active: 3, rested: 0 },
      }),
      p2: side(ZORO, {
        hand: 6,
        characters: [
          {
            id: "z1",
            cardNumber: "ST32-004",
            rested: true,
            don: 1,
            power: 7000,
          },
        ],
        deckCount: 38,
        don: { active: 0, rested: 1 },
      }),
    },
  };
}

describe("OPTCGSim bridge position import", () => {
  it("places every zone the snapshot names, on the snapshot's turn and seat", () => {
    const { state, simIds } = importPosition(luffyMain());
    expect(state.turn).toBe(3);
    expect(state.phase).toBe("main");
    expect(state.activePlayer).toBe("p1");
    const luffy = state.players.p1;
    expect(luffy.hand.map((card) => card.cardNumber)).toEqual([
      "ST31-003",
      "OP11-009",
      "P-101",
      "OP04-016",
      "ST23-004",
    ]);
    expect(luffy.board.map((card) => card.cardNumber)).toEqual(["ST31-002"]);
    expect(luffy.activeDon).toHaveLength(3);
    expect(luffy.life).toHaveLength(5);
    expect(luffy.deck).toHaveLength(38);
    expect(state.players.p2.hand).toHaveLength(6);
    expect(simIds.get(luffy.board[0]!.instanceId)).toBe("c1");
    expect(simIds.get("p1-leader")).toBe(`${LUFFY}-leader`);
  });

  it("carries a power the sim shows but the engine cannot derive", () => {
    const { state } = importPosition(luffyMain());
    const zoroCharacter = state.players.p2.board[0]!;
    expect(zoroCharacter.attachedDon).toHaveLength(1);
    expect(currentPower(state, "p2", zoroCharacter.instanceId)).toBe(7000);
  });

  it("offers the Character from an earlier turn an attack, and the hand to play", () => {
    const { state, simIds } = importPosition(luffyMain());
    const actions = getLegalActions(state, "p1");
    const moves = actions.map((action) => simMove(action, simIds, state.phase));
    expect(moves).toContainEqual(
      expect.objectContaining({ kind: "attack", attacker: "c1" }),
    );
    expect(moves).toContainEqual({ kind: "play", card: "h1" });
    expect(moves).toContainEqual({ kind: "end-turn" });
  });

  it("poses a block with the attack the snapshot describes", () => {
    const snapshot = luffyMain();
    snapshot.seat = "p2";
    snapshot.players.p2.characters.push({
      id: "z2",
      cardNumber: "ST32-002",
      rested: false,
      don: 0,
    });
    snapshot.step = {
      kind: "block",
      attacker: "c1",
      target: `${ZORO}-leader`,
      attackPower: 6000,
    };
    const { state, simIds } = importPosition(snapshot);
    expect(state.phase).toBe("block");
    expect(state.activePlayer).toBe("p2");
    const moves = getLegalActions(state, "p2").map((action) =>
      simMove(action, simIds, state.phase),
    );
    expect(moves).toContainEqual({ kind: "no-block" });
  });
});

describe("OPTCGSim card ids", () => {
  it("reads an alternate printing as its base card", () => {
    expect(engineCardNumber("op11-009_p1")).toBe("OP11-009");
  });

  it("names a card the engine does not know, so the seat can hand it back", () => {
    expect(() => engineCardNumber("ZZ99-999")).toThrow(/ZZ99-999/);
  });
});

const modelPath = join(process.cwd(), "packages/web/src/scorer-model.json");

describe.skipIf(!existsSync(modelPath))("OPTCGSim bridge decision", () => {
  it("answers with a move that names the sim's own cards", async () => {
    const decision = await new Decider(modelPath).decide(luffyMain());
    const names = new Set([
      "c1",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      `${LUFFY}-leader`,
      `${ZORO}-leader`,
      "z1",
    ]);
    const move = decision.move as Record<string, string>;
    for (const key of ["card", "target", "attacker", "blocker"]) {
      if (move[key] !== undefined) expect(names).toContain(move[key]);
    }
    expect(decision.move.kind).not.toBe("defer");
    expect(decision.offered.length).toBeGreaterThan(1);
  });
});
