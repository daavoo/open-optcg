import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  attackerPower,
  bestSearchResult,
  chooseGenericBlock,
  chooseGenericCounter,
  chooseGenericTrigger,
  chooseStrongestOpponentTarget,
  decision,
  isSearchResult,
  nonSkipEffects,
  opponentLeaderId,
  optionCardCost,
  optionCardNumberOf,
  pass,
  type PolicyDecision,
  selfLeaderId,
  viableAttacks,
} from "../generic-policy.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

const ST31_LEADER = "ST21-001";
const PROTECTED_CHARACTERS = new Set([
  "ST31-001",
  "ST31-002",
  "ST31-003",
  "ST31-004",
  "OP11-009",
  "OP11-012",
  "OP14-015",
]);
const CARD_VALUE = new Map([
  ["ST31-004", 95],
  ["OP14-015", 90],
  ["ST31-001", 85],
  ["ST31-002", 82],
  ["OP11-003", 70],
  ["OP11-009", 68],
  ["OP11-012", 67],
  ["P-101", 65],
  ["ST31-003", 60],
  ["OP13-021", 58],
  ["OP04-016", 55],
  ["ST31-005", 50],
  ["OP01-016", 48],
  ["ST23-004", 35],
]);

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;
type PlayAction = Extract<LegalAction, { type: "play-card" }>;
type ActivationAction = Extract<LegalAction, { type: "activate-main" }>;

function cardValue(cardNumber: string): number {
  return CARD_VALUE.get(cardNumber) ?? 0;
}

function cardForPlay(observation: GameObservation, action: PlayAction) {
  return observation.self.hand.find(
    (card) => card.instanceId === action.cardInstanceId,
  );
}

function scorePlay(observation: GameObservation, action: PlayAction): number {
  const card = cardForPlay(observation, action);
  if (!card) return 0;
  const otherCards = observation.self.hand.filter(
    (candidate) => candidate.instanceId !== card.instanceId,
  );
  const hasOneCost = otherCards.some(
    (candidate) =>
      candidate.cost <= 1 &&
      !["OP04-016", "OP13-021"].includes(candidate.cardNumber),
  );
  const hasSanjiTarget = otherCards.some(
    (candidate) =>
      candidate.cost <= 5 &&
      !["OP04-016", "OP13-021", "ST31-005"].includes(candidate.cardNumber),
  );
  const lowestBoardValue = Math.min(
    ...observation.self.board.map((candidate) =>
      cardValue(candidate.cardNumber),
    ),
  );
  const replacementAdjustment =
    observation.self.board.length >= 5
      ? cardValue(card.cardNumber) - lowestBoardValue
      : 0;
  return (
    cardValue(card.cardNumber) +
    (card.cardNumber === "ST31-001" && hasSanjiTarget ? 80 : 0) +
    (card.cardNumber === "ST31-002" && hasOneCost ? 60 : 0) +
    (["ST31-004", "OP14-015"].includes(card.cardNumber) &&
    observation.opponent.lifeCount <= 2
      ? 70
      : 0) +
    replacementAdjustment
  );
}

function chooseExactCostPlay(
  observation: GameObservation,
  actions: readonly LegalAction[],
): PlayAction | undefined {
  const canAttachLeader = actions.some(
    (action) =>
      action.type === "attach-don" &&
      action.targetInstanceId === selfLeaderId(observation),
  );
  if (!canAttachLeader) return undefined;
  return actions
    .filter(
      (action): action is PlayAction =>
        action.type === "play-card" &&
        cardForPlay(observation, action)?.cost === observation.self.activeDon,
    )
    .sort(
      (left, right) =>
        scorePlay(observation, right) - scorePlay(observation, left),
    )[0];
}

