import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  matchupSeed,
  offerSample,
  playAnalyticsGame,
  sampleContents,
  sampleSlotOf,
  sampleSlots,
  type AnalyticsGame,
  type SampleGame,
} from "../packages/web/src/analytics.js";
import { buildSampleDownload } from "../packages/web/src/analytics-sample.js";
import { BrowserGameController } from "../packages/web/src/controller.js";
import { parseExportedMatch } from "../packages/web/src/diagnostics.js";
import {
  emptyState,
  render,
  type AnalyticsContext,
} from "../packages/web/src/screens/analytics.js";

const LUFFY = "(Red) Monkey.D.Luffy - Starter Deck 31";
const KID = "(Yellow) Eustass Kid - Starter Deck 36";

function sample(
  firstDeck: string,
  secondDeck: string,
  winner: SampleGame["winner"],
  order: number,
): SampleGame {
  return {
    firstDeck,
    secondDeck,
    seed: `seed-${order}`,
    winner,
    order,
    actionIds: [],
  };
}

describe("sample slots", () => {
  it("a won game fills its winner's deck and seat; an unfinished one fills none", () => {
    expect(
      sampleSlotOf({ firstDeck: LUFFY, secondDeck: KID, winner: "first" }),
    ).toEqual({ deck: LUFFY, seat: "first" });
    expect(
      sampleSlotOf({ firstDeck: LUFFY, secondDeck: KID, winner: "second" }),
    ).toEqual({ deck: KID, seat: "second" });
    expect(
      sampleSlotOf({ firstDeck: LUFFY, secondDeck: KID, winner: null }),
    ).toBeNull();
  });

  it("four slots for two decks, two for a mirror", () => {
    expect(sampleSlots(LUFFY, KID)).toEqual([
      { deck: LUFFY, seat: "first" },
      { deck: LUFFY, seat: "second" },
      { deck: KID, seat: "first" },
      { deck: KID, seat: "second" },
    ]);
    expect(sampleSlots(LUFFY, LUFFY)).toEqual([
      { deck: LUFFY, seat: "first" },
      { deck: LUFFY, seat: "second" },
    ]);
  });

  it("a slot keeps the earliest game in the run, whatever order they arrive in", () => {
    const held = new Map<string, SampleGame>();
    expect(offerSample(held, sample(LUFFY, KID, "first", 7))).toBe(true);
    expect(offerSample(held, sample(LUFFY, KID, "first", 9))).toBe(false);
    expect(offerSample(held, sample(LUFFY, KID, "first", 3))).toBe(true);
    // A loss for Luffy going first is Kid's win going second: another slot.
    expect(offerSample(held, sample(LUFFY, KID, "second", 8))).toBe(true);
    expect([...held.values()].map((game) => game.order).sort()).toEqual([3, 8]);
  });

  it("names the slots no game filled", () => {
    const { filled, missing } = sampleContents(
      [
        sample(LUFFY, KID, "first", 4),
        sample(LUFFY, KID, "first", 0),
        sample(KID, LUFFY, "second", 1),
        sample(KID, LUFFY, "first", 2),
      ],
      LUFFY,
      KID,
    );
    expect(
      filled.map(({ slot, game }) => [slot.deck, slot.seat, game.order]),
    ).toEqual([
      [LUFFY, "first", 0],
      [LUFFY, "second", 1],
      [KID, "first", 2],
    ]);
    expect(missing).toEqual([{ deck: KID, seat: "second" }]);
  });
});

