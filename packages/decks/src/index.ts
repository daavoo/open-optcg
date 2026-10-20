import { requireKnownCard, type DeckFormat } from "@one-piece-sim/cards";
import type { ResolvedDeck } from "@one-piece-sim/protocol";
import { formatDeckManifests } from "./generated.js";
import { op16EnelManifest } from "./op16-enel-manifest.js";
import { op16EnelEuFinalManifest } from "./op16-enel-eu-final-manifest.js";
import { op16SengokuManifest } from "./op16-sengoku-manifest.js";
import { op16NamiManifest } from "./op16-nami-manifest.js";
import { op16TeachManifest } from "./op16-teach-manifest.js";
import { op13SaboManifest } from "./op13-sabo-manifest.js";
import { op17ShanksManifest } from "./op17-shanks-manifest.js";
import { op17XebecManifest } from "./op17-xebec-manifest.js";
import { op17KaidoManifest } from "./op17-kaido-manifest.js";
import { op17KaidoFieldManifest } from "./op17-kaido-field-manifest.js";
import { op13LuffyManifest } from "./op13-luffy-manifest.js";
import { op17LuffyManifest } from "./op17-luffy-manifest.js";
import { op17LuffyTournamentManifest } from "./op17-luffy-tournament-manifest.js";
import { st33KuzanTournamentManifest } from "./st33-kuzan-tournament-manifest.js";
import { op06ReijuTournamentManifest } from "./op06-reiju-tournament-manifest.js";
import { op11KobyTournamentManifest } from "./op11-koby-tournament-manifest.js";
import { op07VegapunkTournamentManifest } from "./op07-vegapunk-tournament-manifest.js";
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
import { op14LawManifest } from "./op14-law-manifest.js";
import { op14HancockManifest } from "./op14-hancock-manifest.js";
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

export type { DeckFormat } from "@one-piece-sim/cards";
// Whether a deck may be played at all. Shared by the deck editor, sealed play
// and the deck tooling, which is why it is here rather than in any of them.
export {
  copyLimit,
  isEventRestricted,
  validateDeck,
  type DeckValidation,
  type EditableDeck,
} from "./legality.js";

export {
  deckCardRows,
  formatDeckCardRows,
  communityDeckCardRows,
  validateDeckCardRows,
  COMMUNITY_DECK_IDS,
  SECONDARY_SOURCE_ONLY,
  deckFormatReport,
  type DeckFormatReport,
  type DeckCardRow,
  type FormatDeckRowId,
  type CommunityDeckId,
} from "./deck-provenance.js";

export {
  autoBuildSealedDeck,
  autoBuildSealedDeckGrape,
  classifyGrape,
  GRAPE_FILL_ORDER,
  openPacks,
  playablePoolCards,
  poolCounts,
  rankSealedPoolCandidates,
  rankSealedPoolCandidatesGrape,
  requireSealedExpansion,
  sealedCardsByRarity,
  sealedDeckManifest,
  sealedExpansion,
  sealedPoolCoverage,
  sealedPoolIsBuildable,
  sealedSetPrefix,
  sealedSideboard,
  validateSealedDeck,
  BOOSTER_PACK,
  DEFAULT_SEALED_EXPANSION,
  SEALED_DECK_SIZE,
  SEALED_EXPANSIONS,
  SEALED_LEADER,
  SEALED_PACK_COUNT,
  type GrapeBucket,
  type GrapeBuildOptions,
  type GrapePMembership,
  type PackSlot,
  type RankedSealedCandidate,
  type SealedDeck,
  type SealedExpansion,
  type SealedPool,
  type SealedPoolCoverage,
  type SealedValidation,
} from "./sealed.js";

export const FORMAT_DECK_IDS = [
  "(Red) Monkey.D.Luffy - Starter Deck 31",
  "(Green) Roronoa Zoro - Starter Deck 32",
  "(Blue) Kuzan - Starter Deck 33",
  "(Purple) Charlotte Katakuri - Starter Deck 34",
  "(Red/Black) Sabo - Starter Deck 35",
  "(Yellow) Eustass Kid - Starter Deck 36",
] as const;
export type FormatDeckId = (typeof FORMAT_DECK_IDS)[number];

