/**
 * OP06 battle-window programs: `[When Attacking]`, `[On Block]` and
 * `[On Your Opponent's Attack]`.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP06-0xx` prints it from the local cache).
 *
 * `[DON!! xN]` is an `if` on `source-attached-don` in every one of these, which
 * is how the pool expresses it: the engine has no generic gate for the printed
 * marker, and `donRequirement` on the record is read by the agents rather than
 * by the rules.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { payFromHand } from "./shared.js";
import { addDonRested } from "./op07-shared.js";
import { powerDebuff } from "./op08-shared.js";
import { filmCard, lifeTopToHand, newFishManLeader } from "./op06-shared.js";

/** `[DON!! xN]`: the clause only fires with N DON!! given to the source. */
const withDon = (count: number, then: MechanicEffect): MechanicEffect => ({
  kind: "if",
  condition: { kind: "source-attached-don", operator: "gte", value: count },
  then,
});

/**
 * OP06-009 Shuraiya: its base power becomes the opposing Leader's until its
 * controller's next turn.
 *
 * `copy-power` with `base: true` -- the printed sentence names base power on
 * both sides, so the DON!! on that Leader and the modifiers on it do not
 * travel. The Leader is bound through `{ zone: [], includeLeader: true }`,
 * which is the only handle a card that sits in no zone has.
 *
 * Registered from the `[When Attacking]` and `[On Block]` tables both, because
 * the card prints one clause for two windows. Those tables keep separate
 * `[Once Per Turn]` budgets, which for this card is not reachable: attacking
 * and blocking both rest it, so the second window is closed by the board rather
 * than by the key.
 */
const shuraiyaCopy: MechanicEffect = {
  kind: "sequence",
  effects: [
    {
      kind: "select",
      selector: { player: "opponent", zone: [], includeLeader: true },
      bind: "op06-shuraiya-leader",
      count: 1,
      effect: {
        kind: "copy-power",
        from: "op06-shuraiya-leader",
        to: SOURCE_BINDING,
        base: true,
        expiresAfterTurns: 1,
      },
    },
  ],
};

