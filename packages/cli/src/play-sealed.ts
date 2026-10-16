/**
 * Human-vs-rules-agent playtest of a sealed matchup, from the terminal.
 *
 * `--set=<code>` picks the expansion, defaulting to the newest.
 *
 * Opens two independently-seeded pools -- one per seat -- auto-builds a legal
 * 40-card deck from each with `autoBuildSealedDeck`, and plays a real game
 * with the human at P1 and the rules agent at P2 under the Rainbow Luffy
 * wildcard Leader both seats share in sealed. The engine, sealed core, and
 * agent all already existed (browser sealed mode uses the same three), so
 * this script is wiring, not new capability.
 *
 * Each pool escalates its pack count past the seeded 6 (matching
 * `openSealedPool` in `packages/web/src/sealed-mode.ts`) only if OP17 card
 * coverage ever regresses below the 40-playable-card floor; with all 119
 * cards implemented this never needs to fire, so it is inlined here rather
 * than imported across the cli/web package boundary for one small function.
 *
 * Usage:
 *   tsx packages/cli/src/play-sealed.ts [seed] [--trace path]
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { GameService, reorderAction } from "@one-piece-sim/engine-core";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import {
  autoBuildSealedDeck,
  openPacks,
  requireSealedExpansion,
  sealedDeckManifest,
  sealedPoolIsBuildable,
  DEFAULT_SEALED_EXPANSION,
  SEALED_LEADER,
  SEALED_PACK_COUNT,
  type SealedPool,
  resolveDeck,
} from "@one-piece-sim/decks";
import { TraceRecorder } from "./trace.js";

const PACK_COUNT_ESCALATION: readonly number[] = [
  SEALED_PACK_COUNT,
  8,
  10,
  14,
  20,
  28,
  40,
];

function openSeatPool(
  seed: string,
  expansion: string,
): { pool: SealedPool; packsOpened: number } {
  let attempt: { pool: SealedPool; packsOpened: number } | undefined;
  for (const packCount of PACK_COUNT_ESCALATION) {
    const pool = openPacks(seed, packCount, expansion);
    attempt = { pool, packsOpened: packCount };
    if (sealedPoolIsBuildable(pool).buildable) return attempt;
  }
  return attempt!;
}

function parseArguments(arguments_: string[]): {
  seed: string;
  expansion: string;
  tracePath: string | null;
} {
  let seed = "sealed-playtest";
  let expansion = DEFAULT_SEALED_EXPANSION;
  let tracePath: string | null = null;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--trace") {
      tracePath = arguments_[index + 1] ?? "sealed-playtest-trace.json";
      index += 1;
    } else if (argument.startsWith("--trace=")) {
      tracePath = argument.slice("--trace=".length);
    } else if (argument === "--set") {
      expansion = arguments_[index + 1] ?? DEFAULT_SEALED_EXPANSION;
      index += 1;
    } else if (argument.startsWith("--set=")) {
      expansion = argument.slice("--set=".length);
    } else {
      seed = argument;
    }
  }
  // Validated here rather than at the first draw, so a typo costs a message
  // instead of an empty pool.
  return { seed, expansion: requireSealedExpansion(expansion).code, tracePath };
}

function formatBoard(
  board:
    GameObservation["self"]["board"] | GameObservation["opponent"]["board"],
): string {
  if (board.length === 0) return "(empty)";
  return board
    .map(
      (card) =>
        `${card.name} [${card.cardNumber}] cost ${card.cost}, ${card.currentPower} power ${card.rested ? "rested" : "active"} DON!! x${card.attachedDon}`,
    )
    .join("\n  ");
}

function printObservation(observation: GameObservation): void {
  console.log(`\nTurn ${observation.turn} | ${observation.phase}`);
  console.log(
    `You: Life ${observation.self.lifeCount} | Hand ${observation.self.hand.length} | Deck ${observation.self.deckCount} | Active DON!! ${observation.self.activeDon}`,
  );
  console.log(
    `  Leader: ${observation.self.leader.name} [${observation.self.leader.cardNumber}] ${observation.self.leader.currentPower} power ${observation.self.leader.rested ? "rested" : "active"} DON!! x${observation.self.leader.attachedDon}`,
  );
  console.log(`  ${formatBoard(observation.self.board)}`);
  console.log(
    `Opponent: Life ${observation.opponent.lifeCount} | Hand ${observation.opponent.handCount} | Deck ${observation.opponent.deckCount} | Active DON!! ${observation.opponent.activeDon}`,
  );
  console.log(
    `  Leader: ${observation.opponent.leader.name} [${observation.opponent.leader.cardNumber}] ${observation.opponent.leader.currentPower} power ${observation.opponent.leader.rested ? "rested" : "active"} DON!! x${observation.opponent.leader.attachedDon}`,
  );
  console.log(`  ${formatBoard(observation.opponent.board)}`);
  console.log("Hand:");
  for (const card of observation.self.hand) {
    // The price the engine will charge, with the printed one in brackets when
    // the two differ -- a discount a card grants itself is otherwise invisible
    // until the play the terminal says you cannot afford turns out to be legal.
    const cost =
      card.currentCost === card.cost
        ? `${card.cost}`
        : `${card.currentCost} (printed ${card.cost})`;
    console.log(
      `  ${card.name} [${card.cardNumber}] cost ${cost}, counter ${card.counter}`,
    );
  }
  if (observation.activeBattle) {
    console.log(
      `Battle: ${observation.activeBattle.attackPower} attack vs ${observation.activeBattle.targetPower + observation.activeBattle.counterPower} defense`,
    );
  }
}

async function chooseHumanAction(
  observation: GameObservation,
  prompt: ReturnType<typeof createInterface>,
): Promise<LegalAction | null> {
  printObservation(observation);
  console.log("Legal actions:");
  observation.legalActions.forEach((action, index) => {
    console.log(`  ${index + 1}. ${action.summary}`);
  });
  for (;;) {
    const answer = (
      await prompt.question("Choose an action (or q to quit): ")
    ).trim();
    if (answer.toLowerCase() === "q") return null;
    const index = Number(answer) - 1;
    const action = observation.legalActions[index];
    if (Number.isInteger(index) && action) {
      return action.type === "resolve-effect" && action.option.kind === "order"
        ? await chooseOrder(action, prompt)
        : action;
    }
    console.log(`Enter a number from 1 to ${observation.legalActions.length}.`);
  }
}

/**
 * "[printed text omitted -- pnpm card:text <card>]", as a terminal asks
 * it: one action, so one question, answered with the cards' numbers.
 *
 * The action already carries the reveal order, so an empty answer is a real
 * answer -- it takes the offer as it stands -- and anything that is not a
 * permutation is re-asked rather than sent to the engine to be refused.
 */
