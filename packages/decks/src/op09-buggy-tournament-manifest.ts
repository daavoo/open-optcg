import type { DeckManifest } from "./index.js";

/**
 * Blue Buggy as the first EB-05 field builds it: the list pilot "Tsaams" took
 * to 12th of 128 (5-2) at ChinoizeCup #124, an online event played on Monday
 * 19 Oct 2026 that allowed EB-05 cards ahead of their 30 Oct English release.
 * No Buggy list reached the top eight of the three EB-05 events, and this was
 * the best-placed one.
 *
 * Source: Limitless TCG's standings for that event, retrieved 23 Oct 2026 --
 * https://play.limitlesstcg.com/tournament/6ad09157115c12b73a5a4654/standings
 * -- whose API carries the whole fifty as card counts.
 *
 * Same Leader as Bandai's feature deck, so `op09-buggy-policy.ts` pilots
 * both. What the EB-05 field changed:
 *
 * - **EB05-021 Alvida is the Leader's payload.** A 9-cost {Cross Guild}
 *   Character the Leader plays for its flat five DON!!, whose [On Play] draws
 *   2 and plays another {Cross Guild} Character of cost 8 or less from hand --
 *   so one activation is two bodies. Her attack negates a Character's effect.
 * - **P-084 Buggy shuts the cost-3-and-4 band down.** Under a [Buggy] Leader,
 *   no Character with a cost of 3 or 4 can attack, on either side. This
 *   list's own ST-25 4-costs climb to cost 5 once two Characters of base cost
 *   5 or more are out, so they leave the band as the board fills, while the
 *   opponent's 3- and 4-costs stay in it. The list's other 4-costs --
 *   EB05-028 Boa Hancock, EB03-021 Alvida, OP16-056 Mr.3 -- are bought for
 *   their effects, not their attacks. P-084 cannot attack itself; its
 *   [On Play] plays a {Cross Guild} Character of cost 6 or less from hand.
 * - **EB05-028 Boa Hancock and EB03-021 Alvida** as 4-cost answers: an
 *   opponent holding 9 or more cards trashes 4, and EB03-021 trashes a card
 *   from hand to bottom-deck a small Character of theirs and a cheap one.
 * - **OP16-056 Mr.3** trashes itself for 2 cards and stops an attacker, and
 *   ST33-004 Borsalino is a [Blocker] that costs 3 less on a turn a card in
 *   hand was trashed by an effect, which ST25-001 Alvida, OP09-048 Mihawk and
 *   ST25-003 Crocodile & Mihawk all do.
 * - **No ST25-004 Buggy, OP16-051 Mohji & Cabaji or OP09-046 Crocodile.**
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op09BuggyTournamentManifest: DeckManifest = {
  id: "(Blue) Buggy - 12th Place ChinoizeCup #124",
  format: "standard",
  leader: "OP09-042",
  cards: {
    "OP09-056": 4,
    "ST25-001": 4,
    "ST25-002": 4,
    "ST25-005": 4,
    "OP16-056": 4,
    "EB03-021": 2,
    "EB05-028": 2,
    "OP09-048": 4,
    "ST33-004": 2,
    "P-084": 2,
    "ST25-003": 4,
    "EB05-021": 4,
    "OP09-051": 4,
    "OP09-057": 4,
    "OP06-058": 2,
  },
};
