import { describe, expect, it } from "vitest";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * ST01-011 Brook, ST-01's one card in the pool: a block-1 starter card
 * reprinted in block 4, which the current Sabo (OP13-004) field plays.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

function drive(game: Game, ...picks: string[]) {
  const queue = [...picks];
  for (let guard = 0; guard < 40 && game.state.pendingEffect; guard++) {
    const options = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);
    const index = queue.findIndex((id) => options.includes(id));
    const pick =
      index >= 0
        ? queue.splice(index, 1)[0]!
        : options.includes("apply")
          ? "apply"
          : options[0]!;
    game.play({ type: "resolve-effect", optionId: pick });
  }
}

describe("ST01-011 Brook", () => {
  covers("ST01-011", "[On Play]");

  it("gives two rested DON!! to the Leader", () => {
    const game = table("st01-brook-leader")
      .withHand("p1", [instance("brook", "ST01-011")])
      .withDon("p1", { active: 6, rested: 2 })
      .build();
    const attached = game.state.players.p1.leaderAttachedDon.length;

    game.play({ type: "play-card", cardNumber: "ST01-011" });
    drive(game, "p1-leader");

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(attached + 2);
  });

  it("gives both to one Character instead", () => {
    const game = table("st01-brook-character")
      .withHand("p1", [instance("brook", "ST01-011")])
      .withBoard("p1", [character("luffy", "ST23-004")])
      .withDon("p1", { active: 6, rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "ST01-011" });
    drive(game, "luffy");

    const luffy = game.state.players.p1.board.find(
      (card) => card.instanceId === "luffy",
    )!;
    expect(luffy.attachedDon).toHaveLength(2);
  });
});
