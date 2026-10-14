/**
 * Format rules for choices that pick a card out of a set -- a search, a
 * hand cost, a play from several the turn can afford.
 *
 * One of the files `format-heuristics.ts` is the map of; see that file for what
 * lives where and why the split is by decision rather than by deck.
 */
import { heuristics, preferAmong } from "../heuristics.js";
import {
  decision,
  isOptionCardIn,
  isSearchResult,
  optionCard,
} from "../generic-policy.js";
import type { PolicyModule } from "../policy-module.js";
import type { LegalAction } from "@one-piece-sim/protocol";
import { worthInHand } from "./shared.js";

/**
 * `own-board-removal`'s sibling, one step earlier: when a symmetric bottoming
 * effect asks *whose board* before it asks *which card*, name the opponent's.
 *
 * OP17-046 Gloriosa prints the same side-less text `own-board-removal` in
 * `format/replacement.ts` is about --
 * "[printed text omitted -- pnpm card:text OP17-046]" -- but reaches it by a different road. It is written in the
 * mechanic DSL as a `choice` between two mirrored branches, `"self"` first and
 * `"opponent"` second (`mechanics/op17-on-play.ts`), so the pilot picks a side
 * before it ever sees a card. `chooseGenericRules` answers an effect it has no
 * rule for with the first non-skip option, which is declaration order, so
 * `"self"` wins unopposed.
 *
 * `own-board-removal` cannot reach it from either end. It reads
 * `effectKind === "bottom-deck-character"`, the engine effect OP06-058 and its
 * three siblings raise, and a node raised by the mechanic DSL reports
 * `"mechanic-choice"` instead -- so neither the branch nor the card options
 * inside it are visible to that veto. Vetoing the `"self"` branch would not fix
 * it either: the branch cap is "up to 1", so `skip` survives the veto and the
 * effect resolves for nothing. The right side has to be *chosen*, which is why
 * this decides rather than ranking.
 *
 * Registered for {@link EVERY_DECK} for the reason `own-board-removal` is: the
 * engine resolves the card's text the same way for whoever holds it. A
 * deck-scoped version would be narrower than the claim: OP17-XEBEC runs Gloriosa
 * as a Blocker and reaches the same fork, bottoming its own cost-3 Don Marlon
 * with a cost-4 Zoro standing on the other board.
 *
 * Card-keyed rather than shaped, because the shape does not yet generalise:
 * OP17-046 is the only card whose mechanic offers mirrored `"self"`/`"opponent"`
 * branches, and the branch ids are the mechanic's own names rather than a
 * protocol contract. A second such card should turn this into a rule about the
 * pair of branches; one card does not justify guessing what that rule is.
 *
 * Takes the opponent's branch whenever it is offered, with no check that it has
 * a target. It does not need one, and cannot cheaply have one: "up to 1" makes
 * a branch legal with nothing to select, so both sides are always on offer and
 * the emptiness only shows up one decision later. That is the right answer
 * anyway -- an opponent branch with no target resolves as `skip` and costs
 * nothing, where the self branch it would otherwise fall through to gives up a
 * body for the same nothing.
 *
 * Worth an unusual amount for one card on (Blue) Rocks.D.Xebec, the only
 * fixed deck that runs it: that deck plays Gloriosa as a Blocker and casts it
 * most games, so the mis-answered branch was eating a body nearly every time.
 */
export function createGloriosaBottomModule(): PolicyModule {
  return {
    id: "gloriosa-bottom-opponent",
    decide(context) {
      const modeActions = context.actions.filter(
        (action) =>
          action.type === "resolve-effect" &&
          action.sourceCardNumber === "OP17-046" &&
          action.option.kind === "mode",
      );
      const opponentBranch = modeActions.find(
        (action) =>
          action.type === "resolve-effect" &&
          action.option.kind === "mode" &&
          action.option.mode === "opponent",
      );
      if (!opponentBranch) return undefined;
      return decision(
        opponentBranch,
        "Gloriosa: bottom the opponent's Character, not your own, when both are legal.",
      );
    },
  };
}

