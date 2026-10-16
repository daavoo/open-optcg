/**
 * The modal dialogs more than one screen puts on screen.
 *
 * The card-detail popup is shared by the deck editor's catalog, the sealed
 * builder's pool, the analytics card-impact rows and any in-game card that is
 * clickable but not actionable. The import dialog is shared by the deck editor
 * and sealed's "Import a deck". None of them belong to a screen, so none of
 * them live in one.
 *
 * The card overview -- art, printed numbers, printed text -- is here too rather
 * than with the battle view, because both surfaces that show a whole card share
 * it: this file's popup, and the battle screen's modal for a card you selected.
 */
import { printedText, requireKnownCard } from "@one-piece-sim/cards";
import { DEFAULT_SEALED_EXPANSION, SEALED_LEADER } from "@one-piece-sim/decks";
import type {
  CardKeyword,
  GrantedKeywordObservation,
  PowerModifierObservation,
  StaticPowerContributionObservation,
} from "@one-piece-sim/protocol";
import { assetUrl } from "./assets.js";
import { escapeHtml, renderCardText } from "./card-text.js";
import {
  formatCompactStat,
  GRANTED_KEYWORD_CONSEQUENCE,
} from "@one-piece-sim/engine-core";
import { parseDeckList, type EditableDeck } from "./deck-editor.js";
import { icon } from "./icons.js";

/** What the rule card needs to explain a card's *current* power, as opposed to
    its printed power. Extracted from an observation by the battle view. */
export interface ObservedPowerDetails {
  /**
   * The power the engine is showing for this card right now, or null where
   * there is no such thing -- a card in hand, whose entry exists for its
   * `currentCost` alone. Null falls back to the printed figure, which is the
   * right answer for a hand card and stays "—" for an Event or a Stage.
   */
  currentPower: number | null;
  /**
   * The base power an effect has put in place of the printed one, when one has.
   *
   * OP17-005 Edward.Newgate's [On Play] makes your 5000 Leader an 8000 one, and
   * every row below is a delta off *that*: without it the breakdown read
   * "printed 5k, +2k Edward.Newgate" under a headline power of 10k, which is a
   * popup contradicting itself two lines apart.
   */
  basePower?: number;
  attachedDon: number;
  /**
   * Whether that attached DON!! is adding its +1000 right now.
   *
   * DON!! stays attached through the opponent's turn but only pays out on its
   * controller's -- `donPowerApplies` in the engine. The breakdown used to bill
   * it unconditionally, so an opponent's Leader inspected on your turn showed a
   * +1000 the engine had not counted and the rows summed past the power printed
   * two lines above them.
   */
  attachedDonApplies: boolean;
  powerModifiers: PowerModifierObservation[];
  staticPowerModifiers: StaticPowerContributionObservation[];
  /**
   * Keywords an effect handed this card for the turn.
   *
   * The printed text below them is the whole card and still says nothing about
   * them, which is the point: a player asking "how did that attack?" opens this
   * popup, and until now the answer was not on it.
   */
  grantedKeywords?: GrantedKeywordObservation[];
  /**
   * The turn through which an effect lets this card attack active Characters.
   *
   * The same question as `grantedKeywords` answers -- "how did that attack?"
   * -- for a permission that is not a keyword, so it needs its own row.
   */
  attacksActiveUntilTurn?: number;
  /**
   * Every keyword in force on the card, from any source.
   *
   * `grantedKeywords` above covers the turn-scoped grants and nothing else, so a
   * keyword an *aura* hands over -- OP16-003 giving your Leader [Double Attack],
   * OP15-071 giving it to every [Ohm] card -- appeared on neither the card text
   * nor this popup, while the +2000 from the same clause sat two rows above in
   * the power breakdown. Anything here that the card does not print and no grant
   * explains gets a badge of its own.
   */
  effectiveKeywords?: readonly CardKeyword[];
  /**
   * The cost the engine is charging for this card right now.
   *
   * Cost moves the same way power does -- OP15-088 Pirates Docking Six prints
   * "This Character gains +6 cost" on itself, and other cards raise or lower
   * a Character's cost from across the board -- but the popup only ever
   * printed the number on the card, so a player reading "Cost 5" was reading
   * the one figure every cost-capped effect on the board disagreed with.
   * Absent for a Leader, which has no cost.
   *
   * For a card in hand this is its *hand price* -- what playing it will
   * actually cost -- which is the number the player is deciding on and the
   * one the printed figure most often lies about: ST33-004 Borsalino prints 6
   * and is played for 3 the turn an effect trashed from its controller's
   * hand.
   */
  currentCost?: number;
}

