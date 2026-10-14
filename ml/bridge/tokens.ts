/**
 * Cards as tokens, actions as pointers: the stage-1 encoding from
 * `docs/ai-roadmap.md`.
 *
 * `encode.ts` describes a position as fixed-width bags over a frozen card
 * vocabulary -- six multi-hot vectors and five sorted board slots per side. That
 * is what the shipped sealed checkpoint reads, and it has two costs the roadmap
 * names: a card outside the vocabulary is invisible, and a new set renumbers
 * every column. This module describes the same position as a *set of card
 * tokens*, one per card instance the viewer can see (or knows is there without
 * seeing), each carrying where it is, whose it is, what state it is in, and an
 * integer row into the append-only card table for the policy to embed. Nothing
 * here is one-hot over card identity, so the encoding is the same width for a
 * 90-card format and the whole registry.
 *
 * Three pieces travel separately, and on purpose:
 *
 *  - **Card facts** (`cardFeatures`) are a pure function of the card number, so
 *    they are shipped once as a table (`cardFeatureTable`) and looked up on the
 *    Python side by row. Sending them per token per step would multiply the
 *    per-step payload by the fact width for no information.
 *  - **Token state** is what changes: zone, owner, rested, attached DON!!,
 *    current power. This is the per-step payload, about two dozen numbers a
 *    token.
 *  - **Global scalars** (`encodeGlobal`) are the counts the observation carries
 *    that belong to no card: turn, phase, DON!! pools, hand and deck counts,
 *    the arithmetic of the battle in progress.
 *
 * Actions point at tokens rather than naming cards. An attack is (attacker
 * token, target token) plus the engine's combat arithmetic; a play is (hand
 * token); a search result, whose card is in no visible zone, carries the row of
 * the card it would fetch. So the policy scores "attack *that* with *this*"
 * from the two tokens' encoded states, which is what a pointer network is for.
 *
 * `encodePrivilegedTokens` is the one function here that reads a `GameState`
 * rather than an observation. It exists for the asymmetric critic of stage 2:
 * during training, and only there, the value network may see the opponent's
 * hand, both Life stacks and the next cards of each deck, because a critic is
 * withdrawn at play and the actor never reads it. The actor's inputs come
 * from `encodeTokens`, which takes the viewer's projection and therefore
 * inherits `observe()`'s hidden-information guarantee -- `test/rl-tokens.test.ts`
 * holds that the public encoding does not move when the hidden zones do.
 */
import type {
  CardFacts,
  CardKeyword,
  GameObservation,
  LegalAction,
  PlayerId,
} from "@one-piece-sim/protocol";
import type { GameState } from "@one-piece-sim/engine-core";
import { cardFacts as registryFacts } from "@one-piece-sim/cards";
import { CARD_TABLE_CARDS } from "./card-index.js";
import { CARD_UNKNOWN, cardRow } from "./card-table.js";
import { ACTION_TYPES } from "./encode.js";

/* ------------------------------------------------------------------ *
 * Vocabularies the widths are built from
 * ------------------------------------------------------------------ */

/**
 * Where a token sits. `deck` is used only by the privileged encoding (the
 * next cards of a deck) and by a public deck-top the viewer was shown.
 */
export const ZONES = [
  "leader",
  "stage",
  "board",
  "hand",
  "life",
  "trash",
  "deck",
] as const;
export type Zone = (typeof ZONES)[number];

const CATEGORIES = ["leader", "character", "event", "stage"] as const;
const COLORS = ["Red", "Green", "Blue", "Purple", "Black", "Yellow"] as const;
const ATTRIBUTES = ["Slash", "Strike", "Ranged", "Special", "Wisdom"] as const;
export const KEYWORDS: readonly CardKeyword[] = [
  "Blocker",
  "Rush",
  "Rush: Character",
  "Banish",
  "Unblockable",
  "Double Attack",
];
/**
 * Every timing marker the registry prints, plus `static` for untimed text, in
 * the order `deriveRules` reports them. Keywords are in `KEYWORDS` already and
 * are not repeated here.
 */
