import { describe, expect, it } from "vitest";
import {
  clearPrintedText,
  loadPrintedText,
  loadedPrintedTextPack,
} from "@one-piece-sim/cards";
import {
  cardsForLeader,
  deckFromBase,
} from "../packages/web/src/deck-editor.js";
import { EMPTY_CATALOG_FILTER } from "../packages/web/src/catalog.js";
import {
  render,
  saveTargetFor,
  type EditorContext,
  type EditorState,
} from "../packages/web/src/screens/editor.js";

function stateFor(
  deck = deckFromBase("(Red) Monkey.D.Luffy - Starter Deck 31"),
): EditorState {
  return {
    target: "p1",
    deck,
    filter: { ...EMPTY_CATALOG_FILTER },
    sort: "cost",
    message: "",
    deckName: "My deck",
    savedDeckId: null,
    dossier: null,
    catalogScrollTop: 0,
    stage: "edit",
    leaderDialogOpen: false,
    nameDialogOpen: false,
    nameMessage: "",
    replaceConfirmedFor: null,
    overviewOpen: true,
  };
}

/** How many cards the available pool drew. The count line says so too, but
    only while something is filtered, so this counts what is on the page. */
function poolCount(html: string): number {
  const list = html.slice(html.indexOf('pool-card-list">'));
  return list.split("data-inspect-card=").length - 1;
}

function stubContext(overrides: Partial<EditorContext> = {}): EditorContext {
  return {
    savedDecks: {},
    setupDecks: {
      p1: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p2: "(Yellow) Eustass Kid - Starter Deck 36",
    },
    renderCardDetailDialog: () => "",
    bindCardDetailDialog: () => {},
    clearCardDetail: () => {},
    renderImportDialog: () => "",
    bindImportDialog: () => {},
    openImportDialog: () => {},
    nextCustomDeckId: () => "CUSTOM-1",
    persistSavedDecks: () => {},
    forgetSimulatedFor: () => {},
    rerender: () => {},
    goToSetup: () => {},
    ...overrides,
  };
}

