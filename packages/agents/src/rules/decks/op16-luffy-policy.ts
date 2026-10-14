import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  chooseGenericBlock,
  chooseGenericCounter,
  chooseGenericTrigger,
  decision,
  optionCard,
  opponentLeaderId,
  pass,
  selfLeaderId,
  viableAttacks,
  type PolicyDecision,
} from "../generic-policy.js";
import type { RulesPolicy } from "../policy-chain.js";
import { avoid, heuristics, never, prefer, WEIGHT } from "../heuristics.js";
import { AREA_REPLACEMENT_KINDS } from "../format/replacement.js";

import { createMulliganModule } from "../mulligan.js";
import { CHARACTER_AREA_LIMIT, tacticsFor, type Tactics } from "../tactics.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * Green/Blue Impel Down Luffy: the deck's `decide` ladder, and the rank modules
 * that narrow what it chooses from.
 *
 * What the Leader actually converts, because every rule in this file follows
 * from it. OP16-022's `[Activate: Main] [Once Per Turn]` sets up to 2 DON!! **as
 * active**, gated on every Character you control having the {Impel Down} type.
 * The engine moves them out of `restedDon` (`mechanics/op16-main.ts`, an
 * `activate-don` node that splices the rested pool), and DON!! becomes rested
 * only by paying a cost -- a Character's or an Event's. Giving DON!! to a body
 * rests nothing. So the ability is not ramp, it is a refund of DON!! already
 * spent on *costs*: spend two, take two back, spend them again. A turn that
 * gives its DON!! away instead of paying costs with it has nothing to refund,
 * and the refund is the whole reason the deck develops faster than its DON!!
 * count allows.
 *
 * Two consequences shape the ladder below. Development comes before power:
 * OP16-054, OP16-055, OP16-045, OP16-026 and OP16-048 all draw or search on
 * play, so a DON!! moved from a play to an attachment costs a card *and* the
 * refund it would have earned. And the Leader is activated once two DON!! are
 * rested, not the moment one is: the node takes what is there, so an
 * activation over a single rested DON!! is a refund of one, spent for the
 * turn.
 *
 * What the deck attacks with is cheap bodies whose power is switched on by one
 * DON!! each -- OP16-055 copies the opposing Leader's power and so always beats
 * it, OP16-034 grows with the names on the board -- so once the board is
 * built, the DON!! left over is worth more spread one per body than stacked.
 *
 * Two of the things that hold this deck down are not deck knowledge and so are
 * not here: the Character area limit and `chooseEffect` answering a full-board
 * replacement with first-offered, which trashes the engine piece the turn was
 * built around. Both are format fundamentals (`board-replacement-cost`,
 * `area-replacement-choice`).
 */

const LEADER = "OP16-022";
const KEEP = new Set(["OP16-034", "OP16-054", "OP16-055", "OP16-026"]);
const PROTECTED = new Set(["OP16-045", "OP16-048", "OP16-056"]);
const PLAY_PRIORITY = new Map([
  ["OP16-048", 110],
  ["OP16-045", 100],
  ["OP16-026", 95],
  ["OP16-056", 90],
  ["OP16-054", 85],
  ["OP16-055", 80],
  ["OP16-034", 75],
  ["OP16-042", 60],
  ["ST30-014", 55],
  ["OP16-027", 50],
  ["OP16-032", 45],
  ["OP15-032", 20],
]);

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;
type AttachAction = Extract<LegalAction, { type: "attach-don" }>;
type ActivateAction = Extract<LegalAction, { type: "activate-main" }>;

/** Prisoner of Impel Down: eight copies, playable for free off Buggy. */
const PRISONER = "OP16-042";

/**
 * The cost ceiling on what OP16-045 Crocodile and OP16-026 Emporio.Ivankov play
 * for free: "a cost of 2 or less". It is what makes a cost-2 body worth paying
 * with and a cost-5 one not.
 */
const FREE_PLAY_CEILING = 2;

/**
 * The Characters whose power is gated behind `[DON!! x1]`, and which each need
 * exactly one DON!! to switch on, in the order the first spare DON!! should
 * reach them.
 *
 * OP16-055 Mr.2 first: with one DON!! its base power *becomes* the opposing
 * Leader's while it attacks, and the attacker wins ties, so one DON!! on it is
 * an attack that beats the Leader whatever the Leader reads. OP16-034
 * Monkey.D.Luffy next: a 0-power body until one DON!! turns on +1000 for every
 * distinct Character name you control, so on the wide board this deck builds
 * it is the biggest single-DON!! lift after Mr.2. OP16-027 Jinbe is a 2000
 * until one DON!! turns on +2000. OP16-054 Mr.1 last, because its +3000 is
 * also gated on holding five or more cards in hand, and a hand that has just
 * developed rarely does.
 */
