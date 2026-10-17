/**
 * EB-04 `[On Play]` programs.
 *
 * The set is a six-colour extra booster rather than one archetype, so unlike
 * `eb04-bonney.ts` -- which reads one Life ladder from six angles -- this module
 * has no single thread. What it does have is the booster's two recurring
 * prices: a body that rests or trashes *itself* to buy its own effect
 * (EB04-018, EB04-024, EB04-045, EB04-047), and `DON!! −1` on a Character that
 * would otherwise be a fair rate (EB04-033, EB04-036). Both are written as a
 * cost the payoff nests inside, never as a sequence, so a player who cannot pay
 * gets nothing rather than the payoff for free.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, lookAndAdd, payFromHand } from "./shared.js";

/**
 * "Draw 2 cards and trash 1 card from your hand."
 *
 * EB04-021 Igaram's `[On Play]` behind a Leader gate, EB04-027 Boa Hancock's
 * unconditionally, and EB04-036 Foxy's behind `DON!! −1`. Mandatory in all
 * three: the trash is a `choose` with `min: 1` because *which* card goes is the
 * decision, and after two draws the hand can always afford one.
 */
const drawTwoTrashOne = (bind: string): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "draw", player: "self", count: 2 },
    {
      kind: "choose",
      selector: { player: "self", zone: "hand" },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "move",
        binding: bind,
        to: { player: "self", zone: "trash" },
      },
    },
  ],
});

/**
 * "Rest up to 1 of your opponent's Characters with a cost of N or less."
 *
 * EB04-016's `[When Attacking]` at 8, EB04-030's `[On Play]` at 7, EB04-036's
 * at 9 and EB04-020's `[Trigger]` at 4. `maxCost` rather than `maxBaseCost`,
 * because a printed cost the opponent's own Leader has raised or lowered is the
 * cost the clause reads -- which is what makes EB04-046 Doll's `+2 cost` aura a
 * defence against exactly this line.
 */
export const restOpponentCharacterUpToCost = (
  bind: string,
  maxCost: number,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost,
    canRest: true,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "rest", binding: bind },
});

/**
 * "Play up to 1 <selector> Character card from your hand."
 *
 * EB04-017 at cost 5 gated on a {Minks} Leader, EB04-039 at 5 for {Kid
 * Pirates}, EB04-055's `[On K.O.]` at 4 for {Revolutionary Army}. `maxCost`
 * again: a discount the board is already applying is real, and the free play is
 * the whole payoff, so reading the printed number instead would refuse a play
 * the card allows.
 */
export const playFromHandUpToCost = (
  bind: string,
  type: string,
  maxCost: number,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "self",
    zone: "hand",
    category: "character",
    type,
    maxCost,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "play", binding: bind },
});

