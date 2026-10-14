/**
 * One decision as the two kinds of text a System-1 scorer reads: the state,
 * and one line per legal action.
 *
 * Built only from `observe()`, so hidden information is withheld by the engine
 * rather than by this file. Every card is written as a `[[CARD-NUMBER]]`
 * placeholder and never as its printed text: the Python side swaps each
 * placeholder for a learned card vector (or, for a text-glossary variant, for
 * the card's text from the player's local pack). That keeps this file, and
 * anything it writes, free of Bandai's words, and it keeps a state short --
 * a board of ten cards is ten tokens, not ten paragraphs.
 *
 * Labels follow the LLM renderer's scheme (`h1`, `b2`, `ob1`, `leader`,
 * `op-leader`) because an action line has to point back at the card it names,
 * and two copies of one card on a board are otherwise indistinguishable.
 */
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";

type Side = GameObservation["self"] | GameObservation["opponent"];
type BoardCard = GameObservation["self"]["board"][number];
type Leader = GameObservation["self"]["leader"];

export interface RenderedDecision {
  state: string;
  actions: string[];
}

const CARD_NUMBER = /\b(?:[A-Z]{1,4}\d{0,2}-\d{3}|P-\d{3})\b/g;

export function card(cardNumber: string): string {
  return `[[${cardNumber}]]`;
}

function labelMap(observation: GameObservation): Map<string, string> {
  const labels = new Map<string, string>();
  const opponent = observation.viewer === "p1" ? "p2" : "p1";
  labels.set(`${observation.viewer}-leader`, "leader");
  labels.set(`${opponent}-leader`, "op-leader");
  observation.self.hand.forEach((entry, index) =>
    labels.set(entry.instanceId, `h${index + 1}`),
  );
  observation.self.board.forEach((entry, index) =>
    labels.set(entry.instanceId, `b${index + 1}`),
  );
  observation.opponent.board.forEach((entry, index) =>
    labels.set(entry.instanceId, `ob${index + 1}`),
  );
  if (observation.self.stage)
    labels.set(observation.self.stage.instanceId, "stage");
  if (observation.opponent.stage)
    labels.set(observation.opponent.stage.instanceId, "op-stage");
  return labels;
}

/** Engine ids to labels, and card numbers to placeholders, in engine-written text. */
function rewrite(text: string, labels: Map<string, string>): string {
  return text
    .replace(/p[12]-(?:card-\d+|leader)/g, (id) => labels.get(id) ?? "gone")
    .replace(CARD_NUMBER, (number) => card(number));
}

function keywordText(entry: BoardCard | Leader): string {
  return entry.effectiveKeywords.length > 0
    ? ` ${entry.effectiveKeywords.map((keyword) => keyword.toLowerCase()).join(",")}`
    : "";
}

function trashText(trash: Side["trash"]): string {
  if (trash.length === 0) return "none";
  const counts = new Map<string, number>();
  for (const entry of trash)
    counts.set(entry.cardNumber, (counts.get(entry.cardNumber) ?? 0) + 1);
  return [...counts]
    .map(([number, count]) =>
      count > 1 ? `${card(number)}x${count}` : card(number),
    )
    .join(" ");
}

function lifeText(side: Side): string {
  const faceUp = side.life.filter((entry) => entry.faceUp && entry.cardNumber);
  return faceUp.length === 0
    ? `${side.lifeCount}`
    : `${side.lifeCount} up ${faceUp.map((entry) => card(entry.cardNumber!)).join(" ")}`;
}

/**
 * An engine summary with its explanatory parentheticals dropped.
 *
 * Summaries are written for a person or an LLM and carry the arithmetic out in
 * prose ("(+1000; defense becomes 6000 vs 5000 attack: attack is stopped)").
 * The structured fields already carry those numbers, so only the head of the
 * sentence -- which names what the option does -- is kept, for the option
 * kinds whose fields do not say it on their own.
 */
function brief(summary: string, labels: Map<string, string>): string {
  let depth = 0;
  let head = "";
  for (const character of summary) {
    if (character === "(") depth += 1;
    if (depth === 0) head += character;
    if (character === ")" && depth > 0) depth -= 1;
  }
  return rewrite(head.replace(/\[([^\]]+)\]/g, "$1"), labels)
    .replace(/\s+/g, " ")
    .trim();
}

