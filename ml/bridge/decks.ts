/**
 * The decks System-1 trains and evaluates on: the selectable catalog, plus
 * lists that exist only here.
 *
 * A deck added to `@one-piece-sim/decks` is a deck the app offers, and a list
 * a maintainer wants the model to have played is not necessarily one a player
 * should be shown. These manifests live beside the bridge instead, and every
 * bridge tool that draws or resolves a deck goes through this module, so the
 * catalog stays the app's and the pool stays the trainer's.
 */
import { readFileSync } from "node:fs";
import type { Agent } from "@one-piece-sim/agents/local";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import {
  SELECTABLE_DECK_IDS,
  deckDivision,
  deckManifests,
  resolveDeck,
  type DeckDivision,
  type DeckManifest,
} from "@one-piece-sim/decks";
import type { ResolvedDeck } from "@one-piece-sim/protocol";
import { createRulesAgent } from "../../packages/cli/src/agent-factory.js";
import { SCANNED_LISTS, SCANNED_VARIANTS } from "./deck-pool-scan.js";
import { DECK_VARIANTS, variantId } from "./deck-variants.js";

const LISTS: Record<string, DeckManifest> = {
  // Red ST21-001 Luffy, supplied by the maintainer on 28 Sep 2026 and revised
  // on 13 Oct 2026 (the 28 Sep list and the Buggy build are variants). Same
  // Leader as ST-31, so `st31-policy.ts` pilots it.
  daavoo: {
    id: "daavoo",
    leader: "ST21-001",
    cards: {
      "EB04-002": 4,
      "OP01-016": 4,
      "OP04-016": 2,
      "OP10-005": 3,
      "OP10-011": 3,
      "ST21-003": 4,
      "ST21-012": 3,
      "ST21-014": 4,
      "ST21-015": 4,
      "ST31-001": 4,
      "ST31-002": 4,
      "ST31-003": 3,
      "ST31-004": 4,
      "ST31-005": 4,
    },
  },
  // Purple/Black OP09-061 Luffy, supplied by the maintainer on 28 Sep 2026 and
  // revised on 5 and 9 Oct 2026. Same Leader as ST-26, so
  // `st26-luffy-policy.ts` pilots it.
  mon: {
    id: "mon",
    leader: "OP09-061",
    cards: {
      "EB02-061": 4,
      "OP05-074": 4,
      "OP08-067": 4,
      "OP08-119": 2,
      "OP09-065": 2,
      "OP09-069": 4,
      "OP09-072": 4,
      "OP09-076": 4,
      "OP09-077": 4,
      "OP09-078": 4,
      "OP09-119": 2,
      "OP16-069": 4,
      "ST26-003": 4,
      "ST26-005": 4,
    },
  },
  // Purple OP12-061 Rosinante, 2nd of 120 (6-1) for FlyestRaven at [EB05]
  // ChinoizeCup #125 on 20 Oct 2026, an online event that allowed EB-05 ahead
  // of its release (https://play.limitlesstcg.com/tournament/6ad092328a8383117e3ec30c/standings).
  // No selectable deck fronts this Leader, so it trains as a list of its own;
  // it plays four P-093 Trafalgar Law and four EB05-040.
  "op12-061-eb05": {
    id: "op12-061-eb05",
    leader: "OP12-061",
    cards: {
      "EB03-062": 1,
      "EB04-038": 4,
      "EB04-058": 4,
      "EB05-034": 2,
      "EB05-040": 4,
      "OP07-076": 1,
      "OP10-065": 4,
      "OP12-115": 4,
      "OP13-076": 1,
      "OP15-078": 4,
      "OP16-064": 2,
      "OP16-065": 4,
      "OP16-078": 4,
      "P-088": 4,
      "P-093": 4,
      "ST10-010": 3,
    },
  },
  // Purple OP15-058 Enel, the Europe Championship 26-27 S1 winner ("Frle",
  // Utrecht, 6 Sep 2026, read off onepiecetopdecks.com's OP-17 `deckgen`
  // record and checked against Bandai's decklist graphic). It was the
  // Leader's Community list until the Store Battle build the model wins more
  // with replaced it there; it stays here under its old id because the meta
  // field (`meta-decks.txt`), checkpoints and its variants name it.
  "(Purple) Enel - 1st Place EU Championship 26-27 S1": {
    id: "(Purple) Enel - 1st Place EU Championship 26-27 S1",
    format: "standard",
    leader: "OP15-058",
    cards: {
      "OP05-077": 3,
      "OP07-064": 1,
      "OP09-077": 1,
      "OP10-067": 3,
      "OP12-071": 4,
      "OP13-076": 1,
      "OP15-061": 4,
      "OP15-066": 2,
      "OP15-067": 4,
      "OP15-071": 3,
      "OP15-074": 3,
      "OP15-075": 4,
      "OP15-076": 4,
      "OP15-077": 4,
      "OP15-078": 4,
      "OP15-118": 2,
      "ST10-010": 3,
    },
  },
  // Yellow OP07-097 Vegapunk, 1st (3-0) for "RyByte" at a Store Battle at Sci
  // Fi Factory (US) on 3 Aug 2025, off onepiecetopdecks.com's EB-02 page. It
  // was the Leader's Community list until the 2026-06-19 Store Battle build
  // replaced it there; it stays here under its old id because checkpoints and
  // its variants name it.
  "(Yellow) Vegapunk - 1st Place Store Battle": {
    id: "(Yellow) Vegapunk - 1st Place Store Battle",
    format: "standard",
    leader: "OP07-097",
    cards: {
      "EB02-054": 2,
      "EB02-056": 4,
      "OP07-098": 4,
      "OP07-100": 4,
      "OP07-101": 4,
      "OP07-105": 4,
      "OP07-107": 3,
      "OP07-109": 3,
      "OP07-111": 4,
      "OP07-114": 2,
      "OP07-115": 4,
      "OP07-117": 2,
      "OP08-106": 4,
      "OP08-112": 1,
      "OP09-117": 2,
      "OP10-112": 2,
      "ST13-011": 1,
    },
  },
};

