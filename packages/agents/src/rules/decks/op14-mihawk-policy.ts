import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { nextTurnLeaderDamage } from "../combat.js";
import {
  chooseGenericCounter,
  opponentLeaderId,
  optionCard,
  type PolicyDecision,
} from "../generic-policy.js";
import {
  avoid,
  heuristics,
  never,
  prefer,
  preferAmong,
} from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";
import type { RulesPolicy } from "../policy-chain.js";
import type { Tactics } from "../tactics.js";

const MIHAWK_LEADER = "OP14-020";
/** OP14-039 Coffin Boat: the Stage that exists to be rested. */
const COFFIN_BOAT = "OP14-039";
/**
 * OP01-055 "You Can Be My Samurai!!": `pnpm card:text OP01-055`.
 *
 * The deck's card flow: two of your own Characters rested for two cards. The
 * price is "your Characters", not "your cards", which is why the guards below
 * count active Characters and nothing else -- neither the Leader nor Coffin
 * Boat can pay this one, however willing they are to pay the Leader's.
 */
const REST_DRAW = "OP01-055";
/**
 * OP14-023 Kikunojo: `pnpm card:text OP14-023`. A 1-cost body that sets
 * itself active at the end of your turn, so a rest cost paid with it is paid
 * back before the opponent's turn -- the cheapest Character on the field to
 * rest, every turn.
 */
const SELF_RESTANDING = "OP14-023";
/**
 * OP06-033 Vander Decken IX: "[On Play] You may trash 1 {Fish-Man} type card
 * from your hand ...: K.O. up to 1 of your opponent's *rested* Characters."
 */
const RESTED_KO = "OP06-033";
/** The {Fish-Man} cards in the list, which is what OP06-033's cost may be paid with. */
const FISH_MAN = ["OP06-033", "OP12-023"];
/**
 * OP08-036 Electrical Luna: "[printed text omitted -- pnpm card:text OP08-036]"
 */
const BOARD_LOCK = "OP08-036";
/**
 * OP07-026 Jewelry Bonney: `pnpm card:text OP07-026`. The one-body version of
 * Electrical Luna on a 2000 body, and the only lock in the list that can also
 * hold a DON!! down.
 */
const SINGLE_LOCK = "OP07-026";
/** OP17-022 Shanks: "[On Play] Set up to 2 DON!! active. Then, rest all of your opponent's Characters." */
const SWEEPER = "OP17-022";
/** The cost-5-or-more bodies that switch the Leader's restand on. */
const COST_FIVE_BODIES = [
  "ST32-002",
  "OP12-023",
  "OP17-031",
  "OP13-031",
  SWEEPER,
];
/**
 * Every card in the deck whose own-side effect choice is a rest cost.
 *
 * OP14-020's Leader restand, OP01-055's two Characters and ST32-001 Kin'emon's
 * Leader-or-DON!! branch. All three ask the same question, which is why one
 * ranking answers them.
 */
const REST_COST_SOURCES = [MIHAWK_LEADER, REST_DRAW, "ST32-001"];

/** The 1-cost diggers. */
const SEARCHERS = ["OP07-022", "OP12-034", "ST32-001"];

/**
 * OP13-031 Trafalgar Law: `pnpm card:text OP13-031`. Returns one of your own
 * Characters to hand, then plays a Character of cost 5 or less from hand
 * rested.
 */
const BOUNCE_REPLAY = "OP13-031";

/**
 * OP17-099 Charlotte Linlin, the Leader across the table in the featured
 * division's Yellow deck. Its [When Attacking] pays a card from its hand and
 * then hands *this* seat a choice of branch: Linlin trashes a card from her
 * hand and adds a card from the top of her deck to her Life, or Linlin
 * trashes a card from this seat's hand at random. The engine offers the
 * branches as a `mode` option to the Mihawk seat; the random card is the
 * engine's, so there is no second choice.
 */
const LINLIN_LEADER = "OP17-099";

/**
 * Characters worth a Counter card, because losing one costs the deck its engine.
 *
 * Every cost-5 body is a gate on the Leader's own ability -- no Character of
 * cost 5 or more on the board and the restand sets zero DON!! active. The
 * sweeper is deliberately absent: by the time it can be attacked it has
 * already cashed its [On Play].
 */
const PROTECTED_CARDS: ReadonlySet<string> = new Set(
  COST_FIVE_BODIES.filter((cardNumber) => cardNumber !== SWEEPER),
);

/** True while a Character of cost 5 or more sits on either board. */
function restandIsLive(observation: GameObservation): boolean {
  return [...observation.self.board, ...observation.opponent.board].some(
    (card) => card.cost >= 5,
  );
}

/** Opposing Characters that are rested right now. */
function restedOpponents(observation: GameObservation) {
  return observation.opponent.board.filter((card) => card.rested);
}

/**
 * Your own Characters that could still pay OP01-055's cost: the active ones.
 *
 * A rest-N cost is a `choose` with `min: N`, and the engine offers the
 * activation without checking that N candidates exist -- so an Event whose cost
 * cannot be paid resolves into nothing with the card already spent. Characters
 * only: the clause names them, and the Leader and the Stage are not offered.
 */
function activeOwnCharacters(observation: GameObservation) {
  return observation.self.board.filter((card) => !card.rested);
}

/**
 * Active Characters that cost nothing to rest this turn: the ones that could
 * not attack anyway, and Kikunojo, which stands back up at the end of the turn.
 *
 * `couldAttack`, not `canAttack`, for the reason {@link restCostValue} gives.
 */
function freeRestPayers(t: Tactics) {
  return activeOwnCharacters(t.observation).filter(
    (body) =>
      body.cardNumber === SELF_RESTANDING ||
      body.summoningSick === true ||
      !t.couldAttack(body.instanceId),
  );
}

