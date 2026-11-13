/**
 * Writes an expansion's sealed card-value table
 * (`packages/decks/src/sealed-values-<set>.ts`) from a card-value fit's
 * `card-values.json`: see `packages/decks/src/sealed-values.ts` for what a
 * value is and how it was measured.
 *
 *   pnpm exec tsx tools/write-sealed-values.ts --expansion OP18 \
 *     --values ml/checkpoints/op18b-cardstats/card-values.json --model op18b
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const arg = (name: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  const value = at === -1 ? undefined : process.argv[at + 1];
  if (value === undefined) throw new Error(`--${name} is required`);
  return value;
};

const expansion = arg("expansion").toUpperCase();
const model = arg("model");
const fit = JSON.parse(readFileSync(arg("values"), "utf8")) as {
  games: number;
  cards: { card: string; value: number }[];
};
const rows = [...fit.cards]
  .sort((left, right) => left.card.localeCompare(right.card))
  .map(
    (row) =>
      `  "${row.card}": ${(Math.round(row.value * 10) / 10 || 0).toFixed(1)},`,
  );
const name = `${expansion}_CARD_VALUES`;
const out = resolve(
  `packages/decks/src/sealed-values-${expansion.toLowerCase()}.ts`,
);
writeFileSync(
  out,
  `// Written by tools/write-sealed-values.ts from the ${model} model's card-value
// fit over ${fit.games} self-play games. Do not edit by hand; refit and rewrite.
export const ${name}: Readonly<Record<string, number>> = {
${rows.join("\n")}
};
`,
);
console.log(`${rows.length} values -> ${out}`);
