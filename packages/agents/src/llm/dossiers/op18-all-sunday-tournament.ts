import type { DeckStrategyDossier } from "./types.js";

export const op18AllSundayTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Ms. All Sunday - 4th Place ChinoizeCup #136",
  archetype:
    "Mono-blue OP18-041 Ms. All Sunday as a {Baroque Works} attrition deck: a wide board of cheap partner pairs that each cost the opponent a card when they are K.O.'d, chain-plays from Mr.1 & Miss Doublefinger, Mr.5 & Miss.Valentine and OP16-045 Crocodile, attack locks from Mr.3 & Miss.Goldenweek and OP16-056 Mr.3, and the OP-16 Impel Down Mr.1 and Mr.2 that draw a card as they land, so the hand stays stocked for counters and protection.",
  gamePlan: [
    'The Leader has no activation. Whenever one of your Characters whose type includes "Baroque Works" and whose base power is 3000 or more is K.O.\'d -- in battle or by an effect, on either player\'s turn, as often as it happens -- you draw 1 and your opponent trashes 1 card from hand. "Former Baroque Works" includes it, so OP16-045 Crocodile and OP16-056 Mr.3 count alongside every OP-18 pair. OP09-056 Mr.3, OP16-054 Mr.1 and OP16-055 Mr.2 are under 3000 base power and EB05-028 Boa Hancock is not Baroque Works, so those four do not. A Character that is trashed, returned or bottom-decked does not count either, so OP16-056 Mr.3 trashing itself draws only its own 2.',
    "So the board is a tax: put 3000-power bodies out and let the opponent spend attacks and removal on them. Each one they take refunds your card and strips one of theirs. Keep the bodies coming rather than defending every 2-cost.",
    "Chain plays from hand. OP18-048 Mr.1 & Miss Doublefinger (6, [Rush]) plays a Character whose type includes Baroque Works costing 5 or less for free -- Crocodile and OP16-056 Mr.3 qualify; OP18-052 Mr.5 & Miss.Valentine (5) plays one costing 3 or less, which includes the OP-16 Mr.1 and Mr.2. Doublefinger into Mr.5 into a 2-cost puts three bodies out for 6 DON!!.",
    "OP16-045 Crocodile is a 4-cost [Blocker] whose [On Play] returns one of your Characters with cost 2 or more to hand to play an {Impel Down} Character costing 2 or less -- OP16-054 Mr.1 or OP16-055 Mr.2, each drawing 1. Return a spent [On Play] to cast again: OP18-047 Mr.1 for another [Unblockable] turn, Mr.4 & Miss.MerryChristmas for its removal, or Mr.5 for its free play.",
    "Lock their attackers. OP18-050 Mr.3 & Miss.Goldenweek is a 5-cost [Blocker] that stops a cost 7 or less Character from attacking until the end of their next turn; OP16-056 Mr.3 trashes itself on your Main Phase to draw 2 and stop a cost 9 or less Character the same way.",
    "OP18-046 Mr.0 & Ms. All Sunday is the top end at 9: draw 2 and give your Leader and every Character up to 2 rested DON!! each, which turns a wide board into a lethal swing. On the opponent's attacks it can trash a card from hand to make your Leader's base power 7000 for that turn.",
    "OP18-051 Mr.4 & Miss.MerryChristmas is the removal: as its [On Play] cost you rest 5 DON!!, and it puts a cost 6 or less and a cost 5 or less Character at the bottom of their owners' decks. Paid in full it is a 7-DON!! turn; played free off Mr.5 it is 10.",
  ],
  mulligan: [
    "Keep a hand with OP09-056 Mr.3 or two 2-cost partner pairs: the searcher and the cheap 3000-power bodies are what make the board wide enough for the Leader to pay.",
    "Keep OP18-049 Mr.2.Bon.Kurei, Crocodile or a Mr.5 for turns 3 to 5; Mr.2 finds the missing Baroque Works card and gives a DON!!.",
    "A hand of Mr.0 and Doublefinger with no 2-cost takes a new hand.",
  ],
  priorities: [
    "Order the chain from the top: Doublefinger first, then the Mr.5 or Crocodile it plays, then the 2-cost those play. Hold the 2-costs for a free play rather than paying for them on a chain turn.",
    "When Mr.5 or Crocodile picks the free 2-cost, a partner pair that pays the Leader on K.O. builds the tax; OP16-054 Mr.1 or OP16-055 Mr.2 draws a card now instead.",
    "Do not pay Mr.4's 5 rested DON!! for one small body. Save it for the turn there are two Characters worth removing, or for a 10-DON!! turn behind Mr.5.",
    "OP18-054 Mr.8 & Ms. Monday trashes a card from hand instead of losing a Baroque Works Character to the opponent's effect, once per opponent's turn. Against a K.O. effect that trade skips the Leader's draw and their discard, so use it on Mr.0, Doublefinger or a Character facing a return or bottom-deck effect, and let a 2-cost be K.O.'d.",
    "OP18-059 I Pray For Your Success. costs 0. On your turn rest 1 DON!! and trash a Baroque Works card from hand to draw 2; as a Counter, trash any card from hand for +3000. Your hand is a resource for Mr.8, Mr.0 and this card, so keep it stocked with draws rather than playing out every card.",
    "OP16-054 Mr.1 gains +3000 on your turn with a DON!! given and 5 or more cards in hand: a 2-cost that swings at 5000 when the hand is full.",
    "EB05-028 Boa Hancock makes the opponent trash 4 only if they hold 9 or more cards; otherwise it is a 4-cost 5000 body, so play it when their hand is that big.",
    "Play OP18-047 Mr.1 on the turn the Leader's attack matters: its [Unblockable] lasts only that turn.",
    "OP16-056 Mr.3's [Activate: Main] is best right before you pass, on the opponent's biggest attacker; it lasts through their next End Phase.",
    "Counters: OP18-047 Mr.1, Mr.5, Mr.7 and Mr.8 give +2000; OP09-056 Mr.3, OP16-054 Mr.1, OP16-056 Mr.3, Mr.2.Bon.Kurei, Goldenweek, Mr.4 and Hancock give +1000; Mr.0, Doublefinger, Crocodile and OP16-055 Mr.2 have none.",
  ],
  commonVariants: [
    "Builds without the OP-16 Impel Down package run OP18-044 Mr.Beans & Miss.Katherina, which draws 1 and trashes 1, a full four of Mr.4, Mr.7 and I Pray For Your Success., and no Crocodile, OP16-054 Mr.1 or OP16-055 Mr.2.",
    "Some builds add OP18-055 Mr.9 & Ms. Wednesday, which returns a cost 2 or less Character to hand, or OP18-056 Mr.13 & Ms.Friday, which bottom-decks one of your Baroque Works Characters to make the opponent trash a card.",
  ],
  commonCombos: [
    "Doublefinger plays Crocodile, which returns a spent Mr.5 or Mr.1 and plays OP16-054 Mr.1: three bodies, a card drawn and a [Rush] attacker in one turn.",
    "Mr.0 gives 2 rested DON!! to the Leader and every Character, and OP18-047 Mr.1 makes the Leader [Unblockable] for the swing.",
    "Mr.3 & Miss.Goldenweek and OP16-056 Mr.3 stop their two best attackers for a turn while the board taxes the rest.",
  ],
  keyCardNumbers: [
    "OP18-041",
    "OP18-046",
    "OP18-048",
    "OP18-052",
    "OP16-045",
    "OP18-050",
    "OP18-051",
    "OP18-054",
    "OP16-056",
    "OP18-059",
  ],
  counterplay: [
    "Every Baroque Works Character with 3000 base power or more you K.O. costs you a card from hand and draws them one. Leave those bodies standing unless they matter, remove by returning or bottom-decking where you can, and K.O. the OP-16 Mr.1 and Mr.2 freely: they are under 3000 and pay nothing.",
    "Mr.8 & Ms. Monday saves one Character per turn from your effects; spend a cheap removal effect first to draw it out.",
    "Their attack locks expire after your End Phase. Keep a second attacker the lock cannot reach: Mr.3 & Miss.Goldenweek only reaches cost 7 or less.",
    "Boa Hancock punishes a hand of 9 or more: spend cards before you reach it.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6af5879bdcbca32da6c4f034/standings",
      retrievedAt: "2026-11-17",
      note: "The deck's own 50: Tsaams's list, 4th of 121 (6-1) at [OP18] ChinoizeCup #136 MONDAY on 16 Nov 2026, an online OPTCGSim event with OP-18 cards before release; the event's API carries the list.",
    },
    {
      url: "https://www.cardkaizoku.com/deckbuilder?deck=1xOP18-041%7C4xOP09-056%7C4xOP16-056%7C4xOP18-044%7C4xOP18-046%7C2xOP18-047%7C4xOP18-048%7C4xOP18-049%7C4xOP18-050%7C4xOP18-051%7C4xOP18-052%7C4xOP18-053%7C4xOP18-054%7C4xOP18-059&rotation=1&game=onepiece",
      retrievedAt: "2026-11-15",
      note: "Card Kaizoku's pre-release build without the Impel Down package, the first variants line.",
    },
    {
      url: "https://www.youtube.com/watch?v=-AgzXvus-Wk",
      retrievedAt: "2026-11-15",
      note: "johnny_tcg's pre-release Ms. All Sunday build with Mr.9 & Ms. Wednesday, the second variants line.",
    },
  ],
};
