import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { printedText, cardBlockIcons } from "@one-piece-sim/cards";
import {
  COMMUNITY_DECK_IDS,
  FORMAT_DECK_IDS,
  SECONDARY_SOURCE_ONLY,
  communityDeckCardRows,
  deckCardRows,
  deckFormatReport,
  formatDeckCardRows,
  recommendedDeckFor,
  requireSupportedDeck,
  SELECTABLE_DECK_IDS,
  validateDeckCardRows,
  type DeckCardRow,
} from "@one-piece-sim/decks";

const sha256 = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("deck provenance rows", () => {
  it("covers every ST31-ST36 manifest identity", () => {
    expect(formatDeckCardRows).toHaveLength(90);
    expect(new Set(formatDeckCardRows.map((row) => row.deckId))).toEqual(
      new Set(FORMAT_DECK_IDS),
    );
  });

  it("covers every identity of the twenty-one community meta decks", () => {
    // 18 Nami identities and 15 Enel ones, plus the OP-17 Xebec and Black
    // Luffy lists at 15 each, the OP-17 Green Shanks feature deck at 17 (it
    // was 16 as the OPDeckGuide list), the OP-17 Elbaph Sabo list at 15, the
    // OP-16 Red Ace feature deck at 14 (15 as the
    // OP-17-tuned list), the OP-17 Purple Kaido list at 15, the EB-04 Red/Yellow
    // Bonney list at 14, the OP-06 (Green/Yellow) Yamato list at 15 and the
    // OP-17 (Red) Edward.Newgate list at 16, the OP-17 (Purple/Yellow) Nico
    // Robin list at 16 and the OP-16 (Purple) Sengoku list at 14 -- each a
    // Leader plus its distinct deck cards. Kaido was 17 until it moved from
    // the OPDeckGuide list to Bandai's feature deck, which runs fourteen
    // distinct cards rather than sixteen. ST-26, Bandai's own (Purple/Black)
    // Monkey.D.Luffy starter, adds 15: it is not part of the ST31-36 format
    // the generated pass covers, so its identities are stamped one by one
    // here like a meta list's. ST-27, Bandai's recommended list for the (Black)
    // Marshall.D.Teach starter, adds 14 the same way, and ST-18, Bandai's
    // (Purple) Monkey.D.Luffy starter, adds 15 -- its Leader OP05-060 is a
    // reprint, so the row count counts it like any other identity. (Black)
    // Monkey.D.Luffy was 18 until it moved from the OPDeckGuide export to
    // Bandai's feature deck, which runs fifteen distinct cards rather than
    // seventeen. The OP-15 (Red/Green) Krieg feature deck adds 14: thirteen
    // distinct deck cards and its Leader. The OP-15 (Red/Blue) Lucy feature
    // deck adds 16: fifteen distinct deck cards and its Leader, two of the
    // fifteen being OP-10 {Dressrosa} Events it reaches by type rather than by
    // set. ST-29 and ST-30, Bandai's (Yellow) Monkey.D.Luffy and (Red/Green)
    // Luffy & Ace starters, add 17 each: unusually for a starter neither list
    // reaches outside its own set, so every identity of the product is a row.
    // The OP-17 (Yellow) Charlotte Linlin feature deck adds 14: thirteen
    // distinct deck cards and its Leader, twelve of the thirteen four-ofs.
    // The (Purple) Enel list that won the EU Championship 26-27 Season 1 Final
    // adds 18: seventeen distinct deck cards and its Leader, which the feature
    // deck already carries. The (Red/Green) Luffy & Ace Open OPTCG list adds
    // 17: sixteen distinct deck cards and the ST-30 Leader. The (Red/Green)
    // Monkey.D.Luffy list behind OP13-001 adds 15: fourteen distinct deck cards
    // and its Leader.
    // The (Black) Monkey.D.Luffy Open OPTCG list adds 16: fifteen distinct
    // deck cards and its Leader.
    // The (Purple) Kaido field list, the Sci-Fi Factory Standard Battle
    // winner, adds 18: seventeen distinct deck cards and its Leader.
    // The OP-15 (Blue) Rebecca feature deck adds 14: thirteen distinct deck
    // cards and its Leader.
    // The OP-15 (Yellow) Monkey.D.Luffy feature deck adds 14: thirteen
    // distinct deck cards and its Leader.
    // The OP-15 (Green/Black) Brook feature deck adds 15: fourteen distinct
    // deck cards and its Leader.
    // The EB-03 (Red/Blue) Nefeltari Vivi feature deck adds 14: thirteen
    // distinct deck cards and its Leader.
    // The (Red) Portgas.D.Ace Open OPTCG list adds 16: fifteen distinct deck
    // cards and its Leader.
    // The OP-14 (Red) Trafalgar Law feature deck adds 14: thirteen distinct
    // deck cards and its Leader.
    // The OP-14 (Blue/Yellow) Boa Hancock feature deck adds 14: thirteen
    // distinct deck cards and its Leader.
    // The OP-14 (Blue) Jinbe feature deck adds 14: thirteen distinct deck
    // cards and its Leader.
    // The OP-13 (Black) Imu feature deck adds 15: fourteen distinct deck cards
    // and its Leader.
    // The OP-16 (Black) Yamato feature deck adds 14: thirteen distinct deck
    // cards and its Leader.
    // The (Blue) Rocks.D.Xebec Open OPTCG list adds 15: fourteen distinct deck
    // cards and its Leader.
    // The OP-14 (Black) Crocodile feature deck adds 14: thirteen distinct deck
    // cards and its Leader.
    // The OP-14 (Black/Yellow) Gecko Moria feature deck adds 15: fourteen
    // distinct deck cards and its Leader.
    // The OP-12 (Black/Yellow) Koala feature deck adds 14: thirteen distinct
    // deck cards and its Leader.
    // The OP-13 (Red/Blue) Portgas.D.Ace feature deck adds 14: thirteen
    // distinct deck cards and its Leader.
    // The OP-12 (Blue/Purple) Sanji feature deck adds 15: fourteen distinct
    // deck cards and its Leader.
    // The OP-09 (Blue) Buggy feature deck adds 14: thirteen distinct deck
    // cards and its Leader.
    // The OP-13 (Red/Purple) Gol.D.Roger feature deck adds 14: thirteen
    // distinct deck cards and its Leader.
    // The OP-14 (Purple) Donquixote Doflamingo feature deck adds 14: thirteen
    // distinct deck cards and its Leader.
    // The (Purple/Yellow) Charlotte Pudding Open OPTCG list adds 17: sixteen
    // distinct deck cards and its Leader.
    // The (Yellow) Enel Open OPTCG list adds 15: fourteen distinct deck cards
    // and its Leader.
    // ST-22, Bandai's (Blue) Ace & Newgate starter, adds 17: sixteen distinct
    // deck cards and its Leader.
    // The OP-12 (Red) Silvers Rayleigh feature deck adds 14: thirteen
    // distinct deck cards and its Leader.
    // The (Green) Roronoa Zoro OP17 post-ban list adds 16: fifteen distinct
    // deck cards and its Leader.
    // The (Blue) Kuzan list that took 1st at Bandai Hiroshima adds 17: sixteen
    // distinct deck cards and its Leader.
    // The (Blue/Purple) Vinsmoke Reiju Store Battle list adds 18: seventeen
    // distinct deck cards and its Leader.
    // The (Red/Black) Koby Regional Final list adds 17: sixteen distinct deck
    // cards and its Leader.
    // The (Yellow) Vegapunk Store Battle list adds 18: seventeen distinct deck
    // cards and its Leader.
    // The EB-02 (Green/Purple) Monkey.D.Luffy feature deck adds 14: thirteen
    // distinct deck cards and its Leader.
    // The OP-10 (Blue/Black) Usopp feature deck adds 16: fifteen distinct deck
    // cards and its Leader.
    // The OP-11 (Green/Yellow) Shirahoshi feature deck adds 15: fourteen
    // distinct deck cards and its Leader.
    // The OP-11 (Green) Jinbe feature deck adds 14: thirteen distinct deck
    // cards and its Leader.
    // ST-23, Bandai's (Red) Shanks starter, adds 15: fourteen distinct deck
    // cards and its Leader.
    // The (Red/Green) Monkey.D.Luffy list moved to the Malmo Regional winner:
    // sixteen distinct deck cards where the old list had fourteen, so 2 more.
    // The ChinoizeCup #105 (Blue/Yellow) Boa Hancock list adds 17: sixteen
    // distinct deck cards and its Leader.
    // The three EB-05 lists add 46: the ChinoizeCup #124 Buggy and #125 Law
    // lists 16 each (fifteen distinct deck cards and a Leader), and the EB05
    // Wisdom Robin list 14 (thirteen and a Leader).
    // The best-measured lists for sixteen Leaders add 258 (each list's
    // distinct deck cards and its Leader), and the EU Final Enel and the 2025
    // Vegapunk lists they replace on the Community shelf take 36 away. The
    // OP-14 Green Mihawk list (16) went with its Leader's ban.
    expect(communityDeckCardRows).toHaveLength(1205);
    expect(new Set(communityDeckCardRows.map((row) => row.deckId))).toEqual(
      new Set(COMMUNITY_DECK_IDS),
    );
  });

  it("holds every shipped deck to a 50-card list and a matched source", () => {
    expect(validateDeckCardRows()).toEqual([]);
  });

  it("builds a legal 50-card manifest behind every row's deck", () => {
    for (const deckId of new Set(deckCardRows.map((row) => row.deckId))) {
      expect(
        Object.values(requireSupportedDeck(deckId).cards).reduce(
          (total, quantity) => total + quantity,
          0,
        ),
        deckId,
      ).toBe(50);
    }
  });

  it("rejects a short deck, a bad hash and an unmatched source", () => {
    const row: DeckCardRow = {
      deckId: "(Red) Monkey.D.Luffy - Starter Deck 31",
      cardNumber: "ST21-001",
      role: "leader",
      quantity: 1,
      officialTextHash: "a".repeat(64),
      sourceMatch: true,
      format: "standard",
      blocks: ["3"],
    };
    expect(validateDeckCardRows([row])).toContain(
      "(Red) Monkey.D.Luffy - Starter Deck 31: expected 50 cards, got 0",
    );
    expect(validateDeckCardRows([{ ...row, officialTextHash: "" }])).toContain(
      "(Red) Monkey.D.Luffy - Starter Deck 31:ST21-001: missing or invalid official text hash",
    );
    expect(validateDeckCardRows([{ ...row, sourceMatch: false }])).toContain(
      "(Red) Monkey.D.Luffy - Starter Deck 31:ST21-001: official source text is not matched",
    );
  });

  it("rejects a rotated-out printing only in the format that rotates", () => {
    const row: DeckCardRow = {
      deckId: "(Red) Monkey.D.Luffy - Starter Deck 31",
      cardNumber: "ST21-001",
      role: "leader",
      quantity: 1,
      officialTextHash: "a".repeat(64),
      sourceMatch: true,
      format: "standard",
      blocks: ["1"],
    };
    expect(validateDeckCardRows([row])).toContain(
      "(Red) Monkey.D.Luffy - Starter Deck 31:ST21-001: block 1 rotated out of Standard on 2026-04-01 (en floor is block 2)",
    );
    // The icons on the row decide it, not the card number: the same identity
    // with a legal printing passes, and so does the same row in Extra.
    expect(validateDeckCardRows([{ ...row, blocks: ["1", "4"] }])).toEqual([
      "(Red) Monkey.D.Luffy - Starter Deck 31: expected 50 cards, got 0",
    ]);
    expect(validateDeckCardRows([{ ...row, format: "extra" }])).toEqual([
      "(Red) Monkey.D.Luffy - Starter Deck 31: expected 50 cards, got 0",
    ]);
  });

  it("declares a format for every shipped deck and holds it to that format", () => {
    const reports = deckFormatReport();
    expect(reports).toHaveLength(84);
    for (const report of reports) {
      expect(report.illegal, report.deckId).toEqual([]);
      expect(report.blocks.length, report.deckId).toBeGreaterThan(0);
    }
    // Every deck a player can pick is Standard-legal. This is the assertion
    // that keeps it that way: an Extra list is legitimate and the format field
    // exists to declare one, but nothing in the shipped catalog needs it.
    expect(reports.filter((report) => report.format === "extra")).toEqual([]);
  });

  it("would fail a deck that named a rotated-out printing", () => {
    // The gate has to be able to fail, and the shipped catalog contains no
    // case that makes it. OP01-025 is block 1 on its only printing and on no
    // block-number update, so it is genuinely out; OP01-055 is block 1 on
    // every printing too and stays legal only because Bandai's update page
    // assigns it to block 4.
    const row = deckCardRows.find(
      (candidate) =>
        candidate.deckId === "(Green) Roronoa Zoro - OP17 Post-Ban List",
    )!;
    const rotated: DeckCardRow = {
      ...row,
      cardNumber: "OP01-025",
      blocks: cardBlockIcons("OP01-025"),
    };
    expect(
      deckFormatReport([rotated]).flatMap((report) =>
        report.illegal.map((card) => card.cardNumber),
      ),
    ).toEqual(["OP01-025"]);
  });

  it("keeps each hand-authored card's officialTextHash in step with its own effect/trigger text", () => {
    // A card whose text this checkout does not hold -- a generated record with
    // no text cache on disk -- has nothing to compare; the audit that wrote
    // its hash wrote it from the same parse.
    for (const row of communityDeckCardRows) {
      const text = printedText(row.cardNumber);
      if (!text) continue;
      expect(row.officialTextHash, row.cardNumber).toBe(
        sha256({ effect: text.effect, trigger: text.trigger }),
      );
    }
  });

  it("exempts only the identities Bandai has genuinely not published", () => {
    // A stale exemption is the failure mode: the card gets published, the audit
    // starts matching it, and the list still says it cannot be matched.
    for (const cardNumber of SECONDARY_SOURCE_ONLY) {
      const rows = deckCardRows.filter((row) => row.cardNumber === cardNumber);
      expect(rows.length, cardNumber).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.sourceMatch, cardNumber).toBe(false);
      }
    }
  });
});