const DON_SWITCHED = ["OP16-055", "OP16-034", "OP16-027", "OP16-054"] as const;

/** Mr.1's `[DON!! x1]` clause asks for a hand of this size as well. */
const MR1_HAND_FLOOR = 5;

/** Base power the ST30-014 Mr.3(Galdino) gift is printed for. */
const MR3_GIFT_BASE_POWER = 6000;

/**
 * Whether one DON!! actually switches this body's clause on right now, which
 * is the only reason to give a `[DON!! x1]` body its first DON!!.
 */
function switchWouldPay(
  observation: GameObservation,
  cardNumber: string,
): boolean {
  if (cardNumber === "OP16-054") {
    return observation.self.hand.length >= MR1_HAND_FLOOR;
  }
  return true;
}

/**
 * One DON!! onto a `[DON!! x1]` Character that has none and can still attack
 * this turn, taking the bodies in {@link DON_SWITCHED} order.
 *
 * `couldAttack` is the load-bearing filter, not politeness: a DON!! on a
 * Character played this turn, or on one already rested, buys nothing this turn
 * and is returned in the next Refresh Phase (`drawForTurn` in `engine.ts`
 * empties `attachedDon` back into the active pool), so it is simply thrown away.
 */
function donSwitchAttachment(
  observation: GameObservation,
  actions: readonly LegalAction[],
  t: Tactics,
): AttachAction | undefined {
  for (const cardNumber of DON_SWITCHED) {
    if (!switchWouldPay(observation, cardNumber)) continue;
    const body = observation.self.board.find(
      (card) =>
        card.cardNumber === cardNumber &&
        card.attachedDon === 0 &&
        t.couldAttack(card.instanceId),
    );
    if (!body) continue;
    const attach = actions.find(
      (action): action is AttachAction =>
        action.type === "attach-don" &&
        action.targetInstanceId === body.instanceId,
    );
    if (attach) return attach;
  }
  return undefined;
}

/** Card-shaped options on the opponent's board, highest-value target first. */
function opponentBoardTargets(
  observation: GameObservation,
  actions: readonly EffectAction[],
) {
  return actions
    .flatMap((action) => {
      const option = optionCard(action);
      if (!option || option.owner !== "opponent" || option.zone !== "board")
        return [];
      const body = observation.opponent.board.find(
        (card) => card.instanceId === option.card.instanceId,
      );
      const power = option.currentPower ?? option.card.power ?? 0;
      // A Blocker is the body an effect most wants to answer, because it is
      // the one that turns an attack on the Leader into an attack on itself;
      // then the biggest attacker; cost breaks ties among equals.
      const score =
        (body?.blocker ? 10_000 : 0) + power + (option.card.cost ?? 0);
      return [{ action, score }];
    })
    .sort((left, right) => right.score - left.score);
}

/**
 * Whether an offered option is the effect declining to name anything else --
 * `skip`, "no more cards", and the prefixed spellings the imperative effects
 * use.
 */
function isDecline(action: EffectAction): boolean {
  return action.option.kind !== "card";
}

function chooseEffect(
  observation: GameObservation,
  actions: EffectAction[],
): PolicyDecision {
  const t = tacticsFor(observation);
  const search = actions
    .filter(
      (action) =>
        action.option.kind === "card" && action.option.zone === "revealed",
    )
    .sort((left, right) => searchValue(right, t) - searchValue(left, t))[0];
  if (search) return decision(search, "Take an Impel Down search result.");

  const fromHand = actions
    .filter((action) => {
      const option = optionCard(action);
      return option?.owner === "self" && option.zone === "hand";
    })
    .sort(
      (left, right) =>
        (PLAY_PRIORITY.get(optionCard(right)?.card.cardNumber ?? "") ?? 0) -
        (PLAY_PRIORITY.get(optionCard(left)?.card.cardNumber ?? "") ?? 0),
    )[0];
  if (fromHand)
    return decision(fromHand, "Free-play the best Impel Down body in hand.");

  // Every removal, rest and lock in the deck names a Character on the
  // opponent's board, and "up to N" offers a decline beside each candidate.
  // First-offered took whichever body the engine listed first; the best
  // target is the Blocker or the biggest attacker.
  const target = opponentBoardTargets(observation, actions)[0];
  if (target)
    return decision(
      target.action,
      "Aim the effect at the Blocker or the biggest opposing attacker.",
    );

  return decision(
    actions.find((action) => !isDecline(action)) ?? actions[0]!,
    "Resolve the best available Impel Down effect.",
  );
}

