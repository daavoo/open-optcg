/**
 * (Red/Blue) Lucy's policy.
 *
 * ## The deck's engine
 *
 * Sixteen of the fifty are Events and four more are a Stage, and the deck is
 * built to activate the Events without paying for them: OP15-014 Bartolomeo's
 * `[On Play]` casts a {Dressrosa} Event of base cost 3 or less out of hand,
 * OP15-046 Sabo's casts one of any cost. The Leader turns each such turn into a
 * card -- its `[Activate: Main]` draws once a turn after an Event of base cost
 * 3 or more has been activated -- and turns every Event still in hand into
 * defence: its battle clause trashes any number of them for +1000 each, and
 * OP15-057 Dressrosa Kingdom trashes one for +2000 on any one card. The trash
 * those Events land in is the third resource: OP15-021 costs 1 rather than 4
 * and OP15-006 Cavendish is a 6000 body once four Events sit there.
 *
 * So a card in hand is three things at once -- the next free cast, the next
 * +1000, and the next Event in the trash -- and every rule below prices a card
 * against all three. The 1-cost searchers exist to find the two bodies that
 * cast; the bodies exist to cast the Events; the Events, cast or trashed,
 * feed the Leader's draw and the trash counts.
 */
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  decision,
  mustPreventCurrentLeaderHit,
  willSpendToSaveCharacter,
  type PolicyDecision,
} from "../generic-policy.js";
import { counterCardsFromHand } from "../combat.js";
import { leaderCounterBudget } from "../format-heuristics.js";
import type { RulesPolicy } from "../policy-chain.js";
import type { Tactics } from "../tactics.js";
import type { PolicyModule } from "../policy-module.js";
import { heuristics, never, prefer, preferAmong } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";

/** The Leader whose printed clause this file is about. */
const LUCY_LEADER = "OP15-002";

/** What one card trashed to the Leader buys, in the only terms that decide whether to spend it. */
const PITCH_STEP = 1_000;

/**
 * OP15-057 Dressrosa Kingdom, whose `[On Your Opponent's Attack]` asks the
 * same hand for the same kind of card at twice the rate.
 *
 * `You may rest this Stage and trash 1 Event or Stage card from your hand: Up
 * to 1 of your Leader or Character cards gains +2000 power during this battle.`
 * One card for 2000 rather than 1000, once a turn, and it reaches a Character
 * where the Leader's own clause only ever raises the Leader.
 */
const LUCY_STAGE = "OP15-057";

/** What one card trashed to the Stage buys. */
const STAGE_STEP = 2_000;

/**
 * The Leader's own offer to trash Event and Stage cards out of hand for power.
 *
 * `[When Attacking]/[On Your Opponent's Attack] You may trash any number of
 * Event or Stage cards from your hand. This Leader gains +1000 power during
 * this battle for every card trashed.`
 *
 * The engine raises it as a repeated `choose` with `min: 0`: one
 * `resolve-effect` per eligible card in hand, plus a `confirm` to stop. The
 * Leader is the only source that offers a card out of the viewer's own hand,
 * so the pair of tests is an exact discriminator -- its other clause,
 * `[Activate: Main]`, is a bare draw with no options at all.
 */
function pitchOptions(
  observation: GameObservation,
  source: string,
): LegalAction[] {
  return observation.legalActions.filter(
    (action) =>
      action.type === "resolve-effect" &&
      action.sourceCardNumber === source &&
      action.option.kind === "card" &&
      action.option.zone === "hand" &&
      action.option.owner === "self",
  );
}

/** The `confirm` that ends the choose without trashing anything more. */
function pitchDecline(observation: GameObservation): LegalAction | undefined {
  return observation.legalActions.find(
    (action) =>
      action.type === "resolve-effect" &&
      action.sourceCardNumber === LUCY_LEADER &&
      action.option.kind === "confirm",
  );
}

/**
 * How many cards this choose has already taken.
 *
 * The engine applies the whole +1000-per-card at the end of the choose, not at
 * each pick: `activeBattle.attackPower` and `counterShortfall` are unchanged
 * between one option and the next, and the trashed cards stay in `self.hand`
 * until the choose resolves. What *does* move is the offer -- a chosen card
 * stops being offered -- so the count is the difference between the cards that
 * were eligible and the cards still on offer.
 *
 * Without this the rule reads the same shortfall at every step and pays the
 * whole hand into a battle one card would have won.
 */
function alreadyPitched(observation: GameObservation): number {
  const eligible = observation.self.hand.filter((card) => {
    const facts = observation.cardFacts[card.cardNumber];
    return facts?.category === "event" || facts?.category === "stage";
  }).length;
  return Math.max(0, eligible - pitchOptions(observation, LUCY_LEADER).length);
}

/**
 * The 2000 OP15-057 can still add to this battle, or 0.
 *
 * Read off the Stage rather than off the offer, because the Stage is asked
 * *after* the Leader: at the Leader's own choose the Stage's apply/skip is not
 * on the table yet, and a rule that cannot see it spends the hand twice over.
 * Active, on the field, and with a card left in hand to pay it -- which is the
 * whole of what the clause needs, its target being any of the defender's own
 * cards.
 */
function stageCredit(observation: GameObservation): number {
  const stage = observation.self.stage;
  if (!stage || stage.cardNumber !== LUCY_STAGE || stage.rested) return 0;
  const payable = observation.self.hand.some((card) => {
    const facts = observation.cardFacts[card.cardNumber];
    return facts?.category === "event" || facts?.category === "stage";
  });
  return payable ? STAGE_STEP : 0;
}

/**
 * Whether the Counter window will actually close a residual shortfall this
 * clause cannot close on its own.
 *
 * The pitch is decided a window early: the card leaves hand at the Leader's
 * choose, and the battle is not resolved until the Counter step two decisions
 * later. So "the hand can reach it" is the wrong question -- what decides
 * whether the card bought anything is whether the *Counter step* will pay the
 * rest, and that step has its own two gates. `mustPreventCurrentLeaderHit` is
 * the one `chooseGenericCounter` passes a nonlethal Leader hit on, and
 * `leaderCounterBudget` is the cap `counter-budget` refuses an over-priced line
 * with. Asked through the same two functions those windows decide with, so a
 * promise made here cannot be priced differently from the payment.
 *
 * Without this the clause reads a hand full of Counter value as a save it will
 * never see: the Leader's +1000 is never enough alone against a whole-thousand
 * attacker -- the shortfall is `attack - defense + 1`, so one card leaves it 1
 * short -- and the seat trashes an Event into a battle the Counter window then
 * declines to finish, taking the Life anyway and one card poorer.
 */
