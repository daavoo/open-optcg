import { requireKnownCard } from "@one-piece-sim/cards";
import {
  compareFeaturePageEntries,
  deckDisplayName,
  deckManifests,
  deckShelf,
  isRecommendedDeck,
  starterDeckNumber,
  SELECTABLE_DECK_IDS,
} from "@one-piece-sim/decks";
import { assetUrl } from "./assets.js";
import {
  builtInDeckStandings,
  orderByWinRate,
  type DeckStandings,
} from "./deck-standings.js";
import { escapeHtml } from "./card-text.js";
import { icon } from "./icons.js";
import { deckManifestFor, type SavedDeck } from "./deck-labels.js";

/**
 * The paired deck `<select>` and leader preview.
 *
 * Shared rather than screen-owned: the constructed lobby and the analytics
 * page render the same two controls under the same two element ids
 * (`#p1-deck`, `#p2-deck`), which is what makes a deck picked on either page
 * the deck the other opens with.
 */

/** No visible caption — the column heading above already says whose deck
    this is — but the select still needs an accessible name. Saved decks join
    the format decks as options, named by what the user called them. When
    {@link deckIds} is given the select is limited to exactly those decks and
    nothing is appended: the caller has already worked out which saved decks
    belong in it. */
export function selectField(
  savedDecks: Record<string, SavedDeck>,
  id: string,
  ariaLabel: string,
  selected: string,
  deckIds?: readonly string[],
): string {
  const candidates = deckIds ?? SELECTABLE_DECK_IDS;
  const saved = deckIds ? [] : Object.keys(savedDecks);
  // Grouped the same way, and in the same order, as the picker grid: the two
  // controls offer the same decks, so they should not disagree about where a
  // deck of the player's own is found.
  const options = deckGroups(savedDecks, candidates, saved)
    .filter((group) => group.deckIds.length > 0)
    .map(
      (group) =>
        `<optgroup label="${escapeHtml(group.label)}">${group.deckIds
          .map(
            (deckId) =>
              `<option value="${escapeHtml(deckId)}" ${deckId === selected ? "selected" : ""}>${escapeHtml(deckLabel(savedDecks, deckId))}</option>`,
          )
          .join("")}</optgroup>`,
    )
    .join("");
  return `<div class="deck-select-control">${renderDeckLeaderPreview(savedDecks, selected)}<select id="${id}" aria-label="${escapeHtml(ariaLabel)}">${options}</select></div>`;
}

export function renderDeckLeaderPreview(
  savedDecks: Record<string, SavedDeck>,
  deck: string,
): string {
  const manifest = deckManifestFor(deck, savedDecks);
  if (!manifest) return `<div class="deck-select-preview empty"></div>`;
  const leader = requireKnownCard(manifest.leader);
  const art = assetUrl(leader.cardNumber);
  const color = leader.colors?.[0]?.toLowerCase() ?? "neutral";
  return `<div class="deck-select-preview" title="${escapeHtml(leader.name)}"><div class="game-card deck-select-leader-card ${art ? "has-art" : ""}" style="--card-color:var(--${color})${art ? `;--card-art:url('${art}')` : ""}" role="img" aria-label="${escapeHtml(leader.name)} leader card"><span class="card-top"><b>L</b><small>${leader.cardNumber}</small></span><strong>${escapeHtml(leader.name)}</strong></div></div>`;
}

export function updateDeckLeaderPreview(
  savedDecks: Record<string, SavedDeck>,
  id: string,
  deck: string,
): void {
  const preview = document
    .querySelector(`#${id}`)
    ?.closest(".deck-select-control")
    ?.querySelector(".deck-select-preview");
  if (preview) preview.outerHTML = renderDeckLeaderPreview(savedDecks, deck);
}

/** Names compared without the punctuation they disagree about: a name a
    player gave a deck may write "Eustass Kid" for a Leader printed
    `Eustass"Captain"Kid`, or "Monkey.D.Luffy" for "Monkey.D. Luffy". */
