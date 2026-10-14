/**
 * Printed card text as a runtime asset.
 *
 * The text a card prints is Bandai's copyright, so the repository commits only
 * what the rules derive from it (`CardRules`) and the published app ships no
 * text at all. Whoever holds the text -- a test run with the reference cache
 * on disk, the browser after the player loads an asset pack, a tool that just
 * fetched Bandai's card list -- registers it here, and every reader asks this
 * module rather than the card record.
 *
 * A hand-authored record may still carry its own `effect`/`trigger` while the
 * migration off committed text is in progress; a loaded pack takes precedence
 * over that so the player sees one source of text, not two.
 */
export interface PrintedText {
  effect: string;
  trigger: string;
}

/** The shape of the text cache on disk, and of the text half of an asset pack. */
export interface PrintedTextPack {
  version: 1;
  /** Where the text was read from, for the reader's information only. */
  source?: string;
  cards: Readonly<Record<string, PrintedText & { name?: string }>>;
}

/** Parses a pack from JSON text, rejecting anything that is not one. */
export function parsePrintedTextPack(json: string): PrintedTextPack {
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== 1 ||
    typeof (parsed as { cards?: unknown }).cards !== "object" ||
    (parsed as { cards?: unknown }).cards === null
  ) {
    throw new Error("PRINTED_TEXT_PACK_INVALID");
  }
  return parsed as PrintedTextPack;
}

const loaded = new Map<string, PrintedText>();
const listeners = new Set<() => void>();

/** Registers text for many cards at once; later loads override earlier ones. */
export function loadPrintedText(
  entries:
    | Readonly<Record<string, Partial<PrintedText> & { name?: string }>>
    | Iterable<readonly [string, PrintedText]>,
): number {
  const pairs: Iterable<readonly [string, Partial<PrintedText>]> =
    Symbol.iterator in entries ? entries : Object.entries(entries);
  let count = 0;
  for (const [cardNumber, text] of pairs) {
    loaded.set(cardNumber, {
      effect: text.effect ?? "",
      trigger: text.trigger ?? "",
    });
    count += 1;
  }
  for (const listener of listeners) listener();
  return count;
}

/** The text a load registered for `cardNumber`, if any. */
export function loadedPrintedText(cardNumber: string): PrintedText | undefined {
  return loaded.get(cardNumber);
}

/** How many cards have text registered. */
export function loadedPrintedTextCount(): number {
  return loaded.size;
}

/**
 * Every text this process holds, in the shape {@link loadPrintedText} takes.
 *
 * For handing the text across a process boundary: the browser loads a pack on
 * the main thread, and the worker that builds an LLM seat's prompt is a
 * separate realm with its own empty copy of this module. Without this the two
 * disagree -- the engine's `cardFacts` carry text and the seat's own deck list
 * does not.
 */
export function loadedPrintedTextPack(): Record<string, PrintedText> {
  return Object.fromEntries(loaded);
}

/** Forgets every loaded text; for tests and for unloading a pack. */
export function clearPrintedText(): void {
  loaded.clear();
  for (const listener of listeners) listener();
}

/** Called after every load or clear, so a UI can re-render its text. */
export function onPrintedTextChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
