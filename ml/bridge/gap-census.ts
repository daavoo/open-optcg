/**
 * How often each field RENDERER-GAPS.md item 3 would add is actually set, over
 * rules-agent games: a flag that is never set cannot move a win rate, so it is
 * not worth a RENDER_VERSION bump.
 *
 *   pnpm exec tsx ml/bridge/gap-census.ts [games] [every]
 *
 * Plays `games` games (default 300) between random selectable decks, the
 * rules agent on both seats, and reads the observation at every `every`-th
 * decision (default 3) from the deciding seat's side.
 */
import {
  applyAction,
  createGame,
  observe,
  toGameAction,
} from "@one-piece-sim/engine-core";
import { SELECTABLE_DECK_IDS, resolveDeck } from "@one-piece-sim/decks";
import type { GameObservation, PlayerId } from "@one-piece-sim/protocol";
import { createRulesAgent } from "../../packages/cli/src/agent-factory.js";

const games = Number(process.argv[2] ?? 300);
const every = Number(process.argv[3] ?? 3);
const counts = new Map<string, number>();
let sampled = 0;
const tally = (key: string, set: boolean) => {
  if (set) counts.set(key, (counts.get(key) ?? 0) + 1);
};

function census(o: GameObservation) {
  const turn = o.turn;
  for (const [side, p] of [
    ["me", o.self],
    ["op", o.opponent],
  ] as const) {
    tally(
      `${side} board card dormant`,
      // `observe()` reports dormant abilities on the viewer's own cards only.
      p.board.some((c) => "dormantAbility" in c && Boolean(c.dormantAbility)),
    );
    tally(
      `${side} leader dormant`,
      "dormantAbility" in p.leader && Boolean(p.leader.dormantAbility),
    );
    tally(`${side} stage present`, p.stage !== null);
    tally(`${side} stage rested`, Boolean(p.stage?.rested));
    tally(
      `${side} stage dormant`,
      Boolean(p.stage && "dormantAbility" in p.stage && p.stage.dormantAbility),
    );
    tally(
      `${side} conditional keyword`,
      Boolean(p.leader.conditionalKeywords?.length) ||
        p.board.some((c) => c.conditionalKeywords?.length),
    );
    tally(`${side} DON!! held from refresh`, (p.donHeldFromRefresh ?? 0) > 0);
    tally(`${side} extra turn`, (p.extraTurns ?? 0) > 0);
    tally(
      `${side} installed replacement`,
      Boolean(p.installedReplacements?.length),
    );
    tally(`${side} on-play negated`, p.onPlayNegated);
    tally(`${side} leader reaction spent`, p.leader.leaderReactionSpent);
    tally(
      `${side} cannot rest`,
      p.board.some((c) => (c.cannotRestUntilTurn ?? -1) >= turn),
    );
    const modifiers = [
      ...p.leader.powerModifiers,
      ...p.board.flatMap((c) => c.powerModifiers),
    ];
    tally(`${side} any power modifier`, modifiers.length > 0);
    tally(
      `${side} modifier outlasting this turn`,
      modifiers.some((m) => m.expiresAtTurn > turn),
    );
    tally(
      `${side} mixed-duration modifiers on one card`,
      [p.leader.powerModifiers, ...p.board.map((c) => c.powerModifiers)].some(
        (list) =>
          list.some((m) => m.expiresAtTurn > turn) &&
          list.some((m) => m.expiresAtTurn <= turn),
      ),
    );
  }
  tally(
    "me hand counter changed",
    o.self.hand.some((c) => c.currentCounter !== c.counter),
  );
}

for (let g = 0; g < games; g += 1) {
  const pick = (salt: number) =>
    SELECTABLE_DECK_IDS[
      (g * 7919 + salt * 104729) % SELECTABLE_DECK_IDS.length
    ]!;
  const p1 = pick(1);
  let p2 = pick(2);
  if (p2 === p1) p2 = pick(3);
  let state = createGame({
    gameId: `census-${g}`,
    p1: resolveDeck(p1),
    p2: resolveDeck(p2),
    seed: `census-${g}`,
    startingPlayer: "random",
  });
  const agents = { p1: createRulesAgent(p1), p2: createRulesAgent(p2) };
  let decisions = 0;
  while (state.phase !== "finished" && decisions < 1500) {
    const seat: PlayerId = state.activePlayer;
    const o = observe(state, seat);
    if (o.legalActions.length > 1 && decisions % every === 0) {
      census(o);
      sampled += 1;
    }
    const action = await agents[seat].chooseAction(o);
    state = applyAction(state, toGameAction(action, state.revision)).state;
    decisions += 1;
  }
}
console.log(`${sampled} decisions from ${games} games`);
for (const [key, n] of [...counts].sort((a, b) => b[1] - a[1]))
  console.log(`${((100 * n) / sampled).toFixed(2).padStart(6)}%  ${key}`);
