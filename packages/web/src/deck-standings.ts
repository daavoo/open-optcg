/**
 * How the published learned model does with each shipped deck, as the deck
 * picker orders its Community shelf by.
 *
 * The figures are a release asset beside the model pack, `deck-standings.json`
 * (`ml/sys1/deck_standings.py`: the checkpoint piloting both seats of every
 * pairing of the selectable decks). `pnpm model:fetch` downloads it with the
 * pack and `pnpm web:build` inlines it as `__DECK_STANDINGS__`, so the shelf
 * order moves with each model release and not with a commit. It is inlined
 * even under `--external-model`: it is a few KB, and the picker needs it the
 * moment it draws, before the lazily fetched pack could arrive.
 */

export interface DeckStanding {
  /** Share of its decided games the deck won, 0 to 1. */
  winRate: number;
  /** How many decided games that rate is over. */
  games: number;
}

export interface DeckStandings {
  /** The release or run the figures were measured with. */
  model: string;
  decks: Readonly<Record<string, DeckStanding>>;
}

declare const __DECK_STANDINGS__: DeckStandings | null;

/** The standings this build carries, or null for a build without them (and
    under Vitest, where nothing defines the constant). */
export function builtInDeckStandings(): DeckStandings | null {
  return typeof __DECK_STANDINGS__ !== "undefined" ? __DECK_STANDINGS__ : null;
}

/**
 * Read a `deck-standings.json`, keeping only well-formed entries: a deck whose
 * rate is not a number in [0, 1], or that has no games behind it, is dropped
 * rather than sorted on, so a bad row can only leave a deck unranked. Throws
 * when the file is not the shape at all, which the build reports.
 */
export function parseDeckStandings(text: string): DeckStandings {
  const raw = JSON.parse(text) as unknown;
  if (
    !raw ||
    typeof raw !== "object" ||
    !("decks" in raw) ||
    !raw.decks ||
    typeof raw.decks !== "object"
  ) {
    throw new Error("deck-standings.json has no `decks` object");
  }
  const decks: Record<string, DeckStanding> = {};
  for (const [deckId, entry] of Object.entries(
    raw.decks as Record<string, unknown>,
  )) {
    if (!entry || typeof entry !== "object") continue;
    const { winRate, games } = entry as Partial<DeckStanding>;
    if (
      typeof winRate !== "number" ||
      !Number.isFinite(winRate) ||
      winRate < 0 ||
      winRate > 1 ||
      typeof games !== "number" ||
      !(games > 0)
    ) {
      continue;
    }
    decks[deckId] = { winRate, games };
  }
  const model =
    "model" in raw && typeof raw.model === "string" ? raw.model : "?";
  return { model, decks };
}

/**
 * `deckIds` with the decks the standings rank first, best win rate first, and
 * the rest after them in the order they came in. Ties keep their incoming
 * order too, so no file, or a file that ranks none of them, changes nothing.
 */
export function orderByWinRate(
  deckIds: readonly string[],
  standings: DeckStandings | null,
): string[] {
  if (!standings) return [...deckIds];
  const rate = (deckId: string): number | undefined =>
    Object.hasOwn(standings.decks, deckId)
      ? standings.decks[deckId]!.winRate
      : undefined;
  const ranked = deckIds.filter((deckId) => rate(deckId) !== undefined);
  const unranked = deckIds.filter((deckId) => rate(deckId) === undefined);
  // `sort` is stable, so equal rates stay in their incoming order.
  ranked.sort((left, right) => rate(right)! - rate(left)!);
  return [...ranked, ...unranked];
}
