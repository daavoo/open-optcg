import type { DeckManifest } from "./index.js";

/**
 * Red Monkey.D.Luffy (ST21-001): the maintainer's aggro build, supplied to
 * the project directly on 13 Oct 2026. It is the "daavoo ~ Luffy aggro"
 * training variant in `ml/bridge/deck-variants.ts`, shipped under the
 * project's own "- Open OPTCG" id.
 *
 * It is the Leader's `recommended` list: of the Monkey.D.Luffy builds in the
 * learned model's training pool it is one the model wins most with against
 * the meta field. Same Leader as "(Red) Monkey.D.Luffy - Starter Deck 31",
 * so the same rules policy pilots both.
 *
 * Against that list it adds 4 EB04-002 Jewelry Bonney, 3 OP10-005 Sanji, 2
 * OP10-011 Tony Tony.Chopper, 3 OP15-012 Buggy, 4 ST21-003 Sanji, 4 ST21-014
 * Monkey.D.Luffy, 4 ST21-015 Roronoa Zoro. It drops 4 OP11-003 Usopp, 4
 * OP11-009 Nico Robin, 4 OP11-012 Franky, 4 OP13-021 Gum-Gum Gatling Gun, 4
 * OP14-015 Roronoa Zoro, 4 ST23-004 Monkey.D.Luffy. It changes the count of
 * OP04-016 Bad Manners Kick Course 4 to 2, P-101 Tony Tony.Chopper 4 to 2,
 * ST31-001 Sanji 2 to 4, ST31-003 Brook 4 to 2, ST31-004 Monkey.D.Luffy 2 to
 * 4, ST31-005 Thousand Sunny 2 to 4.
 *
 * Every identity is stamped from Bandai's cardlist pages already, so the
 * audit needs no entry for it.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const st21LuffyOpenManifest: DeckManifest = {
  id: "(Red) Monkey.D.Luffy - Open OPTCG",
  format: "standard",
  leader: "ST21-001",
  recommended: true,
  cards: {
    "EB04-002": 4,
    "OP01-016": 4,
    "OP04-016": 2,
    "OP10-005": 3,
    "OP10-011": 2,
    "OP15-012": 3,
    "P-101": 2,
    "ST21-003": 4,
    "ST21-014": 4,
    "ST21-015": 4,
    "ST31-001": 4,
    "ST31-002": 4,
    "ST31-003": 2,
    "ST31-004": 4,
    "ST31-005": 4,
  },
};