function counterWindowCloses(
  observation: GameObservation,
  residual: number,
): boolean {
  if (residual <= 0) return true;
  if (!mustPreventCurrentLeaderHit(observation)) return false;
  const cards = counterCardsFromHand(
    observation.self.hand.map((card) => card.currentCounter),
    residual,
  );
  return cards <= leaderCounterBudget(observation.self.lifeCount);
}

/** What one Counter card is assumed to add, for pricing a hand nobody can see. */
const COUNTER_CARD_ASSUMED = 2_000;

/**
 * How many pitched cards, in all, put this Leader attack past everything the
 * defender's hand could Counter it with -- or `undefined` where the question
 * does not arise.
 *
 * Asked only on the defender's last Life card, or none: a hit there is the
 * game, or the hit that makes every later attack the game, and the Counter
 * window on the other side spends whatever it takes to stop exactly that
 * (`mustPreventCurrentLeaderHit` is its test). What it can spend is bounded
 * by the cards it holds, priced at one ordinary Counter card each; so the
 * attack that clears `their power + 2000 x hand` cannot be stopped from hand.
 *
 * Declined where it cannot be bought: an active [Blocker] across the table
 * takes the attack off the Leader whatever its power, and a hand that cannot
 * reach the line buys nothing by pitching toward it -- the shortfall of one
 * card is the same lost battle as the shortfall of four.
 */
function uncounterablePitch(
  observation: GameObservation,
  paid: number,
): number | undefined {
  const battle = observation.activeBattle;
  if (!battle) return undefined;
  if (observation.opponent.lifeCount > 1) return undefined;
  const blockerReady = observation.opponent.board.some((card) => {
    if (card.rested) return false;
    const keywords = observation.cardFacts[card.cardNumber]?.rules.keywords;
    return keywords?.includes("Blocker") ?? false;
  });
  if (blockerReady) return undefined;
  const line =
    battle.targetPower +
    observation.opponent.handCount * COUNTER_CARD_ASSUMED +
    1;
  const shortfall = line - battle.attackPower;
  const needed = Math.max(0, Math.ceil(shortfall / PITCH_STEP));
  const reachable = paid + pitchOptions(observation, LUCY_LEADER).length;
  return needed <= reachable ? needed : undefined;
}

/**
 * Whether one more card changes the battle the offer is made in.
 *
 * `pnpm census --deck "(Red/Blue) Lucy - Official Feature Deck"` reads this
 * deck as the least-piloted in the catalog, and this clause is most of the
 * reason: it opens on every attack either player declares, and the generic
 * ladder reaches it as "resolve a legal beneficial effect", which takes the
 * offer *every time* and then takes it again until the hand is empty. A hand
 * of Events is exactly what this deck is made of, so the default pitches the
 * 7-cost removal Event, the bounce and the draw spell to raise a 5000 Leader
 * that was already beating the 5000 it had attacked.
 *
 * The two sides of the clause are not the same decision, because +1000 on the
 * Leader means two different things:
 *
 *  - **Defending**, it is Counter power that costs no Counter value. Eight of
 *    this deck's sixteen Events print no `[Counter]` at all, so a card trashed
 *    here is a card that could not have defended any other way -- which is why
 *    the list can run them. It is still a card, and at 1000 a card it is a
 *    Counter card at half the rate, so it is spent where the Counter window
 *    would spend one: on the hit that has to be stopped, not the one the
 *    Leader can absorb while its Life card comes to hand. There
 *    `counterShortfall` states exactly how much is needed, so the rule pays
 *    to the shortfall and stops.
 *  - **Attacking**, it raises what the defender has to spend. Against a
 *    Character that is decidable -- the attack either beats the body or it does
 *    not -- and against a Leader it is not: the hit lands unless they Counter,
 *    and no reading of the board says whether the extra 1000 is the card they
 *    cannot pay. So the attacking half pays only where it converts an attack
 *    that loses into one that wins, and declines otherwise.
 *
 * `targetInstanceId` decides which side this is, rather than `turnPlayer`:
 * the clause is printed on both windows and the thing it buys is power on the
 * Leader, which is worth nothing at all in a battle the Leader is not in.
 */
function pitchVerdict(observation: GameObservation): {
  readonly pay: boolean;
  readonly because: string;
} {
  const battle = observation.activeBattle;
  if (!battle) {
    return {
      pay: false,
      because: "No battle for the Leader's power to be in.",
    };
  }
  const leaderId = `${observation.viewer}-leader`;
  const paid = alreadyPitched(observation) * PITCH_STEP;

  if (battle.targetInstanceId === leaderId) {
    // 0 is "the target already survives", so there is nothing to buy.
    if (battle.counterShortfall === 0) {
      return {
        pay: false,
        because:
          "Keep the card: this attack already fails, so more power on the Leader changes nothing.",
      };
    }
    // The same gate the Counter window opens on, asked first. A card trashed
    // here is a Counter card that buys 1000 instead of 2000, and the Counter
    // step spends nothing on a Leader hit the seat can absorb -- so this clause
    // must not either. Absorbing is not free, but for this deck it is the
    // better half of the trade: the Life card comes to hand, where it is the
    // next +1000 or the next body, and the Event kept is another. Paying is
    // for the hit that has to be stopped.
    if (!mustPreventCurrentLeaderHit(observation)) {
      return {
        pay: false,
        because:
          "Take the hit: the Counter window would not spend a card on it either, and the Life card refills the hand the Leader pitches from.",
      };
    }
    // The Stage buys 2000 for the same one card, so what the Leader's clause
    // has to cover is the shortfall the Stage will not. Without this term the
    // 1000-a-card half pays first and spends two cards where one would have
    // done -- the two clauses ask the same hand, one step apart, and only this
    // one is asked first.
    if (paid + stageCredit(observation) >= battle.counterShortfall) {
      return {
        pay: false,
        because:
          "Stop: the cards already trashed carry the Leader past this attack.",
      };
    }
    // What this clause and the Stage can put on the Leader without asking the
    // Counter window for anything.
    const ownReach =
      paid +
      pitchOptions(observation, LUCY_LEADER).length * PITCH_STEP +
      stageCredit(observation);
    if (
      ownReach < battle.counterShortfall &&
      !counterWindowCloses(observation, battle.counterShortfall - ownReach)
    ) {
      return {
        pay: false,
        because:
          "Keep the cards: the Events cannot carry this attack on their own, and the Counter window will not pay for the rest -- so trashing one buys a smaller loss rather than a save.",
      };
    }
    return {
      pay: true,
      because:
        "Trash an Event for the 1000 this attack has to be survived by -- power the hand's Counter-less Events can buy no other way.",
    };
  }

  if (battle.attackerInstanceId !== leaderId) {
    return {
      pay: false,
      because: "Keep the card: the Leader is not in this battle.",
    };
  }
  // Attacking a Leader. The hit lands unless they Counter, and whether the
  // extra 1000 is the card they cannot pay is unreadable -- except on their
  // last Life, where the whole hand is what they will pay and its size is
  // known. Past that the hit cannot be stopped, and the Life it takes is the
  // game.
  if (battle.targetInstanceId.endsWith("-leader")) {
    const needed = uncounterablePitch(observation, paid / PITCH_STEP);
    if (needed === undefined) {
      return {
        pay: false,
        because:
          "Keep the card: this hit lands whatever the Leader's power is, and the Events are what the deck's turns are made of.",
      };
    }
    if (paid / PITCH_STEP >= needed) {
      return {
        pay: false,
        because:
          "Stop: the attack is already past everything their hand can Counter.",
      };
    }
    return {
      pay: true,
      because:
        "Trash an Event: on their last Life, the 1000 that puts this attack past their whole hand's Counter is the game.",
    };
  }
  const shortfall = battle.targetPower + 1 - (battle.attackPower + paid);
  if (shortfall <= 0) {
    return {
      pay: false,
      because: "Stop: the attack already beats this Character.",
    };
  }
  if (shortfall > pitchOptions(observation, LUCY_LEADER).length * PITCH_STEP) {
    return {
      pay: false,
      because:
        "Keep the cards: the whole hand still does not beat this Character.",
    };
  }
  return {
    pay: true,
    because: "Trash an Event for the 1000 that turns this attack into a K.O.",
  };
}

