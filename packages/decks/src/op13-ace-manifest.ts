import type { DeckManifest } from "./index.js";

/**
 * OP-13 Red/Blue Portgas.D.Ace, a 3-Life Leader that turns the damage it takes
 * and the big bodies it loses into cards.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 4 Oct 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_082.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP13-002's [DON!! x1] draws a card the first time each turn you take damage
 * or lose a Character with 6000 base power or more, and its [On Your
 * Opponent's Attack] trashes a card from hand for −2000 on the attacker. So
 * the deck wants a DON!! on the Leader every turn it can be hit, and a hand
 * deep enough to pay for the debuff.
 *
 * The early turns dig: OP13-016 Monkey.D.Garp looks at four for a 3-cost or
 * more, and OP13-043 Otama and OP13-054 Yamato draw two at 3 or less Life,
 * which the Leader starts at. OP13-054, OP13-119 Portgas.D.Ace, ST15-002 and
 * OP13-042 Edward.Newgate each give a rested DON!! to the Leader, so the
 * [DON!! x1] stays armed while the board develops. PRB02-008 Marco is a
 * 6000 [Blocker] whose [On K.O.] draws two on top of the Leader's one, and
 * OP13-042 is a 12000 [Blocker] for the late game. OP13-057 is a +3000
 * [Counter] that, from 1 Life, also stops the opponent's [Blocker]s for the
 * Leader's attacks -- the finisher once their Life is gone.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op13AceManifest: DeckManifest = {
  id: "(Red/Blue) Portgas.D.Ace - Official Feature Deck",
  featuredOn: { page: 82, posted: "2025-11-07" },
  format: "standard",
  leader: "OP13-002",
  cards: {
    "OP13-007": 4,
    "OP13-014": 4,
    "OP13-016": 4,
    "OP13-043": 4,
    "PRB02-008": 4,
    "OP13-054": 4,
    "OP13-046": 4,
    "OP13-119": 4,
    "PRB02-002": 4,
    "ST15-002": 4,
    "OP13-042": 4,
    "OP04-016": 4,
    "OP13-057": 2,
  },
};
