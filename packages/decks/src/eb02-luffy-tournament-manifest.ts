import type { DeckManifest } from "./index.js";

/**
 * Green/Purple Monkey.D.Luffy (EB02-010): the list pilot "AndreDreReal" took to
 * 1st, 5-0, at a Store Championship (USA) on 25 Apr 2026.
 *
 * Source: onepiecetopdecks.com's English OP-15/EB-04 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op15-eb04-deck-list-adventure-on-kamis-island/
 * (entry "GP Luffy", 1st Place, StoreCS(5-0), 4/25/2026), retrieved 2026-10-17.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Monkey.D.Luffy builds in the
 * learned model's training pool it is the one that model wins most with against
 * the meta field. Same Leader as "(Green/Purple) Monkey.D.Luffy - Official
 * Feature Deck", so the same rules policy pilots both.
 *
 * Against that list it adds 4 OP07-064 Sanji, 4 OP08-036 Electrical Luna, 4
 * OP09-078 Gum-Gum Giant, 2 OP12-037 Demon Aura Nine Sword Style Asura Blades
 * Drawn Dead Man's Game, 2 OP13-040 I Know You're Strong... So I'll Go All Out
 * from the Very Start!!!, 2 OP13-118 Monkey.D.Luffy, 2 OP14-031 Nami, 2
 * OP15-032 Brook, 4 OP15-078 Mamaragan, 1 P-111 Nico Robin, 2 PRB02-005
 * Monkey.D.Luffy, 4 PRB02-012 Nami. It drops 4 EB02-019 Roronoa Zoro, 4
 * EB02-037 Franky, 4 EB02-041 Merry Go, 2 OP03-072 Gum-Gum Jet Gatling, 4
 * OP05-061 Uso-Hachi, 4 OP05-070 Fra-Nosuke, 4 OP05-076 When You're at Sea You
 * Fight against Pirates!!, 4 ST18-005 Luffy-Tarou. It changes the count of
 * EB02-061 Monkey.D.Luffy 4 to 1.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const eb02LuffyTournamentManifest: DeckManifest = {
  id: "(Green/Purple) Monkey.D.Luffy - 1st Place Store Championship 2026-04-25",
  format: "standard",
  leader: "EB02-010",
  recommended: true,
  cards: {
    "EB02-017": 4,
    "EB02-035": 4,
    "EB02-061": 1,
    "OP07-064": 4,
    "OP08-036": 4,
    "OP09-078": 4,
    "OP12-037": 2,
    "OP13-040": 2,
    "OP13-118": 2,
    "OP14-031": 2,
    "OP15-032": 2,
    "OP15-078": 4,
    "P-111": 1,
    "PRB02-005": 2,
    "PRB02-012": 4,
    "ST18-001": 4,
    "ST18-004": 4,
  },
};
