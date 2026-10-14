import { describe, expect, it } from "vitest";
import { currentPower, observe } from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The two scopes a printed clause carries, checked across the decks that print
 * them: *whose turn* it is live on, and *how many copies* of it get a use.
 *
 * Both were inconsistent between cards that print the same words. A
 * `[Opponent's Turn]` prefix governs every clause after it, but ST31-003 Brook
 * applied the prefix to its power half and not to its keyword half. `[Once Per
 * Turn]` is per copy -- two Frankys each activate once -- and while the engine
 * keys most of them per instance (`:activate-main`, `:on-opponent-attack`,
 * `:leader-watcher`, `:redirect`), OP11-012 Franky and OP10-036 Perona were keyed
 * per *card number*, so the four copies their decks run shared a single use.
 *
 * Neither belongs to one card, which is why these live together rather than in
 * `st31.test.ts` and `st32.test.ts`: the assertion is that cards printing the
 * same clause resolve it the same way.
 */

describe("[Opponent's Turn] governs every clause it prefixes", () => {
  covers("ST31-003", "[Opponent's Turn]");

  /** ST31-003 Brook, with the 3 given DON!! its condition asks for. */
  const brook = (turn: number, active: "p1" | "p2") =>
    scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed(`brook-${active}-turn`)
      .atTurn(turn, { active })
      .bareTable()
      .withBoard("p1", [character("brook", "ST31-003")])
      .withGivenDon("p1", "p1-leader", 3)
      .build();

  it("gives Brook [Blocker] and +3000 while its controller is defending", () => {
    const game = brook(4, "p2");

    const seen = observe(game.state, "p1").self.board[0];
    expect(seen?.blocker).toBe(true);
    expect(currentPower(game.state, "p1", "brook")).toBe(6000);
  });

  it("withholds both halves on its controller's own turn", () => {
    const game = brook(5, "p1");

    // The printed prefix is one condition over "[printed text omitted -- pnpm card:text <card>]", so the keyword goes away exactly when the power does. Blocking
    // only happens on the opponent's turn, so the keyword half changes no line
    // of play by itself -- but `observe` publishes `blocker` per board card, and
    // a Brook that reads as a Blocker on its own turn is a fact no agent on
    // either side of the table should be shown.
    const seen = observe(game.state, "p1").self.board[0];
    expect(seen?.blocker).toBe(false);
    expect(currentPower(game.state, "p1", "brook")).toBe(3000);
  });

  it("withholds both halves below 3 given DON!!, defending or not", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("brook-two-don")
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("brook", "ST31-003")])
      .withGivenDon("p1", "p1-leader", 2)
      .build();

    expect(observe(game.state, "p1").self.board[0]?.blocker).toBe(false);
    expect(currentPower(game.state, "p1", "brook")).toBe(3000);
  });
});

describe("[Once Per Turn] is per copy, not per card number", () => {
  covers("OP11-012", "[Your Turn]");

  /**
   * p1 attacking with a body p2 can answer, `frankys` copies of OP11-012 beside
   * it, and two `[Counter]` Events in p2's hand to spend.
   *
   * Franky watches for "[printed text omitted -- pnpm card:text OP11-012]", so the position needs
   * two of them in one turn: with one Franky the second Event adds nothing, and
   * with two the second Franky takes it.
   */
  const table = (frankys: number) =>
    scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed(`franky-${frankys}`)
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [
        character("attacker", "OP11-003"),
        ...Array.from({ length: frankys }, (_, index) =>
          character(`franky-${index}`, "OP11-012"),
        ),
      ])
      .withHand("p2", [
        instance("kick-1", "OP04-016"),
        instance("kick-2", "OP04-016"),
        instance("fodder-1", "OP11-003"),
        instance("fodder-2", "OP11-009"),
      ])
      .withLife("p2", [instance("p2-life", "OP01-016")])
      .build();

  /**
   * Declines the block, then spends both `[Counter]` Events.
   *
   * The pass is the [Blocker] window: an attack opens in `block` phase, and the
   * `[Counter]` step p2's Events belong to is the one after it. Each Event names
   * the card it trashes to pay, because taking the first option offered would
   * spend the other Event as the first one's cost.
   */
  const counterTwice = (game: ReturnType<typeof table>) => {
    game.pass();
    for (const [event, fodder] of [
      ["kick-1", "fodder-1"],
      ["kick-2", "fodder-2"],
    ]) {
      game.play({ type: "activate-counter-event", eventInstanceId: event });
      game.play({ type: "resolve-effect", optionId: fodder });
      while (game.state.pendingEffect) {
        game.play({ type: "resolve-effect" });
      }
    }
  };

  it("gives one Franky +2000 once across two opposing Events", () => {
    const game = table(1);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    counterTwice(game);

    // 6000 printed + 2000 from the single activation. The second Event finds the
    // only Franky already used.
    expect(currentPower(game.state, "p1", "attacker")).toBe(8000);
  });

  it("gives two Frankys +2000 each, one per copy", () => {
    const game = table(2);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    counterTwice(game);

    // Keyed by card number this was 8000: the second copy read the first copy's
    // use as its own and declined.
    expect(currentPower(game.state, "p1", "attacker")).toBe(10_000);
    // "all of your Characters", so both Frankys took their own buffs too.
    expect(currentPower(game.state, "p1", "franky-0")).toBe(8000);
    expect(currentPower(game.state, "p1", "franky-1")).toBe(8000);
  });
});

