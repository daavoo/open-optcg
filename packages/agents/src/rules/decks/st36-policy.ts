import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  attackerPower,
  bestSearchResult,
  chooseGenericBlock,
  chooseGenericCounter,
  decision,
  isSearchResult,
  nonSkipEffects,
  opponentLeaderId,
  pass,
  type PolicyDecision,
  selfLeaderId,
  viableAttacks,
} from "../generic-policy.js";
import type { RulesPolicy } from "../policy-chain.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

const ST36_LEADER = "OP10-099";
/** OP10-114 X.Drake: the Main ability that rests an opposing Character. */
const DRAKE = "OP10-114";
/**
 * ST36-005 Kid: turns a Life card face-up to feed the Leader, and turns one
 * back face-down to move an attack.
 */
const KID_ORIENTATION = "ST36-005";
/** The name both halves of the redirect read: the Leader prints it too. */
const KID_NAME = 'Eustass"Captain"Kid';

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;
type PlayAction = Extract<LegalAction, { type: "play-card" }>;
type AttackAction = Extract<LegalAction, { type: "attack" }>;
type ActivationAction = Extract<LegalAction, { type: "activate-main" }>;

const cardValue = new Map<string, number>([
  ["ST36-005", 100],
  ["ST36-002", 96],
  ["P-085", 92],
  ["OP12-113", 84],
  ["OP10-109", 82],
  ["P-088", 78],
  ["OP10-101", 74],
  ["ST36-003", 72],
  ["OP13-116", 68],
  ["OP10-114", 64],
  ["ST36-001", 58],
  ["OP10-111", 54],
  ["OP10-103", 50],
  ["ST36-004", 46],
]);

const triggerValue = new Map<string, number>([
  ["ST36-003", 110],
  ["ST36-002", 105],
  ["OP10-109", 100],
  ["OP12-113", 95],
  ["P-088", 90],
]);

function value(cardNumber: string | undefined): number {
  return cardValue.get(cardNumber ?? "") ?? 0;
}

function selfCardNumber(
  observation: GameObservation,
  instanceId: string,
): string | undefined {
  return observation.self.hand.find((card) => card.instanceId === instanceId)
    ?.cardNumber;
}

