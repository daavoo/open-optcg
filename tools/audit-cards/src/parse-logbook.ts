import { load } from "cheerio";
import { CLAUSE_MARKERS } from "@one-piece-sim/cards";
import { normalize } from "./block-icons.js";
import type { OfficialCard } from "./parse-cardlist.js";

/**
 * One card as a Logbook (https://logbook-optcg.com) card page prints it.
 *
 * The provisional source for a set Bandai has announced but not yet listed:
 * Logbook publishes an English rendering of the Japanese card the week it is
 * revealed. It is a fan translation, so the record it yields is never
 * `sourceMatch: true`, and the set it feeds is replaced wholesale by the
 * Bandai page once there is one.
 *
 * Logbook marks a keyword the way Bandai marks an attribute, `<Rush>`; Bandai
 * prints the keyword in square brackets. Rewritten here so the rules
 * derivation reads the same clause markers off either source. The attribute
 * names keep their angle brackets, as Bandai's own text does.
 *
 * Logbook also writes a timing marker in sentence case now and then
 * ("[When attacking]"). Clause markers are matched literally, so the marker is
 * put back in the casing Bandai prints; a card name in brackets is left alone.
 */
const ATTRIBUTES = new Set(["Slash", "Strike", "Ranged", "Wisdom", "Special"]);

const MARKER_BY_LOWER_CASE = new Map<string, string>(
  CLAUSE_MARKERS.map((marker) => [marker.toLowerCase(), marker]),
);

const printed = (text: string) =>
  normalize(text)
    .replace(/<([A-Za-z.' ]+)>/g, (whole, name: string) =>
      ATTRIBUTES.has(name) ? whole : `[${name}]`,
    )
    .replace(
      /\[[^\]]+\]/g,
      (marker) => MARKER_BY_LOWER_CASE.get(marker.toLowerCase()) ?? marker,
    )
    .replace(/-(?=\d)/g, "−");

const CATEGORIES = new Set(["Leader", "Character", "Event", "Stage"]);

export function parseLogbookCard(html: string): OfficialCard {
  const $ = load(html);
  const stats = new Map(
    $("dl.sp-stats > div")
      .toArray()
      .map((row) => [normalize($(row).find("dt").text()), $(row).find("dd")]),
  );
  const stat = (label: string) => normalize(stats.get(label)?.text());
  const numeric = (label: string) => {
    const digits = stat(label).replace(/[+,]/g, "");
    return /^\d+$/.test(digits) ? Number(digits) : null;
  };
  const cardNumber = stat("Card number");
  const category = stat("Type");
  if (!/^OP\d{2}-\d{3}$/.test(cardNumber))
    throw new Error(`Logbook page has no card number: ${cardNumber}`);
  if (!CATEGORIES.has(category))
    throw new Error(`${cardNumber}: unknown Logbook category ${category}`);
  const effectBlock = $(".sp-effect").clone();
  effectBlock.find("h2").remove();
  const triggerBlock = effectBlock.find("p.sp-trigger").remove();
  effectBlock.find("br").replaceWith(" ");
  return {
    cardNumber,
    rarity: stat("Rarity"),
    category: category.toUpperCase(),
    name: normalize($("h1").clone().children(".code").remove().end().text()),
    // Bandai's list prints a Leader's Life in the Cost column; the audit
    // records it there for every other set, so this one does too.
    cost: category === "Leader" ? numeric("Life") : (numeric("Cost") ?? 0),
    power:
      category === "Leader" || category === "Character"
        ? (numeric("Power") ?? 0)
        : null,
    counter: numeric("Counter"),
    color: stat("Colour").split(" ").filter(Boolean),
    types: stat("Types")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean),
    attribute: stat("Attribute").replace(/ \/ /g, "/") || null,
    effect: printed(effectBlock.text()),
    trigger: printed(triggerBlock.text()),
  };
}
