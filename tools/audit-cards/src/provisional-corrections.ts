import type { OfficialCard } from "./parse-cardlist.js";

/**
 * Printed numbers the provisional source gets wrong, corrected by name.
 *
 * Logbook is one fan rendering among several. Where it stands alone against
 * the Japanese transcription (Tier One, `tierone/op18-card-list.html` in the
 * snapshot) *and* another English rendering (egman or Limitless), the
 * majority is taken here, field by field. Only printed numbers and colours
 * are corrected: the clause markers and the rules text are left as Logbook
 * prints them, because where the renderings disagree on those, the English
 * sources agree with each other against the Japanese and there is no primary
 * text to settle it.
 *
 * Every row states the value it expects to replace, so a Logbook page that
 * changes under it stops the audit instead of being overwritten silently. The
 * table goes when Bandai lists the set.
 */
interface Correction {
  field: "counter" | "color";
  from: OfficialCard["counter"] | OfficialCard["color"];
  to: OfficialCard["counter"] | OfficialCard["color"];
  /** Which sources the corrected value is taken from. */
  agreed: string;
}

export const PROVISIONAL_CORRECTIONS: Readonly<Record<string, Correction>> = {
  "OP18-093": {
    field: "counter",
    from: null,
    to: 2000,
    agreed: "Tier One, egman and Limitless",
  },
  "OP18-095": {
    field: "color",
    from: ["Red", "Black"],
    to: ["Black"],
    agreed: "Tier One and Limitless",
  },
};

export function applyProvisionalCorrection(card: OfficialCard): OfficialCard {
  const correction = PROVISIONAL_CORRECTIONS[card.cardNumber];
  if (!correction) return card;
  if (
    JSON.stringify(card[correction.field]) !== JSON.stringify(correction.from)
  )
    throw new Error(
      `${card.cardNumber}: provisional correction expects ${correction.field} ${JSON.stringify(correction.from)}, the page now prints ${JSON.stringify(card[correction.field])}`,
    );
  return { ...card, [correction.field]: correction.to };
}