function chooseEffect(
  observation: GameObservation,
  effects: EffectAction[],
): PolicyDecision {
  const nonSkip = nonSkipEffects(effects);
  const kind = effects[0]?.effectKind;

  // Every `choose` in the mechanic DSL reports `mechanic-choice`, so the
  // redirect is told from Kid's other clause by the battle it is answering.
  const redirect = chooseRedirect(observation, effects);
  if (redirect) return redirect;

  if (kind === "kid-leader-end-turn") {
    const target = [...nonSkip].sort((left, right) => {
      const boardValue = (action: EffectAction) => {
        const card = observation.self.board.find(
          (candidate) => candidate.instanceId === action.optionId,
        );
        return (
          (card?.rested ? 10_000 : 0) +
          (card?.cardNumber === "ST36-005" ? 5_000 : 0) +
          (card?.currentPower ?? 0)
        );
      };
      return boardValue(right) - boardValue(left);
    })[0];
    return decision(
      target ?? effects[0]!,
      "Restand the highest-impact Supernova and make it the next-turn Blocker.",
    );
  }

  if (kind === "bege-life-swap") {
    const bottom = nonSkip.find((action) => action.optionId === "bottom");
    const top = nonSkip.find((action) => action.optionId === "top");
    if (bottom || top) {
      return decision(
        bottom ?? top!,
        "Take bottom Life first to preserve the top card for Kid Leader orientation.",
      );
    }
    const placement = [...nonSkip].sort(
      (left, right) =>
        (triggerValue.get(selfCardNumber(observation, right.optionId) ?? "") ??
          value(selfCardNumber(observation, right.optionId))) -
        (triggerValue.get(selfCardNumber(observation, left.optionId) ?? "") ??
          value(selfCardNumber(observation, left.optionId))),
    )[0];
    return decision(
      placement ?? effects[0]!,
      "Place the highest-value Trigger Character face-up in Life.",
    );
  }

  if (kind === "move-character-to-life") {
    const skip = effects.find((action) => action.optionId === "skip");
    if (skip && observation.opponent.lifeCount <= 1) {
      return decision(
        skip,
        "Do not extend the opponent's closing Life total with Bonney.",
      );
    }
    const targetValue = (action: EffectAction) => {
      const instanceId =
        action.option.kind === "card"
          ? action.option.card.instanceId
          : undefined;
      const target = observation.opponent.board.find(
        (card) => card.instanceId === instanceId,
      );
      return (target?.cost ?? 0) * 10_000 + (target?.currentPower ?? 0);
    };
    const target = [...nonSkip].sort(
      (left, right) => targetValue(right) - targetValue(left),
    )[0];
    return decision(
      target ?? effects[0]!,
      "Use Bonney on the highest-value eligible opposing Character.",
    );
  }

  if (effects.some(isSearchResult)) {
    return decision(
      bestSearchResult(effects, value) ?? effects[0]!,
      "Take the highest-value ST36 search result.",
    );
  }

  if (kind === "free-play-rested") {
    const target = [...nonSkip].sort(
      (left, right) =>
        value(selfCardNumber(observation, right.optionId)) -
        value(selfCardNumber(observation, left.optionId)),
    )[0];
    return decision(
      target ?? effects[0]!,
      "Free-play the highest-value eligible Supernova rested.",
    );
  }

  if (
    kind === "discard-supernova-draw-two" ||
    kind === "discard-for-life" ||
    kind === "draw-trash"
  ) {
    const discard = [...nonSkip].sort(
      (left, right) =>
        value(selfCardNumber(observation, left.optionId)) -
        value(selfCardNumber(observation, right.optionId)),
    )[0];
    return decision(
      discard ?? effects[0]!,
      "Pay the effect with the lowest-value card in hand.",
    );
  }

  return decision(
    nonSkip[0] ?? effects[0]!,
    "Resolve the best available ST36 effect.",
  );
}

function chooseTrigger(
  observation: GameObservation,
): PolicyDecision | undefined {
  const triggers = observation.legalActions.filter(
    (action) => action.type === "resolve-trigger",
  );
  if (triggers.length === 0) return undefined;
  const active = triggers.filter((action) => action.optionId !== "skip");
  if (active.length === 0) {
    return decision(triggers[0]!, "Take the Trigger card into hand.");
  }
  if (
    observation.pendingTriggerCardNumber === "P-088" &&
    observation.self.lifeCount <= 1 &&
    observation.self.hand.length <= 5
  ) {
    return decision(
      triggers.find((action) => action.optionId === "skip")!,
      "Keep Law as 2000 Counter when defensive resources are thin.",
    );
  }
  const targetValue = (action: (typeof active)[number]) => {
    const target = observation.opponent.board.find(
      (card) => card.instanceId === action.optionId,
    );
    return (target?.cost ?? 0) * 10_000 + (target?.currentPower ?? 0);
  };
  const choice = [...active].sort(
    (left, right) => targetValue(right) - targetValue(left),
  )[0]!;
  return decision(
    choice,
    "Activate the ST36 Trigger and choose its highest-value legal target.",
  );
}

/** A card the redirect could name, scored by `redirectTargetValue`. */
interface RedirectTarget {
  instanceId: string;
  currentPower: number;
  isLeader: boolean;
}

/**
 * What an attack landing on one of your own cards rather than another is worth,
 * on a scale of bodies kept.
 *
 * A card the attack cannot beat leads it: the attack is simply spent. Below
 * that, a Life card is cheaper than a Character -- it comes back to hand as
 * damage, and this Leader's `[End of Your Turn]` turns the stack face-up again
 * -- but it is not free, because the face-up Life card is what Kid's own
 * `[Activate: Main]` reads for DON!! and what this very redirect spends. Last
 * is a body that dies, and the Leader when the hit would take the game.
 */
