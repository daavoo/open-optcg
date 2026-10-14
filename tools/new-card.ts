/**
 * `pnpm new:card OP17-042` -- scaffold the files a card needs.
 *
 * Adding a card means an entry in the right per-set mechanics module and a
 * scenario test, both following conventions that are otherwise only discoverable
 * by reading a neighbouring 2,000-line module. This writes both, keyed off the
 * card's printed text: one stub per printed clause that has no program yet.
 *
 * The stub deliberately does not compile. It references `SCAFFOLD`, which does
 * not exist, so `pnpm verify` fails until the program is actually written --
 * a half-filled scaffold cannot be committed by accident, and the failure names
 * the file and line to finish.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import {
  printedText,
  cardRegistry,
  printedClauses,
} from "@one-piece-sim/cards";
import { loadPrintedTextCache } from "@one-piece-sim/cards/node";

// The scaffold quotes the card's printed text, and the words are a runtime
// asset rather than data in the repo -- so they have to be read off the
// gitignored cache the audit writes, exactly as `pnpm card:text` and the test
// suite's setup do. Without this the tool reported every card as having "no
// printed text in this checkout" even with the cache sitting on disk.
loadPrintedTextCache();

const CARDS_DIR = "packages/cards/src";
const MECHANICS_DIR = "packages/engine-core/src/mechanics";

/** Printed marker -> the `SetMechanics` key that dispatches it. */
const CLAUSES = [
  { marker: "[On Play]", key: "onPlay" },
  { marker: "[On K.O.]", key: "onKo" },
  { marker: "[Activate: Main]", key: "activateMain" },
  { marker: "[When Attacking]", key: "whenAttacking" },
  { marker: "[Counter]", key: "counterEvent" },
  { marker: "[On Your Opponent's Attack]", key: "onOpponentAttack" },
  { marker: "[On Opponent's Attack]", key: "onOpponentAttack" },
  { marker: "[End of Your Turn]", key: "onEndOfYourTurn" },
  { marker: "[Main]", key: "eventMain" },
] as const;

/** Which mechanics module a card's set module maps to. */
const MODULE_FOR_CARDS_FILE: Record<string, string> = {
  "op12-rosinante": "op12-rosinante",
  "op16-enel": "op16-enel",
  "op16-luffy": "op16-luffy",
  "op16-nami": "op16-nami",
  "st21-cards": "st21",
  "st31-upgrades": "format",
  "sealed-promo": "format",
  generated: "format",
  "generated-community": "format",
};

/**
 * Card-number prefixes whose set has a mechanics module of its own, consulted
 * ahead of {@link MODULE_FOR_CARDS_FILE}.
 *
 * Every community identity now lands in `generated-community.ts`, which maps to
 * `format` -- right for a one-off single, wrong for a set that ships as a deck
 * and has its own module. ST-26 is the first: five exclusives in
 * `mechanics/st26.ts`. ST-27 followed with `mechanics/st27.ts`, which also
 * carries the PRB-02 and EB-01 singles its recommended list plays -- those keep
 * their own prefixes and so are not reachable from this table.
 */
const MODULE_FOR_PREFIX: Record<string, string> = {
  ST26: "st26",
  ST27: "st27",
};

/** OP17 is split by timing window; see `mechanics/README.md`. */
const OP17_MODULE: Record<string, string> = {
  onPlay: "op17-on-play",
  eventMain: "op17-main",
  activateMain: "op17-main",
  counterEvent: "op17-battle",
  onOpponentAttack: "op17-battle",
  leaderWatcher: "op17-battle",
  whenAttacking: "op17-battle",
  trigger: "op17-triggers",
  onKo: "op17-triggers",
  onEndOfYourTurn: "op17-triggers",
};

function cardsFileFor(cardNumber: string): string {
  for (const file of readdirSync(CARDS_DIR)) {
    if (!file.endsWith(".ts")) continue;
    if (
      readFileSync(`${CARDS_DIR}/${file}`, "utf8").includes(
        `cardNumber: "${cardNumber}"`,
      )
    ) {
      return file.slice(0, -3);
    }
  }
  throw new Error(
    `${cardNumber} is not in any card module. Card data is generated: run \`pnpm reference:fetch\` and \`pnpm reference:audit\`, or add the identity to a community set module first.`,
  );
}

function moduleFor(
  cardsFile: string,
  clauseKey: string,
  cardNumber: string,
): string {
  const byPrefix = MODULE_FOR_PREFIX[cardNumber.split("-")[0] ?? ""];
  if (byPrefix) return byPrefix;
  if (cardsFile.startsWith("op17")) {
    return OP17_MODULE[clauseKey] ?? "op17-on-play";
  }
  const module = MODULE_FOR_CARDS_FILE[cardsFile];
  if (!module) {
    throw new Error(
      `no mechanics module maps to ${cardsFile}.ts. Add one under ${MECHANICS_DIR}/, register it in index.ts, and add the mapping to tools/new-card.ts.`,
    );
  }
  return module;
}

/** The text of one clause's entry array, or undefined when the clause is absent. */
function clauseBlock(source: string, key: string): string | undefined {
  const start = source.indexOf(`  ${key}: [\n`);
  if (start === -1) return undefined;
  const end = source.indexOf("\n  ],", start);
  return source.slice(start, end === -1 ? undefined : end);
}