/**
 * How willingly one of your own cards pays a rest cost, highest first.
 *
 * The whole deck buys things by resting its own field, so *which* card pays is
 * the decision it makes most often. `chooseGenericRules` answers it with the
 * first option offered, which is the Leader.
 */
function restCostValue(action: LegalAction, t: Tactics): number | false {
  if (action.type !== "resolve-effect") return false;
  // Scoped to the cards whose own-side choice *is* a rest cost. "Any own-board
  // option" would also catch the next effect that chooses among your own
  // things for some other reason.
  if (!REST_COST_SOURCES.includes(action.sourceCardNumber)) return false;
  const option = action.option;
  // ST32-001 Kin'emon prints its cost as a pair of named resources rather than
  // a card, which the engine classifies as `resource`. `optionId` is opaque by
  // contract, so this reads the typed descriptor.
  if (option.kind === "resource") {
    // A DON!! that is about to sit unused is the cheapest thing on the field to
    // rest, and the Leader's own restand sets it back active later in the turn.
    if (option.resource === "don") return 90;
    return leaderRestValue();
  }
  const card = optionCard(action);
  if (!card || card.owner !== "self") return false;
  // The Stage is free: it neither attacks nor blocks, and Coffin Boat refunds a
  // DON!! at the end of the turn whether it is rested or not.
  if (card.zone === "stage") return 100;
  if (card.zone === "leader") return leaderRestValue();
  if (card.zone !== "board") return false;
  const body = t.observation.self.board.find(
    (entry) => entry.instanceId === card.card.instanceId,
  );
  if (!body) return false;
  // Kikunojo sets itself active at the end of your turn, so resting it costs
  // its own 2000 attack and nothing into the opponent's turn -- above a body
  // that stays down, below the Stage, which does not even give up an attack.
  if (body.cardNumber === SELF_RESTANDING) return 95;
  // A body that cannot attack this turn anyway costs nothing to rest.
  // `couldAttack`, not `canAttack`: a rest cost is answered inside a pending
  // effect, where the engine offers no `attack` action for anything, so the
  // legalActions-derived question reads false for every body on the board. It
  // did, and the branch below then priced the deck's only live attacker at the
  // same 60 as a Character that had just landed -- so the tie went to whichever
  // the engine happened to offer first, and the swing was sold to draw a card.
  if (body.summoningSick === true || !t.couldAttack(body.instanceId)) return 60;
  // Otherwise give up the smallest attack on the board.
  // Floored above `leaderRestValue`, so the Leader is strictly the last card on
  // the field to be rested however big the alternative body is.
  return Math.max(5, 40 - body.currentPower / 1000);
}

/**
 * What resting the Leader is worth as a payment: barely anything.
 *
 * This deck's clock *is* the Leader, and a rest cost is only ever offered one
 * that has not attacked yet -- the selector asks for an unrested card -- so
 * paying with it always sells that attack. On a turn with a battle in it,
 * `createOp14MihawkLeaderSwingModule` removes the option outright; this price
 * is for the turns where the Leader has no attack to sell.
 *
 * Positive rather than negative, deliberately: it has to stay above *declining
 * the effect*, because where the cost is optional a `skip` scoring 0 sits
 * beside it. ST32-001 Kin'emon's two cards are worth more than one attack.
 *
 * Do not reach for `viableAttacks` here. A rest cost is answered inside a
 * pending effect, and the engine offers no `attack` actions while one is open,
 * so every attack-derived quantity reads empty at exactly this decision.
 */
function leaderRestValue(): number {
  return 2;
}

/**
 * A 1-cost digger's pick: a card of your own still in the deck.
 *
 * Every searcher in the list raises the same shape -- look at 5, choose 1, bottom
 * the rest -- and the mechanic DSL reports all of it as `effectKind:
 * "mechanic-choice"`, so `effectKind` cannot separate the pick from a K.O. or a
 * rest cost. The typed option descriptor can: only a look-at-deck effect offers a
 * card the viewer owns that is still in the deck zone.
 */
function searchPick(action: LegalAction) {
  if (action.type !== "resolve-effect") return undefined;
  if (!SEARCHERS.includes(action.sourceCardNumber)) return undefined;
  const option = optionCard(action);
  if (!option || option.owner !== "self" || option.zone !== "deck")
    return undefined;
  return option.card;
}

/**
 * What a dig should come back with, highest first.
 *
 * The deck's Leader reads "[printed text omitted -- pnpm card:text <card>]" -- so until such a body is on a board
 * the restand is switched off and the deck is playing a 5000 Leader with no
 * engine. Every OP-17 list runs 8 diggers for that reason, and the dossier says
 * it twice: the cost-5 body is what Otama is for.
 *
 * `chooseGenericRules` answers a search with `nonSkip ?? effects[0]`, so without
 * a rule the pick is deck order rather than a choice: the cost-5 bodies that
 * switch the restand on come back less often than the cards that switch nothing
 * on, purely because of where they sit in the list.
 *
 * Scores *every* candidate rather than only the ones it wants, which is what
 * makes `preferAmong` bite: `rankAmong` hides the scored candidates below the
 * best and leaves unscored ones alone, so a rule that scored only the cost-5
 * bodies would leave the rest in the running for the generic ladder to take
 * first-offered anyway.
 */
function searchPickValue(action: LegalAction, t: Tactics): number | false {
  const card = searchPick(action);
  if (!card) return false;
  const observation = t.observation;
  if (COST_FIVE_BODIES.includes(card.cardNumber)) {
    // Among the bodies that switch the restand on, the one that can be cast
    // soonest: a dig on turn 2 that offers Kouzuki Oden beside Shanks is
    // choosing between a 5-drop that lands in three turns and a 10-drop that
    // lands in eight, and every turn without a cost-5 body on a board is a
    // turn the Leader is a 5000 body with no engine. Five points a cost step
    // keeps every cost-5 body above the Stage's 80 while the restand is off.
    const castability = card.cost === null ? 0 : card.cost - 5;
    return (restandIsLive(observation) ? 40 : 100) - castability;
  }
  // The Stage is the cheapest engine piece and nothing else in the list finds
  // it -- Perona names a <Slash> card or a green Event, and a Stage is neither,
  // so a dig that offers it is the only way it is ever tutored.
  if (card.cardNumber === COFFIN_BOAT) {
    return observation.self.stage === null ? 80 : 10;
  }
  // Total order over the rest, so no candidate is left unscored and taken by
  // deck order. Cost is the proxy: this deck's cheap cards are its diggers, and
  // digging for another digger is how a turn is spent finding nothing.
  return 20 + (card.cost ?? 0);
}

