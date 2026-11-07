import type { DeckStrategyDossier } from "./types.js";

export const st21LuffyOpenDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Monkey.D.Luffy - Open OPTCG",
  archetype:
    "Red ST21-001 Monkey.D.Luffy as a Rush deck: the Leader, Thousand Sunny, ST21-014 Luffy, OP15-012 Buggy and P-101 Chopper hand out rested DON!!, and given DON!! is what switches on [Rush] for Zoro, Sanji and ST31-004 Luffy.",
  gamePlan: [
    "The Leader's [DON!! x1] [Activate: Main] [Once Per Turn] gives up to 2 rested DON!! to one of your Characters. Give it 1 DON!! first -- P-101 Chopper's [On Play] or Thousand Sunny's activation can be that DON!! -- and spend the 2 on the Character that gains [Rush] from them.",
    "ST21-015 Roronoa Zoro and ST31-001 Sanji each gain [Rush] at [DON!! x2]: the Leader's 2 rested DON!! make either one attack the turn it lands. ST31-001 Sanji also draws and plays a Straw Hat Character costing 5 or less from hand, so one play can be two bodies.",
    "ST31-004 Monkey.D.Luffy gains [Rush] once your field holds 3 or more given DON!! in total, on any of your cards. Its [On Play] gives an opponent's Character -1000 for each Straw Hat card on your field: play it on a wide board to take down a Blocker or a large attacker.",
    "ST21-014 Monkey.D.Luffy has [Rush] printed, and its [When Attacking] gives a rested DON!!, as does OP15-012 Buggy's: each attack puts a DON!! where the next attacker or ST31-003 Brook needs it.",
    "OP10-005 Sanji is 6000 on your turn for 3, and ST21-003 Sanji stops the opponent's [Blocker] for one Straw Hat with 6000 or more that turn: pair them, or ST21-003 with ST21-014, to push an attack through a Blocker.",
    "OP01-016 Nami, EB04-002 Jewelry Bonney and ST31-005 Thousand Sunny look for a Straw Hat card; almost every card in the list is one.",
  ],
  mulligan: [
    "Keep a 1-cost searcher -- Nami, Bonney or Thousand Sunny -- and a 2- or 3-cost body, so turn 2 develops and a Rush play is on curve.",
    "A hand of 5- and 7-costs with no searcher takes a new hand.",
  ],
  priorities: [
    "Give DON!! before attacking: the Leader's gift, Sunny's activation and the 2 for [DON!! x2] all raise power that is fixed when the attack is declared.",
    "Count given DON!! across the whole field before playing ST31-004 Luffy: at 3 it attacks this turn, without any DON!! on itself.",
    "ST31-003 Brook is a [Blocker] with +3000 on the opponent's turn only while your field holds 3 or more given DON!!. Given DON!! returns at your Refresh Phase, not theirs: the DON!! you gave this turn is what keeps Brook a Blocker through their attacks.",
    "ST31-002 Jinbe and OP10-011 Chopper are the [Blocker]s that do not need given DON!!: Chopper is 6000 on the opponent's turn. Keep one standing when your Life is low.",
    "OP04-016 Bad Manners Kick Course is +3000 for a card from hand; its [Trigger] gives an opponent's Leader or Character -3000 for the turn.",
  ],
  commonVariants: [
    "The ST-31 starter behind this Leader plays OP11-003 Usopp, OP11-009 Nico Robin, OP11-012 Franky, OP14-015 Roronoa Zoro, ST23-004 Monkey.D.Luffy and OP13-021 Gum-Gum Gatling Gun. This list cuts them for EB04-002 Bonney, both OP10 cards, OP15-012 Buggy and the ST21 Sanji, Luffy and Zoro, and runs four ST31-001 Sanji, ST31-004 Luffy and Thousand Sunny.",
  ],
  commonCombos: [
    "Play P-101 Chopper to give the Leader a rested DON!!, then use the Leader to give 2 rested DON!! to Zoro or ST31-001 Sanji so it attacks this turn.",
    "ST31-001 Sanji with 5 DON!!: draw, play ST21-015 Zoro or P-101 Chopper from hand, and use the Leader's gift on whichever needs [Rush].",
    "Attack with ST21-014 Luffy and Buggy first; their gifts bring the field to 3 given DON!! for ST31-004 Luffy's [Rush] and Brook's [Blocker].",
  ],
  keyCardNumbers: [
    "ST21-001",
    "ST31-001",
    "ST21-015",
    "ST21-014",
    "ST31-004",
    "ST31-005",
    "P-101",
    "ST21-003",
  ],
  counterplay: [
    "Their Rush needs given DON!!: a turn the Leader cannot get its 1 DON!! is a turn Zoro and Sanji attack one turn late.",
    "Brook is a Blocker only above 3 given DON!!; attack after their attackers' DON!! has returned at Refresh only if Brook was the reason to wait.",
    "Many of their Characters have no Counter value of their own, and OP04-016 costs a card from hand: pressure the hand and their defence thins quickly.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/products/st31.html",
      retrievedAt: "2026-08-09",
      note: "Bandai's ST-31 product page, the precon this list is compared against in the variants line. This deck's own 50 was supplied by the maintainer.",
    },
  ],
};
