import type { DeckStrategyDossier } from "./types.js";

export const op09BuggyTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Buggy - 33rd Place ChinoizeCup #124",
  archetype:
    "Blue {Cross Guild} midrange behind OP09-042, as the EB-05 field builds it: the Leader plays big {Cross Guild} Characters from hand for five DON!!, and EB05-021 Alvida turns one of those plays into two bodies.",
  gamePlan: [
    "The Leader's [Activate: Main]: rest 5 of your DON!! and trash 1 card from hand to play a {Cross Guild} Character from your hand, whatever it costs. The higher the cost of the card you play, the more the five DON!! buy.",
    "EB05-021 Alvida is the best card to play through the Leader. Her [On Play] draws 2 and plays another {Cross Guild} Character of cost 8 or less from your hand -- ST25-003 Crocodile & Mihawk, OP09-048 Mihawk or OP16-051 Mohji & Cabaji -- and after that you cannot play Characters for the rest of the turn, so make every other play first.",
    "ST25-003 Crocodile & Mihawk draws 2, trashes 1 and plays a {Cross Guild} Character of cost 4 or less from your hand: Alvida into Crocodile & Mihawk into an ST-25 4-cost is three bodies off one activation.",
    "OP09-051 Buggy puts one of your opponent's Characters on the bottom of their deck, then goes to the bottom of yours unless you have 5 Characters with a cost of 5 or more. Alvida chains make that board: play Buggy once four are already out.",
    "ST25-001 Alvida, ST25-002 Cabaji and ST25-005 Mohji cost 4 but count as cost 5 once you have 2 Characters printed at cost 5 or more, and Cabaji and Mohji gain [Blocker] then.",
    "EB05-021 Alvida's [When Attacking] negates one of your opponent's Characters' effects for the turn. Attack with her first to switch off a [Blocker] or an effect that would stop the swings after her.",
  ],
  mulligan: [
    "Keep a hand with a 4-cost {Cross Guild} body -- ST25-001 Alvida, ST25-002 Cabaji or ST25-005 Mohji. It is the turn-three play the board for OP09-051 Buggy starts from.",
    "A hand of only searchers, removal and 6-costs or more does nothing until the Leader turns on. Take a new hand.",
  ],
  priorities: [
    "On a turn with a big {Cross Guild} Character in hand, keep five DON!! active for the Leader: a hard cast that leaves fewer than five spends the activation. Play any other Character you want this turn with the DON!! beyond those five before Alvida lands, since her [On Play] ends your Character plays.",
    "Count your Characters with a cost of 5 or more before you play OP09-051 Buggy. With fewer than four already out it removes one of theirs and then leaves.",
    "ST25-001 Alvida, ST25-003 Crocodile & Mihawk and OP09-048 Mihawk all trash from hand by their effects. On a turn one has, ST33-004 Borsalino costs 3 less, so it is a cheap [Blocker] to add.",
    "ST33-003 Smoker trashes a card to put two of your opponent's Characters of cost 2 or less on the bottom of their deck; play it into a wide board of small bodies, not into an empty one.",
    "OP17-046 Gloriosa is a 4-cost [Blocker] whose [On Play] puts a Character of cost 5 or less on the bottom of its owner's deck.",
    "OP16-056 Mr.3 trashes itself to draw 2 and stop one of your opponent's Characters of cost 9 or less attacking until their next turn ends: use it the turn before their biggest attacker swings.",
    "ST25-003 Crocodile & Mihawk, once a turn, lets you trash a card from hand instead of losing a {Cross Guild} Character to your opponent's effect. Keep a card in hand when your best body is threatened.",
  ],
  commonVariants: [
    "Most EB-05 Buggy lists play two or three P-084 Buggy, and some add ST25-004 Buggy or EB03-021 Alvida; this one plays OP17-046 Gloriosa and ST33-003 Smoker instead.",
    "Some lists add one or two EB05-028 Boa Hancock, which makes an opponent holding 9 or more cards trash 4.",
    "Bandai's feature deck for the Leader is the ST-25 starter upgraded with OP-09 and PRB-02 cards, built around OP09-046 Crocodile and ST25-004 Buggy rather than Alvida.",
  ],
  commonCombos: [
    "The Leader plays EB05-021 Alvida; Alvida draws 2 and plays ST25-003 Crocodile & Mihawk; Crocodile & Mihawk draws 2 and plays an ST-25 4-cost. Three bodies and four cards for five DON!! and one card.",
    "Two Characters printed at 5 or more turn every ST25-001, ST25-002 and ST25-005 into a 5-cost, and four of those plus OP09-051 Buggy is the five Buggy needs to stay.",
  ],
  keyCardNumbers: [
    "OP09-042",
    "EB05-021",
    "ST25-003",
    "OP09-051",
    "OP09-048",
    "OP16-051",
    "ST25-001",
  ],
  counterplay: [
    "Their Leader needs 5 active DON!! and a card from hand each time: a turn spent on it leaves little DON!! for Counters.",
    "Remove the cost-5 bodies before OP09-051 Buggy lands and Buggy goes straight back to the bottom of their deck.",
    "EB05-021 Alvida negates one Character's effect when she attacks. Do not rely on a single [Blocker] or on-field effect to stop her turn.",
    "ST25-003 Crocodile & Mihawk answers one removal a turn for a card from hand. Remove it first, or remove twice.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6ad09157115c12b73a5a4654/standings",
      retrievedAt: "2026-10-23",
      note: "The deck's own 50: the 33rd-place list of 128 at [EB05] ChinoizeCup #124, an online event played on 19 Oct 2026; the same standings are the source for the P-084 and ST25-004 lists in the variants line.",
    },
    {
      url: "https://www.youtube.com/watch?v=jULeKpwklYI",
      retrievedAt: "2026-10-23",
      note: "Car D. Kaizoku's EB-05 Buggy deck tech: EB05-021 Alvida played through the Leader as the main line, her [On Play] chaining into Crocodile & Mihawk, and her attack-time negate clearing the way.",
    },
  ],
};
