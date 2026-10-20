/**
 * The match history: what each side did, turn by turn, and -- when a model was
 * piloting -- the call that chose it.
 *
 * The list reads newest first, because the question the modal is opened with is
 * almost always "what just happened": the answer is the first line, with no
 * scrolling. Because it runs backwards, a decision's calls sit *below* the step
 * they produced -- the reasoning, then the move it led to, reading upwards.
 *
 * An entry's own fold still reads forwards. The steps inside it are one thing
 * happening, and that sequence reversed is not a sequence at all.
 *
 * A row is one *action*, not one event -- and a battle is one row for the three
 * actions it takes, because declaring an attack, answering it and resolving it
 * are one exchange. The engine reports a play
 * as everything it caused -- OP17-080 Usopp is a `card-played`, three
 * `card-revealed` and three `card-moved` -- and the panel used to draw all
 * seven as siblings, each with its own reset button, all seven of which reset
 * to the same two points. A reader scrolling for "what did they do on turn 6"
 * was reading the engine's event stream, not the turn. So the steps of one
 * action are one entry now: the step that names it in view, the rest a click
 * away, and one reset target -- the action's -- on the entry.
 *
 * An indent has one meaning: the row belongs to the other seat. Rows used to be
 * indented for a second reason -- sharing a card number with the entry before
 * them, which was meant to read as "this finished what that started". It was
 * not a structural relationship, it fired on 15% of entries across a dozen
 * unrelated shapes, and because the list runs backwards it indented a row under
 * something drawn *below* it. Two actions that really are one thing are one
 * entry with a fold; where they cannot be, the row's own text names the card it
 * came from, which is the thing the indent was gesturing at.
 *
 * The bands are the other half of it. A match is a sequence of turns and the
 * log said so only in passing, in an "ended the turn" line indistinguishable
 * from the line above it; now each turn is its own section with its own
 * heading, and the seat that acted colours the entry.
 *
 * Resetting is a control of its own, not the row. The whole row used to be the
 * button, with an icon that appeared on hover -- so the one thing a reader
 * could do here was invisible until the pointer was already on it, and every
 * attempt to select a line to read it was a reset. Each entry now carries a
 * standing "Reset" button, and it says in the confirm which entry it is
 * winding back to and how many entries that discards.
 *
 * Pure: state in, markup out, so the grouping can be tested without a match.
 */
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import {
  eventText,
  seat,
  type CardInstanceNames,
} from "@one-piece-sim/engine-core";
import {
  callSummary,
  hasNormalizedPayloads,
  type LlmCallSummary,
  type LlmDebugRecord,
} from "./battle-llm-debug.js";
import { escapeHtml } from "./card-text.js";
import { icon } from "./icons.js";

/**
 * One logged step, and the action it belongs to.
 *
 * `actionCount` is the number of actions applied once this step existed, which
 * is both what {@link Game.rewindTo} takes and the key a model call is joined
 * on. Setup steps belong to no action and carry 0.
 */
export interface HistoryStep {
  event: PublicEvent;
  actionCount: number;
}

export interface HistoryModel {
  steps: readonly HistoryStep[];
  /** Model calls of the match, joined onto steps by `actionCount`. */
  records: readonly LlmDebugRecord[];
  viewer: PlayerId;
  /** Instance ids to card numbers, so a step can name the cards it moved. */
  names?: CardInstanceNames;
  /**
   * What the button on an entry says it does: "Reset" while a match is being
   * played, since winding back discards what came after, and "Jump" while a
   * trace is being replayed, since the file still holds it.
   */
  rewindVerb?: string;
}

/** A stretch of the list under one heading: the opening, or one turn. */
export type HistoryBand =
  { kind: "setup" } | { kind: "turn"; number: number; player: PlayerId };

/** One action's worth of steps, as the list draws it. */
export interface HistoryEntry {
  band: HistoryBand;
  /** The reset target every step of this entry shares. */
  actionCount: number;
  /** 1-based, oldest first: what the list numbers its rows with. */
  ordinal: number;
  /** The step that names the entry, in view. */
  lead: PublicEvent;
  /** What that step went on to cause, folded under it, in order. */
  rest: readonly PublicEvent[];
  /** Who acted, where a step says so; the turn's player otherwise. */
  actor: PlayerId | null;
}

/**
 * Steps whose `playerId` is the player who *acted*.
 *
 * Most events name a player, but not the same player: `character-ko` and
 * `damage-taken` name whoever it happened *to*, and colouring an entry by that
 * would put a K.O. on the side that suffered it. Only the steps that report a
 * decision are read for the seat; everything else falls back to whoever owns
 * the turn.
 */
