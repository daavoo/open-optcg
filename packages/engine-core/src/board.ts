/**
 * What a card on the board is, what it may do, and what to call it: keyword and
 * attack legality, the arithmetic a battle is forecast with, and the labels
 * legal actions carry.
 *
 * The bottom of the kernel's dependency order -- it reads state and card data
 * and answers questions, and advances nothing. `actions/` and `legal-actions/`
 * import it directly, which is what retired the cycle those directories used to
 * have with `engine.ts`; see `actions/README.md`.
 */
import {
  cards as defaultCardDatabase,
  clauseText,
  hasCardName,
  type CardDatabase,
  type ClauseMarker,
} from "@one-piece-sim/cards";
import type { PlayerId } from "@one-piece-sim/protocol";
import { getCounterEventProgram } from "./card-mechanics.js";
import {
  attackBannedByOwnText,
  characterEffectsSwitchedOff,
  hasStaticKeyword,
  type Keyword,
} from "./static-abilities.js";
import {
  battleParticipant,
  battleTargetMatches,
  conditionMatches,
  type BattleParticipant,
  type MechanicEffect,
} from "./mechanics.js";
import { boardOwner, currentPower, effectiveCost } from "./queries.js";
import type { BoardCard, CardInstance, GameState } from "./model.js";

export const opponentOf = (playerId: PlayerId): PlayerId =>
  playerId === "p1" ? "p2" : "p1";

export const leaderInstanceId = (playerId: PlayerId): string =>
  `${playerId}-leader`;

export function effectiveBoardCost(
  state: GameState,
  card: BoardCard,
  db: CardDatabase = defaultCardDatabase,
): number {
  const owner = boardOwner(state, card);
  return owner ? effectiveCost(state, owner, card, db) : 0;
}

export function actionCardLabel(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  includeAttachedDon: boolean,
  db: CardDatabase = defaultCardDatabase,
): string {
  const player = state.players[playerId];
  if (instanceId === leaderInstanceId(playerId)) {
    const definition = db.require(player.leaderCardNumber);
    return `${definition.name} [${definition.cardNumber}] (Leader, ${currentPower(state, playerId, instanceId, includeAttachedDon)} power)`;
  }
  const card = player.board.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  if (!card) throw new Error(`MISSING_CARD: ${instanceId}`);
  const definition = db.require(card.cardNumber);
  return `${definition.name} [${definition.cardNumber}] (Character, ${currentPower(state, playerId, instanceId, includeAttachedDon)} power, ${card.rested ? "rested" : "active"})`;
}

/**
 * Names an activation by what it costs and does, not just by the card's name.
 *
 * "Activate Enel" named three different cards in one Purple Enel deck and told
 * the chooser nothing about the price. The card number disambiguates and the
 * clause states the trade, which is the whole decision: OP15-060's [Blocker]
 * costs a DON!! card and a card from hand, and an LLM playtest defended a turn
 * with two Enel it believed were already Blockers rather than buying it.
 *
 * The markers are tried in order because the same action shape covers Events
 * activated from hand ([Main]) and board sources ([Activate: Main]); the bare
 * name remains the fallback for text that prints neither.
 */
export function activationSummary(
  cardNumber: string,
  ...markers: readonly ClauseMarker[]
): string {
  // Display-only label: threading a caller-supplied database through this
  // and its sixteen call sites would buy nothing a test could observe, so it
  // reads the shipped pool directly rather than taking a `db` parameter.
  const definition = defaultCardDatabase.require(cardNumber);
  const clause = markers.reduce<string | undefined>(
    (found, marker) => found ?? clauseText(cardNumber, marker),
    undefined,
  );
  const label = `Activate ${definition.name} [${cardNumber}]`;
  return clause ? `${label}: ${clause}` : label;
}

export function hasRush(
  state: GameState,
  playerId: PlayerId,
  card: BoardCard,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  // Granted [Rush] is turn-scoped instance state, like granted [Blocker].
  if ((card.rushUntilTurn ?? -1) >= state.turn) return true;
  return hasStaticKeyword(state, playerId, card, "Rush", db);
}

export function hasRushCharacter(
  state: GameState,
  playerId: PlayerId,
  card: BoardCard,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  // Granted [Rush: Character] is turn-scoped board state, the same shape the
  // other four granted keywords have -- OP15-093 The Risky Brothers is the only
  // card that hands it out.
  if ((card.rushCharacterUntilTurn ?? -1) >= state.turn) return true;
  return hasStaticKeyword(state, playerId, card, "Rush: Character", db);
}

/**
 * Counter power the defender must still add to survive, or 0 when already safe.
 *
 * The attacker wins ties -- a 5000 attack beats a 5000 defender -- so the
 * defender must exceed, not match, hence the `+ 1`.
 */
