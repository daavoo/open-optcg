/**
 * Writes each card's structured features -- derived from the repo alone, no
 * printed text -- as JSON keyed by card number, for the scorer's `CardRules`
 * embeddings (CARD-REPRESENTATION.md step 3).
 *
 *   pnpm exec tsx ml/bridge/card-features.ts ml/data/card-features.json
 *
 * Per card: `tokens`, a bag of categorical features, and `numbers`, the
 * figures fed through a small MLP. The tokens are the card's facts
 * (category, colours, types, keywords), its printed clauses and the flags
 * `rules-derivation.ts` derives, and -- the part a card's name and stats do
 * not carry -- what each clause's engine program does: every node kind the
 * program reaches (`[On Play]:knock-out`) and every zone its selectors read
 * (`[On Play]@opponent:board`). A card the engine runs imperatively has no
 * program here and keeps only the rest.
 *
 * Kept out of `cards.json` because the card text encoding reads that file:
 * adding a field there would change every existing checkpoint's input.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { cardFacts, cardRegistry } from "@one-piece-sim/cards";
import {
  getActivateMainProgram,
  getCounterEventProgram,
  getEventMainProgram,
  getLeaderWatcherProgram,
  getOnEndOfYourTurnMechanicProgram,
  getOnKoMechanicProgram,
  getOnOpponentAttackProgram,
  getOnPlayMechanicProgram,
  getTriggerMechanicProgram,
  getWhenAttackingMechanicProgram,
  getWhenRestedProgram,
} from "../../packages/engine-core/src/card-mechanics.js";

const PROGRAMS: [string, (card: string) => unknown][] = [
  ["[On Play]", getOnPlayMechanicProgram],
  ["[On K.O.]", getOnKoMechanicProgram],
  ["[End of Your Turn]", getOnEndOfYourTurnMechanicProgram],
  ["[Activate: Main]", getActivateMainProgram],
  ["[When Attacking]", getWhenAttackingMechanicProgram],
  ["[When Rested]", getWhenRestedProgram],
  ["[Main]", getEventMainProgram],
  ["[Counter]", getCounterEventProgram],
  ["[Trigger]", getTriggerMechanicProgram],
  ["[On Your Opponent's Attack]", getOnOpponentAttackProgram],
  ["leader", getLeaderWatcherProgram],
];

/** Every `kind`, and every `player`/`zone` pair a selector names, under `clause`. */
function programTokens(clause: string, program: unknown, into: Set<string>) {
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.kind === "string") into.add(`${clause}:${record.kind}`);
    if (typeof record.zone === "string")
      into.add(
        `${clause}@${typeof record.player === "string" ? record.player : "any"}:${record.zone}`,
      );
    for (const value of Object.values(record)) walk(value);
  };
  walk(program);
}

const FLAGS = [
  "hasTrigger",
  "hasCounterEvent",
  "hasPrintedEffect",
  "identityWildcard",
  "cannotAttack",
  "mentionsCannotAttack",
  "survivesEmptyDeck",
  "winsOnEmptyDeck",
  "searchRevealPublic",
  "eventRestricted",
  "triggerIsDeadWeightDebuff",
  "buffsAllCharacters",
  "koClauseMentionsLife",
  "addsDonFromDonDeck",
  "eventConditionDependsOnPool",
  "removalText",
  "advantageText",
] as const;

const out = process.argv[2] ?? "ml/data/card-features.json";
const table: Record<string, { tokens: string[]; numbers: number[] }> = {};
for (const cardNumber of [...cardRegistry.keys()].sort()) {
  const facts = cardFacts(cardNumber);
  const rules = facts.rules;
  const tokens = new Set<string>([`category:${facts.category}`]);
  for (const color of facts.colors) tokens.add(`color:${color}`);
  for (const type of facts.types) tokens.add(`type:${type}`);
  if (facts.attribute) tokens.add(`attribute:${facts.attribute}`);
  for (const keyword of rules.keywords) tokens.add(`keyword:${keyword}`);
  for (const clause of rules.clauses) tokens.add(`clause:${clause}`);
  for (const marker of rules.tokens) tokens.add(`marker:${marker}`);
  for (const flag of FLAGS) if (rules[flag]) tokens.add(`flag:${flag}`);
  for (const [clause, summary] of Object.entries(rules.clauseSummaries)) {
    if (summary.cost) tokens.add(`${clause}:has-cost`);
    if (summary.power) tokens.add(`${clause}:grants-power`);
  }
  if (rules.costBoosts.length > 0) tokens.add("flag:costBoost");
  if (rules.deckTypeRestriction) tokens.add("flag:deckTypeRestriction");
  if (rules.copyLimit !== 4) tokens.add(`copy-limit:${rules.copyLimit}`);
  for (const [clause, get] of PROGRAMS) {
    const program = get(cardNumber);
    if (program) programTokens(clause, program, tokens);
  }
  table[cardNumber] = {
    tokens: [...tokens].sort(),
    numbers: [
      facts.cost,
      facts.power / 1000,
      facts.counter / 1000,
      rules.donRequirement,
    ],
  };
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(table)}\n`);
const vocab = new Set(Object.values(table).flatMap((entry) => entry.tokens));
process.stderr.write(
  `${Object.keys(table).length} cards, ${vocab.size} distinct tokens -> ${out}\n`,
);
