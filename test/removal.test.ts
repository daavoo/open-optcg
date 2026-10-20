import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  knockOut,
  replacementOptionsFor,
  type GameState,
} from "@one-piece-sim/engine-core";

import { resolveDeck } from "@one-piece-sim/decks";
import { registeredReplacementOptions } from "../packages/engine-core/src/mechanics-replacements.js";
import { setTurnPlayer } from "./support/index.js";

/**
 * Every replacement on offer for a K.O., hand-written and registered, as the
 * two offer paths concatenate them. OP12-027 Koushirou is a registry entry.
 */
const allReplacementOptions = (
  ...args: Parameters<typeof replacementOptionsFor>
) => [
  ...replacementOptionsFor(...args),
  ...registeredReplacementOptions(...args),
];

function game(p1Deck: string, p2Deck: string): GameState {
  return createGame({
    gameId: "removal-1",
    p1: resolveDeck(p1Deck),
    p2: resolveDeck(p2Deck),
    seed: "removal-seed",
    startingPlayer: "p1",
  });
}

function putOnBoard(
  state: GameState,
  playerId: "p1" | "p2",
  cardNumber: string,
  instanceId: string,
): void {
  state.players[playerId].board.push({
    instanceId,
    cardNumber,
    rested: false,
    playedTurn: 0,
    attachedDon: [],
    powerModifiers: [],
  });
}

describe("centralised knock-out", () => {
  it("returns attached DON!! rested and trashes the card once", () => {
    const state = game(
      "(Green) Roronoa Zoro - Starter Deck 32",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    );
    putOnBoard(state, "p1", "ST32-004", "victim");
    state.players.p1.board.at(-1)!.attachedDon = ["don-a", "don-b"];

    const removed = knockOut(state, "p1", "victim", "ST31-004");

    expect(removed?.card.instanceId).toBe("victim");
    expect(state.players.p1.board).toHaveLength(0);
    expect(state.players.p1.trash.map((c) => c.instanceId)).toContain("victim");
    expect(state.players.p1.restedDon).toEqual(
      expect.arrayContaining(["don-a", "don-b"]),
    );
    expect(removed?.events[0]).toMatchObject({
      type: "character-ko",
      cardNumber: "ST32-004",
    });
  });

  it("offers no replacement when a player K.O.s their own Character", () => {
    const state = game(
      "(Green) Roronoa Zoro - Starter Deck 32",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    );
    putOnBoard(state, "p1", "ST32-004", "victim");
    putOnBoard(state, "p1", "OP12-027", "koushirou");
    const target = state.players.p1.board[0]!;

    expect(allReplacementOptions(state, "p1", "p1", target, "victim")).toEqual(
      [],
    );
  });

  it("offers Koushirou against an opponent effect on a Slash Character", () => {
    const state = game(
      "(Green) Roronoa Zoro - Starter Deck 32",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    );
    putOnBoard(state, "p1", "ST32-004", "victim"); // Silvers Rayleigh, Slash, cost 4
    putOnBoard(state, "p1", "OP12-027", "koushirou");
    const target = state.players.p1.board[0]!;

    const options = allReplacementOptions(state, "p2", "p1", target, "victim");

    expect(options.map((option) => option.optionId)).toEqual([
      "mechanic:victim:koushirou",
    ]);
  });
});