export interface ObservedRemovalImmunity {
  active: boolean;
  fieldDon: number;
}

/** The card-detail popup's state: which card, if any, is being shown. Shared,
    because the screens that raise it never render at once. */
export interface CardDetailState {
  cardDetailCard: string | null;
  /** The board instance the popup was raised from, when there is one. A card
      number alone cannot say why a Character's power differs from its printed
      value; the instance is what a live observation's power breakdown is keyed
      by. Null for the catalog, a Life card, a mulligan preview -- anywhere the
      card is a definition rather than a card in play. */
  cardDetailInstance: string | null;
}

/** The import dialog's state. Kept across re-renders so a parse error, which
    re-renders the whole host page, doesn't wipe out what the player typed. */
export interface ImportDialogState {
  importDialogOpen: boolean;
  importDraft: string;
  /** Which screen opened it, so one dialog can apply the parsed list to
      either the constructed deck editor or a sealed run. */
  importTarget: "editor" | "sealed";
  importMessage: string;
}

/** Whether any effect -- even ones that net out to zero -- is currently touching this card's power. */
export function hasActivePowerEffects(details: ObservedPowerDetails): boolean {
  return (
    details.basePower !== undefined ||
    details.attachedDon > 0 ||
    details.powerModifiers.length > 0 ||
    details.staticPowerModifiers.length > 0
  );
}

function renderPowerBreakdown(
  printedPower: number,
  details: ObservedPowerDetails,
): string {
  const rows: Array<{
    amount: number;
    label: string;
    detail: string;
    inactive?: boolean;
  }> = [
    ...(details.attachedDon
      ? [
          details.attachedDonApplies
            ? {
                amount: details.attachedDon * 1000,
                label: "Attached DON!!",
                detail: "",
              }
            : {
                amount: 0,
                label: "Attached DON!!",
                detail: `×${details.attachedDon} · pays out only on its controller's turn`,
                inactive: true,
              },
        ]
      : []),
    ...details.staticPowerModifiers.map((modifier) => {
      const source = requireKnownCard(modifier.sourceCardNumber);
      return {
        amount: modifier.amount,
        label: source.name,
        detail: source.cardNumber,
      };
    }),
    ...details.powerModifiers.map((modifier) => {
      const source = modifier.sourceCardNumber
        ? requireKnownCard(modifier.sourceCardNumber)
        : null;
      return {
        amount: modifier.amount,
        label: source?.name ?? "Card effect",
        detail: `${source ? source.cardNumber : "Unknown source"} · through turn ${modifier.expiresAtTurn}`,
      };
    }),
  ];
  // The head row is whatever the rows below are deltas off. A "becomes N"
  // clause replaces printed power rather than adding to it, so it cannot be one
  // of those rows -- it is the number they start from, with the printed figure
  // demoted to a note so the player can still see what the card says.
  const base = details.basePower ?? printedPower;
  const baseRow =
    details.basePower === undefined
      ? `<span>Printed power</span>`
      : `<span>Base power<small>set by an effect · printed ${formatCompactStat(printedPower)}</small></span>`;
  return `<div class="power-breakdown"><div>${baseRow}<b>${formatCompactStat(base)}</b></div>${rows.map((row) => `<div class="${row.inactive ? "inactive" : row.amount < 0 ? "negative" : "positive"}"><span>${escapeHtml(row.label)}${row.detail ? `<small>${escapeHtml(row.detail)}</small>` : ""}</span><b>${row.inactive ? "—" : `${row.amount > 0 ? "+" : "−"}${formatCompactStat(Math.abs(row.amount))}`}</b></div>`).join("")}</div>`;
}