function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Whether a deck's own name already says who its Leader is.
 *
 * A shipped deck's always does, since it is the Leader's name; the nickname
 * inside a Leader's printed name is often left out of a name a player typed,
 * so the quoted part is dropped before comparing.
 */
function namesLeader(name: string, leaderName: string): boolean {
  const haystack = compact(name);
  const withoutNickname = leaderName.replace(/["'“”][^"'“”]*["'“”]/g, "");
  return (
    haystack.includes(compact(leaderName)) ||
    haystack.includes(compact(withoutNickname))
  );
}

/**
 * One deck's label, as both the picker's tiles and the select's options print
 * it: a shipped deck by its Leader and colours ({@link deckDisplayName}), a
 * saved deck by the name it was given.
 *
 * The Leader is appended only when the name does not already carry it, which
 * a shipped deck's always does; a deck the player named themselves ("MyST31")
 * usually does not, and that is the case the suffix is for.
 */
export function deckLabel(
  savedDecks: Record<string, SavedDeck>,
  deckId: string,
): string {
  const saved = savedDecks[deckId];
  const name = saved ? saved.name : deckDisplayName(deckId);
  const manifest = deckManifestFor(deckId, savedDecks);
  if (!manifest) return name;
  const leaderName = requireKnownCard(manifest.leader).name;
  return namesLeader(name, leaderName) ? name : `${name} · ${leaderName}`;
}

/**
 * The deck a seat is set to, as a button that opens the picker.
 *
 * A dropdown of ids was the wrong control for this choice: what tells two
 * decks apart is the Leader on the front of them, and a `<select>` can only
 * print its name. So the closed state shows the Leader card the deck is built
 * around, and choosing happens in a grid of those cards (see
 * {@link deckPickerDialog}). The value itself lives in a hidden field beside
 * this button, which is what the form reads on submit.
 *
 * Nothing is printed under the card. The Leader is the deck at a glance, and
 * its name and colours are one click away in the picker, where every deck is read side by side. The name is still
 * carried twice for the readers a card face does not serve: as the button's
 * `title`, for a pointer that hovers rather than clicks, and as screen-reader
 * text, which is the only identification of the chosen deck a screen reader
 * gets. "Change deck" is layered over the card, arriving on hover and on
 * keyboard focus, where it answers the question the pointer just asked.
 */
export function deckChoiceButton(
  savedDecks: Record<string, SavedDeck>,
  seat: string,
  selected: string,
): string {
  return `<div class="deck-choice">
    <input type="hidden" id="${seat}-deck" value="${escapeHtml(selected)}" />
    <button class="deck-choice-button" type="button" data-open-picker="${seat}" title="${escapeHtml(deckLabel(savedDecks, selected))}">
      <span class="deck-choice-card">
        ${renderDeckLeaderPreview(savedDecks, selected)}
        <span class="deck-choice-change">Change deck</span>
      </span>
      <strong id="${seat}-deck-label" class="sr-only">${escapeHtml(deckLabel(savedDecks, selected))}</strong>
    </button>
  </div>`;
}

/**
 * The decks on offer, split into the shelves a player browses them by.
 *
 * Decks of the player's own come first and are always their own section, even
 * when it is empty and holds only the builder slot: they are the few decks in
 * the list whose names mean something to the person reading, and they were
 * previously appended after all thirty-odd shipped ones, where a deck you
 * built yesterday was the hardest deck in the grid to find. The shipped
 * shelves follow in the order they answer "which of these should I play": the
 * lists read from an event, then the lists Bandai features, then the products
 * it sells.
 */
export interface DeckGroup {
  /** Stable handle for the shelf's tab and panel ids. */
  key: "saved" | "meta" | "official" | "starter";
  label: string;
  deckIds: string[];
}

/** Exported for its tests, which pass `standings` rather than building a
    page with them inlined. */