export function counterShortfall(
  attackPower: number,
  defensePower: number,
): number {
  return Math.max(0, attackPower - defensePower + 1);
}

/**
 * Counter power a `[Counter]` Event would add to the battle in progress, or
 * `undefined` when the card decides it while resolving.
 *
 * The single source for that number: `applyAction`'s Counter Event chain reads
 * it too, so a summary cannot promise power the resolution does not add. That
 * mattered because Counter *cards* from hand were summarised with the whole
 * sum -- "defense becomes 7000 vs 8000 attack: still hit; 1001 more Counter
 * power needed and the hand cannot reach it" -- while Counter *Events* printed
 * only their card text. An LLM at 1 Life spent Mamaragan and then Kiten into a
 * 3001 shortfall, reading "+2000" against "2001" as enough, and lost the Life
 * card anyway with nothing left in hand.
 *
 * The name-restricted Events are the reason this takes `state` rather than
 * being a table: El Thor, Kiten and Varie raise "1 of your [Enel] cards", so
 * against a battle target of any other name they add nothing at all.
 */
export function counterEventPower(
  state: GameState,
  playerId: PlayerId,
  cardNumber: string,
  db: CardDatabase = defaultCardDatabase,
): number | undefined {
  if (["OP15-074", "OP15-075", "OP15-076"].includes(cardNumber)) {
    return battleTargetName(state, db) === "Enel" ? 2_000 : 0;
  }
  if (cardNumber === "OP15-078") return 1_000;
  if (cardNumber === "OP12-098") {
    return state.players[playerId].board.some(
      (card) =>
        db.require(card.cardNumber).types.includes("Revolutionary Army") &&
        effectiveCost(state, playerId, card) >= 8,
    )
      ? 4_000
      : 2_000;
  }
  if (cardNumber === "OP12-057" || cardNumber === "OP07-056") return 4_000;
  // OP11-079 pays out on a guess about the opponent's hand, so there is no
  // number to promise before it resolves.
  if (cardNumber === "OP11-079") return undefined;
  // OP17-096 "I'm Luffy!! The Man Who Will Be King of the Pirates!!": "[printed text omitted -- pnpm card:text OP17-096]" The declarative table
  // has no slot for a Counter's power being conditional -- `target` narrows
  // *which* card the power can land on, not *whether* it is paid out at all --
  // so this one clause is read here instead, the same shape the hand-written
  // entries above already use for a Counter this table cannot express.
  if (cardNumber === "OP17-096") {
    const giantOut = (["p1", "p2"] as const).some((pid) =>
      state.players[pid].board.some(
        (card) => effectiveCost(state, pid, card) >= 12,
      ),
    );
    return giantOut ? 4_000 : 0;
  }
  // OP17-018 "The Power to Destroy the World": "[printed text omitted -- pnpm card:text OP17-018]" Printed power, matching
  // every other "power N or more" board-state gate in this format's static
  // text.
  if (cardNumber === "OP17-018") {
    const qualifying = state.players[playerId].board.filter(
      (card) => (db.require(card.cardNumber).power ?? 0) >= 8_000,
    ).length;
    return qualifying >= 2 ? 4_000 : 0;
  }
  // OP17-116 Fulgora: "[printed text omitted -- pnpm card:text OP17-116]"
  if (cardNumber === "OP17-116") {
    const qualifying = state.players[playerId].board.filter(
      (card) => db.require(card.cardNumber).rules.hasTrigger,
    ).length;
    return qualifying >= 2 ? 4_000 : 0;
  }
  // OP17-037/038/076: "[Counter] You may <pay>: ... gains +3000 power ..." A
  // player choice, not board state, decides whether the power lands at
  // all -- the same "decided as it resolves" reading OP11-079 already
  // established -- so `program` alone carries the clause (see
  // `counterEventPrograms`) and the declarative `power` field is
  // unreachable.
  if (["OP17-037", "OP17-038", "OP17-076"].includes(cardNumber)) {
    return undefined;
  }
  // OP17-077 Gundari Meteor Shower: "[Counter] DON!! −1: Your Leader Gains
  // +4000 power during this battle." No "you may" in front of the DON!!, so
  // -- unlike 037/076 -- this is deterministic from board state visible
  // before the Counter is even offered: whether the player has 1 active
  // DON!! left over *after* paying the Event's own printed cost (1).
  if (cardNumber === "OP17-077") {
    const program = getCounterEventProgram(cardNumber);
    const remaining =
      state.players[playerId].activeDon.length - (program?.cost ?? 0);
    if (remaining < 1) return 0;
    // "Your Leader Gains +4000 power" -- worth nothing while a Character
    // blocks, the same restriction `battle-power`'s own `target` carries.
    const participant = battleParticipant(state, playerId);
    if (!participant) return 0;
    return battleTargetMatches({ isLeader: true }, participant) ? 4_000 : 0;
  }
  const program = getCounterEventProgram(cardNumber);
  if (!program) {
    // The `bad-manners-counter` fallback in effects.ts, which is where OP04-016,
    // OP02-068 and OP13-076 land once their discard is paid.
    return 3_000;
  }
  if (program.powerWhen) {
    // A synthetic context: the conditions a `powerWhen` asks about are board,
    // Life and Leader state rather than anything about the Event instance, and
    // this is called from the offer -- before the card has been played, so it
    // has no board presence to point at. A source-scoped condition here would
    // read a card that is not on the field and answer false, which is why
    // `powerWhen` is documented as board state only.
    const held = conditionMatches(
      state,
      {
        sourcePlayerId: playerId,
        source: { instanceId: `${playerId}-counter-event`, cardNumber },
      },
      program.powerWhen,
      {},
      db,
    );
    if (!held) return 0;
  }
  if (!program.target) {
    // "power: 0" alongside a `program.program` whose effect is (once any
    // leading, unevaluated `if` wrappers are stripped) itself a player
    // choice ("optional") is the type's documented shape for a payout that
    // depends on an answer rather than board state -- see the `powerWhen`
    // doc comment on `CounterEventProgram`. Reading that as a real, promised
    // 0 (rather than "decided as it resolves") is what made OP17-037/038/076
    // need their own hardcoded branches above; this makes the generic path
    // agree with them instead of requiring a new one per card (EB04-029,
    // EB04-040). This does not evaluate a leading `if`'s condition -- unlike
    // `counterEventForecastPower`, below -- because *this* function's return
    // value is what `activate-counter-event.ts` adds to the battle, and a
    // mandatory `if` guarding a `battle-power` node (OP14-018) is applied for
    // real when that same program is dispatched a few lines later; resolving
    // it here too would add it twice.
    if (program.power === 0 && program.program) {
      // `then` is required on an `if` node, so stripping wrappers can never
      // walk off the end -- the effect stays defined however deep it nests.
      let effect: MechanicEffect = program.program.effect;
      while (effect.kind === "if") effect = effect.then;
      if (effect.kind === "optional") return undefined;
    }
    return program.power;
  }
  // The card the power would land on is the one this player has in the battle,
  // which `battleParticipant` already answers for `battle-power`. A Counter
  // played with no battle open, or against a target that has just left the
  // field, reaches nothing.
  const participant = battleParticipant(state, playerId);
  if (!participant) return 0;
  return battleTargetMatches(program.target, participant) ? program.power : 0;
}