/** The three headline numbers, as their own block so a caller can column them.
    Cost and power are the live ones when the caller has an observation; only
    Counter is always the printed figure, having nothing that moves it. */
export function renderRuleStats(
  cardNumber: string,
  powerDetails?: ObservedPowerDetails,
): string {
  const card = requireKnownCard(cardNumber);
  const displayedPower = powerDetails?.currentPower ?? card.power;
  const displayedCost = powerDetails?.currentCost ?? card.cost;
  // Power gets a breakdown block below listing every source; cost has only the
  // engine's one total to show, so the tile itself carries the delta -- an
  // 11 with no explanation next to art printed 5 reads as a bug.
  const costShift =
    displayedCost !== null && card.cost !== null && displayedCost !== card.cost
      ? displayedCost - card.cost
      : 0;
  const costNote = costShift
    ? `<small>printed ${card.cost} · ${costShift > 0 ? "+" : "−"}${Math.abs(costShift)} from effects</small>`
    : "";
  // The breakdown belongs to the number it explains, so it sits inside the
  // power tile rather than in a row of its own further down the modal: a
  // player reading "Power 8k" gets "printed 5k, +3k attached DON!!" in the
  // same glance instead of having to find it under the card.
  const breakdown =
    powerDetails && card.power !== null && hasActivePowerEffects(powerDetails)
      ? renderPowerBreakdown(card.power, powerDetails)
      : "";
  return `<div class="rule-stats"><span class="${costShift > 0 ? "raised" : costShift < 0 ? "lowered" : ""}">Cost <b>${displayedCost ?? "—"}</b>${costNote}</span><span>Power <b>${displayedPower === null ? "—" : formatCompactStat(displayedPower)}</b>${breakdown}</span><span>Counter <b>${card.counter === null ? "—" : formatCompactStat(card.counter)}</b></span></div>`;
}

/** The card's type line. */
export function renderRuleTypes(cardNumber: string): string {
  const card = requireKnownCard(cardNumber);
  return `<div class="rule-types"><small>Type</small><span>${card.types.length ? card.types.map((type) => `<b>${escapeHtml(type)}</b>`).join("") : "—"}</span></div>`;
}

/** The printed effect and trigger text. */
export function renderRuleText(cardNumber: string): string {
  const text = printedText(cardNumber);
  // The build ships no printed text; it arrives with the asset pack the player
  // loads. A pack older than the card has none for it, and the popup says so
  // rather than showing a card with no effect, which is a different card.
  if (!text) {
    return `<p class="card-text card-text-missing">This card's printed text is not in the loaded asset pack. Run the Get cards bookmark again and load what it saves from Configure matchup.</p>`;
  }
  return `<p class="card-text">${text.effect && text.effect !== "-" ? renderCardText(text.effect) : "No effect text."}</p>${text.trigger ? `<h3>Trigger</h3><p class="card-text">${renderCardText(text.trigger)}</p>` : ""}`;
}

/**
 * The keywords and immunities acting on this card *right now* that its printed
 * text does not say: what another card lent it, and the removal immunity the
 * board state is currently granting or withholding.
 *
 * These read as extra lines of the card's text -- "it also has [Blocker]" --
 * so they render under it, in the same column. The power a card is borrowing is
 * not one of them: that belongs to the number it explains, and
 * `renderRuleStats` prints it inside the power tile.
 */
