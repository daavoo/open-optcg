import type { DeckStrategyDossier } from "./types.js";

export const op16AceOpenDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Portgas.D.Ace - Open OPTCG",
  archetype:
    "OP-16 Red Portgas.D.Ace Whitebeard Pirates aggro, built for the OP-17 field: the feature deck's Rush-an-8000 core with its vanilla bodies replaced by OP-17 Whitebeard Pirates that carry a clause, plus a Counter Event.",
  gamePlan: [
    "The Leader's [Activate: Main] gives [Rush] to a [Monkey.D.Luffy] or to a Whitebeard Pirates Character with 8000 power or more. Play a big body and attack with it the same turn, every turn from four DON!! on.",
    "8000 power is spent three ways from the same card: as a Rush target, as the reveal cost on OP16-011 Vista and OP16-003 Edward.Newgate, and as a 2000 Counter while OP16-118 Portgas.D.Ace is on the board. OP16-004 Curiel, OP17-006 Kingdew, Vista and OP16-014 Marco are the 8000s.",
    "OP17-005 Edward.Newgate is the second top end beside OP16-003: a 12000 Rush target, which costs 6 instead of 10 while the opponent has a 10000-power body, and whose [On Play] makes your Leader an 8000 base until the end of the opponent's next End Phase.",
    "The cheap slots are removal and tempo rather than 1-drops: OP17-016 Rakuyo K.O.s two 2000-base Characters on play, OP10-005 Sanji is a 6000 attacker on your turn for 3, and EB01-002 Izo gives a rested DON!! when it lands.",
  ],
  mulligan: [
    "Look for OP16-015 Monkey.D.Luffy first: the Leader names it as a Rush target with no power floor, and it prices itself at 2 behind six DON!!.",
    "Otherwise keep a 1-cost searcher -- OP13-016 Monkey.D.Garp or OP16-021 Moby Dick -- with an 8000-power body for it to find more of.",
    "Throw back a hand of only 7- and 10-drops with no searcher: nothing in it acts before turn 5.",
  ],
  priorities: [
    "Spend the Leader's Rush grant only on a body that was played this turn and could not otherwise attack.",
    "Check OP17-005's discount before deciding it is out of reach: any opposing Character at 10000 power or more makes it a 6-cost 12000, which is the biggest Rush attack the deck has.",
    "OP17-005's [On Play] sets your Leader's base power to 8000 through the opponent's next turn, so play it on the turn you need the Leader to survive a swing as well as the turn you want to attack.",
    "Hold OP17-016 Rakuyo until the opponent has a 2000-base body worth K.O.ing -- two is the best case. Against an empty or high-power board it is a 2000 Counter.",
    "OP17-017 Ga Ha Ha Ha!! is a 1-cost Counter that also gives the attacker −2000 for the turn. Prefer it over a 2000-Counter Character when the attacker swings again this turn or when a second −2000 turns a later battle.",
    "EB01-002 Izo's [On Your Opponent's Attack] trashes a card for −2000 on the attacker. It is the same trade as a 2000 Counter, so pay it with a card that is not an 8000 while OP16-118 is out.",
    "OP16-017 LittleOars Jr. is 8000 only while you have a Whitebeard Pirates Character costing 8 or more: land OP16-003 or OP17-005 first when both are in hand.",
  ],
  commonVariants: [
    "Bandai's feature deck under this Leader runs four-ofs of OP13-007, OP16-010 Namule and OP16-005 Thatch and two OP16-016 Ramba in the slots this list gives to Kingdew, OP17-005, Rakuyo, Izo, Sanji and Ga Ha Ha Ha!!.",
  ],
  commonCombos: [
    "An 8000-power body, then the Leader's Rush grant, then attack with it the same turn.",
    "OP16-003 Edward.Newgate on the board, then a Leader attack: [Double Attack] takes two Life from one hit.",
    "OP16-118 Ace on the board makes every 8000 in hand a 2000 Counter, which is what lets a hand of threats survive a race.",
  ],
  keyCardNumbers: [
    "OP16-001",
    "OP16-015",
    "OP16-118",
    "OP16-003",
    "OP17-005",
    "OP13-016",
    "OP16-021",
  ],
  counterplay: [
    "The Rush grant needs a fresh 8000-power body or a [Monkey.D.Luffy]; keeping their board under 8000 or answering the new body before it attacks turns the Leader off.",
    "Avoid leaving a 10000-power Character out when OP17-005 is likely in hand: it is what discounts the 12000.",
    "K.O. OP16-118 Portgas.D.Ace to take 2000 Counter off every 8000 in their hand at once.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_102.php",
      retrievedAt: "2026-09-20",
      note: "Bandai's feature deck for OP16-001, which the variants line compares against. This deck's own 50 was supplied by the maintainer.",
    },
    {
      url: "https://www.thornberrymedia.com/post/op-17-red-ace-deck-list",
      retrievedAt: "2026-08-26",
      note: "OP-17 assessment of the archetype: names OP17-005, OP17-006 and OP17-016 as the cards player lists add over the vanilla 8000s.",
    },
  ],
};
