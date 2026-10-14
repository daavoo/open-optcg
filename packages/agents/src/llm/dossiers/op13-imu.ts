import type { DeckStrategyDossier } from "./types.js";

export const op13ImuDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Black) Imu - Official Feature Deck",
  archetype:
    "Mono-Black {Five Elders} behind OP13-079 Imu: the game starts with OP13-099 The Empty Throne already in play, the early turns dig for Elders and fill the trash, and the late game plays 5000-power {Five Elders} Characters out of the trash all at once through OP13-082 Five Elders.",
  gamePlan: [
    "OP13-099 The Empty Throne is in play from the start of the game; the deck runs one copy and the Leader plays it before your opening hand is drawn. Its [Activate: Main] rests it and 3 DON!! to play a black {Five Elders} Character from your hand whose cost is at most the number of DON!! on your field. That is how the 6- and 7-cost Elders, and at ten DON!! the 10-cost OP13-082, come down for three.",
    "Early turns: play OP13-086 Saint Shalria and cast OP13-096 The Five Elders Are at Your Service!!! to find {Celestial Dragons} cards and put the rest in the trash. Shalria has 0 power; once its [On Play] has resolved, trash it to the Leader's [Activate: Main] to draw a card.",
    "The five 5000-power Elders -- OP13-080 Nusjuro, OP13-083 Saturn, OP13-084 Ju Peter, OP13-089 Warcury, OP13-091 Mars -- cannot be removed by the opponent's effects once your trash holds 7 cards, and Nusjuro gains [Rush], Warcury and Mars [Blocker]. Ju Peter sets every one of your {Five Elders} to 7000 base power on your turn at 10 cards in the trash.",
    "Mid game: use the Stage to play OP13-091 Mars (its [On Play] trashes a card from hand to K.O. a base cost of 5 or less) and OP13-080 Nusjuro, and spend the DON!! left over on attacks and on [Counter] Events.",
    "End game: at ten DON!!, play OP13-082 Five Elders with the Stage. Its [Activate: Main] rests 1 DON!! and trashes a card from hand to trash all of your Characters and play up to five {Five Elders} Characters with 5000 power and different names from the trash. Have one of each of the five in the trash first, and use the Leader's [Activate: Main] on a spent body before it, because the Five Elders trash your whole board anyway.",
  ],
  mulligan: [
    "Keep a hand with an early digger -- OP13-086 Saint Shalria or OP13-096 -- or a 4-cost Elder (OP13-083 Saturn, OP13-089 Warcury). The Stage is already in play, so no hand is missing it.",
  ],
  priorities: [
    "Use the Stage every turn you have 3 DON!! to spare and a {Five Elders} Character in hand you could not otherwise afford. It rests the Stage, so it is once a turn in practice.",
    "Use the Leader's [Activate: Main] once a turn on a body that has done its job -- OP13-086 Shalria or OP13-087 Charlos after their [On Play] -- or on a spare card in hand. Do not trash an Elder you paid for to draw one card.",
    "Count your trash: 7 cards makes the Elders immune to the opponent's effects, 10 turns on Nusjuro's -2000 and Ju Peter's 7000, and 19 gives the Leader +1000 from the Stage on your turn.",
    "Before activating OP13-082 Five Elders, the Characters it plays must already be in the trash: 5000 power, {Five Elders}, different names. Saturn's [On Play] and Warcury's [On K.O.] find another OP13-082.",
    "On the turn OP13-082 will reset the board, do not pay for any other Character first -- including a second OP13-082 -- because the reset trashes every Character you have. Count the Elders on the board as well as in the trash: they are trashed first, so they come back too.",
    "OP13-097 needs only {Celestial Dragons} Characters on your field to K.O. a base cost of 6 or less, and rests five DON!!; its [Counter] gives the Leader +3000. OP13-098's [Counter] gives +4000 to one of your cards and its [Main] K.O.s a cost-7 Stage.",
    "OP13-095 Saint Rosward's [On Play] K.O.s two base cost 3 or less only while all of your Characters are {Celestial Dragons}.",
    "PRB02-014 Sabo costs 3 less once your trash holds 15 cards, and is a [Blocker] -- it is not a {Celestial Dragons} Character, so it switches off OP13-097 and OP13-095 while it is on the field.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader. Its structure -- one Stage for the Leader to start with, early diggers that fill the trash, the five 5000-power Elders, and four OP13-082 to call them back -- follows from the Leader's and the Stage's text.",
  ],
  commonCombos: [
    "OP13-086 Saint Shalria digs and trashes, then the Leader trashes Shalria itself to draw.",
    "At ten DON!!: The Empty Throne plays OP13-082 Five Elders for three, then its [Activate: Main] trashes the board and plays five different 5000-power Elders from the trash.",
    "OP13-084 Ju Peter on a board of Elders at ten cards in the trash: every one of them attacks as 7000.",
  ],
  keyCardNumbers: [
    "OP13-079",
    "OP13-099",
    "OP13-082",
    "OP13-086",
    "OP13-096",
    "OP13-084",
    "OP13-091",
    "OP13-083",
  ],
  counterplay: [
    "The Elders are immune to your effects only while their owner's trash holds 7 cards; remove them before that.",
    "OP13-099 is the deck's engine and costs 7: a K.O. on a Stage stops the discounted Elders.",
    "OP13-082 needs five different 5000-power Elders in the trash to be worth its turn; the fewer that reach it, the less it plays.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_085.php",
      retrievedAt: "2026-09-27",
      note: "Bandai's feature deck for OP13-079: the fifty, starting with OP13-099 in play, Shalria and OP13-096 to gather Elders and fill the trash, trashing Shalria to the Leader, Mars and Nusjuro through the Stage in the mid game, and OP13-082 at ten DON!! after using the Leader first.",
    },
  ],
};
