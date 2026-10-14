import type { DeckManifest } from "./index.js";

/**
 * OP-17 Blue Rocks D. Xebec, a second list beside Bandai's feature deck.
 *
 * Source: supplied as a card list by the project maintainer on 28 Sep 2026,
 * without an event or pilot, which is why it ships as "- Open OPTCG" rather
 * than under a placing. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * Same Leader as `op17-xebec-manifest.ts`, so `op17-xebec-policy.ts` pilots it
 * unchanged: its keep predicate reads a cheap Character and one of the two
 * 0-cost Events, both four-ofs here. Against the feature deck:
 *
 * - **No OP17-057 Fullalead.** The Stage's four slots go to three OP08-051
 *   Buckin and a fourth copy of the cheap bodies. Buckin's printed type is
 *   "Former Rocks Pirates", so it answers to no {Rocks Pirates} clause -- not
 *   the Leader's reveal, not OP17-118's deploy. What it is instead is a 1-cost
 *   body, beside four OP17-050 Streusen, for the early turns.
 * - **4 OP17-050 Streusen, 4 OP17-045 Kyo and 3 OP17-052 Don Marlon**, up from
 *   two each: a lower curve of the cheap draw bodies.
 * - **2 OP17-042 Kaido and 2 OP17-044 Captain John**, down from four each.
 */
export const op17XebecOpenManifest: DeckManifest = {
  id: "(Blue) Rocks.D.Xebec - Open OPTCG",
  format: "standard",
  leader: "OP17-039",
  cards: {
    "OP08-051": 3,
    "OP17-050": 4,
    "OP17-045": 4,
    "OP17-052": 3,
    "OP17-054": 4,
    "OP17-042": 2,
    "OP17-044": 2,
    "OP17-046": 4,
    "OP17-049": 4,
    "OP17-040": 4,
    "OP17-048": 4,
    "OP17-118": 4,
    "OP17-055": 4,
    "OP17-056": 4,
  },
};