/**
 * `counterEventPower`, but resolving a mandatory `if` (OP14-018's "an
 * 8000-power Character is out") for real instead of reporting the 0 that
 * function must report to stay safe for `activate-counter-event.ts` to add.
 *
 * Only the offer -- `legal-actions/counter.ts`, deciding whether an Event is
 * worth showing at all, and the number its summary promises -- calls this;
 * the resolution site still calls `counterEventPower` and executes the
 * program separately, so this function's answer is never added to a battle
 * itself and doubling it is not a risk here.
 */
export function counterEventForecastPower(
  state: GameState,
  playerId: PlayerId,
  cardNumber: string,
  db: CardDatabase = defaultCardDatabase,
): number | undefined {
  const base = counterEventPower(state, playerId, cardNumber, db);
  if (base !== 0) return base;
  const program = getCounterEventProgram(cardNumber);
  if (!program) return base;
  // The Event leaves hand for trash as part of being played, before its
  // power or program resolves (see `activate-counter-event.ts`), so a
  // condition that reads either zone -- OP14-096's "10 cards in your trash",
  // OP12-059 Concasser's "4 or more Events in your trash" -- has to be asked
  // about that later state, or a hand that only reaches the count by playing
  // this Event forecasts one short of what actually resolves (Bandai's
  // OP12-059#1 ruling: three other Events plus Concasser itself is four).
  const player = state.players[playerId];
  const instanceId = player.hand.find(
    (card) => card.cardNumber === cardNumber,
  )?.instanceId;
  const asPlayed = instanceId
    ? {
        ...state,
        players: {
          ...state.players,
          [playerId]: {
            ...player,
            hand: player.hand.filter((card) => card.instanceId !== instanceId),
            trash: [...player.trash, { instanceId, cardNumber }],
          },
        },
      }
    : state;
  if (program.powerWhen) {
    return counterEventPower(asPlayed, playerId, cardNumber, db);
  }
  if (!program.program || program.target) return base;
  const participant = battleParticipant(state, playerId);
  if (!participant) return 0;
  return resolvedProgramPower(
    program.program.effect,
    asPlayed,
    playerId,
    cardNumber,
    participant,
    db,
  );
}

