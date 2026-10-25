import {
  printedText,
  requireKnownCard,
  type CardDefinition,
} from "@one-piece-sim/cards";
import {
  deckFormat,
  deckManifests,
  type DeckManifest,
} from "@one-piece-sim/decks";
import { genericDossier } from "./generic.js";
import { op13SaboDossier } from "./op13-sabo.js";
import { op14MihawkDossier } from "./op14-mihawk.js";
import { op16EnelDossier } from "./op16-enel.js";
import { op17LuffyTournamentDossier } from "./op17-luffy-tournament.js";
import { op16AceOpenDossier } from "./op16-ace-open.js";
import { op17XebecOpenDossier } from "./op17-xebec-open.js";
import { op08PuddingDossier } from "./op08-pudding.js";
import { op05EnelOpenDossier } from "./op05-enel-open.js";
import { op12ZoroPostBanDossier } from "./op12-zoro-post-ban.js";
import { op15KriegDossier } from "./op15-krieg.js";
import { op17LinlinDossier } from "./op17-linlin.js";
import { op13LuffyDossier } from "./op13-luffy.js";
import { op15LucyDossier } from "./op15-lucy.js";
import { op15BrookDossier } from "./op15-brook.js";
import { op15RebeccaDossier } from "./op15-rebecca.js";
import { op13ImuDossier } from "./op13-imu.js";
import { op15LuffyDossier } from "./op15-luffy.js";
import { eb03ViviDossier } from "./eb03-vivi.js";
import { op14LawDossier } from "./op14-law.js";
import { op14HancockDossier } from "./op14-hancock.js";
import { op14JinbeDossier } from "./op14-jinbe.js";
import { op16YamatoDossier } from "./op16-yamato.js";
import { op14CrocodileDossier } from "./op14-crocodile.js";
import { op14MoriaDossier } from "./op14-moria.js";
import { op12KoalaDossier } from "./op12-koala.js";
import { eb02LuffyDossier } from "./eb02-luffy.js";
import { op11ShirahoshiDossier } from "./op11-shirahoshi.js";
import { op06ReijuDossier } from "./op06-reiju.js";
import { op11KobyDossier } from "./op11-koby.js";
import { op13AceDossier } from "./op13-ace.js";
import { op12SanjiDossier } from "./op12-sanji.js";
import { op10UsoppDossier } from "./op10-usopp.js";
import { op11JinbeDossier } from "./op11-jinbe.js";
import { op09BuggyDossier } from "./op09-buggy.js";
import { op12RayleighDossier } from "./op12-rayleigh.js";
import { op14DoflamingoDossier } from "./op14-doflamingo.js";
import { op13RogerDossier } from "./op13-roger.js";
import { op16SengokuDossier } from "./op16-sengoku.js";
import { op16LuffyDossier } from "./op16-luffy.js";
import { op16NamiDossier } from "./op16-nami.js";
import { op16TeachDossier } from "./op16-teach.js";
import { op17LuffyDossier } from "./op17-luffy.js";
import { op06YamatoDossier } from "./op06-yamato.js";
import { eb04BonneyDossier } from "./eb04-bonney.js";
import { op09RobinDossier } from "./op09-robin.js";
import { op17NewgateDossier } from "./op17-newgate.js";
import { op16AceDossier } from "./op16-ace.js";
import { op17ShanksDossier } from "./op17-shanks.js";
import { op17KaidoDossier } from "./op17-kaido.js";
import { op17KaidoFieldDossier } from "./op17-kaido-field.js";
import { op17XebecDossier } from "./op17-xebec.js";
import { st18Dossier } from "./st18.js";
import { st26Dossier } from "./st26.js";
import { st27Dossier } from "./st27.js";
import { st22Dossier } from "./st22.js";
import { st23Dossier } from "./st23.js";
import { st29Dossier } from "./st29.js";
import { st30Dossier } from "./st30.js";
import { op17LuffyAceDossier } from "./op17-luffy-ace.js";
import { st31Dossier } from "./st31.js";
import { st32Dossier } from "./st32.js";
import { st33Dossier } from "./st33.js";
import { st33KuzanTournamentDossier } from "./st33-kuzan-tournament.js";
import { op14HancockTournamentDossier } from "./op14-hancock-tournament.js";
import { op09BuggyTournamentDossier } from "./op09-buggy-tournament.js";
import { op14LawTournamentDossier } from "./op14-law-tournament.js";
import { eb05RobinDossier } from "./eb05-robin.js";
import { st34Dossier } from "./st34.js";
import { st35Dossier } from "./st35.js";
import { st36Dossier } from "./st36.js";
import { st29LuffyTournamentDossier } from "./st29-luffy-tournament.js";
import { op11KatakuriTournamentDossier } from "./op11-katakuri-tournament.js";
import { op05LuffyTournamentDossier } from "./op05-luffy-tournament.js";
import { op10KidTournamentDossier } from "./op10-kid-tournament.js";
import { op11ShirahoshiTournamentDossier } from "./op11-shirahoshi-tournament.js";
import { op12SanjiTournamentDossier } from "./op12-sanji-tournament.js";
import { op06YamatoTournamentDossier } from "./op06-yamato-tournament.js";
import { op07VegapunkStoreBattleDossier } from "./op07-vegapunk-store-battle.js";
import { op09ShanksTournamentDossier } from "./op09-shanks-tournament.js";
import { op13RogerTournamentDossier } from "./op13-roger-tournament.js";
import { eb03ViviTournamentDossier } from "./eb03-vivi-tournament.js";
import { op14DoflamingoTournamentDossier } from "./op14-doflamingo-tournament.js";
import { op12KoalaTournamentDossier } from "./op12-koala-tournament.js";
import { op14MoriaTournamentDossier } from "./op14-moria-tournament.js";
import { op17ShanksTournamentDossier } from "./op17-shanks-tournament.js";
import { op15EnelTournamentDossier } from "./op15-enel-tournament.js";
import type { DeckStrategyDossier } from "./types.js";

