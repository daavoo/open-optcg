/**
 * The "when X happens" clauses OP-06 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";
import { zeffMill } from "./reaction-shared.js";

export const op06ReactionRules: readonly ReactionRule[] = [
  {
    // OP06-042 Vinsmoke Reiju (Leader): "[Your Turn] [Once Per Turn] When a
    // DON!! card on your field is returned to your DON!! deck, draw 1 card."
    //
    // The whole GERMA archetype in one clause: every sibling's activation and
    // half its Characters pay `DON!! −1`, and this Leader turns the first of
    // those each turn into a card. No printed marker of its own beyond the
    // window, which is why it is a `ReactionRule` rather than an entry in any
    // of the clause tables.
    cardNumber: "OP06-042",
    controller: "leader",
    signal: { kind: "don-returned", returnedBy: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: { effect: { kind: "draw", player: "self", count: 1 } },
  },
  {
    // OP06-076 Hitokiri Kamazo: "[Your Turn] [Once Per Turn] When a DON!! card
    // on your field is returned to your DON!! deck, K.O. up to 1 of your
    // opponent's Characters with a cost of 2 or less."
    //
    // The same signal the Leader above reads, spent on removal instead of a
    // card -- so a deck running both turns one `DON!! −1` into a card *and* a
    // K.O., because the two rules keep separate once-per-turn keys (the key is
    // per card number).
    cardNumber: "OP06-076",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
          maxCost: 2,
        },
        bind: "op06-kamazo",
        min: 0,
        max: 1,
        effect: { kind: "knock-out", binding: "op06-kamazo" },
      },
    },
  },
  {
    // OP06-044 Gion: "[Your Turn] [Once Per Turn] When your opponent activates
    // an Event, your opponent must place 1 card from their hand at the bottom
    // of their deck."
    //
    // `[Your Turn]` means the Event in question is a Counter, which is what
    // this punishes: answering an attack costs the defender the card they
    // played and one more off the top of their hand. `chooser: "opponent"` --
    // "must place 1 card" names no card, so the choice is theirs.
    cardNumber: "OP06-044",
    controller: "board",
    signal: { kind: "event-activated", activatedBy: "opponent" },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "choose",
        selector: { player: "opponent", zone: "hand" },
        bind: "op06-gion",
        chooser: "opponent",
        min: 1,
        max: 1,
        effect: {
          kind: "order-to-bottom",
          binding: "op06-gion",
          to: { player: "owner", zone: "deck", position: "bottom" },
        },
      },
    },
  },
  {
    // OP06-048 Zeff: "[Your Turn] When your opponent activates [Blocker] or an
    // Event, if your Leader has the {East Blue} type, you may trash 4 cards
    // from the top of your deck."
    //
    // Two rules for one printed clause -- a [Blocker] and an Event are
    // different signals -- and *not* `[Once Per Turn]`, which is the whole
    // card: a deck that mills to fuel its own recursion is paid every time the
    // defender interacts. They share the once-per-turn key anyway, since the
    // key is per card number, which costs nothing while neither is scoped.
    //
    // `blocker-activated` is raised from the block action rather than from the
    // `attack-blocked` event, because a redirect emits that event without
    // activating anything -- the line `winsOnOpponentBlock` draws.
    cardNumber: "OP06-048",
    controller: "board",
    signal: { kind: "blocker-activated", activatedBy: "opponent" },
    ownTurn: true,
    oncePerTurn: false,
    program: { effect: zeffMill },
  },
  {
    cardNumber: "OP06-048",
    controller: "board",
    signal: { kind: "event-activated", activatedBy: "opponent" },
    ownTurn: true,
    oncePerTurn: false,
    program: { effect: zeffMill },
  },
];
