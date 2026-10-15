import { describe, expect, it } from "vitest";
import { deckManifests } from "@one-piece-sim/decks";
import {
  dossierFields,
  render,
  type SeatPilot,
  type SetupContext,
} from "../packages/web/src/screens/setup.js";
import type { SavedDeck } from "../packages/web/src/deck-labels.js";
import { initialOnlineState } from "../packages/web/src/online.js";

/** The chosen pilot's card, matched inside one tag so the sibling card's
    `data-controller` cannot satisfy it. */
function pickedCard(kind: "rules" | "llm"): RegExp {
  return new RegExp(
    `class="controller-card picked"\\s+type="button"\\s+data-controller="${kind}"`,
  );
}

function stubContext(overrides: Partial<SetupContext> = {}): SetupContext {
  let lastRules: string | null = null;
  return {
    savedDecks: {},
    online: {
      state: initialOnlineState("https://match.test"),
      rejoin: () => undefined,
    },
    setupDecks: {
      p1: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p2: "(Yellow) Eustass Kid - Starter Deck 36",
    },
    llmPilotableDeckIds: () => [
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
    ],
    lastRulesOpponentDeck: {
      get value() {
        return lastRules;
      },
      set value(next: string | null) {
        lastRules = next;
      },
    },
    seatPilots: { p1: "you", p2: "ai" },
    refreshLobby: () => {},
    llmAvailable: () => true,
    scorerAvailable: () => false,
    llmReady: () => true,
    llmProbePending: () => false,
    llmUnavailableMessage: () => "unavailable",
    refreshLlmCapability: async () => {},
    redirectToLlmDocsIfUnreachable: () => false,
    renderLlmStatus: (visible) =>
      `<div id="llm-settings-row" ${visible ? "" : "hidden"}><p id="llm-status">status</p></div>`,
    bindLlmSettings: () => {},
    saveLlmSettings: async () => {},
    randomSeed: () => "match-fixed-seed",
    applyTheme: () => {},
    beginMatch: () => {},
    bindTraceImport: () => {},
    simulateMatchup: () => {},
    editDeck: () => {},
    deleteDeck: () => {},
    ...overrides,
  };
}

