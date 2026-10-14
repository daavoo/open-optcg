import {
  cardRegistry,
  OP17_INFERRED_RARITY,
  unimplementedClauses,
  type CardDefinition,
  type CardRarity,
} from "@one-piece-sim/cards";
import { nextInt, seedRng } from "@one-piece-sim/protocol";
import type { DeckManifest } from "./index.js";

/**
 * The sealed format: booster packs, pools, and 40-card deck legality.
 *
 * Sealed is a different game from the constructed format the rest of this
 * package serves. Three rules change, and all three come from Bandai's sealed
 * rules document:
 *
 *  - the deck is **40 cards**, not 50;
 *  - **no colour restriction** applies, whatever the Leader is;
 *  - there is **no 4-copy limit** and no ban list -- five or more copies of a
 *    card number are explicitly legal.
 *
 * What replaces those constraints is the pool: a deck may only use cards the
 * player actually opened. Everything left over is the sideboard, swappable
 * between games.
 */

/** Sealed decks are 40 cards, against constructed's 50. */
export const SEALED_DECK_SIZE = 40;

/** Bandai's suggested pack count, and what the analysis tooling defaults to. */
export const SEALED_PACK_COUNT = 6;

/**
 * The Leader every sealed deck in this repo uses.
 *
 * Sealed lets you bring a Leader rather than open one, and this is the one the
 * format is built around -- see `sealed-promo.ts` for why its wildcard identity
 * is what makes a random pool playable at all. It is also why one Leader covers
 * every expansion below: a card "treated as a card with all card names, types,
 * and attributes" is no more at home in OP17 than in OP14.
 */
export const SEALED_LEADER = "SEALED-LUFFY";

/**
 * One slot in a booster pack: how many cards, and which rarities can fill it.
 *
 * Weights are out of 24 -- a booster box -- because that is the denominator the
 * published pull rates use, so the numbers below can be read straight against
 * them instead of being converted.
 */
export interface PackSlot {
  readonly count: number;
  readonly options: readonly { rarity: CardRarity; weight: number }[];
}

/**
 * The 12-card booster pack, shared by every expansion in
 * {@link SEALED_EXPANSIONS}.
 *
 * Deliberately data rather than logic, because the exact rates are the least
 * certain thing here. Public sources agree on the shape -- 12 cards, mostly C
 * and UC, at least one R -- and OP17-specific community-aggregated pull data
 * (314 packs) puts the hit slot at roughly 2 SR per 24-pack box and 1 SEC per
 * *three* boxes, not per box: SEC is three times rarer than a same-set-shape
 * guess would suggest, because the set carries only 2 SEC card numbers total
 * against 10 SR. The hit slot's weights encode that ratio directly (out of a
 * 72 = 3-box denominator, so both SR and SEC land on whole numbers). Adjust
 * these numbers without touching `openPacks`.
 *
 * One shape for all four expansions rather than one per set, because the two
 * things the shape is derived from are the same across them: every pack is
 * printed "12-Card Booster Pack", and each set carries exactly 10 SR and 2 SEC
 * card numbers, which is the ratio the hit slot encodes.
 * `test/sealed.test.ts` pins that second half, so a future set that breaks it
 * fails rather than silently borrowing OP17's rates.
 *
 * Sources:
 *   https://tcgtalk.com/guides/op17-pull-rates-case-opening
 *   https://tcgtalk.com/guides/one-piece-tcg-box-pull-rates
 *   https://onepiece.gg/rarity-of-cards-in-the-one-piece-card-game/
 */
export const BOOSTER_PACK: readonly PackSlot[] = [
  { count: 1, options: [{ rarity: "L", weight: 24 }] },
  { count: 6, options: [{ rarity: "C", weight: 24 }] },
  { count: 3, options: [{ rarity: "UC", weight: 24 }] },
  { count: 1, options: [{ rarity: "R", weight: 24 }] },
  // The hit slot: usually another R, occasionally the box's SR, rarely a SEC.
  {
    count: 1,
    options: [
      { rarity: "R", weight: 65 },
      { rarity: "SR", weight: 6 },
      { rarity: "SEC", weight: 1 },
    ],
  },
];

