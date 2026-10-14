import type { DeckStrategyDossier } from "./types.js";

export const op12RayleighDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Silvers Rayleigh - Official Feature Deck",
  archetype:
    "Red low-cost aggro behind OP12-001: a Leader that bans cards of cost 5 or more and, once a turn, gives +2000 to a 4000-base-power-or-less Character if you reveal 2 Events from your hand.",
  gamePlan: [
    "Revealing is not spending. The Leader's [Activate: Main], OP12-003 Crocus, OP12-004 Kouzuki Oden, OP12-009 Jinbe, OP12-013 Hatchan and OP12-015 Monkey.D.Luffy all ask you to reveal 2 Events from your hand; the Events stay in hand afterwards. Your first goal every game is to hold 2 Events.",
    "OP12-006 Shakuyaku and OP12-014 Boa Hancock look at 5 cards for a red Event (or a [Monkey.D.Luffy]). Play them early to reach 2 Events in hand.",
    "Use the Leader's +2000 on a cheap body to make it a real attacker without giving DON!!: OP12-014 Boa Hancock attacks at 5000 for its 2 cost.",
    "The deck wins on the number of attacks, not their size. Build several small Characters and attack with all of them in the mid-game.",
    "OP12-015 Monkey.D.Luffy with 2 Events revealed plays a red Character with 3000 power or less from hand and gives a rested DON!!. He gains +2000 while you have 2 or more given DON!! in total, across your Leader and Characters, so spread DON!! to arm several attackers at once.",
    "OP12-017 Color of Observation Haki gives 1 active DON!! to your Leader and looks at 4 for a red Event or a Character of cost 3 or more, such as Luffy or Jinbe. Reveal it for the Leader first, and play it when you already hold enough other Events.",
    "To close: once the opponent's Life is low, play Events from hand rather than hold them. OP12-016 gives your Leader 2 active DON!! and stops Blockers against it this turn, and OP12-019 Color of Arms Haki adds +1000 more.",
  ],
  mulligan: [
    "Keep a hand with 2 of the Haki Events (OP12-016 to OP12-019), or with OP12-006 Shakuyaku or OP12-014 Boa Hancock to search for them.",
    "Every card in the deck costs 4 or less, so having a play is never the problem. A hand with fewer than 2 Events and no searcher cannot pay the Leader or most of the Characters. Take a new hand.",
  ],
  priorities: [
    "Before spending an Event as a Counter or on its [Main], count the Events left in hand. Dropping below 2 turns off the Leader and every reveal Character until you find another.",
    "Activate the Leader every turn you hold 2 Events. Aim it at the Character whose attack it changes the most, usually one that reaches the next 1000 above the defender.",
    "OP12-007 Shanks gives [Rush] to another {Roger Pirates} Character, which in this list is OP12-004 Kouzuki Oden. Play Oden first, then Shanks, and Oden can attack that turn.",
    "OP12-012 Buggy gives [Blocker] to another {Roger Pirates} Character until the end of your opponent's next turn. Use it on the turn you go wide and leave yourself open.",
    "OP12-013 Hatchan and OP12-014 Boa Hancock each give 2 rested DON!! to your Leader or a Character. Use them to arm a second attacker, or to turn on Luffy's +2000.",
    "OP12-018 Color of the Supreme King Haki is a +2000 [Counter] that can also rest 1 DON!! to give your opponent's Leader and all their Characters -1000 for the turn. Use the second half when it stops several of their attacks, not just one.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader: thirteen slots, sixteen Events, all of it from OP-12.",
  ],
  commonCombos: [
    "Leader reveal on OP12-014 Boa Hancock: a 5000 attacker for 2 DON!!.",
    "OP12-004 Kouzuki Oden then OP12-007 Shanks: Oden attacks the turn he is played, and his own 2-Event reveal makes him 5000.",
    "OP12-015 Monkey.D.Luffy reveals 2 Events and plays OP12-014 Boa Hancock or OP12-009 Jinbe from hand: two bodies for 4 DON!!.",
    "OP12-016 then OP12-019 on your Leader: 2 active DON!! and +1000, and the opponent cannot block that attack.",
  ],
  keyCardNumbers: [
    "OP12-001",
    "OP12-006",
    "OP12-014",
    "OP12-015",
    "OP12-016",
    "OP12-017",
    "OP12-018",
    "OP12-019",
  ],
  counterplay: [
    "The deck needs 2 Events in hand to function. Forcing it to spend Events as Counters turns off its Leader and its reveal Characters.",
    "Its Characters are small. Blockers and removal of 4 cost or less trade evenly with its whole board.",
    "Three of its four Events are +2000 Counters, so a hand it is holding for the Leader is also a hand of defence. Attack where one Counter is not enough.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_073.php",
      retrievedAt: "2026-10-04",
      note: "Bandai's feature deck for OP12-001: the fifty, the plan to secure 2 Events early with Shakuyaku and Boa Hancock, the Leader's +2000 on Hancock for a 5000 attacker, Luffy's spread-DON!! +2000 for mid-game width, Color of Observation Haki as a search for attackers, and OP12-016 plus OP12-019 to close.",
    },
  ],
};
