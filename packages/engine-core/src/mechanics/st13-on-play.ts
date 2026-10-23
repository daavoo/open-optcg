/**
 * ST-13 `[On Play]` programs.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST13-0xx` prints it from the local cache).
 */
import { paidToHand } from "./shared.js";
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  BROTHERS,
  digForABrother,
  readLifeAndBankOne,
  trashLifeFor,
} from "./st13-shared.js";

export const st13OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // ST13-004 Edward.Newgate: a card off the deck onto Life, then the whole
      // stack read and one card taken back off it onto the deck.
      //
      // Net zero Life and a card of the player's choosing on top of the deck --
      // and, because the stack is looked at in full, complete knowledge of what
      // the next several attacks turn over. That is what a 6-cost 7000 buys
      // here: not a bigger stack, a *known* one.
      //
      // The added card goes in face-down, which is the printed default: nothing
      // says face-up, and a face-up card is a liability under ST13-002's
      // end-of-turn sweep and under ST13-003's Leader.
      "ST13-004",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "select",
              selector: { player: "self", zone: "deck", position: "top" },
              bind: "st13-newgate-bank",
              count: 1,
              effect: {
                kind: "move",
                binding: "st13-newgate-bank",
                to: { player: "self", zone: "life", position: "top" },
              },
            },
            readLifeAndBankOne("st13-newgate-read"),
          ],
        },
      },
    ],
    [
      // ST13-005 Emporio.Ivankov: a Life card trashed to put a 5-cost
      // Character from hand on top of Life -- face-down.
      //
      // Face-down is the whole distinction from the Leaders' banking, and it is
      // why this card is in the deck: a brother stashed here survives
      // ST13-002's end-of-turn sweep and ST13-003's Leader, and the three
      // 2-cost bodies reveal it to play it just the same. The reveal is printed
      // and mandatory, so the opponent knows what is there and still cannot
      // reach it.
      //
      // The [Blocker] is derived from the printed keyword and needs no program.
      "ST13-005",
      {
        effect: trashLifeFor("st13-ivankov-cost", {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            minCost: 5,
            maxCost: 5,
          },
          bind: "st13-ivankov-bank",
          min: 0,
          max: 1,
          effect: {
            kind: "sequence",
            effects: [
              { kind: "reveal", binding: "st13-ivankov-bank" },
              {
                kind: "move",
                binding: "st13-ivankov-bank",
                to: { player: "self", zone: "life", position: "top" },
              },
            ],
          },
        }),
      },
    ],
    [
      // ST13-006 Curly.Dadan: up to one of each 2-cost brother, free, out of
      // hand.
      //
      // Three separate choices rather than one of three, because the printed
      // "up to 1 each" is three independent offers -- a hand with two Sabos
      // plays one of them and a hand with all three brothers plays all three.
      // Six DON!! of bodies for five, and each one arrives with the activation
      // that reads the top of Life, so this is the turn the deck cashes its
      // stack in.
      "ST13-006",
      {
        effect: {
          kind: "sequence",
          effects: BROTHERS.map((name) => ({
            kind: "choose" as const,
            selector: {
              player: "self" as const,
              zone: "hand" as const,
              category: "character",
              name,
              minCost: 2,
              maxCost: 2,
            },
            bind: `st13-dadan-${name.toLowerCase().replaceAll(".", "")}`,
            min: 0,
            max: 1,
            effect: {
              kind: "play" as const,
              binding: `st13-dadan-${name.toLowerCase().replaceAll(".", "")}`,
            },
          })),
        },
      },
    ],
    [
      // ST13-008 Sabo: a Life card trashed to K.O. anything at cost 5 or less.
      //
      // The product's only removal, and it is paid for out of the same stack
      // everything else here is building -- which is the tension the deck is
      // about. `position: "edge"` on the cost is real: the top card is usually
      // the brother the deck put there on purpose, so the bottom is what pays.
      "ST13-008",
      {
        effect: trashLifeFor("st13-sabo-ko-cost", {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 5,
          },
          bind: "st13-sabo-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "st13-sabo-ko" },
        }),
      },
    ],
    [
      // ST13-009 Shanks: a face-up Life card turned back down, and a card off
      // the opponent's Life if their hand has run long.
      //
      // The cost is the interesting half. Turning a face-up card face-down puts
      // it out of reach of the 2-cost brothers and out of danger from
      // ST13-002's sweep, so it is not a price at all in a deck that has
      // already banked more than it can use -- it is how the stack is made
      // safe. The payoff needs the opponent at seven cards, which at 7 cost is
      // a late-game reading and is why nothing here is gated on the Leader.
      "ST13-009",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "life", faceUp: true },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", faceUp: true },
              bind: "st13-shanks-hide",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "update",
                    binding: "st13-shanks-hide",
                    faceUp: false,
                  },
                  {
                    kind: "if",
                    condition: {
                      kind: "zone-count",
                      player: "opponent",
                      zone: "hand",
                      operator: "gte",
                      value: 7,
                    },
                    then: {
                      kind: "select",
                      selector: {
                        player: "opponent",
                        zone: "life",
                        position: "top",
                      },
                      bind: "st13-shanks-burn",
                      count: 1,
                      effect: {
                        kind: "move",
                        binding: "st13-shanks-burn",
                        to: { player: "owner", zone: "trash" },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // ST13-011 Portgas.D.Ace: [Rush] while the Life stack has run short.
      //
      // An [On Play] grant rather than continuous text, which is the printed
      // shape and is a real difference: the keyword is decided once, when the
      // body lands, so a Life card taken later in the turn does not hand it
      // [Rush] and one added does not take it away. A 5-cost 7000 that attacks
      // the turn it arrives is what this deck's 2-cost brothers are digging
      // for, and the gate says it only happens when the deck is behind.
      "ST13-011",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "life",
            operator: "lte",
            value: 2,
          },
          then: {
            kind: "grant-keyword",
            binding: SOURCE_BINDING,
            keyword: "Rush",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // ST13-012 Makino: a Life card into hand, and the rest of the stack
      // re-ordered.
      //
      // At 1 cost and 0 power the body is nothing; the clause is a Counter in
      // the hand plus a stack arranged so the *next* hit turns over whatever
      // its owner wants. Unlike ST13-004 nothing leaves for the deck, so the
      // trade is a Life card for a hand card -- which under ST13-003's Leader
      // is the only way a face-up card ever reaches a hand at all.
      "ST13-012",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "life",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "edge" },
              bind: "st13-makino-take",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "st13-makino-take",
                    to: { player: "self", zone: "hand" },
                  },
                  paidToHand("st13-makino-take", [
                    {
                      kind: "look-at",
                      player: "self",
                      count: "all",
                      bind: "st13-makino-read",
                      zone: "life",
                    },
                    {
                      kind: "select",
                      selector: {
                        player: "self",
                        zone: "life",
                        binding: "st13-makino-read",
                      },
                      bind: "st13-makino-order",
                      count: "all",
                      effect: {
                        kind: "order-to-bottom",
                        binding: "st13-makino-order",
                        to: {
                          player: "self",
                          zone: "life",
                          position: "bottom",
                        },
                      },
                    },
                  ]),
                ],
              },
            },
          },
        },
      },
    ],
    [
      // ST13-013 Monkey.D.Garp: the five-deep dig for a brother, on a 1-cost
      // body. The same fragment ST13-019 prints as an Event; see
      // `st13-shared.ts`.
      "ST13-013",
      { effect: digForABrother("st13-garp") },
    ],
    [
      // ST13-016 Yamato: [Rush], and the whole Life stack read with one card
      // taken off it onto the deck.
      //
      // The same clause ST13-004 prints, on a body four cost cheaper that
      // attacks the turn it lands -- so the card taken back is usually a
      // brother the deck wants to *draw* rather than one it wants to leave on
      // Life. [Rush] is printed unconditionally here and is derived from the
      // keyword, unlike ST13-011's gated grant.
      "ST13-016",
      { effect: readLifeAndBankOne("st13-yamato-read") },
    ],
  ],
};
