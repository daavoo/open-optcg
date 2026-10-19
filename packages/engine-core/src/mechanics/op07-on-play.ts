/**
 * OP07 `[On Play]` programs.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP07-0xx` prints it from the local cache).
 *
 * One OP07 identity was in the pool before the set was, played by a community
 * deck that ships it: OP07-022 Otama (`op14-mihawk.ts`). Its program stays in
 * the module named after that deck, the same split OP08, OP09 and OP14 kept.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lifeToHandCost, lookAndAdd, payFromHand } from "./shared.js";
import { koCostAtMost, playFromHand, powerDebuff } from "./op08-shared.js";
import {
  addDonActive,
  addDonRested,
  bounceCostAtMost,
  buryCostAtMost,
  cpCard,
  donBehind,
  foxyLeader,
  kujaCard,
  lifeAtMost,
  millTwoThenCostDebuff,
  payFromTrash,
  restCostAtMost,
  twoKujaBodies,
} from "./op07-shared.js";

/**
 * "[Your Turn] [On Play] Up to 1 of your [<name>] cards gains +2000 power
 * during this turn."
 *
 * Three of the set's 1-cost 0-power bodies print it, each naming its own
 * archetype's headliner. `[Your Turn]` is not free even on an `[On Play]`: a
 * Character can reach the board on the other player's turn through a Counter or
 * a Trigger, and the buff would then be spent on a turn nobody attacks in.
 *
 * The Leader is a legal recipient -- the printed clause says "cards", and each
 * of the three names an identity the format also prints as a Leader.
 */
const buffNamedCard = (name: string, bind: string): MechanicEffect => ({
  kind: "if",
  condition: { kind: "turn-player", player: "self" },
  then: {
    kind: "choose",
    selector: { player: "self", zone: "board", includeLeader: true, name },
    bind,
    min: 0,
    max: 1,
    effect: {
      kind: "modify-power",
      binding: bind,
      amount: 2_000,
      expiresAfterTurns: 0,
    },
  },
});

/**
 * "Play up to 1 [<name>] with a cost of C or less from your hand rested."
 *
 * OP07-025 Coribou and OP07-049 Buckin are the same card at different names:
 * a 3-cost and a 2-cost body that pull their printed partner out of hand for
 * free. The cost ceiling is on the *effective* cost, which is the reading
 * every other "cost N or less" in the pool takes.
 */
const playPartnerRested = (
  name: string,
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "self", zone: "hand", name, maxCost },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "play", binding: bind, rested: true },
});

