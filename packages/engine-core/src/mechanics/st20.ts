/**
 * ST-20's five-card {Big Mom Pirates} supplement.
 *
 * Comments paraphrase what each clause has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content (`pnpm card:text
 * ST20-0xx` prints it from the local cache).
 *
 * Yellow pays for everything out of its own Life, and every card here prints
 * that in a different currency: Katakuri turns a Life card face-up, Cracker
 * trashes one to survive, Pudding takes one to hand, Brulee reorders either
 * side's, and Linlin makes the opponent choose which of theirs to lose. The
 * [Blocker] on ST20-001 is derived from the printed keyword and needs no
 * program.
 */
import { SOURCE_BINDING, type MechanicCondition } from "../mechanics.js";
import { peekLife, payFromHand } from "./shared.js";
import { type SetMechanics } from "./registry.js";

const BIG_MOM = "Big Mom Pirates";

/** "1 card from the top of your Life cards", as the two costs select it. */
const topOfOwnLife = {
  player: "self",
  zone: "life",
  position: "top",
} as const;

/** The gate both Life costs need: a Life stack with a card in it. */
const hasLife: MechanicCondition = {
  kind: "zone-count",
  player: "self",
  zone: "life",
  operator: "gte",
  value: 1,
};

export const st20Mechanics: SetMechanics = {
  activateMain: [
    [
      // ST20-001 Charlotte Katakuri: once a turn, turning a Life card face-up
      // buys a rested DON!!.
      //
      // The cost is not spending the Life card -- it stays in the stack and
      // still absorbs the hit -- it is telling the opponent what the next hit
      // turns over, and giving up the Trigger on it. That is the cheapest DON!!
      // in the product and it is why this body is the one the deck wants on
      // turn five.
      //
      // `update` with `faceUp`, and the selector asks for a face-down card, so
      // a stack whose top is already face-up does not offer a cost that changes
      // nothing. The gate is outermost, which is what keeps the turn's one use
      // from being spent on an empty Life stack.
      "ST20-001",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: hasLife,
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: { ...topOfOwnLife, faceUp: false },
                bind: "st20-katakuri-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "update",
                      binding: "st20-katakuri-cost",
                      faceUp: true,
                    },
                    { kind: "give-rested-don", player: "self", count: 1 },
                  ],
                },
              },
            },
          },
        },
      },
    ],
  ],
  onPlay: [
    [
      // ST20-004 Charlotte Pudding: a Life card into hand sets a small
      // teammate active again.
      //
      // The Life card is really spent here, unlike Katakuri's -- it leaves the
      // stack -- so the clause is a turn of life for a second attack from a
      // body that has already swung. `[Big Mom Pirates]` and cost 3 or less is
      // a narrow list on purpose: it reaches Brulee and the other Pudding, not
      // Linlin.
      "ST20-004",
      {
        effect: {
          kind: "if",
          condition: hasLife,
          then: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: topOfOwnLife,
              bind: "st20-pudding-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "st20-pudding-cost",
                    to: { player: "self", zone: "hand" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                      type: BIG_MOM,
                      maxCost: 3,
                      rested: true,
                    },
                    bind: "st20-pudding-refresh",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "update",
                      binding: "st20-pudding-refresh",
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
    [
      // ST20-005 Charlotte Linlin: a card out of hand, and the opponent picks
      // which way it hurts.
      //
      // `chooser: "opponent"` is the printed "your opponent chooses one", and
      // it is what makes the card fair to price: two cards out of their hand or
      // one off their Life, and they take whichever they can afford. A hand
      // they have already emptied makes the Life branch the only real answer,
      // which is why this is the deck's closer rather than its opener.
      //
      // The Life card is trashed, not dealt as damage: no Trigger fires and
      // nothing reaches their hand.
      "ST20-005",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "hand",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "st20-linlin-cost",
              1,
              {
                kind: "choice",
                chooser: "opponent",
                branches: [
                  {
                    id: "hand",
                    label: "Trash 2 cards from your hand",
                    effect: {
                      kind: "choose",
                      selector: { player: "opponent", zone: "hand" },
                      chooser: "opponent",
                      bind: "st20-linlin-hand",
                      min: 2,
                      max: 2,
                      effect: {
                        kind: "move",
                        binding: "st20-linlin-hand",
                        to: { player: "owner", zone: "trash" },
                      },
                    },
                  },
                  {
                    id: "life",
                    label: "Trash the top card of your Life cards",
                    effect: {
                      kind: "select",
                      selector: {
                        player: "opponent",
                        zone: "life",
                        position: "top",
                      },
                      bind: "st20-linlin-life",
                      count: 1,
                      effect: {
                        kind: "move",
                        binding: "st20-linlin-life",
                        to: { player: "owner", zone: "trash" },
                      },
                    },
                  },
                ],
              },
            ),
          },
        },
      },
    ],
  ],
  replacement: [
    [
      // ST20-002 Charlotte Cracker: once a turn, a Life card off the top
      // instead of dying to an effect.
      //
      // `removal: "ko"` and `effectOnly`, which is the printed "K.O.'d by an
      // effect" exactly: battle destruction is not an effect and is not
      // replaced, and neither flag beside `effectOnly` can say that --
      // `opponentEffectOnly` would narrow it to the other player's effects, and
      // this card's own controller has effects that K.O. too.
      //
      // The Life card pays for the body, which is the trade the whole product
      // is built on and the reason this is a 4-cost 5000 rather than a 6000.
      "ST20-002",
      {
        opponentEffectOnly: false,
        effectOnly: true,
        oncePerTurn: true,
        removal: "ko",
        label: "Trash the top card of your Life cards",
        cost: { kind: "trash-life", count: 1 },
      },
    ],
  ],
  trigger: [
    [
      // ST20-002 Charlotte Cracker: off the Life stack, a card out of hand puts
      // the body straight onto the board.
      //
      // The cost is what stops it being strictly better than drawing the card:
      // a 4-cost body for one card and no DON!!, on the opponent's turn, is the
      // reason the deck is happy to be hit.
      "ST20-002",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "st20-cracker-trigger",
            1,
            { kind: "play", binding: SOURCE_BINDING },
          ),
        },
      },
    ],
    [
      // ST20-003 Charlotte Brulee: look at the top of either Life stack, put it
      // back at either end, and keep the card.
      //
      // The same peek OP10-116 Damned Punk prints, so the fragment is shared:
      // the look is private, and "top" is deliberately a no-op placement while
      // "bottom" is the whole point -- burying a Trigger the opponent was about
      // to be handed, or moving one of your own up. Then the Trigger card goes
      // to hand rather than being lost, so the Life it came off is not a card
      // down.
      "ST20-003",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choice",
              branches: [
                {
                  id: "own-life",
                  label: "Look at the top card of your Life cards",
                  effect: peekLife("self", "st20-brulee-own"),
                },
                {
                  id: "opponent-life",
                  label: "Look at the top card of your opponent's Life cards",
                  effect: peekLife("opponent", "st20-brulee-theirs"),
                },
              ],
            },
            {
              kind: "move",
              binding: SOURCE_BINDING,
              to: { player: "self", zone: "hand" },
            },
          ],
        },
      },
    ],
    [
      // ST20-004 Charlotte Pudding: off the Life stack it rests a small body
      // instead, which is the half that matters on the opponent's turn.
      "ST20-004",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 3,
            canRest: true,
          },
          bind: "st20-pudding-trigger",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "st20-pudding-trigger" },
        },
      },
    ],
  ],
};
