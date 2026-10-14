import type { DeckStrategyDossier } from "./types.js";

export const op15BrookDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green/Black) Brook - Official Feature Deck",
  archetype:
    "Green/Black {Straw Hat Crew} self-mill behind OP15-022: trash your own deck to power bodies that scale with the trash, then empty the deck on the turn you win. The Leader moves the deck-out loss to the end of the turn the deck reaches 0.",
  gamePlan: [
    "OP15-022 Brook's static rule: your deck reaching 0 cards does not lose the game at once. You lose at the end of the turn in which it became 0. Every card that trashes from your deck spends that clock.",
    "The Leader's [Activate: Main] [Once Per Turn] trashes the top 4 cards of your deck. If that leaves your deck at 0, set up to 1 of your Characters as active: one more attack from a Character that has already swung. That second half is the finishing move, and the turn you use it is the last turn you get.",
    "Early game, build the trash: OP15-085 Tony Tony.Chopper trashes 3 on play, and OP15-088 Pirates Docking Six may trash 3 to play a cost-2-or-less {Straw Hat Crew} Character from the trash -- a Chopper it just trashed, which trashes 3 more. OP15-081 Sanji trashes 5 and OP15-082 Charlotte Lola 3 on play.",
    "Mid game, the trash pays: OP15-092 Monkey.D.Luffy is 9000 base with +10 cost at 10 cards in your trash, makes your Leader 7000 base on the opponent's turn at 20, and gains +1000 at 30. OP15-086 Nami plays a cost-7-or-less {Straw Hat Crew} Character from your trash with [Rush] -- a Luffy the mill buried comes back swinging. OP15-087 Nico Robin gains [Blocker] at 10.",
    "End game: once the opponent is low on Life, play OP15-032 Brook to rest their [Blocker], give your DON!! to Luffy, attack, and then empty the deck with the Leader to set an attacker active for the last hit. Do this only on a turn that wins: at the end of it you lose.",
  ],
  mulligan: [
    "Most hands are keepable: twenty of the fifty cost 2 or less. OP15-085 Chopper, OP15-088 Pirates Docking Six and EB02-017 Nami (which looks at 5 for a {Straw Hat Crew} card) are the openers the plan wants.",
  ],
  priorities: [
    "Count your deck before every mill. Keep enough cards to draw one a turn until the turn you win; the Leader's 4, Sanji's 5, and Chopper's, Lola's and Docking Six's 3 all come out of that count.",
    "Use the Leader's mill freely while the deck is deep: every card trashed feeds Luffy, Nami and Gum-Gum Storm. Stop using it once the deck gets thin, unless this turn is the one that wins.",
    "Sanji, Chopper and Lola trash from the deck whether you want it or not. When the deck is thin, play something else.",
    "Hold OP15-086 Nami for the turn Luffy is in the trash: it plays Luffy with [Rush].",
    "OP15-032 Brook's [Activate: Main] trashes itself to set 1 of your Characters with a base cost of 8 or less active -- Luffy's base cost is 7, so that is a second Luffy attack. Do not spend it on a body smaller than 7000. Its [On Play] rests one of the opponent's cards -- aim it at a [Blocker].",
    "In the Counter step, spend Counter cards to save OP15-092 Luffy, OP15-086 Nami, OP15-088 Pirates Docking Six and OP15-087 Nico Robin. The last three print no Counter value, so none of them can be turned back into defence from hand, and the cards you spend go to the trash that powers the deck.",
    "OP15-085 Chopper's [Activate: Main] trashes it to add a {Straw Hat Crew} Character other than Chopper from your trash to hand. Use it after Chopper has attacked, to fetch Luffy or Nami.",
    "OP15-095 Gum-Gum Storm counts itself: it is in the trash when it resolves. Its [Main] gives a {Straw Hat Crew} card +3000 and its [Counter] +4000, each only with 15 or more cards in your trash.",
    "OP15-035 Laboon and OP15-094 Roronoa Zoro protect the board from the opponent's removal: Laboon rests 2 of your cards instead of losing a 7000-base-or-less Character, and Zoro trashes itself instead of another {Straw Hat Crew} Character.",
    "OP15-024 Usopp is a [Blocker] on the opponent's turn that their effects cannot rest, and its [On K.O.] rests one of their cost-7-or-less cards.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader: a trash engine of cheap millers, bodies that scale with the trash, and removal-protection pieces.",
  ],
  commonCombos: [
    "OP15-088 Pirates Docking Six: trash 3, then play the OP15-085 Chopper those 3 turned up, which trashes 3 more.",
    "OP15-086 Nami plays OP15-092 Luffy from the trash with [Rush].",
    "Last turn: OP15-032 Brook rests their [Blocker], Luffy attacks, the Leader empties the deck and sets Luffy active, Luffy attacks again.",
  ],
  keyCardNumbers: [
    "OP15-022",
    "OP15-085",
    "OP15-088",
    "OP15-092",
    "OP15-086",
    "OP15-032",
    "OP15-095",
  ],
  counterplay: [
    "The deck is its own clock. Stretch the game: every turn it survives costs it at least a card from a deck it is already spending.",
    "OP15-092 Luffy is the finisher and it comes back from the trash through OP15-086 Nami. Removal that bottoms or returns to hand beats removal that trashes.",
    "Its final turn needs a Character to set active; clearing its board the turn before leaves the Leader's set-active with nothing to do.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_097.php",
      retrievedAt: "2026-09-27",
      note: "Bandai's feature deck for OP15-022: the fifty; Chopper and Pirates Docking Six as the early trash engine; Luffy as the main attacker and Nami reviving it with [Rush]; Brook resting a [Blocker] on the last turn; and the warning to empty the deck only on the turn that wins.",
    },
  ],
};