/**
 * What a revealed card is worth to the hand that searched for it.
 *
 * The priority table, with a thumb on the scale for a cost-2 body while the
 * board is still being built: the Leader's refund is gated on a trait-pure
 * board existing, and a 5-cost Buggy taken on turn 1 sits in hand for three
 * turns while a Mr.2 would have been on the field earning the refund.
 */
function searchValue(action: EffectAction, t: Tactics): number {
  const card = optionCard(action)?.card;
  if (!card) return 0;
  const priority = PLAY_PRIORITY.get(card.cardNumber) ?? 0;
  const early = t.donOnField <= 4 && (card.cost ?? 99) <= FREE_PLAY_CEILING;
  return priority + (early ? 50 : 0);
}

/**
 * The attachment that turns a body which cannot win a battle into one that can,
 * or `undefined` when no attachment on the table does that.
 *
 * The deck's own bodies are why this is worth a ladder step. OP16-054 is a
 * cost-2 2000, and two or three of them are on the board by turn 5; against a
 * 5000 Leader every one of them is invisible to `viableAttacks`, which filters
 * to attacks that already win. So a ladder without this step never sees an
 * attack for them and ends turns holding five Characters and making two
 * attacks -- while three of those bodies stand active and three DON!! would
 * have lifted one of them over the Leader.
 *
 * Only conversions the DON!! on hand can actually finish are offered. A
 * part-paid threshold buys nothing -- the same arithmetic `tactics.ts` states
 * for Counter cards -- so a body needing four DON!! when three are active is not
 * a candidate.
 *
 * The cheapest conversion wins, and the opposing Leader breaks ties, because the
 * point of the swing is Life.
 */
function enablingAttachment(
  observation: GameObservation,
  actions: readonly LegalAction[],
): AttachAction | undefined {
  const attachable = new Set(
    actions
      .filter((action) => action.type === "attach-don")
      .map((action) => action.targetInstanceId),
  );
  if (attachable.size === 0) return undefined;
  const opponentLeader = opponentLeaderId(observation);
  const budget = observation.self.activeDon;

  let best: { attacker: string; cost: number; atLeader: boolean } | undefined;
  for (const action of actions) {
    if (action.type !== "attack") continue;
    if (!attachable.has(action.attackerInstanceId)) continue;
    // The engine's own count, not a deficit divided by 1000. Every body this
    // step exists to lift has its power gated behind `[DON!! x1]`, so the first
    // DON!! onto one is worth whatever its text says rather than 1000. The
    // field is absent exactly when the attack already wins.
    //
    // `donToWinBattle`, not `donToReach`: the latter prices the lift against
    // an unpaid defensive ability the defender may still decline to pay for,
    // and buying only lifts that clear *that* number is badly wrong against a
    // Leader like ST34 Katakuri. Making the defender spend the card is worth
    // more than holding the swing back.
    const cost = action.donToWinBattle;
    if (cost === undefined) continue;
    if (cost > budget) continue;
    const atLeader = action.targetInstanceId === opponentLeader;
    if (
      best === undefined ||
      cost < best.cost ||
      (cost === best.cost && atLeader && !best.atLeader)
    ) {
      best = { attacker: action.attackerInstanceId, cost, atLeader };
    }
  }
  if (!best) return undefined;
  const attacker = best.attacker;
  return actions.find(
    (action): action is AttachAction =>
      action.type === "attach-don" && action.targetInstanceId === attacker,
  );
}

/**
 * Whether the DON!! on hand can buy enough Leader hits to end the game this
 * turn, counted the way the kill is actually counted: the hits already
 * winning plus the cheapest conversions the budget affords, against a Life
 * total that needs one hit more than it holds (an attack wins only when it is
 * declared at a player already on 0 Life), with no Blocker on the other side
 * to turn one of them away.
 *
 * This is the one position where an attachment is worth more than a play:
 * a body developed now attacks next turn, and there is no next turn to attack
 * in if the hits land. It is an upper bound -- Counter cards are hidden -- so
 * it decides the order of the turn and nothing else; the development still
 * follows once the conversions are bought.
 */