/**
 * A booster expansion sealed can be played with.
 *
 * Membership is not a taste call. Two things have to hold, and both are checked
 * by `test/sealed.test.ts` rather than trusted:
 *
 *  - **Printed rarity is sourced for every card number.** Without it a
 *    "booster" is a uniform random sample rather than a pack, since a pack is
 *    defined by its rarity slots -- see `packages/cards/src/op17-rarity.ts`.
 *  - **Every card number is in `cardRegistry`.** A half-implemented set opens
 *    pools that cannot reach {@link SEALED_DECK_SIZE} playable cards, which
 *    reads to a player as bad luck rather than as a gap in the engine.
 *
 * `title` and `productCode` are Bandai's own, from `productPage`. They are
 * carried here rather than looked up because they are what the lobby names an
 * expansion by, and a set code alone ("OP15") does not tell a player which
 * boosters they are about to open.
 */
export interface SealedExpansion {
  /** The set code as card numbers carry it, e.g. `"OP17"`. */
  readonly code: string;
  /**
   * Bandai's printed product code, which is not always the set code: the two
   * halves of Extra Booster 4 shipped inside OP14 and OP15, and those packs are
   * printed `OP14-EB04` / `OP15-EB04`.
   */
  readonly productCode: string;
  /** Bandai's English set title, as printed on the pack. */
  readonly title: string;
  /** The official product page every other field here was read off. */
  readonly productPage: string;
  /**
   * The official English pack photo.
   *
   * Fetched into gitignored `local-art/` by `tools/download-deck-art.ts` and
   * never committed, the same as card art and for the same reason. A build
   * without it falls back to the drawn pack in `styles/cards.css`.
   */
  readonly packImageUrl: string;
}

/**
 * The expansions sealed can be played with, oldest first.
 *
 * Ordered because the lobby lists them in this order and defaults to the last
 * -- {@link DEFAULT_SEALED_EXPANSION} -- so adding a set is an entry here and
 * nothing else.
 */
export const SEALED_EXPANSIONS: readonly SealedExpansion[] = [
  {
    code: "OP10",
    productCode: "OP-10",
    title: "Royal Blood",
    productPage: "https://en.onepiece-cardgame.com/products/boosters/op10.php",
    packImageUrl:
      "https://en.onepiece-cardgame.com/renewal/images/products/boosters/op10/img_item01.webp",
  },
  {
    code: "OP11",
    productCode: "OP-11",
    title: "A Fist of Divine Speed",
    productPage: "https://en.onepiece-cardgame.com/products/boosters/op11.php",
    packImageUrl:
      "https://en.onepiece-cardgame.com/renewal/images/products/boosters/op11/img_item01.webp",
  },
  {
    code: "OP12",
    productCode: "OP-12",
    title: "Legacy of the Master",
    productPage: "https://en.onepiece-cardgame.com/products/boosters/op12.php",
    packImageUrl:
      "https://en.onepiece-cardgame.com/renewal/images/products/boosters/op12/img_item01.webp",
  },
  {
    code: "OP13",
    productCode: "OP-13",
    title: "Carrying On His Will",
    productPage: "https://en.onepiece-cardgame.com/products/boosters/op13/",
    packImageUrl:
      "https://en.onepiece-cardgame.com/products/boosters/op13/images/img_item01.webp",
  },
  {
    code: "OP14",
    productCode: "OP14-EB04",
    title: "The Azure Sea's Seven",
    productPage:
      "https://en.onepiece-cardgame.com/products/boosters/op14-eb04.php",
    packImageUrl:
      "https://en.onepiece-cardgame.com/renewal/images/products/boosters/op14/img_item01.webp",
  },
  {
    code: "OP15",
    productCode: "OP15-EB04",
    title: "Adventure on Kami's Island",
    productPage:
      "https://en.onepiece-cardgame.com/products/boosters/op15-eb04.php",
    packImageUrl:
      "https://en.onepiece-cardgame.com/renewal/images/products/boosters/op15-eb04/img_item01.webp",
  },
  {
    code: "OP16",
    productCode: "OP-16",
    title: "The Time of Battle",
    productPage: "https://en.onepiece-cardgame.com/products/op16.html",
    packImageUrl:
      "https://en.onepiece-cardgame.com/onepiececg/bccard/en/products/2026/03/26/olc1E9Gg9WXeLP6V/img_item01.webp",
  },
  {
    code: "OP17",
    productCode: "OP-17",
    title: "The World's Strongest Warriors",
    productPage: "https://en.onepiece-cardgame.com/products/boosters/op17/",
    packImageUrl:
      "https://en.onepiece-cardgame.com/products/boosters/op17/images/others/product_pack.webp",
  },
];

