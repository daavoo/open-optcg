/**
 * (Blue/Black) Usopp's policy, behind the OP10-042 Leader.
 *
 * A {Dressrosa} control deck. The Leader gives every {Dressrosa} Character of
 * cost 2 or more +1 cost on the field, which lifts the board out of "cost N
 * or less" removal, and on the opponent's turn draws a card the first time
 * one is removed by their effect or K.O.'d. The engine of the fifty is the
 * Leader and OP04-096 Corrida Coliseum as a *cost*: OP10-057 Leo rests either
 * to dig two {Dressrosa} cards out of five, OP10-095 Roronoa Zoro rests one to
 * K.O. a 4-cost, OP10-043 Moocy and OP10-083 Momonosuke rest one for a
 * [Banish] or a −2 cost. A rested Leader does not attack, so each rest trades
 * a Leader swing for a card or an answer -- which is the trade a long game
 * wants. The Coliseum also gives the {Dressrosa} bodies [Rush: Character].
 * OP04-083 Sabo stops every K.O. by effect until the next turn and filters
 * two cards, OP10-049 Sabo bounces itself instead of a teammate leaving the
 * field, and OP10-090 Franky replays a 3-cost from the trash when it dies.
 * The finish is OP10-058 Rebecca playing OP10-046 Kyros and a second body at
 * once, Kyros returning a cost-5-or-less Blocker on the way in.
 */
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  isSearchResult,
  type PolicyDecision,
} from "../generic-policy.js";
import { heuristics, never, prefer, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;

const CORRIDA_COLISEUM = "OP04-096";
const LEO = "OP10-057";
const VIOLA = "OP15-040";
const SABO_FILTER = "OP04-083";
const REBECCA = "OP10-058";

/**
 * OP10-057 Leo and OP15-040 Viola, the two 1-cost diggers, and OP04-096
 * Corrida Coliseum, the Stage Bandai's write-up asks for early: either digger
 * finds the Coliseum, and the Coliseum is the second card Leo and Zoro can
 * rest once the Leader has swung.
 */
const OPENERS = new Set(["OP10-057", "OP15-040", "OP04-096"]);

export function createOp10UsoppMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op10-usopp-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a Leo, a Viola or Corrida Coliseum: a dig for the {Dressrosa} cards, or the Stage the rest costs want.",
    mulliganBecause:
      "Mulligan a hand with no Leo, Viola or Corrida Coliseum: nothing in it digs, and nothing gives the rest costs a second card to rest.",
  });
}

/**
 * What a card is worth holding right now, read the same way by the searches
 * that add one and the discards that give one up.
 *
 * Removal and protection first: OP10-095 Zoro is the deck's only K.O. on
 * arrival, and OP04-083 Sabo turns the opponent's next removal turn into
 * nothing. OP10-058 Rebecca is the finish and OP10-046 Kyros what she plays.
 * The 1- and 2-costs are the cheapest to lose, the Counters among them
 * included -- the bodies above them carry the same 1000 or 2000.
 *
 * OP04-096 Corrida Coliseum is worth the most while the deck has none, and
 * almost nothing once one is on the field or already in hand: a second Stage
 * only replaces the first, and the rest costs need one Stage, not two.
 */
const HOLD_VALUE: ReadonlyMap<string, number> = new Map([
  ["OP10-095", 9],
  [SABO_FILTER, 8],
  [REBECCA, 8],
  ["OP10-046", 7],
  [LEO, 6],
  ["OP10-118", 6],
  ["OP10-090", 6],
  ["OP15-047", 5],
  ["OP10-049", 5],
  [VIOLA, 4],
  ["OP10-083", 3],
  ["OP15-052", 3],
  ["OP10-043", 2],
  ["OP04-077", 2],
]);

/** Corrida Coliseum copies already on the field or in hand, `except` one. */
function coliseumsHeld(observation: GameObservation, except?: string): number {
  const onField =
    observation.self.stage?.cardNumber === CORRIDA_COLISEUM ? 1 : 0;
  const inHand = observation.self.hand.filter(
    (card) =>
      card.cardNumber === CORRIDA_COLISEUM && card.instanceId !== except,
  ).length;
  return onField + inHand;
}

function holdValue(
  cardNumber: string,
  instanceId: string,
  observation: GameObservation,
): number {
  if (cardNumber === CORRIDA_COLISEUM) {
    return coliseumsHeld(observation, instanceId) === 0 ? 10 : 1;
  }
  return HOLD_VALUE.get(cardNumber) ?? 0;
}