export type { DeckStrategyDossier } from "./types.js";

const dossiers: Readonly<Record<string, DeckStrategyDossier>> = {
  "(Red) Monkey.D.Luffy - Starter Deck 31": st31Dossier,
  "(Green) Roronoa Zoro - Starter Deck 32": st32Dossier,
  "(Blue) Kuzan - Starter Deck 33": st33Dossier,
  "(Purple) Charlotte Katakuri - Starter Deck 34": st34Dossier,
  "(Red/Black) Sabo - Starter Deck 35": st35Dossier,
  "(Yellow) Eustass Kid - Starter Deck 36": st36Dossier,
  "(Blue/Yellow) Nami - Official Feature Deck": op16NamiDossier,
  "(Black/Yellow) Marshall.D.Teach - Official Feature Deck": op16TeachDossier,
  "(Purple) Enel - Official Feature Deck": op16EnelDossier,
  "(Purple) Sengoku - Official Feature Deck": op16SengokuDossier,
  "(Red/Green) Krieg - Official Feature Deck": op15KriegDossier,
  "(Yellow) Charlotte Linlin - Official Feature Deck": op17LinlinDossier,
  "(Red/Green) Monkey.D.Luffy - Open OPTCG": op13LuffyDossier,
  "(Red/Blue) Lucy - Official Feature Deck": op15LucyDossier,
  "(Blue) Rebecca - Official Feature Deck": op15RebeccaDossier,
  "(Black) Imu - Official Feature Deck": op13ImuDossier,
  "(Green/Black) Brook - Official Feature Deck": op15BrookDossier,
  "(Yellow) Monkey.D.Luffy - Official Feature Deck": op15LuffyDossier,
  "(Red/Blue) Nefeltari Vivi - Official Feature Deck": eb03ViviDossier,
  "(Red) Trafalgar Law - Official Feature Deck": op14LawDossier,
  "(Blue/Yellow) Boa Hancock - Official Feature Deck": op14HancockDossier,
  "(Blue) Jinbe - Official Feature Deck": op14JinbeDossier,
  "(Black) Yamato - Official Feature Deck": op16YamatoDossier,
  "(Black) Crocodile - Official Feature Deck": op14CrocodileDossier,
  "(Black/Yellow) Gecko Moria - Official Feature Deck": op14MoriaDossier,
  "(Black/Yellow) Koala - Official Feature Deck": op12KoalaDossier,
  "(Green/Purple) Monkey.D.Luffy - Official Feature Deck": eb02LuffyDossier,
  "(Green/Yellow) Shirahoshi - Official Feature Deck": op11ShirahoshiDossier,
  "(Blue/Purple) Vinsmoke Reiju - 1st Place Store Battle": op06ReijuDossier,
  "(Red/Black) Koby - 2nd Place Indonesia Regional Final": op11KobyDossier,
  "(Red/Blue) Portgas.D.Ace - Official Feature Deck": op13AceDossier,
  "(Blue/Purple) Sanji - Official Feature Deck": op12SanjiDossier,
  "(Blue/Black) Usopp - Official Feature Deck": op10UsoppDossier,
  "(Green) Jinbe - Official Feature Deck": op11JinbeDossier,
  "(Blue) Buggy - Official Feature Deck": op09BuggyDossier,
  "(Red) Silvers Rayleigh - Official Feature Deck": op12RayleighDossier,
  "(Purple) Donquixote Doflamingo - Official Feature Deck":
    op14DoflamingoDossier,
  "(Red/Purple) Gol.D.Roger - Official Feature Deck": op13RogerDossier,
  "(Green/Blue) Monkey.D.Luffy - Official Feature Deck": op16LuffyDossier,
  "(Red/Black) Sabo - OP17 Elbaph List": op13SaboDossier,
  "(Green) Shanks - Official Feature Deck": op17ShanksDossier,
  "(Red) Portgas.D.Ace - Official Feature Deck": op16AceDossier,
  "(Red) Portgas.D.Ace - Open OPTCG": op16AceOpenDossier,
  "(Blue) Rocks.D.Xebec - Open OPTCG": op17XebecOpenDossier,
  "(Purple/Yellow) Charlotte Pudding - Open OPTCG": op08PuddingDossier,
  "(Yellow) Enel - Open OPTCG": op05EnelOpenDossier,
  "(Green) Roronoa Zoro - OP17 Post-Ban List": op12ZoroPostBanDossier,
  "(Blue) Kuzan - 1st Place Bandai Hiroshima": st33KuzanTournamentDossier,
  "(Blue/Yellow) Boa Hancock - 25th Place ChinoizeCup #105":
    op14HancockTournamentDossier,
  "(Blue) Buggy - 12th Place ChinoizeCup #124": op09BuggyTournamentDossier,
  "(Red) Trafalgar Law - 9th Place ChinoizeCup #125": op14LawTournamentDossier,
  "(Green/Yellow) Nico Robin - EB05 Wisdom List": eb05RobinDossier,
  "(Blue) Rocks.D.Xebec - Official Feature Deck": op17XebecDossier,
  "(Black) Monkey.D.Luffy - Official Feature Deck": op17LuffyDossier,
  "(Black) Monkey.D.Luffy - Open OPTCG": op17LuffyTournamentDossier,
  "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1":
    op14MihawkDossier,
  "(Purple) Kaido - Official Feature Deck": op17KaidoDossier,
  "(Purple) Kaido - Open OPTCG": op17KaidoFieldDossier,
  "(Green/Yellow) Yamato - Official Feature Deck": op06YamatoDossier,
  "(Red/Yellow) Jewelry Bonney - Official Feature Deck": eb04BonneyDossier,
  "(Red) Edward.Newgate - Official Feature Deck": op17NewgateDossier,
  "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1":
    op09RobinDossier,
  "(Purple) Monkey.D.Luffy - Starter Deck 18": st18Dossier,
  "(Blue) Ace & Newgate - Starter Deck 22": st22Dossier,
  "(Red) Shanks - Starter Deck 23": st23Dossier,
  "(Purple/Black) Monkey.D.Luffy - Starter Deck 26": st26Dossier,
  "(Black) Marshall.D.Teach - Starter Deck 27": st27Dossier,
  "(Yellow) Monkey.D.Luffy - Starter Deck 29": st29Dossier,
  "(Red/Green) Luffy & Ace - Starter Deck 30": st30Dossier,
  "(Red/Green) Luffy & Ace - Open OPTCG": op17LuffyAceDossier,
  "(Yellow) Monkey.D.Luffy - 1st Place Store Battle 2026-07-15":
    st29LuffyTournamentDossier,
  "(Purple) Charlotte Katakuri - 1st Place Store Battle 2026-08-02":
    op11KatakuriTournamentDossier,
  "(Purple) Monkey.D.Luffy - 1st Place Store Battle 2025-07-01":
    op05LuffyTournamentDossier,
  "(Yellow) Eustass Kid - ChinoizeCup #104": op10KidTournamentDossier,
  "(Green/Yellow) Shirahoshi - 3rd Place ChinoizeCup #125":
    op11ShirahoshiTournamentDossier,
  "(Blue/Purple) Sanji - ChinoizeCup #116": op12SanjiTournamentDossier,
  "(Green/Yellow) Yamato - 1st Place Pirates Party 2026-09-20":
    op06YamatoTournamentDossier,
  "(Yellow) Vegapunk - 1st Place Store Battle 2026-06-19":
    op07VegapunkStoreBattleDossier,
  "(Red) Shanks - 1st Place Store Battle 2026-06-29":
    op09ShanksTournamentDossier,
  "(Red/Purple) Gol.D.Roger - 1st Place OPTCGSim 2026-04-22":
    op13RogerTournamentDossier,
  "(Red/Blue) Nefeltari Vivi - 1st Place Store Battle 2026-05-28":
    eb03ViviTournamentDossier,
  "(Purple) Donquixote Doflamingo - 1st Place Store Battle 2026-01-30":
    op14DoflamingoTournamentDossier,
  "(Black/Yellow) Koala - 30th Place ChinoizeCup #113":
    op12KoalaTournamentDossier,
  "(Black/Yellow) Gecko Moria - 5th Place ChinoizeCup #120":
    op14MoriaTournamentDossier,
  "(Green) Shanks - 16th Place Rumble League #9": op17ShanksTournamentDossier,
  "(Purple) Enel - 1st Place Store Battle 2026-04-11":
    op15EnelTournamentDossier,
};

