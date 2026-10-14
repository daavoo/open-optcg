/**
 * Lookup and dispatch for the mechanic-program registries.
 *
 * The programs themselves live one module per set under `mechanics/`, merged by
 * `mechanics/index.ts`; `mechanics.ts` is the DSL they are written in. This file
 * is the seam between them and the engine: it answers "does this card have a
 * program for this clause", and it runs the invocations a resolved program
 * produces. Adding a card touches its set module, not this file.
 */
import {
  cards as defaultCardDatabase,
  hasCardType,
  hasCardTypeIncluding,
  printedClauses,
  type CardDatabase,
  type ClauseMarker,
} from "@one-piece-sim/cards";
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import {
  conditionMatches,
  executeMechanicProgram,
  getMechanicChoiceOptions,
  orderReactionOptions,
  type MechanicEffect,
  type MechanicInvocation,
  type MechanicPendingChoice,
  type MechanicProgram,
  type MechanicProgramInvocation,
  type MechanicSignal,
} from "./mechanics.js";
import { donReturnedReactionCards, fieldDonCount } from "./don.js";
import { hasOnPlayHandler, queuePendingContinuations } from "./effects.js";
import type { CardInstance, GameState } from "./model.js";
import {
  STATIC_OPPONENT_DON_READERS,
  STATIC_OWN_DON_CEILING_CARDS,
  effectsNegated,
} from "./static-abilities.js";
import {
  activateMainPrograms,
  counterEventPrograms,
  eventMainPrograms,
  leaderWatcherPrograms,
  onEndOfYourTurnPrograms,
  onKoPrograms,
  onOpponentAttackPrograms,
  onBlockPrograms,
  onPlayPrograms,
  replacementPrograms,
  triggerPrograms,
  whenAttackingPrograms,
  whenRestedPrograms,
} from "./mechanics/index.js";
import { cloneGameData } from "./clone.js";
import { REACTION_RULES } from "./reaction-rules.js";
import type {
  ActivateMainProgram,
  CounterEventProgram,
  EventMainProgram,
  LeaderWatcherProgram,
  OnOpponentAttackProgram,
  WhenAttackingEntry,
  WhenAttackingProgram,
  WhenRestedProgram,
} from "./mechanics/types.js";

// The entry types stay importable from here: `engine.ts`, `effects.ts` and the
// tests referenced them through this module before the split.
export type {
  ActivateMainProgram,
  CounterEventProgram,
  EventMainProgram,
  LeaderWatcherProgram,
  OnOpponentAttackProgram,
  WhenAttackingProgram,
  WhenRestedProgram,
} from "./mechanics/types.js";

export function getCounterEventProgram(
  cardNumber: string,
): CounterEventProgram | undefined {
  return counterEventPrograms.get(cardNumber);
}

export function getOnOpponentAttackProgram(
  cardNumber: string,
): OnOpponentAttackProgram | undefined {
  return onOpponentAttackPrograms.get(cardNumber);
}

export function getLeaderWatcherProgram(
  cardNumber: string,
): LeaderWatcherProgram | undefined {
  return leaderWatcherPrograms.get(cardNumber);
}

function normalizeWhenAttacking(
  entry: WhenAttackingEntry,
): WhenAttackingProgram {
  return "program" in entry ? entry : { oncePerTurn: false, program: entry };
}

export function getActivateMainProgram(
  cardNumber: string,
): ActivateMainProgram | undefined {
  return activateMainPrograms.get(cardNumber);
}

export function getWhenAttackingMechanicProgram(
  cardNumber: string,
): WhenAttackingProgram | undefined {
  const entry = whenAttackingPrograms.get(cardNumber);
  return entry === undefined ? undefined : normalizeWhenAttacking(entry);
}

export function getWhenRestedProgram(
  cardNumber: string,
): WhenRestedProgram | undefined {
  return whenRestedPrograms.get(cardNumber);
}

/**
 * The invocation a Character's "when this Character becomes rested" clause
 * produces, or `null` when it has none or the printed gate does not hold.
 *
 * Shared by the two dispatch sites -- the `card-rested` signal below, and the
 * attack declaration in `actions/attack.ts` -- so the `[Your Turn]` and
 * "[printed text omitted -- pnpm card:text <card>]" gates are read the same way from
 * both. `restedBy` is absent for a rest with no effect behind it, which is what
 * attacking is.
 */
export function whenRestedInvocation(
  state: GameState,
  ownerId: PlayerId,
  card: CardInstance,
  restedBy?: { sourcePlayerId: PlayerId; sourceIsCharacter: boolean },
): MechanicInvocation | null {
  const entry = getWhenRestedProgram(card.cardNumber);
  if (!entry) return null;
  if (effectsNegated(state, card.instanceId)) return null;
  if (entry.yourTurnOnly && state.turnPlayerId !== ownerId) return null;
  if (entry.source !== undefined) {
    if (!restedBy || restedBy.sourcePlayerId === ownerId) return null;
    if (
      entry.source === "opponent-character-effect" &&
      !restedBy.sourceIsCharacter
    ) {
      return null;
    }
  }
  return {
    context: { sourcePlayerId: ownerId, source: card },
    program: entry.program,
  };
}

export function getEventMainProgram(
  cardNumber: string,
): EventMainProgram | undefined {
  return eventMainPrograms.get(cardNumber);
}

/**
 * The `[On Block]` clause of a card that has just blocked, or `null`.
 *
 * The gates live here rather than at the dispatch site for the same reason the
 * other reaction tables' do: an offer whose cost cannot be paid is a prompt with
 * nothing behind it, and a negated Character runs none of its own text.
 */
