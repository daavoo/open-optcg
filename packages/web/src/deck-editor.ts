import { cardRegistry, type CardDefinition } from "@one-piece-sim/cards";
import {
  deckFormat,
  deckManifests,
  FORMAT_DECK_IDS,
  isEventRestricted,
  type DeckManifest,
  type EditableDeck,
  type FormatDeckId,
} from "@one-piece-sim/decks";

// Re-exported because the editor is where these are used from, and moving them
// should not move every caller. The rules themselves are the catalog's now --
// see `legality.ts` there for why they had to be.
export {
  copyLimit,
  validateDeck,
  type DeckValidation,
  type EditableDeck,
} from "@one-piece-sim/decks";

/**
 * The catalog a custom deck can be built from: every registry card except the
 * fixture identities, which exist only for tests.
 */
export const supportedCards = [...cardRegistry.values()]
  .filter((card) => !card.cardNumber.startsWith("FIX-"))
  .sort((left, right) => left.cardNumber.localeCompare(right.cardNumber));

export const supportedLeaders = supportedCards.filter(
  (card) => card.category === "leader" && !isEventRestricted(card),
);

export const supportedMainDeckCards = supportedCards.filter(
  (card) => card.category !== "leader",
);

export function cardsForLeader(leaderCardNumber: string): CardDefinition[] {
  const leader = supportedLeaders.find(
    (card) => card.cardNumber === leaderCardNumber,
  );
  if (!leader?.colors?.length) return [];
  return supportedMainDeckCards.filter((card) =>
    card.colors?.some((color) => leader.colors!.includes(color)),
  );
}

export function deckFromBase(deckId: FormatDeckId): EditableDeck {
  const manifest = deckManifests[deckId]!;
  return {
    leader: manifest.leader,
    cards: { ...manifest.cards },
    format: deckFormat(manifest),
  };
}

export function parseDeckList(value: string): EditableDeck {
  const parsed: EditableDeck = { leader: "", cards: {}, format: "standard" };
  for (const [index, rawLine] of value.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const match =
      line.match(/^(\d+)\s*x?\s+?([A-Z0-9]+-[A-Z0-9]+)(?:\s+.*)?$/i) ??
      line.match(/^(\d+)x([A-Z0-9]+-[A-Z0-9]+)(?:\s+.*)?$/i);
    if (!match)
      throw new Error(`Line ${index + 1} is not a quantity and card number.`);
    const quantity = Number(match[1]);
    const cardNumber = match[2]!.toUpperCase();
    const card = cardRegistry.get(cardNumber);
    if (card?.category === "leader") {
      if (quantity !== 1 || parsed.leader)
        throw new Error("A list must contain exactly one Leader.");
      parsed.leader = cardNumber;
    } else {
      parsed.cards[cardNumber] = (parsed.cards[cardNumber] ?? 0) + quantity;
    }
  }
  return parsed;
}

export function exportDeckList(deck: EditableDeck): string {
  const lines = [`1x ${deck.leader}`];
  for (const [cardNumber, quantity] of Object.entries(deck.cards).sort()) {
    lines.push(`${quantity}x ${cardNumber}`);
  }
  return `${lines.join("\n")}\n`;
}

export function toManifest(deck: EditableDeck, id: string): DeckManifest {
  return {
    id,
    leader: deck.leader,
    cards: { ...deck.cards },
    format: deck.format ?? "standard",
  };
}

/** One column of the cost curve. `cost` is the bucket's floor, so the last
    bucket's label is "7+" while its `cost` is 7. */
export interface CostBucket {
  cost: number;
  label: string;
  count: number;
}

/**
 * What a deck is made of, as the editor's overview panel states it.
 *
 * Answers the archetype question -- how fast, how defensive, how focused --
 * and stops there. Anything a builder would read card by card is the deck list
 * two columns to the right, so a figure earns a place here only by saying
 * something about the whole list that the list itself does not.
 *
 * Every figure is counted off `CardDefinition` and its derived `rules` -- the
 * printed text is not in the repo and must never be read at runtime, so a
 * question the records cannot answer is a field to derive in
 * `rules-derivation.ts`, not a regex here.
 */
