/**
 * One decision as fixed-width numbers rather than text: the input of the small
 * scorer (`compact-model.ts` here, `ml/sys1/compact.py` in
 * training). Training and play share this file, so the model reads in the app
 * exactly what it was trained on.
 *
 * The text scorer reads ~220 BPE tokens a decision through a 17M encoder, and
 * that cost per decision is what caps how many games training can afford. Here
 * a decision is one global token, one token per visible card, and one token
 * per offered option -- about 40 tokens of a few dozen numbers each -- built
 * from `observe()` alone, so hidden information stays withheld by the engine.
 *
 * Every row of `cards` is [card row, zone, ...CARD_NUMBERS]; every row of
 * `options` is [type, kind, ptr1, ptr2, card row, ...OPTION_NUMBERS], where a
 * pointer is the index of a card token (-1 when none) and the card row names a
 * card the option shows that has no token (a searched card, a Trigger's
 * source). Card rows index `cards.json` sorted by number, as `data.py` does.
 */
import { deckManifests } from "@one-piece-sim/decks";
import {
  PAYOFF_KINDS,
  type ActionCost,
  type GameObservation,
  type LegalAction,
  type PayoffKind,
} from "@one-piece-sim/protocol";
import { historyFacts, turnStart } from "./render.js";

export const COMPACT_VERSION = 4;

export const ZONES = [
  "my-leader",
  "my-hand",
  "my-board",
  "my-stage",
  "op-leader",
  "op-board",
  "op-stage",
  "my-trash",
  "op-trash",
  "my-life-up",
  "op-life-up",
  "my-deck-top",
  "op-deck-top",
  "op-played",
  "op-used",
  "op-hand-known",
  // Version 2. Every token in these zones comes after every version-1 token,
  // so a decision with them dropped is the version-1 decision, pointers and
  // all: a version-1 model reads a version-2 decision unchanged.
  "my-unseen",
  "op-unseen",
  "op-attacker",
  "my-ko",
  "my-removed",
  "op-activated",
  "op-don-target",
  "op-blocker",
  // Version 3: what I have done so far this turn, on my own turn only.
  "my-played",
  "my-activated",
  "my-attacker",
  "my-don-returned",
] as const;

/** The zones a version-1 model was trained on: the first 16. */
export const V1_ZONES = 16;
/** The zones a version-2 model was trained on: the first 24. */
export const V2_ZONES = 24;

const KEYWORDS = [
  "Blocker",
  "Rush",
  "Rush: Character",
  "Banish",
  "Unblockable",
  "Double Attack",
];
const PHASES = ["mulligan", "main", "block", "counter", "trigger"];
export const TYPES = [
  "mulligan-decision",
  "play-card",
  "attach-don",
  "attack",
  "block",
  "counter",
  "activate-counter-event",
  "activate-main",
  "resolve-effect",
  "resolve-trigger",
  "pass",
];
export const KINDS = [
  "none",
  "skip",
  "confirm",
  "cost",
  "position",
  "resource",
  "don-return-count",
  "mode",
  "card",
  "don-return",
  "order",
  "other",
];
const CARD_ZONES = [
  "hand",
  "board",
  "trash",
  "deck",
  "life",
  "stage",
  "leader",
  "don",
];

/** Width of a card row after [row, zone]. */
export const CARD_NUMBERS = 14 + KEYWORDS.length;
/** The option number that is a card row (a searched card's), not a quantity. */
export const OPTION_ROW_COLUMN = 22;
/** Zones a model sums into one token each instead of reading a token a card:
    my-unseen and op-unseen. */
export const POOLED_ZONES: readonly number[] = [16, 17];
/** The option numbers a version-1 to -3 model was trained on: the first 28.
    Version 4 appends what an optional costs, by amount, and what it buys
    (`OPTION_COST_COLUMN`, `OPTION_PAYOFF_COLUMN`), so dropping them is the
    older decision. */
export const V3_OPTION_NUMBERS = 28;
/** Version 4: DON!! returned, hand cards trashed and DON!! rested. */
export const OPTION_COST_COLUMN = V3_OPTION_NUMBERS;
/** Version 4: one column per `PAYOFF_KINDS` entry, 1 where the option buys it. */
export const OPTION_PAYOFF_COLUMN = OPTION_COST_COLUMN + 3;
/** Width of an option row after [type, kind, ptr1, ptr2, row]. */
export const OPTION_NUMBERS = OPTION_PAYOFF_COLUMN + PAYOFF_KINDS.length;
export const GLOBAL_NUMBERS = 30 + PHASES.length;
/** The global numbers a version-1 or -2 model was trained on: the first 31.
    Version 3 appends the rest, so dropping them is the older decision. */