/** The newest expansion: what a sealed run opens unless told otherwise. */
export const DEFAULT_SEALED_EXPANSION = SEALED_EXPANSIONS.at(-1)!.code;

/** One expansion by set code, or `undefined` if sealed does not offer it. */
export function sealedExpansion(code: string): SealedExpansion | undefined {
  return SEALED_EXPANSIONS.find((expansion) => expansion.code === code);
}

/**
 * One expansion by set code, throwing rather than opening a pool from a set
 * whose rarities or mechanics this build does not have.
 */
export function requireSealedExpansion(code: string): SealedExpansion {
  const expansion = sealedExpansion(code);
  if (!expansion) throw new Error(`UNKNOWN_SEALED_EXPANSION: ${code}`);
  return expansion;
}

/** The card-number prefix of an expansion's cards, e.g. `"OP17-"`. */
export function sealedSetPrefix(code: string): string {
  return `${requireSealedExpansion(code).code}-`;
}

export interface SealedPool {
  readonly seed: string;
  /** The set code the packs were opened from. */
  readonly expansion: string;
  readonly packCount: number;
  /** Each pack's contents, in the order opened. */
  readonly packs: readonly (readonly string[])[];
  /** Every opened card, flattened. Duplicates across packs are expected. */
  readonly cards: readonly string[];
}

/**
 * A pack-opening draw: returns an integer in `[0, maximum)`.
 *
 * Bound over the shared seeded RNG in `@one-piece-sim/protocol`, so a pool is
 * fully reproducible from its seed and uses the same stream the engine shuffles
 * decks with.
 */
type Draw = (maximum: number) => number;

function seededDraw(seed: string): Draw {
  let state = seedRng(seed);
  return (maximum: number) => {
    const result = nextInt(state, maximum);
    state = result.state;
    return result.value;
  };
}

/** One expansion's cards, grouped by printed rarity, in card-number order. */
export function sealedCardsByRarity(
  expansion: string = DEFAULT_SEALED_EXPANSION,
): ReadonlyMap<CardRarity, readonly CardDefinition[]> {
  const prefix = sealedSetPrefix(expansion);
  const buckets = new Map<CardRarity, CardDefinition[]>();
  const sorted = [...cardRegistry.values()]
    .filter((card) => card.cardNumber.startsWith(prefix))
    // Sorted so a pool is reproducible from its seed no matter what order the
    // registry happens to iterate in, and stays reproducible when a card is
    // added to another set.
    .sort((left, right) => left.cardNumber.localeCompare(right.cardNumber));
  for (const card of sorted) {
    if (!card.rarity) continue;
    const bucket = buckets.get(card.rarity) ?? [];
    bucket.push(card);
    buckets.set(card.rarity, bucket);
  }
  return buckets;
}

/** Picks one rarity from a slot's weighted options. */
function pickRarity(slot: PackSlot, draw: Draw): CardRarity {
  const total = slot.options.reduce((sum, option) => sum + option.weight, 0);
  let roll = draw(total);
  for (const option of slot.options) {
    if (roll < option.weight) return option.rarity;
    roll -= option.weight;
  }
  return slot.options.at(-1)!.rarity;
}

/**
 * Opens `packCount` packs.
 *
 * Cards are drawn **without replacement within a pack** -- a real booster cannot
 * contain the same card twice -- but freely across packs, which is why a 6-pack
 * pool routinely holds four copies of a Common. Sealed explicitly permits five
 * or more copies of a card in a deck, so those duplicates are playable.
 *
 * The same seed opens different pools in different expansions, and that is the
 * point: the expansion is part of what a pool is, so it is recorded on the pool
 * rather than left for a caller to remember.
 */