/**
 * Decks assembled here rather than imported from a Bandai list: a Green/Blue
 * Luffy meta list.
 */
export const HAND_BUILT_DECK_IDS = [
  "(Green/Blue) Monkey.D.Luffy - Official Feature Deck",
] as const;
export type HandBuiltDeckId = (typeof HAND_BUILT_DECK_IDS)[number];

/**
 * Bandai's own starter decks from outside the ST31-36 format.
 *
 * Separate from {@link FORMAT_DECK_IDS}, which `generated.ts` builds from
 * Bandai's per-deck pages for the six decks the format is defined as, and from
 * the meta lists below, which are somebody's build rather than a product. A
 * deck here is a product Bandai publishes a card list for -- the precon exactly
 * as sold (ST-26), or the "recommended deck" Bandai itself prints for one
 * (ST-27, the starter plus two PRB-02 singles and an EB-01 reprint). Either
 * way no slot in it is a judgement call of ours, and that is the point of
 * having them in the catalog.
 */
export const STARTER_DECK_IDS = [
  "(Purple) Monkey.D.Luffy - Starter Deck 18",
  "(Blue) Ace & Newgate - Starter Deck 22",
  "(Red) Shanks - Starter Deck 23",
  "(Purple/Black) Monkey.D.Luffy - Starter Deck 26",
  "(Black) Marshall.D.Teach - Starter Deck 27",
  "(Yellow) Monkey.D.Luffy - Starter Deck 29",
  "(Red/Green) Luffy & Ace - Starter Deck 30",
] as const;
export type StarterDeckId = (typeof STARTER_DECK_IDS)[number];

/**
 * Which shelf of the catalog a shipped deck sits on, read off its id.
 *
 * Every shipped id ends in where the list came from -- "- Starter Deck 34",
 * "- Official Feature Deck", "- 1st Place EU Championship 26-27 S1" -- and
 * that suffix is the distinction a player is making when they browse decks: a
 * Bandai product, a list Bandai itself features, or a list read from a
 * tournament. Those three are the whole catalog: every list that is not a
 * Bandai product or a Bandai feature deck was transcribed from an event's
 * results, whether its id carries the placing or, as the OP-17 Elbaph Sabo
 * list does, only the archetype. Derived rather than enumerated so a deck
 * added to one of the id tuples above is shelved by the name it is already
 * given, and so no second list can drift out of step with them.
 */
export type DeckShelf = "starter" | "official" | "tournament";

const STARTER_DECK_SUFFIX = / - Starter Deck (\d+)$/;

export function deckShelf(deckId: string): DeckShelf {
  if (STARTER_DECK_SUFFIX.test(deckId)) return "starter";
  if (deckId.endsWith(" - Official Feature Deck")) return "official";
  return "tournament";
}

/**
 * Which half of the deck standings a deck is measured in.
 *
 * The committed standings are two closed round-robins rather than one, because
 * an all-vs-all field has a mean of exactly 50% by construction: a rate in it is
 * a statement about the field it was measured in, so mixing Bandai's precons
 * with built lists made every rate a statement about that mixture. OP13-004
 * shows it plainly by fronting a deck on each shelf, ST-35 and the OP-17 Elbaph
 * list, whose rates in a mixed field sat at opposite ends of it. Read against
 * its own shelf, a precon's rate says whether its policy is piloting the product
 * it came in, and a built list's says whether it beats the lists people bring.
 *
 * Two divisions rather than three: `official` and `tournament` are the same
 * question -- somebody's fifty-card build -- and differ only in who published
 * it, while the three legacy starters would be a division of three decks and
 * six matchups, which is not a measurement.
 *
 * Derived from {@link deckShelf}, so a deck added to any of the id tuples above
 * is placed by the name it already has, and no list can drift out of step.
 */
export type DeckDivision = "featured" | "starter";

export function deckDivision(deckId: string): DeckDivision {
  return deckShelf(deckId) === "starter" ? "starter" : "featured";
}

/** A starter deck's product number, for ordering the shelf by it: ST-26 before
    ST-31, which reading them as strings would get right only by accident. */
