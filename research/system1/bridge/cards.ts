/**
 * Writes the registered card pool's functional facts -- name, category, stats,
 * colours, types, keywords -- as JSON, keyed by card number.
 *
 * The Python side builds each card's input text from these plus, when the
 * player has one, the printed text in their local asset pack. Printed text is
 * deliberately not written here: this file is derived from the repo alone.
 *
 *   pnpm exec tsx research/system1/bridge/cards.ts research/system1/data/cards.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { cardFacts, cardRegistry } from "@one-piece-sim/cards";

const out = process.argv[2] ?? "research/system1/data/cards.json";
const table: Record<string, unknown> = {};
for (const cardNumber of [...cardRegistry.keys()].sort()) {
  const facts = cardFacts(cardNumber);
  table[cardNumber] = {
    name: facts.name,
    category: facts.category,
    cost: facts.cost,
    power: facts.power,
    counter: facts.counter,
    colors: facts.colors,
    types: facts.types,
    attribute: facts.attribute,
    keywords: facts.keywords,
    donRequirement: facts.donRequirement,
    hasTrigger: facts.hasTrigger,
  };
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(table)}\n`);
process.stderr.write(`${Object.keys(table).length} cards -> ${out}\n`);