function named(labels: Map<string, string>, instanceId: string | undefined) {
  return instanceId ? (labels.get(instanceId) ?? "gone") : "none";
}

function effectOption(
  action: Extract<LegalAction, { type: "resolve-effect" }>,
  labels: Map<string, string>,
): string {
  const option = action.option;
  switch (option.kind) {
    case "skip":
      return "skip";
    case "confirm":
      return option.choice;
    case "cost":
      return `name cost ${option.cost}`;
    case "position":
      return `put ${option.position}`;
    case "resource":
      return `pay with ${option.resource}`;
    case "don-return-count":
      return `return ${option.count} don`;
    case "don-return":
      return `return don from ${option.pool}${option.card ? ` ${named(labels, option.card.instanceId)}` : ""}`;
    case "card": {
      const label = labels.get(option.card.instanceId);
      const via = option.via ? ` via ${card(option.via.cardNumber)}` : "";
      const amount = option.amount !== undefined ? ` x${option.amount}` : "";
      return `${label ? `${label} ` : ""}${card(option.card.cardNumber)} ${option.owner === "self" ? "my" : "their"} ${option.zone}${via}${amount}`;
    }
    case "order":
      return `order ${option.cards.map((entry) => card(entry.cardNumber)).join(" ")}`;
    default:
      return brief(action.summary, labels);
  }
}

function powerText(entry: BoardCard | Leader): string {
  const parts = [`${entry.currentPower}`];
  if (entry.attachedDon > 0) parts.push(`+${entry.attachedDon}don`);
  const modifiers = [...entry.staticPowerModifiers, ...entry.powerModifiers];
  const total = modifiers.reduce((sum, modifier) => sum + modifier.amount, 0);
  if (total !== 0) parts.push(`${total > 0 ? "+" : ""}${total}`);
  return parts.join(" ");
}

function leaderLine(prefix: string, leader: Leader): string {
  return `${prefix} ${card(leader.cardNumber)} ${powerText(leader)}${leader.rested ? " rested" : ""}${keywordText(leader)}${leader.dormantAbility ? " dormant" : ""}`;
}

function boardEntry(label: string, entry: BoardCard, turn: number): string {
  const flags: string[] = [];
  if (entry.rested) flags.push("rested");
  if (entry.summoningSick) flags.push("sick");
  if (
    entry.cannotAttackUntilTurn !== undefined &&
    entry.cannotAttackUntilTurn >= turn
  )
    flags.push("noattack");
  if (entry.negated) flags.push("negated");
  if (entry.currentCost !== entry.cost) flags.push(`cost ${entry.currentCost}`);
  return `${label} ${card(entry.cardNumber)} ${powerText(entry)}${flags.length > 0 ? ` ${flags.join(" ")}` : ""}${keywordText(entry)}`;
}

function resources(prefix: string, side: Side, handCount: number): string {
  return `${prefix} life ${lifeText(side)} deck ${side.deckCount} hand ${handCount} don ${side.activeDon}/${side.restedDon}/${side.donDeckCount}`;
}

export function renderState(observation: GameObservation): string {
  const labels = labelMap(observation);
  const { self, opponent } = observation;
  const lines: string[] = [
    `turn ${observation.turn} ${observation.turnPlayer === observation.viewer ? "mine" : "theirs"} ${observation.phase}`,
    resources("me", self, self.hand.length),
    leaderLine("leader", self.leader),
  ];
  if (self.hand.length > 0)
    lines.push(
      `hand ${self.hand
        .map(
          (entry, index) =>
            `h${index + 1} ${card(entry.cardNumber)}${entry.currentCost !== entry.cost ? ` cost ${entry.currentCost}` : ""}`,
        )
        .join(" ")}`,
    );
  if (self.board.length > 0)
    lines.push(
      self.board
        .map((entry, i) => boardEntry(`b${i + 1}`, entry, observation.turn))
        .join(" "),
    );
  if (self.stage) lines.push(`stage ${card(self.stage.cardNumber)}`);
  if (self.trash.length > 0) lines.push(`trash ${trashText(self.trash)}`);
  if (self.knowledge.ownDeckTop)
    lines.push(`my deck top ${card(self.knowledge.ownDeckTop.cardNumber)}`);
  if (self.knowledge.opponentDeckTop)
    lines.push(
      `their deck top ${card(self.knowledge.opponentDeckTop.cardNumber)}`,
    );
  lines.push(
    resources("op", opponent, opponent.handCount),
    leaderLine("op-leader", opponent.leader),
  );
  if (opponent.board.length > 0)
    lines.push(
      opponent.board
        .map((entry, i) => boardEntry(`ob${i + 1}`, entry, observation.turn))
        .join(" "),
    );
  if (opponent.stage) lines.push(`op-stage ${card(opponent.stage.cardNumber)}`);
  if (opponent.trash.length > 0)
    lines.push(`op trash ${trashText(opponent.trash)}`);
  const battle = observation.activeBattle;
  if (battle)
    lines.push(
      `battle ${rewrite(battle.attackerInstanceId, labels)} ${battle.attackPower} -> ${rewrite(battle.targetInstanceId, labels)} ${battle.targetPower} countered ${battle.counterPower} short ${battle.counterShortfall} life ${battle.lifeCost}`,
    );
  return lines.join("\n");
}