export function starterDeckNumber(deckId: string): number | undefined {
  const match = STARTER_DECK_SUFFIX.exec(deckId);
  return match ? Number(match[1]) : undefined;
}

/**
 * Bandai's own entry for a list on https://en.onepiece-cardgame.com/feature/deck/.
 *
 * Carried by the manifest that was transcribed from that entry, because the
 * page is where the list came from and the shelf it sits on is named after it.
 * A deck on the official shelf that was read from somewhere else -- a
 * tournament list, a published Champion decklist, a build of our own -- leaves
 * it undefined rather than borrowing the page's entry for the same Leader,
 * which is a different fifty cards.
 */
export interface FeaturePageEntry {
  /** The `deck_NNN.php` page the list is printed on. */
  page: number;
  /** The date that page was posted to the feature-deck index, ISO. */
  posted: string;
}

/**
 * Order two decks the way the feature-deck page orders its own entries: the
 * most recent posting first, and within one posting date by ascending page
 * number, which is the order Bandai prints that day's batch in. A deck with no
 * entry sorts after every deck that has one, keeping its place among the rest.
 */
export function compareFeaturePageEntries(
  left: DeckManifest | undefined,
  right: DeckManifest | undefined,
): number {
  const a = left?.featuredOn;
  const b = right?.featuredOn;
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return a.posted === b.posted ? a.page - b.page : a.posted < b.posted ? 1 : -1;
}

/** The built lists: Bandai's feature decks and the tournament lists, one per
    Leader worth playing, plus the lists that share a Leader with a feature or
    starter deck. */
export const TOURNAMENT_DECK_IDS = [
  "(Blue/Yellow) Nami - Official Feature Deck",
  "(Black/Yellow) Marshall.D.Teach - Official Feature Deck",
  "(Purple) Enel - Official Feature Deck",
  "(Red/Black) Sabo - OP17 Elbaph List",
  "(Green) Shanks - Official Feature Deck",
  "(Blue) Rocks.D.Xebec - Official Feature Deck",
  "(Black) Monkey.D.Luffy - Official Feature Deck",
  "(Red) Portgas.D.Ace - Official Feature Deck",
  "(Purple) Kaido - Official Feature Deck",
  "(Green/Yellow) Yamato - Official Feature Deck",
  "(Red/Yellow) Jewelry Bonney - Official Feature Deck",
  "(Red) Edward.Newgate - Official Feature Deck",
  "(Purple) Sengoku - Official Feature Deck",
  "(Red/Green) Krieg - Official Feature Deck",
  "(Red/Blue) Lucy - Official Feature Deck",
  "(Blue) Rebecca - Official Feature Deck",
  "(Black) Imu - Official Feature Deck",
  "(Red/Purple) Gol.D.Roger - Official Feature Deck",
  "(Green/Black) Brook - Official Feature Deck",
  "(Yellow) Monkey.D.Luffy - Official Feature Deck",
  "(Red/Blue) Nefeltari Vivi - Official Feature Deck",
  "(Red) Trafalgar Law - Official Feature Deck",
  "(Blue/Yellow) Boa Hancock - Official Feature Deck",
  "(Blue) Jinbe - Official Feature Deck",
  "(Black) Yamato - Official Feature Deck",
  "(Black) Crocodile - Official Feature Deck",
  "(Black/Yellow) Gecko Moria - Official Feature Deck",
  "(Black/Yellow) Koala - Official Feature Deck",
  "(Green/Purple) Monkey.D.Luffy - Official Feature Deck",
  "(Green/Yellow) Shirahoshi - Official Feature Deck",
  "(Red/Blue) Portgas.D.Ace - Official Feature Deck",
  "(Blue/Purple) Sanji - Official Feature Deck",
  "(Blue/Black) Usopp - Official Feature Deck",
  "(Green) Jinbe - Official Feature Deck",
  "(Blue) Buggy - Official Feature Deck",
  "(Red) Silvers Rayleigh - Official Feature Deck",
  "(Purple) Donquixote Doflamingo - Official Feature Deck",
  "(Yellow) Charlotte Linlin - Official Feature Deck",
  "(Purple) Enel - 1st Place EU Championship 26-27 S1",
  "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1",
  "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
  "(Purple) Kaido - Open OPTCG",
  "(Red/Green) Luffy & Ace - Open OPTCG",
  "(Red/Green) Monkey.D.Luffy - Open OPTCG",
  "(Black) Monkey.D.Luffy - Open OPTCG",
  "(Red) Portgas.D.Ace - Open OPTCG",
  "(Blue) Rocks.D.Xebec - Open OPTCG",
  "(Purple/Yellow) Charlotte Pudding - Open OPTCG",
  "(Yellow) Enel - Open OPTCG",
  "(Green) Roronoa Zoro - OP17 Post-Ban List",
  "(Blue) Kuzan - 1st Place Bandai Hiroshima",
  "(Blue/Purple) Vinsmoke Reiju - 1st Place Store Battle",
  "(Red/Black) Koby - 2nd Place Indonesia Regional Final",
  "(Yellow) Vegapunk - 1st Place Store Battle",
] as const;
export type TournamentDeckId = (typeof TOURNAMENT_DECK_IDS)[number];

