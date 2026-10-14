import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * OP-16 Blue/Yellow Nami's rules, posed as boards.
 *
 * One test per judgement `OP16_NAMI_RULES` makes, so a later change that
 * quietly reverses one shows up here rather than only in the benchmark.
 *
 * The opponent is ST34 Katakuri throughout. The registry holds no
 * `opponent:`-scoped module for any pairing, so the deck policy is what answers,
 * and a Character's card number on the opposing board is independent of that
 * deck's list because the engine resolves card text globally.
 *
 * `bareTable()` puts all ten DON!! on the field, so a position with a specific
 * DON!! count says so with `withDonDeck`, which moves the rest back.
 */

const NAMI_LEADER = "OP11-041";
const NAMI_DECK = "(Blue/Yellow) Nami - Official Feature Deck";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

/** OP14-102 Kumacy: cost 1, 2000, 2000 Counter, {Thriller Bark Pirates}. */
const KUMACY = "OP14-102";
/** OP14-111 Perona: cost 4, 5000, {Thriller Bark Pirates}. */
const PERONA = "OP14-111";
/** OP14-110 Dr. Hogback: cost 4, 5000, {Thriller Bark Pirates}. */
const HOGBACK = "OP14-110";
/** OP14-104 Gecko Moria: cost 8, 10000, plays or banks a Thriller Bark body. */
const GECKO_MORIA = "OP14-104";

const agent = () => new RegistryRulesAgent(NAMI_LEADER);

describe("Gecko Moria's branch", () => {
  it("banks the target in Life when the Character area is already full", async () => {
    // Moria asks for its branch before it asks for a card, so the branch fell to
    // whatever answered first -- always "play from your trash". On a full board
    // that play trashes one of this deck's own bodies to make room; the other
    // branch adds a Life card, which is the currency the deck accumulates, and
    // leaves a known [Trigger] on top of it.
    //
    // Reached by playing Moria, so the position is one the engine produced:
    // four bodies plus Moria fills the Character area, and the [On Play] then
    // asks for its branch with no room for what it would play.
    const game = scenario()
      .decks(NAMI_DECK, OPPONENT)
      .seed("op16-nami-moria-life")
      .bareTable()
      .atTurn(11, { active: "p1" })
      .withLife("p1", copies(2, KUMACY, "p1-life"))
      .withLife("p2", copies(4, "ST34-002", "p2-life"))
      .withBoard("p1", [
        character("body-1", PERONA),
        character("body-2", HOGBACK),
        character("body-3", PERONA),
        character("body-4", HOGBACK),
      ])
      .withBoard("p2", [])
      .withHand("p1", [instance("moria", GECKO_MORIA)])
      .withTrash("p1", [instance("seed", KUMACY)])
      .build();

    game.play({ type: "play-card", cardNumber: GECKO_MORIA });

    const modes = game
      .legalActions("p1")
      .filter(
        (action) =>
          action.type === "resolve-effect" && action.option.kind === "mode",
      );
    expect(modes.length).toBeGreaterThan(1);

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      sourceCardNumber: GECKO_MORIA,
      option: { kind: "mode", mode: "life" },
    });
  });
});
