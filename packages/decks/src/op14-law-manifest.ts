import type { DeckManifest } from "./index.js";

/**
 * OP-14 Red Trafalgar Law, the {Supernovas} deck that trades base power
 * between its own Characters.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 28 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_087.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP14-001's [Activate: Main] swaps the base power of two {Supernovas} or
 * {Heart Pirates} Characters for the turn, once a turn. The list is built so
 * that trade is always worth making: a small body whose text pays out at
 * 5000 power or more (OP14-002 Urouge's draw and K.O., OP14-004 Cavendish's
 * [Rush]) takes a heavy hitter's base, and the heavy hitter's own attack is
 * either already spent or not yet possible. A 0-power OP14-013 Luffy swapped
 * up becomes an attacker with a −1000 on the way in.
 *
 * The rest keeps the board stocked with swap partners. OP14-010 Basil
 * Hawkins' [On K.O.] plays a 2000-or-less {Supernovas} body off the top five,
 * OP14-014 Kid's [On Play] puts one out of hand, and OP14-018's [Trigger]
 * does the same when it is taken from Life. OP14-015 Zoro and OP14-009 Law are the [Rush]
 * top end, and Law's [On Your Opponent's Attack] trashes two cards to swap
 * the Leader's base with his 10000 when the Leader is the one under attack.
 * OP14-016 X.Drake takes an opposing removal effect on the Leader's power
 * instead, and OP14-003 Bege cannot be K.O.'d by a small opposing
 * Character's effect.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op14LawManifest: DeckManifest = {
  id: "(Red) Trafalgar Law - Official Feature Deck",
  featuredOn: { page: 87, posted: "2026-01-16" },
  format: "standard",
  leader: "OP14-001",
  cards: {
    "OP14-003": 4,
    "OP14-005": 4,
    "OP14-010": 4,
    "OP14-013": 4,
    "OP14-004": 2,
    "OP14-011": 4,
    "OP14-002": 4,
    "OP14-014": 4,
    "OP14-016": 4,
    "OP14-007": 4,
    "OP14-015": 4,
    "OP14-009": 4,
    "OP14-018": 4,
  },
};