/**
 * Among attacks, prefer removing a rested opposing Blocker or engine over a
 * marginal Leader hit.
 *
 * A deck ladder that says "pressure the opposing Leader with the smallest viable
 * attack" aims every attack at the Leader. Aiming the same attack at a *rested*
 * opposing Character instead either removes a future attacker or blocker
 * outright, or forces the defender to spend a Blocker plus Counter cards to save
 * it. The counter demand is the same as the Leader hit would have been; the
 * upside -- a permanent body gone, or a Blocker spent -- is extra.
 *
 * Four gates keep it honest:
 *
 *  - **The target must be rested.** An active Character is going to attack
 *    next turn anyway; removing it now is real but the same attack next turn
 *    costs the defender a Blocker then. A rested one has already committed to
 *    the board this turn and the removal is pure.
 *  - **The Leader must not be in lethal range.** When the Leader dies this
 *    turn, press it; removal is a detour. `lethalInRange` already encodes
 *    "enough power, no Blocker on board" -- but it reads false at 0 Life
 *    (its guard demands `> 0`), and a Leader at 0 Life dies to any hit this
 *    turn, so the gate tests the raw Life count for both.
 *  - **The K.O. must not pay the defender.** A Character whose printed
 *    `[On K.O.]` hands the opponent Life -- Hawkins' "[printed text omitted -- pnpm card:text <card>]" and Cavendish's "add 1 card to your Life"
 *    are both ST36 cards with exactly that text -- is not removal, it is a
 *    gift. The ST31-into-ST36 policy knows this by name; a format-wide rule
 *    has to read it off the card. Without this gate the rank hid the Leader
 *    attack and left the matchup policy with only the hazardous targets, which
 *    correctly passed instead of pressing.
 *
 *    Read off the isolated `[On K.O.]` clause, and Life is the only shape that
 *    counts -- a body-replacing `[On K.O.]` does not qualify. See
 *    `Tactics.koRefundsDefender`.
 *  - **The target must not already be held down.** A Character that will not
 *    stand up in the opponent's next Refresh Phase does not attack and does not
 *    block on the turn this rule is buying protection from, so the premium it
 *    pays -- an attack spent on a body instead of on Life -- buys nothing that
 *    is not already bought. Without it, a seat pays an `[Activate: Main]` to
 *    freeze a rested body and then spends its only attack K.O.ing the same body:
 *    two payments for one turn of denial, and the Life hit given up for it.
 *    Every deck that rests, locks or freezes an opposing body reaches that
 *    fork.
 *
 * Ranked, not vetoed, so the deck policy still chooses *which* removal attack
 * to lead with; this only narrows the target away from the Leader.
 *
 * ## Which body pays for the removal
 *
 * The gates above say *whether* to remove and *what* to remove; they say nothing
 * about *who* removes, and the answer is not "whoever the ladder offers first".
 * A Leader carrying [Double Attack] that takes the removal gives up a Leader hit
 * worth two Life, while a small body with no viable Leader attack of its own
 * could have made the same K.O. and otherwise sits out the turn. `prefer` hides
 * every candidate it does not score, so promoting the removals hides that press
 * rather than losing to it.
 *
 * So a [Double Attack] attacker is demoted out of the removal, but only where
 * the swap is *free*: it must have a Leader hit to forgo, and some attacker
 * without the keyword must be able to take the same removal. Where either fails
 * the choice is a genuine trade between one body and one Life, which is the
 * trade this rule already prefers -- so it is left alone. When the swap does
 * happen the press is not lost, only deferred: the substitute's K.O. clears the
 * target, the `.when` gate stops holding, and the Leader swings at the Leader
 * at the next decision.
 *
 * Contained by construction: (Red) Portgas.D.Ace is the one shipped list whose
 * Leader is handed [Double Attack], by four copies of one card, so the branch
 * is unreachable for every other deck in the field. Reproduce it with
 * `pnpm deck:benchmark run --deck "(Red) Portgas.D.Ace - OP17 Whitebeard
 * Pirates"`; the branch fires in about a fifth of that deck's games.
 */