/**
 * How willingly one of your own Characters is returned to hand by Law, highest
 * first. Scores every candidate: `rankAmong` hides only what it scored.
 */
function bounceValue(action: LegalAction, t: Tactics): number | false {
  if (action.type !== "resolve-effect") return false;
  if (action.sourceCardNumber !== BOUNCE_REPLAY) return false;
  const option = optionCard(action);
  if (!option || option.owner !== "self" || option.zone !== "board")
    return false;
  const body = t.observation.self.board.find(
    (entry) => entry.instanceId === option.card.instanceId,
  );
  if (!body) return false;
  return body.rested ? 10 : 1;
}

/**
 * Which card Law's replay brings back, highest first.
 *
 * OP13-031 returns one of your own Characters to hand and then plays a
 * Character of cost 5 or less from hand *rested*. The bounce is the cost and
 * the replay is the payoff, and what the payoff is worth is the [On Play] it
 * re-buys -- that is what the card is in the list for. The replayed body
 * arrives rested, so it neither attacks nor blocks this turn, and its power
 * only decides what kind of wall it is afterwards.
 *
 * Nothing scored this decision, so it fell to the order the engine offered the
 * hand in: a vanilla 6000 with a 2000 Counter came back ahead of Kouzuki Oden
 * and both searchers, and the effect Law exists to buy was skipped.
 *
 * Cost breaks the tie among cards that do have one, because a free cast is
 * worth what it would have cost. Every candidate is scored, including the ones
 * with no clause at all: `rankAmong` hides only what it scored, so a rule that
 * named just the good ones would leave the rest for the generic ladder to take
 * first-offered anyway.
 *
 * Having an [On Play] and a cost is not enough to separate this list, though:
 * three of the deck's cost-5 bodies print one, so the tie went back to hand
 * order among exactly the cards the rule exists to choose between. What breaks
 * it is `advantageText`, the derived flag for a clause that puts a card back in
 * hand. Law's replay has already cost a bounce and the card that was bounced,
 * so a body that replaces itself is the one that leaves the turn no poorer,
 * and a body that only affects the board is paid for out of the hand.
 *
 * `removalText` is deliberately *not* ranked above it. Promoting the clause
 * that answers a body sounds like the same argument and is measurably the
 * opposite: it puts the deck's removal 5-drop ahead of its draw, and the
 * replayed body arrives rested, so what it buys is a wall and a card rather
 * than a removal the turn can use.
 */
function replayPickValue(action: LegalAction, t: Tactics): number | false {
  if (action.type !== "resolve-effect") return false;
  if (action.sourceCardNumber !== BOUNCE_REPLAY) return false;
  const option = optionCard(action);
  if (!option || option.owner !== "self" || option.zone !== "hand")
    return false;
  const facts = t.facts(option.card.cardNumber);
  if (!facts) return false;
  const onPlay = facts.rules.clauses.includes("[On Play]") ? 100 : 0;
  const replacesItself = facts.rules.advantageText ? 10 : 0;
  return onPlay + replacesItself + facts.cost;
}

/**
 * Which branch of Linlin's [When Attacking] this seat takes: never the one
 * that adds to her Life.
 *
 * Both branches cost one card -- hers or yours -- so the Life card is the whole
 * difference between them, and a Life card is a whole extra attack this deck
 * has to land through a Yellow board that heals. The mode option reaches the
 * ladder as a "beneficial effect" with nothing to say which branch, so it
 * takes the first one offered, which is the one that heals her.
 */
function linlinBranchValue(action: LegalAction): number | false {
  if (action.type !== "resolve-effect") return false;
  if (action.sourceCardNumber !== LINLIN_LEADER) return false;
  if (action.option.kind !== "mode") return false;
  return action.option.mode === "opponent-discards" ? 10 : -10;
}

/**
 * Which of your own cards pays a cost that trashes one, most disposable first.
 *
 * ST32-001 Kin'emon's "draw 2 cards and trash 1 card from your hand" raises the
 * choice, and the default answer is the first card offered, which is hand
 * order -- Shanks, when Shanks was drawn first. The order is the deck's plan read
 * backwards: a second Coffin Boat with the Stage already down is a blank; the
 * cost-5 bodies and the sweeper are the engine and the finish and go last; a
 * card that prints a Counter is Life not yet spent; among the rest, the
 * cheaper card is the one the diggers find again.
 *
 * The caller gates it on the source card, because the same "choose a card in
 * your hand" shape is raised by Law's replay, where the card chosen is the one
 * played and the worst card in hand is the wrong answer.
 */
function handDisposalValue(action: LegalAction, t: Tactics): number | false {
  if (action.type !== "resolve-effect") return false;
  const option = optionCard(action);
  if (!option || option.owner !== "self" || option.zone !== "hand")
    return false;
  const held = t.observation.self.hand.find(
    (card) => card.instanceId === option.card.instanceId,
  );
  if (!held) return false;
  if (held.cardNumber === COFFIN_BOAT && t.observation.self.stage !== null)
    return 100;
  let value = 50 - Math.min(held.cost, 10) * 3;
  if (COST_FIVE_BODIES.includes(held.cardNumber)) value -= 30;
  if (held.currentCounter > 0) value -= 10;
  return value;
}

