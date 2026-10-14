import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  attackerPower,
  bestSearchResult,
  chooseGenericBlock,
  chooseGenericCounter,
  chooseGenericTrigger,
  decision,
  isOptionCardIn,
  isSearchResult,
  nonSkipEffects,
  opponentLeaderId,
  optionCard,
  type PolicyDecision,
  selfLeaderId,
  viableAttacks,
} from "../generic-policy.js";
import { WEIGHT, prefer, type Heuristic } from "../heuristics.js";
import type { RulesPolicy } from "../policy-chain.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

const ST33_LEADER = "OP12-040";
/** OP12-046 Zephyr: the Main ability that rests to bounce a cost-5-or-less card. */
const ZEPHYR = "OP12-046";
/** EB04-028 Ice Time: the 5-cost Main Event that locks two Characters down. */
const ICE_TIME = "EB04-028";
/** ST33-005 Garp, whose [On Play] brings a second blue {Navy} body with it. */
const GARP = "ST33-005";
/** ST33-004 Borsalino: a 6000 [Blocker] at `-3 cost` on any turn a card is trashed. */
const BORSALINO = "ST33-004";
/** The two bottoming [On Play]s, at cost ceilings of 2 and 1. */
const SMOKER = "ST33-003";
const BLUEGRASS = "EB04-026";

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;

/**
 * One ranking for searches, plays and which card to keep, shared by both
 * lists under this Leader. The precon's cards and the Bandai Hiroshima list's
 * interleave: a card the other list does not run is never offered, so its
 * entry changes nothing there.
 *
 * The tournament list's additions sit where their clause puts them: the 8-cost
 * Garp brings a second body like ST33-005 does, Issho and Aramaki are the top
 * end, Sakazuki draws two, and Tashigi's search is free, so it is played ahead
 * of Koby. Mr.3 is not {Navy}, so the searchers never return it, and Hina is
 * a situational Blocker answer.
 */
const CARD_PRIORITY = new Map([
  ["ST33-005", 100],
  ["OP12-043", 90],
  ["OP12-056", 85],
  ["ST33-004", 80],
  ["EB04-022", 75],
  ["OP06-043", 72],
  ["ST33-002", 70],
  ["OP12-044", 68],
  ["OP12-047", 65],
  ["OP06-050", 60],
  ["EB04-026", 55],
  ["ST33-001", 50],
  ["OP12-050", 45],
  ["OP16-056", 40],
  ["OP12-051", 35],
]);

/**
 * The play-ordering claims, one named rule each.
 *
 * This was a twelve-entry array of card numbers, consulted in order, with no
 * reference to the board in any of it. Nothing in it had been measured, and it
 * could not be: a total order has no parts to turn off.
 *
 * ## The deck, in one paragraph
 *
 * OP12-040 Kuzan draws a card whenever a {Navy} card's effect trashes a card
 * from this player's hand. Nine cards in the list print exactly that as an
 * optional cost -- `You may trash 1 card from your hand:` -- so the deck's
 * costs are refunded by its own Leader and its real currency is *cards trashed
 * this turn*. That is also why ST33-004's `-3 cost` matters more than it looks:
 * on any turn the engine has fired at all, the deck's 6-cost 6000 [Blocker] is
 * a 3-cost one.
 *
 * Every rule below follows from that paragraph, and every one of them is the
 * same shape as the three that carried ST-32 (see {@link ST32_PLAY_RULES}):
 * *this card's clause is live this turn*. That is the thing a card-number order
 * cannot say, and it is the shape that carries ST-32.
 *
 * Each rule is named so `pnpm deck:ab ... --disable st33#<rule>` prices it
 * alone. `develop-by-value` carries most of the file, which is the opposite
 * of the same rule's reading on
 * ST-32, where the fourteen-entry table is barely worth its keep. Both are
 * right: with it disabled the gated rules become commitments
 * and everything else falls to the generic highest-cost sort, and *this* deck is
 * the one where cost is a bad proxy. Its two most important plays are a 2-cost
 * Koby and a 3-cost Sengoku, and its 6-cost cards include two vanillas -- so
 * sorting by cost develops the vanillas and leaves the engine in hand. Read
 * what that rule is worth as "how wrong is cost for this deck", not as "how
 * good is the table".
 *
 * `borsalino-discount` is small because the discount is live only on turns an
 * effect has already trashed from hand, which is a minority of turns -- but
 * it is right when it speaks.
 */
