/**
 * Per-card breakdown of the traced seat's deck across a directory of bridge
 * traces (record_traces.py): how often each card is drawn and used, how it is
 * used (played, Counter, cast, discarded, attacks, blocks), and the win rate
 * with it drawn against without ("impact"). Prints a markdown table.
 *
 *   SYS1_EXTRA_DECKS=/tmp/variants.json pnpm exec tsx \
 *     ml/bridge/card-usage.ts ml/checkpoints/mon-traces
 *
 * Impact is a correlation, not an effect: a card drawn mostly in long games or
 * from behind takes those games' results, a Counter left unused because the
 * game was already won reads as a winner, and it is relative to the list's own
 * average. Use it to find suspects; measure them with list_ab.py.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  applyOfferedAction,
  createGame,
  observe,
  toGameAction,
} from "@one-piece-sim/engine-core";
import type { PlayerId, TimeLimit } from "@one-piece-sim/protocol";
import { resolveTrainingDeck, trainingManifest } from "./decks.js";

interface Row {
  drawn: number;
  drawnWon: number;
  used: number;
  played: number;
  counter: number;
  cast: number;
  discarded: number;
  attacks: number;
  blocks: number;
}
const dir = process.argv[2];
if (!dir) throw new Error("usage: card_usage.ts <trace dir>");
const rows = new Map<string, Row>();
const row = (card: string): Row => {
  let r = rows.get(card);
  if (!r) {
    r = {
      drawn: 0,
      drawnWon: 0,
      used: 0,
      played: 0,
      counter: 0,
      cast: 0,
      discarded: 0,
      attacks: 0,
      blocks: 0,
    };
    rows.set(card, r);
  }
  return r;
};
let games = 0;
let wins = 0;
let list: Record<string, number> = {};
const names = new Map<string, string>();
for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
  const [head, ...rest] = readFileSync(join(dir, file), "utf8")
    .trim()
    .split("\n");
  const header = JSON.parse(head!) as {
    config: {
      p1Deck: string;
      p2Deck: string;
      seed: string;
      timeLimit?: TimeLimit;
    };
    scorer: { seat: PlayerId; won: boolean };
  };
  const me = header.scorer.seat;
  const won = header.scorer.won;
  const deck = me === "p1" ? header.config.p1Deck : header.config.p2Deck;
  list = trainingManifest(deck)!.cards;
  for (const card of Object.keys(list)) row(card);
  games += 1;
  wins += won ? 1 : 0;
  let state = createGame({
    gameId: "card-usage",
    p1: resolveTrainingDeck(header.config.p1Deck),
    p2: resolveTrainingDeck(header.config.p2Deck),
    seed: header.config.seed,
    startingPlayer: "random",
    ...(header.config.timeLimit ? { timeLimit: header.config.timeLimit } : {}),
  });
  const instance = new Map<string, string>();
  const drawn = new Set<string>();
  const used = new Set<string>();
  let seen = 0;
  let setUp = false;
  const lines = rest.map(
    (l) => JSON.parse(l) as { actionId: string; player: PlayerId },
  );
  for (let i = 0; i <= lines.length; i += 1) {
    const view = observe(state, me);
    for (const e of view.publicEvents.slice(seen) as Array<
      Record<string, string>
    >) {
      if (e.type === "setup-complete") setUp = true;
      if (e.type === "attack-declared" && e.playerId === me) {
        const card = instance.get(e.attackerInstanceId!);
        if (card) row(card).attacks += 1;
      }
      if (e.type === "attack-blocked") {
        const card = instance.get(e.blockerInstanceId!);
        if (card) row(card).blocks += 1;
      }
      if (e.playerId !== me || !e.cardNumber || !(e.cardNumber in list))
        continue;
      const r = row(e.cardNumber);
      if (e.type === "card-played" || e.type === "stage-played") {
        r.played += 1;
        used.add(e.cardNumber);
        instance.set(e.cardInstanceId!, e.cardNumber);
      }
      if (e.type === "counter-used") {
        r.counter += 1;
        used.add(e.cardNumber);
      }
      if (e.type === "event-activated") {
        r.cast += 1;
        used.add(e.cardNumber);
      }
      if (e.type === "card-moved" && e.from === "hand" && e.to === "trash")
        r.discarded += 1;
    }
    seen = view.publicEvents.length;
    if (setUp)
      for (const c of view.self.hand) {
        drawn.add(c.cardNumber);
        names.set(c.cardNumber, c.name);
      }
    if (i === lines.length) break;
    const line = lines[i]!;
    const chosen = observe(state, line.player).legalActions.find(
      (a) => a.actionId === line.actionId,
    );
    if (!chosen)
      throw new Error(`${file}: replay diverged at ${line.actionId}`);
    state = applyOfferedAction(
      state,
      toGameAction(chosen, state.revision),
      chosen,
    ).state;
  }
  for (const card of drawn)
    if (card in list) {
      row(card).drawn += 1;
      row(card).drawnWon += won ? 1 : 0;
    }
  for (const card of used) row(card).used += 1;
}

const pct = (x: number) => `${Math.round(100 * x)}%`;
const per = (n: number) => (n / games).toFixed(2);
console.log(`${games} games, won ${wins} (${pct(wins / games)})\n`);
console.log(
  "| Card | Copies | Drawn in | Used when drawn | Per game: played / Counter / cast / discarded / attacks / blocks | Win rate drawn / not drawn | Impact |",
);
console.log("|---|---|---|---|---|---|---|");
const table = [...rows].map(([card, r]) => {
  const notDrawn = games - r.drawn;
  const wd = r.drawn ? r.drawnWon / r.drawn : 0;
  const wn = notDrawn ? (wins - r.drawnWon) / notDrawn : 0;
  const se = Math.sqrt(
    (wd * (1 - wd)) / Math.max(r.drawn, 1) +
      (wn * (1 - wn)) / Math.max(notDrawn, 1),
  );
  return { card, r, wd, wn, impact: wd - wn, se };
});
for (const { card, r, wd, wn, impact, se } of table.sort(
  (a, b) => b.impact - a.impact,
)) {
  // A Counter Event is both cast and used as a Counter; count it once.
  const cast = r.cast === r.counter ? 0 : r.cast;
  console.log(
    `| ${card} ${names.get(card) ?? ""} | ${list[card] ?? "-"} | ${pct(r.drawn / games)} | ${pct(r.used / Math.max(r.drawn, 1))} | ` +
      `${per(r.played)} / ${per(r.counter)} / ${per(cast)} / ${per(r.discarded)} / ${per(r.attacks)} / ${per(r.blocks)} | ` +
      `${pct(wd)} / ${pct(wn)} | ${(100 * impact).toFixed(0)} ± ${(100 * se).toFixed(0)} |`,
  );
}
