import type { DeckManifest } from "./index.js";

/**
 * Red/Black Sabo (OP13-004) in front of the OP-17 Elbaph shell as the EB-05
 * field builds it: the Red/Black Sabo list in TCG Match Making's EB05 Weekly
 * Power Rankings of 5 Nov 2026, drawn from high-rank online play (stats at
 * https://stats.tcgmatchmaking.com/). The post is a power ranking rather than
 * an event's results and names no pilot, so the id carries the source and the
 * format rather than a placing.
 *
 * Source: TCG Match Making's "EB05 Weekly Power Rankings - November 5th" post
 * of 5 Nov 2026 on its Patreon, https://www.patreon.com/tcgmatchmaking,
 * retrieved 2026-11-09. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it. ST01-011 Brook is Standard by
 * its block-4 printing.
 *
 * It is the Leader's `recommended` list. It replaces "(Red/Black) Sabo - 1st
 * Place PlayTCG EGB 2026-09-20" as the Leader's Community list -- a shelf
 * carries one list per Leader -- and that list stays a training list in
 * `ml/bridge/decks.ts` under its id. The same rules policy pilots both, and
 * ST-35 shares the Leader.
 *
 * Against that list it adds 4 EB05-046 Yamato, 4 EB05-047 Ripley. It drops 2
 * EB04-007 Roronoa Zoro, 2 OP13-007 Ace & Sabo & Luffy, 2 OP14-096 Ground
 * Death. It changes the count of OP04-016 Bad Manners Kick Course 2 to 1,
 * OP15-088 Pirates Docking Six 4 to 3, OP17-084 Tony Tony.Chopper 3 to 2,
 * OP17-087 Nico Robin 3 to 4, OP17-093 Monkey.D.Luffy 3 to 4, OP17-119 Loki 4
 * to 3.
 *
 * EB05-047 Ripley is a third giant: it gains +12 cost like OP17-089
 * Jaguar.D.Saul, so it meets the Leader's cost-8 aura and the Elbaph bodies'
 * cost-12 line from a 4-cost slot.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op13SaboTcgmmManifest: DeckManifest = {
  id: "(Red/Black) Sabo - TCG Match Making EB05",
  format: "standard",
  leader: "OP13-004",
  recommended: true,
  cards: {
    "EB05-046": 4,
    "EB05-047": 4,
    "OP04-016": 1,
    "OP15-088": 3,
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
    "OP17-119": 3,
    "ST01-011": 3,
  },
};