function redirectTargetValue(
  target: RedirectTarget,
  battle: NonNullable<GameObservation["activeBattle"]>,
  observation: GameObservation,
): number {
  // The attacker wins ties, so surviving needs strictly more power.
  if (target.currentPower > battle.attackPower) return 6;
  if (target.isLeader) {
    return observation.self.lifeCount <= battle.lifeCost ? -1 : 3;
  }
  return 1;
}

/**
 * The cards the clause could name, read off the observation.
 *
 * Off the observation rather than off the legal actions, because when the
 * pay/skip question is asked the only actions on the table are "apply" and
 * "skip". The printed gate -- a [Eustass"Captain"Kid] with 5000 base power or
 * more -- is applied here so the estimate is made of the same cards the engine
 * will go on to offer.
 */
function redirectCandidates(observation: GameObservation): RedirectTarget[] {
  const leader = observation.self.leader;
  return [
    ...(leader.name === KID_NAME && leader.power >= 5_000
      ? [
          {
            instanceId: selfLeaderId(observation),
            currentPower: leader.currentPower,
            isLeader: true,
          },
        ]
      : []),
    ...observation.self.board
      .filter((card) => card.name === KID_NAME && card.power >= 5_000)
      .map((card) => ({
        instanceId: card.instanceId,
        currentPower: card.currentPower,
        isLeader: false,
      })),
  ];
}

/**
 * ST36-005's `[On Your Opponent's Attack]`: whether to move the attack, which
 * Life card pays, and where it lands.
 *
 * All three arrive as `resolve-effect` with `sourceCardNumber` ST36-005 during
 * a battle, and they are one judgement rather than three: the pay/skip question
 * is asked two decisions before any target is offered, so it has to estimate
 * what the redirect is for. Left to the "take the first non-skip option"
 * fallback below, the seat turns a Life card face-down on every attack and
 * points the result at whatever the engine offered first -- and with two copies
 * of Kid on the board, each of them moves the attack once, the second putting
 * it back on the card the first moved it off.
 */
function chooseRedirect(
  observation: GameObservation,
  effects: EffectAction[],
): PolicyDecision | undefined {
  const battle = observation.activeBattle;
  if (!battle) return undefined;
  const offers = effects.filter(
    (action) => action.sourceCardNumber === KID_ORIENTATION,
  );
  if (offers.length === 0) return undefined;

  // Step 1: move it at all?
  const confirm = offers.find((action) => action.option.kind === "confirm");
  const skip = offers.find((action) => action.option.kind === "skip");
  if (confirm && skip) {
    // An attack that already fails needs no answer, and moving it onto the
    // Leader would hand it a target it can beat.
    const connects =
      battle.attackPower >= battle.targetPower + battle.counterPower;
    const candidates = redirectCandidates(observation);
    const current = candidates.find(
      (target) => target.instanceId === battle.targetInstanceId,
    );
    const staying = current
      ? redirectTargetValue(current, battle, observation)
      : 1;
    const best = candidates
      .filter((target) => target.instanceId !== battle.targetInstanceId)
      .reduce(
        (top, target) =>
          Math.max(top, redirectTargetValue(target, battle, observation)),
        -1,
      );
    return connects && best > staying
      ? decision(confirm, "Move the attack onto the Kid that answers it best.")
      : decision(
          skip,
          "Keep the face-up Life card: the attack is already pointed at the card that can take it.",
        );
  }

  const cards = offers.filter((action) => action.option.kind === "card");
  if (cards.length === 0) return undefined;

  // Step 2: which Life card pays. The top one, which is the card the Leader's
  // `[End of Your Turn]` and Kid's `[Activate: Main]` turn face-up again; the
  // bottom of the stack is refreshed by neither.
  const life = cards.filter(
    (action) => action.option.kind === "card" && action.option.zone === "life",
  );
  if (life.length > 0) {
    const top = observation.self.life[0]?.instanceId;
    return decision(
      life.find((action) => action.optionId === top) ?? life[0]!,
      "Pay with the top Life card, the one this deck turns face-up again.",
    );
  }

  // Step 3: where it lands, on the scale step 1 decided with.
  const target = [...cards].sort((left, right) => {
    const score = (action: EffectAction) =>
      action.option.kind === "card"
        ? redirectTargetValue(
            {
              instanceId: action.option.card.instanceId,
              currentPower: action.option.currentPower ?? 0,
              isLeader: action.option.zone === "leader",
            },
            battle,
            observation,
          )
        : 0;
    return score(right) - score(left);
  })[0]!;
  return decision(target, "Land the attack on the Kid that answers it best.");
}