describe("deck editor screen render", () => {
  it("renders nothing when there is no deck being edited", () => {
    const state = stateFor();
    state.target = null;
    expect(render(state, stubContext())).toBe("");
  });

  it("renders the editor shell for the deck in progress", () => {
    const html = render(stateFor(), stubContext());
    expect(html).toContain("deck-editor-shell");
    expect(html).toContain("<b>50</b>");
    // The Leader is chosen from a grid of cards, not from a dropdown.
    expect(html).not.toContain('id="editor-leader"');
    expect(html).toContain('id="open-leader-picker"');
    expect(html).toContain('id="leader-picker"');
    expect(html).toContain('data-pick-leader="ST21-001"');
  });

  it("searches the printed effect text of pool cards when a pack is loaded", () => {
    const state = stateFor();
    const pool = cardsForLeader(state.deck!.leader).filter(
      (card) => !state.deck!.cards[card.cardNumber],
    );
    const card = pool[0]!;
    const restore = loadedPrintedTextPack();
    try {
      loadPrintedText({
        [card.cardNumber]: {
          effect: "[On Play] SENTINEL CLAUSE",
          trigger: "",
        },
      });
      state.filter.text = "sentinel clause";
      const html = render(state, stubContext());
      expect(html).toContain(card.cardNumber);
      expect(poolCount(html)).toBe(1);
    } finally {
      clearPrintedText();
      loadPrintedText(restore);
    }
  });

  it("matches no pool card on effect text with no pack loaded", () => {
    const restore = loadedPrintedTextPack();
    try {
      clearPrintedText();
      const state = stateFor();
      state.filter.text = "sentinel clause";
      expect(render(state, stubContext())).toContain(
        "No available cards match these filters.",
      );
    } finally {
      loadPrintedText(restore);
    }
  });

  it("opens a deck started from nothing on the choice of how to start", () => {
    const state = stateFor({ leader: "", cards: {} });
    state.stage = "choose";
    const html = render(state, stubContext());
    // The choice is the whole page: no catalog, no tools, no dialogs yet.
    expect(html).toContain("deck-start-shell");
    expect(html).toContain('id="start-from-leader"');
    expect(html).toContain('id="start-from-base"');
    expect(html).not.toContain("card-catalog");
    expect(html).not.toContain('id="leader-picker"');
  });

  it("shows the Leader grid as its own page behind the first option", () => {
    const state = stateFor({ leader: "", cards: {} });
    state.stage = "leader";
    const html = render(state, stubContext());
    expect(html).toContain("<h1>Choose a Leader</h1>");
    expect(html).toContain('data-pick-leader="ST21-001"');
    expect(html).toContain('id="editor-start-back"');
    expect(html).not.toContain("data-pick-base");
  });

  it("shows the shipped decks and the player's own behind the second", () => {
    const state = stateFor({ leader: "", cards: {} });
    state.stage = "base";
    const html = render(
      state,
      stubContext({
        savedDecks: {
          "CUSTOM-1": {
            name: "Mine",
            deck: {
              id: "CUSTOM-1",
              leader: "ST21-001",
              cards: {},
              format: "standard",
            },
          },
        },
      }),
    );
    expect(html).toContain("<h1>Choose a base deck</h1>");
    expect(html).toContain(
      'data-pick-base="(Red) Monkey.D.Luffy - Starter Deck 31"',
    );
    expect(html).toContain('data-pick-base="CUSTOM-1"');
    expect(html).toContain("Mine");
    expect(html).not.toContain("data-pick-leader");
  });

  it("asks for the name in the save dialog, not on the tools panel", () => {
    const state = stateFor();
    state.deckName = "";
    const html = render(state, stubContext());
    // The field exists, but inside the dialog, and empty: a deck has no name
    // until it is given one.
    expect(html).toContain('id="deck-name-dialog"');
    expect(html).toMatch(/id="deck-name-dialog" hidden/);
    expect(html).toContain('id="editor-deck-name" value=""');
    expect(html.indexOf('id="editor-deck-name"')).toBeGreaterThan(
      html.indexOf('id="deck-name-dialog"'),
    );
  });

  it("opens the Leader grid for a deck that has no Leader yet", () => {
    const state = stateFor({ leader: "", cards: {} });
    state.leaderDialogOpen = true;
    const html = render(state, stubContext());
    expect(html).toContain(
      '<div class="app-dialog-backdrop" id="leader-picker" >',
    );
    expect(html).toContain("Choose a Leader");
    // Nothing to build with until a Leader says what the pool is.
    expect(html).toContain("<b>0</b>");
  });

  it("reports the deck's legality in the header verdict", () => {
    const html = render(stateFor(), stubContext());
    expect(html).toContain("deck-editor-verdict");
    expect(html).toContain("Ready to play");
  });

  it("spells out what an illegal deck is missing", () => {
    const deck = deckFromBase("(Red) Monkey.D.Luffy - Starter Deck 31");
    const [overCopied] = Object.keys(deck.cards);
    deck.cards[overCopied!] = 9;
    const html = render(stateFor(deck), stubContext());
    expect(html).toContain("Deck needs attention");
    expect(html).toContain("deck-rule-status invalid");
    expect(html).toContain(`${overCopied} allows at most 4 copies.`);
  });

  it("shows an inline message when one is set", () => {
    const state = stateFor();
    state.message = "Official deck loaded.";
    const html = render(state, stubContext());
    expect(html).toContain("Official deck loaded.");
  });
});