describe("setup screen render", () => {
  it("renders the lobby form, a picker per seat, and the matchup dialog", () => {
    const html = render(stubContext());
    expect(html).toContain('id="setup-form"');
    // The deck a seat is set to travels in a hidden field beside its button.
    expect(html).toContain('id="p1-deck"');
    expect(html).toContain('id="p2-deck"');
    expect(html).toContain('data-open-picker="p1"');
    expect(html).toContain('data-open-picker="p2"');
    expect(html).toContain('id="p1-deck-picker"');
    expect(html).toContain('id="p2-deck-picker"');
    // Pilot, starting player and seed all moved off the form into one dialog.
    expect(html).toContain('id="matchup-config"');
    expect(html).toContain('id="open-matchup-config"');
    expect(html).toContain("match-fixed-seed");
    expect(html).not.toContain("deck-select-control");
  });

  it("prints the versus mark between the Leaders and the board's own hub", () => {
    const html = render(stubContext({ llmAvailable: () => false }));
    // The seam between the two seats is the versus mark; the controls are the
    // board's cluster, in the board's own order -- configure, the command
    // cell, the trace cell. The paper and the callout are gone.
    const seam = html.indexOf('class="lobby-vs"');
    expect(seam).toBeGreaterThan(html.indexOf('data-seat="p1"'));
    expect(seam).toBeLessThan(html.indexOf('data-seat="p2"'));
    expect(html).toContain('class="lobby-hub board-hub"');
    expect(html.indexOf('class="hub-face hub-configure"')).toBeLessThan(
      html.indexOf('class="hub-face hub-play"'),
    );
    expect(html.indexOf('class="hub-face hub-play"')).toBeLessThan(
      html.indexOf("hub-load hub-trace"),
    );
    // Three cells, as on the board: simulating the pairing is asked for from
    // the play cell, not offered as a cell of its own.
    expect(html).not.toContain("hub-analytics");
    expect(html).not.toContain('id="open-analytics"');
    // Start is the command cell, a play triangle named by its title.
    expect(html).toContain(
      '<span class="hub-command"><button class="hub-face hub-play" title="Start match" type="submit"><i data-lucide="play" aria-hidden="true"></i><span class="sr-only">Start match</span></button></span>',
    );
    expect(html).not.toContain("pilot-callout");
    expect(html).not.toContain("built-in heuristics");
    expect(html).not.toContain("deck-columns-divider");
  });

  it("prints what the landing page hands it above the decks and in the dialog", () => {
    const html = render(
      stubContext({
        landing: {
          render: () => ({
            above: '<p class="above-marker"></p>',
            settings: '<p class="settings-marker"></p>',
          }),
          bind: () => {},
        },
      }),
    );
    // The pack as a setting goes inside Configure, above its Done row.
    expect(html.indexOf("settings-marker")).toBeGreaterThan(
      html.indexOf('id="matchup-config"'),
    );
    expect(html.indexOf("settings-marker")).toBeLessThan(
      html.indexOf('id="matchup-done"'),
    );
    expect(html.indexOf("above-marker")).toBeLessThan(
      html.indexOf('id="setup-form"'),
    );
    expect(render(stubContext())).not.toContain("above-marker");
  });

  // The lobby *is* the landing page, so the brand above it was the app's name
  // printed over its own front door -- a mark and a wordmark competing with the
  // two Leaders and the honeycomb that are the page. The other menu screens
  // keep their topbar, and it is still their way home.
  it("prints no topbar: the page is the brand", () => {
    const html = render(stubContext());
    expect(html).not.toContain("setup-topbar");
    expect(html).not.toContain("setup-wordmark");
    expect(html).not.toContain("brand-home");
    expect(html).not.toContain("home-button");
    expect(html).not.toContain('data-lucide="home"');
  });

  it("defaults the opponent to the LLM when it can run", () => {
    const html = render(stubContext());
    expect(html).toContain('id="p2-controller" value="llm"');
    expect(html).toMatch(pickedCard("llm"));
    expect(html).not.toMatch(pickedCard("rules"));
  });

  it("states what each pilot costs, rather than naming it in a dropdown", () => {
    // The two differences a player chooses on: one is fast, deterministic and
    // hosted; the other plays better and has to be run locally with a key.
    const html = render(stubContext());
    expect(html).not.toContain('<select id="p2-controller"');
    expect(html).toMatch(/Deterministic and fast[^<]*standalone file/);
    expect(html).toMatch(/stronger opponent[^<]*your own API key/);
  });

  it("puts the builder in your picker, first, and the pilot in the dialog", () => {
    const html = render(stubContext());
    // One empty slot for the whole lobby, and it is a tile in the grid rather
    // than a button on the form.
    expect(html.match(/deck-tile-builder/g)).toHaveLength(1);
    expect(html).toContain('data-edit-deck="p1"');
    expect(html).toContain("Build and save your own deck");
    // Every finished deck can be opened in the editor from its own tile: to
    // read a preset, and to build from it.
    expect(html).toContain(
      'data-edit-deck="p1" data-deck-id="(Red) Monkey.D.Luffy - Starter Deck 31"',
    );
    const picker = html.slice(html.indexOf('id="p1-deck-picker"'));
    expect(picker.indexOf("deck-tile-builder")).toBeLessThan(
      picker.indexOf("data-pick-deck"),
    );
    // Who pilots the opponent is configured in the dialog, not on the form.
    expect(html.indexOf('id="p2-controller"')).toBeGreaterThan(
      html.indexOf('id="matchup-config"'),
    );
    expect(html).not.toContain("Matchup analytics");
  });

  it("offers no builder for a seat the LLM pilots, since it cannot play one", () => {
    const html = render(stubContext());
    const opponentPicker = html.slice(html.indexOf('id="p2-deck-picker"'));
    expect(opponentPicker).not.toContain("data-edit-deck");
    // And only the decks the LLM can actually pilot.
    expect(opponentPicker).toContain(
      'data-deck-id="(Red) Monkey.D.Luffy - Starter Deck 31"',
    );
    expect(opponentPicker).not.toContain(
      'data-deck-id="(Blue) Kuzan - Starter Deck 33"',
    );
  });

  it("falls back to Heuristics, and offers the docs, when the LLM cannot run", () => {
    const html = render(stubContext({ llmAvailable: () => false }));
    // The hint rides on the LLM card; the Heuristics card is the one chosen.
    expect(html).toContain("opens the setup docs");
    expect(html).toContain('id="p2-controller" value="rules"');
    expect(html).toMatch(pickedCard("rules"));
    expect(html).not.toMatch(pickedCard("llm"));
    expect(html).not.toMatch(/data-edit-deck="p2"[^>]*hidden/);
  });

  it("narrows the opponent deck to a pilotable one when the LLM is selected", () => {
    const ctx = stubContext({
      setupDecks: {
        p1: "(Red) Monkey.D.Luffy - Starter Deck 31",
        p2: "(Blue) Kuzan - Starter Deck 33",
      },
      llmPilotableDeckIds: () => [
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Yellow) Eustass Kid - Starter Deck 36",
      ],
    });
    render(ctx);
    // The pick is outside the pilotable list, so rendering corrects it rather
    // than offering a deck the LLM seat cannot pilot.
    expect(ctx.setupDecks.p2).toBe("(Red) Monkey.D.Luffy - Starter Deck 31");
  });

  it("leaves a pilotable opponent deck alone", () => {
    const ctx = stubContext({
      setupDecks: {
        p1: "(Red) Monkey.D.Luffy - Starter Deck 31",
        p2: "(Yellow) Eustass Kid - Starter Deck 36",
      },
    });
    render(ctx);
    expect(ctx.setupDecks.p2).toBe("(Yellow) Eustass Kid - Starter Deck 36");
  });

  it("lists a saved deck by name alongside the format decks", () => {
    const html = render(
      stubContext({
        savedDecks: {
          "CUSTOM-1": {
            name: "My Zoro deck",
            deck: deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!,
          },
        },
        // Saved decks only appear when the seat is not narrowed to dossiers.
        llmAvailable: () => false,
      }),
    );
    expect(html).toContain("My Zoro deck");
  });

  it("names the in-browser pilot Heuristics, not an AI of its own", () => {
    const html = render(stubContext({ llmAvailable: () => false }));
    expect(html).toContain(">Heuristics</span>");
    expect(html).not.toContain("Rules AI");
  });

  it("shows the LLM status row only while the LLM seat is selected", () => {
    expect(render(stubContext())).toMatch(/id="llm-settings-row"\s*>/);
    expect(render(stubContext({ llmAvailable: () => false }))).toMatch(
      /id="llm-settings-row" hidden/,
    );
  });
});