/**
 * Whether this body still has an attack for the gift to pay off.
 *
 * `chooseRushFeed` answers the same question by reading the `attack` actions
 * out of `legalActions`, because it runs at the activation. This runs one
 * decision later, inside the `choose` the activation opens, where every legal
 * action is a `resolve-effect` and the attacks are not on offer -- so the
 * eligibility the engine would have stated has to be rebuilt from the board.
 *
 * The approximation it replaces was `!card.rested`, which reads an unavailable
 * body as an attacker three different ways, and cost a whole attack in a
 * recorded match: ST32-002 Kouzuki Oden had barred ST21-015 Zoro from resting,
 * so Zoro had no attack at all, and the ranking below still handed it the
 * Leader's two DON!! for crossing a power threshold it could not swing at --
 * while Brook, the turn's one real attacker, went unfed and did not attack.
 *
 * Summoning sickness is the one bar the gift itself can lift: ST31-001 Sanji
 * and ST21-015 Zoro both print `[DON!! x2] This Character gains [Rush]`, so a
 * body played this turn is an attacker exactly when the DON!! landing on it
 * reaches its own `[DON!! xN]` requirement. That is read off `donRequirement`
 * and the printed `[Rush]` token rather than a card list, so a later
 * conditional-Rush body is covered on import. ST31-004 Luffy's Rush counts the
 * *field's* given DON!! rather than its own and so prints no `[DON!! xN]`; the
 * Leader rung above is what completes that total.
 */
function canAttackWithGift(
  observation: GameObservation,
  card: GameObservation["self"]["board"][number],
  amount: number,
): boolean {
  if (card.rested) return false;
  if ((card.cannotAttackUntilTurn ?? -1) >= observation.turn) return false;
  // Attacking rests the attacker, so a body that cannot be rested cannot
  // attack -- the observation says so outright and nothing else on the board
  // distinguishes it from an available one.
  if ((card.cannotRestUntilTurn ?? -1) >= observation.turn) return false;
  if (card.summoningSick !== true) return true;
  const facts = observation.cardFacts[card.cardNumber];
  if (!facts?.rules.tokens.includes("[Rush]")) return false;
  return (
    facts.donRequirement > 0 &&
    card.attachedDon + amount >= facts.donRequirement
  );
}

/**
 * Where a rested-DON!! gift lands.
 *
 * The ST21-001 Leader and ST31-005 Thousand Sunny both print "give up to N
 * rested DON!! cards to 1 of your <cards>". Both clauses are written in the
 * mechanic DSL, so the recipient is a `choose` the activation opens rather than
 * part of the activation itself -- which is why this ranking runs at the
 * recipient decision rather than inside `chooseRushFeed` or `chooseActivation`.
 *
 * The order is the deck's: a just-played Sanji that Rush is waiting on, then
 * the Leader while it has no DON!! (which is what turns its own ability on and
 * what ST31-004's field-wide total counts), then an attacker the gift pushes
 * over a real power threshold, then simple card value.
 */