describe("the plan the AI opponent pilots a saved deck with", () => {
  const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
  const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";

  /** The option element for one deck id, as the save dialog renders it. */
  function option(html: string, deckId: string): string {
    const match = new RegExp(
      `<option value="${deckId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`,
    ).exec(html);
    return match?.[0] ?? "";
  }

  it("preselects the deck that shares this list's Leader", () => {
    // The whole point of the default: a home-brew ST31 is piloted by ST31's
    // plan without the player having to know the control is there.
    const html = render(stateFor(), stubContext());
    expect(option(html, ST31)).toContain("selected");
    expect(option(html, ST32)).not.toContain("selected");
  });

  it("offers every other shipped deck's plan, and no plan at all", () => {
    const html = render(stateFor(), stubContext());
    expect(html).toContain('<optgroup label="Same Leader">');
    expect(option(html, ST32)).toBeTruthy();
    expect(html).toContain('<option value="" >');
  });

  it("marks the pick the player made rather than the Leader's own", () => {
    const state = stateFor();
    state.dossier = ST32;
    const html = render(state, stubContext());
    expect(option(html, ST32)).toContain("selected");
    expect(option(html, ST31)).not.toContain("selected");
  });

  it("says the heuristics opponent needs no such choice", () => {
    // A player who reads the control as "how the AI plays my deck" would
    // otherwise expect it to change the built-in opponent too, which resolves
    // its policy through the Leader card and never reads a dossier.
    expect(render(stateFor(), stubContext())).toContain(
      "Only the LLM opponent reads this",
    );
  });
});

describe("deck overview panel", () => {
  it("states the curve, the Counters and what the Leader holds together", () => {
    const html = render(stateFor(), stubContext());
    expect(html).toContain("Deck overview");
    expect(html).toContain("avg cost 3.2");
    // The tallest bucket is drawn full height, and the empty one still
    // reserves its column so the curve reads as a shape.
    expect(html).toContain('style="--fill:100%"');
    expect(html).toContain('class="cost-bar empty"');
    expect(html).toContain("<dt>+1000</dt><dd>26</dd>");
    expect(html).toContain("<dt>+2000</dt><dd>8</dd>");
    expect(html).toContain("<dt>Events</dt><dd>4</dd>");
    expect(html).toContain("54,000 held");
    expect(html).toContain("Built around your Leader");
    expect(html).toContain("<dt>Shares a type</dt><dd>50</dd>");
    expect(html).toContain("Straw Hat Crew");
  });

  it("keeps the rest as a quiet line rather than a fourth grid of tiles", () => {
    const html = render(stateFor(), stubContext());
    expect(html).toContain("<span><b>40</b> Characters</span>");
    expect(html).toContain("<span><b>8</b> Events</span>");
    expect(html).toContain("<span><b>8</b> Blockers</span>");
    expect(html).not.toContain("<dt>Characters</dt>");
  });

  it("drops a figure that would be a zero rather than printing the zero", () => {
    // No "None" Counter bucket anywhere: it is the total minus the other two,
    // and a deck is not built toward its uncounterable cards. The name tile is
    // the conditional one -- ST-31's Characters name their own Leader, so it
    // is there; ST-33 Kuzan's archetype is written purely by type, so showing
    // it a zero would read as a thing to fix rather than a thing to skip.
    const html = render(stateFor(), stubContext());
    expect(html).not.toContain("<dt>None</dt>");
    expect(html).toContain("<dt>Named</dt><dd>6</dd>");

    const byTypeOnly = render(
      stateFor(deckFromBase("(Blue) Kuzan - Starter Deck 33")),
      stubContext(),
    );
    expect(byTypeOnly).not.toContain("<dt>None</dt>");
    expect(byTypeOnly).not.toContain("<dt>Named</dt>");
    expect(byTypeOnly).toContain("<dt>Shares a type</dt><dd>50</dd>");
  });

  it("splits a two-coloured deck by colour, and leaves a mono deck alone", () => {
    expect(render(stateFor(), stubContext())).not.toContain(
      "</b> Black</span>",
    );
    const dual = render(
      stateFor(deckFromBase("(Red/Black) Sabo - Starter Deck 35")),
      stubContext(),
    );
    expect(dual).toContain("<span><b>22</b> Red</span>");
    expect(dual).toContain("<span><b>28</b> Black</span>");
  });

  it("labels the curve for a reader who cannot see the bars", () => {
    expect(render(stateFor(), stubContext())).toContain(
      'aria-label="Cost curve: 4 at cost 0, 14 at cost 1',
    );
  });

  it("collapses to its heading without losing the toggle", () => {
    const state = stateFor();
    state.overviewOpen = false;
    const html = render(state, stubContext());
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('id="deck-overview-body" hidden');
    expect(html).toContain("Deck overview");
  });
});

