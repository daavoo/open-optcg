/**
 * OP-18's Blue cards, OP18-041 to OP18-059: the Baroque Works pairs around the
 * OP18-041 Ms. All Sunday Leader.
 *
 * One module for every timing window the colour prints, rather than the
 * four-way split a whole set takes: the six colours of OP-18 were brought in
 * side by side, one module each, so they could land independently. The
 * continuous text is in `op18-blue-static.ts` and the Leader's unmarked K.O.
 * watcher in `op18-blue-reactions.ts`.
 *
 * Comments paraphrase what each program has to do rather than quoting the
 * card -- printed text is a runtime asset (`pnpm card:text OP18-0xx`).
 *
 * Almost every clause here reads "a type including Baroque Works", which is
 * `typeIncluding` rather than `type`: it has to reach OP18-047's
 * {Former Baroque Works} as well as the plain type.
 */
import {
  type MechanicCondition,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  drawAndDiscard,
  lookAndAdd,
  lookAndReplace,
  payFromHand,
  trashForBattlePower,
} from "./shared.js";
import { bounceEitherCostAtMost } from "./op05-shared.js";
import { bounceCostAtMost, buryCostAtMost } from "./op07-shared.js";
import { playFromHand } from "./op08-shared.js";

const BAROQUE_WORKS = "Baroque Works";

const baroqueLeader: MechanicCondition = {
  kind: "leader-type-including",
  player: "self",
  text: BAROQUE_WORKS,
};

/**
 * OP18-058's `[Main]`, which its `[Trigger]` activates as printed.
 *
 * The outermost `if` is the cost being payable at all: with no Character of
 * their own to return, the clause can do nothing, and `bareGateCondition`
 * then withholds the Event rather than offering a card that trashes itself
 * for nothing. The payoff is nested inside the cost's `choose`, so declining
 * the cost declines the bury too.
 */
const kingdomIsDoomed: MechanicProgram = {
  effect: {
    kind: "if",
    condition: {
      kind: "selector-count",
      player: "self",
      selector: { zone: "board", category: "character" },
      operator: "gte",
      value: 1,
    },
    then: {
      kind: "optional",
      effect: {
        kind: "choose",
        selector: { player: "self", zone: "board", category: "character" },
        bind: "op18-058-cost",
        min: 1,
        max: 1,
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "move",
              binding: "op18-058-cost",
              to: { player: "owner", zone: "hand" },
            },
            buryCostAtMost(4, "op18-058-bury"),
          ],
        },
      },
    },
  },
};

const haveRestedDon: MechanicCondition = {
  kind: "rested-don",
  player: "self",
  operator: "gte",
  value: 1,
};

const giveRestedDon = (
  count: number,
  target: "leader" | { binding: string; each: true },
): MechanicEffect => ({
  kind: "attach-don",
  player: "self",
  from: "rested",
  count,
  target,
});

/** Up to five Characters under one binding: the whole board. */
const ownCharacters = (bind: string, excludeBinding?: string) => ({
  selector: {
    player: "self" as const,
    zone: "board" as const,
    category: "character" as const,
    ...(excludeBinding ? { excludeBinding } : {}),
  },
  bind,
  min: 0,
  max: 5,
});

/**
 * OP18-046's gift: 0, 1 or 2 rested DON!! to the Leader and to each Character,
 * chosen card by card (Bandai's OP18-046 Q&A). Withholding DON!! is a real
 * line -- a rested DON!! left in the cost area still pays OP18-042 Hack's or
 * OP18-078 Mini-Merry's gift, and a short pile is the player's to split.
 *
 * The Leader's share is a three-way `choice`; the Characters are two `choose`
 * steps, the ones getting two and then, from the rest, the ones getting one,
 * which reaches every per-card assignment without a prompt per Character.
 * Each step is skipped once the rested pile is empty.
 */
const upToTwoRestedDonEach: MechanicEffect = {
  kind: "sequence",
  effects: [
    {
      kind: "if",
      condition: haveRestedDon,
      then: {
        kind: "choice",
        branches: [
          {
            id: "leader-2",
            label: "Give your Leader 2 rested DON!!",
            effect: giveRestedDon(2, "leader"),
          },
          {
            id: "leader-1",
            label: "Give your Leader 1 rested DON!!",
            effect: giveRestedDon(1, "leader"),
          },
          { id: "leader-0", label: "Give your Leader none" },
        ],
      },
    },
    {
      kind: "if",
      condition: haveRestedDon,
      then: {
        kind: "choose",
        ...ownCharacters("op18-046-two"),
        effect: giveRestedDon(2, { binding: "op18-046-two", each: true }),
      },
    },
    {
      kind: "if",
      condition: haveRestedDon,
      then: {
        kind: "choose",
        ...ownCharacters("op18-046-one", "op18-046-two"),
        effect: giveRestedDon(1, { binding: "op18-046-one", each: true }),
      },
    },
  ],
};

