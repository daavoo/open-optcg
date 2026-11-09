import { printedText, type CardDefinition } from "@one-piece-sim/cards";
import { assetUrl } from "./assets.js";
import { escapeHtml } from "./card-text.js";
import { icon } from "./icons.js";
import { rerenderPreservingCaret } from "./dom.js";

export type CatalogSortKey = "cost" | "name" | "number";

const CATALOG_SORT_OPTIONS: ReadonlyArray<{
  value: CatalogSortKey;
  label: string;
}> = [
  { value: "cost", label: "Cost" },
  { value: "name", label: "Name" },
  { value: "number", label: "Number" },
];

export function renderSortSelect(id: string, sort: CatalogSortKey): string {
  return `<label class="catalog-sort">Sort<select id="${id}">${CATALOG_SORT_OPTIONS.map(
    (option) =>
      `<option value="${option.value}" ${option.value === sort ? "selected" : ""}>${option.label}</option>`,
  ).join("")}</select></label>`;
}

/**
 * What the card pool is narrowed by.
 *
 * A card answers to several unrelated kinds of question -- what it is, what it
 * does, what colour it is, what it costs -- and one box over all of them is
 * the reason searching "DON!!" used to return nothing: the query went to a
 * haystack of numbers, names, colours and types, where the string appears on
 * no card. Each question gets its own control, so a builder combines them
 * ("a Blocker under 4 cost") instead of choosing which one the box is for.
 */
export interface CatalogFilter {
  /** Matched against what a card is: number, name, colour, type, attribute. */
  identity: string;
  /** Matched against what a card does: its derived rules, and the printed
      words when a text pack is loaded. */
  text: string;
  /**
   * The colours whose cards are hidden.
   *
   * Held as the hidden set rather than the shown one so that "all colours"
   * is the empty default: the pool's colours change under the filter when the
   * Leader does, and a stored list of shown colours would either go stale
   * against the new pool or have to be reset on every Leader change.
   */
  hiddenColors: readonly string[];
  /** The card types whose cards are hidden, on the same reading as
      {@link hiddenColors}: empty is every type. */
  hiddenCategories: readonly string[];
  /** Cost bounds, inclusive; null for an open end. */
  minCost: number | null;
  maxCost: number | null;
}

export const EMPTY_CATALOG_FILTER: CatalogFilter = {
  identity: "",
  text: "",
  hiddenColors: [],
  hiddenCategories: [],
  minCost: null,
  maxCost: null,
};

/** Printed colour order, so the chips read the same whatever the pool is. */
const COLOR_ORDER = ["Red", "Green", "Blue", "Purple", "Black", "Yellow"];

/** Which colours a pool actually contains, in printed order. A mono-colour
    Leader still reaches dual-colour cards, so this is a fact about the pool
    and not about the Leader. */
export function catalogPoolColors(cards: readonly CardDefinition[]): string[] {
  const present = new Set<string>();
  for (const card of cards)
    for (const color of card.colors ?? []) present.add(color);
  return [
    ...COLOR_ORDER.filter((color) => present.has(color)),
    ...[...present].filter((color) => !COLOR_ORDER.includes(color)).sort(),
  ];
}

/** Printed deck-building types, in the order a deck list is read in. A Leader
    is never in a pool being built from, so it is not one of these. */
const CATEGORY_ORDER = ["character", "event", "stage"];

/** Which of those a pool contains. */
export function catalogPoolCategories(
  cards: readonly CardDefinition[],
): string[] {
  const present = new Set(cards.map((card) => card.category));
  return CATEGORY_ORDER.filter((category) => present.has(category));
}

/** The highest cost in a pool, which is what the cost inputs cap at. */
export function catalogMaxCost(cards: readonly CardDefinition[]): number {
  return cards.reduce((highest, card) => Math.max(highest, card.cost ?? 0), 0);
}