export function onBlockInvocation(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
): { invocation: MechanicInvocation; oncePerTurnKey: string } | null {
  const entry = onBlockPrograms.get(card.cardNumber);
  if (!entry) return null;
  if (effectsNegated(state, card.instanceId)) return null;
  const player = state.players[playerId];
  const requires = entry.requires;
  if (requires) {
    if (
      (requires.handCards !== undefined &&
        player.hand.length < requires.handCards) ||
      (requires.activeDon !== undefined &&
        player.activeDon.length < requires.activeDon) ||
      (requires.fieldDon !== undefined &&
        fieldDonCount(state, playerId) < requires.fieldDon)
    ) {
      return null;
    }
  }
  const oncePerTurnKey = `${state.turn}:${playerId}:${card.instanceId}:on-block`;
  if (entry.oncePerTurn && state.oncePerTurn.includes(oncePerTurnKey)) {
    return null;
  }
  return {
    invocation: {
      context: { sourcePlayerId: playerId, source: card },
      program: entry.program,
    },
    oncePerTurnKey,
  };
}

export function getOnEndOfYourTurnMechanicProgram(
  cardNumber: string,
): MechanicProgram | undefined {
  return onEndOfYourTurnPrograms.get(cardNumber);
}

/**
 * Every card whose behaviour is expressed as a mechanic program.
 *
 * Exported so coverage tooling can tell the declarative path from the
 * imperative one by asking the registries themselves, rather than by scanning
 * `engine.ts`/`effects.ts` for `cardNumber === "…"` branches. See
 * `test/card-support.test.ts`.
 */
export function mechanicProgramCards(): ReadonlySet<string> {
  return new Set([
    ...onPlayPrograms.keys(),
    ...onKoPrograms.keys(),
    ...onEndOfYourTurnPrograms.keys(),
    ...triggerPrograms.keys(),
    ...whenAttackingPrograms.keys(),
    ...whenRestedPrograms.keys(),
    ...activateMainPrograms.keys(),
    ...eventMainPrograms.keys(),
    ...counterEventPrograms.keys(),
    ...onOpponentAttackPrograms.keys(),
    ...onBlockPrograms.keys(),
    ...leaderWatcherPrograms.keys(),
    // OP17-062 Kaido's "when a DON!! card ... is returned to your DON!! deck"
    // reaction dispatches from inside `returnDonToDeck` in `don.ts` rather
    // than through `executeMechanicProgram` here -- see the comment on
    // `ON_DON_RETURNED_REACTIONS` in that file for why. This still counts it
    // as claimed for the coverage ratchet in `test/card-support.test.ts`.
    ...donReturnedReactionCards(),
    // A card whose only printed clause is a replacement -- OP16-018 Rockstar --
    // is claimed here rather than exempted, which is what the registry in
    // `mechanics/<set>.ts` was added for.
    ...replacementPrograms.keys(),
    // A Leader whose clause has no printed marker and is dispatched off the
    // signal stream instead: OP11-041 Nami and OP16-041 Buggy.
    ...REACTION_RULES.map((rule) => rule.cardNumber),
  ]);
}

/** The conditions that count one player's DON!! against a constant. */
const DON_COUNT_CONDITIONS = new Set(["field-don", "active-don", "rested-don"]);

/** The effects that take DON!! out of the DON!! deck onto the field. */
const DON_DECK_DRAWS = new Set([
  "add-don",
  "add-don-at-end-of-turn",
  "equalize-don-at-end-of-turn",
]);

/** See {@link donCountReaders}. */
export interface DonCountReaders {
  /**
   * Cards that answer their controller's DON!! being returned -- a reaction to
   * the return itself. They fire only from the field.
   */
  reactions: ReadonlySet<string>;
  /**
   * Cards gated on their controller holding *at most* some number of DON!!, or
   * on comparing the two players' counts. Live in hand as well as in play: a
   * card played later in the turn reads the lower count.
   */
  ceilings: ReadonlySet<string>;
  /**
   * Cards that add DON!! from their controller's DON!! deck without returning
   * DON!! first, with the most one resolution adds (`Infinity` where the
   * program does not fix it). A return refills the DON!! deck, so these gain
   * only where the deck holds fewer than they would take.
   */
  ramps: ReadonlyMap<string, number>;
  /** Cards that read the other player's DON!! count. */
  opponent: ReadonlySet<string>;
}

/**
 * Every card whose declarative text can tell that a player returned DON!! to
 * their DON!! deck, sorted by whose DON!! it watches and by where it watches
 * from.
 *
 * For a caller that wants to argue a `DON!! −N` buys nothing beyond its own
 * effect: that holds only while no reaction is in play, no ceiling is in play
 * or in the payer's hand, no ramp there would find the DON!! deck short, and no
 * card of `opponent` is in play. `opponent` is every read of the other
 * player's count, either way round: a "5 or more" gate the payer drops under
 * is as live as a ceiling it drops into.
 *
 * A ramp paid for by its own `DON!! −N` is not one: its cost returns DON!!
 * before it draws, so it never meets a deck the payer's earlier return would
 * have refilled, and nor is a reaction to the return. A [Trigger] counts toward `opponent` only, because the payer's
 * own Trigger fires from Life, which is not where the caller looks. Continuous
 * abilities are closures rather than data and cannot be walked, so those come
 * from the lists `static-abilities.ts` keeps beside them.
 */