export const ST33_PLAY_RULES: readonly Heuristic[] = [
  // The old order, as the total order that keeps every play in the running.
  // Without one a gated `prefer` hides every card it does not name.
  prefer("Develop the highest-priority ST33 Character.")
    .as("develop-by-value")
    .play((card) => (CARD_PRIORITY.get(card.cardNumber) ?? 0) / 100),

  // ST33-005 Garp plays a second blue {Navy} body of 8000 power or less out of
  // hand, so it is two bodies for one play -- and a 6-cost 6000 with no text
  // when the hand has nothing for it to name. The old order had it first
  // unconditionally. Same claim as ST-32's `mihawk-follow-up`.
  prefer("Land Garp while its free play has a body to bring with it.")
    .as("garp-follow-up")
    .by(WEIGHT.deck)
    .play(
      (card, t) =>
        card.cardNumber === GARP &&
        t.hand.some(
          (held) =>
            held.instanceId !== card.instanceId &&
            held.cardNumber !== GARP &&
            held.facts.category === "character" &&
            held.facts.power <= 8_000 &&
            held.facts.colors.includes("Blue") &&
            held.facts.types.some((type) => type.includes("Navy")),
        ),
    ),

  // ST33-004 Borsalino is a 6-cost 6000 [Blocker] that costs 3 during any turn
  // an effect trashed a card from this hand -- which, with this Leader, is any
  // turn the deck did the thing it exists to do. Read off the discount the
  // engine already applied rather than off a "was something trashed" flag,
  // because the discount *is* the question.
  prefer(
    "Take Borsalino at its discount, which is most turns this deck functions.",
  )
    .as("borsalino-discount")
    .by(WEIGHT.deck)
    .play(
      (card) => card.cardNumber === BORSALINO && card.currentCost < card.cost,
    ),

  // ST33-003 Smoker bottoms up to *two* opposing Characters at cost 2 or less,
  // and EB04-026 Bluegrass bottoms one at cost 1 or less. One rule: it is the
  // same claim about the same kind of clause, priced by how many bodies are
  // actually in range so two-for-one outranks one-for-one.
  // There is deliberately no `kuzan-lock-target` preferring OP12-043 -- the
  // 8000 whose [On Play] stops a Character attacking -- whenever the opponent
  // has anything on the board. It is a clear loss.
  //
  // It is the same mistake as ST-32's `rest-target`, and for
  // the same reason: `opponent.board.length > 0` is true on nearly every turn
  // after the third, so a `WEIGHT.deck` preference behind it is not a preference
  // at all. `rank` keeps the per-action-type maximum, so "prefer the big Kuzan
  // when there is a target" became "play the big Kuzan and nothing else" -- and
  // this is a control deck that wants a [Blocker] and a card draw more than it
  // wants one 7-cost body. The lock is real; committing the turn to it is not.
  //
  // The lesson generalises past both decks: a gate that is almost always open
  // does not restrain a rule, it promotes it. Price a gate by how often it is
  // *shut*.
  prefer("Land a bottoming effect while there are cheap bodies in its range.")
    .as("bottoming-target")
    .by(WEIGHT.subArchetype)
    .play((card, t) => {
      const ceiling =
        card.cardNumber === SMOKER ? 2 : card.cardNumber === BLUEGRASS ? 1 : 0;
      if (ceiling === 0) return false;
      const inRange = t.observation.opponent.board.filter(
        (target) => target.currentCost <= ceiling,
      ).length;
      return inRange === 0 ? false : Math.min(inRange, ceiling);
    }),
];

/**
 * Characters worth spending a Counter card to keep on the field.
 *
 * Every one of these either blocks or draws a card each turn it survives, so
 * trading Counter for it is a profit. Two deliberate absences:
 *
 *  - **ST33-002 Sakazuki.** Its `[On K.O.]` plays a Navy Character with a cost
 *    of 4 or less out of hand, so letting it die is card advantage rather than a
 *    loss. Protecting it would spend a Counter card to *prevent* a free play.
 *  - **The vanilla bodies.** Jango and Fullbody are replaceable, and Counter is
 *    the same resource that keeps the Leader alive.
 */
const ST33_PROTECTED_CARDS: ReadonlySet<string> = new Set([
  "ST33-004",
  "OP12-050",
  "ST33-001",
  "OP12-043",
  "EB04-026",
]);

