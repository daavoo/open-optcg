import type { CardFacts, CardRules } from "@one-piece-sim/protocol";
import {
  clausePartsOf,
  clauseTextOf,
  deriveRules,
  type ClauseId,
  type ClauseMarker,
  type ClauseParts,
} from "./rules-derivation.js";
import {
  loadedPrintedText,
  onPrintedTextChange,
  type PrintedText,
} from "./text.js";
import { formatCardRecords } from "./generated.js";
import { communityCardRecords } from "./generated-community.js";
import { op05Cards } from "./op05.js";
import { op06Cards } from "./op06.js";
import { op07Cards } from "./op07.js";
import { op08Cards } from "./op08.js";
import { op09Cards } from "./op09.js";
import { op10Cards } from "./op10.js";
import { op11Cards } from "./op11.js";
import { op12Cards } from "./op12.js";
import { op13Cards } from "./op13.js";
import { op14Cards } from "./op14.js";
import { op15Cards } from "./op15.js";
import { op16Cards } from "./op16.js";
import { op17Cards } from "./op17.js";
import { eb04Cards } from "./eb04.js";
import { eb03Cards } from "./eb03.js";
import { eb02Cards } from "./eb02.js";
import { eb01Cards } from "./eb01.js";
import { prb02Cards } from "./prb02.js";
import { st10Cards } from "./st10.js";
import { st14Cards } from "./st14.js";
import { st29Cards } from "./st29.js";
import { st30Cards } from "./st30.js";
import { st21Cards } from "./st21.js";
import { st22Cards } from "./st22.js";
import { st16Cards } from "./st16.js";
import { st24Cards } from "./st24.js";
import { st25Cards } from "./st25.js";
import { st27Cards } from "./st27.js";
import { pCards } from "./p.js";
import { st11Cards } from "./st11.js";
import { st12Cards } from "./st12.js";
import { st13Cards } from "./st13.js";
import { st15Cards } from "./st15.js";
import { st17Cards } from "./st17.js";
import { st19Cards } from "./st19.js";
import { st20Cards } from "./st20.js";
import { sealedPromoCards } from "./sealed-promo.js";

export {
  UNIMPLEMENTED_CLAUSES,
  unimplementedClauses,
  type UnimplementedClause,
} from "./unimplemented-clauses.js";

export { OP17_RARITY, OP17_INFERRED_RARITY } from "./op17-rarity.js";

export {
  CLAUSE_MARKERS,
  clauseTextOf,
  deriveRules,
  printedClausesOf,
  type ClauseId,
  type ClauseMarker,
  type ClauseParts,
  type RulesSource,
} from "./rules-derivation.js";
export {
  clearPrintedText,
  loadPrintedText,
  loadedPrintedText,
  loadedPrintedTextCount,
  loadedPrintedTextPack,
  onPrintedTextChange,
  parsePrintedTextPack,
  type PrintedText,
  type PrintedTextPack,
} from "./text.js";

/**
 * The whole per-identity block map, not just {@link cardBlockIcons}'s lookup.
 *
 * `tools/audit-cards/src/rotation-check.ts` diffs it wholesale against a fresh
 * reading of Bandai's pages, which a per-card accessor cannot express.
 */
export { cardBlockPrintings } from "./generated-blocks.js";

export {
  blockPrintingSnapshot,
  blockIconLegality,
  cardBlockIcons,
  cardFormatLegality,
  isStandardLegal,
  DECK_FORMATS,
  DEFAULT_FORMAT_REGION,
  STANDARD_FLOORS,
  UNSTAMPED_BLOCK_PRINTINGS,
  type BlockIcon,
  type DeckFormat,
  type FormatLegality,
  type FormatRegion,
  type StandardFloor,
} from "./block-icons.js";

/**
 * Print rarity, as it appears on the card.
 *
 * Only sealed cares: a booster pack is defined by its rarity slots. `L` is a
 * Leader's own rarity rather than a tier above `SEC`, so nothing should order
 * these as if they ranked.
 */
