/**
 * (Blue) Rebecca's policy, behind the OP15-039 Leader.
 *
 * The Leader cannot attack. Its [Activate: Main] rests it and returns one of
 * your {Dressrosa} Characters to hand to play a cost-3 {Dressrosa} Character
 * from hand for nothing, and the feature page's own opening is that line on
 * turn one: play a 1-cost, then have the Leader swap it for a 3-cost.
 */
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  type PolicyDecision,
} from "../generic-policy.js";
import { heuristics, never, prefer, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { RulesPolicy } from "../policy-chain.js";
import type { PolicyModule } from "../policy-module.js";

const REBECCA_LEADER = "OP15-039";
const KYROS = "OP15-042";
const ORLUMBUS = "OP15-041";

/**
 * The 1-cost {Dressrosa} Characters: what the Leader bounces. OP15-053 Rebecca
 * and OP15-040 Viola dig for a {Dressrosa} card when they are replayed.
 */
const BOUNCE_FODDER = new Set(["OP15-053", "OP15-040", "OP15-052"]);

/** The cost-3 {Dressrosa} Characters: what the Leader may play. */
const LEADER_PLAYS = new Set([
  "OP10-054",
  ORLUMBUS,
  KYROS,
  "OP15-047",
  "OP15-051",
]);

/**
 * A cost-3 for the Leader to play, or OP10-059, a 1-cost Event that searches
 * five cards deep for a {Dressrosa} Character -- in this fifty, a cost-3 more
 * often than not.
 */
const LEADER_PLAYS_OR_SEARCH = new Set([...LEADER_PLAYS, "OP10-059"]);

export function createOp15RebeccaMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op15-rebecca-mulligan",
    keep: (observation) => {
      const hand = observation.self.hand.map((card) => card.cardNumber);
      return (
        hand.some((card) => BOUNCE_FODDER.has(card)) &&
        hand.some((card) => LEADER_PLAYS_OR_SEARCH.has(card))
      );
    },
    keepBecause:
      "Keep a 1-cost Dressrosa body and a 3-cost to swap it for: that is the Leader's free play on the first turn.",
    mulliganBecause:
      "Mulligan a hand missing either half of the swap: without a 1-cost to bounce or a 3-cost to play, the Leader does nothing.",
  });
}

/** The fifty's {Dressrosa} Characters -- every Character in it is one. */
const DRESSROSA_CHARACTERS = new Set([
  ...BOUNCE_FODDER,
  ...LEADER_PLAYS,
  "OP10-045",
  "OP10-046",
  "OP15-046",
]);

type BoardCard = GameObservation["self"]["board"][number];

/**
 * A choice the card's own program is asking. The engine names the played card
 * as the source of an `area-replacement` too -- "trash one of your five
 * Characters to make room" -- so a rule keyed on the source alone also ranks
 * which body is thrown away, by a score written for something else.
 */
function isOwnChoice(
  action: Extract<LegalAction, { type: "resolve-effect" }>,
  source: string,
): boolean {
  return (
    action.sourceCardNumber === source &&
    action.effectKind === "mechanic-choice"
  );
}

/**
 * A body the Leader can return without costing the turn anything: a 1-cost with
 * no attack left in it (or OP15-053 Rebecca, whose 0 power has nothing to attack
 * with), or a cost-3 that has already attacked -- it comes back through the
 * swap untapped, and a Kyros comes back with [Rush].
 *
 * Nothing above cost 3: the swap can only put a cost-3 back, so returning a
 * 4-cost or a 7-cost trades it down. And not a cost-3 that simply has not
 * attacked yet, summoning sick or not -- swapping it for another cost-3 is the
 * same body with the turn's one use spent.
 */
function isSpare(card: BoardCard): boolean {
  if (BOUNCE_FODDER.has(card.cardNumber)) {
    return !card.couldAttack || card.cardNumber === "OP15-053";
  }
  return LEADER_PLAYS.has(card.cardNumber) && card.rested;
}

/**
 * How much is gained by returning this body. Kyros that has already swung comes
 * back through the Leader with a second [Rush] for another trashed card; a
 * 1-cost that digs is replayed for one DON!! to dig again.
 */