describe("sample download", () => {
  it("zips one loadable trace per filled slot, and a manifest naming the empty ones", async () => {
    const samples = new Map<string, SampleGame>();
    let order = 0;
    for (const [firstDeck, secondDeck] of [
      [LUFFY, KID],
      [KID, LUFFY],
    ] as const)
      for (let index = 0; index < 3; index += 1) {
        const { actionIds, ...game }: AnalyticsGame = await playAnalyticsGame({
          firstDeck,
          secondDeck,
          seed: matchupSeed("sample-test", firstDeck, secondDeck, index),
          recordActions: true,
        });
        if (game.winner && actionIds)
          offerSample(samples, {
            firstDeck,
            secondDeck,
            seed: game.seed,
            winner: game.winner,
            order,
            actionIds,
          });
        order += 1;
      }
    const download = buildSampleDownload({
      self: LUFFY,
      opponent: KID,
      samples: [...samples.values()],
      pilot: "rules",
      customDecks: {},
      name: (deck) => (deck === LUFFY ? "ST31" : "ST36"),
      exportedAt: "2026-10-13T00:00:00.000Z",
    });
    expect(download.filename).toBe("open-optcg-sample-st31-vs-st36.zip");
    expect(download.files.length + download.missing.length).toBe(4);
    expect(download.files.length).toBeGreaterThan(0);

    const entries = unzipSync(download.bytes);
    expect(Object.keys(entries).sort()).toEqual(
      [...download.files, "manifest.json"].sort(),
    );
    const manifest = JSON.parse(strFromU8(entries["manifest.json"]!)) as {
      games: Array<{ file: string; deck: string; seat: string }>;
      missing: Array<{ deck: string; seat: string; reason: string }>;
    };
    expect(manifest.games.map((game) => game.file)).toEqual(download.files);
    expect(manifest.missing.map(({ deck, seat }) => ({ deck, seat }))).toEqual(
      download.missing,
    );

    // Each file is the board's own trace format, and replays to the win its
    // slot names.
    for (const entry of manifest.games) {
      const match = parseExportedMatch(strFromU8(entries[entry.file]!));
      const replayed = BrowserGameController.load(match).activeObservation;
      expect(replayed.phase).toBe("finished");
      const winnerDeck =
        replayed.winner === "p1" ? match.config.p1Deck : match.config.p2Deck;
      expect(winnerDeck).toBe(entry.deck);
      expect(replayed.winner).toBe(entry.seat === "first" ? "p1" : "p2");
    }
  });
});

describe("sample download button", () => {
  const ctx: AnalyticsContext = {
    setupDecks: { p1: LUFFY, p2: KID },
    savedDecks: {},
    renderCardDetailDialog: () => "",
    bindCardDetailDialog: () => {},
    rerender: () => {},
    goToSetup: () => {},
    randomSeed: () => "seed",
    scorerAvailable: () => false,
  };
  const games: AnalyticsGame[] = [
    {
      firstDeck: LUFFY,
      secondDeck: KID,
      seed: "a",
      winner: "first",
      reason: "life",
      turns: 10,
      actions: 100,
      cardsUsed: { first: [], second: [] },
    },
  ];

  it("is not offered before a run has finished", () => {
    expect(render(emptyState(), ctx)).not.toContain('id="sim-sample"');
  });

  it("counts the games it holds and names the empty slots in its tooltip", () => {
    const state = emptyState();
    state.result = {
      pair: `${LUFFY}|${KID}|rules`,
      games,
      samples: [
        sample(LUFFY, KID, "first", 0),
        sample(KID, LUFFY, "second", 1),
        sample(KID, LUFFY, "first", 2),
      ],
    };
    const html = render(state, ctx);
    expect(html).toMatch(/id="sim-sample"[^>]*>.*Download sample \(3 of 4\)/s);
    expect(html).toContain("No game: ST36 never won going second");
    expect(html).not.toMatch(/id="sim-sample"[^>]* disabled/);
  });

  it("is disabled when no game in the run was decided", () => {
    const state = emptyState();
    state.result = { pair: `${LUFFY}|${KID}|rules`, games, samples: [] };
    const html = render(state, ctx);
    expect(html).toMatch(/id="sim-sample"[^>]* disabled/);
    expect(html).toContain("(0 of 4)");
  });
});