/**
 * The deck IDs with a curated strategy dossier. The LLM seat only pilots decks
 * on this list: a deck without a dossier has no archetype profile to ground
 * the opponent's side of the match context on, so the UI never offers one to
 * it.
 *
 * Every shipped deck now carries one, so in practice this excludes only the
 * decks a player builds and saves themselves -- which is still the point of
 * the gate, since nothing can write a dossier for a deck that did not exist
 * when the app was built.
 */
export const DOSSIER_DECK_IDS: ReadonlySet<string> = new Set(
  Object.keys(dossiers),
);

export function deckStrategyDossier(deckId: string): DeckStrategyDossier {
  return dossiers[deckId] ?? genericDossier(deckId);
}

/**
 * The dossier decks built around one Leader.
 *
 * A deck the player built has no dossier of its own and never can -- nothing
 * could write one for a list that did not exist when the app was built -- but
 * a home-brew ST31 is still piloted by ST31's plan. So a custom list borrows
 * the dossier of a shipped deck, and this is how the app proposes which one:
 * the shipped decks that play the same Leader, most-recently-registered last,
 * for a caller to default to the first of and let the player override.
 */
export function dossierDeckIdsForLeader(leader: string): readonly string[] {
  return Object.keys(dossiers).filter(
    (deckId) => deckManifests[deckId]?.leader === leader,
  );
}