export interface DeckManifest {
  id: string;
  leader: string;
  cards: Record<string, number>;
  /**
   * Required deck size. Defaults to the constructed format's 50.
   *
   * Sealed decks are 40, and this was the only thing in the whole engine that
   * assumed otherwise -- the size check in `loadDeckManifest` below. Nothing in
   * the rules engine itself cares how many cards a deck has.
   */
  deckSize?: number;
  /**
   * Bandai's feature-deck page entry this list was transcribed from, if it was.
   *
   * See {@link FeaturePageEntry}: it is what orders the official shelf, which
   * is browsed the way Bandai's own index is read -- newest posting first.
   */
  featuredOn?: FeaturePageEntry;
  /**
   * The constructed format this list is built for, defaulting to Standard.
   *
   * Standard is the strict one, so silence has to mean Standard: a list added
   * without thinking about rotation is then held to the format its author
   * almost certainly meant, and `validateDeckCardRows` fails it if it names a
   * printing that has rotated out. Declaring `extra` is the deliberate way to
   * ship a list that is no longer Standard-legal -- an Extra Regulation deck is
   * a real deck, and the point of the field is that the list says so.
   */
  format?: DeckFormat;
}

/** The format a manifest declares, with Standard as the default. */
export function deckFormat(manifest: DeckManifest): DeckFormat {
  return manifest.format ?? "standard";
}

const handBuiltDecks: Record<HandBuiltDeckId, DeckManifest> = {
  "(Green/Blue) Monkey.D.Luffy - Official Feature Deck": {
    id: "(Green/Blue) Monkey.D.Luffy - Official Feature Deck",
    // As assembled this ran 1x OP02-068 Gum-Gum Rain, which is block 1 on both
    // of its printings and so left Standard on 1 April 2026. Its slot is now
    // OP12-057 Ice Block Pheasant Peck -- the same job in the legal pool, a
    // one-of Blue [Counter] that trades a card from hand for power, and
    // already in the shipped pool as an ST-33 identity.
    format: "standard",
    leader: "OP16-022",
    cards: {
      "OP16-034": 4,
      "OP16-054": 4,
      "OP16-055": 4,
      "ST30-014": 2,
      "OP16-027": 1,
      "OP16-045": 4,
      "OP16-056": 4,
      "OP16-026": 3,
      "OP16-048": 4,
      "OP16-042": 8,
      "OP15-032": 1,
      "OP16-032": 3,
      "OP12-057": 1,
      "OP16-038": 2,
      "OP12-037": 1,
      "OP13-040": 1,
      "OP11-061": 1,
      "OP06-058": 2,
    },
  },
};

/**
 * The OP-16 format profiles: hand-authored meta lists rather than one of
 * Bandai's own structure decks. Two Leaders, both at the top of the OP-16
 * metagame -- Blue/Yellow Nami's Thriller Bark recursion and Purple Enel's
 * six-card DON!! deck -- so a format game has an opponent worth playing
 * against and the LLM seat has a dossier for either side.
 */