export function openPacks(
  seed: string,
  packCount: number = SEALED_PACK_COUNT,
  expansion: string = DEFAULT_SEALED_EXPANSION,
): SealedPool {
  // Namespaced so a sealed pool and a game using the same seed string do not
  // share a stream.
  const draw = seededDraw(`sealed:${seed}`);
  const buckets = sealedCardsByRarity(expansion);
  const packs: string[][] = [];

  for (let index = 0; index < packCount; index += 1) {
    // Resolve every slot's rarity first, so the without-replacement draw can be
    // done per rarity rather than per card with retries.
    const needed = new Map<CardRarity, number>();
    for (const slot of BOOSTER_PACK) {
      for (let n = 0; n < slot.count; n += 1) {
        const rarity = pickRarity(slot, draw);
        needed.set(rarity, (needed.get(rarity) ?? 0) + 1);
      }
    }
    const opened: string[] = [];
    for (const [rarity, count] of needed) {
      const bucket = buckets.get(rarity) ?? [];
      const remaining = [...bucket];
      for (let n = 0; n < count && remaining.length > 0; n += 1) {
        const [chosen] = remaining.splice(draw(remaining.length), 1);
        opened.push(chosen!.cardNumber);
      }
    }
    packs.push(opened);
  }

  return {
    seed,
    expansion: requireSealedExpansion(expansion).code,
    packCount,
    packs,
    cards: packs.flat(),
  };
}

/** How many copies of each card number a pool holds. */
export function poolCounts(pool: SealedPool): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const cardNumber of pool.cards) {
    counts.set(cardNumber, (counts.get(cardNumber) ?? 0) + 1);
  }
  return counts;
}

/**
 * The pool cards a deck could legally contain.
 *
 * One exclusion: Leaders are not main-deck cards, so the `L` slot's card is
 * always sideboard. Every other opened card is playable -- a card only reaches
 * the registry once the engine runs its printed text, and the clauses that are
 * an exception are named by {@link sealedPoolCoverage}.
 */
export function playablePoolCards(
  pool: SealedPool,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const [cardNumber, count] of poolCounts(pool)) {
    const card = cardRegistry.get(cardNumber);
    if (!card || card.category === "leader") continue;
    counts.set(cardNumber, count);
  }
  return counts;
}

export interface SealedPoolCoverage {
  /** Total non-Leader cards opened. */
  mainDeckCards: number;
  /**
   * Opened cards with a printed clause the engine declares it does not run,
   * mapped to those clauses.
   *
   * Normally empty. It is the sealed view of `UNIMPLEMENTED_CLAUSES`, which is
   * the one place a shipped card is allowed to do less than it says.
   */
  partialCards: ReadonlyMap<string, readonly string[]>;
  /**
   * Cards in the pool whose printed rarity is inferred rather than sourced.
   *
   * Only OP17 was ever short a source, and it no longer is, so this is empty
   * for every expansion. It stays because the day a new expansion is added
   * before Bandai lists it, this is the field that says so.
   */
  inferredRarity: readonly string[];
}

/**
 * What a pool can be built with, and where its text is not fully honoured.
 *
 * Exists so no caller has to guess whether a thin deck means bad luck or a
 * gap in the engine.
 */
export function sealedPoolCoverage(pool: SealedPool): SealedPoolCoverage {
  const partialCards = new Map<string, readonly string[]>();
  let mainDeckCards = 0;
  for (const [cardNumber, count] of poolCounts(pool)) {
    const card = cardRegistry.get(cardNumber);
    if (!card || card.category === "leader") continue;
    mainDeckCards += count;
    const gaps = unimplementedClauses(cardNumber);
    if (gaps.length > 0) partialCards.set(cardNumber, gaps);
  }
  return {
    mainDeckCards,
    partialCards,
    inferredRarity: [...new Set(pool.cards)]
      .filter((cardNumber) => OP17_INFERRED_RARITY.has(cardNumber))
      .sort(),
  };
}

export interface SealedDeck {
  /** Card number to copy count. */
  readonly cards: Readonly<Record<string, number>>;
}

export interface SealedValidation {
  cardCount: number;
  errors: readonly string[];
}

/**
 * Sealed deck legality.
 *
 * Deliberately a separate function from `validateDeck` in the web deck editor
 * rather than a flag on it. The two rule sets differ on three of the four things
 * that function checks -- size, colour, and copy limit -- and share only "is
 * this a real main-deck card", so a shared implementation would be mostly
 * branches. What sealed adds instead is pool containment.
 */