function canPushLethal(observation: GameObservation, t: Tactics): boolean {
  if (t.opponentBlockers > 0) return false;
  const opponentLeader = opponentLeaderId(observation);
  const attacks = observation.legalActions.filter(
    (action): action is Extract<LegalAction, { type: "attack" }> =>
      action.type === "attack" && action.targetInstanceId === opponentLeader,
  );
  let hits = attacks.filter(
    (action) => action.donToWinBattle === undefined,
  ).length;
  const prices = attacks
    .map((action) => action.donToWinBattle)
    .filter((cost): cost is number => cost !== undefined)
    .sort((left, right) => left - right);
  let budget = observation.self.activeDon;
  for (const price of prices) {
    if (price > budget) break;
    budget -= price;
    hits += 1;
  }
  return hits >= t.opponentLife + 1;
}

/**
 * A `[Main]` Event, offered, whose trade is worth the DON!! right now.
 *
 * Each of the deck's four is a tempo card that competes with development for
 * the same DON!!, and every one of them was being cast the moment it had any
 * legal target: four DON!! to rest a 1-cost body, seven to bottom one 5-cost.
 * The gates below are the trades a pilot would actually take, stated against
 * the opponent's board; development has already had its turn by the time
 * the ladder reaches here, so what these spend is the DON!! left over.
 */
function worthwhileEvent(
  observation: GameObservation,
  actions: readonly LegalAction[],
  t: Tactics,
): ActivateAction | undefined {
  const theirs = observation.opponent.board;
  const winningLeaderAttacks = t.leaderAttacks.length;
  return actions.find((action): action is ActivateAction => {
    if (action.type !== "activate-main") return false;
    switch (action.sourceCardNumber) {
      case "OP11-061": {
        // Gum-Gum Jet Culverin (3): bottom a Character of base cost 4 or less.
        // Three DON!! for a cost-1 body is a loss; for a Blocker or a cost-3+
        // engine it is a body the opponent paid more for than we did.
        return theirs.some(
          (card) => card.cost <= 4 && (card.blocker || card.cost >= 3),
        );
      }
      case "OP06-058": {
        // Gravity Blade Raging Tiger (7): bottom up to two Characters of cost
        // 6 or less. Seven DON!! is a whole turn, so it wants two real bodies
        // -- eight or more cost between them -- or a Blocker plus another.
        const eligible = theirs
          .filter((card) => card.cost <= 6)
          .sort((left, right) => right.cost - left.cost);
        if (eligible.length < 2) return false;
        const [first, second] = eligible;
        return (
          first!.cost + second!.cost >= 8 ||
          eligible.some((card) => card.blocker)
        );
      }
      case "OP12-037": {
        // Asura (1, rest 3): rest up to two of the opponent's cards. Resting
        // a Blocker is what it is for -- a rested Blocker cannot block, so it
        // turns a Leader hit that would be turned away into one that lands.
        // Worth it only when there is a winning Leader hit to unblock.
        return (
          winningLeaderAttacks > 0 &&
          theirs.some((card) => card.blocker && !card.rested)
        );
      }
      case "OP13-040": {
        // "I Know You're Strong..." (1, rest 2): rested Characters of cost 7
        // or less do not refresh, so they neither attack nor block next turn.
        // Three DON!! to take two attacks off the opponent's next turn is a
        // trade; to hold down one small body it is not.
        const threats = theirs.filter(
          (card) => card.rested && card.cost <= 7 && card.power >= 5000,
        );
        return (
          threats.length >= 2 || threats.some((card) => card.power >= 7000)
        );
      }
      default:
        return false;
    }
  });
}

/**
 * Whether trashing OP16-056 Mr.3 for two cards and an attack lock is worth
 * the 5000 body: when the opponent has an attacker worth locking through
 * their next turn, or the hand has run too low to keep developing.
 *
 * Asked after the attack step so the body swings first; the engine does not
 * need it active to activate.
 */
function mr3TrashWorthIt(observation: GameObservation): boolean {
  return (
    observation.opponent.board.some(
      (card) => card.cost <= 9 && card.power >= 5000,
    ) || observation.self.hand.length <= 2
  );
}