export function renderCardStatusBadges(
  cardNumber: string,
  powerDetails?: ObservedPowerDetails,
  removalImmunity?: ObservedRemovalImmunity,
): string {
  const card = requireKnownCard(cardNumber);
  const grantedBadges = (powerDetails?.grantedKeywords ?? [])
    .map(
      (grant) =>
        `<div class="ability-status active" role="status"><span>${icon("sparkles", `Granted ${grant.keyword}`)}</span><div><b>[${grant.keyword}] granted this turn</b><small>Through turn ${grant.expiresAtTurn} · ${escapeHtml(GRANTED_KEYWORD_CONSEQUENCE[grant.keyword])}</small></div></div>`,
    )
    .join("");
  // A keyword in force that this card's own text never names, and that no
  // turn-scoped grant explains, came from another card's continuous ability --
  // and this popup was the last place a player could hope to find that out.
  //
  // The test is the card's own text rather than `cardFacts().keywords`, because
  // that list is only the *printed* keywords: ST31-003 Brook's "[Opponent's
  // Turn] ... gains [Blocker]" is correctly not printed and just as correctly
  // not somebody else's doing. The card below the badges already says it.
  const grantedNow = new Set(
    (powerDetails?.grantedKeywords ?? []).map((grant) => grant.keyword),
  );
  const auraBadges = (powerDetails?.effectiveKeywords ?? [])
    .filter(
      (keyword) =>
        !grantedNow.has(keyword) && !card.rules.tokens.includes(`[${keyword}]`),
    )
    .map(
      (keyword) =>
        `<div class="ability-status active" role="status"><span>${icon("sparkles", `${keyword} from another card`)}</span><div><b>[${keyword}] from another card</b><small>Lasts while that card's condition holds · ${escapeHtml(GRANTED_KEYWORD_CONSEQUENCE[keyword])}</small></div></div>`,
    )
    .join("");
  const attacksActiveBadge =
    powerDetails?.attacksActiveUntilTurn === undefined
      ? ""
      : `<div class="ability-status active" role="status"><span>${icon("sparkles", "Can attack active Characters")}</span><div><b>Can attack active Characters this turn</b><small>Through turn ${powerDetails.attacksActiveUntilTurn} · it may attack the opponent's active Characters, not only rested ones</small></div></div>`;
  const immunityBadge = removalImmunity
    ? `<div class="ability-status ${removalImmunity.active ? "active" : "inactive"}" role="status"><span>${icon("shield", "Removal immunity")}</span><div><b>Opponent-effect removal immunity ${removalImmunity.active ? "active" : "inactive"}</b><small>${removalImmunity.fieldDon} field DON!! ${removalImmunity.active ? "(6 or fewer)" : "(requires 6 or fewer)"}</small></div></div>`
    : "";
  return `${grantedBadges}${attacksActiveBadge}${auraBadges}${immunityBadge}`;
}

/**
 * A card as three columns -- its art, its printed numbers, its printed text --
 * which is how both surfaces that show a whole card lay one out: the in-game
 * modal for a card you selected, and this file's popup for one you can only
 * look at. They used to disagree, so an opponent's Character read as a
 * different kind of object than one of your own.
 *
 * `artColumn` is the caller's, because only the in-game modal has a live board
 * card to print; everything to the right of it is the same either way.
 *
 * @param options.notes Rendered under the printed text, above the actions:
 * sentences about this card that are true only this turn.
 * @param options.actions What the card is offering, when the caller has
 * anything to offer.
 */
export function renderCardOverview(
  cardNumber: string,
  artColumn: string,
  options: {
    powerDetails?: ObservedPowerDetails;
    removalImmunity?: ObservedRemovalImmunity;
    notes?: string;
    actions?: string;
  } = {},
): string {
  const { powerDetails, removalImmunity, notes = "", actions = "" } = options;
  return `<div class="card-action-overview">${artColumn}<div class="card-action-stats">${renderRuleStats(cardNumber, powerDetails)}${renderRuleTypes(cardNumber)}</div><div class="card-action-text rule-card">${renderRuleText(cardNumber)}${renderCardStatusBadges(cardNumber, powerDetails, removalImmunity)}${notes}${actions}</div></div>`;
}

/**
 * @param powerDetails The live power breakdown for `cardDetailInstance`, when
 * the host screen has an observation to resolve it from. Without it the popup
 * shows printed power, which is right for a catalog entry and wrong for a
 * Character standing on the board under someone else's +1000.
 */
