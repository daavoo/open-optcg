import { describe, it } from "vitest";
import { sweepEffectOptions } from "./support/effect-option-sweep.js";

// One shard of the effect-option sweep; see `EFFECT_OPTION_SHARDS`.
describe("typed effect-option descriptors", () => {
  it("classifies every effect option offered in shard 02 of the deck pairs", async () => {
    await sweepEffectOptions(2);
  }, 300_000);
});