/**
 * Which card Kin'emon's "draw 2 cards and trash 1" gives up.
 *
 * The draw resolves first, so the trash is chosen from the hand the two new
 * cards have just joined, and the generic ladder takes the first card offered.
 * Its own module so `pnpm deck:ab --disable op14-mihawk-hand-cost` prices it
 * apart from the rest of the deck's rules.
 */
export function createOp14MihawkHandCostModule(): PolicyModule {
  return heuristics("op14-mihawk-hand-cost", [
    preferAmong("Trash the card the hand can most spare.")
      .by(1)
      .action((action, t) => {
        if (action.type !== "resolve-effect") return false;
        if (action.sourceCardNumber !== "ST32-001") return false;
        // Kin'emon's own-side choices are its rest cost (`kinemon-cost`, a
        // `resource` option or the Leader) and this trash; `effectKind` tells
        // them apart.
        if (action.effectKind !== "draw-trash") return false;
        return handDisposalValue(action, t);
      }),
  ]);
}

/**
 * The decision OP17-099 Charlotte Linlin's [When Attacking] hands to the seat
 * it is attacking: which branch.
 *
 * A module of its own rather than two rules in `op14-mihawk`, so that
 * `pnpm deck:ab --disable op14-mihawk-linlin-branch` measures it apart: it
 * fires in one matchup and nowhere else. Registered for this Leader alone
 * while it is measured; the claim is about the format -- every seat is offered
 * this choice and every deck ladder takes the healing branch -- and the
 * widened registration is a different measurement.
 */
export function createOp14MihawkLinlinBranchModule(): PolicyModule {
  return heuristics("op14-mihawk-linlin-branch", [
    preferAmong(
      "Make Linlin take a card from your hand, not add one to her Life.",
    )
      .by(1)
      .action(linlinBranchValue),
  ]);
}

/**
 * OP-14 Green Dracule Mihawk, the rest-lock deck that refunds its own DON!!.
 *
 * ## The engine
 *
 * The Leader is `[Activate: Main] [Once Per Turn] You may rest 1 of your cards:
 * [printed text omitted -- pnpm card:text <card>]
 * cards as active. Then, you cannot play Character cards during this turn.`
 * Three DON!! back for one rested card, with three preconditions the printed
 * text buries: a Character of cost 5 or more has to be on *either* board
 * (`selector-count` with `player: "either"`), the *rested* DON!! pool has to be
 * non-empty for "set as active" to move anything, and the turn's Character
 * plays have to be over, because the sentence ends by forbidding them. So the
 * turn is: develop, then restand, then spend the refund on Events, DON!!
 * attachments and attacks.
 *
 * Resting is an asset everywhere else too -- OP01-055 turns two rested
 * Characters into two cards, OP06-038 is +4000 instead of +2000 once eight of
 * your cards are rested, OP14-023 Kikunojo stands itself back up after paying
 * -- and OP14-039 Coffin Boat is a Stage whose only job is to be the rest
 * target that costs nothing.
 *
 * Sources for the plan: the archetype guide at
 * https://onepiece.gg/green-mihawk-guide-best-decks-strategy-op14/ and the
 * deck's own dossier in `packages/agents/src/llm/dossiers/op14-mihawk.ts`.
 *
 * Which of the opponent's Characters the lock and rest effects name is still
 * `chooseGenericRules`'s first-offered, and `registry.ts` records why nothing
 * ranks it.
 *
 * `rank` and `veto` only, plus {@link createOp14MihawkDefensePolicy} for the
 * Counter phase and {@link createOp14MihawkBodySaveModule} ahead of it for an
 * attack on a cost-5 body -- the generic ladder still chooses, these rules
 * narrow what it chooses from. Price them with `pnpm deck:ab --deck "(Green)
 * Dracule Mihawk - 3rd Place EU Championship 26-27 S1" --disable op14-mihawk`.
 */