describe("a deck the player built, piloted by the LLM", () => {
  const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
  const KID_ST36 = "(Yellow) Eustass Kid - Starter Deck 36";
  const myST31: Record<string, SavedDeck> = {
    "CUSTOM-1": { name: "MyST31", deck: deckManifests[ST31]! },
  };

  it("offers it in the opponent grid once the pilotable list carries it", () => {
    // The list is the app's answer, not this screen's: the screen's part is to
    // render a saved deck in the LLM grid the same way it renders a shipped
    // one, which it used to be unable to do at all.
    const html = render(
      stubContext({
        savedDecks: myST31,
        setupDecks: { p1: KID_ST36, p2: "CUSTOM-1" },
        llmPilotableDeckIds: () => [ST31, "CUSTOM-1"],
      }),
    );
    expect(html).toContain('data-pick-deck="p2" data-deck-id="CUSTOM-1"');
    expect(html).toContain("MyST31 · Monkey.D.Luffy");
  });

  it("records the borrowed dossier in the match config", () => {
    expect(dossierFields("p2", "CUSTOM-1", myST31)).toEqual({
      p2Dossier: ST31,
    });
  });

  it("records nothing for a deck that is its own dossier", () => {
    // Otherwise every config -- and every trace -- carries a field saying only
    // what its deck id already said.
    expect(dossierFields("p1", ST31, myST31)).toEqual({});
  });

  it("records nothing for a deck that borrows none", () => {
    const none: Record<string, SavedDeck> = {
      "CUSTOM-1": { ...myST31["CUSTOM-1"]!, dossier: "" },
    };
    expect(dossierFields("p2", "CUSTOM-1", none)).toEqual({});
  });
});

