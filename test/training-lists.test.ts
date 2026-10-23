import { describe, expect, it } from "vitest";
import { SELECTABLE_DECK_IDS, validateDeck } from "@one-piece-sim/decks";
import {
  TRAINING_DECK_IDS,
  TRAINING_DECK_VARIANTS,
  trainingManifest,
} from "../ml/bridge/decks.js";

/**
 * System-1 trains on lists no player is shown: the training-only decks and
 * every variant of a training deck (`ml/bridge/decks.ts`,
 * `ml/bridge/deck-variants.ts`, `ml/bridge/deck-pool-scan.ts`). A list there
 * that a tournament could not register -- a rotated card, a banned pair --
 * teaches the model a game the format does not play, and nothing else in the
 * suite reads these lists, so this is where they are held to Standard.
 *
 * Selectable decks are the catalog's and are held by its own tests.
 */
describe("training lists", () => {
  const selectable = new Set<string>(SELECTABLE_DECK_IDS);
  const ids = [
    ...TRAINING_DECK_IDS.filter((id) => !selectable.has(id)),
    ...Object.values(TRAINING_DECK_VARIANTS).flat(),
  ];

  it("are all Standard-legal fifties", () => {
    const invalid = ids.flatMap((id) => {
      const manifest = trainingManifest(id);
      if (!manifest) return [`${id}: unresolved`];
      const { errors } = validateDeck(manifest);
      return errors.map((error) => `${id}: ${error}`);
    });
    expect(ids.length).toBeGreaterThan(0);
    expect(invalid).toEqual([]);
  });
});
