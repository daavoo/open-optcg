/**
 * (Red/Blue) Nefeltari Vivi's policy, behind the EB03-001 Leader.
 *
 * The Leader's [Activate: Main] rests it to give an opposing Character −2000,
 * then [Rush] to one of your Characters without a [When Attacking] clause --
 * which is every Character in this fifty. [Rush] only buys anything on a body
 * that could not otherwise attack, one played this turn, so the activation is
 * worth the Leader's own attack exactly when a fresh body is on the board: the
 * deck's removal and bounce bodies (OP06-007 Shanks, OP09-009 Benn.Beckman,
 * EB03-027 Marguerite, EB03-025 Hina, EB03-026 Boa Hancock) and EB03-006 Nami,
 * whose −5000 on the Leader to draw costs nothing on a turn the Leader rests
 * instead of attacking. Its other half trashes a card from hand to keep a
 * base-cost-4-or-more Character from a K.O., once a turn.
 */
import type { GameObservation } from "@one-piece-sim/protocol";
import { optionCard, type EffectAction } from "../generic-policy.js";
import { heuristics, never, prefer, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

const VIVI_LEADER = "EB03-001";
const NAMI = "EB03-006";
const HINA = "EB03-025";
const MARGUERITE = "EB03-027";
const BLOCKER_VIVI = "EB03-024";
const DIGGER_VIVI = "OP13-012";

type BoardCard = GameObservation["self"]["board"][number];

/**
 * A choice the card's own program is asking. The engine names the played card
 * as the source of an `area-replacement` too -- "trash one of your five
 * Characters to make room" -- so a rule keyed on the source alone would also
 * rank which body is thrown away.
 */
function isOwnChoice(action: EffectAction, source: string): boolean {
  return (
    action.sourceCardNumber === source &&
    action.effectKind === "mechanic-choice"
  );
}

/**
 * A body the Leader's [Rush] turns into an attack this turn: played this turn,
 * and held back by nothing else.
 */
function wantsRush(card: BoardCard): boolean {
  return card.summoningSick === true;
}

/**
 * `turn <= 2` is each player's first turn, on which no one may attack, so
 * [Rush] and the −2000 buy nothing there.
 */
const ATTACKS_OPEN = (turn: number) => turn > 2;

/**
 * The opening: a 1-cost for the first turns -- OP13-012 Vivi digs four cards
 * for a 5-cost {Alabasta} or {Straw Hat Crew} body, OP13-007 shrinks a blocker
 * -- or the 4-cost OP10-011 Chopper, and a body of cost 5 or more for the turn
 * the Leader first hands out [Rush].
 */
const EARLY_PLAYS = new Set([DIGGER_VIVI, "OP13-007", "OP10-011"]);

/** The fifty's Characters of cost 5 or more. */
const BIG_BODIES = new Set([
  NAMI,
  BLOCKER_VIVI,
  HINA,
  "OP13-011",
  "OP13-054",
  "EB03-026",
  MARGUERITE,
  "OP09-009",
  "OP06-007",
]);

export function createEb03ViviMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "eb03-vivi-mulligan",
    keep: (observation) => {
      const hand = observation.self.hand;
      return (
        hand.some((card) => EARLY_PLAYS.has(card.cardNumber)) &&
        hand.some((card) => BIG_BODIES.has(card.cardNumber))
      );
    },
    keepBecause:
      "Keep an early play and a 5-cost or bigger body: the Leader's [Rush] needs a fresh body with an [On Play] to hand it to.",
    mulliganBecause:
      "Mulligan a hand missing an early play or a 5-cost body: the Leader has nothing to give [Rush] to.",
  });
}

/**
 * The Leader's activation, and where its two halves go.
 *
 * The ladder rested the Leader at the first chance, so on a turn with nothing
 * fresh on the board it traded a 5000 Leader attack for a −2000 that no attack
 * used, and then put DON!! on a Leader that could no longer swing. Gated here
 * on a body that [Rush] turns into an attack. When it fires, the [Rush] goes to
 * the largest fresh body, and the −2000 to the opposing Character it brings
 * inside an attacker's reach: a rested one -- the only kind an attack can
 * target -- that the biggest attacker can then beat, else a [Blocker], which
 * then stops less.
 */
