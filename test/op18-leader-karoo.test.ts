import { describe, expect, it } from "vitest";
import { currentPower, hasKeyword } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP18-001 Karoo, the Leader, edge by edge. The ordinary aura and the K.O.
 * draw are in `op18-red.test.ts` and Bandai's Q1503 is in
 * `op18-faq-red.test.ts`; these pin what the printed text implies beyond
 * them: both types, not either; [Rush] used from hand; the +1000 on either
 * turn; the draw on either turn, by battle and by effect, for the
 * controller's own {Alabasta} Characters only; [Once Per Turn] spent and
 * refreshed; a trash or a bounce is not a K.O.; and a negated Leader.
 *
 * Cards: OP18-003 Sea Cat is a vanilla {Animal}/{Alabasta}, OP07-030 Pappag
 * an {Animal} with no Camie to switch its text on, OP18-002 Igaram an
 * {Alabasta} that is not an {Animal}.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting in its own Main Phase, with ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .withLeader("p1", "OP18-001");

/** p2 acting, p1 holding the Karoo Leader. */
const defending = (seed: string) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .withLeader("p1", "OP18-001");

function settle(game: Game) {
  for (let step = 0; game.state.pendingEffect; step++) {
    if (step > 20) throw new Error("effect did not settle");
    game.play({ type: "resolve-effect" });
  }
}

/** Play OP06-081 Absalom, pay its cost and K.O. `target` with it. */
function absalomKo(game: Game, target: string) {
  game.play({ type: "play-card", cardNumber: "OP06-081" });
  for (let step = 0; game.state.pendingEffect; step++) {
    if (step > 20) throw new Error("Absalom did not settle");
    const offered = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect")
      .map((action) => (action as { optionId?: string }).optionId);
    if (offered.includes(target)) pick(game, target);
    else game.play({ type: "resolve-effect" });
  }
}

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);
const handIds = (game: Game, player: "p1" | "p2" = "p1") =>
  ids(game.state.players[player].hand);
const trashIds = (game: Game, player: "p1" | "p2" = "p1") =>
  ids(game.state.players[player].trash);

const power = (game: Game, player: "p1" | "p2", instanceId: string) =>
  currentPower(game.state, player, instanceId);

const rush = (game: Game, player: "p1" | "p2", instanceId: string) =>
  hasKeyword(game.state, player, instanceId, "Rush");

const attack = (
  game: Game,
  attackerInstanceId: string,
  targetInstanceId: string,
) => game.play({ type: "attack", attackerInstanceId, targetInstanceId });

const attackOffered = (game: Game, attackerInstanceId: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "attack" &&
        (action as { attackerInstanceId?: string }).attackerInstanceId ===
          attackerInstanceId,
    );

/** Decline the block and Counter steps, so a declared attack resolves. */
const passDefence = (game: Game) => {
  for (
    let step = 0;
    (game.state.phase === "block" || game.state.phase === "counter") &&
    !game.state.pendingEffect;
    step++
  ) {
    if (step > 10) throw new Error("defence did not pass");
    game.pass();
  }
};

/** A card on top of p1's deck, so a draw is the draw of that card. */
const marked = instance("drawn", "FIX-001");

