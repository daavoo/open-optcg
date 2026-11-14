/**
 * OP-18's Green cards, OP18-021 through OP18-040 and OP18-118: the Water Seven
 * Luffy and Franky packages.
 *
 * One module for every timing window, because the colour's clauses lean on one
 * another -- most of them exist to set the Green Luffy Leader active again --
 * and reading them side by side is what shows the package. Continuous text is
 * in `op18-green-static.ts`.
 *
 * Comments paraphrase the clause rather than quoting it -- printed text is a
 * runtime asset (`pnpm card:text OP18-0xx` prints it from the local cache).
 */
import {
  SOURCE_BINDING,
  restableCards,
  type CardSelector,
  type MechanicEffect,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd, restCostAtMost } from "./shared.js";

/**
 * The Leader as a one-card selection. Selected with `select`, not `choose`:
 * "set your Leader as active" names one card and asks nothing.
 */
const OWN_LEADER: CardSelector = {
  player: "self",
  zone: [],
  includeLeader: true,
};

/** "Set your Leader as active", optionally only a Leader of one name. */
const setLeaderActive = (bind: string, name?: string): MechanicEffect => ({
  kind: "select",
  selector: name === undefined ? OWN_LEADER : { ...OWN_LEADER, name },
  bind,
  count: "all",
  effect: { kind: "update", binding: bind, rested: false },
});

/** "You may trash this Character: <effect>" -- the End of Your Turn price. */
const trashSelfFor = (effect: MechanicEffect): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "sequence",
    effects: [
      {
        kind: "move",
        binding: SOURCE_BINDING,
        to: { player: "self", zone: "trash" },
      },
      effect,
    ],
  },
});

/**
 * "Set up to 1 of your {Water Seven} type cards as active" -- the Leader, a
 * Character or the Stage. Only a rested one is offered: setting an active card
 * active changes nothing.
 */
const waterSevenActive = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "self",
    zone: ["board", "stage"],
    includeLeader: true,
    type: "Water Seven",
    rested: true,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "update", binding: bind, rested: false },
});

/**
 * "Up to 1 of your opponent's Characters [with a cost of N or less] cannot be
 * rested until the end of your opponent's next End Phase." Written on the
 * controller's own turn, so one turn on is the opponent's whole next turn.
 */
const cannotBeRested = (bind: string, maxCost?: number): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    ...(maxCost === undefined ? {} : { maxCost }),
  },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "restrict",
    binding: bind,
    restriction: "cannot-rest",
    expiresAfterTurns: 1,
  },
});

/**
 * OP18-032 Buggy: up to 1 of the opponent's rested Characters with 8000 power
 * or less does not become active in the opponent's next Refresh Phase.
 *
 * The [On K.O.] half can resolve on either player's turn. On its controller's
 * turn the opponent's next Refresh is one turn on; on the opponent's own turn
 * that Refresh has already happened, and the next one is two turns on -- a
 * single `expiresAfterTurns` would hold the Character through nothing.
 */
const buggyLock = (bind: string): MechanicEffect => {
  const lock = (expiresAfterTurns: number): MechanicEffect => ({
    kind: "choose",
    selector: {
      player: "opponent",
      zone: "board",
      category: "character",
      rested: true,
      maxCurrentPower: 8000,
    },
    bind,
    min: 0,
    max: 1,
    effect: {
      kind: "restrict",
      binding: bind,
      restriction: "cannot-refresh",
      expiresAfterTurns,
    },
  });
  return {
    kind: "if",
    condition: { kind: "turn-player", player: "self" },
    then: lock(1),
    else: lock(2),
  };
};

/**
 * "This card will not become active in your next Refresh Phase", written on
 * its controller's own turn: the next own Refresh is two turns on.
 */
const holdThroughOwnRefresh: MechanicEffect = {
  kind: "restrict",
  binding: SOURCE_BINDING,
  restriction: "cannot-refresh",
  expiresAfterTurns: 2,
};