/** What a card is: the printed identity, which the records always carry. */
function identityHaystack(card: CardDefinition): string {
  return [
    card.cardNumber,
    card.name,
    ...(card.colors ?? []),
    ...card.types,
    card.attribute ?? "",
  ].join(" ");
}

/**
 * What a card does.
 *
 * The derived rules come first and are always there: the clause markers, the
 * printed keywords and every bracketed token the effect prints, which is what
 * makes `[DON!! x1]`, `[On Play]` and `[Once Per Turn]` findable in a build
 * carrying no printed text at all. The words themselves are appended only when
 * someone has loaded a pack -- they are Bandai's, and the app has them only as
 * an asset the player supplies.
 */
function textHaystack(card: CardDefinition): string {
  const text = printedText(card.cardNumber);
  return [
    ...card.rules.clauses,
    ...card.rules.keywords,
    ...card.rules.tokens,
    text?.effect ?? "",
    text?.trigger ?? "",
  ].join(" ");
}

function contains(haystack: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || haystack.toLowerCase().includes(needle);
}

/** Whether a card survives every part of `filter`. */
export function matchesCatalogFilter(
  card: CardDefinition,
  filter: CatalogFilter,
): boolean {
  if (!contains(identityHaystack(card), filter.identity)) return false;
  if (!contains(textHaystack(card), filter.text)) return false;
  // A dual-colour card is hidden only once both of its colours are, which is
  // the reading that keeps it available while either half is being built with.
  const colors = card.colors ?? [];
  if (
    colors.length &&
    colors.every((color) => filter.hiddenColors.includes(color))
  ) {
    return false;
  }
  if (filter.hiddenCategories.includes(card.category)) return false;
  if (filter.minCost !== null || filter.maxCost !== null) {
    // Only a Leader has no cost, and no Leader is in a deck-building pool.
    if (card.cost === null) return false;
    if (filter.minCost !== null && card.cost < filter.minCost) return false;
    if (filter.maxCost !== null && card.cost > filter.maxCost) return false;
  }
  return true;
}

/** Whether the filter would let the whole pool through, which is what
    separates "this pool is empty" from "your search found nothing". */
export function catalogFilterIsEmpty(filter: CatalogFilter): boolean {
  return (
    !filter.identity.trim() &&
    !filter.text.trim() &&
    filter.hiddenColors.length === 0 &&
    filter.hiddenCategories.length === 0 &&
    filter.minCost === null &&
    filter.maxCost === null
  );
}

/**
 * The filter row above the pool.
 *
 * `prefix` namespaces every control's id, because the editor and the sealed
 * builder both render one of these onto pages that also carry the other
 * screen's ids.
 */
export function renderCatalogFilters(
  prefix: string,
  filter: CatalogFilter,
  sort: CatalogSortKey,
  pool: readonly CardDefinition[],
): string {
  const colors = catalogPoolColors(pool);
  const categories = catalogPoolCategories(pool);
  const maxCost = catalogMaxCost(pool);
  const costInput = (
    which: "min" | "max",
    value: number | null,
    label: string,
  ): string =>
    `<input type="number" inputmode="numeric" min="0" max="${maxCost}" step="1" id="${prefix}-cost-${which}" aria-label="${label} cost" placeholder="${label}" value="${value ?? ""}" />`;
  return `<div class="catalog-controls">
    <label class="catalog-search">Name &amp; number<input id="${prefix}-search" value="${escapeHtml(filter.identity)}" placeholder="Luffy, OP17, Straw Hat Crew" /></label>
    <label class="catalog-search">Card text<input id="${prefix}-text" value="${escapeHtml(filter.text)}" placeholder="Blocker, Rush, DON!!" /></label>
    ${renderCheckMenu({
      id: `${prefix}-colors`,
      label: "Colors",
      noun: "colors",
      attribute: "data-catalog-color",
      values: colors,
      hidden: filter.hiddenColors,
      optionId: (color) => `${prefix}-color-${color.toLowerCase()}`,
      optionLabel: (color) => color,
      swatch: true,
    })}
    ${renderCheckMenu({
      id: `${prefix}-types`,
      label: "Card type",
      noun: "types",
      attribute: "data-catalog-category",
      values: categories,
      hidden: filter.hiddenCategories,
      optionId: (category) => `${prefix}-type-${category}`,
      optionLabel: categoryLabel,
      swatch: false,
    })}
    <fieldset class="catalog-cost"><legend>Cost</legend>${costInput("min", filter.minCost, "Min")}<span aria-hidden="true">&ndash;</span>${costInput("max", filter.maxCost, "Max")}</fieldset>
    ${renderSortSelect(`${prefix}-sort`, sort)}
  </div>`;
}

