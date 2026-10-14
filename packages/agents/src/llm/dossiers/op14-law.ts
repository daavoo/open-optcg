import type { DeckStrategyDossier } from "./types.js";

export const op14LawDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Trafalgar Law - Official Feature Deck",
  archetype:
    "Red {Supernovas} midrange behind OP14-001: a Leader whose [Activate: Main] swaps the base power of two of your {Supernovas} or {Heart Pirates} Characters for the turn, once a turn, so a small body can attack with a heavy hitter's power.",
  gamePlan: [
    "Every Character in this deck is {Supernovas}, so the Leader's swap is offered whenever you have two Characters out. Build a board of cheap bodies early, then lend them the power of the big ones.",
    "Swap only when it adds an attack: give a big body's base power to a small Character that can still attack, while the big one cannot -- played this turn without [Rush], or already rested from attacking.",
    "OP14-002 Urouge's [When Attacking] draws a card and K.O.s an opposing Character with 3000 base power or less, but only at 5000 power or more. Swap a big body's base onto Urouge before it attacks.",
    "OP14-013 Monkey.D.Luffy has 0 power, so on its own it cannot win a battle. Swapped up, it attacks and gives an opposing Character −1000 on the way in. Its [On Play] digs five cards for a {Supernovas} card.",
    "OP14-010 Basil Hawkins' [On K.O.] plays a {Supernovas} Character with 2000 power or less off the top five, so losing it keeps a swap partner on the board.",
    'OP14-014 Eustass"Captain"Kid is a 5000 [Blocker] whose [On Play] plays a red Character with 2000 power or less from your hand, which is two bodies for one card.',
    "OP14-015 Roronoa Zoro and OP14-009 Trafalgar Law have [Rush]. Attack with them first, then swap their base power onto a Character that has not attacked and attack again.",
    "OP14-004 Cavendish gains [Rush] at 5000 power or more. Play it after Law or Zoro have attacked, swap their base onto it, and it attacks the turn it lands.",
  ],
  mulligan: [
    "Keep a hand with a Character of cost 2 or less. The Leader needs two of your Characters on the board before its swap does anything.",
    "OP14-018 is a [Counter] Event and does not count as an early play.",
  ],
  priorities: [
    "Do not swap two bodies that can both still attack: the total power across your attacks does not change, only which Character carries it.",
    "Do not swap away the power of a body you are about to attack with unless the other body has already attacked or cannot attack.",
    "OP14-009 Law's [On Your Opponent's Attack] trashes 2 cards from hand to swap its 10000 base with your Leader's for that battle. Use it when the attack on your Leader would otherwise connect and a Life card matters, not on every attack.",
    "OP14-016 X.Drake can take an opposing effect that would remove one of your {Supernovas} Characters as −2000 on your Leader instead. Take it for a body worth keeping on your opponent's turn.",
    "OP14-005 Killer's [Activate: Main] gives a rested DON!! to a Character. Use it on the body that is about to attack.",
    'OP14-011 Bartolomeo is a [Blocker] only with 2 DON!! given; OP14-003 Capone"Gang"Bege cannot be K.O.\'d by an effect of an opposing Character with 5000 base power or less.',
    "OP14-018's +4000 [Counter] needs a Character with 8000 power or more on the board: Zoro, Law, or a body lent one of their base powers.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader: forty-five {Supernovas} Characters, four copies of the Leader-type Counter Event, and nothing from outside OP-14.",
  ],
  commonCombos: [
    "OP14-015 Zoro attacks with [Rush], then the Leader swaps Zoro's 8000 base onto OP14-002 Urouge, which attacks for 8000, draws a card and K.O.s a small Character.",
    "OP14-009 Law attacks with [Rush], then you play OP14-004 Cavendish and swap Law's 10000 onto it: a 10000 attacker with [Rush] for 2 cost.",
    "OP14-014 Kid plays a 2000 body from hand; Kid cannot attack this turn, so the Leader swaps Kid's 5000 onto a Character played on an earlier turn and that one attacks instead.",
  ],
  keyCardNumbers: [
    "OP14-001",
    "OP14-002",
    "OP14-004",
    "OP14-009",
    "OP14-010",
    "OP14-013",
    "OP14-014",
    "OP14-015",
  ],
  counterplay: [
    "The swap needs two of their Characters on the board. Removing the small bodies early leaves the Leader with nothing to swap and the big ones attacking once each.",
    "A swapped power lasts until end of turn, and it is base power, so a Character lent 8000 is a real 8000 attacker for your Counters.",
    "OP14-003 Capone\"Gang\"Bege only resists K.O. effects of small Characters; a Leader's or an Event's effect removes it.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_087.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP14-001: the fifty, playing small {Supernovas} bodies first, Luffy and Urouge swapped up to attack, Hawkins and Kid restocking the board, and Cavendish swapped with Law for a 10000 [Rush] in the end game.",
    },
  ],
};
