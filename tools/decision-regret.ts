/**
 * Asks, of one recorded decision: would any other legal action have won?
 *
 * Every other instrument in this repository is correlational. `pnpm trace:audit`
 * says a seat attacks 0.35 times a turn in the games it loses and 0.62 in the
 * ones it wins, and cannot say which way the arrow points -- a deck that is
 * losing has fewer bodies to attack with, so the habit is as plausibly a symptom
 * as a cause. `pnpm deck:ab` is causal but only about a whole rule over
 * thousands of games; it cannot say which decision the rule got wrong.
 *
 * This is the missing middle. The engine is deterministic and both seats are
 * rules agents, so a rollout needs no sampling: apply the alternative, finish
 * the game once, and the winner is the answer. A decision where no alternative
 * wins was not the mistake, whatever it looked like; a decision where several
 * do is where a rule is worth writing.
 *
 * What it does not claim: that a winning alternative is a rule. The opponent is
 * a fixed policy, so an alternative can win by walking into a line this
 * particular opponent misplays. Read the winning actions for a *pattern* across
 * several games -- that is what makes it a hypothesis worth measuring with
 * `deck:ab` -- rather than shipping the single action it names.
 *
 * Usage:
 *   pnpm trace:regret --p1 "(Green/Blue) Monkey.D.Luffy - Official Feature Deck" \
 *     --p2 "(Red) Monkey.D.Luffy - Starter Deck 31" \
 *     --seed "rules-benchmark-...-0" --turn 8
 *   pnpm trace:regret --report analysis/op16-baseline.json \
 *     --deck "(Green/Blue) Monkey.D.Luffy - Official Feature Deck" --result lost \
 *     --games 3 --last-turns 2
 */
import { readFileSync } from "node:fs";
import { GameService } from "@one-piece-sim/engine-core";
import { resolveDeck } from "@one-piece-sim/decks";
import { createRulesAgent } from "../packages/cli/src/agent-factory.js";
import { playOut } from "../packages/cli/src/deck-benchmark.js";
import type { GameObservation, PlayerId } from "@one-piece-sim/protocol";

const flags = new Map<string, string>();
for (let index = 0; index < process.argv.length; index += 1) {
  const argument = process.argv[index]!;
  if (!argument.startsWith("--")) continue;
  const [key, inline] = argument.slice(2).split("=", 2);
  if (!key) continue;
  const next = process.argv[index + 1];
  if (inline !== undefined) flags.set(key, inline);
  else if (next && !next.startsWith("--")) flags.set(key, next);
  else flags.set(key, "true");
}

const maxActions = Number(flags.get("max-actions") ?? "1000");
const maxAlternatives = Number(flags.get("max-alternatives") ?? "40");
const lastTurns = Number(flags.get("last-turns") ?? "2");
const requestedTurn = flags.get("turn") ? Number(flags.get("turn")) : undefined;

interface Target {
  p1Deck: string;
  p2Deck: string;
  seed: string;
  /** The seat to examine; defaults to the one that lost. */
  seat?: PlayerId;
}

/** The games to examine, from a report or from explicit flags. */
function targets(): Target[] {
  const reportPath = flags.get("report");
  if (!reportPath) {
    const p1Deck = flags.get("p1");
    const p2Deck = flags.get("p2");
    const seed = flags.get("seed");
    if (!p1Deck || !p2Deck || !seed) {
      throw new Error(
        'USAGE: pnpm trace:regret --p1 "<deck>" --p2 "<deck>" --seed "<seed>" [--turn N]  |  --report <report.json> --deck "<deck>" [--result lost] [--games 3] [--last-turns 2]',
      );
    }
    return [{ p1Deck, p2Deck, seed }];
  }
  const deck = flags.get("deck");
  if (!deck) throw new Error("MISSING_DECK: --report needs --deck");
  const result = flags.get("result") ?? "lost";
  const wanted = Number(flags.get("games") ?? "3");
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    games?: readonly {
      seed: string;
      p1Deck: string;
      p2Deck: string;
      winnerDeck: string | null;
      completed: boolean;
    }[];
  };
  const opponent = flags.get("opponent");
  return (report.games ?? [])
    .filter((game) => game.completed)
    .filter((game) => game.p1Deck === deck || game.p2Deck === deck)
    .filter(
      (game) =>
        opponent === undefined ||
        game.p1Deck === opponent ||
        game.p2Deck === opponent,
    )
    .filter((game) =>
      result === "lost" ? game.winnerDeck !== deck : game.winnerDeck === deck,
    )
    .slice(0, wanted)
    .map((game) => ({
      seed: game.seed,
      p1Deck: game.p1Deck,
      p2Deck: game.p2Deck,
      seat: game.p1Deck === deck ? "p1" : "p2",
    }));
}

