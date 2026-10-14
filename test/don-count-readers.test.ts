/**
 * `donCountReaders` is the list a "this `DON!! −N` buys nothing" argument has
 * to rule out, so a card missing from it turns that argument false without
 * any test noticing. These pin each way onto it -- a reaction to DON!! being
 * returned, a program gated on a DON!! count, a ramp off the DON!! deck, and a
 * continuous ability that reads a count -- the last declared by hand with
 * `readsDon` on its row, so the rows' source is scanned here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { donCountReaders } from "@one-piece-sim/engine-core";

const MECHANICS = new URL(
  "../packages/engine-core/src/mechanics/",
  import.meta.url,
);

/** The kernel's own gates, and every set's continuous-text rows. */
const STATIC_SOURCES = [
  new URL("../packages/engine-core/src/static-abilities.ts", import.meta.url),
  ...readdirSync(MECHANICS)
    .filter((name) => name.endsWith("-static.ts"))
    .map((name) => new URL(name, MECHANICS)),
];

/** A call that counts a player's DON!! on the field. */
const DON_COUNT_READ = /\b(?:fieldDon|fieldDonCount)\(/;

describe("donCountReaders", () => {
  const { reactions, ceilings, ramps, opponent } = donCountReaders();
  const own = (card: string) =>
    reactions.has(card) || ceilings.has(card) || ramps.has(card);

  it("holds every reaction to the controller's DON!! being returned", () => {
    for (const card of [
      "OP09-061",
      "OP05-074",
      "OP08-067",
      "OP06-076",
      "EB02-035",
      "OP17-062",
    ]) {
      expect(reactions.has(card), card).toBe(true);
    }
  });

  it("holds a ramp off the DON!! deck that does not pay in DON!!", () => {
    // OP09-075 Kid pays a Life card for its DON!!, so on an empty DON!! deck it
    // does nothing unless something returned DON!! first.
    expect(ramps.get("OP09-075")).toBe(1);
  });

  it("leaves out a ramp that pays DON!! −N, which refills the deck itself", () => {
    // ST26-003 Robin is `donMinus`, OP09-076 Zoro `donMinusOrMore`.
    expect(own("ST26-003")).toBe(false);
    expect(own("OP09-076")).toBe(false);
  });

  it("leaves out a ramp that answers the return, and one in a [Trigger]", () => {
    // OP09-061's refund draws from the deck the return it answers refilled;
    // OP09-077's ramp is its [Trigger], which fires from Life.
    expect(ramps.has("OP09-061")).toBe(false);
    expect(own("OP09-077")).toBe(false);
  });

  it("holds both sides of a gate comparing the two players' DON!!", () => {
    // OP09-066 Jean Bart pays out only while its controller has fewer DON!!
    // than the opponent, a `field-don-versus` gate.
    expect(ceilings.has("OP09-066")).toBe(true);
    expect(opponent.has("OP09-066")).toBe(true);
  });

  it("holds a gate on the opponent's DON!! under its opponent list only", () => {
    // ST26-005's own "your opponent has 5 or more DON!!".
    expect(opponent.has("ST26-005")).toBe(true);
    expect(own("ST26-005")).toBe(false);
  });

  it("holds every continuous ability that reads a DON!! count it can gain from", () => {
    const unlisted: string[] = [];
    for (const source of STATIC_SOURCES) {
      const lines = readFileSync(source, "utf8").split("\n");
      const file = source.pathname.split("/").at(-1)!;
      lines.forEach((line, index) => {
        if (
          !DON_COUNT_READ.test(line) ||
          /^\s*(\/\/|\*|const |function )/.test(line)
        )
          return;
        // The row a read belongs to is the nearest `cardNumber` above it.
        let owner: string | undefined;
        for (let back = index; back >= 0 && !owner; back -= 1) {
          owner = /cardNumber: "([^"]+)"/.exec(lines[back]!)?.[1];
        }
        const where = `${file}:${String(index + 1)}: ${owner ?? "no row"}`;
        if (/opponentOf\(/.test(line)) {
          if (!owner || !opponent.has(owner))
            unlisted.push(`${where} (opponent)`);
        } else if (/\)\s*<=?(?!=)/.test(line)) {
          if (!owner || !ceilings.has(owner))
            unlisted.push(`${where} (own ceiling)`);
        }
      });
    }
    expect(unlisted).toEqual([]);
  });
});
