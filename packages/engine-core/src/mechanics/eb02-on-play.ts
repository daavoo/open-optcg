/**
 * EB-02 `[On Play]` programs.
 *
 * The set is 61 cards and splits the same way the main sets do, by the timing
 * window a clause fires in: this file, `eb02-main.ts`, `eb02-battle.ts`,
 * `eb02-triggers.ts` and `eb02-shared.ts`. See `mechanics/README.md`.
 *
 * One identity was in the pool before the set was -- EB02-017 Nami, played by
 * the OP17 Luffy & Ace list -- and its program stays in
 * `op17-luffy-ace.ts`. Nothing here re-registers it.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { type MechanicEffect, type MechanicProgram } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd, playVanillaBody } from "./shared.js";
import { donParity, strawHatLeader } from "./eb02-shared.js";

/**
 * "Give up to N rested DON!! cards to 1 of your Leader."
 *
 * Bandai's phrasing for the Leader and nothing else, printed on EB02-006,
 * EB02-011 and EB02-049. `attach-don` with `target: "leader"` rather than
 * `give-rested-don`, which offers a choice between the Leader and every
 * Character -- that is a different clause, and EB02-003 is the card in this set
 * that prints it.
 */
export const giveRestedDonToLeader = (count: number): MechanicEffect => ({
  kind: "attach-don",
  player: "self",
  from: "rested",
  count,
  target: "leader",
});

/**
 * "…look at 7 cards from the top of your deck; reveal up to 1 [X] and add it to
 * your hand. Then, place the rest at the bottom of your deck in any order and
 * play up to 1 [X] from your hand."
 *
 * EB02-013 Carrot digs for [Zou] and EB02-032 Iceburg for
 * [Galley-La Company]. Both name a *Stage*, and both are 0-power 1-drops: the
 * card is the Stage-fetcher its colour's package is built on, which is why the
 * search is seven deep and why the play at the end is what makes it a tempo
 * play rather than a draw.
 *
 * The play reads the hand rather than the looked-at cards, and that order is
 * printed: a copy already in hand is a legal target even when the dig finds
 * nothing, so the clause is live on a board that has drawn one naturally.
 */
const digForStage = (name: string, bind: string): MechanicEffect => ({
  kind: "if",
  condition: { kind: "field-don", player: "self", operator: "gte", value: 3 },
  then: {
    kind: "sequence",
    effects: [
      lookAndAdd(7, bind, { name }).effect,
      {
        kind: "choose",
        selector: { player: "self", zone: "hand", name },
        bind: `${bind}-play`,
        min: 0,
        max: 1,
        effect: { kind: "play", binding: `${bind}-play` },
      },
    ],
  },
});

/** "Play up to 1 <selector> Character card from your hand." */
const playFromHand = (
  match: { type: string; maxCost: number },
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "self",
    zone: "hand",
    category: "character",
    type: match.type,
    maxCost: match.maxCost,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "play", binding: bind },
});

/**
 * "Rest up to 1 of your opponent's Characters with a cost of 4 or less."
 *
 * EB02-019 Roronoa Zoro's `[On Play]`, and the same sentence three of the
 * set's `[Trigger]`s print -- see `eb02-triggers.ts`. `canRest` is what keeps
 * it off a Character an opponent's effect has already made unrestable: resting
 * one is not something this clause can do, and offering it spends the choice on
 * nothing.
 */
export const restOpponentCostFour = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost: 4,
    canRest: true,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "rest", binding: bind },
});

/**
 * "Add up to 1 [Laboon] from your trash to your hand." -- EB02-048 Brook's
 * `[On Play]`, whose `[On K.O.]` half then plays one out of hand.
 */
export const recoverLaboon: MechanicEffect = {
  kind: "choose",
  selector: { player: "self", zone: "trash", name: "Laboon" },
  bind: "eb02-048-recover",
  min: 0,
  max: 1,
  effect: {
    kind: "move",
    binding: "eb02-048-recover",
    to: { player: "self", zone: "hand" },
  },
};

/**
 * "Look at up to 1 card from the top of your or your opponent's Life cards and
 * place it at the top or bottom of the Life cards." -- EB02-053 Myskina Olga,
 * on both of its timings.
 *
 * Two decisions, in the order the sentence makes them: whose Life stack is
 * looked at, and then which end the card goes back on. The look is a `look-at`
 * rather than a `move` because the card does not leave: a Life card is
 * face-down to both players, so seeing one is a private reveal and the stack is
 * otherwise untouched.
 *
 * The placement is `order-to-bottom` with an `alternate`, the EB03-023 Kaya
 * shape: `to` is the bottom and `alternate` the top, and the node offers the
 * two ends. One card has no *order* to decide, which is why the node used to
 * skip its prompt here -- and the end is a decision all the same, so that bail
 * now guards on `alternate` the way the identity test beside it already did.
 *
 * `player: "owner"` on both destinations, so a card looked at off the
 * opponent's Life goes back onto *theirs*.
 */
