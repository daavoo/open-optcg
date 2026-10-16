/**
 * Battle: the reactions an attack offers, and resolving one.
 *
 * Split out of `engine.ts` so the action handlers can reach it without
 * importing the module that dispatches them; see `board.ts`.
 *
 * The Leader-specific offers here -- Nami's and Katakuri's -- are cards that
 * predate the mechanic DSL, kept together rather than scattered so that the
 * work of migrating them to `mechanics/` has one place to start.
 */
import {
  cards as defaultCardDatabase,
  hasCardType,
  type CardDatabase,
} from "@one-piece-sim/cards";
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import {
  dispatchMechanicInvocations,
  getLeaderWatcherProgram,
  getMechanicSignalInvocations,
  getOnOpponentAttackProgram,
  getWhenAttackingMechanicProgram,
} from "./card-mechanics.js";
import { rosinanteLifeProtectionAvailable } from "./removal.js";
import { registeredReplacementOptions } from "./mechanics-replacements.js";
import {
  effectsNegated,
  leaderEffectsNegated,
  survivesBattleKo,
} from "./static-abilities.js";
import { fieldDonCount } from "./don.js";
import { bankDamagedLifeCard } from "./life.js";
import {
  battleParticipant,
  conditionMatches,
  leaderBattledCharacterKey,
  programBattlePower,
  programRedirectSelectors,
  programUsesBattlePower,
  selectCards,
  type BattleParticipant,
  type MechanicProgram,
} from "./mechanics.js";
import { battleAttackPower, currentPower } from "./queries.js";
import { mechanicPendingEffect, createOnKoResult } from "./effects.js";
import type {
  ActiveAttack,
  CardInstance,
  GameState,
  PendingEffect,
} from "./model.js";
import {
  leaderInstanceId,
  hasKeyword,
  offerBuggyBlockerEffect,
  handHasType,
  handHasCategory,
  restLocked,
} from "./board.js";

import { opensTriggerWindow, resumeMainAfterBattle } from "./pending.js";

/**
 * Power the target can still gain without spending a Counter, split by how long
 * it lasts.
 *
 * A defensive Leader ability the opponent has not paid for yet is invisible in
 * `currentPower`, so `counterShortfall` reports an attack as a hit that the
 * ability alone turns away. An LLM run lost to exactly that: six attacks
 * declared into the 5000-7000 band against an OP11-041 Leader that defended the
 * whole turn at 7000, every one of them reported as a hit needing 1 to 2000
 * Counter, none of them connecting.
 *
 * The two abilities differ in duration, which decides what the *next* attack
 * this turn meets: OP11-041 Nami's +2000 is printed "during this turn" and
 * OP11-062 Katakuri's +1000 "during this battle". Reporting them as one number
 * made a second attack look as expensive as the first when only Katakuri was up.
 *
 * The predicates are the same ones `offerNamiLeaderEffect` and
 * `offerKatakuriLeaderEffect` gate on, so the forecast cannot drift from the
 * ability the engine will actually offer.
 */
export function pendingDefenseBoost(
  state: GameState,
  defenderPlayerId: PlayerId,
  targetInstanceId: string,
  attackerInstanceId?: string,
): { battle: number; turn: number } {
  const registry = onOpponentAttackBoost(
    state,
    defenderPlayerId,
    targetInstanceId,
    attackerInstanceId,
  );
  // Both hardcoded abilities raise the Leader only; a Character target gains
  // nothing from them. The registry sources are asked per target.
  if (targetInstanceId !== leaderInstanceId(defenderPlayerId)) {
    return { battle: registry, turn: 0 };
  }
  return {
    battle:
      (katakuriLeaderEffectAvailable(state, defenderPlayerId) ? 1000 : 0) +
      registry,
    turn: namiLeaderDefenseAvailable(state, defenderPlayerId) ? 2000 : 0,
  };
}

/**
 * Battle power the defender's `[On Your Opponent's Attack]` sources could still
 * add to a battle against `targetInstanceId`.
 *
 * Summed over every eligible source, because they are cumulative: a defender
 * holding King and Black Maria may pay for both in one battle. The amount is
 * read out of each program rather than restated here, so the forecast cannot
 * promise power the resolution will not add -- the same discipline
 * `counterEventPower` keeps with `CounterEventProgram.appliesWhen`.
 *
 * Called while deciding whether to declare an attack, so the battle it asks
 * about may not exist yet: the target is described from the arguments.
 */
export function onOpponentAttackBoost(
  state: GameState,
  defenderPlayerId: PlayerId,
  targetInstanceId: string,
  attackerInstanceId?: string,
): number {
  const participant = prospectiveBattleTarget(
    state,
    defenderPlayerId,
    targetInstanceId,
  );
  if (!participant) return 0;
  const attacker =
    attackerInstanceId === undefined
      ? null
      : prospectiveBattleTarget(
          state,
          defenderPlayerId === "p1" ? "p2" : "p1",
          attackerInstanceId,
        );
  // No battle has been declared yet, so nothing has been offered yet either.
  return onOpponentAttackSources(
    state,
    defenderPlayerId,
    participant,
    [],
    attacker,
  ).reduce(
    (total, entry) =>
      total +
      defensiveBattlePower(entry.program.program, participant, attacker),
    0,
  );
}