const CLAUSE_MARKERS = [
  "[On Play]",
  "static",
  "[Trigger]",
  "[Activate: Main]",
  "[Main]",
  "[Counter]",
  "[On K.O.]",
  "[When Attacking]",
  "[Opponent's Turn]",
  "[Your Turn]",
  "[On Your Opponent's Attack]",
  "[End of Your Turn]",
  "[On Block]",
] as const;

const PHASES = [
  "mulligan",
  "main",
  "block",
  "counter",
  "trigger",
  "finished",
] as const;

const POWER_SCALE = 10_000;
const COST_SCALE = 10;
const COUNTER_SCALE = 2_000;

/* ------------------------------------------------------------------ *
 * Caps
 * ------------------------------------------------------------------ */

/**
 * How many tokens of each kind a decision may carry. The board is capped by
 * the rules (five Characters); the rest are caps on nonsense rather than on
 * real positions -- a fourteen-card hand or a thirty-card trash happens, and
 * the *most recent* cards are the ones kept, because a trash is read for what
 * just died and a hand for what was just drawn.
 */
export const TOKEN_CAPS = {
  board: 5,
  hand: 12,
  life: 8,
  trash: 10,
} as const;

/** Largest number of public tokens a decision produces; the padding target. */
export const MAX_TOKENS =
  2 /* leaders */ +
  2 /* stages */ +
  2 * TOKEN_CAPS.board +
  2 * TOKEN_CAPS.hand +
  2 * TOKEN_CAPS.life +
  2 * TOKEN_CAPS.trash +
  2; /* known deck tops */

/** Cards of each deck the privileged encoding reveals to the critic. */
export const PRIVILEGED_DECK_DEPTH = 3;

/** Largest number of privileged tokens; the padding target for the critic. */
export const MAX_PRIVILEGED_TOKENS =
  TOKEN_CAPS.hand /* opponent hand */ +
  2 * TOKEN_CAPS.life +
  2 * PRIVILEGED_DECK_DEPTH;

/* ------------------------------------------------------------------ *
 * Card facts: a pure function of the card number
 * ------------------------------------------------------------------ */

function oneHot(
  values: readonly string[],
  value: string | null | undefined,
): number[] {
  return values.map((candidate) => (candidate === value ? 1 : 0));
}

function multiHot(
  values: readonly string[],
  present: readonly string[],
): number[] {
  return values.map((candidate) => (present.includes(candidate) ? 1 : 0));
}

/**
 * The printed identity of a card as numbers, from the derived `rules` block and
 * the printed stats. No printed text is read: every field here is one the
 * audit already derives into the committed card record, which is what lets a
 * card the policy never trained on arrive with a meaningful description.
 */
export function cardFeatures(facts: CardFacts): number[] {
  const rules = facts.rules;
  // A dual attribute ("Slash/Strike") lights both columns.
  const attributes = (facts.attribute ?? "").split("/");
  return [
    ...oneHot(CATEGORIES, facts.category),
    Math.min(facts.cost, 12) / COST_SCALE,
    facts.power / POWER_SCALE,
    facts.counter / COUNTER_SCALE,
    ...multiHot(COLORS, facts.colors),
    ...multiHot(ATTRIBUTES, attributes),
    ...multiHot(KEYWORDS, facts.keywords),
    Math.min(rules.donRequirement, 5) / 5,
    rules.hasTrigger ? 1 : 0,
    rules.hasCounterEvent ? 1 : 0,
    rules.cannotAttack ? 1 : 0,
    rules.mentionsCannotAttack ? 1 : 0,
    rules.survivesEmptyDeck ? 1 : 0,
    rules.buffsAllCharacters ? 1 : 0,
    rules.koClauseMentionsLife ? 1 : 0,
    rules.removalText ? 1 : 0,
    rules.advantageText ? 1 : 0,
    rules.triggerIsDeadWeightDebuff ? 1 : 0,
    rules.addsDonFromDonDeck ? 1 : 0,
    rules.eventConditionDependsOnPool ? 1 : 0,
    Math.min(rules.costBoosts.length, 3) / 3,
    ...multiHot(CLAUSE_MARKERS, rules.clauses),
    Math.min(rules.clauses.length, 6) / 6,
  ];
}

export const CARD_FEATURE_SIZE = cardFeatures(
  registryFacts(CARD_TABLE_CARDS[0]!),
).length;

