import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  foldBlockPrintings,
  normalize,
  parseBlockIcons,
  parseBlockUpdates,
  toBlockPrintingMap,
} from "./block-icons.js";
import { parseOfficialCards, type OfficialCard } from "./parse-cardlist.js";
import {
  textPackEntry,
  textPackFile,
  toCommittedRecord,
} from "./committed-record.js";

interface EgmanCard {
  card_code: string;
  category: string;
  rarity: string;
  name: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
  color: string[];
  type: string[];
  attribute: string | null;
  effect: string | null;
  trigger: string | null;
}

const snapshot = process.argv[2];
if (!snapshot || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot)) {
  throw new Error("Usage: pnpm reference:audit <YYYY-MM-DD>");
}

const root = join(process.cwd(), "fixtures", "reference", snapshot);
const sha256 = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Every block icon in the snapshot, per card number, across every cardlist page
 * fetched -- not only the pages one deck's pass happens to read.
 *
 * Standard legality is a property of an identity's *printings*: a card is legal
 * if any one of them sits in a legal block. So the union has to be taken over
 * as many products as the snapshot carries, and it is only ever as complete as
 * that. A card printed in a legal block on a page `tools/fetch-reference` does
 * not fetch will read as rotated out here, which is why the consumer treats an
 * identity with no record as unknown rather than as illegal.
 */
const bandaiRoot = join(root, "bandai");
const cardlistFiles = (await readdir(bandaiRoot))
  .filter((file) => file.startsWith("cardlist-") && file.endsWith(".html"))
  .sort();
// Bandai's block-number updates are folded in as icons too: a card the page
// assigns to block 4 is read as if it had a block-4 printing, and the "generally
// permitted" Super Parallel Rares as if they carried `X`. Without this page
// OP01-055 reads as block 1 on every printing and so as rotated out, while
// Bandai's own ruling keeps it Standard-legal through March 2029.
const blockPrintings = foldBlockPrintings([
  ...(await Promise.all(
    cardlistFiles.map(async (file) =>
      parseBlockIcons(await readFile(join(bandaiRoot, file), "utf8")),
    ),
  )),
  parseBlockUpdates(
    await readFile(join(bandaiRoot, "blockicon-card.html"), "utf8"),
  ),
]);

const gameData = JSON.parse(
  await readFile(join(root, "egman", "gamedata.json"), "utf8"),
) as { structureDecks: Array<{ label: string; url: string; image: string }> };
const egmanCards = JSON.parse(
  await readFile(join(root, "egman", "cards.json"), "utf8"),
) as EgmanCard[];
const egmanByNumber = new Map(egmanCards.map((card) => [card.card_code, card]));
const decks = [];
const officialByNumber = new Map<string, OfficialCard>();

/**
 * The published id for each structure deck, keyed by its number. Distinct
 * from the `ST${number}` label below: that label is egman's own deck-list
 * key and has to stay exactly what egman calls it, while this is the id the
 * rest of the repo (registries, dossiers, the deck select) keys off of.
 */
const STRUCTURE_DECK_IDS: Record<number, string> = {
  31: "(Red) Monkey.D.Luffy - Starter Deck 31",
  32: "(Green) Roronoa Zoro - Starter Deck 32",
  33: "(Blue) Kuzan - Starter Deck 33",
  34: "(Purple) Charlotte Katakuri - Starter Deck 34",
  35: "(Red/Black) Sabo - Starter Deck 35",
  36: "(Yellow) Eustass Kid - Starter Deck 36",
};

for (let number = 31; number <= 36; number += 1) {
  const egmanLabel = `ST${number}`;
  const id = STRUCTURE_DECK_IDS[number]!;
  const source = gameData.structureDecks.find(
    (deck) => deck.label === egmanLabel,
  );
  if (!source) throw new Error(`Missing ${egmanLabel} structure deck`);
  const parameter = new URL(source.url).searchParams.get("deck");
  if (!parameter) throw new Error(`Missing deck parameter for ${id}`);
  const parsedEntries = Object.fromEntries(
    parameter.split(",").map((entry) => {
      const [cardNumber, quantity] = entry.split(":");
      if (!cardNumber || !quantity)
        throw new Error(`Malformed ${id} entry: ${entry}`);
      return [cardNumber, Number(quantity)];
    }),
  );
  const official = parseOfficialCards(
    await readFile(join(root, "bandai", `cardlist-st${number}.html`), "utf8"),
  );
  if (official.length !== 15)
    throw new Error(
      `${id} official list has ${official.length} records, expected 15`,
    );
  for (const card of official) {
    const existing = officialByNumber.get(card.cardNumber);
    if (existing && sha256(existing) !== sha256(card))
      throw new Error(`Conflicting official records for ${card.cardNumber}`);
    officialByNumber.set(card.cardNumber, card);
  }
  const leader = official.find(
    (card) => card.category === "LEADER",
  )?.cardNumber;
  if (!leader) throw new Error(`${id} has no official Leader`);
  const mainDeckEntries = Object.fromEntries(
    Object.entries(parsedEntries).filter(
      ([cardNumber]) => cardNumber !== leader,
    ),
  );
  const total = Object.values(mainDeckEntries).reduce(
    (sum, quantity) => sum + quantity,
    0,
  );
  if (total !== 50) throw new Error(`${id} has ${total} main-deck cards`);
  decks.push({
    id,
    leader,
    cards: mainDeckEntries,
  });
}