/** The opening hand: one of the four low-cost Impel Down engine pieces. */
export function createOp16LuffyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op16-luffy-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => KEEP.has(card.cardNumber)),
    keepBecause: "Keep a low-cost Impel Down engine.",
    mulliganBecause: "Mulligan for an Impel Down searcher or draw engine.",
  });
}

export function createOp16LuffyRulesPolicy(): RulesPolicy {
  return (observation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== LEADER) return undefined;
    const actions = observation.legalActions;

    const effects = actions.filter(
      (action): action is EffectAction => action.type === "resolve-effect",
    );
    if (effects.length > 0) return chooseEffect(observation, effects);
    const trigger = chooseGenericTrigger(actions);
    if (trigger) return trigger;
    const block = chooseGenericBlock(observation, actions);
    if (block) return block;
    if (observation.phase === "counter") {
      return chooseGenericCounter(observation, actions, {
        protectedCards: PROTECTED,
      });
    }
    if (observation.phase !== "main") return undefined;
    const t = tacticsFor(observation);

    const leaderRefresh = actions.find(
      (action): action is ActivateAction =>
        action.type === "activate-main" &&
        action.sourceCardNumber === LEADER &&
        action.sourceInstanceId === `${observation.viewer}-leader`,
    );
    // The node refunds what is rested, up to two. Over one rested DON!! it
    // refunds one and the once-per-turn is spent, so the activation waits
    // until a second cost has been paid -- unless nothing else this turn will
    // pay one, in which case the single refund is taken below.
    if (leaderRefresh && observation.self.restedDon >= 2)
      return decision(leaderRefresh, "Refund two DON!! before developing on.");

    const plays = actions.filter(
      (action): action is Extract<LegalAction, { type: "play-card" }> =>
        action.type === "play-card",
    );

    // Closing beats developing: a body played now attacks next turn, and the
    // conversions this buys mean there is no next turn.
    if (plays.length > 0 && canPushLethal(observation, t)) {
      const closing = enablingAttachment(observation, actions);
      if (closing)
        return decision(
          closing,
          "The DON!! on hand buys the hits that end the game; convert before developing.",
        );
    }

    const priorities = new Map(
      observation.self.hand.map((card) => [
        card.instanceId,
        PLAY_PRIORITY.get(card.cardNumber) ?? 0,
      ]),
    );
    const play = plays.sort(
      (left, right) =>
        (priorities.get(right.cardInstanceId) ?? 0) -
        (priorities.get(left.cardInstanceId) ?? 0),
    )[0];
    if (play) return decision(play, "Develop the best Impel Down engine card.");

    // Nothing more will be paid for this turn, so a single rested DON!! is
    // all the refund there is: take it, it is still an attachment.
    if (leaderRefresh)
      return decision(leaderRefresh, "Refund the DON!! the turn has rested.");

    // ST30-014 Mr.3(Galdino) hands rested DON!! to 6000-base bodies, two each.
    // After the Leader has taken its two, the rest of the rested pool is power
    // on Buggy, Crocodile or a Prisoner that can still swing this turn.
    const gift = actions.find(
      (action): action is ActivateAction =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "ST30-014" &&
        observation.self.board.some(
          (card) =>
            (card.basePower ?? card.power) === MR3_GIFT_BASE_POWER &&
            t.couldAttack(card.instanceId),
        ),
    );
    if (gift)
      return decision(
        gift,
        "Give the rested DON!! to a 6000 body that can swing.",
      );

    const event = worthwhileEvent(observation, actions, t);
    if (event)
      return decision(event, "Spend the DON!! left over on a trade that pays.");

    const enabling = enablingAttachment(observation, actions);
    if (enabling)
      return decision(
        enabling,
        "Lift a Character over its target so it can attack at all.",
      );

    const switchOn = donSwitchAttachment(observation, actions, t);
    if (switchOn)
      return decision(
        switchOn,
        "Switch on a [DON!! x1] attacker before the attack step.",
      );

    const attacks = viableAttacks(observation, actions);
    const leaderAttack = attacks.find(
      (action) =>
        action.attackerInstanceId === selfLeaderId(observation) &&
        action.targetInstanceId === opponentLeaderId(observation),
    );
    if (leaderAttack)
      return decision(leaderAttack, "Pressure with the Leader.");
    const characterAttack = attacks.find(
      (action) => action.targetInstanceId === opponentLeaderId(observation),
    );
    if (characterAttack)
      return decision(characterAttack, "Pressure with an efficient Character.");
    // Every branch above names the opposing *Leader* as the target. Without a
    // branch for any other attack, a turn where the Leader was not a
    // candidate ended without an attack, even with a full board and nine
    // attacks on the table.
    //
    // That is not a rare position: `threat-removal` is a format-wide `rank`
    // module, and `applyRanking` hides every candidate scoring below the best in
    // its action type. When it prefers an attack on a rested opposing Blocker or
    // engine, the Leader-target attacks are the ones it hides -- exactly the ones
    // the two branches above are written to find. So this policy takes the
    // attack the fundamental is pointing at, as every other deck policy in the
    // registry ends its attack step.
    if (attacks[0])
      return decision(
        attacks[0],
        "Take the remaining viable attack rather than ending the turn.",
      );

    // After the attacks: OP16-056 has swung, and its `[Activate: Main]` does
    // not need it active. Let's Go!! is only offered over five names, and
    // restands the board for a second wave.
    const lateMain = actions.find(
      (action): action is ActivateAction =>
        action.type === "activate-main" &&
        (action.sourceCardNumber === "OP16-038" ||
          action.sourceCardNumber === "OP15-032" ||
          (action.sourceCardNumber === "OP16-056" &&
            mr3TrashWorthIt(observation))),
    );
    if (lateMain)
      return decision(
        lateMain,
        "Convert rested cards into another attack cycle.",
      );

    // What is left goes onto a body with a winning swing still in it -- the
    // Leader first, since it attacks every turn -- where the extra power is
    // Counter the defender has to find. Never onto one that cannot swing, or
    // that swings and loses: a DON!! given there comes back untouched at the
    // next Refresh, while one left active can still pay for a Counter Event.
    const leader = selfLeaderId(observation);
    const swinging = new Set(
      attacks.map((action) => action.attackerInstanceId),
    );
    const spare = actions.find(
      (action): action is AttachAction =>
        action.type === "attach-don" &&
        (action.targetInstanceId === leader ||
          swinging.has(action.targetInstanceId)) &&
        t.couldAttack(action.targetInstanceId),
    );
    if (spare)
      return decision(
        spare,
        "Give the spare DON!! to a body that still swings.",
      );
    return decision(pass(actions), "End the turn with no useful action left.");
  };
}