/**
 * What a defender's battle-scoped program is worth to the card being attacked:
 * power it adds to that card, plus power it takes off the attacker.
 *
 * The two are one number to the battle -- the attacker wins on its power
 * reaching the target's -- and OP13-002 Portgas.D.Ace's Leader is the clause
 * that needs the second half: "−2000 power during this battle" lands on the
 * attacker's side of the ledger, so a reading of the defender's side alone
 * would call it a prompt with nothing behind it. `attacker` is `null` when it
 * is not known, which counts the debuff as reaching nothing.
 */
function defensiveBattlePower(
  program: MechanicProgram,
  target: BattleParticipant,
  attacker: BattleParticipant | null,
): number {
  return (
    programBattlePower(program, "self", target) -
    (attacker ? programBattlePower(program, "opponent", attacker) : 0)
  );
}

/** `targetInstanceId` described as the card a battle-scoped buff would land on. */
export function prospectiveBattleTarget(
  state: GameState,
  defenderPlayerId: PlayerId,
  targetInstanceId: string,
): BattleParticipant | null {
  if (targetInstanceId === leaderInstanceId(defenderPlayerId)) {
    return {
      instanceId: targetInstanceId,
      cardNumber: state.players[defenderPlayerId].leaderCardNumber,
      isLeader: true,
    };
  }
  const card = state.players[defenderPlayerId].board.find(
    (candidate) => candidate.instanceId === targetInstanceId,
  );
  if (!card) return null;
  return {
    instanceId: targetInstanceId,
    cardNumber: card.cardNumber,
    isLeader: false,
  };
}

/**
 * Ends a battle whose target, or whose attacker, has left the field.
 *
 * An attack can outlive its target: a replacement effect, a bounce or a K.O.
 * resolved during the block or counter step can remove the very Character the
 * attack is pointed at. Nothing else notices, and both `resolveBattle` and
 * `observe` then ask `currentPower` for a card that is no longer on the board
 * and throw `MISSING_CARD`.
 *
 * Reachable in ordinary play: OP15-052 Leo answers a K.O. by placing one of its
 * controller's Characters at the bottom of the deck instead, and the Character
 * it gives up may be the one currently being attacked.
 *
 * The attack simply ends -- no damage, no K.O., attacker stays rested. Deferred
 * while an effect is still pending, because that effect owns the phase and the
 * active player until it resolves, and the check runs again after it does.
 */
export function endBattleIfTargetLeftField(state: GameState): void {
  const attack = state.activeAttack;
  // A pending Trigger owns the phase for the same reason a pending effect does,
  // and ending the battle under one would drop the card the window is holding.
  if (!attack || state.pendingEffect || state.pendingTrigger) return;
  // The attacker leaving ends the battle the same way: OP13-053
  // Marshall.D.Teach can trash itself as its own [When Attacking] cost, and
  // Bandai's OP-13 Q&A (OP13-053#1) ends that battle once the Attack Step is
  // over, with no Block or Counter Step for the defender.
  const attackerOnField =
    attack.attackerInstanceId === leaderInstanceId(attack.attackerPlayerId) ||
    state.players[attack.attackerPlayerId].board.some(
      (card) => card.instanceId === attack.attackerInstanceId,
    );
  const targetOnField =
    attack.targetInstanceId === leaderInstanceId(attack.defenderPlayerId) ||
    state.players[attack.defenderPlayerId].board.some(
      (card) => card.instanceId === attack.targetInstanceId,
    );
  if (!attackerOnField || !targetOnField) resumeMainAfterBattle(state);
}

/**
 * OP11-041 Nami's defensive Leader ability.
 *
 * `[DON!! x1] [On Your Opponent's Attack] [Once Per Turn] You may trash 1 card
 * from your hand: This Leader gains +2000 power during this turn.`
 *
 * Defender-only, unlike Katakuri's, which either side may use. `[DON!! xN]`
 * counts DON!! *attached to the card*, not DON!! on the field, so this reads
 * `leaderAttachedDon` rather than `fieldDonCount` -- the deck deliberately
 * gives its Leader rested DON!! (EB03-053 Nami, OP13-054 Yamato, P-096 Girl,
 * OP13-042 Newgate all do) and that attachment is what switches the ability on.
 */
export function namiLeaderDefenseAvailable(
  state: GameState,
  defenderPlayerId: PlayerId,
): boolean {
  const defender = state.players[defenderPlayerId];
  // Met both when the attack was declared, which is when the ability
  // triggers, and still now, when it resolves.
  const donAtDeclaration =
    state.activeAttack?.defenderLeaderDonAtDeclaration ??
    defender.leaderAttachedDon.length;
  return (
    defender.leaderCardNumber === "OP11-041" &&
    !leaderEffectsNegated(state, defenderPlayerId) &&
    donAtDeclaration >= 1 &&
    defender.leaderAttachedDon.length >= 1 &&
    defender.hand.length > 0 &&
    !state.oncePerTurn.includes(
      `${state.turn}:${defenderPlayerId}:OP11-041-def`,
    )
  );
}

export function offerNamiLeaderEffect(state: GameState): boolean {
  const attack = state.activeAttack;
  if (!attack) return false;
  const defenderPlayerId = attack.defenderPlayerId;
  const defender = state.players[defenderPlayerId];
  if (!namiLeaderDefenseAvailable(state, defenderPlayerId)) return false;
  state.pendingEffect = {
    kind: "nami-leader",
    playerId: defenderPlayerId,
    sourceCardNumber: "OP11-041",
    sourceInstanceId: leaderInstanceId(defenderPlayerId),
    eligibleInstanceIds: defender.hand.map((card) => card.instanceId),
    resumePhase: "block",
    resumePlayerId: defenderPlayerId,
  };
  state.phase = "block";
  state.activePlayer = defenderPlayerId;
  return true;
}