function compareToSecondary(official: OfficialCard) {
  const secondary = egmanByNumber.get(official.cardNumber);
  if (!secondary)
    return {
      cardNumber: official.cardNumber,
      sourceMatch: false,
      mismatches: ["missing-secondary-record"],
    };
  const fields: Array<[string, unknown, unknown]> = [
    ["name", official.name, secondary.name],
    ["category", official.category, secondary.category.toUpperCase()],
    ["cost", official.cost, secondary.cost],
    ["power", official.power, secondary.power],
    ["counter", official.counter, secondary.counter],
    ["color", official.color.map(normalize), secondary.color.map(normalize)],
    ["types", official.types.map(normalize), secondary.type.map(normalize)],
    ["attribute", official.attribute, secondary.attribute],
    ["effect", official.effect, normalize(secondary.effect)],
    ["trigger", official.trigger, normalize(secondary.trigger)],
  ];
  const mismatches = fields
    .filter(
      ([, primary, candidate]) =>
        JSON.stringify(primary) !== JSON.stringify(candidate),
    )
    .map(([field]) => field);
  return {
    cardNumber: official.cardNumber,
    sourceMatch: true,
    exactSecondaryMatch: mismatches.length === 0,
    mismatches,
  };
}

const cards = [...officialByNumber.values()].sort((left, right) =>
  left.cardNumber.localeCompare(right.cardNumber),
);
const comparisons = cards.map(compareToSecondary);

