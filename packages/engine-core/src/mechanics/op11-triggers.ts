/**
 * OP11 `[Trigger]`, `[On K.O.]`, `[End of Your Turn]` and start-of-turn
 * programs.
 */
import { type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { op11EventPrograms } from "./op11-main.js";
import { op11OnPlayMechanics } from "./op11-on-play.js";
import { playFromHand } from "./op08-shared.js";
import { lookAndPlay } from "./op06-shared.js";
import { asOnPlayTrigger, payFromHand } from "./shared.js";
import { placeAtTopOrBottom } from "./op11-shared.js";

/** "Rest up to 1 of your opponent's Characters with a cost of N or less." */
const restOpponentUpToCost = (cost: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost: cost,
    canRest: true,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "rest", binding: bind },
});

/** "Up to 1 of your Leader or Character cards gains +1000 power during this turn." */
const ownLeaderOrCharacterBuff = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "self", zone: "board", includeLeader: true },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-power",
    binding: bind,
    amount: 1_000,
    expiresAfterTurns: 0,
  },
});

/**
 * OP11-075 Jaguar.D.Saul's `[On Play]`, which its own `[Trigger]` activates.
 *
 * Read back out of the `[On Play]` table rather than restated, the same way the
 * Events whose Trigger reads "activate this card's [Main] effect" are handled:
 * one program, two dispatch points, and no chance of the two drifting.
 */
const saulOnPlay = (op11OnPlayMechanics.onPlay ?? []).find(
  ([cardNumber]) => cardNumber === "OP11-075",
)![1];

/** A {Fish-Man} or {Merfolk} Character in hand up to `maxCost`. */
const fishManOrMerfolk = (maxCost: number) => ({
  category: "character" as const,
  anyOf: [{ type: "Fish-Man" }, { type: "Merfolk" }],
  maxCost,
});

/** "You have at least 1 active DON!!" -- the half both K.O. answers pay. */
const hasActiveDon = {
  kind: "active-don",
  player: "self",
  operator: "gte",
  value: 1,
} as const;

