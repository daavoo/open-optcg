/**
 * `attack`: Declare an attack: open the battle, then the reaction and Block windows.
 *
 * One of the eleven handlers `applyAction` dispatches to; see
 * `actions/index.ts` for the table and the contract they share.
 */
import {
  dispatchMechanicInvocations,
  whenRestedInvocation,
} from "../card-mechanics.js";
import { fieldDonCount } from "../don.js";
import { mechanicPendingEffect } from "../effects.js";
import {
  eligibleWhenAttackingProgram,
  offerAttackReactions,
} from "../battle.js";
import { effectiveBoardCost, leaderInstanceId, opponentOf } from "../board.js";
import { type CardInstance } from "../model.js";
import { handOverPendingEffect } from "../pending.js";
import { battleAttackPower } from "../queries.js";
import { effectsNegated } from "../static-abilities.js";
import { type ActionContext } from "./context.js";

export function applyAttack({
  state,
  events,
  activePlayer,
  offered,
  db,
}: ActionContext<"attack">): void {
  const defenderPlayerId = opponentOf(activePlayer);
  const attackingCharacter = state.players[activePlayer].board.find(
    (card) => card.instanceId === offered.attackerInstanceId,
  );
  if (offered.attackerInstanceId === leaderInstanceId(activePlayer)) {
    state.players[activePlayer].leaderRested = true;
  } else if (attackingCharacter) {
    attackingCharacter.rested = true;
  }
  // A negated card still attacks -- attacking is not an ability -- but none of
  // the attack-time clauses below are its to use any more. Dropping the
  // reference is how every branch in the chain honours that at once. A Leader is
  // negated under its own synthetic instance id (OP09-093 Marshall.D.Teach is
  // the only card in the format that does it), so the same read answers both
  // seats: OP17-039/099 are the two Leaders that print a `[When Attacking]` to
  // lose.
  const attackerCard: CardInstance | undefined = effectsNegated(
    state,
    offered.attackerInstanceId,
  )
    ? undefined
    : offered.attackerInstanceId === leaderInstanceId(activePlayer)
      ? {
          instanceId: offered.attackerInstanceId,
          cardNumber: state.players[activePlayer].leaderCardNumber,
        }
      : attackingCharacter;
  // The declared power is read only after `state.activeAttack` is live: a
  // "while attacking" static ability (e.g. OP16-055) reads `state.activeAttack`
  // to know it is the one attacking, and evaluating the power before this
  // assignment would run it against the pre-declaration (null) value instead.
  state.activeAttack = {
    attackerPlayerId: activePlayer,
    defenderPlayerId,
    attackerInstanceId: offered.attackerInstanceId,
    targetInstanceId: offered.targetInstanceId,
    battleAttackBonus: 0,
    counterPower: 0,
    defenderLeaderDonAtDeclaration:
      state.players[defenderPlayerId].leaderAttachedDon.length,
  };
  events.push({
    type: "attack-declared",
    playerId: activePlayer,
    attackerInstanceId: offered.attackerInstanceId,
    targetInstanceId: offered.targetInstanceId,
    power: battleAttackPower(state, db),
  });
  const reduction =
    attackerCard?.cardNumber === "OP11-009" &&
    (attackingCharacter?.attachedDon?.length ?? 0) >= 2
      ? { amount: -2000, expiresAtTurn: state.turn + 1 }
      : attackerCard?.cardNumber === "OP14-015"
        ? { amount: -1000, expiresAtTurn: state.turn }
        : null;
  // OP08-043 Edward.Newgate's toll: "…none of the selected Characters can
  // attack unless your opponent trashes N cards from their hand whenever they
  // attack". `canAttack` has already refused the declaration if the hand is too
  // small, so the price is payable by the time this runs and the only question
  // left is which cards go.
  //
  // Charged in the same window a `[When Attacking]` clause resolves in, and
  // queued *ahead* of it so the cost is paid before the attacker's own text
  // pays out. The six card-number branches below it are not composed with the
  // toll -- they are the imperative attack-time tail in
  // `LEGACY_IMPERATIVE_CARDS`, and a taxed attacker that is also one of them
  // skips its own clause. That retires when those cards move onto the registry.
  const taxedAttacker =
    attackingCharacter &&
    (attackingCharacter.attackTaxUntilTurn ?? -1) >= state.turn
      ? attackingCharacter
      : undefined;
  if (taxedAttacker) {
    const cost = taxedAttacker.attackTaxHandCards ?? 1;
    const whenAttacking = attackerCard
      ? eligibleWhenAttackingProgram(state, activePlayer, attackerCard)
      : undefined;
    const dispatched = dispatchMechanicInvocations(
      state,
      [
        {
          context: {
            sourcePlayerId: activePlayer,
            source: {
              instanceId: taxedAttacker.instanceId,
              cardNumber: taxedAttacker.cardNumber,
            },
          },
          program: {
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "attack-tax",
              min: cost,
              max: cost,
              effect: {
                kind: "move",
                binding: "attack-tax",
                to: { player: "self", zone: "trash" },
              },
            },
          },
        },
        ...(whenAttacking && attackerCard
          ? [
              {
                context: {
                  sourcePlayerId: activePlayer,
                  source: attackerCard,
                },
                program: whenAttacking.program.program,
              },
            ]
          : []),
      ],
      db,
    );
    events.push(...dispatched.events);
    if (dispatched.pending && dispatched.invocation) {
      state.pendingEffect = mechanicPendingEffect(
        dispatched.invocation,
        dispatched.pending,
        dispatched.continuations,
      );
      state.pendingEffectResume = {
        phase: "block",
        playerId: defenderPlayerId,
      };
      state.phase = "main";
      state.activePlayer = activePlayer;
    }
    if (whenAttacking?.program.oncePerTurn) {
      state.oncePerTurn.push(whenAttacking.oncePerTurnKey);
    }
  } else if (attackerCard?.cardNumber === "ST33-002") {
    const attackingPlayer = state.players[activePlayer];
    if (attackingPlayer.hand.length > 0) {
      state.pendingEffect = {
        kind: "navy-discard",
        playerId: activePlayer,
        sourceCardNumber: attackerCard.cardNumber,
        sourceInstanceId: attackerCard.instanceId,
        eligibleInstanceIds: attackingPlayer.hand.map(
          (card) => card.instanceId,
        ),
        remaining: 1,
        optional: true,
        after: {
          kind: "opponent-discard",
          targetPlayerId: defenderPlayerId,
        },
        resumePhase: "block",
        resumePlayerId: defenderPlayerId,
      };
      state.phase = "block";
      state.activePlayer = activePlayer;
    }
  } else if (
    (attackerCard?.cardNumber === "ST35-003" ||
      attackerCard?.cardNumber === "OP12-090") &&
    state.players[activePlayer].deck.length >= 2
  ) {
    state.pendingEffect = {
      kind: "st35-attack-cost",
      playerId: activePlayer,
      targetPlayerId: defenderPlayerId,
      sourceCardNumber: attackerCard.cardNumber,
      sourceInstanceId: attackerCard.instanceId,
      eligibleInstanceIds: state.players[defenderPlayerId].board.map(
        (card) => card.instanceId,
      ),
      resumePlayerId: defenderPlayerId,
    };
    state.phase = "block";
    state.activePlayer = activePlayer;
  } else if (
    attackerCard &&
    eligibleWhenAttackingProgram(state, activePlayer, attackerCard)
  ) {
    // [When Attacking] programs resolve before the Block window, like the
    // hardcoded attack-time effects beside them.
    const { program, oncePerTurnKey } = eligibleWhenAttackingProgram(
      state,
      activePlayer,
      attackerCard,
    )!;
    const dispatched = dispatchMechanicInvocations(
      state,
      [
        {
          context: { sourcePlayerId: activePlayer, source: attackerCard },
          program: program.program,
        },
      ],
      db,
    );
    events.push(...dispatched.events);
    if (dispatched.pending && dispatched.invocation) {
      state.pendingEffect = mechanicPendingEffect(
        dispatched.invocation,
        dispatched.pending,
        dispatched.continuations,
      );
      state.pendingEffectResume = {
        phase: "block",
        playerId: defenderPlayerId,
      };
      state.phase = "main";
      state.activePlayer = activePlayer;
      // The first question may be the defender's: P-048 Arlong
      // has them choose the card from their own hand (Bandai's P-048#1).
      handOverPendingEffect(state);
      if (program.oncePerTurn) {
        // A dual-timed card (OP17-048/058 print both this and `[On Your
        // Opponent's Attack]`) shares its budget with that table's own
        // `onOpponentAttackPending` -- the resolve-effect handler that
        // marks the key on "not skip" does not care which table dispatched
        // it. Spent on the answer that takes the offer, never the decline,
        // the same rule as that table.
        state.activeAttack.onOpponentAttackPending = {
          sourceInstanceId: attackerCard.instanceId,
          oncePerTurnKey,
        };
      }
    } else if (program.oncePerTurn) {
      // A program that resolved without asking anything has been used --
      // the same rule `offerOnOpponentAttackEffect` follows, since
      // `requires` (and `handCardsOfType`) already guarantee this dispatch
      // did something rather than silently no-op.
      state.oncePerTurn.push(oncePerTurnKey);
    }
  } else if (
    attackingCharacter &&
    attackerCard &&
    whenRestedInvocation(state, activePlayer, attackingCharacter)
  ) {
    // "[printed text omitted -- pnpm card:text <card>]" -- OP14's Green
    // package. Declaring an attack is the commonest way a Character becomes
    // rested and the only one outside the `rest` node's own signal, so it is
    // dispatched here, in the same window and with the same resume plumbing
    // `[When Attacking]` above uses. Every clause in the registry is
    // `[Your Turn]`-gated or narrower, which `whenRestedInvocation` reads.
    const dispatched = dispatchMechanicInvocations(
      state,
      [whenRestedInvocation(state, activePlayer, attackingCharacter)!],
      db,
    );
    events.push(...dispatched.events);
    if (dispatched.pending && dispatched.invocation) {
      state.pendingEffect = mechanicPendingEffect(
        dispatched.invocation,
        dispatched.pending,
        dispatched.continuations,
      );
      state.pendingEffectResume = {
        phase: "block",
        playerId: defenderPlayerId,
      };
      state.phase = "main";
      state.activePlayer = activePlayer;
      handOverPendingEffect(state);
    }
  } else if (
    attackerCard?.cardNumber === "ST34-005" &&
    fieldDonCount(state, activePlayer) > 0
  ) {
    const eligibleInstanceIds = state.players[defenderPlayerId].board
      .filter((card) => (db.require(card.cardNumber).power ?? 99_999) <= 2000)
      .map((card) => card.instanceId);
    if (eligibleInstanceIds.length > 0) {
      state.pendingEffect = {
        kind: "st34-don-minus-ko",
        playerId: activePlayer,
        targetPlayerId: defenderPlayerId,
        sourceCardNumber: attackerCard.cardNumber,
        sourceInstanceId: attackerCard.instanceId,
        eligibleInstanceIds,
        resumePhase: "block",
        resumePlayerId: defenderPlayerId,
      };
      state.phase = "block";
      state.activePlayer = activePlayer;
    }
  } else if (
    attackerCard?.cardNumber === "ST32-003" ||
    attackerCard?.cardNumber === "EB04-026"
  ) {
    const drawn = state.players[activePlayer].deck.shift();
    if (drawn) {
      state.players[activePlayer].hand.push(drawn);
      events.push({ type: "cards-drawn", playerId: activePlayer, count: 1 });
      state.pendingEffect = {
        kind: "draw-trash",
        playerId: activePlayer,
        sourceCardNumber: attackerCard.cardNumber,
        sourceInstanceId: attackerCard.instanceId,
        trashCount: 1,
        resumePhase: "block",
        resumePlayerId: defenderPlayerId,
      };
      state.phase = "block";
      state.activePlayer = activePlayer;
    }
  } else if (attackerCard?.cardNumber === "OP15-036") {
    const eligibleInstanceIds = state.players[defenderPlayerId].board
      .filter((card) => card.rested && effectiveBoardCost(state, card, db) <= 4)
      .map((card) => card.instanceId);
    if (eligibleInstanceIds.length > 0) {
      state.pendingEffect = {
        kind: "ko-character",
        playerId: activePlayer,
        targetPlayerId: defenderPlayerId,
        sourceCardNumber: attackerCard.cardNumber,
        sourceInstanceId: attackerCard.instanceId,
        eligibleInstanceIds,
        resumePhase: "block",
        resumePlayerId: defenderPlayerId,
      };
      state.phase = "block";
      state.activePlayer = activePlayer;
    }
  } else if (reduction && state.players[defenderPlayerId].board.length > 0) {
    state.pendingEffect = {
      kind: "reduce-power",
      playerId: activePlayer,
      targetPlayerId: defenderPlayerId,
      sourceCardNumber: attackerCard!.cardNumber,
      sourceInstanceId: attackerCard!.instanceId,
      amount: reduction.amount,
      expiresAtTurn: reduction.expiresAtTurn,
      remaining: 1,
      resumePhase: "block",
      resumePlayerId: defenderPlayerId,
    };
    state.phase = "block";
    state.activePlayer = activePlayer;
  }
  if (!state.pendingEffect) {
    if (!offerAttackReactions(state, events)) {
      state.phase = "block";
      state.activePlayer = defenderPlayerId;
    }
  }
}
