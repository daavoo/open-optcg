import { describe, expect, it } from "vitest";
import {
  cardRegistry,
  OP17_INFERRED_RARITY,
  OP17_RARITY,
} from "@one-piece-sim/cards";

/**
 * Printed rarity for the sets imported whole, rather than one deck at a time.
 *
 * The set composition is the load-bearing claim here, not the individual
 * assignments. Every rarity comes from Bandai's own card list through
 * `pnpm reference:audit`'s set-level pass, which reads the *base* print of each
 * card number -- an alt art is listed again under a collector rarity like `TR`,
 * and that is not what a booster slot fills. This is what caught the two the
 * hand-typed Limitless table had wrong for OP17: OP17-011 is C, not R, and
 * OP17-069 is UC, not C. If a future data refresh contradicts the totals, this
 * is what catches it.
 *
 * Every set shares one composition below the Leaders and the Secrets, which is
 * the point: it is the standard booster make-up, so a set that parsed wrong
 * stands out immediately -- OP09 came in on exactly the same make-up as the
 * eight sets around it, which is the cheapest evidence its parse is right.
 */
const EXPECTED_COMPOSITION = { C: 45, UC: 30, R: 26, SR: 10 };
/**
 * The two extra boosters' own compositions, neither of which is the standard
 * one -- and they do not match each other either, which is why there are two
 * constants rather than one shared "extra booster" number.
 *
 * EB-04 is 61 cards rather than 119 and does not scale the make-up down evenly:
 * it prints one UC in the whole set and 22 R, where a main set's 119 is 30 and
 * 26. EB-03 is 62 and prints no UC at all. Written as overrides rather than
 * folded into the shared constant so the eight main sets keep sharing one
 * number -- that sharing is what makes a set that parsed wrong stand out, and
 * an extra booster is a different product rather than a set that parsed wrong.
 */
const EB04_COMPOSITION = { C: 27, UC: 1, R: 22, SR: 9 };
/**
 * Shared by EB-05, EB-03 and EB-02, which print the same 29/21/9 below the Leader and
 * the Secrets and differ only in how many Secrets sit above it -- EB-03 has two
 * and 62 cards, EB-02 one and 61. So the make-up below the top of the set is
 * the extra booster's own standard, and the two sets sharing one constant is
 * the same evidence the eight main sets sharing theirs gives: a set that parsed
 * wrong would not land on it.
 */
const EB03_COMPOSITION = { C: 29, R: 21, SR: 9 };
/**
 * EB-01's own make-up, which no other extra booster shares.
 *
 * It is the only one with *three* Leaders -- the two-colour Oden, Hannyabal and
 * Kyros the set is built around -- and it prints 28 C and 21 R below them where
 * EB-02 and EB-03 print 29 and 21. A different shape rather than a set that
 * parsed wrong: the three Leaders are the product.
 */
const EB01_COMPOSITION = { C: 28, R: 21, SR: 8 };
/**
 * The premium booster, which is not a booster make-up at all: 18 cards, no
 * Leader, no Secret, and nothing below R. It is a box topper rather than a pack,
 * so it shares no constant with anything above it.
 */
const PRB02_COMPOSITION = { R: 12, SR: 6 };
/**
 * The Ultra Deck, which is a fixed 17-card product rather than a booster at
 * all: three Leaders, eleven commons and three SRs, and no Secret above them.
 * Nothing else in the table shares it -- an Ultra Deck is the only product
 * Bandai builds around a *choice* of Leader, which is where the three come
 * from.
 */
const ST10_COMPOSITION = { C: 11, SR: 3 };
/**
 * The ordinary starter deck: 17 cards, one Leader, fourteen commons and two
 * SRs, and no Secret. Shared by every ST- product in the table that is not an
 * Ultra Deck, which is the same evidence the eight main sets sharing one
 * constant gives -- a product that parsed wrong would not land on it.
 */