export const eb04OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // EB04-006 Moda. Printed text: `pnpm card:text EB04-006`.
      //
      // A 1-cost 0-power whose only job is to find the Stage. Seven deep for a
      // single named card, which is the depth a one-of needs: `name` rather
      // than `type`, because {Lulucia Kingdom} is a type both this card and the
      // Stage carry and the search would otherwise find more copies of Moda.
      "EB04-006",
      lookAndAdd(7, "eb04-006-look", { name: "Lulucia Kingdom" }),
    ],
    [
      // EB04-010 Lulucia Kingdom, the Stage. Printed text:
      // `pnpm card:text EB04-010`.
      //
      // `set-base-power` rather than a −N modifier: "set the power ... to 0" is
      // a replacement, so it composes as layer 1 and the DON!! the opponent
      // gives that Character afterwards still adds on top. That is the
      // difference between this and removal -- a 0-power body with two DON!! is
      // a 2000, and the Stage's own `[Opponent's Turn]` aura in
      // `static-abilities.ts` is what makes the tempo worth 7 cost.
      "EB04-010",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "eb04-010-zero",
          min: 0,
          max: 1,
          effect: {
            kind: "set-base-power",
            binding: "eb04-010-zero",
            value: 0,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // EB04-011 Scaled Neptunian. Printed text: `pnpm card:text EB04-011`.
      //
      // "Draw a card for each of your {Neptunian} type Characters. Then, trash
      // the same number" is a count the DSL has no node for: `draw` takes a
      // literal, and no effect reads a selector's size as a number. Written as
      // an exact-count chain instead -- `eq` on `selector-count`, one branch
      // per possible board -- which is exhaustive because five Characters is
      // the board limit and this card is itself one of them.
      //
      // Both halves of a branch are one sequence, so all N draws happen before
      // any trash: the printed "Then" is what makes the hand the draws produced
      // the hand the trash is paid from, and that is the whole card. A chain of
      // `gte` steps interleaving draw and trash would be a different, worse
      // card.
      //
      // What would let this be removed: a `count` on `draw` (and on a
      // trash-from-hand) that reads a selector's size, which is the shape a
      // second card printing "for each" would justify adding.
      "EB04-011",
      { effect: neptunianDrawThenTrash() },
    ],
    [
      // EB04-013 Carrot. Printed text: `pnpm card:text EB04-013`.
      //
      // Two targets with two different quantifiers in one sentence: the
      // Characters are "up to 2" and the Leader is not qualified at all, so the
      // Leader half is a `select` that cannot be declined and the Characters
      // half is a `choose` with `min: 0`. Sequenced in printed order.
      //
      // `canRest` is deliberately absent -- this sets cards *active*, so a
      // rest-immune or already-active card is a legal (if pointless) pick, and
      // filtering would be inventing a restriction the card does not print.
      "EB04-013",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Minks",
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  type: "Minks",
                },
                bind: "eb04-013-minks",
                min: 0,
                max: 2,
                effect: {
                  kind: "update",
                  binding: "eb04-013-minks",
                  rested: false,
                },
              },
              {
                kind: "select",
                selector: { player: "self", zone: [], includeLeader: true },
                bind: "eb04-013-leader",
                count: "all",
                effect: {
                  kind: "update",
                  binding: "eb04-013-leader",
                  rested: false,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB04-017 Mystoms. Printed text: `pnpm card:text EB04-017`.
      //
      // The free play is gated on the Leader's type and the aura half is gated
      // on a board count, so the two printed clauses are registered apart: the
      // `[Your Turn]` cost reduction is a row in `static-abilities.ts`. Read
      // together they are one card -- the played body is a third {Minks}, which
      // is what turns the aura on.
      "EB04-017",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Minks",
          },
          then: playFromHandUpToCost("eb04-017-play", "Minks", 5),
        },
      },
    ],
    [
      // EB04-018 Megalo. Printed text: `pnpm card:text EB04-018`.
      //
      // The rest is a cost and the K.O. is what it buys, so the K.O. is nested
      // inside the `optional` with the rest ahead of it rather than offered
      // beside it. `rested: true` on the target is printed and is the real
      // restriction: this answers a board that has already attacked, not a
      // blocker standing in front of one.
      //
      // `maxCurrentPower` because "8000 power or less" is read after DON!! --
      // an 8000 body that took two DON!! for the swing is out of range, which is
      // exactly the trade the opponent made.
      //
      // A cost that cannot be paid buys nothing, so the whole clause is gated
      // on Megalo still being active: one played rested by another effect
      // (OP13-031 Law plays its target that way) has no rest left to give.
      // Bandai's EB04-018 Q&A is the ruling.
      "EB04-018",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "board", binding: SOURCE_BINDING, rested: false },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    rested: true,
                    maxCurrentPower: 8_000,
                  },
                  bind: "eb04-018-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "eb04-018-ko" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB04-021 Igaram. Printed text: `pnpm card:text EB04-021`.
      //
      // `leader-has-name` rather than a type: the gate names one Leader, and
      // EB04-025's Vivi is a Character of the same name that does not satisfy
      // it. Its `[Activate: Main]` half is in `eb04-main.ts`.
      "EB04-021",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Nefeltari Vivi",
          },
          then: drawTwoTrashOne("eb04-021-trash"),
        },
      },
    ],
    [
      // EB04-022 Issho. Printed text: `pnpm card:text EB04-022`.
      //
      // Two cards out of hand for two cards out of theirs, and only against a
      // hand of six or more -- so the gate is inside the cost, not outside it.
      // A player who pays and finds the opponent below the line has paid for
      // nothing, which is what the printed order says: the trash is "you may",
      // the count is "if".
      //
      // `chooser: "opponent"` on the discard: the printed "your opponent
      // places" makes the choice theirs, and `order-to-bottom` is the "in any
      // order" -- two cards of different identities is the smallest position
      // where the order is a real decision. Its `[When Attacking]` half is in
      // `eb04-battle.ts`.
      "EB04-022",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "eb04-022-cost",
            2,
            {
              kind: "if",
              condition: {
                kind: "zone-count",
                player: "opponent",
                zone: "hand",
                operator: "gte",
                value: 6,
              },
              then: {
                kind: "choose",
                chooser: "opponent",
                selector: { player: "opponent", zone: "hand" },
                bind: "eb04-022-bottom",
                min: 2,
                max: 2,
                effect: {
                  kind: "order-to-bottom",
                  binding: "eb04-022-bottom",
                  to: { player: "opponent", zone: "deck", position: "bottom" },
                },
              },
            },
          ),
        },
      },
    ],
    [
      // EB04-023 Chaka & Pell. Printed text: `pnpm card:text EB04-023`.
      //
      // The cost is the Leader's own power for the turn, and "your active
      // Leader" is a real precondition: `rested: false` on the Leader selector
      // is what refuses the draw to a player who has already attacked. That is
      // the card's whole tension -- an 8-drop with [Double Attack] that wants
      // to develop *before* swinging, and pays 5000 off the Leader if it does.
      //
      // A `choose` with `min: 1` rather than an `if` on a condition, because
      // the pool has no "is my Leader rested" condition and the selector
      // already answers it: a rested Leader selects nothing, the choose is
      // skipped, and the draw nested inside it never happens.
      "EB04-023",
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
            bind: "eb04-023-leader",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "modify-power",
                  binding: "eb04-023-leader",
                  amount: -5_000,
                  expiresAfterTurns: 0,
                },
                { kind: "draw", player: "self", count: 2 },
              ],
            },
          },
        },
      },
    ],
    [
      // EB04-025 Nefeltari Vivi. Printed text: `pnpm card:text EB04-025`.
      //
      // A 7-cost 4000 body that is really a two-for-one: the free play is up to
      // 8 cost, so this can put out a bigger Character than itself. The
      // exclusion is by name and is load-bearing -- without it a second Vivi in
      // hand would chain.
      //
      // The opponent's discard is *not* conditional and has no "up to": it
      // resolves whether or not the free play found anything, which is why the
      // two are sequenced rather than nested.
      "EB04-025",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                type: "Alabasta",
                maxCost: 8,
                excludeName: "Nefeltari Vivi",
              },
              bind: "eb04-025-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "eb04-025-play" },
            },
            {
              kind: "choose",
              chooser: "opponent",
              selector: { player: "opponent", zone: "hand" },
              bind: "eb04-025-bottom",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb04-025-bottom",
                to: { player: "opponent", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // EB04-027 Boa Hancock. Printed text: `pnpm card:text EB04-027`.
      //
      // Its `[Trigger]` half is in `eb04-triggers.ts`, and the pair is the
      // card: a 5-cost 7000 that replaces itself on play and plays a body for
      // free off a Life flip.
      "EB04-027",
      { effect: drawTwoTrashOne("eb04-027-trash") },
    ],
    [
      // EB04-033 Groggy Monsters. Printed text: `pnpm card:text EB04-033`.
      //
      // `maxPower` rather than `maxCurrentPower`: "6000 base power or less" is
      // printed power, so DON!! on the target does not save it and a debuff
      // does not extend the reach. The three-body count includes this card,
      // which is what makes the `DON!! −1` payable on the same turn it lands.
      "EB04-033",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: {
              zone: "board",
              category: "character",
              type: "Foxy Pirates",
            },
            operator: "gte",
            value: 3,
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxPower: 6_000,
            },
            bind: "eb04-033-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "eb04-033-ko" },
          },
        }),
      },
    ],
    [
      // EB04-036 Foxy. Printed text: `pnpm card:text EB04-036`.
      //
      // The printed "Then, rest ..." sits inside the Leader-gated sentence, not
      // beside it: everything after the colon is one effect the `DON!! −1` buys
      // and the `If` opens, so a Foxy played behind another Leader returns the
      // DON!! for nothing rather than getting the rest for free. Reading it the
      // other way would make an 8-drop's rest colourless, which no other
      // Leader-gated clause in the pool is.
      //
      // Its `[Activate: Main]` half is in `eb04-main.ts`.
      "EB04-036",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Foxy Pirates",
          },
          then: {
            kind: "sequence",
            effects: [
              drawTwoTrashOne("eb04-036-trash"),
              restOpponentCharacterUpToCost("eb04-036-rest", 9),
            ],
          },
        }),
      },
    ],
    [
      // EB04-037 Porche. Printed text: `pnpm card:text EB04-037`.
      //
      // The set's own search, at 1 cost. No `excludeName`: {Foxy Pirates} is
      // what it looks for and finding a second Porche is a legal hit -- the
      // printed text names no exclusion, and this deck's 1-drops are what it
      // wants to chain.
      "EB04-037",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Foxy Pirates",
          },
          then: lookAndAdd(5, "eb04-037-look", { type: "Foxy Pirates" }).effect,
        },
      },
    ],
    [
      // EB04-039 Eustass"Captain"Kid. Printed text:
      // `pnpm card:text EB04-039`.
      //
      // "Add up to 1 DON!! card ... and set it as active" with no cost and no
      // condition, so it is a bare `add-don`: the "up to" is the empty DON!!
      // deck, which the node already resolves to nothing rather than to an
      // error. Active, so the DON!! pays for something this turn -- including
      // this card's own `[Activate: Main]`, which is in `eb04-main.ts`.
      "EB04-039",
      {
        effect: { kind: "add-don", player: "self", count: 1, rested: false },
      },
    ],
    [
      // EB04-042 Alpha. Printed text: `pnpm card:text EB04-042`.
      //
      // Three cards off the top for one cost, which is a price a Black deck
      // wants to pay twice: the trash is this colour's own resource, and
      // EB04-048 Rob Lucci reads it five cards at a time.
      //
      // `modify-cost` rather than a power change: −1 cost is what makes the
      // opponent's board answerable by *this* deck's removal, most of which
      // reads cost rather than power.
      "EB04-042",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              { kind: "trash-top", player: "self", count: 3 },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                },
                bind: "eb04-042-cost",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-cost",
                  binding: "eb04-042-cost",
                  amount: -1,
                  expiresAfterTurns: 0,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB04-043 Kaku. Printed text: `pnpm card:text EB04-043`.
      //
      // Mandatory, and the mill is the point rather than a cost: this card's
      // own `[Once Per Turn]` replacement (in `eb04-replacements.ts`) pays
      // three cards *out* of the trash, so the body that fills the trash and
      // the body that spends it are the same card.
      "EB04-043",
      { effect: { kind: "trash-top", player: "self", count: 2 } },
    ],
    [
      // EB04-048 Rob Lucci. Printed text: `pnpm card:text EB04-048`.
      //
      // "1 of your Characters" includes this one, and no `excludeSource`
      // narrows it: a Lucci that trashes itself for a card is a legal (bad)
      // line the text allows, and the choose is where a player decides that.
      // Its continuous half -- +1000 power and +2 cost per 5 cards in trash --
      // is two rows in `static-abilities.ts`.
      "EB04-048",
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
            bind: "eb04-048-trash",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "eb04-048-trash",
                  to: { player: "self", zone: "trash" },
                },
                { kind: "draw", player: "self", count: 1 },
              ],
            },
          },
        },
      },
    ],
  ],
};