describe("OP12-113 Trigger no longer bypasses replacement effects", () => {
  it("hands the K.O. to the pending-effect path when a replacement exists", () => {
    // ST36's Zoro Trigger reads "[printed text omitted -- pnpm card:text OP12-113]". That is the opponent's effect, so ST32's
    // Koushirou may replace it. Before centralising K.O. this path spliced the
    // board directly and the replacement never got a chance to apply.
    const state = game(
      "(Green) Roronoa Zoro - Starter Deck 32",
      "(Yellow) Eustass Kid - Starter Deck 36",
    );
    putOnBoard(state, "p1", "ST32-005", "cheap-zoro"); // Slash, cost 1
    putOnBoard(state, "p1", "OP12-027", "koushirou");
    const target = state.players.p1.board[0]!;

    const options = allReplacementOptions(
      state,
      "p2",
      "p1",
      target,
      target.instanceId,
    );

    expect(options).not.toHaveLength(0);
    expect(options[0]!.optionId).toBe("mechanic:cheap-zoro:koushirou");
  });

  it("asks the target's controller, not the removal's source", () => {
    // By the rules "you may X instead" is the *target controller's* choice. The
    // source used to be offered the replacement in the same list as the K.O.
    // targets, which handed them the decision.
    const state = game(
      "(Green) Roronoa Zoro - Starter Deck 32",
      "(Yellow) Eustass Kid - Starter Deck 36",
    );
    putOnBoard(state, "p1", "ST32-005", "cheap-zoro");
    putOnBoard(state, "p1", "OP12-027", "koushirou");
    state.phase = "main";
    setTurnPlayer(state, "p2");
    state.pendingEffect = {
      kind: "ko-character",
      playerId: "p2",
      targetPlayerId: "p1",
      sourceCardNumber: "OP12-113",
      sourceInstanceId: "trigger-1",
      eligibleInstanceIds: ["cheap-zoro"],
      resumePhase: "main",
      resumePlayerId: "p1",
    };

    // Step one: the source picks a target and sees only targets.
    const sourceOptions = getLegalActions(state, "p2").flatMap((action) =>
      action.type === "resolve-effect" ? [action.optionId] : [],
    );
    expect(sourceOptions).toContain("cheap-zoro");
    expect(sourceOptions).not.toContain("mechanic:cheap-zoro:koushirou");

    const picked = applyAction(state, {
      type: "resolve-effect",
      actionId: getLegalActions(state, "p2").find(
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cheap-zoro",
      )!.actionId,
      revision: state.revision,
      optionId: "cheap-zoro",
    }).state;

    // Step two: control is with the target's controller, who sees the
    // replacement and the option to let the K.O. happen.
    expect(picked.activePlayer).toBe("p1");
    expect(picked.pendingEffect?.kind).toBe("replacement-choice");
    const defenderOptions = getLegalActions(picked, "p1").flatMap((action) =>
      action.type === "resolve-effect" ? [action.optionId] : [],
    );
    expect(defenderOptions).toContain("mechanic:cheap-zoro:koushirou");
    expect(defenderOptions).toContain("skip");
  });

  it("resolves the replacement the target's controller picks", () => {
    const state = game(
      "(Green) Roronoa Zoro - Starter Deck 32",
      "(Yellow) Eustass Kid - Starter Deck 36",
    );
    putOnBoard(state, "p1", "ST32-005", "cheap-zoro");
    putOnBoard(state, "p1", "OP12-027", "koushirou");
    state.phase = "main";
    setTurnPlayer(state, "p1");
    state.pendingEffect = {
      kind: "replacement-choice",
      playerId: "p1",
      sourcePlayerId: "p2",
      targetInstanceId: "cheap-zoro",
      sourceCardNumber: "OP12-113",
      sourceInstanceId: "trigger-1",
      options: [
        {
          optionId: "mechanic:cheap-zoro:koushirou",
          summary: "Rest Koushirou instead",
        },
      ],
      resumePhase: "main",
      resumePlayerId: "p1",
    };

    const resolved = applyAction(state, {
      type: "resolve-effect",
      actionId: getLegalActions(state, "p1").find(
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "mechanic:cheap-zoro:koushirou",
      )!.actionId,
      revision: state.revision,
      optionId: "mechanic:cheap-zoro:koushirou",
    }).state;

    // Koushirou rested, the threatened Character survived, and no pending
    // effect was left behind asking the source to choose all over again.
    expect(
      resolved.players.p1.board.find((card) => card.instanceId === "koushirou")
        ?.rested,
    ).toBe(true);
    expect(
      resolved.players.p1.board.some(
        (card) => card.instanceId === "cheap-zoro",
      ),
    ).toBe(true);
    expect(resolved.pendingEffect).toBeNull();
  });

  it("lets the target's controller decline and take the K.O.", () => {
    const state = game(
      "(Green) Roronoa Zoro - Starter Deck 32",
      "(Yellow) Eustass Kid - Starter Deck 36",
    );
    putOnBoard(state, "p1", "ST32-005", "cheap-zoro");
    putOnBoard(state, "p1", "OP12-027", "koushirou");
    state.phase = "main";
    setTurnPlayer(state, "p1");
    state.pendingEffect = {
      kind: "replacement-choice",
      playerId: "p1",
      sourcePlayerId: "p2",
      targetInstanceId: "cheap-zoro",
      sourceCardNumber: "OP12-113",
      sourceInstanceId: "trigger-1",
      options: [
        {
          optionId: "mechanic:cheap-zoro:koushirou",
          summary: "Rest Koushirou instead",
        },
      ],
      resumePhase: "main",
      resumePlayerId: "p1",
    };

    const resolved = applyAction(state, {
      type: "resolve-effect",
      actionId: getLegalActions(state, "p1").find(
        (action) =>
          action.type === "resolve-effect" && action.optionId === "skip",
      )!.actionId,
      revision: state.revision,
      optionId: "skip",
    }).state;

    expect(
      resolved.players.p1.board.some(
        (card) => card.instanceId === "cheap-zoro",
      ),
    ).toBe(false);
    expect(
      resolved.players.p1.board.find((card) => card.instanceId === "koushirou")
        ?.rested,
    ).toBe(false);
  });
});
