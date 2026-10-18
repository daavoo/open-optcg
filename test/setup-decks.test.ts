import { describe, expect, it } from "vitest";
import {
  rememberedSetupDecks,
  rememberSetupDecks,
  SETUP_DECKS_KEY,
} from "../packages/web/src/setup-decks.js";

const DEFAULTS = { p1: "default-p1", p2: "default-p2" };

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("remembered lobby deck picks", () => {
  it("opens on the defaults when nothing was stored", () => {
    expect(rememberedSetupDecks(memoryStorage(), DEFAULTS, () => true)).toEqual(
      DEFAULTS,
    );
  });

  it("opens on the picks the last visit left", () => {
    const storage = memoryStorage();
    rememberSetupDecks(storage, { p1: "OP17-deck", p2: "CUSTOM-1" });
    expect(rememberedSetupDecks(storage, DEFAULTS, () => true)).toEqual({
      p1: "OP17-deck",
      p2: "CUSTOM-1",
    });
  });

  it("puts a seat back on its default when its deck no longer exists", () => {
    const storage = memoryStorage();
    rememberSetupDecks(storage, { p1: "OP17-deck", p2: "CUSTOM-gone" });
    expect(
      rememberedSetupDecks(storage, DEFAULTS, (id) => id === "OP17-deck"),
    ).toEqual({ p1: "OP17-deck", p2: "default-p2" });
  });

  it("survives a corrupt record and a storage that throws", () => {
    const corrupt = memoryStorage();
    corrupt.data.set(SETUP_DECKS_KEY, "{not json");
    expect(rememberedSetupDecks(corrupt, DEFAULTS, () => true)).toEqual(
      DEFAULTS,
    );
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(rememberedSetupDecks(blocked, DEFAULTS, () => true)).toEqual(
      DEFAULTS,
    );
    expect(() => {
      rememberSetupDecks(blocked, DEFAULTS);
    }).not.toThrow();
  });
});
