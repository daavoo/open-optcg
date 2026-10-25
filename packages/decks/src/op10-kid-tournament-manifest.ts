import type { DeckManifest } from "./index.js";

/**
 * Yellow Eustass"Captain"Kid (OP10-099): the list pilot "Ssjrose" registered
 * for [OP17] ChinoizeCup #104, an online event of 64 played on Tuesday 1 Sep
 * 2026; the pilot dropped at 0-2, so the list has no placing.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6a8f03677a62de813013f933/standings,
 * whose API carries the whole fifty as card counts, retrieved 2026-10-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Eustass"Captain"Kid builds in
 * the learned model's training pool it is the one that model wins most with
 * against the meta field. Same Leader as "(Yellow) Eustass Kid - Starter Deck
 * 36", so the same rules policy pilots both.
 *
 * Against that list it adds 4 EB04-058 Borsalino, 4 OP10-112
 * Eustass"Captain"Kid, 4 OP14-102 Kumacy, 4 OP14-110 Dr. Hogback, 4 OP14-111
 * Perona, 3 OP15-119 Monkey.D.Luffy, 4 OP16-119 Marshall.D.Teach, 4 OP17-109
 * Charlotte Pudding, 3 OP17-114 Sweet 3 Generals. It drops 4 ST36-001
 * Cavendish, 4 ST36-004 Bartolomeo, 4 OP13-116 The One Who Is the Most Free Is
 * the Pirate King!!!, 4 OP10-101 Urouge, 4 OP10-103 Capone"Gang"Bege, 4
 * OP10-109 Basil Hawkins, 4 OP10-111 Monkey.D.Luffy, 4 P-085 Jewelry Bonney, 4
 * OP12-113 Roronoa Zoro, 4 OP10-114 X.Drake. It changes the count of ST36-002
 * Killer 2 to 4, ST36-003 Scratchmen Apoo 2 to 4, ST36-005 Eustass"Captain"Kid
 * 2 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op10KidTournamentManifest: DeckManifest = {
  id: "(Yellow) Eustass Kid - ChinoizeCup #104",
  format: "standard",
  leader: "OP10-099",
  recommended: true,
  cards: {
    "EB04-058": 4,
    "OP10-112": 4,
    "OP14-102": 4,
    "OP14-110": 4,
    "OP14-111": 4,
    "OP15-119": 3,
    "OP16-119": 4,
    "OP17-109": 4,
    "OP17-114": 3,
    "P-088": 4,
    "ST36-002": 4,
    "ST36-003": 4,
    "ST36-005": 4,
  },
};