export type CardRarity = "C" | "UC" | "R" | "SR" | "SEC" | "L" | "P";

export interface CardDefinition {
  cardNumber: string;
  name: string;
  category: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
  colors?: readonly string[];
  types: readonly string[];
  attribute: string | null;
  /**
   * The printed text, where the record still carries it.
   *
   * Generated records do not: the text is Bandai's copyright and the audit
   * commits only what {@link CardRules} derives from it, keeping the words in
   * a gitignored cache. Hand-authored records carry theirs until they move to
   * the same pipeline. Nothing that decides legality reads these fields --
   * read `rules`, and read text through `printedText()` for display.
   */
  effect?: string;
  trigger?: string;
  /** Everything the rules read off the printed text. See `deriveRules`. */
  rules: CardRules;
  /** sha256 of the printed `{effect, trigger}`, so a record can prove which text it was derived from without holding it. */
  officialTextHash?: string;
  sourceMatch?: boolean;
  /** Printed rarity, where a source records it. OP14-OP17 carry it. */
  rarity?: CardRarity;
}

/**
 * A card as a source file declares it: `rules` may be absent when the record
 * carries its printed text, and is derived on the way into the registry.
 */
export type CardRecord = Omit<CardDefinition, "rules"> &
  Partial<Pick<CardDefinition, "rules">>;

export interface PlayableCardDefinition extends CardDefinition {
  cost: number;
  power: number;
}

/**
 * A record with its rules resolved: committed with the record, or derived
 * from the text the record still carries. A record with neither is a data
 * error, and saying so at load beats every consumer discovering it.
 */
export function resolveCardRecord(card: CardRecord): CardDefinition {
  if (card.rules) return card as CardDefinition;
  if (card.effect === undefined || card.trigger === undefined) {
    throw new Error(
      `CARD_WITHOUT_RULES_OR_TEXT: ${card.cardNumber} carries neither derived rules nor printed text`,
    );
  }
  return {
    ...card,
    rules: deriveRules({
      name: card.name,
      category: card.category,
      effect: card.effect,
      trigger: card.trigger,
    }),
  };
}