export function createOp14MihawkRulesPolicy(): PolicyModule {
  return heuristics("op14-mihawk", [
    // --- The Leader's restand, and its three preconditions ----------------
    //
    // "[printed text omitted -- pnpm card:text <card>]" gates *both* the DON!!
    // and the play restriction, so activating into a board without one rests a
    // card and buys literally nothing. The engine offers it anyway: the cost is
    // paid before the condition is read.
    never(
      "Do not rest a card for the restand without a cost-5 Character on a board.",
    )
      .when((t) => !restandIsLive(t.observation))
      .activate((action) => action.sourceCardNumber === MIHAWK_LEADER),

    // "[printed text omitted -- pnpm card:text <card>]" moves `min(3, rested)`. At the
    // top of a turn every DON!! is active and the rested pool is empty, so the
    // ability has to run *after* the turn's costs have been paid -- the same
    // ordering ST32's Kuina needs. Two is the threshold rather than one because
    // the card being rested is worth more than a single DON!!.
    never("Do not cash the restand with fewer than 2 rested DON!! to set up.")
      .when((t) => t.observation.self.restedDon < 2)
      .activate((action) => action.sourceCardNumber === MIHAWK_LEADER),

    // "[printed text omitted -- pnpm card:text <card>]" Develop first:
    // the refunded DON!! can buy Events, attachments and attacks, and a
    // Character play is the one thing it can never buy back. A veto rather than
    // a preference because the cost is the whole turn's development.
    never(
      "Develop every Character first; the restand locks Character plays out.",
    )
      .when((t) =>
        t.affordablePlays.some(
          (play) => t.playedCard(play)?.facts.category === "character",
        ),
      )
      .activate((action) => action.sourceCardNumber === MIHAWK_LEADER),

    // --- What the diggers come back with ----------------------------------
    // See `searchPickValue`: the largest decision class this deck has, and the
    // one nothing was steering.
    preferAmong("Dig for the body that switches the Leader's restand on.")
      .by(30)
      .action(searchPickValue),

    // --- Which card pays a rest cost --------------------------------------
    // See `restCostValue` and `REST_COST_SOURCES`.
    prefer("Pay a rest cost with the card that gives up the least.")
      .by(1)
      .action(restCostValue),

    // --- Activations that need a target before they need paying for -------
    //
    // The refresh-lock reads the board for *rested* Characters, so it is a
    // dead card into a board that is standing up: cast into an empty rested
    // set it locks nothing and is spent.
    never("Hold Electrical Luna until a rested body would be locked by it.")
      .when((t) => lunaLocks(t.observation).length === 0)
      .activate((action) => action.sourceCardNumber === BOARD_LOCK),

    // A rest-N cost is a `choose` with `min: N` and the engine does not check
    // that N candidates exist before offering the activation, so an Event whose
    // cost cannot be paid resolves into nothing with the card already spent.
    // Characters, because that is what the clause names: a board of the Leader
    // and Coffin Boat has nothing this Event can rest.
    never("Do not cast the draw Event without two Characters left to rest.")
      .when((t) => activeOwnCharacters(t.observation).length < 2)
      .activate((action) => action.sourceCardNumber === REST_DRAW),

    // Two of your own Characters rested for two cards. Worth it -- this deck
    // wants its own cards rested, and Kikunojo and a body that landed this turn
    // pay it for nothing -- but not while the only Characters left to rest are
    // the attacks that are winning the race.
    avoid("Do not rest the attackers for two cards while the race is live.")
      .by(12)
      .when(
        (t) =>
          t.viableAttacks.length > 0 &&
          t.race.role === "beatdown" &&
          freeRestPayers(t).length < 2,
      )
      .activate((action) => action.sourceCardNumber === REST_DRAW),

    // --- Development order -------------------------------------------------
    //
    // The Stage is the engine's cheapest piece: 1 DON!! for a card on play, a
    // free rest target every turn thereafter, and a DON!! back at end of turn.
    // The guide calls it the ideal target for the Leader's cost.
    prefer("Land Coffin Boat; it is the free rest target and refunds a DON!!.")
      .by(60)
      .when((t) => t.observation.self.stage === null)
      .play((card) => card.cardNumber === COFFIN_BOAT),

    // No cost-5 body, no restand -- so the first cost-5 body on the board is
    // worth more than its power says.
    prefer("Get a cost-5 body down; the Leader's restand is gated on one.")
      .by(45)
      .when((t) => !restandIsLive(t.observation))
      .play((card) => COST_FIVE_BODIES.includes(card.cardNumber)),

    // Vander Decken IX only shoots a *rested* Character, and its cost is a
    // {Fish-Man} out of hand -- so it is a 2-drop that does nothing at all
    // unless both halves are there. Played as a bare 2000 body it is still a
    // body, which is why this is a penalty rather than a `never`: the turn's
    // other plays go first, and it takes the DON!! left over. Into an empty
    // board `createOp14MihawkDeadRemovalModule` removes it outright.
    avoid(
      "Hold Vander Decken IX until a rested body and a {Fish-Man} are both there.",
    )
      .by(25)
      .play(
        (card, t) =>
          card.cardNumber === RESTED_KO &&
          (restedOpponents(t.observation).length === 0 ||
            // The card itself is a {Fish-Man}, and it leaves the hand as it is
            // played -- so it cannot be its own cost.
            !t.observation.self.hand.some(
              (held) =>
                held.instanceId !== card.instanceId &&
                FISH_MAN.includes(held.cardNumber),
            )),
      ),

    // The sweeper rests the whole board across the table, which is what both
    // refresh-locks need to have something to bite. Worth more than its power
    // says on a turn that can follow it with one.
    prefer("Sweep with Shanks; the locks need a rested board to bite.")
      .by(30)
      .when((t) => t.observation.opponent.board.some((card) => !card.rested))
      .play((card) => card.cardNumber === SWEEPER),

    // Bonney's lock names a rested Character or a rested DON!!, and the
    // mechanic offers neither branch into a board with nothing rested -- so
    // played then it is a 2000 body and its [On Play] is gone. A penalty rather
    // than a `never`: it is still a body, and the list runs one copy.
    avoid("Hold Bonney until something across the table is rested.")
      .by(20)
      .when(
        (t) =>
          restedOpponents(t.observation).length === 0 &&
          t.observation.opponent.restedDon === 0,
      )
      .play((card) => card.cardNumber === SINGLE_LOCK),

    // The diggers cost 1 and find the cost-5 body and the Events. Early only:
    // a 2000 body is not what turn 8 wants.
    prefer("Dig with a 1-cost searcher while the curve still has room.")
      .by(15)
      .when((t) => t.turn <= 6)
      .play((card) => SEARCHERS.includes(card.cardNumber)),

    // Otherwise develop the biggest body the DON!! can pay for.
    prefer("Develop the largest body the DON!! can pay for.").play(
      (card) => card.facts.power / 1000,
    ),

    // --- Which body Law returns to hand ------------------------------------
    //
    // The bounce is the cost and the replay is the payoff, and the replayed
    // body arrives rested either way. A rested Character has already attacked
    // or paid a rest cost this turn, so returning it and playing a body rested
    // gives up nothing; an active one is an attack the turn still had. The
    // generic ladder takes the first body offered, which is board order.
    preferAmong(
      "Return a body that has already attacked, not one still standing.",
    )
      .by(1)
      .action(bounceValue),

    // --- Attachments -------------------------------------------------------
    //
    // A DON!! on a rested unit is +1000 power on a card that cannot declare.
    // `dead-attachment` covers a unit that will not win its battle; this is the
    // cruder case, and this deck rests its own Leader for its own ability.
    never(
      "Do not attach DON!! to a card that has already been rested.",
    ).attachDon((action, t) => {
      const target = action.targetInstanceId;
      if (target.endsWith("-leader")) return t.observation.self.leader.rested;
      return (
        t.observation.self.board.find((card) => card.instanceId === target)
          ?.rested === true
      );
    }),
  ]);
}

