import {
  blockIconLegality,
  cardBlockIcons,
  requireKnownCard,
  type BlockIcon,
  type DeckFormat,
} from "@one-piece-sim/cards";
import { formatDeckManifests } from "./generated.js";
import { op16EnelManifest } from "./op16-enel-manifest.js";
import { op16EnelEuFinalManifest } from "./op16-enel-eu-final-manifest.js";
import { op13LuffyManifest } from "./op13-luffy-manifest.js";
import { op16NamiManifest } from "./op16-nami-manifest.js";
import { op16SengokuManifest } from "./op16-sengoku-manifest.js";
import { op16TeachManifest } from "./op16-teach-manifest.js";
import { op13SaboManifest } from "./op13-sabo-manifest.js";
import { op17ShanksManifest } from "./op17-shanks-manifest.js";
import { op17XebecManifest } from "./op17-xebec-manifest.js";
import { op17KaidoManifest } from "./op17-kaido-manifest.js";
import { op17KaidoFieldManifest } from "./op17-kaido-field-manifest.js";
import { op17LuffyManifest } from "./op17-luffy-manifest.js";
import { op17LuffyTournamentManifest } from "./op17-luffy-tournament-manifest.js";
import { op16AceOpenManifest } from "./op16-ace-open-manifest.js";
import { op17XebecOpenManifest } from "./op17-xebec-open-manifest.js";
import { op08PuddingManifest } from "./op08-pudding-manifest.js";
import { op05EnelOpenManifest } from "./op05-enel-open-manifest.js";
import { op12ZoroManifest } from "./op12-zoro-manifest.js";
import { op14MihawkManifest } from "./op14-mihawk-manifest.js";
import { op16AceManifest } from "./op16-ace-manifest.js";
import { op06YamatoManifest } from "./op06-yamato-manifest.js";
import { eb04BonneyManifest } from "./eb04-bonney-manifest.js";
import { op09RobinManifest } from "./op09-robin-manifest.js";
import { op17NewgateManifest } from "./op17-newgate-manifest.js";
import { op15KriegManifest } from "./op15-krieg-manifest.js";
import { op17LinlinManifest } from "./op17-linlin-manifest.js";
import { op15LucyManifest } from "./op15-lucy-manifest.js";
import { op15BrookManifest } from "./op15-brook-manifest.js";
import { op15RebeccaManifest } from "./op15-rebecca-manifest.js";
import { op13ImuManifest } from "./op13-imu-manifest.js";
import { op13RogerManifest } from "./op13-roger-manifest.js";
import { op15LuffyManifest } from "./op15-luffy-manifest.js";
import { eb03ViviManifest } from "./eb03-vivi-manifest.js";
import { st33KuzanTournamentManifest } from "./st33-kuzan-tournament-manifest.js";
import { op06ReijuTournamentManifest } from "./op06-reiju-tournament-manifest.js";
import { op11KobyTournamentManifest } from "./op11-koby-tournament-manifest.js";
import { op07VegapunkTournamentManifest } from "./op07-vegapunk-tournament-manifest.js";
import { op14LawManifest } from "./op14-law-manifest.js";
import { op14HancockManifest } from "./op14-hancock-manifest.js";
import { op14HancockTournamentManifest } from "./op14-hancock-tournament-manifest.js";
import { op14JinbeManifest } from "./op14-jinbe-manifest.js";
import { op16YamatoManifest } from "./op16-yamato-manifest.js";
import { op14CrocodileManifest } from "./op14-crocodile-manifest.js";
import { op14MoriaManifest } from "./op14-moria-manifest.js";
import { op12KoalaManifest } from "./op12-koala-manifest.js";
import { eb02LuffyManifest } from "./eb02-luffy-manifest.js";
import { op11ShirahoshiManifest } from "./op11-shirahoshi-manifest.js";
import { op13AceManifest } from "./op13-ace-manifest.js";
import { op12SanjiManifest } from "./op12-sanji-manifest.js";
import { op10UsoppManifest } from "./op10-usopp-manifest.js";
import { op11JinbeManifest } from "./op11-jinbe-manifest.js";
import { op09BuggyManifest } from "./op09-buggy-manifest.js";
import { op12RayleighManifest } from "./op12-rayleigh-manifest.js";
import { op14DoflamingoManifest } from "./op14-doflamingo-manifest.js";
import { st18LuffyManifest } from "./st18-luffy-manifest.js";
import { st26LuffyManifest } from "./st26-luffy-manifest.js";
import { st27TeachManifest } from "./st27-teach-manifest.js";
import { st22AceNewgateManifest } from "./st22-ace-newgate-manifest.js";
import { st23ShanksManifest } from "./st23-shanks-manifest.js";
import { st29LuffyManifest } from "./st29-luffy-manifest.js";
import { st30LuffyAceManifest } from "./st30-luffy-ace-manifest.js";
import { op17LuffyAceManifest } from "./op17-luffy-ace-manifest.js";
import { deckFormat, type DeckManifest } from "./index.js";

