import type { DeckStrategyDossier } from "./types.js";

export const op09BuggyTcgmmDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Buggy - TCG Match Making EB05 2026-11-12 #3",
  archetype:
    "Blue {Cross Guild} midrange behind OP09-042, as the EB-05 field builds it: the Leader plays big {Cross Guild} Characters from hand for five DON!!, EB05-021 Alvida turns one of those plays into two bodies, P-084 Buggy stops every Character of cost 3 or 4 from attacking, and four OP06-058 clear two Characters at once.",
  gamePlan: [
    "The Leader's [Activate: Main]: rest 5 of your DON!! and trash 1 card from hand to play a {Cross Guild} Character from your hand, whatever it costs. The higher the cost of the card you play, the more the five DON!! buy.",
    "EB05-021 Alvida is the best card to play through the Leader. Her [On Play] draws 2 and plays another {Cross Guild} Character of cost 8 or less from your hand -- ST25-003 Crocodile & Mihawk, OP12-049 Buggy, OP16-051 Mohji & Cabaji or OP09-048 Mihawk -- and after that you cannot play Characters for the rest of the turn, so make every other play first.",
    "ST25-003 Crocodile & Mihawk draws 2, trashes 1 and plays a {Cross Guild} Character of cost 4 or less from your hand: Alvida into Crocodile & Mihawk into an ST-25 4-cost is three bodies off one activation.",
    "P-084 Buggy cannot attack, and while your Leader is [Buggy] no Character with a cost of 3 or 4 can attack -- yours or your opponent's. Your ST25-001 Alvida, ST25-002 Cabaji and ST25-005 Mohji become cost 5 once you have 2 Characters printed at cost 5 or more, so they escape the ban as your board grows while your opponent's small attackers stay locked. Its [On Play] plays a {Cross Guild} Character of cost 6 or less from your hand.",
    "OP09-051 Buggy puts one of your opponent's Characters on the bottom of their deck, then goes to the bottom of yours unless you have 5 Characters with a cost of 5 or more. Alvida chains make that board: play Buggy once four are already out.",
    "OP06-058 Gravity Blade Raging Tiger, at 7 DON!!, puts up to two Characters of cost 6 or less on the bottom of their owners' decks. It is the deck's answer to a wide board, and the Leader's five DON!! and it are the two big plays a turn can choose between.",
    "EB05-021 Alvida's [When Attacking] negates one of your opponent's Characters' effects for the turn. Attack with her first to switch off a [Blocker] or an effect that would stop the swings after her.",
  ],
  mulligan: [
    "Keep a hand with a 4-cost {Cross Guild} body -- ST25-001 Alvida, ST25-002 Cabaji or ST25-005 Mohji. It is the turn-three play the board for OP09-051 Buggy starts from.",
    "A hand of only searchers, removal and 6-costs or more does nothing until the Leader turns on. Take a new hand.",
  ],
  priorities: [
    "On a turn with a big {Cross Guild} Character in hand, keep five DON!! active for the Leader: a hard cast that leaves fewer than five spends the activation. Play any other Character you want this turn with the DON!! beyond those five before Alvida lands, since her [On Play] ends your Character plays.",
    "Play P-084 Buggy against a deck whose attackers cost 3 or 4. Until two of your Characters are printed at cost 5 or more, the ban stops your own ST-25 4-costs attacking too, so land it when your board is past that or when you are defending.",
    "Count your Characters with a cost of 5 or more before you play OP09-051 Buggy. With fewer than four already out it removes one of theirs and then leaves.",
    "OP12-049 Buggy is a 7000-power 6-cost with a 2000 Counter: a body to play through Alvida or the Leader, and a Counter to keep in hand when the turn does not need it.",
    "OP16-051 Mohji & Cabaji draws 2 when your hand is 5 cards or fewer: play it after the turn's other plays have spent the hand down.",
    "OP16-056 Mr.3 trashes itself to draw 2 and stop one of your opponent's Characters of cost 9 or less attacking until their next turn ends: use it the turn before their biggest attacker swings.",
    "ST25-003 Crocodile & Mihawk, once a turn, lets you trash a card from hand instead of losing a {Cross Guild} Character to your opponent's effect. Keep a card in hand when your best body is threatened.",
  ],
  commonVariants: [
    "Earlier EB-05 Buggy lists, like the 12th place at ChinoizeCup #124, play EB03-021 Alvida, EB05-028 Boa Hancock and ST33-004 Borsalino in the slots this list gives to OP12-049 Buggy, OP16-051 Mohji & Cabaji and the third and fourth OP06-058.",
    "Bandai's feature deck for the Leader is the ST-25 starter upgraded with OP-09 and PRB-02 cards, built around OP09-046 Crocodile and ST25-004 Buggy rather than Alvida.",
  ],
  commonCombos: [
    "The Leader plays EB05-021 Alvida; Alvida draws 2 and plays ST25-003 Crocodile & Mihawk; Crocodile & Mihawk draws 2 and plays an ST-25 4-cost. Three bodies and four cards for five DON!! and one card.",
    "Two Characters printed at 5 or more turn every ST25-001, ST25-002 and ST25-005 into a 5-cost: they can attack under P-084's ban, and four of those plus OP09-051 Buggy is the five Buggy needs to stay.",
  ],
  keyCardNumbers: [
    "OP09-042",
    "EB05-021",
    "ST25-003",
    "P-084",
    "OP09-051",
    "OP06-058",
    "ST25-001",
  ],
  counterplay: [
    "Their Leader needs 5 active DON!! and a card from hand each time: a turn spent on it leaves little DON!! for Counters.",
    "While P-084 Buggy is on their field under a [Buggy] Leader, your Characters of cost 3 or 4 cannot attack. Remove it, or attack with cards outside that band.",
    "Remove the cost-5 bodies before OP09-051 Buggy lands and Buggy goes straight back to the bottom of their deck.",
    "EB05-021 Alvida negates one Character's effect when she attacks. Do not rely on a single [Blocker] or on-field effect to stop her turn.",
    "ST25-003 Crocodile & Mihawk answers one removal a turn for a card from hand. Remove it first, or remove twice.",
    "At 7 DON!! OP06-058 can bottom two of your Characters of cost 6 or less: do not commit a third body you cannot afford to lose with them.",
  ],
  sources: [
    {
      url: "https://www.patreon.com/tcgmatchmaking",
      retrievedAt: "2026-11-12",
      note: "TCG Match Making's EB05 Weekly Power Rankings of 12 Nov 2026: this fifty is its #3 list, sharpened there by EB05-021 Alvida.",
    },
    {
      url: "https://play.limitlesstcg.com/tournament/6ad09157115c12b73a5a4654/standings",
      retrievedAt: "2026-10-23",
      note: "The 12th-place Buggy list of 128 at [EB05] ChinoizeCup #124, an online event played on 19 Oct 2026: the earlier build the first variants line describes.",
    },
    {
      url: "https://www.youtube.com/watch?v=jULeKpwklYI",
      retrievedAt: "2026-10-23",
      note: "Car D. Kaizoku's EB-05 Buggy deck tech: EB05-021 Alvida played through the Leader as the main line, her [On Play] chaining into Crocodile & Mihawk, her attack-time negate clearing the way, and two P-084 Buggy.",
    },
  ],
};