function chooseDonGiftTarget(
  observation: GameObservation,
  effects: EffectAction[],
): PolicyDecision | undefined {
  const sourceCardNumber = effects[0]?.sourceCardNumber;
  if (sourceCardNumber !== ST31_LEADER && sourceCardNumber !== "ST31-005") {
    return undefined;
  }
  const candidates = nonSkipEffects(effects).filter(
    (action) => action.option.kind === "card" && action.option.owner === "self",
  );
  if (candidates.length === 0) return undefined;
  const pick = (instanceId: string): EffectAction | undefined =>
    candidates.find((action) => action.optionId === instanceId);

  const sanji = observation.self.board.find(
    (card) =>
      card.cardNumber === "ST31-001" &&
      card.playedTurn === observation.turn &&
      !card.rested &&
      card.attachedDon < 2,
  );
  const sanjiGift = sanji ? pick(sanji.instanceId) : undefined;
  if (sanjiGift) {
    return decision(
      sanjiGift,
      "Give active Sanji the rested DON!! that enables Rush.",
    );
  }

  const totalGivenDon =
    observation.self.leader.attachedDon +
    observation.self.board.reduce((total, card) => total + card.attachedDon, 0);
  const leaderGift = pick(selfLeaderId(observation));
  if (observation.self.leader.attachedDon === 0 && leaderGift) {
    return decision(
      leaderGift,
      totalGivenDon < 3 &&
        observation.self.board.some(
          (card) =>
            card.cardNumber === "ST31-004" &&
            card.playedTurn === observation.turn &&
            !card.rested,
        )
        ? "Give rested DON!! to the Leader while completing the field-wide total that grants Luffy Rush."
        : "Give the Leader its first DON!! so its own ability is live.",
    );
  }

  // The gift is the whole of the clause, so its size is known: the Leader
  // hands over two and the Stage one. A threshold the gift does not cross buys
  // nothing this turn, which is what separates a useful recipient from a
  // parking space.
  const amount = sourceCardNumber === ST31_LEADER ? 2 : 1;
  const legalAttackers = new Set(
    observation.self.board
      .filter((card) => canAttackWithGift(observation, card, amount))
      .map((card) => card.instanceId),
  );
  const thresholds = [
    observation.opponent.leader.currentPower + 1_000,
    ...observation.opponent.board
      .filter((card) => card.rested)
      .map((card) => card.currentPower + 1_000),
  ];
  const board = new Map(
    observation.self.board.map((card) => [card.instanceId, card]),
  );
  const ranked = candidates
    .map((action) => {
      const target = board.get(action.optionId);
      // The Leader, whose own rung is above: it is never the ranked pick.
      if (!target) return { action, score: -1, attacks: false };
      const attacks = legalAttackers.has(target.instanceId);
      const resulting = target.currentPower + amount * 1_000;
      const crossed = attacks
        ? thresholds.filter(
            (threshold) =>
              target.currentPower < threshold && resulting >= threshold,
          ).length
        : 0;
      // A body with an attack outranks every body without one, whatever the
      // thresholds say. Below that line the tiers still order themselves, so a
      // turn where nothing can attack keeps the old ranking by card value
      // rather than falling to hand order: given DON!! stays on the card
      // through the opponent's turn, and both ST31-003 Brook's [Opponent's
      // Turn] Blocker and ST31-004's Rush read the field's total.
      return {
        action,
        score:
          (attacks ? 1_000_000 : 0) +
          crossed * 100_000 +
          cardValue(target.cardNumber),
        attacks,
      };
    })
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score)[0];
  if (ranked) {
    return decision(
      ranked.action,
      ranked.attacks
        ? "Give the rested DON!! to the attacker it moves furthest."
        : "No Character can attack: bank the rested DON!! on the best body.",
    );
  }
  return decision(
    candidates[0]!,
    "Give the rested DON!! to the best remaining ST31 card.",
  );
}