export function donCountReaders(): DonCountReaders {
  const reactions = new Set<string>(donReturnedReactionCards());
  const ceilings = new Set<string>(STATIC_OWN_DON_CEILING_CARDS);
  const ramps = new Map<string, number>();
  const opponent = new Set<string>(STATIC_OPPONENT_DON_READERS);
  const classify = (
    cardNumber: string,
    node: unknown,
    own: boolean,
    paid: boolean,
  ): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) classify(cardNumber, item, own, paid);
      return;
    }
    const record = node as Record<string, unknown>;
    const kind = record.kind;
    if (kind === "field-don-versus") {
      // Compares the two players, so a return on either side can turn it.
      if (own) ceilings.add(cardNumber);
      opponent.add(cardNumber);
    } else if (typeof kind === "string" && DON_COUNT_CONDITIONS.has(kind)) {
      if (record.player === "opponent") opponent.add(cardNumber);
      else if (own && (record.operator === "lte" || record.operator === "lt")) {
        ceilings.add(cardNumber);
      }
    } else if (
      own &&
      !paid &&
      typeof kind === "string" &&
      DON_DECK_DRAWS.has(kind) &&
      record.player !== "opponent"
    ) {
      const count =
        typeof record.count === "number"
          ? record.count
          : Number.POSITIVE_INFINITY;
      ramps.set(cardNumber, Math.max(ramps.get(cardNumber) ?? 0, count));
    } else if (kind === "don-returned") {
      if (record.returnedBy === "opponent") opponent.add(cardNumber);
      else if (own) reactions.add(cardNumber);
    }
    if (kind === "sequence" && Array.isArray(record.effects)) {
      // `donMinus`: a return earlier in the sequence pays for what follows.
      let returned = paid;
      for (const effect of record.effects as unknown[]) {
        classify(cardNumber, effect, own, returned);
        const step = effect as Record<string, unknown> | null;
        if (step?.kind === "return-don" && step.player !== "opponent") {
          returned = true;
        }
      }
      return;
    }
    // `donMinusOrMore`: the return is the node, and its effect is paid for.
    const paysFor =
      kind === "return-don-choice" && record.player !== "opponent";
    for (const value of Object.values(record)) {
      classify(cardNumber, value, own, paid || paysFor);
    }
  };
  for (const rule of REACTION_RULES) {
    // A ramp that answers the payer's own return draws from the deck that
    // return just refilled.
    classify(rule.cardNumber, rule, true, rule.signal.kind === "don-returned");
  }
  for (const [cardNumber, entry] of triggerPrograms) {
    classify(cardNumber, entry, false, false);
  }
  for (const registry of [
    onPlayPrograms,
    onKoPrograms,
    onEndOfYourTurnPrograms,
    whenAttackingPrograms,
    whenRestedPrograms,
    activateMainPrograms,
    eventMainPrograms,
    counterEventPrograms,
    onOpponentAttackPrograms,
    onBlockPrograms,
    leaderWatcherPrograms,
    replacementPrograms,
  ] as ReadonlyMap<string, unknown>[]) {
    for (const [cardNumber, entry] of registry) {
      classify(cardNumber, entry, true, false);
    }
  }
  return { reactions, ceilings, ramps, opponent };
}

/**
 * The declarative registries keyed by the printed marker each one dispatches.
 *
 * `mechanicProgramCards` answers "is this card implemented at all", which is one
 * question too coarse: a card can be claimed by one registry and have a second
 * printed clause that nothing runs. OP14-111 Perona had its [On Play] and
 * [On K.O.] implemented and its [Trigger] silently ignored for exactly as long
 * as the coverage check asked the coarser question. See
 * `test/card-support.test.ts`.
 */
export function mechanicProgramsByClause(): ReadonlyMap<
  string,
  ReadonlySet<string>
> {
  return new Map<string, ReadonlySet<string>>([
    ["[On Play]", new Set(onPlayPrograms.keys())],
    ["[On Block]", new Set(onBlockPrograms.keys())],
    ["[On K.O.]", new Set(onKoPrograms.keys())],
    ["[End of Your Turn]", new Set(onEndOfYourTurnPrograms.keys())],
    ["[Activate: Main]", new Set(activateMainPrograms.keys())],
    ["[When Attacking]", new Set(whenAttackingPrograms.keys())],
    ["[Main]", new Set(eventMainPrograms.keys())],
    ["[Counter]", new Set(counterEventPrograms.keys())],
    ["[Trigger]", new Set(triggerPrograms.keys())],
    // Both spellings, dispatched by the one table: OP17-064 King prints the
    // short form and every other card in the pool prints the long one, and the
    // ratchet in `test/card-support.test.ts` matches the marker literally.
    ["[On Your Opponent's Attack]", new Set(onOpponentAttackPrograms.keys())],
    ["[On Opponent's Attack]", new Set(onOpponentAttackPrograms.keys())],
  ]);
}

export function getOnPlayMechanicProgram(
  cardNumber: string,
): MechanicProgram | undefined {
  return onPlayPrograms.get(cardNumber);
}

export function getOnKoMechanicProgram(
  cardNumber: string,
  /**
   * How the Character left the board. An entry that names "K.O.'d by your
   * opponent's effect" (OP09-052 Marco) is not dispatched by a lost fight; a
   * bare entry answers both, which is what every other `[On K.O.]` prints.
   */
  cause: "battle" | "effect" = "effect",
): MechanicProgram | undefined {
  const entry = onKoPrograms.get(cardNumber);
  if (!entry) return undefined;
  if (!("opponentEffectOnly" in entry)) return entry;
  return entry.opponentEffectOnly && cause === "battle"
    ? undefined
    : entry.program;
}

/**
 * Every effect node of one kind a program can reach, for a caller that has to
 * ask what a clause *does* without holding the printed text.
 *
 * A structural walk rather than a typed visitor over {@link MechanicEffect},
 * because a visitor would have to be extended with every new effect variant to
 * keep answering -- silently returning the wrong answer in the meantime. A walk
 * that reads `kind` off whatever it finds cannot fall behind the union.
 *
 * Conditions and selectors carry a `kind` of their own, so this is sound only
 * for a kind that names an *effect*; the return type says which ones those are.
 */