/**
 * Scratch lists for one run -- a list A/B's variants -- from the JSON file
 * `SYS1_EXTRA_DECKS` names ({id: {id, leader, cards}}). The bridge workers
 * inherit the variable, so every tool that resolves a deck sees them, and a
 * variant never has to be written into this file and taken out again.
 */
const extra = process.env.SYS1_EXTRA_DECKS;
const TRAINING_ONLY_DECKS: Record<string, DeckManifest> = {
  ...LISTS,
  ...SCANNED_LISTS,
  ...(extra
    ? (JSON.parse(readFileSync(extra, "utf8")) as Record<string, DeckManifest>)
    : {}),
};

export const TRAINING_DECK_IDS: readonly string[] = [
  ...SELECTABLE_DECK_IDS,
  ...Object.keys(TRAINING_ONLY_DECKS),
];

/** Each variant (`deck-variants.ts`) as a manifest under its base's Leader, by id. */
const VARIANTS: Record<string, { base: string; manifest: DeckManifest }> = {};
for (const variant of [...DECK_VARIANTS, ...SCANNED_VARIANTS]) {
  const id = variantId(variant);
  const leader = (
    TRAINING_ONLY_DECKS[variant.base] ?? deckManifests[variant.base]
  )?.leader;
  if (!leader)
    throw new Error(`deck variant ${id}: no training deck ${variant.base}`);
  VARIANTS[id] = {
    base: variant.base,
    manifest: { id, leader, cards: { ...variant.cards } },
  };
}

/** Variant ids by base deck, for training to draw from (`--variant-share`). */
export const TRAINING_DECK_VARIANTS: Readonly<Record<string, string[]>> =
  Object.entries(VARIANTS).reduce<Record<string, string[]>>(
    (out, [id, { base }]) => ({ ...out, [base]: [...(out[base] ?? []), id] }),
    {},
  );

/** The training deck a deck id belongs to: itself, or a variant's base. */
export function trainingBase(deckId: string): string {
  return VARIANTS[deckId]?.base ?? deckId;
}

/** A deck's list, from the catalog, the training-only lists or the variants. */
export function trainingManifest(deckId: string): DeckManifest | undefined {
  return (
    VARIANTS[deckId]?.manifest ??
    TRAINING_ONLY_DECKS[deckId] ??
    deckManifests[deckId]
  );
}

export function resolveTrainingDeck(deckId: string): ResolvedDeck {
  return resolveDeck(
    deckId,
    VARIANTS[deckId]?.manifest ?? TRAINING_ONLY_DECKS[deckId],
  );
}

/** A variant is piloted by its base deck's rules agent. */
export function createTrainingRulesAgent(deckId: string): Agent {
  const base = trainingBase(deckId);
  const manifest = TRAINING_ONLY_DECKS[base];
  return manifest
    ? new RegistryRulesAgent(manifest.leader)
    : createRulesAgent(base);
}

/** A training-only list is somebody's build, so it plays in "featured". */
export function trainingDeckDivision(deckId: string): DeckDivision {
  const base = trainingBase(deckId);
  return TRAINING_ONLY_DECKS[base] ? "featured" : deckDivision(base);
}