export function renderCardDetailDialog(
  state: CardDetailState,
  powerDetails?: ObservedPowerDetails,
): string {
  if (!state.cardDetailCard) return "";
  const card = requireKnownCard(state.cardDetailCard);
  const art = assetUrl(card.cardNumber);
  // The column is rendered whether or not there is art behind it -- an offline
  // build has none, and dropping the element would slide the other two columns
  // into its place. Without art it names the card instead of standing empty: a
  // blank panel the size of a card reads as an image that failed, not as a
  // build that was asked for no art.
  const artColumn = art
    ? `<div class="card-detail-art has-art" role="img" aria-label="${escapeHtml(card.name)} card art" style="--card-detail-art:url('${art}')"></div>`
    : `<div class="card-detail-art no-art" role="img" aria-label="${escapeHtml(card.name)} card art"><b>${escapeHtml(card.name)}</b><small>${escapeHtml(card.cardNumber)}</small></div>`;
  // Name first, number after it, the way the in-game modal titles the same
  // card: the name is what you clicked on, the number tells two printings
  // apart.
  const heading = `<h2 class="card-detail-heading">${escapeHtml(card.name)} · ${escapeHtml(card.cardNumber)}</h2>`;
  return `<div class="card-detail-backdrop" data-close-card-detail><aside class="card-detail-dialog" role="dialog" aria-modal="true" aria-label="Card details"><button class="card-detail-close" data-close-card-detail title="Close">${icon("x", "Close")}</button>${heading}${renderCardOverview(state.cardDetailCard, artColumn, powerDetails ? { powerDetails } : {})}</aside></div>`;
}

export function bindCardDetailDialog(
  state: CardDetailState,
  rerender: () => void,
): void {
  document
    .querySelectorAll<HTMLElement>("[data-inspect-card]")
    .forEach((card) => {
      card.addEventListener("click", () => {
        state.cardDetailCard = card.dataset.inspectCard!;
        state.cardDetailInstance = card.dataset.inspectInstance ?? null;
        rerender();
      });
    });
  document
    .querySelectorAll<HTMLElement>("[data-close-card-detail]")
    .forEach((element) => {
      element.addEventListener("click", (event) => {
        // A click on the backdrop closes; a click that bubbled up from the
        // dialog itself must not.
        if (
          element.classList.contains("card-detail-backdrop") &&
          event.target !== element
        )
          return;
        state.cardDetailCard = null;
        state.cardDetailInstance = null;
        rerender();
      });
    });
}

export function renderImportDialog(state: ImportDialogState): string {
  if (!state.importDialogOpen) return "";
  const placeholder =
    state.importTarget === "sealed"
      ? `1x ${SEALED_LEADER}&#10;3x ${DEFAULT_SEALED_EXPANSION}-002&#10;1x ${DEFAULT_SEALED_EXPANSION}-003`
      : "1x ST21-001&#10;4x ST31-001";
  return `<div class="card-detail-backdrop" data-close-import><aside class="card-detail-dialog import-dialog" role="dialog" aria-modal="true" aria-label="Import a deck list"><button class="card-detail-close" data-close-import title="Close">${icon("x", "Close")}</button><h2>Import a deck list</h2><label>Paste a deck list<textarea id="deck-list-input" rows="12" placeholder="${placeholder}">${escapeHtml(state.importDraft)}</textarea></label>${state.importMessage ? `<p class="editor-message">${escapeHtml(state.importMessage)}</p>` : ""}<button class="primary wide" id="import-list">${icon("file-up", "Import deck list")}Import</button></aside></div>`;
}

/**
 * Shared by the constructed deck editor and the sealed lobby's "Import a
 * deck" flow. `onImported` may throw (for example a sealed list whose Leader
 * isn't `SEALED_LEADER`, or a deck that fails `validateSealedDeck`) -- that
 * throw is caught here and shown in the dialog without closing it, same as a
 * `parseDeckList` parse error.
 */