export function validateSealedDeck(
  deck: SealedDeck,
  pool: SealedPool,
): SealedValidation {
  const errors: string[] = [];
  const available = poolCounts(pool);
  let cardCount = 0;

  for (const [cardNumber, quantity] of Object.entries(deck.cards)) {
    cardCount += quantity;
    const card = cardRegistry.get(cardNumber);
    if (!card) {
      errors.push(`${cardNumber} is not a known card.`);
      continue;
    }
    if (card.category === "leader") {
      errors.push(`${cardNumber} is a Leader and cannot be in the main deck.`);
      continue;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      errors.push(`${cardNumber} must have a positive whole-number quantity.`);
    }
    // No colour check and no copy limit: both are lifted in sealed.
    const opened = available.get(cardNumber) ?? 0;
    if (quantity > opened) {
      errors.push(
        `${cardNumber}: deck uses ${quantity} but the pool opened ${opened}.`,
      );
    }
  }

  if (cardCount !== SEALED_DECK_SIZE) {
    errors.unshift(
      `A sealed deck must contain exactly ${SEALED_DECK_SIZE} cards (currently ${cardCount}).`,
    );
  }
  return { cardCount, errors };
}

/** The pool cards left over once `deck` is set aside. Sideboard, per the rules. */
export function sealedSideboard(
  deck: SealedDeck,
  pool: SealedPool,
): ReadonlyMap<string, number> {
  const remaining = new Map(poolCounts(pool));
  for (const [cardNumber, quantity] of Object.entries(deck.cards)) {
    const left = (remaining.get(cardNumber) ?? 0) - quantity;
    if (left > 0) remaining.set(cardNumber, left);
    else remaining.delete(cardNumber);
  }
  return remaining;
}

/**
 * A playable manifest for a sealed deck.
 *
 * `deckSize` is what lets this through `loadDeckManifest`, whose 50-card check
 * is otherwise the only thing in the engine that assumes a constructed deck.
 */
export function sealedDeckManifest(
  deck: SealedDeck,
  pool: SealedPool,
): DeckManifest {
  return {
    // The expansion is in the id because it is in the pool: two runs on the
    // same seed in different expansions are different decks, and a trace names
    // the deck it was played with.
    id: `SEALED-${pool.expansion}-${pool.seed}`,
    leader: SEALED_LEADER,
    cards: { ...deck.cards },
    deckSize: SEALED_DECK_SIZE,
  };
}

/**
 * Whether a pool can currently produce a legal 40-card deck at all.
 *
 * Separate from {@link validateSealedDeck} because while an expansion is still
 * being implemented the interesting failure is not "this deck is illegal" but
 * "no legal deck exists from this pool yet", and those want different messages.
 * A 6-pack pool opens 66 main-deck cards, so the format needs roughly 60% of a
 * set implemented before its pools reliably clear 40 playable -- which is why
 * {@link SEALED_EXPANSIONS} admits only fully implemented sets.
 */
export function sealedPoolIsBuildable(pool: SealedPool): {
  buildable: boolean;
  playable: number;
  shortfall: number;
} {
  const playable = [...playablePoolCards(pool).values()].reduce(
    (total, count) => total + count,
    0,
  );
  return {
    buildable: playable >= SEALED_DECK_SIZE,
    playable,
    shortfall: Math.max(0, SEALED_DECK_SIZE - playable),
  };
}

/**
 * Whether an Event's printed condition is one the sealed pool actually has to
 * supply, as opposed to one `SEALED_LEADER` satisfies by construction.
 *
 * Rule 4 below ("Events last") assumes a random pool rarely meets an Event's
 * printed condition. That is true of a genuine board-state check -- "[printed text omitted -- pnpm card:text <card>]" (`OP17-096`/`098`) truly depends on
 * what got opened. It is false of a Leader-identity check: `SEALED_LEADER` is
 * "treated as a card with all card names, types, and attributes", so "[printed text omitted -- pnpm card:text OP17-096]" (`OP17-077`/`078`) and every
 * "[printed text omitted -- pnpm card:text OP17-077]" / "your [Name]" target restriction
 * (`OP17-017`, `019`, `036`, `037`, `055`, `056`, `076`, `115`, `117`, at least)
 * hold in every sealed game regardless of pool. Those Events are not dead
 * text; the "conditions rarely met" premise just doesn't apply to a Leader
 * that answers to every name and type there is.
 *
 * A plain regex is enough to tell the two apart: any conditional clause reads
 * as `if ...`, and the Leader-identity kind always reads `if your Leader ...`.
 * An Event without an `if` at all -- most of the list above -- has no
 * condition to fail either, which is the same case for the same reason.
 */