const fixtureCards: CardRecord[] = [
  {
    cardNumber: "FIX-LEADER-R",
    name: "Fixture Red Leader",
    category: "leader",
    cost: 5,
    power: 5000,
    counter: null,
    types: ["Fixture"],
    attribute: "Strike",
    effect: "",
    trigger: "",
  },
  {
    cardNumber: "FIX-LEADER-B",
    name: "Fixture Blue Leader",
    category: "leader",
    cost: 5,
    power: 5000,
    counter: null,
    types: ["Fixture"],
    attribute: "Strike",
    effect: "",
    trigger: "",
  },
  /**
   * Leaders and Stages carrying the identities EB-03's gates name and the
   * shipped pool has none of.
   *
   * Six of the extra booster's clauses open on a Leader's printed *name* or on
   * a Stage by name, and Bandai has printed neither in any product this pool
   * imports: a Leader called [Uta] (EB03-003), [Kouzuki Oden] (EB03-016),
   * [Perona] (EB03-049) or [Vegapunk] (EB03-058), the Stage [Zou] (EB03-013)
   * or the Stage [Onigashima Island] (EB03-044). Without these records the
   * positive branch of each is unreachable and only the closed gate could be
   * tested, which is half a test.
   *
   * A name is a single field, so a Leader fixture cannot stand in for four
   * names the way EB-04's one type-carrying record stood in for its six type
   * gates -- hence one per name. Every test that uses one is paired with a case
   * behind a Leader that carries a different name, so a passing gate is never
   * mistaken for a gate that is not read at all; see `test/eb03.test.ts`.
   */
  {
    cardNumber: "FIX-LEADER-UTA",
    name: "Uta",
    category: "leader",
    cost: 5,
    power: 5000,
    counter: null,
    types: ["Fixture", "FILM"],
    attribute: "Special",
    effect: "",
    trigger: "",
  },
  {
    cardNumber: "FIX-LEADER-ODEN",
    name: "Kouzuki Oden",
    category: "leader",
    cost: 5,
    power: 5000,
    counter: null,
    types: ["Fixture", "Land of Wano"],
    attribute: "Slash",
    effect: "",
    trigger: "",
  },
  {
    cardNumber: "FIX-LEADER-PERONA",
    name: "Perona",
    category: "leader",
    cost: 5,
    power: 5000,
    counter: null,
    types: ["Fixture", "Thriller Bark Pirates"],
    attribute: "Special",
    effect: "",
    trigger: "",
  },
  {
    cardNumber: "FIX-LEADER-VEGAPUNK",
    name: "Vegapunk",
    category: "leader",
    cost: 5,
    power: 5000,
    counter: null,
    types: ["Fixture", "Egghead"],
    attribute: "Wisdom",
    effect: "",
    trigger: "",
  },
  {
    cardNumber: "FIX-STAGE-ZOU",
    name: "Zou",
    category: "stage",
    cost: 1,
    power: null,
    counter: null,
    types: ["Fixture", "Minks"],
    attribute: null,
    effect: "",
    trigger: "",
  },
  {
    cardNumber: "FIX-STAGE-ONIGASHIMA",
    name: "Onigashima Island",
    category: "stage",
    cost: 1,
    power: null,
    counter: null,
    types: ["Fixture", "Animal Kingdom Pirates"],
    attribute: null,
    effect: "",
    trigger: "",
  },
  {
    /**
     * A Leader that carries the identities EB-04's Leader gates name and the
     * shipped pool has none of.
     *
     * Six of the extra booster's clauses open on a Leader's type or name --
     * {Minks} (EB04-013, EB04-017, EB04-019), {Foxy Pirates} (EB04-036,
     * EB04-037), a "CP" substring (EB04-048) and [Nefeltari Vivi] (EB04-021) --
     * and Bandai has printed a Leader for none of them. Without this record the
     * positive branch of each is unreachable and only the closed gate could be
     * tested, which is half a test.
     *
     * One record rather than six because the alternative is six near-identical
     * ones. Carrying several identities at once cannot prove a clause *needs*
     * the one it names, so every test that uses this is paired with a case
     * behind a real Leader that lacks it -- see `test/eb04.test.ts`.
     */
    cardNumber: "FIX-LEADER-EB04",
    name: "Nefeltari Vivi",
    category: "leader",
    cost: 5,
    power: 5000,
    counter: null,
    types: ["Fixture", "Minks", "Foxy Pirates", "CP0"],
    attribute: "Strike",
    effect: "",
    trigger: "",
  },
  {
    cardNumber: "FIX-001",
    name: "Fixture Deckhand",
    category: "character",
    cost: 1,
    power: 2000,
    counter: 1000,
    types: ["Fixture"],
    attribute: "Strike",
    effect: "",
    trigger: "",
  },
  {
    cardNumber: "FIX-002",
    name: "Fixture Captain",
    category: "character",
    cost: 2,
    power: 4000,
    counter: 1000,
    types: ["Fixture"],
    attribute: "Slash",
    effect: "",
    trigger: "",
  },
];

/** A record as its own source of truth, with its rules resolved. */
const setRecord = (card: CardRecord): [string, CardDefinition] => [
  card.cardNumber,
  resolveCardRecord(card),
];