/**
 * The Counter power a `power: 0` program's own effect tree actually adds
 * right now, for the one Counter Event this player holds and the battle
 * open in `state` -- as opposed to `programBattlePower`, which deliberately
 * does not evaluate an `if`'s condition because it is forecasting what the
 * *opponent's whole hand* could still reach, not what one card in hand does.
 *
 * A board-state `if` (OP14-018's "an 8000-power Character is out",
 * EB04-040's "there is DON!! to return") is resolved for real, so a battle
 * that does not satisfy it reports 0 rather than the optimistic best case.
 * A player choice ("optional", `choose`, `select`, `choice`) is not
 * resolved -- its payout depends on an answer the offer cannot promise
 * before it is given, so it reports `undefined` ("decided as it resolves"),
 * same as `powerWhen`-less special cases like OP11-079.
 */
function resolvedProgramPower(
  effect: MechanicEffect,
  state: GameState,
  playerId: PlayerId,
  cardNumber: string,
  participant: BattleParticipant,
  db: CardDatabase,
): number | undefined {
  switch (effect.kind) {
    case "battle-power":
      return effect.player === "self" &&
        battleTargetMatches(effect.target, participant)
        ? effect.amount
        : 0;
    case "sequence": {
      let total = 0;
      for (const child of effect.effects) {
        const value = resolvedProgramPower(
          child,
          state,
          playerId,
          cardNumber,
          participant,
          db,
        );
        if (value === undefined) return undefined;
        total += value;
      }
      return total;
    }
    case "if": {
      const held = conditionMatches(
        state,
        {
          sourcePlayerId: playerId,
          source: { instanceId: `${playerId}-counter-event`, cardNumber },
        },
        effect.condition,
        {},
        db,
      );
      const branch = held ? effect.then : effect.else;
      return branch
        ? resolvedProgramPower(
            branch,
            state,
            playerId,
            cardNumber,
            participant,
            db,
          )
        : 0;
    }
    case "optional": {
      // "You may trash N cards from your hand: +X" (`trashForBattlePower`):
      // the player pays when the hand can, which is the whole point of
      // playing the Event for its power, and gets nothing when it cannot. The
      // Event has already left the hand in `state` (see the caller).
      const inner = effect.effect;
      if (
        inner.kind === "choose" &&
        inner.selector.player === "self" &&
        inner.selector.zone === "hand" &&
        (inner.chooser === undefined || inner.chooser === "self")
      ) {
        if (state.players[playerId].hand.length < inner.min) return 0;
        return resolvedProgramPower(
          inner.effect,
          state,
          playerId,
          cardNumber,
          participant,
          db,
        );
      }
      return undefined;
    }
    case "select":
    case "choose":
    case "choice":
      return undefined;
    default:
      return 0;
  }
}

/**
 * How the battle stands at the current numbers, for an action summary.
 *
 * Written once and used from both ends of the battle -- the attacker choosing
 * whether to declare, and the defender choosing whether to answer -- because a
 * run was lost to a Leader attacking at 5000 into a 5000 Leader while four DON!!
 * sat unspent in the cost area. Attack power is captured at declaration, so an
 * attacker that cannot see the arithmetic before it commits cannot recover.
 *
 * The losing side spells out that the defender pays nothing, because "target
 * survives" was read by an LLM as "the defender still has to answer it": it
 * swung a 6000 Blocker into a 7000 Leader to "force a counter or Life" and the
 * opponent simply passed block and passed counter.
 */
export function battleForecast(
  attackPower: number,
  defensePower: number,
  stake?: string,
): string {
  const shortfall = counterShortfall(attackPower, defensePower);
  return shortfall === 0
    ? `${attackPower} attack vs ${defensePower} defense: attack fails, target survives and the defender spends nothing`
    : `${attackPower} attack vs ${defensePower} defense: target is hit${stake ? ` and ${stake}` : ""} unless ${shortfall} more Counter power is added, from any number of cards`;
}

/**
 * What a successful attack actually costs the defender.
 *
 * "Target is hit" priced a Leader's last Life card the same as its first and
 * the same as losing the game, and an LLM read them as the same thing: at 1
 * Life it called an 8000 attack "otherwise lethal" and burned two Counter
 * Events failing to stop it, when being hit would have cost one Life card and
 * handed it to their hand. The rule is in the prompt; the number it turns on
 * is only in the state, so the forecast is where the two meet.
 */