/**
 * The seat's own deck: exact list, printed Leader text, and its curated plan.
 *
 * `counterplay` is lifted out of `strategy` and renamed. The field is written as
 * "how to beat this deck", so serialized under its own name inside the seat's own
 * strategy it read as instructions: the ST31 seat was being told to "remove or
 * rest Sanji" -- its own Sanji -- with nothing marking which side of the table
 * the advice belonged to. The same array is legitimately served to the *other*
 * seat as `opponentScouting.counterplay`. Keeping it here under an explicit name
 * preserves what it is good for -- knowing which of your own pieces the opponent
 * is trying to answer -- without the ambiguity.
 */
export function deckDossierPrompt(
  deckId: string,
  manifest: DeckManifest,
): object {
  const { counterplay, ...strategy } = deckStrategyDossier(deckId);
  return {
    // Which constructed format the list is built for. Stated because the
    // dossier otherwise reads as "this is a tournament deck" for every list,
    // and one of them is an Extra Regulation list that could not be entered in
    // a Standard event. It changes no rule and no legal action -- rotation is
    // a deck-construction constraint, and the deck is already built.
    format: formatLine(manifest),
    strategy,
    howOpponentsBeatThisDeck: counterplay,
    leader: cardForPrompt(manifest.leader),
    cards: Object.entries(manifest.cards)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cardNumber, count]) => ({
        count,
        ...cardForPrompt(cardNumber),
      })),
  };
}