export const op06BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // OP06-001 Uta (Leader): a {FILM} card from hand shrinks a body and ramps
      // a rested DON!! back out of the DON!! deck.
      //
      // The DON!! arrives rested, so it pays for nothing this turn and
      // everything next turn -- which is what makes this a Leader that attacks
      // and develops at once. `requires.handCardsMatching` gates the offer on a
      // {FILM} card actually being there: a hand-size floor would prompt a hand
      // that cannot pay.
      "OP06-001",
      {
        oncePerTurn: false,
        requires: { handCardsMatching: { match: filmCard, count: 1 } },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { ...filmCard, player: "self", zone: "hand" },
              "op06-uta-cost",
              1,
              {
                kind: "sequence",
                effects: [powerDebuff(2_000, "op06-uta"), addDonRested],
              },
            ),
          },
        },
      },
    ],
    [
      // OP06-006 Saga: `[DON!! x1]` buys +1000 through the opponent's turn, and
      // the turn ends with one of its controller's {FILM} bodies in the trash.
      //
      // The buff outlives the attack (`expiresAfterTurns: 1`), which is what
      // makes the price worth paying: the body defends at 6000 as well as
      // attacking at it. The body that pays is picked now and trashed when the
      // turn ends -- see `at-end-of-turn`'s note on that approximation.
      // Mandatory, so a board with no {FILM} Character pays nothing and the
      // `choose` skips.
      "OP06-006",
      {
        oncePerTurn: false,
        program: {
          effect: withDon(1, {
            kind: "sequence",
            effects: [
              {
                kind: "modify-power",
                binding: SOURCE_BINDING,
                amount: 1_000,
                expiresAfterTurns: 1,
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  type: "FILM",
                },
                bind: "op06-saga-price",
                min: 1,
                max: 1,
                effect: {
                  kind: "at-end-of-turn",
                  binding: "op06-saga-price",
                  action: "trash",
                },
              },
            ],
          }),
        },
      },
    ],
    ["OP06-009", { oncePerTurn: true, program: { effect: shuraiyaCopy } }],
    [
      // OP06-028 Zeo: `[DON!! x1]` sets a DON!! active again, which is a
      // Counter's worth of DON!! back in the cost area, and pays a Life card.
      "OP06-028",
      {
        oncePerTurn: false,
        program: {
          effect: withDon(1, {
            kind: "if",
            condition: newFishManLeader,
            then: {
              kind: "sequence",
              effects: [
                { kind: "activate-don", player: "self", count: 1 },
                {
                  kind: "modify-power",
                  binding: SOURCE_BINDING,
                  amount: 1_000,
                  expiresAfterTurns: 0,
                },
                lifeTopToHand,
              ],
            },
          }),
        },
      },
    ],
    [
      // OP06-029 Daruma: restands itself, so a 4000 body attacks twice in a
      // turn and still blocks. `[Once Per Turn]` is what keeps that at two
      // attacks rather than at every attack.
      "OP06-029",
      {
        oncePerTurn: true,
        program: {
          effect: withDon(1, {
            kind: "if",
            condition: newFishManLeader,
            then: {
              kind: "sequence",
              effects: [
                { kind: "update", binding: SOURCE_BINDING, rested: false },
                {
                  kind: "modify-power",
                  binding: SOURCE_BINDING,
                  amount: 1_000,
                  expiresAfterTurns: 0,
                },
                lifeTopToHand,
              ],
            },
          }),
        },
      },
    ],
    [
      // OP06-030 Dosun: attacks into anything and survives, through the
      // opponent's turn.
      //
      // `battle-ko-immune` rather than `ko-immune`: the printed sentence names
      // a battle, and an effect's K.O. still kills this body. Both halves last
      // until its controller's next turn, which is the defensive half of the
      // clause -- a 6000 wall that cannot be fought off the board.
      "OP06-030",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: newFishManLeader,
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "restrict",
                  binding: SOURCE_BINDING,
                  restriction: "battle-ko-immune",
                  expiresAfterTurns: 1,
                },
                {
                  kind: "modify-power",
                  binding: SOURCE_BINDING,
                  amount: 2_000,
                  expiresAfterTurns: 1,
                },
                lifeTopToHand,
              ],
            },
          },
        },
      },
    ],
    [
      // OP06-055 Monkey.D.Garp: `[DON!! x2]` and an empty-ish hand shut the
      // opponent's [Blocker] off for the battle.
      //
      // Battle-scoped, which is what `disable-blockers` is for: the shortest
      // card-scoped hold in the engine lasts the rest of the turn and would go
      // on barring blocks against Garp's later attacks. The hand ceiling is the
      // Navy deck's own condition -- it empties its hand on purpose.
      "OP06-055",
      {
        oncePerTurn: false,
        program: {
          effect: withDon(2, {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "hand",
              operator: "lte",
              value: 4,
            },
            then: { kind: "disable-blockers" },
          }),
        },
      },
    ],
    [
      // OP06-080 Gecko Moria (Leader): `[DON!! x1]`, two rested DON!! and a
      // card from hand mill two and play a Thriller Bark body out of the trash.
      //
      // The mill happens before the search reads the trash, which is the
      // printed order and the whole engine: the two cards that go down are
      // candidates for the body that comes back up.
      "OP06-080",
      {
        oncePerTurn: false,
        requires: { activeDon: 2, handCards: 1 },
        program: {
          effect: withDon(1, {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 2 },
                payFromHand(
                  { player: "self", zone: "hand" },
                  "op06-moria-leader-cost",
                  1,
                  {
                    kind: "sequence",
                    effects: [
                      { kind: "trash-top", player: "self", count: 2 },
                      {
                        kind: "choose",
                        selector: {
                          player: "self",
                          zone: "trash",
                          category: "character",
                          type: "Thriller Bark Pirates",
                          maxCost: 4,
                        },
                        bind: "op06-moria-leader",
                        min: 0,
                        max: 1,
                        effect: {
                          kind: "play",
                          binding: "op06-moria-leader",
                        },
                      },
                    ],
                  },
                ),
              ],
            },
          }),
        },
      },
    ],
    [
      // OP06-100 Inuarashi: `[DON!! x2]` and a card from hand K.O. a body whose
      // cost is capped by the *opponent's* Life total.
      //
      // A live ceiling rather than a printed constant, which is what
      // `maxCostFromZoneCount` is for: the further ahead this deck gets, the
      // less its own removal reaches, and at 3 Life it still answers a 3-cost.
      "OP06-100",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: withDon(2, {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op06-inuarashi-cost",
              1,
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCostFromZoneCount: { player: "opponent", zone: "life" },
                },
                bind: "op06-inuarashi",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "op06-inuarashi" },
              },
            ),
          }),
        },
      },
    ],
    [
      // OP06-103 Kawamatsu: two cards from hand bank a 0-power body as a Life
      // card, face-up.
      //
      // A `choice` of two `move`s rather than `order-to-bottom`'s `alternate`,
      // because the card has to arrive face-up and that node's move carries no
      // `faceUp` -- a face-down Life card would hide a Trigger both players are
      // entitled to see. "With 0 power" is read after DON!! and is exact: a
      // body this deck has spent DON!! on is no longer eligible, and neither
      // is one an effect has pushed below 0 (Q&A OP06-103#1), so the current
      // power is bounded on both sides.
      "OP06-103",
      {
        oncePerTurn: false,
        requires: { handCards: 2 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op06-kawamatsu-cost",
              2,
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  minCurrentPower: 0,
                  maxCurrentPower: 0,
                },
                bind: "op06-kawamatsu",
                min: 0,
                max: 1,
                effect: {
                  kind: "choice",
                  branches: [
                    {
                      id: "life-top",
                      label: "Add it to the top of your Life cards",
                      effect: {
                        kind: "move",
                        binding: "op06-kawamatsu",
                        to: { player: "owner", zone: "life", position: "top" },
                        faceUp: true,
                      },
                    },
                    {
                      id: "life-bottom",
                      label: "Add it to the bottom of your Life cards",
                      effect: {
                        kind: "move",
                        binding: "op06-kawamatsu",
                        to: {
                          player: "owner",
                          zone: "life",
                          position: "bottom",
                        },
                        faceUp: true,
                      },
                    },
                  ],
                },
              },
            ),
          },
        },
      },
    ],
    [
      // OP06-112 Raizo: a card from hand rests one of the opponent's DON!!,
      // which on their turn is a Counter they cannot pay for.
      "OP06-112",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op06-raizo-cost",
              1,
              { kind: "rest-don", player: "opponent", count: 1 },
            ),
          },
        },
      },
    ],
  ],
  onBlock: [
    // The other half of OP06-009's one printed clause; see `shuraiyaCopy`.
    ["OP06-009", { oncePerTurn: true, program: { effect: shuraiyaCopy } }],
  ],
  onOpponentAttack: [
    [
      // OP06-014 Ratchet: trades any number of {FILM} cards from hand for
      // +1000 each, during the battle.
      //
      // `battle-power` with `perCard`, so the size of the binding the `choose`
      // filled is the multiplier -- the printed clause pays per card, and a
      // `choose` binds every card at once. Battle-scoped, which is what "during
      // this battle" says: a turn-scoped modifier would leave the defender at
      // the raised number for every later attack that turn.
      //
      // The maximum is a hand the pool cannot exceed rather than a printed
      // number; "any number" has no ceiling but a hand does.
      "OP06-014",
      {
        oncePerTurn: false,
        requires: { handCardsMatching: { match: filmCard, count: 1 } },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { ...filmCard, player: "self", zone: "hand" },
              bind: "op06-ratchet",
              min: 1,
              max: 10,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op06-ratchet",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "battle-power",
                    player: "self",
                    amount: 1_000,
                    perCard: "op06-ratchet",
                  },
                ],
              },
            },
          },
        },
      },
    ],
  ],
};