export const V2_GLOBAL_NUMBERS = 26 + PHASES.length;

/**
 * What a seat knows that the observation does not carry: its own deck list,
 * which every player holds in their hand before the game. The opponent's list
 * is never passed -- it is hidden -- and is estimated from the catalog by
 * their Leader instead (`leaderPrior`).
 */
export interface CompactContext {
  ownDeck?: Record<string, number>;
}

const priors = new Map<string, Map<string, number>>();

/**
 * The expected copies of each card in a deck fronted by `leader`: the mean of
 * the catalog's lists with that Leader, or empty when the catalog has none.
 * Public knowledge -- the lists are the catalog's -- so a seat may read it.
 */
export function leaderPrior(leader: string): Map<string, number> {
  let prior = priors.get(leader);
  if (!prior) {
    prior = new Map();
    const lists = Object.values(deckManifests).filter(
      (manifest) => manifest.leader === leader,
    );
    for (const list of lists)
      for (const [number, count] of Object.entries(list.cards))
        prior.set(number, (prior.get(number) ?? 0) + count / lists.length);
    priors.set(leader, prior);
  }
  return prior;
}

export interface CompactDecision {
  global: number[];
  cards: number[][];
  options: number[][];
}

type Side = GameObservation["self"] | GameObservation["opponent"];
type BoardCard = GameObservation["self"]["board"][number];
type Leader = GameObservation["self"]["leader"];

const k = (n: number | undefined) => (n ?? 0) / 1000;

function modifierTotal(entry: BoardCard | Leader): number {
  return [...entry.staticPowerModifiers, ...entry.powerModifiers].reduce(
    (sum, m) => sum + m.amount,
    0,
  );
}

/** [power, don, modifiers, rested, sick, noattack, negated, cost delta, count, dormant, attacker, target, mine, lasting], keywords. */
function inPlay(
  entry: BoardCard | Leader,
  instanceId: string,
  turn: number,
  battle: GameObservation["activeBattle"],
  mine: boolean,
): number[] {
  const board = "summoningSick" in entry ? entry : undefined;
  const lasting = entry.powerModifiers.some((m) => m.expiresAtTurn > turn);
  return [
    k(entry.currentPower),
    entry.attachedDon,
    k(modifierTotal(entry)),
    entry.rested ? 1 : 0,
    board?.summoningSick ? 1 : 0,
    board &&
    board.cannotAttackUntilTurn !== undefined &&
    board.cannotAttackUntilTurn >= turn
      ? 1
      : 0,
    board?.negated ? 1 : 0,
    board ? board.currentCost - board.cost : 0,
    1,
    "dormantAbility" in entry ? 1 : 0,
    battle?.attackerInstanceId === instanceId ? 1 : 0,
    battle?.targetInstanceId === instanceId ? 1 : 0,
    mine ? 1 : 0,
    lasting ? 1 : 0,
    ...KEYWORDS.map((keyword) =>
      entry.effectiveKeywords.includes(keyword as never) ? 1 : 0,
    ),
  ];
}

function plain(count: number, mine: boolean, costDelta = 0): number[] {
  const row = new Array<number>(CARD_NUMBERS).fill(0);
  row[7] = costDelta;
  row[8] = count;
  row[12] = mine ? 1 : 0;
  return row;
}

function resources(side: Side, hand: number): number[] {
  return [
    side.lifeCount,
    side.deckCount / 10,
    hand,
    side.activeDon,
    side.restedDon,
    side.donDeckCount,
    side.trash.length / 10,
  ];
}

/** [base power, once-per-turn reaction spent] of a Leader. */
function leaderSpent(leader: Leader): number[] {
  return [
    k(leader.basePower ?? leader.power),
    leader.leaderReactionSpent ? 1 : 0,
  ];
}

/** A small stable hash for strings with an open vocabulary (an effect's mode). */
function bucket(text: string, size: number): number {
  let hash = 7;
  for (let index = 0; index < text.length; index += 1)
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return hash % size;
}