/**
 * Which menus are open, which a re-render has to put back.
 *
 * The pool redraws by re-rendering the whole screen, so a menu that held its
 * open state in the DOM would shut on the first box ticked -- and ticking two
 * colours in a row is the ordinary use. Module state rather than
 * {@link CatalogFilter}: what is open is not part of what the pool is narrowed
 * by, and nothing outside this file should have to carry it.
 */
const openMenus = new Set<string>();

/** Closes every menu, for a screen that is being left or replaced. */
export function closeCatalogMenus(): void {
  openMenus.clear();
}

interface CheckMenu {
  id: string;
  /** What the control is called, above it. */
  label: string;
  /** The plural in the summary, as in "All colors" and "2 of 6 colors". */
  noun: string;
  attribute: string;
  values: readonly string[];
  hidden: readonly string[];
  optionId: (value: string) => string;
  optionLabel: (value: string) => string;
  /** Whether each row carries a colour dot, which only colours have. */
  swatch: boolean;
}

/**
 * A multi-select as a dropdown rather than a row of chips.
 *
 * Every value is on to start with, so the resting state is one word -- "All
 * colors" -- instead of six chips holding a third of the filter row. A sealed
 * pool prints all six, and the row has three other controls to fit beside it.
 */
function renderCheckMenu(menu: CheckMenu): string {
  // One value is not a choice, and a menu that can only say "All" reads as a
  // control that does not work.
  if (menu.values.length < 2) return "";
  const shown = menu.values.filter((value) => !menu.hidden.includes(value));
  const summary =
    shown.length === menu.values.length
      ? `All ${menu.noun}`
      : shown.length === 0
        ? `No ${menu.noun}`
        : shown.length <= 2
          ? shown.map(menu.optionLabel).join(", ")
          : `${shown.length} of ${menu.values.length} ${menu.noun}`;
  const rows = menu.values
    .map((value) => {
      const checked = !menu.hidden.includes(value);
      const dot = menu.swatch
        ? `<i class="catalog-menu-dot" style="background:var(--${value.toLowerCase()})"></i>`
        : "";
      return `<label class="catalog-menu-row"><input type="checkbox" id="${menu.optionId(value)}" ${menu.attribute}="${escapeHtml(value)}"${checked ? " checked" : ""} />${dot}<span>${escapeHtml(menu.optionLabel(value))}</span></label>`;
    })
    .join("");
  const everything = shown.length === menu.values.length;
  return `<div class="catalog-menu-field"><span class="catalog-menu-label" id="${menu.id}-label">${escapeHtml(menu.label)}</span><details class="catalog-menu" id="${menu.id}" data-catalog-menu${openMenus.has(menu.id) ? " open" : ""}>
    <summary aria-labelledby="${menu.id}-label ${menu.id}-summary"><span id="${menu.id}-summary">${escapeHtml(summary)}</span></summary>
    <div class="catalog-menu-panel">${rows}<button type="button" class="catalog-menu-all" data-catalog-menu-all="${menu.attribute}"${everything ? " disabled" : ""}>Select all</button></div>
  </details></div>`;
}

