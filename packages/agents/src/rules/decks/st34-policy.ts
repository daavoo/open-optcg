import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  attackerPower,
  bestSearchResult,
  chooseGenericBlock,
  chooseGenericCounter,
  chooseGenericTrigger,
  decision,
  isSearchResult,
  nonSkipEffects,
  opponentLeaderId,
  pass,
  type PolicyDecision,
  selfLeaderId,
  viableAttacks,
} from "../generic-policy.js";
import { WEIGHT, prefer, type Heuristic } from "../heuristics.js";
import type { RulesPolicy } from "../policy-chain.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

const ST34_LEADER = "OP11-062";
const ST31_LEADER = "ST21-001";

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;

const CARD_PRIORITY = new Map([
  ["ST34-004", 120],
  ["ST34-002", 105],
  ["EB03-035", 100],
  ["ST34-003", 95],
  ["ST34-001", 90],
  ["OP11-071", 85],
  ["OP11-066", 80],
  ["OP11-068", 75],
  ["P-090", 70],
  ["ST34-005", 65],
  ["OP11-065", 60],
  ["EB03-032", 55],
  ["OP11-081", 50],
  ["OP11-079", 45],
]);

const TARGET_PRIORITY = new Map([
  ["OP11-012", 100],
  ["ST31-001", 95],
  ["ST31-002", 90],
  ["OP14-015", 85],
  ["OP11-009", 80],
  ["ST31-003", 75],
]);

/**
 * Cards whose effect names a cost and reveals the opponent's top card. Holding
 * or fielding one is what makes the Leader's look worth its DON!! cost.
 */
const COST_GUESSERS = new Set([
  "OP11-066", // Charlotte Oven
  "OP11-071", // Charlotte Perospero
  "OP11-079", // ...Some Half-Hearted Assistance!!!! (Counter)
  "OP11-081", // Cognac Mama-Mash
]);

/** ST34-004 Charlotte Linlin: the 12000 finisher, and its `DON!! −4` cost. */
const LINLIN = "ST34-004";
/** EB03-035 Pudding, whose ramp fires only while not ahead on DON!!. */
const PUDDING = "EB03-035";
/** ST34-002 Cracker: ramp, then K.O. a cost-2-or-less Character. */
const CRACKER = "ST34-002";
/** ST34-003 Brulee, the 1-cost digger. */
const BRULEE = "ST34-003";
/** Turn by which the deck would rather have a body than a look. */
const BRULEE_TURNS = 5;
/** Highest value in {@link CARD_PRIORITY}, so the table normalises to 0..1. */
const TABLE_TOP = 120;

const PROTECTED_CARDS = new Set([
  "ST34-001",
  "ST34-002",
  "EB03-035",
  "OP11-066",
  "OP11-071",
  "ST34-004",
]);

function cardValue(cardNumber: string): number {
  return CARD_PRIORITY.get(cardNumber) ?? 0;
}

