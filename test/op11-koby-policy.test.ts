import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, copies, instance, scenario } from "./support/index.js";

/**
 * (Red/Black) Koby's rules: the opening hand, which body Hibari's right to
 * attack active Characters goes to, which card pays a hand cost, where
 * Kujyaku's +1000 lands, and when Aramaki is worth trashing.
 *
 * Each judgement is pinned twice where the default differs -- once as the
 * decision the seat makes, and once with the rule disabled -- so the test
 * states what the generic ladder would have done as well as what the rule does.
 */

const KOBY = "(Red/Black) Koby - 2nd Place Indonesia Regional Final";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP11-001";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

const decisionOf = (action: LegalAction) =>
  action.type === "mulligan-decision" ? action.decision : action.type;

/** The instance a `resolve-effect` option names, or the action type. */
const pickOf = (action: LegalAction) =>
  action.type === "resolve-effect" && action.option.kind === "card"
    ? action.option.card.instanceId
    : action.type === "resolve-effect"
      ? action.optionId
      : action.type;

/** Applies an optional cost's "you may" when the engine asks for it. */
function accept(game: Game): void {
  const apply = game
    .legalActions()
    .find(
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );
  if (apply) game.submit(apply);
}

/** Ten DON!! on p1's turn, with a deck to draw from. */
const table = (seed: string) =>
  scenario()
    .decks(KOBY, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withDeckTop("p1", copies(5, "OP11-096", "deck"));

/** The four cards both hands share: none of them is an opener. */
const SUPPORT = [
  instance("helmeppo-6", "OP11-092"),
  instance("smoker", "EB04-003"),
  instance("edge", "OP11-097"),
  instance("ripper", "OP11-096"),
];

describe("the opening hand", () => {
  it("keeps a hand with Hibari, a {SWORD} body that attacks the turn it lands", async () => {
    const game = scenario()
      .decks(KOBY, OPPONENT)
      .seed("koby-mulligan-keep")
      .withHand("p1", [instance("hibari", "EB03-008"), ...SUPPORT])
      .build();

    expect(decisionOf(await chosen(game))).toBe("keep");
  });

  it("keeps a hand whose only opener is the 1-cost searcher", async () => {
    const game = scenario()
      .decks(KOBY, OPPONENT)
      .seed("koby-mulligan-search")
      .withHand("p1", [instance("kujyaku", "OP11-004"), ...SUPPORT])
      .build();

    expect(decisionOf(await chosen(game))).toBe("keep");
  });

  it("ships support pieces and top end with no early body", async () => {
    const game = scenario()
      .decks(KOBY, OPPONENT)
      .seed("koby-mulligan-ship")
      .withHand("p1", [instance("aramaki", "OP11-082"), ...SUPPORT])
      .build();

    expect(decisionOf(await chosen(game))).toBe("mulligan");
    expect(decisionOf(await chosen(game, ["op11-koby-mulligan"]))).not.toBe(
      "mulligan",
    );
  });
});

describe("Hibari's right to attack active Characters", () => {
  it("goes to the Character still to attack, not to the Leader", async () => {
    const game = table("koby-grant")
      .withBoard("p1", [character("koby-6", "EB04-044")])
      .withHand("p1", [instance("hibari", "EB03-008")])
      .build();
    game.play({ type: "play-card", cardNumber: "EB03-008" });

    expect(pickOf(await chosen(game))).toBe("koby-6");
    expect(pickOf(await chosen(game, ["op11-koby#grant-target"]))).toBe(
      "p1-leader",
    );
  });

  it("passes over a Character that has already attacked", async () => {
    const game = table("koby-grant-spent")
      .withBoard("p1", [character("koby-6", "EB04-044", { rested: true })])
      .withHand("p1", [instance("hibari", "EB03-008")])
      .build();
    game.play({ type: "play-card", cardNumber: "EB03-008" });

    // Hibari herself has [Rush: Character] from the Leader, so she is the
    // body whose attack is still to come.
    expect(pickOf(await chosen(game))).toBe(
      game.state.players.p1.board.find((card) => card.cardNumber === "EB03-008")
        ?.instanceId,
    );
  });
});

describe("which card pays a hand cost", () => {
  it("trashes Ripper to EB03-041 Kujyaku's draw, not Hibari", async () => {
    const game = table("koby-discard")
      .withHand("p1", [
        instance("kujyaku", "EB03-041"),
        instance("hibari", "EB03-008"),
        instance("ripper", "OP11-096"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "EB03-041" });
    accept(game);

    expect(pickOf(await chosen(game))).toBe("ripper");
    expect(pickOf(await chosen(game, ["op11-koby#discard-order"]))).toBe(
      "hibari",
    );
  });
});

describe("Kujyaku's +1000", () => {
  it("lands on the Character still to attack", async () => {
    const game = table("koby-boost")
      .withBoard("p1", [
        character("ripper", "OP11-096", { rested: true }),
        character("kujyaku", "OP11-004"),
        character("koby-6", "EB04-044"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "kujyaku" });
    accept(game);

    expect(pickOf(await chosen(game))).toBe("koby-6");
    expect(pickOf(await chosen(game, ["op11-koby#boost-target"]))).toBe(
      "ripper",
    );
  });
});

describe("Aramaki", () => {
  const aramakiActivation = (action: LegalAction) =>
    action.type === "activate-main" && action.sourceCardNumber === "OP11-082";

  it("stays on the board when nothing else is left to attack", async () => {
    const game = table("koby-aramaki-idle")
      .withRestedLeader("p1")
      .withBoard("p1", [
        character("aramaki", "OP11-082"),
        character("koby-6", "EB04-044", { rested: true }),
      ])
      .build();

    expect(aramakiActivation(await chosen(game))).toBe(false);
    expect(
      aramakiActivation(await chosen(game, ["op11-koby#aramaki-gate"])),
    ).toBe(true);
  });

  it("is trashed while another Character still has its attack", async () => {
    const game = table("koby-aramaki-live")
      .withRestedLeader("p1")
      .withBoard("p1", [
        character("aramaki", "OP11-082"),
        character("koby-6", "EB04-044"),
      ])
      .build();

    expect(aramakiActivation(await chosen(game))).toBe(true);
  });
});

describe("the Counter step", () => {
  /** p2's Character swinging at one of p1's, with Life to spare. */
  const atBody = (
    seed: string,
    target: ReturnType<typeof character>,
    attackPower: number,
  ) =>
    scenario()
      .decks(KOBY, OPPONENT)
      .seed(seed)
      .atTurn(10, { active: "p2" })
      .withLife("p1", copies(4, "OP11-096", "life"))
      .withHand("p1", [instance("aramaki", "OP11-082")])
      .withBoard("p1", [target])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: target.instanceId,
          attackPower,
          counterPower: 0,
        },
        "counter",
      )
      .build();

  it("spends a 2000 Counter to keep EB03-041 Kujyaku", async () => {
    // 6000 printed, 8000 on the opponent's turn under its own aura.
    const game = atBody(
      "koby-counter",
      character("kujyaku", "EB03-041"),
      9_000,
    );

    expect((await chosen(game)).type).toBe("counter");
    expect((await chosen(game, ["op11-koby-counter"])).type).toBe("pass");
  });

  it("lets it go when saving it takes more than 2000", async () => {
    const game = atBody(
      "koby-counter-big",
      character("kujyaku", "EB03-041"),
      11_000,
    );

    expect((await chosen(game)).type).toBe("pass");
  });

  it("spends Ripper rather than Doll on a hit at the Leader", async () => {
    const game = scenario()
      .decks(KOBY, OPPONENT)
      .seed("koby-counter-keep-doll")
      .atTurn(10, { active: "p2" })
      .withLife("p1", [instance("life", "OP11-096")])
      .withHand("p1", [
        instance("doll", "OP11-008"),
        instance("ripper", "OP11-096"),
      ])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "p2-leader",
          targetInstanceId: "p1-leader",
          attackPower: 5_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    const counterOf = (action: LegalAction) =>
      action.type === "counter" ? action.cardInstanceId : action.type;
    expect(counterOf(await chosen(game))).toBe("ripper");
    expect(counterOf(await chosen(game, ["op11-koby-counter"]))).toBe("doll");
  });
});
