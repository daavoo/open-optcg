import type { DeckStrategyDossier } from "./types.js";

export const op12ZoroPostBanDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green) Roronoa Zoro - OP17 Post-Ban List",
  archetype:
    "OP12-020 Green Zoro midrange for the OP-17 field: Tashigi loads the Leader with three rested DON!! so it can attack a Character, restand, and attack the Leader, behind a wide curve of Slash bodies that put further bodies into play.",
  gamePlan: [
    "The Leader's restand needs three DON!! on it and a battle with an opposing Character this turn. OP12-031 Tashigi gives it three DON!! from your rested pool, and DON!! is rested by paying costs, so play something first and Tashigi second: the three DON!! are then free.",
    "Once restood, the Leader cannot attack a Character with a base cost of 7 or less again that turn, so the second attack goes to the opposing Leader. OP12-039 sets the Leader active again from hand for a third attack.",
    "Go wide with bodies that bring more bodies: ST32-003 Mihawk plays a cost-5-or-less Slash Character or Perona from hand, ST12-003 Mihawk plays a cost-4-or-less one rested while you have 2 or fewer Characters, and OP13-031 Law returns one of your Characters to hand to play a cost-5-or-less one rested -- returning Tashigi and playing her again loads the Leader a second time.",
    "OP13-037 Zoro sets two DON!! active when it is played under this Leader, so it costs two, and it sets itself active at the end of your turn, so it attacks and still blocks.",
    "OP12-028 Hiyori and OP12-034 Perona search for a Slash card or a green Event; use them early to find Tashigi and OP12-039.",
  ],
  mulligan: [
    "Keep a hand with OP12-028 Hiyori or OP12-031 Tashigi: Hiyori finds the rest of the engine, and Tashigi is the engine.",
    "A hand of only 5- and 6-cost bodies with no 1-cost searcher is a mulligan: the deck needs the early search to line up Tashigi on curve.",
  ],
  priorities: [
    "Do not give active DON!! to the Leader when Tashigi can supply three rested ones later in the turn; spend active DON!! on a play first.",
    "Attack an opposing Character with the loaded Leader before the opposing Leader, even into a battle you will lose: the restand only needs the battle to have happened.",
    "ST32-005 Zoro rests a cost-2-or-less Character on play and can attack Characters the turn it lands, which gives the Leader a rested target to battle.",
    "OP06-033 Vander Decken K.O.s a rested Character, but only by trashing a Fish-Man from hand; OP15-023 Arlong is the deck's Fish-Man, so count whether you will miss it before paying.",
    "OP13-040 and OP12-037 are +3000 Counters for the Leader; spend their [Main] side only when resting or locking two Characters wins the next turn's attacks.",
    "Tashigi, Law and ST32-003 Mihawk have no Counter value; hold the 2000-Counter bodies (ST32-005, ST12-003, Kawamatsu) for defence.",
  ],
  commonVariants: [
    "OP-17 Zoro lists keep Hiyori, Perona, Tashigi, OP12-039 and the ST-32 bodies, and vary in the flex: EB01-012 Cavendish, OP12-026 Kuina, OP10-036 Perona and OP14 Slash bodies appear in place of Vander Decken, Arlong or the second Event.",
  ],
  commonCombos: [
    "Play a body, then Tashigi: rest an opposing Character, give the Leader three rested DON!!, attack that Character with the Leader, restand, attack the Leader.",
    "Law returning Tashigi and replaying her rested: a second rest and a second three DON!! for the Leader in one turn.",
    "OP12-039 after the restand: a third Leader attack in the same turn.",
  ],
  keyCardNumbers: [
    "OP12-020",
    "OP12-031",
    "OP12-039",
    "OP13-031",
    "OP13-037",
    "ST32-003",
    "OP12-028",
  ],
  counterplay: [
    "Keep no low-value Character on the board for the Leader to battle: without a Character to attack it cannot earn the restand.",
    "Remove Tashigi before their next turn; Law can replay her for a second load.",
    "Count OP12-039 as one more Leader attack whenever they hold three DON!! open.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6ab613e7880ed327106dc30c/standings",
      retrievedAt: "2026-10-08",
      note: "The list: PerryAgenteP's OP12-020 deck at [OP17 NEW BANNED] Win a box | Rumble league #11, an event run under the post-ban list.",
    },
    {
      url: "https://en.onepiece-cardgame.com/news/restriction-261001.html",
      retrievedAt: "2026-10-08",
      note: "Bandai bans OP14-020 Dracule Mihawk from 12 Oct 2026, citing how it restricted Leaders with the Slash attribute.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_074.php",
      retrievedAt: "2026-10-08",
      note: "Bandai's OP12-020 concept: Tashigi gives the Leader its three DON!!, and the Leader attacks a Character and then the Leader in one turn.",
    },
  ],
};