/**
 * Prisoner of Impel Down is a Counter card and Buggy's free body, not a play.
 *
 * Eight copies, cost 6 for 6000 power -- the worst rate in the deck -- with a
 * 2000 Counter, and OP16-048 Buggy's `[On Play]` puts one on the board for free.
 * Deck guides are consistent that the copies are there for the Counter and for
 * Buggy to cheat out, so paying six DON!! for one is spending the turn's whole
 * development on the deck's cheapest card. The deck policy's priority table puts
 * it at 60, *above* Boa Hancock, so it hard-casts them.
 *
 * Ranked, so a hand whose only affordable play is a Prisoner still plays it.
 *
 */
export function createOp16LuffyPrisonerModule(): PolicyModule {
  return heuristics("op16-luffy-prisoner", [
    avoid(
      "Prisoner of Impel Down is the deck's Counter and Buggy's free body, not a six-cost play.",
    )
      .by(WEIGHT.deck)
      .play((card) => card.cardNumber === PRISONER),
  ]);
}

/**
 * What a body on this deck's board is worth once the turn has switched it on,
 * in power: the number a full-board swap should be priced against.
 *
 * The format prices a body at its printed power, and two of this deck's best
 * attackers print almost none. OP16-055 Mr.2 is a 1000 that attacks at the
 * opposing Leader's power once it holds a DON!!, and OP16-034 Monkey.D.Luffy
 * is a 0 that attacks at 1000 for every distinct name beside it. Priced at
 * their printed numbers they are always the weakest body, so a Mr.1 played
 * onto a full board trashes the Mr.2 that was going to hit the Leader.
 */
function switchedOnWorth(
  observation: GameObservation,
  card: GameObservation["self"]["board"][number],
): number {
  if (card.cardNumber === "OP16-055") {
    return Math.max(
      card.currentPower,
      observation.opponent.leader.currentPower,
    );
  }
  if (card.cardNumber === "OP16-034") {
    const names = new Set(observation.self.board.map((body) => body.name));
    return Math.max(card.currentPower, names.size * 1000);
  }
  return card.currentPower;
}