const tournamentDecks: Record<TournamentDeckId, DeckManifest> = {
  "(Blue/Yellow) Nami - Official Feature Deck": op16NamiManifest,
  "(Black/Yellow) Marshall.D.Teach - Official Feature Deck": op16TeachManifest,
  "(Purple) Enel - Official Feature Deck": op16EnelManifest,
  "(Red/Black) Sabo - OP17 Elbaph List": op13SaboManifest,
  "(Green) Shanks - Official Feature Deck": op17ShanksManifest,
  "(Blue) Rocks.D.Xebec - Official Feature Deck": op17XebecManifest,
  "(Black) Monkey.D.Luffy - Official Feature Deck": op17LuffyManifest,
  "(Red) Portgas.D.Ace - Official Feature Deck": op16AceManifest,
  "(Purple) Kaido - Official Feature Deck": op17KaidoManifest,
  "(Green/Yellow) Yamato - Official Feature Deck": op06YamatoManifest,
  "(Red/Yellow) Jewelry Bonney - Official Feature Deck": eb04BonneyManifest,
  "(Red) Edward.Newgate - Official Feature Deck": op17NewgateManifest,
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
  "(Purple) Enel - 1st Place EU Championship 26-27 S1": op16EnelEuFinalManifest,
  "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1":
    op09RobinManifest,
  "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1":
    op14MihawkManifest,
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
  "(Yellow) Vegapunk - 1st Place Store Battle": op07VegapunkTournamentManifest,
};

const starterDecks: Record<StarterDeckId, DeckManifest> = {
  "(Purple) Monkey.D.Luffy - Starter Deck 18": st18LuffyManifest,
  "(Blue) Ace & Newgate - Starter Deck 22": st22AceNewgateManifest,
  "(Red) Shanks - Starter Deck 23": st23ShanksManifest,
  "(Purple/Black) Monkey.D.Luffy - Starter Deck 26": st26LuffyManifest,
  "(Black) Marshall.D.Teach - Starter Deck 27": st27TeachManifest,
  "(Yellow) Monkey.D.Luffy - Starter Deck 29": st29LuffyManifest,
  "(Red/Green) Luffy & Ace - Starter Deck 30": st30LuffyAceManifest,
};

const fixtureDecks: Record<string, DeckManifest> = {
  "FIXTURE-RED": {
    id: "FIXTURE-RED",
    leader: "FIX-LEADER-R",
    cards: { "FIX-001": 30, "FIX-002": 20 },
  },
  "FIXTURE-BLUE": {
    id: "FIXTURE-BLUE",
    leader: "FIX-LEADER-B",
    cards: { "FIX-001": 20, "FIX-002": 30 },
  },
};

/**
 * Deck IDs worth surfacing as direct choices in the setup UI -- the field a 1v1
 * game can be set up from.
 *
 * Spelled out as a tuple of literals rather than derived from
 * `Object.values(...).map(...)`, because the derived version widened to
 * `readonly string[]` and every measurement tool downstream then had to keep its
 * own hand-written list of which decks it covered. Those lists drifted: a deck
 * added to the app was playable months before it was benchmarked. `Record<
 * HandBuiltDeckId, ...>` above makes the tuple and the manifests check each
 * other, so a deck cannot be selectable without being in this list, or listed
 * here without a manifest.
 */
export const SELECTABLE_DECK_IDS = [
  ...FORMAT_DECK_IDS,
  ...HAND_BUILT_DECK_IDS,
  ...TOURNAMENT_DECK_IDS,
  ...STARTER_DECK_IDS,
] as const;
export type SelectableDeckId = (typeof SELECTABLE_DECK_IDS)[number];

/**
 * A deck that is a variant of another shipped deck, mapped to the deck it
 * varies -- same Leader and so piloted by the same policy, which would make
 * the pairing a comparison of a deck with itself rather than a matchup.
 * Benchmarks skip such pairs.
 */
export const DECK_VARIANT_OF: Partial<
  Record<SelectableDeckId, SelectableDeckId>
> = {};

