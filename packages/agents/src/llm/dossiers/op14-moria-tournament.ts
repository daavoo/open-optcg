import type { DeckStrategyDossier } from "./types.js";

export const op14MoriaTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Black/Yellow) Gecko Moria - 5th Place ChinoizeCup #120",
  archetype:
    "Black/Yellow {Thriller Bark Pirates} midrange behind OP14-080, as the OP-EGB field builds it: 1-cost bodies that trash five cards on entry, [Trigger] Characters that play Thriller Bark bodies back from the trash, and Life-gain to give those [Trigger]s more chances to flip.",
  gamePlan: [
    "OP14-100 Absalom, OP14-102 Kumacy, OP14-109 Victoria Cindry, OP14-110 Dr. Hogback and OP14-111 Perona print the same [Trigger]: play up to 1 {Thriller Bark Pirates} Character with a cost of 4 or less from your trash, rested. Every Life card your opponent takes may be a body back -- but only if the trash already holds one. Fill it first.",
    "Fill the trash early. OP06-091 Victoria Cindry and OP15-084 Dr. Hogback cost 1 and trash the top 5 of your deck on play behind this Leader; OP14-097 Hurry Up and Make Me the Pirate King! keeps one Thriller Bark card of three and trashes the other two. OP17-109 Charlotte Pudding trashes a [Trigger] card from hand to draw 3.",
    "The Leader's [When Attacking]: you may trash 3 cards from hand to put the top card of your deck on top of your Life. Use it on turns your hand is short of plays: it fills the trash and banks a Life card that may itself be a [Trigger].",
    "The Leader's [Activate: Main], once a turn: K.O. one of your Thriller Bark Characters, and your Leader and every Character gain +1000 this turn. Spend a body whose [On K.O.] pays: OP14-110 Dr. Hogback plays a 4-or-less Character with a [Trigger] from your trash, so your board does not shrink; Perona stops a 6-or-less opposing Character attacking; Absalom finds a Thriller Bark card; OP15-084 Dr. Hogback draws a card while you hold 6 or fewer.",
    "PRB02-013 Gecko Moria (6 cost) plays a 4-or-less Character from your trash rested, then gives a rested DON!! to your Leader or a Character. OP14-104 Gecko Moria (8 cost) plays a 4-or-less Thriller Bark Character from your trash, or puts it face-up on top of your Life when you need defence. OP14-112 Boa Hancock (9 cost) banks a Life card and takes one of your opponent's into their hand.",
    "OP15-113 Roronoa Zoro trashes a card from hand to add a Life card, and OP14-096 Ground Death's [Counter] is +4000 once your trash holds 10 cards, which the 1-cost trashers reach early.",
  ],
  mulligan: [
    "Keep a hand with OP06-091 Victoria Cindry, OP15-084 Dr. Hogback or OP14-097 Hurry Up: they start the trash your [Trigger]s play from. OP13-113 Lilith also keeps, since it finds a [Trigger] card.",
    "A hand with none of them leaves your [Trigger]s with nothing to play for the first turns. Take a new hand.",
  ],
  priorities: [
    "Do not activate the Leader with only a body that prints nothing on K.O. on the field: +1000 for one turn does not replace a Character. Never spend a Gecko Moria to it.",
    "Spend OP14-110 Hogback when the trash holds a [Trigger] Character to bring back, Perona when the opponent has a 6-or-less attacker, and Absalom or OP15-084 Hogback when you want cards.",
    "OP14-110 Hogback's [On K.O.] plays any 4-or-less Character with a [Trigger] from your trash, not only Thriller Bark ones, and not rested. Lilith and Charlotte Pudding qualify, and their [On Play]s fire again.",
    "PRB02-013 Gecko Moria can play any 4-or-less Character from your trash: OP14-110 Hogback is the safe body, since its [On K.O.] puts another back; OP06-091 Cindry or OP15-084 Hogback trashes 5 more; Zoro or Pudding repeats its [On Play].",
    "Perona twice: play her to stop one attacker, then K.O. her with the Leader the same turn to stop a second.",
    "OP14-104 Gecko Moria: play the body when you have Life to spare and want to press; add it face-up to your Life when you are low and need the [Trigger] to come back.",
    "Charlotte Pudding needs a [Trigger] card in hand to discard for its draw. Most of your Characters have one; play Pudding when you hold a spare.",
    "OP14-096 Ground Death's [Main] rests 2 DON!! to negate a cost-5-or-less Character's effect for the turn. Its [Counter] is the stronger half once the trash holds 10; keep it for that.",
    "OP14-109 Victoria Cindry is your only [Blocker]. Keep it up when the opponent has a lethal swing.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader runs OP14-081 Spider Mice, OP14-089 Ryuma, OP14-108 Silvers Rayleigh, PRB02-014 Sabo and OP14-117 Brick Bat, with four OP14-097 and four OP14-109 Cindry, where this list runs the 1-cost trashers OP06-091 and OP15-084, OP06-090 Dr. Hogback, Lilith, Ground Death, Zoro and Charlotte Pudding.",
  ],
  commonCombos: [
    "PRB02-013 Gecko Moria plays OP14-110 Dr. Hogback rested from the trash; when Hogback is K.O.'d, by the Leader or in battle, it plays another [Trigger] Character back.",
    "OP14-104 Gecko Moria or a [Trigger] plays OP06-091 Cindry or OP15-084 Hogback from the trash, and its [On Play] trashes 5 more for the next [Trigger].",
    "Play Perona to stop one attacker, then K.O. her with the Leader for +1000 and stop a second.",
    "Leader's [When Attacking] trashes 3 from hand and banks the top of the deck on Life: three cards for the trash, and one more Life card to flip.",
  ],
  keyCardNumbers: [
    "OP14-080",
    "OP06-091",
    "OP15-084",
    "OP14-110",
    "OP14-111",
    "PRB02-013",
    "OP14-104",
    "OP14-112",
  ],
  counterplay: [
    "Every Life card you take may return a body. Count their trash: a [Trigger] with no 4-or-less Thriller Bark Character to play is a blank.",
    "Removal that does not K.O. -- bounce, trash, bottom of deck -- skips the [On K.O.]s that pay for this deck's Characters.",
    "Their Gecko Morias and Boa Hancock are the only large bodies. Answer those and the rest is 5000 or less.",
    "They have one [Blocker], OP14-109 Victoria Cindry; a wide attack meets Counters, not blocks.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6abcff56783097f8dcb74097/standings",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "RaigekiMax" took to 5th of 63 at [EGB] ChinoizeCup #120, an online event played on 7 Oct 2026.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_093.php",
      retrievedAt: "2026-10-03",
      note: "Bandai's feature deck for OP14-080, the source of the variants line and of the Leader's two clauses as this dossier describes them.",
    },
  ],
};