function createGame(target: Target): {
  service: GameService;
  observation: GameObservation;
} {
  const service = new GameService();
  const observation = service.create({
    p1: resolveDeck(target.p1Deck),
    p2: resolveDeck(target.p2Deck),
    seed: target.seed,
    startingPlayer: "random",
  });
  return { service, observation };
}

function agentsFor(
  target: Target,
): Readonly<Record<PlayerId, ReturnType<typeof createRulesAgent>>> {
  return {
    p1: createRulesAgent(target.p1Deck),
    p2: createRulesAgent(target.p2Deck),
  };
}

/** Replays `prefix` by action id, which needs no agents at all. */
function replay(
  target: Target,
  prefix: readonly string[],
): { service: GameService; observation: GameObservation } {
  const game = createGame(target);
  let observation = game.observation;
  for (const actionId of prefix) {
    observation = game.service.act(
      observation.gameId,
      observation.revision,
      actionId,
    );
  }
  return { service: game.service, observation };
}

/** Plays the game as recorded, keeping the action list and each decision's seat. */
async function record(target: Target): Promise<{
  actions: string[];
  seats: PlayerId[];
  turns: number[];
  winner: string | null;
}> {
  const game = createGame(target);
  const actions: string[] = [];
  const seats: PlayerId[] = [];
  const turns: number[] = [];
  const finished = await playOut({
    service: game.service,
    observation: game.observation,
    agents: agentsFor(target),
    maxActions,
    traceSink: {
      onCreate() {},
      onCheckpoint(checkpoint) {
        actions.push(checkpoint.actionId);
        seats.push(checkpoint.player);
        turns.push(checkpoint.turn);
      },
    },
  });
  const winner =
    finished.observation.winner === null
      ? null
      : finished.observation.winner === "p1"
        ? target.p1Deck
        : target.p2Deck;
  return { actions, seats, turns, winner };
}

/** Finishes the game from `observation`, and says who won. */
async function rollout(
  target: Target,
  service: GameService,
  observation: GameObservation,
): Promise<PlayerId | null> {
  const finished = await playOut({
    service,
    observation,
    // Fresh agents: a rules agent carries per-decision state, and reusing the
    // ones that played the recorded line would carry it into the branch.
    agents: agentsFor(target),
    maxActions,
  });
  return finished.observation.winner;
}

for (const target of targets()) {
  const recorded = await record(target);
  const seat = target.seat ?? (recorded.winner === target.p1Deck ? "p2" : "p1");
  const seatDeck = seat === "p1" ? target.p1Deck : target.p2Deck;
  const lastOwnTurn = Math.max(
    ...recorded.turns.filter((_, index) => recorded.seats[index] === seat),
  );
  const floor = requestedTurn ?? lastOwnTurn - (lastTurns - 1);
  console.log(
    `\n=== ${target.seed.slice(-24)}  ${seatDeck} as ${seat}: ${recorded.winner === seatDeck ? "won" : "lost"} on turn ${Math.max(...recorded.turns)}`,
  );
  console.log(
    `    examining its decisions from turn ${floor}${requestedTurn === undefined ? ` (its last ${lastTurns} own turn(s))` : ""}`,
  );

  for (let index = 0; index < recorded.actions.length; index += 1) {
    if (recorded.seats[index] !== seat) continue;
    const turn = recorded.turns[index]!;
    if (turn < floor) continue;
    if (requestedTurn !== undefined && turn !== requestedTurn) continue;
    const prefix = recorded.actions.slice(0, index);
    const at = replay(target, prefix);
    const chosen = recorded.actions[index]!;
    const alternatives = at.observation.legalActions
      .filter((action) => action.actionId !== chosen)
      .slice(0, maxAlternatives);
    if (alternatives.length === 0) continue;
    const wins: string[] = [];
    for (const alternative of alternatives) {
      const branch = replay(target, prefix);
      const after = branch.service.act(
        branch.observation.gameId,
        branch.observation.revision,
        alternative.actionId,
      );
      const winner = await rollout(target, branch.service, after);
      if (winner === seat) wins.push(alternative.summary);
    }
    const chosenLabel =
      at.observation.legalActions.find((action) => action.actionId === chosen)
        ?.summary ?? chosen;
    // "Regret" only means anything when the game was actually lost: in a game
    // the seat won, alternatives that also win are the ordinary case and
    // labelling them regret would read as a fault in a winning line.
    const lostIt = recorded.winner !== seatDeck;
    const verdict =
      wins.length === 0
        ? `no winning alternative (0/${alternatives.length})`
        : lostIt
          ? `REGRET ${wins.length}/${alternatives.length} would have won`
          : `${wins.length}/${alternatives.length} alternatives also win`;
    console.log(`  t${turn} ${verdict}  chose: ${chosenLabel.slice(0, 90)}`);
    if (lostIt) {
      for (const win of wins.slice(0, 4)) {
        console.log(`        would have won: ${win.slice(0, 110)}`);
      }
    }
  }
}
