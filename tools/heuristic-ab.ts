/**
 * Direct A/B for a format-wide heuristic.
 *
 * `pnpm deck:benchmark` measures decks against each other, which is the right
 * tool for a change that affects one deck. It is the wrong tool for a rule that
 * applies to every deck: both seats get the rule, both play better, and the win
 * rates move together so the delta reads as zero. Change 3 in
 * `analysis/rules-api-2026-08-07.md` looked exactly like that -- 31% of games
 * changed and no deck moved -- which says nothing about whether the rule is good.
 *
 * This runs mirror matches instead. Both seats pilot the same deck with the same
 * policy stack, except that one seat has the named modules switched off. Seats are
 * paired: every seed is played once with the rule on P1 and once with it on P2, so
 * first-player advantage cancels exactly. The rule-enabled side's win rate is then
 * a direct measurement against a 50% null.
 *
 * Usage:
 *   pnpm heuristic:ab --module don-reservation --seeds 200
 *   pnpm heuristic:ab --module don-reservation --deck ST31 --seeds 400
 *   pnpm heuristic:ab --module free-block --deck OP17-LUFFY-ELBAPH --seeds 300
 *   pnpm heuristic:ab --module free-block --format --seeds 100
 *
 * Decks are played in parallel, one worker per core; `--jobs 1` forces the
 * single-process run. Results do not depend on the split -- see `tools/shard.ts`.
 */
import { GameService } from "@one-piece-sim/engine-core";
import {
  deckManifests,
  FORMAT_DECK_IDS,
  SELECTABLE_DECK_IDS,
  resolveDeck,
} from "@one-piece-sim/decks";
import {
  acceptsSimulator,
  RegistryRulesAgent,
  type Agent,
  type RegistryAgentOptions,
} from "@one-piece-sim/agents/local";
import type { PlayerId } from "@one-piece-sim/protocol";
import {
  isShardWorker,
  parseShard,
  reportShardProgress,
  reportShardResult,
  resolveJobs,
  runShards,
  shardGroups,
  stripFlags,
  type Shard,
} from "./shard.js";

/**
 * Which Leader pilots a deck, for any selectable deck rather than the six.
 *
 * This used to be a hand-written `Record<FormatDeckId, string>` covering the
 * format decks alone, and that table was the whole reason the OP14 and OP17
 * tournament decks were unmeasurable: mirror matches need nothing from a deck
 * but its list and its Leader, both of which `deckManifests` already has for
 * every deck the app can select. The restriction was in the tool, not in the
 * method. See `packages/agents/src/rules/strategy/archetypes.ts`, whose
 * `*-unmeasured` profiles exist because of it.
 */
function leaderOf(deck: string): string {
  const manifest = deckManifests[deck];
  if (!manifest) throw new Error(`Unknown deck: ${deck}`);
  return manifest.leader;
}

interface Options {
  modules: string[];
  decks: string[];
  seeds: number;
  maxActions: number;
  /** Extra agent options applied to the treatment seat only. */
  enable: RegistryAgentOptions;
  jobs: number;
  shard: Shard | undefined;
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
  const deck = flags.get("deck");
  const formatOnly = flags.get("format") !== undefined;
  const modules = (flags.get("module") ?? "").split(",").filter(Boolean);
  const enable: RegistryAgentOptions = {
    ...(flags.get("don-sequence") ? { donSequence: true } : {}),
    ...(flags.get("don-lookahead") ? { donLookahead: true } : {}),
  };
  if (modules.length === 0 && Object.keys(enable).length === 0) {
    throw new Error(
      "Pass --module <id[,id]> to A/B a registered module, or --don-sequence / --don-lookahead to A/B an opt-in one.",
    );
  }
  const decks = deck
    ? deck.split(",").map(requireDeck)
    : formatOnly
      ? [...FORMAT_DECK_IDS]
      : [...SELECTABLE_DECK_IDS];
  const shard = parseShard(flags.get("shard"));
  return {
    modules,
    decks,
    seeds: Number(flags.get("seeds") ?? "200"),
    maxActions: Number(flags.get("max-actions") ?? "800"),
    enable,
    jobs: resolveJobs(flags.get("jobs"), shardGroups(decks, shard).length),
    shard,
  };
}

/**
 * Any selectable deck, not just the six-deck format.
 *
 * An unqualified run now sweeps the whole app roster, because a rule registered
 * for `EVERY_DECK` is claimed over every deck a game can be set up with and
 * measuring it over six of sixteen was how `free-block` came to be registered
 * format-wide on evidence that said nothing about the ten decks it also steers.
 * `--format` restores the six-deck field, which is the field every measurement
 * already recorded in `registry.ts` was taken against, so an old number can
 * still be reproduced exactly.
 */
function requireDeck(value: string): string {
  const deck = SELECTABLE_DECK_IDS.find((candidate) => candidate === value);
  if (!deck) {
    throw new Error(
      `Unknown deck: ${value}. Known: ${SELECTABLE_DECK_IDS.join(", ")}`,
    );
  }
  return deck;
}