/**
 * `cardFeatures` for every row of the card table, in row order, with the two
 * reserved rows (pad, unknown) as zeros. Shipped once with the spec.
 */
export function cardFeatureTable(): number[][] {
  const zeros = new Array<number>(CARD_FEATURE_SIZE).fill(0);
  return [
    zeros,
    zeros,
    ...CARD_TABLE_CARDS.map((cardNumber) =>
      cardFeatures(registryFacts(cardNumber)),
    ),
  ];
}

/* ------------------------------------------------------------------ *
 * Tokens
 * ------------------------------------------------------------------ */

/** One card token as it crosses the wire: three integers and the state floats. */
export interface Token {
  zone: Zone;
  owner: "self" | "opponent";
  /** Row in the card table; `CARD_UNKNOWN` when the viewer cannot identify it. */
  card: number;
  state: number[];
}

/** Per-token state features; see `tokenState` for the layout. */
export const TOKEN_STATE_SIZE = 12 + KEYWORDS.length;

/** Integers ahead of the state floats in a wire row. */
export const TOKEN_HEADER_SIZE = 3;
export const TOKEN_WIRE_SIZE = TOKEN_HEADER_SIZE + TOKEN_STATE_SIZE;

interface StateInput {
  rested?: boolean | undefined;
  summoningSick?: boolean | undefined;
  attachedDon?: number | undefined;
  currentPower?: number | undefined;
  currentCost?: number | undefined;
  blocker?: boolean | undefined;
  negated?: boolean | undefined;
  lockedDown?: boolean | undefined;
  faceUp?: boolean | undefined;
  affordable?: boolean | undefined;
  counter?: number | undefined;
  /** Position in its zone, top-first, for Life order and trash recency. */
  depth?: number | undefined;
  effectiveKeywords?: readonly string[] | undefined;
}

function tokenState(input: StateInput): number[] {
  return [
    input.rested ? 1 : 0,
    input.summoningSick ? 1 : 0,
    Math.min(input.attachedDon ?? 0, 10) / 5,
    (input.currentPower ?? 0) / POWER_SCALE,
    Math.min(input.currentCost ?? 0, 20) / COST_SCALE,
    input.blocker ? 1 : 0,
    input.negated ? 1 : 0,
    input.lockedDown ? 1 : 0,
    input.faceUp ? 1 : 0,
    input.affordable ? 1 : 0,
    (input.counter ?? 0) / COUNTER_SCALE,
    Math.min(input.depth ?? 0, 12) / 12,
    ...multiHot(KEYWORDS, input.effectiveKeywords ?? []),
  ];
}

function tail<T>(items: readonly T[], cap: number): readonly T[] {
  return items.length > cap ? items.slice(items.length - cap) : items;
}

/**
 * The viewer's position as tokens, with a map from instance id to token index
 * so actions can point at what they touch.
 *
 * Every field is drawn from the viewer's own projection. Cards the projection
 * withholds -- the opponent's hand, face-down Life on either side -- appear as
 * `CARD_UNKNOWN` tokens in their zone: their existence is public, their
 * identity is not, and the encoding says exactly that much.
 */