/**
 * The largest shortfall this deck will pay to keep a protected Character.
 *
 * `chooseGenericCounter` prices a protected save at 1000 unless told
 * otherwise -- one ordinary Counter card, the right price for a body that can
 * be played again. This deck's single biggest Counter is Ice Block (OP12-057),
 * +4000 for one card, so any save up to 4000 still costs it one card. A body that blocks or draws every turn it
 * survives is worth that card; a gap past 4000 needs a second one, and the
 * same cards are what keep the Leader alive.
 */
const PROTECTED_SAVE_CEILING = 4_000;

const TARGET_PRIORITY = new Map([
  ["OP11-012", 100],
  ["ST31-001", 90],
  ["ST31-002", 85],
  ["ST31-003", 80],
  ["OP14-015", 75],
  ["OP11-009", 70],
]);

/** Effect kinds that hand ST33 a card instead of asking it to give one up. */
const FREE_PLAY_KINDS = new Set([
  "free-play",
  "free-play-rested",
  "return-own-for-free-play",
]);

/**
 * How much ST33 wants to keep a card in hand, for the effects that ask it to
 * give one up.
 *
 * Counter dominates because Counter is what the deck actually spends to stay
 * alive, and the trash is not a real cost: OP12-040 draws one card back for
 * every card a Navy effect trashes, so the question is only ever *which* card
 * to convert into a fresh one.
 */
function handKeepValue(card: {
  cardNumber: string;
  counter: number;
  cost: number;
}): number {
  return (
    card.counter * 10 + (CARD_PRIORITY.get(card.cardNumber) ?? 0) + card.cost
  );
}

/**
 * Choose among the options of a pending effect.
 *
 * Split by `effectKind` and classified through the typed `option` descriptor,
 * for the same reason `chooseSt32Effect` is: the same shape of option means
 * opposite things in different effects. Sengoku asks which card to *gain* and
 * Koby asks which card to *lose*, and one ranking cannot answer both.
 *
 * The previous version detected "this is a search result" as
 * `optionCardNumber !== undefined`, which held only while the engine set that
 * field on the search branches alone. Once `getEffectOptions` began filling it
 * in for every option naming a card, that one branch answered 96% of ST33's
 * effect decisions -- including every "which card do I trash?", which it then
 * answered with the *highest* priority card in hand. See
 * `analysis/st33-policy-2026-08-08.md`.
 */
function chooseEffect(
  observation: GameObservation,
  effects: EffectAction[],
): PolicyDecision {
  const nonSkip = nonSkipEffects(effects);
  const kind = effects[0]?.effectKind;

  if (kind !== undefined && FREE_PLAY_KINDS.has(kind)) {
    const freePlay = [...nonSkip]
      .map((action) => ({ action, card: optionCard(action)?.card }))
      .filter((entry) => entry.card !== undefined)
      .sort(
        (left, right) =>
          (right.card!.cost ?? 0) - (left.card!.cost ?? 0) ||
          (CARD_PRIORITY.get(right.card!.cardNumber) ?? 0) -
            (CARD_PRIORITY.get(left.card!.cardNumber) ?? 0),
      )[0];
    if (freePlay)
      return decision(
        freePlay.action,
        "Free-play the strongest ST33 Navy target.",
      );
  }

  if (effects.some(isSearchResult)) {
    const search = bestSearchResult(
      effects,
      (cardNumber) => CARD_PRIORITY.get(cardNumber) ?? 0,
    );
    if (search)
      return decision(search, "Take the highest-priority Navy search result.");
  }

  // Anything else naming a card in ST33's own hand is asking it to give that
  // card up -- a trash cost, a Trigger's discard, or an opponent's discard
  // effect. The descriptor answers that, not the effect's name, which is why
  // ST35-003 making ST33 discard lands here rather than needing its own case.
  const discard = [...nonSkip]
    .map((action) => ({ action, card: optionCard(action)?.card }))
    .filter(
      (entry) =>
        entry.card !== undefined &&
        isOptionCardIn(entry.action, "self", "hand"),
    )
    .sort(
      (left, right) =>
        handKeepValue({
          cardNumber: left.card!.cardNumber,
          counter: left.card!.counter ?? 0,
          cost: left.card!.cost ?? 0,
        }) -
        handKeepValue({
          cardNumber: right.card!.cardNumber,
          counter: right.card!.counter ?? 0,
          cost: right.card!.cost ?? 0,
        }),
    )[0];
  if (discard)
    return decision(
      discard.action,
      "Give up the least valuable card, because the Leader draws it back.",
    );

  const target = [...nonSkip]
    .filter((action) => isOptionCardIn(action, "opponent", "board"))
    .map((action) => ({ action, option: optionCard(action)! }))
    .sort(
      (left, right) =>
        (TARGET_PRIORITY.get(right.option.card.cardNumber) ?? 0) -
          (TARGET_PRIORITY.get(left.option.card.cardNumber) ?? 0) ||
        (right.option.card.cost ?? 0) - (left.option.card.cost ?? 0) ||
        (right.option.currentPower ?? right.option.card.power ?? 0) -
          (left.option.currentPower ?? left.option.card.power ?? 0),
    )[0];
  if (target)
    return decision(
      target.action,
      "Target the most important opposing Character.",
    );

  return decision(
    nonSkip[0] ?? effects[0]!,
    "Resolve the highest-value ST33 effect option.",
  );
}

