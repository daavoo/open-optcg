/**
 * Measures one candidate rule at the decision it changes, not at the win rate.
 *
 * The instrument this replaces is `pnpm deck:ab`, which plays every game twice
 * and reports the focus deck's win rate. That answers "what does shipping this
 * do to the field" and answers it honestly -- but it is the wrong shape for the
 * question a reported misplay actually asks, for two reasons.
 *
 * **The signal is diluted by every game the rule never touches.** The engine is
 * seed-deterministic, so a game where the rule never fires replays identically
 * in both arms: same actions, same winner. Those games cannot carry information
 * about the rule, yet they sit in the denominator of the reported delta. A rule
 * that fires in 7% of games and is badly wrong when it does reads as a rounding
 * error field-wide. `block-cheaper-defence` measured -0.6pt over 4680 games and
 * **-8.2pt over the 328 it actually changed**; the second number is the one
 * that says what the rule is worth.
 *
 * **A whole-game delta cannot attribute.** A rule that fires six times in a
 * game is scored on the sum of all six, so a good decision and a bad one cancel
 * and the report cannot tell a rule that is wrong from one that is right and
 * badly gated.
 *
 * So this forks at the **first** decision where the rule disagrees with the
 * agent that lacks it. Up to that point both branches are the same game, which
 * is what makes them a matched pair; after it, *both* branches are played by
 * the control agent, so the only difference in the whole comparison is that one
 * decision. Each game contributes one clean sample, and the aggregate is a
 * per-decision win rate rather than a per-game one.
 *
 * It also prints the denominator a win rate never shows: how many decisions of
 * that kind arose, and how many of those the rule actually spoke at. A rule can
 * be silent because it is wrong, because its gate never opens, or because the
 * engine offers the action in a shape it does not match, and those need
 * different fixes. See `docs/measuring-heuristics.md`.
 *
 * What it does not answer: whether the rule is right against a *human*. Both
 * branches are played out by the same fixed policies, so a decision that only
 * pays against an opponent who punishes it correctly is scored by an opponent
 * who may not. That is a property of every instrument here, and it is why a
 * reported misplay should also be pinned as a
 * policy test asserting the action -- the test records the human judgement, and
 * this records what the field does with it.
 *
 * Usage:
 *   pnpm heuristic:probe --deck <ID> --module <module-id> --seeds 30
 *   pnpm heuristic:probe --deck <ID> --module <id> --opponents A,B --seeds 100
 */