/** The first turn on which either seat may declare an attack: CR 6-5-6-1. */
const FIRST_ATTACK_TURN = 3;

/**
 * Hold Kikunojo through the two turns in which nothing can battle.
 *
 * Kikunojo is a rest cost that pays itself back -- for OP01-055's two
 * Characters and for the Leader's restand -- and a 2000 Counter in hand until
 * then. Neither cost exists before turn 3: the restand is gated on a cost-5
 * body that cannot have landed, and the draw Event needs two Characters. So
 * the body buys nothing on turns 1 and 2, and it is cast at the price of the
 * Counter card and of a searcher that the same DON!! would have dug with. The
 * generic ladder develops the highest-cost legal card, and the deck rule
 * "develop the largest body" outscores "dig with a searcher" at 2000 power,
 * which is how Otama was left in hand for it.
 *
 * Kikunojo alone, and not the diggers: a 1-cost searcher on turn 1 is exactly
 * the play the deck wants, because the dig is what finds the cost-5 body.
 */
export function createOp14MihawkOpeningHoldModule(): PolicyModule {
  return heuristics("op14-mihawk-opening-hold", [
    never(
      "Hold Kikunojo through the opening; no rest cost exists for it to pay before turn 3, and in hand it is still a Counter card.",
    )
      .when((t) => t.observation.phase === "main" && t.turn < FIRST_ATTACK_TURN)
      .play((card) => card.cardNumber === SELF_RESTANDING),
  ]);
}

/**
 * Hold Vander Decken IX while the opponent has no Character at all.
 *
 * Its whole value is the [On Play]: a rested opposing Character K.O.'d for a
 * {Fish-Man} out of hand. Into an empty board there is nothing it could ever
 * have shot, the engine offers no effect, the card lands as a 2000 body and
 * the deck's cheap removal is gone for the game.
 *
 * A veto rather than a preference, and that is forced rather than chosen: the
 * generic ladder takes any `play-card` before any activation, so a card marked
 * down is still cast whenever it is the turn's only play, and the ordering
 * inside {@link createOp14MihawkRulesPolicy} never reaches the ability
 * underneath it.
 *
 * The board being empty, rather than merely standing, is what bounds this. A
 * board with Characters on it is a board the opponent attacks with, and what
 * attacked is rested when this seat's next turn opens, so there the [On Play]
 * is deferred rather than discarded. And against such a board the body is
 * worth casting on its own account: every cheap Character this deck puts down
 * is a rest cost, for OP01-055's two and for the Leader's own restand, so a
 * 2000 that never shoots anything is still fuel.
 */
export function createOp14MihawkDeadRemovalModule(): PolicyModule {
  return heuristics("op14-mihawk-dead-removal", [
    never(
      "Hold Vander Decken IX while the opponent has no Character; played into an empty board it is a 2000 body and the removal is gone.",
    )
      .when((t) => t.observation.opponent.board.length === 0)
      .play((card) => card.cardNumber === RESTED_KO),
  ]);
}

/**
 * Hold Vander Decken IX while nothing in hand can pay for its shot.
 *
 * The cost is a {Fish-Man} out of hand, and the card itself leaves the hand as
 * it is played, so a second copy or Kawamatsu has to be there. Without one
 * the [On Play] is not offered whatever is rested across the table.
 */
export function createOp14MihawkUnpaidRemovalModule(): PolicyModule {
  return heuristics("op14-mihawk-unpaid-removal", [
    never(
      "Hold Vander Decken IX until a {Fish-Man} is in hand to pay for its shot.",
    ).play(
      (card, t) =>
        card.cardNumber === RESTED_KO &&
        !t.observation.self.hand.some(
          (held) =>
            held.instanceId !== card.instanceId &&
            FISH_MAN.includes(held.cardNumber),
        ),
    ),
  ]);
}

/**
 * Never pay a rest cost with a Leader that still has its attack.
 *
 * Every rest cost in the deck -- the Leader's own restand, Kin'emon's
 * Leader-or-DON!! and OP01-055 -- is offered while the Leader is active, and
 * the deck develops before it attacks, so the question always arrives with the
 * Leader's attack still unspent. {@link restCostValue} prices the Leader last;
 * this removes it, because "last" still gets taken when it is the only payer
 * left: Kin'emon cast with the turn's last DON!! offers the Leader or nothing,
 * and two cards were being bought with the deck's only clock. Declining the
 * effect, or paying with a DON!!, is what remains.
 *
 * Gated on `couldAttack` rather than on the turn: a Leader that cannot attack
 * this turn anyway -- turns 1 and 2 -- costs nothing to rest.
 */
export function createOp14MihawkLeaderSwingModule(): PolicyModule {
  return heuristics("op14-mihawk-leader-swing", [
    never(
      "Do not rest the Leader for a cost while it still has its attack; the Leader is the deck's clock.",
    )
      .when((t) => t.observation.self.leader.couldAttack)
      .action((action) => {
        if (action.type !== "resolve-effect") return false;
        if (!REST_COST_SOURCES.includes(action.sourceCardNumber)) return false;
        const option = action.option;
        if (option.kind === "resource") return option.resource === "leader";
        const card = optionCard(action);
        return card?.owner === "self" && card.zone === "leader";
      }),
  ]);
}

/** ST32-001 Kin'emon: `pnpm card:text ST32-001`. Its [On Play] rests the Leader or a DON!! for two cards. */
const KINEMON = "ST32-001";