export function katakuriLeaderEffectAvailable(
  state: GameState,
  playerId: PlayerId,
): boolean {
  return (
    state.players[playerId].leaderCardNumber === "OP11-062" &&
    !leaderEffectsNegated(state, playerId) &&
    fieldDonCount(state, playerId) > 0 &&
    !state.oncePerTurn.includes(`${state.turn}:${playerId}:OP11-062`)
  );
}

export function offerKatakuriLeaderEffect(
  state: GameState,
  allowAttacker = true,
): boolean {
  const attack = state.activeAttack;
  if (!attack) return false;
  const attackerPlayerId = attack.attackerPlayerId;
  const defenderPlayerId = attack.defenderPlayerId;
  const attackerUsesKatakuri =
    allowAttacker &&
    attack.attackerInstanceId === leaderInstanceId(attackerPlayerId) &&
    katakuriLeaderEffectAvailable(state, attackerPlayerId);
  const defenderUsesKatakuri = katakuriLeaderEffectAvailable(
    state,
    defenderPlayerId,
  );
  if (!attackerUsesKatakuri && !defenderUsesKatakuri) return false;
  const effectPlayerId = attackerUsesKatakuri
    ? attackerPlayerId
    : defenderPlayerId;
  state.pendingEffect = {
    kind: "katakuri-leader",
    playerId: effectPlayerId,
    sourceCardNumber: "OP11-062",
    sourceInstanceId: leaderInstanceId(effectPlayerId),
    resumePhase: "block",
    resumePlayerId: defenderPlayerId,
  };
  state.phase = "block";
  state.activePlayer = effectPlayerId;
  return true;
}

/**
 * The defender's `[On Your Opponent's Attack]` sources that could still act in
 * this battle, in offer order.
 *
 * The Stage is scanned alongside the board and the Leader because a Stage can
 * carry the clause -- OP17-057 Fullalead does, and it pays its cost by resting
 * itself, so a rested Stage is not a source.
 */
export function onOpponentAttackSources(
  state: GameState,
  defenderPlayerId: PlayerId,
  target: BattleParticipant | null,
  offered: readonly string[],
  attacker: BattleParticipant | null,
): {
  source: CardInstance;
  program: NonNullable<ReturnType<typeof getOnOpponentAttackProgram>>;
  oncePerTurnKey: string;
}[] {
  const defender = state.players[defenderPlayerId];
  const candidates: { source: CardInstance; active: boolean }[] = [
    {
      source: {
        instanceId: leaderInstanceId(defenderPlayerId),
        cardNumber: defender.leaderCardNumber,
      },
      active: true,
    },
    // "Active" here means "can pay a cost by resting": a "cannot be rested"
    // effect takes that away from an active card too.
    ...defender.board.map((card) => ({
      source: card,
      active: !card.rested && !restLocked(state, card),
    })),
    ...(defender.stage
      ? [{ source: defender.stage, active: !defender.stage.rested }]
      : []),
  ];
  return candidates.flatMap(({ source, active }) => {
    const program = getOnOpponentAttackProgram(source.cardNumber);
    if (!program) return [];
    if (offered.includes(source.instanceId)) return [];
    if (effectsNegated(state, source.instanceId)) return [];
    const oncePerTurnKey = `${state.turn}:${defenderPlayerId}:${source.instanceId}:on-opponent-attack`;
    if (program.oncePerTurn && state.oncePerTurn.includes(oncePerTurnKey)) {
      return [];
    }
    // An offer whose power cannot reach the card being attacked is a prompt with
    // nothing behind it: OP17-014 Whitey Bay raises "up to 1 of your Leaders",
    // and trashing itself while a Character blocks buys nothing at all. The gate
    // reads the same walk `pendingDefenseBoost` forecasts with, so the attacker's
    // arithmetic and the defender's options cannot disagree.
    if (
      programUsesBattlePower(program.program) &&
      (!target || defensiveBattlePower(program.program, target, attacker) === 0)
    ) {
      return [];
    }
    // The redirect counterpart of the gate above. OP16-080 and OP14-060 both
    // let the defender name their own Leader, so an attack already aimed at it
    // leaves the offer with nothing but the card it is standing on -- and the
    // rules policy happily paid a Trigger card from hand to redirect the attack
    // onto the card it was already hitting. `excludeAttackTarget` drops that
    // choice from the selector; this stops the prompt from appearing when it is
    // the only choice there was.
    const redirectSelectors = programRedirectSelectors(program.program);
    if (
      redirectSelectors.length > 0 &&
      redirectSelectors.every(
        (selector) =>
          selectCards(
            state,
            { sourcePlayerId: defenderPlayerId, source },
            selector,
            {},
          ).length === 0,
      )
    ) {
      return [];
    }
    const requires = program.requires;
    if (requires) {
      if (
        requires.handCards !== undefined &&
        defender.hand.length < requires.handCards
      ) {
        return [];
      }
      if (
        requires.fieldDon !== undefined &&
        fieldDonCount(state, defenderPlayerId) < requires.fieldDon
      ) {
        return [];
      }
      if (
        requires.activeDon !== undefined &&
        defender.activeDon.length < requires.activeDon
      ) {
        return [];
      }
      if (requires.sourceActive && !active) return [];
      if (
        requires.handCardsOfType !== undefined &&
        !handHasType(defender, requires.handCardsOfType)
      ) {
        return [];
      }
      if (
        requires.handCardsOfCategory !== undefined &&
        !handHasCategory(defender, requires.handCardsOfCategory)
      ) {
        return [];
      }
      if (
        requires.handCardsMatching !== undefined &&
        selectCards(
          state,
          { sourcePlayerId: defenderPlayerId, source },
          {
            ...requires.handCardsMatching.match,
            player: "self",
            zone: "hand",
          },
          {},
        ).length < requires.handCardsMatching.count
      ) {
        return [];
      }
      if (
        requires.lifeCardsMatching !== undefined &&
        selectCards(
          state,
          { sourcePlayerId: defenderPlayerId, source },
          {
            ...requires.lifeCardsMatching.match,
            player: "self",
            zone: "life",
          },
          {},
        ).length < requires.lifeCardsMatching.count
      ) {
        return [];
      }
      // Two board-state gates rather than costs -- see `requires` in
      // `mechanics/types.ts`. Both are read through `conditionMatches`, so the
      // offer and the program cannot disagree about the same question.
      const context = { sourcePlayerId: defenderPlayerId, source };
      if (
        requires.everyCharacterMatches !== undefined &&
        !conditionMatches(
          state,
          context,
          {
            kind: "every-character-matches",
            player: "self",
            selector: requires.everyCharacterMatches,
          },
          {},
        )
      ) {
        return [];
      }
      if (
        requires.battleAttacker !== undefined &&
        !conditionMatches(
          state,
          context,
          {
            kind: "battle-attacker",
            filter: requires.battleAttacker.filter,
            ...(requires.battleAttacker.attribute === undefined
              ? {}
              : { attribute: requires.battleAttacker.attribute }),
          },
          {},
        )
      ) {
        return [];
      }
      if (
        requires.leaderTypeIncluding !== undefined &&
        !conditionMatches(
          state,
          context,
          {
            kind: "leader-type-including",
            player: "self",
            text: requires.leaderTypeIncluding,
          },
          {},
        )
      ) {
        return [];
      }
    }
    return [{ source, program, oncePerTurnKey }];
  });
}

