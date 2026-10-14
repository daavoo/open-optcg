import type { DeckManifest } from "./index.js";

/**
 * OP-13 Red/Purple Gol.D.Roger, the {Roger Pirates} ramp deck that races to
 * ten DON!! and then lands the 10-cost OP13-064 Roger.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 28 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_083.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP13-003 is a 5-Life, 7000-power Leader that reads as 5000 until the field
 * holds ten DON!!, and whenever you already have DON!! on the field one of the
 * DON!! placed in your DON!! Phase goes onto him. That given DON!! is what
 * the rest of the fifty keys off: "if you have any DON!! cards given" gates
 * the extra DON!! from OP13-061 Inuarashi, OP13-062 Crocus, OP13-063 Kouzuki
 * Oden, OP13-066 Silvers Rayleigh and OP13-075, and OP13-076's -8000.
 * OP13-072 Buggy, OP13-068 Douglas Bullet and OP13-067 Scopper Gaban ramp off
 * the {Roger Pirates} Leader alone.
 *
 * At ten DON!! the payoff is OP13-064 Roger: DON!! -3 for +2000 on the Leader
 * and -2000 on every opposing Character until the end of the opponent's next
 * turn, and while he is on the field the Leader's own effects are negated --
 * no -2000, and no DON!! forced onto him. Rayleigh then attacks with [Rush] and
 * refills a DON!! at the end of the turn for the next Roger. OP13-065 Shanks
 * finds {Roger Pirates} cards, OP13-071 Nekomamushi removes a small body at
 * eight DON!!, and OP13-060 Amatsuki Toki trashes herself in place of a
 * {Roger Pirates} Character the opponent's effect would K.O.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op13RogerManifest: DeckManifest = {
  id: "(Red/Purple) Gol.D.Roger - Official Feature Deck",
  featuredOn: { page: 83, posted: "2025-11-07" },
  format: "standard",
  leader: "OP13-003",
  cards: {
    "OP13-065": 4,
    "OP13-060": 2,
    "OP13-072": 4,
    "OP13-061": 4,
    "OP13-068": 4,
    "OP13-071": 4,
    "OP13-062": 4,
    "OP13-063": 4,
    "OP13-067": 4,
    "OP13-066": 4,
    "OP13-064": 4,
    "OP13-076": 4,
    "OP13-075": 4,
  },
};