/**
 * Cast Kin'emon while a DON!! is still active to pay for its draw.
 *
 * Kin'emon's [On Play] is paid by resting the Leader or a DON!!, and the
 * ladder develops the highest-cost card first -- so a 1-cost Kin'emon lands
 * with the turn's last DON!! and the cost is offered as the Leader or nothing.
 * Every fire of {@link createOp14MihawkLeaderSwingModule} in the rules agent's
 * own games was that shape. Cast first, with two DON!! to spare, the draw is
 * paid with a DON!! that would have been spent anyway and the two cards are in
 * hand before the turn's other plays are chosen.
 *
 * Only when the rest of the turn still fits: the two DON!! Kin'emon takes must
 * leave every other affordable play affordable, or the rule would trade a
 * cost-5 body for two cards on a five-DON!! turn. Where it does not fit and
 * the turn's other plays leave one DON!!, Kin'emon is held rather than cast
 * for its body alone.
 */
export function createOp14MihawkKinemonFirstModule(): PolicyModule {
  return heuristics("op14-mihawk-kinemon-first", [
    prefer(
      "Cast Kin'emon first, while a DON!! is still active to pay for its draw.",
    )
      .by(200)
      .when(
        (t) =>
          t.don >= 2 &&
          t.affordablePlays.every((play) => {
            const card = t.playedCard(play);
            return (
              card === undefined ||
              card.cardNumber === KINEMON ||
              card.currentCost <= t.don - 2
            );
          }),
      )
      .play((card) => card.cardNumber === KINEMON),

    // The same claim's other half. Cast with the turn's last DON!!, the cost
    // is offered as the Leader or nothing: `createOp14MihawkLeaderSwingModule`
    // refuses the Leader, and the draw is skipped for a 1-cost 2000 body. Held,
    // the card is the same draw on a turn that has a DON!! to pay it with.
    never(
      "Do not cast Kin'emon with the turn's last DON!!; its draw needs one more to rest.",
    )
      .when((t) => t.don < 2 && t.observation.self.leader.couldAttack)
      .play((card) => card.cardNumber === KINEMON),
  ]);
}

/**
 * Which card Law's replay brings back.
 *
 * Its own module, beside the bounce rule in {@link
 * createOp14MihawkRulesPolicy} rather than inside it, because the two are
 * different claims about the same card and `pnpm deck:ab --disable
 * op14-mihawk-replay-pick` has to price this one alone.
 */
export function createOp14MihawkReplayPickModule(): PolicyModule {
  return heuristics("op14-mihawk-replay-pick", [
    preferAmong("Replay the body whose [On Play] is worth re-buying.")
      .by(1)
      .action(replayPickValue),
  ]);
}

/**
 * Pair each removal attack with the biggest body it can take, and take that
 * body with the smallest attacker that can.
 *
 * `threat-removal` promotes removal over pressing the Leader, but it scores
 * every removal attack the same `true`: *which* body dies and *which* attacker
 * pays both fall through to `chooseGenericRules`' "use the remaining viable
 * Character attack", which is offer order. So a Leader carrying three DON!!
 * swings into a rested 3000 while a rested 8000 and a rested 9000 stand on the
 * same board, and the two attackers that could have taken those are left
 * pointing at bodies anything could have killed.
 *
 * The score is the target's power first, the attacker's second and negative.
 * Target first makes the turn spend its attacks on the bodies that are hardest
 * to remove, which are the ones that come back hardest. Attacker second and
 * negative is what stops the biggest body taking a target a smaller one could
 * have taken: on a board where both the Leader and a 12000 beat a rested 8000,
 * scoring the target alone leaves the pairing to offer order again, and the
 * 12000 is the only attacker that also reaches the 9000 beside it.
 *
 * Only attacks aimed at a Character are scored, and only ones that win their
 * battle: attacks on the opposing Leader stay unscored, so `rankAmong` leaves
 * the press decision where it is, and a battle the attacker loses is not a
 * removal at all. Every removal that does win is scored, so none is left for
 * the ladder to take first-offered.
 */
function removalPairingValue(action: LegalAction, t: Tactics): number | false {
  if (action.type !== "attack") return false;
  const observation = t.observation;
  if (action.targetInstanceId === opponentLeaderId(observation)) return false;
  const target = observation.opponent.board.find(
    (card) => card.instanceId === action.targetInstanceId,
  );
  if (!target) return false;
  // Only attacks that actually win. Rewarding a small attacker is what pairs
  // the big bodies with the big targets, and without this bound it rewards the
  // smallest attacker on the board for pointing at the largest body on theirs
  // -- a battle it loses, scored above every real removal on offer.
  if (!t.viableAttacks.some((viable) => viable.actionId === action.actionId)) {
    return false;
  }
  const attacker = t.ownCurrentPower(action.attackerInstanceId);
  if (attacker === undefined) return false;
  return target.currentPower / 10 - attacker / 1000;
}

/**
 * {@link removalPairingValue}, in a module of its own.
 *
 * Separate from {@link createOp14MihawkRulesPolicy} for the reason its own
 * doc gives about two `rankAmong` rules in one module: contributions sum, and
 * the best is then kept per action type, so a second rule scoring attacks
 * beside this one would hide candidates neither of them meant to.
 */
export function createOp14MihawkRemovalPairingModule(): PolicyModule {
  return heuristics("op14-mihawk-removal-pairing", [
    preferAmong("Take the biggest body, with the smallest attacker that can.")
      .by(1)
      .action(removalPairingValue),
  ]);
}

