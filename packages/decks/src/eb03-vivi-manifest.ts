import type { DeckManifest } from "./index.js";

/**
 * EB-03 Red/Blue Nefeltari Vivi, the deck that hands [Rush] to its [On Play]
 * bodies.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 27 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_094.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * EB03-001's [Activate: Main] rests the Leader to give an opposing Character
 * −2000 and then [Rush] to one of your Characters without a [When Attacking]
 * effect. None of the forty-nine prints one, so every body the deck plays is
 * eligible, and the list is built out of Characters whose value is on the way
 * in: OP06-007 Shanks and OP09-009 Benn.Beckman remove a body, EB03-027
 * Marguerite and EB03-025 Hina bounce one by its base power, EB03-026 Boa
 * Hancock tucks a card from a full hand, and each of them then swings the turn
 * it lands. The −2000 comes first, so the same activation that shrinks a
 * blocker below the removal's line also gives the remover its attack.
 *
 * EB03-006 Nami pays for her draw by setting the Leader to −5000, which costs
 * nothing on a turn the Leader rests for its own ability instead of attacking.
 * EB03-024 Vivi is a 5-cost [Blocker] that puts a second {Alabasta} or
 * {Straw Hat Crew} body of cost 5 or less out of hand. The Leader's other half
 * keeps those bodies around: once a turn a base-cost-4-or-more Character about
 * to be K.O.'d can trash a card from hand instead, which is what makes a
 * rested Vivi [Blocker] or a Nami that has already swung worth defending.
 * OP13-012 Vivi digs the {Alabasta} and {Straw Hat Crew} pieces, and EB03-011
 * is the Leader-named +4000 Counter.
 *
 * The Bandai page's prose says Marguerite's [On Play] K.O.s a Character with
 * 10000 power or less; that is Shanks's text. The printed Marguerite, and so
 * the engine, returns a Character with 7000 base power to its owner's hand.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const eb03ViviManifest: DeckManifest = {
  id: "(Red/Blue) Nefeltari Vivi - Official Feature Deck",
  featuredOn: { page: 94, posted: "2026-02-13" },
  format: "standard",
  leader: "EB03-001",
  cards: {
    "OP13-007": 4,
    "OP13-012": 4,
    "OP10-011": 4,
    "EB03-006": 4,
    "EB03-024": 4,
    "EB03-025": 4,
    "OP13-011": 4,
    "OP13-054": 2,
    "EB03-026": 4,
    "EB03-027": 4,
    "OP09-009": 4,
    "OP06-007": 4,
    "EB03-011": 4,
  },
};