export const op11TriggerMechanics: SetMechanics = {
  onStartOfYourTurn: [
    [
      // OP11-040 Monkey.D.Luffy (Leader): `pnpm card:text OP11-040`.
      //
      // Gated outside the `optional` so a turn without 8 DON!! on the field
      // asks nothing at all. "On your field" counts DON!! still given to cards
      // from last turn: the window opens before the Refresh Phase returns them.
      "OP11-040",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "gte",
            value: 8,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "look-at",
                  player: "self",
                  count: 5,
                  bind: "op11-luffy-leader-look",
                },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "deck",
                    binding: "op11-luffy-leader-look",
                    type: "Straw Hat Crew",
                  },
                  bind: "op11-luffy-leader-add",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op11-luffy-leader-add",
                    to: { player: "self", zone: "hand" },
                  },
                },
                placeAtTopOrBottom(
                  "op11-luffy-leader-look",
                  "op11-luffy-leader-rest",
                ),
              ],
            },
          },
        },
      },
    ],
  ],
  onKo: [
    [
      // OP11-051 Sanji: untimed text that reads as an `[On K.O.]` scoped to the
      // opponent's effects (`pnpm card:text OP11-051`), the entry shape
      // EB01-057 Shirahoshi uses: `opponentEffectOnly` keeps a lost fight and
      // its controller's own removal from paying out. Its `[On Play]` is in
      // `op11-on-play.ts`.
      "OP11-051",
      {
        opponentEffectOnly: true,
        program: lookAndPlay(5, "op11-sanji-look", {
          category: "character",
          type: "Straw Hat Crew",
          maxCost: 5,
        }),
      },
    ],
    [
      // OP11-024 Aladine: "[printed text omitted -- pnpm card:text OP11-024]"
      //
      // It dispatches on the opponent's turn, so the DON!! it rests is the one
      // the Leader's `[End of Your Turn]` set active -- that is the pair the
      // deck is built around. The hand card is trashed first and the body
      // chosen after, so the outer gate asks only that both halves of the cost
      // can be paid; "up to 1" lets a hand with nothing to play still pay.
      "OP11-024",
      {
        opponentEffectOnly: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                hasActiveDon,
                {
                  kind: "zone-count",
                  player: "self",
                  zone: "hand",
                  operator: "gte",
                  value: 1,
                },
              ],
            },
            then: {
              kind: "optional",
              effect: payFromHand(
                { player: "self", zone: "hand" },
                "op11-aladine-cost",
                1,
                {
                  kind: "sequence",
                  effects: [
                    { kind: "rest-don", player: "self", count: 1 },
                    playFromHand(fishManOrMerfolk(6), "op11-aladine-play"),
                  ],
                },
              ),
            },
          },
        },
      },
    ],
    [
      // OP11-035 Fisher Tiger: "[printed text omitted -- pnpm card:text OP11-035]"
      //
      // Aladine's answer without the hand card, for a smaller body. Its
      // `[On Play]` rest is in `op11-on-play.ts`.
      "OP11-035",
      {
        opponentEffectOnly: true,
        program: {
          effect: {
            kind: "if",
            condition: hasActiveDon,
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest-don", player: "self", count: 1 },
                  playFromHand(fishManOrMerfolk(4), "op11-tiger-play"),
                ],
              },
            },
          },
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // OP11-021 Jinbe (Leader): "[printed text omitted -- pnpm card:text OP11-021]"
      //
      // Two independent "up to 1"s behind one gate: the Character comes back to
      // block on the opponent's turn, and the DON!! comes back to pay for a
      // Counter. The hand ceiling is what stops a hoarding player getting both
      // for free every turn.
      "OP11-021",
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
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  anyOf: [{ type: "Fish-Man" }, { type: "Merfolk" }],
                  rested: true,
                },
                bind: "op11-jinbe-leader-active",
                min: 0,
                max: 1,
                effect: {
                  kind: "update",
                  binding: "op11-jinbe-leader-active",
                  rested: false,
                },
              },
              { kind: "activate-don", player: "self", count: 1 },
            ],
          },
        },
      },
    ],
    [
      // OP11-067 Charlotte Katakuri: "[printed text omitted -- pnpm card:text OP11-067]"
      //
      // An 8-cost body that un-rests the two Characters that attacked and ramps
      // besides -- which is why the DON!! it adds arrives *rested*: it pays next
      // turn, not this one.
      "OP11-067",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                type: "Big Mom Pirates",
                minCost: 3,
                rested: true,
              },
              bind: "op11-katakuri-active",
              min: 0,
              max: 2,
              effect: {
                kind: "update",
                binding: "op11-katakuri-active",
                rested: false,
              },
            },
            { kind: "add-don", player: "self", count: 1, rested: true },
          ],
        },
      },
    ],
  ],
  trigger: [
    [
      // OP11-018 Honesty Impact: "[printed text omitted -- pnpm card:text OP11-018]"
      //
      // Narrower than its own `[Main]`, which debuffs first, so the two are
      // written separately: current power, and nothing has moved it.
      "OP11-018",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCurrentPower: 6_000,
          },
          bind: "op11-honesty-trigger-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op11-honesty-trigger-ko" },
        },
      },
    ],
    [
      // OP11-019 Glorp Web!!: "[printed text omitted -- pnpm card:text OP11-019]"
      "OP11-019",
      { effect: ownLeaderOrCharacterBuff("op11-glorp-trigger") },
    ],
    [
      // OP11-020 X Calibur: the same Trigger.
      "OP11-020",
      { effect: ownLeaderOrCharacterBuff("op11-calibur-trigger") },
    ],
    [
      // OP11-023 Arlong: "[printed text omitted -- pnpm card:text OP11-023]" Its cost-reduction clause is a static ability.
      "OP11-023",
      { effect: restOpponentUpToCost(4, "op11-arlong-trigger") },
    ],
    [
      // OP11-028 Lord of the Coast: "[printed text omitted -- pnpm card:text OP11-028]"
      "OP11-028",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            rested: true,
            maxCost: 3,
          },
          bind: "op11-lord-trigger-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op11-lord-trigger-ko" },
        },
      },
    ],
    [
      // OP11-037 Ancient Weapon Poseidon: "[Trigger] Draw 1 card."
      "OP11-037",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP11-039 Vagabond Drill: "[printed text omitted -- pnpm card:text OP11-039]"
      "OP11-039",
      { effect: restOpponentUpToCost(4, "op11-vagabond-trigger") },
    ],
    [
      // OP11-059 Gum-Gum King Cobra: "[printed text omitted -- pnpm card:text OP11-059]"
      "OP11-059",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 2,
          },
          bind: "op11-cobra-trigger",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op11-cobra-trigger",
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP11-060 "Let's Crash This Wedding!!!": "[printed text omitted -- pnpm card:text OP11-060]"
      "OP11-060",
      op11EventPrograms["OP11-060"]!,
    ],
    [
      // OP11-075 Jaguar.D.Saul: "[printed text omitted -- pnpm card:text OP11-075]"
      "OP11-075",
      asOnPlayTrigger(saulOnPlay),
    ],
    [
      // OP11-098 Blue Hole: "[printed text omitted -- pnpm card:text OP11-098]"
      "OP11-098",
      { effect: ownLeaderOrCharacterBuff("op11-blue-hole-trigger") },
    ],
    [
      // OP11-099 "[printed text omitted -- pnpm card:text OP11-099]": "[printed text omitted -- pnpm card:text OP11-099]"
      "OP11-099",
      op11EventPrograms["OP11-099"]!,
    ],
    [
      // OP11-115 "You're Just Not My Type!": "[printed text omitted -- pnpm card:text OP11-115]"
      //
      // Unconditional, unlike its own `[Counter]`: the Trigger does not ask about
      // the Leader at all.
      "OP11-115",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 2,
          },
          bind: "op11-not-my-type-trigger",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op11-not-my-type-trigger" },
        },
      },
    ],
    [
      // OP11-116 Merman Combat Ultramarine: "[printed text omitted -- pnpm card:text OP11-116]"
      //
      // The opponent's Characters only, unlike its `[Main]`: off a Trigger the
      // clause is pure removal, and the Life card it becomes is theirs.
      "OP11-116",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 4,
          },
          bind: "op11-ultramarine-trigger",
          min: 0,
          max: 1,
          effect: {
            kind: "choice",
            branches: [
              {
                id: "top",
                label: "Add it to the top of the owner's Life cards",
                effect: {
                  kind: "move",
                  binding: "op11-ultramarine-trigger",
                  to: { player: "owner", zone: "life", position: "top" },
                  faceUp: true,
                },
              },
              {
                id: "bottom",
                label: "Add it to the bottom of the owner's Life cards",
                effect: {
                  kind: "move",
                  binding: "op11-ultramarine-trigger",
                  to: { player: "owner", zone: "life", position: "bottom" },
                  faceUp: true,
                },
              },
            ],
          },
        },
      },
    ],
  ],
};