/**
 * A card as the prompt describes it: the record without its derived `rules`
 * block, which is the engine's reading and not something a model reasons from,
 * plus the printed text when the process holds it -- from the record itself or
 * from a text pack the player loaded. Without a pack the model plays from
 * names and stats, and the settings panel says so before the match.
 */
function cardForPrompt(
  cardNumber: string,
): Omit<CardDefinition, "rules"> & { effect?: string; trigger?: string } {
  const card: Partial<CardDefinition> & Omit<CardDefinition, "rules"> = {
    ...requireKnownCard(cardNumber),
  };
  delete card.rules;
  const text = printedText(cardNumber);
  return text ? { ...card, ...text } : card;
}

/** How a dossier says which format its list is for. */
function formatLine(manifest: DeckManifest): string {
  return deckFormat(manifest) === "extra"
    ? "Extra Regulation. This list contains printings that have rotated out of Standard, so it is legal only in Extra."
    : "Standard. Every printing in this list is legal in the current Standard format.";
}

export function opponentScoutingPrompt(
  deckId: string,
  manifest: DeckManifest,
): object {
  const strategy = deckStrategyDossier(deckId);
  return {
    scope:
      "Public scouting only. This is a representative archetype profile, not the opponent's submitted deck list, hand, Life, deck order, or exact card counts.",
    leader: cardForPrompt(manifest.leader),
    format: formatLine(manifest),
    archetype: strategy.archetype,
    commonVariants: strategy.commonVariants,
    commonCombos: strategy.commonCombos,
    commonStrategy: strategy.gamePlan,
    likelyPriorities: strategy.priorities,
    counterplay: strategy.counterplay,
    commonKeyCards: strategy.keyCardNumbers.map(cardForPrompt),
    sources: strategy.sources,
  };
}

export function llmMatchContext(
  selfDeckId: string,
  selfManifest: DeckManifest,
  opponentDeckId: string,
  opponentManifest: DeckManifest,
): object {
  return {
    selfDeck: deckDossierPrompt(selfDeckId, selfManifest),
    opponentScouting: opponentScoutingPrompt(opponentDeckId, opponentManifest),
  };
}