/**
 * With a swing coming back, take a Blocker the DON!! can pay for.
 *
 * The shape that works on the search surface, where a card-shaped ranking does
 * not: a rule that scores by *size* (cost against the DON!! on the field) or
 * by *redundancy* (a copy already in hand) expresses an opinion at every
 * search regardless of the position, and a per-deck table beats it. This one
 * prefers a keyword, prefers defence over development, and is gated on the
 * opponent actually being able to attack.
 *
 * The decision it fixes is invisible to any card table. OP10-011 Tony
 * Tony.Chopper and OP12-015 Monkey.D.Luffy both cost 4, are both {Straw Hat
 * Crew}, and both answer OP01-016 Nami's search filter -- one of them has
 * `[Blocker]`. A 4000-power Blocker and a 6000-power body are the same card to
 * a cost ranking and a crew ranking alike; only one of them takes a swing off
 * the Leader.
 *
 * Two conjuncts, and both are load-bearing:
 *
 *  - **A swing has to be coming.** `incomingLeaderAttacks` is a real gate here,
 *    not the tautology "it counts the opposing Leader as 1" makes it look like:
 *    a Leader that attacked rests, and the Refresh Phase untaps only its own
 *    controller's cards (CR 6-2-3), so an opposing Leader that swung last turn
 *    is still rested for the whole of the turn after it, and the gate is shut for
 *    a substantial share of contested searches across the roster.
 *  - **The Blocker has to be castable**, `cost <= donOnField + 1`. A Blocker the
 *    deck cannot pay for is not a Blocker, and this is where most of the
 *    candidates go: on a deck with expensive Blockers it more than halves the
 *    searches this rule has an opinion about.
 *
 * Both signs are non-zero for the reason `rankAmong` demands it: the pass hides
 * only candidates the rule *scored*, so leaving a non-Blocker unscored would
 * read as "no opinion" and let it survive beside the Blocker.
 *
 * The ST-30 starter has enough of a search surface to read this on -- both of
 * its searches ask for a 6000-power Character, and two of the eight they can
 * return print [Blocker]; `registry.ts` says what a format-wide registration
 * on this surface has to contain.
 */
export function createSearchBlockerModule(): PolicyModule {
  return heuristics("search-blocker", [
    preferAmong(
      "An attack is coming, so take a Blocker the DON!! can pay for rather than a body that cannot defend.",
    )
      .when((t) => t.incomingLeaderAttacks > 0)
      .effect((action, t) => {
        if (!isSearchResult(action)) return false;
        const usable = (
          candidate: Extract<LegalAction, { type: "resolve-effect" }>,
        ): boolean => {
          const card = optionCard(candidate)?.card;
          const facts = card && t.facts(card.cardNumber);
          return (
            facts !== undefined &&
            facts.keywords.includes("Blocker") &&
            facts.cost <= t.donOnField + 1
          );
        };
        // Silent unless there is actually a Blocker to prefer. Scoring every
        // candidate -1 would reach the same decision on its own, and reads as an
        // opinion this rule does not hold -- which another module's narrowing
        // would then have to be defended against. See `keepOnePerType`.
        const offered = t.actions.filter(
          (
            candidate,
          ): candidate is Extract<LegalAction, { type: "resolve-effect" }> =>
            candidate.type === "resolve-effect" && isSearchResult(candidate),
        );
        if (!offered.some(usable)) return false;
        return usable(action) ? 1 : -1;
      }),
  ]);
}

