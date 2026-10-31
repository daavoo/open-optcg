import type { DeckManifest } from "./index.js";

/**
 * Purple/Black Monkey.D.Luffy (OP09-061): the list pilot "Ivan" took to 1st,
 * 4-0, at a 2v2 event at GeeklogiaShop in Spain on 13 Jun 2025.
 *
 * Source: onepiecetopdecks.com's English EB-02 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-eb-02-deck-list-anime-25th-collection/
 * (entry "Yonko Luffy", 1st Place, 2v2(4-0), 6/13/2025), retrieved 2026-10-31.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is still a Standard fifty after block 1 left on 1 Apr 2026: its one
 * block-1 card, OP03-072 Gum-Gum Jet Gatling, is among the card numbers
 * Bandai's block number update moved to block 4.
 *
 * It is the Leader's `recommended` list: of the Monkey.D.Luffy builds in the
 * learned model's training pool it is the one that model wins most with against
 * the meta field. Same Leader as "(Purple/Black) Monkey.D.Luffy - Starter Deck
 * 26", so the same rules policy pilots both.
 *
 * Against that list it adds 2 EB02-061 Monkey.D.Luffy, 1 OP03-072 Gum-Gum Jet
 * Gatling, 4 OP05-076 When You're at Sea You Fight against Pirates!!, 4
 * OP07-064 Sanji, 3 OP09-065 Sanji, 4 OP09-069 Trafalgar Law, 4 OP09-072
 * Franky, 2 OP09-119 Monkey.D.Luffy, 3 OP11-067 Charlotte Katakuri, 4 ST18-001
 * Uso-Hachi, 3 ST18-002 O-Nami. It drops 4 OP05-065 San-Gorou, 4 OP05-066
 * Jinbe, 4 OP05-070 Fra-Nosuke, 4 OP09-063 Usopp, 4 OP09-070 Nami, 4 OP09-077
 * Gum-Gum Lightning, 4 ST14-010 Brook, 4 ST26-001 Soba Mask, 4 ST26-002 Tony
 * Tony.Chopper, 4 ST26-004 General Franky. It changes the count of OP09-078
 * Gum-Gum Giant 2 to 4, ST26-003 Nico Robin 2 to 4, ST26-005 Monkey.D.Luffy 2
 * to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op09LuffyTournamentManifest: DeckManifest = {
  id: "(Purple/Black) Monkey.D.Luffy - 1st Place 2v2 2025-06-13",
  format: "standard",
  leader: "OP09-061",
  recommended: true,
  cards: {
    "EB02-061": 2,
    "OP03-072": 1,
    "OP05-076": 4,
    "OP07-064": 4,
    "OP09-065": 3,
    "OP09-069": 4,
    "OP09-072": 4,
    "OP09-076": 4,
    "OP09-078": 4,
    "OP09-119": 2,
    "OP11-067": 3,
    "ST18-001": 4,
    "ST18-002": 3,
    "ST26-003": 4,
    "ST26-005": 4,
  },
};
