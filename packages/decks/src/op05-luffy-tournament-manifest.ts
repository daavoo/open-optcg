import type { DeckManifest } from "./index.js";

/**
 * Purple Monkey.D.Luffy (OP05-060): the list pilot "Desaparecido" took to 1st,
 * 5-0, at a Store Battle in Italy on 1 Jul 2025.
 *
 * Source: onepiecetopdecks.com's English EB-02 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-eb-02-deck-list-anime-25th-collection/
 * (entry "Purple Luffy", 1st Place, SB(5-0), 7/1/2025), retrieved 2026-10-17.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Monkey.D.Luffy builds in the
 * learned model's training pool it is the one that model wins most with against
 * the meta field. Same Leader as "(Purple) Monkey.D.Luffy - Starter Deck 18",
 * so the same rules policy pilots both.
 *
 * Against that list it adds 4 EB01-061 Mr.2.Bon.Kurei(Bentham), 1 OP03-072
 * Gum-Gum Jet Gatling, 1 OP05-077 Gamma Knife, 4 OP06-076 Hitokiri Kamazo, 4
 * OP07-064 Sanji, 4 OP09-065 Sanji, 4 OP09-069 Trafalgar Law, 4 OP09-078
 * Gum-Gum Giant, 3 OP09-119 Monkey.D.Luffy, 4 OP11-067 Charlotte Katakuri, 1
 * ST26-002 Tony Tony.Chopper. It drops 4 OP05-061 Uso-Hachi, 4 OP05-063 O-Robi,
 * 4 OP05-066 Jinbe, 4 OP05-067 Zoro-Juurou, 4 OP05-068 Chopa-Emon, 4 OP05-070
 * Fra-Nosuke, 4 OP05-072 Hone-Kichi, 4 OP05-076 When You're at Sea You Fight
 * against Pirates!!, 4 P-041 Monkey.D.Luffy. It changes the count of ST18-001
 * Uso-Hachi 2 to 4, ST18-002 O-Nami 4 to 2, ST18-003 San-Gorou 4 to 3, ST18-004
 * Zoro-Juurou 2 to 4, ST18-005 Luffy-Tarou 2 to 3.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op05LuffyTournamentManifest: DeckManifest = {
  id: "(Purple) Monkey.D.Luffy - 1st Place Store Battle 2025-07-01",
  format: "standard",
  leader: "OP05-060",
  recommended: true,
  cards: {
    "EB01-061": 4,
    "OP03-072": 1,
    "OP05-077": 1,
    "OP06-076": 4,
    "OP07-064": 4,
    "OP09-065": 4,
    "OP09-069": 4,
    "OP09-078": 4,
    "OP09-119": 3,
    "OP11-067": 4,
    "ST18-001": 4,
    "ST18-002": 2,
    "ST18-003": 3,
    "ST18-004": 4,
    "ST18-005": 3,
    "ST26-002": 1,
  },
};