describe("catalog filters", () => {
  it("asks what a card is and what it does in two boxes, not one with a mode", () => {
    const html = render(stateFor(), stubContext());
    expect(html).toContain('id="card-search"');
    expect(html).toContain('placeholder="Luffy, OP17, Straw Hat Crew"');
    expect(html).toContain('id="card-text"');
    expect(html).toContain('placeholder="Blocker, Rush, DON!!"');
    // The mode select the two boxes replace.
    expect(html).not.toContain('id="card-search-scope"');
  });

  it("filters the pool by what a card does, not only what it is", () => {
    const byText = stateFor();
    byText.filter.text = "DON!!";
    const html = render(byText, stubContext());
    // A name-only search for this string matched nothing at all, which is the
    // bug being fixed.
    expect(poolCount(html)).toBeGreaterThan(0);
    expect(html).not.toContain("No available cards match these filters.");
  });

  it("narrows to the intersection of the two boxes", () => {
    const both = stateFor();
    both.filter.identity = "luffy";
    both.filter.text = "blocker";
    const identityOnly = stateFor();
    identityOnly.filter.identity = "luffy";
    expect(poolCount(render(both, stubContext()))).toBeLessThan(
      poolCount(render(identityOnly, stubContext())),
    );
  });

  it("offers the pool's colours, all on, only when there is a choice", () => {
    // A mono-colour Leader's pool is one colour, and a row of one checked chip
    // reads as a control that does not work.
    expect(render(stateFor(), stubContext())).not.toContain(
      "data-catalog-color",
    );

    const dual = stateFor({
      leader: "EB01-001",
      cards: {},
      format: "standard",
    });
    const html = render(dual, stubContext());
    expect(html).toContain('id="card-color-red"');
    // Nothing hidden by default, so every chip comes up checked.
    expect(html).toContain('data-catalog-color="Red" checked');
    expect(html).toContain('data-catalog-color="Green" checked');

    dual.filter.hiddenColors = ["Green"];
    const narrowed = render(dual, stubContext());
    expect(narrowed).toContain('data-catalog-color="Red" checked');
    expect(narrowed).not.toContain('data-catalog-color="Green" checked');
    expect(poolCount(narrowed)).toBeLessThan(poolCount(html));
  });

  it("bounds the pool by cost at both ends", () => {
    const full = poolCount(render(stateFor(), stubContext()));
    const cheap = stateFor();
    cheap.filter.maxCost = 2;
    const dear = stateFor();
    dear.filter.minCost = 5;
    const band = stateFor();
    band.filter.minCost = 3;
    band.filter.maxCost = 4;
    const cheapCount = poolCount(render(cheap, stubContext()));
    const dearCount = poolCount(render(dear, stubContext()));
    const bandCount = poolCount(render(band, stubContext()));
    expect(cheapCount).toBeGreaterThan(0);
    expect(dearCount).toBeGreaterThan(0);
    expect(bandCount).toBeGreaterThan(0);
    // The three bands partition the pool, which is what says the bounds are
    // inclusive and do not overlap.
    expect(cheapCount + bandCount + dearCount).toBe(full);
  });

  it("offers the pool's card types, and narrows to the ones left on", () => {
    const state = stateFor();
    const html = render(state, stubContext());
    expect(html).toContain('data-catalog-category="character" checked');
    expect(html).toContain('data-catalog-category="event" checked');
    expect(html).toContain("Stage");
    // Everything on is one word, not three boxes: what the menu saves over the
    // row of chips it replaced.
    expect(html).toContain("All types");

    const characters = stateFor();
    characters.filter.hiddenCategories = ["event", "stage"];
    const narrowed = render(characters, stubContext());
    expect(narrowed).not.toContain('data-catalog-category="event" checked');
    // The three types partition the pool, which is what says nothing is
    // counted twice and nothing is dropped.
    const eventsAndStages = stateFor();
    eventsAndStages.filter.hiddenCategories = ["character"];
    expect(
      poolCount(narrowed) + poolCount(render(eventsAndStages, stubContext())),
    ).toBe(poolCount(html));
  });

  it("names what is left on rather than counting, up to two", () => {
    const one = stateFor();
    one.filter.hiddenCategories = ["event", "stage"];
    expect(render(one, stubContext())).toContain("Character");

    const two = stateFor();
    two.filter.hiddenCategories = ["stage"];
    expect(render(two, stubContext())).toContain("Character, Event");

    // Select all is the way back, and there is nothing to put back until
    // something is off.
    expect(render(stateFor(), stubContext())).toContain(
      'data-catalog-menu-all="data-catalog-category" disabled',
    );
    expect(render(one, stubContext())).not.toContain(
      'data-catalog-menu-all="data-catalog-category" disabled',
    );
  });

  it("offers no menu for a pool with one colour in it", () => {
    // A control that can only say "All" is one that does not work.
    const html = render(stateFor(), stubContext());
    expect(html).not.toContain("data-catalog-color");
    expect(html).toContain("data-catalog-category");
  });

  it("says the count only while the pool is actually narrowed", () => {
    expect(render(stateFor(), stubContext())).not.toContain("catalog-count");

    const filtered = stateFor();
    filtered.filter.minCost = 4;
    const html = render(filtered, stubContext());
    expect(html).toContain("catalog-count");
    // The count is the pair: what came through, out of what it was asked of.
    const shown = poolCount(html);
    const total = poolCount(render(stateFor(), stubContext()));
    expect(html).toContain(`<b>${shown}</b> of ${total} cards`);
    expect(shown).toBeLessThan(total);
    // The heading it replaces, which said the same number twice as loudly.
    expect(html).not.toContain("Available card pool");
  });

  it("separates an exhausted pool from a search that found nothing", () => {
    const empty = stateFor();
    empty.filter.identity = "nothing is called this";
    expect(render(empty, stubContext())).toContain(
      "No available cards match these filters.",
    );
  });

  it("says a text search is running without the words, and only then", () => {
    // A build with no asset pack has no printed text, and a search that
    // silently returns less than it should reads as a missing card.
    const searching = stateFor();
    searching.filter.text = "draw";
    expect(render(searching, stubContext())).toContain("No card text loaded");

    const idle = stateFor();
    expect(render(idle, stubContext())).not.toContain("No card text loaded");

    const byName = stateFor();
    byName.filter.identity = "draw";
    expect(render(byName, stubContext())).not.toContain("No card text loaded");
  });
});