/**
 * Where every shipped deck's printed text came from, one row per identity.
 *
 * This used to be a "certification matrix": alongside the provenance stamp it
 * carried `implementationIds`, `positiveTestIds` and `negativeTestIds` derived
 * from the deck id and the card number, so `test/st35.test.ts:OP13-004:positive`
 * was a string no file had to honour. That is claimed evidence, not evidence.
 * The real gates are elsewhere and they execute:
 *
 *  - `test/card-support.test.ts` fails a registry card whose printed clause has
 *    no registered handler, with `UNIMPLEMENTED_CLAUSES` the only declared
 *    escape hatch and a ratchet on its size;
 *  - `pnpm coverage:clauses --check` derives the required clauses from the
 *    printed text and fails one that no test claims with `covers()`.
 *
 * What is left here is the part that cannot be derived from the repo: which
 * source a card's text was read from, and whether the deck it sits in is a
 * legal 50. `pnpm coverage:clauses` also reads these rows to know which
 * identities a shipped deck actually contains.
 */
export interface DeckCardRow {
  deckId: string;
  cardNumber: string;
  role: "leader" | "deck-card";
  quantity: number;
  /** sha256 of the printed effect and trigger, stamped by `reference:audit`. */
  officialTextHash: string;
  /** Whether Bandai's own cardlist carries this text, not just a secondary. */
  sourceMatch: boolean;
  /** The format the deck this row belongs to declares it is built for. */
  format: DeckFormat;
  /**
   * Every block icon this identity is printed with, stamped by
   * `reference:audit` from Bandai's own cardlist.
   *
   * Denormalised onto the row for the same reason `officialTextHash` is: the
   * row is the unit a caller validates, and a caller holding hand-built rows
   * should not have to reach back into the card registry to be checked.
   */
  blocks: readonly BlockIcon[];
}

export type FormatDeckRowId = (typeof formatDeckManifests)[number]["id"];

/**
 * Identities with no record on Bandai's English cardlist, whose text is stamped
 * from the secondary source alone.
 *
 * Every other row must match the primary source. Keep this as short as the
 * facts allow: an entry stops being true the moment Bandai publishes the card,
 * and `pnpm reference:audit` throws when that happens rather than leaving a
 * stale exemption in place. Empty at present: no shipped deck plays a card
 * Bandai's English cardlist lacks.
 */
export const SECONDARY_SOURCE_ONLY: readonly string[] = [];

/**
 * Decks whose card pool did not come from one of Bandai's own structure
 * decks -- a meta list transcribed from a secondary source -- so they cannot
 * be folded into {@link formatDeckCardRows}, which is generated directly from
 * Bandai's per-deck cardlist pages. Each identity is instead validated on its
 * own against the same primary/secondary sources by `pnpm reference:audit`;
 * see `op16-nami.ts`.
 */
