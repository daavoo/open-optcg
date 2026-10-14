/**
 * PRB-02 `[On Play]` programs.
 *
 * The premium booster is 18 cards and splits the same way the main sets do, by
 * the timing window a clause fires in: this file, `prb02-battle.ts` and
 * `prb02-triggers.ts`. There is no `prb02-main.ts` -- the set prints no `[Main]`
 * Event and its one `[Activate: Main]` is PRB02-016 Otama, whose program was in
 * `op06-yamato.ts` before this import and stays there. See `mechanics/README.md`.
 *
 * Four identities were in the pool before the set was, played by decks the
 * community pass reads: PRB02-008 Marco (`op16-nami.ts`), PRB02-014 Sabo and
 * PRB02-015 Shiryu (`st27.ts`) and PRB02-016 Otama (`op06-yamato.ts`). Nothing
 * here re-registers them.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { type SetMechanics } from "./registry.js";
import { donMinus, lookAndAdd, payFromHand } from "./shared.js";

/**
 * "Look at 5 cards from the top of your deck; reveal up to 1 <type> type card
 * other than [<self>] and add it to your hand. Then, place the rest at the
 * bottom of your deck in any order."
 *
 * Printed twice in the set, on PRB02-007 Jinbe and PRB02-012 Nami, and the two
 * differ only in the type they dig for and the name they exclude. Both exclude
 * themselves by name rather than by `excludeSource`: the copy the clause must
 * skip is a *different* copy sitting in the deck, and the source is on the
 * field by the time an `[On Play]` resolves.
 */
const digExcludingSelf = (type: string, name: string, bind: string) =>
  lookAndAdd(5, bind, { type, excludeName: name });