function chooseEffect(
  observation: GameObservation,
  effects: EffectAction[],
): PolicyDecision {
  const donGift = chooseDonGiftTarget(observation, effects);
  if (donGift) return donGift;
  const nonSkip = nonSkipEffects(effects);
  // The deck's own declared priority wins over raw card value: at r5 of the
  // Nami match the rules took ST31-004 Luffy (card value 95) over the Zoro
  // this list puts first, and the LLM took Zoro.
  const searchPriority = [
    "Roronoa Zoro",
    "Monkey.D.Luffy",
    "Thousand Sunny",
    "Nami",
    "Sanji",
    "Jinbe",
    "Brook",
  ];
  if (effects.some(isSearchResult)) {
    for (const name of searchPriority) {
      // Several ST31 cards share a name -- ST23-004 and ST31-004 are both
      // "Monkey.D.Luffy" -- and the name is not the whole priority: within a
      // name, the deck wants the impactful copy (the 7-cost Rush Luffy, value
      // 95, over the cheap 2000-power one). Sort the same-name candidates by
      // card value so the name loop and the value fallback agree.
      const sameName = bestSearchResult(
        effects,
        cardValue,
        (card) => card.name === name,
      );
      if (sameName) {
        return decision(sameName, `Prioritize ${name} from the search.`);
      }
    }
    const search = bestSearchResult(effects, cardValue);
    if (search && cardValue(optionCardNumberOf(search)) > 0) {
      return decision(search, "Take the highest-value ST31 search result.");
    }
  }
  for (const name of searchPriority) {
    const search = nonSkip.find(
      (action) =>
        action.option.kind === "card" &&
        action.option.zone === "revealed" &&
        action.option.card.name === name,
    );
    if (search) return decision(search, `Prioritize ${name} from the search.`);
  }

  if (effects[0]?.effectKind === "bad-manners-counter") {
    // Bad Manners' [Counter] text costs a card from hand. A cost is paid with
    // the least valuable card, not the most: at r127 of the ST31-vs-Nami match
    // the rules trashed the 7-cost Luffy to pay it, while the LLM trashed a
    // redundant Thousand Sunny. The free-play branch below sorts the other way
    // and must not be reached for a cost.
    const cost = [...nonSkip]
      .filter(
        (action) =>
          action.option.kind === "card" &&
          action.option.owner === "self" &&
          action.option.zone === "hand",
      )
      .sort(
        (left, right) =>
          cardValue(left.optionCardNumber ?? "") -
            cardValue(right.optionCardNumber ?? "") ||
          optionCardCost(left) - optionCardCost(right),
      )[0];
    if (cost)
      return decision(
        cost,
        "Pay the Counter Event cost with the least valuable card.",
      );
  }

  const freePlay = nonSkip
    .filter(
      (action) =>
        action.option.kind === "card" &&
        action.option.owner === "self" &&
        action.option.zone === "hand",
    )
    .sort(
      (left, right) =>
        cardValue(right.optionCardNumber ?? "") -
          cardValue(left.optionCardNumber ?? "") ||
        optionCardCost(right) - optionCardCost(left),
    )[0];
  if (freePlay)
    return decision(freePlay, "Free-play the highest-cost ST31 target.");

  // Kept at this rung so ST31's ladder order is unchanged; the rule itself now
  // lives in `generic-policy.ts`, which is what gives it to the other decks too.
  const powerTarget = chooseStrongestOpponentTarget(nonSkip);
  if (powerTarget) return powerTarget;

  if (effects[0]?.effectKind === "character-area-replacement") {
    const boardValue = new Map(
      observation.self.board.map((card) => [
        card.instanceId,
        cardValue(card.cardNumber),
      ]),
    );
    const replacement = nonSkip
      .filter((action) => boardValue.has(action.optionId))
      .sort(
        (left, right) =>
          (boardValue.get(left.optionId) ?? 0) -
          (boardValue.get(right.optionId) ?? 0),
      )[0];
    if (replacement)
      return decision(
        replacement,
        "Replace the lowest-value Character to continue the ST31 play chain.",
      );
  }

  const brook = observation.self.board.find(
    (card) => card.cardNumber === "ST31-003",
  );
  const brookChoice = brook
    ? nonSkip.find((action) => action.optionId === brook.instanceId)
    : undefined;
  return decision(
    brookChoice ?? nonSkip[0] ?? effects[0]!,
    "Resolve the best available ST31 effect option.",
  );
}

