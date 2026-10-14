/**
 * Replacement candidates for a list: cards legal under a Leader's colours that
 * other training lists run (so the model has trained with them), with cost,
 * power, Counter and keywords. With --cards, just those cards, known or not.
 *
 *   pnpm exec tsx research/system1/bridge/deck-candidates.ts --leader OP09-061 [--deck mon] [--cards OP05-070,EB01-039]
 *
 * No printed text here: read a candidate's effect from the local
 * printed-text pack (never commit it).
 */
import { cardRegistry } from "../../../packages/cards/src/index.js";
import { TRAINING_DECK_IDS, trainingManifest } from "./decks.js";

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const leader = flag("leader");
if (!leader)
  throw new Error(
    "usage: candidates.ts --leader <card> [--deck <id>] [--cards a,b]",
  );
const own = flag("deck");
const only = flag("cards")?.split(",");
const colors = new Set<string>(cardRegistry.get(leader)?.colors ?? []);
const decksWith = new Map<string, string[]>();
for (const id of TRAINING_DECK_IDS) {
  if (id === own) continue;
  const manifest = trainingManifest(id);
  if (!manifest) continue;
  for (const card of Object.keys(manifest.cards))
    decksWith.set(card, [...(decksWith.get(card) ?? []), id]);
}
const rows: string[][] = [];
for (const [number, card] of cardRegistry) {
  const cardColors = card.colors ?? [];
  if (only ? !only.includes(number) : !cardColors.every((c) => colors.has(c)))
    continue;
  if (card.category === "leader") continue;
  const decks = decksWith.get(number) ?? [];
  if (!only && decks.length === 0) continue;
  rows.push([
    number,
    card.name,
    card.category,
    String(card.cost ?? "-"),
    String(card.power ?? "-"),
    String(card.counter ?? "-"),
    card.rules.keywords.join(" "),
    cardColors.join("/"),
    String(decks.length),
    decks
      .slice(0, 2)
      .map((d) => d.replace(/ - .*/, ""))
      .join(", "),
  ]);
}
rows.sort((a, b) => Number(b[8]) - Number(a[8]));
console.log(
  "| Card | Name | Type | Cost | Power | Counter | Keywords | Colours | Other training lists | e.g. |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.join(" | ")} |`);