export const prb02OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // PRB02-003 Lucky.Roux: "[On Play] You may trash 1 Character card with
      // 6000 power or more from your hand: Draw 2 cards."
      //
      // `minPower` is printed power, which is the only power a card in hand
      // has -- nothing has modified it there. The cost is a real cost, so the
      // whole clause is `optional`: a hand with no 6000 to spare declines.
      "PRB02-003",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            {
              player: "self",
              zone: "hand",
              category: "character",
              minPower: 6_000,
            },
            "prb02-roux-cost",
            1,
            { kind: "draw", player: "self", count: 2 },
          ),
        },
      },
    ],
    [
      // PRB02-005 Monkey.D.Luffy: "[Your Turn] [On Play] If your Leader is
      // multicolored and your opponent has 7 or less DON!! cards on their
      // field, your opponent rests 1 of their active DON!! cards at the start
      // of their next Main Phase."
      //
      // `rest-don-at-next-main` rather than `hold-don-from-refresh`, which is
      // the neighbouring node and the wrong one: that one holds back DON!!
      // that is *already rested* when it resolves, so against a seat that
      // ended its turn with everything active it books nothing at all. This
      // clause names the pool the opponent will have once their Refresh Phase
      // and their two new DON!! have run, and so always costs them one.
      //
      // `[Your Turn]` needs no gate of its own: a Character is played in its
      // controller's Main Phase, so an `[On Play]` never resolves on the
      // opponent's turn.
      "PRB02-005",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              { kind: "leader-multicolored", player: "self" },
              {
                kind: "field-don",
                player: "opponent",
                operator: "lte",
                value: 7,
              },
            ],
          },
          then: {
            kind: "rest-don-at-next-main",
            player: "opponent",
            count: 1,
          },
        },
      },
    ],
    [
      // PRB02-007 Jinbe: the Warlord package's five-deep search.
      "PRB02-007",
      digExcludingSelf("The Seven Warlords of the Sea", "Jinbe", "prb02-jinbe"),
    ],
    [
      // PRB02-010 Charlotte Pudding: "[On Play] DON!! −2: If your Leader has
      // the {Big Mom Pirates} type and your opponent has 6 or more DON!! cards
      // on their field, draw 2 cards. Then, play up to 1 {Big Mom Pirates} type
      // Character card with 6000 to 8000 power from your hand."
      //
      // The DON!! −2 is paid before the condition is read, which is what the
      // printed order says: the cost buys the attempt, not the outcome. Both
      // halves sit inside the gate -- one sentence, one conditional.
      //
      // The power band is printed power and is closed at both ends, so
      // `minPower` and `maxPower` together rather than a ceiling alone.
      "PRB02-010",
      {
        effect: donMinus(2, {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "leader-has-type",
                player: "self",
                type: "Big Mom Pirates",
              },
              {
                kind: "field-don",
                player: "opponent",
                operator: "gte",
                value: 6,
              },
            ],
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "character",
                  type: "Big Mom Pirates",
                  minPower: 6_000,
                  maxPower: 8_000,
                },
                bind: "prb02-pudding-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "prb02-pudding-play" },
              },
            ],
          },
        }),
      },
    ],
    [
      // PRB02-011 Donquixote Doflamingo: "[On Play] If your Leader is
      // multicolored, add up to 1 DON!! card from your DON!! deck and rest it."
      //
      // `rested: true` is the whole price of the ramp: the DON!! arrives on the
      // turn it is added but cannot be spent until the next Refresh.
      "PRB02-011",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-multicolored", player: "self" },
          then: { kind: "add-don", player: "self", count: 1, rested: true },
        },
      },
    ],
    [
      // PRB02-012 Nami: the Straw Hat package's five-deep search, the same
      // template PRB02-007 prints for the Warlords.
      "PRB02-012",
      digExcludingSelf("Straw Hat Crew", "Nami", "prb02-nami"),
    ],
    [
      // PRB02-013 Gecko Moria: "[On Play] If your Leader has the {Thriller Bark
      // Pirates} type, play up to 1 Character card with a cost of 4 or less
      // from your trash rested. Then, give up to 1 rested DON!! card to your
      // Leader or 1 of your Characters."
      //
      // Not `playThrillerBarkFromTrashRested`, which this card's Leader gate
      // makes tempting: that helper also filters the trash to {Thriller Bark
      // Pirates} bodies, and this text narrows the trash by *cost* alone. The
      // deck is built out of the type, but the clause reaches anything it has
      // put there.
      //
      // Both halves sit inside the gate: "Then" continues the same conditional
      // sentence, so a Leader without the type gets neither the body nor the
      // DON!!.
      "PRB02-013",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Thriller Bark Pirates",
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "trash",
                  category: "character",
                  maxCost: 4,
                  excludeSource: true,
                },
                bind: "prb02-moria-play",
                min: 0,
                max: 1,
                effect: {
                  kind: "play",
                  binding: "prb02-moria-play",
                  rested: true,
                },
              },
              { kind: "give-rested-don", player: "self", count: 1 },
            ],
          },
        },
      },
    ],
    [
      // PRB02-017 Boa Hancock: "[On Play] You may trash 1 card with a [Trigger]
      // from your hand: Your opponent's rested Leader or up to 1 of your
      // opponent's Characters other than [Monkey.D.Luffy] cannot attack until
      // the end of your opponent's next End Phase."
      //
      // A `choice` rather than one selector with `includeLeader`, because the
      // two halves carry different filters: the Leader must be *rested* and the
      // Characters need not be. A single selector could only say `rested` of
      // both, which would leave an active opposing board untouchable by a
      // clause that reaches it.
      //
      // `expiresAfterTurns: 1` is "until the end of your opponent's next End
      // Phase" counted in player-turns from this one, the same reading
      // OP06-023 Arlong's lock takes.
      "PRB02-017",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand", hasTrigger: true },
            "prb02-hancock-cost",
            1,
            {
              kind: "choice",
              branches: [
                {
                  id: "leader",
                  label: "Lock your opponent's rested Leader",
                  effect: {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: [],
                      includeLeader: true,
                      rested: true,
                    },
                    bind: "prb02-hancock-leader",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "restrict",
                      binding: "prb02-hancock-leader",
                      restriction: "cannot-attack",
                      expiresAfterTurns: 1,
                    },
                  },
                },
                {
                  id: "character",
                  label: "Lock 1 of your opponent's Characters",
                  effect: {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                      excludeName: "Monkey.D.Luffy",
                    },
                    bind: "prb02-hancock-character",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "restrict",
                      binding: "prb02-hancock-character",
                      restriction: "cannot-attack",
                      expiresAfterTurns: 1,
                    },
                  },
                },
              ],
            },
          ),
        },
      },
    ],
    [
      // PRB02-018 Portgas.D.Ace: "[On Play] If you have a face-up Life card,
      // play up to 1 [Sabo], [Portgas.D.Ace], or [Monkey.D.Luffy] with a cost
      // of 2 from your hand or trash."
      //
      // "with a cost of 2" is exact rather than a ceiling, so the band is
      // closed at both ends. The three names are an `anyOf` disjunction: the
      // card reaches whichever of them a Life card has already turned face up
      // for, and `name` alone is conjunctive and could only ask for one.
      "PRB02-018",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "life", faceUp: true },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: ["hand", "trash"],
              minCost: 2,
              maxCost: 2,
              anyOf: [
                { name: "Sabo" },
                { name: "Portgas.D.Ace" },
                { name: "Monkey.D.Luffy" },
              ],
            },
            bind: "prb02-ace-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "prb02-ace-play" },
          },
        },
      },
    ],
  ],
};
