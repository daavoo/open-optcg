/**
 * EB-02's `[Main]` Events and its `[Activate: Main]` abilities.
 *
 * Six of the eleven Events are the {Music} cycle -- one 2-cost search per
 * colour, identical text six times -- and six of the nine activations are paid
 * for by the source itself, so most entries here open with a `rest` or a `move`
 * of `SOURCE_BINDING` and set `requires.sourceActive`.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import type { MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, payFromHand } from "./shared.js";
import { donParity, musicSearch } from "./eb02-shared.js";

/** "K.O. up to 1 of your opponent's Characters with a cost of N or less." */
const koOpponentUpToCost = (maxCost: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: bind },
});

/** "Give up to 1 of your opponent's Characters −N cost during this turn." */
const shrinkOpponentCost = (amount: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "opponent", zone: "board", category: "character" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-cost",
    binding: bind,
    amount: -amount,
    expiresAfterTurns: 0,
  },
});

export const eb02MainMechanics: SetMechanics = {
  eventMain: [
    [
      // EB02-007 Cloven Rose Blizzard (3).
      //
      // "Up to a total of 3 of your Leader and Character cards" is one `choose`
      // with a count rather than three: the binding holds every card picked and
      // `modify-power` pays each of them, which is what "a total of 3" means.
      // `includeLeader` is what puts the Leader in the same list as the bodies,
      // the way the printed sentence does.
      //
      // The K.O. reads *current* power, so the +1000 this Event just handed out
      // does not move it -- the buff is on the controller's own cards and the
      // ceiling is on the opponent's. Its `[Trigger]` half reaches one power
      // band higher and is in `eb02-triggers.ts`.
      "EB02-007",
      {
        cost: 3,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  includeLeader: true,
                },
                bind: "eb02-007-buff",
                min: 0,
                max: 3,
                effect: {
                  kind: "modify-power",
                  binding: "eb02-007-buff",
                  amount: 1_000,
                  expiresAfterTurns: 0,
                },
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCurrentPower: 3_000,
                },
                bind: "eb02-007-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "eb02-007-ko" },
              },
            ],
          },
        },
      },
    ],
    // The {Music} cycle: one 2-cost search per colour, the same program six
    // times. See `musicSearch` in `eb02-shared.ts`; each also prints
    // "[Trigger] Activate this card's [Main] effect", registered against the
    // same program in `eb02-triggers.ts`.
    ["EB02-008", { cost: 2, program: musicSearch }],
    ["EB02-020", { cost: 2, program: musicSearch }],
    ["EB02-031", { cost: 2, program: musicSearch }],
    ["EB02-040", { cost: 2, program: musicSearch }],
    ["EB02-050", { cost: 2, program: musicSearch }],
    ["EB02-058", { cost: 2, program: musicSearch }],
    [
      // EB02-021 Gum-Gum Giant Pistol (3).
      //
      // +6000 is the biggest single-target buff in the set and the price is
      // printed on the same card: the body that takes it stays rested through
      // the controller's *own* next Refresh Phase, so the attack it wins is
      // paid for with the following turn's block. `expiresAfterTurns: 2` is
      // that Refresh Phase -- this turn, the opponent's, then the controller's.
      //
      // "The selected Character" is the same binding, which is what makes the
      // two sentences one decision rather than two.
      "EB02-021",
      {
        cost: 3,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              type: "Straw Hat Crew",
            },
            bind: "eb02-021-target",
            min: 0,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "modify-power",
                  binding: "eb02-021-target",
                  amount: 6_000,
                  expiresAfterTurns: 0,
                },
                {
                  kind: "restrict",
                  binding: "eb02-021-target",
                  restriction: "cannot-refresh",
                  expiresAfterTurns: 2,
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB02-039 GERMA 66 (4).
      //
      // The only clause in the pool whose target is named by a card the same
      // program chose a moment earlier: "the same card name as the trashed
      // card". `sameNameAsBinding` is what says it -- the name is the player's
      // pick, not a printed constant -- and the two power bands keep the trade
      // honest in both directions: a 4000-or-less {GERMA 66} out of hand buys a
      // 5000-to-7000 body of the same name out of the trash.
      //
      // The trash is a cost, so the play is nested inside its `choose`: a hand
      // with no {GERMA 66} body cannot reach the payoff. `trashFromHand` on the
      // entry is what lets the *offer* say the same thing, so the Event is
      // never put on the table for a hand that cannot pay it.
      "EB02-039",
      {
        cost: 4,
        trashFromHand: 1,
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              {
                player: "self",
                zone: "hand",
                category: "character",
                type: "GERMA 66",
                maxPower: 4_000,
              },
              "eb02-039-cost",
              1,
              {
                kind: "if",
                condition: donParity,
                then: {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "trash",
                    category: "character",
                    minPower: 5_000,
                    maxPower: 7_000,
                    sameNameAsBinding: "eb02-039-cost",
                  },
                  bind: "eb02-039-play",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "eb02-039-play" },
                },
              },
            ),
          },
        },
      },
    ],
    [
      // EB02-051 Three-Pace Hum Soul Notch Slash (3).
      //
      // A `choice`, not two `optional`s: the printed "Choose one" offers both
      // branches and allows exactly one. The two answer different boards -- the
      // K.O. kills a 2-drop outright, and −4 cost is what brings a 6-drop
      // inside the reach of the Black removal the deck plays after it.
      "EB02-051",
      {
        cost: 3,
        program: {
          effect: {
            kind: "choice",
            branches: [
              {
                id: "ko",
                label: "K.O. a Character with a cost of 2 or less",
                effect: koOpponentUpToCost(2, "eb02-051-ko"),
              },
              {
                id: "shrink",
                label: "Give a Character −4 cost during this turn",
                effect: shrinkOpponentCost(4, "eb02-051-shrink"),
              },
            ],
          },
        },
      },
    ],
  ],
  activateMain: [
    [
      // EB02-002 Sabo.
      //
      // Repeatable -- no `[Once Per Turn]` -- so the source resting is the whole
      // price, and `requires.sourceActive` is what stops the offer standing on
      // an already-rested Sabo where taking it would change nothing.
      //
      // `excludeName` is the printed "other than [Sabo]", and it reads names
      // rather than instances: a second copy is not a target either.
      "EB02-002",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
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
                    type: "Revolutionary Army",
                    excludeName: "Sabo",
                  },
                  bind: "eb02-002-buff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "eb02-002-buff",
                    amount: 2_000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB02-006 Yamato.
      //
      // `[Once Per Turn]` and no cost at all beyond the Leader gate, so the
      // gate is the whole price -- and the activation is withheld from a deck
      // led by anything else rather than offered and resolving to nothing.
      //
      // [Rush] on a 6-cost 7000 body is what the clause is for: the gift is
      // "up to 1", so a player with no rested DON!! still gets the keyword.
      "EB02-006",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "any-of",
              conditions: [
                {
                  kind: "leader-has-type",
                  player: "self",
                  type: "Land of Wano",
                },
                {
                  kind: "leader-has-name",
                  player: "self",
                  name: "Portgas.D.Ace",
                },
              ],
            },
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "attach-don",
                  player: "self",
                  from: "rested",
                  count: 1,
                  target: "leader",
                },
                {
                  kind: "grant-keyword",
                  binding: SOURCE_BINDING,
                  keyword: "Rush",
                  expiresAfterTurns: 0,
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB02-009 Thousand Sunny (Stage).
      //
      // `from: "given"` is the printed "your currently given DON!! cards": the
      // DON!! is already on the field as power and this moves it between two
      // cards rather than spending it. That is what makes a Stage worth a card
      // in a deck that gives DON!! to its Leader -- the power can be
      // re-pointed at the body that needs it after blocks are declared.
      //
      // `requires.givenDon` is the gate: with nothing given there is nothing to
      // move, and the activation is repeatable, so an empty offer would stand
      // all turn.
      "EB02-009",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, givenDon: 1 },
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
                    type: "Straw Hat Crew",
                  },
                  bind: "eb02-009-target",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "attach-don",
                    player: "self",
                    from: "given",
                    count: 1,
                    target: { binding: "eb02-009-target" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB02-010 Monkey.D.Luffy (Leader).
      //
      // `DON!! −2` to set two DON!! active is DON!! -neutral on the field and
      // *positive* on the turn: the two that come back are spendable and the two
      // that left were already rested. What it actually buys is the +1000
      // through the opponent's next turn, which is a Leader defending at 6000.
      //
      // `every-character-matches` is the printed "if the only Characters on your
      // field are {Straw Hat Crew} type": vacuously true on an empty board,
      // which is the reading -- the clause bans off-type bodies, it does not
      // demand on-type ones.
      //
      // Both halves sit inside the gate. `requires.fieldDon` is what keeps the
      // `[Once Per Turn]` from being spent on a cost that cannot be paid.
      "EB02-010",
      {
        oncePerTurn: true,
        requires: { fieldDon: 2 },
        program: {
          effect: donMinus(2, {
            kind: "if",
            condition: {
              kind: "every-character-matches",
              player: "self",
              selector: { zone: "board", type: "Straw Hat Crew" },
            },
            then: {
              kind: "sequence",
              effects: [
                { kind: "activate-don", player: "self", count: 2 },
                {
                  kind: "select",
                  selector: {
                    player: "self",
                    zone: [],
                    includeLeader: true,
                  },
                  bind: "eb02-010-leader",
                  count: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "eb02-010-leader",
                    amount: 1_000,
                    expiresAfterTurns: 1,
                  },
                },
              ],
            },
          }),
        },
      },
    ],
    [
      // EB02-025 Donquixote Rosinante.
      //
      // Two costs at once -- a rested DON!! and the source -- and both are
      // ahead of the Leader gate, which is printed that way: the cost is paid
      // and only then does the clause ask whose Leader this is. `requires`
      // carries both so neither is offered unpayable.
      //
      // The body arrives *rested* and from the top five of the deck, not the
      // hand: what this buys is a blocker for the opponent's turn out of a
      // resource the deck was not otherwise spending.
      "EB02-025",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, activeDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-name",
                    player: "self",
                    name: "Donquixote Rosinante",
                  },
                  then: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "look-at",
                        player: "self",
                        count: 5,
                        bind: "eb02-025-look",
                      },
                      {
                        kind: "choose",
                        selector: {
                          player: "self",
                          zone: "deck",
                          binding: "eb02-025-look",
                          category: "character",
                          maxCost: 2,
                        },
                        bind: "eb02-025-play",
                        min: 0,
                        max: 1,
                        effect: {
                          kind: "play",
                          binding: "eb02-025-play",
                          rested: true,
                        },
                      },
                      {
                        kind: "select",
                        selector: {
                          player: "self",
                          zone: "deck",
                          binding: "eb02-025-look",
                        },
                        bind: "eb02-025-rest",
                        count: "all",
                        effect: {
                          kind: "order-to-bottom",
                          binding: "eb02-025-rest",
                          to: {
                            player: "self",
                            zone: "deck",
                            position: "bottom",
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB02-041 Merry Go (Purple Stage): the `[Activate: Main]` half. Its
      // `[On Play]` is in `eb02-on-play.ts`.
      //
      // +2 cost is protection, not a stat buff: it lifts a body out of the
      // reach of "cost N or less" removal, and it holds through the opponent's
      // next turn, which is the turn that removal is cast on.
      "EB02-041",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "if",
                  condition: donParity,
                  then: {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                      type: "Straw Hat Crew",
                    },
                    bind: "eb02-041-protect",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "modify-cost",
                      binding: "eb02-041-protect",
                      amount: 2,
                      expiresAfterTurns: 1,
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB02-047 Blueno.
      //
      // The source is *trashed* rather than rested, which is what makes this a
      // conversion: a 5-cost body and a card from hand buy back any {CP} body
      // at 5 or less, and Blueno himself is in the trash afterwards for the next
      // one to fetch. `excludeName` is the printed "other than [Blueno]", and
      // it is load-bearing here for that reason -- without it the card could
      // fetch the copy it just trashed.
      //
      // `payFromHand` nests the payoff inside the hand cost, so an empty hand
      // cannot trash the Character for free; `requires.handCards` is the same
      // gate on the offer.
      "EB02-047",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "eb02-047-cost",
              1,
              {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: SOURCE_BINDING,
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "trash",
                      category: "character",
                      typeIncluding: "CP",
                      maxCost: 5,
                      excludeName: "Blueno",
                    },
                    bind: "eb02-047-play",
                    min: 0,
                    max: 1,
                    effect: { kind: "play", binding: "eb02-047-play" },
                  },
                ],
              },
            ),
          },
        },
      },
    ],
    [
      // EB02-049 Monkey.D.Garp: the `[Activate: Main]` half. Its `[On Play]` is
      // in `eb02-on-play.ts`.
      //
      // Repeatable, and the rest is the whole price -- but the Leader gate is
      // inside the cost rather than ahead of it, which is printed: the rest is
      // paid and only then does the clause ask. A cost-1 ceiling is narrow
      // enough that the offer is worth making every turn on the board this
      // Leader builds.
      "EB02-049",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-name",
                    player: "self",
                    name: "Monkey.D.Garp",
                  },
                  then: koOpponentUpToCost(1, "eb02-049-ko"),
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB02-060 Merry Go (Yellow Stage).
      //
      // Two costs, and the second is the Yellow one: a Life card turned
      // face-up is information the opponent gets to plan around, which is the
      // colour's currency. The buff holds through the opponent's next turn, so
      // what it pays for is the block rather than the attack.
      //
      // The face-up flip is a `choose` over a face-down Life card rather than a
      // `select` off the top, because a stack whose top is already face-up
      // cannot pay: `faceUp: false` and `position: "top"` together are "the
      // top card, if it is face-down", and a `choose` the selector cannot fill
      // is skipped -- which is what keeps the payoff nested behind the cost.
      "EB02-060",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, lifeCards: 1 },
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
                    zone: "life",
                    position: "top",
                    faceUp: false,
                  },
                  bind: "eb02-060-life",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "update",
                        binding: "eb02-060-life",
                        faceUp: true,
                      },
                      {
                        kind: "choose",
                        selector: {
                          player: "self",
                          zone: "board",
                          category: "character",
                          type: "Straw Hat Crew",
                        },
                        bind: "eb02-060-buff",
                        min: 0,
                        max: 1,
                        effect: {
                          kind: "modify-power",
                          binding: "eb02-060-buff",
                          amount: 1_000,
                          expiresAfterTurns: 1,
                        },
                      },
                    ],
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
