import type { DeckManifest } from "./index.js";

/**
 * Green Jinbe (OP11-021): the list pilot "JinbeEnjoyerNr1" took to 1st, 4-0, at
 * a Shop Event in North America on 16 Sep 2026.
 *
 * Source: onepiecetopdecks.com's English OP-17 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/
 * (entry "G Jinbe", 1st (4-0), ShopEvent, 9/16/2026), retrieved 2026-10-31.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Jinbe builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. Same Leader as "(Green) Jinbe - Official Feature Deck", so the
 * same rules policy pilots both.
 *
 * Against that list it adds 4 EB04-015 Jinbe, 4 EB04-018 Megalo, 4 EB04-020
 * Shark Brick Fist, 3 OP06-033 Vander Decken IX, 3 OP07-026 Jewelry Bonney, 2
 * OP14-031 Nami, 2 OP15-023 Arlong, 4 OP15-032 Brook, 3 OP17-022 Shanks, 4
 * OP17-029 Hongo. It drops 4 OP06-035 Hody Jones, 4 OP10-030 Smoker, 4 OP10-032
 * Tashigi, 4 OP11-024 Aladine, 2 OP11-029 Charlotte Praline, 4 OP11-032 Surume,
 * 4 OP11-033 Bird Neptunian, 4 OP11-038 Gum-Gum Elephant Gatling. It changes
 * the count of OP11-035 Fisher Tiger 4 to 1.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op11JinbeTournamentManifest: DeckManifest = {
  id: "(Green) Jinbe - 1st Place Shop Event 2026-09-16",
  format: "standard",
  leader: "OP11-021",
  recommended: true,
  cards: {
    "EB04-015": 4,
    "EB04-018": 4,
    "EB04-020": 4,
    "OP06-025": 4,
    "OP06-033": 3,
    "OP07-026": 3,
    "OP11-030": 4,
    "OP11-031": 4,
    "OP11-035": 1,
    "OP11-039": 4,
    "OP14-031": 2,
    "OP15-023": 2,
    "OP15-032": 4,
    "OP17-022": 3,
    "OP17-029": 4,
  },
};
