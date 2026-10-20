import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UNIMPLEMENTED_CLAUSES, cardRegistry } from "@one-piece-sim/cards";
import {
  STATIC_ABILITIES,
  mechanicProgramCards,
  mechanicProgramsByClause,
} from "@one-piece-sim/engine-core";

/**
 * A coverage ratchet for card support.
 *
 * Two paths implement card behaviour. The declarative one -- mechanic programs
 * in `engine-core/src/mechanics/<set>.ts` and rows in `mechanics/<set>-static.ts`
 * -- is the one
 * `.claude/skills/add-card-support` tells you to reach for. The imperative one
 * is a `cardNumber === "…"` branch inside `engine.ts` or `effects.ts`, and it
 * costs roughly four times as many touched files per card.
 *
 * Nothing previously distinguished them, so the split was only discoverable by
 * grepping. These tests make it a number that can only go down:
 *
 *  - Every card with printed timing text must be claimed by a registry or be
 *    listed below. A *new* card therefore cannot take the imperative path
 *    without an explicit, reviewable edit to this list.
 *  - The list may not grow.
 *  - The list may not contain a card that a registry already claims, so
 *    migrating a card forces its removal and the count stays honest.
 */

/**
 * Printed markers that mean "this card does something the engine must run".
 *
 * Deliberately syntactic. Any clause the engine has to schedule is written in
 * one of these brackets, so a card that carries none of them and no Trigger is
 * vanilla and needs no handler.
 */
const TIMING_MARKERS = [
  "[On Play]",
  "[On K.O.]",
  "[Activate: Main]",
  "[When Attacking]",
  "[Main]",
  "[Counter]",
  "[On Your Opponent's Attack]",
  "[On Opponent's Attack]",
  "[On Block]",
  "[When Blocking]",
  "[End of Your Turn]",
  "[End of Turn]",
  "[On Your Turn]",
  "[Your Turn]",
  "[Opponent's Turn]",
  "[Once Per Turn]",
] as const;

/**
 * Cards still implemented as card-number branches in `engine.ts`/`effects.ts`.
 *
 * This is a debt register, not a design. Every entry removed from it is one
 * card moved onto the mechanic DSL. Do not add to it: if a new card cannot be
 * expressed declaratively, that is a signal to extend the DSL (see
 * `MechanicEffect` in `mechanics.ts`), not to grow this list.
 */
const LEGACY_IMPERATIVE_CARDS: readonly string[] = [
  "EB03-032",
  "EB03-035",
  "OP01-016",
  "OP02-068",
  "OP04-016",
  "OP10-036",
  "OP10-099",
  "OP10-103",
  "OP10-109",
  "OP10-111",
  "OP11-009",
  "OP11-062",
  "OP11-079",
  "OP12-031",
  "OP12-047",
  "OP12-057",
  "OP12-071",
  "OP12-090",
  "OP12-113",
  "OP13-017",
  "OP15-036",
  "OP15-058",
  "OP16-026",
  "OP16-045",
  "OP16-048",
  "P-085",
  "P-088",
  "P-090",
  "P-101",
  "ST24-005",
  "ST31-002",
  "ST32-001",
  "ST32-002",
  "ST32-003",
  "ST33-001",
  "ST33-002",
  "ST33-003",
  "ST33-005",
  "ST34-001",
  "ST34-002",
  "ST34-003",
  "ST34-004",
  "ST34-005",
  "ST35-001",
  "ST35-003",
  "ST36-001",
  "ST36-002",
  "ST36-003",
  "ST36-004",
];

/** Ratchet. Lower this as cards migrate; never raise it. */
const IMPERATIVE_BUDGET = 50;

/**
 * Printed clauses nothing in the engine runs.
 *
 * The register the coverage checks below were missing. `LEGACY_IMPERATIVE_CARDS`
 * exempts a card from the declarative registries on the promise that an
 * `engine.ts`/`effects.ts` branch handles it, and nothing checked the promise:
 * OP14-104 and OP16-119 sat in that list with no branch anywhere, so two 8-cost
 * Characters resolved as vanilla bodies while the suite stayed green. Every
 * entry here is a clause a player can read on a card and the engine will not
 * honour, so it must be small, explicit, and shrinking.
 *
 * The list itself lives in `@one-piece-sim/cards` so that everything reading a
 * card's printed text can see the gap: the LLM prompt renders each entry as an
 * `<unimplemented>` note, because an agent that plans around a clause the
 * engine drops loses games to it.
 */

/**
 * Ratchet. This list may only shrink, and it is now empty: every printed clause
 * on every card in every shipped deck resolves.
 */
const UNIMPLEMENTED_CLAUSE_BUDGET = 0;

/**
 * Files where a card-number branch counts as an imperative implementation.
 *
 * Everything under `engine-core/src` except the declarative path: the per-set
 * program modules in `mechanics/` and the dispatch seam that reads them. The
 * `actions/` handlers are included -- a `cardNumber === "..."` branch is just as
 * imperative for having moved out of `applyAction` into `actions/attack.ts`.
 */
