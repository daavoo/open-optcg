/**
 * EB-01 `[Trigger]`, `[On K.O.]` and `[End of Your Turn]` programs.
 *
 * See `mechanics/README.md` for how the set is split.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus } from "./shared.js";
import { addActiveDon, impelDownLeader } from "./eb01-shared.js";
import { chambresSwap, fingerPistolKo } from "./eb01-main.js";

/**
 * "Return up to 1 Character with a cost of N or less to the owner's <zone>."
 *
 * EB01-028's `[Trigger]` bottoms one and EB01-029's returns one to hand, at two
 * different ceilings. Both name no side, so both reach the controller's own
 * board -- which on a Trigger is not idle: the card fires off a Life card
 * during the opponent's attack, and saving a threatened body is what it buys.
 */
const bounceToOwner = (
  maxCost: number,
  zone: "hand" | "deck",
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "either",
    zone: "board",
    category: "character",
    maxCost,
  },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "move",
    binding: bind,
    to:
      zone === "deck"
        ? { player: "owner", zone: "deck", position: "bottom" }
        : { player: "owner", zone: "hand" },
  },
});

export const eb01TriggerMechanics: SetMechanics = {
  trigger: [
    [
      // EB01-010 There's No Way You Could Defeat Me!!: "[Trigger] K.O. up to 1
      // of your opponent's Characters with 5000 base power or less."
      //
      // A thousand less than the same card's `[Counter]` reaches, which is the
      // usual split: the half that costs a card from hand is the stronger one.
      "EB01-010",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxPower: 5_000,
          },
          bind: "eb01-010-trigger",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "eb01-010-trigger" },
        },
      },
    ],
    [
      // EB01-020 Chambres: "[Trigger] Activate this card's [Main] effect."
      //
      // The same fragment `eb01-main.ts` registers for the `[Main]` half,
      // registered twice rather than reached for, so the two cannot drift
      // apart -- the shape EB-02's {Music} cycle takes.
      "EB01-020",
      { effect: chambresSwap },
    ],
    [
      // EB01-028 Gum-Gum Champion Rifle: "[Trigger] Return up to 1 Character
      // with a cost of 3 or less to the bottom of the owner's deck."
      //
      // The bottom of the deck rather than the hand, which is what makes the
      // Trigger the harsher half of this card: the body does not come back.
      "EB01-028",
      { effect: bounceToOwner(3, "deck", "eb01-028-trigger") },
    ],
    [
      // EB01-029 Sorry. I'm a Goner.: "[Trigger] Return up to 1 Character with a
      // cost of 8 or less to the owner's hand."
      //
      // No reveal and no gamble, unlike the `[Counter]` on the same card, and a
      // far wider ceiling -- the Trigger is the half that answers a real threat.
      "EB01-029",
      { effect: bounceToOwner(8, "hand", "eb01-029-trigger") },
    ],
    [
      // EB01-030 Loguetown: "[Trigger] Play this card."
      //
      // A Stage off a Life card. It replaces whatever Stage was there, and its
      // own `[Activate: Main]` is live from the next Main Phase.
      "EB01-030",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // EB01-035 Ms. Monday: "[Trigger] DON!! −1: Play this card."
      //
      // The DON!! is paid on the opponent's turn, out of DON!! already spent --
      // which is why a 3-cost body arrives for what is often nothing at all.
      "EB01-035",
      { effect: donMinus(1, { kind: "play", binding: SOURCE_BINDING }) },
    ],
    [
      // EB01-038 Oh Come My Way: "[Trigger] DON!! −1: Draw 2 cards."
      "EB01-038",
      { effect: donMinus(1, { kind: "draw", player: "self", count: 2 }) },
    ],
    [
      // EB01-039 Conquerer of Three Worlds Ragnaraku: "[Trigger] Add up to 1
      // DON!! card from your DON!! deck and set it as active."
      "EB01-039",
      { effect: addActiveDon(1) },
    ],
    [
      // EB01-051 Finger Pistol: "[Trigger] Activate this card's [Main] effect."
      "EB01-051",
      { effect: fingerPistolKo },
    ],
    [
      // EB01-053 Gastino: "[Trigger] Give up to a total of 2 of your opponent's
      // Leader or Character cards −3000 power during this turn."
      //
      // "up to a total of 2" is one `choose` with `max: 2`, and the Leader is in
      // reach: splitting the debuff across two bodies or stacking it is the
      // player's call, and a single node is what keeps a card from being picked
      // twice.
      "EB01-053",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            includeLeader: true,
          },
          bind: "eb01-053-trigger",
          min: 0,
          max: 2,
          effect: {
            kind: "modify-power",
            binding: "eb01-053-trigger",
            amount: -3_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // EB01-059 Kingdom Come: "[Trigger] K.O. up to 1 of your opponent's
      // Characters with a cost equal to or less than the total of your and your
      // opponent's Life cards."
      //
      // The ceiling is read off the table rather than printed, and it moves the
      // wrong way for the player holding it: the Trigger fires as Life is being
      // lost, so the board it can answer shrinks as the game gets worse.
      // `maxCostFromZoneCount` is the field that says this -- both seats' Life,
      // which is what "your and your opponent's" names.
      "EB01-059",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCostFromZoneCount: { player: "either", zone: "life" },
          },
          bind: "eb01-059-trigger",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "eb01-059-trigger" },
        },
      },
    ],
    [
      // EB01-060 Did Someone Say...Kami?: "[Trigger] Draw 2 cards and trash 1
      // card from your hand."
      //
      // The same filter EB01-027 prints on an `[On Play]`: the draw resolves
      // first, so the card trashed may be one of the two just drawn.
      "EB01-060",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "eb01-060-trash",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb01-060-trash",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
  ],
  onKo: [
    [
      // EB01-036 Minochihuahua: "[On K.O.] If your Leader has the {Impel Down}
      // type, add up to 1 DON!! card from your DON!! deck and rest it."
      //
      // `rested: true` and not a choice: the DON!! arrives on the turn the body
      // died and cannot be spent until the next Refresh. A [Rush] body that
      // pays its controller for trading, which is the Impel Down plan.
      "EB01-036",
      {
        effect: {
          kind: "if",
          condition: impelDownLeader,
          then: { kind: "add-don", player: "self", count: 1, rested: true },
        },
      },
    ],
    [
      // EB01-057 Shirahoshi: untimed text that reads as an `[On K.O.]` scoped
      // to the opponent's effects (`pnpm card:text EB01-057`). It has no
      // marker, but it is the same window OP09-052 Marco's clause names, so it
      // shares that entry shape: `opponentEffectOnly` keeps a lost fight and
      // its controller's own removal from paying out. By the time this
      // dispatches the card is in the trash; the Life card comes off the deck.
      "EB01-057",
      {
        opponentEffectOnly: true,
        program: {
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "deck", position: "top" },
            bind: "eb01-shirahoshi-life",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "eb01-shirahoshi-life",
              to: { player: "self", zone: "life", position: "top" },
            },
          },
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // EB01-021 Hannyabal (Leader): "[End of Your Turn] You may return 1 of
      // your {Impel Down} type Characters with a cost of 2 or more to the
      // owner's hand: Add up to 1 DON!! card from your DON!! deck and set it as
      // active."
      //
      // The DON!! arrives active at the end of the turn, so it is there for the
      // *opponent's* turn -- Counter money -- and again on the controller's
      // next. The body returned is re-playable, which is what makes the price
      // bearable and what the Impel Down [On Play]s are built to exploit.
      "EB01-021",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              type: "Impel Down",
              minCost: 2,
            },
            bind: "eb01-hannyabal",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "eb01-hannyabal",
                  to: { player: "owner", zone: "hand" },
                },
                addActiveDon(1),
              ],
            },
          },
        },
      },
    ],
    [
      // EB01-022 Inazuma: "[End of Your Turn] If you have 2 or less cards in
      // your hand, draw 2 cards."
      //
      // Mandatory and gated on an empty hand, which is the same Impel Down
      // reading EB01-026 takes: the deck spends its hand and is paid for having
      // done so.
      "EB01-022",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "hand",
            operator: "lte",
            value: 2,
          },
          then: { kind: "draw", player: "self", count: 2 },
        },
      },
    ],
  ],
};
