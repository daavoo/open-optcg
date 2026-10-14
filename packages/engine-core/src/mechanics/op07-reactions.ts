/**
 * The "when X happens" clauses OP-07 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";
import { drawOneTrashOne } from "./reaction-shared.js";

export const op07ReactionRules: readonly ReactionRule[] = [
  {
    // OP07-031 Bartolomeo: "[Your Turn] [Once Per Turn] If a Character is
    // rested by your effect, draw 1 card and trash 1 card from your hand."
    //
    // A watcher on the bench rather than a clause on the card that rests, which
    // is what separates it from the `whenRested` registry: that table is keyed
    // by the Character *becoming* rested, and this fires for any of them. The
    // Green Fish-Man package rests the opponent's board with half its clauses,
    // so on its own turn this is a card every turn.
    //
    // `[Your Turn]` and `restedBy: "self"` are two different halves of the
    // sentence and both are needed: an opposing Counter can rest something on
    // this player's turn, and this player's own Counter can rest something on
    // the other player's.
    cardNumber: "OP07-031",
    controller: "board",
    signal: { kind: "card-rested", restedBy: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: { effect: drawOneTrashOne },
  },
  {
    // OP07-038 Boa Hancock (Leader): "[Your Turn] [Once Per Turn] This effect
    // can be activated when a Character is removed from the field by your
    // effect. If you have 5 or less cards in your hand, draw 1 card."
    //
    // The signal covers the printed reading: an exit from the board is a
    // removal, and `bySource: "self"` is the "by your effect" half -- a battle
    // K.O., which carries no source player, fires nothing. No `movedOwner`,
    // because the clause names no side: this Leader's own removal pointed at
    // its own Character pays it too.
    //
    // The hand ceiling is what keeps it from refilling a full grip, the same
    // shape the OP10-042 Usopp Leader has.
    cardNumber: "OP07-038",
    controller: "leader",
    signal: { kind: "card-moved", from: "board", bySource: "self" },
    ownTurn: true,
    oncePerTurn: true,
    maxHandSize: 5,
    program: { effect: { kind: "draw", player: "self", count: 1 } },
  },
];
