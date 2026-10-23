import type { DeckManifest } from "./index.js";

/**
 * Blue Buggy as the first EB-05 field builds it: the list pilot "Lonezwiebel"
 * took to 33rd of 128 at ChinoizeCup #124, an online event played on Monday
 * 19 Oct 2026 that allowed EB-05 cards ahead of their 30 Oct English release.
 *
 * Source: Limitless TCG's standings for that event, retrieved 23 Oct 2026 --
 * https://play.limitlesstcg.com/tournament/6ad09157115c12b73a5a4654/standings
 * -- whose API carries the whole fifty as card counts.
 *
 * Why this list and not a higher one: every Buggy list that finished above it
 * across the three EB-05 events plays P-084 Buggy, and so does the creator
 * list most of them follow. That promo's only English print is a collector
 * treatment the card audit cannot stamp (see the promo entry in
 * `tools/audit-cards/src/index.ts`), so it is not in the registry and a list
 * with it does not validate. This is the best-placed EB-05 Buggy list without
 * it, and it shares their core: four EB05-021 Alvida, four ST25-003 Crocodile
 * & Mihawk, four OP09-051 Buggy, the ST-25 4-costs and the Cross Guild
 * searchers.
 *
 * Same Leader as Bandai's feature deck, so `op09-buggy-policy.ts` pilots
 * both. What the EB-05 field changed:
 *
 * - **EB05-021 Alvida is the Leader's payload.** A 9-cost {Cross Guild}
 *   Character the Leader plays for its flat five DON!!, whose [On Play] draws
 *   2 and plays another {Cross Guild} Character of cost 8 or less from hand --
 *   so one activation is two bodies. Her attack negates a Character's effect.
 * - **OP16-051 Mohji & Cabaji** is a 6-cost {Cross Guild} draw-2 the Leader
 *   can also play, in place of OP09-046 Crocodile and P-082 Crocodile.
 * - **Navy and Amazon Lily removal in the cheap slots.** ST33-003 Smoker
 *   bottoms two Characters of cost 2 or less, OP17-046 Gloriosa is a 4-cost
 *   [Blocker] that bottoms a cost 5 or less, and ST33-004 Borsalino is a
 *   [Blocker] that costs 3 less on a turn a card in hand was trashed by an
 *   effect, which ST25-001 Alvida, OP09-048 Mihawk and ST25-003 Crocodile &
 *   Mihawk all do.
 * - **OP16-056 Mr.3** trashes itself for 2 cards and stops an attacker.
 * - **No ST25-004 Buggy, OP09-045 Cabaji or PRB02-009 Mr.3.**
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op09BuggyTournamentManifest: DeckManifest = {
  id: "(Blue) Buggy - 33rd Place ChinoizeCup #124",
  format: "standard",
  leader: "OP09-042",
  cards: {
    "OP09-056": 4,
    "ST33-003": 3,
    "ST25-001": 4,
    "ST25-005": 4,
    "ST25-002": 3,
    "OP16-056": 3,
    "OP17-046": 3,
    "OP09-048": 4,
    "OP16-051": 3,
    "ST33-004": 2,
    "ST25-003": 4,
    "EB05-021": 4,
    "OP09-051": 4,
    "OP09-057": 4,
    "OP06-058": 1,
  },
};