/**
 * The two sides of the comparison.
 *
 * `treatment` is always the seat with the thing under test switched on. How the
 * control is built depends on which kind of thing that is:
 *
 *  - A module registered by default (`--module <id>`) is *removed* from the
 *    control, so treatment = as-shipped and control = as-shipped minus the rule.
 *  - An opt-in module (`--don-sequence`, `--don-lookahead`) is simply *absent*
 *    from the control, so treatment = as-shipped plus the rule.
 *
 * Getting this backwards would make both seats identical and every result read as
 * exactly 50%.
 */
function agentPair(options: Options): {
  treatment: RegistryAgentOptions;
  control: RegistryAgentOptions;
} {
  return {
    treatment: options.enable,
    control:
      options.modules.length > 0
        ? { ...options.enable, disableModules: options.modules }
        : {},
  };
}

async function playGame(
  deck: string,
  seed: string,
  treatmentSeat: PlayerId,
  options: Options,
): Promise<PlayerId | null> {
  const { treatment, control } = agentPair(options);
  const leader = leaderOf(deck);
  const service = new GameService();
  let observation = service.create({
    p1: resolveDeck(deck),
    p2: resolveDeck(deck),
    seed,
    startingPlayer: "random",
  });
  const agents: Record<PlayerId, Agent> = {
    p1: new RegistryRulesAgent(
      leader,
      treatmentSeat === "p1" ? treatment : control,
    ),
    p2: new RegistryRulesAgent(
      leader,
      treatmentSeat === "p2" ? treatment : control,
    ),
  };
  let actions = 0;
  while (observation.phase !== "finished" && actions < options.maxActions) {
    const seat = observation.activePlayer;
    const agent = agents[seat];
    if (acceptsSimulator(agent)) {
      agent.useSimulator(service.simulatorFor(observation.gameId, seat));
      agent.usePlanner?.(service.plannerFor(observation.gameId, seat));
    }
    const action = await agent.chooseAction(observation);
    observation = service.act(
      observation.gameId,
      observation.revision,
      action.actionId,
    );
    actions += 1;
  }
  return observation.phase === "finished" ? observation.winner : null;
}

interface DeckTally {
  wins: number;
  games: number;
}

function deckRow(
  deck: string,
  { wins, games }: DeckTally,
): Record<string, string | number> {
  const z = zAgainstEven(wins, games);
  return {
    deck,
    games,
    "with rule": wins,
    "without rule": games - wins,
    winRate: `${((wins / Math.max(1, games)) * 100).toFixed(1)}%`,
    z: z.toFixed(2),
    sig: significance(z),
  };
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
  const label =
    options.modules.length > 0
      ? options.modules.join("+")
      : Object.keys(options.enable).join("+");
  const rows: Array<Record<string, string | number>> = [];
  let totalWins = 0;
  let totalGames = 0;

  // Each deck's mirror matches are independent, so the deck list is the shard
  // unit and merging is a lookup by deck id.
  if (options.jobs > 1) {
    const results = await runShards<Array<[string, DeckTally]>>({
      arguments: stripFlags(process.argv.slice(2), ["jobs", "shard"]),
      jobs: options.jobs,
      totalGames:
        shardGroups(options.decks, options.shard).length * options.seeds * 2,
      ...(options.shard ? { shard: options.shard } : {}),
    });
    const byDeck = new Map(results.flat());
    for (const deck of options.decks) {
      const tally = byDeck.get(deck) ?? { wins: 0, games: 0 };
      totalWins += tally.wins;
      totalGames += tally.games;
      rows.push(deckRow(deck, tally));
    }
  } else {
    const tallies: Array<[string, DeckTally]> = [];
    let played = 0;
    for (const deck of shardGroups(options.decks, options.shard)) {
      let wins = 0;
      let games = 0;
      for (let index = 0; index < options.seeds; index += 1) {
        // Paired seats: the same seed is played with the treatment on each side,
        // so any first-player advantage cancels rather than being estimated.
        for (const seat of ["p1", "p2"] as const) {
          const seed = `heuristic-ab-${deck}-${index}`;
          const winner = await playGame(deck, seed, seat, options);
          played += 1;
          reportShardProgress(played);
          if (winner === null) continue;
          games += 1;
          if (winner === seat) wins += 1;
        }
      }
      tallies.push([deck, { wins, games }]);
      totalWins += wins;
      totalGames += games;
      rows.push(deckRow(deck, { wins, games }));
      if (!isShardWorker())
        process.stderr.write(`${deck} done (${games} games)\n`);
    }
    if (isShardWorker()) {
      reportShardResult(tallies);
      return;
    }
  }

  const z = zAgainstEven(totalWins, totalGames);
  rows.push({
    deck: "ALL",
    games: totalGames,
    "with rule": totalWins,
    "without rule": totalGames - totalWins,
    winRate: `${((totalWins / Math.max(1, totalGames)) * 100).toFixed(1)}%`,
    z: z.toFixed(2),
    sig: significance(z),
  });

  console.log(`\nA/B: ${label} on, mirror matches, paired seats`);
  console.table(rows);
  console.log(
    "Win rate is the rule-enabled seat's. 50.0% is the null; * p<0.05, ** p<0.01.",
  );
}

await main();
