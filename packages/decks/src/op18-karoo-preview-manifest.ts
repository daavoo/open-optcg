import type { DeckManifest } from "./index.js";

/**
 * Red/Blue Karoo (OP18-001): the pre-release list the Spanish-language channel
 * VersusTCG built and played in its deck profile "Karoo Op18: ¡Cuidado con el
 * Pato!", uploaded 2 Nov 2026. OP-18 is not yet tournament legal, so the list
 * comes from no event and has no placing.
 *
 * Source: the video's description, https://www.youtube.com/watch?v=C_KqtnnvA98
 * (the "Lista:" block, card numbers with counts), retrieved 2026-11-15. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Karoo builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. It is the first shipped list behind this Leader, and a
 * pre-release build, which a tournament list replaces once the set has
 * results.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op18KarooPreviewManifest: DeckManifest = {
  id: "(Red/Blue) Karoo - VersusTCG OP-18 Pre-release",
  format: "standard",
  leader: "OP18-001",
  recommended: true,
  cards: {
    "EB02-001": 4,
    "EB03-024": 4,
    "OP13-012": 4,
    "OP15-009": 4,
    "OP18-003": 2,
    "OP18-004": 4,
    "OP18-008": 4,
    "OP18-009": 4,
    "OP18-010": 4,
    "OP18-011": 4,
    "OP18-013": 2,
    "OP18-015": 4,
    "OP18-019": 2,
    "OP18-043": 4,
  },
};
