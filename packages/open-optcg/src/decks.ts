/**
 * Deck lists: the ones this project ships, and the plain-text format every deck
 * builder exports. `resolveDeck` turns either into what `createGame` takes.
 */
export {
  deckDisplayName,
  deckManifests,
  exportDeckList,
  parseDeckList,
  resolveDeck,
  STARTER_DECK_IDS,
  validateDeck,
  type DeckManifest,
  type EditableDeck,
} from "@one-piece-sim/decks";