/**
 * The cards each deck still holds that the viewer cannot see: their own list
 * less every copy in view, and the opponent's expected list less every copy
 * in view. A count, or for the opponent an expected count, of what is left in
 * deck and face-down Life -- what a draw or a Trigger can still be.
 */
function unseen(
  observation: GameObservation,
  context: CompactContext,
  known: string[],
): [string, { zone: (typeof ZONES)[number]; copies: number; mine: boolean }][] {
  const { self, opponent } = observation;
  const out: [
    string,
    { zone: (typeof ZONES)[number]; copies: number; mine: boolean },
  ][] = [];
  const less = (
    list: Map<string, number>,
    seen: (string | null | undefined)[],
    zone: (typeof ZONES)[number],
    mine: boolean,
    floor: number,
  ) => {
    const left = new Map(list);
    for (const number of seen)
      if (number && left.has(number)) left.set(number, left.get(number)! - 1);
    for (const number of [...left.keys()].sort()) {
      const copies = left.get(number)!;
      if (copies >= floor) out.push([number, { zone, copies, mine }]);
    }
  };
  if (context.ownDeck)
    less(
      new Map(Object.entries(context.ownDeck)),
      [
        ...self.hand.map((e) => e.cardNumber),
        ...self.board.map((e) => e.cardNumber),
        self.stage?.cardNumber,
        ...self.trash.map((e) => e.cardNumber),
        ...self.life.filter((e) => e.faceUp).map((e) => e.cardNumber),
      ],
      "my-unseen",
      true,
      1,
    );
  less(
    leaderPrior(opponent.leader.cardNumber),
    [
      ...opponent.board.map((e) => e.cardNumber),
      opponent.stage?.cardNumber,
      ...opponent.trash.map((e) => e.cardNumber),
      ...opponent.life.filter((e) => e.faceUp).map((e) => e.cardNumber),
      ...known,
    ],
    "op-unseen",
    false,
    // An expected count: below a quarter of a copy is noise from averaging
    // lists that differ.
    0.25,
  );
  return out;
}

/**
 * What happened since the opponent's last turn began that the board no
 * longer shows, keyed "zone|card number": who attacked (count, the highest
 * power, attacks on my Leader), which of my Characters were K.O.'d or
 * otherwise removed, which of their abilities fired, where their DON!! went,
 * and which of their Blockers blocked.
 *
 * On my own turn, also what I have done in it: the cards I played, the
 * abilities of mine that fired or were activated, my attackers, and the DON!!
 * I returned, by the card that returned them. The observation states a
 * once-per-turn as spent only for a Leader's reaction; a Character's -- an
 * OP06-076 Kamazo that already answered this turn's DON!! return -- is in
 * `my-activated` or nowhere. An ability that fired with nothing to do still
 * counts, because firing is what spends it.
 */
