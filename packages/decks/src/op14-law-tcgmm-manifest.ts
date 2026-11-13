import type { DeckManifest } from "./index.js";

/**
 * Red Trafalgar Law (OP14-001) as the EB-05 field builds it: the list ranked
 * 8th in TCG Match Making's EB05 Weekly Power Rankings of 12 Nov 2026, drawn
 * from high-rank online play (stats at https://stats.tcgmatchmaking.com/). The
 * post is a power ranking rather than an event's results and names no pilot, so
 * the id carries the ranking and its date rather than a placing.
 *
 * Source: TCG Match Making's "EB05 Weekly Power Rankings - November 12th" post
 * of 12 Nov 2026 on its Patreon, https://www.patreon.com/tcgmatchmaking,
 * retrieved 2026-11-12. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list, over Bandai's feature deck, which
 * stays on its own shelf unmarked. It replaces "(Red) Trafalgar Law - 9th Place
 * ChinoizeCup #125" as the Leader's Community list -- a shelf carries one list
 * per Leader -- and that list stays a training list in `ml/bridge/decks.ts`
 * under its id. `op14-law-policy.ts` pilots it.
 *
 * Against that list it adds 2 EB04-005 Trafalgar Law, 1 OP09-118 Gol.D.Roger, 1
 * OP10-019 Divine Departure, 2 OP14-005 Killer, 2 OP14-007 Jewelry Bonney, 4
 * OP14-015 Roronoa Zoro and 2 OP15-009 Koby. It drops 2 OP09-009 Benn.Beckman,
 * 2 OP13-007 Ace & Sabo & Luffy and 2 OP14-006 Shachi & Penguin. It changes the
 * count of EB05-006 Miss Buckingham Stussy 4 to 2, OP14-004 Cavendish 4 to 2,
 * OP14-009 Trafalgar Law 3 to 4, OP14-010 Basil Hawkins 4 to 2, OP14-011
 * Bartolomeo 4 to 3, OP14-014 Eustass"Captain"Kid 2 to 4, OP14-019 I Have a
 * Plan to Take Down One of the Four Emperors!! 4 to 2 and PRB02-003 Lucky.Roux
 * 4 to 2.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op14LawTcgmmManifest: DeckManifest = {
  id: "(Red) Trafalgar Law - TCG Match Making EB05 2026-11-12 #8",
  format: "standard",
  leader: "OP14-001",
  recommended: true,
  cards: {
    "EB04-005": 2,
    "EB05-001": 4,
    "EB05-006": 2,
    "OP09-118": 1,
    "OP10-019": 1,
    "OP14-002": 4,
    "OP14-004": 2,
    "OP14-005": 2,
    "OP14-007": 2,
    "OP14-009": 4,
    "OP14-010": 2,
    "OP14-011": 3,
    "OP14-013": 4,
    "OP14-014": 4,
    "OP14-015": 4,
    "OP14-019": 2,
    "OP15-009": 2,
    "OP17-005": 3,
    "PRB02-003": 2,
  },
};
