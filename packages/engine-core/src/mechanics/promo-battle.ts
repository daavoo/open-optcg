/**
 * Battle-window programs for the `P-` promos: `[When Attacking]` and the one
 * `[Counter]` Event.
 *
 * Split by timing window like every other import; see `mechanics/README.md`.
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text P-0xx` prints it from the local cache).
 *
 * `[DON!! xN]` is an `if` on `source-attached-don`, which is how the pool
 * expresses the printed marker: the engine has no generic gate for it, and
 * `donRequirement` on the record is read by the agents rather than by the
 * rules.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { costDebuff, powerDebuff } from "./op08-shared.js";
import { payFromHand } from "./shared.js";
import { silenceBlockers } from "./promo-shared.js";

/** `[DON!! xN]`: the clause only fires with N DON!! given to the source. */
const withDon = (count: number, then: MechanicEffect): MechanicEffect => ({
  kind: "if",
  condition: { kind: "source-attached-don", operator: "gte", value: count },
  then,
});

export const promoBattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // P-075 Monkey.D.Luffy: behind a big body, each attack trades a card for
      // a card.
      //
      // Not a draw clause: the hand is the same size afterwards, and what the
      // pair buys is the *choice* -- a dead Counter goes to the trash and the
      // top of the deck comes in its place. In Black that trash is a resource,
      // which is what makes the loop worth a clause at all.
      //
      // The gate is on a cost-8 body being out, which this card is not: at 7
      // cost it needs a second, larger Character beside it, so the clause is
      // dead on the turn Luffy lands and live on every turn after that the
      // board holds up.
      "P-075",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: { zone: "board", category: "character", minCost: 8 },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "sequence",
              effects: [
                { kind: "draw", player: "self", count: 1 },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "p075-discard",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "p075-discard",
                    to: { player: "self", zone: "trash" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // P-019 Bepo: with a DON!! on it, the swing K.O.s anything at 3000 power
      // or less.
      //
      // `maxCurrentPower`, so a body a debuff has dropped into range this turn
      // is reachable -- which on a 3-cost 2000 is most of what it will ever
      // kill.
      "P-019",
      {
        oncePerTurn: false,
        program: {
          effect: withDon(1, {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 3_000,
            },
            bind: "p019-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "p019-ko" },
          }),
        },
      },
    ],
    [
      // P-026 Morgan: the swing takes 3 cost off an opposing body for the
      // turn -- the widest cost debuff a 4-cost Black body prints, and what it
      // is for is the "cost N or less" removal beside it.
      "P-026",
      { effect: costDebuff(3, "p026-debuff") },
    ],
    [
      // P-035 Monkey.D.Luffy: with a DON!! on it, a card out of hand K.O.s a
      // *zero-cost* body.
      //
      // A band of exactly 0 rather than a ceiling: this is Black's payoff for
      // the cost debuffs it prints everywhere else, so the K.O. reaches only
      // what the deck has already shrunk to nothing.
      "P-035",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: withDon(1, {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "p035-cost",
              1,
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  minCost: 0,
                  maxCost: 0,
                },
                bind: "p035-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "p035-ko" },
              },
            ),
          }),
        },
      },
    ],
    [
      // P-036 Monkey.D.Luffy: a Life card into hand buys +1000 on this body
      // and +1000 on the Leader.
      //
      // `position: "edge"` is the printed "top or bottom", which is the two
      // ends of the stack and no card between them. The Life card joins the
      // hand, so the price is the Life total rather than the card -- and both
      // buffs are inside the payment, because the printed sentence is one.
      "P-036",
      {
        oncePerTurn: false,
        requires: { lifeCardsMatching: { match: {}, count: 1 } },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "edge" },
              bind: "p036-life",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "p036-life",
                    to: { player: "self", zone: "hand" },
                  },
                  {
                    kind: "modify-power",
                    binding: SOURCE_BINDING,
                    amount: 1_000,
                    expiresAfterTurns: 0,
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: [],
                      includeLeader: true,
                    },
                    bind: "p036-leader",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "modify-power",
                      binding: "p036-leader",
                      amount: 1_000,
                      expiresAfterTurns: 0,
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
      // P-037 Monkey.D.Luffy: +1000 off a board that has already attacked --
      // Green's reward for swinging wide before it swings big.
      "P-037",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "board", category: "character", rested: true },
            operator: "gte",
            value: 2,
          },
          then: {
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 1_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // P-047 Monkey.D.Luffy (Leader): with a DON!! on it, the swing refills a
      // hand that is nearly empty.
      //
      // The ceiling is what keeps it from drawing on a full grip, which is the
      // Blue shape: the deck spends its hand on Counters and this pays it back.
      "P-047",
      {
        oncePerTurn: false,
        program: {
          effect: withDon(1, {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "hand",
              operator: "lte",
              value: 3,
            },
            then: { kind: "draw", player: "self", count: 1 },
          }),
        },
      },
    ],
    [
      // P-048 Arlong: with a DON!! on it and four Life still standing, the
      // opponent buries a card from hand.
      //
      // `chooser: "opponent"` is the printed clause: the card is theirs and
      // they pick it. Not "up to" -- a hand with a card in it loses one -- and
      // the Life floor is what makes it an early-game clause.
      "P-048",
      {
        oncePerTurn: false,
        program: {
          effect: withDon(1, {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "gte",
              value: 4,
            },
            then: {
              kind: "choose",
              selector: { player: "opponent", zone: "hand" },
              bind: "p048-bury",
              chooser: "opponent",
              min: 1,
              max: 1,
              effect: {
                kind: "order-to-bottom",
                binding: "p048-bury",
                to: { player: "opponent", zone: "deck", position: "bottom" },
              },
            },
          }),
        },
      },
    ],
    [
      // P-051 Shanks: any number of cards out of hand, +1000 each, for the
      // battle in progress.
      //
      // `battle-power` with `perCard`, so the size of the binding the `choose`
      // filled is the multiplier. Battle-scoped, which is what "during this
      // battle" says -- a turn-scoped modifier would leave a 9000 attacker at
      // the raised number for every later attack in the turn.
      //
      // The maximum is a hand the pool cannot exceed rather than a printed
      // number; "any number" has no ceiling but a hand does.
      "P-051",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "p051-fuel",
              min: 1,
              max: 10,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "p051-fuel",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "battle-power",
                    player: "self",
                    amount: 1_000,
                    perCard: "p051-fuel",
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // P-065 Tony Tony.Chopper: +2000 that outlives the turn, off an opposing
      // body Black has already shrunk to nothing.
      //
      // `expiresAfterTurns: 1` is "until the start of your next turn", so the
      // buff is still there when the opponent attacks into it -- which is the
      // defensive half of a 3-cost 4000.
      "P-065",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "opponent",
            selector: {
              zone: "board",
              category: "character",
              minCost: 0,
              maxCost: 0,
            },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 2_000,
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // P-083 Shanks: with a DON!! on it, a Character out of hand buys a
      // −1000 and a card back.
      //
      // "Then" opens a second sentence, so the draw does not hang off the
      // debuff having found a target -- but both sit inside the payment, which
      // is one card for the pair. Net card-neutral, which is what makes a
      // 6-cost 7000 worth the slot.
      "P-083",
      {
        oncePerTurn: false,
        requires: {
          handCardsMatching: { match: { category: "character" }, count: 1 },
        },
        program: {
          effect: withDon(1, {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand", category: "character" },
              "p083-cost",
              1,
              {
                kind: "sequence",
                effects: [
                  powerDebuff(1_000, "p083-debuff"),
                  { kind: "draw", player: "self", count: 1 },
                ],
              },
            ),
          }),
        },
      },
    ],
    [
      // P-092 Koby: behind a {Navy} Leader, the swing rewrites that Leader's
      // base power to 7000 until the opponent's next turn is over.
      //
      // `set-leader-base-power` rather than a modifier, because "becomes" is a
      // replacement: two of these do not stack to 14000, and against another
      // "becomes" the higher number applies (rule 4-9-2-1). `expiresAfterTurns: 1` is what the printed duration means in
      // player-turns, so the Leader defends at 7000 as well as attacking at it
      // -- which is what pays for this body's own −3000 on that turn (a row in
      // `../static-abilities.ts`).
      "P-092",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Navy",
          },
          then: {
            kind: "set-leader-base-power",
            player: "self",
            value: 7_000,
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    // P-097 Shanks: the opponent cannot block this turn. The same program its
    // `[On Play]` runs -- one clause, two windows, two tables.
    ["P-097", { effect: silenceBlockers }],
    [
      // P-099 Monkey.D.Luffy: ten DON!! back to the DON!! deck set this body
      // active again mid-attack.
      //
      // The whole cost area, so this is the last thing that happens in a turn
      // and it buys a second swing with a 12000. `update` rather than `rest`'s
      // inverse: nothing in the pool watches a Character becoming *active*, so
      // there is no signal to raise.
      "P-099",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "field-don",
              player: "self",
              operator: "gte",
              value: 10,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "return-don", player: "self", count: 10 },
                  { kind: "update", binding: SOURCE_BINDING, rested: false },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // P-100 Marshall.D.Teach: the swing switches off the opponent's Leader
      // and every Character they have for the turn.
      //
      // The widest negation in the pool, and it reaches the Leader -- which
      // `negate` handles by instance, the same handle the Leader's pseudo-card
      // carries everywhere else. `expiresAfterTurns: 0` is "during this turn",
      // so what it buys is one turn where nothing on the other side answers.
      "P-100",
      {
        effect: {
          kind: "select",
          selector: {
            player: "opponent",
            zone: "board",
            includeLeader: true,
          },
          bind: "p100-negate",
          count: "all",
          effect: {
            kind: "negate",
            binding: "p100-negate",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // P-155 Trafalgar Law: a [Trigger] card out of hand buys −2000 on an
      // opposing body for the turn.
      //
      // The cost names the cards this deck's Life stack is full of, which is
      // what makes it cheap here and expensive anywhere else. Its own
      // `[Trigger]` is in `promo-triggers.ts`.
      "P-155",
      {
        oncePerTurn: false,
        requires: {
          handCardsMatching: { match: { hasTrigger: true }, count: 1 },
        },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand", hasTrigger: true },
              "p155-cost",
              1,
              powerDebuff(2_000, "p155-debuff"),
            ),
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // P-059 The World's Continuation: behind the named Leader, any number of
      // its controller's own Characters go home for +2000 each.
      //
      // `power: 0` with the work in the program, because no number can be
      // promised before the player answers: the payout is the size of a choice
      // they have not made yet. Returning your own board to hand mid-battle is
      // the point -- the {FILM} bodies it takes back are the ones whose
      // `[On Play]` the deck wants to run again.
      "P-059",
      {
        cost: 2,
        power: 0,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Uta",
            },
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                },
                bind: "p059-return",
                min: 1,
                max: 10,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "p059-return",
                      to: { player: "owner", zone: "hand" },
                    },
                    {
                      kind: "battle-power",
                      player: "self",
                      amount: 2_000,
                      perCard: "p059-return",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ],
  ],
};
