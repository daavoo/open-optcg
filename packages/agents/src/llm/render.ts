import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { collectCardInstances, eventText } from "@one-piece-sim/engine-core";
import { attacksCharactersOnly } from "./attackers.js";
import type { FollowUpOffer } from "./follow-ups.js";

/**
 * The decision request as Markdown, and the action labels it offers.
 *
 * ## Why not JSON
 *
 * The payload used to be one `JSON.stringify` of the observation. It was
 * complete and it was legible to nobody: nested objects the model has to walk,
 * engine instance IDs (`p2-card-44`) that carry no meaning, and the same
 * `cardNumber` repeated in three places to say one thing. What is sent now is
 * the position written out -- headings per zone, one line per card, the numbers
 * that matter inline.
 *
 * ## The labels
 *
 * Every instance the model can see is relabelled by where it sits: `hand-1`,
 * `board-2`, `op-board-1`, `leader`, `op-leader`. The engine's IDs are stable
 * across a game and mean nothing on their own; these are stable across one
 * request and say what they are. The relabelling is applied to the board, the
 * events *and* the action list from one map, because a partial rename would be
 * worse than none: the model would have to hold two naming schemes at once.
 *
 * Actions are numbered `action-1`, `action-2`, and `actionIds` maps each back
 * to the engine ID the caller must return. The response schema's pattern moves
 * with them, and stays constant across calls -- a per-decision enum was tried
 * and made the schema prefix change every call, which cost the whole cached
 * prefix. See `ACTION_ID_PATTERN`.
 */
export interface RenderedRequest {
  content: string;
  /** Engine action IDs, indexed so `actionIds[n]` is `action-${n + 1}`. */
  actionIds: readonly string[];
}

/**
 * The seat's own previous action, as the next request shows it back.
 *
 * `reasoning` is the sentence the model wrote with that action, and it is
 * carried because a decision sequence has no other memory: each request is
 * self-contained, and on the opponent's turn no `turnPlan` is shown or kept.
 * Shown as its own words rather than paraphrased -- it is the reasoning that
 * produced the state the request now describes.
 */
export interface PreviousDecision {
  actionId: string;
  summary: string;
  reasoning?: string;
}

/**
 * The qualification a SITUATION figure has to carry to be read correctly.
 *
 * There used to be a branch here for `attacksReachingLeaderNow` and
 * `lifeDamageReachingLeaderNow`, restating the defender's hand beside a figure
 * that priced none of it. Both figures are gone: see the note above `turnBrief`
 * in `agent.ts` for why a derived count of the attacks that reach a Leader was
 * the wrong thing to send at all.
 */
function briefCaveat(
  key: string,
  value: number,
  brief: Record<string, number>,
): string {
  // The turtling figure. A recorded game read `opponentAttackersNextTurn: 5`
  // and answered it with "preserve both Blockers", twice, at 2 Life -- three
  // attacks past what two Blockers can turn away, and it lost to exactly that
  // arithmetic. The count of bodies is not a threat level; it is one half of a
  // subtraction, and the other half is stated here so the subtraction is in
  // front of the reader rather than three sections up.
  if (key === "opponentAttackersNextTurn") {
    const blockers = brief.blockersYouHold ?? 0;
    const unanswered = value - blockers;
    // Only where it says something. With no Blocker on the board there is no
    // subtraction to state -- the caveat would repeat the figure back on every
    // decision of the game, mulligan included, and a qualification that fires
    // everywhere is read nowhere.
    return blockers > 0 && unanswered > 0
      ? ` (your ${blockers} active Blocker${blockers === 1 ? "" : "s"} answer${blockers === 1 ? "s" : ""} at most ${blockers} of them, so ${unanswered} reach your Leader or your rested Characters unless Counter cards, removal or resting them answers those instead)`
      : "";
  }
  return "";
}

