/**
 * The four off-set identities the OP-17 Purple Kaido list plays -- EB-04's
 * Kaido, King and Queen, and OP07-077's tribal search.
 *
 * One module rather than four entries spread across the OP17 files, for the
 * reason `cards/src/op17-kaido.ts` gives on the data side: these are not OP17
 * cards, and the deck they are in is the only reason they are in the pool. The
 * three EB-04 bodies are also best read together -- two of them print the same
 * replacement clause, and all three are the ramp engine, so a change to one is
 * usually a change to how the deck curves.
 */
import { donMinus, lookAndAdd } from "./shared.js";
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";

/**
 * "[printed text omitted -- pnpm card:text <card>]"
 *
 * OP07-077's `[Main]`, written once because its `[Trigger]` prints "[printed text omitted -- pnpm card:text OP07-077]" and is registered with the same program -- the
 * convention `op15-shared.ts` established, for the same reason: a copy edited
 * on one side is a card that does two different things depending on how it was
 * reached.
 *
 * The Leader gate fails silently rather than refusing the play: the Event still
 * costs its DON!! and still goes to the trash, which is what the printed text
 * says and what makes the card unplayable outside these two Leaders.
 */
const claimTheOnePiece = {
  effect: {
    kind: "if" as const,
    condition: {
      kind: "any-of" as const,
      conditions: [
        {
          kind: "leader-has-type" as const,
          player: "self" as const,
          type: "Animal Kingdom Pirates",
        },
        {
          kind: "leader-has-type" as const,
          player: "self" as const,
          type: "Big Mom Pirates",
        },
      ],
    },
    then: lookAndAdd(5, "op07-claim-look", {
      anyOf: [{ type: "Animal Kingdom Pirates" }, { type: "Big Mom Pirates" }],
    }).effect,
  },
};

export const op17KaidoMechanics: SetMechanics = {
  replacement: [
    [
      // EB04-030 Kaido: "[printed text omitted -- pnpm card:text EB04-030]"
      //
      // No "by your opponent's effect", so battle destruction counts too -- a
      // 9000-power body that survives a lost fight for one DON!!. And no
      // `[Once Per Turn]`, so the only real limit is the DON!! on the field,
      // which is the whole trade the card offers a ramp deck: pay the resource
      // you have too much of with the resource you have too much of.
      //
      // The DON!! returned is what OP17-062 Kaido watches, so the two together
      // can make this free: `returnDonToDeck` fires that reaction on the
      // controller's own turn, and it hands back one active DON!! plus a
      // stand-up.
      "EB04-030",
      {
        opponentEffectOnly: false,
        oncePerTurn: false,
        label: "Return 1 DON!! card to your DON!! deck",
        cost: { kind: "return-don", count: 1 },
      },
    ],
    [
      // EB04-031 King: the same clause, word for word, on the card the deck
      // cannot afford to lose. This is why every guide calls King the MVP and
      // says the deck is dependent on playing it on curve -- a 6-cost body
      // that answers removal with a resource the deck generates two of a turn
      // is not a card an opponent can profitably attack.
      "EB04-031",
      {
        opponentEffectOnly: false,
        oncePerTurn: false,
        label: "Return 1 DON!! card to your DON!! deck",
        cost: { kind: "return-don", count: 1 },
      },
    ],
  ],
  onPlay: [
    [
      // EB04-030 Kaido: "[printed text omitted -- pnpm card:text EB04-030]"
      //
      // Both halves sit inside the Leader gate: "Then," continues the same
      // conditional sentence rather than starting a new one, so a deck playing
      // this outside {Animal Kingdom Pirates} pays the DON!! and gets nothing.
      //
      // [Rush] on the source rather than a chosen target -- "this Character" --
      // and it lapses at end of turn, which `expiresAfterTurns: 0` is.
      "EB04-030",
      {
        effect: donMinus(2, {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Animal Kingdom Pirates",
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "grant-keyword",
                binding: SOURCE_BINDING,
                keyword: "Rush",
                expiresAfterTurns: 0,
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 7,
                },
                bind: "eb04-kaido-rest",
                min: 0,
                max: 1,
                effect: { kind: "rest", binding: "eb04-kaido-rest" },
              },
            ],
          },
        }),
      },
    ],
    [
      // EB04-032 Queen: "[printed text omitted -- pnpm card:text EB04-032]"
      //
      // Gated on actually holding one, not merely on holding a card: without
      // the `if`, a hand of nothing but off-tribe cards would be offered a
      // cost it cannot pay, and `optional` would have nothing behind its
      // prompt. This is the deck's answer to a hand of uncastable 10-drops --
      // the 10-drops are all {Animal Kingdom Pirates}, so the brick is the
      // payment.
      "EB04-032",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "hand", type: "Animal Kingdom Pirates" },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "hand",
                    type: "Animal Kingdom Pirates",
                  },
                  bind: "eb04-queen-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "eb04-queen-cost",
                    to: { player: "self", zone: "trash" },
                  },
                },
                { kind: "draw", player: "self", count: 2 },
              ],
            },
          },
        },
      },
    ],
  ],
  activateMain: [
    [
      // EB04-031 King: "[printed text omitted -- pnpm card:text EB04-031]"
      //
      // "no other [King] Characters" is a name gate on the controller's own
      // board, and the source is itself one, so the count it allows is 1 rather
      // than 0. A second King makes *neither* usable, which is why the list
      // runs four copies to see one rather than to stack them.
      //
      // No `requires`: the clause has no cost, and both halves are "up to", so
      // an empty DON!! deck makes this resolve to nothing rather than to an
      // illegal action. `[Once Per Turn]` is what stops that from being an
      // activation a rules agent can take forever.
      "EB04-031",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                {
                  kind: "leader-has-type",
                  player: "self",
                  type: "Animal Kingdom Pirates",
                },
                {
                  kind: "selector-count",
                  player: "self",
                  selector: {
                    zone: "board",
                    category: "character",
                    name: "King",
                  },
                  operator: "lte",
                  value: 1,
                },
              ],
            },
            then: {
              kind: "sequence",
              effects: [
                { kind: "add-don", player: "self", count: 1, rested: false },
                { kind: "add-don", player: "self", count: 1, rested: true },
              ],
            },
          },
        },
      },
    ],
    [
      // EB04-032 Queen: "[printed text omitted -- pnpm card:text EB04-032]"
      //
      // Two active DON!! become one rested DON!! -- a loss on this turn and a
      // gain on the next, since the rested card still counts toward the total
      // the next Refresh Phase stands up. That is the whole of the deck's
      // turn-2 play, and the reason its curve reaches 6 DON!! on turn 4.
      "EB04-032",
      {
        oncePerTurn: true,
        requires: { activeDon: 2 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 2 },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-type",
                    player: "self",
                    type: "Animal Kingdom Pirates",
                  },
                  then: {
                    kind: "add-don",
                    player: "self",
                    count: 1,
                    rested: true,
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  eventMain: [
    // OP07-077 "We're Going to Claim the One Piece!!!": the 1-cost dig the
    // curve depends on, since it is what finds King on turn 5.
    ["OP07-077", { cost: 1, program: claimTheOnePiece }],
  ],
  trigger: [
    // "[printed text omitted -- pnpm card:text OP07-077]" Literally the same
    // program, registered twice.
    ["OP07-077", claimTheOnePiece],
  ],
};