/**
 * Which card pays, once {@link pitchVerdict} has said one should.
 *
 * Two decisions hide behind the one clause -- whether to trash, and which card
 * -- and `chooseGenericRules` answers the second with the first option offered,
 * which is hand order. Over a hand that holds a 1-cost Stage and a 7-cost
 * removal Event, that is a coin flip across the deck's whole value range.
 *
 * The ordering is the deck's own, not the format's:
 *
 *  - **A `[Counter]` Event is pitched last.** OP15-021 adds −3000 to an
 *    attacking Character in the Counter window, which is three times what
 *    trashing it here buys, and the window it would be spent in is the same
 *    battle one step later. No Event or Stage prints a Counter *value*, so
 *    `currentCounter` cannot see this; `hasCounterEvent` is the printed fact
 *    that can.
 *  - **Then the cheapest card.** In this fifty the price of an Event tracks
 *    what it does: the 7-cost is the deck's removal ceiling and the 1-cost
 *    Stage replaces itself on the way in. The two free-activation bodies
 *    reach by *base* cost, so a high-cost Event in hand is the card they exist
 *    to cast -- and the one this should be pitching last.
 */
function pitchValue(
  observation: GameObservation,
  action: LegalAction,
): { counterEvent: number; cost: number } | undefined {
  if (action.type !== "resolve-effect") return undefined;
  if (action.option.kind !== "card") return undefined;
  const facts = observation.cardFacts[action.option.card.cardNumber];
  return {
    counterEvent: facts?.rules.hasCounterEvent ? 1 : 0,
    cost: action.option.card.cost ?? 0,
  };
}

/**
 * Decline the Leader's pitch unless the power decides the battle, and pay for
 * it with the Event the deck can most afford to lose.
 */
export function createOp15LucyPitchPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== LUCY_LEADER) return undefined;
    const options = pitchOptions(observation, LUCY_LEADER);
    if (options.length === 0) return undefined;
    const decline = pitchDecline(observation);
    // Every offer has to be one of these two shapes, or the rule is answering
    // a decision it has only half of.
    if (!decline) return undefined;
    if (options.length + 1 !== observation.legalActions.length)
      return undefined;

    const verdict = pitchVerdict(observation);
    if (!verdict.pay) return decision(decline, verdict.because);

    const priced = options
      .map((action) => ({ action, value: pitchValue(observation, action) }))
      .filter(
        (
          entry,
        ): entry is {
          action: LegalAction;
          value: { counterEvent: number; cost: number };
        } => entry.value !== undefined,
      );
    if (priced.length !== options.length) return undefined;
    const best = priced.reduce((left, right) =>
      right.value.counterEvent !== left.value.counterEvent
        ? right.value.counterEvent < left.value.counterEvent
          ? right
          : left
        : right.value.cost < left.value.cost
          ? right
          : left,
    );
    return decision(best.action, verdict.because);
  };
}

/**
 * The Stage's half of the same decision.
 *
 * `[On Your Opponent's Attack]` opens the window on every attack the opponent
 * declares, exactly as the Leader's clause does, and the generic ladder takes
 * it the same way: `Activate Dressrosa Kingdom` is a legal beneficial effect,
 * so it is applied whether or not the 2000 saves anything, and then the
 * payment half falls through to hand order.
 *
 * Simpler than the Leader's half in two ways. It is one card for a fixed 2000
 * rather than a repeated choose, so there is nothing to count; and resting the
 * Stage costs nothing else, because the Stage has no other use and refreshes
 * before the next attack. So the test is the one {@link pitchVerdict} applies
 * on defence: pay only into a battle the Counter window would pay into, and
 * there buy the battle that the 2000 decides, declining the one that was
 * already won and the one that is lost anyway.
 *
 * It reaches a battle over a Character where the Leader's clause does not --
 * "up to 1 of your Leader or Character cards" -- so it is not gated on the
 * Leader being the target.
 */