function chooseEffect(
  observation: GameObservation,
  effects: EffectAction[],
): PolicyDecision {
  const nonSkip = nonSkipEffects(effects);
  const kind = effects[0]?.effectKind;

  if (kind === "katakuri-leader") {
    const apply = nonSkip.find((action) => action.optionId === "apply");
    const battle = observation.activeBattle;
    // What the +1000 is worth on this battle, priced the way `tactics.ts` and
    // `counter-budget` price power: in whole Counter cards.
    //
    // Defending, the ability is worth buying when it turns the attack away --
    // and `counterPower` is part of the defence, because a Counter card already
    // spent this battle has moved the line the +1000 has to clear. The gate this
    // replaces compared against `targetPower` alone, so it stopped seeing the
    // ability the moment the Counter policy had spent a card, which is exactly
    // the battle worth saving.

    const defending =
      battle?.targetInstanceId === selfLeaderId(observation)
        ? battle
        : undefined;
    const defence = defending
      ? defending.targetPower + defending.counterPower
      : 0;
    const economicalDefense =
      defending !== undefined &&
      defending.attackPower >= defence &&
      defending.attackPower < defence + 1_000;
    // Nothing here buys the +1000 on the *attacking* side, not even when it
    // crosses a Counter-card threshold (6000 to 7000 costs the defender a
    // second card; 5000 to 6000 costs nothing). This deck's DON!! is worth
    // more as development than as pressure, and the same verdict shows up
    // again in the two gates below.
    const hasCharacterKatakuri = observation.self.board.some(
      (card) => card.cardNumber === "ST34-001",
    );
    // Paying the look purely to enable a cost guess is a large net loss, so
    // the look stays gated on the ramp or on
    // the battle it changes. A guesser that is about to resolve only breaks the
    // tie when the DON!! is already surplus.
    const knowsTop = observation.self.knowledge.opponentDeckTop !== null;
    const hasReadyGuesser = observation.self.board.some(
      (card) => COST_GUESSERS.has(card.cardNumber) && !card.rested,
    );
    const surplusDon =
      observation.self.activeDon >
      Math.min(...observation.self.hand.map((card) => card.cost), 99);
    // Nor is the look bought *while defending* to answer next turn's cost
    // guess, which reads as free: the DON!! comes out of the rested pool
    // during the opponent's turn and is redrawn two at a time, and
    // `resolveDeckTopKnowledge` keeps the answer until that card leaves the
    // top, so a look taken on their attack would make the next Perospero or
    // Cognac guess a certainty. It is the same verdict as above from the
    // other side. A returned DON!! is not free even out of the rested
    // pool -- it is a card off the *next* turn's field, and this deck's whole
    // problem in the format is that it is a turn behind.
    const choice =
      hasCharacterKatakuri ||
      economicalDefense ||
      (hasReadyGuesser && !knowsTop && surplusDon)
        ? apply
        : undefined;
    return decision(
      choice ?? effects.find((action) => action.optionId === "skip")!,
      choice
        ? hasCharacterKatakuri || economicalDefense
          ? "Use Katakuri when it ramps through Character Katakuri or saves the battle."
          : "Spend surplus DON!! to see the top card before a guesser resolves."
        : "Preserve the DON!! curve instead of paying for an unnecessary +1000.",
    );
  }

  // "Choose a cost and reveal 1 card from the top of your opponent's deck."
  //
  // Two shapes for one sentence: OP11-072's `[Counter]` half still raises the
  // imperative `st34-guess-cost` effect, whose options are `cost:N`, and the
  // three `[Main]`/`[Activate: Main]` guessers (OP11-066, OP11-071, OP11-081)
  // are `guessDeckTopCost` in the mechanic DSL, an eleven-branch `choice` whose
  // ids are `cost-N`. Matched by the option shape rather than by the effect
  // kind, so the rule cannot go silent the next time a guesser migrates.
  const guessOptions = new Map(
    effects.flatMap((action) => {
      const match = /^cost[-:](\d+)$/.exec(action.optionId);
      return match ? ([[Number(match[1]), action]] as const) : [];
    }),
  );
  if (guessOptions.size > 0) {
    // Katakuri's whole plan is to know this answer rather than guess it.
    const known = observation.self.knowledge.opponentDeckTop;
    const preferredCost =
      known?.cost ??
      (observation.opponent.leader.cardNumber === ST31_LEADER ? 1 : 4);
    const guess = guessOptions.get(preferredCost);
    return decision(
      guess ?? effects[0]!,
      known
        ? `Name cost ${preferredCost}: the opponent's top card is already known to be ${known.name}.`
        : `Guess the opponent deck's highest-frequency cost (${preferredCost}).`,
    );
  }

  if (effects.some(isSearchResult)) {
    return decision(
      bestSearchResult(effects, cardValue) ?? effects[0]!,
      "Take the highest-value Big Mom Pirates search result.",
    );
  }

  const hand = new Map(
    observation.self.hand.map((card) => [card.instanceId, card]),
  );
  if (kind === "free-play") {
    const choice = [...nonSkip]
      .filter((action) => hand.has(action.optionId))
      .sort((left, right) => {
        const leftCard = hand.get(left.optionId);
        const rightCard = hand.get(right.optionId);
        return (
          cardValue(rightCard?.cardNumber ?? "") -
            cardValue(leftCard?.cardNumber ?? "") ||
          (rightCard?.cost ?? 0) - (leftCard?.cost ?? 0)
        );
      })[0];
    return decision(
      choice ?? effects[0]!,
      "Free-play the highest-value legal Character.",
    );
  }

  if (kind === "st34-discard") {
    const discard = [...nonSkip]
      .filter((action) => hand.has(action.optionId))
      .sort((left, right) => {
        const leftCard = hand.get(left.optionId);
        const rightCard = hand.get(right.optionId);
        return (
          cardValue(leftCard?.cardNumber ?? "") -
            cardValue(rightCard?.cardNumber ?? "") ||
          (leftCard?.counter ?? 0) - (rightCard?.counter ?? 0)
        );
      })[0];
    return decision(
      discard ?? effects[0]!,
      "Trash the lowest-value hand card.",
    );
  }

  if (kind === "st34-power-boost") {
    const leader = nonSkip.find(
      (action) => action.optionId === selfLeaderId(observation),
    );
    return decision(
      leader ?? nonSkip[0] ?? effects[0]!,
      "Put Flampe's temporary power on the best available Katakuri attacker.",
    );
  }

  const opponent = new Map(
    observation.opponent.board.map((card) => [card.instanceId, card]),
  );
  const target = [...nonSkip]
    .filter((action) => opponent.has(action.optionId))
    .sort((left, right) => {
      const leftCard = opponent.get(left.optionId);
      const rightCard = opponent.get(right.optionId);
      return (
        (TARGET_PRIORITY.get(rightCard?.cardNumber ?? "") ?? 0) -
          (TARGET_PRIORITY.get(leftCard?.cardNumber ?? "") ?? 0) ||
        (rightCard?.currentPower ?? 0) - (leftCard?.currentPower ?? 0) ||
        (rightCard?.cost ?? 0) - (leftCard?.cost ?? 0)
      );
    })[0];
  return decision(
    target ?? nonSkip[0] ?? effects[0]!,
    "Resolve the highest-value ST34 target or effect option.",
  );
}