const STARTER_COMPOSITION = { C: 14, SR: 2 };
/**
 * ST-13's own make-up, which nothing else shares. It is an Ultra Deck like
 * ST-10 -- three Leaders, built around a *choice* of Leader -- but nineteen
 * cards rather than seventeen, and it is the only ST product in the table that
 * prints an R at all.
 */
const ST13_COMPOSITION = { C: 11, R: 1, SR: 4 };
/**
 * The five-card Ultra Deck supplement: three commons and two SRs, no Leader
 * and no Secret. ST-16, ST-24 and ST-27 share it, which is the same evidence
 * the eight main sets sharing one constant gives -- a product that parsed
 * wrong would not land on it.
 */
const SUPPLEMENT_COMPOSITION = { C: 3, SR: 2 };
/**
 * ST-11's own five-card make-up, which no other supplement shares: two commons
 * and two SRs *under a Leader*. Bandai printed the Uta box with its Leader in
 * the five rather than outside them, so the product is a supplement by size and
 * a starter by shape, and it lands on neither existing constant.
 */
const ST11_COMPOSITION = { C: 2, SR: 2 };
/**
 * The promos, which are not a product at all: 109 identities printed one at a
 * time in event packs, tournament kits and magazine inserts, listed together
 * because there is nowhere else to put them. Eleven are listed only beside
 * another product -- five on the PRB-02 page, one on ST-25's, five on the
 * "Other Product Card" page -- which is why the promo `setSeries` entry reads
 * four files.
 *
 * `P` is their rarity and it is a provenance stamp rather than a pull
 * frequency -- a promo has no booster slot to fill.
 *
 * They are also the one product where rarity and role come apart: four of the
 * 109 are Leaders and only one of them, P-011 Uta, is printed at `L` -- the
 * other three carry `P` like everything else on the page. So the `L` count is
 * written into the composition here rather than derived from the Leader count
 * below, which is what every set with a booster make-up can do.
 */
const PROMO_COMPOSITION = { P: 108, L: 1 };
/**
 * Cards in the set, and how many of them are Leaders.
 *
 * Most sets are the standard 119 with six Leaders and two Secrets. Four are
 * not. Two of the main sets are over by one in a different place each: OP14 is
 * 120 with a seventh Leader -- its Boa Hancock (OP14-041), a Blue/Yellow
 * multicolour printed alongside the six mono-colour ones -- and OP13 is 120
 * with a third Secret. The other two are the extra boosters, which are a
 * different product and have their own `composition` besides.
 *
 * Everything else is the same booster make-up across the eight main sets, which
 * is why the counts that move are split out rather than written as a second
 * table.
 */
const SET_SIZES: Record<
  string,
  {
    total: number;
    leaders: number;
    secrets: number;
    composition?: Record<string, number>;
    /**
     * Identities that carry the prefix but are not on the series page, so the
     * set import never stamps them and only a secondary source could. None at
     * present; a card here must also be named in `SECONDARY_SOURCE_ONLY` and
     * in the audit's `secondaryOnly`, so the hole stays visible rather than
     * sitting inside a composition total.
     */
    notOnPage?: readonly string[];
  }