export function mechanicProgramEffects<K extends MechanicEffect["kind"]>(
  program: MechanicProgram,
  kind: K,
): readonly Extract<MechanicEffect, { kind: K }>[] {
  const found: Extract<MechanicEffect, { kind: K }>[] = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.kind === kind) {
      found.push(node as Extract<MechanicEffect, { kind: K }>);
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(program);
  return found;
}

export function getTriggerMechanicProgram(
  cardNumber: string,
): MechanicProgram | undefined {
  return triggerPrograms.get(cardNumber);
}

/**
 * Whether a Trigger's program would actually do anything right now.
 *
 * The offer gate used to ask only whether a program *existed*, so a Trigger
 * whose own condition was false -- OP14-108 Rayleigh's, above three opposing
 * Life -- was still presented, resolved for nothing, and cost the player a
 * decision. This dry-runs the program against a clone and reports whether it
 * produced anything: an event, a signal, or a choice that can resolve. A
 * choice offering only "skip" still matters for a Trigger because activating
 * it sends the revealed Life card to trash instead of hand.
 */
export function triggerProgramCanAct(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  const program = getTriggerMechanicProgram(card.cardNumber);
  if (!program) return false;
  if (program.effect.kind === "choose" && program.effect.min === 0) return true;
  const probe = cloneGameData(state);
  const before = JSON.stringify(probe);
  const context = { sourcePlayerId: playerId, source: card };
  let result;
  try {
    result = executeMechanicProgram(probe, context, program, db);
  } catch {
    // A program that cannot even run is certainly not worth offering.
    return false;
  }
  if (result.events.length > 0 || result.signals.length > 0) return true;
  if (result.pending) {
    return getMechanicChoiceOptions(probe, result.pending, db).some(
      (option) => option !== "done",
    );
  }
  // Emitting nothing is not the same as doing nothing. A Trigger whose whole
  // payload only writes state -- `modify-cost`, `discount-next-play`,
  // `hold-don-from-refresh` -- produces none of the three things checked above
  // and looks inert here. The dry run already holds the answer: ask whether
  // the probe moved.
  //
  // Two nodes have since been made to speak for themselves instead, because a
  // trace and a match history wanted the step anyway: `add-don` emits
  // `don-added` (OP10-079 and OP10-080, whose whole Trigger is "add 1 DON!!
  // card"), and `modify-power` emits `power-changed` (OP16-019 and OP17-019,
  // which raise their own Leader by 1000, and EB04-051 Emet, which gives the
  // opponent's whole board -3000). Those were reached by this comparison
  // before they emitted, so neither fix changed what is offered -- which is
  // the point of keeping it: it costs one clone and it catches the next silent
  // node without anyone having to notice. See `test/op10.test.ts` for that
  // pair, `test/op17-newgate.test.ts` for the Leader buffs and
  // `test/eb04.test.ts` for Emet.
  return JSON.stringify(probe) !== before;
}

/**
 * Whether a player's Leader has already spent its `[Once Per Turn]` reaction
 * this turn.
 *
 * `false` when the Leader prints no such clause, so a caller can read it as
 * "the refund is still there" without first asking whether there is one.
 *
 * Exists for the observation. A reaction is dispatched off the signal stream
 * rather than offered as an action, so unlike an `[Activate: Main]` there is no
 * legal action that disappears once it has fired -- which left a seat holding
 * OP09-061 unable to tell the turn's cheap DON!! return from its expensive one,
 * the single decision Bandai's guide for that Leader is written about. The
 * booking is public information either way: the refund adds DON!! through
 * ordinary public events, so both players have already seen it happen.
 */
export function leaderReactionSpent(
  state: GameState,
  playerId: PlayerId,
): boolean {
  const cardNumber = state.players[playerId].leaderCardNumber;
  const printsOne = REACTION_RULES.some(
    (rule) =>
      rule.cardNumber === cardNumber &&
      rule.controller === "leader" &&
      rule.oncePerTurn,
  );
  if (!printsOne) return false;
  return state.oncePerTurn.includes(
    `${String(state.turn)}:${playerId}:${cardNumber}:reaction`,
  );
}

export function applyMechanicReactions(
  state: GameState,
  signals: readonly MechanicSignal[],
  db: CardDatabase = defaultCardDatabase,
): MechanicDispatchResult {
  // The whole dispatch result, not just its events and pending: a reaction that
  // stops to ask something has to be *installed*, and that needs the invocation
  // and the queue behind it. Every reader before OP08-105 Jewelry Bonney was a
  // clause that asks nothing -- OP11-041 Nami's Leader draws and stops -- so
  // dropping the rest was invisible until a reaction drew two cards and put one
  // back.
  return dispatchMechanicInvocations(
    state,
    getMechanicSignalInvocations(state, signals, false),
    db,
  );
}

