/**
 * The "removed from the field" replacements, across OP10-OP13.
 *
 * Eleven cards in these four sets print the wider reading -- "[printed text omitted -- pnpm card:text <card>]" rather than "would be K.O.'d" -- and until
 * the `move` node learned to offer a replacement, every one of them answered a
 * K.O. and nothing else: a bounce to hand, a bury to the deck and a push into
 * Life all went through unopposed. They are collected here rather than split
 * across four set modules because what they have in common is the rule, not the
 * set: `removal: "off-field"` is the whole family, and reading them together is
 * what makes the six different "instead" clauses comparable.
 *
 * OP13-060 Amatsuki Toki and OP13-047 Fossa are OP13's K.O.-only readings,
 * and sit here rather than in a module of their own so the set's replacements
 * stay together.
 */
import { type SetMechanics } from "./registry.js";

export const offFieldReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // OP10-037 Lim: "[printed text omitted -- pnpm card:text OP10-037]"
      //
      // The Green ODYSSEY package wants rested Characters -- its own gates count
      // them -- so this is the rare protection whose cost the deck was going to
      // pay anyway. Its `[End of Your Turn]` half is in `op10-triggers.ts`.
      "OP10-037",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        label: "Rest 1 of your {ODYSSEY} type Characters",
        cost: {
          kind: "rest-own-cards",
          count: 1,
          match: { category: "character", type: "ODYSSEY" },
        },
      },
    ],
    [
      // OP10-032 Tashigi: "[printed text omitted -- pnpm card:text OP10-032]"
      //
      // Guards the other green bodies against the opponent's removal of any
      // kind, paid by resting the protector itself. No `[Once Per Turn]`: the price is Tashigi's own active state, so it
      // pays once and then cannot pay again until something sets it active --
      // which the Green Jinbe Leader's `[End of Your Turn]` does not, since
      // Tashigi is neither {Fish-Man} nor {Merfolk}. The name exclusion keeps a
      // second Tashigi from saving the first.
      "OP10-032",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: {
          category: "character",
          color: "Green",
          excludeName: "Tashigi",
        },
        label: "Rest Tashigi",
        cost: { kind: "rest-self" },
      },
    ],
    [
      // OP11-001 Koby (Leader): "[printed text omitted -- pnpm card:text OP11-001]"
      //
      // A Leader protecting its whole team rather than itself, which is what
      // `protects` is for -- and the cost is the trash, which the Navy/SWORD deck
      // fills with its own mill. Its "{SWORD} Characters can attack Characters the
      // turn they are played" half is a static aura.
      "OP11-001",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        protects: { category: "character", type: "Navy", maxPower: 7_000 },
        label: "Place 3 cards from your trash at the bottom of your deck",
        cost: { kind: "bury-from-trash", count: 3 },
      },
    ],
    [
      // OP11-101 Capone"Gang"Bege: "[printed text omitted -- pnpm card:text OP11-101]"Gang"[printed text omitted -- pnpm card:text OP11-101]"
      //
      // The only entry in this registry whose "instead" moves the *threatened*
      // card rather than paying something: the Character becomes a Life card, which
      // in Yellow is a gain rather than a loss. "Other than" is a name exclusion
      // that `protects` cannot carry, so it rides on `excludesSelf` -- which asks
      // the instance question -- plus the name filter for a second copy.
      "OP11-101",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        protects: {
          category: "character",
          type: "Supernovas",
          excludeName: 'Capone"Gang"Bege',
        },
        excludesSelf: true,
        redirect: "own-life-face-down",
        label: "Add it to the top of your Life cards face-down",
        cost: { kind: "none" },
      },
    ],
    [
      // OP12-048 Donquixote Rosinante: "[printed text omitted -- pnpm card:text OP12-048]"
      //
      // Two payments at once, which no single `cost` kind carries -- so the rest of
      // the source rides on `ko-self`'s sibling shape: `trash-from-hand` pays the
      // card and `restsSelf` rests the protector. `[Opponent's Turn]` is what
      // stops it answering its own controller's removal.
      "OP12-048",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        opponentTurnOnly: true,
        removal: "off-field",
        protects: { category: "character", color: "Blue", type: "Navy" },
        label: "Rest Donquixote Rosinante and trash 1 card from your hand",
        cost: { kind: "trash-from-hand", count: 1, restsSelf: true },
      },
    ],
    [
      // OP12-053 Borsalino: "[printed text omitted -- pnpm card:text OP12-053]" Its `[Opponent's Turn]` [Blocker] and +1000 are static.
      "OP12-053",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        label: "Trash 1 card from your hand",
        cost: { kind: "trash-from-hand", count: 1 },
      },
    ],
    [
      // OP12-102 Shirahoshi: "[printed text omitted -- pnpm card:text OP12-102]"
      //
      // Neither `[Once Per Turn]` nor "by your opponent's effect" alone: it is
      // repeatable for as long as there is a face-down Life card to turn over, and
      // the information it gives away is the whole price. Its own {Neptunian} aura
      // is a static ability.
      "OP12-102",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: { category: "character", maxBaseCost: 6 },
        label: "Turn 1 card from the top of your Life cards face-up",
        cost: { kind: "turn-life-face-up" },
      },
    ],
    [
      // OP13-060 Amatsuki Toki: when the opponent's effect would K.O. one of
      // your Characters whose type includes "Roger Pirates", you may trash
      // Toki instead.
      //
      // The shape OP15-094 Zoro prints: `trash-self` rather than `ko-self`,
      // since Toki is trashed rather than K.O.'d, and a K.O. is all it answers
      // -- a bounce or a bury goes through. "A type including", so {Former
      // Roger Pirates} bodies are covered too. Toki is {Roger Pirates} herself,
      // and `excludesSelf` keeps her from answering her own K.O.: she would
      // reach the trash either way, so the offer saves nothing -- the same
      // reason Zoro carries it.
      "OP13-060",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        protects: { category: "character", typeIncluding: "Roger Pirates" },
        excludesSelf: true,
        label: "Trash Amatsuki Toki",
        cost: { kind: "trash-self" },
      },
    ],
    [
      // OP13-047 Fossa: "[printed text omitted -- pnpm card:text OP13-047]"
      //
      // Toki's shape over the Blue Whitebeard deck: a K.O. only, paid by
      // trashing the protector, and "a type including" so {Whitebeard Pirates
      // Allies} bodies are covered. Fossa is {Whitebeard Pirates} himself, and
      // `excludesSelf` keeps him from answering his own K.O., which would save
      // nothing.
      "OP13-047",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        protects: {
          category: "character",
          typeIncluding: "Whitebeard Pirates",
        },
        excludesSelf: true,
        label: "Trash Fossa",
        cost: { kind: "trash-self" },
      },
    ],
    [
      // OP13-046 Vista: "[printed text omitted -- pnpm card:text OP13-046]"Whitebeard Pirates" from your hand
      // instead."
      //
      // The only card that spells out both halves, which is why
      // `removal: "off-field"` is the right reading of it: a K.O. is a removal, and
      // the entry answers both. The cost names a type, so a hand of off-type cards
      // cannot pay.
      "OP13-046",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        label: 'Trash 1 "Whitebeard Pirates" card from your hand',
        cost: {
          kind: "trash-from-hand",
          count: 1,
          match: { typeIncluding: "Whitebeard Pirates" },
        },
      },
    ],
    [
      // OP13-109 Jewelry Bonney: "[printed text omitted -- pnpm card:text OP13-109]"
      //
      // The same repeatable, information-priced protection OP12-102 prints, on its
      // own printing rather than over a group. Its `[Trigger]` is in
      // `op13-triggers.ts`.
      "OP13-109",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        label: "Turn 1 card from the top of your Life cards face-up",
        cost: { kind: "turn-life-face-up" },
      },
    ],
  ],
};
