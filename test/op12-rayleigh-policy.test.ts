import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Red) Silvers Rayleigh's rules: the two Events in hand the reveal clauses
 * need, the Counter Events held back, the closing press, the spare DON!! that
 * makes one more body connect, the searchers' pick, Boa Hancock's self-trash,
 * and the opening hand.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled.
 */

const RAYLEIGH = "(Red) Silvers Rayleigh - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP12-001";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

const table = (seed: string) =>
  scenario()
    .decks(RAYLEIGH, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withRestedLeader("p1");

const casts = (cardNumber: string) => (action: LegalAction) =>
  action.type === "activate-main" && action.sourceCardNumber === cardNumber;

const lifeOf = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    instance(`life-${index}`, "ST34-002"),
  );

describe("the Event reserve", () => {
  // OP12-017 is the one Haki Event the reserve still decides: OP12-018 has no
  // [Main], and the Counter-Event rule holds OP12-016 and OP12-019 longer.
  const holdingTwo = (seed: string, opponentLife: number) =>
    table(seed)
      .withDonDeck("p1", 9)
      .withLife("p2", lifeOf(opponentLife))
      .withHand("p1", [
        instance("observation", "OP12-017"),
        instance("supreme", "OP12-018"),
      ])
      .build();

  it("keeps the second Event in hand while the opponent has Life to spare", async () => {
    const game = holdingTwo("rayleigh-reserve", 4);

    expect(game.legalActions().some(casts("OP12-017"))).toBe(true);
    expect(casts("OP12-017")(await chosen(game))).toBe(false);
    expect(
      casts("OP12-017")(await chosen(game, ["op12-rayleigh-reserve"])),
    ).toBe(true);
  });

  it("casts it once the opponent is at 2 Life", async () => {
    const game = holdingTwo("rayleigh-reserve-close", 2);

    expect(casts("OP12-017")(await chosen(game))).toBe(true);
  });
});

describe("the Counter Events", () => {
  // Three Events, so the reserve would let one go: what holds it is the
  // Counter-Event rule alone.
  const holdingThree = (seed: string, opponentLife: number) =>
    table(seed)
      .withDonDeck("p1", 8)
      .withLife("p2", lifeOf(opponentLife))
      .withHand("p1", [
        instance("never-doubt", "OP12-016"),
        instance("arms", "OP12-019"),
        instance("supreme", "OP12-018"),
      ])
      .build();
  const castsEither = (action: LegalAction) =>
    casts("OP12-016")(action) || casts("OP12-019")(action);

  it("holds OP12-016 and OP12-019 for the Counter step at 2 Life", async () => {
    const game = holdingThree("rayleigh-counter-events", 2);

    expect(game.legalActions().some(castsEither)).toBe(true);
    expect(castsEither(await chosen(game))).toBe(false);
    expect(
      castsEither(await chosen(game, ["op12-rayleigh-counter-events"])),
    ).toBe(true);
  });

  it("casts them once the opponent is at 0 Life", async () => {
    const game = holdingThree("rayleigh-counter-events-0", 0);

    expect(castsEither(await chosen(game))).toBe(true);
  });
});

