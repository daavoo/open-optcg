import type { DeckManifest } from "./index.js";

/**
 * Yellow Eustass"Captain"Kid (OP10-099): the list "Enderu" took to 1st (6-0)
 * at ChinoizeCup #94, an online OPTCGSim event of 61 played on Monday 10 Aug
 * 2026.
 *
 * Source: onepiecetopdecks.com's English OP-16 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/
 * (entry "Yellow Kid", 1st (6-0), optcgsim, ChinoizeCup, 8/10/2026, whose
 * `deckgen` record carries the whole fifty), retrieved 2026-10-17 and again
 * 2026-11-25. Limitless TCG's standings for the event,
 * https://play.limitlesstcg.com/tournament/6a72eef32b308b6067b4a76b/standings,
 * confirm the pilot, the Leader and the 6-0 first place. Every identity is
 * stamped from Bandai's cardlist pages already, so the audit needs no entry
 * for it.
 *
 * It is the Leader's `recommended` list: of the Eustass"Captain"Kid builds the
 * learned model was trained on, played into the meta field on the same seeds,
 * it is the one that model wins most with, ahead of "(Yellow) Eustass Kid -
 * ChinoizeCup #104", which it replaces on the shelf and which stays a
 * training-only list in `ml/bridge/decks.ts`. Same Leader as "(Yellow) Eustass
 * Kid - Starter Deck 36", so the same rules policy pilots both.
 *
 * Against the ChinoizeCup #104 list it adds 1 EB04-059 Black Rope Dragon
 * Twister, 2 OP06-104 Kikunojo, 4 OP10-109 Basil Hawkins, 4 OP10-111
 * Monkey.D.Luffy, 2 OP10-119 Trafalgar Law, 4 OP11-106 Zeus, 3 OP15-105
 * Jewelry Bonney, 2 ST36-001 Cavendish and 4 ST36-004 Bartolomeo. It drops the
 * Thriller Bark package -- 4 OP14-102 Kumacy, 4 OP14-110 Dr. Hogback, 4
 * OP14-111 Perona -- and 3 OP15-119 Monkey.D.Luffy, 4 OP17-109 Charlotte
 * Pudding, 3 OP17-114 Sweet 3 Generals and 4 P-088 Trafalgar Law.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op10KidChinoizeManifest: DeckManifest = {
  id: "(Yellow) Eustass Kid - 1st Place ChinoizeCup #94",
  format: "standard",
  leader: "OP10-099",
  recommended: true,
  cards: {
    "EB04-058": 4,
    "EB04-059": 1,
    "OP06-104": 2,
    "OP10-109": 4,
    "OP10-111": 4,
    "OP10-112": 4,
    "OP10-119": 2,
    "OP11-106": 4,
    "OP15-105": 3,
    "OP16-119": 4,
    "ST36-001": 2,
    "ST36-002": 4,
    "ST36-003": 4,
    "ST36-004": 4,
    "ST36-005": 4,
  },
};
