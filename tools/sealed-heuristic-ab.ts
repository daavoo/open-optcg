/**
 * Direct A/B for a `SEALED-LUFFY` gameplay policy module, over random OP17
 * pools rather than a fixed deck manifest.
 *
 * `pnpm heuristic:ab` cancels first-player advantage by playing each seed
 * twice with the treatment on the opposite seat. Sealed has no shared deck to
 * hold fixed while doing that -- each seat opens its own pool -- so this tool
 * cancels *pool* asymmetry the same way instead: for each seed it opens two
 * pools (`${seed}:p1` / `${seed}:p2`, same escalation ladder `play-sealed.ts`
 * and `sealed-analysis.ts` use) and plays the pair twice, swapping which pool
 * the treatment seat pilots. A pool that happens to be stronger contributes
 * equally to both games in the pair, so it cancels out of the treatment's win
 * rate the same way first-player advantage cancels in the fixed-deck tool.
 *
 * Results this tool produced are recorded in
 * `packages/agents/src/rules/registry.ts`'s comment above the `"SEALED-LUFFY"`
 * band, and in the docstring of whichever module each one settled into.
 *
 * Usage:
 *   pnpm sealed:heuristic:ab --module sealed-board-presence --seeds 200
 *   pnpm sealed:heuristic:ab --module sealed-board-presence --seeds 200 --max-actions 1000
 */
import { GameService } from "@one-piece-sim/engine-core";
import {
  acceptsSimulator,
  RegistryRulesAgent,
  type Agent,
  type RegistryAgentOptions,
} from "@one-piece-sim/agents/local";
import {
  autoBuildSealedDeck,
  sealedDeckManifest,
  SEALED_LEADER,
  type SealedPool,
  resolveDeck,
} from "@one-piece-sim/decks";
import { openSeatPool } from "../packages/cli/src/sealed-analysis.js";

interface Options {
  modules: string[];
  seeds: number;
  seedPrefix: string;
  maxActions: number;
}

function parse(argv: string[]): Options {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) continue;
    const [key, inline] = argument.slice(2).split("=", 2);
    if (!key) continue;
    const next = argv[index + 1];
    if (inline !== undefined) flags.set(key, inline);
    else if (next && !next.startsWith("--")) flags.set(key, argv[++index]!);
    else flags.set(key, "true");
  }
  const modules = (flags.get("module") ?? "").split(",").filter(Boolean);
  if (modules.length === 0) {
    throw new Error(
      "Pass --module <id[,id]> naming the SEALED-LUFFY module(s) to A/B.",
    );
  }
  return {
    modules,
    seeds: Number(flags.get("seeds") ?? "200"),
    seedPrefix: flags.get("seed-prefix") ?? "sealed-heuristic-ab",
    maxActions: Number(flags.get("max-actions") ?? "800"),
  };
}

const treatment: RegistryAgentOptions = {};
function control(modules: string[]): RegistryAgentOptions {
  return { disableModules: modules };
}

interface OpenedPool {
  pool: SealedPool;
  packsOpened: number;
}

/**
 * Plays one game with the treatment agent piloting `treatmentPool` and the
 * control agent piloting `controlPool`, and reports whether the treatment
 * seat won. Which engine seat (`p1`/`p2`) carries which pool is fixed by the
 * caller so the pair below can swap it.
 */