/**
 * OP18-051's payoff: two Characters with two ceilings, either side's, under
 * their owners' decks together.
 *
 * Two `choose` steps because the ceilings differ, and the second excludes the
 * first because one body cannot fill both halves -- the shape OP06-056 Ama no
 * Murakumo Sword prints. The placement is one `order-to-bottom` over both
 * picks, so an owner losing two cards orders them, as the text says.
 */
const twoCeilingBury: MechanicEffect = {
  kind: "sequence",
  effects: [
    {
      kind: "choose",
      selector: {
        player: "either",
        zone: "board",
        category: "character",
        maxCost: 6,
      },
      bind: "op18-051-six",
      min: 0,
      max: 1,
      effect: { kind: "sequence", effects: [] },
    },
    {
      kind: "choose",
      selector: {
        player: "either",
        zone: "board",
        category: "character",
        maxCost: 5,
        excludeBinding: "op18-051-six",
      },
      bind: "op18-051-five",
      min: 0,
      max: 1,
      effect: { kind: "sequence", effects: [] },
    },
    {
      kind: "order-to-bottom",
      binding: "op18-051-six",
      also: ["op18-051-five"],
      byOwner: true,
      to: { player: "owner", zone: "deck", position: "bottom" },
    },
  ],
};

export const op18BlueMechanics: SetMechanics = {
  onPlay: [
    [
      // OP18-044 Mr.Beans & Miss.Katherina: the Blue refill, one for one.
      "OP18-044",
      { effect: drawAndDiscard(1, 1, "op18-044-discard") },
    ],
    [
      // OP18-046 Mr.0 & Ms. All Sunday: two cards, then up to two rested
      // DON!! to the Leader and to each Character. See `upToTwoRestedDonEach`.
      "OP18-046",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            upToTwoRestedDonEach,
          ],
        },
      },
    ],
    [
      // OP18-047 Mr.1(Daz.Bonez): [Unblockable] on the Leader for the turn,
      // behind a Leader that is {Cross Guild} or whose type includes Baroque
      // Works. The gate is the outermost `if`, so a Leader with neither is
      // asked nothing.
      "OP18-047",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "any-of",
            conditions: [
              { kind: "leader-has-type", player: "self", type: "Cross Guild" },
              baroqueLeader,
            ],
          },
          then: {
            kind: "select",
            selector: { player: "self", zone: [], includeLeader: true },
            bind: "op18-047-leader",
            count: "all",
            effect: {
              kind: "grant-keyword",
              binding: "op18-047-leader",
              keyword: "Unblockable",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP18-048 Mr.1 & Miss Doublefinger: a Baroque Works body of cost 5 or
      // less out of hand. [Rush] is printed and derived.
      "OP18-048",
      {
        effect: playFromHand(
          { category: "character", typeIncluding: BAROQUE_WORKS, maxCost: 5 },
          "op18-048-play",
        ),
      },
    ],
    [
      // OP18-049 Mr.2.Bon.Kurei(Bentham): a five-card look for a card whose
      // type includes Baroque Works, then up to one rested DON!! to the Leader
      // or a Character. The gift happens whether or not the search found
      // anything.
      "OP18-049",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "op18-049-look", { typeIncluding: BAROQUE_WORKS })
              .effect,
            { kind: "give-rested-don", player: "self", count: 1 },
          ],
        },
      },
    ],
    [
      // OP18-050 Mr.3 & Miss.Goldenweek: one opposing Character of cost 7 or
      // less cannot attack through the opponent's next turn, behind a Baroque
      // Works Leader. `expiresAfterTurns: 1` is "until the end of your
      // opponent's next End Phase".
      "OP18-050",
      {
        effect: {
          kind: "if",
          condition: baroqueLeader,
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 7,
            },
            bind: "op18-050-lock",
            min: 0,
            max: 1,
            effect: {
              kind: "restrict",
              binding: "op18-050-lock",
              restriction: "cannot-attack",
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
    [
      // OP18-051 Mr.4 & Miss.MerryChristmas: five active DON!! rested to put
      // two Characters under their owners' decks. The printed text names no
      // side, so either board is in reach.
      "OP18-051",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "active-don",
            player: "self",
            operator: "gte",
            value: 5,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 5 },
                twoCeilingBury,
              ],
            },
          },
        },
      },
    ],
    [
      // OP18-052 Mr.5 & Miss.Valentine: a Baroque Works body of cost 3 or
      // less out of hand.
      "OP18-052",
      {
        effect: playFromHand(
          { category: "character", typeIncluding: BAROQUE_WORKS, maxCost: 3 },
          "op18-052-play",
        ),
      },
    ],
    [
      // OP18-053 Mr.7 & Miss.Father'sDay: the top three, in any order, all on
      // top or all on the bottom.
      "OP18-053",
      { effect: lookAndReplace(3, "op18-053-look", true) },
    ],
    [
      // OP18-055 Mr.9 & Ms. Wednesday: an opposing cost-2-or-less Character
      // back to hand.
      "OP18-055",
      { effect: bounceCostAtMost(2, "op18-055-bounce") },
    ],
    [
      // OP18-056 Mr.13 & Ms.Friday: another Baroque Works Character of their
      // own under the deck, and the opponent discards a card of their choice.
      // The gate is a body to pay with; the copy running the clause is not
      // one, so `excludeSource` on both halves.
      "OP18-056",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: {
              zone: "board",
              category: "character",
              typeIncluding: BAROQUE_WORKS,
              excludeSource: true,
            },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                typeIncluding: BAROQUE_WORKS,
                excludeSource: true,
              },
              bind: "op18-056-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op18-056-cost",
                    to: { player: "owner", zone: "deck", position: "bottom" },
                  },
                  {
                    kind: "choose",
                    selector: { player: "opponent", zone: "hand" },
                    chooser: "opponent",
                    bind: "op18-056-discard",
                    min: 1,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "op18-056-discard",
                      to: { player: "owner", zone: "trash" },
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
  onKo: [
    [
      // OP18-042 Hack: a card on the way out.
      "OP18-042",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
  ],
  activateMain: [
    [
      // OP18-042 Hack: once a turn, a rested DON!! to a {Dressrosa} Leader or
      // Character. Hack is one himself, so there is always a recipient; the
      // gate is a rested DON!! to give, without which the activation would
      // spend its use on nothing.
      "OP18-042",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "give-rested-don",
            player: "self",
            count: 1,
            type: "Dressrosa",
          },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // OP18-046 Mr.0 & Ms. All Sunday: a card from hand sets a Baroque Works
      // Leader's base power to 7000 for the turn. "Becomes", so a setter
      // rather than a modifier, the same node EB05-046 Yamato pays into. Not
      // once per turn: each attack may be answered with another card.
      "OP18-046",
      {
        oncePerTurn: false,
        requires: { handCards: 1, leaderTypeIncluding: BAROQUE_WORKS },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op18-046-cost",
              1,
              {
                kind: "set-leader-base-power",
                player: "self",
                value: 7_000,
                expiresAfterTurns: 0,
              },
            ),
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // OP18-057 Atomic Dicer: three DON!! rested to return a cost-5-or-less
      // Character of either side to its owner's hand. Its `[Counter]` half is
      // below.
      "OP18-057",
      {
        cost: 1,
        restDon: 3,
        program: { effect: bounceEitherCostAtMost(5, "op18-057-bounce") },
      },
    ],
    [
      // OP18-058 This Kingdom is Doomed. You Can't Save It!: see
      // `kingdomIsDoomed`.
      "OP18-058",
      { cost: 3, program: kingdomIsDoomed },
    ],
    [
      // OP18-059 I Pray For Your Success.: a DON!! rested and a Baroque Works
      // card trashed for two cards. The Event is itself Baroque Works but has
      // left the hand by the time the cost is paid, so the gate asks for
      // another one -- read in that position by the offer as well.
      "OP18-059",
      {
        cost: 0,
        restDon: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: { zone: "hand", typeIncluding: BAROQUE_WORKS },
              operator: "gte",
              value: 1,
            },
            then: payFromHand(
              { player: "self", zone: "hand", typeIncluding: BAROQUE_WORKS },
              "op18-059-cost",
              1,
              { kind: "draw", player: "self", count: 2 },
            ),
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP18-057 Atomic Dicer: +3000 for the Leader alone, so nothing while a
      // Character is the one under attack.
      "OP18-057",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP18-059 I Pray For Your Success.: a card from hand for +3000 to the
      // Leader or a Character -- the Gum-Gum Rain clause, which is a choice of
      // recipient and so carries no fixed power.
      "OP18-059",
      {
        cost: 0,
        trashFromHand: 1,
        power: 0,
        program: trashForBattlePower(3_000, "op18-059-counter-cost"),
      },
    ],
  ],
  trigger: [
    [
      // OP18-058: the `[Trigger]` activates the `[Main]`, cost and all.
      "OP18-058",
      kingdomIsDoomed,
    ],
  ],
  replacement: [
    [
      // OP18-054 Mr.8 & Ms. Monday: once a turn, on the opponent's turn, a
      // card from hand instead of a Baroque Works Character leaving the field
      // to an opponent's effect -- ST25-003's save behind an
      // `[Opponent's Turn]`. The `[DON!! x1]` on this card gates only its
      // power, not the save. It protects itself, since it carries the type.
      "OP18-054",
      {
        opponentEffectOnly: true,
        opponentTurnOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        protects: { category: "character", typeIncluding: BAROQUE_WORKS },
        label: "Trash 1 from hand",
        cost: { kind: "trash-from-hand", count: 1 },
      },
    ],
  ],
};
