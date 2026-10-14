/**
 * Declaring an attack, and the arithmetic every declaration is offered with.
 *
 * These summaries carry more than a label: what the attacker swings for, what
 * it would take to bring a failing attack into range, and what declaring costs
 * defensively. That is what a policy or a model is meant to read, instead of
 * re-deriving the battle from the board -- see `donNeededToReach`, which prices
 * a lift by asking the attacker rather than by dividing the deficit by 1000.
 *
 * One of the five kinds of offer the Main phase makes; `index.ts` composes them.
 */
import { pendingDefenseBoost } from "../../battle.js";
import {
  actionCardLabel,
  battleForecast,
  battleStake,
  canAttack,
  canBlock,
  counterShortfall,
  hasRush,
  hasRushCharacter,
  leaderInstanceId,
  opponentOf,
} from "../../board.js";
import type { GameState } from "../../model.js";
import { currentPower } from "../../queries.js";
import { attacksActiveCharacters } from "../../static-abilities.js";
import { hasCardType, type CardDatabase } from "@one-piece-sim/cards";
import type { LegalAction, PlayerId } from "@one-piece-sim/protocol";

/**
 * Active DON!! this attacker must be given for its power to reach `target`, or
 * `undefined` when it already reaches it.
 *
 * Asked of the attacker rather than derived by dividing the deficit by 1000,
 * because a `[DON!! xN]` clause makes the first DON!! worth more than its own
 * 1000: it switches the card's printed text on. Each candidate count is priced
 * by moving that many DON!! onto the card and re-reading `currentPower` under
 * the same simulated `activeAttack` the offer itself is priced under, so a
 * "while attacking" layer is in the answer too. The state is restored exactly,
 * and the walk is bounded by the attacker's own active DON!! pool.
 *
 * Past that pool there is nothing left to simulate, so a target no attachment
 * can reach is reported as everything available plus the remaining deficit at
 * 1000 each. That half is still division, and it is a floor rather than a
 * promise for the same reason the old whole-answer was: a gate that opens later
 * can only make the true cost smaller.
 */
function donNeededToReach(
  state: GameState,
  playerId: PlayerId,
  attackerInstanceId: string,
  targetInstanceId: string,
  attackPower: number,
  targets: { readonly board: number; readonly effective: number },
  db: CardDatabase,
): { board: number | undefined; effective: number | undefined } {
  const divided = (target: number, from: number, spent: number): number =>
    spent + Math.ceil((target - from) / 1000);
  const answer = (
    target: number,
    reached: number | undefined,
    at: number,
    spent: number,
  ) =>
    attackPower >= target ? undefined : (reached ?? divided(target, at, spent));
  const player = state.players[playerId];
  const isLeader = attackerInstanceId === leaderInstanceId(playerId);
  const card = isLeader
    ? undefined
    : player.board.find(
        (candidate) => candidate.instanceId === attackerInstanceId,
      );
  // Neither the Leader nor a Character on the board: nothing to attach to, so
  // there is no simulation to run and no gate that could open.
  if (!isLeader && !card) {
    return {
      board: answer(targets.board, undefined, attackPower, 0),
      effective: answer(targets.effective, undefined, attackPower, 0),
    };
  }
  // Nothing to price at all: the attack already clears the harder of the two.
  if (attackPower >= targets.effective && attackPower >= targets.board) {
    return { board: undefined, effective: undefined };
  }

  const activeBefore = [...player.activeDon];
  const attachedBefore = isLeader
    ? [...player.leaderAttachedDon]
    : card?.attachedDon
      ? [...card.attachedDon]
      : undefined;
  const attackBefore = state.activeAttack;
  state.activeAttack = {
    attackerPlayerId: playerId,
    defenderPlayerId: opponentOf(playerId),
    attackerInstanceId,
    targetInstanceId,
    battleAttackBonus: 0,
    counterPower: 0,
  };
  // One walk answers both thresholds: power only rises as DON!! go on, so the
  // first count that clears the lower number is its answer and the walk carries
  // on for the higher one.
  let reachedBoard: number | undefined;
  let reachedEffective: number | undefined;
  let power = attackPower;
  let spent = 0;
  try {
    for (let given = 1; given <= activeBefore.length; given += 1) {
      const moved = player.activeDon.pop();
      if (moved === undefined) break;
      if (isLeader) player.leaderAttachedDon.push(moved);
      else card!.attachedDon = [...(card!.attachedDon ?? []), moved];
      power = currentPower(state, playerId, attackerInstanceId, true, db);
      spent = given;
      if (reachedBoard === undefined && power >= targets.board) {
        reachedBoard = given;
      }
      if (reachedEffective === undefined && power >= targets.effective) {
        reachedEffective = given;
      }
      if (reachedBoard !== undefined && reachedEffective !== undefined) break;
    }
  } finally {
    state.activeAttack = attackBefore;
    player.activeDon.length = 0;
    player.activeDon.push(...activeBefore);
    if (isLeader) {
      player.leaderAttachedDon.length = 0;
      player.leaderAttachedDon.push(...attachedBefore!);
    } else if (attachedBefore === undefined) delete card!.attachedDon;
    else card!.attachedDon = attachedBefore;
  }
  return {
    board: answer(targets.board, reachedBoard, power, spent),
    effective: answer(targets.effective, reachedEffective, power, spent),
  };
}

