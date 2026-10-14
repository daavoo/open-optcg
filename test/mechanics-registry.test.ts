import { describe, expect, it } from "vitest";
import {
  mechanicProgramCards,
  mergeSetMechanics,
  type SetMechanics,
} from "@one-piece-sim/engine-core";
import { onPlayPrograms } from "../packages/engine-core/src/mechanics/index.js";

const drawEntries: NonNullable<SetMechanics["onPlay"]> = [
  ["TEST-001", { effect: { kind: "draw", player: "self", count: 1 } }],
];

const draw: SetMechanics = { onPlay: drawEntries };

describe("mechanic registry merge", () => {
  it("refuses the same clause registered for one card by two set modules", () => {
    expect(() =>
      mergeSetMechanics([
        { name: "set-a", mechanics: draw },
        { name: "set-b", mechanics: draw },
      ]),
    ).toThrow(/TEST-001 onPlay is registered in both set-a and set-b/);
  });

  it("keeps a card in its own clause when two sets register different ones", () => {
    const merged = mergeSetMechanics([
      { name: "set-a", mechanics: draw },
      { name: "set-b", mechanics: { onKo: drawEntries } },
    ]);

    expect(merged.onPlay.has("TEST-001")).toBe(true);
    expect(merged.onKo.has("TEST-001")).toBe(true);
  });

  it("merges the shipped set modules into the registries the engine reads", () => {
    // A guard on the split itself: every card the coverage ratchet counts has to
    // come out of a set module, so a module dropped from `index.ts` fails here
    // rather than as a silently unimplemented card.
    expect(onPlayPrograms.size).toBeGreaterThan(80);
    expect(mechanicProgramCards().size).toBeGreaterThan(150);
  });
});
