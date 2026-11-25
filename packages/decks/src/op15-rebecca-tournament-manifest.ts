import type { DeckManifest } from "./index.js";

/**
 * Blue Rebecca (OP15-039): the list "Aserty" took to 1st (5-0) at a Store
 * Battle at Canon Cosmo, a 31-player event in Europe on 4 Apr 2026.
 *
 * Source: onepiecetopdecks.com's English OP-15/EB-04 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op15-eb04-deck-list-adventure-on-kamis-island/
 * (entry "Blue Rebecca", 1st Place, SB(5-0), 4/4/2026, whose `deckgen` record
 * carries the whole fifty), retrieved 2026-10-17 and again 2026-11-25. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Rebecca builds the learned
 * model was trained on, played into the meta field on the same seeds, it is
 * the one that model wins most with. Same Leader as "(Blue) Rebecca - Official
 * Feature Deck", which stays on its own shelf unmarked, so the same rules
 * policy pilots both.
 *
 * Against that list it adds 4 OP07-051 Boa Hancock, 2 OP08-046 Shakuyaku, 2
 * OP08-047 Jozu, 2 OP10-049 Sabo and 4 OP14-049 Jinbe. It drops 4 OP15-041
 * Orlumbus, 2 OP10-046 Kyros and 4 OP15-046 Sabo. It changes the count of
 * OP10-060 Barrier-Barrier Pistol 4 to 2 and OP15-051 Monkey.D.Luffy 4 to 2.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op15RebeccaTournamentManifest: DeckManifest = {
  id: "(Blue) Rebecca - 1st Place Store Battle 2026-04-04",
  format: "standard",
  leader: "OP15-039",
  recommended: true,
  cards: {
    "OP07-051": 4,
    "OP08-046": 2,
    "OP08-047": 2,
    "OP10-045": 4,
    "OP10-049": 2,
    "OP10-054": 4,
    "OP10-059": 4,
    "OP10-060": 2,
    "OP14-049": 4,
    "OP15-040": 4,
    "OP15-042": 4,
    "OP15-047": 4,
    "OP15-051": 2,
    "OP15-052": 4,
    "OP15-053": 4,
  },
};