/**
 * A controller's own bench sources (board + Stage) whose leader-watcher
 * ability could still react to their own Leader's involvement in this battle.
 *
 * Structurally this is `onOpponentAttackSources` with a different player
 * relationship: that scan asks the *defender* about an opponent's attack on
 * them, while this one asks a card's own controller about their own Leader,
 * regardless of which side of the attack that Leader is on. The Leader itself
 * is not a candidate -- a Leader reacting to its own attack is already
 * `whenAttackingPrograms`' territory, and nothing here prints the clause on a
 * Leader.
 */
export function leaderWatcherSources(
  state: GameState,
  controllerPlayerId: PlayerId,
  target: BattleParticipant | null,
  offered: readonly string[],
): {
  source: CardInstance;
  program: NonNullable<ReturnType<typeof getLeaderWatcherProgram>>;
  oncePerTurnKey: string;
}[] {
  const controller = state.players[controllerPlayerId];
  const candidates: CardInstance[] = [
    ...controller.board,
    ...(controller.stage ? [controller.stage] : []),
  ];
  return candidates.flatMap((source) => {
    const program = getLeaderWatcherProgram(source.cardNumber);
    if (!program) return [];
    if (offered.includes(source.instanceId)) return [];
    if (effectsNegated(state, source.instanceId)) return [];
    const oncePerTurnKey = `${state.turn}:${controllerPlayerId}:${source.instanceId}:leader-watcher`;
    if (program.oncePerTurn && state.oncePerTurn.includes(oncePerTurnKey)) {
      return [];
    }
    // Same discipline as `onOpponentAttackSources`: an offer the buff cannot
    // reach is a prompt with nothing behind it.
    if (
      programUsesBattlePower(program.program) &&
      (!target || programBattlePower(program.program, "self", target) === 0)
    ) {
      return [];
    }
    const requires = program.requires;
    if (requires) {
      if (
        requires.handCards !== undefined &&
        controller.hand.length < requires.handCards
      ) {
        return [];
      }
      if (
        requires.leaderType !== undefined &&
        !hasCardType(controller.leaderCardNumber, requires.leaderType)
      ) {
        return [];
      }
    }
    return [{ source, program, oncePerTurnKey }];
  });
}

/**
 * Offers the next leader-watcher ability still available for this battle, on
 * whichever side of the attack the watcher's own controller's Leader sits.
 *
 * A Leader attacking an undefended opponent's Leader puts both ends of the
 * clause live in the same battle, so the attacker's bench is asked first
 * (matching the order the attacker's own `[When Attacking]` effects already
 * resolve in) and the defender's bench second; each answer re-enters the
 * ladder via `offerAttackReactions`, the same re-entry `offerOnOpponentAttackEffect`
 * uses.
 */