/**
 * Picks a 40-card deck from a pool, for automated matches.
 *
 * This is a baseline, not a good sealed pilot. It exists so a seeded sweep has
 * *a* deck to play, and it deliberately encodes only the parts of sealed
 * deckbuilding that are uncontroversial enough to hardcode:
 *
 *  1. **Playable cards only** -- anything else the engine would refuse to load.
 *  2. **Curve first.** In a format with no tutors and no consistency, a deck that
 *     cannot act on turns 2-4 loses to one that can, so cheaper cards win ties.
 *  3. **Counter matters.** Sealed games go long and are decided by Life, so a
 *     card with a printed Counter is worth more than its body suggests.
 *  4. **Events last, unless their only condition is the Leader.** A random
 *     pool rarely supports a board-state condition on its Events, and a dead
 *     Event is worse than a mediocre body -- but {@link eventConditionDependsOnPool}
 *     is what actually decides "dead" here, not the card category alone.
 *
 * Anything cleverer than this belongs in a policy that can be measured against
 * alternatives (`pnpm heuristic:ab`), not in a deckbuilder nobody can A/B.
 */
export interface RankedSealedCandidate {
  cardNumber: string;
  score: number;
}

/**
 * Every playable copy in the pool, one entry per copy, scored and sorted the
 * way {@link autoBuildSealedDeck} cuts to 40 -- lower score is better, ties
 * broken by card number for determinism. Exported on its own (rather than
 * kept private to `autoBuildSealedDeck`) so a measurement tool can find
 * exactly which copies sit closest to the cut line without re-deriving the
 * same scoring arithmetic; `packages/cli/src/sealed-analysis.ts`'s swap-based
 * per-card analysis is the first caller.
 */
export function rankSealedPoolCandidates(
  pool: SealedPool,
): RankedSealedCandidate[] {
  const candidates: RankedSealedCandidate[] = [];
  for (const [cardNumber, count] of playablePoolCards(pool)) {
    const card = cardRegistry.get(cardNumber)!;
    const cost = card.cost ?? 0;
    const counter = card.counter ?? 0;
    // Lower is better. Cost dominates; a printed Counter is worth about a cost
    // step; an Event whose condition the pool must supply pays a flat
    // penalty, and one the Leader always satisfies pays a third of it.
    const eventPenalty =
      card.category === "event"
        ? card.rules.eventConditionDependsOnPool
          ? 15
          : 5
        : 0;
    const score = cost * 10 - counter / 500 + eventPenalty;
    for (let copy = 0; copy < count; copy += 1) {
      candidates.push({ cardNumber, score });
    }
  }
  candidates.sort(
    (left, right) =>
      left.score - right.score ||
      left.cardNumber.localeCompare(right.cardNumber),
  );
  return candidates;
}

export function autoBuildSealedDeck(pool: SealedPool): SealedDeck {
  const candidates = rankSealedPoolCandidates(pool);
  const cards: Record<string, number> = {};
  for (const candidate of candidates.slice(0, SEALED_DECK_SIZE)) {
    cards[candidate.cardNumber] = (cards[candidate.cardNumber] ?? 0) + 1;
  }
  return { cards };
}

/**
 * GRAPE: the community's standard sealed/draft priority order --
 * **G**ame-winners, **R**emoval, **A**dvantage, **P**rotection, **E**verything
 * else -- built as a second deckbuilder so it can be measured against
 * {@link autoBuildSealedDeck} rather than assumed better:
 * `autoBuildSealedDeck` only ever implemented a version of "E", since its
 * score is cost/counter/event-shape only, with no read of a card's actual
 * text -- it has no notion of a bomb, a removal effect, or a card-advantage
 * effect at all, three of GRAPE's five letters simply absent from it.
 *
 * This is a best-effort port of guide text into regexes, not a hand-curated
 * card list, for the same reason `keywordsOf` derives keywords from printed
 * text instead of a per-card-number table in `packages/cards/src/index.ts`:
 * a hand list silently stops covering the set the day a new card is added.
 * That means it will misclassify some cards -- text pattern-matching for
 * "does this remove a threat" is inherently fuzzier than the cost/counter
 * arithmetic {@link autoBuildSealedDeck} relies on. The point of shipping it
 * as a second, A/B-able builder rather than editing the first is that this
 * imprecision is then measurable rather than assumed away.
 */