function scorePlay(observation: GameObservation, action: PlayAction): number {
  const card = observation.self.hand.find(
    (candidate) => candidate.instanceId === action.cardInstanceId,
  );
  if (!card) return 0;
  const bonneyTarget = observation.opponent.board.some(
    (target) => target.cost <= 4,
  );
  return (
    value(card.cardNumber) +
    (card.cardNumber === "P-085" &&
    bonneyTarget &&
    observation.opponent.lifeCount > 1
      ? 100
      : 0) +
    (card.cardNumber === "ST36-005" ? 200 : 0) +
    (card.cardNumber === "ST36-002" ? 180 : 0)
  );
}

function chooseAttack(
  observation: GameObservation,
): PolicyDecision | undefined {
  const attacks = viableAttacks(observation, observation.legalActions);
  if (attacks.length === 0) return undefined;
  const leader = opponentLeaderId(observation);
  const leaderPressure = attacks
    .filter((action) => action.targetInstanceId === leader)
    .sort(
      (left, right) =>
        attackerPower(observation, left) - attackerPower(observation, right),
    )[0];
  const targetPriority = new Map([
    ["ST31-002", 100],
    ["ST31-001", 95],
    ["OP14-015", 90],
    ["OP11-009", 85],
  ]);
  const target = [...attacks]
    .filter((action) => {
      const card = observation.opponent.board.find(
        (candidate) => candidate.instanceId === action.targetInstanceId,
      );
      return targetPriority.has(card?.cardNumber ?? "");
    })
    .sort((left, right) => {
      const score = (action: AttackAction) => {
        const card = observation.opponent.board.find(
          (candidate) => candidate.instanceId === action.targetInstanceId,
        );
        return targetPriority.get(card?.cardNumber ?? "") ?? 0;
      };
      return score(right) - score(left);
    })[0];
  if (target && observation.opponent.lifeCount >= 3) {
    return decision(
      target,
      "Attack the highest-priority rested ST31 Character before the closing window.",
    );
  }
  if (leaderPressure) {
    return decision(
      leaderPressure,
      "Lead with the smallest effective ST36 attack to preserve larger finishers.",
    );
  }
  return decision(attacks[0]!, "Use the remaining viable ST36 attack.");
}

/** The opening hand: search, filtering, or the Kid/Bonney curve. */
export function createSt36MulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "st36-mulligan",
    keep: (observation) => {
      const hand = new Set(
        observation.self.hand.map((card) => card.cardNumber),
      );
      return (
        hand.has("OP10-111") || hand.has("ST36-002") || hand.has("ST36-005")
      );
    },
    keepBecause:
      "Keep an ST36 hand with search, filtering, or the Kid/Bonney curve.",
    mulliganBecause: "Mulligan for an ST36 early engine.",
  });
}

