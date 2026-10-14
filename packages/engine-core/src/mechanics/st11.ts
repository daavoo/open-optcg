/**
 * ST-11 "ULTRA DECK -The Three Brothers-"'s five-card supplement: the Uta
 * package Bandai printed alongside it.
 *
 * Five identities, six programs. Comments paraphrase what each clause has to
 * do rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST11-0xx` prints it from the local cache).
 *
 * One product, one module: the four cards behind the Leader all read {FILM} or
 * read the Leader by name, so nothing here is reachable from another deck and
 * splitting them by window would scatter five cards across four files.
 */
import { type MechanicEffect } from "../mechanics.js";
import { restOrKoCostAtMost } from "./shared.js";
import { type SetMechanics } from "./registry.js";

/** "If your Leader is [Uta]" -- the gate both Events print. */
const utaLeader = {
  kind: "leader-has-name",
  player: "self",
  name: "Uta",
} as const;

/** Every card in the deck's own package, as a selector fragment. */
const FILM = "FILM";

/**
 * "Place the rest at the bottom of your deck" -- the disposal both searches
 * print, asked a card at a time so "in any order" is the player's order.
 */
const restToBottom = (bind: string): MechanicEffect => ({
  kind: "select",
  selector: { player: "self", zone: "deck", binding: bind },
  bind: `${bind}-rest`,
  count: "all",
  effect: {
    kind: "order-to-bottom",
    binding: `${bind}-rest`,
    to: { player: "self", zone: "deck", position: "bottom" },
  },
});

export const st11Mechanics: SetMechanics = {
  whenAttacking: [
    [
      // ST11-001 Uta, the Leader: one DON!! on it turns each attack into a dig
      // one card deep for a {FILM} card.
      //
      // A `look-at` of 1 followed by its own `reveal`, not `reveal-deck-top`:
      // the binding is what makes the card nameable at the `choose` and again
      // at the disposal, and the reveal has to happen before either reads it.
      // `[DON!! x1]` is an `if` on `source-attached-don`, which reaches a
      // Leader's own DON!! pile as well as a Character's.
      "ST11-001",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "source-attached-don",
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "look-at",
                  player: "self",
                  count: 1,
                  bind: "st11-uta-dig",
                },
                { kind: "reveal", binding: "st11-uta-dig" },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "deck",
                    binding: "st11-uta-dig",
                    type: FILM,
                  },
                  bind: "st11-uta-dig-add",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "st11-uta-dig-add",
                    to: { player: "self", zone: "hand" },
                  },
                },
                restToBottom("st11-uta-dig"),
              ],
            },
          },
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // ST11-002 Uta: an Event out of hand buys a {FILM} Character back to
      // active at the end of every one of this player's turns.
      //
      // The cost is what the outer `if` guards, not the payoff: a program whose
      // top-level condition is false is never offered, so a hand with no Event
      // is not asked to pay one. [Blocker] is the card's other printed half and
      // needs no program -- `hasStaticKeyword` reads it off the text -- and the
      // two together are the reason this body is worth 3: it blocks on the
      // opponent's turn and is active again by the next one.
      "ST11-002",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "hand", category: "event" },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand", category: "event" },
              bind: "st11-uta-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "st11-uta-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                      type: FILM,
                      rested: true,
                    },
                    bind: "st11-uta-refresh",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "update",
                      binding: "st11-uta-refresh",
                      rested: false,
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // ST11-003 Backlight: rest a body, or K.O. one that is already rested.
      //
      // The printed "choose one" is the fragment ST12-006 also carries, at a
      // lower ceiling; both ceilings are effective cost, which is what "a cost
      // of 5 or less" means about a card already on the field.
      "ST11-003",
      {
        cost: 2,
        program: {
          effect: {
            kind: "if",
            condition: utaLeader,
            then: restOrKoCostAtMost(5, "st11-backlight"),
          },
        },
      },
    ],
    [
      // ST11-004 New Genesis: a three-deep dig for a {FILM} card that refunds
      // the DON!! it cost.
      //
      // The DON!! refund is why the Event is 1 rather than 0 to play in
      // practice, and it comes last, after the cards are placed, exactly as
      // printed. `excludeName` is the card's own name: it may not find another
      // copy of itself, which is what stops a two-card loop that never advances
      // the board.
      "ST11-004",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: utaLeader,
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "look-at",
                  player: "self",
                  count: 3,
                  bind: "st11-genesis",
                },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "deck",
                    binding: "st11-genesis",
                    type: FILM,
                    excludeName: "New Genesis",
                  },
                  bind: "st11-genesis-add",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      { kind: "reveal", binding: "st11-genesis-add" },
                      {
                        kind: "move",
                        binding: "st11-genesis-add",
                        to: { player: "self", zone: "hand" },
                      },
                    ],
                  },
                },
                restToBottom("st11-genesis"),
                { kind: "activate-don", player: "self", count: 1 },
              ],
            },
          },
        },
      },
    ],
    [
      // ST11-005 I'm invincible: the Leader attacks a second time.
      //
      // Named rather than typed, so the Event is dead outside its own deck --
      // and the selector reaches the Leader through `zone: []` plus
      // `includeLeader`, which is the only way to name a card that is in no
      // board zone. `rested: true` keeps it off an already-active Leader, where
      // "set as active" would do nothing and the Event would still be spent.
      "ST11-005",
      {
        cost: 3,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: [],
              includeLeader: true,
              name: "Uta",
              rested: true,
            },
            bind: "st11-invincible",
            min: 0,
            max: 1,
            effect: {
              kind: "update",
              binding: "st11-invincible",
              rested: false,
            },
          },
        },
      },
    ],
  ],
  trigger: [
    [
      // ST11-005 I'm invincible: off the Life stack it is +1000 for the turn
      // instead, on the Leader or on any Character.
      "ST11-005",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "board", includeLeader: true },
          bind: "st11-invincible-buff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "st11-invincible-buff",
            amount: 1_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
  ],
};