export interface DeckAnalytics {
  /** Main-deck cards, Leader excluded. */
  total: number;
  curve: readonly CostBucket[];
  /** The tallest bucket, so a caller scales bars without re-deriving it. */
  peak: number;
  /** Mean printed cost across the main deck; 0 for an empty list. */
  averageCost: number;
  categories: { character: number; event: number; stage: number };
  /**
   * Printed Counter values, counted.
   *
   * There is deliberately no "no Counter" bucket: it is the total minus these
   * two, and a deck is not built toward its uncounterable cards.
   */
  counters: { plus1000: number; plus2000: number };
  /**
   * Every point of Counter power the deck holds: the printed Counter values on
   * its cards, plus the power its `[Counter]` Events grant when played.
   *
   * Both, because both are the same resource to a defender deciding whether an
   * attack gets through, and a figure that counted only the corner value would
   * under-report a deck whose defence is written in its Events. The two sources
   * cannot overlap -- no card in the pool prints both -- so they simply add.
   */
  counterPower: number;
  /**
   * Cards playable from hand during the opponent's Counter step.
   *
   * Every card in the pool printing this clause is an Event, which is why the
   * panel calls them Counter events rather than repeating the word "Counter"
   * beside the +1000 and +2000 that mean something else entirely.
   */
  counterEvents: number;
  /** Cards live in the Life deck, i.e. printing a `[Trigger]`. */
  triggers: number;
  blockers: number;
  /** The Leader's printed types, named so the synergy figures can be read. */
  leaderTypes: readonly string[];
  /** Cards sharing at least one printed type with the Leader. */
  sharedType: number;
  /**
   * Cards joined to the Leader by name rather than by type, in either
   * direction: the Leader's text names the card (or one of its types), or the
   * card's text names the Leader (or one of the Leader's types).
   *
   * Both directions, because an archetype is written from whichever end Bandai
   * chose -- OP16-001 Ace names [Monkey.D.Luffy] from the Leader, while
   * ST-31's Luffy is named by its own deck's Characters.
   */
  named: number;
  /**
   * Cards bearing each of the Leader's colours, in the Leader's printed order.
   * A two-coloured card counts under both, so these need not sum to the total.
   */
  colors: readonly { color: string; count: number }[];
}

/** The cost curve's last bucket: every card costing this or more shares it. */
const CURVE_CAP = 7;

/** The card names and types a card's printed text refers to, unbracketed. */
function referencedNames(card: CardDefinition): Set<string> {
  return new Set(
    card.rules.tokens.map((token) => token.replace(/^\[|\]$/g, "")),
  );
}

export function deckAnalytics(deck: EditableDeck): DeckAnalytics {
  const counts = Array.from({ length: CURVE_CAP + 1 }, () => 0);
  const leader = cardRegistry.get(deck.leader);
  const leaderTypes = leader?.types ?? [];
  const leaderColors = leader?.colors ?? [];
  const leaderRefers = leader ? referencedNames(leader) : new Set<string>();
  const colorCounts = new Map(leaderColors.map((color) => [color, 0]));
  const analytics: DeckAnalytics = {
    total: 0,
    curve: [],
    peak: 0,
    averageCost: 0,
    categories: { character: 0, event: 0, stage: 0 },
    counters: { plus1000: 0, plus2000: 0 },
    counterPower: 0,
    counterEvents: 0,
    triggers: 0,
    blockers: 0,
    leaderTypes,
    sharedType: 0,
    named: 0,
    colors: [],
  };
  let costTotal = 0;
  for (const [cardNumber, quantity] of Object.entries(deck.cards)) {
    const card = cardRegistry.get(cardNumber);
    if (!card || quantity <= 0) continue;
    analytics.total += quantity;
    const cost = card.cost ?? 0;
    costTotal += cost * quantity;
    counts[Math.min(cost, CURVE_CAP)]! += quantity;
    if (card.category === "character")
      analytics.categories.character += quantity;
    else if (card.category === "event") analytics.categories.event += quantity;
    else if (card.category === "stage") analytics.categories.stage += quantity;
    // Ordered by threshold rather than by equality so a larger value a future
    // set prints lands with the big Counters instead of being dropped.
    const counter = card.counter ?? 0;
    if (counter >= 2000) analytics.counters.plus2000 += quantity;
    else if (counter >= 1000) analytics.counters.plus1000 += quantity;
    analytics.counterPower += counter * quantity;
    if (card.rules.hasCounterEvent) {
      analytics.counterEvents += quantity;
      // A Counter Event that K.O.s or negates instead of granting power prints
      // no figure here, and correctly adds nothing to the total.
      analytics.counterPower +=
        (card.rules.clauseSummaries["[Counter]"]?.power ?? 0) * quantity;
    }
    if (card.rules.hasTrigger) analytics.triggers += quantity;
    if (card.rules.keywords.includes("Blocker")) analytics.blockers += quantity;
    if (card.types.some((type) => leaderTypes.includes(type)))
      analytics.sharedType += quantity;
    const cardRefers = referencedNames(card);
    const namedByLeader =
      leaderRefers.has(card.name) ||
      card.types.some((type) => leaderRefers.has(type));
    const namesLeader =
      leader !== undefined &&
      (cardRefers.has(leader.name) ||
        leaderTypes.some((type) => cardRefers.has(type)));
    if (namedByLeader || namesLeader) analytics.named += quantity;
    for (const color of card.colors ?? []) {
      if (colorCounts.has(color))
        colorCounts.set(color, colorCounts.get(color)! + quantity);
    }
  }
  analytics.curve = counts.map((count, cost) => ({
    cost,
    label: cost === CURVE_CAP ? `${cost}+` : `${cost}`,
    count,
  }));
  analytics.peak = Math.max(...counts);
  analytics.averageCost = analytics.total ? costTotal / analytics.total : 0;
  analytics.colors = [...colorCounts].map(([color, count]) => ({
    color,
    count,
  }));
  return analytics;
}

export { FORMAT_DECK_IDS };