export function getMechanicSignalInvocations(
  state: GameState,
  signals: readonly MechanicSignal[],
  includeOnKo = true,
  db: CardDatabase = defaultCardDatabase,
  /**
   * Whether a `card-played` signal should dispatch the played card's own
   * `[On Play]`.
   *
   * Off for the hand-play path, which raises the signal purely so the *watchers*
   * (OP12-081, OP14-041) can see it: that path already dispatches the played
   * card's own clause through `createOnPlayEffect`, and running it from here as
   * well would resolve it twice. The same reason `includeOnKo` exists.
   */
  includeOnPlay = true,
): MechanicInvocation[] {
  const invocations: MechanicInvocation[] = [];
  for (const signal of signals) {
    // A negated Character runs none of its own clauses. The check is by instance
    // and survives the trip to the trash, which is what makes it work for
    // `[On K.O.]`: by the time the program would be looked up, the board entry
    // that could have carried a flag is gone.
    // Not every signal names a card: `don-returned` is about the cost area.
    if ("card" in signal && effectsNegated(state, signal.card.instanceId)) {
      continue;
    }
    if (signal.kind === "card-played") {
      const program = includeOnPlay
        ? getOnPlayMechanicProgram(signal.card.cardNumber)
        : undefined;
      if (program) {
        invocations.push({
          context: { sourcePlayerId: signal.playerId, source: signal.card },
          program,
        });
      } else if (includeOnPlay && hasOnPlayHandler(signal.card.cardNumber)) {
        // The other half of the same question. A card's `[On Play]` is either a
        // program or an imperative handler, and which one it is says nothing
        // about whether it should fire -- so the signal names the card and the
        // dispatcher resolves it, rather than the lookup here deciding that a
        // clause it cannot see does not exist.
        invocations.push({
          context: { sourcePlayerId: signal.playerId, source: signal.card },
          onPlayHandler: true,
        });
      }
    } else if (signal.kind === "card-rested") {
      const invocation = whenRestedInvocation(
        state,
        signal.ownerId,
        signal.card,
        {
          sourcePlayerId: signal.sourcePlayerId,
          sourceIsCharacter: signal.sourceIsCharacter,
        },
      );
      // Rested by something else's effect, so the clause answers the rest
      // rather than a card the player just played: automatic, like the two
      // below.
      if (invocation)
        invocations.push(
          "program" in invocation
            ? { ...invocation, automatic: true }
            : invocation,
        );
    } else if (
      includeOnKo &&
      signal.kind === "card-moved" &&
      signal.from === "board" &&
      signal.to === "trash" &&
      // A Character the printed clause *trashed* was not K.O.'d, so its own
      // `[On K.O.]` stays where it is. Only a cost paid with the source's own
      // body sets this; see `trashedNotKoed` on the `move` node.
      signal.trashedNotKoed !== true
    ) {
      const program = getOnKoMechanicProgram(signal.card.cardNumber);
      if (program) {
        invocations.push({
          context: { sourcePlayerId: signal.ownerId, source: signal.card },
          program,
          automatic: true,
        });
      }
    }
  }
  // `state.activePlayer` is "who acts next", not the turn player: the Block and
  // Counter steps hand it to the defender, and battle damage dispatches its
  // reactions before `resumeMainAfterBattle` hands it back to the attacker. So
  // an `[Your Turn]` reaction read off `activePlayer` alone never fires on the
  // life card an attack takes.
  const turnPlayerId = state.turnPlayerId;
  for (const signal of signals) {
    for (const playerId of ["p1", "p2"] as const) {
      const groupStart = invocations.length;
      for (const rule of REACTION_RULES) {
        // A board-scoped rule dispatches once per copy on the field, with that
        // copy as the source; a Leader-scoped one has exactly one source and it
        // is in no zone. Both are checked before the shared gates below.
        const sources =
          rule.controller === "leader"
            ? state.players[playerId].leaderCardNumber === rule.cardNumber
              ? [
                  {
                    instanceId: `${playerId}-leader`,
                    cardNumber: rule.cardNumber,
                  },
                ]
              : []
            : rule.controller === "stage"
              ? state.players[playerId].stage?.cardNumber === rule.cardNumber
                ? [state.players[playerId].stage]
                : []
              : state.players[playerId].board.filter(
                  (card) => card.cardNumber === rule.cardNumber,
                );
        if (
          signal.kind !== rule.signal.kind ||
          sources.length === 0 ||
          (rule.ownTurn && turnPlayerId !== playerId) ||
          (rule.opponentTurn && turnPlayerId === playerId) ||
          (rule.maxHandSize !== undefined &&
            state.players[playerId].hand.length > rule.maxHandSize) ||
          (rule.leaderAttachedDon !== undefined &&
            state.players[playerId].leaderAttachedDon.length <
              rule.leaderAttachedDon)
        ) {
          continue;
        }
        if (
          signal.kind === "card-played" &&
          rule.signal.kind === "card-played"
        ) {
          const played = db.require(signal.card.cardNumber);
          const playedBy =
            rule.signal.playedBy === "self"
              ? playerId
              : playerId === "p1"
                ? "p2"
                : "p1";
          if (
            signal.playerId !== playedBy ||
            played.category !== rule.signal.category ||
            (rule.signal.minBaseCost !== undefined &&
              (played.cost ?? 0) < rule.signal.minBaseCost) ||
            (rule.signal.hasTrigger !== undefined &&
              played.rules.hasTrigger !== rule.signal.hasTrigger) ||
            (rule.signal.bySourceCategory !== undefined &&
              signal.bySourceCategory !== rule.signal.bySourceCategory)
          ) {
            continue;
          }
        } else if (
          signal.kind === "card-moved" &&
          rule.signal.kind === "card-moved"
        ) {
          const moved = db.require(signal.card.cardNumber);
          if (
            signal.from !== rule.signal.from ||
            (rule.signal.to !== undefined && signal.to !== rule.signal.to) ||
            (rule.signal.movedOwner === "self" &&
              signal.ownerId !== playerId) ||
            (rule.signal.movedOwner === "opponent" &&
              signal.ownerId === playerId) ||
            (rule.signal.movedType !== undefined &&
              !hasCardType(signal.card.cardNumber, rule.signal.movedType)) ||
            (rule.signal.movedTypeIncluding !== undefined &&
              !hasCardTypeIncluding(
                signal.card.cardNumber,
                rule.signal.movedTypeIncluding,
              )) ||
            (rule.signal.movedAnyOfTypes !== undefined &&
              !rule.signal.movedAnyOfTypes.some((type) =>
                hasCardType(signal.card.cardNumber, type),
              )) ||
            (rule.signal.movedMinPower !== undefined &&
              (moved.power ?? 0) < rule.signal.movedMinPower) ||
            (rule.signal.sourceType !== undefined &&
              (signal.sourceCardNumber === undefined ||
                !hasCardType(
                  signal.sourceCardNumber,
                  rule.signal.sourceType,
                ))) ||
            (rule.signal.bySource === "self" &&
              signal.sourcePlayerId !== playerId) ||
            (rule.signal.bySource === "opponent" &&
              (signal.sourcePlayerId === undefined ||
                signal.sourcePlayerId === playerId)) ||
            (rule.signal.byLeaderAttack === true &&
              signal.byLeaderAttack !== true)
          ) {
            continue;
          }
        } else if (
          signal.kind === "event-activated" &&
          rule.signal.kind === "event-activated"
        ) {
          const activatedBy =
            rule.signal.activatedBy === "self"
              ? playerId
              : playerId === "p1"
                ? "p2"
                : "p1";
          if (signal.playerId !== activatedBy) continue;
        } else if (
          signal.kind === "blocker-activated" &&
          rule.signal.kind === "blocker-activated"
        ) {
          const activatedBy =
            rule.signal.activatedBy === "self"
              ? playerId
              : playerId === "p1"
                ? "p2"
                : "p1";
          if (signal.playerId !== activatedBy) continue;
        } else if (
          signal.kind === "card-rested" &&
          rule.signal.kind === "card-rested"
        ) {
          const restedBy =
            rule.signal.restedBy === "self"
              ? playerId
              : playerId === "p1"
                ? "p2"
                : "p1";
          if (signal.sourcePlayerId !== restedBy) continue;
        } else if (
          signal.kind === "trigger-activated" &&
          rule.signal.kind === "trigger-activated"
        ) {
          // Either player's Trigger: the printed clause names no side, and the
          // `[Opponent's Turn]` gate above is what narrows it.
        } else if (
          signal.kind === "don-returned" &&
          rule.signal.kind === "don-returned"
        ) {
          // "a DON!! card on *your* field": the DON!! that went back has to be
          // this player's own.
          if (signal.playerId !== playerId) continue;
          if (signal.count < (rule.signal.minCount ?? 1)) continue;
        } else if (
          signal.kind === "card-drawn" &&
          rule.signal.kind === "card-drawn"
        ) {
          const drawnBy =
            rule.signal.drawnBy === "self"
              ? playerId
              : playerId === "p1"
                ? "p2"
                : "p1";
          if (signal.playerId !== drawnBy) continue;
        } else {
          continue;
        }
        const key = `${state.turn}:${playerId}:${rule.cardNumber}:reaction`;
        if (rule.oncePerTurn && state.oncePerTurn.includes(key)) continue;
        if (
          rule.condition !== undefined &&
          !conditionMatches(
            state,
            { sourcePlayerId: playerId, source: sources[0]! },
            rule.condition,
            {},
            db,
          )
        ) {
          continue;
        }
        const armed = sources.filter((source) => {
          if (rule.sourceAttachedDon === undefined) return true;
          const attached = (source as { attachedDon?: readonly string[] })
            .attachedDon;
          return (attached?.length ?? 0) >= rule.sourceAttachedDon;
        });
        if (armed.length === 0) continue;
        for (const source of armed) {
          invocations.push({
            context: { sourcePlayerId: playerId, source },
            program: rule.program,
            automatic: true,
            ...(rule.oncePerTurn ? { spendsOncePerTurn: true as const } : {}),
          });
        }
        if (rule.oncePerTurn) state.oncePerTurn.push(key);
      }
      tagOrderGroup(state, invocations.slice(groupStart), signal.kind);
    }
  }
  return invocations;
}