/** Complete ST31-004's field-wide three-given-DON!! Rush condition. */
function chooseRushFeed(
  observation: GameObservation,
  actions: readonly LegalAction[],
):
  | Extract<LegalAction, { type: "attach-don" }>
  | Extract<LegalAction, { type: "activate-main" }>
  | undefined {
  const luffy = observation.self.board.find(
    (card) =>
      card.cardNumber === "ST31-004" &&
      card.playedTurn === observation.turn &&
      !card.rested,
  );
  const totalGivenDon =
    observation.self.leader.attachedDon +
    observation.self.board.reduce((total, card) => total + card.attachedDon, 0);
  if (!luffy || totalGivenDon >= 3) return undefined;
  const activations = actions.filter(
    (action): action is ActivationAction => action.type === "activate-main",
  );
  // The recipient is no longer part of the offer -- both DON!! gifts moved onto
  // the mechanic DSL, where the activation opens the choice. `chooseDonGiftTarget`
  // is the other half of every rule below, and holds the same ranking.
  const sunny = activations.find(
    (action) => action.sourceCardNumber === "ST31-005",
  );
  if (observation.self.leader.attachedDon === 0 && sunny) {
    return sunny;
  }
  if (observation.self.leader.attachedDon === 0) {
    const leaderAttach = actions.find(
      (action): action is Extract<LegalAction, { type: "attach-don" }> =>
        action.type === "attach-don" &&
        action.targetInstanceId === selfLeaderId(observation),
    );
    if (leaderAttach) return leaderAttach;
  }
  const legalAttackers = new Set(
    actions
      .filter((action) => action.type === "attack")
      .map((action) => action.attackerInstanceId),
  );
  const targets = [
    ...observation.self.board
      .filter(
        (card) =>
          card.instanceId !== luffy.instanceId &&
          legalAttackers.has(card.instanceId),
      )
      .sort(
        (left, right) =>
          cardValue(right.cardNumber) - cardValue(left.cardNumber) ||
          right.currentPower - left.currentPower,
      ),
    luffy,
  ];
  const fromLeader = activations.find(
    (action) => action.sourceCardNumber === ST31_LEADER,
  );
  if (fromLeader) return fromLeader;
  if (sunny) return sunny;
  const attachments = actions.filter(
    (action): action is Extract<LegalAction, { type: "attach-don" }> =>
      action.type === "attach-don",
  );
  for (const target of targets) {
    const attachment = attachments.find(
      (action) => action.targetInstanceId === target.instanceId,
    );
    if (attachment) return attachment;
  }
  return undefined;
}

function chooseActivation(
  observation: GameObservation,
  actions: readonly LegalAction[],
): ActivationAction | undefined {
  const activations = actions.filter(
    (action): action is ActivationAction => action.type === "activate-main",
  );
  const sanji = observation.self.board.find(
    (card) =>
      card.cardNumber === "ST31-001" &&
      card.playedTurn === observation.turn &&
      !card.rested &&
      card.attachedDon < 2,
  );
  // The Leader's gift is one offer now; which Character it lands on is
  // `chooseDonGiftTarget`'s decision, and Sanji is the first thing it looks
  // for. Reaching the activation at all is what this is still for.
  const sanjiActivation = sanji
    ? activations.find((action) => action.sourceCardNumber === ST31_LEADER)
    : undefined;
  if (sanjiActivation) return sanjiActivation;
  const priority = ["ST31-005", ST31_LEADER, "OP13-021", "ST23-004"];
  for (const sourceCardNumber of priority) {
    const matching = activations.filter(
      (action) => action.sourceCardNumber === sourceCardNumber,
    );
    if (matching[0]) return matching[0];
  }
  return activations[0];
}

function chooseAttachment(
  observation: GameObservation,
  actions: readonly LegalAction[],
  leaderId: string,
): LegalAction | undefined {
  const attachments = actions.filter(
    (action): action is Extract<LegalAction, { type: "attach-don" }> =>
      action.type === "attach-don" && action.targetInstanceId !== leaderId,
  );
  const board = new Map(
    observation.self.board.map((card) => [card.instanceId, card]),
  );
  const legalAttackers = new Set(
    actions
      .filter((action) => action.type === "attack")
      .map((action) => action.attackerInstanceId),
  );
  const leaderPower = observation.opponent.leader.currentPower;
  const pressureThresholds = [
    leaderPower,
    leaderPower + 2_000,
    leaderPower + 4_000,
  ];
  const donToNextThreshold = (power: number): number =>
    (pressureThresholds.find((threshold) => threshold > power) ??
      power + 2_000) - power;
  return attachments
    .filter((action) => legalAttackers.has(action.targetInstanceId))
    .sort((left, right) => {
      const leftCard = board.get(left.targetInstanceId);
      const rightCard = board.get(right.targetInstanceId);
      const leftPower = leftCard?.currentPower ?? 0;
      const rightPower = rightCard?.currentPower ?? 0;
      return (
        donToNextThreshold(leftPower) - donToNextThreshold(rightPower) ||
        leftPower - rightPower
      );
    })[0];
}

