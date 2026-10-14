import { describe, expect, it } from "vitest";
import { cardRegistry } from "@one-piece-sim/cards";
import { parseOfficialCards } from "../tools/audit-cards/src/parse-cardlist.js";

/**
 * The Bandai card list parse, at the one place it used to lose text.
 *
 * An attribute inside a sentence is written as a bare `<Slash>` -- angle
 * brackets, no closing tag -- and an HTML parser reads that as an element
 * rather than as words. An element with no text content contributes nothing,
 * so the icon vanished and "your <Slash> attribute Characters" reached the
 * card records as "your attribute Characters": a sentence missing the word its
 * clause turns on. Seven cards across four sets printed one.
 *
 * The pages themselves are gitignored (see `fixtures/reference/`), so these
 * drive the parser with the shape they carry rather than with a snapshot.
 */

/** One card's entry on a card list page, as Bandai renders it. */
const page = (effect: string, trigger = "") => `
<dl class="modalCol" id="TEST-001">
  <dt>
    <div class="infoCol"><span>TEST-001</span> | <span>C</span> | <span>CHARACTER</span></div>
    <div class="cardName">Test Card</div>
  </dt>
  <dd>
    <div class="backCol">
      <div class="cost"><h3>Cost</h3>3</div>
      <div class="attribute"><h3>Attribute</h3><i>Slash</i></div>
      <div class="power"><h3>Power</h3>5000</div>
      <div class="counter"><h3>Counter</h3>1000</div>
      <div class="color"><h3>Color</h3>Green</div>
      <div class="feature"><h3>Type</h3>Frost Moon Village</div>
      <div class="text"><h3>Effect</h3>${effect}</div>
      ${trigger ? `<div class="trigger"><h3>Trigger</h3>${trigger}</div>` : ""}
    </div>
  </dd>
</dl>`;

describe("Bandai card list parse", () => {
  it("keeps an attribute icon written inside effect text", () => {
    const [card] = parseOfficialCards(
      page(
        "[On Play] Set up to 1 of your <Slash> attribute Characters as active.",
      ),
    );

    expect(card?.effect).toBe(
      "[On Play] Set up to 1 of your <Slash> attribute Characters as active.",
    );
  });

  it("keeps one written inside Trigger text", () => {
    const [card] = parseOfficialCards(
      page("-", "[Trigger] Give your <Strike> attribute Leader +1000 power."),
    );

    expect(card?.trigger).toBe(
      "[Trigger] Give your <Strike> attribute Leader +1000 power.",
    );
  });

  it("keeps the words after the icon, which the tag would have swallowed", () => {
    // An unclosed element nests everything after it as its children, so a
    // repair applied *after* parsing has to unwrap them. Escaping the icon
    // before the parse means the element is never created at all.
    const [card] = parseOfficialCards(
      page(
        "If your Leader has the <Slash> attribute, this Character gains [Rush].",
      ),
    );

    expect(card?.effect).toContain("attribute, this Character gains [Rush].");
  });

  it("throws on an icon it has never seen rather than dropping it", () => {
    // The failure this test exists for was silent: the parse read the text
    // around the marker and said nothing. A name outside the attribute
    // vocabulary now stops the run and names itself.
    expect(() =>
      parseOfficialCards(
        page("Give your <Haki> attribute Leader +1000 power."),
      ),
    ).toThrow(/TEST-001: unknown element <haki> in printed text/);
  });

  it("has no card in the pool whose printed text lost an attribute", () => {
    // The regression in the shape it reached the records: a sentence that says
    // "the attribute" with no attribute in front of it.
    const stripped = [...cardRegistry.values()]
      .filter((card) =>
        Object.values(card.rules.clauseSummaries).some((summary) =>
          / the attribute|your attribute /.test(summary.cost ?? ""),
        ),
      )
      .map((card) => card.cardNumber);

    expect(stripped).toEqual([]);
  });
});