export function encodeTokens(observation: GameObservation): {
  tokens: Token[];
  refs: Map<string, number>;
} {
  const tokens: Token[] = [];
  const refs = new Map<string, number>();
  const facts = observation.cardFacts;
  const push = (token: Token, instanceId?: string) => {
    if (instanceId !== undefined) refs.set(instanceId, tokens.length);
    tokens.push(token);
  };

  const sides = [
    {
      owner: "self" as const,
      side: observation.self,
      seat: observation.viewer,
    },
    {
      owner: "opponent" as const,
      side: observation.opponent,
      seat: observation.viewer === "p1" ? "p2" : "p1",
    },
  ];

  for (const { owner, side, seat } of sides) {
    push(
      {
        zone: "leader",
        owner,
        card: cardRow(side.leader.cardNumber),
        state: tokenState({
          rested: side.leader.rested,
          attachedDon: side.leader.attachedDon,
          currentPower: side.leader.currentPower,
          effectiveKeywords: side.leader.effectiveKeywords,
        }),
      },
      // The engine addresses a Leader as `${seat}-leader`; see `encode.ts`.
      `${seat}-leader`,
    );
    if (side.stage) {
      push(
        {
          zone: "stage",
          owner,
          card: cardRow(side.stage.cardNumber),
          state: tokenState({
            rested: side.stage.rested,
            currentCost: side.stage.cost,
          }),
        },
        side.stage.instanceId,
      );
    }
    for (const card of side.board.slice(0, TOKEN_CAPS.board)) {
      push(
        {
          zone: "board",
          owner,
          card: cardRow(card.cardNumber),
          state: tokenState({
            rested: card.rested,
            summoningSick: card.summoningSick,
            attachedDon: card.attachedDon,
            currentPower: card.currentPower,
            currentCost: card.currentCost,
            blocker: card.blocker,
            negated: card.negated,
            lockedDown:
              (card.cannotAttackUntilTurn ?? -1) >= observation.turn ||
              (card.cannotRestUntilTurn ?? -1) >= observation.turn ||
              (card.cannotRefreshUntilTurn ?? -1) >= observation.turn,
            counter: facts[card.cardNumber]?.counter,
            effectiveKeywords: card.effectiveKeywords,
          }),
        },
        card.instanceId,
      );
    }
    side.life.forEach((card, depth) => {
      if (depth >= TOKEN_CAPS.life) return;
      push(
        {
          zone: "life",
          owner,
          card:
            card.faceUp && card.cardNumber
              ? cardRow(card.cardNumber)
              : CARD_UNKNOWN,
          state: tokenState({ faceUp: card.faceUp, depth }),
        },
        card.instanceId,
      );
    });
    // Trash is in discard order; the most recent cards are the ones a policy
    // reads it for, so the tail is kept and depth counts back from the top.
    const trash = tail(side.trash, TOKEN_CAPS.trash);
    trash.forEach((card, index) => {
      push({
        zone: "trash",
        owner,
        card: cardRow(card.cardNumber),
        state: tokenState({ depth: trash.length - 1 - index }),
      });
    });
  }

  const hand = tail(observation.self.hand, TOKEN_CAPS.hand);
  for (const card of hand) {
    push(
      {
        zone: "hand",
        owner: "self",
        card: cardRow(card.cardNumber),
        state: tokenState({
          currentCost: card.currentCost,
          counter: card.counter,
          affordable: card.currentCost <= observation.self.activeDon,
        }),
      },
      card.instanceId,
    );
  }
  const opponentHand = Math.min(
    observation.opponent.handCount,
    TOKEN_CAPS.hand,
  );
  for (let index = 0; index < opponentHand; index += 1) {
    push({
      zone: "hand",
      owner: "opponent",
      card: CARD_UNKNOWN,
      state: tokenState({}),
    });
  }

  const known = observation.self.knowledge;
  if (known.ownDeckTop) {
    push({
      zone: "deck",
      owner: "self",
      card: cardRow(known.ownDeckTop.cardNumber),
      state: tokenState({ faceUp: true }),
    });
  }
  if (known.opponentDeckTop) {
    push({
      zone: "deck",
      owner: "opponent",
      card: cardRow(known.opponentDeckTop.cardNumber),
      state: tokenState({ faceUp: true }),
    });
  }

  return { tokens, refs };
}

/** A token as the integers-then-floats row the bridge writes. */
export function tokenWire(token: Token): number[] {
  return [
    ZONES.indexOf(token.zone),
    token.owner === "self" ? 0 : 1,
    token.card,
    ...token.state,
  ];
}

/**
 * The critic's extra tokens, read from the true state for the viewer.
 *
 * Training-time only. The three zones a viewer cannot see are given with their
 * identities: the opponent's hand, both Life stacks (face-down cards included,
 * the viewer's own among them), and the next `PRIVILEGED_DECK_DEPTH` cards of
 * each deck. Anything already public is not repeated; the critic reads those
 * from the public tokens beside these.
 */
