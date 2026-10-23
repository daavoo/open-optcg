/**
 * OP07 `[Trigger]`, `[On K.O.]` and `[End of Your Turn]` programs.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP07-0xx` prints it from the local cache).
 *
 * Two OP07 `[Trigger]`s were in the pool before the set was, as cards community
 * decks ship: OP07-107 Franky and OP07-114 (`eb04-bonney.ts`), and neither is
 * registered here. OP07-056 Slave Arrow's `[Counter]` is an imperative branch
 * in `legal-actions/counter.ts`; its `[Trigger]` is an ordinary program below.
 *
 * An Event's `[Trigger]` that reads "activate this card's [Main]/[Counter]
 * effect" is literally the same program, registered twice -- the shape
 * `op17-kaido.ts` established for OP07-077.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { koCostAtMost, playFromHand } from "./op08-shared.js";
import { op07MainMechanics } from "./op07-main.js";
import { op07BattleMechanics } from "./op07-battle.js";
import {
  addDonActive,
  bounceCostAtMost,
  buffOwnCardForTurn,
  lifeAtMost,
  playSelfBehindVegapunk,
  restCostAtMost,
} from "./op07-shared.js";

/**
 * The `[Main]`/`[Counter]` program an Event's own `[Trigger]` re-runs, read
 * back out of the table that owns it.
 *
 * Looked up rather than duplicated: "activate this card's [Main] effect" is
 * the same clause, and a second copy of the program is a second thing to keep
 * in step. A missing key is a programming error, not a card the set prints, so
 * it throws.
 */
const ownEventProgram = (cardNumber: string) => {
  const entry = (op07MainMechanics.eventMain ?? []).find(
    ([number]) => number === cardNumber,
  )?.[1];
  if (!entry) throw new Error(`MISSING_OP07_EVENT_PROGRAM: ${cardNumber}`);
  return entry.program;
};

const ownCounterProgram = (cardNumber: string) => {
  const entry = (op07BattleMechanics.counterEvent ?? []).find(
    ([number]) => number === cardNumber,
  )?.[1];
  if (!entry?.program) {
    throw new Error(`MISSING_OP07_COUNTER_PROGRAM: ${cardNumber}`);
  }
  return entry.program;
};

/** "…and add this card to your hand" -- OP07-102 and OP07-103's Triggers. */
const selfToHand: MechanicEffect = {
  kind: "move",
  binding: SOURCE_BINDING,
  to: { player: "self", zone: "hand" },
};

/** "Add up to 1 DON!! card from your DON!! deck and set it as active." */
const rampActiveProgram = { effect: addDonActive };