export type GrapeBucket = "G" | "R" | "A" | "P" | "E";

/** "Bomb": high-cost, high-power, or a Rush unit big enough to swing alone. */
function isGrapeBomb(card: CardDefinition): boolean {
  const cost = card.cost ?? 0;
  const power = card.power ?? 0;
  if (card.category !== "character") return false;
  if (cost >= 8 && power >= 8000) return true;
  return card.rules.tokens.includes("[Rush]") && cost >= 6 && power >= 7000;
}

/**
 * Removes, rests, bounces, or bottom-decks something of the *opponent's*.
 *
 * Word-bounded (`\b...\b`) so "rest" doesn't match inside "rested" -- an
 * adjective describing a card's own state, not the action -- which is what
 * misclassified OP17-044 Captain John (a taunt/lock card) as removal: "this
 * Character is rest*ed*, your opponent cannot attack..." has no removal verb
 * at all once the substring match is fixed. Two false positives remain
 * unfixed (OP17-021, -054): those need the verb's actual grammatical object
 * to be "the opponent's", which a word-proximity regex can't tell apart from
 * "opponent" merely appearing somewhere nearby in the same clause.
 */
/**
 * A card's own trigger-name tag (e.g. `[On Your Opponent's Attack]`) can
 * mention "opponent" without describing what the effect *does* -- OP17-057
 * Fullalead's `[On Your Opponent's Attack] You may rest this Stage...` reads
 * as removal to a plain substring scan otherwise, since its own cost rests
 * a Stage the controller owns, not anything of the opponent's. Stripped
 * before classification rather than folded into {@link REMOVAL_TEXT} itself,
 * since {@link classifyGrape}'s other checks (bomb, advantage, protection)
 * have no equivalent false-positive mode to fix.
 */
/** Draws, searches/digs, or makes the opponent discard -- card-count swings. */
/**
 * How broadly a card counts as "Protection". Full GRAPE's P letter measured
 * *worse* than G+R+A alone, which is why the shipped fill order demotes it
 * after E; this knob is the membership half of that question:
 *
 *  - `"blocker-or-counter"` -- the shipped default: `[Blocker]` text, or a
 *    printed Counter >= 2000, with no cost ceiling.
 *  - `"blocker-only"` -- drop the counter-only clause entirely, on the theory
 *    that a body's Counter is worth something on its own merit (already
 *    priced into the "E" curve score) without also making it outrank R/A
 *    picks for a bucket slot.
 *  - `"blocker-or-cheap-counter"` -- keep the counter clause, but only for
 *    cards cheap enough (`cost <= 4`) that a P slot spent on them isn't
 *    out-prioritizing the deck's cheap utility the way a 2000-counter bomb
 *    would.
 */
export type GrapePMembership =
  "blocker-or-counter" | "blocker-only" | "blocker-or-cheap-counter";

function isGrapeProtection(
  card: CardDefinition,
  pMembership: GrapePMembership,
): boolean {
  if (card.category !== "character") return false;
  if (card.rules.tokens.includes("[Blocker]")) return true;
  if (pMembership === "blocker-only") return false;
  const counter = card.counter ?? 0;
  if (counter < 2000) return false;
  return pMembership === "blocker-or-counter" || (card.cost ?? 0) <= 4;
}

/**
 * The GRAPE bucket a single card classifies into, with the same rules
 * {@link autoBuildSealedDeckGrape} uses internally. Exported for tooling that
 * wants to group or label cards by bucket (e.g. a pick-priority report)
 * without re-deriving the classification logic.
 */
export function classifyGrape(
  card: CardDefinition,
  pMembership: GrapePMembership = "blocker-or-counter",
): GrapeBucket {
  if (isGrapeBomb(card)) return "G";
  if (card.rules.removalText) return "R";
  if (card.rules.advantageText) return "A";
  if (isGrapeProtection(card, pMembership)) return "P";
  return "E";
}