/**
 * Marks one player's reactions to one signal as a group to be ordered, when
 * more than one card is answering -- see `orderGroup`.
 *
 * The id only has to differ from the group queued next to it. The turn, the
 * player and the first source tell apart any two groups a single action
 * raises, and `oncePerTurn` grows with every `[Once Per Turn]` clause that
 * fires, so two groups of the same cards answering two signals of one action
 * differ in it too.
 */
function tagOrderGroup(
  state: GameState,
  group: readonly MechanicInvocation[],
  signalKind: string,
): void {
  const cards = new Set(
    group.map((invocation) => invocation.context.source.cardNumber),
  );
  if (cards.size < 2) return;
  const first = group[0]!.context;
  const id = `${String(state.turn)}:${signalKind}:${first.sourcePlayerId}:${first.source.instanceId}:${String(state.oncePerTurn.length)}`;
  for (const invocation of group) {
    if ("program" in invocation) invocation.orderGroup = id;
  }
}

export interface MechanicDispatchResult {
  pending: MechanicPendingChoice | null;
  invocation: MechanicInvocation | null;
  continuations: MechanicInvocation[];
  events: PublicEvent[];
}

/**
 * The programs of every reaction that watches from a Character or the Stage,
 * by card number -- the clauses `leftFieldBeforeActivating` holds to their
 * card still being there.
 */
let fieldReactionPrograms: Map<string, Set<string>> | undefined;

function isFieldReaction(invocation: MechanicProgramInvocation): boolean {
  if (fieldReactionPrograms === undefined) {
    fieldReactionPrograms = new Map();
    for (const rule of REACTION_RULES) {
      if (rule.controller === "leader") continue;
      const known = fieldReactionPrograms.get(rule.cardNumber) ?? new Set();
      known.add(JSON.stringify(rule.program));
      fieldReactionPrograms.set(rule.cardNumber, known);
    }
  }
  return (
    fieldReactionPrograms
      .get(invocation.context.source.cardNumber)
      ?.has(JSON.stringify(invocation.program)) ?? false
  );
}

