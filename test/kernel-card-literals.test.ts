import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A ratchet on card-specific code in the rules kernel.
 *
 * Card behaviour belongs in `engine-core/src/mechanics/`: programs, static
 * rows, reactions and immunities, one module per set, each keyed by card
 * number. A card-number literal anywhere else in `engine-core/src` is a rule
 * the declarative path cannot yet say -- a `cardNumber === "..."` branch, a
 * hard-coded set, an imperative handler -- and every one of them is a place a
 * new card has to touch shared code.
 *
 * The budget below is per file and may only shrink. A new literal fails here:
 * say it as a row in its set's module instead, or extend the row shape until
 * it can be. A file that drops below its budget fails too, so the number is
 * lowered in the same change that earned it.
 */
const BUDGET: Readonly<Record<string, number>> = {
  "on-play-handlers.ts": 41,
  "actions/resolve-trigger.ts": 22,
  "legal-actions/trigger.ts": 20,
  "board.ts": 17,
  "legal-actions/counter.ts": 18,
  "pending.ts": 17,
  "model.ts": 11,
  "actions/activate-counter-event.ts": 9,
  "actions/attack.ts": 9,
  "effects.ts": 9,
  "hand-price.ts": 6,
  "removal.ts": 6,
  "static-abilities.ts": 7,
  "don.ts": 6,
  "resolve-effect/removal.ts": 3,
  "battle.ts": 4,
  "turn.ts": 4,
  "resolve-effect/costs.ts": 2,
  "resolve-effect/deck.ts": 2,
  "resolve-effect/discards.ts": 2,
  "legal-actions/main/activations.ts": 1,
  "legal-actions/main/attacks.ts": 1,
};

const ROOT = new URL("../packages/engine-core/src/", import.meta.url);
const CARD_NUMBER = /"(?:OP|ST|EB|PRB|P)\d{0,2}-\d{3}"/g;

function kernelFiles(directory = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(new URL(directory || ".", ROOT), {
    withFileTypes: true,
  })) {
    const path = `${directory}${entry.name}`;
    if (entry.isDirectory()) {
      if (path !== "mechanics") files.push(...kernelFiles(`${path}/`));
    } else if (entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

describe("card-number literals in the rules kernel", () => {
  const counts = new Map(
    kernelFiles().map((path) => [
      path,
      readFileSync(new URL(path, ROOT), "utf8").match(CARD_NUMBER)?.length ?? 0,
    ]),
  );

  it("do not grow past each file's budget", () => {
    const over = [...counts]
      .filter(([path, count]) => count > (BUDGET[path] ?? 0))
      .map(([path, count]) => `${path}: ${count} > ${BUDGET[path] ?? 0}`);
    expect(over).toEqual([]);
  });

  it("budgets are lowered as literals leave", () => {
    const slack = Object.entries(BUDGET)
      .filter(([path, budget]) => (counts.get(path) ?? 0) < budget)
      .map(
        ([path, budget]) =>
          `${path}: budget ${budget}, now ${counts.get(path) ?? 0}`,
      );
    expect(slack).toEqual([]);
  });
});
