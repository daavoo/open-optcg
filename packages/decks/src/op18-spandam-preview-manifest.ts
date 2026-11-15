import type { DeckManifest } from "./index.js";

/**
 * Black/Yellow Spandam (OP18-079): the list DuelVoyager user "tinkerer" shared
 * on 3 Nov 2026, which the YouTube channel BerryTCG posted as the 1st-place
 * list of a DuelVoyager online weekly -- a simulator event, played before
 * OP-18's release.
 *
 * Source: tinkerer's DuelVoyager deck share,
 * https://www.duelvoyager.com/deck/view/ONh3UPODmgFO (deck "OP18 Spandam"),
 * retrieved 2026-11-15. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Spandam builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. It is the first shipped list behind this Leader, and a
 * pre-release build, which a tournament list replaces once the set has
 * results.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op18SpandamPreviewManifest: DeckManifest = {
  id: "(Black/Yellow) Spandam - tinkerer OP-18 Pre-release",
  format: "standard",
  leader: "OP18-079",
  recommended: true,
  cards: {
    "EB04-058": 4,
    "OP17-109": 4,
    "OP18-099": 4,
    "OP18-100": 4,
    "OP18-101": 4,
    "OP18-103": 4,
    "OP18-105": 4,
    "OP18-108": 4,
    "OP18-109": 4,
    "OP18-110": 4,
    "OP18-113": 4,
    "OP18-115": 2,
    "OP18-116": 4,
  },
};