export function battleStake(
  state: GameState,
  defenderPlayerId: PlayerId,
  targetInstanceId: string,
  attacker?: { playerId: PlayerId; instanceId: string },
  db: CardDatabase = defaultCardDatabase,
): string {
  if (targetInstanceId !== leaderInstanceId(defenderPlayerId)) {
    return "the Character is K.O.'d";
  }
  const life = state.players[defenderPlayerId].life.length;
  // An attack declared against a player who is already on 0 Life ends the game,
  // whatever the attacker is. That is the only way a battle wins.
  if (life === 0) return "the attacker wins the game";
  // [Double Attack] pays two points of damage in sequence, and each point
  // checks a Life card -- so against a defender on 1 Life it takes that card
  // and stops. It does not win the game, and it does not cost two: see
  // `settleDoubleAttackDamage` for the ruling. Reporting it as the game is what
  // this string used to do, and every consumer -- the web UI and the `summary`
  // an LLM reads off each legal action -- believed it.
  const points =
    attacker &&
    hasKeyword(
      state,
      attacker.playerId,
      attacker.instanceId,
      "Double Attack",
      db,
    )
      ? 2
      : 1;
  const taken = Math.min(points, life);
  // [Banish] changes where the Life card goes, which is the whole reason to
  // attack with a card that has it: the card is trashed instead of joining the
  // hand, and its [Trigger] never fires. Saying "to their hand" of a Banish
  // attacker overstates what the defender gets by a card and a Trigger, and
  // this string is what an LLM and the web UI both price the battle from.
  const banish =
    attacker !== undefined &&
    hasKeyword(state, attacker.playerId, attacker.instanceId, "Banish", db);
  const destination = banish
    ? "to their trash, without activating a [Trigger]"
    : "to their hand";
  if (taken > 1) {
    return `the defender loses ${taken} of their ${life} Life cards ${destination}`;
  }
  return `the defender loses 1 of their ${life} Life card${life === 1 ? "" : "s"} ${destination}`;
}

/**
 * Remember that `playerId` activated an Event costing `baseCost` this turn.
 *
 * Keeps the highest cost seen, because every clause asking about it asks for a
 * floor ("a base cost of 3 or more"). The stamp carries its own turn so it
 * needs no clearing at the turn boundary -- a stale entry simply stops
 * matching.
 */
export function recordEventActivation(
  state: GameState,
  playerId: PlayerId,
  baseCost: number,
): void {
  const current =
    state.eventsActivatedOnTurn?.turn === state.turn
      ? state.eventsActivatedOnTurn
      : { turn: state.turn };
  state.eventsActivatedOnTurn = {
    ...current,
    [playerId]: Math.max(current[playerId] ?? 0, baseCost),
  };
}

// "This Leader cannot attack." and "This Character cannot attack." are
// `rules.cannotAttack`, derived from the printed sentence by `deriveRules` in
// @one-piece-sim/cards, full stop included: OP12-020's conditional "[printed text omitted -- pnpm card:text OP12-020]" is a different restriction.

export function canAttack(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  // The window, as opposed to the card: whether it is this player's Main Phase
  // and a decision of theirs is open. Everything else is `couldAttackThisTurn`.
  if (state.phase !== "main" || state.activePlayer !== playerId) return false;
  return couldAttackThisTurn(state, playerId, instanceId, db);
}

/**
 * Whether this card is able to attack at some point in the current turn,
 * ignoring whose decision window is open right now.
 *
 * `canAttack` cannot answer that, and the difference matters to anyone asked to
 * choose during someone else's turn. A defender resolving a [Trigger] that gives
 * an attacker "-3000 power during this turn" is deciding whether that reduction
 * will ever be read, and the answer is whether the attacker can still declare --
 * a question about the card, not about the phase. Asking `canAttack` from the
 * trigger phase returns false for every card on the table, including the ones
 * about to swing.
 *
 * It answers for the turn as it stands. An effect that grants Rush, restands the
 * card or lifts an attack lock later in the turn changes the answer, which is
 * why this is offered as a fact about the present board rather than as a promise.
 */
