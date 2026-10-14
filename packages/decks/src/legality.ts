/**
 * Whether a deck may be played, and why not.
 *
 * These rules used to live in the web deck editor, which was the only place a
 * deck was built. An online match has a second place: a client submits a deck
 * it built and the server must decide, and a server that trusted the editor's
 * verdict would be trusting the client. Two implementations of "is this deck
 * legal" is the worst of the options -- they would drift, and the one that
 * mattered would be the one nobody was reading -- so there is one, here, above
 * the rules engine and below both callers.
 *
 * Nothing in this file touches the DOM or the engine. It reads printed card
 * data and says what is wrong in sentences a player can act on.
 */
import {
  cardFormatLegality,
  cardRegistry,
  type CardDefinition,
  type DeckFormat,
} from "@one-piece-sim/cards";

export interface EditableDeck {
  leader: string;
  cards: Record<string, number>;
  /**
   * The constructed format this deck is being built for, defaulting to
   * Standard the same way {@link DeckManifest.format} does.
   *
   * Optional so that an imported list, or a deck saved before the editor knew
   * about formats, keeps working -- it is then read as Standard, which is the
   * format that can actually fail.
   */
  format?: DeckFormat;
}

export interface DeckValidation {
  cardCount: number;
  format: DeckFormat;
  errors: readonly string[];
}

const BANNED_CARDS = new Set([
  "OP06-047",
  "OP03-040",
  "OP06-086",
  "ST10-001",
  "OP06-116",
]);
const BANNED_PAIRS: readonly (readonly [string, string])[] = [
  ["OP07-115", "EB04-058"],
  ["OP11-040", "OP11-067"],
  ["OP11-040", "OP08-069"],
];

/**
 * A Leader whose own text restricts it to specific events.
 *
 * The Sealed Battle promo Leader prints "This Leader can only be used in
 * designated events according to the rules", which is a deck-construction rule
 * the engine has no way to dispatch -- so it is enforced here, at the only place
 * a constructed deck is built. Derived from the printed text once, at audit
 * time, so a second event-restricted promo is excluded automatically and the
 * text itself never has to ship.
 */
export const isEventRestricted = (card: CardDefinition): boolean =>
  card.rules.eventRestricted;

export function copyLimit(card: CardDefinition): number {
  return card.rules.copyLimit;
}

export function validateDeck(deck: EditableDeck): DeckValidation {
  const errors: string[] = [];
  const format = deck.format ?? "standard";
  const leader = cardRegistry.get(deck.leader);
  if (!leader || leader.category !== "leader") {
    errors.push("Choose one supported Leader card.");
  } else if (isEventRestricted(leader)) {
    errors.push(
      `${leader.cardNumber} may only be used in designated events, not in constructed decks.`,
    );
  } else {
    const leaderLegality = cardFormatLegality(leader.cardNumber, format);
    if (!leaderLegality.legal) {
      errors.push(
        `${leader.cardNumber} is not legal in Standard: ${leaderLegality.reason}. Build this deck for Extra Regulation, or choose another Leader.`,
      );
    }
  }

  let cardCount = 0;
  for (const [cardNumber, quantity] of Object.entries(deck.cards)) {
    cardCount += quantity;
    if (BANNED_CARDS.has(cardNumber)) {
      errors.push(`${cardNumber} is currently banned from official decks.`);
    }
    const card = cardRegistry.get(cardNumber);
    if (!card || card.category === "leader") {
      errors.push(`${cardNumber} is not a supported main-deck card.`);
      continue;
    }
    // Rotation, unlike a ban, is a property of the printing rather than of the
    // identity, so the verdict comes from the block icons rather than a list
    // kept here. An Extra Regulation deck never fails this.
    const legality = cardFormatLegality(cardNumber, format);
    if (!legality.legal) {
      errors.push(
        `${cardNumber} is not legal in Standard: ${legality.reason}. Build this deck for Extra Regulation, or replace it.`,
      );
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      errors.push(`${cardNumber} must have a positive whole-number quantity.`);
    } else if (quantity > copyLimit(card)) {
      errors.push(`${cardNumber} allows at most ${copyLimit(card)} copies.`);
    }
    if (
      leader?.colors?.length &&
      card.colors?.length &&
      !card.colors.some((color) => leader.colors!.includes(color))
    ) {
      errors.push(
        `${cardNumber} (${card.colors.join("/")}) does not match the Leader's ${leader.colors.join("/")} colors.`,
      );
    }
    // A Leader whose own text narrows the whole deck to one type -- P-117 Nami
    // and its {East Blue} deck. Enforced here for the same reason
    // `isEventRestricted` is: it is a deck-construction rule, so the engine has
    // no window to dispatch it in, and this is the only place a constructed
    // deck is built. Derived from the printed text once, at audit time, so a
    // second such Leader is covered without another edit.
    const requiredType = leader?.rules.deckTypeRestriction ?? "";
    if (requiredType && !card.types.includes(requiredType)) {
      errors.push(
        `${cardNumber} is not a {${requiredType}} type card, which ${leader!.cardNumber} restricts the deck to.`,
      );
    }
    // OP13-079 Imu bars Events from a printed cost upwards. The same kind of
    // rule as `deckTypeRestriction`, derived and enforced the same way.
    const eventCostLimit = leader?.rules.deckEventCostLimit ?? null;
    if (
      eventCostLimit !== null &&
      card.category === "event" &&
      (card.cost ?? 0) >= eventCostLimit
    ) {
      errors.push(
        `${cardNumber} is an Event with a cost of ${card.cost}, and ${leader!.cardNumber} bars Events with a cost of ${eventCostLimit} or more.`,
      );
    }
    // OP12-001 Silvers Rayleigh bars every card from a printed cost upwards.
    const costLimit = leader?.rules.deckCostLimit ?? null;
    if (costLimit !== null && (card.cost ?? 0) >= costLimit) {
      errors.push(
        `${cardNumber} has a cost of ${card.cost}, and ${leader!.cardNumber} bars cards with a cost of ${costLimit} or more.`,
      );
    }
  }
  for (const [first, second] of BANNED_PAIRS) {
    if (deck.cards[first] && deck.cards[second]) {
      errors.push(
        `${first} and ${second} cannot be included in the same deck.`,
      );
    }
  }
  if (cardCount !== 50)
    errors.unshift(
      `The deck must contain exactly 50 cards (currently ${cardCount}).`,
    );
  return { cardCount, format, errors };
}
