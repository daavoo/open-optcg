import type { DeckManifest } from "./index.js";

/**
 * OP-16 Black Yamato, the {Land of Wano} deck that plays its board back out of
 * its own trash.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 28 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_106.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP16-079's only clause gives a {Land of Wano} Character played from the
 * trash [Rush] for the turn, and every other slot either fills the trash or
 * plays out of it. OP16-091 Nami, OP16-082 Kin'emon and OP16-092 Nico Robin
 * dig, trash what they pass and pitch an 8-cost from hand; OP16-098 Yamato
 * draws and trashes on arrival, then trashes itself to play a black 8-cost
 * [Yamato] from the trash, which arrives with [Rush]. OP16-096 is the
 * [Unblockable] one, and its [On K.O.] plays the 6-cost back; OP16-097
 * recovers a {Land of Wano} body to hand and drops a 2-cost beside it.
 *
 * The late game is the two Momonosuke. OP16-087 Shinobu's +20 cost lets
 * OP16-084's activation trash it at 9 DON!! for the 9-cost OP16-085 out of the
 * trash, whose [On Play] plays one more 6-or-less {Land of Wano} body from the
 * trash -- two [Rush] bodies off one activation. OP16-099's [Main] mills five
 * and plays a body out of the trash for six rested DON!!, and doubles as a
 * +3000 Counter. OP16-094 Ace hands a rested DON!! to a Wano body, OP16-095
 * Luffy makes one [Unblockable], and two OP16-088 Ushimaru are the list's only
 * plain Blockers.
 *
 * Bandai's write-up describes OP16-096 and OP16-097 the other way round -- it
 * gives 096 the recovery and 097 the [Unblockable]. The cards say otherwise,
 * and the numbers here are the ones in the page's own card list.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other OP-16 manifests do: `deck-provenance.ts` reads the card list
 * and `index.ts` re-exports from `deck-provenance.ts`, so the reverse import
 * would be a cycle.
 */
export const op16YamatoManifest: DeckManifest = {
  id: "(Black) Yamato - Official Feature Deck",
  featuredOn: { page: 106, posted: "2026-06-12" },
  format: "standard",
  leader: "OP16-079",
  cards: {
    "OP16-091": 4,
    "OP16-092": 4,
    "OP16-087": 4,
    "OP16-088": 2,
    "OP16-095": 4,
    "OP16-082": 4,
    "OP16-094": 4,
    "OP16-084": 4,
    "OP16-098": 4,
    "OP16-096": 4,
    "OP16-097": 4,
    "OP16-085": 4,
    "OP16-099": 4,
  },
};
