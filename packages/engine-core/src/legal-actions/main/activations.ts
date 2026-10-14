/**
 * `[Activate: Main]` and `[Main]` abilities on the board, the Stage and the
 * Leader.
 *
 * One function, and it is generic: any source with a program in the mechanic
 * table, gated on its `requires` and on the program's own top-level condition.
 * Adding a card here means adding it to `mechanics/<set>.ts` and nothing else.
 *
 * It had a second half until this file's last card-number branch went -- a run
 * of hand-written offers, one per card, that `actions/activate-main.ts` matched
 * with a branch each. The pair is what the mechanic DSL replaced, and the last
 * sixteen cards on it moved together with the `[Main]` Event register that was
 * its sibling.
 */
import { getActivateMainProgram } from "../../card-mechanics.js";
import { activateMainAvailable } from "../../ability-availability.js";
import { costOfProgram, donAddedByProgram } from "../action-costs.js";
import {
  actionCardLabel,
  activationSummary,
  canAttack,
  leaderInstanceId,
} from "../../board.js";
import {
  programKeywordGrant,
  programRestedDonGift,
  programSelectsNothing,
} from "../../mechanics.js";
import type { CardInstance, GameState } from "../../model.js";
import { type CardDatabase } from "@one-piece-sim/cards";
import type { LegalAction, PlayerId } from "@one-piece-sim/protocol";

