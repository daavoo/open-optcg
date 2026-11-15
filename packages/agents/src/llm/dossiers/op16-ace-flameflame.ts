import type { DeckStrategyDossier } from "./types.js";

export const op16AceFlameflameDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Portgas.D.Ace - FlameFlame 2026-10-04",
  archetype:
    "OP-16 Red Portgas.D.Ace Whitebeard Pirates aggro: a wall of 8000-power bodies that the Leader gives [Rush], two 1-cost searchers and a search Stage to find them, two Edward.Newgate top ends, and Counter Events instead of cheap removal Characters.",
  gamePlan: [
    "The Leader's [Activate: Main] gives [Rush] to a [Monkey.D.Luffy] or to a Whitebeard Pirates Character with 8000 power or more. Play a big body and attack with it the same turn, every turn from four DON!! on.",
    "An 8000-power card in hand is spent four ways: as a Rush target, as the reveal cost on OP16-011 Vista, OP16-003 Edward.Newgate and OP16-020's [Main], as the card OP16-014 Marco trashes to come back from the trash, and as a 2000 Counter while OP16-118 Portgas.D.Ace is on the board. OP16-004 Curiel, OP17-006 Kingdew, Vista, Marco, OP16-017 LittleOars Jr. and OP08-118 Silvers Rayleigh are the 8000s.",
    "Two Edward.Newgate are the top end, four of each. OP16-003 gives your Leader [Double Attack] and +2000 on your turn, so every Leader attack takes two Life. OP17-005 is a 12000 Rush target that costs 6 instead of 10 while the opponent has a 10000-power body, and its [On Play] makes your Leader an 8000 base until the end of the opponent's next End Phase.",
    "OP08-118 Silvers Rayleigh is the one removal body: on play it shrinks two of their Characters by 3000 and 2000 through their next turn, then K.O.s one at 3000 power or less. It is not a Whitebeard Pirate, so the Leader cannot give it [Rush] and it does not switch LittleOars Jr. on.",
    "OP16-021 Moby Dick finds a card on play and later trashes itself to give a rested DON!! to the Leader or a Character, which is an extra 1000 on the turn you swing.",
  ],
  mulligan: [
    "Look for OP16-015 Monkey.D.Luffy first: the Leader names it as a Rush target with no power floor, and it costs 2 behind six DON!!.",
    "Otherwise keep a 1-cost searcher -- OP13-016 Monkey.D.Garp or OP16-021 Moby Dick -- with an 8000-power body for it to find more of.",
    "Throw back a hand of only 7- to 10-drops with no searcher: nothing in it acts before turn 5.",
  ],
  priorities: [
    "Spend the Leader's Rush grant only on a body that was played this turn and could not otherwise attack.",
    "Check OP17-005's discount before deciding it is out of reach: any opposing Character at 10000 power or more makes it a 6-cost 12000, the biggest Rush attack the deck has.",
    "OP17-005's [On Play] sets your Leader's base power to 8000 through the opponent's next turn, so play it on the turn you need the Leader to survive a swing as well as the turn you want to attack.",
    "OP16-003's [On Play] reveals two 8000s from hand for −6000 on one of their Characters this turn: use it to clear a Blocker before the Leader's Double Attack.",
    "OP16-017 LittleOars Jr. is a 4000 Blocker until you have a Whitebeard Pirates Character costing 8 or more: land OP16-003 or OP17-005 first when both are in hand. Rayleigh does not count.",
    "OP17-017 Ga Ha Ha Ha!! is a 1-cost Counter that also gives the attacker −2000 for the turn. Prefer it over a Character Counter when the attacker swings again this turn.",
    "OP16-020 costs nothing: its [Counter] trashes a card for +3000 in that battle, and its [Main] rests a DON!! and reveals an 8000 to draw. Spend it as the Counter when a battle is on the line; draw with it on a turn with a DON!! to spare.",
    "Hold OP08-118 Rayleigh for a board with a small body to K.O. after the −3000 and −2000; against an empty board it is an 8000 that is a 2000 Counter while OP16-118 is out.",
    "Marco's replacement clause K.O.s itself to save another Character from removal, and its [On K.O.] returns it for an 8000 from hand. Keep an 8000 in hand while Marco is on the board.",
  ],
  commonVariants: [
    "The other player build of this Leader on the shelf runs three OP10-005 Sanji, two OP17-016 Rakuyo and two EB01-002 Izo, with three each of OP16-003, OP16-014, OP17-005 and OP17-017. This list cuts the cheap Characters for fourth copies of both Newgates, Marco and Ga Ha Ha Ha!!, two OP16-020 and one OP08-118 Silvers Rayleigh.",
    "Bandai's feature deck under this Leader runs vanilla bodies such as OP13-007, OP16-010 Namule and OP16-005 Thatch where player lists play OP17-006 Kingdew and OP17-005.",
  ],
  commonCombos: [
    "An 8000-power body, then the Leader's Rush grant, then attack with it the same turn.",
    "OP16-003 Edward.Newgate on the board, then a Leader attack: [Double Attack] takes two Life from one hit.",
    "OP16-118 Ace on the board makes every 8000 in hand a 2000 Counter, which is what lets a hand of threats survive a race.",
    "OP08-118 Rayleigh's −3000 on a mid-sized body, then its own K.O. on a second small one.",
  ],
  keyCardNumbers: [
    "OP16-001",
    "OP16-015",
    "OP16-118",
    "OP16-003",
    "OP17-005",
    "OP13-016",
    "OP16-021",
    "OP16-014",
  ],
  counterplay: [
    "The Rush grant needs a fresh 8000-power body or a [Monkey.D.Luffy]; answering the new body before it attacks turns the Leader off.",
    "Avoid leaving a 10000-power Character out when OP17-005 is likely in hand: it is what discounts the 12000.",
    "K.O. OP16-118 Portgas.D.Ace to take the 2000 Counter off every 8000 in their hand at once.",
    "Removal aimed at their board can be redirected onto Marco, which then comes back from the trash for an 8000 from hand. Taking Marco itself off the board with an effect that is not a K.O. skips that return.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/japan-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-11-15",
      note: 'The deck\'s own 50: entry "Red Ace", the list pilot "Hideyoshi" took to 9-2 at FlameFlame, a Bandai event in Japan on 4 Oct 2026.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_102.php",
      retrievedAt: "2026-09-20",
      note: "Bandai's feature deck for OP16-001, which the variants line compares against.",
    },
  ],
};