/** The printed word for a category, which the records hold lowercased. */
function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * How many cards came through, said under the filters that narrowed them.
 *
 * Only while something is filtered. An unfiltered count is a fact about the
 * pool that the cards themselves already show, and it had been carrying a
 * heading and an eyebrow beside the controls for it.
 */
export function renderCatalogCount(
  shown: number,
  total: number,
  filter: CatalogFilter,
): string {
  if (catalogFilterIsEmpty(filter)) return "";
  return `<p class="catalog-count"><b>${shown}</b> of ${total} cards</p>`;
}

/**
 * How long after the last keystroke the pool is refiltered.
 *
 * The pool redraws by re-rendering the whole screen -- several hundred cards
 * and their icons -- so doing it on every keystroke made typing stutter, worst
 * on a phone, where the redraw is slower than the gap between two letters.
 * Waiting for the typing to settle keeps the search live (no Enter, no Apply
 * button) at one redraw per word instead of one per letter. Enter skips the
 * wait for anyone who expects it to.
 */
const SEARCH_SETTLE_MS = 250;

let settleTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingApply(): void {
  if (settleTimer !== null) clearTimeout(settleTimer);
  settleTimer = null;
}

/**
 * Binds the controls {@link renderCatalogFilters} drew.
 *
 * `filter` is the screen's own object and is mutated in place; `apply` is the
 * screen's re-render, which is what makes the change visible.
 */
export function bindCatalogFilters(
  prefix: string,
  filter: CatalogFilter,
  apply: () => void,
): void {
  // The previous render's pending keystroke belongs to a DOM that no longer
  // exists, and would re-render a screen the player may have left.
  cancelPendingApply();
  const applyNow = (): void => {
    // The filters may have been left behind -- a card added, Back pressed --
    // between the last keystroke and the timer.
    if (!document.querySelector(`#${prefix}-search`)) return;
    // Re-rendering replaces every control, including the one being used, so
    // the caret is carried across the swap; without it the next letter lands
    // at the front, and a settle that catches someone moving to the next box
    // drops them out of it.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.id) {
      rerenderPreservingCaret(active.id, active, apply);
      return;
    }
    apply();
  };
  const typed = (
    id: string,
    assign: (input: HTMLInputElement) => void,
  ): void => {
    const input = document.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) return;
    input.addEventListener("input", () => {
      assign(input);
      cancelPendingApply();
      settleTimer = setTimeout(() => {
        settleTimer = null;
        applyNow();
      }, SEARCH_SETTLE_MS);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      // Nothing here submits, and a form would; Enter is only the way to skip
      // the wait for someone who expects it to be.
      event.preventDefault();
      assign(input);
      cancelPendingApply();
      applyNow();
    });
  };
  typed(`${prefix}-search`, (input) => {
    filter.identity = input.value;
  });
  typed(`${prefix}-text`, (input) => {
    filter.text = input.value;
  });
  typed(`${prefix}-cost-min`, (input) => {
    filter.minCost = costBound(input);
  });
  typed(`${prefix}-cost-max`, (input) => {
    filter.maxCost = costBound(input);
  });
  // Both menus toggle the same way: a box turned off adds its value to the
  // hidden list, and turned back on takes it out again.
  const menu = (
    selector: string,
    read: () => readonly string[],
    write: (hidden: readonly string[]) => void,
  ): void => {
    document
      .querySelectorAll<HTMLInputElement>(`.catalog-controls [${selector}]`)
      .forEach((box) => {
        box.addEventListener("change", () => {
          const value = box.getAttribute(selector)!;
          const hidden = read().filter((entry) => entry !== value);
          write(box.checked ? hidden : [...hidden, value]);
          cancelPendingApply();
          applyNow();
        });
      });
    document
      .querySelectorAll<HTMLButtonElement>(
        `.catalog-controls [data-catalog-menu-all="${selector}"]`,
      )
      .forEach((button) => {
        button.addEventListener("click", () => {
          write([]);
          cancelPendingApply();
          applyNow();
        });
      });
  };
  menu(
    "data-catalog-color",
    () => filter.hiddenColors,
    (hidden) => {
      filter.hiddenColors = hidden;
    },
  );
  menu(
    "data-catalog-category",
    () => filter.hiddenCategories,
    (hidden) => {
      filter.hiddenCategories = hidden;
    },
  );
  // What is open has to outlive the re-render each tick causes, so the DOM
  // reports it here rather than holding it.
  document
    .querySelectorAll<HTMLDetailsElement>(
      ".catalog-controls [data-catalog-menu]",
    )
    .forEach((details) => {
      details.addEventListener("toggle", () => {
        if (details.open) openMenus.add(details.id);
        else openMenus.delete(details.id);
      });
    });
  bindMenuDismissal();
}

