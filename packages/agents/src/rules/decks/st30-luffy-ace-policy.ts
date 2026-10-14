import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  type PolicyDecision,
} from "../generic-policy.js";
import { heuristics, prefer, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { Tactics } from "../tactics.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * ## The deck's engine, in one paragraph
 *
 * ST-30's tribe is a number. "Character with 6000 base power" is printed on
 * nine of its seventeen identities, and eight of its fourteen Character
 * identities are 6000-power bodies, so the condition is nearly always true.
 * ST30-003 Edward.Newgate turns every one of them into a 7000 on its
 * controller's turn, ST30-014 Mr.3(Galdino) hands two of them two rested DON!!
 * each, ST30-015 counts two of them for a +4000 [Counter], and ST30-009 and
 * ST30-011 each replace one that an opponent's effect would remove. The Leader
 * caps the curve from above rather than below -- it gives *itself* -2000 while
 * its controller has a Character with 7000 base power or more -- so the deck
 * wins by having several identical bodies rather than one large one.
 *
 * That last sentence is what the Counter rule below follows from: in a deck
 * of interchangeable bodies, the one card that is not interchangeable is the
 * one that makes the others bigger.
 *
 * ## Sources
 *
 * None. ST-30 is a precon with no tournament record and no Bandai feature-deck
 * write-up, so every claim here is read off the fifty rather than cited, and
 * restated in `packages/agents/src/llm/dossiers/st30.ts`.
 */
const ST30_LEADER = "ST30-001";

/** ST30-012 Monkey.D.Luffy: the [When Attacking] that rests a [Blocker]. */
const BLOCKER_RESTER = "ST30-012";

/** An active [Blocker] on the opponent's board -- one that can still block. */
function hasStandingBlocker(observation: GameObservation): boolean {
  return observation.opponent.board.some(
    (card) => card.blocker && !card.rested,
  );
}

/** The ST30-012 on the viewer's board that could attack right now, if any. */
const isBlockerResterAttack = (action: LegalAction, t: Tactics): boolean =>
  action.type === "attack" &&
  t.observation.self.board.some(
    (card) =>
      card.instanceId === action.attackerInstanceId &&
      card.cardNumber === BLOCKER_RESTER,
  );

/**
 * Attack sequencing. `rank` only: the generic policy still decides, this
 * narrows what it decides between.
 *
 * ST30-012's "[When Attacking] Rest up to 1 of your opponent's [Blocker]
 * Characters" rests the Blocker for the rest of the turn, not just for this
 * battle -- so declaring it first is worth one extra connecting attack for
 * every later swing that would have been blocked. Declared last it buys
 * nothing at all, because the Blocker has already blocked. Pure sequencing,
 * and free.
 *
 * `prefer` rather than `preferAmong`, deliberately, and it is the whitelist
 * tier that makes the rule work: this scores exactly one candidate, and a
 * `preferAmong` rule with one candidate has nothing to outrank and is inert.
 * Hiding the other attacks while the gate holds is the point -- "take this
 * one first" is not expressible as an ordering when the chooser may take
 * several actions in a turn. It cannot strand the turn: once ST30-012 has
 * attacked it is rested and offers no attack, so the rule scores nothing and
 * every other attack is back on the table; and if it rested the last
 * Blocker, `hasStandingBlocker` is false and the gate is shut anyway.
 */
export function createSt30LuffyAceRulesPolicy(): PolicyModule {
  return heuristics("st30-luffy-ace", [
    prefer("Swing ST30-012 first; it rests the Blocker out of the whole turn.")
      .as("rush-blocker-first")
      .when((t) => hasStandingBlocker(t.observation))
      .by(WEIGHT.deck)
      .action(isBlockerResterAttack),
  ]);
}

/**
 * The cheap cards that look at the top of the deck for the next body, in
 * either list under this Leader. The starter's two look five deep for a
 * 6000-power Character: ST30-002 Inazuma on play, and ST30-017 as a [Main]
 * Event with the same clause as its [Trigger]. The Open OPTCG list's four are
 * 1-cost looks at four or five for a {Straw Hat Crew} card: OP01-016 and
 * EB02-017 Nami, EB04-002 Jewelry Bonney and the ST31-005 Stage. Neither list
 * plays the other's, so one set serves both.
 */
const ST30_SEARCHERS: ReadonlySet<string> = new Set([
  "ST30-002",
  "ST30-017",
  "OP01-016",
  "EB02-017",
  "EB04-002",
  "ST31-005",
]);

/**
 * The opening hand: the dossier's first clause, "keep a hand with ST30-002
 * Inazuma or ST30-017: both look at five cards for a 6000-power Character,
 * which is what makes the rest of the deck's costs payable."
 *
 * Eight of the fourteen Character identities are 6000-power bodies, so a hand
 * without a searcher is not short of bodies; what it is short of is the card
 * that turns the *next* body into the one the hand can pay for. ST30-004,
 * ST30-006 and ST30-008 each pay a 6000-power card out of hand, and the
 * searcher is what keeps that currency coming. The Open OPTCG list's dossier
 * opens the same way -- keep any hand with a 1-cost searcher -- because that
 * list has no ramp and is top-heavy in 4- and 5-cost threats. The rule only
 * ever tightens the generic keep: every card it keeps for costs 2 or less, so
 * it ships hands the generic kept and keeps none the generic shipped.
 */
export function createSt30LuffyAceMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "st30-luffy-ace-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => ST30_SEARCHERS.has(card.cardNumber)),
    keepBecause:
      "Keep a hand with a cheap searcher: it looks at the top of the deck for the next body, and the deck's curve is paid with those.",
    mulliganBecause:
      "Mulligan a hand with no searcher: the deck spends a body a turn, and a hand that cannot find the next one runs dry.",
  });
}