/**
 * The play-ordering claims, one named rule each.
 *
 * This was `choosePlay`: the ordinal table above plus three bonuses added to it,
 * and two of those three had no condition at all -- they were table adjustments
 * written as bonuses. None had been measured, and inside one additive sort none
 * could be.
 *
 * ## The deck, in one paragraph
 *
 * OP11-062 Katakuri is a DON!! *ramp* deck that pays for its ramp with `DON!! −1`
 * and top-of-deck information. Four cards add a rested DON!! from the DON!! deck
 * -- ST34-001, ST34-002, EB03-035 and OP11-071 -- and three name a cost and
 * reveal the opponent's top card, which is why the ladder's activation order is
 * a combo rather than a preference. The Leader itself spends `DON!! −1` per turn
 * for a look and +1000.
 *
 * So DON!! on the field is this deck's currency in both directions: it ramps to
 * get there and it pays `DON!! −N` to use what it has.
 *
 * ## What the named rules cost, and why they are taken anyway
 *
 * Every rule in the list is neutral-or-positive on its own, and the split from
 * the old `decide` scorer still costs the deck a fraction of a point. That
 * residual is *not* the play ordering: the rules reproduce the old scorer's
 * order exactly, and three different weight configurations produce
 * byte-identical games. It is the composition change the migration makes
 * unavoidably. The old `choosePlay` ran *inside* `decide`, so it chose freely
 * from whatever the wider layers had already narrowed to; a `rank` rule
 * instead *sums* with those layers, and
 * `strategy:control-katakuri-st34#ramp-first` ranks this deck's plays too --
 * it prefers anything that adds DON!! from the DON!! deck, which is four cards
 * here. So the deck's table and the archetype's preference vote together rather
 * than the archetype narrowing and the deck picking from what is left.
 *
 * Each rule is named so `pnpm deck:ab ... --disable st34#<rule>` prices it
 * alone. `brulee-early` is an exact zero on not one flipped game: ST34-003's
 * own place in the table already puts it where the turn gate would, so the
 * gate never changes an answer. Kept as the stated claim, and worth deleting
 * if the table ever moves.
 *
 * ## A lead, not a rule: Linlin's `DON!! −4`
 *
 * ST34-004's `[On Play]` reads `DON!! −4, you may trash 1 card from your hand:`
 * and buys a Life card plus one Character's base power becoming 0 for the turn.
 * Four DON!! *returned to the DON!! deck* is permanent, not a rest -- so a ramp
 * deck that spent six turns reaching ten DON!! hands four back on the turn it
 * casts its finisher. `chooseEffect`'s `st34-discard` branch answers it by
 * trashing the lowest-value hand card and never skipping, so the cost is paid
 * every single time. That is the class `generic-ladder-always-applies` describes
 * and OP-17 Kaido's `drake-don-is-the-plan` is the shipped answer to.
 *
 * There is no rule for it here, and a naive one is worse than none: a veto on
 * the `apply` confirm matches nothing, because the engine raises
 * `st34-discard` with hand-card options instead, so it reads as a clean zero
 * that is indistinguishable from a rule that fires and does not matter. The
 * right shape is a veto over the non-skip options of `st34-discard` sourced
 * from ST34-004,
 * and it needs checking against the resolver first -- whether declining the
 * discard also declines the `DON!! −4`, or only the card. It is a new rule
 * rather than a ladder dissolution, so it belongs in its own change with its own
 * A/B, and this note is here so the next reader starts from the right shape.
 */
