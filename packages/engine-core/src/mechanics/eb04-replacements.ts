/**
 * The two removal replacements EB-04 prints.
 *
 * Grouped by the rule rather than by the timing window, the same way
 * `op13-replacements.ts` groups its ten: read side by side, the two prices are
 * comparable, which is the whole reason a card printing one of these is worth
 * a slot. Both are `[Once Per Turn]`, and both are the Black half of the
 * booster -- a colour whose bodies are cheap and whose trash is a resource.
 *
 * Printed text for either card is `pnpm card:text <CARD>`.
 */
import { type SetMechanics } from "./registry.js";

export const eb04ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // EB04-043 Kaku. Printed text: `pnpm card:text EB04-043`.
      //
      // `protects` rather than `excludesSelf`/self-only, because this clause
      // guards *other* cards: "your black Character with a base cost of 5 or
      // less" is a filter over the board, and Kaku itself (black, cost 3)
      // matches it -- so the replacement covers the body printing it as well as
      // its teammates, which is what the printed filter says and what
      // `excludesSelf` would wrongly deny.
      //
      // `maxBaseCost` and not `maxCost`: "base cost" is the printed number, so
      // a 6-drop the opponent discounted into range is still not covered.
      //
      // `bury-from-trash` at 3 is the same price OP13's and OP14's replacements
      // pay, and this card's own `[On Play]` mill (in `eb04-on-play.ts`) is what
      // stocks it -- two clauses on one card feeding each other.
      "EB04-043",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        removal: "ko",
        protects: {
          category: "character",
          color: "Black",
          maxBaseCost: 5,
        },
        label: "Place 3 cards from your trash at the bottom of your deck",
        cost: { kind: "bury-from-trash", count: 3 },
      },
    ],
    [
      // EB04-044 Koby. Printed text: `pnpm card:text EB04-044`.
      //
      // `removal: "off-field"` rather than `"ko"`: the printed clause says
      // "removed from the field", which is the wider window -- a bounce to hand
      // and a place-at-the-bottom are both covered, and a K.O. is one case of
      // it.
      //
      // `requires` is the printed "If your Leader's type includes 'Navy'",
      // which `protects` cannot express -- it filters the *threatened* card on
      // printed facts and says nothing about the Leader. The field was added
      // for this card; before it, the gate would have been dropped and a
      // 6-cost 7000 protected behind every Leader in the format.
      //
      // `leader-type-including` rather than `leader-has-type`: the printed
      // clause quotes a substring, so a Leader typed {Navy HQ} or
      // {Former Navy} satisfies it the way the words say.
      //
      // `opponentEffectOnly: false`: the clause names no source, so a lost
      // battle and its controller's own removal are answered too -- OP11-092
      // Helmeppo's end-of-turn bottom-deck of a Koby it played from the trash
      // among them. The same reading as OP17-043 Ganzui's.
      //
      // Its `[Your Turn]` draw is a `ReactionRule` in `card-mechanics.ts`.
      "EB04-044",
      {
        opponentEffectOnly: false,
        oncePerTurn: true,
        removal: "off-field",
        requires: {
          kind: "leader-type-including",
          player: "self",
          text: "Navy",
        },
        label: "Trash 1 card from your hand",
        cost: { kind: "trash-from-hand", count: 1 },
      },
    ],
  ],
};