export const op07TriggerMechanics: SetMechanics = {
  trigger: [
    // OP07-008 Mr. Tanaka: a 3-cost Blocker that arrives off a Life card.
    ["OP07-008", { effect: { kind: "play", binding: SOURCE_BINDING } }],
    // OP07-016 Galaxy Wink and OP07-017 Dragon Breath: their own `[Main]`.
    ["OP07-016", ownEventProgram("OP07-016")],
    ["OP07-017", ownEventProgram("OP07-017")],
    // OP07-018 KEEP OUT: its own `[Counter]`, which is the buff rather than a
    // battle scalar -- see the entry in `op07-battle.ts`.
    ["OP07-018", ownCounterProgram("OP07-018")],
    [
      // OP07-056 Slave Arrow: a draw-two that puts two cards from hand back
      // under the deck. Its `[Counter]` half is imperative (see the header);
      // this half is a plain refill and needs nothing the DSL lacks. Both
      // placements are mandatory, so `min` equals `max`.
      "OP07-056",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op07-slave-arrow-bottom",
              min: 2,
              max: 2,
              effect: {
                kind: "move",
                binding: "op07-slave-arrow-bottom",
                to: { player: "self", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP07-035 Karmic Punishment: the Trigger is removal rather than power,
      // and it only answers a body that is already rested -- which off a Life
      // card means one that has attacked this turn.
      "OP07-035",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            rested: true,
            maxCost: 4,
          },
          bind: "op07-karmic-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op07-karmic-ko" },
        },
      },
    ],
    [
      // OP07-036: the Trigger is the rest half alone, one cost step narrower
      // than the Event's and with nothing to pay for it.
      "OP07-036",
      { effect: restCostAtMost(4, "op07-asura-trigger-rest") },
    ],
    // OP07-037 More Pizza!! and OP07-057 Perfume Femur: a card.
    ["OP07-037", { effect: { kind: "draw", player: "self", count: 1 } }],
    ["OP07-057", { effect: { kind: "draw", player: "self", count: 1 } }],
    [
      // OP07-055 Snake Dance: one of the controller's own Characters back in
      // hand buys the opponent's biggest bounce in the set.
      //
      // Nested rather than sequenced: the return is the cost, so a board with
      // nothing to give back cannot buy the bounce.
      "OP07-055",
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
            bind: "op07-snake-trigger-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op07-snake-trigger-cost",
                  to: { player: "owner", zone: "hand" },
                },
                bounceCostAtMost(5, "op07-snake-trigger-bounce"),
              ],
            },
          },
        },
      },
    ],
    // OP07-076 Slow-Slow Beam Sword and OP07-078 Megaton Nine-Tails Rush: the
    // Purple package's DON!! back, active rather than rested this time --
    // arriving on the opponent's turn, it is a Counter the deck can still pay.
    ["OP07-076", rampActiveProgram],
    ["OP07-078", rampActiveProgram],
    [
      // OP07-094 Shave: a Character back in hand, with no type restriction and
      // no trash gate -- the Trigger is the wider half of the card.
      "OP07-094",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "board", category: "character" },
          bind: "op07-shave-trigger",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op07-shave-trigger",
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP07-095 Iron Body: +1000 for the turn rather than for the battle,
      // which off a Life card is what keeps it useful after the fight that
      // revealed it.
      "OP07-095",
      { effect: buffOwnCardForTurn(1_000, "op07-iron-trigger") },
    ],
    // OP07-096 Tempest Kick: removal at the cost ceiling Black lives on.
    ["OP07-096", { effect: koCostAtMost(3, "op07-tempest-trigger") }],
    // The five Egghead bodies whose Trigger plays them behind their own Leader.
    ["OP07-098", { effect: playSelfBehindVegapunk }],
    ["OP07-100", { effect: playSelfBehindVegapunk }],
    ["OP07-101", { effect: playSelfBehindVegapunk }],
    ["OP07-105", { effect: playSelfBehindVegapunk }],
    ["OP07-110", { effect: playSelfBehindVegapunk }],
    ["OP07-111", { effect: playSelfBehindVegapunk }],
    [
      // OP07-099 Usopp: a buff that survives into the controller's own turn,
      // which is what makes a 1-cost 2000 with no other text worth a slot.
      "OP07-099",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            includeLeader: true,
            type: "Egghead",
          },
          bind: "op07-usopp-buff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op07-usopp-buff",
            amount: 2_000,
            // Counted from the controller's turn: their next one, end of.
            expiresAfterTurns: 2,
          },
        },
      },
    ],
    [
      // OP07-102 Jinbe: a bounce, and the card itself into hand rather than the
      // trash -- so the Life card is a Counter Event that also stays castable.
      "OP07-102",
      {
        effect: {
          kind: "sequence",
          effects: [bounceCostAtMost(4, "op07-jinbe-trigger"), selfToHand],
        },
      },
    ],
    [
      // OP07-103 Tony Tony.Chopper: [Blocker] handed to an Egghead body for the
      // rest of the attacking player's turn, and the card kept.
      "OP07-103",
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
                type: "Egghead",
              },
              bind: "op07-chopper-grant",
              min: 0,
              max: 1,
              effect: {
                kind: "grant-keyword",
                binding: "op07-chopper-grant",
                keyword: "Blocker",
                expiresAfterTurns: 0,
              },
            },
            selfToHand,
          ],
        },
      },
    ],
    [
      // OP07-104 Nico Robin: two cards behind an {Egghead} Leader -- a type
      // gate rather than the name gate the "play this card" Triggers use, so
      // any Egghead Leader pays it.
      "OP07-104",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Egghead",
          },
          then: { kind: "draw", player: "self", count: 2 },
        },
      },
    ],
    // OP07-109 Monkey.D.Luffy: the same removal its activation buys, for free.
    ["OP07-109", { effect: koCostAtMost(4, "op07-luffy-trigger") }],
    [
      // OP07-113 Roronoa Zoro: a rest that may take the opponent's Leader,
      // which off a Life card in the middle of their attack step costs them
      // the rest of the turn.
      "OP07-113",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Egghead",
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              includeLeader: true,
              canRest: true,
            },
            bind: "op07-zoro-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op07-zoro-rest" },
          },
        },
      },
    ],
    [
      // OP07-115 I Re-Quasar Helllp!!: an Egghead body straight out of the
      // trash, which is where this deck's own Life spending puts them.
      "OP07-115",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            type: "Egghead",
            maxCost: 5,
          },
          bind: "op07-quasar-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op07-quasar-play" },
        },
      },
    ],
    [
      // OP07-116 Blaze Slice: the Trigger is the rest half alone, without the
      // buff or the opponent's Life gate the two Event halves carry.
      "OP07-116",
      { effect: restCostAtMost(4, "op07-blaze-trigger") },
    ],
    // OP07-117 Egghead: a Stage off a Life card. `play` puts a Stage in the
    // Stage area rather than on the board -- see the `stagePlay` branch.
    ["OP07-117", { effect: { kind: "play", binding: SOURCE_BINDING } }],
  ],
  onKo: [
    [
      // OP07-020 Aladine: a 5-cost Blocker that leaves a cheaper Fish-Man
      // behind it, behind the Leader type the whole Green package is built on.
      "OP07-020",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Fish-Man",
          },
          then: playFromHand(
            {
              category: "character",
              anyOf: [{ type: "Fish-Man" }, { type: "Merfolk" }],
              maxCost: 3,
            },
            "op07-aladine-play",
          ),
        },
      },
    ],
    [
      // OP07-105 Pythagoras: from two Life or fewer, an Egghead body out of the
      // trash -- rested, which is the price for it arriving at all.
      //
      // No `opponentEffectOnly`: the printed clause is a bare `[On K.O.]`, so
      // losing a fight fires it exactly as an opposing removal does. That is
      // the point of a 5-cost 6000 in a deck that wants to be attacked.
      "OP07-105",
      {
        effect: {
          kind: "if",
          condition: lifeAtMost(2),
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "trash",
              category: "character",
              type: "Egghead",
              maxCost: 4,
              excludeSource: true,
            },
            bind: "op07-pythagoras-play",
            min: 0,
            max: 1,
            effect: {
              kind: "play",
              binding: "op07-pythagoras-play",
              rested: true,
            },
          },
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // OP07-021 Urouge: a DON!! back at the end of every turn, on a 5-cost
      // Blocker -- the Supernovas deck's way of paying for a Counter Event on
      // the turn it spent everything.
      "OP07-021",
      { effect: { kind: "activate-don", player: "self", count: 1 } },
    ],
    [
      // OP07-117 Egghead (Stage): an Egghead body set active at the end of the
      // turn, so it is standing for the opponent's attacks.
      //
      // The Life gate is Yellow's usual trade, and this is the widest of them:
      // three Life rather than two, which is where the deck sits for most of a
      // game.
      "OP07-117",
      {
        effect: {
          kind: "if",
          condition: lifeAtMost(3),
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              type: "Egghead",
              maxCost: 5,
              rested: true,
            },
            bind: "op07-egghead-active",
            min: 0,
            max: 1,
            effect: {
              kind: "update",
              binding: "op07-egghead-active",
              rested: false,
            },
          },
        },
      },
    ],
  ],
};