export const ST34_PLAY_RULES: readonly Heuristic[] = [
  // The table, as the total order that keeps every play in the running.
  // In the deck band, not below it. The old scorer ran *inside* `decide`, so it
  // chose freely among whatever the wider layers had narrowed to; a `rank` rule
  // instead *sums* with them, and `strategy:control-katakuri-st34#ramp-first`
  // already ranks this deck's plays (it prefers anything that adds DON!! from
  // the DON!! deck, which is four cards here). Left at the default weight the
  // table contributes 5-12 against archetype contributions of 20-40 at the
  // default weight, which leaves the deck's own ordering outvoted by a wider
  // band -- backwards.
  prefer("Develop the highest-value Big Mom Pirates card.")
    .as("develop-by-value")
    .by(WEIGHT.deck)
    .play((card) => cardValue(card.cardNumber) / TABLE_TOP),

  // ST34-004 Charlotte Linlin, a 12000 for ten. The old bonus was +200 against
  // a table topping out near 100, so it was already a commitment; it is written
  // as one here rather than as a large number.
  prefer(
    "Cast Charlotte Linlin, the deck's only finisher, whenever the ramp reaches ten.",
  )
    .as("linlin-finisher")
    .by(WEIGHT.deck)
    .play((card) => card.cardNumber === LINLIN),

  // EB03-035 Pudding and ST34-002 Cracker, the deck's two other ramp bodies.
  // Flat, matching the old scorer's two +80 bonuses -- and flat deliberately
  // rather than for want of a condition to write.
  //
  // Both have one. Pudding's ramp fires `if the number of DON!! cards on your
  // field is equal to or less than the number on your opponent's field`, and
  // Cracker's K.O. needs an opposing Character at cost 2 or less. Gating each on
  // its own printed condition is the shape that carries ST-32 and ST-33, and
  // on this deck it is a loss.
  //
  // Why it inverts here: both cards are 4-cost bodies this deck wants on the
  // field anyway. Pudding is a [Blocker] and Cracker is a 5000, so on the turns
  // the gate is shut they are still the play -- and dropping them to their table
  // value on those turns hands the turn to a vanilla. The gates were pricing the
  // *clause* when what mattered was the body. A live-clause gate pays when the
  // card is bad without its clause; these two are not.
  //
  // A band below `linlin-finisher`, which is where the old scorer had them: its
  // +200 against their +80 meant a castable Linlin always outranked a ramp
  // body, and two rules sharing `WEIGHT.deck` made that a table tie-break
  // instead.
  prefer(
    "Land the ramp bodies, whose 4-cost bodies this deck wants regardless.",
  )
    .as("ramp-bodies")
    .by(WEIGHT.subArchetype)
    .play((card) => [PUDDING, CRACKER].includes(card.cardNumber)),

  // ST34-003 Brulee is a 1-cost look-at-three for a {Big Mom Pirates} card.
  // Kept from the old scorer, including its turn gate: a digger is worth most
  // while there is still a curve to find, and by turn 6 the deck would rather
  // spend the DON!! on a body.
  prefer("Dig with Brulee early, while there is still a curve to find.")
    .as("brulee-early")
    .when((t) => t.turn <= BRULEE_TURNS)
    .by(WEIGHT.archetype)
    .play((card) => card.cardNumber === BRULEE),
];