/**
 * A reaction whose card left the field after it was triggered and before it
 * could activate: CR 8-1-3-1-3, "An auto effect will not activate and cannot
 * be resolved ... if the card ... moves to another area before that effect is
 * activated."
 *
 * Reactions are matched against the field when the signal is dispatched, and
 * a signal raised inside a clause is dispatched when the clause finishes or
 * stops for a choice. So without this check, whether OP05-074 Eustass"Captain"
 * Kid answered the DON!! −10 of OP05-119 Monkey.D.Luffy -- which stops to ask
 * the order before it sends Kid to the deck -- depended on that stop, while
 * OP08-119 Kaido & Linlin, whose K.O. comes first, never raised it. An
 * `[On K.O.]` and a Leader's reaction are not field reactions and run as before.
 */
function leftFieldBeforeActivating(
  state: GameState,
  invocation: MechanicInvocation,
): boolean {
  if (!("program" in invocation) || !invocation.automatic) return false;
  if (!isFieldReaction(invocation)) return false;
  const player = state.players[invocation.context.sourcePlayerId];
  const { instanceId } = invocation.context.source;
  return (
    !player.board.some((card) => card.instanceId === instanceId) &&
    player.stage?.instanceId !== instanceId
  );
}

export function dispatchMechanicInvocations(
  state: GameState,
  queued: readonly MechanicInvocation[],
  db: CardDatabase = defaultCardDatabase,
): MechanicDispatchResult {
  const continuations = queued.filter(
    (invocation) => !leftFieldBeforeActivating(state, invocation),
  );
  const events: PublicEvent[] = [];
  while (continuations.length > 0) {
    const ordering = takeOrderGroup(continuations);
    if (ordering) {
      return {
        pending: ordering.pending,
        invocation: ordering.invocation,
        continuations,
        events,
      };
    }
    const invocation = continuations.shift()!;
    if (!("program" in invocation)) {
      // An imperative `[On Play]` suspends on a `PendingEffect`, which is not
      // something this loop can hand back: its callers assign
      // `state.pendingEffect` from a `MechanicPendingChoice` and would write a
      // `null` straight over it. So the handler and everything queued behind it
      // wait for the end of the action, where `drainPendingContinuations` runs
      // them at a point that owns the pending slot. Parking the tail as well as
      // the handler is what keeps the queue in order.
      queuePendingContinuations(state, [invocation, ...continuations]);
      return { pending: null, invocation: null, continuations: [], events };
    }
    const result = executeMechanicProgram(
      state,
      invocation.context,
      invocation.program,
      db,
      invocation.bindings,
    );
    // The cause, then what it did. Announced only once the clause has run and
    // produced something, so the panel never says an ability fired and then
    // shows nothing underneath -- and so a dry run's "did this do anything?"
    // test is answered by the clause's own steps, never by this marker.
    //
    // The exception is a `[Once Per Turn]` clause that fired to nothing: its
    // use is gone all the same, so staying quiet would leave the player
    // waiting for it to answer the next trigger this turn, which it will not.
    // That one is announced with `noEffect`, and a panel shows it bare.
    if (invocation.automatic && result.events.length > 0) {
      events.push({
        type: "ability-triggered",
        playerId: invocation.context.sourcePlayerId,
        sourceCardNumber: invocation.context.source.cardNumber,
        sourceInstanceId: invocation.context.source.instanceId,
      });
    } else if (
      invocation.automatic &&
      invocation.spendsOncePerTurn &&
      !result.pending
    ) {
      events.push({
        type: "ability-triggered",
        playerId: invocation.context.sourcePlayerId,
        sourceCardNumber: invocation.context.source.cardNumber,
        sourceInstanceId: invocation.context.source.instanceId,
        noEffect: true,
      });
    }
    events.push(...result.events);
    continuations.unshift(
      ...getMechanicSignalInvocations(state, result.signals),
    );
    if (result.pending) {
      return {
        pending: result.pending,
        invocation,
        continuations,
        events,
      };
    }
  }
  return { pending: null, invocation: null, continuations: [], events };
}

/**
 * The `order-reactions` question for the group at the head of `queue`, if one
 * still has two or more cards in it; the group is spliced out into the choice.
 *
 * A group down to one card is untagged instead and runs as it stands, so the
 * last reaction left -- or copies of one card -- never asks.
 */
function takeOrderGroup(queue: MechanicInvocation[]): {
  pending: MechanicPendingChoice;
  invocation: MechanicProgramInvocation;
} | null {
  const head = queue[0];
  if (!head || !("program" in head) || head.orderGroup === undefined) {
    return null;
  }
  let end = 1;
  while (end < queue.length) {
    const next = queue[end]!;
    if (!("program" in next) || next.orderGroup !== head.orderGroup) break;
    end += 1;
  }
  const group = queue.slice(0, end) as MechanicProgramInvocation[];
  if (orderReactionOptions(group).length < 2) {
    for (const invocation of group) delete invocation.orderGroup;
    return null;
  }
  queue.splice(0, end);
  return {
    pending: {
      kind: "order-reactions",
      execution: { context: head.context, bindings: {}, queue: [] },
      reactions: group,
    },
    invocation: head,
  };
}

export function dispatchMechanicSignals(
  state: GameState,
  signals: readonly MechanicSignal[],
  db: CardDatabase = defaultCardDatabase,
): MechanicDispatchResult {
  return dispatchMechanicInvocations(
    state,
    getMechanicSignalInvocations(state, signals),
    db,
  );
}