/** Whether two decks are the same deck, one of them a variant of the other. */
export function isDeckVariantPair(left: string, right: string): boolean {
  return (
    DECK_VARIANT_OF[left as SelectableDeckId] === right ||
    DECK_VARIANT_OF[right as SelectableDeckId] === left
  );
}

export const deckManifests: Record<string, DeckManifest> = Object.fromEntries([
  ...Object.values(fixtureDecks).map((deck): [string, DeckManifest] => [
    deck.id,
    deck,
  ]),
  ...Object.values(handBuiltDecks).map((deck): [string, DeckManifest] => [
    deck.id,
    deck,
  ]),
  ...Object.values(tournamentDecks).map((deck): [string, DeckManifest] => [
    deck.id,
    deck,
  ]),
  ...Object.values(starterDecks).map((deck): [string, DeckManifest] => [
    deck.id,
    deck,
  ]),
  ...formatDeckManifests.map((deck): [string, DeckManifest] => [
    deck.id,
    {
      ...deck,
      cards: { ...deck.cards },
    },
  ]),
]);

export function requireSupportedDeck(deckId: string): DeckManifest {
  const manifest = deckManifests[deckId];
  if (!manifest) throw new Error(`UNSUPPORTED_DECK: ${deckId}`);
  return manifest;
}

export function loadDeck(deckId: string): string[] {
  const manifest = requireSupportedDeck(deckId);
  return loadDeckManifest(manifest);
}

export function loadDeckManifest(manifest: DeckManifest): string[] {
  const cards = Object.entries(manifest.cards).flatMap(
    ([cardNumber, quantity]) => {
      // Throws `UNKNOWN_CARD` for an identity the registry has never heard of,
      // which is the only way a manifest can name a card the engine cannot run.
      requireKnownCard(cardNumber);
      return Array.from({ length: quantity }, () => cardNumber);
    },
  );
  const expected = manifest.deckSize ?? 50;
  if (cards.length !== expected) {
    throw new Error(
      `INVALID_DECK_SIZE: ${manifest.id} contains ${cards.length} cards, expected ${expected}`,
    );
  }
  return cards;
}

/**
 * Turn a deck id into the shape the rules engine deals from.
 *
 * This is the seam between the catalog and the engine: `createGame` takes a
 * `ResolvedDeck`, so every caller that speaks in deck ids -- the JSONL server,
 * the web app, the CLI, the tools -- comes through here, and the engine never
 * has to know which decks the repository ships.
 *
 * `customDeck` is not an escape hatch any more, just the case where the caller
 * already holds the manifest (a saved deck, a sealed build) and the id is only
 * its handle: the manifest is used as given and the id becomes the seed key.
 */
export function resolveDeck(
  deckId: string,
  customDeck?: DeckManifest,
): ResolvedDeck {
  const manifest = customDeck ?? requireSupportedDeck(deckId);
  return {
    leader: manifest.leader,
    cards: loadDeckManifest(manifest),
    seedKey: deckId,
  };
}

/**
 * Both seats of a match at once, for the `{ p1Deck, p2Deck, p1CustomDeck? }`
 * shape that saved matches and trace configs are stored in.
 */
export function resolveMatchDecks(config: {
  p1Deck: string;
  p2Deck: string;
  p1CustomDeck?: DeckManifest;
  p2CustomDeck?: DeckManifest;
}): { p1: ResolvedDeck; p2: ResolvedDeck } {
  return {
    p1: resolveDeck(config.p1Deck, config.p1CustomDeck),
    p2: resolveDeck(config.p2Deck, config.p2CustomDeck),
  };
}

export function loadPreviewDeck(deckId: FormatDeckId): string[] {
  const manifest = deckManifests[deckId];
  if (!manifest) throw new Error(`UNKNOWN_DECK: ${deckId}`);
  const cards = Object.entries(manifest.cards).flatMap(
    ([cardNumber, quantity]) => {
      requireKnownCard(cardNumber);
      return Array.from({ length: quantity }, () => cardNumber);
    },
  );
  if (cards.length !== 50) {
    throw new Error(`INVALID_DECK_SIZE: ${deckId} contains ${cards.length}`);
  }
  return cards;
}
