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
  // Yellow OP05-098 Enel built for the OP-17 field, supplied as a card list by
  // the maintainer on 28 Sep 2026 without an event or pilot. It was the
  // Leader's Community list until the TCG Match Making OP17.5 #3 build the
  // model wins more with replaced it there; it stays here under its old id
  // because the meta field (`meta-decks.txt`), checkpoints and its variants
  // name it.
  "(Yellow) Enel - Open OPTCG": {
    id: "(Yellow) Enel - Open OPTCG",
    format: "standard",
    leader: "OP05-098",
    cards: {
      "EB01-056": 2,
      "OP11-106": 4,
      "OP17-107": 4,
      "OP17-109": 4,
      "OP15-113": 4,
      "OP17-102": 4,
      "EB04-058": 4,
      "OP17-106": 3,
      "OP17-114": 3,
      "OP16-119": 4,
      "OP17-112": 4,
      "OP06-115": 4,
      "EB01-059": 4,
      "OP06-117": 2,
    },
  },
  // Blue/Purple OP06-042 Vinsmoke Reiju, 1st (4-0) for "TheKlet_OPTCG" at a
  // Store Battle at goodgames (Australia) on 9 Jun 2025, off
  // onepiecetopdecks.com's EB-02 page. It was the Leader's Community list until
  // the 2025-09-27 Regional build the model wins more with replaced it there;
  // it stays here under its old id because checkpoints and its variants name
  // it. The event list's one OP06-047 Charlotte Pudding is on Bandai's banned
  // list, and a training list is held to Standard, so its slot is a third
  // OP06-063 Vinsmoke Sora.
  "(Blue/Purple) Vinsmoke Reiju - 1st Place Store Battle": {
    id: "(Blue/Purple) Vinsmoke Reiju - 1st Place Store Battle",
    format: "standard",
    leader: "OP06-042",
    cards: {
      "OP06-063": 3,
      "OP10-063": 4,
      "OP06-068": 4,
      "OP07-066": 4,
      "OP06-064": 2,
      "OP07-072": 4,
      "OP08-074": 4,
      "OP06-060": 4,
      "OP06-069": 4,
      "OP06-065": 2,
      "OP06-061": 4,
      "OP06-062": 1,
      "OP11-047": 4,
      "OP11-045": 1,
      "OP06-078": 1,
      "OP06-079": 4,
    },
  },
  // Red/Black OP13-004 Sabo in front of the OP-17 Elbaph shell, built from the
  // top-placing gumgum.gg list of 26 Aug 2026 with its Block 1 red splash
  // swapped for OP17-082 Sanji and OP17-091 Brook. It was the Leader's
  // Community list until the PlayTCG EGB 2026-09-20 build the model wins more
  // with replaced it there; it stays here under its old id because the meta
  // field (`meta-decks.txt`), checkpoints and its variants name it.
  "(Red/Black) Sabo - OP17 Elbaph List": {
    id: "(Red/Black) Sabo - OP17 Elbaph List",
    format: "standard",
    leader: "OP13-004",
    cards: {
      "OP04-016": 3,
      "OP17-082": 4,
      "OP17-091": 4,
      "OP15-094": 1,
      "OP15-088": 4,
      "OP17-084": 3,
      "OP17-086": 4,
      "OP17-080": 4,
      "OP17-087": 3,
      "OP17-095": 4,
      "OP17-089": 4,
      "OP17-093": 4,
      "OP17-119": 4,
      "OP17-098": 4,
    },
  },
  // Purple OP15-058 Enel, 1st (6-0) for "Bloodya" at a Store Battle in
  // Argentina on 11 Apr 2026, off onepiecetopdecks.com's OP-15/EB-04 page. It
  // was the Leader's Community list until the 2026-08-25 ChinoizeCup build the
  // model wins more with replaced it there; it stays here under its old id
  // because checkpoints name it.
  "(Purple) Enel - 1st Place Store Battle 2026-04-11": {
    id: "(Purple) Enel - 1st Place Store Battle 2026-04-11",
    format: "standard",
    leader: "OP15-058",
    cards: {
      "OP07-064": 4,
      "OP12-063": 3,
      "OP12-071": 2,
      "OP13-076": 1,
      "OP15-060": 3,
      "OP15-061": 4,
      "OP15-066": 4,
      "OP15-067": 4,
      "OP15-071": 4,
      "OP15-074": 2,
      "OP15-075": 3,
      "OP15-076": 4,
      "OP15-077": 4,
      "OP15-078": 4,
      "OP15-118": 4,
    },
  },
  // Red/Green OP13-001 Monkey.D.Luffy, the Straw Hat DON!!-refresh list that
  // won the Malmo Regional (1st, 13-1, 22 Aug 2026), read off the `deckgen`
  // link on onepiecetopdecks.com's English OP-16 page. It was the Leader's
  // Community list until the maintainer chose the Miracle Luffy EB05 build for
  // the shelf; it stays here under its old id because the meta field
  // (`meta-decks.txt`), checkpoints and its variants name it.
  "(Red/Green) Monkey.D.Luffy - Open OPTCG": {
    id: "(Red/Green) Monkey.D.Luffy - Open OPTCG",
    format: "standard",
    leader: "OP13-001",
    cards: {
      "EB02-017": 4,
      "EB04-002": 4,
      "EB04-007": 4,
      "OP01-016": 4,
      "OP04-016": 1,
      "OP05-038": 1,
      "OP08-036": 4,
      "OP13-027": 4,
      "OP13-040": 1,
      "OP13-118": 2,
      "OP14-022": 4,
      "OP14-031": 4,
      "OP15-032": 2,
      "ST21-003": 3,
      "ST31-004": 4,
      "ST31-005": 4,
    },
  },
  // Green/Yellow EB05-010 Nico Robin, the <Wisdom> midrange build from Car D.
  // Kaizoku's "EB05 Robin Swings A LOT" (12 Oct 2026), also hosted as
  // OPDeckGuide's Nico Robin EB05 guide. It was the Leader's Community list
  // until the TCG Match Making EB05 #6 build replaced it there; it stays here
  // under its old id because checkpoints and its variants name it.
  "(Green/Yellow) Nico Robin - EB05 Wisdom List": {
    id: "(Green/Yellow) Nico Robin - EB05 Wisdom List",
    format: "standard",
    leader: "EB05-010",
    cards: {
      "EB04-018": 4,
      "EB04-058": 4,
      "EB05-016": 4,
      "EB05-050": 4,
      "EB05-052": 4,
      "EB05-055": 4,
      "EB05-056": 4,
      "EB05-057": 4,
      "OP13-031": 4,
      "OP13-113": 4,
      "OP14-108": 3,
      "OP17-022": 3,
      "OP17-109": 4,
    },
  },
  // Red/Black OP13-004 Sabo, 1st for "Manny Walia" at PlayTCG's EGB event in
  // North America on 20 Sep 2026, off onepiecetopdecks.com's OP-17 page. It
  // was the Leader's Community list until the TCG Match Making EB05 #8 build
  // replaced it there; it stays here under its old id because checkpoints
  // name it.
  "(Red/Black) Sabo - 1st Place PlayTCG EGB 2026-09-20": {
    id: "(Red/Black) Sabo - 1st Place PlayTCG EGB 2026-09-20",
    format: "standard",
    leader: "OP13-004",
    cards: {
      "EB04-007": 2,
      "OP04-016": 2,
      "OP13-007": 2,
      "OP14-096": 2,
      "OP15-088": 4,
      "OP17-080": 4,
      "OP17-082": 4,
      "OP17-083": 2,
      "OP17-084": 3,
      "OP17-086": 2,
      "OP17-087": 3,
      "OP17-089": 4,
      "OP17-093": 3,
      "OP17-095": 4,
      "OP17-096": 2,
      "OP17-119": 4,
      "ST01-011": 3,
    },
  },
  // Purple OP05-060 Monkey.D.Luffy, 1st (5-0) for "Desaparecido" at a Store
  // Battle in Italy on 1 Jul 2025, off onepiecetopdecks.com's EB-02 page. It
  // was the Leader's Community list until the 2026-09-10 Store Battle build
  // replaced it there; it stays here under its old id because checkpoints
  // name it.
  "(Purple) Monkey.D.Luffy - 1st Place Store Battle 2025-07-01": {
    id: "(Purple) Monkey.D.Luffy - 1st Place Store Battle 2025-07-01",
    format: "standard",
    leader: "OP05-060",
    cards: {
      "EB01-061": 4,
      "OP03-072": 1,
      "OP05-077": 1,
      "OP06-076": 4,
      "OP07-064": 4,
      "OP09-065": 4,
      "OP09-069": 4,
      "OP09-078": 4,
      "OP09-119": 3,
      "OP11-067": 4,
      "ST18-001": 4,
      "ST18-002": 2,
      "ST18-003": 3,
      "ST18-004": 4,
      "ST18-005": 3,
      "ST26-002": 1,
    },
  },
  // Red/Green ST30-001 Luffy & Ace, the Straw Hat rush build supplied as a
  // card list by the maintainer on 26 Sep 2026 without an event or pilot. It
  // was the Leader's one Community list until the 2026-09-19 CDMX Regional
  // build took the shelf; it stays here under its old id because the meta
  // field (`meta-decks.txt`), checkpoints and its variants name it.
  "(Red/Green) Luffy & Ace - Open OPTCG": {
    id: "(Red/Green) Luffy & Ace - Open OPTCG",
    format: "standard",
    leader: "ST30-001",
    cards: {
      "EB04-002": 4,
      "OP01-016": 4,
      "EB02-017": 4,
      "ST31-005": 4,
      "ST21-003": 1,
      "OP12-015": 4,
      "ST30-012": 4,
      "ST21-014": 4,
      "ST31-001": 4,
      "OP04-016": 4,
      "OP14-019": 2,
      "OP17-017": 4,
      "OP06-017": 1,
      "OP12-037": 3,
      "OP13-040": 2,
      "ST21-017": 1,
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
