/**
 * ST-27 "(Black) Marshall.D.Teach", and the two PRB-02 singles and one EB-01
 * reprint Bandai's recommended list for it adds.
 *
 * Card data for all five lives in `packages/cards/src/generated-community.ts`,
 * stamped by the audit's community pass; the rest of the list is OP-09's
 * Blackbeard package and is already programmed in `op09-*.ts` and
 * `op16-teach.ts`. Printed text for any card here is `pnpm card:text <CARD>`.
 *
 * They are one module rather than three because they are one product: the two
 * PRB-02 singles and Laboon are printed for no deck but this one -- Shiryu and
 * Kuzan read the {Blackbeard Pirates} Leader by name, and Laboon's −4 cost is
 * what turns the ST27-005/OP09-090 K.O.-by-cost clauses below into removal that
 * reaches a real body. Splitting them by card-number prefix would scatter one
 * deck's reading of itself across three files nothing else would ever open.
 *
 * The continuous halves -- PRB02-014's price in hand and PRB02-015's conditional
 * [Blocker] and +4 cost -- are not timed, so they are a `STATIC_HAND_DISCOUNTS`
 * row in `../hand-price.ts` and a `StaticAbility` in `../static-abilities.ts`
 * respectively, not programs here.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { costDebuff } from "./op08-shared.js";
import { type SetMechanics } from "./registry.js";

/** "If your Leader has the {Blackbeard Pirates} type, <effect>." */
const ifBlackbeardLeader = (effect: MechanicEffect): MechanicEffect => ({
  kind: "if",
  condition: {
    kind: "leader-has-type",
    player: "self",
    type: "Blackbeard Pirates",
  },
  then: effect,
});

