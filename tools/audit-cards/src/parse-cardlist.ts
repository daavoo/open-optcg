import { load, type CheerioAPI } from "cheerio";
import { bodyText, normalize } from "./block-icons.js";

/** One card as Bandai's card list page prints it. */
export interface OfficialCard {
  cardNumber: string;
  rarity: string;
  category: string;
  name: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
  color: string[];
  types: string[];
  attribute: string | null;
  effect: string;
  trigger: string;
}

/**
 * The five attribute icons, as Bandai writes them into effect text.
 *
 * The page carries an attribute inside a sentence as a bare `<Slash>` -- an
 * angle-bracketed name with no closing tag, meant to be rendered as the icon.
 * An HTML parser reads that as an element rather than as text, and an element
 * with no text content contributes nothing to `.text()`: OP06-026 Koushirou's
 * "Set up to 1 of your <Slash> attribute Characters" came out of the pipeline
 * as "…of your attribute Characters", with the word the clause turns on
 * missing. Seven cards in the 2026-08-22 snapshot print one.
 *
 * Escaped back into text *before* the page is parsed rather than repaired
 * afterwards, because parse5 nests everything after an unclosed element inside
 * it -- the rest of the sentence becomes the icon's children, and unwrapping
 * that correctly is more delicate than never creating the element.
 *
 * A closed vocabulary, so a name Bandai has not printed cannot be silently
 * accepted; {@link parseOfficialCards} throws on any element left in printed
 * text once these are gone.
 */
const ATTRIBUTE_ICONS = [
  "Slash",
  "Strike",
  "Ranged",
  "Wisdom",
  "Special",
] as const;

const ATTRIBUTE_ICON_PATTERN = new RegExp(
  `<(${ATTRIBUTE_ICONS.join("|")})>`,
  "g",
);

/** Turn Bandai's `<Slash>` pseudo-tags into the text they are meant to be. */
export const escapeAttributeIcons = (html: string): string =>
  html.replace(ATTRIBUTE_ICON_PATTERN, (_, name: string) => `&lt;${name}&gt;`);

/**
 * Elements a card's printed-text block legitimately contains.
 *
 * `h3` is the field label the page prints inside the same div and `br` is a
 * clause break; `bodyText` removes the first and turns the second into a
 * newline. Anything else is an icon the parse would drop on the floor.
 */
const PRINTED_TEXT_ELEMENTS = new Set(["h3", "br"]);

export const nullableNumber = (value: string): number | null => {
  const normalized = normalize(value);
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
};

/**
 * Bandai's card list renders a printed 0 as "-", the same way it renders a
 * field the card does not print at all: no page in the snapshot contains a
 * literal `0` in Cost or Power. So "-" alone cannot say whether the value is
 * zero or absent, and the card's category can: every non-Leader prints a cost,
 * and every Leader and Character prints a power. Read those as 0 and leave the
 * rest null. The secondary source agrees on each one -- OP04-016 is a 0-cost
 * Event, OP12-028 and OP17-021 are 0-power Characters -- and the per-card
 * comparison in `card-audit.json` is what would catch it if that ever stopped
 * being true. Counter is deliberately excluded: a Character with no Counter
 * prints "-" there, and that is an absent value, not a zero.
 */
export const printedNumber = (value: string, categoryPrintsIt: boolean) =>
  nullableNumber(value) ?? (categoryPrintsIt ? 0 : null);

export const split = (value: string) =>
  normalize(value)
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Printed effect or Trigger text, with the minus sign made canonical.
 *
 * Bandai writes a power or cost penalty with U+2212 MINUS SIGN on 549 prints in
 * the 2026-08-22 snapshot and with an ASCII hyphen on three -- and two of those
 * three are a *second* print of a card whose other print uses the minus, so
 * without this the same identity reads as two different cards and the set
 * import stops on P-017. One glyph of page-authoring inconsistency, not two
 * readings.
 *
 * Applied here rather than in `normalize`, which every field goes through: a
 * card number is `PREFIX-NNN`, and rewriting the hyphen in one of those turns
 * every deck list into cards the registry has never heard of. Narrow even here
 * -- only a hyphen directly before a digit, so a hyphenated name inside the
 * printed text is untouched.
 */
const printedText = ($: CheerioAPI, element: unknown) =>
  bodyText($, element).replace(/-(?=\d)/g, "\u2212");

/** Every card on one card list page. */
export function parseOfficialCards(html: string): OfficialCard[] {
  const $ = load(escapeAttributeIcons(html));
  return $("dl.modalCol")
    .toArray()
    .map((element) => {
      const spans = $(element)
        .find(".infoCol span")
        .toArray()
        .map((span) => normalize($(span).text()));
      const cardNumber = spans[0];
      if (!cardNumber)
        throw new Error("Bandai record is missing a card number");
      // Loud rather than lossy: with the attribute icons escaped above, an
      // element still standing inside the effect or Trigger block is a marker
      // this parse has never seen, and reading the text around it would drop
      // it without saying so. That is exactly how the attribute icons went
      // missing for seven cards across four sets.
      for (const stray of $(element).find(".text, .trigger").find("*")) {
        const tag = stray.tagName.toLowerCase();
        if (PRINTED_TEXT_ELEMENTS.has(tag)) continue;
        throw new Error(
          `${cardNumber}: unknown element <${tag}> in printed text`,
        );
      }
      const category = spans[2] ?? "";
      return {
        cardNumber,
        rarity: spans[1] ?? "",
        category,
        name: normalize($(element).find(".cardName").text()),
        cost: printedNumber(
          bodyText($, $(element).find(".cost").get(0)),
          category !== "LEADER",
        ),
        power: printedNumber(
          bodyText($, $(element).find(".power").get(0)),
          category === "LEADER" || category === "CHARACTER",
        ),
        counter: nullableNumber(
          bodyText($, $(element).find(".counter").get(0)),
        ),
        color: split(bodyText($, $(element).find(".color").get(0))),
        types: split(bodyText($, $(element).find(".feature").get(0))),
        attribute: normalize($(element).find(".attribute i").text()) || null,
        effect: printedText($, $(element).find(".text").get(0)),
        trigger: printedText($, $(element).find(".trigger").get(0)),
      };
    });
}
