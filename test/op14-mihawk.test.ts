import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  reorderAction,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The off-set identities of the OP-14 Green Mihawk list, whose programs are in
 * `packages/engine-core/src/mechanics/op14-mihawk.ts`, plus OP12-037. The list
 * is no longer shipped -- its Leader, OP14-020, is banned from 12 Oct 2026 --
 * but the cards stay in the registry, so their clauses keep their tests.
 *
 * The positions are posed on the green OP-17 post-ban Zoro list with OP14-020
 * put back in p1's Leader slot: the Leader is what these positions were built
 * around, and `bareTable()` leaves nothing of the list but its Leader anyway.
 */

const DECK = "(Green) Roronoa Zoro - OP17 Post-Ban List";

/**
 * Decline the block and Counter steps of a declared attack, so the battle
 * resolves. Written as a loop because the engine skips a step the defender has
 * no options for, and taken as a parameter so a second attack in the same test
 * is not read against the phase the first one narrowed to.
 */
const declineDefence = (game: {
  state: { phase: string };
  pass: () => unknown;
}) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

/** p1 on the play with a clear board and all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
    .withLeader("p1", "OP14-020")
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p1 defending, for the two `[Counter]` halves. */
const defending = (seed: string) =>
  scenario()
    .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
    .withLeader("p1", "OP14-020")
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

const ATTACK = {
  attackerPlayerId: "p2",
  defenderPlayerId: "p1",
  attackerInstanceId: "attacker",
  targetInstanceId: "p1-leader",
  attackPower: 6000,
  counterPower: 0,
} as const;

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

