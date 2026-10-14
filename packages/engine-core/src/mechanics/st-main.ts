/**
 * Starter-deck cards whose clauses were hand-written branches.
 *
 * One module rather than one per starter: these are the ST identities the
 * activation register in `legal-actions/main/activations.ts` held, and they have
 * nothing in common but that. A starter that grows a second declarative card
 * should get its own module the way `st21.ts` has one, as ST23-004 moved to
 * `st23.ts` once ST-23 came in.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { lookAndAdd } from "./shared.js";
import { type SetMechanics } from "./registry.js";

export const stMainMechanics: SetMechanics = {
  activateMain: [
    [
      // ST30-014 Mr.3(Galdino): "You may rest this Character: Give up to 2 of
      // your Characters with 6000 base power up to 2 rested DON!! cards each."
      //
      // `attach-don` with `each` rather than `give-rested-don`: the printed
      // "each" pays every card the choice names, and `give-rested-don` hands
      // its whole count to one recipient. `minPower`/`maxPower` are printed
      // power, which is what "6000 base power" says -- the branch this replaces
      // compared the card database's `power` field for the same reason.
      "ST30-014",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, restedDon: 1 },
        program: {
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
                    minPower: 6000,
                    maxPower: 6000,
                  },
                  bind: "st30-mr3-gift",
                  min: 0,
                  max: 2,
                  effect: {
                    kind: "attach-don",
                    player: "self",
                    from: "rested",
                    count: 2,
                    target: { binding: "st30-mr3-gift", each: true },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // ST31-005 Thousand Sunny (Stage): "You may rest this Stage: Give up to 1
      // rested DON!! card to 1 of your [Monkey.D.Luffy] cards."
      //
      // "Cards", so the Leader is a recipient -- `give-rested-don` is the node
      // whose offer already spans the Leader and the board, and `name` is what
      // narrows it to the printed identity.
      "ST31-005",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, restedDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "give-rested-don",
                  player: "self",
                  count: 1,
                  name: "Monkey.D.Luffy",
                },
              ],
            },
          },
        },
      },
    ],
    [
      // ST36-005 Eustass"Captain"Kid: "[Once Per Turn] You may turn 1 card from
      // the top or bottom of your Life cards face-up: Give up to 1 rested DON!!
      // card to your Leader."
      //
      // `position: "edge"` is the printed "top or bottom", and it is applied
      // before `faceUp`, so this names the two cards the clause can reach and
      // then keeps the ones it can actually turn. `attach-don` at the Leader
      // rather than `give-rested-don`: the text names one recipient.
      //
      // Its `[On Your Opponent's Attack]` half is below, and the two have
      // separate `[Once Per Turn]` budgets -- they always did, under two
      // different hand-written keys.
      "ST36-005",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "life",
                position: "edge",
                faceUp: false,
              },
              bind: "st36-kid-life",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "update",
                    binding: "st36-kid-life",
                    faceUp: true,
                  },
                  {
                    kind: "attach-don",
                    player: "self",
                    from: "rested",
                    count: 1,
                    target: "leader",
                  },
                ],
              },
            },
          },
        },
      },
    ],
  ],
  onPlay: [
    [
      // ST31-005 Thousand Sunny: "Look at 5 cards from the top of your deck;
      // reveal up to 1 {Straw Hat Crew} type card and add it to your hand.
      // Then, place the rest at the bottom of your deck in any order."
      //
      // The `[On Play]` was already imperative when the `[Activate: Main]` was,
      // and a card leaves the debt register only as a whole, so both moved
      // together.
      "ST31-005",
      lookAndAdd(5, "st31-sunny-look", { type: "Straw Hat Crew" }),
    ],
  ],
  onOpponentAttack: [
    [
      // ST36-005 Eustass"Captain"Kid: "[Once Per Turn] You may turn 1 card from
      // the top or bottom of your Life cards face-down: Change the target of
      // the attack to your [Eustass"Captain"Kid] with 5000 base power or more."
      //
      // The same shape OP16-080 Marshall.D.Teach has -- a cost, then a
      // `redirect-attack` -- with a Life card paying instead of a card from
      // hand. `programRedirectSelectors` already withholds the offer when no
      // legal recipient exists; `lifeCardsMatching` is the other half, and asks
      // the same question of the cost that `handCardsMatching` asks for
      // OP16-080's.
      //
      // This used to be built into `legal-actions/block.ts` as a `block` action
      // with a `:redirect:` id, which is why it is the one clause here that
      // changes shape rather than just moving: a redirect is not a block, and
      // the ladder that offers a defender's reactions is where it belongs.
      "ST36-005",
      {
        oncePerTurn: true,
        requires: {
          lifeCardsMatching: {
            match: { position: "edge", faceUp: true },
            count: 1,
          },
        },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "life",
                position: "edge",
                faceUp: true,
              },
              bind: "st36-kid-redirect-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "update",
                    binding: "st36-kid-redirect-cost",
                    faceUp: false,
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      includeLeader: true,
                      excludeAttackTarget: true,
                      name: 'Eustass"Captain"Kid',
                      minPower: 5000,
                    },
                    bind: "st36-kid-redirect",
                    min: 1,
                    max: 1,
                    effect: {
                      kind: "redirect-attack",
                      binding: "st36-kid-redirect",
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
};