describe("who plays each seat", () => {
  /** The lobby with `pilots` chosen, as clicks on the two headings leave it. */
  function withPilots(p1: SeatPilot, p2: SeatPilot): SetupContext {
    return stubContext({ seatPilots: { p1, p2 } });
  }

  it("makes each heading the choice, with one word in force", () => {
    const html = render(stubContext());
    // The heading is the choice alone: the seats carry no name.
    expect(html).not.toContain("Player one");
    expect(html).not.toContain("Player two");
    expect(html).toContain('data-seat-pilot="p1"');
    expect(html).toContain('data-seat-pilot="p2"');
    // Yours by default, and theirs an agent's.
    expect(html).toContain(
      '<button class="seat-pilot-option picked" type="button" data-seat-pilot="p1" data-pilot="you"',
    );
    expect(html).toContain(
      '<button class="seat-pilot-option picked" type="button" data-seat-pilot="p2" data-pilot="ai"',
    );
  });

  it("hands both seats to agents, and asks what they are for", () => {
    const html = render(withPilots("ai", "ai"));
    // The config is assembled from these fields on submit, so they are what
    // decides whether anybody is playing -- not the heading that wrote them.
    expect(html).toContain(
      '<input type="hidden" id="p1-controller" value="rules" />',
    );
    expect(html).toContain('class="hub-face hub-play" title="AI vs AI"');
    // One game to watch, or a run at one of the analytics page's sizes.
    expect(html).toContain('id="agents-choice"');
    expect(html).toContain('id="agents-watch"');
    expect(html).toContain('id="agents-simulate" data-games="100"');
    for (const games of [100, 250, 500]) {
      expect(html).toContain(`data-simulate-size="${games}"`);
    }
  });

  it("asks nothing when a person holds a seat", () => {
    expect(render(withPilots("you", "ai"))).not.toContain('id="agents-choice"');
    expect(render(withPilots("ai", "you"))).not.toContain('id="agents-choice"');
  });

  it("plays player one's agent seat with the learned model where the build has one", () => {
    const html = render(
      stubContext({
        seatPilots: { p1: "ai", p2: "ai" },
        scorerAvailable: () => true,
      }),
    );
    expect(html).toContain(
      '<input type="hidden" id="p1-controller" value="scorer" />',
    );
    // The learned model replaces Heuristics as the browser pilot.
    expect(html).toContain('data-controller="scorer"');
    expect(html).not.toContain('data-controller="rules"');
  });

  it("lets the second seat be yours too, and drops its pilot choice", () => {
    const html = render(withPilots("you", "you"));
    // Two people at one screen: there is no agent in the match, so the pilot
    // cards and the LLM's status line have nothing to say about it.
    expect(html).toContain(
      '<input type="hidden" id="p2-controller" value="human" />',
    );
    expect(html).not.toContain('data-controller="llm"');
    expect(html).toContain('class="hub-face hub-play" title="Start match"');
  });

  it("keeps a seat with an agent in it out of the LLM's deck list", () => {
    // The LLM seat plays only the decks it has a dossier for, and that
    // narrowing is the LLM's -- a seat that is a person's must not inherit it.
    const ctx = withPilots("you", "you");
    ctx.setupDecks.p2 = "(Green) Roronoa Zoro - Starter Deck 32";
    render(ctx);
    expect(ctx.setupDecks.p2).toBe("(Green) Roronoa Zoro - Starter Deck 32");
  });
});

describe("the lobby's online seat", () => {
  it("offers no opponent but an agent or the person at this screen", () => {
    // A person over the network is reached by a seat link, never from here, so
    // a build with a match server draws the same form as one without.
    const withServer = render(stubContext());
    const without = render(
      stubContext({
        online: { ...stubContext().online, state: initialOnlineState("") },
      }),
    );
    for (const html of [withServer, without]) {
      expect(html).not.toContain("data-opponent-kind");
      expect(html).not.toContain('id="online-find"');
      expect(html).toContain('aria-label="Who plays the right deck"');
    }
  });

  it("offers the way back to a seat this browser still holds", () => {
    // A dropped connection is not a lost match -- the referee holds the seat
    // for its token while the clock runs -- so the lobby must show the way back.
    const html = render(
      stubContext({
        online: {
          ...stubContext().online,
          state: {
            ...initialOnlineState("https://match.test"),
            heldSeat: true,
          },
        },
      }),
    );
    expect(html).toContain('id="online-rejoin"');
    expect(html).toContain('title="Start match" type="submit"');
  });

  it("holds the start button while a seat is still connecting", () => {
    const html = render(
      stubContext({
        online: {
          ...stubContext().online,
          state: {
            ...initialOnlineState("https://match.test"),
            connecting: "waiting-for-opponent",
          },
        },
      }),
    );
    expect(html).toMatch(/title="Joining" type="button" disabled/);
    expect(html).toContain("Waiting for your opponent to sit down…");
  });
});
