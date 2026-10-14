/**
 * Paired A/B for one deck's policy against the rest of the field.
 *
 * `pnpm heuristic:ab` answers "is this rule good?" by mirror match, which is the
 * right instrument for a *format-wide* rule: both seats pilot the same deck, so
 * the only difference between them is the rule. It is the wrong instrument for a
 * change scoped to one deck, because the mirror only ever exercises that deck
 * against itself -- and a deck's worst matchups are the ones the change is
 * usually for.
 *
 * `pnpm deck:benchmark` plays the right games but has no notion of a control: it
 * measures whatever the code currently does, so comparing two versions means
 * running it twice against two builds and diffing win rates whose seeds happen to
 * line up.
 *
 * This runs both. Every (opponent, seed, seat) triple is played twice -- once
 * with the focus deck's treatment agent and once with its control agent, the
 * opponent's agent being identical in both -- so the pair differs only in the
 * modules under test. Discordant pairs are then counted directly, which is a
 * McNemar test: paired games cancel the seed's share of the variance instead of
 * estimating it, so a two-point change is visible in hundreds of games rather
 * than tens of thousands.
 *
 * Usage:
 *   pnpm deck:ab --deck ST32 --disable threat-removal --seeds 120
 *   pnpm deck:ab --deck ST32 --disable threat-removal,counter-budget --opponent ST34 --seeds 300
 *   pnpm deck:ab --deck OP16-TEACH-ZAGREB --disable op16-teach --opponents OP16-NAMI-6738,ST33
 *
 * Opponents are played in parallel, one worker per core; `--jobs 1` forces the
 * single-process run. Results do not depend on the split -- see `tools/shard.ts`.
 */