function isOwnChoice(action: EffectAction, source: string): boolean {
  return (
    action.sourceCardNumber === source &&
    action.effectKind === "mechanic-choice"
  );
}

/** A Leo or Viola search result, scored by {@link holdValue}. */
function searchValue(
  action: LegalAction,
  observation: GameObservation,
): number | undefined {
  if (action.type !== "resolve-effect") return undefined;
  if (!isOwnChoice(action, LEO) && !isOwnChoice(action, VIOLA)) {
    return undefined;
  }
  if (!isSearchResult(action) || action.option.kind !== "card") {
    return undefined;
  }
  const { card } = action.option;
  return holdValue(card.cardNumber, card.instanceId, observation);
}

/**
 * Which {Dressrosa} cards OP10-057 Leo and OP15-040 Viola take.
 *
 * Without a rule the search falls to offer order, which hands over an Ideo
 * before a Kyros. Written as a veto on every result below the best rather
 * than as a ranking: the format's `search-blocker` ranks the same results by
 * [Blocker], and two rankers that disagree each protect their own winner, so
 * the ladder would still take whichever came first. A veto composes with it.
 * Declining stays open to any policy that wants it.
 */
export function createOp10UsoppSearchModule(): PolicyModule {
  return heuristics("op10-usopp-search", [
    never(
      "Do not take a {Dressrosa} card the deck wants less than another on offer.",
    )
      .by(WEIGHT.deck)
      .effect((action, t) => {
        const value = searchValue(action, t.observation);
        if (value === undefined) return false;
        const best = Math.max(
          ...t.observation.legalActions.map(
            (other) => searchValue(other, t.observation) ?? -1,
          ),
        );
        return value < best;
      }),
  ]);
}

/**
 * Which card in hand pays OP10-057 Leo's trash and OP04-083 Sabo's two.
 *
 * Both trashes are mandatory, and the ladder answers them in hand order --
 * which gave up OP10-095 Zoro and the only Corrida Coliseum. The card the
 * search would least want is the card to lose.
 */
export function createOp10UsoppDiscardModule(): PolicyModule {
  return heuristics("op10-usopp-discard", [
    prefer("Trash the card in hand this deck least wants to hold.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (!isOwnChoice(action, LEO) && !isOwnChoice(action, SABO_FILTER)) {
          return false;
        }
        if (action.option.kind !== "card" || action.option.zone !== "hand") {
          return false;
        }
        if (action.destination?.zone !== "trash") return false;
        const { card } = action.option;
        return 11 - holdValue(card.cardNumber, card.instanceId, t.observation);
      }),
  ]);
}

/**
 * Which two {Dressrosa} Characters OP10-058 Rebecca reveals, and which of
 * them she plays active.
 *
 * She plays one revealed card and the other only if it costs 4 or less, so
 * the pair that pays is one big body and one small: Kyros -- whose own
 * [On Play] returns a Blocker -- and the best 4-or-less. The ladder reveals
 * in hand order, which pairs two 4-costs as readily as Kyros, or reveals two
 * big bodies and plays only one of them.
 *
 * The reveal is two choices of one card, and the second cannot see the
 * first, so it is read off the hand: a qualifying card in hand that is no
 * longer offered is the one already revealed. Once a big body is revealed
 * the 4-or-less cards outrank the rest. The final "play 1" choice offers
 * exactly the revealed pair with no way to decline, and takes the bigger one
 * active, since the smaller is the one the clause can still play rested.
 */
export function createOp10UsoppRebeccaModule(): PolicyModule {
  return heuristics("op10-usopp-rebecca", [
    prefer("Reveal one big body and the best 4-or-less; play the big one.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (!isOwnChoice(action, REBECCA)) return false;
        if (action.option.kind !== "card" || action.option.zone !== "hand") {
          return false;
        }
        const card = action.option.card;
        const cost = card.cost ?? 0;
        const value = holdValue(
          card.cardNumber,
          card.instanceId,
          t.observation,
        );
        const offered = new Set(
          t.observation.legalActions.flatMap((other) =>
            other.type === "resolve-effect" &&
            other.option.kind === "card" &&
            other.sourceCardNumber === REBECCA
              ? [other.option.card.instanceId]
              : [],
          ),
        );
        const canDecline = t.observation.legalActions.some(
          (other) =>
            other.type === "resolve-effect" &&
            other.sourceCardNumber === REBECCA &&
            other.option.kind !== "card",
        );
        const bigAlreadyRevealed =
          canDecline &&
          t.observation.self.hand.some((held) => {
            const facts = t.observation.cardFacts[held.cardNumber];
            return (
              !offered.has(held.instanceId) &&
              facts?.category === "character" &&
              held.cardNumber !== REBECCA &&
              facts.cost > 4 &&
              facts.cost <= 7 &&
              facts.types.includes("Dressrosa")
            );
          });
        if (bigAlreadyRevealed) return cost <= 4 ? 20 + value : value;
        return cost * 10 + value;
      }),
  ]);
}

