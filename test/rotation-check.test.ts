import { describe, expect, it } from "vitest";
import {
  diffBlockPrintings,
  diffIsEmpty,
  foldBlockPrintings,
  parseBlockIcons,
  parseBlockUpdates,
  toBlockPrintingMap,
} from "../tools/audit-cards/src/block-icons.js";

/** One cardlist record, in the shape Bandai's page renders it. */
const record = (cardNumber: string, block: string) =>
  `<dl class="modalCol"><dt><div class="infoCol"><span>${cardNumber}</span> | <span>R</span> | <span>CHARACTER</span></div><div class="cardName">A Card</div></dt><dd><div class="backCol"><div class="col2"><div class="color"><h3>Color</h3>Red</div><div class="block"><h3>Block<br class="spInline"> icon</h3>${block}</div></div></div></dd></dl>`;

describe("reading block icons off a cardlist page", () => {
  it("takes the card number and the icon, and skips a printing with neither", () => {
    const html = [
      record("OP17-001", "5"),
      record("OP01-016", "X"),
      // OP15-096 is the one record in the snapshot whose icon field reads "-".
      // That is an absent icon, not a block, and must not become one.
      record("OP15-096", "-"),
    ].join("");
    expect(parseBlockIcons(html)).toEqual([
      ["OP17-001", "5"],
      ["OP01-016", "X"],
    ]);
  });

  it("stops on a block icon it has never seen", () => {
    // A sixth block arriving is the event the scheduled check exists to
    // notice. Crashing in a cron job beats recording an icon that nothing
    // downstream knows how to compare against the floor.
    expect(() => parseBlockIcons(record("OP18-001", "6"))).toThrow(
      "OP18-001: unknown block icon 6",
    );
  });

  it("folds one identity's icons across every page it appears on", () => {
    // Legality is a property of a printing, so the union across products is
    // the answer -- OP04-016 is block 1 in PRB-02 and block 4 in ST-31.
    const printings = foldBlockPrintings([
      parseBlockIcons(record("OP04-016", "1")),
      parseBlockIcons(record("OP04-016", "4")),
      parseBlockIcons(record("OP17-001", "5")),
    ]);
    expect(toBlockPrintingMap(printings)).toEqual({
      "OP04-016": ["1", "4"],
      "OP17-001": ["5"],
    });
  });
});

/** One section of Bandai's block-number-update page, as it renders it. */
const updateSection = (heading: string, cardNumbers: string[]) =>
  `<div class="row"><div class="col-sm-12"><div class="text-area"><h3>${heading}</h3> <p>Some explanation.</p></div><div class="editor_row"><div class="bgFrame"><div class="text-area"><ul>${cardNumbers
    .map(
      (cardNumber) =>
        `<li>・<a href="https://en.onepiece-cardgame.com/cardlist/?search=true&amp;freewords=${cardNumber}">${cardNumber} Some Card</a></li>`,
    )
    .join("")}</ul></div></div></div></div></div>`;

describe("reading Bandai's block-number updates", () => {
  it("records the block-4 rulings as block 4 and the evergreen list as X", () => {
    const html = [
      updateSection("Cards Generally Permitted in Standard Regulation", [
        "OP01-120",
        "OP17-022",
      ]),
      updateSection("Cards Eligible for Use Under Block Number ④", [
        "OP01-055",
        "ST02-007",
      ]),
      // The cross-reference section repeats identities the other two and the
      // cardlist pages already cover, so it adds no icon.
      updateSection("Updated Block Number and cards that have been reprinted", [
        "OP04-016",
      ]),
    ].join("");
    expect(parseBlockUpdates(html)).toEqual([
      ["OP01-120", "X"],
      ["OP17-022", "X"],
      ["OP01-055", "4"],
      ["ST02-007", "4"],
    ]);
  });

  it("folds with the printed icons, so a ruling reads as one more printing", () => {
    const printings = foldBlockPrintings([
      parseBlockIcons(record("OP01-055", "1")),
      parseBlockUpdates(
        updateSection("Cards Eligible for Use Under Block Number ④", [
          "OP01-055",
        ]),
      ),
    ]);
    expect(toBlockPrintingMap(printings)).toEqual({ "OP01-055": ["1", "4"] });
  });

  it("stops on a section it has never seen, and on a page with none", () => {
    // A fourth category would be a ruling nothing downstream knows how to
    // apply, and an empty page is a render failure, not a page with no
    // updates on it.
    expect(() =>
      parseBlockUpdates(
        updateSection("Cards Banned in Standard Regulation", ["OP01-001"]),
      ),
    ).toThrow(
      'unrecognised block-update section: "Cards Banned in Standard Regulation"',
    );
    expect(() => parseBlockUpdates("<html><body></body></html>")).toThrow(
      "block-update page carried no section headings",
    );
  });
});

describe("diffing a fresh reading against the committed data", () => {
  const committed = { "OP01-016": ["1"], "OP04-016": ["1", "4"] };

  it("reports nothing when the pages still say the same thing", () => {
    const diff = diffBlockPrintings(committed, committed);
    expect(diffIsEmpty(diff)).toBe(true);
  });

  it("reports a reprint that carries a card into another block", () => {
    // The ST-31 printing of OP01-016 stamps it `X`, which is what actually
    // keeps it Standard-legal. This is the change worth opening a PR for.
    const diff = diffBlockPrintings(committed, {
      ...committed,
      "OP01-016": ["1", "X"],
    });
    expect(diff.gained).toEqual([
      { cardNumber: "OP01-016", before: ["1"], after: ["1", "X"] },
    ]);
    expect(diff.added).toEqual([]);
    expect(diff.lost).toEqual([]);
  });

  it("reports a new set, and flags a block icon never seen before", () => {
    const diff = diffBlockPrintings(committed, {
      ...committed,
      "OP18-001": ["6"],
    });
    expect(diff.added).toEqual([{ cardNumber: "OP18-001", blocks: ["6"] }]);
    // A block above every block in the committed data is what a new block
    // looks like arriving, and the floor may have moved with it.
    expect(diff.newBlocks).toEqual(["6"]);
  });

  it("separates a lost printing from a gained one", () => {
    // A printing that exists does not stop existing, so this can only be a
    // page that failed to render. `--write` refuses on it rather than
    // deleting the pool's block icons because Bandai had a bad morning.
    const diff = diffBlockPrintings(committed, { "OP01-016": ["1"] });
    expect(diff.lost).toEqual([
      { cardNumber: "OP04-016", before: ["1", "4"], after: [] },
    ]);
    expect(diff.gained).toEqual([]);

    const shrunk = diffBlockPrintings(committed, {
      ...committed,
      "OP04-016": ["4"],
    });
    expect(shrunk.lost).toEqual([
      { cardNumber: "OP04-016", before: ["1", "4"], after: ["4"] },
    ]);
  });
});
