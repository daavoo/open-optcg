/** OP17 `[Trigger]`, `[On K.O.]` and `[On Your Opponent's End of Turn]` programs. */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, lookAndAdd, maserSaberKo } from "./shared.js";

export const op17TriggerMechanics: SetMechanics = {
  onKo: [
    ["OP10-005", { effect: { kind: "draw", player: "self", count: 1 } }],
    [
      // OP17-053 Barbell: "[printed text omitted -- pnpm card:text OP17-053]"
      //
      // The opponent picks which two and in what order, so this is their choice,
      // resolved one card at a time -- which is what "in any order" means once the
      // cards are placed one after another.
      //
      // A hand of one still places that one, as OP17-049's Q&A rules for its
      // "trashes 2" (rule 8-4-4-1): `min: 2` alone would skip the clause.
      // Split on the count rather than made `exhaustive` throughout, because an
      // exhaustive pick against a hand of exactly two takes both unasked, and
      // the order is the opponent's to choose.
      "OP17-053",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "opponent",
            selector: { zone: "hand" },
            operator: "gte",
            value: 2,
          },
          then: {
            kind: "choose",
            selector: { player: "opponent", zone: "hand" },
            bind: "op17-barbell-bury",
            min: 2,
            max: 2,
            chooser: "opponent",
            effect: {
              kind: "move",
              binding: "op17-barbell-bury",
              to: { player: "opponent", zone: "deck", position: "bottom" },
            },
          },
          else: {
            kind: "choose",
            selector: { player: "opponent", zone: "hand" },
            bind: "op17-barbell-bury",
            min: 0,
            max: 1,
            exhaustive: true,
            chooser: "opponent",
            effect: {
              kind: "move",
              binding: "op17-barbell-bury",
              to: { player: "opponent", zone: "deck", position: "bottom" },
            },
          },
        },
      },
    ],
    [
      // OP17-012 Blenheim: "[Blocker] [On K.O.] Play up to 1 card with a cost of 1
      // and a type including Whitebeard Pirates from your hand."
      //
      // "a cost of 1" is exact, not a ceiling, so the bound is both ways. "A
      // type including" is a substring, so {Whitebeard Pirates Allies} bodies
      // qualify too.
      "OP17-012",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            typeIncluding: "Whitebeard Pirates",
            minCost: 1,
            maxCost: 1,
          },
          bind: "op17-blenheim-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op17-blenheim-play" },
        },
      },
    ],
    [
      // OP17-102 Charlotte Oven: "[printed text omitted -- pnpm card:text OP17-102]"
      //
      // Printed power from the trash, self excluded by name -- the same shape as
      // OP14-110's trash recursion, one bound tighter.
      "OP17-102",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            maxPower: 4000,
            excludeName: "Charlotte Oven",
          },
          bind: "op17-oven-free-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op17-oven-free-play" },
        },
      },
    ],
    [
      // OP17-015 Marco: "[On K.O.] You may trash 1 card with a type including
      // Whitebeard Pirates from your hand: Play this Character card from your
      // trash."
      //
      // By the time `onKoPrograms` dispatches, Marco is already sitting in the
      // trash -- `play`'s `SOURCE_BINDING` finds it there and moves it back,
      // exactly as OP17-102 Charlotte Oven's recursion does for a named target.
      // Its other printed clause -- "[printed text omitted -- pnpm card:text OP17-102]" -- is a static replacement option in `removal.ts`, which reaches
      // this same program through the ordinary K.O. pipeline. The secondary
      // import filed it as a Trigger; Bandai's own list prints it in the body,
      // which is where `removal.ts` already implemented it.
      //
      // The recursion is *inside* the `choose`, not a sibling step after it --
      // the shape `payFromHand` in `./shared.ts` exists to spell out, and the
      // one this registration was not using. A `choose` whose eligible set is
      // smaller than its `min` is skipped by `executeMechanicProgram`, and
      // only that node is skipped, so with the play as the next step of an
      // enclosing `sequence` the cost was optional in practice: a player
      // holding no {Whitebeard Pirates} card took the offer and got Marco back
      // for nothing. Not routed through `payFromHand` itself because that
      // helper pays from an unfiltered hand and this cost names a type.
      "OP17-015",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              typeIncluding: "Whitebeard Pirates",
            },
            bind: "op17-marco-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op17-marco-cost",
                  to: { player: "self", zone: "trash" },
                },
                { kind: "play", binding: SOURCE_BINDING },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-025 Building Snake: "[printed text omitted -- pnpm card:text OP17-025]" Its `[Activate: Main]` half
      // is registered separately in `activateMainPrograms`.
      "OP17-025",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            rested: true,
            maxCost: 6,
          },
          bind: "op17-building-snake-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op17-building-snake-ko" },
        },
      },
    ],
    [
      // OP17-026 Fugar: "[On K.O.] Draw 1 card." Its `[When Attacking]` half is
      // registered separately in `whenAttackingPrograms`.
      "OP17-026",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
  ],
  onEndOfYourTurn: [
    [
      // OP17-047 Shiki: "[printed text omitted -- pnpm card:text OP17-047]"
      //
      // It is the opponent's card leaving their own hand, so they pick it -- the
      // same `chooser: "opponent"` rule OP17-053 Barbell already uses for a
      // hand-bury that is not the source's own. An opponent with an empty hand
      // has nothing to choose: `min: 1` on zero eligible cards resolves to
      // nothing rather than raising an empty prompt.
      "OP17-047",
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
          then: {
            kind: "choose",
            selector: { player: "opponent", zone: "hand" },
            bind: "op17-shiki-bury",
            min: 1,
            max: 1,
            chooser: "opponent",
            effect: {
              kind: "move",
              binding: "op17-shiki-bury",
              to: { player: "opponent", zone: "deck", position: "bottom" },
            },
          },
        },
      },
    ],
    [
      // OP17-031 Yasopp: "[printed text omitted -- pnpm card:text OP17-031]" Its `[On Play]`
      // half is in `onPlayPrograms`, above.
      //
      // "Active" un-rests without a visible `character-rested` event to emit,
      // so it is `update: { rested: false }` rather than the `rest` effect,
      // which is the same reasoning that keeps a Stage's own rest out of that
      // event.
      //
      // `rested: true` on the selector is what makes the clause payable: an
      // already-active Character is not something this can set active, and an
      // "up to 1" whose only candidates are active is a prompt with nothing
      // behind it. With no rested candidate the `choose` has none and the
      // decision is never raised.
      //
      // `typeIncluding` rather than `type` because the printed text says "with
      // a type including", and OP-17 prints {Red-Haired Pirates Allies} bodies
      // the exact reading would not reach.
      "OP17-031",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            typeIncluding: "Red-Haired Pirates",
            rested: true,
          },
          bind: "op17-yasopp-activate",
          min: 0,
          max: 1,
          effect: {
            kind: "update",
            binding: "op17-yasopp-activate",
            rested: false,
          },
        },
      },
    ],
  ],
  trigger: [
    [
      // OP17-076 "Wo Ro Ro Ro Ro!! I Think I've Sobered Up!!": "[printed text omitted -- pnpm card:text OP17-076]" The first Trigger in the format to print a
      // DON!! cost -- `donMinus` already exists for exactly this shape and
      // dispatches through the same `MechanicProgram` machinery a Trigger
      // resolves through, so no new plumbing is needed, only the reuse.
      "OP17-076",
      { effect: donMinus(1, { kind: "draw", player: "self", count: 2 }) },
    ],
    [
      // OP17-102 Charlotte Oven: "[Trigger] Play this card."
      "OP17-102",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP17-107 Charlotte Daifuku: "[Trigger] Play this card."
      "OP17-107",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP17-101 Caribou: "[printed text omitted -- pnpm card:text OP17-101]"
      "OP17-101",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: "op17-caribou-trigger-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op17-caribou-trigger-cost",
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 5,
                  },
                  bind: "op17-caribou-trigger-ko",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "knock-out",
                    binding: "op17-caribou-trigger-ko",
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-071 Who's.Who: "[Trigger] Play this card."
      "OP17-071",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP17-108 Charlotte Brulee: "[printed text omitted -- pnpm card:text OP17-108]"
      "OP17-108",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 6,
          },
          bind: "op17-brulee-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op17-brulee-rest" },
        },
      },
    ],
    [
      // OP17-106 Charlotte Smoothie: "[Trigger] Play this card."
      //
      // Its [On Play] is `[Your Turn]`-gated, so a Smoothie that arrives this way
      // -- off a Life card, on the attacker's turn -- is a body and nothing more.
      "OP17-106",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP17-019 "I Don't have Time to Chat with Snot-Nosed Brats": "[printed text omitted -- pnpm card:text OP17-019]"
      //
      // `category: "leader"` against `zone: "board"` picks out only the Leader
      // pseudo-card `includeLeader` adds -- the same selector OP17-115's
      // keyword grant already uses to name a Leader with nothing to choose.
      "OP17-019",
      {
        effect: {
          kind: "select",
          selector: {
            player: "self",
            zone: "board",
            includeLeader: true,
            category: "leader",
          },
          bind: "op17-019-leader",
          count: 1,
          effect: {
            kind: "modify-power",
            binding: "op17-019-leader",
            amount: 1_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP17-109 Charlotte Pudding: "[printed text omitted -- pnpm card:text OP17-109]"
      "OP17-109",
      lookAndAdd(5, "op17-109-look", { type: "Big Mom Pirates" }),
    ],
    [
      // OP17-114 Sweet 3 Generals: "[Trigger] Play this card."
      "OP17-114",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP17-096 "I'm Luffy!! The Man Who Will Be King of the Pirates!!":
      // "[printed text omitted -- pnpm card:text OP17-096]"
      "OP17-096",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "trash", type: "Elbaph" },
          bind: "op17-096-trigger-add",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op17-096-trigger-add",
            to: { player: "self", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP17-103 Charlotte Katakuri: "[Trigger] Play this card."
      "OP17-103",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP17-104 Charlotte Cracker: "[Trigger] Play this card."
      "OP17-104",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP17-110 Charlotte Perospero: "[Trigger] Play this card."
      "OP17-110",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP17-111 Charlotte Mont-d'or: "[Trigger] Play this card."
      "OP17-111",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP17-117 Maser Saber: "[Trigger] Your opponent may trash 3 cards from
      // their hand, if they do not, you may K.O. up to 1 of your opponent's
      // Characters with a cost of 6 or less." Its `[Counter]` half is a plain
      // name-restricted `battle-power`, in `counterEventPrograms`, above.
      //
      // Not a bare `choice` with `chooser: "opponent"`: `choice` offers every
      // branch unconditionally (see `getMechanicChoiceOptions`), and an
      // opponent sitting at 1-2 hand cards could still pick "trash 3" -- its
      // inner `choose` would then see fewer than `min` eligible cards and
      // silently resolve to nothing (the same skip a bare `choose` gives any
      // under-`min` pool), denying the source's controller the K.O. the card
      // promises them for a payment that never happened. Gating on hand size
      // with `if` first removes that branch from the opponent's menu entirely
      // whenever they cannot actually pay it, routing straight to the K.O.
      // `else` -- the same "cannot pay" -> "declined" reading a hand-starved
      // opponent gets everywhere else in this file.
      //
      // The K.O. itself is "up to 1", so `min: 0` alone expresses it without an
      // `optional` wrapper -- the same shape OP17-018/OP17-056/OP17-036-adjacent
      // K.O. clauses above already use. It is offered to the *source's*
      // controller (the default `player`/`chooser`, "self"), not the opponent
      // who made the trash decision -- `resolvePlayer` always reads "self" off
      // `context.sourcePlayerId`, never off whichever player answered an outer
      // `choice`/`choose`, so this needs no explicit `chooser` to land on the
      // right player.
      "OP17-117",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "hand",
            operator: "gte",
            value: 3,
          },
          then: {
            kind: "choice",
            chooser: "opponent",
            branches: [
              {
                id: "trash",
                label: "Trash 3 cards from your hand",
                effect: {
                  kind: "choose",
                  selector: { player: "opponent", zone: "hand" },
                  bind: "op17-maser-saber-trash",
                  min: 3,
                  max: 3,
                  chooser: "opponent",
                  effect: {
                    kind: "move",
                    binding: "op17-maser-saber-trash",
                    to: { player: "opponent", zone: "trash" },
                  },
                },
              },
              {
                id: "decline",
                label: "Do not trash",
                effect: maserSaberKo,
              },
            ],
          },
          else: maserSaberKo,
        },
      },
    ],
  ],
};