function lastTurn(
  observation: GameObservation,
): Map<string, { count: number; power: number; atLeader: number }> {
  const viewer = observation.viewer;
  const opponent = viewer === "p1" ? "p2" : "p1";
  const events = observation.publicEvents;
  const numberOf = new Map<string, string>([
    [`${viewer}-leader`, observation.self.leader.cardNumber],
    [`${opponent}-leader`, observation.opponent.leader.cardNumber],
  ]);
  for (const event of events)
    if (
      "cardInstanceId" in event &&
      event.cardInstanceId &&
      "cardNumber" in event &&
      event.cardNumber
    )
      numberOf.set(event.cardInstanceId, event.cardNumber);
  for (const entry of [
    ...observation.self.board,
    ...observation.opponent.board,
  ])
    numberOf.set(entry.instanceId, entry.cardNumber);
  const out = new Map<
    string,
    { count: number; power: number; atLeader: number }
  >();
  const tally = (
    zone: (typeof ZONES)[number],
    number: string | undefined,
    count = 1,
    power = 0,
    atLeader = 0,
  ) => {
    if (!number) return;
    const key = `${zone}|${number}`;
    const entry = out.get(key) ?? { count: 0, power: 0, atLeader: 0 };
    entry.count += count;
    entry.power = Math.max(entry.power, power);
    entry.atLeader += atLeader;
    out.set(key, entry);
  };
  for (const event of events.slice(turnStart(events, opponent))) {
    switch (event.type) {
      case "attack-declared":
        if (event.playerId === opponent)
          tally(
            "op-attacker",
            numberOf.get(event.attackerInstanceId),
            1,
            event.power,
            event.targetInstanceId === `${viewer}-leader` ? 1 : 0,
          );
        break;
      case "character-ko":
        if (event.playerId === viewer) tally("my-ko", event.cardNumber);
        break;
      case "card-moved":
        if (
          event.playerId === viewer &&
          event.from === "board" &&
          event.to !== "trash" &&
          event.cardNumber
        )
          tally("my-removed", event.cardNumber);
        break;
      case "ability-triggered":
        if (event.playerId === opponent && !event.noEffect)
          tally("op-activated", event.sourceCardNumber);
        break;
      case "don-attached":
        if (event.playerId === opponent)
          tally(
            "op-don-target",
            numberOf.get(event.targetInstanceId),
            event.count,
          );
        break;
      case "attack-blocked":
        if (event.playerId === opponent)
          tally("op-blocker", numberOf.get(event.blockerInstanceId));
        break;
      default:
        break;
    }
  }
  if (observation.turnPlayer !== viewer) return out;
  for (const event of events.slice(turnStart(events, viewer))) {
    if (!("playerId" in event) || event.playerId !== viewer) continue;
    switch (event.type) {
      case "card-played":
      case "stage-played":
      case "event-activated":
        tally("my-played", event.cardNumber);
        break;
      case "ability-triggered":
      case "ability-activated":
        tally("my-activated", event.sourceCardNumber);
        break;
      case "attack-declared":
        tally(
          "my-attacker",
          numberOf.get(event.attackerInstanceId),
          1,
          event.power,
          event.targetInstanceId === `${opponent}-leader` ? 1 : 0,
        );
        break;
      case "don-returned":
        tally("my-don-returned", event.sourceCardNumber, event.count);
        break;
      default:
        break;
    }
  }
  return out;
}