export function createOp15LucyStagePolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== LUCY_LEADER) return undefined;
    const apply = observation.legalActions.find(
      (action) =>
        action.type === "resolve-effect" &&
        action.sourceCardNumber === LUCY_STAGE &&
        action.optionId === "apply",
    );
    const skip = observation.legalActions.find(
      (action) =>
        action.type === "resolve-effect" &&
        action.sourceCardNumber === LUCY_STAGE &&
        action.optionId === "skip",
    );
    if (apply && skip) {
      if (observation.legalActions.length !== 2) return undefined;
      const battle = observation.activeBattle;
      if (!battle) {
        return decision(skip, "No battle for the Stage's 2000 to be in.");
      }
      if (battle.counterShortfall === 0) {
        return decision(
          skip,
          "Keep the card: this attack already fails, so the Stage's 2000 changes nothing.",
        );
      }
      // The Counter window's own two gates, because the Stage's card is a
      // Counter card by another route: a Leader hit is paid for only where the
      // step would pay for it, and a Character only where it is one of the two
      // the deck's Counter phase names -- {@link LUCY_PROTECTED_FROM_COUNTER}.
      const leaderId = `${observation.viewer}-leader`;
      const defended =
        battle.targetInstanceId === leaderId
          ? mustPreventCurrentLeaderHit(observation)
          : willSpendToSaveCharacter(
              observation,
              observation.self.board.find(
                (card) => card.instanceId === battle.targetInstanceId,
              )?.cardNumber ?? "",
              battle.counterShortfall,
              { protectedCards: LUCY_PROTECTED_FROM_COUNTER },
            );
      if (!defended) {
        return decision(
          skip,
          battle.targetInstanceId === leaderId
            ? "Take the hit: the Counter window would not spend a card on it either, and the Life card refills the hand."
            : "Let the body go: it is not one the deck spends a card to keep.",
        );
      }
      // The same promise the Leader's clause makes, one card later and 2000 at
      // a time: the Stage is rested and the card trashed here, and the battle
      // is decided at the Counter step. Asked through
      // {@link counterWindowCloses} so both halves of this deck's defence price
      // that step the way it prices itself.
      if (
        battle.counterShortfall > STAGE_STEP &&
        !counterWindowCloses(observation, battle.counterShortfall - STAGE_STEP)
      ) {
        return decision(
          skip,
          "Keep the card: the Stage's 2000 does not carry this attack on its own, and the Counter window will not pay for the rest.",
        );
      }
      return decision(
        apply,
        "Rest the Stage for the 2000 that decides this battle -- one card, and the Stage refreshes before the next attack.",
      );
    }

    // The payment half: which Event or Stage pays, once the clause is applied.
    const options = pitchOptions(observation, LUCY_STAGE);
    if (options.length < 2) return undefined;
    if (options.length !== observation.legalActions.length) return undefined;
    const priced = options
      .map((action) => ({ action, value: pitchValue(observation, action) }))
      .filter(
        (
          entry,
        ): entry is {
          action: LegalAction;
          value: { counterEvent: number; cost: number };
        } => entry.value !== undefined,
      );
    if (priced.length !== options.length) return undefined;
    const best = priced.reduce((left, right) =>
      right.value.counterEvent !== left.value.counterEvent
        ? right.value.counterEvent < left.value.counterEvent
          ? right
          : left
        : right.value.cost < left.value.cost
          ? right
          : left,
    );
    return decision(
      best.action,
      "Pay the Stage with the Event the deck can most afford to lose.",
    );
  };
}

/**
 * The two bodies whose `[On Play]` casts an Event out of hand for nothing.
 *
 * OP15-014 Bartolomeo reaches a {Dressrosa} Event of base cost 3 or less;
 * OP15-046 Sabo reaches one of any cost behind a {Dressrosa} Leader. They are
 * why this fifty runs sixteen Events, and the turn they land is the only turn
 * the 7-cost one gets cast on a board whose DON!! has already been spent.
 */
const FREE_EVENT_BODIES = ["OP15-014", "OP15-046"];

/**
 * Which Event a free activation casts.
 *
 * The engine asks it as a `choose` with `min: 0` over the castable Events in
 * hand, and `chooseGenericRules` answers it as "resolve a legal beneficial
 * effect" -- the first option offered, which is hand order. The menu spans the
 * deck's whole range, so unranked the seat spends its one free 7-cost cast on
 * a 3-cost draw spell about as often as not.
 *
 * The order is read off the two derived facts that already split this fifty's
 * Events in two, rather than off a list of card numbers:
 *
 *  - **`removalText`, while they have a Character.** OP15-020 Fire Fist and
 *    OP10-060 Barrier-Barrier Pistol are the only two, and they are the reason
 *    to have a free cast at all: at 7 and 5 cost they are what the deck cannot
 *    pay for on a turn it also played a body. Highest base cost first, so the
 *    −8000 with the K.O. rider goes before the 6000-or-less bounce.
 *  - **`advantageText` otherwise.** With no Character across the table the
 *    removal Events resolve for nothing -- "up to 1" target, and there is
 *    none -- so the cast is worth what the draw spells are worth. Highest base
 *    cost first again: OP15-054 draws two and deploys a body, where OP10-059
 *    only digs.
 *  - **A `[Counter]` Event last, and only into a body.** OP15-021's [Main]
 *    half is the same −3000 its [Counter] half gives, so casting it now spends
 *    in the Main phase a card the Counter window would have spent in a battle
 *    -- but cast for nothing off this body it is also a base-cost-4 Event
 *    activated this turn, which is the Leader's draw, so the card comes back
 *    and the −3000 is what the turn's attacks then run into. With no Character
 *    across the table the −3000 lands on nothing, and the activation is
 *    declined and the card kept for the Counter window.
 *
 * Base cost is the right key twice over: it is what both bodies' own gates
 * read, and in this list it tracks what an Event does.
 */