import { GameService } from "@one-piece-sim/engine-core";
import {
  FORMAT_DECK_IDS,
  isDeckVariantPair,
  requireSupportedDeck,
  resolveDeck,
  SELECTABLE_DECK_IDS,
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
 * The focus deck's Leader, read off its manifest rather than a table.
 *
 * There used to be a `Record<FormatDeckId, string>` here, which is what limited
 * this instrument to the six format decks -- and those are exactly the decks
 * whose policies were already measured. A community meta deck (OP16-TEACH-ZAGREB
 * was the first to ask) names its Leader in its own manifest, so the mapping is
 * derivable and the restriction was never about the measurement.
 */
const leaderOf = (deckId: string): string =>
  requireSupportedDeck(deckId).leader;

interface Options {
  deck: string;
  opponents: string[];
  disable: string[];
  seeds: number;
  maxActions: number;
  seedPrefix: string;
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
  const deck = requireDeck(
    flags.get("deck") ?? "(Green) Roronoa Zoro - Starter Deck 32",
  );
  const opponentList = flags.get("opponents");
  const opponent = flags.get("opponent");
  const disable = (flags.get("disable") ?? "").split(",").filter(Boolean);
  const formatOnly = flags.get("format") !== undefined;
  // The field a deck is actually asked to beat is the app's roster, so that is
  // the default opponent set; `--format` narrows it to the six format decks to
  // reproduce a number taken before the roster grew. A variant of the focus deck
  // is always dropped -- same Leader, same policy, so it measures a decklist
  // change rather than a matchup.
  const field = (formatOnly ? FORMAT_DECK_IDS : SELECTABLE_DECK_IDS).filter(
    (candidate) => candidate !== deck && !isDeckVariantPair(candidate, deck),
  );
  if (disable.length === 0) {
    throw new Error(
      "Pass --disable <id[,id]>: the control seat is the focus deck with those modules switched off.",
    );
  }
  const opponents = opponent
    ? [requireDeck(opponent)]
    : opponentList
      ? opponentList.split(",").filter(Boolean).map(requireDeck)
      : field;
  const shard = parseShard(flags.get("shard"));
  return {
    deck,
    opponents,
    disable,
    seeds: Number(flags.get("seeds") ?? "150"),
    maxActions: Number(flags.get("max-actions") ?? "800"),
    seedPrefix: flags.get("seed-prefix") ?? "deck-ab",
    jobs: resolveJobs(flags.get("jobs"), shardGroups(opponents, shard).length),
    shard,
  };
}

function requireDeck(value: string): string {
  // Throws `UNSUPPORTED_DECK` for anything not shipped, which is the same error
  // every other entry point gives for a bad deck id.
  requireSupportedDeck(value);
  return value;
}

/**
 * One game of focus deck vs opponent, with the focus seat piloted by `focusAgent`.
 *
 * The opponent's agent is rebuilt per game rather than reused, because several
 * registered policies close over per-game state; sharing one across the treatment
 * and control runs of the same seed would leak the first game into the second and
 * quietly destroy the pairing this tool exists to provide.
 */
async function playGame(
  options: Options,
  opponentDeck: string,
  seed: string,
  focusSeat: PlayerId,
  focusOptions: RegistryAgentOptions,
): Promise<PlayerId | null> {
  const service = new GameService();
  let observation = service.create({
    p1: resolveDeck(focusSeat === "p1" ? options.deck : opponentDeck),
    p2: resolveDeck(focusSeat === "p1" ? opponentDeck : options.deck),
    seed,
    startingPlayer: "random",
  });
  const focusAgent = new RegistryRulesAgent(
    leaderOf(options.deck),
    focusOptions,
  );
  const opponentAgent = new RegistryRulesAgent(leaderOf(opponentDeck));
  const agents: Record<PlayerId, Agent> = {
    p1: focusSeat === "p1" ? focusAgent : opponentAgent,
    p2: focusSeat === "p2" ? focusAgent : opponentAgent,
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

/**
 * McNemar z on the discordant pairs.
 *
 * Only the games the change actually flipped carry information: a seed both
 * versions win says nothing about the change. Testing the two win rates as if
 * they were independent samples would fold every shared seed back into the
 * variance and need roughly an order of magnitude more games for the same power.
 */
function mcNemarZ(treatmentOnly: number, controlOnly: number): number {
  const discordant = treatmentOnly + controlOnly;
  if (discordant === 0) return 0;
  return (treatmentOnly - controlOnly) / Math.sqrt(discordant);
}

const significance = (z: number): string =>
  Math.abs(z) >= 2.576 ? "**" : Math.abs(z) >= 1.96 ? "*" : "";

interface Tally {
  games: number;
  treatmentWins: number;
  controlWins: number;
  treatmentOnly: number;
  controlOnly: number;
}

function emptyTally(): Tally {
  return {
    games: 0,
    treatmentWins: 0,
    controlWins: 0,
    treatmentOnly: 0,
    controlOnly: 0,
  };
}

function row(label: string, tally: Tally): Record<string, string | number> {
  const z = mcNemarZ(tally.treatmentOnly, tally.controlOnly);
  const rate = (wins: number) =>
    `${((wins / Math.max(1, tally.games)) * 100).toFixed(1)}%`;
  return {
    matchup: label,
    games: tally.games,
    treatment: rate(tally.treatmentWins),
    control: rate(tally.controlWins),
    delta: `${(((tally.treatmentWins - tally.controlWins) / Math.max(1, tally.games)) * 100).toFixed(1)}pt`,
    flipped: `+${tally.treatmentOnly}/-${tally.controlOnly}`,
    z: z.toFixed(2),
    sig: significance(z),
  };
}

async function main(): Promise<void> {
  const options = parse(process.argv.slice(2));
  const control: RegistryAgentOptions = { disableModules: options.disable };
  const treatment: RegistryAgentOptions = {};
  const rows: Array<Record<string, string | number>> = [];
  const overall = emptyTally();

  // One opponent's games are independent of every other's, so the opponent list
  // is the natural shard unit and the merge is a lookup by opponent name.
  if (options.jobs > 1) {
    const results = await runShards<Array<[string, Tally]>>({
      arguments: stripFlags(process.argv.slice(2), ["jobs", "shard"]),
      jobs: options.jobs,
      totalGames:
        shardGroups(options.opponents, options.shard).length *
        options.seeds *
        4,
      unit: "games",
      ...(options.shard ? { shard: options.shard } : {}),
    });
    const byOpponent = new Map(results.flat());
    for (const opponent of options.opponents) {
      const tally = byOpponent.get(opponent) ?? emptyTally();
      addTally(overall, tally);
      rows.push(row(`${options.deck} vs ${opponent}`, tally));
    }
    report(options, rows, overall);
    return;
  }

  const tallies: Array<[string, Tally]> = [];
  let played = 0;
  for (const opponent of shardGroups(options.opponents, options.shard)) {
    const tally = emptyTally();
    for (let index = 0; index < options.seeds; index += 1) {
      for (const seat of ["p1", "p2"] as const) {
        const seed = `${options.seedPrefix}-${options.deck}-${opponent}-${index}`;
        const treatmentWinner = await playGame(
          options,
          opponent,
          seed,
          seat,
          treatment,
        );
        const controlWinner = await playGame(
          options,
          opponent,
          seed,
          seat,
          control,
        );
        // An unfinished game on either side breaks the pair, so drop both.
        if (treatmentWinner === null || controlWinner === null) continue;
        const treatmentWon = treatmentWinner === seat;
        const controlWon = controlWinner === seat;
        tally.games += 1;
        if (treatmentWon) tally.treatmentWins += 1;
        if (controlWon) tally.controlWins += 1;
        if (treatmentWon && !controlWon) tally.treatmentOnly += 1;
        if (controlWon && !treatmentWon) tally.controlOnly += 1;
        // Two games per pair, counted so the parent's progress line matches the
        // games actually played rather than the pairs that survived.
        played += 2;
        reportShardProgress(played);
      }
    }
    tallies.push([opponent, tally]);
    addTally(overall, tally);
    rows.push(row(`${options.deck} vs ${opponent}`, tally));
    if (!isShardWorker())
      process.stderr.write(`${opponent} done (${tally.games} pairs)\n`);
  }

  if (isShardWorker()) {
    reportShardResult(tallies);
    return;
  }
  report(options, rows, overall);
}

function addTally(target: Tally, source: Tally): void {
  target.games += source.games;
  target.treatmentWins += source.treatmentWins;
  target.controlWins += source.controlWins;
  target.treatmentOnly += source.treatmentOnly;
  target.controlOnly += source.controlOnly;
}

function report(
  options: Options,
  rows: Array<Record<string, string | number>>,
  overall: Tally,
): void {
  rows.push(row("ALL", overall));
  console.log(
    `\nA/B: ${options.deck} with [${options.disable.join(", ")}] on, paired seeds and seats`,
  );
  console.table(rows);
  console.log(
    "treatment = as-shipped; control = same agent minus those modules. z is McNemar on flipped games; * p<0.05, ** p<0.01.",
  );
}

await main();
