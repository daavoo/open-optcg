/**
 * What a directory of recorded OPTCGSim games (`recorder.ts`) says about
 * where this engine and the sim disagree.
 *
 *   pnpm optcgsim:report [analysis/optcgsim]
 *
 * One line per game, then the games that ended early grouped by the card
 * whose play or effect was the last thing both games agreed on -- the place
 * to start reading the play-by-play from.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Play {
  /** `play`, or the game's last line: `divergence` or `end`. */
  kind: string;
  turn: number;
  seat: string;
  step: string;
  actions: string[];
  notes?: string[];
}

interface Outcome {
  game: string;
  p1Deck: string;
  p2Deck: string;
  actions: number;
  decisions: number;
  kind: "end" | "divergence";
  turn?: number;
  seat?: string;
  step?: string;
  why?: string;
  differences?: string[];
  agrees?: boolean;
  detail?: string;
}

const directory = process.argv[2] ?? "analysis/optcgsim";
const indexPath = join(directory, "index.jsonl");
if (!existsSync(indexPath)) {
  throw new Error(`no recorded games in ${directory} (no index.jsonl)`);
}
const lines = (path: string): unknown[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);

const games = lines(indexPath) as Outcome[];
const short = (deck: string): string =>
  deck.replace(/ - (Official Feature Deck|Starter Deck \d+)$/, "").slice(0, 34);

/** The last card a play of the game names, newest play first. */
function lastCard(game: string): string {
  const path = join(directory, `${game}.plays.jsonl`);
  if (!existsSync(path)) return "?";
  const plays = (lines(path) as Play[]).filter((play) => play.kind === "play");
  for (const play of plays.reverse()) {
    for (const action of play.actions) {
      const card =
        /^(?:Play|Activate|Attack .* with|Counter with) ([^[]+\[[A-Z0-9-]+\])/.exec(
          action,
        );
      if (card) return card[1]!;
    }
  }
  return "?";
}

const complete = games.filter((game) => game.kind === "end" && game.agrees);
console.log(
  `${games.length} games: ${complete.length} recorded to the end with the same winner, ${games.length - complete.length} ended early\n`,
);
for (const game of games) {
  const result =
    game.kind === "end"
      ? game.agrees
        ? "complete"
        : `ENDS DIFFER: ${game.detail ?? ""}`
      : `turn ${game.turn ?? "?"} ${game.seat ?? ""} ${game.step ?? ""}: ${(game.why ?? "").slice(0, 90)}`;
  console.log(
    `${String(game.actions).padStart(4)}  ${short(game.p1Deck).padEnd(34)} v ${short(game.p2Deck).padEnd(34)} ${result}`,
  );
}

const early = games.filter((game) => !(game.kind === "end" && game.agrees));
if (early.length > 0) {
  const byCard = new Map<string, Outcome[]>();
  for (const game of early) {
    const card = lastCard(game.game);
    byCard.set(card, [...(byCard.get(card) ?? []), game]);
  }
  console.log("\nEnded early, by the last card played before it did:");
  for (const [card, group] of [...byCard].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.log(`\n${group.length}x after ${card}`);
    for (const game of group) {
      console.log(
        `  ${game.game}: ${game.why ?? game.detail ?? ""}`.slice(0, 200),
      );
      for (const difference of (game.differences ?? []).slice(0, 4)) {
        console.log(`      ${difference.slice(0, 180)}`);
      }
    }
  }
}
