import type { DeckManifest } from "./index.js";

/**
 * Red Trafalgar Law (OP14-001): the list a player named "Kuranoo Narumi"
 * built on TCGplayer's deck dashboard on 26 Oct 2026, which Peter Day embedded
 * as #2 in "6 One Piece Decks that Get Way Better with Heroines Edition Vol.2
 * (EB-05)", published 28 Oct 2026. It is an article list, not an event
 * placing: the deck record carries no event, record or placing.
 *
 * Source: TCGplayer,
 * https://www.tcgplayer.com/content/article/6-One-Piece-Decks-that-Get-Way-Better-with-Heroines-Edition-Vol-2-EB-05/43bf2e6d-3dc8-4abd-8930-eb84f43e3c2f/
 * (section "#2 Red Law", deck embed 552059, whose record carries the whole
 * fifty as card counts), retrieved 2026-11-25. Every identity is stamped from
 * Bandai's cardlist pages already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Trafalgar Law builds the
 * learned model was trained on, played into the meta field on the same seeds,
 * it is the one that model wins most with, ahead of "(Red) Trafalgar Law - TCG
 * Match Making EB05 2026-11-12 #8", which it replaces on the shelf -- a shelf
 * carries one list per Leader -- and which stays a training-only list in
 * `ml/bridge/decks.ts` under its id. Bandai's feature deck stays on its own
 * shelf unmarked. `op14-law-policy.ts` pilots it.
 *
 * Against the TCG Match Making list it drops 2 EB04-005 Trafalgar Law, 1
 * OP10-019 Divine Departure, 2 OP14-005 Killer and 2 OP14-007 Jewelry Bonney,
 * and changes the count of OP14-010 Basil Hawkins 2 to 4, OP14-011 Bartolomeo
 * 3 to 4, OP14-015 Roronoa Zoro 4 to 2, OP14-019 I Have a Plan to Take Down
 * One of the Four Emperors!! 2 to 4, OP15-009 Koby 2 to 4 and PRB02-003
 * Lucky.Roux 2 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op14LawTcgplayerManifest: DeckManifest = {
  id: "(Red) Trafalgar Law - TCGplayer EB-05 Heroines Vol.2",
  format: "standard",
  leader: "OP14-001",
  recommended: true,
  cards: {
    "EB05-001": 4,
    "EB05-006": 2,
    "OP09-118": 1,
    "OP14-002": 4,
    "OP14-004": 2,
    "OP14-009": 4,
    "OP14-010": 4,
    "OP14-011": 4,
    "OP14-013": 4,
    "OP14-014": 4,
    "OP14-015": 2,
    "OP14-019": 4,
    "OP15-009": 4,
    "OP17-005": 3,
    "PRB02-003": 4,
  },
};