/** Where a visible instance sits, which is what its label is made from. */
function instanceLabels(observation: GameObservation): Map<string, string> {
  const labels = new Map<string, string>();
  labels.set(`${observation.viewer}-leader`, "leader");
  labels.set(
    `${observation.viewer === "p1" ? "p2" : "p1"}-leader`,
    "op-leader",
  );
  observation.self.hand.forEach((card, index) => {
    labels.set(card.instanceId, `hand-${index + 1}`);
  });
  observation.self.board.forEach((card, index) => {
    labels.set(card.instanceId, `board-${index + 1}`);
  });
  observation.opponent.board.forEach((card, index) => {
    labels.set(card.instanceId, `op-board-${index + 1}`);
  });
  if (observation.self.stage) {
    labels.set(observation.self.stage.instanceId, "stage");
  }
  if (observation.opponent.stage) {
    labels.set(observation.opponent.stage.instanceId, "op-stage");
  }
  return labels;
}

/**
 * Replace every engine instance ID in a string with its label.
 *
 * An ID with no zone is a card that has left the field -- K.O.'d, countered
 * away, trashed from hand -- and the events still refer to it. It gets a
 * `gone-N` label, assigned on first sight and kept for the rest of the request,
 * so the thread through several events about the same card survives without
 * a raw engine ID appearing next to the labelled ones. A request that mixed the
 * two naming schemes would be worse than one that used neither.
 */
function relabel(text: string, labels: Map<string, string>): string {
  return text.replace(/p[12]-(?:card-\d+|leader)/g, (id) => {
    const known = labels.get(id);
    if (known) return known;
    const label = `gone-${[...labels.values()].filter((value) => value.startsWith("gone-")).length + 1}`;
    labels.set(id, label);
    return label;
  });
}

/**
 * The labels of the cards an action names, appended to the action's summary.
 *
 * `relabel` cannot do this job. It rewrites engine instance IDs where they
 * appear in text, and an action summary is written for a person: it names
 * cards, so a board holding two copies of one card produces two actions that
 * read identically. A recorded game turned on exactly that. Two EB04-007 Zoros,
 * both 9000 power, both active, one able to attack the opposing Leader and one
 * played that turn with [Rush: Character] and so barred from it, offered as
 * `Attack ... with Roronoa Zoro [EB04-007] (Character, 9000 power, active)`
 * either way. The seat spent the wrong one and lost the turn's lethal.
 *
 * The label is what ties the choice back to the board block, where the state
 * that separates the two copies is written, so it goes on every action that
 * names a card the board block lists -- uniformly, rather than only when two
 * summaries collide, because a suffix that appears on some actions and not
 * others reads as a distinction of its own.
 */
function actionCardLabels(
  action: LegalAction,
  labels: Map<string, string>,
): string {
  const parts: string[] = [];
  const named = (role: string, instanceId: string | undefined) => {
    const label = instanceId ? labels.get(instanceId) : undefined;
    if (label) parts.push(`${role} ${label}`);
  };
  switch (action.type) {
    case "attack":
      named("attacker", action.attackerInstanceId);
      named("target", action.targetInstanceId);
      break;
    case "attach-don":
      named("target", action.targetInstanceId);
      break;
    case "play-card":
    case "counter":
      named("card", action.cardInstanceId);
      break;
    case "block":
      named("blocker", action.blockerInstanceId);
      break;
    case "activate-counter-event":
      named("card", action.eventInstanceId);
      break;
    case "activate-main":
      named("source", action.sourceInstanceId);
      named("target", action.targetInstanceId);
      break;
    case "resolve-effect":
      // The same ambiguity one step further in: "Choose Roronoa Zoro" over a
      // board with two of them. `option.card` is the typed view of the option,
      // so the card it names is labelled without parsing the summary.
      if (action.option.kind === "card")
        named("card", action.option.card.instanceId);
      break;
    default:
      break;
  }
  return parts.length > 0 ? ` [${parts.join(", ")}]` : "";
}

function power(card: {
  currentPower?: number;
  attachedDon?: number;
  powerModifiers?: readonly { sourceCardNumber?: string; amount: number }[];
  staticPowerModifiers?: readonly {
    sourceCardNumber?: string;
    amount: number;
  }[];
}): string {
  const parts: string[] = [];
  if (card.attachedDon) parts.push(`${card.attachedDon} DON!! attached`);
  for (const modifier of [
    ...(card.staticPowerModifiers ?? []),
    ...(card.powerModifiers ?? []),
  ]) {
    const sign = modifier.amount >= 0 ? "+" : "";
    parts.push(`${sign}${modifier.amount} from ${modifier.sourceCardNumber}`);
  }
  const detail = parts.length > 0 ? ` (${parts.join("; ")})` : "";
  return `${card.currentPower ?? 0} power${detail}`;
}