const peekOneLife = (
  player: "self" | "opponent",
  bind: string,
): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "look-at", player, count: 1, bind, zone: "life" },
    {
      kind: "select",
      selector: { player, zone: "life", binding: bind },
      bind: `${bind}-place`,
      count: "all",
      effect: {
        kind: "order-to-bottom",
        binding: `${bind}-place`,
        to: { player: "owner", zone: "life", position: "bottom" },
        alternate: { player: "owner", zone: "life", position: "top" },
      },
    },
  ],
});

export const peekAtLife: MechanicProgram = {
  effect: {
    kind: "choice",
    branches: [
      {
        id: "own-life",
        label: "Look at the top of your own Life cards",
        effect: peekOneLife("self", "eb02-053-own"),
      },
      {
        id: "opponent-life",
        label: "Look at the top of your opponent's Life cards",
        effect: peekOneLife("opponent", "eb02-053-theirs"),
      },
    ],
  },
};

/**
 * "If your Leader has the {Straw Hat Crew} type and the number of DON!! cards
 * on your field is equal to or less than the number on your opponent's field,
 * add up to 1 DON!! card from your DON!! deck and rest it." -- EB02-037
 * Franky's `[On Play]`/`[When Attacking]`, which are one printed clause on two
 * timings.
 *
 * Exported so `eb02-battle.ts` registers the same fragment rather than a copy.
 * The DON!! arrives *rested*, so what the clause buys is next turn's ramp
 * rather than this turn's: a rested DON!! cannot be spent or given until the
 * Refresh Phase, which is what makes the parity gate affordable to print on a
 * 3-cost body.
 */
export const frankyRamp: MechanicProgram = {
  effect: {
    kind: "if",
    condition: { kind: "all-of", conditions: [strawHatLeader, donParity] },
    then: { kind: "add-don", player: "self", count: 1, rested: true },
  },
};

