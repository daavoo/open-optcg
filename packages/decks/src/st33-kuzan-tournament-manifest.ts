import type { DeckManifest } from "./index.js";

/**
 * Blue Kuzan, the competitive build of the ST-33 deck: the list that went 5-0
 * and took 1st at a Bandai-hosted event in Hiroshima on 18 Jul 2026, pilot
 * handle "Kuru".
 *
 * Source: onepiecetopdecks.com's Japan OP-16 deck-list page, retrieved 8 Oct
 * 2026, whose `deckgen` link for the entry (`hs=Bandai(hiroshima)`,
 * `tn=FS EX`) encodes the whole 50 as machine-readable card counts. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * Why this list and not an OP-17 one: neither the English OP-17 page (through
 * 6 Oct 2026) nor the Japan one (through 9 Sep) carries a Kuzan placing, and
 * no other aggregator reachable from here does either. The newest results are
 * eleven 1st-place lists from July and August 2026, all built after ST-33
 * landed, and every identity in them is Standard-legal under OP-17. They
 * agree closely: OP06-050, ST33-001, ST33-003, ST33-004, ST33-005, OP12-047,
 * OP12-044, EB04-022 and EB04-028 are in all eleven, most of them at four. This
 * one is the third-nearest of the eleven to their per-card mean, and the
 * nearest from an event Bandai ran itself.
 *
 * Same Leader as the ST-33 precon, so `st33-policy.ts` pilots it unchanged.
 * Where the two lists differ is what the field built the starter into:
 *
 * - **4 OP06-050 Tashigi.** A 1-cost that looks at five for a {Navy} card,
 *   with no hand cost, so it is the opener the precon lacks.
 * - **4 EB04-022 Issho and 3 OP12-044 Sakazuki** replace the precon's vanilla
 *   bodies (Jango, Jaguar.D.Saul, Fullbody). Issho's two-card trash strips two
 *   cards from a six-card hand and both trashes refund through the Leader;
 *   Sakazuki draws two and gives a rested DON!! every turn for a trash.
 * - **4 OP16-056 Mr.3** and **3 OP12-051 Hina**: a 4-cost that trashes itself
 *   to draw two and stop an attacker, and a 3-cost that switches off a
 *   Blocker. Mr.3 is the one non-{Navy} card, so the searchers never find it.
 * - **2 OP12-056 Monkey.D.Garp and 1 OP06-043 Aramaki** are the top end, an
 *   8-cost that brings a second blue {Navy} body with it and an 8000 Blocker.
 * - **3 Ice Block** rather than four, and **1 OP06-058 Gravity Blade Raging
 *   Tiger** beside three Ice Time: two removal Events where the precon ran
 *   four of the lock alone.
 * - **No Bluegrass, ST33-002 Sakazuki or Zephyr.** Smoker is the one
 *   bottoming body, at four.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const st33KuzanTournamentManifest: DeckManifest = {
  id: "(Blue) Kuzan - 1st Place Bandai Hiroshima",
  format: "standard",
  leader: "OP12-040",
  cards: {
    "OP06-050": 4,
    "ST33-001": 4,
    "ST33-003": 4,
    "OP12-047": 4,
    "OP12-051": 3,
    "OP16-056": 4,
    "EB04-022": 4,
    "OP12-043": 2,
    "ST33-004": 4,
    "ST33-005": 4,
    "OP12-044": 3,
    "OP06-043": 1,
    "OP12-056": 2,
    "OP12-057": 3,
    "EB04-028": 3,
    "OP06-058": 1,
  },
};
