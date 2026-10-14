import { sha256Bytes } from "./sha256.js";

/**
 * The deterministic RNG every seeded thing in this repo shares.
 *
 * It lives in `protocol` rather than `engine-core` because two packages need the
 * *same* stream and `engine-core` depends on `decks`, not the other way round.
 * Sealed pool generation (`@one-piece-sim/decks`) opens packs from a seed;
 * the engine shuffles decks and picks the starting player from one. When this
 * was engine-only, the sealed side had to take an injected `nextInt` callback,
 * which pushed an adapter into every CLI, tool and browser caller -- and the
 * alternative, a second xorshift implementation, would have been two RNGs that
 * had to stay bit-identical by hand.
 *
 * `RngState` is also part of the serialized `GameState` and is hashed into
 * canonical game hashes, so the algorithm below is a compatibility surface:
 * changing it changes every existing replay and trace.
 */
export interface RngState {
  value: number;
}

export function seedRng(seed: string): RngState {
  const digest = sha256Bytes(seed);
  const value = new DataView(
    digest.buffer,
    digest.byteOffset,
    digest.byteLength,
  ).getUint32(0, true);
  return { value: value || 1 };
}

export function nextInt(
  state: RngState,
  maximum: number,
): { state: RngState; value: number } {
  let value = state.value >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  const normalized = value >>> 0;
  return { state: { value: normalized }, value: normalized % maximum };
}

export function shuffle<T>(
  items: readonly T[],
  initialState: RngState,
): { items: T[]; state: RngState } {
  const shuffled = [...items];
  let state = initialState;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const result = nextInt(state, index + 1);
    state = result.state;
    [shuffled[index], shuffled[result.value]] = [
      shuffled[result.value]!,
      shuffled[index]!,
    ];
  }
  return { items: shuffled, state };
}
