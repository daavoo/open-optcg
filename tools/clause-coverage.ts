/**
 * Which printed clause of which card has a scenario test, and which does not.
 *
 * This is the repo's evidence gate. Tests declare what they exercise with
 * `covers()` from `test/support`, and the required set is derived from the
 * printed text, so a card that enters the format through `pnpm reference:audit`
 * arrives with its clauses already demanded and no test to satisfy them. Every
 * requirement here is checked against a file on disk, which is why this
 * replaced the old certification matrix's derived `<deck>:<card>:positive`
 * evidence ids -- those were claims no file had to honour.
 *
 * Static on purpose. Vitest runs files in separate workers, so a runtime
 * registry could only ever see the clauses of the files that happened to run;
 * reading the annotations off disk sees all of them, and `--check` can fail a
 * card whose test file was deleted.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  printedClauses,
  requireKnownCard,
  type ClauseId,
} from "@one-piece-sim/cards";
import { deckManifests, SELECTABLE_DECK_IDS } from "@one-piece-sim/decks";

import { clauseCoverageGaps } from "./clause-coverage-gaps.js";

const TEST_DIR = path.join(process.cwd(), "test");

export interface ClauseRequirement {
  cardNumber: string;
  name: string;
  clause: ClauseId;
  /** Every deck that ships the card, so a gap says whose deck it holds back. */
  deckIds: readonly string[];
  /** Test files whose `covers()` annotations claim this clause. */
  coveredBy: readonly string[];
  /** An accepted gap carries the reason it is accepted. */
  acceptedGap?: string;
}

/** `covers("OP17-084", "[On Play]", "static")` in any test file. */
const COVERS_CALL =
  /\bcovers\(\s*("(?:[^"\\]|\\.)*"(?:\s*,\s*"(?:[^"\\]|\\.)*")*)\s*,?\s*\)/gs;

function testFiles(dir: string = TEST_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(full);
    return entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

/** Card number -> clause ids -> the test files annotating them. */
export function annotatedCoverage(): Map<string, Map<string, string[]>> {
  const coverage = new Map<string, Map<string, string[]>>();
  for (const file of testFiles()) {
    const relative = path.relative(process.cwd(), file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(COVERS_CALL)) {
      const args = [...(match[1] ?? "").matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(
        (arg) => arg[1] ?? "",
      );
      const [cardNumber, ...clauses] = args;
      if (!cardNumber) continue;
      const byClause = coverage.get(cardNumber) ?? new Map<string, string[]>();
      for (const clause of clauses) {
        byClause.set(clause, [...(byClause.get(clause) ?? []), relative]);
      }
      coverage.set(cardNumber, byClause);
    }
  }
  return coverage;
}

/**
 * Every card that ships in a deck this repo claims to play, with its decks.
 *
 * Derived from `SELECTABLE_DECK_IDS` -- the field a game can actually be set up
 * from -- rather than from `deckCardRows`. The provenance table answers a
 * different question ("where did this printed text come from"), and only
 * format and community decks have rows in it: the hand-built decks in
 * `packages/decks/src/index.ts` contribute none. That is not a small hole. The
 * Green/Blue Impel Down Luffy feature deck is selectable in the app, has its own
 * rules policy and its own LLM dossier, and every one of its fifty cards sat
 * outside this gate -- including OP16-034's `[DON!! x1]` power clause, which the
 * deck's whole plan is built on and which had no test at all while
 * `--check` reported zero gaps.
 */
export function coveredIdentities(): Map<string, string[]> {
  const identities = new Map<string, string[]>();
  for (const deckId of SELECTABLE_DECK_IDS) {
    const manifest = deckManifests[deckId];
    if (!manifest) continue;
    for (const cardNumber of [
      manifest.leader,
      ...Object.keys(manifest.cards),
    ]) {
      identities.set(cardNumber, [
        ...new Set([...(identities.get(cardNumber) ?? []), deckId]),
      ]);
    }
  }
  return identities;
}

export function clauseCoverage(): ClauseRequirement[] {
  const annotated = annotatedCoverage();
  return [...coveredIdentities()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([cardNumber, deckIds]) =>
      printedClauses(cardNumber).map((clause) => {
        const coveredBy = annotated.get(cardNumber)?.get(clause) ?? [];
        const accepted = clauseCoverageGaps[`${cardNumber}:${clause}`];
        return {
          cardNumber,
          name: requireKnownCard(cardNumber).name,
          clause,
          deckIds,
          coveredBy,
          ...(accepted === undefined ? {} : { acceptedGap: accepted }),
        };
      }),
    );
}

/** Clauses with no test and no accepted reason for having none. */
export function clauseCoverageErrors(
  requirements: readonly ClauseRequirement[] = clauseCoverage(),
): string[] {
  const errors = requirements
    .filter(
      (requirement) =>
        requirement.coveredBy.length === 0 &&
        requirement.acceptedGap === undefined,
    )
    .map(
      (requirement) =>
        `${requirement.cardNumber} ${requirement.name}: ${requirement.clause} has no covers() annotation (${requirement.deckIds.join(", ")})`,
    );

  // A stale accepted gap is a lie in the other direction: the ledger says the
  // clause is untested when a test now covers it, so the next reader trusts a
  // list that has already rotted.
  for (const requirement of requirements) {
    if (
      requirement.acceptedGap !== undefined &&
      requirement.coveredBy.length > 0
    ) {
      errors.push(
        `${requirement.cardNumber}:${requirement.clause}: accepted gap is stale -- ${requirement.coveredBy.join(", ")} covers it; drop it from clause-coverage-gaps.ts`,
      );
    }
  }

  // An annotation for a clause the card does not print means the test is
  // asserting on text that moved or never existed.
  const required = new Set(
    requirements.map(
      (requirement) => `${requirement.cardNumber}:${requirement.clause}`,
    ),
  );
  for (const [cardNumber, byClause] of annotatedCoverage()) {
    if (!coveredIdentities().has(cardNumber)) continue;
    for (const [clause, files] of byClause) {
      if (!required.has(`${cardNumber}:${clause}`)) {
        errors.push(
          `${cardNumber}:${clause}: annotated by ${files.join(", ")} but the card does not print it`,
        );
      }
    }
  }

  for (const key of Object.keys(clauseCoverageGaps)) {
    if (!required.has(key)) {
      errors.push(`${key}: accepted gap names a clause no deck card prints`);
    }
  }

  return errors;
}

function main(): void {
  const requirements = clauseCoverage();
  const errors = clauseCoverageErrors(requirements);
  if (process.argv.includes("--check")) {
    if (errors.length === 0) {
      const covered = requirements.filter((r) => r.coveredBy.length > 0).length;
      process.stdout.write(
        `Clause coverage: ${covered}/${requirements.length} printed clauses have a scenario test, ${requirements.length - covered} accepted gaps\n`,
      );
      return;
    }
    process.stderr.write(`${errors.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, requirements, errors }, null, 2)}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]))
) {
  main();
}