async function playGame(
  gameSeed: string,
  treatmentPool: OpenedPool,
  controlPool: OpenedPool,
  treatmentSeat: "p1" | "p2",
  options: Options,
): Promise<"treatment" | "control" | null> {
  const treatmentDeck = autoBuildSealedDeck(treatmentPool.pool);
  const controlDeck = autoBuildSealedDeck(controlPool.pool);
  const treatmentManifest = sealedDeckManifest(
    treatmentDeck,
    treatmentPool.pool,
  );
  const controlManifest = sealedDeckManifest(controlDeck, controlPool.pool);

  const service = new GameService();
  let observation = service.create({
    p1: resolveDeck(
      treatmentSeat === "p1" ? treatmentManifest.id : controlManifest.id,
      treatmentSeat === "p1" ? treatmentManifest : controlManifest,
    ),
    p2: resolveDeck(
      treatmentSeat === "p2" ? treatmentManifest.id : controlManifest.id,
      treatmentSeat === "p2" ? treatmentManifest : controlManifest,
    ),
    seed: gameSeed,
    startingPlayer: "random",
  });
  const agents: Record<"p1" | "p2", Agent> = {
    p1: new RegistryRulesAgent(
      SEALED_LEADER,
      treatmentSeat === "p1" ? treatment : control(options.modules),
    ),
    p2: new RegistryRulesAgent(
      SEALED_LEADER,
      treatmentSeat === "p2" ? treatment : control(options.modules),
    ),
  };

  let actions = 0;
  while (observation.phase !== "finished" && actions < options.maxActions) {
    const seat = observation.activePlayer;
    const agent = agents[seat];
    if (acceptsSimulator(agent)) {
      agent.useSimulator(service.simulatorFor(observation.gameId, seat));
    }
    const action = await agent.chooseAction(observation);
    observation = service.act(
      observation.gameId,
      observation.revision,
      action.actionId,
    );
    actions += 1;
  }
  if (observation.phase !== "finished" || observation.winner === null) {
    return null;
  }
  return observation.winner === treatmentSeat ? "treatment" : "control";
}

/** Two-sided z-test of an observed win rate against a 50% null. */
function zAgainstEven(wins: number, games: number): number {
  if (games === 0) return 0;
  return (wins - games / 2) / Math.sqrt(games * 0.25);
}

const significance = (z: number): string =>
  Math.abs(z) >= 2.576 ? "**" : Math.abs(z) >= 1.96 ? "*" : "";

async function main(): Promise<void> {
  const options = parse(process.argv.slice(2));
  const label = options.modules.join("+");
  let treatmentWins = 0;
  let games = 0;
  let incomplete = 0;
  let failed = 0;

  for (let index = 0; index < options.seeds; index += 1) {
    const seed = `${options.seedPrefix}-${index}`;
    const poolA = openSeatPool(`${seed}:p1`);
    const poolB = openSeatPool(`${seed}:p2`);

    // Paired assignment: the treatment pilots pool A in one game and pool B in
    // the other, so a pool that is simply stronger contributes to both games
    // in the pair and cancels out of the treatment's win rate.
    for (const [treatmentPool, controlPool, treatmentSeat] of [
      [poolA, poolB, "p1"],
      [poolB, poolA, "p2"],
    ] as const) {
      let result: "treatment" | "control" | null;
      try {
        result = await playGame(
          `${seed}-${treatmentSeat}`,
          treatmentPool,
          controlPool,
          treatmentSeat,
          options,
        );
      } catch (error) {
        // A known pre-existing engine bug (MISSING_CARD) throws on rare
        // seeds instead of finishing; see `sealed-analysis.ts`'s
        // `SealedAnalysisFailure`. Skip it rather than losing the whole run.
        failed += 1;
        process.stderr.write(
          `  ${seed}-${treatmentSeat}: ${(error as Error).message}\n`,
        );
        continue;
      }
      if (result === null) {
        incomplete += 1;
        continue;
      }
      games += 1;
      if (result === "treatment") treatmentWins += 1;
    }
    if ((index + 1) % 25 === 0 || index + 1 === options.seeds) {
      process.stderr.write(`${index + 1}/${options.seeds} seeds done\n`);
    }
  }

  const z = zAgainstEven(treatmentWins, games);
  console.log(
    `\nSealed A/B: ${label} on, paired pool-swap, ${games} decided games (${incomplete} incomplete, ${failed} threw)`,
  );
  console.table([
    {
      games,
      "with module": treatmentWins,
      "without module": games - treatmentWins,
      winRate: `${((treatmentWins / Math.max(1, games)) * 100).toFixed(1)}%`,
      z: z.toFixed(2),
      sig: significance(z),
    },
  ]);
  console.log(
    "Win rate is the module-enabled seat's. 50.0% is the null; * p<0.05, ** p<0.01.",
  );
}

await main();