function chooseTempoActivation(
  observation: GameObservation,
  actions: readonly LegalAction[],
): LegalAction | undefined {
  const activations = actions.filter(
    (action) => action.type === "activate-main",
  );
  const opponentIds = new Set(
    observation.opponent.board.map((card) => card.instanceId),
  );
  const selfBoard = new Map(
    observation.self.board.map((card) => [card.instanceId, card]),
  );
  const opponentBoard = new Map(
    observation.opponent.board.map((card) => [card.instanceId, card]),
  );
  // Reads the typed descriptors rather than splitting `optionId`, which the
  // protocol documents as opaque.
  const zephyr = activations
    .filter(
      (action) =>
        action.sourceCardNumber === ZEPHYR &&
        selfBoard.get(action.sourceInstanceId)?.rested === true &&
        action.targetInstanceId !== undefined &&
        opponentIds.has(action.targetInstanceId),
    )
    .sort((left, right) => {
      const leftTarget = opponentBoard.get(left.targetInstanceId ?? "");
      const rightTarget = opponentBoard.get(right.targetInstanceId ?? "");
      return (
        (TARGET_PRIORITY.get(rightTarget?.cardNumber ?? "") ?? 0) -
          (TARGET_PRIORITY.get(leftTarget?.cardNumber ?? "") ?? 0) ||
        (rightTarget?.cost ?? 0) - (leftTarget?.cost ?? 0)
      );
    })[0];
  if (zephyr) return zephyr;

  const usefulIceTimeTargets = observation.opponent.board.filter(
    (card) => card.currentPower <= 10_000,
  );
  return usefulIceTimeTargets.length >= 2
    ? activations.find((action) => action.sourceCardNumber === ICE_TIME)
    : undefined;
}

/**
 * Attach DON!! to something that is about to attack.
 *
 * Deliberately *not* gated on crossing a Counter threshold, which is the
 * obvious-looking rule and a large loss for this deck, in every matchup.
 * `createDonThresholdModule` exists and expresses exactly that rule; it is
 * registered for ST35 only, and ST33 is the third deck for which it loses.
 *
 * The reason it does not transfer is that ST33 is a control deck: attached
 * DON!! stays on the card into the opponent's turn, so an attachment that buys
 * no extra Counter card on offence is still 1000 power of defence. A rule that
 * prices attachments purely by the attack they improve throws that half away.
 */
function chooseAttachment(
  observation: GameObservation,
  actions: readonly LegalAction[],
): LegalAction | undefined {
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
        legalAttackers.has(action.targetInstanceId),
    )
    .filter((action) => {
      const power = board.get(action.targetInstanceId)?.currentPower ?? 0;
      return power < leaderPower || power === 6000 || power === 8000;
    })
    .sort((left, right) => {
      const leftCard = board.get(left.targetInstanceId);
      const rightCard = board.get(right.targetInstanceId);
      return (
        (rightCard?.currentPower ?? 0) - (leftCard?.currentPower ?? 0) ||
        (CARD_PRIORITY.get(rightCard?.cardNumber ?? "") ?? 0) -
          (CARD_PRIORITY.get(leftCard?.cardNumber ?? "") ?? 0)
      );
    })[0];
}