export type CommunityDeckId =
  | "(Blue/Yellow) Nami - Official Feature Deck"
  | "(Black/Yellow) Marshall.D.Teach - Official Feature Deck"
  | "(Purple) Enel - Official Feature Deck"
  | "(Red/Black) Sabo - OP17 Elbaph List"
  | "(Green) Shanks - Official Feature Deck"
  | "(Blue) Rocks.D.Xebec - Official Feature Deck"
  | "(Black) Monkey.D.Luffy - Official Feature Deck"
  | "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1"
  | "(Red) Portgas.D.Ace - Official Feature Deck"
  | "(Purple) Kaido - Official Feature Deck"
  | "(Red/Yellow) Jewelry Bonney - Official Feature Deck"
  | "(Green/Yellow) Yamato - Official Feature Deck"
  | "(Red) Edward.Newgate - Official Feature Deck"
  | "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1"
  | "(Purple) Sengoku - Official Feature Deck"
  | "(Red/Green) Krieg - Official Feature Deck"
  | "(Red/Blue) Lucy - Official Feature Deck"
  | "(Blue) Rebecca - Official Feature Deck"
  | "(Black) Imu - Official Feature Deck"
  | "(Red/Purple) Gol.D.Roger - Official Feature Deck"
  | "(Green/Black) Brook - Official Feature Deck"
  | "(Yellow) Monkey.D.Luffy - Official Feature Deck"
  | "(Red/Blue) Nefeltari Vivi - Official Feature Deck"
  | "(Red) Trafalgar Law - Official Feature Deck"
  | "(Blue/Yellow) Boa Hancock - Official Feature Deck"
  | "(Blue) Jinbe - Official Feature Deck"
  | "(Black) Yamato - Official Feature Deck"
  | "(Black) Crocodile - Official Feature Deck"
  | "(Black/Yellow) Gecko Moria - Official Feature Deck"
  | "(Black/Yellow) Koala - Official Feature Deck"
  | "(Green/Purple) Monkey.D.Luffy - Official Feature Deck"
  | "(Green/Yellow) Shirahoshi - Official Feature Deck"
  | "(Red/Blue) Portgas.D.Ace - Official Feature Deck"
  | "(Blue/Purple) Sanji - Official Feature Deck"
  | "(Blue/Black) Usopp - Official Feature Deck"
  | "(Green) Jinbe - Official Feature Deck"
  | "(Blue) Buggy - Official Feature Deck"
  | "(Red) Silvers Rayleigh - Official Feature Deck"
  | "(Purple) Donquixote Doflamingo - Official Feature Deck"
  | "(Yellow) Charlotte Linlin - Official Feature Deck"
  /**
   * The Europe Championship 26-27 Season 1 winner, a second list under the
   * Enel Leader. Off a tournament record rather than a Bandai page, so its
   * identities are validated one by one here like the feature deck's.
   */
  | "(Purple) Enel - 1st Place EU Championship 26-27 S1"
  /**
   * The OP-17 field's Kaido list, a second under the feature deck's Leader,
   * off a tournament record -- so validated identity by identity here.
   */
  | "(Purple) Kaido - Open OPTCG"
  /**
   * The OP-17 field's Straw Hat rush list under the ST-30 starter's Leader.
   * Off a supplied card list rather than a Bandai page, so its identities are
   * validated one by one here.
   */
  | "(Red/Green) Luffy & Ace - Open OPTCG"
  /**
   * The Red/Green Luffy list behind OP13-001, supplied to the project rather
   * than read off one event's record -- so validated identity by identity here.
   */
  | "(Red/Green) Monkey.D.Luffy - Open OPTCG"
  /**
   * A supplied list under the OP17-079 Leader, a second one beside the
   * feature deck, validated one identity at a time like the lists above.
   */
  | "(Black) Monkey.D.Luffy - Open OPTCG"
  /**
   * A supplied list under the OP16-001 Leader, a second one beside the
   * feature deck, validated one identity at a time like the lists above.
   */
  | "(Red) Portgas.D.Ace - Open OPTCG"
  /**
   * A supplied list under the OP17-039 Leader, a second one beside the
   * feature deck, validated one identity at a time like the lists above.
   */
  | "(Blue) Rocks.D.Xebec - Open OPTCG"
  /**
   * A supplied list under the OP08-058 Leader, which no other shipped deck
   * fronts, validated one identity at a time like the lists above.
   */
  | "(Purple/Yellow) Charlotte Pudding - Open OPTCG"
  /**
   * A supplied list under the OP05-098 Leader, the first deck in the catalog
   * behind it, validated one identity at a time like the lists above.
   */
  | "(Yellow) Enel - Open OPTCG"
  /**
   * A tournament list under the OP12-020 Leader that Starter Deck 32 also
   * fronts, built for the OP-17 field after the OP14-020 ban, validated one
   * identity at a time like the lists above.
   */
  | "(Green) Roronoa Zoro - OP17 Post-Ban List"
  /**
   * A 1st-place list under the OP12-040 Leader, a second one beside the ST-33
   * precon, read off one event's `deckgen` record and validated one identity
   * at a time like the lists above.
   */
  | "(Blue) Kuzan - 1st Place Bandai Hiroshima"
  /**
   * Tournament lists for three Leaders no other shipped deck fronts, chosen
   * for the identities they bring into the catalog. Same standing as the
   * Kuzan list above.
   */
  | "(Blue/Purple) Vinsmoke Reiju - 1st Place Store Battle"
  | "(Red/Black) Koby - 2nd Place Indonesia Regional Final"
  | "(Yellow) Vegapunk - 1st Place Store Battle"
  /**
   * A second list under the OP14-041 Leader beside Bandai's feature deck: the
   * 25th-place entry at ChinoizeCup #105, an online event played on
   * 2 Sep 2026, read off Limitless TCG's results and validated one identity
   * at a time like the lists above.
   */
  | "(Blue/Yellow) Boa Hancock - 25th Place ChinoizeCup #105"
  /**
   * Bandai's ST-18 precon, whose Leader is the OP05-060 reprint. Same standing
   * as ST-26 below: off a Bandai page rather than out of the ST31-36 loop, so
   * its identities are validated one by one here.
   */
  | "(Purple) Monkey.D.Luffy - Starter Deck 18"
  /**
   * Bandai's ST-22 precon, exactly as sold: all 17 identities its own, so the
   * whole-product import stamps every one of them.
   */
  | "(Blue) Ace & Newgate - Starter Deck 22"
  /**
   * Bandai's ST-23 precon, exactly as sold: the Leader and nine slots are
   * OP-09 reprints, ST23-004 came with the ST-31 list, and the other four
   * identities come through the community pass.
   */
  | "(Red) Shanks - Starter Deck 23"
  /**
   * Bandai's ST-26 precon. Not one of the six the format is built from, so
   * `generated.ts` does not carry it and its identities are validated one by
   * one here like every other list off a page rather than out of the ST31-36
   * loop.
   */
  | "(Purple/Black) Monkey.D.Luffy - Starter Deck 26"
  /**
   * Bandai's own recommended list for the ST-27 precon: the starter plus two
   * PRB-02 singles and an EB-01 reprint. Same standing as ST-26 above -- off a
   * Bandai page rather than out of the ST31-36 loop -- and five of its
   * thirteen identities are stamped one by one by the community pass.
   */
  | "(Black) Marshall.D.Teach - Starter Deck 27"
  | "(Yellow) Monkey.D.Luffy - Starter Deck 29"
  | "(Red/Green) Luffy & Ace - Starter Deck 30";