function chooseClosingFinisher(
  observation: GameObservation,
  actions: readonly LegalAction[],
): PlayAction | undefined {
  if (observation.opponent.lifeCount > 2) return undefined;
  const finisher = observation.self.hand.find(
    (card) => card.cardNumber === "OP14-015" || card.cardNumber === "ST31-004",
  );
  return finisher
    ? actions.find(
        (action): action is PlayAction =>
          action.type === "play-card" &&
          action.cardInstanceId === finisher.instanceId,
      )
    : undefined;
}

function chooseAttack(
  observation: GameObservation,
  actions: readonly LegalAction[],
): Extract<LegalAction, { type: "attack" }> | undefined {
  const attacks = viableAttacks(observation, actions);
  const leaderTarget = opponentLeaderId(observation);
  const leaderAttack = attacks
    .filter((action) => action.targetInstanceId === leaderTarget)
    .sort(
      (left, right) =>
        attackerPower(observation, left) - attackerPower(observation, right),
    )[0];
  if (leaderAttack) return leaderAttack;

  const characterTarget = attacks
    .filter((action) => action.targetInstanceId !== leaderTarget)
    .sort((left, right) => {
      const leftTarget = observation.opponent.board.find(
        (card) => card.instanceId === left.targetInstanceId,
      );
      const rightTarget = observation.opponent.board.find(
        (card) => card.instanceId === right.targetInstanceId,
      );
      return (rightTarget?.cost ?? 0) - (leftTarget?.cost ?? 0);
    })[0];
  return characterTarget;
}

/**
 * The opening hand: a searcher, or a Straw Hat with something cheap to chain
 * into that is not one of the two Events the curve cannot use on turn one.
 */
export function createSt31MulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "st31-mulligan",
    keep: (observation) => {
      const hand = new Set(
        observation.self.hand.map((card) => card.cardNumber),
      );
      return (
        hand.has("ST31-005") ||
        hand.has("OP01-016") ||
        ((hand.has("ST31-001") || hand.has("ST31-002")) &&
          observation.self.hand.some(
            (card) =>
              card.cost <= 2 &&
              !["OP04-016", "OP13-021"].includes(card.cardNumber),
          ))
      );
    },
    keepBecause: "Keep a functional ST31 opener.",
    mulliganBecause: "Mulligan for an ST31 engine.",
  });
}