// Community-list decks (e.g. a tournament decklist sourced from a
// third-party site rather than one of Bandai's own structure decks) aren't
// shaped like the ST31-36 loop above: there is no official "deck" resource
// to validate against, only individual card identities. Each identity is
// still checked against the same primary (Bandai cardlist) and secondary
// (egman) sources, but the result is exported per-card rather than folded
// into formatCardRecords/formatDeckManifests, so a hand-authored deck file
// (e.g. op16-nami.ts) keeps its own effect/trigger text as the source of
// truth and only takes its officialTextHash/sourceMatch stamp from here.
const communityDecks: Array<{
  id: string;
  cardlistFiles: string[];
  cardNumbers: string[];
  /**
   * Identities Bandai's English cardlist does not carry, stamped from the
   * secondary source alone and reported with `sourceMatch: false`.
   *
   * `validateDeckCardRows` fails any row whose source text is not matched, so
   * a secondary-only identity has to be named in `SECONDARY_SOURCE_ONLY` too.
   * Listing it here rather than silently falling back keeps the hole visible
   * in `card-audit.json`. None at present.
   */
  secondaryOnly?: string[];
}> = [
  {
    id: "(Blue/Yellow) Nami - Official Feature Deck",
    cardlistFiles: [
      "cardlist-op06.html",
      "cardlist-op11.html",
      "cardlist-op13.html",
      "cardlist-op14-eb04.html",
      "cardlist-op15-eb04.html",
      "cardlist-op16.html",
      "cardlist-eb03.html",
      "cardlist-prb02.html",
    ],
    cardNumbers: [
      "OP11-041",
      "OP14-102",
      "OP06-106",
      "OP11-106",
      "OP14-110",
      "OP14-111",
      "OP16-056",
      "OP06-104",
      "PRB02-008",
      "OP15-113",
      "EB03-053",
      "EB04-058",
      "OP15-114",
      "EB03-055",
      "OP14-104",
      "OP16-119",
      "OP13-042",
      "OP06-058",
    ],
  },
  {
    // OP16-TEACH-ZAGREB. The Leader and its OP-16 Blackbeard package are
    // stamped by the set-level pass below, OP15-113 and EB04-058 by
    // OP16-NAMI-6738 and OP12-112 by OP12-ROSINANTE-AYASHIZO, so these are the
    // five identities nothing else in the repo carries -- the contents of
    // `cards/src/op16-teach.ts`. EB04-059 sits on the OP15 page rather than the
    // OP14 one; both carry EB-04, and only one has to be read.
    id: "(Black/Yellow) Marshall.D.Teach - Official Feature Deck",
    cardlistFiles: ["cardlist-op09.html", "cardlist-op15-eb04.html"],
    cardNumbers: ["OP09-086", "OP09-093", "OP09-096", "OP09-099", "EB04-059"],
  },
  {
    id: "(Purple) Enel - Official Feature Deck",
    cardlistFiles: [
      "cardlist-op05.html",
      "cardlist-op09.html",
      "cardlist-op10.html",
      "cardlist-op12.html",
      "cardlist-op15-eb04.html",
    ],
    cardNumbers: [
      "OP15-058",
      "OP12-071",
      "OP15-061",
      "OP15-066",
      "OP15-067",
      "OP09-072",
      "OP12-063",
      "OP10-067",
      "OP15-118",
      "OP15-074",
      "OP15-075",
      "OP15-076",
      "OP15-077",
      "OP15-078",
      "OP05-077",
    ],
  },
  // The OP-17 meta lists. Almost pure OP17, which the set-level pass below
  // already stamps, so each entry carries only the identities that reach
  // outside the set. OP17-LUFFY-ELBAPH has none and so has no entry.
  // OP13-SABO-ELBAPH has no entry, for the same reason OP17-LUFFY-ELBAPH has
  // none: every identity it plays is stamped elsewhere. Its Leader and its
  // OP04-016 by the ST31-36 format pass, its OP15 and OP17 slots by the
  // set-level pass below.
  {
    id: "(Green) Shanks - Official Feature Deck",
    cardlistFiles: ["cardlist-op13.html", "cardlist-st16.html"],
    cardNumbers: ["OP13-031", "ST16-004"],
  },
  // OP16-ACE-WBP, the OP-17 Red Ace list. Its OP16 and OP17 slots are stamped
  // by the set-level pass below, so these are the two identities nothing else
  // in the repo carries: the contents of `cards/src/op16-ace.ts`.
  {
    id: "(Red) Portgas.D.Ace - Official Feature Deck",
    cardlistFiles: ["cardlist-op13.html"],
    cardNumbers: ["OP13-007", "OP13-016"],
  },
  {
    id: "(Blue) Rocks.D.Xebec - Official Feature Deck",
    cardlistFiles: ["cardlist-op08.html"],
    cardNumbers: ["OP08-051"],
  },
  // OP17-KAIDO-AKP, the OP-17 Purple Kaido ramp list. Its OP17 slots are
  // stamped by the set-level pass below, so these are the four identities
  // nothing else in the repo carries: the contents of
  // `cards/src/op17-kaido.ts`. EB-04 is listed on the OP14 page rather than a
  // page of its own, the same way OP16-TEACH-ZAGREB reaches EB04-059 through
  // the OP15 one.
  //
  // EB04-030 and OP07-077 are still listed although the deck no longer plays
  // them -- Bandai's feature list cut both. The same reason OP01-055 stays in
  // the Mihawk entry below: a hand-authored definition takes its
  // `officialTextHash` from this pass and nowhere else, so dropping it here
  // would leave the card unstamped rather than tidy.
  {
    id: "(Purple) Kaido - Official Feature Deck",
    cardlistFiles: ["cardlist-op07.html", "cardlist-op14-eb04.html"],
    cardNumbers: ["EB04-030", "EB04-031", "EB04-032", "OP07-077"],
  },
  // The OP-14 Green Mihawk list. Its OP14 slots and its Leader are stamped by
  // the set-level pass below, its ST32 and OP12-023 slots by the ST31-36 loop
  // above, and OP07-026 and OP13-031 by their set passes, so these are the
  // identities nothing else in the repo carries. OP06-035, OP12-037 and
  // ST24-004 are no longer in the list but stay in the registry, and a
  // hand-authored identity takes its `officialTextHash` from this pass and
  // nowhere else, so dropping them here would leave the definitions unstamped
  // rather than tidy. OP01 and ST24 were added to `tools/fetch-reference` for
  // OP01-055 and ST24-004.
  {
    id: "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
    cardlistFiles: [
      "cardlist-op01.html",
      "cardlist-op06.html",
      "cardlist-op07.html",
      "cardlist-op08.html",
      "cardlist-op12.html",
      "cardlist-st24.html",
    ],
    cardNumbers: [
      "OP01-055",
      "OP06-033",
      "OP06-035",
      "OP06-038",
      "OP07-022",
      "OP08-036",
      "OP12-034",
      "OP12-037",
      "ST24-004",
    ],
  },
  // EB04-BONNEY, Bandai's own Red/Yellow Jewelry Bonney feature deck. Its
  // EB04-058 and EB03-053 are stamped by the Nami entry, and its EB04-002,
  // OP12-119 and OP13-108 by the set-level passes below, so these nine are the
  // identities nothing else in the repo carries: the contents of
  // `cards/src/eb04-bonney.ts`.
  //
  // EB-04 sits on the OP15 page rather than a page of its own, the same way
  // EB04-002 and EB04-059 already reach the pool; OP07-107 and OP07-114 are on
  // the PRB-02 page rather than the OP-07 one, which is the reprint Bandai's
  // own feature list links. ST-29 (569029) was added to
  // `tools/fetch-reference` for ST29-010.
  // Singles the hand-authored card files carried that no deck entry above
  // listed: ST-21 upgrades from published lists, off-set slots of the Luffy,
  // Nami and Enel feature decks. Listed here so they are generated like every
  // other card rather than typed in by hand.
  {
    id: "Hand-authored singles",
    cardlistFiles: [
      "cardlist-op01.html",
      "cardlist-op02.html",
      "cardlist-op07.html",
      "cardlist-op09.html",
      "cardlist-eb03.html",
      "cardlist-st21.html",
      "cardlist-st30.html",
      "cardlist-promo.html",
    ],
    cardNumbers: [
      "OP01-025",
      "OP02-068",
      "OP07-056",
      "OP07-064",
      "OP09-112",
      "EB03-060",
      "ST21-003",
      "ST21-015",
      "ST30-014",
      "P-096",
    ],
  },
  {
    id: "(Red/Yellow) Jewelry Bonney - Official Feature Deck",
    cardlistFiles: [
      "cardlist-op15-eb04.html",
      "cardlist-prb02.html",
      "cardlist-st29.html",
    ],
    cardNumbers: [
      "EB04-001",
      "EB04-007",
      "EB04-052",
      "EB04-054",
      "EB04-056",
      "EB04-061",
      "OP07-107",
      "OP07-114",
      "ST29-010",
    ],
  },
  // OP06-YAMATO, Bandai's own (Green/Yellow) Yamato feature deck
  // (`/feature/deck/deck_075.php`). Its OP06-104 Kikunojo is stamped by the
  // Nami entry above and its OP10-109 Basil Hawkins by the OP10 set pass
  // below, so these thirteen are the identities nothing else in the repo
  // carries: the contents of `cards/src/op06-yamato.ts`.
  //
  // ST-28 (569028) was added to `tools/fetch-reference` for this deck -- it is
  // the product the list is sold as, and none of its five exclusives were in
  // the snapshot. OP08-023 and PRB02-016 sit on the PRB-02 page as well as
  // OP-08's, and PRB-02 is listed *last* on purpose: later files win, and it
  // is the page that spells OP06-118's DON!!-resting costs out instead of
  // printing them as cost icons. See the header of `cards/src/op06-yamato.ts`.
  {
    id: "(Green/Yellow) Yamato - Official Feature Deck",
    cardlistFiles: [
      "cardlist-op06.html",
      "cardlist-st28.html",
      "cardlist-op08.html",
      "cardlist-prb02.html",
    ],
    cardNumbers: [
      "OP06-022",
      "OP06-107",
      "OP06-109",
      "OP06-110",
      "OP06-115",
      "OP06-118",
      "OP08-023",
      "PRB02-016",
      "ST28-001",
      "ST28-002",
      "ST28-003",
      "ST28-004",
      "ST28-005",
    ],
  },
  // ST-18, Bandai's (Purple) Monkey.D.Luffy starter deck -- the Land of Wano
  // list whose Leader is the OP05-060 reprint rather than an ST18 print, which
  // is why the product has only five numbered exclusives. Like ST-26 it is not
  // part of the format the ST31-36 loop above generates, so it comes through
  // here: the Leader and the eight OP-05 reprints it plays are stamped by the
  // OP-05 set pass below, leaving the six identities nothing else in the repo
  // carries -- the five ST-18 exclusives and P-041, the 10-cost Luffy the
  // product ships as its promo and whose only printed set is this one.
  //
  {
    id: "(Purple) Monkey.D.Luffy - Starter Deck 18",
    cardlistFiles: ["cardlist-st18.html"],
    cardNumbers: [
      "ST18-001",
      "ST18-002",
      "ST18-003",
      "ST18-004",
      "ST18-005",
      "P-041",
    ],
  },
  // ST-23, Bandai's (Red) Shanks starter deck. Its Leader OP09-001 and its nine
  // OP-09 slots are stamped by the OP-09 set pass below, and ST23-004 arrived
  // with the ST-31 list, leaving the four identities nothing else carries.
  {
    id: "(Red) Shanks - Starter Deck 23",
    cardlistFiles: ["cardlist-st23.html"],
    cardNumbers: ["ST23-001", "ST23-002", "ST23-003", "ST23-005"],
  },
  // ST01-011 Brook: a block-1 starter card reprinted in block 4, so
  // Standard-legal, and played by the current Sabo (OP13-004) field. No
  // shipped deck runs it yet; it is in the pool for the training variants.
  {
    id: "ST01-011 Brook (block-4 reprint)",
    cardlistFiles: ["cardlist-st01.html"],
    cardNumbers: ["ST01-011"],
  },
  // Block-1 identities that a later printing keeps Standard-legal, played by
  // current tournament lists. No shipped deck runs them; they are in the pool
  // for the training variants. ST02-007, OP03-008, OP03-048, OP03-097 and
  // ST06-008 were reprinted in block 4 on the PRB-02 page, which is the one
  // read for them. OP02-013 carries a Super Parallel `X` print, which never
  // rotates; its OP-02 page is read rather than the OP-08 one, whose print of
  // it is that Super Parallel.
  {
    id: "Block-4 and X reprints",
    cardlistFiles: ["cardlist-op02.html", "cardlist-prb02.html"],
    cardNumbers: [
      "OP02-013",
      "OP03-008",
      "OP03-048",
      "OP03-097",
      "ST02-007",
      "ST06-008",
    ],
  },
  // ST-26, Bandai's (Purple/Black) Monkey.D.Luffy starter deck. Unlike ST31-36
  // it is not part of the format the ST31-36 loop above generates, so it comes
  // through here: its Leader OP09-061 and its five OP09 slots are stamped by
  // the OP-09 set pass below, leaving the nine identities nothing else in the
  // repo carries -- three OP-05 Straw Hats, ST14-010 Brook, and the five ST-26
  // exclusives.
  //
  // ST-14 (569014) and ST-26 (569026) were added to `tools/fetch-reference`
  // for it.
  {
    id: "(Purple/Black) Monkey.D.Luffy - Starter Deck 26",
    cardlistFiles: [
      "cardlist-op05.html",
      "cardlist-st14.html",
      "cardlist-st26.html",
    ],
    cardNumbers: [
      "OP05-065",
      "OP05-066",
      "OP05-070",
      "ST14-010",
      "ST26-001",
      "ST26-002",
      "ST26-003",
      "ST26-004",
      "ST26-005",
    ],
  },
  // ST-27, Bandai's (Black) Marshall.D.Teach starter deck, played as the
  // recommended list Bandai publishes for it -- the starter plus the two
  // PRB-02 singles and the EB-01 reprint that list adds. Like ST-26 it is not
  // part of the format the ST31-36 loop above generates, so it comes through
  // here: its Leader OP09-081 and its seven OP09 slots are stamped by the
  // OP-09 set pass below, leaving the five identities nothing else in the repo
  // carries -- the two ST-27 exclusives the list plays, the two PRB-02 singles
  // and EB01-048 Laboon, whose only printing on Bandai's English cardlist is
  // the PRB-02 reprint page.
  //
  // ST-27 (569027) was added to `tools/fetch-reference` for it; the PRB-02
  // page was already fetched for the Nami feature deck.
  {
    id: "(Black) Marshall.D.Teach - Starter Deck 27",
    cardlistFiles: ["cardlist-prb02.html", "cardlist-st27.html"],
    cardNumbers: ["EB01-048", "PRB02-014", "PRB02-015", "ST27-003", "ST27-005"],
  },
  // EB02-010, Bandai's (Green/Purple) Monkey.D.Luffy feature deck
  // (`/feature/deck/deck_062.php`). Every other identity in the fifty is
  // stamped by the EB-02 and OP-05 set passes or the ST-18 entry above; OP03-072
  // Gum-Gum Jet Gatling is the one left, and its only printing on Bandai's
  // English cardlist outside the unfetched OP-03 page is the PRB-02 reprint.
  {
    id: "(Green/Purple) Monkey.D.Luffy - Official Feature Deck",
    cardlistFiles: ["cardlist-prb02.html"],
    cardNumbers: ["OP03-072"],
  },
  // Bandai's (Blue/Black) Usopp feature deck (deck_058). Its Leader and every
  // OP-10 slot are stamped by the OP-10 set pass; these are the three OP-04
  // identities that are still Standard-legal -- OP04-077 and OP04-096
  // re-blocked to 4, OP04-083 a generally permitted Super Parallel `X`. The
  // list's four block-1 identities are replaced in the manifest, not imported.
  //
  // OP-04 (569104) was added to `tools/fetch-reference` for it.
  {
    id: "(Blue/Black) Usopp - Official Feature Deck",
    cardlistFiles: ["cardlist-op04.html"],
    cardNumbers: ["OP04-077", "OP04-083", "OP04-096"],
  },
];