const communityDeckManifests: Readonly<Record<CommunityDeckId, DeckManifest>> =
  {
    "(Blue/Yellow) Nami - Official Feature Deck": op16NamiManifest,
    "(Black/Yellow) Marshall.D.Teach - Official Feature Deck":
      op16TeachManifest,
    "(Purple) Enel - Official Feature Deck": op16EnelManifest,
    "(Red/Black) Sabo - OP17 Elbaph List": op13SaboManifest,
    "(Green) Shanks - Official Feature Deck": op17ShanksManifest,
    "(Blue) Rocks.D.Xebec - Official Feature Deck": op17XebecManifest,
    "(Black) Monkey.D.Luffy - Official Feature Deck": op17LuffyManifest,
    "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1":
      op14MihawkManifest,
    "(Red) Portgas.D.Ace - Official Feature Deck": op16AceManifest,
    "(Purple) Kaido - Official Feature Deck": op17KaidoManifest,
    "(Red/Yellow) Jewelry Bonney - Official Feature Deck": eb04BonneyManifest,
    "(Green/Yellow) Yamato - Official Feature Deck": op06YamatoManifest,
    "(Red) Edward.Newgate - Official Feature Deck": op17NewgateManifest,
    "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1":
      op09RobinManifest,
    "(Purple) Sengoku - Official Feature Deck": op16SengokuManifest,
    "(Red/Green) Krieg - Official Feature Deck": op15KriegManifest,
    "(Red/Blue) Lucy - Official Feature Deck": op15LucyManifest,
    "(Blue) Rebecca - Official Feature Deck": op15RebeccaManifest,
    "(Black) Imu - Official Feature Deck": op13ImuManifest,
    "(Red/Purple) Gol.D.Roger - Official Feature Deck": op13RogerManifest,
    "(Green/Black) Brook - Official Feature Deck": op15BrookManifest,
    "(Yellow) Monkey.D.Luffy - Official Feature Deck": op15LuffyManifest,
    "(Red/Blue) Nefeltari Vivi - Official Feature Deck": eb03ViviManifest,
    "(Red) Trafalgar Law - Official Feature Deck": op14LawManifest,
    "(Blue/Yellow) Boa Hancock - Official Feature Deck": op14HancockManifest,
    "(Blue) Jinbe - Official Feature Deck": op14JinbeManifest,
    "(Black) Yamato - Official Feature Deck": op16YamatoManifest,
    "(Black) Crocodile - Official Feature Deck": op14CrocodileManifest,
    "(Black/Yellow) Gecko Moria - Official Feature Deck": op14MoriaManifest,
    "(Black/Yellow) Koala - Official Feature Deck": op12KoalaManifest,
    "(Green/Purple) Monkey.D.Luffy - Official Feature Deck": eb02LuffyManifest,
    "(Green/Yellow) Shirahoshi - Official Feature Deck": op11ShirahoshiManifest,
    "(Red/Blue) Portgas.D.Ace - Official Feature Deck": op13AceManifest,
    "(Blue/Purple) Sanji - Official Feature Deck": op12SanjiManifest,
    "(Blue/Black) Usopp - Official Feature Deck": op10UsoppManifest,
    "(Green) Jinbe - Official Feature Deck": op11JinbeManifest,
    "(Blue) Buggy - Official Feature Deck": op09BuggyManifest,
    "(Red) Silvers Rayleigh - Official Feature Deck": op12RayleighManifest,
    "(Purple) Donquixote Doflamingo - Official Feature Deck":
      op14DoflamingoManifest,
    "(Yellow) Charlotte Linlin - Official Feature Deck": op17LinlinManifest,
    "(Purple) Enel - 1st Place EU Championship 26-27 S1":
      op16EnelEuFinalManifest,
    "(Purple) Kaido - Open OPTCG": op17KaidoFieldManifest,
    "(Red/Green) Luffy & Ace - Open OPTCG": op17LuffyAceManifest,
    "(Red/Green) Monkey.D.Luffy - Open OPTCG": op13LuffyManifest,
    "(Black) Monkey.D.Luffy - Open OPTCG": op17LuffyTournamentManifest,
    "(Red) Portgas.D.Ace - Open OPTCG": op16AceOpenManifest,
    "(Blue) Rocks.D.Xebec - Open OPTCG": op17XebecOpenManifest,
    "(Purple/Yellow) Charlotte Pudding - Open OPTCG": op08PuddingManifest,
    "(Yellow) Enel - Open OPTCG": op05EnelOpenManifest,
    "(Green) Roronoa Zoro - OP17 Post-Ban List": op12ZoroManifest,
    "(Blue) Kuzan - 1st Place Bandai Hiroshima": st33KuzanTournamentManifest,
    "(Blue/Purple) Vinsmoke Reiju - 1st Place Store Battle":
      op06ReijuTournamentManifest,
    "(Red/Black) Koby - 2nd Place Indonesia Regional Final":
      op11KobyTournamentManifest,
    "(Yellow) Vegapunk - 1st Place Store Battle":
      op07VegapunkTournamentManifest,
    "(Blue/Yellow) Boa Hancock - 25th Place ChinoizeCup #105":
      op14HancockTournamentManifest,
    "(Purple) Monkey.D.Luffy - Starter Deck 18": st18LuffyManifest,
    "(Blue) Ace & Newgate - Starter Deck 22": st22AceNewgateManifest,
    "(Red) Shanks - Starter Deck 23": st23ShanksManifest,
    "(Purple/Black) Monkey.D.Luffy - Starter Deck 26": st26LuffyManifest,
    "(Black) Marshall.D.Teach - Starter Deck 27": st27TeachManifest,
    "(Yellow) Monkey.D.Luffy - Starter Deck 29": st29LuffyManifest,
    "(Red/Green) Luffy & Ace - Starter Deck 30": st30LuffyAceManifest,
  };