function bounceValue(card: BoardCard): number {
  if (!isSpare(card)) return -1;
  if (card.cardNumber === KYROS) return 4;
  if (card.cardNumber === "OP15-053" || card.cardNumber === "OP15-040") {
    return 3;
  }
  if (BOUNCE_FODDER.has(card.cardNumber)) return 2;
  return 1;
}

/**
 * The Leader's swap, and the two things it needs to be a trade rather than a
 * loss.
 *
 * The clause is repeatable in print, but resting the Leader is its cost, so it
 * is once a turn -- and the generic ladder fires it at the first chance
 * whatever it returns. That spends the turn's one use bouncing the body that
 * was about to attack, or returning a Character with no cost-3 in hand to take
 * its place. Both halves are gated here: offer the swap only when there is a
 * cost-3 {Dressrosa} Character to play (in hand, or the spare body itself when
 * it costs 3) and a spare body to return, and when it is taken, return the
 * spare one.
 *
 * The play is ranked too. Kyros takes [Rush] on the way in for a trashed card,
 * which makes the free play an attack this turn; every other cost-3 lands with
 * summoning sickness, so the largest body is the tiebreak.
 */
export function createOp15RebeccaLeaderModule(): PolicyModule {
  return heuristics("op15-rebecca-leader", [
    never(
      "Hold the Leader's swap until there is a spare body to return and a cost-3 to play in its place.",
    )
      .by(WEIGHT.deck)
      .as("swap-gate")
      .activate((action, t) => {
        if (action.sourceCardNumber !== REBECCA_LEADER) return false;
        const self = t.observation.self;
        const spare = self.board.filter(
          (card) => DRESSROSA_CHARACTERS.has(card.cardNumber) && isSpare(card),
        );
        if (spare.length === 0) return true;
        const replayable =
          self.hand.some((card) => LEADER_PLAYS.has(card.cardNumber)) ||
          spare.some((card) => LEADER_PLAYS.has(card.cardNumber));
        return !replayable;
      }),
    prefer(
      "Return the body with no attack left in it: a Kyros that has swung, or a 1-cost that digs again.",
    )
      .by(WEIGHT.deck)
      .as("swap-bounce")
      .effect((action, t) => {
        if (!isOwnChoice(action, REBECCA_LEADER)) return false;
        if (action.option.kind !== "card" || action.option.zone !== "board") {
          return false;
        }
        const id = action.option.card.instanceId;
        const card = t.observation.self.board.find(
          (candidate) => candidate.instanceId === id,
        );
        return card === undefined ? false : bounceValue(card);
      }),
    prefer(
      "Play Kyros off the swap when a card is left to pay its [Rush]; otherwise the largest cost-3.",
    )
      .by(WEIGHT.deck)
      .as("swap-play")
      .effect((action, t) => {
        if (!isOwnChoice(action, REBECCA_LEADER)) return false;
        if (action.option.kind !== "card" || action.option.zone !== "hand") {
          return false;
        }
        const card = action.option.card;
        if (card.cardNumber === KYROS && t.observation.self.hand.length >= 2) {
          return 10;
        }
        return (card.power ?? 0) / 1000;
      }),
  ]);
}

/**
 * OP15-041 Orlumbus buys itself [Rush] with one of your Characters to the
 * bottom of the deck: a whole card for one 4000 attack on the turn it lands,
 * which is under every Leader in the format and so reaches only a Character.
 * The ladder took it every turn it was offered -- on an Orlumbus that could
 * already attack, where [Rush] does nothing, and paying with Orlumbus itself,
 * which leaves nothing to take the keyword. The feature page's plan for the
 * deck never uses it; this deck's [Rush] is Kyros's, paid from hand.
 */
export function createOp15RebeccaOrlumbusModule(): PolicyModule {
  return heuristics("op15-rebecca-orlumbus", [
    never(
      "Do not put a Character on the bottom of the deck for one 4000 attack.",
    )
      .by(WEIGHT.deck)
      .as("no-rush-for-a-card")
      .activate((action) => action.sourceCardNumber === ORLUMBUS),
  ]);
}

/**
 * OP15-042 Kyros's [On Play] trashes a card for [Rush], and on the first
 * player's first turn or the second player's first -- `turn <= 2` -- no one
 * may attack, so the card buys nothing. Decline it there.
 */