const textPack: Record<string, ReturnType<typeof textPackEntry>> = {};
// Every card a community deck plays that no set module carries becomes a
// generated record here, stats and rules alike, read from Bandai's page: the
// hand-authored card files this pass used to stamp are gone, and this is what
// replaced them. Ordered by card number at write time.
const communityRecords = new Map<
  string,
  { card: OfficialCard; sourceMatch: boolean }
>();
const communityComparisons: ReturnType<typeof compareToSecondary>[] = [];
for (const deck of communityDecks) {
  const communityOfficialByNumber = new Map<string, OfficialCard>();
  for (const file of deck.cardlistFiles) {
    for (const card of parseOfficialCards(
      await readFile(join(root, "bandai", file), "utf8"),
    )) {
      communityOfficialByNumber.set(card.cardNumber, card);
    }
  }
  for (const cardNumber of deck.cardNumbers) {
    const official = communityOfficialByNumber.get(cardNumber);
    if (!official) {
      if (!deck.secondaryOnly?.includes(cardNumber))
        throw new Error(
          `${deck.id}: missing official record for ${cardNumber}`,
        );
      const secondary = egmanByNumber.get(cardNumber);
      if (!secondary)
        throw new Error(`${deck.id}: no record at all for ${cardNumber}`);
      communityComparisons.push({
        cardNumber,
        sourceMatch: false,
        mismatches: ["missing-primary-record"],
      });
      communityRecords.set(cardNumber, {
        card: {
          cardNumber,
          rarity: normalize(secondary.rarity),
          category: normalize(secondary.category).toUpperCase(),
          name: normalize(secondary.name),
          cost: secondary.cost,
          power: secondary.power,
          counter: secondary.counter,
          color: secondary.color.map((value) => normalize(value)),
          types: secondary.type.map((value) => normalize(value)),
          attribute: secondary.attribute
            ? normalize(secondary.attribute)
            : null,
          effect: normalize(secondary.effect),
          trigger: normalize(secondary.trigger),
        },
        sourceMatch: false,
      });
      continue;
    }
    if (deck.secondaryOnly?.includes(cardNumber)) {
      throw new Error(
        `${deck.id}: ${cardNumber} is listed as secondary-only but Bandai now publishes it`,
      );
    }
    const comparison = compareToSecondary(official);
    communityComparisons.push(comparison);
    communityRecords.set(cardNumber, {
      card: official,
      sourceMatch: comparison.sourceMatch,
    });
  }
}