export function deckGroups(
  savedDecks: Record<string, SavedDeck>,
  candidates: readonly string[],
  saved: readonly string[],
  standings: DeckStandings | null = builtInDeckStandings(),
): DeckGroup[] {
  const shelves: DeckGroup[] = [
    { key: "saved", label: "Your decks", deckIds: [...saved] },
    { key: "meta", label: "Community", deckIds: [] },
    { key: "official", label: "Official Featured", deckIds: [] },
    { key: "starter", label: "Starters", deckIds: [] },
  ];
  const byShelf = {
    tournament: 1,
    official: 2,
    starter: 3,
  } as const;
  for (const deckId of candidates) {
    // A saved deck named in `candidates` belongs with the player's own.
    const shelf = savedDecks[deckId] ? 0 : byShelf[deckShelf(deckId)];
    shelves[shelf]!.deckIds.push(deckId);
  }
  // Each shipped shelf in the order a player reads the source it came from:
  // Bandai's feature-deck index newest first, and the starter products by
  // number -- ST-26 before ST-31, which reading them as strings would get
  // right only by accident. The Community shelf above them starts in the order
  // the id tuples list, which puts the two lists from one final in the order
  // they placed.
  shelves[2]!.deckIds.sort((left, right) =>
    compareFeaturePageEntries(deckManifests[left], deckManifests[right]),
  );
  shelves[3]!.deckIds.sort(
    (left, right) =>
      (starterDeckNumber(left) ?? 0) - (starterDeckNumber(right) ?? 0),
  );
  // A Leader's recommended list (`DeckManifest.recommended`) leads its shelf,
  // ahead of every order above: it is the list the app means a player to be
  // handed for that Leader, so it is the first tile they read. The sort is
  // stable, so the rest of each shelf keeps the order it was just given.
  for (const shelf of shelves.slice(1)) {
    shelf.deckIds.sort(
      (left, right) =>
        Number(isRecommendedDeck(right)) - Number(isRecommendedDeck(left)),
    );
  }
  // The Community shelf, last of all, by how the published learned model does
  // with each list (`deck-standings.ts`), best first: its lists come from
  // different events and placings, which say little about how they compare,
  // and the model release is the one measurement every list on it shares. A
  // list the standings do not rank -- one added since the model was measured
  // -- follows the ranked ones in the order above, and a build without
  // standings keeps that order whole.
  shelves[1]!.deckIds = orderByWinRate(shelves[1]!.deckIds, standings);
  return shelves;
}

/**
 * Where a shipped list came from -- "25th Place ChinoizeCup #105", "Starter
 * Deck 31" -- read off the end of its id, or undefined for a deck that is not
 * a shipped list. The tile's name leaves it out, because it describes one list
 * and the name stands for the Leader's; it is still true of this list, so the
 * tile carries it as its tooltip and the filter matches it.
 */
function deckOrigin(
  savedDecks: Record<string, SavedDeck>,
  deckId: string,
): string | undefined {
  if (savedDecks[deckId] || !deckManifests[deckId]) return undefined;
  const at = deckId.lastIndexOf(" - ");
  return at < 0 ? undefined : deckId.slice(at + 3);
}

/** What a tile's filter matches against: the label the tile prints, plus the
    Leader's name, number and colours, which a label may not carry -- a saved
    deck's name says nothing about its colour -- and a shipped list's origin.
    Lower-cased once here so the filter compares without re-reading any card. */
