/**
 * What a directory of recorded OPTCGSim games (`recorder.ts`) says about
 * where this engine and the sim disagree.
 *
 *   pnpm optcgsim:report [analysis/optcgsim]
 *
 * One line per game, then every place a game's two copies parted, grouped by
 * the card whose play or effect was the last thing both agreed on -- the
 * place to start reading the play-by-play from.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Play {
  /** `play`, `divergence`, or the game's last line. */
  kind: string;
  actions?: string[];
}

interface Parted {
  afterPlay: number;
  turn: number;
  seat: string;
  step: string;
  why: string;
  differences: string[];
}

interface Game {
  game: string;
  p1Deck: string;
  p2Deck: string;
  actions: number;
  decisions: number;
  complete: boolean;
  ended?: { winner: string | null; agrees: boolean; detail: string };
  divergences: Parted[];
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

const games = lines(indexPath) as Game[];
const short = (deck: string): string =>
  deck.replace(/ - (Official Feature Deck|Starter Deck \d+)$/, "").slice(0, 32);

/** The last card named by a play before the game's `afterPlay`-th. */
function cardBefore(game: string, afterPlay: number): string {
  const path = join(directory, `${game}.plays.jsonl`);
  if (!existsSync(path)) return "?";
  const plays = (lines(path) as Play[])
    .filter((play) => play.kind === "play")
    .slice(0, afterPlay);
  for (const play of plays.reverse()) {
    for (const action of play.actions ?? []) {
      const card =
        /^(?:Play|Activate|Attack .* with|Counter with) ([^[]+\[[A-Z0-9-]+\])/.exec(
          action,
        );
      if (card) return card[1]!;
    }
  }
  return "?";
}

const complete = games.filter((game) => game.complete);
const finished = games.filter((game) => game.ended);
console.log(
  `${games.length} games: ${complete.length} recorded to the end with the same winner; ${finished.length} played to the end, ${games.length - finished.length} given up\n`,
);
console.log("record  parted  game");
for (const game of games) {
  const result = game.complete
    ? "complete"
    : game.ended
      ? game.ended.detail
      : (game.divergences[game.divergences.length - 1]?.why ?? "");
  console.log(
    `${String(game.actions).padStart(6)}  ${String(game.divergences.length).padStart(6)}  ${short(game.p1Deck).padEnd(32)} v ${short(game.p2Deck).padEnd(32)} ${result.slice(0, 80)}`,
  );
}

const byCard = new Map<string, { game: Game; parted: Parted }[]>();
for (const game of games) {
  for (const parted of game.divergences) {
    const card = cardBefore(game.game, parted.afterPlay);
    byCard.set(card, [...(byCard.get(card) ?? []), { game, parted }]);
  }
}
if (byCard.size > 0) {
  console.log("\nWhere the games parted, by the last card played before:");
  for (const [card, group] of [...byCard].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.log(`\n${group.length}x after ${card}`);
    for (const { game, parted } of group.slice(0, 4)) {
      console.log(
        `  ${game.game} turn ${parted.turn} ${parted.seat} ${parted.step}: ${parted.why}`.slice(
          0,
          200,
        ),
      );
      for (const difference of parted.differences
        .filter((line) => !/ (deck|hand): engine/.test(line))
        .slice(0, 4)) {
        console.log(`      ${difference.slice(0, 180)}`);
      }
    }
  }
}