export const eb02OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // EB02-003 Tony Tony.Chopper.
      //
      // `give-rested-don` rather than `attach-don`: the printed recipient is
      // "your Leader **or** 1 of your Characters", which is the one shape that
      // needs the choice offered over both halves. Its `[DON!! x2]`
      // `[Opponent's Turn]` half is continuous and is a row in
      // `static-abilities.ts`.
      "EB02-003",
      {
        effect: {
          kind: "if",
          condition: strawHatLeader,
          then: { kind: "give-rested-don", player: "self", count: 1 },
        },
      },
    ],
    [
      // EB02-011 Arlong.
      //
      // "Cannot be rested" is removal that leaves the body on the field.
      // Comprehensive Rules 7-1-1-1 pays for an attack by resting the attacker
      // and 10-1-4-1 pays for a block the same way, so a Character under this
      // can neither swing nor block -- which is why a Green 3-drop is allowed
      // to print it on a cost-5 ceiling and only "until the end of your
      // opponent's next turn".
      //
      // Both halves sit inside the Leader gate, and the DON!! gift is first:
      // the clause reads as one sentence and the ramp is what pays for the
      // lock.
      "EB02-011",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "any-of",
            conditions: [
              { kind: "leader-has-type", player: "self", type: "Fish-Man" },
              { kind: "leader-has-type", player: "self", type: "East Blue" },
            ],
          },
          then: {
            kind: "sequence",
            effects: [
              giveRestedDonToLeader(1),
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 5,
                },
                bind: "eb02-011-lock",
                min: 0,
                max: 1,
                effect: {
                  kind: "restrict",
                  binding: "eb02-011-lock",
                  restriction: "cannot-rest",
                  expiresAfterTurns: 1,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB02-013 Carrot: the {Minks} package's [Zou] fetcher.
      "EB02-013",
      { effect: digForStage("Zou", "eb02-013-dig") },
    ],
    [
      // EB02-014 Sarfunkel.
      //
      // The other half of the joke: EB02-012 Gaimon is a 1-cost 1000 body that
      // gains [Blocker] while a [Sarfunkel] is out (a row in
      // `static-abilities.ts`), and this plays it for free.
      "EB02-014",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "hand", name: "Gaimon" },
          bind: "eb02-014-gaimon",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "eb02-014-gaimon" },
        },
      },
    ],
    [
      // EB02-015 Jewelry Bonney.
      //
      // `rested: true` on the target is printed and is the whole clause: this
      // answers a board that has already attacked, and holding one of those
      // bodies down through the Refresh Phase is a turn of tempo rather than
      // removal. `expiresAfterTurns: 1` is the opponent's next Refresh Phase,
      // one turn from the turn this resolves on.
      //
      // The DON!! comes back at the *end* of the turn, after it has been spent
      // on the 7-cost body -- which is what makes a 7-drop castable and still
      // leave a DON!! up for the Counter step.
      "EB02-015",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                rested: true,
              },
              bind: "eb02-015-lock",
              min: 0,
              max: 1,
              effect: {
                kind: "restrict",
                binding: "eb02-015-lock",
                restriction: "cannot-refresh",
                expiresAfterTurns: 1,
              },
            },
            {
              kind: "activate-don-at-end-of-turn",
              player: "self",
              count: 1,
            },
          ],
        },
      },
    ],
    [
      // EB02-016 Chopperman.
      //
      // "Also treat this card's name as [Tony Tony.Chopper]" is derived from
      // the printed text into `rules.nameAliases`, so every name filter in the
      // pool already answers to it; nothing here has to say it again.
      "EB02-016",
      {
        effect: playFromHand({ type: "Animal", maxCost: 3 }, "eb02-016-animal"),
      },
    ],
    [
      // EB02-018 Buggy.
      //
      // `excludeSource` is the printed "no **other** [Buggy] Characters": the
      // copy running the clause is on the board by the time it resolves, so
      // without it the condition could never be true. A second copy is what
      // switches the clause off, which is the tension the card is printed for.
      //
      // [Double Attack] on the Leader is a grant the player holds rather than a
      // flag on a board card -- see `leaderDoubleAttackUntilTurn`. Its
      // `[Trigger]` half is in `eb02-triggers.ts`.
      "EB02-018",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: {
              zone: "board",
              category: "character",
              name: "Buggy",
              excludeSource: true,
            },
            operator: "eq",
            value: 0,
          },
          then: {
            kind: "choose",
            selector: { player: "self", zone: [], includeLeader: true },
            bind: "eb02-018-leader",
            min: 0,
            max: 1,
            effect: {
              kind: "grant-keyword",
              binding: "eb02-018-leader",
              keyword: "Double Attack",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // EB02-019 Roronoa Zoro.
      //
      // Its first sentence -- "can attack Characters on the turn in which it is
      // played", gated on the opponent having two or more Characters -- is
      // [Rush: Character] written out longhand and is a row in
      // `static-abilities.ts`. This is the `[On Play]` half.
      "EB02-019",
      {
        effect: {
          kind: "if",
          condition: strawHatLeader,
          then: restOpponentCostFour("eb02-019-rest"),
        },
      },
    ],
    [
      // EB02-022 Usopp.
      //
      // `playVanillaBody` is the template EB-03 prints three times, shared from
      // `shared.ts`. The gate reads *current* power: a 4000 body carrying a
      // DON!! is one of the two this clause counts, which is the reading that
      // makes the condition about the board the player actually has.
      "EB02-022",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: {
              zone: "board",
              category: "character",
              minCurrentPower: 5_000,
            },
            operator: "lte",
            value: 2,
          },
          then: playVanillaBody("hand", "eb02-022-body"),
        },
      },
    ],
    [
      // EB02-024 Sogeking.
      //
      // The draw comes first and the two cards down come second, which is the
      // order printed and the order that matters: a hand of one still pays the
      // cost, because the draw filled it. `order-to-bottom` asks which of the
      // two goes under first -- the deck that results differs, and this deck
      // digs.
      //
      // The bounce names no side ("up to 1 Character with a cost of 1 or
      // less"), so the selector is `"either"` and the destination is the card's
      // own owner: bouncing a teammate to re-use its `[On Play]` is a line this
      // clause is deliberately allowed.
      "EB02-024",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "eb02-024-down",
              min: 2,
              max: 2,
              effect: {
                kind: "order-to-bottom",
                binding: "eb02-024-down",
                to: { player: "self", zone: "deck", position: "bottom" },
              },
            },
            {
              kind: "choose",
              selector: {
                player: "either",
                zone: "board",
                category: "character",
                maxCost: 1,
              },
              bind: "eb02-024-bounce",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb02-024-bounce",
                to: { player: "owner", zone: "hand" },
              },
            },
          ],
        },
      },
    ],
    [
      // EB02-026 Nefeltari Vivi.
      //
      // The hand ceiling is read after Vivi has left the hand to be played, so
      // "5 or less" is five cards beside her. Both halves of the condition are
      // the price of a 3-cost 2000 body: the deck has to be multicoloured and
      // the grip has to be spent.
      "EB02-026",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              { kind: "leader-multicolored", player: "self" },
              {
                kind: "zone-count",
                player: "self",
                zone: "hand",
                operator: "lte",
                value: 5,
              },
            ],
          },
          then: { kind: "draw", player: "self", count: 2 },
        },
      },
    ],
    [
      // EB02-027 Vista.
      //
      // `maxCurrentPower`, not `maxPower`: "1000 power or less" is read off the
      // board, so a 1000 body that has taken a DON!! is out of reach and a 5000
      // body a debuff has dropped to 1000 is in it. A bury rather than a K.O.,
      // which is what makes it answer a body with an `[On K.O.]`.
      "EB02-027",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCurrentPower: 1_000,
          },
          bind: "eb02-027-bury",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "eb02-027-bury",
            to: { player: "owner", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
    [
      // EB02-028 Portgas.D.Ace.
      //
      // "A cost of 2" exactly, both times: `minCost` and `maxCost` at the same
      // number, because the clause is written around the 2-drops the Whitebeard
      // shell runs rather than around a ceiling. `leader-type-including` is the
      // printed 'type includes "Whitebeard Pirates"', which also reaches
      // {Whitebeard Pirates Allies}.
      //
      // The play reads the hand, so the card the search just added is a legal
      // target for it -- and so is one already held. Rested, so what arrives is
      // a blocker for the opponent's turn rather than a second attack.
      "EB02-028",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-type-including",
            player: "self",
            text: "Whitebeard Pirates",
          },
          then: {
            kind: "sequence",
            effects: [
              lookAndAdd(5, "eb02-028-look", {
                category: "character",
                minCost: 2,
                maxCost: 2,
              }).effect,
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "character",
                  minCost: 2,
                  maxCost: 2,
                },
                bind: "eb02-028-play",
                min: 0,
                max: 1,
                effect: {
                  kind: "play",
                  binding: "eb02-028-play",
                  rested: true,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB02-032 Iceburg: Carrot's clause in Purple, digging for
      // [Galley-La Company] instead of [Zou].
      "EB02-032",
      { effect: digForStage("Galley-La Company", "eb02-032-dig") },
    ],
    [
      // EB02-035 Sanji & Pudding.
      //
      // The `[On Play]` half alone. Its `[Your Turn]` `[Once Per Turn]` watcher
      // -- "when 2 or more DON!! cards on your field are returned to your DON!!
      // deck" -- has no printed timing marker and is a `ReactionRule` in
      // `card-mechanics.ts`, dispatched off the `don-returned` signal.
      "EB02-035",
      {
        effect: {
          kind: "if",
          condition: donParity,
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
    [
      // EB02-037 Franky: one printed clause on two timings -- see
      // `eb02-battle.ts`, which registers the same fragment for the
      // `[When Attacking]` half.
      "EB02-037",
      frankyRamp,
    ],
    [
      // EB02-038 Magellan.
      "EB02-038",
      {
        effect: playFromHand(
          { type: "Impel Down", maxCost: 2 },
          "eb02-038-impel",
        ),
      },
    ],
    [
      // EB02-041 Merry Go (Purple Stage): the `[On Play]` half. Its
      // `[Activate: Main]` is in `eb02-main.ts`.
      "EB02-041",
      {
        effect: {
          kind: "if",
          condition: strawHatLeader,
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
    [
      // EB02-044 Sengoku.
      //
      // Colour *and* type, because the printed clause names both: a black
      // {Navy} body. Rested, so a 7-cost Blocker that brings a second body
      // brings one that cannot attack this turn -- the whole cost of the card
      // is paid on the turn it lands.
      "EB02-044",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            color: "Black",
            type: "Navy",
            maxCost: 4,
          },
          bind: "eb02-044-recur",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "eb02-044-recur", rested: true },
        },
      },
    ],
    [
      // EB02-045 Trafalgar Law.
      //
      // The two cards out of the trash are a cost, so the `choice` they buy is
      // nested inside their `choose` rather than sequenced after it: a trash of
      // one cannot pay, and a `choose` it cannot fill is skipped, so nesting is
      // what stops the payoff being handed over free.
      //
      // `chooser: "opponent"` on the discard half is the rule for anything
      // trashed out of a hand -- the cards are theirs and the pick is theirs.
      // The hand floor is printed and is what keeps the branch off an opponent
      // already out of cards.
      "EB02-045",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "trash" },
            bind: "eb02-045-cost",
            min: 2,
            max: 2,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "order-to-bottom",
                  binding: "eb02-045-cost",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
                {
                  kind: "choice",
                  branches: [
                    {
                      id: "draw",
                      label: "Draw 1 card",
                      effect: { kind: "draw", player: "self", count: 1 },
                    },
                    {
                      id: "discard",
                      label: "Your opponent trashes 1 card from their hand",
                      effect: {
                        kind: "if",
                        condition: {
                          kind: "zone-count",
                          player: "opponent",
                          zone: "hand",
                          operator: "gte",
                          value: 5,
                        },
                        then: {
                          kind: "choose",
                          selector: { player: "opponent", zone: "hand" },
                          bind: "eb02-045-discard",
                          chooser: "opponent",
                          min: 1,
                          max: 1,
                          effect: {
                            kind: "move",
                            binding: "eb02-045-discard",
                            to: { player: "owner", zone: "trash" },
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB02-046 Hildon.
      //
      // Black's self-mill and a cost debuff in one sentence, and the mill is
      // first: the two cards are what the colour's payoffs count, and −1 cost
      // is what brings a body inside the reach of the "cost N or less" removal
      // the deck plays next.
      "EB02-046",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "trash-top", player: "self", count: 2 },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "eb02-046-shrink",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-cost",
                binding: "eb02-046-shrink",
                amount: -1,
                expiresAfterTurns: 0,
              },
            },
          ],
        },
      },
    ],
    [
      // EB02-048 Brook: the `[On Play]` half. Its `[On K.O.]` plays a [Laboon]
      // out of hand -- see `eb02-triggers.ts` -- so the two halves are a chain:
      // this one puts the target in the hand the other reads.
      "EB02-048",
      { effect: recoverLaboon },
    ],
    [
      // EB02-049 Monkey.D.Garp: the `[On Play]` half. Two rested DON!! onto the
      // Leader is the biggest gift in the set, and it is why a 5-cost 6000 body
      // prints no Counter. Its `[Activate: Main]` is in `eb02-main.ts`.
      "EB02-049",
      { effect: giveRestedDonToLeader(2) },
    ],
    [
      // EB02-053 Myskina Olga: one printed clause on two timings -- see
      // `eb02-triggers.ts` for the `[On K.O.]` half.
      "EB02-053",
      peekAtLife,
    ],
    [
      // EB02-054 Sanji.
      //
      // The Life gate is what the Yellow deck makes true on purpose, and the
      // discard afterwards is mandatory: a net card, not two. `[Blocker]` is
      // printed, so it comes off the card text through `hasStaticKeyword` and
      // needs nothing here.
      "EB02-054",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "life",
            operator: "lte",
            value: 2,
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "eb02-054-trash",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "eb02-054-trash",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB02-056 Vegapunk.
      //
      // Four steps in one sentence, and the order is printed: look five, play a
      // {Scientist} out of them, bury the rest, then pay a card if the
      // opponent's board is small. The play comes off the *looked-at* cards
      // rather than the hand, which is why this is a `look-at` and a `choose`
      // over its binding rather than a `lookAndAdd`.
      //
      // `excludeName` is the printed "other than [Vegapunk]", and it reads the
      // name rather than the number: a second copy in the top five is not a
      // target.
      //
      // The last clause's trash is mandatory, and its gate is the opponent's
      // board -- so on a wide board the 5-cost 0-power Blocker costs nothing
      // beyond itself.
      "EB02-056",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "look-at",
              player: "self",
              count: 5,
              bind: "eb02-056-look",
            },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "deck",
                binding: "eb02-056-look",
                category: "character",
                type: "Scientist",
                maxCost: 5,
                excludeName: "Vegapunk",
              },
              bind: "eb02-056-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "eb02-056-play" },
            },
            {
              kind: "select",
              selector: {
                player: "self",
                zone: "deck",
                binding: "eb02-056-look",
              },
              bind: "eb02-056-rest",
              count: "all",
              effect: {
                kind: "order-to-bottom",
                binding: "eb02-056-rest",
                to: { player: "self", zone: "deck", position: "bottom" },
              },
            },
            {
              kind: "if",
              condition: {
                kind: "selector-count",
                player: "opponent",
                selector: { zone: "board", category: "character" },
                operator: "lte",
                value: 2,
              },
              then: {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "eb02-056-pay",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "eb02-056-pay",
                  to: { player: "self", zone: "trash" },
                },
              },
            },
          ],
        },
      },
    ],
  ],
};
