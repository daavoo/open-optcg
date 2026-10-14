/**
 * (Blue/Purple) Vinsmoke Reiju's policy, behind the OP06-042 Leader.
 *
 * ## The engine, in one paragraph
 *
 * The Leader draws a card the first time each turn a DON!! card returns to the
 * DON!! deck, so a DON!! −1 paid once a turn is a card. The small {GERMA 66}
 * siblings -- OP06-068 Reiju, OP06-064 Niji, OP06-060 Ichiji -- pay exactly
 * that and trash themselves to play their bigger namesake from hand *or
 * trash*: OP06-069 Reiju (draw 2), OP06-065 Niji (K.O. a cost-2 or bounce a
 * cost-4) and OP06-061 Ichiji (−2000 and [Rush]). Those [On Play]s, and
 * OP06-063 Sora's and OP07-066 Chopper's, only work while the field holds no
 * more DON!! than the opponent's, and at the start of every turn the field is
 * one ahead -- each player's DON!! Phase adds two, and the opponent's last one
 * came before this one -- so the turn's first DON!! −1 is also what switches
 * the payoffs on. OP07-072 Porche and OP06-062 Judge pay DON!! −1 as well.
 * OP08-074 Black Maria adds five rested DON!! and squares the counts at the
 * end of the turn, which draws off the Leader but puts the field five ahead in
 * the meantime. Because a namesake is played from the trash as readily as
 * from hand, the Kingdom of GERMA Stage, Sora and Judge, which all trash cards
 * from hand, turn a namesake in hand into card selection for free.
 */
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  isOptionCardIn,
  isSearchResult,
  optionCard,
} from "../generic-policy.js";
import { never, preferAmong, WEIGHT, type Heuristic } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";
import type { Tactics } from "../tactics.js";

/**
 * The cards a first turn wants: the three small siblings that pay DON!! −1 into
 * their bigger namesake (OP06-068 Reiju at 2, OP06-064 Niji at 3, OP06-060
 * Ichiji at 4), and the two cheap {GERMA} searchers that find them (OP10-063
 * Sanji at 1 and the OP06-079 Kingdom of GERMA Stage). A sibling on the field
 * is the Leader's draw switched on; without one the deck has nothing to
 * return a DON!! with until a 3-cost Porche or Black Maria lands.
 */
const OPENERS = new Set([
  "OP06-068",
  "OP06-064",
  "OP06-060",
  "OP10-063",
  "OP06-079",
]);

export function createOp06ReijuMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op06-reiju-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a small {GERMA 66} sibling, or a cheap {GERMA} searcher that finds one: the sibling's DON!! −1 is what turns the Leader's draw on.",
    mulliganBecause:
      "Mulligan a hand with no small {GERMA 66} sibling and no cheap searcher: nothing in it returns a DON!! for the Leader to draw off.",
  });
}

const BLACK_MARIA = "OP08-074";
const PORCHE = "OP07-072";
const JUDGE = "OP06-062";
const STAGE = "OP06-079";
const SORA = "OP06-063";
const BIG_NIJI = "OP06-065";

/** The small siblings whose `[Activate: Main]` pays DON!! −1 into a namesake. */
const SIBLINGS = new Set(["OP06-060", "OP06-064", "OP06-068"]);

/**
 * The cards whose `[On Play]` reads "if the number of DON!! cards on your field
 * is equal to or less than the number on your opponent's field": the three
 * namesakes, Sora and Chopper. Played from one ahead, each is a body and
 * nothing more.
 */
const PARITY_PAYOFFS = new Set([
  "OP06-061",
  BIG_NIJI,
  "OP06-069",
  SORA,
  "OP07-066",
]);

/**
 * What each card in the list is worth trashing from hand, highest first, for
 * the three clauses that ask for one: the Stage's, Sora's and Judge's.
 *
 * The namesakes go first because trashing one does not lose it: the matching
 * sibling plays it from the trash exactly as it would from hand, and OP06-061
 * Ichiji costs seven and prints no Counter, so in hand it is the card the deck
 * is least able to use. OP11-045 Niji is a vanilla the Niji sibling also reaches
 * in the trash. The siblings are the cards that do the reaching, and Judge is
 * the late game, so both are kept.
 */
