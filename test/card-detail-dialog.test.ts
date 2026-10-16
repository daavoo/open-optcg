import { describe, expect, it } from "vitest";
import {
  renderCardDetailDialog,
  type CardDetailState,
} from "../packages/web/src/dialogs.js";

/**
 * OP09-069 Trafalgar Law is a 2000-power {Heart Pirates} Character; OP12-073
 * Trafalgar Law's [On Play] gives every one of them +1000 until the end of the
 * opponent's next End Phase. Without the breakdown the popup showed the
 * printed 2000 while the board attacked for 3000, and nothing on screen said
 * where the difference came from.
 */
describe("card detail popup", () => {
  const inPlay: CardDetailState = {
    cardDetailCard: "OP09-069",
    cardDetailInstance: "p2-card-13",
  };

  it("explains a Character's current power with the effect that changed it", () => {
    const html = renderCardDetailDialog(inPlay, {
      currentPower: 3_000,
      attachedDon: 0,
      attachedDonApplies: true,
      powerModifiers: [
        { amount: 1_000, expiresAtTurn: 9, sourceCardNumber: "OP12-073" },
      ],
      staticPowerModifiers: [],
    });
    expect(html).toContain("3k");
    expect(html).toContain("power-breakdown");
    expect(html).toContain("Printed power");
    expect(html).toContain("OP12-073");
    expect(html).toContain("through turn 9");
  });

  it("starts the breakdown from a base power an effect replaced", () => {
    // OP16-001 Ace under OP16-003 Edward.Newgate (+2000) after OP17-005's
    // [On Play] made the Leader's base power 8000: the engine swings at 10000,
    // and the popup used to say "printed 5k, +2k Edward.Newgate" -- a headline
    // number its own rows disagreed with by the whole replacement.
    const html = renderCardDetailDialog(
      { cardDetailCard: "OP16-001", cardDetailInstance: "p2-leader" },
      {
        currentPower: 10_000,
        basePower: 8_000,
        attachedDon: 0,
        attachedDonApplies: true,
        powerModifiers: [],
        staticPowerModifiers: [{ sourceCardNumber: "OP16-003", amount: 2_000 }],
      },
    );
    expect(html).toContain("Power <b>10k</b>");
    expect(html).toContain("Base power");
    expect(html).toContain("set by an effect \u00b7 printed 5k");
    expect(html).toContain("<b>8k</b>");
    // The printed figure is a note on the base row, not the row the deltas
    // hang off any more.
    expect(html).not.toContain("<span>Printed power</span>");
  });

  it("shows the breakdown for a replaced base power with nothing else acting", () => {
    // A "becomes N" clause on its own moves the power without leaving a single
    // modifier row, so the gate that decides whether to draw the breakdown at
    // all has to count it -- otherwise the one case that most needs explaining
    // is the one case with no explanation.
    const html = renderCardDetailDialog(
      { cardDetailCard: "OP16-001", cardDetailInstance: "p2-leader" },
      {
        currentPower: 8_000,
        basePower: 8_000,
        attachedDon: 0,
        attachedDonApplies: true,
        powerModifiers: [],
        staticPowerModifiers: [],
      },
    );
    expect(html).toContain("power-breakdown");
    expect(html).toContain("printed 5k");
  });

  it("says a keyword was granted, which no printed text on the card can", () => {
    const html = renderCardDetailDialog(
      { cardDetailCard: "OP16-015", cardDetailInstance: "p2-card-17" },
      {
        currentPower: 6_000,
        attachedDon: 0,
        attachedDonApplies: true,
        powerModifiers: [],
        staticPowerModifiers: [],
        grantedKeywords: [{ keyword: "Rush", expiresAtTurn: 4 }],
      },
    );
    expect(html).toContain("[Rush] granted this turn");
    expect(html).toContain("Through turn 4");
    expect(html).toContain("attack on the turn it was played");
    // No power moved, so the breakdown stays off and the keyword row is the
    // only thing the popup gained.
    expect(html).not.toContain("power-breakdown");
  });

  it("says a card may attack active Characters, which no keyword row can", () => {
    // EB03-008 Hibari hands this to a {SWORD} Leader for the turn; the
    // Leader's own text says nothing about it.
    const html = renderCardDetailDialog(
      { cardDetailCard: "OP11-001", cardDetailInstance: "p2-leader" },
      {
        currentPower: 5_000,
        attachedDon: 0,
        attachedDonApplies: true,
        powerModifiers: [],
        staticPowerModifiers: [],
        attacksActiveUntilTurn: 4,
      },
    );
    expect(html).toContain("Can attack active Characters this turn");
    expect(html).toContain("Through turn 4");
  });

  it("says a keyword came from another card, which neither text nor a grant can", () => {
    // OP16-001 Ace under OP16-003 Edward.Newgate: the Leader has [Double Attack]
    // and its own text says nothing about it, the way a granted keyword does not
    // -- there is no grant, only another card standing on the board. The popup
    // showed the +2000 from that same clause and nothing about the keyword.
    const html = renderCardDetailDialog(
      { cardDetailCard: "OP16-001", cardDetailInstance: "p2-leader" },
      {
        currentPower: 7_000,
        attachedDon: 0,
        attachedDonApplies: true,
        powerModifiers: [],
        staticPowerModifiers: [{ sourceCardNumber: "OP16-003", amount: 2_000 }],
        effectiveKeywords: ["Double Attack"],
      },
    );
    expect(html).toContain("[Double Attack] from another card");
    expect(html).toContain("deal 2 damage");
  });

  it("does not badge a keyword the card prints itself", () => {
    // ST31-003 Brook prints [Blocker], so the card text below already says it
    // and a badge would be repeating the card back to the reader.
    const html = renderCardDetailDialog(
      { cardDetailCard: "ST31-003", cardDetailInstance: "p1-card-3" },
      {
        currentPower: 4_000,
        attachedDon: 0,
        attachedDonApplies: true,
        powerModifiers: [],
        staticPowerModifiers: [],
        effectiveKeywords: ["Blocker"],
      },
    );
    expect(html).not.toContain("from another card");
  });

  /**
   * The popup is what a card you cannot act on gets -- an opponent's Character,
   * a catalog entry -- and the in-game modal is what one of your own gets. They
   * were two different layouts, so the same card read as two different kinds of
   * object depending on who owned it. Both now render `renderCardOverview`, and
   * these are the classes the shared stylesheet lays out.
   */
  it("lays a card out in the same three columns the in-game modal uses", () => {
    const html = renderCardDetailDialog(inPlay);
    expect(html).toContain('class="card-action-overview"');
    expect(html).toContain('class="card-action-stats"');
    expect(html).toContain('class="card-action-text rule-card"');
    // Name first and number after it, the way the in-game modal titles it.
    expect(html).toContain(
      '<h2 class="card-detail-heading">Trafalgar Law · OP09-069</h2>',
    );
  });

  /**
   * The art column holds the first grid track whether or not there is art to
   * put in it: `pnpm web:build --no-art` ships none, and dropping the element
   * slid the numbers and the text one column to the left.
   */
  it("keeps the art column when there is no art to fill it", () => {
    const html = renderCardDetailDialog(inPlay);
    expect(html).toMatch(/class="card-detail-art (has-art|no-art)"/);
    // Whichever branch this build takes, the column says which card it is: an
    // empty panel the size of a card reads as an image that failed to load.
    expect(html).toContain("Trafalgar Law");
  });

  it("shows printed power alone for a card that is not in play", () => {
    const html = renderCardDetailDialog({
      cardDetailCard: "OP09-069",
      cardDetailInstance: null,
    });
    expect(html).toContain("2k");
    expect(html).not.toContain("power-breakdown");
  });

  /**
   * DON!! given to a card stays attached through the opponent's turn but only
   * adds its +1000 on its controller's, so an opponent's Leader inspected on
   * your turn used to show a +1000 row the engine had not counted -- the rows
   * summed to 7000 above a 6000 the same popup printed two lines up.
   */
  it("does not bill attached DON!! that is not paying out this turn", () => {
    const html = renderCardDetailDialog(
      { cardDetailCard: "OP13-004", cardDetailInstance: "p2-leader" },
      {
        currentPower: 6_000,
        attachedDon: 1,
        attachedDonApplies: false,
        powerModifiers: [],
        staticPowerModifiers: [{ amount: 1_000, sourceCardNumber: "OP13-004" }],
      },
    );
    expect(html).toContain("Attached DON!!");
    expect(html).toContain("pays out only on its controller&#39;s turn");
    expect(html).not.toContain("+1k</b></div><div");
    // Printed 5000 plus the only row that pays out: the 6000 shown above.
    expect(html).toContain("6k");
  });

  /**
   * OP15-088 Pirates Docking Six prints "This Character gains +6 cost" on
   * itself, so the 5 printed on the art is a figure no cost-capped effect on
   * the board agrees with -- the popup showed that 5 and nothing else.
   */
  it("shows the cost an effect moved, and what it moved from", () => {
    const html = renderCardDetailDialog(
      { cardDetailCard: "OP15-088", cardDetailInstance: "p1-card-4" },
      {
        currentPower: 7_000,
        currentCost: 11,
        attachedDon: 0,
        attachedDonApplies: true,
        powerModifiers: [],
        staticPowerModifiers: [],
      },
    );
    expect(html).toContain("Cost <b>11</b>");
    expect(html).toContain("printed 5 \u00b7 +6 from effects");
    expect(html).toContain("raised");
  });

  /**
   * ST33-004 Borsalino prints 6 and is played for 3 on the turn an effect
   * trashed a card from its controller's hand. The panel showed the printed 6
   * over a "Play card" button that three DON!! could press.
   */
  it("prices a card in hand at what playing it costs, keeping its printed power", () => {
    const html = renderCardDetailDialog(
      { cardDetailCard: "ST33-004", cardDetailInstance: "p1-hand-2" },
      {
        // Nothing in hand has power a board effect can move, so the popup
        // falls back to the printed figure rather than showing a live one.
        currentPower: null,
        currentCost: 3,
        attachedDon: 0,
        attachedDonApplies: false,
        powerModifiers: [],
        staticPowerModifiers: [],
      },
    );
    expect(html).toContain("Cost <b>3</b>");
    expect(html).toContain("printed 6 \u00b7 \u22123 from effects");
    expect(html).toContain("lowered");
    expect(html).toContain("6k");
    expect(html).not.toContain("power-breakdown");
  });

  it("marks a cost an effect lowered, and leaves an unmoved cost unannotated", () => {
    const discounted = renderCardDetailDialog(
      { cardDetailCard: "OP09-069", cardDetailInstance: "p1-card-4" },
      {
        currentPower: 2_000,
        currentCost: 0,
        attachedDon: 0,
        attachedDonApplies: true,
        powerModifiers: [],
        staticPowerModifiers: [],
      },
    );
    expect(discounted).toContain("Cost <b>0</b>");
    expect(discounted).toContain("printed 1 \u00b7 \u22121 from effects");
    expect(discounted).toContain("lowered");

    const unmoved = renderCardDetailDialog(
      { cardDetailCard: "OP09-069", cardDetailInstance: "p1-card-4" },
      {
        currentPower: 2_000,
        currentCost: 1,
        attachedDon: 0,
        attachedDonApplies: true,
        powerModifiers: [],
        staticPowerModifiers: [],
      },
    );
    expect(unmoved).toContain("Cost <b>1</b>");
    expect(unmoved).not.toContain("from effects");
  });
});
