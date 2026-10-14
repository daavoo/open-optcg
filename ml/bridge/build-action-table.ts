/**
 * Freezes the fixed action space to `action-table.json`.
 *
 * Algorithms that need a fixed action space (DQN, NFSP, MaskablePPO) need a
 * total order over every decision the engine can offer, and the engine does not
 * enumerate one: legal actions are produced from live state, and the space of
 * `resolve-effect` options in particular is a function of card text rather than
 * of anything declared up front. Deriving it by exhaustive rollout and freezing
 * the result is the honest version of that -- it is a *measured* action space,
 * not a claimed one, and it comes with a coverage number.
 *
 * The table is append-only by construction: keys are sorted and written with
 * their index, so re-running after adding a deck extends the table without
 * renumbering what a checkpoint was trained against. Re-running from scratch
 * after a card change invalidates existing checkpoints, which is why the file
 * records the engine's own card-audit state alongside the keys.
 *
 *   pnpm rl:action-table --seeds 40
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GameService } from "@one-piece-sim/engine-core";
import { SeededRandomAgent } from "@one-piece-sim/agents/local";
import {
  FORMAT_DECK_IDS,
  autoBuildSealedDeck,
  sealedDeckManifest,
  resolveDeck,
} from "@one-piece-sim/decks";
import type { PlayerId } from "@one-piece-sim/protocol";
import { openSeatPool } from "../../packages/cli/src/sealed-analysis.js";
import { actionKey, CARD_VOCAB, OBSERVATION_SIZE } from "./encode.js";

const seedArg = process.argv.indexOf("--seeds");
const SEEDS = seedArg >= 0 ? Number(process.argv[seedArg + 1]) : 20;
const sealedSeedArg = process.argv.indexOf("--sealed-seeds");
const SEALED_SEEDS =
  sealedSeedArg >= 0 ? Number(process.argv[sealedSeedArg + 1]) : 150;
const MAX_ACTIONS = 800;

const keys = new Set<string>();
let decisions = 0;
let games = 0;
let ambiguous = 0;

const start = Date.now();

for (const p1Deck of FORMAT_DECK_IDS) {
  for (const p2Deck of FORMAT_DECK_IDS) {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const service = new GameService();
      let observation = service.create({
        p1: resolveDeck(p1Deck),
        p2: resolveDeck(p2Deck),
        seed: `action-table-${p1Deck}-${p2Deck}-${seed}`,
        startingPlayer: "random",
      });
      const agents: Record<PlayerId, SeededRandomAgent> = {
        p1: new SeededRandomAgent(`p1-${seed}`),
        p2: new SeededRandomAgent(`p2-${seed}`),
      };
      let count = 0;
      while (observation.phase !== "finished" && count < MAX_ACTIONS) {
        const decisionKeys = observation.legalActions.map((action) =>
          actionKey(observation, action),
        );
        if (new Set(decisionKeys).size !== decisionKeys.length) ambiguous += 1;
        for (const key of decisionKeys) keys.add(key);
        decisions += 1;

        const chosen =
          await agents[observation.activePlayer].chooseAction(observation);
        observation = service.act(
          observation.gameId,
          observation.revision,
          chosen.actionId,
        );
        count += 1;
      }
      games += 1;
    }
  }
}

// OP17 sealed: each seed opens two independent random pools (`${seed}:p1`,
// `${seed}:p2`, same convention `sealed-analysis.ts` uses) and auto-builds a
// deck from each, so the rollout below touches real OP17 card numbers rather
// than the six format decks' 90-card vocabulary. Without this, every
// sealed `play:OP17-xxx` / `eff:OP17-xxx:...` key the rules never produced
// collapses onto the single OOV bucket in `rl-server.ts`'s dedup, which would
// silently drop distinct legal actions (two different sealed cards to play)
// down to one -- a correctness bug, not just a coverage gap.
for (let seed = 0; seed < SEALED_SEEDS; seed += 1) {
  const p1Seat = openSeatPool(`action-table-sealed-${seed}:p1`);
  const p2Seat = openSeatPool(`action-table-sealed-${seed}:p2`);
  const p1Deck = autoBuildSealedDeck(p1Seat.pool);
  const p2Deck = autoBuildSealedDeck(p2Seat.pool);
  const p1Manifest = sealedDeckManifest(p1Deck, p1Seat.pool);
  const p2Manifest = sealedDeckManifest(p2Deck, p2Seat.pool);

  const service = new GameService();
  let observation = service.create({
    p1: resolveDeck(p1Manifest.id, p1Manifest),
    p2: resolveDeck(p2Manifest.id, p2Manifest),
    seed: `action-table-sealed-${seed}`,
    startingPlayer: "random",
  });
  const agents: Record<PlayerId, SeededRandomAgent> = {
    p1: new SeededRandomAgent(`sealed-p1-${seed}`),
    p2: new SeededRandomAgent(`sealed-p2-${seed}`),
  };
  let count = 0;
  while (observation.phase !== "finished" && count < MAX_ACTIONS) {
    const decisionKeys = observation.legalActions.map((action) =>
      actionKey(observation, action),
    );
    if (new Set(decisionKeys).size !== decisionKeys.length) ambiguous += 1;
    for (const key of decisionKeys) keys.add(key);
    decisions += 1;

    const chosen =
      await agents[observation.activePlayer].chooseAction(observation);
    observation = service.act(
      observation.gameId,
      observation.revision,
      chosen.actionId,
    );
    count += 1;
  }
  games += 1;
}

const sorted = [...keys].sort();
const table = {
  version: 1,
  generatedFrom: {
    decks: [...FORMAT_DECK_IDS],
    seedsPerPair: SEEDS,
    sealedSeeds: SEALED_SEEDS,
    games,
    decisions,
  },
  observationSize: OBSERVATION_SIZE,
  cardVocab: CARD_VOCAB,
  /** Reserved final index for a key this rollout never produced. */
  oovIndex: sorted.length,
  actions: sorted,
};

const outputPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "action-table.json",
);
writeFileSync(outputPath, `${JSON.stringify(table, null, 2)}\n`);

const seconds = (Date.now() - start) / 1000;
console.log(`games=${games} decisions=${decisions} in ${seconds.toFixed(1)}s`);
console.log(`action space = ${sorted.length} (+1 OOV bucket)`);
console.log(`observation size = ${OBSERVATION_SIZE}`);
console.log(
  `decisions with >=2 legal actions sharing a key: ${ambiguous} (${(
    (100 * ambiguous) /
    decisions
  ).toFixed(1)}%)`,
);
console.log(`wrote ${outputPath}`);
