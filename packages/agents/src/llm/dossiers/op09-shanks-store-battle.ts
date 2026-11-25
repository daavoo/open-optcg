import type { DeckStrategyDossier } from "./types.js";

export const op09ShanksStoreBattleDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Shanks - 1st Place Store Battle 2026-06-13",
  archetype:
    "Red Shanks midrange behind OP09-001, as a Store Battle winner builds it: cheap power cuts and Blockers that cut the attacker, OP16-012 Benn.Beckman cheating a 10-cost Shanks out at ten DON!!, [On Play] removal on the top end, and OP16-018 Rockstar turning the spare 6000-plus bodies in hand into protection for the board.",
  gamePlan: [
    "Defend with power cuts. Once per turn, when your opponent attacks, the Leader gives their Leader or a Character −1000. OP12-008 Shanks is a 6000 [Blocker] whose [On Your Opponent's Attack] trashes a card from hand for another −2000 on an attacker. Together they take 3000 off one attack, which is often the difference between a hit and a miss.",
    "Attack with cuts in front of you: OP09-011 Hongo rests itself for −2000 on an opposing Character, and OP13-007 Ace & Sabo & Luffy gives a DON!! and trashes itself for −3000. Cut the defender before the swing so a smaller body wins its battle.",
    "At ten DON!!, play OP16-012 Benn.Beckman for 5 and rest 1 more DON!!: its [On Play] plays a [Shanks] from your hand for free. Bring OP06-007 Shanks to K.O. a Character with 10000 power or less, or OP09-004 Shanks, which has [Rush] and gives every opposing Character −1000 while it stays.",
    "Once a 10000-or-more Character is on your field, ST23-001 Uta costs 4 less: a 2-cost 4000 [Blocker] to play with the DON!! left over after the Beckman turn.",
    "ST23-002 Shanks is a 10000 body whose [On Play] gives your Red-Haired Leader +2000 until the end of your opponent's next End Phase. It costs 3 less while your opponent has a Character with 8000 base power or more.",
    "OP09-009 Benn.Beckman is the mid-game removal: its [On Play] trashes a Character with 6000 power or less, and the power cuts above lower a bigger one into reach first.",
    "OP16-018 Rockstar, once per turn, trashes a Character card with 6000 power or more from your hand instead of one of your {Red-Haired Pirates} Characters being K.O.'d. The 10-cost Shanks you cannot cast yet and the second Benn.Beckman are what it spends.",
  ],
  mulligan: [
    "Keep a hand with a searcher -- OP09-002 Uta or OP09-020, both looking at 5 for a {Red-Haired Pirates} card -- or a 3-or-4-cost body: OP09-011 Hongo, OP12-008 Shanks, OP09-015 Lucky.Roux.",
    "The 10-costs and ST23-002 are late cards. A hand of them with no early play does nothing until turn five. Take a new hand.",
  ],
  priorities: [
    "Use the Leader's −1000 on the attack that would otherwise connect, not the first one; it is once per turn.",
    "OP12-008 Shanks's −2000 costs a card from hand. Pay it when it stops a hit on your Leader or saves a Character, and trash a card you cannot use this game.",
    "Hold OP16-012 Benn.Beckman with a [Shanks] in hand until you have ten DON!! on your field; below ten its [On Play] does nothing and it is only a 6000 [Blocker].",
    "Pick the Shanks Beckman plays by the board: OP06-007 when one opposing Character is the problem, OP09-004 when you want an attacker the same turn and the opposing board is full of small bodies.",
    "Two cards spend a 6000-or-more Character from your hand: PRB02-003 Lucky.Roux's [On Play] trashes one to draw 2, and Rockstar trashes one to save a Character. Spend a spare 10-cost Shanks or an extra OP09-009 Benn.Beckman, never your last Shanks when Beckman's ten-DON!! turn is close.",
    "Save Rockstar's replacement for a Character worth a card: OP12-008 Shanks, OP16-012 Benn.Beckman, or a 10-cost Shanks. It is once per turn, so it covers one K.O. on each of the opponent's turns.",
    "OP09-015 Lucky.Roux is a [Blocker] whose [On K.O.] K.O.s a Character with 6000 base power or less. Block with it when it would be K.O.'d anyway, and do not spend Rockstar to save it.",
  ],
  commonVariants: [
    "The 29 Jun 2026 Store Battle winner under this Leader runs three PRB02-001 Koby and three PRB02-002 Trafalgar Law, for a [When Attacking] K.O. and a −2000 attacker, where this list runs four OP16-018 Rockstar and the fourth OP09-004 Shanks, Lucky.Roux and OP09-020.",
    "The Starter Deck 23 list for this Leader runs the vanilla and 1-cost Red-Haired bodies -- OP09-006 Howling Gab, OP09-010 Bonk Punch with OP09-012 Monster, OP09-013 Yasopp, OP09-014 Limejuice, OP09-016 Rockstar, ST23-004 Luffy and ST23-005 Yasopp -- where this list runs the searchers, the OP12-008 and OP16-012 Blockers, Rockstar and the 10-cost Shanks.",
  ],
  commonCombos: [
    "Ten DON!!: OP16-012 Benn.Beckman plays OP06-007 Shanks for free, which K.O.s a Character, then ST23-001 Uta costs 2 with Shanks on the board.",
    "On the opponent's attack: the Leader's −1000 and OP12-008 Shanks's −2000 on the same attacker.",
    "Hongo or OP13-007 on a defender, then OP09-009 Benn.Beckman trashes it at 6000 power or less.",
    "Their removal targets OP12-008 Shanks; Rockstar trashes a spare 10-cost Shanks from hand instead, and the Blocker stays.",
  ],
  keyCardNumbers: [
    "OP09-001",
    "OP12-008",
    "OP16-012",
    "OP06-007",
    "OP09-004",
    "OP09-009",
    "OP16-018",
    "ST23-002",
    "OP09-002",
  ],
  counterplay: [
    "Their Leader cuts one attack a turn by 1000, and OP12-008 Shanks cuts one by 2000 for a card. Lead with the attack you can afford to lose, then send the real one.",
    "The big turn needs ten DON!! and OP16-012 Benn.Beckman in hand. Pressure before ten; after it, expect a free 10-cost Shanks with Beckman.",
    "Rockstar stops one K.O. of a {Red-Haired Pirates} Character a turn, at the cost of a big card from their hand. K.O. Rockstar first, or K.O. two Characters in one turn.",
    "OP09-015 Lucky.Roux takes a 6000 base-power or smaller Character with it when K.O.'d. Attack it with something you do not mind losing, or leave it alone.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/",
      retrievedAt: "2026-11-25",
      note: 'The deck\'s own 50: the list "Doffy" took to 1st (4-0) at a Store Battle at Ludotrotter Charleroi, Belgium, on 13 Jun 2026 (entry "Red Shanks"); the same page carries the 29 Jun 2026 Panama winner in the first variants line.',
    },
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569023",
      retrievedAt: "2026-10-12",
      note: "Bandai's ST-23 card list, the source of the Leader's text and the starter-deck cards named in the variants line.",
    },
  ],
};