export function encodePrivilegedTokens(
  state: GameState,
  viewer: PlayerId,
): Token[] {
  const opponentSeat: PlayerId = viewer === "p1" ? "p2" : "p1";
  const tokens: Token[] = [];
  const sides = [
    { owner: "self" as const, player: state.players[viewer] },
    { owner: "opponent" as const, player: state.players[opponentSeat] },
  ];

  for (const card of tail(state.players[opponentSeat].hand, TOKEN_CAPS.hand)) {
    const facts = registryFacts(card.cardNumber);
    tokens.push({
      zone: "hand",
      owner: "opponent",
      card: cardRow(card.cardNumber),
      state: tokenState({
        currentCost: facts.cost,
        counter: facts.counter,
      }),
    });
  }
  for (const { owner, player } of sides) {
    player.life.forEach((card, depth) => {
      if (depth >= TOKEN_CAPS.life) return;
      tokens.push({
        zone: "life",
        owner,
        card: cardRow(card.cardNumber),
        state: tokenState({ faceUp: card.faceUp ?? false, depth }),
      });
    });
    player.deck.slice(0, PRIVILEGED_DECK_DEPTH).forEach((card, depth) => {
      tokens.push({
        zone: "deck",
        owner,
        card: cardRow(card.cardNumber),
        state: tokenState({ depth }),
      });
    });
  }
  return tokens;
}

/* ------------------------------------------------------------------ *
 * Global scalars
 * ------------------------------------------------------------------ */

function sideScalars(
  side: GameObservation["self"] | GameObservation["opponent"],
): number[] {
  const handCount = "hand" in side ? side.hand.length : side.handCount;
  return [
    handCount / 10,
    side.deckCount / 50,
    side.lifeCount / 6,
    side.activeDon / 10,
    side.restedDon / 10,
    side.donDeckCount / 10,
    Math.min(side.trash.length, 50) / 50,
    side.board.length / TOKEN_CAPS.board,
    side.stage ? 1 : 0,
    side.leader.currentPower / POWER_SCALE,
  ];
}

/** Counts and arithmetic that belong to no card. */
export function encodeGlobal(observation: GameObservation): number[] {
  const battle = observation.activeBattle;
  return [
    Math.min(observation.turn, 40) / 40,
    ...oneHot(PHASES, observation.phase),
    observation.activePlayer === observation.viewer ? 1 : 0,
    observation.turnPlayer === observation.viewer ? 1 : 0,
    ...sideScalars(observation.self),
    ...sideScalars(observation.opponent),
    battle ? 1 : 0,
    (battle?.attackPower ?? 0) / POWER_SCALE,
    (battle?.targetPower ?? 0) / POWER_SCALE,
    (battle?.counterPower ?? 0) / POWER_SCALE,
    (battle?.counterShortfall ?? 0) / POWER_SCALE,
  ];
}

export const GLOBAL_SIZE = 1 + PHASES.length + 2 + 10 * 2 + 5;

/* ------------------------------------------------------------------ *
 * Actions as pointers
 * ------------------------------------------------------------------ */

const OPTION_KINDS = [
  "card",
  "don-return",
  "confirm",
  "position",
  "resource",
  "cost",
  "mode",
  "skip",
  "order",
  "other",
] as const;

/** One legal action as the policy scores it. */
export interface ActionPointer {
  /** Scalar features: type, the engine's combat arithmetic, option shape. */
  features: number[];
  /** Two token indices, `-1` for none. Order is (subject, object). */
  refs: [number, number];
  /** Card-table row of the card the action names, `CARD_UNKNOWN` for none. */
  card: number;
}

export const ACTION_FEATURE_SIZE =
  ACTION_TYPES.length + 12 + OPTION_KINDS.length;

/**
 * Finds a token by card number when an action names a card rather than an
 * instance -- an `activate-main` or `resolve-effect` source, a Trigger. Own
 * cards first, so a Leader activating its own text points at that Leader.
 */
function refByCardNumber(tokens: Token[], cardNumber: string): number {
  const row = cardRow(cardNumber);
  if (row === CARD_UNKNOWN) return -1;
  const own = tokens.findIndex(
    (token) => token.owner === "self" && token.card === row,
  );
  if (own >= 0) return own;
  return tokens.findIndex((token) => token.card === row);
}

