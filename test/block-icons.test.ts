import { describe, expect, it } from "vitest";
import {
  blockPrintingSnapshot,
  cardBlockIcons,
  cardFormatLegality,
  cardRegistry,
  isStandardLegal,
  STANDARD_FLOORS,
  UNSTAMPED_BLOCK_PRINTINGS,
} from "@one-piece-sim/cards";

describe("block icons and Standard legality", () => {
  it("reads legality off the printing rather than off the card number", () => {
    // The three cases the OP-17 RB Sabo list turned up, and they disagree with
    // every rule of thumb: the set a card was first printed in, whether it was
    // reprinted at all, and whether the reprint is in a newer set.
    expect(cardBlockIcons("OP04-016")).toEqual(["1", "4"]);
    expect(isStandardLegal("OP04-016")).toBe(true);

    // Reprinted into OP-05 and ST-10 and still block 1 in both. What keeps it
    // legal is the `X` on its ST-31 printing, not the newer set.
    expect(cardBlockIcons("OP01-016")).toEqual(["1", "X"]);
    expect(isStandardLegal("OP01-016")).toBe(true);

    // Block 1 everywhere, and so genuinely gone from Standard.
    expect(cardBlockIcons("OP01-025")).toEqual(["1"]);
    expect(isStandardLegal("OP01-025")).toBe(false);
  });

  it("says why a card is out, and lets Extra Regulation have it", () => {
    expect(cardFormatLegality("OP01-025", "standard")).toEqual({
      cardNumber: "OP01-025",
      blocks: ["1"],
      stamped: true,
      legal: false,
      reason:
        "block 1 rotated out of Standard on 2026-04-01 (en floor is block 2)",
    });
    expect(cardFormatLegality("OP01-025", "extra").legal).toBe(true);
  });

  it("reads Bandai's block-number updates as one more icon on the identity", () => {
    // OP01-055 is block 1 on every printing and Standard-legal anyway: the
    // update page assigns it to block 4 through March 2029, and the audit
    // records that ruling beside the printed icon.
    expect(cardBlockIcons("OP01-055")).toEqual(["1", "4"]);
    expect(isStandardLegal("OP01-055")).toBe(true);
    // A Super Parallel Rare identity the page keeps legal outright reads as
    // the evergreen icon, whatever its printings say.
    expect(cardBlockIcons("OP01-120")).toEqual(["1", "X"]);
    expect(isStandardLegal("OP01-120")).toBe(true);
  });

  it("treats an identity with no stamped printing as unknown, not as legal", () => {
    // A card printed in a legal block on a page `tools/fetch-reference` does
    // not fetch would read as rotated out, so an unstamped identity fails
    // Standard unless it is declared -- the failure names the snapshot, which
    // is the thing to go and fix.
    expect(cardBlockIcons("OP99-999")).toEqual([]);
    const verdict = cardFormatLegality("OP99-999", "standard");
    expect(verdict.stamped).toBe(false);
    expect(verdict.legal).toBe(false);
    expect(verdict.reason).toContain(blockPrintingSnapshot);
    expect(cardFormatLegality("OP99-999", "extra").legal).toBe(true);
  });

  it("keeps the unstamped exemptions to identities that really are unstamped", () => {
    // The stale-exemption failure mode: Bandai publishes the card, the audit
    // starts stamping it, and the list still says it cannot be stamped.
    for (const cardNumber of UNSTAMPED_BLOCK_PRINTINGS) {
      expect(cardBlockIcons(cardNumber), cardNumber).toEqual([]);
      expect(isStandardLegal(cardNumber), cardNumber).toBe(true);
    }
  });

  it("holds the Standard floor to a review deadline the data cannot outrun", () => {
    // The floor moves about once a year, so it goes stale silently unless
    // something ties it to the data. This is the deterministic half: both dates
    // are committed constants, so it fires when somebody refreshes the card
    // data past the deadline rather than on an arbitrary Tuesday. The half that
    // needs the wall clock lives in `.github/workflows/rotation.yml`, which
    // opens a PR as the date approaches.
    for (const [region, floor] of Object.entries(STANDARD_FLOORS)) {
      expect(floor.effectiveFrom <= floor.verifiedOn, region).toBe(true);
      expect(floor.verifiedOn < floor.reviewBy, region).toBe(true);
      expect(blockPrintingSnapshot < floor.reviewBy, region).toBe(true);
      expect(floor.source, region).toMatch(/^https:\/\//);
    }
  });

  it("stamps a block icon for all but a handful of the shipped pool", () => {
    // Coverage rather than a count: an identity nothing stamps cannot be
    // judged, so the list of them has to stay short and declared.
    const unstamped = [...cardRegistry.values()]
      .map((card) => card.cardNumber)
      .filter(
        (cardNumber) =>
          !cardNumber.startsWith("FIX-") &&
          cardBlockIcons(cardNumber).length === 0,
      );
    expect(unstamped.sort()).toEqual([...UNSTAMPED_BLOCK_PRINTINGS].sort());
  });
});
