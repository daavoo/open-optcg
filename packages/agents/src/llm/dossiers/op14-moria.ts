import type { DeckStrategyDossier } from "./types.js";

export const op14MoriaDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Black/Yellow) Gecko Moria - Official Feature Deck",
  archetype:
    "Black/Yellow {Thriller Bark Pirates} midrange behind OP14-080: fill the trash with cheap Thriller Bark Characters, then play them back out through [Trigger]s, [On K.O.]s and two Gecko Morias.",
  gamePlan: [
    "Ten of your fourteen slots print the same [Trigger]: play up to 1 {Thriller Bark Pirates} Character with a cost of 4 or less from your trash, rested. Every Life card your opponent takes is a body back -- but only if the trash already holds one. Fill it first.",
    "Fill the trash early. OP14-097 Hurry Up and Make Me the Pirate King! keeps one Thriller Bark card of three and trashes the other two; OP14-081 Spider Mice trashes the top 3 of your deck when played.",
    "The Leader's [When Attacking]: you may trash 3 cards from hand to put the top card of your deck on top of your Life. Use it on turns your hand is short of plays: it fills the trash and banks a Life card that may itself be a [Trigger].",
    "The Leader's [Activate: Main], once a turn: K.O. one of your Thriller Bark Characters, and your Leader and every Character gain +1000 this turn. Spend a body whose [On K.O.] pays: OP14-110 Dr. Hogback plays a 4-or-less [Trigger] Character from your trash, so your board does not shrink; OP14-111 Perona stops a 6-or-less opposing Character attacking; OP14-089 Ryuma draws 2 and trashes 2; OP14-100 Absalom finds a Thriller Bark card.",
    "PRB02-013 Gecko Moria (6 cost) plays a 4-or-less Character from your trash rested, then gives a rested DON!! to your Leader or a Character. OP14-104 Gecko Moria (8 cost) plays a 4-or-less Thriller Bark Character from your trash, or puts it face-up on top of your Life when you need defence.",
    "PRB02-014 Sabo costs 3 less in hand once your trash holds 15 cards: a 6000 [Blocker] for 3. OP14-108 Rayleigh K.O.s a 7000-or-less Character when your opponent is at 3 Life or fewer; OP14-112 Boa Hancock banks a Life card and takes one of theirs to their hand.",
  ],
  mulligan: [
    "Keep a hand with OP14-097 Hurry Up or OP14-081 Spider Mice: they start the trash your [Trigger]s play from.",
    "A hand with neither leaves your [Trigger]s with nothing to play for the first turns. Take a new hand.",
  ],
  priorities: [
    "Do not activate the Leader with only a body that prints nothing on K.O. on the field: +1000 for one turn does not replace a Character. Never spend a Gecko Moria to it.",
    "Spend Hogback when the trash holds a [Trigger] Character to bring back, Perona when the opponent has a 6-or-less attacker, and Ryuma or Absalom when you want cards.",
    "Hogback played rested by PRB02-013 is safe: if it is attacked and K.O.'d, its [On K.O.] puts another body back.",
    "Perona twice: play her to stop one attacker, then K.O. her with the Leader the same turn to stop a second.",
    "OP14-104 Gecko Moria: play the body when you have Life to spare and want to press; add it face-up to your Life when you are low and need the [Trigger] to come back.",
    "Victoria Cindry is your 3-cost [Blocker]. Keep one up when the opponent has a lethal swing.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader, built around [Trigger] recursion from the trash and the Thriller Bark [On K.O.]s.",
  ],
  commonCombos: [
    "PRB02-013 Gecko Moria plays OP14-110 Dr. Hogback rested from the trash; when Hogback is K.O.'d, by the Leader or in battle, it plays another [Trigger] Character back.",
    "Play OP14-111 Perona to stop one attacker, then K.O. her with the Leader for +1000 and stop a second.",
    "Leader's [When Attacking] trashes 3 from hand and banks the top of the deck on Life: three bodies for your [Trigger]s, and one more Life card to flip.",
  ],
  keyCardNumbers: [
    "OP14-080",
    "OP14-097",
    "OP14-110",
    "OP14-111",
    "PRB02-013",
    "OP14-104",
    "OP14-109",
    "PRB02-014",
  ],
  counterplay: [
    "Every Life card you take may return a body. Count their trash: a [Trigger] with no 4-or-less Thriller Bark Character to play is a blank.",
    "Removal that does not K.O. -- bounce, trash, bottom of deck -- skips the [On K.O.]s that pay for this deck's Characters.",
    "Their two Gecko Morias are the only large bodies. Answer those and the rest is 5000 or less.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_093.php",
      retrievedAt: "2026-10-03",
      note: "Bandai's feature deck for OP14-080: the fifty, filling the trash early with OP14-097 and the Leader's [When Attacking], PRB02-013 playing OP14-110 Dr. Hogback rested from the trash, Perona's [On Play] and [On K.O.] stopping two attackers through the Leader's K.O., and OP14-104's choice between playing a body and adding it face-up to Life.",
    },
  ],
};
