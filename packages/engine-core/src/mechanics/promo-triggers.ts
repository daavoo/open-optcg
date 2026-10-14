/**
 * `[Trigger]` and `[End of Your Turn]` programs for the `P-` promos.
 *
 * Split by timing window like every other import; see `mechanics/README.md`.
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text P-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { buffOwnCardForTurn } from "./op07-shared.js";
import { koCostAtMost } from "./op08-shared.js";
import { handRefresh, utaRestLock } from "./promo-main.js";

export const promoTriggerMechanics: SetMechanics = {
  trigger: [
    // P-002: the printed words are "activate this card's [Main] effect", which
    // is the same fragment registered twice rather than a node that reaches
    // across registries. See `promo-main.ts`.
    ["P-002", handRefresh],
    [
      // P-014 Koby: off a Life card, this [Blocker] comes down for free, with
      // no gate at all -- which is what makes a 3-cost body a Trigger worth
      // running.
      "P-014",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // P-024: off a Life card, +1000 on the Leader or a Character -- the
      // small half of a card whose `[Main]` scales with the board.
      "P-024",
      { effect: buffOwnCardForTurn(1_000, "p024-trigger-buff") },
    ],
    [
      // P-042 Roronoa Zoro: off a Life card, a K.O. of anything at cost 4 or
      // less. The card prints no effect box at all, so the Trigger is the
      // whole of it.
      "P-042",
      { effect: koCostAtMost(4, "p042-ko") },
    ],
    // P-057 and P-058 both re-run their own `[Main]` halves.
    ["P-057", utaRestLock],
    [
      // P-058: the Trigger sets the {FILM} board active *now* rather than
      // booking it for the end of the turn, because a Trigger resolves on the
      // opponent's turn -- the end this clause would wait for is theirs, and
      // the bodies are wanted for the block in front of them.
      //
      // No Leader gate on this half: the printed `[Trigger]` carries none,
      // where the `[Main]` does.
      "P-058",
      {
        effect: {
          kind: "select",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            type: "FILM",
          },
          bind: "p058-trigger-film",
          count: "all",
          effect: {
            kind: "update",
            binding: "p058-trigger-film",
            rested: false,
          },
        },
      },
    ],
    [
      // P-106 Monkey.D.Luffy: off a Life card, a card and a K.O. of anything
      // at cost 2 or less. Its `[End of Your Turn]` half is below.
      "P-106",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            koCostAtMost(2, "p106-ko"),
          ],
        },
      },
    ],
    [
      // P-113 Jewelry Bonney: off a Life card, a K.O. of anything at cost 3 or
      // less. Its continuous half is two rows in `../static-abilities.ts`.
      "P-113",
      { effect: koCostAtMost(3, "p113-ko") },
    ],
    [
      // P-115 Boa Hancock: off a Life card, a small yellow body that itself
      // carries a [Trigger] comes down out of hand.
      //
      // The filter is the deck in one line: Yellow's Life stack is its second
      // hand, and this refills it with more of the same.
      "P-115",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            color: "Yellow",
            maxPower: 5_000,
            hasTrigger: true,
          },
          bind: "p115-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "p115-play" },
        },
      },
    ],
    [
      // P-155 Trafalgar Law: off a Life card, this body plays itself -- but
      // only once the opponent is down to three Life, which is the turn a
      // 5000 on the board is worth more than a card in hand.
      "P-155",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "life",
            operator: "lte",
            value: 3,
          },
          then: { kind: "play", binding: SOURCE_BINDING },
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // P-010 Kaido: an active DON!! out of the DON!! deck as the turn closes.
      //
      // Active and free, which on an 8-cost 9000 is what the body is for: the
      // DON!! is back before the opponent's turn starts, so it is Counter
      // money as well as next turn's cost area. Not "up to" -- the printed
      // clause adds one.
      "P-010",
      { effect: { kind: "add-don", player: "self", count: 1, rested: false } },
    ],
    [
      // P-029 Bartolomeo: resting itself sets another {FILM} body active.
      //
      // `excludeSource` is the printed "other than [Bartolomeo]", and it is by
      // name rather than by instance -- a second copy cannot be the one set
      // active either. At the end of the turn, so what it buys is a blocker
      // for the turn that follows.
      "P-029",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest", binding: SOURCE_BINDING },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  type: "FILM",
                  excludeName: "Bartolomeo",
                  rested: true,
                },
                bind: "p029-wake",
                min: 0,
                max: 1,
                effect: { kind: "update", binding: "p029-wake", rested: false },
              },
            ],
          },
        },
      },
    ],
    [
      // P-079 Lim: off two rested {ODYSSEY} bodies, this [Blocker] stands back
      // up as the turn closes -- so it attacks and still blocks.
      "P-079",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: {
              zone: "board",
              category: "character",
              type: "ODYSSEY",
              rested: true,
            },
            operator: "gte",
            value: 2,
          },
          then: { kind: "update", binding: SOURCE_BINDING, rested: false },
        },
      },
    ],
    [
      // P-106 Monkey.D.Luffy: a Life card turned face-up sets an {Egghead}
      // body active as the turn closes.
      //
      // The price is information rather than a card -- the Life total does not
      // move, and what the opponent gains is knowing what their next attack
      // turns over. In this deck that is usually a Trigger, so the price is
      // smaller than it reads.
      "P-106",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "life",
              position: "top",
              faceUp: false,
            },
            bind: "p106-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                { kind: "update", binding: "p106-cost", faceUp: true },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    type: "Egghead",
                    rested: true,
                  },
                  bind: "p106-wake",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "update",
                    binding: "p106-wake",
                    rested: false,
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
};
