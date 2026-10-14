import { describe, expect, it } from "vitest";
import { printedText } from "@one-piece-sim/cards";
import {
  cardKeywordKind,
  escapeHtml,
  renderCardText,
} from "../packages/web/src/card-text.js";

describe("card keyword colours", () => {
  it("colours keywords the way the card prints them", () => {
    expect(cardKeywordKind("On Play")).toBe("timing");
    expect(cardKeywordKind("Activate: Main")).toBe("timing");
    expect(cardKeywordKind("Opponent's Turn")).toBe("timing");
    expect(cardKeywordKind("Counter")).toBe("counter");
    expect(cardKeywordKind("Once Per Turn")).toBe("limit");
    expect(cardKeywordKind("Blocker")).toBe("ability");
    expect(cardKeywordKind("DON!! x2")).toBe("cost");
    expect(cardKeywordKind("Trigger")).toBe("trigger");
  });

  it("gives keyword variants their base keyword's colour", () => {
    expect(cardKeywordKind("Rush: Character")).toBe("ability");
  });

  it("leaves card names uncoloured", () => {
    expect(cardKeywordKind("Monkey.D.Luffy")).toBeNull();
    expect(renderCardText("other than [Sanji] from your hand.")).toBe(
      "other than [Sanji] from your hand.",
    );
  });
});

describe("card text rendering", () => {
  it("wraps keywords in chips and reminder text in italics", () => {
    expect(
      renderCardText("[Blocker] (After your opponent declares an attack.)"),
    ).toBe(
      '<span class="card-keyword card-keyword-ability">Blocker</span> ' +
        '<i class="card-reminder">(After your opponent declares an attack.)</i>',
    );
  });

  it("prints the DON!! requirement with a multiplication sign", () => {
    expect(renderCardText("[DON!! x2] This Character gains [Rush].")).toBe(
      '<span class="card-keyword card-keyword-cost">DON!!×2</span> ' +
        'This Character gains <span class="card-keyword card-keyword-ability">Rush</span>.',
    );
  });

  it("escapes the text it passes through", () => {
    expect(renderCardText("<b>1</b> of your opponent's Characters")).toBe(
      "&lt;b&gt;1&lt;/b&gt; of your opponent&#39;s Characters",
    );
    expect(renderCardText("[<script>]")).toBe("[&lt;script&gt;]");
  });

  it.skipIf(!printedText("ST31-002"))(
    "marks up printed text from the card pool",
    () => {
      expect(renderCardText(printedText("ST31-002")!.effect)).toContain(
        '<span class="card-keyword card-keyword-timing">On Play</span>',
      );
      expect(renderCardText(printedText("OP04-016")!.trigger)).toContain(
        '<span class="card-keyword card-keyword-trigger">Trigger</span>',
      );
    },
  );

  it("breaks the line before each new clause marker", () => {
    expect(
      renderCardText("[On Play] Draw 1 card. [On K.O.] Draw 2 cards."),
    ).toBe(
      '<span class="card-keyword card-keyword-timing">On Play</span> Draw 1 card. ' +
        "<br>" +
        '<span class="card-keyword card-keyword-timing">On K.O.</span> Draw 2 cards.',
    );
    expect(
      renderCardText(
        "[Main] Rest 1 card. [Counter] Your Leader gains +3000 power.",
      ),
    ).toContain(". <br>");
  });

  it("keeps a gating [DON!! xN] requirement on its clause's line", () => {
    expect(
      renderCardText(
        "[Your Turn] Draw 1 card. [DON!! x1] [On Your Opponent's Attack] You may trash 1 card.",
      ),
    ).toBe(
      '<span class="card-keyword card-keyword-timing">Your Turn</span> Draw 1 card. ' +
        "<br>" +
        '<span class="card-keyword card-keyword-cost">DON!!×1</span> ' +
        '<span class="card-keyword card-keyword-timing">On Your Opponent&#39;s Attack</span> You may trash 1 card.',
    );
  });

  it("does not split combined markers or inline references", () => {
    // `[On Play]/[On K.O.]` is one printed marker.
    expect(
      renderCardText("[On Play]/[On K.O.] Lock a Character."),
    ).not.toContain("<br>");
    // A [Trigger] mentioned as a card attribute is not a new clause.
    expect(
      renderCardText(
        "[On K.O.] Play 1 Character with a [Trigger] other than [Dr. Hogback].",
      ),
    ).not.toContain("<br>");
  });
});

describe("escapeHtml", () => {
  it("escapes every character that could break out of markup", () => {
    expect(escapeHtml(`&<>'"`)).toBe("&amp;&lt;&gt;&#39;&quot;");
  });
});
