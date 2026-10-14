import { describe, expect, it } from "vitest";
import {
  createSearchBlockerModule,
  policyContext,
  tactics,
} from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";

import { character, instance, scenario } from "./support/index.js";

/**
 * `search-blocker`: with an attack coming, take a Blocker the DON!! can pay for.
 *
 * The position isolates the claim as tightly as the card pool allows. OP10-011
 * Tony Tony.Chopper and OP12-015 Monkey.D.Luffy both cost 4, are both {Straw
 * Hat Crew}, and both answer OP01-016 Nami's search filter -- so what separates
 * them for a cost or crew ranking is only that Chopper has `[Blocker]`, and
 * this rule is the reason to tell them apart.
 */

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;

const DECK = "(Red/Green) Luffy & Ace - Starter Deck 30";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

/** OP10-011 is the [Blocker]; OP12-015 is a 4-cost twin without one. */
const DECK_TOP = [
  instance("blocker", "OP10-011"),
  instance("body", "OP12-015"),
  instance("sunny", "ST31-005"),
];

/**
 * Nami's `[On Play]` search resolved with `don` DON!! on the field, and with
 * the opposing side either able to swing next turn or not.
 *
 * `threat: false` rests the opposing Leader and leaves its board empty, which is
 * the position where the gate closes -- and it is a position real games reach
 * constantly, not a contrivance: a Leader that attacked rests, and Refresh
 * untaps only its *own* controller's cards, so an opposing Leader that swung
 * last turn is still rested throughout the turn after it. That is why
 * `incomingLeaderAttacks` is a real gate here and not the tautology the
 * "counts the opposing Leader as 1" reading suggests.
 */
function search({ don, threat }: { don: number; threat: boolean }) {
  const game = scenario()
    .decks(DECK, OPPONENT)
    .seed("search-blocker")
    .atTurn(9, { active: "p1" })
    .bareTable()
    .withHand("p1", [instance("searcher", "OP01-016")])
    .withDeckTop("p1", DECK_TOP)
    .withBoard(
      "p2",
      threat ? [character("threat", "ST34-002", { playedTurn: 1 })] : [],
    )
    .withState((state) => {
      if (!threat) state.players.p2.leaderRested = true;
    })
    // `bareTable()` puts all ten DON!! on the field; this returns the rest.
    .withDonDeck("p1", 10 - don)
    .build();
  game.play({ type: "play-card", cardInstanceId: "searcher" });
  const observation = observe(game.state, "p1");
  return {
    observation,
    actions: observation.legalActions.filter(
      (action): action is EffectAction => action.type === "resolve-effect",
    ),
  };
}

function scores(
  observation: GameObservation,
  actions: readonly EffectAction[],
) {
  const module = createSearchBlockerModule();
  const context = policyContext(observation);
  const byCard = new Map<string, number | undefined>();
  for (const action of actions) {
    const contribution = module.rankAmong?.(context, action);
    byCard.set(
      action.option.kind === "card" ? action.option.card.instanceId : "skip",
      typeof contribution === "number" ? contribution : contribution?.score,
    );
  }
  return byCard;
}

describe("search-blocker", () => {
  it("takes the Blocker over a same-cost non-Blocker", () => {
    const { observation, actions } = search({ don: 6, threat: true });
    expect(tactics(observation).incomingLeaderAttacks).toBeGreaterThan(0);
    const score = scores(observation, actions);

    expect(score.get("blocker")!).toBeGreaterThan(score.get("body")!);
    expect(score.get("blocker")!).toBeGreaterThan(score.get("sunny")!);
  });

  it("scores the non-Blockers rather than passing over them", () => {
    const { observation, actions } = search({ don: 6, threat: true });
    const score = scores(observation, actions);

    // `rankAmong` hides only candidates the rule scored. A non-Blocker left
    // unscored would read as "no opinion" and survive beside the Blocker, so
    // the negative sign is what makes the preference bite.
    expect(score.get("body")!).toBeLessThan(0);
    expect(score.get("sunny")!).toBeLessThan(0);
  });

  it("says nothing with no swing coming back", () => {
    // Opposing Leader rested and its board empty: nothing can attack next turn,
    // so which body to take is a development question and this rule has no
    // opinion about those. The gate is load-bearing -- across the sixteen
    // selectable decks it is shut at between 4% and 56% of contested searches.
    const { observation, actions } = search({ don: 6, threat: false });
    expect(tactics(observation).incomingLeaderAttacks).toBe(0);
    const score = scores(observation, actions);

    expect(score.get("blocker")).toBeUndefined();
    expect(score.get("body")).toBeUndefined();
  });

  it("says nothing about a Blocker the DON!! cannot pay for", () => {
    // Two DON!! on the field, so the cost-4 Blocker is out of reach this turn
    // and next. A Blocker that cannot be cast is not a Blocker, which is why
    // castability is part of the gate rather than a refinement of it -- and with
    // no castable Blocker on offer the rule is silent rather than scoring every
    // candidate alike. Silence matters: a module that scores a whole action type
    // equally still counts as having an opinion to `applyRanking`, and would
    // undo a deck search table's narrowing on the strength of it.
    const { observation, actions } = search({ don: 2, threat: true });
    expect(tactics(observation).incomingLeaderAttacks).toBeGreaterThan(0);
    const score = scores(observation, actions);

    expect(score.get("blocker")).toBeUndefined();
    expect(score.get("body")).toBeUndefined();
  });

  it("says nothing about declining the search", () => {
    const { observation, actions } = search({ don: 6, threat: true });
    const score = scores(observation, actions);

    expect(score.get("skip")).toBeUndefined();
  });
});