const ACTOR_STEPS = new Set<PublicEvent["type"]>([
  "mulligan-decided",
  "card-played",
  "stage-played",
  "event-activated",
  "ability-activated",
  "ability-triggered",
  "attack-declared",
  "attack-blocked",
  "counter-used",
  "don-attached",
  "don-activated",
  "don-returned",
  "cards-drawn",
  "turn-ended",
]);

/**
 * Steps that say why the rest of their action happened.
 *
 * The lead of an entry is the first of these it contains, rather than simply
 * its first step, so an ability that fires in the middle of an action still
 * titles the entry it caused. With none, the first step leads: an action whose
 * every step is a consequence -- the second half of a search, answered after
 * the player chose -- is titled by the first thing it did.
 */
const CAUSE_STEPS = new Set<PublicEvent["type"]>([
  "game-created",
  "game-ended",
  "mulligan-decided",
  "card-played",
  "stage-played",
  "event-activated",
  "ability-activated",
  "ability-triggered",
  "attack-declared",
  "attack-blocked",
  "counter-used",
  "turn-ended",
]);

/** The heading, and any warning the whole list carries. */
export function renderHistoryHeader(model: HistoryModel, id?: string): string {
  return `<h2${id ? ` id="${id}"` : ""}>Match history</h2>${
    hasNormalizedPayloads(model.records)
      ? `<p class="trace-payload-warning">This older trace contains normalized payloads. New exports retain the exact provider bodies.</p>`
      : ""
  }`;
}

/**
 * The steps of a match as the entries the list draws, oldest first.
 *
 * An entry is one applied action, with one span joined and two seams cut.
 *
 * The span is a battle. Declaring an attack, countering it and resolving it are
 * three actions, and drawn as three rows they read as three things that
 * happened -- with the defender's Counter, played on the attacker's turn, sat
 * between two of the attacker's rows as though it were a move of its own. They
 * are one exchange: the attack leads, and what it ran into is folded under it.
 * The reset target stays the declaration's, which is the point worth having --
 * wind back there and the Counter is offered again.
 *
 * A turn handover is the first seam: it is one action -- `pass` ends the turn
 * and then refreshes, draws and sets DON!! for the next one -- and those
 * opening steps belong under the new turn's heading, not folded inside "ended
 * the turn" in the old one. The end of the game is cut for the opposite reason:
 * it is the last thing anyone scrolls for, and as a fold inside the attack that
 * caused it nobody would find it.
 */
export function groupHistory(
  steps: readonly HistoryStep[],
): readonly HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  let events: PublicEvent[] = [];
  let band: HistoryBand = { kind: "setup" };
  let turn = 1;
  let open: { actionCount: number; band: HistoryBand } | null = null;
  let cut = false;
  // Set between an attack being declared and the battle resolving, so the
  // actions in between join the entry the declaration opened instead of
  // starting one each.
  let battle = false;

  const flush = () => {
    if (!open || events.length === 0) return;
    const lead =
      events.find((event) => CAUSE_STEPS.has(event.type)) ?? events[0]!;
    entries.push({
      band: open.band,
      actionCount: open.actionCount,
      ordinal: entries.length + 1,
      lead,
      rest: events.filter((event) => event !== lead),
      actor: entryActor(lead, open.band),
    });
    events = [];
  };

  for (const step of steps) {
    const event = step.event;
    if (
      !open ||
      cut ||
      (open.actionCount !== step.actionCount && !battle) ||
      event.type === "game-ended"
    ) {
      flush();
      open = { actionCount: step.actionCount, band };
      cut = false;
      battle = false;
    }
    events.push(event);
    if (event.type === "attack-declared") battle = true;
    if (event.type === "battle-resolved") battle = false;
    // The seat and the turn move *after* the step that announces them: the
    // handover is the last step of the turn it ends, not the first of the next.
    if (event.type === "setup-complete") {
      band = { kind: "turn", number: turn, player: event.activePlayer };
      cut = true;
    }
    if (event.type === "turn-ended") {
      turn += 1;
      band = { kind: "turn", number: turn, player: event.nextPlayerId };
      cut = true;
    }
  }
  flush();
  return entries;
}

/** Whose entry this is: what the lead step says, or whoever owns the turn. */
function entryActor(lead: PublicEvent, band: HistoryBand): PlayerId | null {
  if (ACTOR_STEPS.has(lead.type) && "playerId" in lead) return lead.playerId;
  return band.kind === "turn" ? band.player : null;
}

