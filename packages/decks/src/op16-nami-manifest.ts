import type { DeckManifest } from "./index.js";

/**
 * OP-16 Blue/Yellow Nami, the Thriller Bark recursion build.
 *
 * The OP-16 format's most-played Leader. Card text for every identity is
 * stamped from Bandai's own cardlist pages by `pnpm reference:audit`'s
 * community-deck pass; the card definitions themselves live in
 * `packages/cards/src/op16-nami.ts`.
 *
 * Lives in its own module, rather than inline in `index.ts`, so that
 * `deck-provenance.ts` can read the card list without importing `index.ts` --
 * `index.ts` re-exports from `deck-provenance.ts`, and the reverse import
 * would be a cycle.
 */
export const op16NamiManifest: DeckManifest = {
  id: "(Blue/Yellow) Nami - Official Feature Deck",
  format: "standard",
  leader: "OP11-041",
  cards: {
    "OP14-102": 4,
    "OP06-106": 4,
    "OP11-106": 3,
    "OP14-110": 4,
    "OP14-111": 4,
    "OP16-056": 4,
    "OP06-104": 2,
    "PRB02-008": 1,
    "OP15-113": 1,
    "EB03-053": 4,
    "EB04-058": 4,
    "OP15-114": 1,
    "EB03-055": 4,
    "OP14-104": 4,
    "OP16-119": 2,
    "OP13-042": 3,
    "OP06-058": 1,
  },
};