export function chooseSt31Rules(
  observation: GameObservation,
): PolicyDecision | undefined {
  if (observation.self.leader.cardNumber !== ST31_LEADER) return undefined;
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
    // Neither of `chooseGenericCounter`'s opt-outs is set, and both cost cards
    // here:
    //
    //  - `economicalCharacterDefense: false` removes the cap on saving a
    //    protected Character, so any demand becomes payable -- five cards for a
    //    *rested* body against an 11000 attacker, which does not even deny the
    //    follow-up attack when the attacker's restand is earned on declaration.
    //  - `efficientCombination: false` replaces `bestCounterCombination` with
    //    the counters sorted ascending, spending 1000s before 2000s. Since the
    //    policy re-enters once per card, that is the line that needs the *most*
    //    cards for a given demand -- the opposite of what the flag's name
    //    suggests.
    //
    // The defaults are what every other deck uses.
    return chooseGenericCounter(observation, actions, {
      protectedCards: PROTECTED_CHARACTERS,
    });
  }
  if (observation.phase !== "main") return undefined;

  const leaderId = selfLeaderId(observation);
  const leaderAttachment = actions.find(
    (action) =>
      action.type === "attach-don" &&
      action.targetInstanceId === leaderId &&
      observation.self.leader.attachedDon === 0,
  );
  // Sunny's gift no longer names its recipient on the offer, so this is "Sunny
  // can pay" rather than "Sunny is paying the Leader"; `chooseDonGiftTarget`
  // sends it to the Leader while the Leader has none, which is the same board
  // this branch is about.
  const sunnyLeaderActivation = actions.find(
    (action) =>
      action.type === "activate-main" && action.sourceCardNumber === "ST31-005",
  );
  if (leaderAttachment && !sunnyLeaderActivation) {
    const exactCostPlay = chooseExactCostPlay(observation, actions);
    if (exactCostPlay)
      return decision(
        exactCostPlay,
        "Preserve the exact-cost ST31 development line before attaching Leader DON!!.",
      );
    return decision(leaderAttachment, "Enable the ST31 Leader ability.");
  }

  const rushFeed = chooseRushFeed(observation, actions);
  if (rushFeed)
    return decision(
      rushFeed,
      rushFeed.type === "attach-don"
        ? "Attach DON!! toward the field-wide total that grants the just-played Luffy Rush."
        : rushFeed.sourceCardNumber === ST31_LEADER
          ? "Give rested DON!! to an eligible attacker while completing the field-wide total that grants Luffy Rush."
          : "Use Thousand Sunny toward the field-wide total that grants the just-played Luffy Rush.",
    );

  const closingFinisher = chooseClosingFinisher(observation, actions);
  if (closingFinisher) {
    return decision(
      closingFinisher,
      "Reserve the closing DON!! curve for Rush Luffy before engine development.",
    );
  }

  const handCards = new Map(
    observation.self.hand.map((card) => [card.instanceId, card]),
  );
  const hasActiveSunny =
    observation.self.stage?.cardNumber === "ST31-005" &&
    !observation.self.stage.rested;
  const play = actions
    .filter((action): action is PlayAction => {
      if (action.type !== "play-card") return false;
      const card = handCards.get(action.cardInstanceId);
      if (!card) return true;
      if (card.cardNumber === "ST31-005") return !hasActiveSunny;
      return true;
    })
    .sort(
      (left, right) =>
        scorePlay(observation, right) - scorePlay(observation, left),
    )[0];
  if (play) return decision(play, "Play the highest-priority ST31 card.");

  const activation = chooseActivation(observation, actions);
  if (activation) {
    // Both halves of the old explanation described a choice this decision no
    // longer makes. Since the gift moved onto the mechanic DSL the activation
    // names no recipient and no amount -- it hands over what the rested pile
    // holds, up to two -- so `activationTarget` was always undefined here and
    // the "minimum" branch always won. Who receives it is the `choose` that
    // follows, and `chooseDonGiftTarget` explains that decision there.
    return decision(
      activation,
      activation.sourceCardNumber === ST31_LEADER
        ? "Open the Leader's gift of every rested DON!! it can spare, and pick the attacker on the choice it raises."
        : "Use the highest-priority ST31 activation.",
    );
  }
  const attachment = chooseAttachment(observation, actions, leaderId);
  if (attachment)
    return decision(attachment, "Attach DON!! to the best ST31 attacker.");
  const attack = chooseAttack(observation, actions);
  if (attack)
    return decision(
      attack,
      attack.targetInstanceId === opponentLeaderId(observation)
        ? observation.opponent.lifeCount === 0
          ? "Attack the opposing Leader for guaranteed lethal."
          : "Pressure the opposing Leader with the smallest viable ST31 attack."
        : "Remove a rested Character when Leader pressure is not viable.",
    );
  return decision(
    pass(actions),
    "End the turn instead of attaching DON!! to spent attackers.",
  );
}