export const cardRegistry = new Map<string, CardDefinition>([
  ...fixtureCards.map(setRecord),
  // The one card with no listing anywhere: see its file for the provenance.
  ...sealedPromoCards.map(setRecord),
  // Every card a community deck plays outside the imported sets, read from
  // Bandai's page by the audit's community pass -- what the hand-authored
  // card files used to hold.
  ...communityCardRecords.map(setRecord),
  ...formatCardRecords.map(setRecord),
  // Last, so a whole-set import wins for its own identities. A card can reach
  // the registry twice -- OP15-036 is both an OP15 card and a card an ST31-36
  // structure deck ships -- and the set-level record is the one that carries
  // the printed rarity, which the per-deck record has no source for.
  //
  // A card can also reach the registry through the community pass above,
  // which reads the page of the deck that plays it rather than the card's own
  // series page, and Bandai's two pages can print different wording for one
  // number: OP10-065 Sugar reads "[printed text omitted -- pnpm card:text OP10-065]" on the OP-10 page and "Rest 1 of your DON!! cards and you may
  // rest this Character" on the EB-04 reprint page. The set record wins, so
  // the record's rules and its text hash describe the same sentence -- which
  // is what `pnpm decks:provenance:check` exists to catch.
  ...op05Cards.map(setRecord),
  ...op06Cards.map(setRecord),
  ...op07Cards.map(setRecord),
  ...op08Cards.map(setRecord),
  ...op09Cards.map(setRecord),
  ...op10Cards.map(setRecord),
  ...op11Cards.map(setRecord),
  ...op12Cards.map(setRecord),
  ...op13Cards.map(setRecord),
  ...op14Cards.map(setRecord),
  ...op15Cards.map(setRecord),
  ...op16Cards.map(setRecord),
  ...op17Cards.map(setRecord),
  ...eb04Cards.map(setRecord),
  ...eb03Cards.map(setRecord),
  ...eb02Cards.map(setRecord),
  ...eb01Cards.map(setRecord),
  ...prb02Cards.map(setRecord),
  ...st10Cards.map(setRecord),
  ...st14Cards.map(setRecord),
  ...st29Cards.map(setRecord),
  ...st30Cards.map(setRecord),
  ...st21Cards.map(setRecord),
  ...st22Cards.map(setRecord),
  ...st16Cards.map(setRecord),
  ...st24Cards.map(setRecord),
  ...st25Cards.map(setRecord),
  ...st27Cards.map(setRecord),
  ...pCards.map(setRecord),
  ...st11Cards.map(setRecord),
  ...st12Cards.map(setRecord),
  ...st13Cards.map(setRecord),
  ...st15Cards.map(setRecord),
  ...st17Cards.map(setRecord),
  ...st19Cards.map(setRecord),
  ...st20Cards.map(setRecord),
]);

/**
 * The lookup surface a caller needs to know what a card is, as a value rather
 * than a set of functions closing over one global registry. `createCardDatabase`
 * lets a fork or a test scope the card universe to something other than the
 * shipped pool; `cards` below is that shipped pool, and is what every existing
 * caller keeps using through the free functions.
 */
export interface CardDatabase {
  get(cardNumber: string): CardDefinition | undefined;
  require(cardNumber: string): CardDefinition;
  facts(cardNumber: string): CardFacts;
  names(): ReadonlyMap<string, string>;
  cards(): Iterable<CardDefinition>;
}

export function createCardDatabase(
  sets: readonly (readonly CardRecord[])[],
): CardDatabase {
  const registry = new Map<string, CardDefinition>();
  for (const set of sets) {
    for (const card of set)
      registry.set(card.cardNumber, resolveCardRecord(card));
  }

  const factsOf = new Map<string, CardFacts>();
  // Facts carry the card's printed text, which arrives as a runtime asset and
  // can arrive after something has already asked. Without this a card looked
  // up before the pack loaded keeps its text-free facts for the life of the
  // process -- and `observe()` hands those facts to every agent and screen.
  onPrintedTextChange(() => {
    factsOf.clear();
  });
  const require_ = (cardNumber: string): CardDefinition => {
    const card = registry.get(cardNumber);
    if (!card) throw new Error(`UNKNOWN_CARD: ${cardNumber}`);
    return card;
  };

  return {
    get: (cardNumber) => registry.get(cardNumber),
    require: require_,
    facts: (cardNumber) => {
      const cached = factsOf.get(cardNumber);
      if (cached) return cached;
      const facts = factsFromDefinition(cardNumber, require_(cardNumber));
      factsOf.set(cardNumber, facts);
      return facts;
    },
    names: () =>
      new Map(
        [...registry.values()].map((card) => [card.cardNumber, card.name]),
      ),
    cards: () => registry.values(),
  };
}