const DISCARD_ORDER: Readonly<Record<string, number>> = {
  "OP06-061": 6,
  [BIG_NIJI]: 5,
  "OP11-045": 5,
  "OP06-069": 4,
  "OP06-078": 2,
  "OP06-047": 2,
  [SORA]: 1,
  "OP07-066": 1,
  [BLACK_MARIA]: 1,
  [PORCHE]: 1,
  "OP10-063": 1,
  "OP11-047": 1,
  "OP06-068": -1,
  "OP06-064": -1,
  "OP06-060": -1,
  [JUDGE]: -2,
};

/** Each small sibling, and the namesakes its swap can play. */
const NAMESAKES: Readonly<Record<string, readonly string[]>> = {
  "OP06-060": ["OP06-061"],
  "OP06-064": [BIG_NIJI, "OP11-045"],
  "OP06-068": ["OP06-069"],
};

/**
 * Whether adding `cardNumber` to hand completes a sibling pair that is half
 * there: a namesake for a sibling on the field or in hand with no namesake in
 * hand or trash, or a sibling for a namesake in hand or trash with no sibling
 * to play it.
 */
function completesPair(
  cardNumber: string,
  observation: GameObservation,
): boolean {
  const self = observation.self;
  const held = (numbers: readonly string[]) =>
    [...self.board, ...self.hand].some((card) =>
      numbers.includes(card.cardNumber),
    );
  const reachable = (numbers: readonly string[]) =>
    [...self.hand, ...self.trash].some((card) =>
      numbers.includes(card.cardNumber),
    );
  for (const [sibling, namesakes] of Object.entries(NAMESAKES)) {
    if (namesakes.includes(cardNumber)) {
      return held([sibling]) && !reachable(namesakes);
    }
    if (cardNumber === sibling) {
      return reachable(namesakes) && !held([sibling]);
    }
  }
  return false;
}

/** Each namesake with an [On Play], and the sibling that plays it. */
const SIBLING_OF: Readonly<Record<string, string>> = {
  "OP06-061": "OP06-060",
  [BIG_NIJI]: "OP06-064",
  "OP06-069": "OP06-068",
};

/** Whether a copy of `sibling` is on the field or in hand. */
function siblingHeld(observation: GameObservation, sibling: string): boolean {
  return [...observation.self.board, ...observation.self.hand].some(
    (card) => card.cardNumber === sibling,
  );
}

/** The clauses whose cost is a card from hand. */
const HAND_COST_SOURCES = new Set([STAGE, SORA, JUDGE]);

function discardScore(cardNumber: string, observation: GameObservation) {
  // Only one Stage is on the field at a time, so a second in hand once one is
  // down is the cheapest card in the list to lose.
  if (cardNumber === STAGE) return observation.self.stage ? 6 : -1;
  return DISCARD_ORDER[cardNumber] ?? 1;
}

/** Whether `action` is offered and does something when taken. */
function live(action: LegalAction): boolean {
  return !(action.type === "activate-main" && action.selectsNothing === true);
}

/**
 * Whether the turn can still pay a DON!! −1 and then afford `cost` -- the
 * condition under which a parity payoff is worth waiting one action for.
 *
 * A DON!! −1 returns a rested DON!! when there is one, which is why the active
 * pool only shrinks when none is rested. Porche costs three first and then
 * returns one of the three it rested.
 */
function returnPrecedes(t: Tactics, cost: number): boolean {
  const self = t.observation.self;
  const afterReturn = self.activeDon - (self.restedDon > 0 ? 0 : 1);
  return t.actions.some((action) => {
    if (!live(action)) return false;
    if (action.type === "activate-main") {
      return (
        (SIBLINGS.has(action.sourceCardNumber) ||
          action.sourceCardNumber === JUDGE) &&
        afterReturn >= cost
      );
    }
    if (action.type === "play-card") {
      return (
        t.playedCard(action)?.cardNumber === PORCHE &&
        self.activeDon - 3 >= cost
      );
    }
    return false;
  });
}