function imperativeSources(): string {
  const root = "packages/engine-core/src";
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "mechanics") walk(path);
      } else if (
        entry.name.endsWith(".ts") &&
        entry.name !== "card-mechanics.ts"
      ) {
        files.push(path);
      }
    }
  };
  walk(root);
  return files.map((file) => readFileSync(file, "utf8")).join("\n");
}

function clauseIsAcknowledged(cardNumber: string, clause: string): boolean {
  return UNIMPLEMENTED_CLAUSES.some(
    (entry) => entry.cardNumber === cardNumber && entry.clause === clause,
  );
}

function requiresHandler(cardNumber: string): boolean {
  const card = cardRegistry.get(cardNumber);
  if (!card) return false;
  return (
    TIMING_MARKERS.some((marker) => card.rules.tokens.includes(marker)) ||
    card.rules.hasTrigger
  );
}

function registryClaimed(): ReadonlySet<string> {
  return new Set([
    ...mechanicProgramCards(),
    ...STATIC_ABILITIES.map((ability) => ability.cardNumber),
  ]);
}

describe("card support coverage", () => {
  it("every card with printed timing text has a registered handler", () => {
    const claimed = registryClaimed();
    const acknowledged = new Set([
      ...LEGACY_IMPERATIVE_CARDS,
      // A card whose only clauses are declared gaps is accounted for by
      // UNIMPLEMENTED_CLAUSES and checked clause by clause below.
      ...UNIMPLEMENTED_CLAUSES.map((entry) => entry.cardNumber),
    ]);
    const orphans = [...cardRegistry.keys()]
      .filter(requiresHandler)
      .filter((number) => !claimed.has(number) && !acknowledged.has(number))
      .sort();

    // An orphan is a card whose text the engine may be silently ignoring.
    // Implement it as a mechanic program, or add it to LEGACY_IMPERATIVE_CARDS
    // with the branch that handles it.
    expect(orphans).toEqual([]);
  });

  it("every acknowledged imperative card has a branch to point at", () => {
    const sources = imperativeSources();
    const absent = LEGACY_IMPERATIVE_CARDS.filter(
      (cardNumber) => !sources.includes(`"${cardNumber}"`),
    );

    // An entry with no branch is a card exempted from the registries for a
    // handler that does not exist. Implement it, or move the clause into
    // UNIMPLEMENTED_CLAUSES so the gap is declared rather than hidden.
    expect(absent).toEqual([]);
  });

  it("every printed clause has a handler for that clause's timing", () => {
    const byClause = new Map(mechanicProgramsByClause());
    // A static row that declares the timed clause it implements is that
    // clause's handler too.
    for (const ability of STATIC_ABILITIES) {
      if (!ability.implementsClause) continue;
      byClause.set(
        ability.implementsClause,
        new Set([
          ...(byClause.get(ability.implementsClause) ?? []),
          ability.cardNumber,
        ]),
      );
    }
    const sources = imperativeSources();
    const gaps: string[] = [];
    for (const [cardNumber, card] of cardRegistry) {
      // An imperative branch is opaque: it cannot say which clause it covers,
      // so a card with one is only checked by the test above.
      if (sources.includes(`"${cardNumber}"`)) continue;
      for (const [clause, claimed] of byClause) {
        // `clauses` rather than `tokens`: a marker a card *mentions* is not a
        // clause the card prints, and only the first reading can tell the two
        // apart. EB03-001's activation hands [Rush] to a Character "without a
        // [When Attacking] effect" and EB03-031 resolves "the [Main] effect" of
        // an Event in the trash -- neither card fires in the window it names,
        // so demanding a handler for it would demand a handler for a clause the
        // card does not have. `printedClausesOf` drops those; `tokens` is every
        // bracketed string in the text and keeps them.
        const printed =
          clause === "[Trigger]"
            ? card.rules.hasTrigger
            : card.rules.clauses.includes(clause);
        if (!printed || claimed.has(cardNumber)) continue;
        if (clauseIsAcknowledged(cardNumber, clause)) continue;
        gaps.push(`${cardNumber} ${clause}`);
      }
    }

    // A clause here is text a player can read and the engine ignores. Register
    // a program for that timing, or add it to UNIMPLEMENTED_CLAUSES.
    expect(gaps).toEqual([]);
  });

  it("the acknowledged clause gaps do not grow", () => {
    expect(UNIMPLEMENTED_CLAUSES.length).toBeLessThanOrEqual(
      UNIMPLEMENTED_CLAUSE_BUDGET,
    );
  });

  it("the imperative tail does not grow", () => {
    expect(LEGACY_IMPERATIVE_CARDS.length).toBeLessThanOrEqual(
      IMPERATIVE_BUDGET,
    );
  });

  it("the debt register lists no card a registry already claims", () => {
    const claimed = registryClaimed();
    const migrated = LEGACY_IMPERATIVE_CARDS.filter((number) =>
      claimed.has(number),
    );

    // These cards moved onto the declarative path. Delete them from
    // LEGACY_IMPERATIVE_CARDS and lower IMPERATIVE_BUDGET to match.
    expect(migrated).toEqual([]);
  });

  it("every listed card still exists in the registry", () => {
    const unknown = LEGACY_IMPERATIVE_CARDS.filter(
      (number) => !cardRegistry.has(number),
    );
    expect(unknown).toEqual([]);
  });
});