export function couldAttackThisTurn(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  // Comprehensive Rules 6-5-6-1: "Neither player can battle on their first
  // turn." Both first turns, not just the first player's -- note the contrast
  // with 6-3-1 and 6-4-1, which restrict the skipped draw and the single
  // DON!! to "the player going first". `turn` counts player-turns, so the two
  // first turns are turns 1 and 2.
  if (state.turn <= 2) return false;
  const player = state.players[playerId];
  if (instanceId === leaderInstanceId(playerId)) {
    // "This Leader cannot attack." -- OP15-039 Rebecca, whose whole design is a
    // Leader that develops instead of attacking. Read off the printed text
    // rather than a card-number list, the same way keywords and DON!!
    // requirements are.
    //
    // The full stop is load-bearing: OP12-020 Roronoa Zoro prints "[printed text omitted -- pnpm card:text OP12-020]", a conditional restriction on *what* it may attack, and
    // a looser match would stop that Leader attacking at all.
    if (db.require(player.leaderCardNumber).rules.cannotAttack) {
      return false;
    }
    // "Up to 1 of your opponent's rested Leader cannot attack until the end of
    // your opponent's next turn" -- OP06-023 Arlong. A hold on the Leader
    // rather than on the card it is printed on, kept on the player because a
    // Leader has no `BoardCard`; see `leaderCannotAttackUntilTurn`.
    if ((player.leaderCannotAttackUntilTurn ?? -1) >= state.turn) return false;
    return !player.leaderRested;
  }
  const card = player.board.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  if (
    card &&
    db.require(card.cardNumber).rules.cannotAttack &&
    !characterEffectsSwitchedOff(state, playerId, card)
  ) {
    return false;
  }
  // "This Character cannot attack *unless* <condition>." -- EB04-005 Trafalgar
  // Law and EB04-051 Emet. A different sentence from the flag above and a
  // different kind of fact: that one is true for the game's whole length, this
  // one is a question about the board and is answered afresh every turn. See
  // `attackBlocked` on `StaticAbility`.
  if (card && attackBannedByOwnText(state, playerId, card, db)) return false;
  return Boolean(
    card &&
    !card.rested &&
    (card.cannotAttackUntilTurn ?? -1) < state.turn &&
    // A taxed attack is legal only while the price is payable -- OP08-043
    // Edward.Newgate. An empty hand is what makes that clause a lock rather
    // than a toll, and offering the attack anyway would hand it over for free.
    ((card.attackTaxUntilTurn ?? -1) < state.turn ||
      player.hand.length >= (card.attackTaxHandCards ?? 0)) &&
    // Comprehensive Rules 7-1-1-1: "the turn player declares their attack by
    // resting their active Leader card or 1 active Character card." Resting is
    // how a declaration is paid for, so a Character under a "cannot be rested"
    // effect cannot declare one. That is what makes OP14-033 Perona and
    // ST32-002 Kouzuki Oden removal that leaves the body on the field.
    (card.cannotRestUntilTurn ?? -1) < state.turn &&
    db.require(card.cardNumber).power !== null &&
    ((card.playedTurn ?? 0) < state.turn ||
      hasRush(state, playerId, card) ||
      hasRushCharacter(state, playerId, card)),
  );
}

/**
 * Whether a "cannot be rested" effect holds `card` this turn.
 *
 * Bandai's rules Q&A (Advanced Rules) rules that such a Character can do
 * nothing that requires resting it: attack, activate [Blocker], or pay an
 * activation cost of resting itself.
 * `canAttack` and `canBlock` read the field directly; the activation gates
 * ask here, so the three cannot drift apart on what the lock means.
 */
export function restLocked(
  state: GameState,
  card: { instanceId: string; cannotRestUntilTurn?: number },
): boolean {
  return (card.cannotRestUntilTurn ?? -1) >= state.turn;
}

export function canBlock(
  state: GameState,
  playerId: PlayerId,
  card: BoardCard,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  if (card.rested) return false;
  // Comprehensive Rules 10-1-4-1: [Blocker] is activated "by resting this card
  // during the Block Step", so the same "cannot be rested" effect that bars an
  // attack in `canAttack` bars a block here. One rule, two gates.
  if ((card.cannotRestUntilTurn ?? -1) >= state.turn) return false;
  // OP16-063 Kuzan switches the ability off without removing the keyword, so
  // this is checked here rather than in `hasKeyword`: everything that *shows*
  // the card still reads it as a Blocker.
  if ((card.blockerDisabledUntilTurn ?? -1) >= state.turn) return false;
  // "Your opponent cannot activate [Blocker] during this battle" (OP06-055).
  // Battle-scoped, so it is read off the open attack rather than off the card:
  // see `ActiveAttack.blockersDisabled`.
  if (state.activeAttack?.blockersDisabled === true) return false;
  return hasKeyword(state, playerId, card.instanceId, "Blocker", db);
}

/**
 * Whether `playerId`'s Leader may activate [Blocker] against the open attack.
 *
 * OP05-022 Donquixote Rosinante is the first Leader in the pool to print the
 * keyword, and `canBlock` reads a `BoardCard` -- a Leader has none, and keeps
 * its rested state on the player. The same three gates apply: it must be
 * active, the battle must allow Blockers at all, and the attack must be aimed
 * at something else -- a Leader that is already the target cannot become the
 * "new target", which is what the keyword's own text says a block does.
 */
