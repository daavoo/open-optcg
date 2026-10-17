/**
 * OP16 replacement effects -- "if <a Character> would be K.O.'d, you may <pay>
 * instead" -- plus OP15's.
 *
 * One module for both sets because the two sets print the clause often enough
 * that the shapes are worth comparing side by side; splitting them across two
 * files would say less than keeping them together.
 */
import { type SetMechanics } from "./registry.js";

export const replacementMechanics: SetMechanics = {
  replacement: [
    [
      // OP15-009 Koby: "[printed text omitted -- pnpm card:text OP15-009]"
      //
      // The widest `protects` in either set: it names no type and no printing,
      // so every Character its controller owns at 7000 printed power or less is
      // behind it, Koby included. `maxPower` is printed power, which is what
      // "base power" means -- a body pumped past 7000 for the turn is still
      // saved, and one whose base was raised is not.
      //
      // `removal: "off-field"` for "removed from the field": a bounce or a bury
      // is answered as well as a K.O. And no `[Once Per Turn]` is printed, so a
      // board of these answers one removal per copy per turn, each for another
      // −2000 on a Leader that has to keep attacking.
      "OP15-009",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: { category: "character", maxPower: 7000 },
        label: "Give your Leader −2000 power",
        cost: { kind: "leader-power-penalty", amount: -2000 },
      },
    ],
    [
      // OP15-003 Alvida: "[printed text omitted -- pnpm card:text OP15-003]"
      //
      // No `protects`, because the clause names "this Character": Alvida guards
      // only herself. No "by your opponent's effect" either, so battle
      // destruction counts -- which is what makes a 6000-power body genuinely
      // hard to remove.
      "OP15-003",
      {
        opponentEffectOnly: false,
        oncePerTurn: false,
        label: "Trash a Character with 6000 power or less from your hand",
        cost: {
          kind: "trash-from-hand",
          count: 1,
          match: { category: "character", maxPower: 6000 },
        },
      },
    ],
    [
      // OP15-014 Bartolomeo: "[printed text omitted -- pnpm card:text OP15-014]" The Barto Club shell runs enough Events
      // to pay this repeatedly, which is the point of the card.
      "OP15-014",
      {
        opponentEffectOnly: false,
        oncePerTurn: false,
        label: "Trash an Event from your hand",
        cost: {
          kind: "trash-from-hand",
          count: 1,
          match: { category: "event" },
        },
      },
    ],
    [
      // OP15-052 Leo: "[printed text omitted -- pnpm card:text OP15-052]"
      //
      // The same `protects` filter as Koby above -- every Character its
      // controller owns at 7000 printed power or less, Leo included -- and the
      // same "removed from the field", so a bounce or a bury is answered too.
      //
      // What is unusual is the payment: `bottom-deck-own-character` with no
      // `match`, because the printed text says "1 of your Characters" with no
      // "other than this Character" and no filter at all. Leo may hand over
      // itself, the threatened body, or anything else -- which is the whole
      // card, since bottoming the card that was about to be K.O.'d saves it
      // from the trash rather than from the board.
      "OP15-052",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: { category: "character", maxPower: 7000 },
        label: "Place 1 of your Characters at the bottom of the owner's deck",
        cost: { kind: "bottom-deck-own-character", count: 1 },
      },
    ],
    [
      // OP15-035 Laboon: "[printed text omitted -- pnpm card:text OP15-035]"
      //
      // OP15-052 Leo's `protects` -- every Character at 7000 printed power or
      // less, Laboon included -- with OP14-029 Tashigi's payment doubled.
      // "Your cards" is the Leader, the Characters and the Stage, so no
      // `match`; only an active card pays, and the offer is withheld below two.
      // No `[Once Per Turn]`: each copy answers a removal for every two active
      // cards its controller still has, which on the opponent's turn is
      // whatever the Leader and the board did not attack with.
      "OP15-035",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: { category: "character", maxPower: 7000 },
        label: "Rest 2 of your cards",
        cost: { kind: "rest-own-cards", count: 2 },
      },
    ],
    [
      // OP15-094 Roronoa Zoro: "[printed text omitted -- pnpm card:text OP15-094]"
      //
      // Three things separate this from OP16-014 Marco below, which is
      // otherwise the same shape:
      //
      //  - `protects` is type-scoped, so it answers removal aimed at a
      //    {Straw Hat Crew} body and nothing else.
      //  - `excludesSelf`, for "other than this Character". Zoro cannot save
      //    himself by trashing himself, and offering that would be a trap.
      //  - `trash-self` rather than `ko-self`: he is trashed, not K.O.'d, so an
      //    `[On K.O.]` -- his own or anything watching -- does not fire.
      //
      // The printed [Blocker] needs no entry here: it is a keyword, derived
      // from the printed text by `cardFacts`, and the Block step reads it.
      "OP15-094",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        protects: { category: "character", type: "Straw Hat Crew" },
        excludesSelf: true,
        label: "Trash Roronoa Zoro",
        cost: { kind: "trash-self" },
      },
    ],
    [
      // OP15-098 Monkey.D.Luffy (Leader): "[printed text omitted -- pnpm card:text OP15-098]"
      //
      // "By your opponent" with no "effect", so `opponentOnly`: the opponent's
      // removal and a battle their attacker wins are both answered, and the
      // controller's own removal is not. "Removed from the field" is
      // `"off-field"`, a bounce or a bury as well as a K.O. `minPower` is
      // printed power, which is what "base power" means. The price is a Life
      // card kept in hand, so the offer stands while there is Life to spend,
      // and no `[Once Per Turn]` is printed.
      "OP15-098",
      {
        opponentEffectOnly: false,
        opponentOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: { category: "character", type: "Sky Island", minPower: 6000 },
        label: "Add 1 card from the top of your Life cards to your hand",
        cost: { kind: "life-to-hand", count: 1 },
      },
    ],
    [
      // OP15-105 Jewelry Bonney: "[printed text omitted -- pnpm card:text OP15-105]"
      //
      // OP15-009 Koby's window -- every Character its controller owns at 7000
      // printed power or less, Bonney included, against the opponent's effects
      // only, and "removed from the field" so a bounce is answered as well as a
      // K.O. -- paid with OP15-098's Life card instead of Leader power. The
      // offer stands while there is Life to spend.
      "OP15-105",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: { category: "character", maxPower: 7000 },
        label: "Add 1 card from the top of your Life cards to your hand",
        cost: { kind: "life-to-hand", count: 1 },
      },
    ],
    [
      // OP15-069 Nola: `pnpm card:text OP15-069`.
      //
      // OP15-105 Bonney's window -- every Character its controller owns at
      // 7000 printed power or less, Nola included, against the opponent's
      // effects only, and "removed from the field" so a bounce is answered as
      // well as a K.O. -- paid with OP12-070 Sanji's DON!! returned from the
      // field. The offer stands while a DON!! is on the field.
      "OP15-069",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: { category: "character", maxPower: 7000 },
        label: "Return 1 DON!! card to your DON!! deck",
        cost: { kind: "return-don", count: 1 },
      },
    ],
    [
      // OP15-090 Perona: `pnpm card:text OP15-090`.
      //
      // The same window as OP15-069 Nola above, paid with any one card from
      // hand: no `match`, because the printed cost names no category.
      "OP15-090",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: { category: "character", maxPower: 7000 },
        label: "Trash 1 card from your hand",
        cost: { kind: "trash-from-hand", count: 1 },
      },
    ],
    [
      // OP16-014 Marco:"[printed text omitted -- pnpm card:text OP16-014]"
      //
      // `protects` with an empty filter is "any Character you control", which is
      // what "one of your Characters" means -- Marco included. The `ko-self`
      // cost runs the real removal pipeline, so Marco's own `[On K.O.]`
      // recursion fires and can play it straight back out of the trash.
      "OP16-014",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        protects: { category: "character" },
        label: "K.O. Marco",
        cost: { kind: "ko-self" },
      },
    ],
    [
      // OP16-018 Rockstar: "[printed text omitted -- pnpm card:text OP16-018]"
      //
      // The only card in either set whose *whole* printed text is a
      // replacement, which is why the registry exists: before it, a card like
      // this could not be claimed by any registry and had to be exempted from
      // the coverage ratchet by hand.
      "OP16-018",
      {
        opponentEffectOnly: false,
        oncePerTurn: true,
        protects: { category: "character", type: "Red-Haired Pirates" },
        label: "Trash a Character with 6000 power or more from your hand",
        cost: {
          kind: "trash-from-hand",
          count: 1,
          match: { category: "character", minPower: 6000 },
        },
      },
    ],
  ],
};
