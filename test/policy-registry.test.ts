import { describe, expect, it } from "vitest";
import { GameService } from "@one-piece-sim/engine-core";
import type { GameObservation } from "@one-piece-sim/protocol";
import {
  LEADERS,
  St32RulesAgent,
  St34RulesAgent,
  policiesForDeck,
  registeredDecks,
} from "@one-piece-sim/agents/local";

import { resolveDeck } from "@one-piece-sim/decks";

describe("policy registry", () => {
  it("registers a module set for every format deck", () => {
    for (const leader of Object.values(LEADERS)) {
      expect(registeredDecks()).toContain(leader);
      expect(policiesForDeck(leader).length).toBeGreaterThan(0);
    }
  });

  it("orders matchup modules ahead of the whole-deck module", () => {
    expect(policiesForDeck(LEADERS.ST31).map((module) => module.id)).toEqual([
      // Format fundamentals come first; they only contribute `rank`/`veto`, so
      // ordering against the deck's `decide` module is immaterial.
      "don-reservation",
      "lethal-close#do-not-pass",
      "counter-event-reserve",
      "no-hopeless-attack",
      "inert-activation",
      "dead-ramp",
      // Its sibling one card up the DON!! deck: with one or two left the next
      // DON!! Phase draws them anyway.
      "capped-ramp",
      "dead-trigger",
      "trigger-debuff-target",
      // Its Main-phase sibling, ST31-scoped while it is measured.
      "main-debuff-target",
      "dead-buff-trigger",
      "inert-trigger",
      "dead-ramp-trigger",
      "stage-replacement",
      "threat-removal",
      "counter-budget",
      // No battle exists before turn 3, so a DON!! given to the Leader in the
      // opening is +1000 power nothing reads.
      "dead-opening-play",
      "pre-combat-attachment",
      // A DON!! given to a Character that cannot win a battle this turn expires
      // unused; the veto keeps it active, where a [Counter] Event can spend it.
      "dead-attachment",
      "rested-don-gift",
      "dead-gift-activation",
      // Below `threat-removal`, whose promotion it narrows: the veto is
      // collected first so the rank chooses among the bodies still worth
      // taking.
      "ko-payoff-target",
      "dead-keyword-grant",
      // The one fundamental that `decide`s, so it sorts last in the band: it
      // overrides "block or pass", which `rank`/`veto` cannot reach.
      "free-block",
      // Removing your own board with a symmetric removal effect. Last in the
      // band; a veto is collected from every applicable module rather than
      // raced, so its position is presentational.
      "own-board-removal",
      // The Character area limit, in two halves: what a full board costs a play,
      // and which body to give up once the play is made.
      "board-replacement-cost",
      "area-replacement-choice",
      "search-blocker",
      "replacement-tempo",
      // The keyword the power judgement cannot see, directly below it.
      "replacement-blocker",
      // Found by auditing recorded matches of one matchup under three pilots;
      // see `test/format-attack-block-don.test.ts` and the modules themselves.
      // Below the rest of the band because each narrows or overrides a choice
      // the band above has already settled.
      "counter-over-dying-block",
      "equal-cost-play",
      "aura-attachment",
      "attack-order",
      "clause-swing",
      // The bottom of the band: one card's mode choice, decided rather than
      // ranked, and contested by nothing above it.
      "gloriosa-bottom-opponent",
      // The archetype strategy layer, one module per named rule so each can be
      // A/B'd on its own. ST31 pilots `red-aggro-luffy-st31`, which carries
      // parameter overrides only, so it contributes no rule of its own -- its two
      // ancestors' rules are what run, retuned by its parameters.
      "strategy:aggro#press-leader",
      "strategy:aggro#counter-budget",
      "strategy:aggro#board-width",
      "strategy:aggro#don-threshold",
      "strategy:aggro#keep-attacking",
      "strategy:aggro#stabilise",
      "strategy:red-aggro#prefer-rush",
      "strategy:red-aggro#press-unless-lost",
      "strategy:red-aggro#no-late-development",
      // The opening hand, lifted out of the ladder below into `mulligan.ts`.
      // One band above the deck policies, because it is the decision every one
      // of those ladders used to answer in its own first branch.
      "st31-mulligan",
      "st31",
    ]);
  });

  it("orders the format fundamentals and strategy layers ahead of the deck module", () => {
    expect(policiesForDeck(LEADERS.ST32).map((module) => module.id)).toEqual([
      "don-reservation",
      "lethal-close#do-not-pass",
      "counter-event-reserve",
      "no-hopeless-attack",
      "inert-activation",
      "dead-ramp",
      // Its sibling one card up the DON!! deck: with one or two left the next
      // DON!! Phase draws them anyway.
      "capped-ramp",
      "dead-trigger",
      "trigger-debuff-target",
      "dead-buff-trigger",
      "inert-trigger",
      "dead-ramp-trigger",
      "stage-replacement",
      "threat-removal",
      "counter-budget",
      "dead-opening-play",
      "pre-combat-attachment",
      "dead-attachment",
      "rested-don-gift",
      "dead-gift-activation",
      "ko-payoff-target",
      "dead-keyword-grant",
      "free-block",
      "own-board-removal",
      "board-replacement-cost",
      "area-replacement-choice",
      "search-blocker",
      "replacement-tempo",
      // The keyword the power judgement cannot see, directly below it.
      "replacement-blocker",
      "counter-over-dying-block",
      "equal-cost-play",
      "aura-attachment",
      // Registered here and inert at runtime: `attack-order` excludes this
      // Leader, whose own policy decides attacks and does it better.
      // Registration is data and does not know that, so the
      // list holds the module and `applies` is what turns it off.
      "attack-order",
      "clause-swing",
      "gloriosa-bottom-opponent",
      "strategy:aggro#press-leader",
      "strategy:aggro#counter-budget",
      "strategy:aggro#board-width",
      "strategy:aggro#don-threshold",
      "strategy:aggro#keep-attacking",
      "strategy:aggro#stabilise",
      "strategy:red-aggro#prefer-rush",
      "strategy:red-aggro#press-unless-lost",
      "strategy:red-aggro#no-late-development",
      "strategy:red-aggro-zoro-st32#no-development-in-kill-range",
      "strategy:red-aggro-zoro-st32#earn-the-restand",
      "st32-mulligan",
      "st32",
      // The play ordering, one module per named claim, so `--disable
      // st32#ryuma-target` prices one of them. The `st32` ladder above still
      // decides; these only narrow which play it reaches for, and `rank` is
      // collected from every module rather than raced, so sitting after it in
      // this list costs nothing. See #170.
      "st32#develop-by-value",
      "st32#ryuma-target",
      "st32#tashigi-target",
      "st32#mihawk-follow-up",
      "st32#perona-refund",
    ]);
  });

  it("builds a fresh module per agent so per-game state cannot leak", () => {
    // ST32's policy used to close over a Map of Leader DON!! attachments, and
    // sharing one instance across agents silently changed 26% of benchmark
    // games. It reads `leader.attachedDon` now, but the factory contract is what
    // stops the next stateful policy from reintroducing that bug.
    const [first] = policiesForDeck(LEADERS.ST32);
    const [second] = policiesForDeck(LEADERS.ST32);
    expect(first).toBeDefined();
    expect(first).not.toBe(second);
  });

  it("produces identical play for a repeated game with fresh agents", async () => {
    const play = async (): Promise<GameObservation> => {
      const service = new GameService();
      let observation = service.create({
        p1: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
        p2: resolveDeck("(Purple) Charlotte Katakuri - Starter Deck 34"),
        seed: "registry-isolation",
        startingPlayer: "p1",
      });
      const agents = { p1: new St32RulesAgent(), p2: new St34RulesAgent() };
      let actions = 0;
      while (observation.phase !== "finished" && actions < 800) {
        const chosen =
          await agents[observation.activePlayer].chooseAction(observation);
        observation = service.act(
          observation.gameId,
          observation.revision,
          chosen.actionId,
        );
        actions += 1;
      }
      return observation;
    };

    const first = await play();
    const second = await play();
    expect(second.stateHash).toBe(first.stateHash);
    expect(second.turn).toBe(first.turn);
  });
});