/**
 * Set-level pass: a whole booster series whose cards are played outside any
 * deck manifest.
 *
 * These sets exist in this project as whole pools rather than as registered
 * 50-card decks, so neither the ST31-36 loop (which validates a Bandai
 * structure-deck resource) nor the community-deck pass (which walks one deck's
 * card numbers) fits them. What they need is the whole series: every card in
 * the set, with its printed rarity, because a booster pack is defined by its
 * rarity slots and because a card outside any manifest still has to be
 * playable.
 *
 * Bandai listed OP17 on 2026-08-21 (series 569117). Until then the set had no
 * primary record at all and its 119 identities were a hand-corrected import
 * from the secondary source; this pass is what replaced them. OP15 and OP16
 * followed the same route in reverse: both sets were already in the pool as
 * the handful of identities three community decks happened to play, and this
 * pass is what imports the other ~200.
 *
 * `prefix` matters for OP14 and OP15: Bandai lists both on the same page as
 * EB04 (series 569114 and 569115), and only the OP14-/OP15- numbers belong to
 * those series.
 */
const setSeries = [
  {
    id: "OP05",
    files: ["cardlist-op05.html"],
    prefix: "OP05-",
    expected: 119,
    output: "generated-op05.ts",
    binding: "op05CardRecords",
  },
  {
    id: "OP06",
    files: ["cardlist-op06.html"],
    prefix: "OP06-",
    expected: 119,
    output: "generated-op06.ts",
    binding: "op06CardRecords",
  },
  {
    id: "OP07",
    files: ["cardlist-op07.html"],
    prefix: "OP07-",
    expected: 119,
    output: "generated-op07.ts",
    binding: "op07CardRecords",
  },
  {
    id: "OP08",
    files: ["cardlist-op08.html"],
    prefix: "OP08-",
    expected: 119,
    output: "generated-op08.ts",
    binding: "op08CardRecords",
  },
  {
    id: "OP09",
    files: ["cardlist-op09.html"],
    prefix: "OP09-",
    expected: 119,
    output: "generated-op09.ts",
    binding: "op09CardRecords",
  },
  {
    id: "OP10",
    files: ["cardlist-op10.html"],
    prefix: "OP10-",
    expected: 119,
    output: "generated-op10.ts",
    binding: "op10CardRecords",
  },
  {
    id: "OP11",
    files: ["cardlist-op11.html"],
    prefix: "OP11-",
    expected: 119,
    output: "generated-op11.ts",
    binding: "op11CardRecords",
  },
  {
    id: "OP12",
    files: ["cardlist-op12.html"],
    prefix: "OP12-",
    expected: 119,
    output: "generated-op12.ts",
    binding: "op12CardRecords",
  },
  {
    id: "OP13",
    files: ["cardlist-op13.html"],
    prefix: "OP13-",
    expected: 120,
    output: "generated-op13.ts",
    binding: "op13CardRecords",
  },
  {
    id: "OP14",
    files: ["cardlist-op14-eb04.html"],
    prefix: "OP14-",
    expected: 120,
    output: "generated-op14.ts",
    binding: "op14CardRecords",
  },
  {
    id: "OP15",
    files: ["cardlist-op15-eb04.html"],
    prefix: "OP15-",
    expected: 119,
    output: "generated-op15.ts",
    binding: "op15CardRecords",
  },
  {
    id: "OP16",
    files: ["cardlist-op16.html"],
    prefix: "OP16-",
    expected: 119,
    output: "generated-op16.ts",
    binding: "op16CardRecords",
  },
  {
    id: "OP17",
    files: ["cardlist-op17.html"],
    prefix: "OP17-",
    expected: 119,
    output: "generated-op17.ts",
    binding: "op17CardRecords",
  },
  {
    id: "EB04",
    // Bandai gives the extra booster no series page of its own: its 61 cards
    // are split across the OP14 and OP15 list pages, 31 on one and 30 on the
    // other, which is why this entry reads two files where every other set
    // reads one.
    files: ["cardlist-op14-eb04.html", "cardlist-op15-eb04.html"],
    prefix: "EB04-",
    expected: 61,
    output: "generated-eb04.ts",
    binding: "eb04CardRecords",
  },
  {
    // EB-05 has a series page of its own (569205) and 61 cards on it, every
    // one numbered EB05-: the page carries no reprints for the prefix to drop.
    id: "EB05",
    files: ["cardlist-eb05.html"],
    prefix: "EB05-",
    expected: 61,
    output: "generated-eb05.ts",
    binding: "eb05CardRecords",
  },
  {
    // EB-03 does have a series page of its own (569203), so it reads one file
    // like the eight main sets and unlike its neighbour above.
    id: "EB03",
    files: ["cardlist-eb03.html"],
    prefix: "EB03-",
    expected: 62,
    output: "generated-eb03.ts",
    binding: "eb03CardRecords",
  },
  {
    // EB-02 has its own series page too (569202), and 61 cards on it.
    id: "EB02",
    files: ["cardlist-eb02.html"],
    prefix: "EB02-",
    expected: 61,
    output: "generated-eb02.ts",
    binding: "eb02CardRecords",
  },
  {
    // EB-01 has its own series page (569201) and 61 cards on it. Every one is
    // block 2, so the whole set is Standard-legal under the current floor.
    id: "EB01",
    files: ["cardlist-eb01.html"],
    prefix: "EB01-",
    expected: 61,
    output: "generated-eb01.ts",
    binding: "eb01CardRecords",
  },
  {
    // The premium booster is small: 18 cards on series page 569302, which the
    // snapshot already carried for the identities single decks play.
    id: "PRB02",
    files: ["cardlist-prb02.html"],
    prefix: "PRB02-",
    expected: 18,
    output: "generated-prb02.ts",
    binding: "prb02CardRecords",
  },
  {
    // ST-10 is an Ultra Deck rather than a starter: 17 cards, and three of
    // them are Leaders, which is why its rarity make-up is its own. Its page
    // also lists two OP01 reprints, which the `prefix` filter drops -- the
    // OP01 identities belong to that set's own import, not to this one.
    id: "ST10",
    files: ["cardlist-st10.html"],
    prefix: "ST10-",
    expected: 17,
    output: "generated-st10.ts",
    binding: "st10CardRecords",
  },
  {
    // ST-14 is a standard 17-card starter: one Leader, fourteen commons and
    // two SRs, the make-up every starter below shares.
    id: "ST14",
    files: ["cardlist-st14.html"],
    prefix: "ST14-",
    expected: 17,
    output: "generated-st14.ts",
    binding: "st14CardRecords",
  },
  {
    // ST-29 is a standard 17-card starter, on its own series page.
    id: "ST29",
    files: ["cardlist-st29.html"],
    prefix: "ST29-",
    expected: 17,
    output: "generated-st29.ts",
    binding: "st29CardRecords",
  },
  {
    // ST-30 is a standard 17-card starter, on its own series page.
    id: "ST30",
    files: ["cardlist-st30.html"],
    prefix: "ST30-",
    expected: 17,
    output: "generated-st30.ts",
    binding: "st30CardRecords",
  },
  {
    // ST-21 is a standard 17-card starter, on its own series page.
    id: "ST21",
    files: ["cardlist-st21.html"],
    prefix: "ST21-",
    expected: 17,
    output: "generated-st21.ts",
    binding: "st21CardRecords",
  },
  {
    // ST-22 is a standard 17-card starter, on its own series page, and every
    // card on it is its own: nothing else in the pool reprints one.
    id: "ST22",
    files: ["cardlist-st22.html"],
    prefix: "ST22-",
    expected: 17,
    output: "generated-st22.ts",
    binding: "st22CardRecords",
  },
  {
    // ST-16 is a five-card Ultra Deck supplement rather than a starter: its
    // page carries the ST-11 deck it extends and six promos besides, which the
    // `prefix` filter drops.
    id: "ST16",
    files: ["cardlist-st16.html"],
    prefix: "ST16-",
    expected: 5,
    output: "generated-st16.ts",
    binding: "st16CardRecords",
  },
  {
    // ST-24 is a five-card supplement; its page carries nine OP07 reprints and
    // an EB01 one besides, which the `prefix` filter drops.
    id: "ST24",
    files: ["cardlist-st24.html"],
    prefix: "ST24-",
    expected: 5,
    output: "generated-st24.ts",
    binding: "st24CardRecords",
  },
  {
    // ST-25 is a five-card supplement; its page carries the OP09 and PRB02
    // reprints Bandai's Blue Buggy list plays beside it, which the `prefix`
    // filter drops.
    id: "ST25",
    files: ["cardlist-st25.html"],
    prefix: "ST25-",
    expected: 5,
    output: "generated-st25.ts",
    binding: "st25CardRecords",
  },
  {
    // ST-27 is a five-card supplement; its page carries nine OP09 reprints and
    // an OP10 one besides, which the `prefix` filter drops.
    id: "ST27",
    files: ["cardlist-st27.html"],
    prefix: "ST27-",
    expected: 5,
    output: "generated-st27.ts",
    binding: "st27CardRecords",
  },
  {
    // The promo "set" is not a set: 98 `P-` identities across every block,
    // printed in event packs, tournament kits and magazine inserts rather than
    // in a product of their own. Bandai lists them on one page (series 569901),
    // which also carries the reprints those packs shipped alongside -- 133
    // cards from thirty other products -- and the `prefix` filter drops those.
    //
    // Rarity `P` is theirs alone: a promo has no booster slot to fill, so the
    // rarity is a provenance stamp rather than a pull frequency. The one `L`
    // on the page is the promo Leader.
    id: "P",
    // Four pages, because Bandai lists some promos only beside the product
    // they shipped with: five `P-` identities are printed on the PRB-02 page
    // and on no other, P-084 Buggy at rarity `P` on the ST-25 page (its OP-17
    // print is the `SP CARD` collector treatment), and P-093 Trafalgar Law on
    // the "Other Product Card" page (series 569801) beside four more promos
    // printed nowhere else (P-072, P-152, P-153, P-154). The `prefix` filter
    // drops each page's own numbers, which belong to their series' entries.
    files: [
      "cardlist-promo.html",
      "cardlist-prb02.html",
      "cardlist-st25.html",
      "cardlist-other.html",
    ],
    prefix: "P-",
    expected: 109,
    output: "generated-p.ts",
    binding: "pCardRecords",
  },
  {
    // ST-11 is a five-card Ultra Deck supplement, not a starter: one Leader
    // and four cards, on a page that also carries the OP02 reprints the box
    // shipped alongside them.
    id: "ST11",
    files: ["cardlist-st11.html"],
    prefix: "ST11-",
    expected: 5,
    output: "generated-st11.ts",
    binding: "st11CardRecords",
  },
  {
    // ST-12 is a standard 17-card starter, on its own series page.
    id: "ST12",
    files: ["cardlist-st12.html"],
    prefix: "ST12-",
    expected: 17,
    output: "generated-st12.ts",
    binding: "st12CardRecords",
  },
  {
    // ST-13 is an Ultra Deck: 19 cards and three Leaders, so neither the
    // starter make-up nor ST-10's -- it prints an R, which no other ST
    // product in the table does.
    id: "ST13",
    files: ["cardlist-st13.html"],
    prefix: "ST13-",
    expected: 19,
    output: "generated-st13.ts",
    binding: "st13CardRecords",
  },
  {
    // ST-15 is a five-card supplement; its page carries the OP02 and OP03
    // reprints the box shipped alongside them.
    id: "ST15",
    files: ["cardlist-st15.html"],
    prefix: "ST15-",
    expected: 5,
    output: "generated-st15.ts",
    binding: "st15CardRecords",
  },
  {
    // ST-17 is a five-card supplement; its page also carries OP01, OP02,
    // ST-03 and one promo reprint.
    id: "ST17",
    files: ["cardlist-st17.html"],
    prefix: "ST17-",
    expected: 5,
    output: "generated-st17.ts",
    binding: "st17CardRecords",
  },
  {
    // ST-19 is a five-card supplement; its page also carries OP02 and OP03
    // reprints.
    id: "ST19",
    files: ["cardlist-st19.html"],
    prefix: "ST19-",
    expected: 5,
    output: "generated-st19.ts",
    binding: "st19CardRecords",
  },
  {
    // ST-20 is a five-card supplement; its page also carries OP03 and ST-07
    // reprints.
    id: "ST20",
    files: ["cardlist-st20.html"],
    prefix: "ST20-",
    expected: 5,
    output: "generated-st20.ts",
    binding: "st20CardRecords",
  },
] as const;