/**
 * Closes an open menu on a click outside it.
 *
 * A `<details>` stays open until its own summary is clicked again, which for a
 * dropdown reads as one that is stuck. Installed once for the page rather than
 * per render: the screen rebinds on every filter change, and a listener added
 * each time would fire once per render that had happened.
 */
let menuDismissalBound = false;

function bindMenuDismissal(): void {
  if (menuDismissalBound) return;
  menuDismissalBound = true;
  document.addEventListener("click", (event) => {
    const target = event.target;
    const inside =
      target instanceof Element ? target.closest("[data-catalog-menu]") : null;
    document
      .querySelectorAll<HTMLDetailsElement>("[data-catalog-menu][open]")
      .forEach((details) => {
        if (details !== inside) details.open = false;
      });
  });
}

/** An empty box is an open end, and anything unreadable is treated as one. */
function costBound(input: HTMLInputElement): number | null {
  const value = Number(input.value.trim());
  if (!input.value.trim() || !Number.isFinite(value)) return null;
  return Math.max(0, Math.trunc(value));
}

export function sortCatalogCards(
  cards: readonly CardDefinition[],
  sort: CatalogSortKey,
): CardDefinition[] {
  const sorted = [...cards];
  sorted.sort((left, right) => {
    if (sort === "name") {
      return (
        left.name.localeCompare(right.name) ||
        left.cardNumber.localeCompare(right.cardNumber)
      );
    }
    if (sort === "cost") {
      const leftCost = left.cost ?? Number.POSITIVE_INFINITY;
      const rightCost = right.cost ?? Number.POSITIVE_INFINITY;
      return (
        leftCost - rightCost || left.cardNumber.localeCompare(right.cardNumber)
      );
    }
    return left.cardNumber.localeCompare(right.cardNumber);
  });
  return sorted;
}

export function renderCatalogCard(
  card: CardDefinition,
  quantity: number,
  editable = true,
): string {
  const art = assetUrl(card.cardNumber);
  const color = card.colors?.[0]?.toLowerCase() ?? "neutral";
  return `<article class="catalog-card ${quantity ? "in-deck" : ""}" data-colors="${card.colors?.join(" ") ?? ""}">
    <button class="game-card catalog-card-face ${art ? "has-art" : ""}" style="--card-color:var(--${color})${art ? `;--card-art:url('${art}')` : ""}" data-inspect-card="${card.cardNumber}" aria-label="View ${escapeHtml(card.name)} details">
      <span class="card-top"><b>${card.cost ?? "L"}</b><small>${card.cardNumber}</small></span>
      <strong>${escapeHtml(card.name)}</strong>
    </button>
    <div class="catalog-card-caption"><span class="card-number">${card.cardNumber}</span><strong>${escapeHtml(card.name)}</strong></div>
    ${editable ? `<div class="quantity-control"><button data-decrease="${card.cardNumber}" title="Remove ${escapeHtml(card.name)}" ${quantity === 0 ? "disabled" : ""}>${icon("minus", "Remove one")}</button><output>${quantity}</output><button data-increase="${card.cardNumber}" title="Add ${escapeHtml(card.name)}">${icon("plus", "Add one")}</button></div>` : ""}
  </article>`;
}