export function encodeActionPointer(
  observation: GameObservation,
  action: LegalAction,
  tokens: Token[],
  refs: Map<string, number>,
): ActionPointer {
  const ref = (instanceId: string | undefined): number =>
    instanceId === undefined ? -1 : (refs.get(instanceId) ?? -1);
  const type = new Array<number>(ACTION_TYPES.length).fill(0);
  type[ACTION_TYPES.indexOf(action.type)] = 1;

  let subject = -1;
  let object = -1;
  let card = CARD_UNKNOWN;
  let attackPower = 0;
  let targetPower = 0;
  let effectiveTargetPower = 0;
  let counterShortfall = 0;
  let unspentActiveDon = 0;
  let attackerIsBlocker = 0;
  let attackerIsLeader = 0;
  let counterPower = 0;
  let flag = 0;
  let amount = 0;
  let optionKind: string | undefined;

  switch (action.type) {
    case "mulligan-decision":
      flag = action.decision === "mulligan" ? 1 : 0;
      break;
    case "pass":
      unspentActiveDon = action.unspentActiveDon ?? 0;
      break;
    case "play-card": {
      subject = ref(action.cardInstanceId);
      const token = tokens[subject];
      if (token) card = token.card;
      break;
    }
    case "counter": {
      subject = ref(action.cardInstanceId);
      const token = tokens[subject];
      if (token) card = token.card;
      counterPower = action.counterPower ?? 0;
      break;
    }
    case "activate-counter-event": {
      subject = ref(action.eventInstanceId);
      const token = tokens[subject];
      if (token) card = token.card;
      counterPower = action.counterPower ?? 0;
      break;
    }
    case "attach-don":
      object = ref(action.targetInstanceId);
      break;
    case "attack":
      subject = ref(action.attackerInstanceId);
      object = ref(action.targetInstanceId);
      attackPower = action.attackPower ?? 0;
      targetPower = action.targetPower ?? 0;
      effectiveTargetPower = action.effectiveTargetPower ?? 0;
      counterShortfall = action.counterShortfall ?? 0;
      unspentActiveDon = action.unspentActiveDon ?? 0;
      attackerIsBlocker = action.attackerIsBlocker ? 1 : 0;
      attackerIsLeader = action.attackerIsLeader ? 1 : 0;
      break;
    case "block":
      subject = ref(action.blockerInstanceId);
      break;
    case "resolve-trigger":
      card = cardRow(action.sourceCardNumber);
      subject = refByCardNumber(tokens, action.sourceCardNumber);
      break;
    case "activate-main":
      card = cardRow(action.sourceCardNumber);
      subject = refByCardNumber(tokens, action.sourceCardNumber);
      object = ref(action.targetInstanceId);
      flag = action.position === "bottom" ? 1 : 0;
      break;
    case "resolve-effect": {
      subject = refByCardNumber(tokens, action.sourceCardNumber);
      const option = action.option;
      optionKind = option.kind;
      switch (option.kind) {
        case "card":
          // A visible card is pointed at; a card in a deck or a hidden zone has
          // no token, so its identity rides on the action instead.
          object = ref(option.card.instanceId);
          card = cardRow(option.card.cardNumber);
          break;
        case "cost":
          amount = Math.min(option.cost, 10) / 10;
          break;
        case "position":
          flag = option.position === "bottom" ? 1 : 0;
          break;
        case "confirm":
          // "done" declines to go on; "apply" and "activate" both proceed.
          flag = option.choice === "done" ? 0 : 1;
          break;
        default:
          break;
      }
      if (card === CARD_UNKNOWN) card = cardRow(action.sourceCardNumber);
      break;
    }
  }

  return {
    features: [
      ...type,
      attackPower / POWER_SCALE,
      targetPower / POWER_SCALE,
      effectiveTargetPower / POWER_SCALE,
      counterShortfall / POWER_SCALE,
      (effectiveTargetPower - attackPower) / POWER_SCALE,
      attackPower > 0 && attackPower >= effectiveTargetPower ? 1 : 0,
      unspentActiveDon / 10,
      attackerIsBlocker,
      attackerIsLeader,
      counterPower / COUNTER_SCALE,
      flag,
      amount,
      ...oneHot(OPTION_KINDS, optionKind),
    ],
    refs: [subject, object],
    card,
  };
}
