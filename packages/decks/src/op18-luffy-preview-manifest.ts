import type { DeckManifest } from "./index.js";

/**
 * Green Monkey.D.Luffy (OP18-022): not a person's build. It is the list OPTCG
 * Deck Explorer's automated deck builder made for this Leader from the OP-18
 * cards revealed by 14 Nov 2026, in its "control" style: the builder tries
 * several styles, plays each in simulated games against the most-played decks
 * with the same AI on both sides, and shows the best one. No pilot, event or
 * placing stands behind it, and it reflects that site's AI rather than how
 * people will build the deck.
 *
 * Source: OPTCG Deck Explorer, the `NEWLISTS` data on the homepage,
 * https://optcgdeckexplorer.com/ (entry "OP18-022", style "control"), and the
 * Leader's guide page, https://optcgdeckexplorer.com/guides/OP18-022/, dated
 * 2026-11-14, retrieved 2026-11-15. The site regenerates the list as cards are
 * revealed: on a later read the same day the guide page showed one fewer
 * OP12-029 Shimotsuki Kouzaburou (49 cards) while the homepage data still
 * carried this 50. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Monkey.D.Luffy (OP18-022)
 * builds in the learned model's training pool it is the one that model wins
 * most with against the meta field. It is the first shipped list behind this
 * Leader, and a pre-release build, which a tournament list replaces once the
 * set has results.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op18LuffyPreviewManifest: DeckManifest = {
  id: "(Green) Monkey.D.Luffy - OPTCG Deck Explorer OP-18 Pre-release",
  format: "standard",
  leader: "OP18-022",
  recommended: true,
  cards: {
    "EB02-017": 4,
    "EB04-018": 4,
    "OP08-023": 4,
    "OP12-029": 4,
    "OP13-027": 4,
    "OP13-031": 2,
    "OP13-034": 2,
    "OP13-037": 2,
    "OP14-022": 2,
    "OP18-027": 3,
    "OP18-029": 4,
    "OP18-030": 3,
    "P-102": 4,
    "PRB02-006": 4,
    "ST30-012": 4,
  },
};
