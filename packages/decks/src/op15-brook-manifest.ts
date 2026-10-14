import type { DeckManifest } from "./index.js";

/**
 * OP-15 Green/Black Brook, the {Straw Hat Crew} deck that mills itself to zero
 * and wins on the turn it gets there.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 27 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_097.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP15-022 rewrites the deck-out loss: an empty deck loses at the end of the
 * turn it empties, not at once. Its [Activate: Main] [Once Per Turn] trashes
 * the top 4, and on the turn that leaves the deck at 0 it sets a Character
 * active, so the last turn is one extra swing from a Character that has
 * already attacked.
 *
 * Everything else feeds the trash. OP15-081 Sanji trashes 5 off the top,
 * OP15-085 Chopper and OP15-082 Lola 3 each, and OP15-088 Pirates Docking Six
 * pays 3 to play a cost-2 or less {Straw Hat Crew} -- a Chopper it just milled
 * -- out of the trash. The trash
 * is what OP15-092 Luffy counts: 9000 base and +10 cost at 10, a 7000 Leader
 * on the opponent's turn at 20, 10000 at 30. OP15-086 Nami plays a cost-7 or
 * less {Straw Hat Crew} out of the trash with [Rush], so a Luffy milled early
 * comes back swinging, and OP15-095 Gum-Gum Storm pays off at 15. OP15-032
 * Brook rests a [Blocker] on the way in and can trash itself to set a
 * Character active again. OP15-035 Laboon and OP15-094 Zoro protect the board
 * from removal, and EB02-017 Nami digs for the pieces.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op15BrookManifest: DeckManifest = {
  id: "(Green/Black) Brook - Official Feature Deck",
  featuredOn: { page: 97, posted: "2026-04-03" },
  format: "standard",
  leader: "OP15-022",
  cards: {
    "EB02-017": 4,
    "OP15-035": 4,
    "OP15-081": 4,
    "OP15-085": 4,
    "OP15-094": 2,
    "OP15-024": 2,
    "OP15-082": 4,
    "OP15-087": 4,
    "OP15-088": 4,
    "OP15-089": 4,
    "OP15-032": 4,
    "OP15-092": 4,
    "OP15-086": 4,
    "OP15-095": 2,
  },
};