/**
 * Keep a live [Blocker] home when the board opposite refreshes into lethal.
 *
 * Attacking rests the attacker, and a rested Character cannot block. So a
 * [Blocker] that swings has sold the block, and the turn it was sold for is
 * the turn the opponent needs one attack fewer.
 *
 * Nothing in the agent priced that, and the reason is a gap in what it can
 * see. `Tactics.facingLethal` is built from `incomingLeaderAttacks`, which
 * counts only opposing Characters that are *not rested* -- the right question
 * during the opponent's turn, where a body that has swung is spent, and the
 * wrong one during this seat's own Main phase, where every body that attacked
 * last turn is rested and stands back up in their Refresh Phase. On the board
 * this rule was written from, five rested Characters faced a Leader on 1 Life
 * and `facingLethal` read false. `nextTurnLeaderDamage` is the count that
 * survives refresh, and it is what this asks instead.
 *
 * Two bounds keep it from selling the game the other way:
 *
 *  - **Only when this seat is not winning first.** `lethalInRange` says the
 *    kill is on now, and a Blocker held back through the turn that wins is a
 *    Blocker held for a turn that never comes.
 *  - **Only the bodies that can still block.** `board.blocker` is `canBlock`,
 *    so a Character whose [Blocker] is switched off -- and in this deck
 *    OP13-031's is, above 1 Life -- is an ordinary attacker and is left alone.
 *
 * `nextTurnLeaderDamage` reads the opponent's bodies against this Leader's
 * *current* power, which on this seat's own turn includes the DON!! attached
 * to it this turn. Those give nothing on the opponent's turn, so the count is
 * a floor, and a floor is the right failure for a rule that gives up an
 * attack.
 */
export function createOp14MihawkBlockerHomeModule(): PolicyModule {
  return heuristics("op14-mihawk-blocker-home", [
    never(
      "Keep the [Blocker] home: the board opposite stands back up into more attacks than this Leader has Life, and a Blocker that attacked cannot block.",
    )
      .when(
        (t) =>
          !t.lethalInRange &&
          nextTurnLeaderDamage(t.observation) > t.observation.self.lifeCount,
      )
      .attack((action, t) => {
        const body = t.observation.self.board.find(
          (card) => card.instanceId === action.attackerInstanceId,
        );
        return body?.blocker === true;
      }),
  ]);
}

/**
 * The rested opposing Characters Electrical Luna would actually hold down.
 * The clause names "a cost of 7 or less", so a "+12 cost" giant is never one
 * -- `currentCost`, because that is the number the clause reads. A body that
 * is already held through its next Refresh Phase is not one either: a second
 * lock on it expires with the first, so a second copy cast into the same
 * rested board locks nothing the first did not.
 */
function lunaLocks(observation: GameObservation) {
  return restedOpponents(observation).filter(
    (card) =>
      card.currentCost <= 7 &&
      (card.cannotRefreshUntilTurn === undefined ||
        card.cannotRefreshUntilTurn <= observation.turn),
  );
}

/**
 * Hold Electrical Luna until it locks a board, not a body.
 *
 * Three DON!! for "will not become active" on whatever is rested and cheap
 * enough. Cast at the first rested 2-drop it costs the turn three DON!! of
 * attack power -- a whole Leader threshold -- to deny one 3000 attack, and
 * the ladder casts it there because "use an available Main-phase effect"
 * runs before attachments and attacks. The card is the finisher after the
 * sweeper has rested the whole board across the table; this waits for a
 * rested set worth the three DON!!.
 */
export function createOp14MihawkLunaHoldModule(): PolicyModule {
  return heuristics("op14-mihawk-luna-hold", [
    never("Hold Electrical Luna until it would lock at least two bodies.")
      .when((t) => lunaLocks(t.observation).length < 2)
      .activate((action) => action.sourceCardNumber === BOARD_LOCK),
  ]);
}

/**
 * Spend whatever Counter it takes to keep a cost-5 body on the board.
 *
 * `chooseGenericCounter`'s default caps a Character save at a 1000 shortfall,
 * one ordinary Counter card, which is the field's price for a body that can
 * simply be played again. This deck's cost-5 bodies are the gate on the
 * Leader's own ability: with none on a board the restand sets zero DON!! active
 * and the deck is a 5000 Leader with no engine, and the diggers that find the
 * next one cost a turn each. So a body under attack is defended as the Leader's
 * three DON!! a turn, not as 6000 power. The Life guard is unchanged: no body
 * is worth the cards that stop a lethal Leader hit.
 *
 * Decides only when the attacked card is one of {@link PROTECTED_CARDS};
 * every other Counter decision falls through to `op14-mihawk-defense`.
 */
export function createOp14MihawkBodySaveModule(): PolicyModule {
  return {
    id: "op14-mihawk-body-save",
    decide: ({ observation }): PolicyDecision | undefined => {
      if (observation.phase !== "counter") return undefined;
      const battle = observation.activeBattle;
      if (!battle || battle.targetInstanceId.endsWith("-leader")) {
        return undefined;
      }
      const defended = observation.self.board.find(
        (card) => card.instanceId === battle.targetInstanceId,
      );
      if (!defended || !PROTECTED_CARDS.has(defended.cardNumber)) {
        return undefined;
      }
      return chooseGenericCounter(observation, observation.legalActions, {
        protectedCards: PROTECTED_CARDS,
        duplicateCopiesAreSpendable: true,
        economicalCharacterDefense: false,
      });
    },
  };
}

/**
 * The opening hand, by the dossier's own advice: the deck needs a cheap engine
 * piece before it needs a finisher. Coffin Boat or a 1-cost digger is the keep.
 */
export function createOp14MihawkMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op14-mihawk-mulligan",
    keep: (observation) =>
      observation.self.hand.some(
        (card) =>
          card.cardNumber === COFFIN_BOAT ||
          SEARCHERS.includes(card.cardNumber),
      ),
    keepBecause: "Keep a hand with Coffin Boat or a 1-cost digger.",
    mulliganBecause: "Mulligan a hand with no cheap engine piece.",
  });
}

/**
 * The Counter phase, which is a `decide` rather than a narrowing and so cannot
 * live in the heuristics module above.
 *
 * Registered separately from it so `pnpm deck:ab --disable op14-mihawk-defense`
 * measures the two halves apart.
 */
export function createOp14MihawkDefensePolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== MIHAWK_LEADER) return undefined;
    const actions = observation.legalActions;

    if (observation.phase === "counter") {
      return chooseGenericCounter(observation, actions, {
        protectedCards: PROTECTED_CARDS,
        duplicateCopiesAreSpendable: true,
      });
    }
    return undefined;
  };
}
