import type { DeckManifest } from "./index.js";

/**
 * The OP12-020 Green Zoro Leader rebuilt for the OP-17 field once OP14-020
 * Dracule Mihawk is banned (Bandai, effective 12 Oct 2026).
 *
 * Source: PerryAgenteP's list from "[OP17 NEW BANNED] Win a box | Rumble
 * league #11", 1 Oct 2026, an event run under the post-ban list --
 * https://play.limitlesstcg.com/tournament/6ab613e7880ed327106dc30c/standings
 * -- read from Limitless' standings API, which gives one row per identity with
 * its count, and matched card for card against gumgum.gg's copy of the same
 * entry. The pilot went 1-1 and dropped, so the id names the format the list
 * was built for rather than a placing: no post-ban Zoro list has a finish to
 * cite yet. It is the gumgum.gg OP17 Zoro page's recommended list, and it sits
 * inside the consensus of the eight OP-17 Zoro lists on Limitless from 27 Aug
 * to 8 Oct 2026: OP12-031, OP12-034 and OP12-039 are in all eight, and every
 * other identity here is in at least three -- except OP06-033 Vander Decken,
 * which only this list plays.
 *
 * Why the ban matters to this Leader: OP14-020 gained power whenever the
 * opposing Leader had the <Slash> attribute, which Zoro does, so Mihawk was
 * the one matchup the Leader could not win on power. Bandai cited exactly that
 * in the ban notice.
 *
 * ## What the deck does
 *
 * Same engine as Starter Deck 32 -- read `st32-cards.ts` before the pilot. The
 * Leader restands once per turn after battling a Character, but only with
 * three DON!! on it, and OP12-031 Tashigi supplies those three from the
 * *rested* pool, so they cost nothing once a play has been paid for. OP12-039
 * is a second restand from hand.
 *
 * What changes is the support. Where the starter runs Kuina, Perona and Ryuma,
 * this list plays the OP-13 to OP-15 cards the format settled on:
 *
 *  - OP13-037 Roronoa Zoro sets two DON!! active on play under a Straw Hat Crew
 *    Leader (OP12-020 is one), so it is a 4-cost play that costs 2, and
 *    restands itself at the end of the turn as a defender.
 *  - OP13-031 Law returns a Character to replay a cost-5 or less one rested --
 *    an [On Play] reused, most often Tashigi's.
 *  - ST12-003 and ST32-003 Mihawk each put a further Slash body into play from
 *    hand, so the curve goes wide faster than the DON!! does.
 *  - OP15-023 Arlong locks two rested cards through a Refresh when it is
 *    K.O.'d, and doubles as the Fish-Man that OP06-033 Vander Decken trashes to
 *    K.O. a rested Character -- one of the bodies Tashigi or ST32-005 rested.
 *  - OP13-040 and OP12-037 are the Events: each has a [Main] that rests or
 *    locks opposing Characters, and a +3000 [Counter] for the Leader.
 *  - OP12-034 Perona is a second searcher beside OP12-028 Hiyori; both find a
 *    Slash card or a green Event.
 *
 * Lives in its own module for the same reason the other community manifests
 * do: `deck-provenance.ts` reads the card list and `index.ts` re-exports from
 * it, so inlining the list would be a cycle.
 */
export const op12ZoroManifest: DeckManifest = {
  id: "(Green) Roronoa Zoro - OP17 Post-Ban List",
  format: "standard",
  leader: "OP12-020",
  cards: {
    "OP12-028": 4,
    "OP12-034": 4,
    "ST32-005": 4,
    "OP06-033": 4,
    "ST12-003": 4,
    "OP13-037": 4,
    "OP15-023": 3,
    "OP12-031": 4,
    "OP12-023": 3,
    "ST32-002": 3,
    "OP13-031": 3,
    "ST32-003": 3,
    "OP13-040": 2,
    "OP12-037": 1,
    "OP12-039": 4,
  },
};