function chooseAttachment(
  observation: GameObservation,
  actions: readonly LegalAction[],
): Extract<LegalAction, { type: "attach-don" }> | undefined {
  const legalAttackers = new Set(
    actions
      .filter((action) => action.type === "attack")
      .map((action) => action.attackerInstanceId),
  );
  const board = new Map(
    observation.self.board.map((card) => [card.instanceId, card]),
  );
  const leaderPower = observation.opponent.leader.currentPower;
  return actions
    .filter(
      (action): action is Extract<LegalAction, { type: "attach-don" }> =>
        action.type === "attach-don" &&
        legalAttackers.has(action.targetInstanceId) &&
        action.targetInstanceId !== selfLeaderId(observation),
    )
    .filter((action) => {
      const power = board.get(action.targetInstanceId)?.currentPower ?? 0;
      return power < leaderPower || power === 6000 || power === 8000;
    })
    .sort(
      (left, right) =>
        (board.get(right.targetInstanceId)?.currentPower ?? 0) -
        (board.get(left.targetInstanceId)?.currentPower ?? 0),
    )[0];
}

function chooseAttack(
  observation: GameObservation,
  actions: readonly LegalAction[],
): LegalAction | undefined {
  const attacks = viableAttacks(observation, actions);
  const opponentLeader = opponentLeaderId(observation);
  const leaderPressure = attacks
    .filter((action) => action.targetInstanceId === opponentLeader)
    .sort(
      (left, right) =>
        attackerPower(observation, left) - attackerPower(observation, right),
    )[0];
  if (observation.opponent.lifeCount <= 2 && leaderPressure) {
    return leaderPressure;
  }
  // The table below decides less than it looks like it does, which is worth
  // knowing before rewriting it: it names six ST31 and OP-11 card numbers, so
  // against the four decks it does not name every candidate scores zero and
  // the order is whatever the engine offered. Gating on "is this target worth
  // removing at all" does not help either, because this policy no longer
  // chooses from the raw legal
  // actions: `threat-removal` is a format-wide `rank`, and `rank` hides every
  // candidate below the best in its action type, so by the time the ladder gets
  // here the Character attacks it is choosing between have already passed that
  // module's own gates.
  const engineTarget = [...attacks]
    .filter((action) => action.targetInstanceId !== opponentLeader)
    .sort((left, right) => {
      const value = (action: typeof left) => {
        const target = observation.opponent.board.find(
          (card) => card.instanceId === action.targetInstanceId,
        );
        return TARGET_PRIORITY.get(target?.cardNumber ?? "") ?? 0;
      };
      return value(right) - value(left);
    })[0];
  return engineTarget ?? leaderPressure ?? attacks[0];
}

/** The opening hand: Brulee, a ramp body, or Character Katakuri. */
export function createSt34MulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "st34-mulligan",
    keep: (observation) => {
      const hand = new Set(
        observation.self.hand.map((card) => card.cardNumber),
      );
      return (
        hand.has("ST34-003") ||
        hand.has("ST34-002") ||
        hand.has("EB03-035") ||
        hand.has("ST34-001")
      );
    },
    keepBecause: "Keep a functional ST34 ramp or search opener.",
    mulliganBecause: "Mulligan for Brulee, ramp, or Character Katakuri.",
  });
}