export function createSt36RulesPolicy(): RulesPolicy {
  return (observation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== ST36_LEADER) return undefined;
    const actions = observation.legalActions;

    const effects = actions.filter(
      (action): action is EffectAction => action.type === "resolve-effect",
    );
    if (effects.length > 0) return chooseEffect(observation, effects);
    const trigger = chooseTrigger(observation);
    if (trigger) return trigger;
    const block = chooseGenericBlock(observation, actions);
    if (block) return block;
    if (observation.phase === "counter") {
      return chooseGenericCounter(observation, actions, {
        protectedCards: new Set(["ST36-005", "P-085", "OP10-109"]),
      });
    }
    if (observation.phase !== "main") return undefined;

    const faceUpLife = observation.self.life.filter(
      (card) => card.faceUp,
    ).length;
    // Which Life card the cost turns is a choice inside the activation now --
    // ST36-005 moved onto the mechanic DSL with the rest of the activation
    // register -- so the offer no longer carries a `position`. The clause
    // reaches the top and the bottom card and offers them in that order, and
    // the top is the one this rule wants: it is the card the redirect's own
    // cost turns back face-down.
    const kidOrientation = actions.find(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === KID_ORIENTATION,
    );
    const leaderId = selfLeaderId(observation);
    const leaderCanAttack = actions.some(
      (action) =>
        action.type === "attack" && action.attackerInstanceId === leaderId,
    );
    const desiredLeaderPower =
      observation.opponent.leader.currentPower +
      (observation.opponent.lifeCount <= 1 ? 3_000 : 2_000);
    const leaderAttachment = actions.find(
      (action) =>
        action.type === "attach-don" && action.targetInstanceId === leaderId,
    );
    const prioritizePressure =
      observation.opponent.lifeCount <= 1 || observation.turn >= 8;
    if (
      prioritizePressure &&
      leaderCanAttack &&
      leaderAttachment &&
      observation.self.leader.currentPower < desiredLeaderPower
    ) {
      return decision(
        leaderAttachment,
        "Reserve DON!! for late or closing Leader pressure before development.",
      );
    }
    if (observation.opponent.lifeCount <= 1) {
      const closingAttack = viableAttacks(observation, actions)
        .filter(
          (action) => action.targetInstanceId === opponentLeaderId(observation),
        )
        .sort(
          (left, right) =>
            attackerPower(observation, right) -
            attackerPower(observation, left),
        )[0];
      if (closingAttack) {
        return decision(
          closingAttack,
          "Attack before development while the opponent is in the closing window.",
        );
      }
    }

    if (kidOrientation && faceUpLife === 0 && observation.self.lifeCount > 0) {
      return decision(
        kidOrientation,
        "Turn top Life face-up to preserve Kid's attack-redirection resource.",
      );
    }

    const drake = actions
      .filter(
        (action): action is ActivationAction =>
          action.type === "activate-main" && action.sourceCardNumber === DRAKE,
      )
      .sort((left, right) => {
        const target = (action: typeof left) =>
          observation.opponent.board.find(
            (card) => card.instanceId === action.targetInstanceId,
          );
        return (target(right)?.cost ?? 0) - (target(left)?.cost ?? 0);
      })[0];
    if (drake) {
      return decision(
        drake,
        "Rest the highest-cost eligible opposing Character.",
      );
    }

    const play = actions
      .filter((action): action is PlayAction => action.type === "play-card")
      .sort(
        (left, right) =>
          scorePlay(observation, right) - scorePlay(observation, left),
      )[0];
    if (play) return decision(play, "Develop the highest-impact ST36 card.");

    if (
      leaderCanAttack &&
      leaderAttachment &&
      observation.self.leader.currentPower < desiredLeaderPower
    ) {
      return decision(
        leaderAttachment,
        "Build one efficient Leader attack before committing attackers.",
      );
    }

    const attack = chooseAttack(observation);
    if (attack) return attack;

    const activation = actions.find(
      (action) => action.type === "activate-main",
    );
    if (activation) {
      return decision(activation, "Use the remaining ST36 activation.");
    }
    return decision(
      pass(actions),
      "End the turn instead of attaching DON!! after all attacks are spent.",
    );
  };
}