export function mechanicActivationOffers(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase,
): LegalAction[] {
  const player = state.players[playerId];
  const actions: LegalAction[] = [];
  // Board Characters -- and the Stage -- with an `[Activate: Main]` program in
  // the mechanic table. OP09-099 Fullalead is the first Stage in the pool to
  // print one; a Stage is otherwise an ordinary activation source, and its
  // `rested` flag is the same field a Character's is.
  for (const source of [
    ...player.board,
    ...(player.stage ? [player.stage] : []),
  ]) {
    const activation = getActivateMainProgram(source.cardNumber);
    if (!activation) continue;
    if (!activateMainAvailable(state, playerId, source, activation, db)) {
      continue;
    }
    const grant = programKeywordGrant(activation.program);
    const activationGift = programRestedDonGift(
      { sourcePlayerId: playerId, source },
      activation.program,
    );
    const activationCost = costOfProgram(activation.program);
    const activationRamps = donAddedByProgram(activation.program);
    const optionId = `mechanic-main:${source.instanceId}`;
    actions.push({
      actionId: `r${state.revision}:activate:${optionId}`,
      type: "activate-main",
      optionId,
      sourceCardNumber: source.cardNumber,
      sourceInstanceId: source.instanceId,
      ...(programSelectsNothing(
        state,
        { sourcePlayerId: playerId, source },
        activation.program,
        db,
      )
        ? { selectsNothing: true as const }
        : {}),
      ...(grant ? { grants: grant } : {}),
      ...(activationGift ? { donGift: activationGift } : {}),
      ...(activationCost ? { cost: activationCost } : {}),
      ...(activationRamps ? { ramps: activationRamps } : {}),
      summary: activationSummary(
        source.cardNumber,
        "[Activate: Main]",
        "[Main]",
      ),
    });
  }
  // A Leader with an `[Activate: Main]` program in the mechanic table.
  //
  // The board loop above never reaches a Leader -- it is in no zone -- so this
  // block repeats it for the one source that has none, sharing the board loop's
  // reading of `requires` and the same `mechanic-main:` optionId prefix;
  // `leaderInstanceId` is what makes one prefix cover both a board Character and
  // a Leader. Whatever a Leader activation needs past `requires` belongs in
  // `requires`, not in a hardcoded branch of its own: OP12-061 Donquixote
  // Rosinante had one, and so was offered twice a turn under two different
  // once-per-turn keys, the generic copy missing the gate the branch carried.
  {
    const leaderActivation = getActivateMainProgram(player.leaderCardNumber);
    if (leaderActivation) {
      const leaderSourceInstanceId = leaderInstanceId(playerId);
      const leaderSource: CardInstance = {
        instanceId: leaderSourceInstanceId,
        cardNumber: player.leaderCardNumber,
      };
      if (
        activateMainAvailable(
          state,
          playerId,
          leaderSource,
          leaderActivation,
          db,
        )
      ) {
        const leaderGrant = programKeywordGrant(leaderActivation.program);
        const leaderGift = programRestedDonGift(
          { sourcePlayerId: playerId, source: leaderSource },
          leaderActivation.program,
        );
        const leaderCost = costOfProgram(leaderActivation.program);
        const leaderRamps = donAddedByProgram(leaderActivation.program);
        const optionId = `mechanic-main:${leaderSourceInstanceId}`;
        actions.push({
          actionId: `r${state.revision}:activate:${optionId}`,
          type: "activate-main",
          optionId,
          sourceCardNumber: player.leaderCardNumber,
          sourceInstanceId: leaderSourceInstanceId,
          ...(programSelectsNothing(
            state,
            { sourcePlayerId: playerId, source: leaderSource },
            leaderActivation.program,
            db,
          )
            ? { selectsNothing: true as const }
            : {}),
          ...(leaderGrant ? { grants: leaderGrant } : {}),
          ...(leaderGift ? { donGift: leaderGift } : {}),
          ...(leaderCost ? { cost: leaderCost } : {}),
          ...(leaderRamps ? { ramps: leaderRamps } : {}),
          summary: activationSummary(
            player.leaderCardNumber,
            "[Activate: Main]",
            "[Main]",
          ),
        });
      }
    }
  }
  // OP15-058 Enel Leader: "[printed text omitted -- pnpm card:text OP15-058]"
  //
  // The DON!! deck refills as the deck spends `DON!! −N`, so this is a loop:
  // thunder Events push DON!! back into the deck, and the Leader pulls five out
  // and dumps four onto a body.
  //
  // "Your second turn" is the controller's own second turn, the same per-player
  // reading 6-3-1, 6-4-1 and 6-5-6-1 use, and `turn` counts player-turns: own
  // turn N is turn 2N-1 going first and 2N going second, so own turn 2 or later
  // is turn 3 or later from either seat. This used to read `turn >= 2`, which
  // let the player going second ramp on their *first* turn -- turn 2 is their
  // first, as the battle restriction a few hundred lines up already says.
  //
  // The DON!! deck being empty does not stop it either. Both add clauses say
  // "up to", and 8-4-4-1 has the player choose as many as they can up to the
  // number specified "and the player may also choose 0", so an empty DON!! deck
  // adds nothing and the give clause still hands over rested DON!! -- which is
  // the line that lands 4 DON!! on a freshly played finisher on a turn that
  // spent the whole DON!! deck paying for it.
  //
  // Having no Characters does not stop it either, for the same reason and by the
  // same rule: "[printed text omitted -- pnpm card:text OP15-058]" gives
  // zero when there is nobody to give to, and the two add clauses above it still
  // resolve. This used to loop over `player.board` and so pushed *no* action at
  // all on an empty board, which is not a wholly inert activation -- it is the
  // deck's entire ramp. With a six-card DON!! deck the add clauses are worth up
  // to five DON!! onto the field, one of them active immediately and the rest
  // active from the next Refresh Phase, and the Leader is `[Once Per Turn]`, so
  // a turn where it was never offered is a turn of ramp that cannot be
  // recovered. Instrumented over 120 games, **23.3% of games reached the seat's
  // own turn 2 with an empty board**, and in every one of them Enel's Leader
  // did nothing.
  //
  // Expect it to be small on top of `op16-enel-mulligan`, which addresses the
  // same 23.3% from the other end by not keeping the hands that lead here:
  // with that rule shipped there are far fewer boardless turns left for this
  // to rescue. It is a correctness fix with a positive tail rather than a
  // win-rate change, and the two are not additive -- ship order decides how
  // large either one reads.
  //
  // `restedDon` is deliberately not part of the gate for the no-Characters
  // variant: with nobody to give to, resting DON!! that is already on the field
  // moves nothing, so only a non-empty DON!! deck makes the activation worth
  // offering.
  const enelBoardless = player.board.length === 0;
  if (
    player.leaderCardNumber === "OP15-058" &&
    state.turn >= 3 &&
    (enelBoardless
      ? player.donDeck.length > 0
      : player.donDeck.length > 0 || player.restedDon.length > 0) &&
    !state.oncePerTurn.includes(`${state.turn}:${playerId}:enel-leader`)
  ) {
    if (enelBoardless) {
      actions.push({
        actionId: `r${state.revision}:activate:enel-leader`,
        type: "activate-main",
        optionId: "enel-leader",
        sourceCardNumber: player.leaderCardNumber,
        sourceInstanceId: leaderInstanceId(playerId),
        ramps: { active: 1, rested: 4 },
        summary:
          "Add DON!! from the DON!! deck (no Characters to give the rested DON!! to, so they stay in the cost area and become active at your next Refresh)",
      });
    }
    for (const target of player.board) {
      const optionId = `enel-leader:${target.instanceId}`;
      const attackTiming = canAttack(state, playerId, target.instanceId, db)
        ? "can still attack this turn"
        : "cannot attack this turn";
      actions.push({
        actionId: `r${state.revision}:activate:${optionId}`,
        type: "activate-main",
        optionId,
        sourceCardNumber: player.leaderCardNumber,
        sourceInstanceId: leaderInstanceId(playerId),
        targetInstanceId: target.instanceId,
        ramps: { active: 1, rested: 4 },
        // The gift itself, so a policy prices it off the action instead of
        // re-deriving "4" from the summary or from `ramps` -- which counts what
        // the DON!! deck adds and is a different number from what is handed
        // over. See `LegalAction.donGift` on the `activate-main` variant.
        donGift: { count: 4, from: "rested" },
        summary: `Add DON!! from the DON!! deck and give up to 4 rested DON!! to ${actionCardLabel(state, playerId, target.instanceId, true, db)} (${attackTiming}; given DON!! returns at your next Refresh)`,
      });
    }
  }
  return actions;
}