/**
 * The rarities a card is printed at. `TR` and the like are alt-art reprints.
 *
 * `P` is the promo rarity, and it is the odd one: every other entry names a
 * booster slot, and a promo has none -- it comes in an event pack, a
 * tournament kit or a magazine. It is in the set all the same because it is
 * the *base* print of those identities, which is what this set answers, and
 * dropping it would leave 98 cards with no printable rarity at all.
 */
const CARD_RARITIES = new Set(["C", "UC", "R", "SR", "SEC", "L", "P"]);

const setCards: Array<OfficialCard & { rarity: string }> = [];
const setComparisons: ReturnType<typeof compareToSecondary>[] = [];
/** Each series' own records, so every set writes its own generated module. */
const setCardsBySeries = new Map<
  string,
  Array<OfficialCard & { rarity: string }>
>();
for (const series of setSeries) {
  const seriesCards: Array<OfficialCard & { rarity: string }> = [];
  setCardsBySeries.set(series.id, seriesCards);
  // A card with alt-art prints appears once per print, so dedupe by number.
  // The prints differ only in rarity -- an alt art is the same card -- and the
  // base print is the one whose rarity is a printable rarity rather than a
  // collector treatment like `TR`. Everything else must agree, or the page is
  // saying two different things about one card and the run stops.
  const byNumber = new Map<string, OfficialCard & { rarity: string }>();
  const pages = await Promise.all(
    series.files.map((file) => readFile(join(root, "bandai", file), "utf8")),
  );
  for (const card of pages.flatMap((page) => parseOfficialCards(page))) {
    if (!card.cardNumber.startsWith(series.prefix)) continue;
    const existing = byNumber.get(card.cardNumber);
    if (!existing) {
      byNumber.set(card.cardNumber, card);
      continue;
    }
    if (sha256({ ...existing, rarity: "" }) !== sha256({ ...card, rarity: "" }))
      throw new Error(
        `${series.id}: prints of ${card.cardNumber} disagree beyond rarity`,
      );
    if (!CARD_RARITIES.has(existing.rarity) && CARD_RARITIES.has(card.rarity))
      byNumber.set(card.cardNumber, card);
  }
  if (byNumber.size !== series.expected)
    throw new Error(
      `${series.id} official list has ${byNumber.size} cards, expected ${series.expected}`,
    );
  for (const card of [...byNumber.values()].sort((left, right) =>
    left.cardNumber.localeCompare(right.cardNumber),
  )) {
    if (!CARD_RARITIES.has(card.rarity))
      throw new Error(
        `${series.id}: ${card.cardNumber} has no printable rarity, only ${card.rarity}`,
      );
    setCards.push(card);
    seriesCards.push(card);
    setComparisons.push(compareToSecondary(card));
  }
}