/**
 * The bodies worth a Counter line to keep, and what each is worth.
 *
 * The generic Counter step defends a Character only for a single 1000, which
 * lets the deck's three bodies that do not come back die to any attack its
 * hand could have stopped: OP10-046 Kyros, which Rebecca exists to put down;
 * OP10-118 Luffy, the 7000 the opponent's effects cannot K.O. once a turn, so
 * battle is the only way it leaves; and OP04-083 Sabo, the 6000 [Blocker].
 * Everything else is a body the Leader's draw, Franky's [On K.O.] or a 1-cost
 * replaces. The Life guard in the generic step still spends nothing on a
 * Character while the Leader faces a lethal hit.
 */
const DEFEND: ReadonlyMap<string, number> = new Map([
  ["OP10-046", 3000],
  ["OP10-118", 3000],
  [SABO_FILTER, 2000],
]);

export function createOp10UsoppCounterModule(): PolicyModule {
  const protectedCards: ReadonlySet<string> = new Set(DEFEND.keys());
  return {
    id: "op10-usopp-counter",
    decide: ({ observation }): PolicyDecision | undefined => {
      if (observation.phase !== "counter") return undefined;
      return chooseGenericCounter(observation, observation.legalActions, {
        protectedCards,
        characterDefensePower: (cardNumber) => DEFEND.get(cardNumber) ?? 0,
      });
    },
  };
}

const USOPP = "OP10-042";
const ZORO = "OP10-095";
const MOOCY = "OP10-043";
/** The cards whose printed cost rests the Leader or a Stage. */
const REST_COST_CARDS: ReadonlySet<string> = new Set([LEO, ZORO, MOOCY]);

/**
 * Pay a rest cost with OP04-096 Corrida Coliseum rather than the Leader.
 *
 * The Coliseum's aura does not read whether it is rested, so resting it costs
 * nothing at all, where resting the Leader costs its attack. The ladder took
 * whichever was offered first, which was always the Leader.
 */
export function createOp10UsoppRestStageModule(): PolicyModule {
  return heuristics("op10-usopp-rest-stage", [
    never("Do not rest the Leader for a cost the Stage can pay.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (action.effectKind !== "mechanic-choice") return false;
        if (!REST_COST_CARDS.has(action.sourceCardNumber)) return false;
        if (action.option.kind !== "card") return false;
        if (action.option.card.cardNumber !== USOPP) return false;
        return t.observation.legalActions.some(
          (other) =>
            other.type === "resolve-effect" &&
            other.sourceCardNumber === action.sourceCardNumber &&
            other.option.kind === "card" &&
            other.option.card.cardNumber === CORRIDA_COLISEUM,
        );
      }),
  ]);
}

/**
 * Decline a rest cost that buys nothing.
 *
 * OP10-095 Zoro's K.O. reaches an opposing Character of cost 4 or less, and
 * OP10-043 Moocy's [Banish] goes to a [Monkey.D.Luffy] -- OP10-118 is the only
 * one in the fifty. With neither on the board the clause resolves to nothing
 * but the rest, which is the Leader's attack or the Stage, and for Zoro two
 * cards off the top of the deck.
 */
export function createOp10UsoppDeadRestModule(): PolicyModule {
  return heuristics("op10-usopp-dead-rest", [
    never("Do not pay a rest cost for a clause with nothing to hit.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (action.effectKind !== "mechanic-choice") return false;
        if (
          action.option.kind !== "confirm" ||
          action.option.choice !== "apply"
        ) {
          return false;
        }
        if (action.sourceCardNumber === ZORO) {
          return !t.observation.opponent.board.some(
            (card) => card.currentCost <= 4,
          );
        }
        if (action.sourceCardNumber === MOOCY) {
          return !t.observation.self.board.some(
            (card) => card.cardNumber === "OP10-118",
          );
        }
        return false;
      }),
  ]);
}
