/**
 * EB-01 `[Main]` Events and `[Activate: Main]` abilities.
 *
 * See `mechanics/README.md` for how the set is split; the battle windows are in
 * `eb01-battle.ts`.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus } from "./shared.js";
import { koCostAtMost } from "./eb01-shared.js";
import { costDebuff } from "./eb01-on-play.js";

/**
 * "Trash cards from the top of your Life cards until you have 1 Life card."
 *
 * The price EB01-059 and EB01-060 both pay, and the reason both are one-sided
 * finishers rather than value: a deck on 4 Life pays three cards for the clause
 * above it, and the Life goes to the *trash* rather than to hand, so none of it
 * pays a [Trigger] on the way.
 */
const burnLifeToOne: MechanicEffect = {
  kind: "trash-life-down-to",
  player: "self",
  size: 1,
};

/**
 * "You may trash this Character: Play up to 1 <selector> from your hand ..."
 *
 * EB01-013 Kouzuki Hiyori and EB01-042 Scarlet are the same shape -- a 0-power
 * body that converts itself into a bigger one -- and differ in what they fetch
 * and what they do afterwards. Both trash the source as the cost, so the play
 * happens on a board that already has the slot free.
 */
const trashSelfToPlay = (
  match: { type: string; maxCost: number; excludeName: string },
  bind: string,
  rested: boolean,
  then: MechanicEffect,
): MechanicEffect => ({
  kind: "optional",
  effect: {
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
          zone: "hand",
          category: "character",
          type: match.type,
          maxCost: match.maxCost,
          excludeName: match.excludeName,
        },
        bind,
        min: 0,
        max: 1,
        effect: { kind: "play", binding: bind, ...(rested ? { rested } : {}) },
      },
      then,
    ],
  },
});

/**
 * EB01-020 Chambres' whole printed sentence, shared by its `[Main]` and its
 * `[Trigger]`.
 *
 * "[Trigger] Activate this card's [Main] effect" is one program registered
 * twice rather than a node that reaches for the other half, the same shape
 * EB-02's {Music} cycle takes: the two cannot then drift apart.
 */
const chambresSwap: MechanicEffect = {
  kind: "if",
  condition: {
    kind: "leader-has-type",
    player: "self",
    type: "Supernovas",
  },
  then: {
    kind: "choose",
    selector: {
      player: "self",
      zone: "board",
      category: "character",
    },
    bind: "eb01-chambres-return",
    min: 1,
    max: 1,
    effect: {
      kind: "sequence",
      effects: [
        {
          kind: "move",
          binding: "eb01-chambres-return",
          to: { player: "owner", zone: "hand" },
        },
        {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            maxCost: 2,
            differentColorFromBinding: "eb01-chambres-return",
          },
          bind: "eb01-chambres-play",
          min: 0,
          max: 1,
          effect: {
            kind: "play",
            binding: "eb01-chambres-play",
          },
        },
      ],
    },
  },
};

/**
 * EB01-051 Finger Pistol's `[Main]`, shared with its `[Trigger]` for the same
 * reason {@link chambresSwap} is.
 *
 * The two cards off the deck are a cost, and a cost is paid in full or not at
 * all: Bandai's Q&A (EB01-051#1) rules that a deck of 1 or fewer cannot pay
 * it, so the K.O. is gated on the deck rather than `trash-top` milling what is
 * there and resolving anyway.
 */
const fingerPistolKo: MechanicEffect = {
  kind: "if",
  condition: {
    kind: "zone-count",
    player: "self",
    zone: "deck",
    operator: "gte",
    value: 2,
  },
  then: {
    kind: "optional",
    effect: {
      kind: "sequence",
      effects: [
        { kind: "trash-top", player: "self", count: 2 },
        koCostAtMost(5, "eb01-finger-pistol"),
      ],
    },
  },
};

