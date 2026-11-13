import type { DeckManifest } from "./index.js";

/**
 * Red/Black Sabo (OP13-004) in front of the OP-17 Elbaph shell as the EB-05
 * field builds it: the list ranked 10th in TCG Match Making's EB05 Weekly Power
 * Rankings of 12 Nov 2026, drawn from high-rank online play (stats at
 * https://stats.tcgmatchmaking.com/). The post is a power ranking rather than
 * an event's results and names no pilot, so the id carries the ranking and its
 * date rather than a placing.
 *
 * Source: TCG Match Making's "EB05 Weekly Power Rankings - November 12th" post
 * of 12 Nov 2026 on its Patreon, https://www.patreon.com/tcgmatchmaking,
 * retrieved 2026-11-12. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list, over ST-35, which stays on its own
 * shelf unmarked. It replaces "(Red/Black) Sabo - TCG Match Making EB05 #8" as
 * the Leader's Community list -- a shelf carries one list per Leader -- and
 * that list stays a training list in `ml/bridge/decks.ts` under its id. The
 * same rules policy pilots it as ST-35, which shares the Leader. ST01-011 Brook
 * is Standard by its block-4 printing.
 *
 * Against that list It changes the count of EB05-046 Yamato 4 to 2, OP04-016
 * Bad Manners Kick Course 1 to 2, OP15-088 Pirates Docking Six 3 to 4, OP17-119
 * Loki 3 to 4 and ST01-011 Brook 3 to 2.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op13SaboTcgmmManifest: DeckManifest = {
  id: "(Red/Black) Sabo - TCG Match Making EB05 2026-11-12 #10",
  format: "standard",
  leader: "OP13-004",
  recommended: true,
  cards: {
    "EB05-046": 2,
    "EB05-047": 4,
    "OP04-016": 2,
    "OP15-088": 4,
    "OP17-080": 4,
    "OP17-082": 4,
    "OP17-083": 2,
    "OP17-084": 2,
    "OP17-086": 2,
    "OP17-087": 4,
    "OP17-089": 4,
    "OP17-093": 4,
    "OP17-095": 4,
    "OP17-096": 2,
    "OP17-119": 4,
    "ST01-011": 2,
  },
};