async function chooseOrder(
  action: Extract<LegalAction, { type: "resolve-effect" }>,
  prompt: ReturnType<typeof createInterface>,
): Promise<LegalAction> {
  if (action.option.kind !== "order") return action;
  const { cards } = action.option;
  console.log("Placed first is placed deepest:");
  cards.forEach((card, index) => {
    console.log(`  ${index + 1}. ${card.name} [${card.cardNumber}]`);
  });
  for (;;) {
    const answer = (
      await prompt.question("Order (e.g. 3,1,2 -- blank to keep this one): ")
    ).trim();
    if (answer === "") return action;
    const order = answer.split(",").map((part) => Number(part.trim()) - 1);
    try {
      return reorderAction(action, order);
    } catch {
      console.log(`Enter each of 1 to ${cards.length} once, comma separated.`);
    }
  }
}

const { seed, expansion, tracePath } = parseArguments(process.argv.slice(2));

const p1Seat = openSeatPool(`${seed}:p1`, expansion);
const p2Seat = openSeatPool(`${seed}:p2`, expansion);
console.log(`Sealed expansion: ${expansion}`);
for (const [label, seat] of [
  ["You", p1Seat],
  ["Opponent", p2Seat],
] as const) {
  const note =
    seat.packsOpened > SEALED_PACK_COUNT
      ? ` (opened ${seat.packsOpened} packs, not ${SEALED_PACK_COUNT} -- ${expansion} coverage forced a bigger pool)`
      : "";
  console.log(`${label} pool: ${seat.packsOpened} packs opened${note}`);
}

const p1Deck = sealedDeckManifest(
  autoBuildSealedDeck(p1Seat.pool),
  p1Seat.pool,
);
const p2Deck = sealedDeckManifest(
  autoBuildSealedDeck(p2Seat.pool),
  p2Seat.pool,
);

const trace = tracePath ? new TraceRecorder(tracePath, seed) : null;
const opponent = new RegistryRulesAgent(SEALED_LEADER);

const service = new GameService({ callbacks: trace ? [trace] : [] });
let observation = service.create({
  p1: resolveDeck(p1Deck.id, p1Deck),
  p2: resolveDeck(p2Deck.id, p2Deck),
  seed,
});
trace?.setInitialObservation(observation);
if (trace) console.log(`Writing playtest trace to ${trace.filePath}`);

const prompt = createInterface({ input, output });
let quit = false;

try {
  while (observation.phase !== "finished" && !quit) {
    const forcedBlockPass =
      observation.phase === "block" &&
      observation.legalActions.length === 1 &&
      observation.legalActions[0]?.type === "pass";
    if (forcedBlockPass) {
      console.log(
        "\nNo active Blocker is available. Continuing to the Counter step.",
      );
      trace?.setController("automatic");
      observation = service.act(
        observation.gameId,
        observation.revision,
        observation.legalActions[0]!.actionId,
      );
      continue;
    }
    const action =
      observation.activePlayer === "p1"
        ? await chooseHumanAction(observation, prompt)
        : await opponent.chooseAction(observation);
    if (!action) {
      quit = true;
      continue;
    }
    if (observation.activePlayer === "p2") {
      console.log(`\nOpponent: ${action.summary}`);
    }
    trace?.setController(
      observation.activePlayer === "p1" ? "human" : "rules-agent",
    );
    observation = service.act(
      observation.gameId,
      observation.revision,
      action.actionId,
    );
  }
} finally {
  prompt.close();
  trace?.finish(observation, quit);
}

if (quit) {
  console.log("Playtest ended.");
} else {
  console.log(
    `\nGame over: ${observation.winner === "p1" ? "You" : "Opponent"} wins by ${observation.resultReason}.`,
  );
}