export function createEb03ViviLeaderModule(): PolicyModule {
  return heuristics("eb03-vivi-leader", [
    never(
      "Keep the Leader's attack until a Character played this turn is there to take [Rush].",
    )
      .by(WEIGHT.deck)
      .as("rush-gate")
      .activate((action, t) => {
        if (action.sourceCardNumber !== VIVI_LEADER) return false;
        if (!ATTACKS_OPEN(t.observation.turn)) return true;
        return !t.observation.self.board.some(wantsRush);
      }),
    never("Do not give DON!! to a Leader that has rested for its ability.")
      .by(WEIGHT.deck)
      .as("rested-leader-don")
      .attachDon(
        (action, t) =>
          action.targetInstanceId.endsWith("-leader") &&
          t.observation.self.leader.rested,
      ),
    prefer("Give [Rush] to the largest Character played this turn.")
      .by(WEIGHT.deck)
      .as("rush-target")
      .effect((action, t) => {
        if (!isOwnChoice(action, VIVI_LEADER)) return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "board") return false;
        const card = t.observation.self.board.find(
          (candidate) => candidate.instanceId === option.card.instanceId,
        );
        if (!card || !wantsRush(card)) return false;
        return card.currentPower / 1000;
      }),
    prefer(
      "Shrink the rested Character the biggest attacker can then beat, else a [Blocker].",
    )
      .by(WEIGHT.deck)
      .as("shrink-target")
      .effect((action, t) => {
        if (!isOwnChoice(action, VIVI_LEADER)) return false;
        const option = optionCard(action);
        if (option?.owner !== "opponent" || option.zone !== "board") {
          return false;
        }
        const target = t.observation.opponent.board.find(
          (candidate) => candidate.instanceId === option.card.instanceId,
        );
        if (!target) return false;
        const reach = Math.max(
          0,
          ...t.observation.self.board
            .filter((card) => card.couldAttack || wantsRush(card))
            .map((card) => card.currentPower),
        );
        const shrunk = target.currentPower - 2000;
        if (target.rested && shrunk <= reach) {
          return 20 + target.currentCost;
        }
        if (target.blocker && !target.rested) return 10 + target.currentCost;
        return 1 + target.currentCost / 10;
      }),
  ]);
}

/**
 * EB03-027 Marguerite and EB03-025 Hina return a Character by its printed
 * power to its owner's hand, and "a Character" names no side -- each is a
 * legal target for its own clause, and so is any body of yours at that power.
 * The ladder took the first offered and bounced its own board. Only an
 * opposing Character is worth it, and Hina pays a card from hand first, so she
 * declines the cost when no opposing Character has 6000 base power.
 */
export function createEb03ViviBounceModule(): PolicyModule {
  const bounces = (action: EffectAction) =>
    isOwnChoice(action, MARGUERITE) || isOwnChoice(action, HINA);
  return heuristics("eb03-vivi-bounce", [
    never("Do not return your own Character to hand.")
      .by(WEIGHT.deck)
      .as("own-bounce")
      .effect((action) => {
        if (!bounces(action)) return false;
        const option = optionCard(action);
        return option?.owner === "self" && option.zone === "board";
      }),
    prefer("Return the opposing Character that cost the most to play.")
      .by(WEIGHT.deck)
      .as("bounce-target")
      .effect((action) => {
        if (!bounces(action)) return false;
        const option = optionCard(action);
        if (option?.owner !== "opponent" || option.zone !== "board") {
          return false;
        }
        return 1 + (option.card.cost ?? 0);
      }),
    never("Do not trash a card for Hina with no 6000 Character to return.")
      .by(WEIGHT.deck)
      .as("hina-cost")
      .effect((action, t) => {
        if (action.sourceCardNumber !== HINA) return false;
        if (action.option.kind !== "confirm") return false;
        if (action.option.choice !== "apply") return false;
        return !t.observation.opponent.board.some(
          (card) => card.power === 6000,
        );
      }),
  ]);
}

/**
 * The bodies OP13-012's dig and EB03-024's free play reach, best first. Nami
 * draws on the way in and is the deck's 7000 [Rush] attacker; EB03-024 is a
 * [Blocker] that plays a second body; Chopper is the 6000 wall on the
 * opponent's turn; Cobra is a vanilla 6000.
 */
const ALABASTA_VALUE: ReadonlyMap<string, number> = new Map([
  [NAMI, 4],
  [BLOCKER_VIVI, 3],
  ["OP10-011", 2],
  ["OP13-011", 1],
]);

export function createEb03ViviSearchModule(): PolicyModule {
  return heuristics("eb03-vivi-search", [
    prefer("Dig Nami first, then the [Blocker] Vivi, Chopper, and Cobra.")
      .by(WEIGHT.deck)
      .as("dig-order")
      .effect((action) => {
        if (!isOwnChoice(action, DIGGER_VIVI)) return false;
        const option = optionCard(action);
        if (!option) return false;
        return ALABASTA_VALUE.get(option.card.cardNumber) ?? false;
      }),
    prefer(
      "Play the biggest body EB03-024 Vivi reaches: Nami, then Cobra or Chopper.",
    )
      .by(WEIGHT.deck)
      .as("free-play")
      .effect((action) => {
        if (!isOwnChoice(action, BLOCKER_VIVI)) return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "hand") return false;
        return 1 + (option.card.power ?? 0) / 1000;
      }),
  ]);
}

/**
 * The card a hand-trash cost gives up, first spent first -- above all the
 * Leader's "trash a card instead" when a base-cost-4-or-more body would be
 * K.O.'d, which the ladder paid in hand order.
 *
 * The 1-cost diggers have done their job once they are in hand late, and the
 * Event and the 4-cost bodies are the cheapest to give up. The removal and
 * bounce bodies are what the Leader's [Rush] is for, and OP06-007 Shanks
 * goes last: at 10 DON!! it is the card the deck is built to land, and the
 * one a late hand can least replace.
 */
export const EB03_VIVI_DISCARD_ORDER: readonly (readonly string[])[] = [
  ["OP13-012"],
  ["OP13-007"],
  ["EB03-011"],
  ["OP10-011", "OP13-054"],
  ["EB03-024", "EB03-025", "OP13-011"],
  ["EB03-027", "OP09-009"],
  ["EB03-006", "EB03-026"],
  ["OP06-007"],
];
