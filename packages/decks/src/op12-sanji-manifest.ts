import type { DeckManifest } from "./index.js";

/**
 * OP-12 Blue/Purple Sanji, the {Straw Hat Crew} Event deck that fills its trash
 * with Events and grows its Characters off the count.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 4 Oct 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_072.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * Twenty-six of the fifty are Events. OP12-041's [Activate: Main] pays DON!! −1
 * to activate a {Straw Hat Crew} Event of base cost 3 or less from hand, and
 * its [When Attacking] adds a rested DON!! back while your field holds no more
 * DON!! than the opponent's, so the Leader turns one returned DON!! a turn into
 * a free Event. OP12-079 and OP12-060 Boeuf Burst dig and draw, OP12-078
 * Brochette Blow draws and shrinks an attacker, and OP09-077 Gum-Gum Lightning
 * K.O.s a 6000 for DON!! −2.
 *
 * The Characters read the trash: at four Events OP12-066 Carne and OP12-065
 * Emporio.Ivankov gain [Blocker], OP12-063 Vinsmoke Reiju becomes a 7000
 * [Blocker], and OP12-059 Concasser's [Counter] gives the Leader +4000.
 * OP12-070 Sanji gains +1000 for every five Events and pays a DON!! to the
 * DON!! deck instead of leaving the field to an opponent's effect, which is also
 * what OP12-072 Zeff reads to gain [Rush]. OP12-071 Charlotte Pudding finds the
 * Events, and OP12-062 Vinsmoke Sora and OP12-074 Patty put DON!! back.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op12SanjiManifest: DeckManifest = {
  id: "(Blue/Purple) Sanji - Official Feature Deck",
  featuredOn: { page: 72, posted: "2025-08-22" },
  format: "standard",
  leader: "OP12-041",
  cards: {
    "OP12-062": 4,
    "OP12-066": 4,
    "OP12-071": 4,
    "OP12-070": 4,
    "OP12-074": 4,
    "OP12-063": 4,
    "OP12-072": 2,
    "OP12-065": 2,
    "OP09-078": 4,
    "OP12-059": 4,
    "OP12-079": 4,
    "OP09-077": 2,
    "OP12-060": 4,
    "OP12-078": 4,
  },
};
