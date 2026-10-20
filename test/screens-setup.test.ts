import { describe, expect, it } from "vitest";
import { deckManifests } from "@one-piece-sim/decks";
import {
  render,
  type SeatPilot,
  type SetupContext,
} from "../packages/web/src/screens/setup.js";

/** The chosen pilot's card, matched inside one tag so the sibling card's
    `data-controller` cannot satisfy it. */
function pickedCard(kind: "rules" | "scorer"): RegExp {
  return new RegExp(
    `class="controller-card picked"\\s+type="button"\\s+data-controller="${kind}"`,
  );
}

function stubContext(overrides: Partial<SetupContext> = {}): SetupContext {
  return {
    savedDecks: {},
    setupDecks: {
      p1: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p2: "(Yellow) Eustass Kid - Starter Deck 36",
    },
    persistSetupDecks: () => {},
    seatPilots: { p1: "you", p2: "ai" },
    refreshLobby: () => {},
    scorerAvailable: () => false,
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
    const html = render(stubContext());
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
    // Start is the command cell: one word, named by what it does.
    expect(html).toContain(
      '<span class="hub-command"><button class="hub-face hub-play" title="Start match" aria-label="Start match" type="submit">Play</button></span>',
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

  it("defaults the opponent to the learned model, with Heuristics beside it", () => {
    const html = render(stubContext({ scorerAvailable: () => true }));
    expect(html).toContain('id="p2-controller" value="scorer"');
    expect(html).toMatch(pickedCard("scorer"));
    expect(html).not.toMatch(pickedCard("rules"));
    expect(html).toContain('data-controller="rules"');
  });

  it("offers Heuristics alone in a build without the learned model", () => {
    const html = render(stubContext());
    expect(html).toContain('id="p2-controller" value="rules"');
    expect(html).toMatch(pickedCard("rules"));
    expect(html).not.toContain('data-controller="scorer"');
  });

  it("says what each pilot is like, rather than naming it in a dropdown", () => {
    const html = render(stubContext({ scorerAvailable: () => true }));
    expect(html).not.toContain('<select id="p2-controller"');
    expect(html).toMatch(/neural network trained by self-play/);
    expect(html).toMatch(/deterministic, fast/);
    expect(html).not.toContain('data-controller="llm"');
  });

  it("puts the builder in your picker, first, and the pilot in the dialog", () => {
    const html = render(stubContext());
    // One empty slot per seat's grid, and it is a tile in the grid rather than
    // a button on the form.
    expect(html.match(/deck-tile-builder/g)).toHaveLength(2);
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

  it("lists a saved deck by name alongside the format decks", () => {
    const html = render(
      stubContext({
        savedDecks: {
          "CUSTOM-1": {
            name: "My Zoro deck",
            deck: deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!,
          },
        },
      }),
    );
    expect(html).toContain("My Zoro deck");
  });

  it("names the in-browser pilot Heuristics, not an AI of its own", () => {
    const html = render(stubContext());
    expect(html).toContain(">Heuristics</span>");
    expect(html).not.toContain("Rules AI");
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
    // The learned model is the opponent's default pilot too.
    expect(html).toMatch(pickedCard("scorer"));
  });

  it("lets the second seat be yours too, and drops its pilot choice", () => {
    const html = render(withPilots("you", "you"));
    // Two people at one screen: there is no agent in the match, so the pilot
    // cards have nothing to say about it.
    expect(html).toContain(
      '<input type="hidden" id="p2-controller" value="human" />',
    );
    expect(html).not.toContain('data-controller="rules"');
    expect(html).toContain('class="hub-face hub-play" title="Start match"');
  });
});