export function bindImportDialog(
  state: ImportDialogState,
  hostRerender: () => void,
  onImported: (parsed: EditableDeck) => void,
): void {
  document
    .querySelectorAll<HTMLElement>("[data-close-import]")
    .forEach((element) => {
      element.addEventListener("click", (event) => {
        if (
          element.classList.contains("card-detail-backdrop") &&
          event.target !== element
        )
          return;
        state.importDialogOpen = false;
        hostRerender();
      });
    });
  document
    .querySelector("#deck-list-input")
    ?.addEventListener("input", (event) => {
      state.importDraft = (event.currentTarget as HTMLTextAreaElement).value;
    });
  document.querySelector("#import-list")?.addEventListener("click", () => {
    try {
      const parsed = parseDeckList(state.importDraft);
      onImported(parsed);
      state.importDialogOpen = false;
      state.importMessage = "";
    } catch (error) {
      state.importMessage =
        error instanceof Error ? error.message : String(error);
      hostRerender();
    }
  });
}

/* ---------------------------------------------------------------------------
   The lobby-style `.app-dialog-backdrop` modals

   Shared by every screen that stacks a few of these on one page (the 1v1
   lobby's deck pickers and matchup settings, the sealed booster picker). They are
   plain hidden elements rather than `<dialog>`, so opening and closing is
   this pair of helpers.
   ------------------------------------------------------------------------ */

/** Show or hide one dialog, and give focus to whatever it opens on. */
export function toggleAppDialog(id: string, open: boolean): void {
  const dialog = document.querySelector<HTMLElement>(`#${id}`);
  if (!dialog) return;
  dialog.hidden = !open;
  if (open) {
    // `preventScroll`, because a dialog is a fixed overlay: it is already fully
    // in view, so scrolling the page behind it to "reveal" a control that never
    // left the screen is pure side effect -- and a visible one, since the lobby
    // is its own scroll container and comes back scrolled somewhere else.
    dialog
      .querySelector<HTMLElement>("button, select, input")
      ?.focus({ preventScroll: true });
    return;
  }
  releaseFocus(dialog);
}

/**
 * Take focus out of a dialog that is closing.
 *
 * Leaving it on a control inside a hidden element is wrong twice. For a reader
 * it is focus on something that is not there -- the next Tab starts from
 * nowhere, and a screen reader is left describing a hidden control. And for the
 * page behind it, the browser keeps trying to hold that focused element in
 * view: on a screen short enough for the lobby to scroll, the scroller bounced
 * between two positions on every frame, forever. A Playwright click reported
 * that as an element that never stops moving, which is exactly what it was.
 */
function releaseFocus(dialog: HTMLElement): void {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && dialog.contains(focused))
    focused.blur();
}

/**
 * A click on a dialog's own Close button, or on the backdrop around it.
 *
 * Named and delegated to `document` for two reasons: a host screen is
 * re-rendered and rebound often, and `addEventListener` de-duplicates
 * identical listeners, so this cannot stack up one copy per visit. Delegation
 * also means a dialog that did not exist at bind time -- the lobby's opponent
 * picker, re-rendered whenever its pilot changes -- closes anyway.
 */
function closeAppDialogsOnClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const closer = target.closest<HTMLElement>("[data-close-dialog]");
  if (closer) {
    toggleAppDialog(closer.dataset.closeDialog ?? "", false);
    return;
  }
  // Only the backdrop itself, never a click that landed on the dialog it
  // frames.
  if (target.classList.contains("app-dialog-backdrop")) {
    target.hidden = true;
    releaseFocus(target);
  }
}

/** Escape closes whatever is open. Named for the same de-duplication reason. */
function closeAppDialogsOnEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  document
    .querySelectorAll<HTMLElement>(".app-dialog-backdrop:not([hidden])")
    .forEach((dialog) => {
      dialog.hidden = true;
    });
}

/** Wire the three ways every one of these dialogs closes: its own button, the
    backdrop around it, and Escape. Safe to call on every re-render. */
export function bindAppDialogDismissal(): void {
  document.addEventListener("click", closeAppDialogsOnClick);
  document.addEventListener("keydown", closeAppDialogsOnEscape);
}
