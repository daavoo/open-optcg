import type { DeckManifest } from "./index.js";

/**
 * OP-17 Green Shanks, the format's rest-lock control deck, as Bandai lists it.
 *
 * Source: Bandai's own feature-deck page for the Leader,
 * https://en.onepiece-cardgame.com/feature/deck/deck_112.php (posted 28 Aug
 * 2026, retrieved 20 Sep 2026), transcribed slot for slot -- sixteen distinct
 * cards behind OP17-020, nine of them four-ofs and seven two-ofs. Every
 * identity was already in the registry: the OP-17 slots from the set pass,
 * ST32-002 from the ST31-36 format pass, ST16-004 and ST24-004 from the
 * community pass in `tools/audit-cards`.
 *
 * ## What the deck does
 *
 * The Leader converts a rested Character into a permanently rested one: rest
 * something with a Character effect, then spend a card or a DON!! to keep it
 * down through the opponent's Refresh Phase. Every body in the list rests
 * something on the way in -- OP17-029 Hongo two 2-drops, OP17-031 Yasopp an
 * 8-cost, OP17-027 Benn.Beckman two of anything with [Rush: Character]
 * attached, OP17-024 Howling Gab one of anything -- and OP17-022 Shanks at 10
 * DON!! rests the whole board with [Rush]. ST16-004 Shanks and OP17-025
 * Building Snake are the removal, and both only shoot *rested* Characters,
 * which is the archetype in one card: the rest effects are what make removal
 * legal. OP17-036 is the same plan as an Event -- rest six DON!! to rest one
 * Character and K.O. two rested ones -- and doubles as a +4000 Counter on a
 * [Shanks], which the Leader is.
 *
 * Bandai's list is wider and lower than the guide lists that preceded it: two
 * copies each of Crone Oli, Fugar, Howling Gab, ST16-004, Law & Bepo and the
 * two situational Events, so the deck sees more of its rest effects and fewer
 * of its 9- and 10-cost payoffs in any one game. ST24-004 Law & Bepo is the
 * Leader's clause on a body -- the Character it rests skips the next Refresh
 * Phase without the Leader paying for it -- and ST32-002 Kouzuki Oden draws
 * and stops one of their bodies being *un*rested, which is the other half of
 * the same lock.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would be
 * a cycle.
 */
export const op17ShanksManifest: DeckManifest = {
  id: "(Green) Shanks - Official Feature Deck",
  featuredOn: { page: 112, posted: "2026-08-28" },
  format: "standard",
  leader: "OP17-020",
  cards: {
    "OP17-021": 2,
    "OP17-026": 2,
    "OP17-032": 4,
    "OP17-025": 4,
    "OP17-029": 4,
    "OP17-033": 4,
    "OP17-031": 4,
    "ST32-002": 4,
    "OP17-027": 4,
    "OP17-024": 2,
    "ST16-004": 2,
    "OP17-022": 4,
    "ST24-004": 2,
    "OP17-038": 2,
    "OP17-036": 2,
    "OP17-037": 4,
  },
};