export function createOp15LucyFreeEventPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== LUCY_LEADER) return undefined;
    // An Event out of the viewer's own hand, offered by one of the two bodies.
    // The category is load-bearing: an Event those bodies cast can open a
    // choose of its own over the same hand -- OP15-054's "play a {Dressrosa}
    // Character with a cost of 4 or less" -- and the engine attributes it to
    // the body that cast the Event. That is a different decision, answered
    // elsewhere, and a rule that read it as the free cast declined the free
    // play.
    const source = observation.legalActions.find(
      (action) =>
        action.type === "resolve-effect" &&
        FREE_EVENT_BODIES.includes(action.sourceCardNumber) &&
        action.option.kind === "card" &&
        action.option.zone === "hand" &&
        action.option.card.category === "event",
    );
    if (!source || source.type !== "resolve-effect") return undefined;
    const body = source.sourceCardNumber;
    const options = pitchOptions(observation, body);
    if (
      options.some(
        (action) =>
          action.type !== "resolve-effect" ||
          action.option.kind !== "card" ||
          action.option.card.category !== "event",
      )
    )
      return undefined;
    const decline = observation.legalActions.find(
      (action) =>
        action.type === "resolve-effect" &&
        action.sourceCardNumber === body &&
        action.option.kind === "confirm",
    );
    if (!decline) return undefined;
    if (options.length + 1 !== observation.legalActions.length)
      return undefined;

    const theyHaveABody = observation.opponent.board.length > 0;
    interface Ranked {
      action: LegalAction;
      tier: number;
      cost: number;
    }
    const ranked: Ranked[] = [];
    for (const action of options) {
      if (action.type !== "resolve-effect") return undefined;
      if (action.option.kind !== "card") return undefined;
      const card = action.option.card;
      const rules = observation.cardFacts[card.cardNumber]?.rules;
      if (!rules) return undefined;
      // 3 = the cast this body exists for, 2 = a cast worth a card, 1 = the
      // Counter Event, cast only where its debuff has a body to land on,
      // 0 = a card the Counter window wants back.
      const tier = rules.hasCounterEvent
        ? theyHaveABody
          ? 1
          : 0
        : rules.removalText && theyHaveABody
          ? 3
          : rules.advantageText
            ? 2
            : 0;
      ranked.push({ action, tier, cost: card.cost ?? 0 });
    }
    const best = ranked.reduce<Ranked | undefined>(
      (left, right) =>
        left === undefined ||
        right.tier > left.tier ||
        (right.tier === left.tier && right.cost > left.cost)
          ? right
          : left,
      undefined,
    );
    if (!best) return undefined;
    if (best.tier === 0) {
      return decision(
        decline,
        "Decline the free cast: the only Event it reaches is one the Counter window will spend in a battle.",
      );
    }
    return decision(
      best.action,
      best.tier === 3
        ? "Cast the removal Event this body exists to pay for, largest first."
        : best.tier === 2
          ? "Cast the Event that buys cards: there is no Character for the removal to point at."
          : "Cast the Counter Event into their body: free, it is still the Leader's draw, and the -3000 is what this turn's attacks run into.",
    );
  };
}

/**
 * The bodies this deck will spend a card at the Counter step to keep.
 *
 * `chooseGenericCounter` ships an empty protected set, and for a battle over a
 * Character that set is the whole test -- so an unpiloted seat answers every
 * such battle with "do not spend hand resources protecting a replaceable
 * Character". Most of this fifty is replaceable in exactly that sense: the
 * 1-cost searchers have already drawn their card, OP15-048 Chinjao's
 * `[On K.O.]` takes a card out of the opponent's hand on their turn and so is
 * worth as much dead as alive, and OP15-052 Leo already refuses removal on its
 * own.
 *
 * Two are not. OP15-046 Sabo is the deck's only [Blocker] that needs no DON!!
 * and the only 9000 on the board; OP15-014 Bartolomeo is the body that casts a
 * base-cost-3-or-less Event for free and then keeps refusing its own K.O. for
 * an Event out of a hand that is mostly Events. Losing either is losing the
 * turn the deck's Events are cast on.
 *
 * `economicalCharacterDefense` is left at its default, so even these two are
 * defended only where 1000 of Counter saves them and the Life stack can afford
 * the turn.
 */
const LUCY_PROTECTED_FROM_COUNTER: ReadonlySet<string> = new Set([
  "OP15-046",
  "OP15-014",
]);

/**
 * OP-15 (Red/Blue) Lucy's Counter phase.
 *
 * `pnpm census --deck "(Red/Blue) Lucy - Official Feature Deck"` reads
 * `counter:counter` at 2.03 decisions a game with **100.0% no rule at all**,
 * on the deck the same census ranks least-piloted in the catalog.
 *
 * A whole decision rather than a narrowing, so it is a `decide` rather than a
 * heuristic: the choice it overrides is made inside `chooseGenericCounter`.
 */
export function createOp15LucyCounterPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== LUCY_LEADER) return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(observation, observation.legalActions, {
      protectedCards: LUCY_PROTECTED_FROM_COUNTER,
      // OP15-021 gives the attacking Character −3000, which is three ordinary
      // Counter cards' worth of defence out of one card, and once four Events
      // sit in the trash it costs 1 DON!! instead of 4. Bandai's own deck page
      // names it as the card that turns a battle around. It is still not free:
      // every Event in this hand is already +1000 through the Leader's pitch
      // clause, so the Event buys 2000 over what holding it would have bought,
      // and it spends DON!! the turn cannot get back. Two cards is where the
      // ordinary line stops being the cheaper half, the same reading ST33 sets
      // this by.
      counterEventBeatsCards: 2,
    });
  };
}

/**
 * The three 1-cost cards that make the deck's turns happen.
 *
 * OP15-040 Viola and OP15-053 Rebecca each look 3 deep and add a {Dressrosa}
 * card, which in this fifty is every card; OP15-057 Dressrosa Kingdom draws
 * itself back under this Leader and is the card that turns the hand's
 * Counter-less Events into +2000s for the rest of the game.
 */
const LUCY_KEEPS = ["OP15-040", "OP15-053", "OP15-057"];

/**
 * The opening hand.
 *
 * `anyEarlyPlay` is a cost bound, and `mulligan.ts` records what separates the
 * decks a keep predicate pays on from the decks it does not: not the size of
 * the cheap slot but **what it is made of**. This list is the shape that
 * argues for a predicate. Ten of its fifty cards cost 1 or less, and seven of
 * those ten are the three cards above; the rest of the cheap slot is OP10-059,
 * a 1-cost dig that is still an Event and so still needs a turn's DON!! to
 * cast.
 *
 * The other half of the argument is what the deck does with a hand of Events.
 * Sixteen of the fifty are Events and the two bodies that cast them for free
 * cost 4 and 7, so an opening hand of Events has nothing to do until turn four
 * -- and the Leader's pitch clause turns them into +1000s one at a time, which
 * is the trade this deck takes when it has run out of better ones rather than
 * the one it opens on.
 *
 * ## Why the rule is nearly a no-op
 *
 * Seven of the ten cheap cards are keeps, so this predicate and `anyEarlyPlay`
 * agree about almost every hand: they differ only on one whose only card at 1
 * cost or less is OP10-059, and there are two copies of it in fifty. That is
 * the whole margin available to a tightening here, and it is the same shape
 * `createOp17NewgateMulliganModule` describes -- the flatness is a property of
 * the predicate rather than of the decision underneath it. It is registered
 * rather than admitted to `DECKS_ON_THE_GENERIC_MULLIGAN` because it is not
 * harmful and it makes the decision addressable; the deck's leverage is in the
 * three clauses above.
 */