describe("the closing press", () => {
  // A rested cost-4 body is what `threat-removal` promotes over a Leader hit.
  const pressing = (seed: string, opponentLife: number) =>
    scenario()
      .decks(RAYLEIGH, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withDonDeck("p1", 10)
      .withLife("p2", lifeOf(opponentLife))
      .withBoard("p2", [
        character("cracker", "ST34-002", { playedTurn: 1, rested: true }),
      ])
      .build();
  const atLeader = (action: LegalAction) =>
    action.type === "attack" && action.targetInstanceId === "p2-leader";
  const atCracker = (action: LegalAction) =>
    action.type === "attack" && action.targetInstanceId === "cracker";

  it("sends Rayleigh at the Leader rather than the body at 2 Life", async () => {
    const game = pressing("rayleigh-press", 2);

    expect(atLeader(await chosen(game))).toBe(true);
    expect(atCracker(await chosen(game, ["op12-rayleigh-press"]))).toBe(true);
  });

  it("leaves the removal to `threat-removal` above closing Life", async () => {
    const game = pressing("rayleigh-press-early", 4);

    expect(atCracker(await chosen(game))).toBe(true);
  });
});

describe("the spare DON!!", () => {
  // Shakuyaku is 2000 under a 5000 Leader: the three DON!! carry her all the
  // way, and none of the three crosses a Counter step on its own.
  const spare = (seed: string, active: number) =>
    table(seed)
      .withDonDeck("p1", 10)
      .withDon("p1", { active })
      .withBoard("p1", [character("shakuyaku", "OP12-006", { playedTurn: 1 })])
      .build();
  const onShakuyaku = (action: LegalAction) =>
    action.type === "attach-don" && action.targetInstanceId === "shakuyaku";

  it("goes on the body it makes connect", async () => {
    const game = spare("rayleigh-reach", 3);

    expect(onShakuyaku(await chosen(game))).toBe(true);
    expect(onShakuyaku(await chosen(game, ["op12-rayleigh-reach"]))).toBe(
      false,
    );
  });

  it("is left to the ladder when it cannot cover the gap", async () => {
    const game = spare("rayleigh-reach-short", 2);

    expect((await chosen(game)).actionId).toBe(
      (await chosen(game, ["op12-rayleigh-reach"])).actionId,
    );
  });
});

describe("the searchers' pick", () => {
  const searching = (seed: string, hand: string[]) => {
    const game = table(seed)
      .withDonDeck("p1", 8)
      .withHand("p1", [
        instance("hancock", "OP12-014"),
        ...hand.map((cardNumber, index) => instance(`h${index}`, cardNumber)),
      ])
      .withDeckTop("p1", [
        instance("top-1", "ST34-003"),
        instance("luffy", "OP12-015"),
        instance("top-3", "ST34-003"),
        instance("supreme", "OP12-018"),
        instance("top-5", "ST34-003"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP12-014" });
    return game;
  };
  const takes = (instanceId: string) => (action: LegalAction) =>
    action.type === "resolve-effect" &&
    action.option.kind === "card" &&
    action.option.card.instanceId === instanceId;

  it("takes an Event while the hand is short of two", async () => {
    const game = searching("rayleigh-search-short", ["OP12-016"]);

    expect(takes("supreme")(await chosen(game))).toBe(true);
  });

  it("takes Luffy once it holds two", async () => {
    const game = searching("rayleigh-search-stocked", ["OP12-016", "OP12-019"]);

    expect(takes("luffy")(await chosen(game))).toBe(true);
  });
});

describe("Boa Hancock's self-trash", () => {
  const withHancock = (seed: string, rested: boolean) =>
    table(seed)
      .withDonDeck("p1", 10)
      .withDon("p1", { rested: 2 })
      .withBoard("p1", [
        character("hancock", "OP12-014", { playedTurn: 1, rested }),
      ])
      .build();

  it("is not taken while she can still attack", async () => {
    const game = withHancock("rayleigh-hancock", false);

    expect(game.legalActions().some(casts("OP12-014"))).toBe(true);
    expect(casts("OP12-014")(await chosen(game))).toBe(false);
    expect(
      casts("OP12-014")(await chosen(game, ["op12-rayleigh-hancock"])),
    ).toBe(true);
  });

  it("is left to the ladder once she has attacked", async () => {
    const game = withHancock("rayleigh-hancock-rested", true);

    expect(game.legalActions().some(casts("OP12-014"))).toBe(true);
    expect((await chosen(game)).actionId).toBe(
      (await chosen(game, ["op12-rayleigh-hancock"])).actionId,
    );
  });
});

describe("the opening hand", () => {
  it("keeps two Events or a searcher and ships a hand with neither", async () => {
    const hand = (cards: string[]) =>
      scenario()
        .decks(RAYLEIGH, OPPONENT)
        .seed("rayleigh-mulligan")
        .withHand(
          "p1",
          cards.map((cardNumber, index) => instance(`h${index}`, cardNumber)),
        )
        .build();
    const decisionOf = (action: LegalAction) =>
      action.type === "mulligan-decision" ? action.decision : action.type;

    const twoEvents = hand([
      "OP12-016",
      "OP12-018",
      "OP12-003",
      "OP12-004",
      "OP12-007",
    ]);
    const searcher = hand([
      "OP12-006",
      "OP12-016",
      "OP12-003",
      "OP12-004",
      "OP12-007",
    ]);
    const neither = hand([
      "OP12-016",
      "OP12-003",
      "OP12-004",
      "OP12-007",
      "OP12-009",
    ]);

    expect(decisionOf(await chosen(twoEvents))).toBe("keep");
    expect(decisionOf(await chosen(searcher))).toBe("keep");
    expect(decisionOf(await chosen(neither))).toBe("mulligan");
  });
});