function keywords(card: {
  effectiveKeywords?: readonly string[];
  conditionalKeywords?: readonly string[];
}): string {
  const inForce =
    card.effectiveKeywords && card.effectiveKeywords.length > 0
      ? card.effectiveKeywords.join(", ")
      : "none";
  // A keyword the card's own text can switch on reads as absent otherwise, and
  // a caller told only "none" has no reason to go back to the text. ST31-004
  // Monkey.D.Luffy's [Rush] wants 3 given DON!! anywhere on the field, which is
  // a DON!! placement rather than a fact about the card.
  const conditional = (card.conditionalKeywords ?? []).filter(
    (keyword) => !(card.effectiveKeywords ?? []).includes(keyword),
  );
  return conditional.length === 0
    ? inForce
    : `${inForce} (its own text can switch on ${conditional.map((keyword) => `[${keyword}]`).join(", ")} -- see the card)`;
}

/**
 * An ability the card holds and cannot use, and what it is waiting for.
 *
 * The engine withholds a gated `[Activate: Main]` from `legalActions` rather
 * than offering an action that would resolve nothing, which is right and leaves
 * the card looking like it prints no ability at all. A recorded game turned on
 * exactly that: an ST21-001 Leader ended its turn with 7 rested DON!!, the
 * Stage that feeds it and its once-per-turn unspent, and the gift's `[DON!! x1]`
 * gate -- one Stage activation away -- appeared nowhere in the prompt.
 */
function dormantLines(card: {
  dormantAbility?: { clause: string; reason: string };
}): string[] {
  return card.dormantAbility
    ? [
        `  - ${card.dormantAbility.clause} not available right now: ${card.dormantAbility.reason}`,
      ]
    : [];
}

function leaderLines(
  label: string,
  leader: GameObservation["self"]["leader"],
): string[] {
  return [
    `- ${label}: ${leader.cardNumber}`,
    `  - ${power(leader)}`,
    `  - ${leader.rested ? "rested" : "active"}`,
    `  - keywords: ${keywords(leader)}`,
    ...dormantLines(leader),
  ];
}

/**
 * Why an active Character still cannot attack this turn, stated outright.
 *
 * The board printed `played turn 3` under `Turn 3.` and left the rest of the
 * inference to the reader: that a Character cannot attack the turn it is
 * played, that `keywords: none` therefore means no [Rush], and that the body is
 * consequently not a threat. A recorded game shows the inference not being
 * made -- a defender spent Kaido's once-per-turn DON!! -1 shrinking a Sanji
 * played that very turn, calling it "the opponent's only remaining attacker",
 * on a body that was never going to swing. The engine already answers this in
 * one field per card; only the rendering dropped it.
 *
 * `summoningSick` is the ordinary case and `cannotAttackUntilTurn` an effect
 * holding the Character down; both mean the same thing to a caller sizing up a
 * board, so both produce the line, with the reason that applies.
 *
 * The third case is the half-permission: a body played this turn whose only
 * [Rush] is [Rush: Character] can attack, and cannot attack a Leader. That one
 * decided a recorded game -- see `attacksCharactersOnly` -- and the keyword
 * alone does not say it, because the same keyword on the same card is an
 * unrestricted attacker one turn later.
 */