export function offerLeaderWatcherEffect(
  state: GameState,
  events: PublicEvent[],
): boolean {
  const attack = state.activeAttack;
  if (!attack) return false;
  const offered = attack.leaderWatcherOffered ?? [];
  const attackerIsLeader =
    attack.attackerInstanceId === leaderInstanceId(attack.attackerPlayerId);
  const targetIsLeader =
    attack.targetInstanceId === leaderInstanceId(attack.defenderPlayerId);
  const attempt = (controllerPlayerId: PlayerId) => {
    const target = battleParticipant(state, controllerPlayerId);
    const [next] = leaderWatcherSources(
      state,
      controllerPlayerId,
      target,
      offered,
    );
    return next ? { controllerPlayerId, ...next } : null;
  };
  const found =
    (attackerIsLeader ? attempt(attack.attackerPlayerId) : null) ??
    (targetIsLeader ? attempt(attack.defenderPlayerId) : null);
  if (!found) return false;
  attack.leaderWatcherOffered = [...offered, found.source.instanceId];
  const dispatched = dispatchMechanicInvocations(state, [
    {
      context: {
        sourcePlayerId: found.controllerPlayerId,
        source: found.source,
      },
      program: found.program.program,
    },
  ]);
  events.push(...dispatched.events);
  state.pendingEffect =
    dispatched.pending && dispatched.invocation
      ? mechanicPendingEffect(
          dispatched.invocation,
          dispatched.pending,
          dispatched.continuations,
        )
      : null;
  if (found.program.oncePerTurn) {
    if (state.pendingEffect) {
      attack.leaderWatcherPending = {
        sourceInstanceId: found.source.instanceId,
        oncePerTurnKey: found.oncePerTurnKey,
      };
    } else {
      state.oncePerTurn.push(found.oncePerTurnKey);
    }
  }
  state.phase = "block";
  state.activePlayer = found.controllerPlayerId;
  return state.pendingEffect !== null;
}

/**
 * The `[When Attacking]` program `attackerCard` may still fire this attack, or
 * `undefined` when there is none, its `[Once Per Turn]` use is already spent,
 * or `requires` is unmet.
 *
 * The `oncePerTurnKey` deliberately reuses `onOpponentAttackSources`' exact
 * format (`turn:controller:instance:on-opponent-attack`): OP17-048/058 print
 * `[When Attacking]/[On Your Opponent's Attack]` on one card, and the two
 * tables must agree on one budget for it. The controller in the key is
 * `activePlayer` here and `defenderPlayerId` there, but for one source
 * instance they are always the same player, so the strings coincide without
 * either table knowing about the other.
 */
export function eligibleWhenAttackingProgram(
  state: GameState,
  activePlayer: PlayerId,
  attackerCard: CardInstance,
):
  | {
      program: NonNullable<ReturnType<typeof getWhenAttackingMechanicProgram>>;
      oncePerTurnKey: string;
    }
  | undefined {
  const program = getWhenAttackingMechanicProgram(attackerCard.cardNumber);
  if (!program) return undefined;
  const oncePerTurnKey = `${state.turn}:${activePlayer}:${attackerCard.instanceId}:on-opponent-attack`;
  if (program.oncePerTurn && state.oncePerTurn.includes(oncePerTurnKey)) {
    return undefined;
  }
  const requires = program.requires;
  if (requires) {
    const player = state.players[activePlayer];
    if (
      requires.handCards !== undefined &&
      player.hand.length < requires.handCards
    ) {
      return undefined;
    }
    if (
      requires.fieldDon !== undefined &&
      fieldDonCount(state, activePlayer) < requires.fieldDon
    ) {
      return undefined;
    }
    if (
      requires.activeDon !== undefined &&
      player.activeDon.length < requires.activeDon
    ) {
      return undefined;
    }
    if (
      requires.handCardsOfType !== undefined &&
      !handHasType(player, requires.handCardsOfType)
    ) {
      return undefined;
    }
    if (
      requires.handCardsOfCategory !== undefined &&
      !handHasCategory(player, requires.handCardsOfCategory)
    ) {
      return undefined;
    }
    // The same gate the `[On Your Opponent's Attack]` ladder reads, and for the
    // same reason: OP09-062's Leader pays with "1 card with a [Trigger]", which
    // a hand-size floor cannot describe. Without it a hand of anything else is
    // offered a cost it cannot pay, and the prompt resolves to nothing.
    if (
      requires.handCardsMatching !== undefined &&
      selectCards(
        state,
        { sourcePlayerId: activePlayer, source: attackerCard },
        {
          ...requires.handCardsMatching.match,
          player: "self",
          zone: "hand",
        },
        {},
      ).length < requires.handCardsMatching.count
    ) {
      return undefined;
    }
    // The Life-zone sibling, and the `[On Your Opponent's Attack]` ladder's
    // twin again: OP07-112 Lucy pays with "1 card from the top or bottom of
    // your Life cards", which no count of Life cards can gate -- the cost names
    // the two at the edges of the stack. Without it an empty Life stack is
    // offered a cost with nothing to pay it, and taking the prompt spends the
    // `[Once Per Turn]` on nothing.
    if (
      requires.lifeCardsMatching !== undefined &&
      selectCards(
        state,
        { sourcePlayerId: activePlayer, source: attackerCard },
        {
          ...requires.lifeCardsMatching.match,
          player: "self",
          zone: "life",
        },
        {},
      ).length < requires.lifeCardsMatching.count
    ) {
      return undefined;
    }
  }
  return { program, oncePerTurnKey };
}

/**
 * Offers the next `[On Your Opponent's Attack]` ability the defender has left.
 *
 * One at a time: each answer re-enters the ladder, so a defender holding both
 * OP17-064 King and OP17-072 Black Maria is asked about each in turn and may pay
 * for both. The source is recorded on the battle before the offer goes out, which
 * is what keeps the re-entry from asking about the same card forever -- and what
 * makes a *second* source impossible to drop, because the guard is per source
 * rather than per kind of effect.
 */