/** At most this many cards on one history line; the oldest are dropped. */
const HISTORY_CAP = 8;

function cardList(numbers: string[]): string {
  return numbers.slice(-HISTORY_CAP).map(card).join(" ");
}

/** Index just past the `turn-ended` that opened `player`'s latest turn, or 0. */
export function turnStart(
  events: GameObservation["publicEvents"],
  player: string,
): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === "turn-ended" && event.nextPlayerId === player)
      return index + 1;
  }
  return 0;
}

/**
 * What the opponent did that the board no longer shows, from the public event
 * log.
 *
 * A snapshot loses the order and the source of everything that has already
 * left play: which Counters the opponent spent defending against my last turn
 * -- the best evidence of how many they still hold -- what they played on
 * theirs, and which cards a search or an effect revealed into their hand. The
 * board, trash and Life lines carry the rest, so only these three are kept.
 */
export function historyFacts(observation: GameObservation): {
  played: string[];
  used: string[];
  known: string[];
} {
  const events = observation.publicEvents;
  const opponent = observation.viewer === "p1" ? "p2" : "p1";
  const played = events
    .slice(turnStart(events, opponent))
    .filter(
      (event) => event.type === "card-played" && event.playerId === opponent,
    )
    .map((event) => (event as { cardNumber: string }).cardNumber);
  const used = events
    .slice(turnStart(events, observation.viewer))
    .filter(
      (event) =>
        (event.type === "counter-used" || event.type === "event-activated") &&
        event.playerId === opponent,
    )
    .map((event) => (event as { cardNumber: string }).cardNumber);
  // Cards whose identity went public as they entered the opponent's hand,
  // less those seen leaving it. A Counter or an Event names only its number,
  // so it removes one copy of that number.
  const known = new Map<string, string>();
  const removeNumber = (number: string) => {
    for (const [id, held] of known)
      if (held === number) {
        known.delete(id);
        return;
      }
  };
  for (const event of events) {
    if (event.type === "card-moved" && event.playerId === opponent) {
      if (
        event.to === "hand" &&
        event.cardNumber &&
        event.cardInstanceId &&
        !event.identityVisibleTo
      )
        known.set(event.cardInstanceId, event.cardNumber);
      else if (event.from === "hand" && event.cardInstanceId)
        known.delete(event.cardInstanceId);
    } else if (event.type === "card-played" && event.playerId === opponent) {
      known.delete(event.cardInstanceId);
    } else if (
      (event.type === "counter-used" || event.type === "event-activated") &&
      event.playerId === opponent
    ) {
      removeNumber(event.cardNumber);
    }
  }
  return { played, used, known: [...known.values()] };
}

/** `historyFacts` as the state's closing lines (render version 4). */
export function renderHistory(observation: GameObservation): string[] {
  const { played, used, known } = historyFacts(observation);
  const lines: string[] = [];
  if (played.length > 0) lines.push(`op played ${cardList(played)}`);
  if (used.length > 0) lines.push(`op used ${cardList(used)}`);
  if (known.length > 0) lines.push(`op hand known ${cardList(known)}`);
  return lines;
}

