/**
 * OP16 `[When Attacking]`, `[On Your Opponent's Attack]` and `[Counter]`
 * programs.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { powerEightThousand } from "./op16-shared.js";
import { type SetMechanics } from "./registry.js";
import { haveNamed, trashForBattlePower } from "./shared.js";

/**
 * OP16-025 Bunkov and OP16-029 Antlerkov: "[When Attacking] If you have
 * [<the other one>], play up to 1 Character card with a cost of 2 or less from
 * your hand."
 *
 * A printed pair that only works together, so the shape is written once and the
 * name each half looks for is the parameter.
 */
const impelDownPair = (partner: string, bind: string): MechanicEffect => ({
  kind: "if",
  condition: haveNamed(partner),
  then: {
    kind: "choose",
    selector: {
      player: "self",
      zone: "hand",
      category: "character",
      maxCost: 2,
    },
    bind,
    min: 0,
    max: 1,
    effect: { kind: "play", binding: bind },
  },
});

export const op16BattleMechanics: SetMechanics = {
  whenAttacking: [
    ["OP16-025", { effect: impelDownPair("Antlerkov", "op16-bunkov-play") }],
    ["OP16-029", { effect: impelDownPair("Bunkov", "op16-antlerkov-play") }],
    [
      // OP16-011 Vista: "[printed text omitted -- pnpm card:text OP16-011]"
      //
      // The `[DON!! x1]` gates whether the clause fires at all, which is
      // `source-attached-don`. Two targets, so `max: 2` on one choice rather
      // than two choices: the printed "up to 2" is a single decision.
      "OP16-011",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "source-attached-don",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxPower: 2000,
            },
            bind: "op16-vista-ko",
            min: 0,
            max: 2,
            effect: { kind: "knock-out", binding: "op16-vista-ko" },
          },
        },
      },
    ],
    [
      // OP16-068 Trafalgar Law: "[printed text omitted -- pnpm card:text OP16-068]"
      "OP16-068",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Donquixote Pirates",
          },
          then: {
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 3000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP16-069 Donquixote Doflamingo: the `[When Attacking]` half of
      // "[printed text omitted -- pnpm card:text OP16-069]" Same clause, both tables.
      "OP16-069",
      { effect: { kind: "add-don", player: "self", count: 1, rested: false } },
    ],
    [
      // OP16-104 Catarina Devon: "[printed text omitted -- pnpm card:text OP16-104]"
      //
      // A 3000-power body that hits for whatever the opponent's best Character
      // is worth. `copy-power` takes the number once, as "becomes" says: the
      // copy does not track the target afterwards, and it survives the target
      // being K.O.'d in the same battle.
      "OP16-104",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "op16-devon-mirror",
          min: 0,
          max: 1,
          effect: {
            kind: "copy-power",
            from: "op16-devon-mirror",
            to: SOURCE_BINDING,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP16-053 Roronoa Zoro: "[printed text omitted -- pnpm card:text OP16-053]"
      "OP16-053",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "hand",
            operator: "lte",
            value: 6,
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // OP16-080 Marshall.D.Teach (Leader): "[printed text omitted -- pnpm card:text OP16-080]"
      //
      // What a [Blocker] does, paid for out of hand instead of by resting -- and
      // it may name the Leader, which no Blocker can. Neither `handCardsOfType`
      // nor `handCardsOfCategory` can ask "with a [Trigger]", so the offer is
      // gated by `handCardsMatching` on the same selector the cost spends.
      //
      // Its `[Opponent's Turn]` +1 cost aura is a static layer.
      "OP16-080",
      {
        oncePerTurn: true,
        requires: {
          handCardsMatching: { match: { hasTrigger: true }, count: 1 },
        },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand", hasTrigger: true },
              bind: "op16-teach-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op16-teach-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      includeLeader: true,
                      excludeAttackTarget: true,
                      anyOf: [
                        { name: "Marshall.D.Teach" },
                        { type: "Blackbeard Pirates" },
                      ],
                    },
                    bind: "op16-teach-redirect",
                    min: 1,
                    max: 1,
                    effect: {
                      kind: "redirect-attack",
                      binding: "op16-teach-redirect",
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
      // OP16-015 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP16-015]"
      //
      // "Becomes", so both are set rather than raised, each through the
      // base-power override of its own side. A modifier sized to the printed
      // gap reads the same on a board where nothing else has touched Luffy and
      // diverges everywhere else: the clause is not `[Once Per Turn]`, so a
      // second attack in the same turn can pay it again, and a second +1000
      // leaves an 8000 Character where "becomes 7000" says 7000. Its printed
      // hand discount is a static layer.
      //
      // The cost names a card the hand may not hold, so the offer is gated on
      // the cost's own selector rather than on a hand-size floor -- otherwise a
      // hand of anything else is shown a trade it cannot make.
      "OP16-015",
      {
        oncePerTurn: false,
        requires: {
          handCardsMatching: { match: powerEightThousand, count: 1 },
        },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: {
                    ...powerEightThousand,
                    player: "self",
                    zone: "hand",
                  },
                  bind: "op16-luffy015-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "move",
                        binding: "op16-luffy015-cost",
                        to: { player: "self", zone: "trash" },
                      },
                      {
                        kind: "set-leader-base-power",
                        player: "self",
                        value: 7000,
                        expiresAfterTurns: 0,
                      },
                      {
                        kind: "set-base-power",
                        binding: SOURCE_BINDING,
                        value: 7000,
                        expiresAfterTurns: 0,
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
  counterEvent: [
    [
      // OP16-020 "If You're Coming with Me... Kiss Your Lives Goodbye!!":
      // "[printed text omitted -- pnpm card:text OP16-020]"
      "OP16-020",
      {
        cost: 0,
        power: 0,
        program: trashForBattlePower(3000, "op16-goodbye-counter"),
      },
    ],
    [
      // OP16-038 Let's Go!! To the Navy Headquarters!! (1): the `[Counter]` half
      // of a dual-purpose Event, whose `[Main]` half is in `op16-main.ts`. The
      // power is printed for the Leader alone, so it adds nothing while a
      // Character is the card being attacked -- `target: { isLeader: true }`,
      // read by the offer and the resolution alike through `counterEventPower`.
      "OP16-038",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP16-040 Gum-Gum Hammer Rifle: "[printed text omitted -- pnpm card:text OP16-040]" Its `[Main]` half is in `op16-main.ts`.
      "OP16-040",
      { cost: 1, power: 3000, target: { isLeader: true } },
    ],
    [
      // OP16-100 Hallowed Glacier Slash: "[printed text omitted -- pnpm card:text OP16-100]" Its `[Main]` half is in `op16-main.ts`.
      "OP16-100",
      { cost: 1, power: 3000, target: { isLeader: true } },
    ],
    [
      // OP16-076 "The Three Admirals!!": "[printed text omitted -- pnpm card:text OP16-076]"
      //
      // `power: 0` with the buff in the program, because the clause is
      // conditional -- a fixed number would promise the defender power an
      // Admiral-less board will not deliver.
      "OP16-076",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: {
                zone: "board",
                category: "character",
                type: "Admiral",
              },
              operator: "gte",
              value: 1,
            },
            then: { kind: "battle-power", player: "self", amount: 4000 },
          },
        },
      },
    ],
    [
      // OP16-099 "I've Come Here... To Cut Those Chains!!!": "[printed text omitted -- pnpm card:text OP16-099]" Its 6-DON!! `[Main]` half
      // is in `op16-main.ts`.
      "OP16-099",
      { cost: 1, power: 3000, target: { isLeader: true } },
    ],
    [
      // OP16-057 "Captain Buggy's Our Savior!!": "[printed text omitted -- pnpm card:text OP16-057]"
      //
      // `power: 0` with the buff in the program, because the clause is
      // conditional: a fixed number would promise the defender power a board
      // without two Prisoners will not deliver.
      "OP16-057",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "if",
            condition: haveNamed("Prisoner of Impel Down", 2),
            then: { kind: "battle-power", player: "self", amount: 4000 },
          },
        },
      },
    ],
    [
      // OP16-058 "The Prisoners Are Rioting!!": "[printed text omitted -- pnpm card:text OP16-058]" Its `[Main]` half is in
      // `op16-main.ts`.
      "OP16-058",
      { cost: 1, power: 4000, target: { name: "Buggy" } },
    ],
    [
      // OP16-059 "We'll Change This Mission from Sneaky to Flashy!": "[printed text omitted -- pnpm card:text OP16-059]"
      "OP16-059",
      { cost: 1, power: 3000, target: { isLeader: true } },
    ],
  ],
};
