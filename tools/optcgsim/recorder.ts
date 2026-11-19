/**
 * Keeps the recorded games (`shadow.ts`) the plugin's snapshots belong to,
 * and writes each one out as it goes:
 *
 *   <name>.jsonl        the game in this engine's format -- loads in the app
 *                       and in every `pnpm trace:*` tool
 *   <name>.plays.jsonl  play by play: each decision's engine actions beside
 *                       the move the sim was given, then where the two games
 *                       parted, or how both ended
 *   <name>.sim.jsonl    every snapshot the sim sent and the move it got back
 *   index.jsonl         one line per game: its decks, how far the record got,
 *                       and the difference that ended it
 *
 * The files are rewritten at every decision, so a sim that is closed
 * mid-game leaves the record up to its last move.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlayerId } from "@one-piece-sim/protocol";
import type { Decider, Decision } from "./decide.js";
import { ShadowGame } from "./shadow.js";
import type { TableSnapshot } from "./snapshot.js";

export interface RecordStatus {
  /** `diverged` once the engine's game has parted from the sim's. */
  status: "in-sync" | "diverged";
  /** Engine actions recorded so far. */
  actions: number;
  file: string;
  why?: string;
}

interface Recording {
  shadow: ShadowGame;
  name: string;
  sim: string[];
  indexed: boolean;
}

export class Recorder {
  readonly #games = new Map<string, Recording>();
  #count = 0;

  constructor(
    readonly directory: string,
    readonly decider: Decider,
    /** Stamps file names and seeds; injected so a test can fix it. */
    readonly now: () => Date = () => new Date(),
  ) {}

  async decide(
    snapshot: TableSnapshot,
  ): Promise<Decision & { record: RecordStatus }> {
    const recording = this.#recording(snapshot);
    const { shadow } = recording;
    let decision: Decision | undefined;
    let failure: string | undefined;
    if (!shadow.divergence) {
      try {
        decision = await shadow.decide(snapshot);
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
    }
    // Past the point the games parted, or at a decision the engine's game
    // could not take, the sim's game still needs its move: the position is
    // rebuilt from the snapshot, as in a game that is not recorded.
    decision ??= await this.decider.decide(snapshot);
    recording.sim.push(JSON.stringify({ snapshot, move: decision.move }));
    this.#write(recording, failure);
    return {
      ...decision,
      record: {
        status: shadow.divergence || failure ? "diverged" : "in-sync",
        actions: shadow.actionCount,
        file: join(this.directory, `${recording.name}.jsonl`),
        ...(shadow.divergence ? { why: shadow.divergence.why } : {}),
        ...(failure ? { why: failure } : {}),
      },
    };
  }

  /** The sim's game ended; `winner` is who it says won. */
  finish(
    game: string,
    winner: PlayerId | null,
    /** Why the plugin gave the game up, when it did not end. */
    abandoned?: string,
  ): RecordStatus | undefined {
    const recording = this.#games.get(game);
    if (!recording) return undefined;
    if (abandoned) recording.shadow.abandon(abandoned);
    else recording.shadow.finish(winner);
    this.#write(recording, undefined);
    this.#games.delete(game);
    const { shadow } = recording;
    return {
      status: shadow.divergence ? "diverged" : "in-sync",
      actions: shadow.actionCount,
      file: join(this.directory, `${recording.name}.jsonl`),
      why: shadow.divergence?.why ?? shadow.ended?.detail ?? "",
    };
  }

  #recording(snapshot: TableSnapshot): Recording {
    const id = snapshot.game ?? "game";
    let recording = this.#games.get(id);
    if (!recording) {
      const stamp = this.now().toISOString().replace(/[:.]/g, "-");
      this.#count += 1;
      const leaders = `${snapshot.players.p1.leader.cardNumber}-vs-${snapshot.players.p2.leader.cardNumber}`;
      recording = {
        shadow: new ShadowGame(
          snapshot,
          (observation, deck) => this.decider.choose(observation, deck),
          `optcgsim-${stamp}-${this.#count}`,
        ),
        name: `${stamp}-${leaders}`.replace(/[^A-Za-z0-9._-]/g, "_"),
        sim: [],
        indexed: false,
      };
      this.#games.set(id, recording);
    }
    return recording;
  }

  #write(recording: Recording, failure: string | undefined): void {
    const { shadow, name } = recording;
    mkdirSync(this.directory, { recursive: true });
    const path = (suffix: string): string =>
      join(this.directory, `${name}${suffix}`);
    try {
      writeFileSync(path(".jsonl"), shadow.trace(this.now().toISOString()));
    } catch (error) {
      failure ??= `the record does not export: ${error instanceof Error ? error.message : String(error)}`;
    }
    const outcome = shadow.divergence
      ? { kind: "divergence", ...shadow.divergence }
      : failure
        ? { kind: "divergence", at: shadow.actionCount, why: failure }
        : shadow.ended
          ? { kind: "end", ...shadow.ended }
          : undefined;
    writeFileSync(
      path(".plays.jsonl"),
      [
        ...shadow.plays.map((play) =>
          JSON.stringify({ kind: "play", ...play }),
        ),
        ...(outcome ? [JSON.stringify(outcome)] : []),
      ].join("\n") + "\n",
    );
    writeFileSync(path(".sim.jsonl"), recording.sim.join("\n") + "\n");
    if (outcome && !recording.indexed) {
      recording.indexed = true;
      const match = shadow.match();
      appendFileSync(
        join(this.directory, "index.jsonl"),
        JSON.stringify({
          game: name,
          p1Deck: match.p1Deck,
          p2Deck: match.p2Deck,
          actions: shadow.actionCount,
          decisions: shadow.plays.length,
          ...outcome,
        }) + "\n",
      );
    }
  }
}
