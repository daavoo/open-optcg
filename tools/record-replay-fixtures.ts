/**
 * `pnpm fixtures:record` -- re-record the replay fixtures under `fixtures/replay/`.
 *
 * These fixtures pin cross-engine behaviour: `test/browser-parity.test.ts`
 * replays each one in Node and in an esbuild browser bundle and requires
 * identical events and state hashes. A deliberate rules change can make a
 * recorded action illegal, which used to mean the parity test got skipped with a
 * note. With this, refreshing them is one command, and the stamp each fixture
 * carries (see `provenance.ts`) says which rules produced it.
 *
 * `--check` re-records into memory and reports whether the committed files still
 * match, without writing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  GameService,
  nextInt,
  rulesStamp,
  seedRng,
  type RulesStamp,
} from "@one-piece-sim/engine-core";

import { resolveDeck } from "@one-piece-sim/decks";

interface Fixture {
  name: string;
  seed: string;
  decks: { p1: string; p2: string };
}

/**
 * The recorded corpus.
 *
 * One complete ST31-vs-ST32 game is enough for parity: the two decks between
 * them exercise search, DON!! attachment, Blockers, Counters, Triggers and a
 * Life-loss finish, and a hash mismatch anywhere in the chain fails the test.
 * Add a fixture here when a new mechanic is not reachable from these decks.
 */
const FIXTURES: readonly Fixture[] = [
  {
    name: "browser-parity-v1",
    seed: "browser-parity-v1",
    decks: {
      p1: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p2: "(Green) Roronoa Zoro - Starter Deck 32",
    },
  },
];

const MAX_ACTIONS = 500;

interface StoredFixture {
  version: 1;
  seed: string;
  decks: { p1: string; p2: string };
  rules: RulesStamp;
  actions: string[];
  final: {
    revision: number;
    stateHash: string;
    winner: string;
    resultReason: string;
  };
}

/**
 * Plays one seeded game, choosing uniformly among the offered actions.
 *
 * A seeded walk rather than a rules agent on purpose: the fixture must stay
 * stable when a policy is tuned, and it is the *engine's* determinism the parity
 * test is about. Choices come from the engine RNG, so the same seed re-records
 * to the same game.
 */
function record(fixture: Fixture): StoredFixture {
  const service = new GameService();
  let observation = service.create({
    p1: resolveDeck(fixture.decks.p1),
    p2: resolveDeck(fixture.decks.p2),
    seed: fixture.seed,
  });
  let rng = seedRng(`${fixture.seed}:record`);
  const actions: string[] = [];

  while (observation.phase !== "finished" && actions.length < MAX_ACTIONS) {
    const legal = observation.legalActions;
    if (legal.length === 0) {
      throw new Error(
        `${fixture.name}: no legal action at r${String(observation.revision)} (${observation.phase})`,
      );
    }
    const choice = nextInt(rng, legal.length);
    rng = choice.state;
    const action = legal[choice.value]!;
    actions.push(action.actionId);
    observation = service.act(
      observation.gameId,
      observation.revision,
      action.actionId,
    );
  }

  if (observation.phase !== "finished" || !observation.winner) {
    throw new Error(
      `${fixture.name}: game did not finish within ${String(MAX_ACTIONS)} actions; pick another seed`,
    );
  }

  return {
    version: 1,
    seed: fixture.seed,
    decks: fixture.decks,
    rules: rulesStamp(),
    actions,
    final: {
      revision: observation.revision,
      stateHash: observation.stateHash,
      winner: observation.winner,
      resultReason: observation.resultReason ?? "",
    },
  };
}

function main(): void {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const fixture of FIXTURES) {
    const path = `fixtures/replay/${fixture.name}.json`;
    const recorded = record(fixture);
    const text = `${JSON.stringify(recorded, null, 2)}\n`;
    if (check) {
      const current = readFileSync(path, "utf8");
      if (current === text) {
        console.log(
          `ok      ${path} (${String(recorded.actions.length)} actions)`,
        );
      } else {
        stale += 1;
        console.log(`stale   ${path} -- run \`pnpm fixtures:record\``);
      }
      continue;
    }
    writeFileSync(path, text);
    console.log(
      `wrote   ${path} (${String(recorded.actions.length)} actions, winner ${recorded.final.winner} by ${recorded.final.resultReason})`,
    );
  }
  if (stale > 0) process.exit(1);
}

main();