import { GameService } from "@one-piece-sim/engine-core";
import {
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
import type { GameObservation, PlayerId } from "@one-piece-sim/protocol";

interface Options {
  deck: string;
  module: string;
  opponents: string[];
  seeds: number;
  maxActions: number;
  seedPrefix: string;
}

const leaderOf = (deckId: string): string =>
  requireSupportedDeck(deckId).leader;

function requireDeck(value: string): string {
  requireSupportedDeck(value);
  return value;
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
  const deck = requireDeck(flags.get("deck") ?? "");
  const module = flags.get("module");
  if (!module) {
    throw new Error(
      "Pass --module <id>: the candidate rule, which must be registered for this deck.",
    );
  }
  const opponentList = flags.get("opponents");
  const field = SELECTABLE_DECK_IDS.filter(
    (candidate) => candidate !== deck && !isDeckVariantPair(candidate, deck),
  );
  return {
    deck,
    module,
    opponents: opponentList
      ? opponentList.split(",").filter(Boolean).map(requireDeck)
      : field,
    seeds: Number(flags.get("seeds") ?? "30"),
    maxActions: Number(flags.get("max-actions") ?? "800"),
    seedPrefix: flags.get("seed-prefix") ?? "deck-ab",
  };
}

/** Two agents for one seat: the deck's policy with and without the candidate. */
function seatAgents(
  deck: string,
  module: string,
): { control: Agent; treatment: Agent } {
  const control: RegistryAgentOptions = { disableModules: [module] };
  return {
    control: new RegistryRulesAgent(leaderOf(deck), control),
    treatment: new RegistryRulesAgent(leaderOf(deck)),
  };
}

function attach(
  service: GameService,
  agent: Agent,
  observation: GameObservation,
): void {
  if (!acceptsSimulator(agent)) return;
  agent.useSimulator(
    service.simulatorFor(observation.gameId, observation.activePlayer),
  );
  agent.usePlanner?.(
    service.plannerFor(observation.gameId, observation.activePlayer),
  );
}

interface Fork {
  /** Actions applied before the disagreement, replayed to rebuild the position. */
  prefix: string[];
  /** What each arm wanted at the decision they disagreed on. */
  controlAction: string;
  treatmentAction: string;
  turn: number;
  phase: GameObservation["phase"];
}

interface Probe {
  /** Decisions the focus seat faced with something to decide. */
  decisions: number;
  /** ...of those, ones of the same phase+type as the first disagreement. */
  sameKind: number;
  /** Decisions where the candidate chose differently from the control. */
  disagreements: number;
  fork: Fork | undefined;
  controlWinner: PlayerId | null;
}

/**
 * Plays one game with the control agent, asking the candidate at every decision.
 *
 * Both agents see the identical observation, and the policy is deterministic, so
 * a difference in their answers is caused by the candidate module and nothing
 * else. Only the *first* difference is kept: it is the only one whose position
 * both arms reached the same way.
 */
async function probeGame(
  options: Options,
  opponent: string,
  seed: string,
  focusSeat: PlayerId,
): Promise<Probe> {
  const service = new GameService();
  let observation = service.create({
    p1: resolveDeck(focusSeat === "p1" ? options.deck : opponent),
    p2: resolveDeck(focusSeat === "p1" ? opponent : options.deck),
    seed,
    startingPlayer: "random",
  });
  const focus = seatAgents(options.deck, options.module);
  const opponentAgent = new RegistryRulesAgent(leaderOf(opponent));
  const agents: Record<PlayerId, Agent> = {
    p1: focusSeat === "p1" ? focus.control : opponentAgent,
    p2: focusSeat === "p2" ? focus.control : opponentAgent,
  };

  const applied: string[] = [];
  const probe: Probe = {
    decisions: 0,
    sameKind: 0,
    disagreements: 0,
    fork: undefined,
    controlWinner: null,
  };
  let actions = 0;
  while (observation.phase !== "finished" && actions < options.maxActions) {
    const seat = observation.activePlayer;
    const agent = agents[seat];
    attach(service, agent, observation);
    const action = await agent.chooseAction(observation);
    // Only the focus seat's decisions are the candidate's to speak at, and a
    // decision offering one action is the engine's, not the policy's.
    if (seat === focusSeat && observation.legalActions.length > 1) {
      probe.decisions += 1;
      attach(service, focus.treatment, observation);
      const alternative = await focus.treatment.chooseAction(observation);
      if (alternative.actionId !== action.actionId) {
        probe.disagreements += 1;
        probe.fork ??= {
          prefix: [...applied],
          controlAction: action.actionId,
          treatmentAction: alternative.actionId,
          turn: observation.turn,
          phase: observation.phase,
        };
      }
      if (probe.fork && observation.phase === probe.fork.phase) {
        probe.sameKind += 1;
      }
    }
    observation = service.act(
      observation.gameId,
      observation.revision,
      action.actionId,
    );
    applied.push(action.actionId);
    actions += 1;
  }
  probe.controlWinner =
    observation.phase === "finished" ? observation.winner : null;
  return probe;
}

/**
 * Replays the prefix, takes the candidate's action, then finishes the game with
 * the control agent in both seats' policies.
 *
 * The rest of the game is played by the *control* agent on purpose. Letting the
 * candidate keep deciding would measure the rule over the remainder of the game
 * and put us back where `deck:ab` already is; this way the branches differ by
 * exactly one action.
 */
async function playFork(
  options: Options,
  opponent: string,
  seed: string,
  focusSeat: PlayerId,
  fork: Fork,
): Promise<PlayerId | null> {
  const service = new GameService();
  let observation = service.create({
    p1: resolveDeck(focusSeat === "p1" ? options.deck : opponent),
    p2: resolveDeck(focusSeat === "p1" ? opponent : options.deck),
    seed,
    startingPlayer: "random",
  });
  for (const actionId of fork.prefix) {
    observation = service.act(
      observation.gameId,
      observation.revision,
      actionId,
    );
  }
  observation = service.act(
    observation.gameId,
    observation.revision,
    fork.treatmentAction,
  );
  const focus = new RegistryRulesAgent(leaderOf(options.deck), {
    disableModules: [options.module],
  });
  const opponentAgent = new RegistryRulesAgent(leaderOf(opponent));
  const agents: Record<PlayerId, Agent> = {
    p1: focusSeat === "p1" ? focus : opponentAgent,
    p2: focusSeat === "p2" ? focus : opponentAgent,
  };
  let actions = fork.prefix.length + 1;
  while (observation.phase !== "finished" && actions < options.maxActions) {
    const seat = observation.activePlayer;
    const agent = agents[seat];
    attach(service, agent, observation);
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

/** Exact two-sided binomial on the discordant forks -- no normal approximation. */
function exactP(lower: number, total: number): number {
  if (total === 0) return 1;
  let cumulative = 0;
  for (let index = 0; index <= lower; index += 1) {
    let term = 1;
    for (let step = 0; step < index; step += 1) {
      term = (term * (total - step)) / (step + 1);
    }
    cumulative += term;
  }
  return Math.min(1, (2 * cumulative) / 2 ** total);
}

interface Tally {
  games: number;
  decisions: number;
  sameKind: number;
  disagreements: number;
  forks: number;
  controlWins: number;
  treatmentWins: number;
  treatmentOnly: number;
  controlOnly: number;
  phases: Map<string, number>;
}

const emptyTally = (): Tally => ({
  games: 0,
  decisions: 0,
  sameKind: 0,
  disagreements: 0,
  forks: 0,
  controlWins: 0,
  treatmentWins: 0,
  treatmentOnly: 0,
  controlOnly: 0,
  phases: new Map(),
});

async function main(): Promise<void> {
  const options = parse(process.argv.slice(2));
  const total = emptyTally();
  const byOpponent = new Map<string, Tally>();

  for (const opponent of options.opponents) {
    const tally = emptyTally();
    for (let index = 0; index < options.seeds; index += 1) {
      for (const seat of ["p1", "p2"] as const) {
        const seed = `${options.seedPrefix}-${options.deck}-${opponent}-${index}`;
        const probe = await probeGame(options, opponent, seed, seat);
        tally.games += 1;
        tally.decisions += probe.decisions;
        tally.sameKind += probe.sameKind;
        tally.disagreements += probe.disagreements;
        if (!probe.fork || probe.controlWinner === null) continue;
        const treatmentWinner = await playFork(
          options,
          opponent,
          seed,
          seat,
          probe.fork,
        );
        if (treatmentWinner === null) continue;
        tally.forks += 1;
        tally.phases.set(
          probe.fork.phase,
          (tally.phases.get(probe.fork.phase) ?? 0) + 1,
        );
        const controlWon = probe.controlWinner === seat;
        const treatmentWon = treatmentWinner === seat;
        if (controlWon) tally.controlWins += 1;
        if (treatmentWon) tally.treatmentWins += 1;
        if (treatmentWon && !controlWon) tally.treatmentOnly += 1;
        if (controlWon && !treatmentWon) tally.controlOnly += 1;
      }
    }
    byOpponent.set(opponent, tally);
    total.games += tally.games;
    total.decisions += tally.decisions;
    total.sameKind += tally.sameKind;
    total.disagreements += tally.disagreements;
    total.forks += tally.forks;
    total.controlWins += tally.controlWins;
    total.treatmentWins += tally.treatmentWins;
    total.treatmentOnly += tally.treatmentOnly;
    total.controlOnly += tally.controlOnly;
    for (const [phase, count] of tally.phases) {
      total.phases.set(phase, (total.phases.get(phase) ?? 0) + count);
    }
  }

  const pct = (part: number, whole: number) =>
    whole === 0 ? "-" : `${((part / whole) * 100).toFixed(1)}%`;

  console.log(`\nHeuristic probe: ${options.module} on ${options.deck}`);
  console.log(
    `${options.opponents.length} opponents x ${options.seeds} seeds x 2 seats = ${total.games} games\n`,
  );
  console.log("Reach -- where the rule can speak at all:");
  console.log(`  focus-seat decisions with a choice   ${total.decisions}`);
  console.log(
    `  decisions of the forked kind         ${total.sameKind}  (${pct(total.sameKind, total.decisions)} of decisions)`,
  );
  console.log(
    `  the rule changed the choice          ${total.disagreements}  (${pct(total.disagreements, total.sameKind)} of those)`,
  );
  console.log(
    `  games reaching the situation         ${total.forks}  (${pct(total.forks, total.games)} of games)`,
  );
  if (total.phases.size > 0) {
    const where = [...total.phases]
      .sort((left, right) => right[1] - left[1])
      .map(([phase, count]) => `${phase} ${count}`)
      .join(", ");
    console.log(`  first disagreement by phase          ${where}`);
  }

  if (total.forks === 0) {
    console.log(
      "\nThe rule never changed a decision. That is a reach problem, not a\n" +
        "value one: check the gate, and check that the engine offers the action\n" +
        "in the shape the rule matches, before changing what it decides.",
    );
    return;
  }

  const discordant = total.treatmentOnly + total.controlOnly;
  const lower = Math.min(total.treatmentOnly, total.controlOnly);
  const delta = ((total.treatmentWins - total.controlWins) / total.forks) * 100;
  console.log(
    "\nValue -- one decision, both branches played out by the control agent:",
  );
  console.log(
    `  control  ${pct(total.controlWins, total.forks)}   treatment ${pct(total.treatmentWins, total.forks)}   delta ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pt  over ${total.forks} forked games`,
  );
  console.log(
    `  flipped  +${total.treatmentOnly}/-${total.controlOnly}   exact two-sided p = ${exactP(lower, discordant).toFixed(4)}`,
  );
  if (discordant < 20) {
    console.log(
      `  NOTE: ${discordant} discordant forks is too few to call. Raise --seeds.`,
    );
  }

  const rows = [...byOpponent]
    .map(([opponent, tally]) => ({
      opponent,
      forks: tally.forks,
      control: pct(tally.controlWins, tally.forks),
      treatment: pct(tally.treatmentWins, tally.forks),
      flipped: `+${tally.treatmentOnly}/-${tally.controlOnly}`,
    }))
    .filter((row) => row.forks > 0)
    .sort((left, right) => right.forks - left.forks);
  if (rows.length > 0) {
    console.log("\nBy opponent, where the situation arose:");
    console.table(rows);
  }
}

await main();