/** The anthem: the only card in the list whose loss shrinks other cards. */
const ST30_NEWGATE = "ST30-003";

/**
 * The field's price for a body that can simply be played again, which is what
 * every other Character in this deck is.
 */
const ORDINARY_CHARACTER_PRICE = 1_000;

/**
 * What ST30-003 is holding up, in power.
 *
 * Its [Your Turn] clause is "+1000 power to all of your Characters with 6000
 * base power", so what dies with it is 1000 for each such body on the board --
 * not its own 6000. That is the distinction `characterDefensePower` exists to
 * draw: an ordinary Character costs one Counter card because it can be replayed,
 * and this one is a trade against everything it was making bigger.
 *
 * Floored at the ordinary price so it is never worth *less* than a plain body,
 * which is what a lone Newgate on an empty board would otherwise price at.
 */
function newgateSupportPower(observation: GameObservation): number {
  const supported = observation.self.board.filter(
    (card) => card.power === 6_000,
  ).length;
  return Math.max(ORDINARY_CHARACTER_PRICE, supported * 1_000);
}

/**
 * The Counter phase, which is a whole decision rather than a narrowing and so
 * cannot be a heuristic.
 *
 * `pnpm census` reads this deck's `counter:counter` at 100.0% no rule at all,
 * and `chooseGenericCounter` ships an empty protected set -- so an unpiloted
 * seat spends nothing to save any Character, whatever it was doing.
 *
 * Exactly one card is protected, and the argument is that it is the only one
 * that needs to be. Every other body in the fifty is a 6000 the deck can put
 * down again; ST30-003 is the card that makes those 6000s into 7000s, so losing
 * it takes power off the whole board at once. Priced at what it is actually
 * holding up rather than at its own size, for the same reason.
 *
 */
export function createSt30LuffyAceDefenseModule(): PolicyModule {
  return {
    id: "st30-luffy-ace-defense",
    applies: (context) =>
      context.observation.self.leader.cardNumber === ST30_LEADER,
    decide: ({ observation }): PolicyDecision | undefined => {
      if (observation.phase !== "counter") return undefined;
      return chooseGenericCounter(observation, observation.legalActions, {
        protectedCards: new Set([ST30_NEWGATE]),
        counterEventBeatsCards: 2,
        characterDefensePower: (cardNumber) =>
          cardNumber === ST30_NEWGATE
            ? newgateSupportPower(observation)
            : ORDINARY_CHARACTER_PRICE,
      });
    },
  };
}
