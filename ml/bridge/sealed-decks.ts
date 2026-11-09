/**
 * Writes sealed decks for training, as a `SYS1_EXTRA_DECKS` file.
 *
 *   pnpm exec tsx ml/bridge/sealed-decks.ts --expansion OP18 --pools 400 \
 *     --seed train --out ml/checkpoints/op18-sealed-train.json
 *
 * Every pool is six packs of one expansion, opened exactly as the app opens
 * them, and each pool yields three 40-card decks under the sealed Leader:
 *
 * - `grape`: the app's auto-builder, the deck a sensible player brings;
 * - `random`: forty cards drawn from the pool without a plan, the deck a
 *   learner has to be able to pilot when the builder's taste is not there;
 * - `mixed`: the builder's best thirty plus ten drawn from the rest, so the
 *   pool covers the space between the two.
 *
 * A pilot never sees the build it is facing, and pre-release decks are as
 * uneven as these three, so all three go into one pool. Seeds are derived from
 * `--seed`, so a held-out evaluation pool is the same command with another seed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  autoBuildSealedDeckGrape,
  openPacks,
  playablePoolCards,
  rankSealedPoolCandidatesGrape,
  SEALED_DECK_SIZE,
  SEALED_LEADER,
  SEALED_PACK_COUNT,
  sealedPoolIsBuildable,
  validateSealedDeck,
  type SealedDeck,
  type SealedPool,
} from "@one-piece-sim/decks";
import { seedRng, shuffle } from "@one-piece-sim/protocol";

const arg = (name: string, fallback?: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  const value = at === -1 ? fallback : process.argv[at + 1];
  if (value === undefined) throw new Error(`--${name} is required`);
  return value;
};

const expansion = arg("expansion", "OP18");
const pools = Number(arg("pools", "400"));
const seed = arg("seed", "train");
const out = arg("out");
/** How many of the builder's picks a `mixed` deck keeps. */
const MIXED_KEEP = 30;

/** The pool's playable cards as one list, a copy per entry. */
function poolCards(pool: SealedPool): string[] {
  return [...playablePoolCards(pool)].flatMap(([cardNumber, count]) =>
    Array.from({ length: count }, () => cardNumber),
  );
}

function deckOf(cards: readonly string[]): SealedDeck {
  const counts: Record<string, number> = {};
  for (const cardNumber of cards)
    counts[cardNumber] = (counts[cardNumber] ?? 0) + 1;
  return { cards: counts };
}

function randomDeck(pool: SealedPool, rngSeed: string): SealedDeck {
  const { items } = shuffle(poolCards(pool), seedRng(rngSeed));
  return deckOf(items.slice(0, SEALED_DECK_SIZE));
}

function mixedDeck(pool: SealedPool, rngSeed: string): SealedDeck {
  const kept = rankSealedPoolCandidatesGrape(pool)
    .slice(0, MIXED_KEEP)
    .map((candidate) => candidate.cardNumber);
  const rest = poolCards(pool);
  for (const cardNumber of kept) rest.splice(rest.indexOf(cardNumber), 1);
  const { items } = shuffle(rest, seedRng(rngSeed));
  return deckOf([...kept, ...items.slice(0, SEALED_DECK_SIZE - MIXED_KEEP)]);
}

const decks: Record<string, unknown> = {};
let skipped = 0;
for (let index = 0; index < pools; index += 1) {
  const poolSeed = `${seed}-${index}`;
  const pool = openPacks(poolSeed, SEALED_PACK_COUNT, expansion);
  if (!sealedPoolIsBuildable(pool).buildable) {
    skipped += 1;
    continue;
  }
  const builds: Record<string, SealedDeck> = {
    grape: autoBuildSealedDeckGrape(pool),
    random: randomDeck(pool, `${poolSeed}:random`),
    mixed: mixedDeck(pool, `${poolSeed}:mixed`),
  };
  for (const [kind, deck] of Object.entries(builds)) {
    const { cardCount, errors } = validateSealedDeck(deck, pool);
    if (errors.length || cardCount !== SEALED_DECK_SIZE)
      throw new Error(`${poolSeed} ${kind}: ${errors.join("; ")}`);
    const id = `SEALED-${expansion}-${poolSeed}-${kind}`;
    decks[id] = {
      id,
      leader: SEALED_LEADER,
      cards: deck.cards,
      deckSize: SEALED_DECK_SIZE,
    };
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(decks, null, 2)}\n`);
console.log(
  `${Object.keys(decks).length} decks from ${pools - skipped} ${expansion} pools (${skipped} unbuildable) -> ${out}`,
);