export function offerOnOpponentAttackEffect(
  state: GameState,
  events: PublicEvent[],
): boolean {
  const attack = state.activeAttack;
  if (!attack) return false;
  const [next] = onOpponentAttackSources(
    state,
    attack.defenderPlayerId,
    battleParticipant(state, attack.defenderPlayerId),
    attack.onOpponentAttackOffered ?? [],
    battleParticipant(state, attack.attackerPlayerId),
  );
  if (!next) return false;
  attack.onOpponentAttackOffered = [
    ...(attack.onOpponentAttackOffered ?? []),
    next.source.instanceId,
  ];
  const dispatched = dispatchMechanicInvocations(state, [
    {
      context: {
        sourcePlayerId: attack.defenderPlayerId,
        source: next.source,
      },
      program: next.program.program,
    },
  ]);
  events.push(...dispatched.events);
  state.pendingEffect =
    dispatched.pending && dispatched.invocation
      ? mechanicPendingEffect(
          dispatched.invocation,
          dispatched.pending,
          dispatched.continuations,
        )
      : null;
  if (next.program.oncePerTurn) {
    if (state.pendingEffect) {
      // Spent on the first answer that is not "skip", not here: an ability the
      // attack pushed at the defender is not used by declining it.
      attack.onOpponentAttackPending = {
        sourceInstanceId: next.source.instanceId,
        oncePerTurnKey: next.oncePerTurnKey,
      };
    } else {
      // A program that resolved without asking anything has been used.
      state.oncePerTurn.push(next.oncePerTurnKey);
    }
  }
  state.phase = "block";
  state.activePlayer = attack.defenderPlayerId;
  return state.pendingEffect !== null;
}

/**
 * The block-step ladder: every ability that answers an attack, in priority
 * order, offered one at a time.
 *
 * Written once and entered from two places that have to agree -- the attack
 * declaration, and every pending effect that resolves while the battle is open.
 * They used to be two copies of the same chain of `&&`, and the re-entering copy
 * guarded on the *kind* of effect that had just resolved so an ability was not
 * offered twice. That guard works only while each ability has one source; the
 * registry sources guard themselves per instance, on the battle.
 *
 * Returns whether an offer is now pending, which is what tells the declaration
 * site not to hand the defender its block choices yet.
 */
export function offerAttackReactions(
  state: GameState,
  events: PublicEvent[],
  resolved: PendingEffect | null = null,
): boolean {
  const attack = state.activeAttack;
  if (!attack) return false;
  if (offerBuggyBlockerEffect(state)) return true;
  const kind = resolved?.kind;
  // Katakuri's resolution re-enters the ladder, and the attacker's copy goes
  // first: with that one answered, only the defender's is still to offer. The
  // two Leaders below are mutually exclusive on one player -- a Leader is one
  // card -- so falling through from either to the other costs nothing.
  const katakuriAttackerAnswered =
    kind === "katakuri-leader" && resolved.playerId === attack.attackerPlayerId;
  if (
    kind !== "nami-leader" &&
    (kind !== "katakuri-leader" || katakuriAttackerAnswered)
  ) {
    if (offerKatakuriLeaderEffect(state, !katakuriAttackerAnswered))
      return true;
  }
  if (kind !== "nami-leader" && !katakuriAttackerAnswered) {
    if (offerNamiLeaderEffect(state)) return true;
  }
  if (offerLeaderWatcherEffect(state, events)) return true;
  return offerOnOpponentAttackEffect(state, events);
}

/**
 * The card number of the card declaring `attack` -- the Leader's identity when
 * the Leader is swinging, and the attacking Character's otherwise.
 *
 * Written once because two readings need it: the `battle-resolved` event, and
 * OP08-114 S-Hawk's "cannot be K.O.'d in battle by <Slash> attribute cards",
 * which asks about the attacker's printed attribute rather than about its role.
 */
function attackingCardNumber(state: GameState, attack: ActiveAttack): string {
  if (attack.attackerInstanceId === leaderInstanceId(attack.attackerPlayerId)) {
    return state.players[attack.attackerPlayerId].leaderCardNumber;
  }
  return (
    state.players[attack.attackerPlayerId].board.find(
      (card) => card.instanceId === attack.attackerInstanceId,
    )?.cardNumber ?? state.players[attack.attackerPlayerId].leaderCardNumber
  );
}