export const eb01MainMechanics: SetMechanics = {
  activateMain: [
    [
      // EB01-007 Yamato: "[Activate: Main] [Once Per Turn] Give up to 1 rested
      // DON!! card to your Leader or 1 of your Characters."
      //
      // `restedDon: 1` gates the offer: with nothing rested the activation
      // would spend the turn's one use and give nothing.
      "EB01-007",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: { kind: "give-rested-don", player: "self", count: 1 },
        },
      },
    ],
    [
      // EB01-011 Mini-Merry (Stage): "[Activate: Main] You may rest this card
      // and place 1 of your Characters with 1000 base power at the bottom of
      // your deck: Draw 1 card."
      //
      // "1000 base power" is exact, not a ceiling -- the Stage is printed for
      // the Straw Hat package's 1000-power bodies and reaches nothing else.
      // Repeatable, so both halves of the cost gate the offer: the Stage must be
      // active, and there must be a body to bury.
      "EB01-011",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                minPower: 1_000,
                maxPower: 1_000,
              },
              bind: "eb01-merry-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: SOURCE_BINDING },
                  {
                    kind: "move",
                    binding: "eb01-merry-cost",
                    to: { player: "self", zone: "deck", position: "bottom" },
                  },
                  { kind: "draw", player: "self", count: 1 },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // EB01-013 Kouzuki Hiyori: "[Activate: Main] You may trash this Character:
      // Play up to 1 {Land of Wano} type Character card with a cost of 5 or less
      // other than [Kouzuki Hiyori] from your hand. Then, draw 1 card."
      //
      // The draw is outside the play's `choose`, so it happens even when the
      // hand holds nothing to put down -- the card is never a blank.
      "EB01-013",
      {
        oncePerTurn: false,
        program: {
          effect: trashSelfToPlay(
            {
              type: "Land of Wano",
              maxCost: 5,
              excludeName: "Kouzuki Hiyori",
            },
            "eb01-hiyori",
            false,
            { kind: "draw", player: "self", count: 1 },
          ),
        },
      },
    ],
    [
      // EB01-016 Bingoh: "[Activate: Main] You may rest this Character: K.O. up
      // to 1 of your opponent's rested Characters with a cost of 1 or less."
      //
      // `rested: true` on the target is printed and narrow: the clause answers
      // a 1-drop that has already attacked, not one sitting active on defence.
      "EB01-016",
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
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 1,
                    rested: true,
                  },
                  bind: "eb01-bingoh",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "eb01-bingoh" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB01-030 Loguetown (Stage): "[Activate: Main] You may place this card
      // and 1 card from your hand at the bottom of your deck in any order: Draw
      // 2 cards."
      //
      // The Stage buries itself, so this is a once-only draw rather than a
      // repeatable one -- and `handCards: 1` gates the half of the cost the
      // Stage cannot pay on its own.
      "EB01-030",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "eb01-loguetown-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: SOURCE_BINDING,
                    to: { player: "self", zone: "deck", position: "bottom" },
                  },
                  {
                    kind: "move",
                    binding: "eb01-loguetown-cost",
                    to: { player: "self", zone: "deck", position: "bottom" },
                  },
                  { kind: "draw", player: "self", count: 2 },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // EB01-040 Kyros (Leader): "[Activate: Main] [Once Per Turn] You may turn
      // 1 card from the top of your Life cards face-up: K.O. up to 1 of your
      // opponent's Characters with a cost of 0."
      //
      // The cost turns a Life card face-up rather than spending it: the card
      // stays in the Life area and is still lost to the next attack, but its
      // [Trigger] is now known to both seats. `lifeCards: 1` gates the offer,
      // and `faceUp: false` on the target stops the cost being paid twice with
      // one card.
      "EB01-040",
      {
        oncePerTurn: true,
        requires: { lifeCards: 1 },
        program: {
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
              bind: "eb01-kyros-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "update",
                    binding: "eb01-kyros-cost",
                    faceUp: true,
                  },
                  koCostAtMost(0, "eb01-kyros"),
                ],
              },
            },
          },
        },
      },
    ],
    [
      // EB01-042 Scarlet: "[Activate: Main] You may trash this Character: Play
      // up to 1 {Dressrosa} type Character card with a cost of 3 or less other
      // than [Scarlet] from your hand rested. Then, give up to 1 of your
      // opponent's Characters −2 cost during this turn."
      //
      // The body arrives rested, so it cannot attack the turn it lands -- the
      // cost debuff afterwards is what the clause is actually for, and it sets
      // up the set's several "cost of 0" removals.
      "EB01-042",
      {
        oncePerTurn: false,
        program: {
          effect: trashSelfToPlay(
            { type: "Dressrosa", maxCost: 3, excludeName: "Scarlet" },
            "eb01-scarlet",
            true,
            costDebuff(2, "eb01-scarlet-cost"),
          ),
        },
      },
    ],
    [
      // EB01-044 Funkfreed: "[Activate: Main] You may rest this Character: Up to
      // 1 of your [Spandam] Characters gains +3000 power during this turn."
      //
      // Named rather than typed: the elephant sword buffs its owner and nothing
      // else, which is why a board without a [Spandam] gets no offer worth
      // taking -- the `choose` finds nothing and the rest is not paid.
      "EB01-044",
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
                    name: "Spandam",
                  },
                  bind: "eb01-funkfreed",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "eb01-funkfreed",
                    amount: 3_000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // EB01-020 Chambres: "[Main] If your Leader has the {Supernovas} type,
      // return 1 of your Characters to the owner's hand, and play up to 1
      // Character card with a cost of 2 or less from your hand that is a
      // different color than the returned Character."
      //
      // The colour filter reads the card the same program just bounced, which
      // is what `differentColorFromBinding` is for: the two halves are one
      // sentence, and the returned Character is in hand by the time the play
      // happens -- so it is itself a legal target unless the colour rules it
      // out.
      "EB01-020",
      { cost: 1, program: { effect: chambresSwap } },
    ],
    [
      // EB01-039 Conquerer of Three Worlds Ragnaraku: "[Main] DON!! −1: K.O. up
      // to 1 of your opponent's Characters with a cost of 8 or less."
      //
      // The widest removal ceiling in the set, and the DON!! −1 on top of a
      // 5-cost Event is what pays for it.
      "EB01-039",
      {
        cost: 5,
        program: { effect: donMinus(1, koCostAtMost(8, "eb01-ragnaraku")) },
      },
    ],
    [
      // EB01-051 Finger Pistol: "[Main] You may trash 2 cards from the top of
      // your deck: K.O. up to 1 of your opponent's Characters with a cost of 5
      // or less."
      //
      // Milling itself is the cost, which is the CP9 package's whole economy --
      // EB01-043 Spandine plays bodies back out of the trash this fills.
      "EB01-051",
      { cost: 4, program: { effect: fingerPistolKo } },
    ],
    [
      // EB01-059 Kingdom Come: "[Main] K.O. up to 1 of your opponent's
      // Characters. Then, trash cards from the top of your Life cards until you
      // have 1 Life card."
      //
      // Unconditional removal -- no cost ceiling at all, the only such clause in
      // the set -- paid for with everything above 1 Life. The K.O. resolves
      // first, so the Life is spent whether or not it found a target.
      "EB01-059",
      {
        cost: 6,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                },
                bind: "eb01-kingdom-come",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "eb01-kingdom-come" },
              },
              burnLifeToOne,
            ],
          },
        },
      },
    ],
    [
      // EB01-060 Did Someone Say...Kami?: "[Main] Play up to 1 [Enel] with a
      // cost of 7 or less from your hand or trash. Then, trash cards from the
      // top of your Life cards until you have 1 Life card."
      //
      // The Sky Island payoff: the Life it burns is what several Enel bodies
      // read as a resource, so the cost is not purely a cost in the deck that
      // plays it.
      "EB01-060",
      {
        cost: 4,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: ["hand", "trash"],
                  name: "Enel",
                  maxCost: 7,
                },
                bind: "eb01-kami",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "eb01-kami" },
              },
              burnLifeToOne,
            ],
          },
        },
      },
    ],
  ],
};

export { burnLifeToOne, chambresSwap, fingerPistolKo };