// The committed record carries what the rules derive from the text and a hash
// of the text; the text itself goes to the gitignored pack written below. The
// two are produced from the same parsed record, so the hash beside the rules
// is the hash of the words in the pack.
const parsedRecord = (
  card: OfficialCard,
  sourceMatch: boolean,
  rarity?: string,
) => ({
  cardNumber: card.cardNumber,
  name: card.name,
  category: card.category.toLowerCase(),
  cost: card.cost,
  power: card.power,
  counter: card.counter,
  colors: card.color,
  types: card.types,
  attribute: card.attribute,
  effect: card.effect,
  trigger: card.trigger,
  ...(rarity === undefined ? {} : { rarity }),
  sourceMatch,
});
const commit = (
  parsed: ReturnType<typeof parsedRecord>,
  options: { keepExistingText?: boolean } = {},
) => {
  if (!(options.keepExistingText && parsed.cardNumber in textPack)) {
    textPack[parsed.cardNumber] = textPackEntry(parsed);
  }
  return toCommittedRecord(parsed);
};

const generatedSetCards = (
  records: readonly (OfficialCard & { rarity: string })[],
) => records.map((card) => commit(parsedRecord(card, true, card.rarity)));

// Format records first and set records after: a card on both pages keeps the
// set page's text in the pack, matching the registry, where a set record wins.
const generatedCards = cards.map((card) =>
  commit(
    parsedRecord(
      card,
      comparisons.find((entry) => entry.cardNumber === card.cardNumber)
        ?.sourceMatch ?? false,
    ),
  ),
);

