/**
 * A bridge trace (`sys1.traces.write_trace`) as a readable game log: replays
 * its action ids through the engine and prints, turn by turn, each side's
 * Life, hand, DON!! and board, every action by its offer summary, the public
 * events it caused, and -- for the scorer's own decisions -- the win
 * probability it saw and the options it weighed. A trace carries opaque
 * action ids only; this is what makes one reviewable without the app.
 *
 *   pnpm exec tsx ml/bridge/trace-text.ts <trace.jsonl | dir> [out-dir]
 *
 * With a directory, every `.jsonl` in it is rendered, to `out-dir` (default:
 * beside each trace, `.txt`).
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  applyOfferedAction,
  createGame,
  observe,
  toGameAction,
  type GameState,
} from "@one-piece-sim/engine-core";
import type { PlayerId } from "@one-piece-sim/protocol";
import { resolveTrainingDeck } from "./decks.js";

interface Header {
  config: { p1Deck: string; p2Deck: string; seed: string };
  scorer?: { seat: PlayerId; won: boolean; checkpoint?: string };
}
interface Line {
  actionId: string;
  player: PlayerId;
  scorer?: {
    options: { actionId: string; p: number }[];
    winProbability: number;
  };
}

const short = (deck: string) => deck.replace(/ - .*$/, "");

function side(state: GameState, seat: PlayerId, label: string): string {
  const view = observe(state, seat).self;
  const board = view.board
    .map(
      (c) =>
        `${c.name} ${c.cardNumber} ${c.currentPower}${c.rested ? " (rested)" : ""}`,
    )
    .join(", ");
  const leader = view.leader;
  return (
    `  ${label}: Life ${view.lifeCount}, hand ${view.hand.length} [${view.hand
      .map((c) => c.name)
      .join(
        ", ",
      )}], DON!! ${view.activeDon} active/${view.restedDon} rested, ` +
    `Leader ${leader.cardNumber} ${leader.currentPower}${leader.rested ? " (rested)" : ""}\n` +
    `    board: ${board || "-"}`
  );
}

function render(path: string): string {
  const [headerLine, ...rest] = readFileSync(path, "utf8").trim().split("\n");
  const header = JSON.parse(headerLine!) as Header;
  const lines = rest.map((l) => JSON.parse(l) as Line);
  const { p1Deck, p2Deck, seed } = header.config;
  const label: Record<PlayerId, string> = {
    p1: short(p1Deck),
    p2: short(p2Deck),
  };
  let state = createGame({
    gameId: `trace-text-${seed}`,
    p1: resolveTrainingDeck(p1Deck),
    p2: resolveTrainingDeck(p2Deck),
    seed,
    startingPlayer: "random",
  });
  const out: string[] = [
    `${label.p1} (p1) vs ${label.p2} (p2), seed ${seed}; ` +
      `${state.activePlayer} (${label[state.activePlayer]}) goes first`,
  ];
  if (header.scorer)
    out.push(
      `scorer seat: ${header.scorer.seat} (${label[header.scorer.seat]}), ${header.scorer.won ? "won" : "lost"}`,
    );
  let turn = -1;
  let seen = 0;
  for (const line of lines) {
    if (state.turn !== turn) {
      turn = state.turn;
      out.push(
        `\n=== Turn ${turn}: ${label[state.activePlayer]} (${state.activePlayer}) ===`,
        side(state, "p1", label.p1),
        side(state, "p2", label.p2),
      );
    }
    const offers = observe(state, line.player).legalActions;
    const chosen = offers.find((a) => a.actionId === line.actionId);
    if (!chosen) {
      out.push(
        `!! replay diverged: ${line.actionId} not offered to ${line.player}`,
      );
      break;
    }
    let note = "";
    if (line.scorer) {
      const summary = new Map(offers.map((a) => [a.actionId, a.summary]));
      const weighed = [...line.scorer.options]
        .sort((a, b) => b.p - a.p)
        .slice(0, 4)
        .filter((o) => o.actionId !== line.actionId && o.p >= 0.05)
        .map(
          (o) => `${summary.get(o.actionId) ?? o.actionId} ${o.p.toFixed(2)}`,
        );
      const p =
        line.scorer.options.find((o) => o.actionId === line.actionId)?.p ?? 0;
      note =
        `   [p ${p.toFixed(2)}, win ${line.scorer.winProbability.toFixed(2)}]` +
        (weighed.length ? ` else: ${weighed.join("; ")}` : "");
    }
    out.push(
      `  ${label[line.player]}: ${chosen.type} -- ${chosen.summary}${note}`,
    );
    state = applyOfferedAction(
      state,
      toGameAction(chosen, state.revision),
      chosen,
    ).state;
    const events = observe(state, "p1").publicEvents;
    for (const event of events.slice(seen)) {
      const text = JSON.stringify(event);
      out.push(
        `      * ${text.length > 220 ? `${text.slice(0, 220)}...` : text}`,
      );
    }
    seen = events.length;
  }
  out.push(
    `\nresult: ${state.winner ? `${label[state.winner]} (${state.winner}) wins` : "unfinished"} on turn ${state.turn}`,
  );
  return out.join("\n") + "\n";
}

const [target, outDir] = process.argv.slice(2);
if (!target)
  throw new Error("usage: trace-text.ts <trace.jsonl | dir> [out-dir]");
const files = statSync(target).isDirectory()
  ? readdirSync(target)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(target, f))
  : [target];
for (const file of files) {
  const text = render(file);
  const dest = join(
    outDir ?? join(file, ".."),
    basename(file).replace(/\.jsonl$/, ".txt"),
  );
  writeFileSync(dest, text);
}
console.log(`rendered ${files.length} trace(s)`);