function attackAvailability(
  card: GameObservation["self"]["board"][number],
  turn: number,
): string[] {
  if (card.summoningSick === true) {
    // A conditional [Rush] makes the bar temporary within this same turn, and
    // the flat line read as a fact about the card: ST31-004 Monkey.D.Luffy
    // gains [Rush] once the field holds 3 given DON!!, and a trace has it
    // sitting out the turn it was played while its controller had 7 rested
    // DON!! and two ways to give them.
    const grantable = (card.conditionalKeywords ?? []).filter(
      (keyword) => keyword === "Rush" || keyword === "Rush: Character",
    );
    return [
      `  - cannot attack this turn: played turn ${card.playedTurn} and has no [Rush]` +
        (grantable.length > 0
          ? `, but its own text can switch on ${grantable.map((keyword) => `[${keyword}]`).join(" and ")} this turn -- meet that condition and it attacks`
          : ""),
    ];
  }
  if (attacksCharactersOnly(card, turn)) {
    return [
      `  - can attack Characters ONLY this turn: [Rush: Character] and played turn ${card.playedTurn}, so it cannot attack the opposing Leader until next turn`,
    ];
  }
  if (
    card.cannotAttackUntilTurn !== undefined &&
    card.cannotAttackUntilTurn >= turn
  ) {
    const source = card.cannotAttackSourceCardNumber;
    return [
      `  - cannot attack through turn ${card.cannotAttackUntilTurn}${source ? ` (from ${source})` : ""}`,
    ];
  }
  return [];
}

function boardLines(
  board: GameObservation["self"]["board"],
  prefix: string,
  turn: number,
): string[] {
  if (board.length === 0) return ["- (empty)"];
  return board.flatMap((card, index) => [
    `- ${prefix}${index + 1}: ${card.cardNumber}`,
    `  - ${power(card)}`,
    `  - current cost ${card.currentCost}`,
    `  - ${card.rested ? "rested" : "active"}`,
    `  - keywords: ${keywords(card)}`,
    `  - played turn ${card.playedTurn}`,
    ...attackAvailability(card, turn),
    ...dormantLines(card),
  ]);
}

/**
 * What a seat will have in its cost area to spend on its next turn, and the
 * addends that make it up.
 *
 * The DON!! block states the cost area alone, and the DON!! a seat has *given*
 * is spread across the board block, one card at a time. Adding the two is the
 * whole of the arithmetic, and a recorded game did not: holding five given
 * DON!! and five rested with an empty DON!! deck, it read "five total DON!!
 * available", called its own 10-cost finisher uncastable, and trashed it to a
 * discard cost -- on the turn before its Refresh would have handed it exactly
 * ten. Given DON!! looks spent because it left the cost area, and nothing in
 * the request put the two halves next to each other.
 *
 * This is derived, which is the shape this file is otherwise careful about --
 * see the note above `turnBrief` in `agent.ts` for the counts that were removed
 * for being derived. The difference is what the derivation has to know. Those
 * counts re-decided legality outside the engine and got it wrong; this is
 * addition over four numbers the observation already states, mirroring
 * `drawForTurn` in `engine-core/src/turn.ts` step for step: every given DON!!
 * returns, whether or not the card holding it refreshes, the cost area comes
 * with it less anything held down, and the DON!! Phase adds up to 2 more. The
 * addends are printed beside the total for the same reason -- a figure the
 * model cannot check is one it has to trust, and this one it can.
 */
function donNextTurn(
  side: {
    activeDon: number;
    restedDon: number;
    donDeckCount: number;
    donHeldFromRefresh?: number;
    leader: { attachedDon: number };
    board: readonly { attachedDon: number }[];
  },
  nextTurnNumber: number,
): { total: number; costArea: number; given: number; fromDeck: number } {
  // A hold stays rested through the Refresh rather than being destroyed, so it
  // is subtracted here and not from the cost area reading above.
  const costArea =
    side.activeDon + side.restedDon - (side.donHeldFromRefresh ?? 0);
  const given =
    side.leader.attachedDon +
    side.board.reduce((total, card) => total + card.attachedDon, 0);
  // The second player's first turn draws 1; every other turn draws 2.
  const fromDeck = Math.min(side.donDeckCount, nextTurnNumber === 2 ? 1 : 2);
  return { total: costArea + given + fromDeck, costArea, given, fromDeck };
}

function donNextTurnLine(
  side: Parameters<typeof donNextTurn>[0],
  nextTurnNumber: number,
  possessive: "your" | "their",
): string {
  const { total, costArea, given, fromDeck } = donNextTurn(
    side,
    nextTurnNumber,
  );
  return `- DON!! next turn: ${total} (${costArea} in the cost area, ${given} given and returning at ${possessive} Refresh, ${fromDeck} added from the DON!! deck).`;
}