/**
 * Which card in hand pays a cost that trashes one.
 *
 * `payFromHand` builds "you may trash N cards from your hand: <payoff>" for 92
 * cards in the pool, and the card that pays is a choice the engine raises on
 * its own. Nothing answered it. The options reach a policy as
 * `effectKind: "mechanic-choice"` with the summary "Choose <name>", so every
 * deck ladder and `chooseGenericRules` alike ended at "take the first non-skip
 * option" -- and first offered is hand order. On the Bonney list, whose census
 * puts `main:resolve-effect` at 16.02 decisions a game with 95.7% of them
 * answered by no rule at all, that is the largest unanswered surface the deck
 * has.
 *
 * Two terms, in the order they matter:
 *
 *  - **A [Counter] value is the resource being spent.** A card with a Counter
 *    number is Life the seat has not paid yet, and the hand is where both come
 *    from; a card with none defends nothing. This is the whole of the first
 *    term, and it is why the rule is a trade rather than a dominance argument:
 *    what a Counter card is worth against a body depends on whether the deck
 *    is racing or defending, so it is opt-in per deck rather than format-wide.
 *  - **Among cards that defend nothing, the cheapest.** A list with no ramp
 *    spends its opening finding the top end -- Bonney's own mulligan rule is
 *    written on exactly that -- so the expensive card is the payoff and the
 *    cheap one is the card most likely to be drawn again.
 *
 * Every candidate is scored, none at zero, because `rank-among` hides only the
 * candidates it scored: a rule that leaves one unscored leaves it in the
 * running for the generic ladder to take first-offered, which is the behaviour
 * this replaces.
 *
 * `currentCounter` rather than `counter`, on the protocol's own instruction:
 * three cards in the pool grant Counter to cards still in hand, and the
 * printed value reads 0 off a hand holding an answer.
 */
export function createHandCostChoiceModule(): PolicyModule {
  return heuristics("hand-cost-choice", [
    preferAmong(
      "Pay with the card that defends nothing, cheapest first.",
    ).effect((action, t) => {
      if (action.destination?.zone !== "trash") return false;
      if (action.destination.player !== "self") return false;
      if (!isOptionCardIn(action, "self", "hand")) return false;
      const option = optionCard(action);
      if (!option) return false;
      const held = t.observation.self.hand.find(
        (card) => card.instanceId === option.card.instanceId,
      );
      if (!held) return false;
      // Scaled so the Counter term cannot be outweighed by any cost: the
      // question "does this card defend" is settled before "which one is
      // the deck's payoff" is asked at all.
      const defends = held.currentCounter > 0 ? 0 : 10;
      return defends + (10 - Math.min(held.cost, 10)) / 10;
    }),
  ]);
}

/**
 * Which card in hand pays a trash cost, when the deck has named the order
 * itself.
 *
 * {@link createHandCostChoiceModule} answers the same decision from two
 * format-scope terms -- a printed Counter value, then cost -- and those terms
 * are a proxy. A card's Counter number says what it defends *as a Counter
 * card*, which is not the same as what it is worth in hand: a [Counter] Event
 * reads 0 there, because `currentCounter` is a Character's printed stat and an
 * Event has none. Both starters this is registered for are decks whose best
 * cards print no Counter at all, so the proxy inverts on them.
 *
 * This takes the order as data instead. Tier 0 is spent first and the last tier
 * is what the deck keeps; a card the list does not name sits in the middle
 * rather than at either end, so an unnamed card is neither the first thing
 * spent nor silently protected.
 *
 * Every candidate is scored, none at zero, for the reason the module above
 * gives: `rank-among` hides only what it scored, and an unscored candidate
 * stays in the running for the generic ladder to take first-offered, which is
 * hand order and the behaviour this replaces.
 *
 * Gated on the destination being the seat's own trash, so it speaks only where
 * a card is being *spent*. The same "choose a card in your hand" shape is
 * raised by clauses that move a card somewhere it is not lost -- ST29-007
 * Chopper puts one on top of its own Life -- and there the worst card in hand
 * is the wrong answer, not the right one.
 */
export function createHandCostOrderModule(
  slug: string,
  order: readonly (readonly string[])[],
): PolicyModule {
  const rank = new Map<string, number>();
  order.forEach((tier, index) => {
    for (const cardNumber of tier) rank.set(cardNumber, index);
  });
  const unnamed = order.length / 2;
  return heuristics(slug, [
    preferAmong(
      "Pay the trash cost with the card this deck can most afford to lose.",
    ).effect((action, t) => {
      if (action.destination?.zone !== "trash") return false;
      if (action.destination.player !== "self") return false;
      if (!isOptionCardIn(action, "self", "hand")) return false;
      const option = optionCard(action);
      if (!option) return false;
      const held = t.observation.self.hand.find(
        (card) => card.instanceId === option.card.instanceId,
      );
      if (!held) return false;
      // `preferAmong` takes the highest score and the action is "pay with this
      // card", so the tier a deck spends first has to score highest -- the
      // list is read in the order it is written and inverted here, not
      // written backwards.
      return order.length - (rank.get(option.card.cardNumber) ?? unnamed);
    }),
  ]);
}