> = {
  OP05: { total: 119, leaders: 6, secrets: 2 },
  OP06: { total: 119, leaders: 6, secrets: 2 },
  OP07: { total: 119, leaders: 6, secrets: 2 },
  OP08: { total: 119, leaders: 6, secrets: 2 },
  OP09: { total: 119, leaders: 6, secrets: 2 },
  OP10: { total: 119, leaders: 6, secrets: 2 },
  OP11: { total: 119, leaders: 6, secrets: 2 },
  OP12: { total: 119, leaders: 6, secrets: 2 },
  OP13: { total: 120, leaders: 6, secrets: 3 },
  OP14: { total: 120, leaders: 7, secrets: 2 },
  OP15: { total: 119, leaders: 6, secrets: 2 },
  OP16: { total: 119, leaders: 6, secrets: 2 },
  OP17: { total: 119, leaders: 6, secrets: 2 },
  // The extra boosters are a third to a half the size of a main set and are
  // shaped differently: one Leader rather than six, and EB-04 one SEC rather
  // than two. EB-04 is also the only set the audit reads from two pages, where
  // EB-03 has a series page of its own; see `cards/src/eb04.ts` and
  // `cards/src/eb03.ts`.
  EB05: {
    total: 61,
    leaders: 1,
    secrets: 1,
    composition: EB03_COMPOSITION,
  },
  EB04: {
    total: 61,
    leaders: 1,
    secrets: 1,
    composition: EB04_COMPOSITION,
  },
  EB03: {
    total: 62,
    leaders: 1,
    secrets: 2,
    composition: EB03_COMPOSITION,
  },
  EB02: {
    total: 61,
    leaders: 1,
    secrets: 1,
    composition: EB03_COMPOSITION,
  },
  EB01: {
    total: 61,
    leaders: 3,
    secrets: 1,
    composition: EB01_COMPOSITION,
  },
  PRB02: {
    total: 18,
    leaders: 0,
    secrets: 0,
    composition: PRB02_COMPOSITION,
  },
  ST10: {
    total: 17,
    leaders: 3,
    secrets: 0,
    composition: ST10_COMPOSITION,
  },
  ST14: {
    total: 17,
    leaders: 1,
    secrets: 0,
    composition: STARTER_COMPOSITION,
  },
  ST29: {
    total: 17,
    leaders: 1,
    secrets: 0,
    composition: STARTER_COMPOSITION,
  },
  ST30: {
    total: 17,
    leaders: 1,
    secrets: 0,
    composition: STARTER_COMPOSITION,
  },
  ST21: {
    total: 17,
    leaders: 1,
    secrets: 0,
    composition: STARTER_COMPOSITION,
  },
  ST22: {
    total: 17,
    leaders: 1,
    secrets: 0,
    composition: STARTER_COMPOSITION,
  },
  ST16: {
    total: 5,
    leaders: 0,
    secrets: 0,
    composition: SUPPLEMENT_COMPOSITION,
  },
  ST24: {
    total: 5,
    leaders: 0,
    secrets: 0,
    composition: SUPPLEMENT_COMPOSITION,
  },
  ST25: {
    total: 5,
    leaders: 0,
    secrets: 0,
    composition: SUPPLEMENT_COMPOSITION,
  },
  ST27: {
    total: 5,
    leaders: 0,
    secrets: 0,
    composition: SUPPLEMENT_COMPOSITION,
  },
  ST11: {
    total: 5,
    leaders: 1,
    secrets: 0,
    composition: ST11_COMPOSITION,
  },
  ST12: {
    total: 17,
    leaders: 1,
    secrets: 0,
    composition: STARTER_COMPOSITION,
  },
  ST13: {
    total: 19,
    leaders: 3,
    secrets: 0,
    composition: ST13_COMPOSITION,
  },
  ST15: {
    total: 5,
    leaders: 0,
    secrets: 0,
    composition: SUPPLEMENT_COMPOSITION,
  },
  ST17: {
    total: 5,
    leaders: 0,
    secrets: 0,
    composition: SUPPLEMENT_COMPOSITION,
  },
  ST19: {
    total: 5,
    leaders: 0,
    secrets: 0,
    composition: SUPPLEMENT_COMPOSITION,
  },
  ST20: {
    total: 5,
    leaders: 0,
    secrets: 0,
    composition: SUPPLEMENT_COMPOSITION,
  },
  P: {
    total: 109,
    leaders: 4,
    secrets: 0,
    composition: PROMO_COMPOSITION,
  },
};
const IMPORTED_SETS = [
  "OP05",
  "OP06",
  "OP07",
  "OP08",
  "OP09",
  "OP10",
  "OP11",
  "OP12",
  "OP13",
  "OP14",
  "OP15",
  "OP16",
  "OP17",
  "EB05",
  "EB04",
  "EB03",
  "EB02",
  "EB01",
  "PRB02",
  "ST10",
  "ST14",
  "ST29",
  "ST30",
  "ST21",
  "ST22",
  "ST16",
  "ST24",
  "ST25",
  "ST27",
  "ST11",
  "ST12",
  "ST13",
  "ST15",
  "ST17",
  "ST19",
  "ST20",
  "P",
] as const;