export function compactDecision(
  observation: GameObservation,
  offered: LegalAction[],
  rows: Map<string, number>,
  context: CompactContext = {},
): CompactDecision {
  const row = (number: string | undefined | null) =>
    number ? (rows.get(number) ?? -1) : -1;
  const { self, opponent } = observation;
  const battle = observation.activeBattle;
  const cards: number[][] = [];
  const index = new Map<string, number>();
  const add = (
    instanceId: string | undefined,
    number: string,
    zone: (typeof ZONES)[number],
    numbers: number[],
  ) => {
    if (instanceId) index.set(instanceId, cards.length);
    cards.push([row(number), ZONES.indexOf(zone), ...numbers]);
  };
  const turn = observation.turn;
  // Leaders carry no instance id in the observation; the engine names them so.
  const myLeader = `${observation.viewer}-leader`;
  const opLeader = `${observation.viewer === "p1" ? "p2" : "p1"}-leader`;
  add(
    myLeader,
    self.leader.cardNumber,
    "my-leader",
    inPlay(self.leader, myLeader, turn, battle, true),
  );
  for (const entry of self.hand)
    add(
      entry.instanceId,
      entry.cardNumber,
      "my-hand",
      plain(1, true, entry.currentCost - entry.cost),
    );
  for (const entry of self.board)
    add(
      entry.instanceId,
      entry.cardNumber,
      "my-board",
      inPlay(entry, entry.instanceId, turn, battle, true),
    );
  if (self.stage)
    add(
      self.stage.instanceId,
      self.stage.cardNumber,
      "my-stage",
      plain(1, true),
    );
  add(
    opLeader,
    opponent.leader.cardNumber,
    "op-leader",
    inPlay(opponent.leader, opLeader, turn, battle, false),
  );
  for (const entry of opponent.board)
    add(
      entry.instanceId,
      entry.cardNumber,
      "op-board",
      inPlay(entry, entry.instanceId, turn, battle, false),
    );
  if (opponent.stage)
    add(
      opponent.stage.instanceId,
      opponent.stage.cardNumber,
      "op-stage",
      plain(1, false),
    );
  const counted = (
    list: { cardNumber: string }[],
    zone: (typeof ZONES)[number],
    mine: boolean,
  ) => {
    const counts = new Map<string, number>();
    for (const entry of list)
      counts.set(entry.cardNumber, (counts.get(entry.cardNumber) ?? 0) + 1);
    for (const [number, count] of counts)
      add(undefined, number, zone, plain(count, mine));
  };
  counted(self.trash, "my-trash", true);
  counted(opponent.trash, "op-trash", false);
  counted(
    self.life
      .filter((e) => e.faceUp && e.cardNumber)
      .map((e) => ({ cardNumber: e.cardNumber! })),
    "my-life-up",
    true,
  );
  counted(
    opponent.life
      .filter((e) => e.faceUp && e.cardNumber)
      .map((e) => ({ cardNumber: e.cardNumber! })),
    "op-life-up",
    false,
  );
  if (self.knowledge.ownDeckTop)
    add(
      undefined,
      self.knowledge.ownDeckTop.cardNumber,
      "my-deck-top",
      plain(1, true),
    );
  if (self.knowledge.opponentDeckTop)
    add(
      undefined,
      self.knowledge.opponentDeckTop.cardNumber,
      "op-deck-top",
      plain(1, false),
    );
  const history = historyFacts(observation);
  counted(
    history.played.map((cardNumber) => ({ cardNumber })),
    "op-played",
    false,
  );
  counted(
    history.used.map((cardNumber) => ({ cardNumber })),
    "op-used",
    false,
  );
  counted(
    history.known.map((cardNumber) => ({ cardNumber })),
    "op-hand-known",
    false,
  );
  // Version 2 from here on; nothing below may be a pointer target.
  for (const [number, count] of unseen(observation, context, history.known))
    add(undefined, number, count.zone, plain(count.copies, count.mine));
  for (const [key, entry] of lastTurn(observation)) {
    const [zone, number] = key.split("|") as [(typeof ZONES)[number], string];
    const numbers = plain(entry.count, zone.startsWith("my-"));
    numbers[0] = k(entry.power);
    numbers[11] = entry.atLeader;
    add(undefined, number, zone, numbers);
  }

  const global = [
    turn / 10,
    observation.turnPlayer === observation.viewer ? 1 : 0,
    ...PHASES.map((phase) => (observation.phase === phase ? 1 : 0)),
    ...resources(self, self.hand.length),
    ...resources(opponent, opponent.handCount),
    battle ? 1 : 0,
    k(battle?.attackPower),
    k(battle?.targetPower),
    k(battle?.counterPower),
    k(battle?.counterShortfall),
    battle?.lifeCost ?? 0,
    offered.length / 10,
    self.board.length,
    opponent.board.length,
    history.known.length,
    // Version 3. What this turn has already spent, which nothing above
    // carries: a "becomes N" base power in force (ST26-005 sets 7000 until the
    // opponent's next End Phase, so a second payment this turn buys nothing),
    // and whether the Leader's once-per-turn reaction has paid out (OP09-061's
    // DON!! refund makes the turn's first two-DON!! return cheap and every
    // later one full price).
    ...leaderSpent(self.leader),
    ...leaderSpent(opponent.leader),
  ];

  const ptr = (instanceId: string | undefined) =>
    instanceId ? (index.get(instanceId) ?? -1) : -1;
  const options = offered.map((action) => {
    const n = new Array<number>(OPTION_NUMBERS).fill(0);
    // No searched card: -1, so no card's projection rides on every option.
    n[OPTION_ROW_COLUMN] = -1;
    let kind = "none";
    let p1 = -1;
    let p2 = -1;
    let cardRow = -1;
    const shared = (a: {
      ramps?: { active: number; rested: number };
      donGift?: { count: number };
      grants?: { keyword: string };
      cost?: ActionCost;
      payoff?: readonly PayoffKind[];
    }) => {
      if (a.ramps) n[10] = a.ramps.active + a.ramps.rested;
      if (a.donGift) n[11] = a.donGift.count;
      if (a.grants) n[12] = 1 + KEYWORDS.indexOf(a.grants.keyword);
      if (a.cost) {
        n[13] = 1;
        n[OPTION_COST_COLUMN] = a.cost.returnsDon ?? 0;
        n[OPTION_COST_COLUMN + 1] = a.cost.trashesFromHand ?? 0;
        n[OPTION_COST_COLUMN + 2] = a.cost.restsDon ?? 0;
      }
      for (const kind of a.payoff ?? [])
        n[OPTION_PAYOFF_COLUMN + PAYOFF_KINDS.indexOf(kind)] = 1;
    };
    switch (action.type) {
      case "mulligan-decision":
        n[0] = action.decision === "keep" ? 1 : 0;
        break;
      case "play-card":
        p1 = ptr(action.cardInstanceId);
        break;
      case "attach-don":
        p1 = ptr(action.targetInstanceId);
        break;
      case "attack":
        p1 = ptr(action.attackerInstanceId);
        p2 = ptr(action.targetInstanceId);
        n[1] = k(action.attackPower);
        n[2] = k(action.targetPower);
        n[3] = k(action.counterShortfall);
        n[4] = action.donToReach ?? 0;
        n[5] = action.donToWinBattle ?? 0;
        n[6] = action.unspentActiveDon ?? 0;
        n[7] = action.attackerIsBlocker ? 1 : 0;
        n[8] = action.attackerIsLeader ? 1 : 0;
        n[9] = k(action.effectiveTargetPower);
        break;
      case "block":
        p1 = ptr(action.blockerInstanceId);
        break;
      case "counter":
        p1 = ptr(action.cardInstanceId);
        n[1] = k(action.counterPower);
        break;
      case "activate-counter-event":
        p1 = ptr(action.eventInstanceId);
        cardRow = row(action.sourceCardNumber);
        n[1] = k(action.counterPower);
        break;
      case "activate-main":
        p1 = ptr(action.sourceInstanceId);
        p2 = ptr(action.targetInstanceId);
        cardRow = row(action.sourceCardNumber);
        n[1] = action.amount ?? 0;
        n[14] =
          action.position === "top" ? 1 : action.position === "bottom" ? -1 : 0;
        n[15] = action.selectsNothing ? 1 : 0;
        shared(action);
        break;
      case "resolve-trigger":
        p2 = ptr(action.targetInstanceId);
        cardRow = row(action.sourceCardNumber);
        n[15] = action.selectsNothing ? 1 : 0;
        n[16] = action.selfPowerForTheTurn ? 1 : 0;
        shared(action);
        break;
      case "resolve-effect": {
        const option = action.option;
        kind = KINDS.includes(option.kind) ? option.kind : "other";
        cardRow = row(action.sourceCardNumber);
        shared(action);
        if (action.modifiesPower) {
          n[17] = k(action.modifiesPower.amount);
          n[18] = action.modifiesPower.expiresThisTurn ? 1 : 0;
        }
        if (action.destination) {
          n[19] = 1 + CARD_ZONES.indexOf(action.destination.zone);
          n[20] =
            action.destination.player === "self"
              ? 1
              : action.destination.player === "opponent"
                ? -1
                : 0;
        }
        switch (option.kind) {
          case "confirm":
            n[21] = ["apply", "done", "activate"].indexOf(option.choice) + 1;
            break;
          case "cost":
            n[21] = option.cost;
            break;
          case "position":
            n[21] = option.position === "top" ? 1 : -1;
            break;
          case "resource":
            n[21] = option.resource === "leader" ? 1 : -1;
            break;
          case "don-return-count":
            n[21] = option.count;
            break;
          case "mode":
            n[21] = 1 + bucket(option.mode, 32);
            break;
          case "card": {
            const own = ptr(option.card.instanceId);
            if (own >= 0) p1 = own;
            else n[22] = row(option.card.cardNumber);
            n[21] = option.owner === "self" ? 1 : -1;
            n[23] = 1 + CARD_ZONES.indexOf(option.zone);
            n[24] = option.amount ?? 0;
            n[25] = k(option.currentPower);
            n[26] = option.rested ? 1 : 0;
            if (option.via) p2 = ptr(option.via.instanceId);
            break;
          }
          case "don-return":
            n[21] = ["active", "rested", "attached"].indexOf(option.pool) + 1;
            if (option.card) p1 = ptr(option.card.instanceId);
            n[24] = option.available;
            n[25] = option.remaining;
            break;
          case "order":
            n[21] = option.cards.length;
            break;
          default:
            break;
        }
        break;
      }
      case "pass":
        n[1] = action.unspentActiveDon ?? 0;
        n[2] = action.availablePlayCount ?? 0;
        n[3] = action.availableActivationCount ?? 0;
        n[4] = action.eligibleAttackCount ?? 0;
        break;
      default:
        break;
    }
    n[27] = 1;
    return [
      TYPES.indexOf(action.type),
      KINDS.indexOf(kind),
      p1,
      p2,
      cardRow,
      ...n,
    ];
  });
  return { global, cards, options };
}