await writeFile(
  join(process.cwd(), "packages", "cards", "src", "generated.ts"),
  `// Generated by pnpm reference:audit. Do not edit.\nexport const formatCardRecords = ${JSON.stringify(generatedCards, null, 2)} as const;\n`,
);
await writeFile(
  join(process.cwd(), "packages", "decks", "src", "generated.ts"),
  `// Generated by pnpm reference:audit. Do not edit.\nexport const formatDeckManifests = ${JSON.stringify(decks, null, 2)} as const;\n`,
);
for (const series of setSeries) {
  await writeFile(
    join(process.cwd(), "packages", "cards", "src", series.output),
    `// Generated by pnpm reference:audit. Do not edit.\nexport const ${series.binding} = ${JSON.stringify(
      generatedSetCards(setCardsBySeries.get(series.id) ?? []),
      null,
      2,
    )} as const;\n`,
  );
}
await writeFile(
  join(process.cwd(), "packages", "cards", "src", "generated-blocks.ts"),
  [
    "// Generated by pnpm reference:audit. Do not edit.",
    "/** A block icon as Bandai prints it. `X` never rotates out of Standard. */",
    'export type GeneratedBlockIcon = "1" | "2" | "3" | "4" | "5" | "X";',
    "/** The reference snapshot these printings were read from. */",
    `export const blockPrintingSnapshot = ${JSON.stringify(snapshot)};`,
    "/** Every block icon each card number is printed with, across the snapshot. */",
    `export const cardBlockPrintings: Readonly<Record<string, readonly GeneratedBlockIcon[]>> = ${JSON.stringify(
      toBlockPrintingMap(blockPrintings),
      null,
      2,
    )};`,
    "",
  ].join("\n"),
);
const generatedCommunityCards = [...communityRecords.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  // No rarity: only a whole-set import stamps one, because a booster slot is
  // filled from a set's records and a deck's single is not a set.
  // A community deck's page can print a card the set import already carries
  // in different words (OP10-065 Sugar, see packages/cards/src/index.ts); the
  // set record wins in the registry, so its text wins in the pack.
  .map(([, { card, sourceMatch }]) =>
    commit(parsedRecord(card, sourceMatch), { keepExistingText: true }),
  );
// Last, after every pass has committed its records, so the pack holds every
// card's words.
await writeFile(
  join(process.cwd(), "packages", "cards", "printed-text.json"),
  textPackFile(`Bandai card list, reference snapshot ${snapshot}`, textPack),
);
await writeFile(
  join(process.cwd(), "packages", "cards", "src", "generated-community.ts"),
  `// Generated by pnpm reference:audit. Do not edit.\nexport const communityCardRecords = ${JSON.stringify(generatedCommunityCards, null, 2)} as const;\n`,
);
// The report is the only file in its directory, and it is not committed, so a
// fresh checkout has no directory to write it into.
await mkdir(join(process.cwd(), "docs", "rules-map"), { recursive: true });
await writeFile(
  join(process.cwd(), "docs", "rules-map", "card-audit.json"),
  `${JSON.stringify(
    {
      snapshot,
      officialRecords: cards.length,
      exactSecondaryMatches: comparisons.filter(
        (entry) => entry.exactSecondaryMatch,
      ).length,
      comparisons,
      communityDecks: communityDecks.map((deck) => deck.id),
      communityComparisons,
      blockPrintingFiles: cardlistFiles,
      blockPrintingIdentities: blockPrintings.size,
      sets: setSeries.map((series) => series.id),
      setRecords: setCards.length,
      setExactSecondaryMatches: setComparisons.filter(
        (entry) => entry.exactSecondaryMatch,
      ).length,
      setComparisons,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Audited ${cards.length} official records across ${decks.length} decks; ${comparisons.filter((entry) => entry.exactSecondaryMatch).length} exact secondary matches.`,
);
console.log(
  `Audited ${communityComparisons.length} community-deck identities across ${communityDecks.length} decks; ${communityComparisons.filter((entry) => entry.exactSecondaryMatch).length} exact secondary matches.`,
);
console.log(
  `Stamped block icons for ${blockPrintings.size} identities across ${cardlistFiles.length} cardlist pages.`,
);
console.log(
  `Audited ${setComparisons.length} set identities across ${setSeries.length} sets; ${setComparisons.filter((entry) => entry.exactSecondaryMatch).length} exact secondary matches.`,
);