describe("OP07-022 Otama", () => {
  covers("OP07-022", "[On Play]");

  it("reveals a green {Land of Wano} card that is not another Otama", () => {
    const game = table("op07-022-search")
      .withHand("p1", [instance("otama", "OP07-022")])
      .withDeckTop("p1", [
        instance("kinemon", "ST32-001"), // green {Land of Wano}
        instance("otama-2", "OP07-022"), // the printed "other than [Otama]"
        instance("kawamatsu", "OP12-023"), // green {Land of Wano}
        instance("perona", "OP14-033"), // green, but no {Land of Wano}
        instance("brook", "ST31-003"), // {Straw Hat Crew}, and red
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-022" });

    // The second Otama is filtered by name, the off-type and off-colour bodies
    // by the other two halves of the selector.
    expect(effectOptions(game.state)).toEqual(["kinemon", "kawamatsu", "done"]);
    game.play({ type: "resolve-effect", optionId: "kawamatsu" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "kawamatsu",
    );
    // "[printed text omitted -- pnpm card:text <card>]": the four that were not
    // taken leave the top and are at the bottom, in the order they were looked
    // at.
    expect(
      game.state.players.p1.deck.slice(-4).map((c) => c.instanceId),
    ).toEqual(["kinemon", "otama-2", "perona", "brook"]);
  });
});

describe("OP12-034 Perona", () => {
  covers("OP12-034", "[On Play]");

  const withFiveOnTop = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("perona", "OP12-034")])
      .withDeckTop("p1", [
        instance("mihawk", "ST32-003"), // <Slash> Character
        instance("brook", "ST31-003"), // <Slash>, and red -- the branch is colourblind
        instance("samurai", "OP01-055"), // green Event
        instance("perona-5", "OP14-033"), // green, but a Character
        instance("jinbe", "ST31-002"), // <Strike>, red
      ]);

  it("digs five for a <Slash> card or a green Event behind a <Slash> Leader", () => {
    const game = withFiveOnTop("op12-034-search").build();

    game.play({ type: "play-card", cardNumber: "OP12-034" });

    // Both halves of the disjunction, and neither of the two cards that satisfy
    // only part of one: OP14-033 is green but not an Event, ST31-002 is neither.
    expect(effectOptions(game.state)).toEqual([
      "mihawk",
      "brook",
      "samurai",
      "done",
    ]);
    game.play({ type: "resolve-effect", optionId: "samurai" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "samurai",
    );
  });

  it("does nothing at all behind a Leader without the <Slash> attribute", () => {
    // OP14-040 Jinbe is <Strike>, so the printed "[printed text omitted -- pnpm card:text OP14-040]" fails and the whole clause -- the look as well as the
    // reveal -- never happens.
    const game = withFiveOnTop("op12-034-gate")
      .withLeader("p1", "OP14-040")
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-034" });

    expect(game.state.pendingEffect).toBeNull();
    expect(effectOptions(game.state)).toEqual([]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("mihawk");
  });
});

describe("ST24-004 Law & Bepo", () => {
  covers("ST24-004", "[On Play]");

  it("rests a Character through the opponent's Refresh Phase and buys the Leader +2000", () => {
    const game = table("st24-004-lock")
      .withHand("p1", [instance("lawbepo", "ST24-004")])
      .withBoard("p2", [
        character("awake", "ST31-002"),
        character("napping", "ST31-003", { rested: true }),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST24-004" });

    // An already-rested body is on the offer too (Bandai's ST24-004#1).
    expect(effectOptions(game.state)).toEqual(["awake", "napping", "done"]);
    game.play({ type: "resolve-effect", optionId: "awake" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    const rested = game.state.players.p2.board.filter((card) => card.rested);
    expect(rested.map((card) => card.instanceId).sort()).toEqual([
      "awake",
      "napping",
    ]);
    // Two rested Characters across the table, so the "Then" clause fires. p2's
    // Leader is <Strike>, so OP14-020's own static +1000 is not in this number.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);

    // "[printed text omitted -- pnpm card:text OP14-020]": p2's
    // refresh sets `napping` back up and leaves the locked body down.
    game.pass();
    const afterRefresh = new Map(
      game.state.players.p2.board.map((card) => [card.instanceId, card.rested]),
    );
    expect(afterRefresh.get("awake")).toBe(true);
    expect(afterRefresh.get("napping")).toBe(false);
  });

  it("leaves the Leader alone when the rest is the only rested Character", () => {
    const game = table("st24-004-one")
      .withHand("p1", [instance("lawbepo", "ST24-004")])
      .withBoard("p2", [character("awake", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST24-004" });
    game.play({ type: "resolve-effect", optionId: "awake" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
    // One rested Character is under the printed 2, so no buff.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });
});

describe("OP01-055 You Can Be My Samurai!!", () => {
  covers("OP01-055", "[Main]");

  it("rests two of its own Characters to draw two", () => {
    const game = table("op01-055-draw")
      .withHand("p1", [instance("samurai", "OP01-055")])
      // Two vanilla bodies, so the draw is the only thing the rest sets off.
      .withBoard("p1", [
        character("kawamatsu", "OP12-023"),
        character("kawamatsu-2", "OP12-023"),
      ])
      .withDeckTop("p1", copies(2, "ST32-005", "draw"))
      .build();

    game.play({ summary: "You Can Be My Samurai" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "kawamatsu" });
    game.play({ type: "resolve-effect", optionId: "kawamatsu-2" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.board.every((card) => card.rested)).toBe(true);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["draw-1", "draw-2"]),
    );
  });

  it("cannot pay its cost with one Character on the board", () => {
    const game = table("op01-055-unpayable")
      .withHand("p1", [instance("samurai", "OP01-055")])
      .withBoard("p1", [character("kawamatsu", "OP12-023")])
      .withDeckTop("p1", copies(2, "ST32-005", "draw"))
      .build();

    game.play({ summary: "You Can Be My Samurai" });

    // The cost names two Characters, so a board of one cannot pay it and the
    // "You may" resolves to nothing rather than handing over the draw for free.
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    expect(game.state.players.p1.board[0]?.rested).toBe(false);
    expect(
      game.state.players.p1.hand.map((card) => card.instanceId),
    ).not.toContain("draw-1");
  });

  // `open-optcg-trace(18).jsonl`, turn 2: Mihawk cast it into a board of one,
  // spending a DON!! and the card on nothing. The offer has to say so, because
  // that flag is what both the rules agent's inert-activation veto and the
  // learned scorer read.
  const offerOf = (game: ReturnType<ReturnType<typeof table>["build"]>) =>
    getLegalActions(game.state, "p1").find(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP01-055",
    );

  it("is offered as selecting nothing when the board cannot pay", () => {
    const game = table("op01-055-inert")
      .withHand("p1", [instance("samurai", "OP01-055")])
      .withBoard("p1", [character("kawamatsu", "OP12-023")])
      .build();
    expect(offerOf(game)).toMatchObject({ selectsNothing: true });
  });

  it("is offered without the flag once two Characters can pay", () => {
    const game = table("op01-055-payable")
      .withHand("p1", [instance("samurai", "OP01-055")])
      .withBoard("p1", [
        character("kawamatsu", "OP12-023"),
        character("kawamatsu-2", "OP12-023"),
      ])
      .build();
    const offer = offerOf(game);
    expect(offer).toBeDefined();
    expect(offer).not.toHaveProperty("selectsNothing");
  });
});

describe("OP06-038 The Billion-fold World Trichiliocosm", () => {
  covers("OP06-038", "[Counter]", "[Trigger]");

  /**
   * `restedDon` is what is rested *before* the Event is played. Playing it rests
   * one more to pay its printed cost of 1, and that DON!! is a rested card like
   * any other -- so seven here is eight by the time the clause is read.
   */
  const underAttack = (seed: string, restedDon: number) =>
    defending(seed)
      .withHand("p1", [instance("event", "OP06-038")])
      .withDon("p1", { rested: restedDon })
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withActiveAttack(ATTACK, "counter")
      .build();

  it("adds +2000, and +4000 once eight of its cards are rested", () => {
    // Rested DON!! in the cost area are rested cards -- the reading Bandai's own
    // Refresh Phase rule gives the phrase. Seven, plus the one this Event rests
    // to pay for itself, is the printed eight.
    const game = underAttack("op06-038-eight", 7);

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("adds only +2000 one card short of the threshold", () => {
    const game = underAttack("op06-038-seven", 6);

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.activeAttack?.counterPower).toBe(2000);
  });

  it("K.O.s a rested cost-3-or-less Character off a Life card", () => {
    const game = table("op06-038-trigger")
      .withLife("p1", [
        instance("trigger", "OP06-038"),
        instance("life-spare", "ST32-005"),
      ])
      .withBoard("p2", [
        character("attacker", "ST31-002"), // cost 5, 6000 -- connects
        character("brook", "ST31-003"), // cost 2, 3000 -- does not
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    // Brook attacks first purely to rest itself. A board set up rested would
    // have been stood back up by p2's own Refresh Phase on the way into this
    // turn, so the rested body has to be rested *during* it.
    game.play({
      type: "attack",
      attackerInstanceId: "brook",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);

    game.play({ type: "resolve-trigger", optionId: "activate" });
    // The attacker is rested too, but it costs 5 -- over the printed ceiling.
    expect(effectOptions(game.state)).toEqual(["brook", "done"]);
    game.play({ type: "resolve-effect", optionId: "brook" });

    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("brook");
  });
});

describe("OP07-022 Otama's bottom ordering", () => {
  covers("OP07-022", "[On Play]");

  /** Five on top, one of them the only legal add, so four leftovers remain. */
  const orderScenario = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("otama", "OP07-022")])
      .withDeckTop("p1", [
        instance("kinemon", "ST32-001"), // the only legal add
        instance("perona", "OP14-033"),
        instance("brook", "ST31-003"),
        instance("jinbe", "ST31-002"),
        instance("luffy", "ST31-001"),
      ])
      .build();

  it("asks for the whole order in one action", () => {
    const game = orderScenario("op07-022-order");

    game.play({ type: "play-card", cardNumber: "OP07-022" });
    game.play({ type: "resolve-effect", optionId: "kinemon" });

    // Four leftovers, four identities, so the order is a real decision -- and
    // it is one decision, not four. The single option offered is the order the
    // look revealed them in, and it names all four cards.
    const offer = game.action({ type: "resolve-effect" });
    expect(effectOptions(game.state)).toEqual(["order:0,1,2,3"]);
    expect(offer.summary).toBe(
      "Place Perona, Brook, Jinbe, Sanji at the bottom of your deck, in that order",
    );

    // A caller with a preference rewrites the offer's index list; that is the
    // whole of "in any order", and it is still one action.
    game.submit(reorderAction(offer, [2, 3, 0, 1]));
    expect(game.state.pendingEffect).toBeNull();
    expect(
      game.state.players.p1.deck.slice(-4).map((card) => card.instanceId),
    ).toEqual(["jinbe", "luffy", "perona", "brook"]);
  });

  it("takes the offered order as it stands", () => {
    const game = orderScenario("op07-022-offered-order");

    game.play({ type: "play-card", cardNumber: "OP07-022" });
    game.play({ type: "resolve-effect", optionId: "kinemon" });
    // A seat with no plan for the bottom of its deck plays the offer, and the
    // cards keep the order they were looked at in.
    game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.deck.slice(-4).map((card) => card.instanceId),
    ).toEqual(["perona", "brook", "jinbe", "luffy"]);
  });

  it("refuses an order that is not a permutation of the offer", () => {
    const game = orderScenario("op07-022-bad-order");

    game.play({ type: "play-card", cardNumber: "OP07-022" });
    game.play({ type: "resolve-effect", optionId: "kinemon" });
    const offer = game.action({ type: "resolve-effect" });

    // A repeated index would place one card twice and lose another, so it
    // matches no offer at all rather than being applied.
    const head = offer.actionId.slice(0, offer.actionId.lastIndexOf(":") + 1);
    expect(() => game.submit({ ...offer, actionId: `${head}0,0,1,2` })).toThrow(
      /not currently legal/,
    );
    expect(() => reorderAction(offer, [0, 0, 1, 2])).toThrow(/INVALID_ORDER/);
  });

  it("places identical leftovers without asking", () => {
    const game = table("op07-022-identical")
      .withHand("p1", [instance("otama", "OP07-022")])
      .withDeckTop("p1", [
        instance("kinemon", "ST32-001"),
        instance("brook-a", "ST31-003"),
        instance("brook-b", "ST31-003"),
        instance("brook-c", "ST31-003"),
        instance("brook-d", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-022" });
    game.play({ type: "resolve-effect", optionId: "kinemon" });

    // Every order produces the same deck, so there is nothing to decide and the
    // engine does not spend a prompt on it.
    expect(game.state.pendingEffect).toBeNull();
    expect(
      game.state.players.p1.deck.slice(-4).map((card) => card.instanceId),
    ).toEqual(["brook-a", "brook-b", "brook-c", "brook-d"]);
  });
});

describe("OP06-033 Vander Decken IX", () => {
  covers("OP06-033", "[On Play]");

  /** A rested body to shoot, and a {Fish-Man} in hand to pay for the shot. */
  const withPrey = (seed: string) =>
    table(seed)
      .withHand("p1", [
        instance("decken", "OP06-033"),
        instance("kawamatsu", "OP12-023"), // {Fish-Man}, the printed cost
        instance("kinemon", "ST32-001"), // {Land of Wano}, and not payable
      ])
      .withBoard("p2", [
        character("napping", "ST31-003", { rested: true }),
        character("awake", "ST31-002"),
      ]);

  it("trashes a {Fish-Man} from hand to K.O. a rested Character", () => {
    const game = withPrey("op06-033-ko").build();

    game.play({ type: "play-card", cardNumber: "OP06-033" });

    // The optional cost comes first, and only the {Fish-Man} can pay it -- the
    // {Land of Wano} body in the same hand is not on the offer.
    expect(effectOptions(game.state)).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(effectOptions(game.state)).toEqual(["kawamatsu"]);
    game.play({ type: "resolve-effect", optionId: "kawamatsu" });

    // "Rested" is on the target, so the active body is not a legal K.O.
    expect(effectOptions(game.state)).toEqual(["napping", "done"]);
    game.play({ type: "resolve-effect", optionId: "napping" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("kawamatsu");
    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("napping");
  });

  it("keeps the {Fish-Man} when the cost is declined", () => {
    const game = withPrey("op06-033-decline").build();

    game.play({ type: "play-card", cardNumber: "OP06-033" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "kawamatsu",
    );
    expect(game.state.players.p2.trash).toHaveLength(0);
  });

  it("is not offered the cost at all with no {Fish-Man} to pay it", () => {
    const game = table("op06-033-unpayable")
      .withHand("p1", [
        instance("decken", "OP06-033"),
        instance("kinemon", "ST32-001"),
      ])
      .withBoard("p2", [character("napping", "ST31-003", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-033" });

    // The `if` gate means no decision is offered rather than an "apply" that
    // then finds nothing to trash.
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board).toHaveLength(1);
  });

  it("is not offered the cost at all with no rested Character to shoot", () => {
    const game = table("op06-033-no-prey")
      .withHand("p1", [
        instance("decken", "OP06-033"),
        instance("kawamatsu", "OP12-023"),
      ])
      .withBoard("p2", [character("awake", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-033" });

    // "Up to 1" lets the K.O. resolve for zero, so the cost half of the gate
    // alone would charge a {Fish-Man} for a clause that cannot touch anything.
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "kawamatsu",
    );
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP06-035 Hody Jones", () => {
  covers("OP06-035", "[Rush]", "[On Play]");

  /** Two standing bodies across the table, and a Life pile to pull from. */
  const withTargets = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("hody", "OP06-035")])
      .withLife("p1", [
        instance("life-top", "ST32-005"),
        instance("life-under", "OP06-038"),
      ])
      .withBoard("p2", [
        character("awake", "ST31-002"),
        character("second", "ST31-004"),
      ]);

  it("spends its two rests across a Character and a DON!!, then pulls a Life card", () => {
    const game = withTargets("op06-035-mixed").build();

    game.play({ type: "play-card", cardNumber: "OP06-035" });

    // One printed budget over two pools: both standing bodies and the single
    // opaque "don" option are on the same offer, because DON!! are
    // interchangeable and which one rests is not a decision.
    expect(effectOptions(game.state)).toEqual([
      "awake",
      "second",
      "don",
      "skip",
    ]);
    game.play({ type: "resolve-effect", optionId: "awake" });
    // The body just rested is off the second offer; the DON!! option is not,
    // because the opponent still has active DON!! to rest.
    expect(effectOptions(game.state)).toEqual(["second", "don", "skip"]);

    const activeDonBefore = game.state.players.p2.activeDon.length;
    game.play({ type: "resolve-effect", optionId: "don" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p2.activeDon).toHaveLength(activeDonBefore - 1);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "awake")
        ?.rested,
    ).toBe(true);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "second")
        ?.rested,
    ).toBe(false);
    // "[printed text omitted -- pnpm card:text <card>]" -- the
    // top card, and mandatory.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life-top",
    );
    expect(game.state.players.p1.life).toHaveLength(1);
  });

  it("takes the Life card even when the rests are declined", () => {
    const game = withTargets("op06-035-skip").build();

    game.play({ type: "play-card", cardNumber: "OP06-035" });
    // "Skip" ends the whole "up to a total of 2", not one rest of it.
    game.play({ type: "resolve-effect", optionId: "skip" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p2.board.every((card) => !card.rested)).toBe(
      true,
    );
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life-top",
    );
  });

  it("still pulls the Life card with nothing across the table to rest", () => {
    const game = table("op06-035-empty")
      .withHand("p1", [instance("hody", "OP06-035")])
      .withLife("p1", [
        instance("life-top", "ST32-005"),
        instance("life-under", "OP06-038"),
      ])
      .withDon("p2", { rested: 10 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-035" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    // Neither pool has anything in it, so the node falls through rather than
    // stopping -- which is what keeps the printed "Then, ..." running.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life-top",
    );
  });

  it("attacks on the turn it is played", () => {
    const game = withTargets("op06-035-rush").build();

    game.play({ type: "play-card", cardNumber: "OP06-035" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.action({
        type: "attack",
        attackerInstanceId: "hody",
        targetInstanceId: "p2-leader",
      }),
    ).toBeDefined();
  });
});

describe("OP08-036 Electrical Luna", () => {
  covers("OP08-036", "[Main]", "[Trigger]");

  it("holds every rested cost-7-or-less Character through the Refresh Phase", () => {
    const game = table("op08-036-main")
      .withHand("p1", [instance("luna", "OP08-036")])
      .withBoard("p2", [
        character("napping", "ST31-003", { rested: true }), // cost 2
        character("dozing", "ST31-002", { rested: true }), // cost 5
        character("awake", "ST31-004"), // not rested, so untouched
      ])
      .build();

    game.play({ summary: "Electrical Luna" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    // "All", not "up to": no decision is offered for which bodies are locked.
    game.pass();
    const afterRefresh = new Map(
      game.state.players.p2.board.map((card) => [card.instanceId, card.rested]),
    );
    expect(afterRefresh.get("napping")).toBe(true);
    expect(afterRefresh.get("dozing")).toBe(true);
    expect(afterRefresh.get("awake")).toBe(false);
  });

  it("locks nothing when the board across the table is standing", () => {
    const game = table("op08-036-empty")
      .withHand("p1", [instance("luna", "OP08-036")])
      .withBoard("p2", [character("awake", "ST31-002")])
      .build();

    game.play({ summary: "Electrical Luna" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    game.pass();
    expect(game.state.players.p2.board[0]?.rested).toBe(false);
  });

  it("rests one Character off a Life card, with no cost ceiling", () => {
    const game = table("op08-036-trigger")
      .withLife("p1", [
        instance("trigger", "OP08-036"),
        instance("life-spare", "ST32-005"),
      ])
      .withBoard("p2", [
        character("attacker", "ST31-002"),
        character("bystander", "ST31-004"), // cost 8 -- over the [Main] ceiling
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);

    game.play({ type: "resolve-trigger", optionId: "activate" });
    // The attacker rested itself to attack, so `canRest` leaves only the body
    // that stayed home -- and the Trigger has no cost ceiling, so the cost-8
    // Character the [Main] half could never reach is a legal target here.
    expect(effectOptions(game.state)).toEqual(["bystander", "done"]);
    game.play({ type: "resolve-effect", optionId: "bystander" });

    expect(
      game.state.players.p2.board.find(
        (card) => card.instanceId === "bystander",
      )?.rested,
    ).toBe(true);
  });
});

describe("OP12-037 Demon Aura Nine Sword Style Asura", () => {
  covers("OP12-037", "[Main]", "[Counter]");

  it("rests three DON!! to rest an opposing Character and a DON!!", () => {
    const game = table("op12-037-main")
      .withHand("p1", [instance("asura", "OP12-037")])
      .withBoard("p2", [character("awake", "ST31-002")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-event:asura" });
    game.play({ type: "resolve-effect", optionId: "awake" });
    game.play(
      (action) =>
        action.type === "resolve-effect" && action.optionId !== "done",
    );
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
    expect(game.state.players.p2.restedDon).toHaveLength(1);
    // "[printed text omitted -- pnpm card:text <card>]" is the cost, on top of the 1 it costs
    // to play.
    expect(game.state.players.p1.restedDon.length).toBeGreaterThanOrEqual(3);
  });

  it("gives the Leader +3000 as a Counter", () => {
    const game = defending("op12-037-counter")
      .withHand("p1", [instance("asura", "OP12-037")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "asura" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });

  // The power is printed for the Leader alone and the clause does nothing
  // else, so it is worth nothing while a Character is the card being attacked.
  it("is not offered as a Counter while a Character is the target", () => {
    const game = defending("op12-037-counter-character")
      .withHand("p1", [instance("asura", "OP12-037")])
      .withBoard("p1", [character("body", "OP14-022")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withActiveAttack({ ...ATTACK, targetInstanceId: "body" }, "counter")
      .build();

    expect(
      game
        .legalActions()
        .find((action) => action.type === "activate-counter-event"),
    ).toBeUndefined();
  });
});