function trashLine(trash: readonly { cardNumber: string }[]): string {
  if (trash.length === 0) return "(empty)";
  const counts = new Map<string, number>();
  for (const card of trash) {
    counts.set(card.cardNumber, (counts.get(card.cardNumber) ?? 0) + 1);
  }
  return [...counts]
    .map(([cardNumber, count]) =>
      count > 1 ? `${cardNumber} x${count}` : cardNumber,
    )
    .join(", ");
}

/**
 * One public event as the sentence a person is shown.
 *
 * The same `eventText` the app's history modal renders, from this seat, so the
 * model reads "You attacked the opponent's Leader with Loki for 9k" rather than
 * a flattened record of the event's fields. Writing a second phrasing for the
 * model would have been a second thing to keep true as events change, and the
 * app's is the one that gets looked at.
 *
 * `eventText` names cards, so instance IDs rarely survive into the sentence;
 * `relabel` catches the ones that do.
 */
function eventLine(
  event: GameObservation["publicEvents"][number],
  observation: GameObservation,
  labels: Map<string, string>,
  names: ReadonlyMap<string, string>,
): string {
  return `- ${relabel(eventText(event, observation.viewer, names), labels)}`;
}

/**
 * This seat's own plan for the turn it is in, read back to it.
 *
 * A turn is many decisions and each one is a fresh call, so the frame a turn
 * opened with survived nowhere: a recorded game committed to "race for lethal",
 * declared the first attack of that race, and at the very next decision --
 * eight times the reasoning tokens, no new information -- recast the same board
 * as a survival turn, spent the attacker the race needed on a Character, and
 * finished one Leader hit short. What is sent back is the model's own words,
 * verbatim, so that continuing the turn is cheaper than re-deriving it.
 *
 * The steps are the ones still to come, because the model drops a step as it
 * takes it -- and what it has actually taken is in RECENT EVENTS above,
 * phrased by the engine. Restating the finished steps here as well would mean
 * carrying its account of its own progress beside the engine's, which is both
 * redundant and the half worth trusting least at the moment a plan is slipping.
 *
 * An empty `steps` means the plan has not been stated yet, which is a different
 * message rather than an empty list: the first action of a turn is where the
 * whole turn is cheapest to think through, and saying so where the plan would
 * be is what asks for it.
 *
 * The block also says what a plan is *not* evidence about, which cost a game
 * the other way round. A plan is a list of actions to take, and most decisions
 * of a turn are not on it: the optional effects those actions fire, the costs
 * they ask for, the cards chosen inside them. A recorded game declined
 * OP09-062 Nico Robin's `[When Attacking]` ramp -- the deck's whole ramp,
 * named three times in its own dossier -- and gave as its reason "continue the
 * recorded plan", where the plan read in full "attack op-leader with leader"
 * and "end turn" and had never weighed the offer at all. Holding the frame of
 * a turn is what this block is for; supplying an answer to a question the
 * frame never asked is the failure on the other side of it, and only saying so
 * separates them.
 *
 * Rendered in the seat's own Main Phase only. A Block step, a Counter step and
 * a [Trigger] are decisions inside the opponent's turn, with no plan of this
 * seat's to continue; and a mulligan is the starting player's own decision but
 * not a turn to plan.
 */
/**
 * The time limit, once it matters: a game decided on time is won on Life
 * first, so a seat that knows the count is running out plays for the Life lead
 * rather than for a lethal turn that will never come. Nothing before time is
 * called, and nothing in an untimed game.
 */
function timeLimitLines(observation: GameObservation): string[] {
  const limit = observation.timeLimit;
  if (!limit?.called || limit.turnsLeft === null) return [];
  const left =
    limit.turnsLeft === 0
      ? "this is the last turn"
      : `${limit.turnsLeft} more turn${limit.turnsLeft === 1 ? "" : "s"} after this one`;
  return [
    `Time has been called: ${left}. When turn ${limit.finalTurn} ends, the player with more Life cards wins; if tied, more cards left in the deck; then more Characters; then whoever last took a Life card into hand.`,
  ];
}