export const COMMUNITY_DECK_IDS: readonly CommunityDeckId[] = Object.keys(
  communityDeckManifests,
) as CommunityDeckId[];

function rowsFor(deckId: string, deck: DeckManifest): DeckCardRow[] {
  return [
    [deck.leader, "leader", 1] as const,
    ...Object.entries(deck.cards).map(
      ([cardNumber, quantity]) => [cardNumber, "deck-card", quantity] as const,
    ),
  ].map(([cardNumber, role, quantity]) => {
    const card = requireKnownCard(cardNumber);
    return {
      deckId,
      cardNumber,
      role,
      quantity,
      officialTextHash: card.officialTextHash ?? "",
      sourceMatch: card.sourceMatch ?? false,
      format: deckFormat(deck),
      blocks: cardBlockIcons(cardNumber),
    };
  });
}

export const formatDeckCardRows: readonly DeckCardRow[] =
  formatDeckManifests.flatMap((deck) => rowsFor(deck.id, deck as DeckManifest));

export const communityDeckCardRows: readonly DeckCardRow[] =
  COMMUNITY_DECK_IDS.flatMap((deckId) =>
    rowsFor(deckId, communityDeckManifests[deckId]),
  );

/** Every shipped deck's rows, format and community alike. */
export const deckCardRows: readonly DeckCardRow[] = [
  ...formatDeckCardRows,
  ...communityDeckCardRows,
];

