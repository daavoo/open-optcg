/**
 * Re-export of the shared deterministic RNG, which now lives in
 * `@one-piece-sim/protocol` so that `decks` can use the same stream for sealed
 * pool generation. See the note there for why it moved.
 */
export {
  nextInt,
  seedRng,
  shuffle,
  type RngState,
} from "@one-piece-sim/protocol";