function effectAnnotations(
  action: Extract<LegalAction, { type: "resolve-effect" }>,
): string {
  const parts: string[] = [];
  if (action.grants)
    parts.push(`grants ${action.grants.keyword.toLowerCase()}`);
  if (action.donGift) parts.push(`gives ${action.donGift.count}don`);
  if (action.modifiesPower) parts.push(`power ${action.modifiesPower.amount}`);
  if (action.destination)
    parts.push(`to ${action.destination.player} ${action.destination.zone}`);
  if (action.ramps)
    parts.push(`ramps ${action.ramps.active + action.ramps.rested}`);
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

/**
 * One legal action as a short line: what it does, the cards it names by label
 * and placeholder, and the numbers the engine already computed for it --
 * arithmetic a scorer would otherwise have to learn to do in its head.
 */
export function renderAction(
  action: LegalAction,
  observation: GameObservation,
  labels: Map<string, string>,
): string {
  const numberOf = (instanceId: string | undefined): string => {
    if (!instanceId) return "";
    const found = [
      observation.self.leader,
      observation.opponent.leader,
      ...observation.self.hand,
      ...observation.self.board,
      ...observation.opponent.board,
    ].find(
      (entry) =>
        ("instanceId" in entry ? entry.instanceId : undefined) === instanceId,
    );
    return found ? ` ${card(found.cardNumber)}` : "";
  };
  switch (action.type) {
    case "mulligan-decision":
      return action.decision === "keep" ? "keep hand" : "mulligan";
    case "play-card":
      return `play ${named(labels, action.cardInstanceId)}${numberOf(action.cardInstanceId)}`;
    case "attach-don":
      return `don to ${named(labels, action.targetInstanceId)}`;
    case "attack":
      return `attack ${named(labels, action.attackerInstanceId)} ${named(labels, action.targetInstanceId)} ${action.attackPower} ${action.targetPower} short ${action.counterShortfall}`;
    case "block":
      return `block ${named(labels, action.blockerInstanceId)}`;
    case "counter":
      return `counter ${named(labels, action.cardInstanceId)}${numberOf(action.cardInstanceId)} +${action.counterPower}`;
    case "activate-counter-event":
      return `counter event ${named(labels, action.eventInstanceId)} ${card(action.sourceCardNumber)} +${action.counterPower}`;
    case "activate-main": {
      const target = action.targetInstanceId
        ? ` ${named(labels, action.targetInstanceId)}`
        : "";
      const amount = action.amount !== undefined ? ` x${action.amount}` : "";
      const inert = action.selectsNothing ? " selects nothing" : "";
      return `activate ${named(labels, action.sourceInstanceId)} ${card(action.sourceCardNumber)}${target}${amount}${inert}`;
    }
    case "resolve-effect":
      return `effect ${card(action.sourceCardNumber)} ${effectOption(action, labels)}${effectAnnotations(action)}`;
    case "resolve-trigger":
      return `trigger ${card(action.sourceCardNumber)} ${brief(action.summary, labels)}`;
    case "pass":
      switch (observation.phase) {
        case "block":
          return "no block";
        case "counter":
          return "no counter";
        case "trigger":
          return "no trigger";
        default:
          return `end turn don ${action.unspentActiveDon ?? 0} plays ${action.availablePlayCount ?? 0} activations ${action.availableActivationCount ?? 0} attacks ${action.eligibleAttackCount ?? 0}`;
      }
    default:
      // An engine summary can itself carry the separators the rest of the
      // format leaves out.
      return brief((action as LegalAction).summary, labels)
        .replace(/ \| /g, " ")
        .replace(" -> ", " ");
  }
}

/**
 * The render version: what a corpus, a checkpoint and a model pack record, so
 * one written in another version is refused rather than misread. Change it
 * whenever the text this file writes for a decision changes.
 *
 * Version 4 is version 2 plus `renderHistory`. Both are written while a model
 * reading 4 is trained from one reading 2: the teacher and the student read the
 * same decisions, each in its own version, and the shipped pack keeps working.
 */
export const RENDER_VERSION = 4;
export const SUPPORTED_RENDER_VERSIONS: readonly number[] = [2, 4];

export function renderDecision(
  observation: GameObservation,
  version: number = RENDER_VERSION,
): RenderedDecision {
  if (!SUPPORTED_RENDER_VERSIONS.includes(version))
    throw new Error(`render version ${version} is not supported`);
  const labels = labelMap(observation);
  const state = renderState(observation);
  const history = version >= 4 ? renderHistory(observation) : [];
  return {
    state: history.length > 0 ? `${state}\n${history.join("\n")}` : state,
    actions: observation.legalActions.map((action) =>
      renderAction(action, observation, labels),
    ),
  };
}