/** Inserts an entry as the first element of `key`'s array, adding the array if absent. */
function insertEntry(path: string, key: string, entry: string): void {
  const source = readFileSync(path, "utf8");
  const marker = `  ${key}: [\n`;
  if (source.includes(marker)) {
    writeFileSync(path, source.replace(marker, marker + entry));
    return;
  }
  const opening = source.indexOf("= {\n");
  if (opening === -1)
    throw new Error(`cannot find the SetMechanics literal in ${path}`);
  const at = opening + "= {\n".length;
  writeFileSync(
    path,
    `${source.slice(0, at)}  ${key}: [\n${entry}  ],\n${source.slice(at)}`,
  );
}

function main(): void {
  const [cardNumber] = process.argv.slice(2);
  if (!cardNumber) {
    console.error(
      "usage: pnpm new:card <CARD-NUMBER>   e.g. pnpm new:card OP17-042",
    );
    process.exit(2);
  }

  const card = cardRegistry.get(cardNumber);
  if (!card) {
    console.error(
      `${cardNumber} has no card data yet. Card text is generated from Bandai's list: run \`pnpm reference:fetch\` then \`pnpm reference:audit\`.`,
    );
    process.exit(1);
  }

  const text = printedText(cardNumber);
  if (!text) {
    console.error(
      `${cardNumber} has rules but no printed text in this checkout. The scaffold quotes the text it implements: run \`pnpm reference:fetch\` then \`pnpm reference:audit\` to fill the text cache.`,
    );
    process.exit(1);
  }
  const printed = `${text.effect} ${text.trigger}`;
  const wanted = new Set<string>();
  for (const { marker, key } of CLAUSES) {
    if (text.effect.includes(marker)) wanted.add(key);
  }
  if (text.trigger.trim().length > 0) wanted.add("trigger");

  if (wanted.size === 0) {
    console.log(
      `${cardNumber} ${card.name} prints no timing clause -- it is vanilla and needs no program. Nothing to scaffold.`,
    );
    return;
  }

  const cardsFile = cardsFileFor(cardNumber);
  const touched: string[] = [];
  for (const key of wanted) {
    const module = moduleFor(cardsFile, key, cardNumber);
    const path = `${MECHANICS_DIR}/${module}.ts`;
    // Per clause, not per file: a card with two clauses in the same module
    // needs an entry in each of them.
    const existing = clauseBlock(readFileSync(path, "utf8"), key);
    if (existing?.includes(`"${cardNumber}"`)) {
      console.log(
        `- ${module}.ts already registers ${cardNumber} for ${key}; left alone`,
      );
      continue;
    }
    const quoted = (key === "trigger" ? text.trigger : text.effect).trim();
    const entry = `    [
      // ${cardNumber} ${card.name}, ${key}. Printed:
      // "${quoted.replace(/\n/g, " ")}"
      //
      // Say why the program reads the way it does -- the printed text above is
      // the specification, and the next reader needs the reasoning, not a
      // restatement. Then delete SCAFFOLD, which exists only to fail the build
      // until this is finished.
      "${cardNumber}",
      SCAFFOLD,
    ],
`;
    insertEntry(path, key, entry);
    touched.push(`${path} (${key})`);
  }

  const testPath = `test/${cardNumber.toLowerCase()}.test.ts`;
  if (!existsSync(testPath)) {
    writeFileSync(
      testPath,
      `import { describe, expect, it } from "vitest";
import { cardFacts, requireKnownCard } from "@one-piece-sim/cards";
import { character, covers, scenario } from "./support/index.js";

/**
 * ${cardNumber} ${card.name}
 *
 * Printed: ${printed.trim().replace(/\n/g, " ")}
 *
 * Drive the engine to the decision and assert on the resulting events and
 * state, not on prose. See test/support/README.md for the builder.
 *
 * One \`covers()\` per printed clause, next to the case that drives it.
 * \`pnpm coverage:clauses --check\` fails while a clause of a deck card has
 * none, so this list is the card's definition of done.
 */
describe("${cardNumber} ${card.name}", () => {
  it("registers with its printed profile", () => {
    expect(requireKnownCard("${cardNumber}").name).toBe("${card.name}");
    expect(cardFacts("${cardNumber}").cost).toBe(${card.cost ?? 0});
    expect(cardFacts("${cardNumber}").power).toBe(${card.power ?? 0});
  });

${printedClauses(cardNumber)
  .map((clause) => `  covers("${cardNumber}", "${clause}");\n`)
  .join("")}  it("resolves its printed clause", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", "(Green) Roronoa Zoro - Starter Deck 32")
      .seed("${cardNumber.toLowerCase()}")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("source", "${cardNumber}")])
      .build();

    // Replace with the decision this card creates: play it, attack with it, or
    // activate it, then assert on what changed.
    expect(game.state.players.p1.board).toHaveLength(1);
  });
});
`,
    );
    touched.push(testPath);
  } else {
    console.log(`- ${testPath} already exists; left alone`);
  }

  console.log(`scaffolded ${cardNumber} ${card.name}:`);
  for (const file of touched) console.log(`  ${file}`);
  console.log(`
Next:
  1. Replace each SCAFFOLD with the program. \`pnpm typecheck\` fails until you do.
  2. Fill in the test's second case with the decision the card creates.
  3. pnpm test:card ${cardNumber} && pnpm verify`);
}

main();