/**
 * EB04-011's "draw a card for each ... then trash the same number", as one
 * branch per possible {Neptunian} count.
 *
 * Built rather than written out because the five branches differ only in the
 * number, and the chain has to be read as one decision: `eq` on each count and
 * an `else` to the next, so exactly one branch runs. Five is the board limit,
 * so the chain is total; zero draws nothing, which is the position where the
 * card was played behind a Leader with no Neptunians at all.
 */
function neptunianDrawThenTrash(): MechanicEffect {
  const branch = (count: number): MechanicEffect => ({
    kind: "sequence",
    effects: [
      { kind: "draw", player: "self", count },
      {
        kind: "choose",
        selector: { player: "self", zone: "hand" },
        bind: `eb04-011-trash-${count}`,
        min: count,
        max: count,
        effect: {
          kind: "move",
          binding: `eb04-011-trash-${count}`,
          to: { player: "self", zone: "trash" },
        },
      },
    ],
  });
  const counted = (count: number): MechanicEffect => ({
    kind: "if",
    condition: {
      kind: "selector-count",
      player: "self",
      selector: { zone: "board", category: "character", type: "Neptunian" },
      operator: "eq",
      value: count,
    },
    then: branch(count),
    ...(count < 5 ? { else: counted(count + 1) } : {}),
  });
  return counted(1);
}
