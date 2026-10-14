import type { DeckManifest } from "./index.js";

/**
 * OP-16 Red Portgas.D.Ace, a list built for the OP-17 field.
 *
 * Source: supplied as a card list by the project maintainer on 28 Sep 2026,
 * without an event or pilot, which is why it ships as "- Open OPTCG" rather
 * than under a placing. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * Same Leader as `op16-ace-manifest.ts`, so `op16-ace-policy.ts` pilots it
 * unchanged: that policy already ranks OP17-005 and OP17-006 among its Rush
 * targets, and its keep predicate reads OP16-015 and the two 1-cost searchers,
 * all four-ofs here. Where the two lists differ is the move the OP-17 field
 * made away from the feature deck's vanilla bodies:
 *
 * - **No OP13-007, OP16-010 Namule, OP16-016 Ramba or OP16-005 Thatch.** The
 *   fourteen slots go to OP-17 Whitebeard Pirates that carry a clause.
 * - **4 OP17-006 Kingdew**, an 8000 for 7 with a 2000 Counter -- the same Rush
 *   target and reveal as Curiel, and a Counter card when it is not either.
 * - **3 OP17-005 Edward.Newgate**, a 12000 that prices itself at 6 against a
 *   10000-power body and makes a monocolored Leader an 8000 base on its
 *   [On Play].
 * - **2 OP17-016 Rakuyo** and **2 EB01-002 Izo**: a 3-cost [On Play] that K.O.s
 *   two 2000-base Characters, and a 5-cost that gives a rested DON!! and, on the
 *   opponent's attack, trades a card for −2000.
 * - **3 OP10-005 Sanji**, a 3-cost 6000 on its own turn that draws on K.O.
 * - **3 OP17-017 Ga Ha Ha Ha!!**, a 1-cost Counter Event: +2000 to a Whitebeard
 *   Pirate and −2000 on the attacker.
 * - **3 OP16-011 Vista, 3 OP16-014 Marco and 3 OP16-003 Edward.Newgate**, each
 *   down from 4.
 */
export const op16AceOpenManifest: DeckManifest = {
  id: "(Red) Portgas.D.Ace - Open OPTCG",
  format: "standard",
  leader: "OP16-001",
  cards: {
    "OP13-016": 4,
    "OP10-005": 3,
    "OP17-016": 2,
    "OP16-015": 4,
    "OP16-017": 4,
    "EB01-002": 2,
    "OP16-118": 4,
    "OP16-011": 3,
    "OP16-014": 3,
    "OP16-004": 4,
    "OP17-006": 4,
    "OP16-003": 3,
    "OP17-005": 3,
    "OP17-017": 3,
    "OP16-021": 4,
  },
};