/**
 * Two cards cost the same: play the one that is worth more, not the one that
 * sits earlier in the hand.
 *
 * `chooseGenericRules` ends its main phase at "develop the highest-cost legal
 * card", sorting the affordable plays by printed cost and taking the first.
 * `Array.prototype.sort` is stable, so among cards of *equal* cost the winner
 * is whichever the engine offered first -- and the engine offers the hand in
 * hand order. Every deck ladder that reaches the same line inherits it.
 *
 * Nothing about the two cards enters that comparison. A seat at 1 Life holding
 * EB04-058 Borsalino -- a cost-5 6000 [Blocker] whose `[On Play]` banks a card
 * onto Life "if you have 2 or less Life cards" -- beside ST29-010 Franky, a
 * cost-5 6000 with no text at all, plays the Franky whenever Franky is the
 * earlier card in hand.
 *
 * What it prices is the same thing {@link createBoardReplacementModule} prices
 * one step later -- {@link worthInHand}, power plus the credit a [Blocker]
 * earns -- so a card is not worth one thing when it is played and another when
 * it is given up. That shared number is the argument for the scope: the format
 * is already willing to veto a play outright on it, so using it to order two
 * plays of one cost asserts nothing new.
 *
 * It is not a dominance rule, and the difference matters for where it may be
 * registered. At equal cost it will take a 4000 [Blocker] over a 6000 vanilla,
 * which gives up 2000 of power -- an exchange rate, and one a racing deck may
 * price differently from a control deck. What keeps it at format scope is that
 * the rate is already the format's own, set once in
 * {@link BLOCKER_WORTH_IN_THOUSANDS} and read by every rule that compares a
 * body against a keyword; a deck that disagrees disagrees with those too, and
 * says so in its own ladder, which sorts after this one and wins.
 *
 * ## One cost band only
 *
 * The rule scores only the plays at the highest printed cost on offer, and is
 * silent about every cheaper one. That containment is the whole of its safety:
 * `rank-among` hides only the candidates it scored, so the cheaper plays stay
 * in the running and the ladder's own "highest cost wins" still decides which
 * band is developed. A rule that scored every affordable play would be a
 * different and much larger claim -- that a 6000 [Blocker] at five is worth
 * more than a 10000 at nine -- which is the deck's plan and not a fact about
 * the cards.
 *
 * Printed cost bands the plays, not `currentCost`, because printed cost is the
 * figure the line being refined sorts by; banding on a different number would
 * split a band the ladder treats as one.
 *
 * What {@link worthInHand} does not price is an `[On Play]`, so two cards of one
 * cost whose difference is a clause rather than a body are separated here by
 * power alone -- a 1-cost searcher against a 1-cost 2000 reads as the 2000. The
 * clause is worth what the deck's own plan says it is worth, which is why it is
 * absent from a format-scope number rather than guessed at; a deck with an
 * opinion states it in its own ladder, which sorts after this one and wins.
 */
export function createEqualCostPlayModule(): PolicyModule {
  return heuristics("equal-cost-play", [
    preferAmong(
      "At equal cost, develop the card that is worth more standing there.",
    ).action((action, t) => {
      if (action.type !== "play-card") return false;
      const plays = t.observation.legalActions.filter(
        (offer) => offer.type === "play-card",
      );
      if (plays.length < 2) return false;
      const held = (instanceId: string) =>
        t.hand.find((card) => card.instanceId === instanceId);
      const band = Math.max(
        ...plays.map((offer) => held(offer.cardInstanceId)?.cost ?? -1),
      );
      const card = held(action.cardInstanceId);
      if (!card || card.cost !== band) return false;
      // Never zero: `rank-among` drops a candidate it scored at nothing, which
      // would leave the band half-ranked and hand the rest back to offer order.
      return 1 + worthInHand(card);
    }),
  ]);
}
