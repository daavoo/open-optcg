import type { DeckStrategyDossier } from "./types.js";

export const op09BuggyDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Buggy - Official Feature Deck",
  archetype:
    "Blue {Cross Guild} midrange behind OP09-042: put Characters of cost 5 or more on the field, then play the 10-cost OP09-051 Buggy through the Leader for five DON!! and keep it.",
  gamePlan: [
    "The Leader's [Activate: Main]: rest 5 of your DON!! and trash 1 card from hand to play any {Cross Guild} Character from your hand, whatever its cost. It is how the deck plays its 7-, 8- and 10-cost cards early, and it can be used more than once a turn if you have the DON!! and the cards.",
    "OP09-051 Buggy is the goal. Played through the Leader it is a 12000 body for five DON!!, and its [On Play] puts one of your opponent's Characters on the bottom of their deck. Then, unless you have 5 Characters with a cost of 5 or more (Buggy counts), Buggy goes to the bottom of your deck too. Play it when you already have four.",
    "Build the four first. ST25-001 Alvida, ST25-002 Cabaji and ST25-005 Mohji cost 4, but each counts as a 5-cost once you have 2 Characters printed at cost 5 or more. OP09-045 Cabaji and P-082 Crocodile are real 5-costs; OP09-048 Mihawk (6), OP09-046 Crocodile (7) and ST25-003 Crocodile & Mihawk (8) are the big ones the Leader plays.",
    "ST25-003 Crocodile & Mihawk draws 2 and trashes 1, then plays a {Cross Guild} Character of cost 4 or less from your hand for free. ST25-004 Buggy trashes a card and itself to play a {Cross Guild} Character of cost 6 or less from your hand -- OP09-048 Mihawk is the usual target, and it draws on arrival. OP09-046 Crocodile plays a 5-or-less from hand.",
    "The Leader's trash cost and ST25-004's eat cards. OP09-048 Mihawk, ST25-001 Alvida (draw 3, trash 2) and ST25-003 keep the hand full; OP09-056 Mr.3 and the OP09-057 Cross Guild Event dig four deep for a {Cross Guild} card.",
  ],
  mulligan: [
    "Keep a hand with a 4- or 5-cost body: ST25-001, ST25-002, ST25-004, ST25-005, OP09-045 or P-082. It is the turn-three play the rest of the deck builds on.",
    "A hand of only searchers, big Characters and Blockers does nothing until the Leader turns on. Take a new hand.",
  ],
  priorities: [
    "Count your Characters with a cost of 5 or more before playing OP09-051 Buggy. With fewer than four already on the field it removes one of theirs and then leaves.",
    "ST25-002 Cabaji and ST25-005 Mohji gain [Blocker] only beside two Characters printed at cost 5 or more. Before that they are 1000-power bodies.",
    "ST25-002 Cabaji has +5000 power on your opponent's turn: a 6000 defender for 4.",
    "ST25-003 Crocodile & Mihawk, once a turn, lets you trash a card from hand instead of a {Cross Guild} Character leaving the field to your opponent's effect. Keep a card in hand when your best body is threatened.",
    "PRB02-009 Mr.3 is a 2-cost [Blocker]. If your opponent's effect rests it, you may trash it to draw 2.",
    "When hand or Life runs low, spend spare DON!! on Blockers rather than another big body.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader: the ST-25 Blue Buggy starter at four copies of each card, upgraded with PRB-02 and OP-09 singles.",
  ],
  commonCombos: [
    "ST25-003 Crocodile & Mihawk played through the Leader draws 2, then plays ST25-004 Buggy for free; ST25-004 then trashes itself to play OP09-048 Mihawk, which draws 2 more.",
    "Two Characters printed at 5 or more turn every Alvida, Cabaji and Mohji into a 5-cost, and four of those plus OP09-051 Buggy is the five Buggy needs to stay.",
  ],
  keyCardNumbers: [
    "OP09-042",
    "OP09-051",
    "ST25-003",
    "ST25-004",
    "ST25-001",
    "OP09-048",
    "OP09-046",
  ],
  counterplay: [
    "Removal on the cost-5 bodies before OP09-051 Buggy lands sends Buggy straight back to the bottom of their deck.",
    "Their Leader needs 5 active DON!! and a card from hand each time: a turn spent on it is a turn with little DON!! left for Counters.",
    "ST25-003 Crocodile & Mihawk answers one removal a turn for a card from hand. Remove it first, or remove twice.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_078.php",
      retrievedAt: "2026-10-04",
      note: "Bandai's feature deck for OP09-042: the fifty, playing as many cost-5-or-more Characters as possible early (counting ST25-001 Alvida as one), Crocodile & Mihawk drawing and playing ST25-004 Buggy, ST25-004 playing OP09-048 Mihawk, OP09-051 Buggy through the Leader with four 5-costs out, and PRB02-009 Mr.3 as the late-game Blocker.",
    },
  ],
};
