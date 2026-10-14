import { describe, expect, it } from "vitest";
import { printedText, cardRegistry } from "@one-piece-sim/cards";

const all = [...cardRegistry.values()];

/**
 * Registry-wide invariants on printed card data.
 *
 * These are not style rules. Type matching in the engine is exact string
 * comparison -- `definition.types.includes("Straw Hat Crew")` in
 * `static-abilities.ts`, and the `type` field on every `CardSelector` -- so a
 * card whose type array says `"straw Hat Crew"` is invisible to every
 * `{Straw Hat Crew}` effect in the game while still *reading* as a Straw Hat.
 * Nothing fails; the card just quietly stops being targetable.
 *
 * OP17 arrived from a secondary source with nine such casing splits across 40
 * type entries, including seven Straw Hats and a "Red-haired Pirates Allise"
 * typo. The canonical spelling for each was taken from the spelling the rest of
 * the registry already used and from OP17's own printed effect text, which is
 * unanimously Title Case for every crew involved.
 *
 * The same argument applies to apostrophes: `TIMING_MARKERS` in
 * `card-support.test.ts` and `CLAUSE_MARKERS` in `@one-piece-sim/cards` match
 * `[On Opponent's Attack]` literally, so a curly or mojibake apostrophe hides a
 * whole timed clause from the coverage ratchet.
 */
describe("card data consistency", () => {
  it("spells each card type exactly one way", () => {
    const byLowercase = new Map<string, Set<string>>();
    for (const card of all) {
      for (const type of card.types) {
        const key = type.toLowerCase();
        if (!byLowercase.has(key)) byLowercase.set(key, new Set());
        byLowercase.get(key)!.add(type);
      }
    }
    const split = [...byLowercase.values()]
      .filter((variants) => variants.size > 1)
      .map((variants) => [...variants].sort());

    // A split here means one archetype exists as two distinct types, and every
    // effect that names it reaches only one of them.
    expect(split).toEqual([]);
  });

  // Printed text is not committed; these two checks read whatever text the
  // process holds (a hand-authored record, or the reference cache) and the
  // audit tool enforces the same on the way in.
  const textOf = (card: { cardNumber: string }) =>
    printedText(card.cardNumber) ?? { effect: "", trigger: "" };

  it("uses no replacement characters in printed text", () => {
    const corrupted = all
      .filter(
        (card) =>
          textOf(card).effect.includes("�") ||
          textOf(card).trigger.includes("�") ||
          card.name.includes("�"),
      )
      .map((card) => card.cardNumber);
    expect(corrupted).toEqual([]);
  });

  it("uses a plain apostrophe in every printed clause marker", () => {
    // The curly form reads identically to a human and matches nothing.
    const curly = all
      .filter(
        (card) =>
          /\[[^\]]*’[^\]]*\]/.test(textOf(card).effect) ||
          /\[[^\]]*’[^\]]*\]/.test(textOf(card).trigger),
      )
      .map((card) => card.cardNumber);
    expect(curly).toEqual([]);
  });

  it("leaves no card type padded or empty", () => {
    const malformed = all
      .filter((card) =>
        card.types.some((type) => type !== type.trim() || !type),
      )
      .map((card) => card.cardNumber);
    expect(malformed).toEqual([]);
  });
});