/**
 * The bucket fill order {@link autoBuildSealedDeckGrape} uses by default.
 *
 * P fills *after* E, not in GRAPE's nominal G-R-A-P-E letter order. An
 * earlier, smaller run found full GRAPE's P letter measured worse than
 * G+R+A alone; measured against the nominal order across three independent
 * seed sets of increasing size (150, 200, 250, 400 seeds), demoting P after
 * E beat it in all three, though the gap narrowed as the sample grew (81.8%
 * vs. 77.8% at 200 seeds; 79.9% vs. 78.8% at 400) -- consistent enough to
 * keep, not dramatic enough to call the original "P actively hurts" finding
 * anything but noise at 150 seeds.
 */
export const GRAPE_FILL_ORDER: readonly GrapeBucket[] = [
  "G",
  "R",
  "A",
  "E",
  "P",
];

/** Tuning knobs for {@link autoBuildSealedDeckGrape}, all optional. */
export interface GrapeBuildOptions {
  /**
   * Bucket fill order. Default {@link GRAPE_FILL_ORDER} (G, R, A, P, E) --
   * GRAPE's own priority order. Exists to test "does demoting P after E
   * change anything": since P actively hurt full GRAPE's measured win rate
   * versus G+R+A alone, moving it after E's curve-first fill lets P only
   * claim leftover slots E's own scoring wouldn't have taken anyway.
   */
  fillOrder?: readonly GrapeBucket[];
  /** How broadly a card counts as "P". Default `"blocker-or-counter"`. */
  pMembership?: GrapePMembership;
}

/**
 * Every playable copy in the pool, scored and ordered the way
 * {@link autoBuildSealedDeckGrape} cuts to 40: classified into a bucket,
 * each bucket internally sorted (biggest bomb first for G, cheapest utility
 * first for R/A/P, the same curve-first score {@link rankSealedPoolCandidates}
 * uses for E), then buckets concatenated in `fillOrder`. The flattened
 * index *is* GRAPE's own cut line -- index `< SEALED_DECK_SIZE` is kept,
 * `>=` is cut -- the GRAPE analogue of what {@link rankSealedPoolCandidates}
 * already provides for the plain heuristic.
 */
export function rankSealedPoolCandidatesGrape(
  pool: SealedPool,
  options: GrapeBuildOptions = {},
): RankedSealedCandidate[] {
  const { fillOrder = GRAPE_FILL_ORDER, pMembership = "blocker-or-counter" } =
    options;
  const buckets: Record<GrapeBucket, RankedSealedCandidate[]> = {
    G: [],
    R: [],
    A: [],
    P: [],
    E: [],
  };
  for (const [cardNumber, count] of playablePoolCards(pool)) {
    const card = cardRegistry.get(cardNumber)!;
    const bucket = classifyGrape(card, pMembership);
    // Within a bucket: biggest bomb first for G, cheapest utility first for
    // R/A/P (a cheap removal/advantage/protection effect is easier to fit
    // alongside everything else GRAPE also wants), and the same curve-first
    // score `autoBuildSealedDeck` uses for the E fallback.
    const score =
      bucket === "G"
        ? -(card.power ?? 0)
        : bucket === "E"
          ? (card.cost ?? 0) * 10 - (card.counter ?? 0) / 500
          : (card.cost ?? 0) * 10;
    for (let copy = 0; copy < count; copy += 1) {
      buckets[bucket].push({ cardNumber, score });
    }
  }
  for (const bucket of Object.values(buckets)) {
    bucket.sort(
      (left, right) =>
        left.score - right.score ||
        left.cardNumber.localeCompare(right.cardNumber),
    );
  }
  return fillOrder.flatMap((letter) => buckets[letter]);
}

/**
 * Builds a GRAPE deck. See {@link GrapeBuildOptions} for the tuning knobs an
 * ablation can vary; the defaults are the shipped classifier and priority
 * order.
 */
export function autoBuildSealedDeckGrape(
  pool: SealedPool,
  options: GrapeBuildOptions = {},
): SealedDeck {
  const candidates = rankSealedPoolCandidatesGrape(pool, options);
  const cards: Record<string, number> = {};
  for (const candidate of candidates.slice(0, SEALED_DECK_SIZE)) {
    cards[candidate.cardNumber] = (cards[candidate.cardNumber] ?? 0) + 1;
  }
  return { cards };
}