/**
 * The list itself: a section per band, newest first.
 *
 * Newest first because the question the modal is opened with is almost always
 * "what just happened" -- the answer is the first line, with no scrolling and
 * no hunt for the foot of a hundred-entry match. Within an entry the fold still
 * reads forwards: a search looks, then adds, then trashes, and that sequence
 * backwards is not a sequence at all.
 */
export function renderHistoryList(model: HistoryModel): string {
  const { steps, viewer, names, rewindVerb = "Reset" } = model;
  const attached = new Map<number, LlmDebugRecord[]>();
  const unattached: LlmDebugRecord[] = [];
  for (const record of model.records) {
    if (record.actionCount === undefined) {
      unattached.push(record);
      continue;
    }
    const bucket = attached.get(record.actionCount);
    if (bucket) bucket.push(record);
    else attached.set(record.actionCount, [record]);
  }

  const calls = new Map<number, string>();
  for (const [actionCount, records] of attached) {
    calls.set(actionCount, renderLlmCallsBlock(records));
  }

  const lastStepAction = steps.reduce(
    (highest, step) => Math.max(highest, step.actionCount),
    0,
  );
  const rows: string[] = [];
  const ordered = groupHistory(steps);
  const entries = [...ordered].reverse();
  // One reset per *action*, not per entry. The two seams split an action across
  // two entries -- a turn handover, and the end of the game -- and both halves
  // wind back to the same place, so only the entry that names the action
  // carries the button. The last action carries none either: winding back to
  // the newest point discards nothing.
  const lastOfAction = new Map<number, number>();
  ordered.forEach((entry, index) => lastOfAction.set(entry.actionCount, index));
  // A call with no step yet -- an error, or a decision whose action has not
  // been applied -- is the newest thing that happened, so it leads the list.
  for (const actionCount of [...calls.keys()]
    .filter((actionCount) => actionCount > lastStepAction)
    .sort((left, right) => right - left)) {
    rows.push(calls.get(actionCount)!);
  }

  let section: string[] = [];
  let band: HistoryBand | null = null;
  const closeSection = () => {
    if (band === null) return;
    rows.push(
      `<section class="history-band ${seatClass(bandSeat(band), viewer)}">${renderBandHead(band, viewer)}${section.join("")}</section>`,
    );
    section = [];
  };
  entries.forEach((entry, index) => {
    if (band === null || !sameBand(band, entry.band)) {
      closeSection();
      band = entry.band;
    }
    const discards = ordered.length - 1 - lastOfAction.get(entry.actionCount)!;
    // The list runs backwards, so the entry that *names* an action is the last
    // of that action in this order -- and it is the one that carries the reset.
    const leadsAction = entries[index + 1]?.actionCount !== entry.actionCount;
    section.push(
      renderHistoryEntry(
        entry,
        viewer,
        names,
        leadsAction && discards > 0 ? discards : null,
        rewindVerb,
      ),
    );
    // Because the list runs backwards, a decision's calls sit *below* the entry
    // they produced -- the reasoning, then the move it led to, reading upwards.
    // Flushed under the last entry of the action in this order, so a turn
    // handover's two rows do not each get a copy.
    if (entries[index + 1]?.actionCount !== entry.actionCount) {
      const block = calls.get(entry.actionCount);
      if (block) section.push(block);
    }
  });
  closeSection();

  if (unattached.length > 0) {
    rows.push(
      `<p class="history-calls-note">Model calls this trace could not tie to a step.</p>${renderLlmCallsBlock(unattached)}`,
    );
  }
  return `<div class="history-list">${rows.join("") || `<p class="muted">No events yet.</p>`}</div>`;
}

function sameBand(left: HistoryBand, right: HistoryBand): boolean {
  if (left.kind !== right.kind) return false;
  return (
    left.kind === "setup" ||
    (right.kind === "turn" &&
      left.number === right.number &&
      left.player === right.player)
  );
}

function bandSeat(band: HistoryBand): PlayerId | null {
  return band.kind === "turn" ? band.player : null;
}

/** Whose row this is, as the class that colours it. */
function seatClass(player: PlayerId | null, viewer: PlayerId): string {
  if (player === null) return "neutral";
  return player === viewer ? "mine" : "theirs";
}

/** "Turn 4 · Opponent" -- the heading a band is scrolled past by. */
function renderBandHead(band: HistoryBand, viewer: PlayerId): string {
  if (band.kind === "setup")
    return `<h3 class="history-band-head"><b>Setup</b></h3>`;
  return `<h3 class="history-band-head"><b>Turn ${band.number}</b><span>${escapeHtml(seat(band.player, viewer))}</span></h3>`;
}