describe("OP18-001 Karoo's aura: who it reaches", () => {
  covers("OP18-001", "static");

  it("needs both types: {Animal} alone and {Alabasta} alone get neither [Rush] nor +1000", () => {
    const game = table("karoo-both-types")
      .withBoard("p1", [
        character("seacat", "OP18-003", { playedTurn: 11 }),
        character("pappag", "OP07-030", { playedTurn: 11 }),
        character("igaram", "OP18-002", { playedTurn: 11 }),
      ])
      .build();

    expect(power(game, "p1", "seacat")).toBe(7000);
    expect(rush(game, "p1", "seacat")).toBe(true);
    // {Animal} only.
    expect(power(game, "p1", "pappag")).toBe(0);
    expect(rush(game, "p1", "pappag")).toBe(false);
    expect(attackOffered(game, "pappag")).toBe(false);
    // {Alabasta} only.
    expect(power(game, "p1", "igaram")).toBe(2000);
    expect(rush(game, "p1", "igaram")).toBe(false);
    expect(attackOffered(game, "igaram")).toBe(false);
  });

  it("[Rush] lets a Character played from hand this turn attack, and swing at 7000", () => {
    const game = table("karoo-rush-from-hand")
      .withHand("p1", [
        instance("seacat", "OP18-003"),
        instance("pappag", "OP07-030"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-003" });
    settle(game);
    game.play({ type: "play-card", cardNumber: "OP07-030" });
    settle(game);
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["seacat", "pappag"]),
    );

    expect(attackOffered(game, "seacat")).toBe(true);
    expect(attackOffered(game, "pappag")).toBe(false);

    attack(game, "seacat", "p2-leader");
    expect(game.state.activeAttack?.attackerInstanceId).toBe("seacat");
    expect(power(game, "p1", "seacat")).toBe(7000);
  });

  it("keeps the +1000 on the opponent's turn", () => {
    const game = defending("karoo-opp-turn-power")
      .withBoard("p1", [
        character("seacat", "OP18-003"),
        character("igaram", "OP18-002"),
      ])
      .build();

    expect(power(game, "p1", "seacat")).toBe(7000);
    expect(power(game, "p1", "igaram")).toBe(2000);
  });

  it("reaches only its controller's Characters, not the opponent's", () => {
    const game = table("karoo-opp-chars")
      .withBoard("p2", [character("their-seacat", "OP18-003")])
      .build();

    expect(power(game, "p2", "their-seacat")).toBe(6000);
    expect(rush(game, "p2", "their-seacat")).toBe(false);
  });

  it("gives nothing while the Leader's effects are negated", () => {
    const game = table("karoo-aura-negated")
      .withBoard("p1", [character("seacat", "OP18-003", { playedTurn: 11 })])
      .withNegated("p1-leader")
      .build();

    expect(power(game, "p1", "seacat")).toBe(6000);
    expect(rush(game, "p1", "seacat")).toBe(false);
    expect(attackOffered(game, "seacat")).toBe(false);
  });
});

describe("OP18-001 Karoo's K.O. draw: what counts", () => {
  covers("OP18-001", "static");

  it("draws on its own turn when an effect K.O.s its {Alabasta} Character", () => {
    // OP06-081 Absalom: return 2 trash cards to K.O. up to 1 Character with a
    // cost of 2 or less -- either side, so it can take p1's own Igaram.
    const game = table("karoo-own-turn-effect-ko")
      .withBoard("p1", [character("igaram", "OP18-002")])
      .withHand("p1", [instance("absalom", "OP06-081")])
      .withTrash("p1", [
        instance("trash-a", "FIX-001"),
        instance("trash-b", "FIX-001"),
      ])
      .withDeckTop("p1", [marked])
      .build();

    absalomKo(game, "igaram");

    expect(trashIds(game)).toContain("igaram");
    expect(handIds(game)).toEqual(["drawn"]);
  });

  it("draws on the opponent's turn when an effect K.O.s its {Alabasta} Character", () => {
    // OP17-016 Rakuyo: K.O. up to 2 of the opponent's Characters with 2000
    // base power or less -- one target here, so Q1503's "at once" is not in
    // play.
    const game = defending("karoo-opp-turn-effect-ko")
      .withBoard("p1", [character("igaram", "OP18-002")])
      .withHand("p2", [instance("rakuyo", "OP17-016")])
      .withDeckTop("p1", [marked])
      .build();
    const handBefore = handIds(game);

    game.play({ type: "play-card", cardNumber: "OP17-016" });
    pick(game, "igaram");
    settle(game);

    expect(trashIds(game)).toContain("igaram");
    expect(handIds(game)).toEqual([...handBefore, "drawn"]);
  });

  it("does not draw when the opponent's {Alabasta} Character is K.O.'d", () => {
    const game = table("karoo-opp-alabasta-ko")
      .withBoard("p2", [character("their-igaram", "OP18-002")])
      .withHand("p1", [instance("rakuyo", "OP17-016")])
      .withDeckTop("p1", [marked])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-016" });
    pick(game, "their-igaram");
    settle(game);

    expect(trashIds(game, "p2")).toContain("their-igaram");
    expect(handIds(game)).toEqual([]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("drawn");
  });

  it("does not draw when a battle on its own turn K.O.s the opponent's {Alabasta} Character", () => {
    const game = table("karoo-opp-alabasta-battle")
      .withBoard("p1", [character("seacat", "OP18-003")])
      .withBoard("p2", [
        character("their-igaram", "OP18-002", { rested: true }),
      ])
      .withHand("p1", [])
      .withDeckTop("p1", [marked])
      .build();

    attack(game, "seacat", "their-igaram");
    passDefence(game);
    settle(game);

    expect(trashIds(game, "p2")).toContain("their-igaram");
    expect(handIds(game)).toEqual([]);
  });

  it("does not draw when its {Alabasta} Character is trashed rather than K.O.'d", () => {
    // OP09-009 Benn.Beckman trashes: a move to the trash that is not a K.O.
    const game = defending("karoo-trashed")
      .withBoard("p1", [character("igaram", "OP18-002")])
      .withHand("p2", [instance("beckman", "OP09-009")])
      .withDeckTop("p1", [marked])
      .build();
    const handBefore = handIds(game);

    game.play({ type: "play-card", cardNumber: "OP09-009" });
    pick(game, "igaram");
    settle(game);

    expect(trashIds(game)).toContain("igaram");
    expect(handIds(game)).toEqual(handBefore);
  });

  it("does not draw when its {Alabasta} Character is returned to hand", () => {
    // OP10-046 Kyros returns up to 1 Character with a cost of 5 or less.
    const game = table("karoo-bounced")
      .withBoard("p1", [character("igaram", "OP18-002")])
      .withHand("p1", [instance("kyros", "OP10-046")])
      .withDeckTop("p1", [marked])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-046" });
    pick(game, "igaram");
    settle(game);

    expect(handIds(game)).toEqual(["igaram"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("drawn");
  });

  it("draws nothing while the Leader's effects are negated", () => {
    const game = defending("karoo-draw-negated")
      .withBoard("p1", [character("igaram", "OP18-002", { rested: true })])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withDeckTop("p1", [marked])
      .withNegated("p1-leader")
      .build();
    const handBefore = handIds(game);

    attack(game, "attacker", "igaram");
    passDefence(game);
    settle(game);

    expect(trashIds(game)).toContain("igaram");
    expect(handIds(game)).toEqual(handBefore);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("drawn");
  });
});

describe("OP18-001 Karoo's K.O. draw: [Once Per Turn]", () => {
  covers("OP18-001", "static");

  it("is mandatory: the draw happens with no decision put to p1", () => {
    const game = defending("karoo-mandatory")
      .withBoard("p1", [character("igaram", "OP18-002", { rested: true })])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withDeckTop("p1", [marked])
      .build();

    attack(game, "attacker", "igaram");
    passDefence(game);

    expect(game.state.pendingEffect).toBeFalsy();
    expect(handIds(game)).toContain("drawn");
  });

  it("draws once on the opponent's turn, and again on its own next turn", () => {
    const game = defending("karoo-refresh")
      .withBoard("p1", [
        character("igaram", "OP18-002", { rested: true }),
        character("igaram-2", "OP18-002", { rested: true }),
        character("igaram-3", "OP18-002"),
      ])
      .withBoard("p2", [
        character("attacker", "ST31-002"),
        character("attacker-2", "ST31-002"),
      ])
      .withHand("p1", [instance("absalom", "OP06-081")])
      .withTrash("p1", [
        instance("trash-a", "FIX-001"),
        instance("trash-b", "FIX-001"),
      ])
      .build();

    attack(game, "attacker", "igaram");
    passDefence(game);
    settle(game);
    attack(game, "attacker-2", "igaram-2");
    passDefence(game);
    settle(game);
    expect(trashIds(game)).toEqual(
      expect.arrayContaining(["igaram", "igaram-2"]),
    );
    // One draw for two K.O.s on p2's turn.
    expect(game.state.players.p1.hand).toHaveLength(2);

    game.pass();
    expect(game.state.turnPlayerId).toBe("p1");
    // The Draw Phase card.
    expect(game.state.players.p1.hand).toHaveLength(3);
    const deckTop = game.state.players.p1.deck[0]!.instanceId;

    absalomKo(game, "igaram-3");

    expect(trashIds(game)).toContain("igaram-3");
    expect(handIds(game)).toContain(deckTop);
  });

  it("two K.O.s one after the other on its own turn draw once", () => {
    const game = table("karoo-own-turn-once")
      .withBoard("p1", [
        character("igaram", "OP18-002"),
        character("igaram-2", "OP18-002"),
      ])
      .withHand("p1", [
        instance("absalom", "OP06-081"),
        instance("absalom-2", "OP06-081"),
      ])
      .withTrash("p1", [
        instance("trash-a", "FIX-001"),
        instance("trash-b", "FIX-001"),
        instance("trash-c", "FIX-001"),
        instance("trash-d", "FIX-001"),
      ])
      .withDeckTop("p1", [marked, instance("drawn-2", "FIX-001")])
      .build();

    absalomKo(game, "igaram");
    expect(handIds(game)).toEqual(["absalom-2", "drawn"]);
    absalomKo(game, "igaram-2");
    expect(trashIds(game)).toEqual(
      expect.arrayContaining(["igaram", "igaram-2"]),
    );
    expect(handIds(game)).toEqual(["drawn"]);
  });
});