const setCards = (id: string) =>
  [...cardRegistry.values()].filter(
    (card) =>
      card.cardNumber.startsWith(`${id}-`) &&
      !(SET_SIZES[id]!.notOnPage ?? []).includes(card.cardNumber),
  );

describe.each(IMPORTED_SETS)("%s rarity", (id) => {
  const cards = setCards(id);

  const size = SET_SIZES[id]!;

  it("covers every card in the set exactly once", () => {
    expect(cards).toHaveLength(size.total);
    const missing = cards
      .filter((card) => !card.rarity)
      .map((card) => card.cardNumber);
    expect(missing).toEqual([]);
  });

  it("matches the set composition Bandai's card list prints", () => {
    const counts: Record<string, number> = {};
    for (const card of cards) {
      counts[card.rarity!] = (counts[card.rarity!] ?? 0) + 1;
    }
    // A rarity nothing in the set is printed at has no key in `counts` at all,
    // so the expectation must not carry one either. Every booster has a Leader
    // and a Secret and the distinction never arose; the premium booster has
    // neither, and spelling them as zero would compare `{ L: 0 }` against an
    // object with no `L`.
    // The `L` count is derived from the Leader count for every product where
    // the two agree, and taken from the composition where they do not: the
    // promos print four Leaders and only one of them at `L`, because a promo's
    // rarity says where the card came from rather than what it is.
    const composition: Record<string, number> =
      size.composition ?? EXPECTED_COMPOSITION;
    expect(counts).toEqual({
      ...composition,
      ...(size.leaders > 0 && composition.L === undefined
        ? { L: size.leaders }
        : {}),
      ...(size.secrets > 0 ? { SEC: size.secrets } : {}),
    });
  });

  it("leaves the Leaders as the only L-rarity cards", () => {
    // One direction only: every `L` is a Leader. The other direction does not
    // hold for the promos, where three of the four Leaders are printed at `P`.
    const leaders = cards.filter((card) => card.rarity === "L");
    expect(leaders.every((card) => card.category === "leader")).toBe(true);
    expect(cards.filter((card) => card.category === "leader")).toHaveLength(
      size.leaders,
    );
  });
});

describe("rarity provenance", () => {
  it("exports the OP17 table sealed pulls from", () => {
    // Sealed is the one consumer that needs rarity as a lookup rather than as
    // a field: a booster pack is defined by its rarity slots. OP17 is the only
    // sealed pool, so it is the only set with its own exported table.
    expect(Object.keys(OP17_RARITY)).toHaveLength(119);
  });

  it("infers no rarities, because the primary source carries all of them", () => {
    // Rarity arrives with the rest of each card's printed data, so the inferred
    // set is empty and nothing reports a pool with an unsourced pull frequency.
    expect(OP17_INFERRED_RARITY.size).toBe(0);
  });

  it("assigns rarity only to cards the set-level import stamped", () => {
    // A hand-authored card has no sourced rarity, so it must not claim one:
    // anything reporting a pool would read it as a pull frequency it cannot
    // support. Only the sets imported whole carry the field.
    const strays = [...cardRegistry.values()]
      .filter(
        (card) =>
          card.rarity &&
          !IMPORTED_SETS.some((id) => card.cardNumber.startsWith(`${id}-`)),
      )
      .map((card) => card.cardNumber);
    expect(strays).toEqual([]);
  });
});