export const st27Mechanics: SetMechanics = {
  onPlay: [
    [
      // ST27-004 Sanjuan.Wolf: arriving costs a card out of hand.
      //
      // A flat price rather than a "you may", so it is not `optional` -- the
      // body is what the deck wants and the discard is what it pays. Its
      // continuous half, the conditional [Blocker] and the cost that grows with
      // the trash, is a row in `../static-abilities.ts`.
      "ST27-004",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "hand" },
          bind: "st27-wolf-cost",
          min: 1,
          max: 1,
          effect: {
            kind: "move",
            binding: "st27-wolf-cost",
            to: { player: "self", zone: "trash" },
          },
        },
      },
    ],
  ],
  activateMain: [
    [
      // ST27-001 Avalo Pizarro: once a turn, resting the deck's own Stage buys
      // this body +4000 for the turn.
      //
      // The Stage is named rather than typed, and it is the Stage this list
      // plays -- so the cost is real in a Blackbeard deck and unpayable
      // anywhere else. The `choose` reaches the Stage area, which `zone:
      // "stage"` is for: a Stage is in no board zone and `rest` searches both.
      //
      // The Leader gate sits inside the payment rather than around it, because
      // the printed clause pays the cost first and reads the Leader after --
      // and `rest` is what the cost is, so an already-rested Stage cannot pay.
      "ST27-001",
      {
        oncePerTurn: true,
        program: {
          // The outermost node is the gate on the cost being payable, not the
          // `optional` -- a program whose top-level `if` is false is withheld
          // from `legalActions` entirely, so a board with no un-rested
          // [Fullalead] is never offered an activation that would spend the
          // turn's one use on nothing.
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: { zone: "stage", name: "Fullalead", rested: false },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "stage",
                  name: "Fullalead",
                  rested: false,
                },
                bind: "st27-pizarro-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    { kind: "rest", binding: "st27-pizarro-cost" },
                    ifBlackbeardLeader({
                      kind: "modify-power",
                      binding: SOURCE_BINDING,
                      amount: 4_000,
                      expiresAfterTurns: 0,
                    }),
                  ],
                },
              },
            },
          },
        },
      },
    ],
    [
      // ST27-002 Catarina Devon: the body itself is the price of −1 cost on an
      // opposing Character for the turn.
      //
      // Small on its own, and the reason it is worth a card is the pair of
      // K.O.-by-cost clauses this list already runs: one cost off a body is
      // what brings it inside ST27-005's ceiling. Repeatable-looking but
      // self-limiting -- the source is gone after one use -- so no
      // `[Once Per Turn]`.
      //
      // A `move` to the trash rather than a `knock-out`: the printed word is
      // trash, so this card's own [On K.O.] draw does not fire off it.
      "ST27-002",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                  trashedNotKoed: true,
                },
                ifBlackbeardLeader(costDebuff(1, "st27-devon-cost")),
              ],
            },
          },
        },
      },
    ],
    [
      // EB01-048 Laboon: "[Activate: Main] You may rest this Character: Give up
      // to 1 of your opponent's Characters −4 cost during this turn."
      //
      // The largest cost debuff in the pool and the only one this list plays
      // that reads no Leader type -- which is why a 4-cost Animal is in a
      // Blackbeard deck at all. Repeatable, so a body that survives the turn
      // debuffs again next turn; `sourceActive` is what keeps the offer honest
      // once it has been rested.
      "EB01-048",
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
                costDebuff(4, "eb01-laboon-cost"),
              ],
            },
          },
        },
      },
    ],
    [
      // ST27-005 Marshall.D.Teach: "[Activate: Main] You may rest this
      // Character: K.O. up to 1 Character with a cost of 3 or less."
      //
      // "1 Character", with neither side named, so `player: "either"` -- the
      // clause can take the controller's own body, and a 7-cost that could only
      // point across the table would be a different card. The ceiling is
      // effective cost, not base, which is the whole reason this shares a deck
      // with EB01-048 Laboon and OP09-083 Van Augur: a −4 or a −3 this turn
      // drops a 7-cost body inside it.
      //
      // Repeatable rather than `[Once Per Turn]`, so the K.O. comes back every
      // turn the body lives -- and `sourceActive` is the gate that stops the
      // offer standing once it has rested.
      "ST27-005",
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
                    player: "either",
                    zone: "board",
                    category: "character",
                    maxCost: 3,
                  },
                  bind: "st27-teach-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "st27-teach-ko" },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  onKo: [
    // ST27-001 Avalo Pizarro and ST27-002 Catarina Devon: dying draws a card.
    //
    // The product's shape in two entries: both bodies spend themselves for a
    // turn's worth of tempo -- one rests the deck's Stage, one trashes itself
    // outright -- and both hand the card back when they go, so trading them
    // off is never card-negative.
    ["ST27-001", { effect: { kind: "draw", player: "self", count: 1 } }],
    ["ST27-002", { effect: { kind: "draw", player: "self", count: 1 } }],
    [
      // ST27-003 Kuzan: "[On K.O.] Play up to 1 {Blackbeard Pirates} type
      // Character card with a cost of 5 or less from your trash rested."
      //
      // [Blocker] is the other printed half and needs no program:
      // `hasStaticKeyword` reads it off the card text. Together they are what
      // the 6-cost is priced on -- the block trades the body for a smaller one
      // out of the trash, so the clause pays out exactly when the deck wanted
      // the block anyway.
      //
      // No Leader gate is printed, unlike almost everything else in the list,
      // and none is read here. `rested: true` is printed too, and it is the
      // restraint on the clause: the body it returns cannot attack or block
      // until it refreshes.
      "ST27-003",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            type: "Blackbeard Pirates",
            maxCost: 5,
          },
          bind: "st27-kuzan-revive",
          min: 0,
          max: 1,
          effect: {
            kind: "play",
            binding: "st27-kuzan-revive",
            rested: true,
          },
        },
      },
    ],
    [
      // ST27-005 Marshall.D.Teach: "[On K.O.] Add up to 1 black card from your
      // trash to your hand."
      //
      // "black card", not a Character and not a type, so the selector filters
      // on colour alone: the Events and the Stage this deck trashes on purpose
      // are all legal picks, and OP09-096 My Era...Begins!! is usually the one
      // worth taking back.
      "ST27-005",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "trash", color: "Black" },
          bind: "st27-teach-recur",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "st27-teach-recur",
            to: { player: "self", zone: "hand" },
          },
        },
      },
    ],
    [
      // PRB02-015 Shiryu: "[On K.O.] If your Leader has the {Blackbeard
      // Pirates} type, K.O. up to 1 of your opponent's Characters with a base
      // cost of 4 or less."
      //
      // `maxBaseCost`, not `maxCost`, and the difference is the point: this is
      // the one removal clause in the list a cost debuff cannot widen, so the
      // Laboon/Van Augur package that feeds ST27-005 does nothing for it.
      // Bandai's own deck note says as much -- it pairs the clause with the
      // [Blocker] the static half grants instead, which is what makes trading
      // this body the way the clause is meant to fire.
      "PRB02-015",
      {
        effect: ifBlackbeardLeader({
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxBaseCost: 4,
          },
          bind: "prb02-shiryu-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "prb02-shiryu-ko" },
        }),
      },
    ],
  ],
};