/**
 * The printed marker of the clause an `optional` node belongs to.
 *
 * An apply/skip offer is the one decision the engine used to put to a player
 * without saying what it was for: `mechanicChoiceOptions` labelled the pair
 * "Apply optional effect" / "Don't apply optional effect", on the theory that
 * whoever clicked the activation knows what they clicked. A `[When Attacking]`
 * or a `[Trigger]` is not clicked -- it fires off an attack or off a Life card
 * -- and a recorded game has an LLM seat declining OP09-062 Nico Robin's ramp,
 * the deck's whole ramp and named three times in its own dossier, on invented
 * grounds: with nothing but "Apply optional effect" in front of it, it guessed
 * what the offer was and guessed wrong. Naming the clause is what lets a seat
 * connect the offer to what it already knows about the card.
 *
 * Resolved statically off the registries rather than carried on the pending
 * effect: the marker is a property of the program, not of the position, and
 * `PendingEffect` is hashed into `stateHash` -- a field there would rewrite
 * every replay fixture and report every recorded trace as incompatible to say
 * something the card number already determines.
 *
 * `undefined` when the card has no optional node under exactly one marker: 26
 * cards in the pool print two clauses that both offer one (usually a
 * `[Counter]` and a `[Trigger]`, which is the same text read from two zones),
 * and a clause named wrongly is worse than one not named. The caller falls
 * back to naming the card.
 */
export function optionalClauseMarker(
  cardNumber: string,
): ClauseMarker | undefined {
  if (optionalClauseMarkers === undefined) {
    optionalClauseMarkers = buildOptionalClauseMarkers();
  }
  return optionalClauseMarkers.get(cardNumber);
}

let optionalClauseMarkers: Map<string, ClauseMarker> | undefined;

/**
 * Whether an `optional` node is the one that opens its clause -- the first in
 * the program, which is where a cost such as `DON!! −10` is accepted -- rather
 * than an "up to" step inside the effect that cost already paid for.
 *
 * The label of an apply/skip offer names the clause and its cost. That is right
 * once: OP08-119 Kaido & Linlin asks again for its two "up to 1" Life steps,
 * and three offers reading "[When Attacking]: DON!! −10" read as being asked to
 * pay three times. Static for the reason `optionalClauseMarker` is: the
 * pending choice carries the node itself, and the program says which node
 * comes first. `true` for a card whose programs cannot be read here, which
 * keeps the clause label it had.
 */
export function isClauseOpeningOptional(
  cardNumber: string,
  effect: unknown,
): boolean {
  if (openingOptionals === undefined) {
    openingOptionals = buildOpeningOptionals();
  }
  const opening = openingOptionals.get(cardNumber);
  return opening === undefined || opening.has(JSON.stringify(effect));
}

let openingOptionals: Map<string, Set<string>> | undefined;

/** The `effect` of the first `optional` node in a program tree, depth first. */
function firstOptionalEffect(entry: unknown, depth = 0): unknown {
  if (entry === null || typeof entry !== "object" || depth > 64) {
    return undefined;
  }
  const node = entry as { kind?: unknown; effect?: unknown };
  if (node.kind === "optional") return node.effect;
  for (const value of Object.values(entry)) {
    const found = firstOptionalEffect(value, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function buildOpeningOptionals(): Map<string, Set<string>> {
  const opening = new Map<string, Set<string>>();
  for (const [, registry] of markerRegistries()) {
    for (const [cardNumber, entry] of registry) {
      const effect = firstOptionalEffect(entry);
      if (effect === undefined) continue;
      const known = opening.get(cardNumber) ?? new Set<string>();
      known.add(JSON.stringify(effect));
      opening.set(cardNumber, known);
    }
  }
  return opening;
}

/** Whether any node in a program tree offers its effect as apply-or-skip. */
function offersOptional(entry: unknown, depth = 0): boolean {
  // The DSL nests, but not deeply; the bound keeps a malformed entry from
  // walking a cycle rather than expressing a real limit on program shape.
  if (entry === null || typeof entry !== "object" || depth > 64) return false;
  if ((entry as { kind?: unknown }).kind === "optional") return true;
  return Object.values(entry).some((value) => offersOptional(value, depth + 1));
}

/**
 * Every registry the interpreter dispatches by printed marker. The two
 * markerless ones -- `whenRestedPrograms` and `leaderWatcherPrograms` -- are
 * left out on purpose: their clauses print no marker to name.
 */
function markerRegistries(): readonly (readonly [
  ClauseMarker,
  ReadonlyMap<string, unknown>,
])[] {
  return [
    ["[On Play]", onPlayPrograms],
    ["[On Block]", onBlockPrograms],
    ["[On K.O.]", onKoPrograms],
    ["[End of Your Turn]", onEndOfYourTurnPrograms],
    ["[Activate: Main]", activateMainPrograms],
    ["[When Attacking]", whenAttackingPrograms],
    ["[Main]", eventMainPrograms],
    ["[Counter]", counterEventPrograms],
    ["[Trigger]", triggerPrograms],
    ["[On Your Opponent's Attack]", onOpponentAttackPrograms],
  ];
}

function buildOptionalClauseMarkers(): Map<string, ClauseMarker> {
  const registries = markerRegistries();
  const found = new Map<string, Set<ClauseMarker>>();
  for (const [marker, registry] of registries) {
    for (const [cardNumber, entry] of registry) {
      if (!offersOptional(entry)) continue;
      const markers = found.get(cardNumber) ?? new Set<ClauseMarker>();
      markers.add(marker);
      found.set(cardNumber, markers);
    }
  }
  const resolved = new Map<string, ClauseMarker>();
  for (const [cardNumber, markers] of found) {
    if (markers.size !== 1) continue;
    const [marker] = markers;
    resolved.set(cardNumber, printedSpelling(cardNumber, marker!));
  }
  return resolved;
}

/**
 * The spelling of a marker the card itself prints.
 *
 * One table dispatches both spellings of the opponent's-attack marker -- see
 * `mechanicProgramsByClause` -- and `clauseText` looks the clause up by the
 * printed string, so the registry's spelling has to be traded for the card's.
 */
function printedSpelling(
  cardNumber: string,
  marker: ClauseMarker,
): ClauseMarker {
  if (marker !== "[On Your Opponent's Attack]") return marker;
  const printed = printedClauses(cardNumber);
  return printed.includes("[On Opponent's Attack]")
    ? "[On Opponent's Attack]"
    : marker;
}