function deckFilterText(
  savedDecks: Record<string, SavedDeck>,
  deckId: string,
): string {
  const manifest = deckManifestFor(deckId, savedDecks);
  const leader = manifest ? requireKnownCard(manifest.leader) : undefined;
  return [
    deckLabel(savedDecks, deckId),
    leader?.name ?? "",
    leader?.cardNumber ?? "",
    ...(leader?.colors ?? []),
    deckOrigin(savedDecks, deckId) ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * The grid the deck is picked from: every deck this seat may play, as its
 * Leader card.
 *
 * `offerBuilder` gates every way this grid reaches the deck editor -- the empty
 * slot, the pencil on each tile, and the bin on a deck of the player's own. It
 * is false for a grid that is a fixed list of `deckIds`, where a deck built
 * from there could be one the list does not hold. Managing saved decks belongs
 * to the player's own grid either way.
 */
export function deckPickerDialog(
  savedDecks: Record<string, SavedDeck>,
  seat: string,
  title: string,
  selected: string,
  options: {
    deckIds?: readonly string[];
    offerBuilder: boolean;
  },
): string {
  const candidates = options.deckIds ?? SELECTABLE_DECK_IDS;
  const saved = options.deckIds ? [] : Object.keys(savedDecks);
  const originTitle = (deckId: string): string => {
    const origin = deckOrigin(savedDecks, deckId);
    return origin ? ` title="${escapeHtml(origin)}"` : "";
  };
  const tile = (deckId: string): string =>
    // The tile is two controls, not one: the card picks the deck, and the
    // pencil on it opens the deck in the editor. That second one is what
    // makes a preset readable -- and copyable, since saving a preset you
    // opened writes a new deck of your own rather than overwriting it.
    `<div class="deck-tile-wrap" data-deck-filter="${escapeHtml(deckFilterText(savedDecks, deckId))}">
        <button class="deck-tile ${deckId === selected ? "picked" : ""}" type="button" data-pick-deck="${seat}" data-deck-id="${escapeHtml(deckId)}" aria-pressed="${deckId === selected}"${originTitle(deckId)}>
          ${renderDeckLeaderPreview(savedDecks, deckId)}
          <span class="deck-tile-name">${escapeHtml(deckLabel(savedDecks, deckId))}</span>
        </button>
        ${options.offerBuilder ? `<button class="deck-tile-edit" type="button" data-edit-deck="${seat}" data-deck-id="${escapeHtml(deckId)}" title="Open ${escapeHtml(deckLabel(savedDecks, deckId))} in the deck editor">${icon("settings", `Open ${deckLabel(savedDecks, deckId)} in the deck editor`)}</button>` : ""}
        ${
          // Only a deck the player saved can be deleted: a format deck is not
          // theirs to remove, and it would be back on the next page load.
          options.offerBuilder && savedDecks[deckId]
            ? `<button class="deck-tile-delete" type="button" data-delete-deck="${escapeHtml(deckId)}" title="Delete ${escapeHtml(deckLabel(savedDecks, deckId))}">${icon("trash-2", `Delete ${deckLabel(savedDecks, deckId)}`)}</button>`
            : ""
        }
      </div>`;
  // First position, before every finished deck: the empty slot is how a player
  // learns the builder exists at the moment they are looking at decks.
  const builder = options.offerBuilder
    ? `<button class="deck-tile deck-tile-builder" type="button" data-edit-deck="${seat}">
        <span class="deck-tile-slot" aria-hidden="true">+</span>
        <span class="deck-tile-name">Build and save your own deck</span>
      </button>`
    : "";
  const [own, ...shipped] = deckGroups(savedDecks, candidates, saved);
  // The player's own shelf stays above the tabs rather than being one of them:
  // it is the shelf they are most often looking for, and it is dropped when it
  // is empty, except while the builder slot is there to fill it -- an empty
  // "Your decks" heading over the slot is what says the slot is where your
  // decks would be.
  const ownContents = `${builder}${own!.deckIds.map(tile).join("")}`;
  const ownShelf = ownContents
    ? `<section class="deck-picker-group" data-shelf-label="${escapeHtml(own!.label)}"><h3>${escapeHtml(own!.label)}</h3><div class="deck-picker-grid">${ownContents}</div></section>`
    : "";
  // The shipped shelves are tabs. An empty one -- a narrowed `deckIds` list
  // can leave a shelf with nothing on it -- gets no tab, and the grid opens on
  // Community, or on the first shelf left when Community is empty.
  const tabs = shipped.filter((group) => group.deckIds.length > 0);
  const tabId = (group: DeckGroup): string => `${seat}-deck-tab-${group.key}`;
  const panelId = (group: DeckGroup): string =>
    `${seat}-deck-shelf-${group.key}`;
  const tabList = tabs.length
    ? `<div class="deck-picker-tabs" role="tablist" aria-label="Deck shelves">${tabs
        .map(
          (group, index) =>
            `<button class="deck-picker-tab" type="button" role="tab" id="${tabId(group)}" aria-controls="${panelId(group)}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${escapeHtml(group.label)}<span class="deck-picker-tab-count">${group.deckIds.length}</span></button>`,
        )
        .join("")}</div>`
    : "";
  // Each shelf filters on its own, so narrowing Starters to one colour does
  // not leave Community narrowed when the player switches back to it.
  const panels = tabs
    .map(
      (group, index) =>
        `<section class="deck-picker-group" role="tabpanel" id="${panelId(group)}" aria-labelledby="${tabId(group)}" data-shelf-label="${escapeHtml(group.label)}" ${index === 0 ? "" : "hidden"}>
          <label class="deck-picker-filter"><span class="sr-only">Filter ${escapeHtml(group.label)}</span><input type="search" data-deck-filter-input placeholder="Filter by name, Leader or colour" autocomplete="off" /></label>
          <div class="deck-picker-grid">${group.deckIds.map(tile).join("")}</div>
          <p class="deck-picker-empty muted small" hidden>No deck on this shelf matches.</p>
        </section>`,
    )
    .join("");
  const shelves = `${ownShelf}${tabList}${panels}`;
  return `<div class="app-dialog-backdrop" id="${seat}-deck-picker" hidden>
    <div class="app-dialog deck-picker" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="app-dialog-head">
        <h2>${escapeHtml(title)}</h2>
        <button class="text-button" type="button" data-close-dialog="${seat}-deck-picker">${icon("x", "Close")}Close</button>
      </div>
      <div class="deck-picker-shelves">${shelves}</div>
    </div>
  </div>`;
}

/**
 * Wire a picker's shelf tabs and their filters. Nothing here re-renders: a tab
 * shows its panel and a filter hides tiles in place, so the tiles' own click
 * bindings survive both.
 */
export function bindDeckPickerShelves(picker: Element): void {
  const tabs = [
    ...picker.querySelectorAll<HTMLButtonElement>(".deck-picker-tab"),
  ];
  const select = (chosen: HTMLButtonElement): void => {
    for (const tab of tabs) {
      const selected = tab === chosen;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = picker.querySelector(
        `#${tab.getAttribute("aria-controls")}`,
      );
      if (panel) panel.toggleAttribute("hidden", !selected);
    }
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      select(tab);
    });
    // The tablist is one stop in the tab order, and the arrow keys move
    // along it, as the ARIA tabs pattern has it.
    tab.addEventListener("keydown", (event) => {
      const step =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = tabs[(index + step + tabs.length) % tabs.length]!;
      select(next);
      next.focus();
    });
  });
  picker
    .querySelectorAll<HTMLInputElement>("[data-deck-filter-input]")
    .forEach((input) => {
      const panel = input.closest(".deck-picker-group");
      if (!panel) return;
      input.addEventListener("input", () => {
        const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
        let shown = 0;
        panel
          .querySelectorAll<HTMLElement>(".deck-tile-wrap")
          .forEach((wrap) => {
            const text = wrap.dataset.deckFilter ?? "";
            const match = terms.every((term) => text.includes(term));
            wrap.hidden = !match;
            if (match) shown += 1;
          });
        panel
          .querySelector(".deck-picker-empty")
          ?.toggleAttribute("hidden", shown > 0);
      });
    });
}