export function createOp15LucyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op15-lucy-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) =>
        LUCY_KEEPS.includes(card.cardNumber),
      ),
    keepBecause:
      "Keep a hand with OP15-040, OP15-053 or OP15-057: all three cost 1, all three replace themselves, and two of them dig for the body the Events are cast off.",
    mulliganBecause:
      "Mulligan a hand with no 1-cost searcher and no Stage: the Events in it cannot be cast until a 4-cost body arrives to cast them.",
  });
}

/**
 * Play OP15-057 Dressrosa Kingdom before anything else the turn can afford.
 *
 * Bandai's own deck page says to: "This deck runs a lot of Event cards without
 * Counter effects ... you can use Event cards in place of a Counter +1000, but
 * if you require a Counter +2000 or higher, you'll start burning through your
 * hand quickly. This is why you'll want to prioritize playing OP15-057
 * Dressrosa Kingdom -- which allows you to use Events as a Counter +2000 --
 * early in the game."
 *
 * `chooseGenericRules` develops the highest-cost legal card and loops, so a
 * 1-cost Stage is the last thing a turn reaches and the first thing a turn
 * runs out of DON!! for: over 60 games against five decks it was played on
 * **37.5% of the turns it was legal**, and the DON!! that would have paid for
 * it went into +1000 of Leader power for one turn.
 *
 * What the Stage buys instead is a card on the way in -- its `[On Play]` draws
 * behind a {Dressrosa} Leader, so at 1 cost it replaces itself -- and then
 * +2000 in every battle for the rest of the game, paid with the Events this
 * hand cannot otherwise spend. Eight of the sixteen Events print no `[Counter]`
 * at all.
 *
 * Ranked among plays rather than vetoing the others: the Stage is not instead
 * of a body, it is before one. The whole cost of being wrong is the 1 DON!!
 * that might have completed a larger body on a turn whose total was exactly
 * that body's cost.
 *
 * Gated on the Stage zone being empty, because a second copy replaces the
 * first for no gain -- the `[On Play]` draw is the only part that repeats, and
 * it is not worth a card plus the DON!!.
 */
export function createOp15LucyStageFirstModule(): PolicyModule {
  return heuristics("op15-lucy-stage-first", [
    prefer(
      "Play Dressrosa Kingdom before the bodies: it draws a card on the way in and turns every Counter-less Event in hand into +2000.",
    )
      .when((t) => t.observation.self.stage === null)
      .play((card) => (card.cardNumber === LUCY_STAGE ? 1 : 0)),
  ]);
}

/**
 * What a card in this hand is worth to the hand, when something asks for one.
 *
 * Three of the deck's own clauses ask the hand to pay in cards: OP15-048
 * Chinjao's `[On Play]` trashes an Event for two draws, OP15-054's `[Main]`
 * draws two and trashes one, and OP15-020 Fire Fist's rider trashes two to
 * K.O. the body it just shrank. `chooseGenericRules` answers all three with the
 * first card offered, which is hand order -- so the seat paid Chinjao with the
 * deck's only `[Counter]` Event and Fire Fist's rider with the 7-cost Sabo it
 * was holding to cast the next one.
 *
 * Lower is cheaper to lose. The order is the deck's own:
 *
 *  - **A Counter-less Event, cheapest first.** These are the cards the Leader
 *    would otherwise trash for +1000 one at a time; paying a cost with one
 *    spends the same card for a draw instead. Price tracks what an Event does
 *    in this list, the same reading {@link pitchValue} makes.
 *  - **A second Stage.** With OP15-057 already on the field another copy is
 *    a 1-cost draw and nothing more; with none out it is the defence engine
 *    and priced like a body.
 *  - **The `[Counter]` Event after every other Event**: −3000 on an attacker in
 *    the Counter window is worth three ordinary Counter cards.
 *  - **Then Characters by cost**, with the two free-cast bodies last of all:
 *    OP15-014 and OP15-046 are what the Events in this hand are waiting to be
 *    cast by, and losing one is losing the turn the rest of the hand was for.
 */
function costToLose(
  observation: GameObservation,
  card: { cardNumber: string; cost: number | null },
): number {
  const facts = observation.cardFacts[card.cardNumber];
  const cost = card.cost ?? 0;
  if (facts?.category === "stage") {
    return observation.self.stage === null ? 12 : 1;
  }
  if (facts?.category === "event") {
    return facts.rules.hasCounterEvent ? 10 : cost;
  }
  if (FREE_EVENT_BODIES.includes(card.cardNumber)) return 30 + cost;
  return 15 + cost;
}

/**
 * Pay a card cost with the card the deck can most afford to lose.
 *
 * Scored over every option that moves a card out of the viewer's own hand into
 * their own trash, and only those: a search result goes to hand, a free cast
 * goes to the activation, and both are answered elsewhere. The Leader's and
 * the Stage's own pitch clauses move a card the same way, but each is a
 * `decide` with a stop condition this rank must not narrow around -- a rank
 * that hid the card that policy chose would hand the whole decision back to
 * the generic ladder -- so both sources are left alone here.
 *
 * `preferAmong` rather than `prefer`, so the rule says nothing about declining
 * the cost: whether to pay at all is a different question, and for Fire Fist's
 * rider it is answered by {@link createOp15LucyFireFistPolicy}.
 */
export function createOp15LucyHandPaymentModule(): PolicyModule {
  return heuristics("op15-lucy-hand-payment", [
    preferAmong(
      "Pay the cost with the card this hand can most afford to lose: a Counter-less Event before the Counter one, and the bodies that cast Events last.",
    ).effect((action, t) => {
      if (action.effectKind !== "mechanic-choice") return false;
      if (action.sourceCardNumber === LUCY_LEADER) return false;
      if (action.sourceCardNumber === LUCY_STAGE) return false;
      if (action.destination?.zone !== "trash") return false;
      if (action.destination.player !== "self") return false;
      if (action.option.kind !== "card") return false;
      if (action.option.owner !== "self" || action.option.zone !== "hand")
        return false;
      // Never zero: `rank-among` drops a candidate scored at nothing.
      return 100 - costToLose(t.observation, action.option.card);
    }),
    // OP15-054's other half: "play a {Dressrosa} Character with a cost of 4 or
    // less" out of the same hand. The two bodies that cast Events for free are
    // the play; among the rest the larger body. Attributed to OP15-054 when it
    // was paid for in DON!! and to the body when cast off one, so both sources
    // are read; a Character offered out of hand with no destination is this
    // play and nothing else either source raises.
    preferAmong(
      "Put the free-cast body down with the free play; a body that casts an Event is worth more on the field than a larger one that does not.",
    ).effect((action, t) => {
      if (!["OP15-054", ...FREE_EVENT_BODIES].includes(action.sourceCardNumber))
        return false;
      if (action.destination !== undefined) return false;
      if (action.option.kind !== "card") return false;
      if (action.option.owner !== "self" || action.option.zone !== "hand")
        return false;
      const facts = t.observation.cardFacts[action.option.card.cardNumber];
      if (facts?.category !== "character") return false;
      return costToLose(t.observation, action.option.card);
    }),
  ]);
}