export const op18GreenMechanics: SetMechanics = {
  activateMain: [
    [
      // OP18-021 Franky, the Leader: once per turn, DON!! −1 plays up to 1
      // Stage with a cost of 5 or less from hand.
      //
      // Gated on a Stage to play as well as on the DON!!: with none in hand
      // the activation can only return a DON!! for nothing.
      "OP18-021",
      {
        oncePerTurn: true,
        requires: {
          fieldDon: 1,
          handCardsMatching: {
            match: { category: "stage", maxCost: 5 },
            count: 1,
          },
        },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "return-don", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "stage",
                  maxCost: 5,
                },
                bind: "op18-franky-leader-stage",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "op18-franky-leader-stage" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP18-028 Chimney: rest 1 of your [Gonbe] and this Character to set a
      // [Monkey.D.Luffy] Leader active.
      //
      // Both rests are the price, so the activation needs an active Gonbe and
      // an active Chimney, neither under a "cannot be rested" effect -- a rest
      // that changes nothing pays nothing. The top-level `if` is what the
      // offer gate reads. A
      // Leader of any other name still lets the price be paid -- the clause
      // then does nothing, which is the printed outcome.
      "OP18-028",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: {
                zone: "board",
                name: "Gonbe",
                rested: false,
                canRest: true,
              },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                name: "Gonbe",
                rested: false,
                canRest: true,
              },
              bind: "op18-chimney-gonbe",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: "op18-chimney-gonbe" },
                  { kind: "rest", binding: SOURCE_BINDING },
                  setLeaderActive("op18-chimney-leader", "Monkey.D.Luffy"),
                ],
              },
            },
          },
        },
      },
    ],
  ],
  whenAttacking: [
    [
      // OP18-022 Monkey.D.Luffy, the Leader: with 3 DON!! given, once per
      // turn, it may restand as it attacks -- and if it does, it skips its own
      // next Refresh Phase.
      //
      // The restand is a second Leader attack this turn bought with the next
      // turn's first one; the rest of the Green package (Kokoro, Gonbe,
      // Chimney, OP18-036) exists to set the Leader active again at the end of
      // the turn, which the skipped Refresh cannot undo.
      "OP18-022",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "source-attached-don",
              operator: "gte",
              value: 3,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "update", binding: SOURCE_BINDING, rested: false },
                  holdThroughOwnRefresh,
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP18-029 Tony Tony.Chopper: once per turn, give up to 3 rested DON!!
      // to the Leader and restand; then it skips its own next Refresh Phase.
      "OP18-029",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "give-rested-don",
                player: "self",
                count: 3,
                recipient: "leader",
              },
              { kind: "update", binding: SOURCE_BINDING, rested: false },
              holdThroughOwnRefresh,
            ],
          },
        },
      },
    ],
  ],
  onPlay: [
    [
      // OP18-023 Gaimon: up to 1 {East Blue} Leader or Character gains
      // [Banish] for the rest of the turn.
      "OP18-023",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            includeLeader: true,
            type: "East Blue",
          },
          bind: "op18-gaimon-banish",
          min: 0,
          max: 1,
          effect: {
            kind: "grant-keyword",
            binding: "op18-gaimon-banish",
            keyword: "Banish",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP18-027 Zoro & Sogeking: set up to 2 DON!! active, then up to 1
      // opposing Character with a cost of 6 or less cannot be rested through
      // the opponent's next turn.
      "OP18-027",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "activate-don", player: "self", count: 2 },
            cannotBeRested("op18-zoro-sogeking-lock", 6),
          ],
        },
      },
    ],
    [
      // OP18-032 Buggy, [On Play] half; the [On K.O.] half is below.
      "OP18-032",
      { effect: buggyLock("op18-buggy-lock") },
    ],
    [
      // OP18-034 Franky: play up to 1 {The Franky Family} or {Straw Hat Crew}
      // card with a cost of 5 or less from hand, then with a 5-cost-or-more
      // Stage out, rest up to 1 opposing Character with a cost of 6 or less.
      //
      // "Card" reaches Stages as well as Characters -- the Japanese text names
      // no category -- and an Event is never played, so those are the two.
      // The Stage check follows the play, so a 5-cost Stage played by the
      // first half turns the second half on.
      "OP18-034",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                maxCost: 5,
                anyOf: [
                  { category: "character", type: "The Franky Family" },
                  { category: "character", type: "Straw Hat Crew" },
                  { category: "stage", type: "The Franky Family" },
                  { category: "stage", type: "Straw Hat Crew" },
                ],
              },
              bind: "op18-franky-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op18-franky-play" },
            },
            {
              kind: "if",
              condition: {
                kind: "selector-count",
                player: "self",
                selector: { zone: "stage", minCost: 5 },
                operator: "gte",
                value: 1,
              },
              then: restCostAtMost(6, "op18-franky-rest"),
            },
          ],
        },
      },
    ],
    [
      // OP18-118 Monkey.D.Luffy: set up to 3 DON!! active, then up to 1
      // opposing Character cannot be rested through the opponent's next turn.
      // Its [End of Your Turn] half is below.
      "OP18-118",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "activate-don", player: "self", count: 3 },
            cannotBeRested("op18-luffy118-lock"),
          ],
        },
      },
    ],
  ],
  onKo: [
    [
      // OP18-032 Buggy, [On K.O.] half -- see `buggyLock` for the turn split.
      "OP18-032",
      { effect: buggyLock("op18-buggy-ko-lock") },
    ],
    [
      // OP18-037 Yokozuna: rest up to 1 of the opponent's cards -- the
      // Leader, a Character, the Stage or a DON!!.
      "OP18-037",
      {
        effect: {
          kind: "choose",
          selector: restableCards("opponent"),
          bind: "op18-yokozuna-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op18-yokozuna-rest" },
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // OP18-024 Kokoro: may trash itself to set the Leader active.
      "OP18-024",
      { effect: trashSelfFor(setLeaderActive("op18-kokoro-leader")) },
    ],
    [
      // OP18-025 Gonbe: if it is rested, set the Leader active. Free, so it
      // is mandatory; Chimney's activation is the usual way it gets rested.
      "OP18-025",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "board", binding: SOURCE_BINDING, rested: true },
            operator: "gte",
            value: 1,
          },
          then: setLeaderActive("op18-gonbe-leader"),
        },
      },
    ],
    [
      // OP18-031 Nico Robin: set up to 1 {Water Seven} card and up to 1 DON!!
      // active. Its replacement half is in `replacement`, below.
      "OP18-031",
      {
        effect: {
          kind: "sequence",
          effects: [
            waterSevenActive("op18-robin-active"),
            { kind: "activate-don", player: "self", count: 1 },
          ],
        },
      },
    ],
    [
      // OP18-033 Banban: may trash itself to set up to 1 of its controller's
      // Characters active. Trashed first, so it is never its own target.
      "OP18-033",
      {
        effect: trashSelfFor({
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            rested: true,
          },
          bind: "op18-banban-active",
          min: 0,
          max: 1,
          effect: {
            kind: "update",
            binding: "op18-banban-active",
            rested: false,
          },
        }),
      },
    ],
    [
      // OP18-036 Monkey.D.Luffy: may trash itself to draw 1 and set the
      // Leader active.
      "OP18-036",
      {
        effect: trashSelfFor({
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            setLeaderActive("op18-luffy036-leader"),
          ],
        }),
      },
    ],
    [
      // OP18-118 Monkey.D.Luffy: set up to 1 {Water Seven} card active.
      "OP18-118",
      { effect: waterSevenActive("op18-luffy118-active") },
    ],
  ],
  eventMain: [
    [
      // OP18-038 Shoot Down That Flag.: look at 5, reveal up to 1 [Sogeking] or
      // {Straw Hat Crew} card and add it to hand, the rest to the bottom.
      "OP18-038",
      {
        cost: 1,
        program: lookAndAdd(5, "op18-flag-look", {
          anyOf: [{ name: "Sogeking" }, { type: "Straw Hat Crew" }],
        }),
      },
    ],
    [
      // OP18-040 Diable Jambe Flambé Shot: K.O. up to 1 rested opposing
      // Character with a cost of 7 or less.
      "OP18-040",
      {
        cost: 4,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              rested: true,
              maxCost: 7,
            },
            bind: "op18-flambe-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op18-flambe-ko" },
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP18-039 Gum-Gum Giant Axe: +2000 to a [Monkey.D.Luffy] for the
      // battle, then draw 1 if the Leader is active.
      //
      // The draw is not conditioned on the power landing: it reads only the
      // Leader's state, which on the defender's turn is active unless OP18-022
      // spent its Refresh.
      "OP18-039",
      {
        cost: 1,
        power: 2_000,
        target: { name: "Monkey.D.Luffy" },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: { zone: [], includeLeader: true, rested: false },
              operator: "gte",
              value: 1,
            },
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
  ],
  trigger: [
    [
      // OP18-038's [Trigger]: draw 1.
      "OP18-038",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP18-040's [Trigger]: rest up to 1 opposing Character with a cost of 7
      // or less.
      "OP18-040",
      { effect: restCostAtMost(7, "op18-flambe-trigger-rest") },
    ],
  ],
  replacement: [
    [
      // OP18-026 Sanji: when a {Straw Hat Crew} Character would leave the
      // field by the opponent's effect, it may be trashed instead.
      //
      // No "other than this Character" in the Japanese text, so Sanji covers
      // itself too -- trashing it in place of a bounce or a bury is a real
      // choice for a deck that wants it in the trash rather than in hand.
      "OP18-026",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: { category: "character", type: "Straw Hat Crew" },
        label: "Trash Sanji",
        cost: { kind: "trash-self" },
      },
    ],
    [
      // OP18-031 Nico Robin: on the opponent's turn, when any of its
      // controller's Characters would leave the field by the opponent's
      // effect, it may rest instead. Only an active Robin can pay.
      "OP18-031",
      {
        opponentEffectOnly: true,
        opponentTurnOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: { category: "character" },
        label: "Rest Nico Robin",
        cost: { kind: "rest-self" },
      },
    ],
  ],
};
