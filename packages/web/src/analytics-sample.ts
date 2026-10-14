/**
 * A finished matchup run's sample games, packaged as one download.
 *
 * Each game is the trace the board's own "Download trace" writes -- the v2
 * diagnostics JSONL -- rebuilt by replaying the game's seed and action list
 * through the same controller a loaded trace runs on. So every file in the
 * download is one the lobby's trace loader reads back, to watch or to play on.
 *
 * The files go in a zip because the loader takes one match per file and a
 * browser asked to save four files from one click blocks or prompts for all
 * but the first. The zip also carries a manifest naming the slot each file
 * fills and the slots no game filled.
 */
import { strToU8, zipSync } from "fflate";
import type { DeckManifest } from "@one-piece-sim/decks";
import {
  sampleContents,
  type SampleGame,
  type SampleSlot,
} from "./analytics.js";
import type { AnalyticsPilot } from "./analytics-worker.js";
import { BrowserGameController, type MatchConfig } from "./controller.js";
import { buildDiagnosticsJsonl } from "./diagnostics.js";

export interface SampleDownloadInput {
  self: string;
  opponent: string;
  samples: readonly SampleGame[];
  pilot: AnalyticsPilot;
  /** Manifests for any deck the registry does not know, keyed by its ID. */
  customDecks: Readonly<Record<string, DeckManifest>>;
  /** A deck's short name, for file names and the manifest. */
  name(deck: string): string;
  exportedAt: string;
}

export interface SampleDownload {
  filename: string;
  bytes: Uint8Array<ArrayBuffer>;
  /** The traces in the zip, in slot order. */
  files: string[];
  missing: SampleSlot[];
}

/** "won going first" / "won going second": the slot in words. */
export function slotPhrase(seat: SampleSlot["seat"]): string {
  return seat === "first" ? "won going first" : "won going second";
}

export function buildSampleDownload(
  input: SampleDownloadInput,
): SampleDownload {
  const { filled, missing } = sampleContents(
    input.samples,
    input.self,
    input.opponent,
  );
  const entries: Record<string, Uint8Array> = {};
  const files: string[] = [];
  const manifestGames = filled.map(({ slot, game }, index) => {
    const file = `${index + 1}-${slug(input.name(slot.deck))}-${slug(slotPhrase(slot.seat))}.jsonl`;
    const trace = BrowserGameController.load({
      version: 1,
      config: sampleConfig(game, input),
      actions: game.actionIds,
    }).trace();
    entries[file] = strToU8(
      buildDiagnosticsJsonl({
        trace,
        llmRecords: [],
        exportedAt: input.exportedAt,
      }),
    );
    files.push(file);
    return {
      file,
      deck: slot.deck,
      seat: slot.seat,
      opponent: slot.seat === "first" ? game.secondDeck : game.firstDeck,
      seed: game.seed,
      actions: game.actionIds.length,
    };
  });
  const manifest = {
    exportedAt: input.exportedAt,
    matchup: { self: input.self, opponent: input.opponent },
    pilot: input.pilot,
    about:
      "For each deck, the first game of the run it won going first and the first it won going second. Each .jsonl is a match trace: load it from the lobby to watch it or play on.",
    games: manifestGames,
    missing: missing.map((slot) => ({
      deck: slot.deck,
      seat: slot.seat,
      reason: `${input.name(slot.deck)} never ${slotPhrase(slot.seat)} in this run`,
    })),
  };
  entries["manifest.json"] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  const pair =
    input.self === input.opponent
      ? `${slug(input.name(input.self))}-mirror`
      : `${slug(input.name(input.self))}-vs-${slug(input.name(input.opponent))}`;
  return {
    filename: `open-optcg-sample-${pair}.zip`,
    // Copied into a fresh buffer: fflate's result is typed as possibly shared
    // memory, which a Blob does not accept.
    bytes: new Uint8Array(zipSync(entries)),
    files,
    missing,
  };
}

/**
 * The match a sample game was, as a trace's config names it: the deck going
 * first is p1 and starts, exactly as `playAnalyticsGame` sets it up, so the
 * seed deals the same game and the action list replays it.
 */
function sampleConfig(
  game: SampleGame,
  input: SampleDownloadInput,
): MatchConfig {
  const first = input.customDecks[game.firstDeck];
  const second = input.customDecks[game.secondDeck];
  return {
    p1Deck: game.firstDeck,
    p2Deck: game.secondDeck,
    ...(first ? { p1CustomDeck: first } : {}),
    ...(second ? { p2CustomDeck: second } : {}),
    p1Controller: input.pilot,
    p2Controller: input.pilot,
    seed: game.seed,
    startingPlayer: "p1",
  };
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "deck"
  );
}