describe("deck editor save target", () => {
  const manifest = deckFromBase("(Red) Monkey.D.Luffy - Starter Deck 31");
  const saved = {
    "CUSTOM-1": { name: "Red Rush", deck: { id: "CUSTOM-1", ...manifest } },
    "CUSTOM-2": { name: "Red Control", deck: { id: "CUSTOM-2", ...manifest } },
  } as unknown as Parameters<typeof saveTargetFor>[2];

  it("updates the deck being edited when its name is kept", () => {
    expect(saveTargetFor("Red Rush", "CUSTOM-1", saved, null)).toEqual({
      kind: "replace",
      deckId: "CUSTOM-1",
    });
  });

  it("saves a new deck, keeping the one it was edited from, under a new name", () => {
    expect(saveTargetFor("Red Rush v2", "CUSTOM-1", saved, null)).toEqual({
      kind: "new",
    });
    expect(saveTargetFor("Brand new", null, saved, null)).toEqual({
      kind: "new",
    });
  });

  it("warns before a save takes another saved deck's name, however it is cased", () => {
    expect(saveTargetFor(" red control ", "CUSTOM-1", saved, null)).toEqual({
      kind: "clash",
      deckId: "CUSTOM-2",
    });
    expect(saveTargetFor("Red Rush", null, saved, null)).toEqual({
      kind: "clash",
      deckId: "CUSTOM-1",
    });
  });

  it("replaces the clashing deck once the player saves again under that name", () => {
    expect(
      saveTargetFor("Red Control", "CUSTOM-1", saved, "Red Control"),
    ).toEqual({ kind: "replace", deckId: "CUSTOM-2" });
    // A warning about one name does not wave through a different one.
    expect(saveTargetFor("Red Rush", null, saved, "Red Control")).toEqual({
      kind: "clash",
      deckId: "CUSTOM-1",
    });
  });
});