/**
 * Every shipped deck by id, as a Map rather than a lookup on the two records.
 *
 * `deckId` is a plain string here so a caller can validate hand-built rows, and
 * indexing a total `Record` with one would type the miss away.
 */
const shippedDecks = new Map<string, DeckManifest>([
  ...formatDeckManifests.map((deck): [string, DeckManifest] => [
    deck.id,
    deck as DeckManifest,
  ]),
  ...COMMUNITY_DECK_IDS.map((deckId): [string, DeckManifest] => [
    deckId,
    communityDeckManifests[deckId],
  ]),
]);

/**
 * What is wrong with a set of rows, as a list of human-readable errors.
 *
 * Four things are checked, and all four are facts about the data rather than
 * claims about the tests: the deck is a legal 50 behind one Leader, every
 * identity carries a text hash, every identity's text was read from Bandai's
 * own cardlist unless it is a declared {@link SECONDARY_SOURCE_ONLY} exception,
 * and every identity is legal in the format the deck declares.
 */
export function validateDeckCardRows(
  rows: readonly DeckCardRow[] = deckCardRows,
): string[] {
  const errors: string[] = [];
  const rowKeys = new Set<string>();

  for (const deckId of new Set(rows.map((row) => row.deckId))) {
    const deck = shippedDecks.get(deckId);
    const deckRows = rows.filter((row) => row.deckId === deckId);
    const leaders = deckRows.filter((row) => row.role === "leader");
    const deckSize = deckRows
      .filter((row) => row.role === "deck-card")
      .reduce((total, row) => total + row.quantity, 0);
    if (leaders.length !== 1 || leaders[0]?.cardNumber !== deck?.leader) {
      errors.push(`${deckId}: expected leader ${deck?.leader ?? "(unknown)"}`);
    }
    if (deckSize !== 50)
      errors.push(`${deckId}: expected 50 cards, got ${deckSize}`);
  }

  for (const row of rows) {
    const key = `${row.deckId}:${row.cardNumber}`;
    if (rowKeys.has(key)) errors.push(`${key}: duplicate row`);
    rowKeys.add(key);
    if (!/^[a-f0-9]{64}$/.test(row.officialTextHash)) {
      errors.push(`${key}: missing or invalid official text hash`);
    }
    if (!row.sourceMatch && !SECONDARY_SOURCE_ONLY.includes(row.cardNumber)) {
      errors.push(`${key}: official source text is not matched`);
    }
    const legality = blockIconLegality(row.cardNumber, row.blocks, row.format);
    if (!legality.legal) errors.push(`${key}: ${legality.reason}`);
  }

  return errors;
}

export interface DeckFormatReport {
  deckId: string;
  format: DeckFormat;
  /** Every block icon the deck's identities are printed with, sorted. */
  blocks: readonly BlockIcon[];
  /** Identities that are not legal in the declared format, with the reason. */
  illegal: ReadonlyArray<{ cardNumber: string; reason: string }>;
}

/**
 * What format each deck declares and whether its identities hold up in it.
 *
 * The errors are the same ones {@link validateDeckCardRows} raises -- this adds
 * no rule of its own -- but grouped per deck and paired with the block spread,
 * which is what makes the report readable as "this list is Standard, built out
 * of blocks 4 and 5" rather than as a list of failures.
 */
export function deckFormatReport(
  rows: readonly DeckCardRow[] = deckCardRows,
): DeckFormatReport[] {
  return [...new Set(rows.map((row) => row.deckId))].map((deckId) => {
    const deckRows = rows.filter((row) => row.deckId === deckId);
    const blocks = [...new Set(deckRows.flatMap((row) => row.blocks))].sort();
    return {
      deckId,
      format: deckRows[0]?.format ?? "standard",
      blocks,
      illegal: deckRows
        .map((row) => blockIconLegality(row.cardNumber, row.blocks, row.format))
        .filter((legality) => !legality.legal)
        .map((legality) => ({
          cardNumber: legality.cardNumber,
          reason: legality.reason ?? "",
        })),
    };
  });
}