export function createOp15RebeccaKyrosModule(): PolicyModule {
  return heuristics("op15-rebecca-kyros", [
    never("Do not trash a card for Kyros's [Rush] on a turn no one may attack.")
      .by(WEIGHT.deck)
      .as("dead-rush")
      .when((t) => t.observation.turn <= 2)
      .effect(
        (action) =>
          action.sourceCardNumber === KYROS &&
          action.option.kind === "confirm" &&
          action.option.choice === "apply",
      ),
  ]);
}

/**
 * What a card in hand is worth keeping, for the two clauses that trash one:
 * OP10-045 Cavendish's draw-two-trash-one and OP15-042 Kyros's [Rush] cost. The
 * same order the search table ranks them in, read the other way -- the card a
 * search least wants is the card a discard should give up.
 */
const KEEP_VALUE: ReadonlyMap<string, number> = new Map([
  [KYROS, 6],
  ["OP15-053", 5],
  ["OP15-040", 5],
  ["OP15-047", 4],
  ["OP15-051", 4],
  ["OP15-046", 4],
  ["OP10-060", 4],
  ["OP10-045", 3],
  ["OP10-046", 3],
  ["OP10-054", 2],
  [ORLUMBUS, 2],
  ["OP15-052", 2],
  ["OP10-059", 1],
]);

export function createOp15RebeccaDiscardModule(): PolicyModule {
  return heuristics("op15-rebecca-discard", [
    prefer("Trash the card in hand this deck least wants to keep.")
      .by(WEIGHT.deck)
      .as("discard-order")
      .effect((action) => {
        if (!isOwnChoice(action, "OP10-045") && !isOwnChoice(action, KYROS)) {
          return false;
        }
        if (action.option.kind !== "card" || action.option.zone !== "hand") {
          return false;
        }
        return 10 - (KEEP_VALUE.get(action.option.card.cardNumber) ?? 0);
      }),
  ]);
}

/**
 * The bodies worth a Counter card to keep, which the generic Counter step
 * never defends: with `protectedCards` empty it spends nothing on a Character.
 *
 * The two 7-costs -- OP15-046 Sabo and OP10-046 Kyros -- cannot come back
 * through the Leader, whose swap plays only a cost-3, and OP10-045 Cavendish is
 * the one card that draws on every attack. OP15-051 Luffy is the 7000 wall on
 * the opponent's turn, so an attack on it is the one that got past the wall.
 * OP15-042 Kyros is left out: it returns to hand from the trash when K.O.'d.
 */
const REBECCA_PROTECTED_FROM_COUNTER: ReadonlySet<string> = new Set([
  "OP15-046",
  "OP10-046",
  "OP10-045",
  "OP15-051",
]);

export function createOp15RebeccaCounterPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== REBECCA_LEADER) return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(observation, observation.legalActions, {
      protectedCards: REBECCA_PROTECTED_FROM_COUNTER,
      // Uncapped: a protected body is worth the whole Counter line that saves
      // it, not one card. None of the four can be replayed off the Leader, and
      // the hand that pays is mostly 1-costs the swap returns to it anyway.
      economicalCharacterDefense: false,
    });
  };
}

/**
 * Put the swap's fuel down first. The ladder develops the dearest card it can
 * afford, so a turn with a 1-cost and a 4-cost in hand spends its DON!! on the
 * 4-cost and leaves the Leader nothing to return -- the swap, a free cost-3,
 * goes unused. While the Leader is still active, nothing on the board is spare
 * and a cost-3 is waiting in hand, the 1-cost is played first: it digs on the
 * way in and is the body the swap returns.
 */
export function createOp15RebeccaFuelFirstModule(): PolicyModule {
  return heuristics("op15-rebecca-fuel-first", [
    prefer("Play a 1-cost for the Leader to return before the dearer bodies.")
      .by(WEIGHT.deck)
      .as("fuel-first")
      .when((t) => {
        const self = t.observation.self;
        if (self.leader.rested) return false;
        if (self.board.some(isSpare)) return false;
        return self.hand.some((card) => LEADER_PLAYS.has(card.cardNumber));
      })
      .play((card) =>
        card.cardNumber === "OP15-053" || card.cardNumber === "OP15-040"
          ? 2
          : BOUNCE_FODDER.has(card.cardNumber)
            ? 1
            : false,
      ),
  ]);
}
