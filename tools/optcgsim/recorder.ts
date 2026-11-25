/**
 * Keeps the recorded games (`shadow.ts`) the plugin's snapshots belong to,
 * and writes each one out as it goes:
 *
 *   <name>.jsonl        the game in this engine's format -- loads in the app
 *                       and in every `pnpm trace:*` tool
 *   <name>.plays.jsonl  play by play: each decision's engine actions beside
 *                       the move the sim was given, each place the two games
 *                       parted, and how both ended
 *   <name>.sim.jsonl    every snapshot the sim sent and the move it got back
 *   index.jsonl         one line per finished game: its decks, how far the
 *                       record got, and every place the two games parted
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
    /**
     * A seat whose moves are kept from the record, as a person's are: the
     * model still plays it, from the position rebuilt at each decision, and
     * the record has to find what it did from the table. It is how following
     * a person is checked in games nobody has to sit through.
     */
    readonly blind?: PlayerId,
  ) {}

  async decide(
    asked: TableSnapshot,
  ): Promise<Decision & { record: RecordStatus }> {
    const snapshot = this.blind ? { ...asked, person: this.blind } : asked;
    const recording = this.#recording(snapshot);
    const { shadow } = recording;
    let decision: Decision | undefined;
    let failure: string | undefined;
    if (snapshot.seat === this.blind) {
      try {
        shadow.follow(snapshot);
      } catch {
        // Left for the other seat's next decision to settle.
      }
      if (shadow.unfollowed) {
        recording.sim.push(JSON.stringify({ unfollowed: shadow.unfollowed }));
      }
    } else {
      try {
        decision = await shadow.decide(snapshot);
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
    }
    // At a decision the engine's game could not be made to take, the sim's
    // game still needs its move: the position is rebuilt from the snapshot,
    // as in a game that is not recorded.
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

  /** A snapshot at a decision of the person's, which asks for no move. */
  observe(snapshot: TableSnapshot): { followed: boolean } {
    const recording = this.#recording(snapshot);
    let followed = false;
    try {
      followed = recording.shadow.follow(snapshot);
    } catch {
      // A table the engine's game cannot be read against is left for the
      // model's next decision to settle.
    }
    recording.sim.push(
      JSON.stringify({
        snapshot,
        ...(recording.shadow.unfollowed
          ? { unfollowed: recording.shadow.unfollowed }
          : {}),
      }),
    );
    if (followed) this.#write(recording, undefined);
    return { followed };
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
    this.#write(recording, undefined, true);
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

  #write(
    recording: Recording,
    failure: string | undefined,
    /** The game is over, so its line of the index can be written. */
    final = false,
  ): void {
    const { shadow, name } = recording;
    mkdirSync(this.directory, { recursive: true });
    const path = (suffix: string): string =>
      join(this.directory, `${name}${suffix}`);
    try {
      writeFileSync(path(".jsonl"), shadow.trace(this.now().toISOString()));
    } catch (error) {
      failure ??= `the record does not export: ${error instanceof Error ? error.message : String(error)}`;
    }
    const outcome = shadow.ended
      ? { kind: "end", ...shadow.ended }
      : failure
        ? { kind: "failure", why: failure }
        : undefined;
    // Each divergence where it happened, among the plays.
    const story: string[] = [];
    shadow.plays.forEach((play, index) => {
      for (const parted of shadow.divergences) {
        if (parted.afterPlay === index) {
          story.push(JSON.stringify({ kind: "divergence", ...parted }));
        }
      }
      story.push(JSON.stringify({ kind: "play", ...play }));
    });
    for (const parted of shadow.divergences) {
      if (parted.afterPlay >= shadow.plays.length) {
        story.push(JSON.stringify({ kind: "divergence", ...parted }));
      }
    }
    if (outcome) story.push(JSON.stringify(outcome));
    writeFileSync(path(".plays.jsonl"), story.join("\n") + "\n");
    writeFileSync(path(".sim.jsonl"), recording.sim.join("\n") + "\n");
    if (final && !recording.indexed) {
      recording.indexed = true;
      const match = shadow.match();
      appendFileSync(
        join(this.directory, "index.jsonl"),
        JSON.stringify({
          game: name,
          p1Deck: match.p1Deck,
          p2Deck: match.p2Deck,
          // How far the record -- the game this engine loads -- got.
          actions: shadow.actionCount,
          decisions: shadow.plays.length,
          complete: shadow.divergences.length === 0 && !!shadow.ended?.agrees,
          ended: shadow.ended,
          divergences: shadow.divergences,
        }) + "\n",
      );
    }
  }
}