/**
 * Price a full-board swap at what the bodies do, not what they print.
 *
 * Two rules from the same valuation. The veto: with five Characters down, a
 * play whose printed power is no more than the least valuable body's
 * switched-on worth is a swap that trades down -- the same claim
 * `board-replacement-cost` makes format-wide, read through
 * {@link switchedOnWorth} so a 1000-power Mr.2 that attacks at 5000 is not the
 * body every 2000 in hand is allowed to replace. The rank: when a swap does
 * go through, the body given up is the one worth least by the same measure,
 * so the choice `area-replacement-choice` scores on printed power alone is
 * pulled off Mr.2 and Luffy and onto the body that actually swings for less.
 */
export function createOp16LuffyBoardModule(): PolicyModule {
  return heuristics("op16-luffy-board", [
    never(
      "The Character area is full, and this body swings for no more than the one it would replace.",
    )
      .when((t) => t.observation.self.board.length >= CHARACTER_AREA_LIMIT)
      .play((card, t) => {
        if (card.facts.category !== "character") return false;
        const least = Math.min(
          ...t.observation.self.board.map((body) =>
            switchedOnWorth(t.observation, body),
          ),
        );
        return card.facts.power <= least;
      }),
    avoid(
      "Keep the body that swings at the Leader once it holds a DON!!, whatever it prints.",
    )
      .by(WEIGHT.format)
      .effect((action, t) => {
        if (!AREA_REPLACEMENT_KINDS.includes(action.effectKind)) return false;
        const option = optionCard(action);
        if (!option || option.owner !== "self" || option.zone !== "board")
          return false;
        const body = t.observation.self.board.find(
          (card) => card.instanceId === option.card.instanceId,
        );
        if (!body) return false;
        // In thousands, the unit `area-replacement-choice` scores in, and only
        // the part its printed-power term does not already carry.
        return (
          (switchedOnWorth(t.observation, body) - body.currentPower) / 1000
        );
      }),
  ]);
}

/**
 * Pay Crocodile's return cost with a body worth no more than the body it buys,
 * and otherwise decline it.
 *
 * OP16-045 is `[On Play] You may return 1 of your Characters with a cost of 2 or
 * [printed text omitted -- pnpm card:text OP16-045]
 * cost of 2 or less from your hand.` Both halves are optional, and the deck
 * policy answers the choice with `actions.find((action) => action.optionId !==
 * "skip")` -- first offered.
 *
 * What that costs, from the trace this rule was written against
 * (`OP16-LUFFY-GREENBLUE` vs ST31, seed `...-ST31-3`, turn 7): Crocodile returned
 * **Buggy**, the only Character on the board that could still attack, to free-play
 * a cost-1 OP16-034 with 0 printed power. The deck then paid five DON!! to replay
 * Buggy, which was now summoning-sick. Nine DON!! spent, three bodies on the
 * board, and not one attack declared all turn.
 *
 * Stated as a trade the rule can measure: you are paying a body on the field for
 * a body in your hand, so pay with one that costs no more than the {@link
 * FREE_PLAY_CEILING} the ability buys. At cost 2 the deck's bodies are Mr.1,
 * Mr.2, Mr.3 and Jinbe, three of which draw on `[On Play]` and so are *worth*
 * bouncing; at cost 4 or more the return is a tempo loss whatever comes back.
 *
 * A cost-2 candidate scores above `skip`, a dearer one scores below it, and
 * `applyRanking` keeps the best in the group -- so with nothing cheap on the
 * board the ability is simply declined, which is what the printed "You may"
 * allows and what the first-offered fallback never does.
 *
 */
export function createOp16LuffyCrocodileModule(): PolicyModule {
  return heuristics("op16-luffy-crocodile", [
    prefer(
      "Pay a return-to-hand cost with a body no dearer than the one it buys, or decline it.",
    )
      .by(WEIGHT.deck)
      .effect((action) => {
        if (action.effectKind !== "return-own-for-free-play") return false;
        const option = optionCard(action);
        if (!option || option.owner !== "self") return false;
        // `cost` is nullable on a `KnownCardRef` because Leaders print Life
        // there; a board Character always has one, and treating a missing cost
        // as dear is the safe reading of "do not pay with this".
        const cost = option.card.cost ?? 99;
        // Positive at or below the ceiling, negative above it, so `skip` at zero
        // sits between the two cases rather than losing to both.
        return cost <= FREE_PLAY_CEILING ? 1 : -cost;
      }),
  ]);
}