/**
 * OP15-020 Fire Fist's rider: "you may trash 2 cards from your hand: K.O. up
 * to 1 of your opponent's Characters with 0 power or less."
 *
 * The engine offers the rider as an optional `apply`/`skip` after the −8000 has
 * landed, and the generic ladder takes any optional that is not a skip -- so
 * the seat paid two cards whether or not any Character was at 0, and when one
 * was, whether or not it was worth two cards. Two cards out of this hand are
 * two +1000s the Leader will not have on the next attack, or the body and the
 * Event of the next turn.
 *
 * The engine attributes the offer to whatever cast the Event, so the source is
 * Fire Fist when it was paid for in DON!! and OP15-046 Sabo when it was cast
 * off Sabo's `[On Play]`; the price -- `cost.trashesFromHand` of exactly two --
 * is what the option itself says, and is what identifies it.
 *
 * Pay when the K.O. is worth two cards: a Character already at 0 or less whose
 * printed cost is 4 or more, or that holds `[Blocker]`. The −8000 lasts until
 * the end of their next End Phase, so a smaller body it shrank cannot attack
 * for anything anyway and is not worth two cards to remove; a Blocker at 0
 * still blocks, and a large body comes back.
 */
export function createOp15LucyFireFistPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== LUCY_LEADER) return undefined;
    if (observation.legalActions.length !== 2) return undefined;
    const apply = observation.legalActions.find(
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "confirm" &&
        action.option.choice === "apply" &&
        action.cost?.trashesFromHand === 2 &&
        ["OP15-020", ...FREE_EVENT_BODIES].includes(action.sourceCardNumber),
    );
    const skip = observation.legalActions.find(
      (action) =>
        action.type === "resolve-effect" && action.option.kind === "skip",
    );
    if (!apply || !skip) return undefined;
    const worthTwoCards = observation.opponent.board.some((card) => {
      if (card.currentPower > 0) return false;
      const facts = observation.cardFacts[card.cardNumber];
      return (
        (facts?.cost ?? 0) >= 4 ||
        (facts?.rules.keywords ?? []).includes("Blocker")
      );
    });
    if (!worthTwoCards) {
      return decision(
        skip,
        "Keep the two cards: nothing at 0 power is worth them, and the -8000 already holds the body it landed on for their turn.",
      );
    }
    return decision(
      apply,
      "Trash two cards to K.O. the body Fire Fist put at 0: a Blocker or a 4-cost is worth more than two +1000s.",
    );
  };
}

/**
 * OP15-054 "And No One Else Can Have It!", the Event whose first mode plays a
 * body: `Draw 2 cards and trash 1 card from your hand. Then, play up to 1
 * {Dressrosa} type Character card with a cost of 4 or less from your hand.`
 */
const LUCY_MEMENTO = "OP15-054";

/** The largest body OP15-054's play half reaches, by printed cost. */
const MEMENTO_PLAY_COST = 4;

/**
 * Whether OP15-054 is castable this turn -- offered as a Main-phase activation
 * from the viewer's own hand -- and the hand holds a body it would play.
 *
 * Every Character in this fifty is {Dressrosa}, so the type half of the clause
 * is read as "a Character", and the cost half off the printed cost: the Event
 * reads the card's cost, not what the turn would be charged for it.
 */
function mementoLineOpen(t: Tactics): boolean {
  const castable = t.observation.legalActions.some(
    (action) =>
      action.type === "activate-main" &&
      action.sourceCardNumber === LUCY_MEMENTO,
  );
  if (!castable) return false;
  return t.hand.some((card) => {
    const facts = t.observation.cardFacts[card.cardNumber];
    return facts?.category === "character" && card.cost <= MEMENTO_PLAY_COST;
  });
}

/**
 * Cast OP15-054 before paying for a body it would have played.
 *
 * The Event costs 4, and Bartolomeo costs 4. Paid for in DON!!, Bartolomeo is
 * a body on the field and its `[On Play]` cast. Reached through the Event for
 * the same 4 DON!!, it is the same body and the same cast, plus two cards
 * drawn, one card into a trash that OP15-021 and OP15-006 both count, and a
 * base-cost-4 Event activated this turn -- which is what the Leader's
 * `[Activate: Main]` draw is waiting for. Nothing on the other side of the
 * trade: the body still arrives this turn, through the Event.
 *
 * `chooseGenericRules` develops before it activates, so with both in hand it
 * spends the 4 DON!! on the body and the Event is left for the Leader to trash
 * for +1000. The two rules below are the two halves of putting the Event
 * first, and they are one module because neither is a sane agent alone:
 *
 *  - **Do not pay for a body the Event plays** while the Event is castable.
 *    A `never`, because "the Event before the body" is a judgement across two
 *    action types, which ranking cannot make. Every Character at 4 or less is
 *    held, not only the one the Event will pick: a 4-cost Cavendish paid for
 *    first leaves no DON!! for the Event, and the free play then names whichever
 *    body is still in hand. Plays the Event cannot make -- the 7-cost Sabo, the
 *    Stage -- are left alone, so the Stage still goes down first on a turn that
 *    can afford both.
 *  - **The Event first among activations.** With the body plays held, the ladder
 *    reaches "use an available Main-phase effect" and takes the first Event
 *    offered, which is hand order over a hand that is mostly Events.
 *
 * Both gated on the same `mementoLineOpen`: the Event in hand and castable, and
 * a body in hand for it to play. Once it is cast the gate closes, and the DON!!
 * left over develops as before.
 */
export function createOp15LucyMementoLineModule(): PolicyModule {
  return heuristics("op15-lucy-memento-line", [
    never(
      "Hold the body: OP15-054 plays it for the same DON!!, and draws two on the way.",
    )
      .when(mementoLineOpen)
      .play((card, t) => {
        const facts = t.observation.cardFacts[card.cardNumber];
        return (
          facts?.category === "character" && card.cost <= MEMENTO_PLAY_COST
        );
      }),
    prefer(
      "Cast OP15-054 ahead of the other Events: its play half is the turn's body.",
    )
      .when(mementoLineOpen)
      .activate((action) => action.sourceCardNumber === LUCY_MEMENTO),
  ]);
}

