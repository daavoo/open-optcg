import type { DeckManifest } from "./index.js";

/**
 * OP-15 Yellow Monkey.D.Luffy, the {Sky Island} deck that spends its Life to
 * keep its big bodies on the field.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 27 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_100.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP15-098 has no activated ability. Its whole text is a replacement: when the
 * opponent would remove one of its {Sky Island} Characters of 6000 base power
 * or more -- by an effect or in battle -- it may take the top Life card into
 * hand instead. Five of the eleven Characters are behind it -- OP15-107
 * Chopper, OP15-113 Zoro, OP15-114 Wyper, OP15-119 Luffy and OP15-109 Robin --
 * so the Life total is those bodies' hit points, and the deck refills it: OP15-113 Roronoa Zoro banks the
 * top of the deck on Life for a card from hand, OP15-109 Nico Robin swaps a
 * Life card for a deck card and deploys a {Sky Island} body of cost 5 or less,
 * and OP15-116 Gum-Gum Golden Rifle cycles one more.
 *
 * OP15-108 Nami digs for {Sky Island} cards, OP15-102 Gan.Fall comes down 3
 * cheaper beside a 7000 body and rests a Character, and OP15-114 Wyper sweeps
 * the opponent's board for −2000 off a Life card turned face-up. The finisher
 * is OP15-119 Monkey.D.Luffy: [Rush] at 6 DON!!, and it grows by the cost of a
 * revealed Life card whenever the opponent answers with an Event or a
 * [Blocker]. ST29-016 gives the Leader [Unblockable] for the last swing.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op15LuffyManifest: DeckManifest = {
  id: "(Yellow) Monkey.D.Luffy - Official Feature Deck",
  featuredOn: { page: 100, posted: "2026-04-03" },
  format: "standard",
  leader: "OP15-098",
  cards: {
    "OP15-108": 4,
    "OP15-102": 4,
    "OP15-107": 4,
    "OP15-113": 4,
    "ST29-004": 4,
    "ST29-009": 4,
    "EB03-053": 4,
    "OP15-114": 4,
    "OP15-119": 4,
    "EB03-055": 4,
    "OP15-109": 4,
    "OP15-116": 4,
    "ST29-016": 2,
  },
};
