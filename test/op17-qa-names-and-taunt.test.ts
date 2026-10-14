import { describe, expect, it } from "vitest";
import { hasKeyword } from "@one-piece-sim/engine-core";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * Three rulings from Bandai's OP-17 Q&A (2026-08-21) about who a clause
 * counts: a Leader "treated as having all card names" answers to every name a
 * clause asks for, and a taunt printed on each copy of a card names each copy.
 */

/** The sealed-format Leader treated as a card with all card names. */
const ALL_NAMES_LEADER = "SEALED-LUFFY";

describe("OP17-010 Fossa counts a Leader with every name as another [Fossa]", () => {
  covers("OP17-010", "[Activate: Main]");

  /** p1's Fossa, facing a 10000-power Character, under `leader`. */
  function fossa(leader?: string) {
    const setup = scenario()
      .seed("op17-010-qa")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("fossa", "OP17-010")])
      .withBoard("p2", [character("big", "OP17-064")]); // 10000 power
    return (leader ? setup.withLeader("p1", leader) : setup).build();
  }

  const activate = (game: ReturnType<typeof fossa>) =>
    game.play(
      (action) =>
        action.type === "activate-main" && action.actionId.includes("fossa"),
    );

  it("grants nothing under that Leader", () => {
    const game = fossa(ALL_NAMES_LEADER);
    activate(game);
    // The Leader is "another [Fossa]", so the clause's condition fails.
    expect(hasKeyword(game.state, "p1", "fossa", "Blocker")).toBe(false);
  });

  it("still grants [Blocker] under a Leader that is not a [Fossa]", () => {
    const game = fossa();
    activate(game);
    expect(hasKeyword(game.state, "p1", "fossa", "Blocker")).toBe(true);
  });
});

describe("OP17-044 Captain John: every rested copy is a legal target", () => {
  covers("OP17-044", "static");

  it("lets the attacker choose between two rested Captain Johns", () => {
    const game = scenario()
      .seed("op17-044-qa")
      .atTurn(3, { active: "p1" })
      .withLeader("p2", "OP17-039") // a {Rocks Pirates} Leader
      .withBoard("p2", [
        character("john-a", "OP17-044", { rested: true }),
        character("john-b", "OP17-044", { rested: true }),
        character("other", "ST31-002", { rested: true }),
      ])
      .build();

    const targets = new Set(
      game
        .legalActions()
        .flatMap((action) =>
          action.type === "attack" ? [action.targetInstanceId] : [],
        ),
    );
    // Both Johns, and still neither the Leader nor the other Character.
    expect([...targets].sort()).toEqual(["john-a", "john-b"]);
  });
});

describe("OP16-040 Gum-Gum Hammer Rifle reads the Leader's name", () => {
  covers("OP16-040", "[Main]");

  /** p1 holding the Event, p2 with a rested cost-6-or-less Character. */
  function rifle(leader: string, board: ReturnType<typeof character>[] = []) {
    return scenario()
      .seed("op16-040-qa")
      .atTurn(3, { active: "p1" })
      .withLeader("p1", leader)
      .withBoard("p1", board)
      .withHand("p1", [instance("rifle", "OP16-040")])
      .withBoard("p2", [character("target", "ST31-002", { rested: true })])
      .build();
  }

  /** An Event's [Main] is offered as an activation from hand. */
  const isRifle = (action: { type: string; actionId: string }) =>
    action.type === "activate-main" && action.actionId.includes("rifle");

  /**
   * Whether the offer is one that can do something: the engine still offers
   * an Event whose condition fails, flagged `selectsNothing`.
   */
  const rifleLive = (game: ReturnType<typeof rifle>) => {
    const offer = game.legalActions().find(isRifle);
    return offer?.type === "activate-main" && offer.selectsNothing !== true;
  };

  /** Plays the Event, naming p2's rested Character if it is asked for. */
  function play(game: ReturnType<typeof rifle>) {
    game.play(isRifle);
    if (
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-effect" && action.optionId === "target",
        )
    ) {
      game.play({ type: "resolve-effect", optionId: "target" });
    }
    return game.state.players.p2.board.find(
      (card) => card.instanceId === "target",
    )?.cannotRefreshUntilTurn;
  }

  it("is met by a Leader with all card names and no Character at all", () => {
    // Bandai's OP-17 Q&A: that Leader is both [Monkey.D.Luffy] and
    // [Mr.3(Galdino)].
    const game = rifle(ALL_NAMES_LEADER);
    expect(rifleLive(game)).toBe(true);
    expect(play(game)).toBeDefined();
  });

  it("is met by a Luffy Leader beside a Mr.3 Character", () => {
    const game = rifle("ST21-001", [character("mr3", "OP16-037")]);
    expect(rifleLive(game)).toBe(true);
    expect(play(game)).toBeDefined();
  });

  it("is not met by a Luffy Leader alone", () => {
    const game = rifle("ST21-001");
    // The Luffy half is met, so the Event is offered -- as one that can do
    // nothing, since no [Mr.3(Galdino)] answers the second half.
    expect(rifleLive(game)).toBe(false);
    expect(play(game)).toBeUndefined();
  });
});
