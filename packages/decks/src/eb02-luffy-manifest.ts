import type { DeckManifest } from "./index.js";

/**
 * EB-02 Green/Purple Monkey.D.Luffy, the {Straw Hat Crew} deck that spends
 * DON!! to get it back.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 12 Oct 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_062.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * EB02-010's [Activate: Main] returns two DON!! to set two more active and
 * lift the Leader to 6000 through the opponent's turn, but only while every
 * Character on the field is {Straw Hat Crew}. EB02-035 Sanji & Pudding pays
 * that back: once a turn, when two or more DON!! return, it adds one DON!!
 * active. Three cards then read "my DON!! is no more than theirs" -- Sanji &
 * Pudding's draw, EB02-037 Franky's ramp on play and on attack, and EB02-041
 * Merry Go's +2 cost -- so returning DON!! is what turns them on.
 *
 * The purple half is ST-18's: OP05-061, ST18-001 and OP05-070 want 8 DON!! on
 * the field, ST18-005 Luffy-Tarou returns one DON!! to play a 5-cost purple
 * {Straw Hat Crew} body out of hand, and ST18-004 and EB02-017 Nami dig. The
 * finisher is EB02-061 Monkey.D.Luffy, which gains [Rush] under a multicolour
 * Leader once the opponent has 5 DON!! and pays two active DON!! and a Life
 * card to stand up again after its attack -- and each return of two is a
 * Sanji & Pudding refill.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const eb02LuffyManifest: DeckManifest = {
  id: "(Green/Purple) Monkey.D.Luffy - Official Feature Deck",
  featuredOn: { page: 62, posted: "2025-05-09" },
  format: "standard",
  leader: "EB02-010",
  cards: {
    "EB02-017": 4,
    "EB02-037": 4,
    "OP05-061": 4,
    "ST18-001": 4,
    "EB02-019": 4,
    "ST18-004": 4,
    "EB02-035": 4,
    "OP05-070": 4,
    "EB02-061": 4,
    "ST18-005": 4,
    "OP03-072": 2,
    "OP05-076": 4,
    "EB02-041": 4,
  },
};