export function createSt34RulesPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== ST34_LEADER) return undefined;
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
        protectedCards: PROTECTED_CARDS,
      });
    }
    if (observation.phase !== "main") return undefined;

    // Which play is `ST34_PLAY_RULES`' business. That was `choosePlay`: the
    // ordinal table plus three bonuses, two of them unconditional. Those rules
    // run before any `decide` module, so the first survivor is their answer.
    const play = actions.find((action) => action.type === "play-card");
    if (play) return decision(play, "Develop the best ST34 ramp or threat.");

    // The three cost-guessing activations, Oven first -- and the order is the
    // combo rather than a preference. All three name a cost and reveal the top
    // card of the opponent's deck, and `resolveSt34GuessCost` records that
    // reveal as knowledge *for both players*, so the first guess of a turn buys
    // the answer to every later one.
    //
    // Oven is the one to open with because its ramp is unconditional: the engine
    // adds the rested DON!! outside the `matched` branch, so a wrong guess still
    // pays for the rest. The other two pay only on a match, and their costs are
    // paid up front whatever happens -- Perospero trashes a card from hand
    // before the guess is even offered, and Cognac is a 6-cost Event that is
    // gone either way. Guessing blind with those is buying a one-in-ten shot
    // with a whole card, which is why they wait for the answer.
    //
    // `knowledge.opponentDeckTop` is the observation's own record of it and
    // stays valid until that card leaves the top, so a look taken during the
    // opponent's attack is still good on this turn.
    const knowsDeckTop = observation.self.knowledge.opponentDeckTop !== null;
    const activationPriority = knowsDeckTop
      ? ["OP11-066", "OP11-071", "OP11-081"]
      : ["OP11-066"];
    for (const sourceCardNumber of activationPriority) {
      const activation = actions.find(
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === sourceCardNumber,
      );
      if (activation)
        return decision(
          activation,
          knowsDeckTop
            ? "Cash a cost guess whose answer is already known."
            : "Open with Oven: its ramp is paid whether the guess lands or not, and its reveal answers the next guess.",
        );
    }

    const leaderId = selfLeaderId(observation);
    const leaderAttack = actions.find(
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === leaderId &&
        action.targetInstanceId === opponentLeaderId(observation),
    );

    // Size the Leader's swing before taking it.
    //
    // `chooseAttachment` below is the only one of the six that excludes the
    // Leader, and it runs *after* the Leader has already attacked and rested --
    // so its own filter on `legalAttackers` would drop the Leader anyway. Between
    // the two, Katakuri swung at its printed 5000 every turn of every game, which
    // a single 1000-Counter answers. Two DON!! makes the same attack cost two or
    // three cards instead.
    //
    // The ceiling is the opponent's Leader plus 2000 for the same reason
    // `counter-budget` counts in whole cards: Counter is spent a card at a time,
    // so what matters is crossing the next card's worth of defence, not adding
    // power for its own sake.
    const desiredLeaderPower = observation.opponent.leader.currentPower + 2_000;
    if (
      leaderAttack &&
      observation.self.leader.currentPower < desiredLeaderPower
    ) {
      const leaderAttachment = actions.find(
        (action) =>
          action.type === "attach-don" && action.targetInstanceId === leaderId,
      );
      if (leaderAttachment) {
        return decision(
          leaderAttachment,
          "Put DON!! on Katakuri before swinging, so the attack costs more than one Counter card.",
        );
      }
    }

    if (leaderAttack) {
      return decision(
        leaderAttack,
        "Attack with Katakuri after spending the turn's development DON!!.",
      );
    }

    const attachment = chooseAttachment(observation, actions);
    if (attachment)
      return decision(attachment, "Build an efficient 7000 or 9000 attack.");
    const attack = chooseAttack(observation, actions);
    if (attack) return decision(attack, "Use the best ST34 attack target.");
    return decision(pass(actions), "End the turn with no useful action left.");
  };
}
