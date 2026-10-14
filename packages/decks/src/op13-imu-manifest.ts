import type { DeckManifest } from "./index.js";

/**
 * OP-13 Black Imu, the {Five Elders} deck that fills its trash and then calls
 * all five of them back at once.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 27 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_085.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP13-079 starts the game with a {Mary Geoise} Stage in play, and the one
 * Stage in the fifty is OP13-099 The Empty Throne: rest it and three DON!! to
 * play a {Five Elders} Character from hand whose cost is at most the DON!! on
 * your field. That is the engine of the deck -- a 6-cost or a 7-cost Elder for
 * three, and at ten DON!! the 10-cost OP13-082 Five Elders for three.
 *
 * The early turns dig and fill the trash. OP13-086 Saint Shalria and OP13-096
 * The Five Elders Are at Your Service!!! find {Celestial Dragons} cards and
 * trash the rest of what they look at, OP13-087 Saint Charlos mills one, and
 * the Leader's [Activate: Main] trashes a spent {Celestial Dragons} body (or a
 * card from hand) to draw. The five 5000-power Elders -- OP13-080 Nusjuro,
 * OP13-083 Saturn, OP13-084 Ju Peter, OP13-089 Warcury and OP13-091 Mars --
 * cannot be removed by the opponent's effects from seven cards in the trash;
 * Saturn's search and Warcury's draw find another OP13-082. OP13-082's
 * [Activate: Main] trashes your Characters and plays five different 5000-power
 * Elders out of the trash, which is the turn the deck is built to reach.
 *
 * The removal is Mars's [On Play], OP13-095 Saint Rosward and OP13-097 -- the
 * last two only while every Character you have is {Celestial Dragons} -- and
 * OP13-098 answers a cost-7 Stage. PRB02-014 Sabo is a [Blocker] that costs 3
 * less from fifteen cards in the trash. The Leader bars Events costing 2 or
 * more, which is why every Event here costs 1.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op13ImuManifest: DeckManifest = {
  id: "(Black) Imu - Official Feature Deck",
  featuredOn: { page: 85, posted: "2025-11-07" },
  format: "standard",
  leader: "OP13-079",
  cards: {
    "OP13-086": 4,
    "OP13-087": 3,
    "OP13-095": 2,
    "OP13-083": 4,
    "OP13-089": 4,
    "OP13-080": 4,
    "OP13-091": 4,
    "PRB02-014": 4,
    "OP13-084": 4,
    "OP13-082": 4,
    "OP13-096": 4,
    "OP13-097": 4,
    "OP13-098": 4,
    "OP13-099": 1,
  },
};
