import type { DeckManifest } from "./index.js";

/**
 * Red/Blue Nefeltari Vivi (EB03-001): the list Jorge Recabal took to 1st, 4-0,
 * at a Store Battle in Chile on 28 May 2026. The same fifty also placed 21st at
 * the Lille Regional on 11 Apr 2026, on Limitless TCG's offline results.
 *
 * Source: onepiecetopdecks.com's English OP-15/EB-04 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op15-eb04-deck-list-adventure-on-kamis-island/
 * (entry "Vivi", 1st Place, SB(4-0), 5/28/2026), retrieved 2026-10-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Nefeltari Vivi builds in the
 * learned model's training pool it is the one that model wins most with against
 * the meta field. Same Leader as "(Red/Blue) Nefeltari Vivi - Official Feature
 * Deck", so the same rules policy pilots both.
 *
 * Against that list it adds 2 EB04-007 Roronoa Zoro, 3 EB04-023 Chaka & Pell, 4
 * EB04-024 Terracotta, 1 OP05-118 Kaido, 1 OP06-058 Gravity Blade Raging Tiger,
 * 3 OP08-118 Silvers Rayleigh, 4 OP10-045 Cavendish, 4 OP11-054 Nami, 2
 * OP13-058 Phoenix Pyreapple, 4 ST23-001 Uta. It drops 4 OP13-007 Ace & Sabo &
 * Luffy, 4 EB03-025 Hina, 4 OP13-011 Nefeltari Cobra, 2 OP13-054 Yamato, 4
 * EB03-026 Boa Hancock, 4 EB03-027 Marguerite, 4 EB03-011 But If We Ever See
 * Each Other Again... Will You Call Me Your Shipmate?!!. It changes the count
 * of EB03-006 Nami 4 to 3, OP06-007 Shanks 4 to 3.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const eb03ViviTournamentManifest: DeckManifest = {
  id: "(Red/Blue) Nefeltari Vivi - 1st Place Store Battle 2026-05-28",
  format: "standard",
  leader: "EB03-001",
  recommended: true,
  cards: {
    "EB03-006": 3,
    "EB03-024": 4,
    "EB04-007": 2,
    "EB04-023": 3,
    "EB04-024": 4,
    "OP05-118": 1,
    "OP06-007": 3,
    "OP06-058": 1,
    "OP08-118": 3,
    "OP09-009": 4,
    "OP10-011": 4,
    "OP10-045": 4,
    "OP11-054": 4,
    "OP13-012": 4,
    "OP13-058": 2,
    "ST23-001": 4,
  },
};