describe("recommended lists", () => {
  it("marks at most one shipped list per Leader", () => {
    const marked = new Map<string, string[]>();
    for (const deckId of SELECTABLE_DECK_IDS) {
      const manifest = requireSupportedDeck(deckId);
      if (!manifest.recommended) continue;
      marked.set(manifest.leader, [
        ...(marked.get(manifest.leader) ?? []),
        deckId,
      ]);
    }
    for (const [leader, deckIds] of marked) {
      expect(deckIds, leader).toHaveLength(1);
    }
  });

  it("offers the tuned Hancock list over Bandai's feature deck", () => {
    expect(recommendedDeckFor("OP14-041")).toBe(
      "(Blue/Yellow) Boa Hancock - 25th Place ChinoizeCup #105",
    );
    expect(
      requireSupportedDeck("(Blue/Yellow) Boa Hancock - Official Feature Deck")
        .recommended,
    ).toBeUndefined();
  });

  it("falls back to a Leader's only list, and to none when unmarked lists share one", () => {
    // OP12-040 fronts ST-33 and the Hiroshima list, and neither is marked.
    expect(recommendedDeckFor("OP12-040")).toBeUndefined();
    // OP14-001 fronts Bandai's feature deck and the ChinoizeCup #125 list,
    // and neither is marked either.
    expect(recommendedDeckFor("OP14-001")).toBeUndefined();
    expect(recommendedDeckFor("OP15-039")).toBe(
      "(Blue) Rebecca - Official Feature Deck",
    );
  });
});