/**
 * The Life total at which every Leader hit has to be Countered.
 *
 * `mustPreventCurrentLeaderHit` is the Counter window's test, and at 1 Life it
 * is true of every attack on the Leader: the hit that reaches 0 is the one
 * before the hit that ends the game, and no seat lets it through while it holds
 * a card that stops it.
 */
const PRESS_LIFE = 1;

/**
 * How many attacks the press needs.
 *
 * One is a single Counter decision, and a seat on its last Life can answer it
 * by taking the hit: at 0 Life it is still in the game, and this format's
 * Life-refilling `[On Play]`s put a card back on the stack on its own turn.
 * Two is different in kind. Once the first hit is taken the second is the
 * game, so it is Countered with the whole hand or not at all -- and the first
 * is Countered too, because taking it is what makes the second lethal.
 */
const PRESS_ATTACKS = 2;

/**
 * How far past their Leader each pressed attack is carried.
 *
 * The attacker wins a tie, so an attack level with their Leader is stopped by
 * any one Counter card. One step over needs 1001, which is one card of a
 * 2000-Counter fifty and two of a 1000-Counter one -- the step at which a
 * DON!! starts costing them a card rather than a choice of card. The press
 * opens on two attacks that can tie ({@link reachShortfalls}); the DON!! is
 * then dealt to carry each one past the step in turn.
 */
const PRESS_OVER = 1_000;

/**
 * The DON!! each unit that can swing this turn needs to reach their Leader,
 * smallest first. A unit already past it needs none.
 */
function reachShortfalls(t: Tactics): number[] {
  const leaderId = `${t.observation.viewer}-leader`;
  const units = [
    { id: leaderId, power: t.selfLeaderPower },
    ...t.observation.self.board.map((card) => ({
      id: card.instanceId,
      power: card.currentPower,
    })),
  ];
  return units
    .filter((unit) => t.couldAttack(unit.id))
    .map((unit) =>
      Math.max(0, Math.ceil((t.opponentLeaderPower - unit.power) / 1_000)),
    )
    .sort((left, right) => left - right);
}

/**
 * The DON!! the press needs this turn, or `undefined` where there is no press:
 * the opponent above {@link PRESS_LIFE}, fewer than {@link PRESS_ATTACKS} units
 * that can swing, or a cost area that cannot bring two of them up to their
 * Leader. Short of that the turn develops as it otherwise would: one attack
 * into a Leader that can absorb it buys nothing the body would not, and the
 * body is the second attacker a later turn presses with.
 */
function pressNeed(t: Tactics): number | undefined {
  if (t.observation.phase !== "main") return undefined;
  if (t.opponentLife > PRESS_LIFE) return undefined;
  const activeDon = t.observation.self.activeDon;
  if (activeDon === 0) return undefined;
  const shortfalls = reachShortfalls(t);
  if (shortfalls.length < PRESS_ATTACKS) return undefined;
  const needed = shortfalls
    .slice(0, PRESS_ATTACKS)
    .reduce((sum, shortfall) => sum + shortfall, 0);
  return needed <= activeDon ? needed : undefined;
}

/** Whether this is a turn to spend on attacks rather than on the board. */
function pressOpen(t: Tactics): boolean {
  return pressNeed(t) !== undefined;
}

/**
 * Spend the turn on attacks once the opponent is on their last Life.
 *
 * At 1 Life a seat cannot let a Leader hit through, so every attack that
 * reaches their Leader is a Counter decision they must pay, in cards, at
 * whatever rate their fifty prints -- and a Leader that is *bigger* than this
 * deck's bodies is not a reason to stop attacking, it is the reason the DON!!
 * has to go on the attackers. This deck's own resources point the same way: a
 * card in hand is +1000 through the Leader's clause on the way in, and the
 * hand is refilled by the Leader's draw, so the hand is what the attacks are
 * made of and the board is what they are made from.
 *
 * `chooseGenericRules` develops first, activates second and attaches what is
 * left, so on a turn with a body in hand the DON!! is spent before the attack
 * step and a 5000 Leader looks at a 7000 one with nothing to close the gap.
 * Three rules, one module, because they are one line:
 *
 *  - **No plays** while the press is open. A body played now swings next turn
 *    into the same Leader with the same shortfall, and its DON!! was this turn's
 *    attack -- every DON!! the two attacks do not need still raises what they
 *    have to Counter, a card at a time.
 *  - **No Events out of hand** either: they cost the same DON!!. The Leader's
 *    own `[Activate: Main]` is not an Event and costs nothing, and is left on
 *    the table.
 *  - **Attach to the attacker nearest to one step past their Leader**
 *    ({@link PRESS_OVER}), so the turn's DON!! makes a second attack rather
 *    than a larger first one. Two hits at 8000 into 7000 are two Counter
 *    decisions of two cards each against a 1000-Counter hand; one at 9000 is
 *    one. Attackers already past the step score lowest, so the remainder goes
 *    to the next one that can still get there, and only a shortfall the cost
 *    area can close scores at all.
 */
export function createOp15LucyPressModule(): PolicyModule {
  return heuristics("op15-lucy-press", [
    never(
      "Hold the board: on their last Life every DON!! is an attack they have to Counter.",
    )
      .when(pressOpen)
      .play(() => true),
    never(
      "Hold the Event: its DON!! is an attack they have to Counter, and in hand it is +1000 on the way in.",
    )
      .when(pressOpen)
      .activate((action, t) =>
        t.hand.some((card) => card.instanceId === action.sourceInstanceId),
      ),
    prefer(
      "Give the DON!! to the attacker nearest to reaching their Leader, so the turn makes another attack rather than a larger one.",
    )
      .when(pressOpen)
      .attachDon((action, t) => {
        const target = action.targetInstanceId;
        if (!t.couldAttack(target)) return false;
        const power =
          target === `${t.observation.viewer}-leader`
            ? t.selfLeaderPower
            : t.ownCurrentPower(target);
        if (power === undefined) return false;
        const shortfall = t.opponentLeaderPower + PRESS_OVER - power;
        // Already past the step: the remainder lands here only once nothing
        // else can still be brought up.
        if (shortfall <= 0) return 1;
        if (shortfall > 1_000 * t.observation.self.activeDon) return false;
        return 100 - shortfall / 1_000;
      }),
  ]);
}