/** The shipped pool, as every caller uses it today. */
export const cards: CardDatabase = createCardDatabase([
  [...cardRegistry.values()],
]);

/**
 * The printed text of a card, from whoever holds it.
 *
 * A loaded pack wins over text the record itself still carries, so the player
 * sees one source; a record with neither has no text to show, and every
 * caller that displays text has to cope with `undefined`. Nothing that decides
 * legality may call this: that is what `CardDefinition.rules` is for.
 */
export function printedText(cardNumber: string): PrintedText | undefined {
  const loaded = loadedPrintedText(cardNumber);
  if (loaded) return loaded;
  const card = cards.get(cardNumber);
  if (card?.effect === undefined || card.trigger === undefined)
    return undefined;
  return { effect: card.effect, trigger: card.trigger };
}

/**
 * The text of one timed clause, for naming an action by what it actually does.
 *
 * Legal actions used to summarise an activation as "Activate Enel", which names
 * three different cards in one Purple Enel deck -- the Leader, OP15-060 and
 * OP15-118 -- and says nothing about the cost or the effect. An LLM playtest
 * held two OP15-060 Enel back as Blockers for a whole turn without ever
 * activating the ability that grants [Blocker], with the activation legal and
 * offered at every decision. Its deck dossier described the ability correctly;
 * the action it had to click did not.
 *
 * Undefined without text: the label then names the card and its cost from the
 * committed clause summary, and a client holding a text pack fills the rest.
 */
export function clauseText(
  cardNumber: string,
  marker: ClauseMarker,
): string | undefined {
  const text = printedText(cardNumber);
  return text ? clauseTextOf(text.effect, marker) : undefined;
}

/** The [Counter] split, under the name the Counter step's callers use. */
export type CounterClauseParts = ClauseParts;

export function counterClauseParts(
  cardNumber: string,
): ClauseParts | undefined {
  return clauseParts(cardNumber, "[Counter]");
}

/**
 * A printed clause split into the parts a label needs. The cost, power and
 * "does anything else" answer come from the committed rules, so the engine's
 * Counter step and a client with no text agree; `rest` -- the text of that
 * something else -- is present only when the process holds the text.
 */
export function clauseParts(
  cardNumber: string,
  marker: ClauseMarker,
): ClauseParts | undefined {
  const summary = requireKnownCard(cardNumber).rules.clauseSummaries[marker];
  if (!summary) return undefined;
  const text = printedText(cardNumber);
  const fromText = text ? clausePartsOf(text.effect, marker) : undefined;
  return fromText?.rest ? { ...summary, rest: fromText.rest } : { ...summary };
}

/**
 * Every printed piece of behaviour on a card, as the unit a test can cover:
 * the committed `rules.clauses`, so the coverage gate needs no text on disk.
 */
export function printedClauses(cardNumber: string): readonly ClauseId[] {
  return requireKnownCard(cardNumber).rules.clauses as readonly ClauseId[];
}

function factsFromDefinition(
  cardNumber: string,
  definition: CardDefinition,
): CardFacts {
  const { rules } = definition;
  const text = printedText(cardNumber);
  return {
    cardNumber,
    name: definition.name,
    category: definition.category as CardFacts["category"],
    cost: definition.cost ?? 0,
    power: definition.power ?? 0,
    counter: definition.counter ?? 0,
    colors: definition.colors ?? [],
    types: definition.types,
    attribute: definition.attribute,
    keywords: rules.keywords,
    donRequirement: rules.donRequirement,
    donDeckSize: rules.donDeckSize,
    hasTrigger: rules.hasTrigger,
    hasCounterEvent: rules.hasCounterEvent,
    rules,
    ...(text ? { effect: text.effect, trigger: text.trigger } : {}),
  };
}