function planLines(steps: readonly string[]): string[] {
  if (steps.length === 0) {
    return [
      "# YOUR PLAN FOR THIS TURN",
      "",
      "This is your FIRST action of this turn, so there is no plan yet. Think",
      "the whole turn through now and state it in `turnPlan`: the development",
      "and effects, the DON!! budget, every attack the turn can create and the",
      "order to declare them in. Then take the first step of it.",
      "",
    ];
  }
  return [
    "# YOUR PLAN FOR THIS TURN",
    "",
    "You stated this earlier in this turn, and these are the steps you had",
    "left. Read it back before you use it: continue it or revise it -- see",
    "the Planning Loop in your instructions -- and return the steps still",
    "outstanding in `turnPlan`. What you have already done this turn is in",
    "RECENT EVENTS above.",
    "",
    "A plan binds only the steps it names. This decision may not be one of",
    "them -- an effect that fired off a step, a cost a step asked for, a",
    "choice inside a step -- and where the plan is silent it is not an",
    "argument either way. Decide that on the board in front of you, and do",
    "not offer continuing the plan as the reason.",
    "",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    "",
  ];
}

export function renderDecisionRequest(
  observation: GameObservation,
  recentPublicEvents: GameObservation["publicEvents"],
  previousDecision: PreviousDecision | undefined,
  unlistedCardFacts: Record<string, unknown>,
  followUps: readonly FollowUpOffer[],
  brief: Record<string, number>,
  answerShape: { thinkFirst: string; actionIds: string },
  turnPlan: readonly string[] | undefined,
  correction?: string,
): RenderedRequest {
  const labels = instanceLabels(observation);
  // `eventText` names a card by looking its instance up here. Seeded with the
  // Leaders, whose numbers no event carries, and built from the whole log
  // rather than the window: an event inside the window may refer to a card
  // introduced before it.
  const instanceNames = collectCardInstances(
    [...observation.publicEvents],
    [
      [`${observation.viewer}-leader`, observation.self.leader.cardNumber],
      [
        `${observation.viewer === "p1" ? "p2" : "p1"}-leader`,
        observation.opponent.leader.cardNumber,
      ],
    ],
  );
  const { self, opponent } = observation;
  const yourTurn = observation.turnPlayer === observation.viewer;
  const out: string[] = [];

  if (correction) {
    out.push("# CORRECTION", "", relabel(correction, labels), "");
  }
  out.push(
    `Turn ${observation.turn}. It is ${yourTurn ? "YOUR TURN" : "the OPPONENT'S TURN"}.`,
    `Phase: ${observation.phase}.`,
    ...timeLimitLines(observation),
    "",
  );
  if (previousDecision) {
    out.push(
      `Your last action: ${relabel(previousDecision.summary, labels)}`,
      ...(previousDecision.reasoning
        ? [`Why you chose it: ${relabel(previousDecision.reasoning, labels)}`]
        : []),
      "",
    );
  }

  out.push(
    "# YOUR STATE",
    "",
    `- ${self.lifeCount} life ${self.lifeCount === 1 ? "card" : "cards"} left.`,
    `- ${self.deckCount} cards in deck.`,
    `- DON!!: ${self.activeDon} active, ${self.restedDon} rested, ${self.donDeckCount} left in the DON!! deck.`,
    donNextTurnLine(self, observation.turn + (yourTurn ? 2 : 1), "your"),
    "",
    "## YOUR LEADER",
    "",
    ...leaderLines("leader", self.leader),
    "",
    "## YOUR HAND",
    "",
    ...(self.hand.length > 0
      ? self.hand.map(
          (card, index) => `- hand-${index + 1}: ${card.cardNumber}`,
        )
      : ["- (empty)"]),
    "",
    "## YOUR BOARD",
    "",
    ...boardLines(self.board, "board-", observation.turn),
    `- stage: ${self.stage ? self.stage.cardNumber : "none"}`,
    ...(self.stage ? dormantLines(self.stage) : []),
    "",
    "## YOUR TRASH",
    "",
    `- ${trashLine(self.trash)}`,
    "",
    "# OPPONENT'S STATE",
    "",
    `- ${opponent.lifeCount} life ${opponent.lifeCount === 1 ? "card" : "cards"} left.`,
    `- ${opponent.deckCount} cards in deck.`,
    `- ${opponent.handCount} ${opponent.handCount === 1 ? "card" : "cards"} in hand.`,
    `- DON!!: ${opponent.activeDon} active, ${opponent.restedDon} rested, ${opponent.donDeckCount} left in the DON!! deck.`,
    donNextTurnLine(opponent, observation.turn + (yourTurn ? 1 : 2), "their"),
    "",
    "## OPPONENT'S LEADER",
    "",
    ...leaderLines("op-leader", opponent.leader),
    "",
    "## OPPONENT'S BOARD",
    "",
    ...boardLines(opponent.board, "op-board-", observation.turn),
    `- stage: ${opponent.stage ? opponent.stage.cardNumber : "none"}`,
    "",
    "## OPPONENT'S TRASH",
    "",
    `- ${trashLine(opponent.trash)}`,
    "",
  );

  const unlisted = Object.entries(unlistedCardFacts);
  if (unlisted.length > 0) {
    out.push(
      "# CARD TEXT NOT IN MATCH CONTEXT",
      "",
      "Every other card named above is described in the Match Context section",
      "of your instructions.",
      "",
      ...unlisted.map(
        ([cardNumber, facts]) => `- ${cardNumber}: ${JSON.stringify(facts)}`,
      ),
      "",
    );
  }

  // The battle in front of a defender. `counterShortfall` is the number the
  // instructions tell the model to compare its Counters against, so it cannot
  // be left to be re-derived from an action summary.
  const battle = observation.activeBattle;
  if (battle) {
    out.push(
      "# THE ATTACK IN FRONT OF YOU",
      "",
      `- attacker: ${relabel(battle.attackerInstanceId, labels)}, ${battle.attackPower} power`,
      `- target: ${relabel(battle.targetInstanceId, labels)}, ${battle.targetPower} power`,
      `- Counter power committed so far: ${battle.counterPower}`,
      `- counterShortfall: ${battle.counterShortfall} (the Counter power still needed to stop it; 0 means it is already stopped)`,
      `- if it lands it costs ${battle.lifeCost} Life`,
      "",
    );
  }

  out.push(
    "# RECENT EVENTS",
    "",
    "Everything that happened since your own previous turn began.",
    "",
    ...(recentPublicEvents.length > 0
      ? recentPublicEvents.map((event) =>
          eventLine(event, observation, labels, instanceNames),
        )
      : ["- (nothing)"]),
    "",
    "# SITUATION",
    "",
    ...Object.entries(brief).map(
      ([key, value]) => `- ${key}: ${value}${briefCaveat(key, value, brief)}`,
    ),
    "",
  );

  // Last before the actions, because it is what the choice is made against.
  if (turnPlan) {
    out.push(...planLines(turnPlan).map((line) => relabel(line, labels)));
  }

  out.push(
    "# AVAILABLE ACTIONS",
    "",
    "Answer with the action id, e.g. `action-1`.",
    "",
  );

  const actionIds: string[] = [];
  const label = (
    action: LegalAction | { actionId: string; summary?: string },
  ) => {
    actionIds.push(action.actionId);
    return `action-${actionIds.length}`;
  };
  for (const action of observation.legalActions) {
    out.push(
      `- ${label(action)}: ${relabel(action.summary, labels)}${actionCardLabels(action, labels)}`,
    );
  }
  if (followUps.length > 0) {
    out.push(
      "",
      "## ACTIONS THAT CARRY THEIR OWN FOLLOW-UP CHOICES",
      "",
      "Name the action, then one option id per step, in step order.",
      "",
    );
    for (const offer of followUps) {
      const parent = observation.legalActions.find(
        (candidate) => candidate.actionId === offer.actionId,
      );
      out.push(
        `- ${label(offer)}: ${relabel(parent?.summary ?? offer.actionId, labels)}${
          parent ? actionCardLabels(parent, labels) : ""
        }`,
      );
      for (const step of offer.then) {
        out.push(`  - step ${step.step}: ${relabel(step.choose, labels)}`);
        for (const option of step.options) {
          out.push(
            `    - ${label(option)}: ${relabel(option.summary, labels)}`,
          );
        }
      }
    }
  }

  out.push(
    "",
    "# HOW TO ANSWER",
    "",
    `Think through ${answerShape.thinkFirst}.`,
    `Then reply with: ${answerShape.actionIds}`,
  );

  return { content: out.join("\n"), actionIds };
}