describe("OP10-036 refunds once per copy", () => {
  covers("OP10-036", "[Your Turn]");

  /**
   * ST32 playing ST32-004 Rayleigh, whose `[On Play]` rests two cost-2-or-less
   * bodies across the table, with `peronas` copies of OP10-036 already down.
   *
   * One card resting two Characters is the cleanest form of the question: the
   * rest resolution calls the refund once per Character, so the only thing
   * limiting the payout is how many copies still have their use.
   */
  const resting = (peronas: number) =>
    scenario()
      .decks(
        "(Green) Roronoa Zoro - Starter Deck 32",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed(`perona-${peronas}`)
      .atTurn(7, { active: "p1" })
      .bareTable()
      .withBoard(
        "p1",
        Array.from({ length: peronas }, (_, index) =>
          character(`perona-${index}`, "OP10-036"),
        ),
      )
      .withHand("p1", [instance("rayleigh", "ST32-004")])
      .withBoard("p2", [
        character("brook", "ST31-003"),
        character("luffy", "ST23-004"),
      ])
      .withDon("p1", { rested: 3 })
      .build();

  /** Active DON!! left after Rayleigh's cost and any refunds. */
  const activeAfterRayleigh = (peronas: number): number => {
    const game = resting(peronas);
    game.play({ type: "play-card", cardNumber: "ST32-004" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    expect(
      game.state.players.p2.board.filter((card) => card.rested),
    ).toHaveLength(2);
    return game.state.players.p1.activeDon.length;
  };

  it("refunds nothing with no Perona on the field", () => {
    // 7 active, 4 spent on Rayleigh.
    expect(activeAfterRayleigh(0)).toBe(3);
  });

  it("refunds one DON!! for one Perona", () => {
    expect(activeAfterRayleigh(1)).toBe(4);
  });

  it("refunds one DON!! per Perona, not one for the pair", () => {
    // Keyed by card number this was 4: the second copy read the first's use as
    // its own, and the second rested Character paid nothing.
    expect(activeAfterRayleigh(2)).toBe(5);
  });
});

describe("OP12-040's draw reads the type of the card that trashed", () => {
  covers("OP12-040", "static");

  /**
   * ST33's Kuzan Leader behind a `[Counter]` Event that pays by trashing a card
   * from hand.
   *
   * `navy-discard` is the generic trash-from-hand-as-a-cost step rather than a
   * {Navy}-only one, so the Leader's condition has to be read off the source
   * card. OP12-057 is the {Navy} Event ST33 actually runs; OP13-076 is a cost-0
   * Event with the same shape and no {Navy} type, which is what separates
   * "trashed by any effect" from the printed "[printed text omitted -- pnpm card:text OP13-076]".
   */
  const countering = (event: string) =>
    scenario()
      .decks(
        "(Blue) Kuzan - Starter Deck 33",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed(`kuzan-${event}`)
      .atTurn(6, { active: "p2" })
      .bareTable()
      .withBoard("p2", [character("attacker", "OP11-003")])
      .withHand("p1", [
        instance("event", event),
        instance("fodder", "OP12-045"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP12-052")])
      .withLife("p1", [instance("p1-life", "OP12-050")])
      .build();

  it("draws for a {Navy} Event", () => {
    const game = countering("OP12-057");
    game.play({ type: "attack", attackerInstanceId: "attacker" });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
  });

  it("does not draw for an Event outside the {Navy} type", () => {
    const game = countering("OP13-076");
    game.play({ type: "attack", attackerInstanceId: "attacker" });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    // The card was trashed from hand and the Leader's clause still asks whose
    // effect did it. `resolveDrawTrash` already read the source's types; this
    // path did not, so the same clause answered differently by route.
    expect(
      game.state.players.p1.hand.map((card) => card.instanceId),
    ).not.toContain("drawn");
  });
});