/**
 * One entry: the step that names it, the rest of its action behind a fold, and
 * -- where it leads an action that has something after it -- the control that
 * winds the match back to it.
 *
 * The line itself is text, not a control. It is the thing a reader came to
 * read, and the reset is one button beside it -- standing, labelled, and
 * carrying what the confirm needs to name the point it is about to take the
 * match back to and what that discards. `discards` is null where this entry
 * offers no reset of its own, and the count of entries the reset would throw
 * away otherwise.
 */
function renderHistoryEntry(
  entry: HistoryEntry,
  viewer: PlayerId,
  names: CardInstanceNames | undefined,
  discards: number | null,
  verb: string,
): string {
  const text = eventText(entry.lead, viewer, names);
  const detail =
    entry.rest.length === 0
      ? ""
      : `<details class="history-steps"><summary>${entry.rest.length} more step${entry.rest.length === 1 ? "" : "s"}</summary><ol>${entry.rest
          .map(
            (event) =>
              `<li>${escapeHtml(eventText(event, viewer, names))}</li>`,
          )
          .join("")}</ol></details>`;
  const reset =
    discards === null
      ? ""
      : `<button class="history-reset" type="button" data-history-action="${entry.actionCount}" data-history-discards="${discards}" data-history-label="${escapeHtml(text)}" title="${escapeHtml(verb)} the match to just after this" aria-label="${escapeHtml(verb)} the match to just after: ${escapeHtml(text)}">${icon("rotate-ccw", "")}<b>${escapeHtml(verb)}</b></button>`;
  return `<article class="history-group ${seatClass(entry.actor, viewer)}" data-history-group="${entry.actionCount}"><div class="history-entry"><span class="history-ordinal">${entry.ordinal}</span><p>${escapeHtml(text)}</p>${reset}</div>${detail}</article>`;
}

/** One action's calls: what the model chose, and why it says it did. */
function renderLlmCallsBlock(records: readonly LlmDebugRecord[]): string {
  const failed = records.some((record) => record.error);
  // Newest first, like the list around them: a retry sits above the call it
  // was a retry for, which is the direction everything else here is read in.
  const summaries = [...records]
    .reverse()
    .map((record) => renderCallSummary(callSummary(record)))
    .join("");
  if (!summaries) return "";
  return `<div class="history-calls${failed ? " failed" : ""}">${summaries}</div>`;
}

/**
 * One call: the move it chose in view, its plan and its reasons behind a fold.
 *
 * Folded because they are long and there is one call per step: a turn plan and
 * a reasoning summary between every pair of steps buried the log they were
 * meant to explain. What the model *did* stays visible, which is what a reader
 * scanning the history is matching against the board.
 *
 * The plan leads, because it is the frame the sentence beside it was written to
 * serve, and because reading two consecutive calls is how a turn that fell
 * apart shows itself: a plan that changed with nothing on the board to explain
 * the change. Labelled where the reasoning is not, since a bare list of steps
 * next to a bare sentence says nothing about which is which.
 */
function renderCallSummary(summary: LlmCallSummary): string {
  // The answer's own words are the reasoning; a provider summary appears only
  // when a run opted into one, or in a trace written while it was the only
  // reasoning there was. Neither is labelled when it is the only one present --
  // the fold is already titled -- and a call carrying both labels the summary
  // to tell them apart.
  const reasons = [
    ...(summary.plan
      ? [
          `<p class="history-call-plan-label"><b>Turn plan</b></p><ol class="history-call-plan">${summary.plan
            .map((step) => `<li>${escapeHtml(step)}</li>`)
            .join("")}</ol>`,
        ]
      : []),
    ...(summary.reasoning
      ? [
          `<p class="history-call-rationale">${escapeHtml(summary.reasoning)}</p>`,
        ]
      : []),
    ...(summary.reasoningSummary
      ? [
          `<p class="history-call-reasoning">${summary.reasoning ? "<b>Provider summary</b> " : ""}${escapeHtml(summary.reasoningSummary)}</p>`,
        ]
      : []),
  ].join("");
  // No "Model chose" label: the action ID is self-evidently the move, and the
  // row already sits inside a block titled by the call it belongs to.
  const label = summary.error
    ? `<b class="failed">Model call failed</b> ${escapeHtml(summary.error)}`
    : summary.actionId
      ? `<code>${escapeHtml(summary.actionId)}</code>`
      : "";
  return `<article class="history-call"><header>${label}<span>Turn ${summary.turn} · ${summary.player.toUpperCase()}</span></header>${
    reasons
      ? `<details class="history-call-reasons"><summary>${summary.plan ? "LLM plan and reasoning" : "LLM reasoning"}</summary>${reasons}</details>`
      : ""
  }</article>`;
}