function chooseAttack(
  observation: GameObservation,
  actions: readonly LegalAction[],
): LegalAction | undefined {
  const attacks = viableAttacks(observation, actions);
  const leaderId = opponentLeaderId(observation);
  const opponentLife = observation.opponent.lifeCount;
  const valuableCharacterAttack = attacks
    .filter((action) => action.targetInstanceId !== leaderId)
    .sort((left, right) => {
      const leftTarget = observation.opponent.board.find(
        (card) => card.instanceId === left.targetInstanceId,
      );
      const rightTarget = observation.opponent.board.find(
        (card) => card.instanceId === right.targetInstanceId,
      );
      return (
        (TARGET_PRIORITY.get(rightTarget?.cardNumber ?? "") ?? 0) -
          (TARGET_PRIORITY.get(leftTarget?.cardNumber ?? "") ?? 0) ||
        (rightTarget?.cost ?? 0) - (leftTarget?.cost ?? 0)
      );
    })[0];
  if (opponentLife > 2 && valuableCharacterAttack)
    return valuableCharacterAttack;
  return attacks
    .filter((action) => action.targetInstanceId === leaderId)
    .sort(
      (left, right) =>
        attackerPower(observation, left) - attackerPower(observation, right),
    )[0];
}

/** The opening hand: any of the five cards this deck's early turns need. */
export function createSt33MulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "st33-mulligan",
    keep: (observation) => {
      const hand = new Set(
        observation.self.hand.map((card) => card.cardNumber),
      );
      return (
        hand.has("OP12-047") ||
        hand.has("ST33-001") ||
        hand.has("EB04-026") ||
        hand.has("ST33-003") ||
        hand.has("ST33-002")
      );
    },
    keepBecause: "Keep a functional ST33 opener.",
    mulliganBecause: "Mulligan for an ST33 engine.",
  });
}

export function createSt33RulesPolicy(): RulesPolicy {
  return (observation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== ST33_LEADER) return undefined;
    const actions = observation.legalActions;

    const effects = actions.filter(
      (action): action is EffectAction => action.type === "resolve-effect",
    );
    if (effects.length > 0) return chooseEffect(observation, effects);

    // Defence must not fall through to `chooseGenericRules`, whose protected-
    // card set is empty: this deck would then never spend a Counter card to save
    // a Blocker, and never cast its four copies of Ice Block at all. For this
    // deck Counter is unusually cheap: OP12-057 trashes a card after it
    // resolves and OP12-040 draws that card straight back, so the Event costs
    // one card rather than two.
    const trigger = chooseGenericTrigger(actions);
    if (trigger) return trigger;
    const block = chooseGenericBlock(observation, actions);
    if (block) return block;
    if (observation.phase === "counter") {
      return chooseGenericCounter(observation, actions, {
        protectedCards: ST33_PROTECTED_CARDS,
        characterDefensePower: () => PROTECTED_SAVE_CEILING,
        counterEventBeatsCards: 2,
      });
    }
    if (observation.phase !== "main") return undefined;

    const leaderId = selfLeaderId(observation);

    // The Leader attacks *first*, before the turn is built. This looks like the
    // sequencing mistake `analysis/st32-policy-2026-08-08.md` found, and moving
    // it below development and attachment is a loss, almost all of it against
    // ST34. Katakuri's Leader answers an attack
    // by returning a DON!! to the deck permanently, so a cheap early Leader
    // attack is DON!! denial rather than a wasted 5000. It is kept where it is
    // on that evidence.
    const leaderAttack = actions.find(
      (action) =>
        action.type === "attack" && action.attackerInstanceId === leaderId,
    );
    if (leaderAttack) return decision(leaderAttack, "Attack with Kuzan.");

    const activation = chooseTempoActivation(observation, actions);
    if (activation)
      return decision(
        activation,
        "Use ST33 tempo on a worthwhile opposing target.",
      );

    // Which play is `ST33_PLAY_RULES`' business. This was a bare twelve-entry
    // card-number order with no board condition anywhere in it -- the purest
    // case of what issue #170 is about -- and those rules run before any
    // `decide` module, so the first survivor here is their answer.
    const play = actions.find((action) => action.type === "play-card");
    if (play)
      return decision(play, "Develop the best available ST33 Character.");

    const attachment = chooseAttachment(observation, actions);
    if (attachment)
      return decision(attachment, "Build an efficient ST33 attack threshold.");
    const characterAttack = chooseAttack(observation, actions);
    if (characterAttack)
      return decision(
        characterAttack,
        "Use the best ST33 attack target and size.",
      );
    return undefined;
  };
}