export const op07OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP07-002 Ain: a 7-cost body that turns any Character into a 0.
      //
      // `set-base-power` rather than a −N modifier, because "set the power to
      // 0" replaces the printed figure instead of subtracting from it: two of
      // these on one body would otherwise read −(power) twice. DON!! given to
      // the target still adds on top, which is what the layer order says.
      "OP07-002",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "op07-ain-zero",
          min: 0,
          max: 1,
          effect: {
            kind: "set-base-power",
            binding: "op07-ain-zero",
            value: 0,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP07-004 Curly.Dadan: a hand card for a dig five deep, restricted to
      // the small bodies the Red rush deck plays.
      //
      // Printed power, not current: the card the search reaches is still in the
      // deck, where nothing has modified it.
      "OP07-004",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op07-dadan-cost",
            1,
            lookAndAdd(5, "op07-dadan-look", {
              category: "character",
              maxPower: 2_000,
            }).effect,
          ),
        },
      },
    ],
    [
      // OP07-005 Carina: the Blocker half is printed text; this is the debuff.
      "OP07-005",
      { effect: powerDebuff(2_000, "op07-carina-debuff") },
    ],
    [
      // OP07-006 Sterry: a 1-cost that rummages by mortgaging the Leader.
      //
      // The cost is a −5000 on the player's *own active* Leader, which is a
      // real price on the turn it is paid: a 5000 Leader at 0 loses every fight
      // it is in. `rested: false` is the printed "active", and the payoff is
      // nested inside the cost's `choose` so a rested Leader cannot buy it.
      "OP07-006",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: [],
              includeLeader: true,
              rested: false,
            },
            bind: "op07-sterry-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "modify-power",
                  binding: "op07-sterry-cost",
                  amount: -5_000,
                  expiresAfterTurns: 0,
                },
                { kind: "draw", player: "self", count: 1 },
                payFromHand(
                  { player: "self", zone: "hand" },
                  "op07-sterry-discard",
                  1,
                  { kind: "sequence", effects: [] },
                ),
              ],
            },
          },
        },
      },
    ],
    [
      // OP07-009 Dogura & Magura: [Double Attack] handed to a red 1-drop, which
      // in this set means Sterry or Masked Deuce carrying the turn's DON!!.
      //
      // Cost exactly 1, not "1 or less": `minCost` and `maxCost` together are
      // how the pool writes an exact figure.
      "OP07-009",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            color: "Red",
            minCost: 1,
            maxCost: 1,
          },
          bind: "op07-dogura-target",
          min: 0,
          max: 1,
          effect: {
            kind: "grant-keyword",
            binding: "op07-dogura-target",
            keyword: "Double Attack",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP07-012 Porchemy: the set's cheapest debuff.
      "OP07-012",
      { effect: powerDebuff(1_000, "op07-porchemy-debuff") },
    ],
    [
      // OP07-013 Masked Deuce: the Ace deck's dig, gated on the Leader's name
      // rather than on a type -- the format prints several [Portgas.D.Ace]
      // Leaders and this reaches all of them.
      //
      // The reveal is a two-branch disjunction where the second branch needs
      // two facts at once ("red" *and* "Event"), which is what the conjunctive
      // `anyOf` clause is for: `{ category: "event" }` alone would also fetch
      // an off-colour Event.
      "OP07-013",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Portgas.D.Ace",
          },
          then: lookAndAdd(5, "op07-deuce-look", {
            anyOf: [
              { name: "Portgas.D.Ace" },
              { color: "Red", category: "event" },
            ],
          }).effect,
        },
      },
    ],
    [
      // OP07-014 Moda: the Ace buff.
      "OP07-014",
      { effect: buffNamedCard("Portgas.D.Ace", "op07-moda-buff") },
    ],
    [
      // OP07-015 Monkey.D.Dragon: [Rush] is printed text; this is the gift.
      //
      // Rested DON!! given to a body that is about to attack is what makes an
      // 8-cost 9000 a 13000 the turn it lands. The Leader is a legal recipient,
      // which `give-rested-don` is the only node that reaches.
      "OP07-015",
      { effect: { kind: "give-rested-don", player: "self", count: 2 } },
    ],
    [
      // OP07-025 Coribou: its printed partner, out of hand and rested.
      "OP07-025",
      { effect: playPartnerRested("Caribou", 4, "op07-coribou-play") },
    ],
    [
      // OP07-026 Jewelry Bonney: one rested thing held down through the
      // opponent's Refresh Phase -- a Character or a DON!! card.
      //
      // A `choice` rather than one selector, because no `CardSelector` can span
      // the two: `CardZone` has no DON!! zone. Each branch is gated on there
      // being something for it to reach, so a board with no rested Character
      // (or a cost area with no rested DON!!) is not offered a branch that
      // resolves to nothing.
      "OP07-026",
      {
        effect: {
          kind: "choice",
          branches: [
            {
              id: "character",
              label: "Hold down a rested Character",
              effect: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  rested: true,
                },
                bind: "op07-bonney-lock",
                min: 0,
                max: 1,
                effect: {
                  kind: "restrict",
                  binding: "op07-bonney-lock",
                  restriction: "cannot-refresh",
                  expiresAfterTurns: 1,
                },
              },
            },
            {
              id: "don",
              label: "Hold down a rested DON!! card",
              effect: {
                kind: "if",
                condition: {
                  kind: "rested-don",
                  player: "opponent",
                  operator: "gte",
                  value: 1,
                },
                then: {
                  kind: "hold-don-from-refresh",
                  player: "opponent",
                  count: 1,
                },
              },
            },
          ],
        },
      },
    ],
    [
      // OP07-032 Fisher Tiger: [Rush: Character] is a layer in
      // `static-abilities.ts`; this is the rest.
      //
      // Either Leader type opens it, so the gate is a disjunction rather than
      // two entries -- a Leader carrying both is still one Leader.
      "OP07-032",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "any-of",
            conditions: [
              { kind: "leader-has-type", player: "self", type: "Fish-Man" },
              { kind: "leader-has-type", player: "self", type: "Merfolk" },
            ],
          },
          then: restCostAtMost(6, "op07-tiger-rest"),
        },
      },
    ],
    [
      // OP07-040 Crocodile: a rested DON!! buys a bounce.
      //
      // "1 Character" names no side, so `player: "either"` and the card goes
      // back to *its* owner's hand -- returning your own 2-drop to replay it is
      // a line this card is printed to allow.
      "OP07-040",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "active-don",
            player: "self",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "rest-don", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "either",
                  zone: "board",
                  category: "character",
                  maxCost: 2,
                },
                bind: "op07-crocodile-bounce",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op07-crocodile-bounce",
                  to: { player: "owner", zone: "hand" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP07-041 Gloriosa (Grandma Nyon): the Kuja dig.
      "OP07-041",
      lookAndAdd(5, "op07-gloriosa-look", {
        ...kujaCard,
        excludeName: "Gloriosa (Grandma Nyon)",
      }),
    ],
    [
      // OP07-043 Salome: the Hancock buff.
      "OP07-043",
      { effect: buffNamedCard("Boa Hancock", "op07-salome-buff") },
    ],
    [
      // OP07-044 Dracule Mihawk: an 8-cost 10000 that replaces itself.
      "OP07-044",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP07-045 Jinbe: a Warlord out of hand for free, named so a second copy
      // of this card cannot chain into itself.
      "OP07-045",
      {
        effect: playFromHand(
          {
            category: "character",
            type: "The Seven Warlords of the Sea",
            maxCost: 4,
            excludeName: "Jinbe",
          },
          "op07-jinbe-play",
        ),
      },
    ],
    [
      // OP07-046 Sengoku: the Warlord dig, with no "other than" -- a second
      // copy of this 1-drop is a legal find.
      "OP07-046",
      lookAndAdd(5, "op07-sengoku-look", {
        type: "The Seven Warlords of the Sea",
      }),
    ],
    [
      // OP07-049 Buckin: its printed partner, out of hand and rested.
      "OP07-049",
      { effect: playPartnerRested("Edward Weevil", 4, "op07-buckin-play") },
    ],
    [
      // OP07-050 Boa Sandersonia: a bounce the Kuja board has to earn.
      "OP07-050",
      {
        effect: {
          kind: "if",
          condition: twoKujaBodies,
          then: bounceCostAtMost(3, "op07-sandersonia-bounce"),
        },
      },
    ],
    [
      // OP07-051 Boa Hancock: the set's most expensive [On Play], and two
      // clauses in one sentence.
      //
      // The attack lock names every Character but one identity, which is
      // Bandai's usual way of stopping the clause answering the deck it is
      // printed against. The bury after it names no side at all.
      "OP07-051",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                excludeName: "Monkey.D.Luffy",
              },
              bind: "op07-hancock-lock",
              min: 0,
              max: 1,
              effect: {
                kind: "restrict",
                binding: "op07-hancock-lock",
                restriction: "cannot-attack",
                expiresAfterTurns: 1,
              },
            },
            buryCostAtMost(1, "op07-hancock-bury"),
          ],
        },
      },
    ],
    [
      // OP07-052 Boa Marigold: the same board gate, one step wider than
      // Sandersonia's and burying rather than bouncing.
      "OP07-052",
      {
        effect: {
          kind: "if",
          condition: twoKujaBodies,
          then: buryCostAtMost(2, "op07-marigold-bury"),
        },
      },
    ],
    [
      // OP07-053 Portgas.D.Ace: draw two, put two back at either end.
      //
      // `order-to-bottom` with an `alternate` is the pool's shape for "at the
      // top or bottom of your deck in any order": the split and the order are
      // one decision, which is what makes keeping a hit on top worth the two
      // cards.
      "OP07-053",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op07-ace-back",
              min: 2,
              max: 2,
              effect: {
                kind: "order-to-bottom",
                binding: "op07-ace-back",
                to: { player: "self", zone: "deck", position: "top" },
                alternate: { player: "self", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP07-054 Marguerite: a 3-cost Blocker that replaces itself.
      "OP07-054",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP07-061 Vinsmoke Sanji: `DON!! −1` for a card, behind the Germa
      // Leader. The cost is paid before the gate is read, which is what the
      // printed order says -- the DON!! goes back either way.
      "OP07-061",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 1 },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-type",
                    player: "self",
                    type: "The Vinsmoke Family",
                  },
                  then: { kind: "draw", player: "self", count: 1 },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP07-062 Vinsmoke Reiju: a 1-cost body picked back up while behind on
      // DON!!, which is how the Germa package replays its own [On Play]s.
      "OP07-062",
      {
        effect: {
          kind: "if",
          condition: donBehind,
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              type: "The Vinsmoke Family",
              minCost: 1,
              maxCost: 1,
            },
            bind: "op07-reiju-bounce",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op07-reiju-bounce",
              to: { player: "owner", zone: "hand" },
            },
          },
        },
      },
    ],
    [
      // OP07-063 Capote: `DON!! −1` for an attack lock, behind the Foxy Leader.
      "OP07-063",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 1 },
                {
                  kind: "if",
                  condition: foxyLeader,
                  then: {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                      maxCost: 6,
                    },
                    bind: "op07-capote-lock",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "restrict",
                      binding: "op07-capote-lock",
                      restriction: "cannot-attack",
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
      // OP07-065 Gina: the only ramp in the package that arrives *active*, and
      // it is behind both of the archetype's gates at once.
      "OP07-065",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [foxyLeader, donBehind],
          },
          then: addDonActive,
        },
      },
    ],
    [
      // OP07-066 Tony Tony.Chopper: a 2-cost Blocker that ramps while behind.
      "OP07-066",
      { effect: { kind: "if", condition: donBehind, then: addDonRested } },
    ],
    [
      // OP07-070 Big Bun: a 6-cost that brings a fourth body with it.
      //
      // "{Foxy Pirates} type card", not Character: the type is on this set's
      // Events too, and playing one out of hand for free is what the wider
      // word buys.
      "OP07-070",
      {
        effect: {
          kind: "if",
          condition: donBehind,
          then: playFromHand(
            { type: "Foxy Pirates", maxCost: 4 },
            "op07-bigbun-play",
          ),
        },
      },
    ],
    [
      // OP07-072 Porche: `DON!! −1` for the package's widest single turn --
      // a dig five deep and then a free body out of hand.
      //
      // The play is printed after "place the rest at the bottom", so it is
      // sequenced after the search rather than nested in it: a search that
      // finds nothing still buys the body.
      "OP07-072",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 1 },
                lookAndAdd(5, "op07-porche-look", { type: "Foxy Pirates" })
                  .effect,
                playFromHand(
                  { category: "character", color: "Purple", maxPower: 4_000 },
                  "op07-porche-play",
                ),
              ],
            },
          },
        },
      },
    ],
    [
      // OP07-080 Kaku: two "CP" cards out of the trash for the set's deepest
      // cost debuff -- a −3 puts most of the format inside Black's removal.
      "OP07-080",
      {
        effect: payFromTrash(
          2,
          "op07-kaku-cost",
          {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op07-kaku-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-cost",
              binding: "op07-kaku-debuff",
              amount: -3,
              expiresAfterTurns: 0,
            },
          },
          cpCard,
        ),
      },
    ],
    [
      // OP07-082 Captain John: mill two, shrink one.
      "OP07-082",
      { effect: millTwoThenCostDebuff(1, "op07-john-debuff") },
    ],
    [
      // OP07-085 Stussy: a 9-cost that trades a body for unconditional removal.
      //
      // The cost is one of the controller's *own* Characters, and the removal
      // it buys has no ceiling at all -- the only such clause in the set. The
      // payoff is nested inside the cost so declining it buys nothing. Stussy
      // itself is a legal payment (Bandai's OP07-085#1): the cost names any of
      // its controller's Characters with no exception, so a board of one --
      // this card, just played -- can still trade it for the K.O.
      "OP07-085",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
            },
            bind: "op07-stussy-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op07-stussy-cost",
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op07-stussy-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op07-stussy-ko" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP07-086 Spandam: the same mill, one step deeper on the debuff.
      "OP07-086",
      { effect: millTwoThenCostDebuff(2, "op07-spandam-debuff") },
    ],
    [
      // OP07-088 Hattori: the Lucci buff.
      "OP07-088",
      { effect: buffNamedCard("Rob Lucci", "op07-hattori-buff") },
    ],
    [
      // OP07-090 Morgans: a discard the *opponent* chooses, then their whole
      // hand face-up, then a card back.
      //
      // The reveal is the point rather than the discard: a 2-cost that shows
      // Black what it is playing against, and the draw is what keeps the
      // opponent's card count where it was. `chooser: "opponent"` is the rule
      // for anything trashed out of a hand.
      "OP07-090",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: { player: "opponent", zone: "hand" },
              bind: "op07-morgans-trash",
              chooser: "opponent",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op07-morgans-trash",
                to: { player: "opponent", zone: "trash" },
              },
            },
            {
              kind: "select",
              selector: { player: "opponent", zone: "hand" },
              bind: "op07-morgans-reveal",
              count: "all",
              effect: { kind: "reveal", binding: "op07-morgans-reveal" },
            },
            { kind: "draw", player: "opponent", count: 1 },
          ],
        },
      },
    ],
    [
      // OP07-092 Joseph: the cheapest of the "CP" recursion costs, and the
      // narrowest payoff.
      "OP07-092",
      {
        effect: payFromTrash(
          2,
          "op07-joseph-cost",
          koCostAtMost(1, "op07-joseph-ko"),
          cpCard,
        ),
      },
    ],
    [
      // OP07-093 Rob Lucci: three cards out of the trash -- any three, which
      // is what makes this the most expensive of the set's recursion costs --
      // for a discard and a card out of the opponent's own trash.
      //
      // The second half is "up to 1", so it is declinable on its own: a trash
      // with nothing worth burying still leaves the discard paid for.
      "OP07-093",
      {
        effect: payFromTrash(3, "op07-lucci-cost", {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: { player: "opponent", zone: "hand" },
              bind: "op07-lucci-discard",
              chooser: "opponent",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op07-lucci-discard",
                to: { player: "opponent", zone: "trash" },
              },
            },
            {
              kind: "choose",
              selector: { player: "opponent", zone: "trash" },
              bind: "op07-lucci-bury",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "op07-lucci-bury",
                to: { player: "opponent", zone: "deck", position: "bottom" },
              },
            },
          ],
        }),
      },
    ],
    [
      // OP07-100 Edison: a draw-two that only exists once the Yellow deck has
      // spent its Life down, and pays for itself with two cards from hand.
      "OP07-100",
      {
        effect: {
          kind: "if",
          condition: lifeAtMost(2),
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              payFromHand(
                { player: "self", zone: "hand" },
                "op07-edison-discard",
                2,
                { kind: "sequence", effects: [] },
              ),
            ],
          },
        },
      },
    ],
    [
      // OP07-110 York: a Life card into hand buys removal.
      //
      // Paying with Life is not losing the card -- it joins the hand, which is
      // what damage would have done anyway. What it costs is the Life total,
      // and `lifeToHandCost` names the two cards at the edges of the stack,
      // which is the printed "top or bottom".
      "OP07-110",
      lifeToHandCost(koCostAtMost(2, "op07-york-ko")),
    ],
    [
      // OP07-111 Lilith: the Egghead dig.
      "OP07-111",
      lookAndAdd(5, "op07-lilith-look", {
        type: "Egghead",
        excludeName: "Lilith",
      }),
    ],
    [
      // OP07-118 Sabo: one card from hand for two K.O.s at different ceilings.
      //
      // Two `choose` steps rather than one of two cards: the ceilings differ,
      // and `excludeBinding` is what stops the wider one taking the body the
      // narrower one already answered.
      "OP07-118",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op07-sabo-cost",
            1,
            {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 5,
                  },
                  bind: "op07-sabo-ko-five",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op07-sabo-ko-five" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 3,
                    excludeBinding: "op07-sabo-ko-five",
                  },
                  bind: "op07-sabo-ko-three",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op07-sabo-ko-three" },
                },
              ],
            },
          ),
        },
      },
    ],
    [
      // OP07-119 Portgas.D.Ace: a 10-cost that buys back a Life card and then
      // reads the *new* total to decide whether it can attack.
      //
      // The order is printed and load-bearing: banking the card first is what
      // can push the player back over the ceiling, so an Ace played at two Life
      // arrives without [Rush] unless the bank is declined.
      "OP07-119",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "optional",
              effect: {
                kind: "select",
                selector: { player: "self", zone: "deck", position: "top" },
                bind: "op07-ace-life",
                count: 1,
                effect: {
                  kind: "move",
                  binding: "op07-ace-life",
                  to: { player: "self", zone: "life", position: "top" },
                },
              },
            },
            {
              kind: "if",
              condition: lifeAtMost(2),
              then: {
                kind: "grant-keyword",
                binding: SOURCE_BINDING,
                keyword: "Rush",
                expiresAfterTurns: 0,
              },
            },
          ],
        },
      },
    ],
  ],
};