/**
 * What declaring this attack now leaves behind, for an attack that already
 * connects.
 *
 * `donToReach` covers the other half -- an attack short of its target says how
 * many DON!! would carry it there -- but it is defined only while the attack
 * fails, so the succeeding attack said nothing at all about the DON!! still in
 * the cost area. That is the case where the mistake is expensive rather than
 * merely wasteful: a caller pours every DON!! into the one swing the defender
 * already cannot answer while its other attackers sit a Counter point short,
 * and every line reads as reasonable on its own because each states only its
 * own arithmetic. Naming the leftover, and what one more DON!! would cost the
 * defender, is what makes the alternative visible from the line itself.
 */
function unspentDonNote(
  activeDon: number,
  attackPower: number,
  targetPower: number,
): string {
  if (activeDon === 0) return "";
  return `; declaring now leaves ${activeDon} active DON!! unspent, and each one given to this attacker first raises the requirement by 1000, to ${counterShortfall(attackPower + activeDon * 1000, targetPower)} if all ${activeDon} go here -- DON!! spread over other attackers raises theirs instead`;
}

export function attackOffers(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase,
): LegalAction[] {
  const player = state.players[playerId];
  const opponent = state.players[opponentOf(playerId)];
  const actions: LegalAction[] = [];
  if (state.turn > 2) {
    const attackers = [
      ...(canAttack(state, playerId, leaderInstanceId(playerId), db)
        ? [leaderInstanceId(playerId)]
        : []),
      ...player.board
        .filter((card) => canAttack(state, playerId, card.instanceId, db))
        .map((card) => card.instanceId),
    ];
    const restedTargets = [
      leaderInstanceId(opponentOf(playerId)),
      ...opponent.board
        .filter((card) => card.rested)
        .map((card) => card.instanceId),
    ];
    // "[printed text omitted -- pnpm card:text <card>]" (OP11-010, 014,
    // 082, 084, 119). Ordinarily only a rested Character is a legal target, so
    // the grant is read per *attacker* rather than per player: two attackers on
    // the same board can have different target lists.
    const activeTargets = opponent.board
      .filter((card) => !card.rested)
      .map((card) => card.instanceId);
    for (const attackerInstanceId of attackers) {
      const attacker = player.board.find(
        (card) => card.instanceId === attackerInstanceId,
      );
      const attacksActive =
        attackerInstanceId === leaderInstanceId(playerId)
          ? (player.leaderAttacksActiveUntilTurn ?? -1) >= state.turn
          : (attacker?.attacksActiveUntilTurn ?? -1) >= state.turn ||
            (attacker !== undefined &&
              // OP06-110 Nekomamushi prints the permission as its own
              // continuous text rather than being handed it for a turn, so
              // the flag above can never be set for it.
              attacksActiveCharacters(state, playerId, attacker, db));
      const targets = attacksActive
        ? [...restedTargets, ...activeTargets]
        : restedTargets;
      const characterRushOnly =
        attacker?.playedTurn === state.turn &&
        !hasRush(state, playerId, attacker, db) &&
        hasRushCharacter(state, playerId, attacker, db);
      // "…this Leader cannot attack your opponent's Characters with a base
      // cost of N or less during this turn" -- OP12-020 Roronoa Zoro pays this
      // for setting itself active. Read off the player rather than a
      // card-number key, so any Leader printing the clause is covered by the
      // one reading; `restrict-player` is what writes it.
      const leaderAttackCeiling =
        attackerInstanceId === leaderInstanceId(playerId) &&
        (player.leaderCannotAttackCharactersUntilTurn ?? -1) >= state.turn
          ? (player.leaderCannotAttackCharactersMaxBaseCost ?? 0)
          : undefined;
      // OP17-044 Captain John: "[printed text omitted -- pnpm card:text OP17-044]" A taunt: unlike
      // `leaderAttackCeiling`, the Leader itself becomes illegal to attack too --
      // only a rested Captain John is a legal target while it holds. Every
      // rested copy is: each one's taunt names itself, so two of them leave the
      // attacker a choice between them (Bandai's OP-17 Q&A).
      const captainJohns = new Set(
        opponent.board
          .filter((card) => card.cardNumber === "OP17-044" && card.rested)
          .map((card) => card.instanceId),
      );
      const captainJohnTaunt =
        captainJohns.size > 0 &&
        hasCardType(opponent.leaderCardNumber, "Rocks Pirates");
      // "…you cannot attack a Leader during this turn" -- OP06-026 Koushirou's
      // price for setting one of its own Characters active. On the player, so
      // it closes the target for every attacker rather than for the card that
      // paid; `restrict-player` writes it.
      const leadersBarred =
        (player.cannotAttackLeadersUntilTurn ?? -1) >= state.turn;
      for (const targetInstanceId of targets.filter((target) => {
        if (
          leadersBarred &&
          target === leaderInstanceId(opponentOf(playerId))
        ) {
          return false;
        }
        if (captainJohnTaunt) return captainJohns.has(target);
        if (
          characterRushOnly &&
          target === leaderInstanceId(opponentOf(playerId))
        ) {
          return false;
        }
        if (
          leaderAttackCeiling === undefined ||
          target === leaderInstanceId(opponentOf(playerId))
        ) {
          return true;
        }
        const targetCard = opponent.board.find(
          (card) => card.instanceId === target,
        );
        return Boolean(
          targetCard &&
          (db.require(targetCard.cardNumber).cost ?? 0) > leaderAttackCeiling,
        );
      })) {
        const defenderPlayerId = opponentOf(playerId);
        /**
         * The declaration arithmetic, stated before the attack is declared.
         *
         * `attackPower` is what the attacker would swing for the moment it is
         * declared, so it is the number the decision actually turns on -- and
         * `unspentActiveDon` is what would be thrown away by declaring now,
         * since DON!! given after declaration cannot raise a live attack. It is
         * a forecast, not a promise: the battle re-reads the attacker at every
         * step, so an `[On Your Opponent's Attack]` debuff can still move it.
         *
         * `attackerIsBlocker` is the same warning for the defensive half of the
         * trade: declaring rests the attacker, and a rested card cannot block.
         *
         * `attackerIsLeader` is the opposite signal: a Leader can never block
         * and is a legal attack target whether rested or active, so declaring
         * with it rests nothing that was ever going to matter. A run held the
         * Leader back from a sure-fail swing at OP11-041's 7000 effective
         * defense on the theory that resting it cost something -- it did not,
         * and passing only gave up the free chance the defender lacked the
         * card to pay for the ability, or simply misplayed.
         *
         * A "while attacking" static ability (e.g. OP16-055) reads
         * `state.activeAttack` to know this card is the one under attack, so it
         * is simulated here too -- otherwise the preview would understate an
         * attack that only becomes accurate once actually declared.
         */
        state.activeAttack = {
          attackerPlayerId: playerId,
          defenderPlayerId,
          attackerInstanceId,
          targetInstanceId,
          battleAttackBonus: 0,
          counterPower: 0,
        };
        const attackPower = currentPower(
          state,
          playerId,
          attackerInstanceId,
          true,
          db,
        );
        state.activeAttack = null;
        const targetPower = currentPower(
          state,
          defenderPlayerId,
          targetInstanceId,
          false,
          db,
        );
        const attackerCard = player.board.find(
          (card) => card.instanceId === attackerInstanceId,
        );
        const attackerIsBlocker = Boolean(
          attackerCard && canBlock(state, playerId, attackerCard, db),
        );
        const attackerIsLeader =
          attackerInstanceId === leaderInstanceId(playerId);
        const pendingDefense = pendingDefenseBoost(
          state,
          defenderPlayerId,
          targetInstanceId,
          attackerInstanceId,
        );
        const pendingTotal = pendingDefense.battle + pendingDefense.turn;
        const effectiveTargetPower = targetPower + pendingTotal;
        // What a *later* attack this turn would meet: only the turn-scoped half
        // of the boost survives this battle.
        const laterTargetPower = targetPower + pendingDefense.turn;
        // What it would take to make a failing attack worth declaring: policies
        // were told an attack achieves nothing (`counterShortfall === 0`)
        // without being told it was one DON!! away from achieving something.
        // The attacker wins ties, so reaching the number is hitting it.
        //
        // Asked of the attacker rather than by dividing the deficit by 1000. A
        // given DON!! is worth 1000 power to most bodies and far more than that
        // to one whose text is gated behind having any: OP16-034
        // Monkey.D.Luffy is a 0-power body until one DON!! turns on "+1000 for
        // every Character you have with a different card name", so the first
        // DON!! onto it can be worth 3000 and the division prices it at 1000.
        // Every such body was quoted a cost that no attachment could ever meet,
        // which is the shape of mispricing that talks a caller out of a
        // conversion it can afford: the arithmetic said five DON!! for a lift
        // that three would buy.
        const donNeeded = donNeededToReach(
          state,
          playerId,
          attackerInstanceId,
          targetInstanceId,
          attackPower,
          { board: targetPower, effective: effectiveTargetPower },
          db,
        );
        const donToReach = donNeeded.effective;
        // The same count against the board as it stands, before an unpaid
        // ability is priced in. Both are needed because they answer different
        // questions. Spending DON!! only to clear `effectiveTargetPower` --
        // refusing to buy a lift the defender could turn away -- is badly
        // wrong against a Leader like ST34 Katakuri, whose
        // boost costs a card: making the defender pay it is worth
        // more than the swing is worth holding back. So a caller deciding
        // whether a lift is affordable reads this, and `donToReach` stays the
        // honest answer to "what does it take to beat everything they hold".
        const donToWinBattle = donNeeded.board;
        actions.push({
          actionId: `r${state.revision}:attack:${attackerInstanceId}:${targetInstanceId}`,
          type: "attack",
          attackerInstanceId,
          targetInstanceId,
          attackPower,
          targetPower,
          effectiveTargetPower,
          counterShortfall: counterShortfall(attackPower, targetPower),
          ...(donToReach === undefined ? {} : { donToReach }),
          ...(donToWinBattle === undefined ? {} : { donToWinBattle }),
          unspentActiveDon: player.activeDon.length,
          attackerIsBlocker,
          attackerIsLeader,
          summary: `Attack ${actionCardLabel(state, defenderPlayerId, targetInstanceId, false, db)} with ${actionCardLabel(state, playerId, attackerInstanceId, true, db)} (${battleForecast(attackPower, targetPower, battleStake(state, defenderPlayerId, targetInstanceId, { playerId, instanceId: attackerInstanceId }, db))}${pendingTotal > 0 ? `; the defender still holds an unused once-per-turn ability that raises this target to ${effectiveTargetPower}, so ${counterShortfall(attackPower, effectiveTargetPower) === 0 ? "this attack fails outright once it is paid, and paying it costs the defender only 1 card" : `the real requirement is ${counterShortfall(attackPower, effectiveTargetPower)} Counter power${pendingDefense.turn > 0 ? ` and every later attack this turn meets ${laterTargetPower} too` : ", though that ability only lasts for this battle"}`}` : ""}${attackerIsBlocker ? "; declaring rests this Blocker, so it cannot block on the opponent's next turn" : ""}${attackerIsLeader ? "; the Leader can never block and is a legal target whether rested or active, so declaring here costs nothing beyond the attack itself" : ""}${donToReach === undefined ? unspentDonNote(player.activeDon.length, attackPower, targetPower) : donToReach <= player.activeDon.length ? `; giving this attacker ${donToReach} of your ${player.activeDon.length} active DON!! first would raise it into range` : `; no amount of your ${player.activeDon.length} active DON!! reaches this target, which needs ${donToReach}`})`,
        });
      }
    }
  }
  return actions;
}