export function resolveBattle(
  state: GameState,
  events: PublicEvent[],
  db: CardDatabase = defaultCardDatabase,
): void {
  const attack = state.activeAttack;
  if (!attack) throw new Error("NO_ACTIVE_ATTACK");
  if (
    !attack.koReplacementOffered &&
    attack.attackerInstanceId === leaderInstanceId(attack.attackerPlayerId) &&
    attack.targetInstanceId !== leaderInstanceId(attack.defenderPlayerId) &&
    !leaderEffectsNegated(state, attack.attackerPlayerId)
  ) {
    // Recorded for every Leader rather than for the one card that reads it:
    // the note is what a Leader's own `[Activate: Main]` gate asks about, and
    // keying it to a card number is what kept OP12-020's clause off the
    // declarative path. Still skipped for a Leader whose effects are negated --
    // a Leader that cannot act should not be laying down facts for its own
    // later clause to read.
    state.oncePerTurn.push(
      leaderBattledCharacterKey(state.turn, attack.attackerPlayerId),
    );
  }
  const defender = state.players[attack.defenderPlayerId];
  const defense =
    currentPower(
      state,
      attack.defenderPlayerId,
      attack.targetInstanceId,
      false,
      db,
    ) + attack.counterPower;
  const offense = battleAttackPower(state, db);
  if (offense < defense) {
    events.push({
      type: "battle-resolved",
      attackerPlayerId: attack.attackerPlayerId,
      defenderPlayerId: attack.defenderPlayerId,
      targetInstanceId: attack.targetInstanceId,
      attackPower: offense,
      defensePower: defense,
      outcome: "defended",
    });
    resumeMainAfterBattle(state);
    return;
  }
  if (attack.targetInstanceId !== leaderInstanceId(attack.defenderPlayerId)) {
    const threatened = defender.board.find(
      (card) => card.instanceId === attack.targetInstanceId,
    );
    // "This Character cannot be K.O.'d in battle" (OP09-045 Cabaji, and
    // OP09-025 Crocodile against a Leader). The attack still happened and the
    // Character is still rested; it simply does not die, so the battle ends the
    // way a stopped one does. Checked before the replacement offer: there is
    // nothing to replace, and prompting for a cost to prevent a K.O. that
    // cannot happen would spend a card for nothing.
    if (
      threatened &&
      survivesBattleKo(state, attack.defenderPlayerId, threatened, {
        isLeader:
          attack.attackerInstanceId ===
          leaderInstanceId(attack.attackerPlayerId),
        cardNumber: attackingCardNumber(state, attack),
      })
    ) {
      events.push({
        type: "battle-resolved",
        attackerPlayerId: attack.attackerPlayerId,
        defenderPlayerId: attack.defenderPlayerId,
        targetInstanceId: attack.targetInstanceId,
        attackPower: offense,
        defensePower: defense,
        outcome: "defended",
      });
      resumeMainAfterBattle(state);
      return;
    }
    // The OP12-061 Leader's protection is not scoped to "your opponent's
    // effect", so battle destruction is inside it. Every other replacement in
    // the pool is scoped that way and is offered from `knockOut`'s hook, which
    // this path deliberately does not go through: the defender is asked before
    // the Character leaves the board, and `resolveBattle` is re-entered with
    // `koReplacementOffered` set once the answer arrives.
    const lifeProtection =
      threatened !== undefined &&
      rosinanteLifeProtectionAvailable(
        state,
        attack.defenderPlayerId,
        threatened,
      );
    // A registered replacement whose printed text does not say "by your
    // opponent's effect" is inside battle destruction too -- OP14-092
    // Mr.3(Galdino) is the first -- so the registry is asked here as well as
    // from `knockOut`'s hook.
    //
    // `"battle"` is what keeps the *other* five out. This call names the
    // attacker as the source, which `eligibleReplacements` reads as "by the
    // opponent"; without the cause it went on to offer every clause scoped to
    // "by your opponent's effect" against a Character that had merely lost a
    // fight.
    const mechanicOptions =
      threatened === undefined
        ? []
        : registeredReplacementOptions(
            state,
            attack.attackerPlayerId,
            attack.defenderPlayerId,
            threatened,
            attack.targetInstanceId,
            db,
            "battle",
          );
    if (
      threatened &&
      !attack.koReplacementOffered &&
      (lifeProtection || mechanicOptions.length > 0)
    ) {
      attack.koReplacementOffered = true;
      state.pendingEffect = {
        kind: "battle-ko-replacement",
        playerId: attack.defenderPlayerId,
        targetInstanceId: attack.targetInstanceId,
        sourceCardNumber:
          state.players[attack.attackerPlayerId].board.find(
            (card) => card.instanceId === attack.attackerInstanceId,
          )?.cardNumber ??
          state.players[attack.attackerPlayerId].leaderCardNumber,
        sourceInstanceId: attack.attackerInstanceId,
        ...(lifeProtection ? {} : { lifeProtection: false }),
        ...(mechanicOptions.length > 0 ? { mechanicOptions } : {}),
      };
      state.activePlayer = attack.defenderPlayerId;
      return;
    }
    const targetIndex = defender.board.findIndex(
      (card) => card.instanceId === attack.targetInstanceId,
    );
    const [target] = defender.board.splice(targetIndex, 1);
    if (!target)
      throw new Error(`MISSING_ATTACK_TARGET: ${attack.targetInstanceId}`);
    defender.restedDon.push(...(target.attachedDon ?? []));
    defender.trash.push({
      instanceId: target.instanceId,
      cardNumber: target.cardNumber,
    });
    // Battle destruction is a K.O. too, and OP16-100 asks whether one has
    // happened this turn. This path splices the board itself rather than going
    // through `knockOut`, so it records the same fact here.
    state.characterKoedOnTurn = {
      ...state.characterKoedOnTurn,
      [attack.defenderPlayerId]: state.turn,
    };
    const attackerCardNumber = attackingCardNumber(state, attack);
    events.push({
      type: "battle-resolved",
      attackerPlayerId: attack.attackerPlayerId,
      defenderPlayerId: attack.defenderPlayerId,
      targetInstanceId: attack.targetInstanceId,
      attackPower: offense,
      defensePower: defense,
      outcome: "character-ko",
    });
    events.push({
      type: "character-ko",
      playerId: attack.defenderPlayerId,
      cardInstanceId: target.instanceId,
      cardNumber: target.cardNumber,
      sourceCardNumber: attackerCardNumber,
    });
    const onKo = createOnKoResult(
      state,
      attack.defenderPlayerId,
      target,
      attack.attackerPlayerId,
      db,
      // Losing a fight is not an effect: an `[On K.O.]` that names "by your
      // opponent's effect" (OP09-052 Marco) does not fire here.
      "battle",
    );
    events.push(...onKo.events);
    if (onKo.pending) {
      state.activeAttack = null;
      state.pendingEffect = onKo.pending;
      state.pendingEffectResume = {
        phase: "main",
        playerId: attack.attackerPlayerId,
      };
      state.phase = "main";
      // Usually the K.O.'d character's own controller (a self-chooser [On
      // K.O.]), but not always -- OP17-053 Barbell's names the opponent as
      // chooser instead, and `onKo.pending.playerId` is already resolved to
      // whichever one actually applies.
      state.activePlayer = onKo.pending.playerId;
    } else {
      resumeMainAfterBattle(state);
    }
    return;
  }
  const life = defender.life.shift();
  if (!life) {
    state.activeAttack = null;
    state.phase = "finished";
    state.winner = attack.attackerPlayerId;
    state.resultReason = "life";
    events.push({
      type: "battle-resolved",
      attackerPlayerId: attack.attackerPlayerId,
      defenderPlayerId: attack.defenderPlayerId,
      targetInstanceId: attack.targetInstanceId,
      attackPower: offense,
      defensePower: defense,
      outcome: "game-win",
    });
    events.push({
      type: "game-ended",
      winner: attack.attackerPlayerId,
      reason: "life",
    });
    return;
  }
  events.push({
    type: "battle-resolved",
    attackerPlayerId: attack.attackerPlayerId,
    defenderPlayerId: attack.defenderPlayerId,
    targetInstanceId: attack.targetInstanceId,
    attackPower: offense,
    defensePower: defense,
    outcome: "damage",
  });
  events.push({
    type: "damage-taken",
    playerId: attack.defenderPlayerId,
    lifeRemaining: defender.life.length,
  });
  // "[printed text omitted -- pnpm card:text <card>]" -- the second point is owed
  // rather than dealt here, because this one may open a Trigger window that has
  // to settle first. `settleDoubleAttackDamage` pays it once nothing is pending.
  if (
    hasKeyword(
      state,
      attack.attackerPlayerId,
      attack.attackerInstanceId,
      "Double Attack",
      db,
    )
  ) {
    state.pendingBattleDamage = {
      playerId: attack.defenderPlayerId,
      remaining: 1,
      // Read here rather than at the settle step: by then the battle is over
      // and the attacker that carried the keyword is no longer addressable.
      ...(hasKeyword(
        state,
        attack.attackerPlayerId,
        attack.attackerInstanceId,
        "Banish",
        db,
      )
        ? { banish: true as const }
        : {}),
    };
  }
  // "When a card is removed from your opponent's Life cards" -- OP08-105
  // Jewelry Bonney, and the Leader clauses that watch the same signal. Whether
  // each one fires is decided now, as the card leaves; they are held until
  // the Damage Step is over -- see `pendingDamageReactions`.
  const lifeWatchers = getMechanicSignalInvocations(
    state,
    [
      {
        kind: "card-moved",
        card: life,
        ownerId: attack.defenderPlayerId,
        from: "life",
        to: "hand",
        // Whose attack connected, for a clause that names the Leader's own --
        // P-117 Nami. The signal is the same shape for a Character's attack,
        // so nothing downstream could tell them apart without this.
        ...(attack.attackerInstanceId ===
        leaderInstanceId(attack.attackerPlayerId)
          ? { byLeaderAttack: true as const }
          : {}),
      },
    ],
    false,
  );
  if (lifeWatchers.length > 0) {
    state.pendingDamageReactions = [
      ...(state.pendingDamageReactions ?? []),
      ...lifeWatchers,
    ];
  }
  // "[printed text omitted -- pnpm card:text <card>]" -- the whole keyword, in one branch: the Life card
  // goes to the trash instead of into the hand, and the Trigger window below is
  // never opened. Read from the attacker, because [Banish] is a property of the
  // card dealing the damage; a granted one (OP10-043, OP10-097) reads the same
  // way a printed one does through `hasKeyword`.
  if (
    hasKeyword(
      state,
      attack.attackerPlayerId,
      attack.attackerInstanceId,
      "Banish",
      db,
    )
  ) {
    defender.trash.push(life);
    events.push({
      type: "card-moved",
      playerId: attack.defenderPlayerId,
      cardInstanceId: life.instanceId,
      cardNumber: life.cardNumber,
      from: "life",
      to: "trash",
    });
    resumeMainAfterBattle(state);
    return;
  }
  if (opensTriggerWindow(life.cardNumber)) {
    // A Trigger window is a *private* look: the damaged player checks the Life
    // card and only turns it face-up by activating it ("you may activate this
    // card's [Trigger]" -- declining leaves the card unrevealed, and it joins
    // the hand like any other damage). So this reveal is marked visible to its
    // owner alone; `applyResolveTrigger` publishes it if the offer is taken.
    events.push({
      type: "card-revealed",
      playerId: attack.defenderPlayerId,
      cardNumber: life.cardNumber,
      sourceCardNumber: life.cardNumber,
      // A Life card an effect already turned face-up is public knowledge.
      ...(life.faceUp === true ? {} : { visibleTo: attack.defenderPlayerId }),
    });
    state.pendingTrigger = { playerId: attack.defenderPlayerId, card: life };
    state.phase = "trigger";
    state.activePlayer = attack.defenderPlayerId;
    return;
  }
  // `damage-taken` says the Life total dropped; `bankDamagedLifeCard` says
  // where the card went, and decides between the hand and the bottom of the
  // deck -- see ST13-003's Leader.
  events.push(...bankDamagedLifeCard(state, attack.defenderPlayerId, life, db));
  resumeMainAfterBattle(state);
}