export function canLeaderBlock(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  const attack = state.activeAttack;
  if (!attack || attack.defenderPlayerId !== playerId) return false;
  if (attack.targetInstanceId === leaderInstanceId(playerId)) return false;
  if (attack.blockersDisabled === true) return false;
  if (state.players[playerId].leaderRested) return false;
  return hasKeyword(state, playerId, leaderInstanceId(playerId), "Blocker", db);
}

export function hasKeyword(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  keyword: Keyword,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  // A Leader is in no zone, so it carries its granted keywords on the player
  // rather than on a BoardCard. [Unblockable] (OP17-115) was the first grant
  // to reach one; [Rush] is Character-only in the printed pool, and a Leader's
  // own text is read straight off the card everywhere else.
  if (instanceId === leaderInstanceId(playerId)) {
    const player = state.players[playerId];
    if (
      keyword === "Unblockable" &&
      (player.leaderUnblockableUntilTurn ?? -1) >= state.turn
    ) {
      return true;
    }
    // [Double Attack] is granted to a Leader by two cards across OP15 and
    // OP16, which makes it the second keyword a Leader can carry.
    if (
      keyword === "Double Attack" &&
      (player.leaderDoubleAttackUntilTurn ?? -1) >= state.turn
    ) {
      return true;
    }
    // [Blocker] is granted to a Leader by OP16-048 Buggy when the Leader
    // answers to "[Prisoner of Impel Down]" -- the all-names Leader does.
    // `canLeaderBlock` reads it through here, as it reads a printed one.
    if (
      keyword === "Blocker" &&
      (player.leaderBlockerUntilTurn ?? -1) >= state.turn
    ) {
      return true;
    }
    // [Banish] is the third, granted by ST28-002 Izo. `resolveBattle` reads it
    // off the attacker through this function, so the Leader half has to answer
    // here or the grant does nothing at all.
    if (
      keyword === "Banish" &&
      (player.leaderBanishUntilTurn ?? -1) >= state.turn
    ) {
      return true;
    }
    // A Leader can also be handed a keyword by an aura rather than by a
    // turn-scoped grant: OP16-003 Edward.Newgate gives its controller's Leader
    // [Double Attack] from the board. Before this the branch returned early and
    // no aura could ever reach a Leader.
    return hasStaticKeyword(
      state,
      playerId,
      { instanceId, cardNumber: player.leaderCardNumber },
      keyword,
      db,
      true,
    );
  }
  const card = state.players[playerId].board.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  if (!card) return false;
  // Granted [Blocker] (Kid's Leader, Buggy) and granted [Unblockable] (OP15-047
  // Sanji) are turn-scoped state rather than static text, so they stay here;
  // everything printed lives in the table.
  if (keyword === "Blocker" && (card.blockerUntilTurn ?? -1) >= state.turn) {
    return true;
  }
  if (
    keyword === "Unblockable" &&
    (card.unblockableUntilTurn ?? -1) >= state.turn
  ) {
    return true;
  }
  if (keyword === "Rush" && (card.rushUntilTurn ?? -1) >= state.turn) {
    return true;
  }
  // Granted [Rush: Character] was the one turn-scoped grant missing from this
  // list, and `canAttack` reads it through `hasRushCharacter` rather than
  // through here -- so legality was right while every *observer* of the keyword
  // was wrong. `effectiveKeywords` is built out of this function, so a
  // Character handed [Rush: Character] by EB04-007's own activation or by
  // OP15-093 reported `keywords: none`: the LLM's board block, the app and any
  // policy reading the observation all saw an ordinary body that had
  // inexplicably attacked the turn it landed, with nothing saying it could
  // attack Characters only.
  if (
    keyword === "Rush: Character" &&
    (card.rushCharacterUntilTurn ?? -1) >= state.turn
  ) {
    return true;
  }
  if (keyword === "Banish" && (card.banishUntilTurn ?? -1) >= state.turn) {
    return true;
  }
  if (
    keyword === "Double Attack" &&
    (card.doubleAttackUntilTurn ?? -1) >= state.turn
  ) {
    return true;
  }
  return hasStaticKeyword(state, playerId, card, keyword, db);
}

/**
 * Whether the attack in progress cannot be blocked.
 *
 * This used to name OP16-032 Magellan directly, which meant the second card in
 * the format to print [Unblockable] -- or the first to *grant* it, as OP15-047
 * Sanji does -- would have needed another branch here. It now reads the keyword,
 * so printed [Unblockable] comes off card text and granted [Unblockable] comes
 * off the turn-scoped flag, through the same query every other keyword uses.
 */