export const OP06_REIJU_RULES: readonly Heuristic[] = [
  // The turn starts one DON!! ahead, and every payoff in the list reads "equal
  // to or less". One DON!! −1 first puts the field level and draws off the
  // Leader on the way, so a payoff played before it gives up its whole clause
  // for nothing. Only from exactly one ahead: from two or more a single return
  // does not reach parity, and waiting buys nothing.
  never("Return a DON!! before the parity payoff, so its [On Play] works.")
    .as("parity-before-payoff")
    .when((t) => t.fieldDon - t.opponentFieldDon === 1)
    .play(
      (card, t) =>
        PARITY_PAYOFFS.has(card.cardNumber) && returnPrecedes(t, card.cost),
    ),

  // Black Maria's five DON!! arrive rested and stay on the field until the end
  // of the turn, so from the moment she is activated the field is ahead and
  // every parity payoff after her does nothing. What she buys -- the Leader's
  // draw when the counts are squared, or DON!! kept from behind -- comes at
  // the end of the turn whenever she is activated, so she goes last.
  never(
    "Activate Black Maria after the plays and activations her DON!! would switch off.",
  )
    .as("black-maria-last")
    .activate(
      (action, t) =>
        action.sourceCardNumber === BLACK_MARIA &&
        t.actions.some(
          (other) =>
            live(other) &&
            (other.type === "play-card" ||
              (other.type === "activate-main" &&
                other.sourceCardNumber !== BLACK_MARIA)),
        ),
    ),

  // OP06-065 Niji's bullets are a choice, offered K.O. first. With nothing on
  // the other side costing 2 or less the K.O. finds no target, and the bounce
  // still has one.
  never("Do not take Niji's K.O. with nothing for it to K.O.")
    .as("niji-live-mode")
    .effect(
      (action, t) =>
        action.sourceCardNumber === BIG_NIJI &&
        action.optionId === "ko" &&
        !t.observation.opponent.board.some((card) => card.currentCost <= 2) &&
        t.observation.opponent.board.some((card) => card.currentCost <= 4),
    ),

  // Which card pays the Stage's, Sora's or Judge's hand cost. Every candidate
  // is scored, so none is left for the ladder to take by hand order.
  preferAmong("Trash a namesake the siblings can still play from the trash.")
    .as("trash-the-namesake")
    .by(WEIGHT.deck)
    .effect((action, t) => {
      if (!HAND_COST_SOURCES.has(action.sourceCardNumber)) return false;
      if (!isOptionCardIn(action, "self", "hand")) return false;
      const card = optionCard(action)?.card;
      if (!card) return false;
      return discardScore(card.cardNumber, t.observation);
    }),

  // A search answered by offer order takes whatever the deck enumerated
  // first. The swap needs both halves -- a sibling on the field and its
  // namesake in hand or trash -- so the card that completes a half-made pair
  // is the one the turn can use; every other candidate scores below it.
  preferAmong("Search the half of a sibling pair the deck is missing.")
    .as("complete-the-pair")
    .by(WEIGHT.deck)
    .effect((action, t) => {
      if (!isSearchResult(action)) return false;
      const card = optionCard(action)?.card;
      if (!card) return false;
      return completesPair(card.cardNumber, t.observation) ? 2 : -1;
    }),

  // OP06-069 Reiju's whole clause is two cards, and it draws nothing from
  // ahead on DON!! or into a hand of more than five. With the small Reiju
  // there to play it later for a DON!! −1, a hard cast that draws nothing
  // spends four DON!! on the body alone.
  never(
    "Hold the big Reiju until its draw happens, while the small one can play it.",
  )
    .as("hold-reiju-draw")
    .play((card, t) => {
      if (card.cardNumber !== "OP06-069") return false;
      const drawFails =
        t.fieldDon > t.opponentFieldDon || t.hand.length - 1 > 5;
      return drawFails && siblingHeld(t.observation, "OP06-068");
    }),

  // The same for OP06-065 Niji and OP06-061 Ichiji: from ahead on DON!! the
  // bounce and the −2000 with [Rush] do nothing, and the sibling on the field
  // or in hand plays the same card later for a DON!! −1 that also levels the
  // counts.
  never(
    "Hold the big Niji or Ichiji until its [On Play] works, while its sibling can play it.",
  )
    .as("hold-namesake-payoff")
    .play((card, t) => {
      const sibling = SIBLING_OF[card.cardNumber];
      if (sibling === undefined || card.cardNumber === "OP06-069") return false;
      return (
        t.fieldDon > t.opponentFieldDon && siblingHeld(t.observation, sibling)
      );
    }),
];