/**
 * The printed, public identity of a card number, in the shape policies consume.
 *
 * A thin wrapper over the shipped `cards` database, which caches by identity.
 */
export function cardFacts(cardNumber: string): CardFacts {
  return cards.facts(cardNumber);
}

/**
 * Every name `cardNumber` answers to: its own, then any the text grants it
 * through "[printed text omitted -- pnpm card:text <card>]" (see `deriveRules`).
 */
export function cardNames(cardNumber: string): readonly string[] {
  const definition = requireKnownCard(cardNumber);
  return [definition.name, ...definition.rules.nameAliases];
}

/**
 * "This Leader is treated as a card with all card names, types, and attributes."
 * -- every identity question answers yes, so it is a predicate, not a list.
 */
export function isIdentityWildcard(cardNumber: string): boolean {
  return requireKnownCard(cardNumber).rules.identityWildcard;
}

/** Whether `cardNumber` answers to `name`, printed or granted. */
export function hasCardName(cardNumber: string, name: string): boolean {
  if (isIdentityWildcard(cardNumber)) return true;
  return cardNames(cardNumber).includes(name);
}

/**
 * Whether `cardNumber` has `type`, printed or granted.
 *
 * Every leader-facing type check routes through this so the wildcard Leader is
 * honoured in one place instead of forty. Checks against a *Character's* types
 * may still read `definition.types` directly: the only wildcard card in the pool
 * is a Leader, and `test/sealed-promo.test.ts` pins that invariant so this stays
 * true if another wildcard is ever added.
 */
export function hasCardType(cardNumber: string, type: string): boolean {
  if (isIdentityWildcard(cardNumber)) return true;
  return requireKnownCard(cardNumber).types.includes(type);
}

/**
 * Whether any of `cardNumber`'s types *contains* `text`.
 *
 * Bandai writes two different restrictions and they are not the same question:
 * "{Baroque Works} type" names one type exactly, and "a type including
 * \"Baroque Works\"" also reaches {Former Baroque Works}. OP14's Black package
 * prints the second on nine cards, and the pool holds six Former Baroque Works
 * Characters for it to find, so reading it as the first would quietly halve the
 * archetype.
 */
export function hasCardTypeIncluding(
  cardNumber: string,
  text: string,
): boolean {
  if (isIdentityWildcard(cardNumber)) return true;
  return requireKnownCard(cardNumber).types.some((type) => type.includes(text));
}

/**
 * Whether `cardNumber` has `attribute`, printed or granted.
 *
 * A card can print two attribute icons, which Bandai's card list records as
 * one slash-joined field -- OP17-114 Kikunojo is `Slash/Strike`. Such a card
 * has both, so an equality test against the raw field silently drops it from
 * every attribute-gated effect. Split, then compare.
 */
export function hasCardAttribute(
  cardNumber: string,
  attribute: string,
): boolean {
  if (isIdentityWildcard(cardNumber)) return true;
  return cardAttributes(requireKnownCard(cardNumber)).includes(attribute);
}

/** The attributes a card prints, from the slash-joined printed field. */
export function cardAttributes(card: CardDefinition): readonly string[] {
  return card.attribute?.split("/").map((part) => part.trim()) ?? [];
}

export function requireKnownCard(cardNumber: string): CardDefinition {
  return cards.require(cardNumber);
}

/**
 * A card that can sit on the board: it has a printed cost and power.
 *
 * A Leader or an Event has neither, so anything that puts a Character into
 * play needs this narrowing rather than `requireKnownCard`.
 */
export function requirePlayableCard(
  cardNumber: string,
): PlayableCardDefinition {
  const card = requireKnownCard(cardNumber);
  if (card.cost === null || card.power === null) {
    throw new Error(`UNPLAYABLE_CARD_TYPE: ${cardNumber}`);
  }
  return card as PlayableCardDefinition;
}