/**
 * Printed name of the card the current battle is aimed at.
 *
 * Counter Events that restrict their target by name -- "1 of your [Enel] cards"
 * -- need this: the engine's Counter power lands on the battle target, so a
 * restriction the target does not satisfy means the Event simply cannot help.
 */
export function battleTargetName(
  state: GameState,
  db: CardDatabase = defaultCardDatabase,
): string | undefined {
  const attack = state.activeAttack;
  if (!attack) return undefined;
  const defender = state.players[attack.defenderPlayerId];
  if (attack.targetInstanceId === leaderInstanceId(attack.defenderPlayerId)) {
    return db.require(defender.leaderCardNumber).name;
  }
  const card = defender.board.find(
    (candidate) => candidate.instanceId === attack.targetInstanceId,
  );
  return card ? db.require(card.cardNumber).name : undefined;
}

export function isUnblockableAttack(
  state: GameState,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  const attack = state.activeAttack;
  if (!attack) return false;
  return hasKeyword(
    state,
    attack.attackerPlayerId,
    attack.attackerInstanceId,
    "Unblockable",
    db,
  );
}

/** The name OP16-048 Buggy's [Blocker] grant asks for. */
const PRISONER_NAME = "Prisoner of Impel Down";

export function offerBuggyBlockerEffect(state: GameState): boolean {
  const attack = state.activeAttack;
  if (!attack) return false;
  const defender = state.players[attack.defenderPlayerId];
  const buggy = defender.board.find((card) => {
    const activatedKey = `${state.turn}:${attack.defenderPlayerId}:${card.instanceId}:buggy-blocker`;
    const offeredKey = `${activatedKey}:offered:${attack.attackerInstanceId}`;
    return (
      card.cardNumber === "OP16-048" &&
      !state.oncePerTurn.includes(activatedKey) &&
      !state.oncePerTurn.includes(offeredKey)
    );
  });
  // "[Prisoner of Impel Down]" is a name, so it is asked through `hasCardName`
  // rather than as OP16-042's card number -- and a name reaches a Leader too.
  // Bandai's OP16 Q&A rules that a Leader "treated as a card with all card
  // names" can gain [Blocker] from this, and Comprehensive Rules 10-1-4-1 does
  // not limit [Blocker] to Characters, so such a Leader is offered beside the
  // board. Only an active card is offered: a rested one cannot pay the rest
  // [Blocker] costs, so the grant would spend the once-per-turn for nothing.
  const eligibleInstanceIds = [
    ...(hasCardName(defender.leaderCardNumber, PRISONER_NAME) &&
    !defender.leaderRested
      ? [leaderInstanceId(attack.defenderPlayerId)]
      : []),
    ...defender.board
      .filter(
        (card) => hasCardName(card.cardNumber, PRISONER_NAME) && !card.rested,
      )
      .map((card) => card.instanceId),
  ];
  if (!buggy || eligibleInstanceIds.length === 0) return false;
  state.pendingEffect = {
    kind: "grant-prisoner-blocker",
    playerId: attack.defenderPlayerId,
    sourceCardNumber: "OP16-048",
    sourceInstanceId: buggy.instanceId,
    eligibleInstanceIds,
    resumePlayerId: attack.defenderPlayerId,
  };
  state.oncePerTurn.push(
    `${state.turn}:${attack.defenderPlayerId}:${buggy.instanceId}:buggy-blocker:offered:${attack.attackerInstanceId}`,
  );
  state.phase = "block";
  state.activePlayer = attack.defenderPlayerId;
  return true;
}

export function survivesEmptyDeck(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  return db.require(state.players[playerId].leaderCardNumber).rules
    .survivesEmptyDeck;
}

/**
 * Whether this player's Leader turns running out of cards into a win.
 *
 * The stronger sibling of {@link survivesEmptyDeck}, and a separate question:
 * that one defers the loss to the end of the turn, and this one ends the game
 * immediately the other way. P-117 Nami is the only printing, and its own
 * `[DON!! x1]` mill is what gets the deck there.
 */
export function winsOnEmptyDeck(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  return db.require(state.players[playerId].leaderCardNumber).rules
    .winsOnEmptyDeck;
}

/**
 * Whether a player's hand holds enough cards of the required categories, for
 * "1 Event or Stage card".
 */
export function handHasCategory(
  player: { hand: readonly CardInstance[] },
  required: { categories: readonly string[]; count: number },
  db: CardDatabase = defaultCardDatabase,
): boolean {
  return (
    player.hand.filter((card) =>
      required.categories.includes(db.require(card.cardNumber).category),
    ).length >= required.count
  );
}
