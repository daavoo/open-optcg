import type { DeckStrategyDossier } from "./types.js";

export const op18AllSundayPreviewDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Ms. All Sunday - Card Kaizoku OP-18 Pre-release",
  archetype:
    "Mono-blue OP18-041 Ms. All Sunday as a {Baroque Works} attrition deck: a wide board of cheap partner pairs that each cost the opponent a card when they are K.O.'d, chain-plays from Mr.1 & Miss Doublefinger and Mr.5 & Miss.Valentine, attack locks from Mr.3 & Miss.Goldenweek and OP16-056 Mr.3, and a hand that is spent as fuel for counters and protection and refilled by draws.",
  gamePlan: [
    "The Leader has no activation. Whenever one of your Characters whose type includes \"Baroque Works\" and whose base power is 3000 or more is K.O.'d -- in battle or by an effect, on either player's turn, as often as it happens -- you draw 1 and your opponent trashes 1 card from hand. Every Character in the list qualifies except OP09-056 Mr.3, which has 2000 base power. A Character that leaves by being trashed, returned or placed at the bottom of the deck does not count, so OP16-056 Mr.3 trashing itself draws only its own 2.",
    "So the board is a tax: put cheap 3000-power bodies out and let the opponent spend attacks and removal on them. Each one they take refunds your card and strips one of theirs. Keep the bodies coming rather than defending every 2-cost.",
    "Chain plays from hand. OP18-048 Mr.1 & Miss Doublefinger (6, [Rush]) plays a {Baroque Works} Character costing 5 or less from hand for free; OP18-052 Mr.5 & Miss.Valentine (5) plays one costing 3 or less. Doublefinger into Mr.5 into a 3-cost puts three bodies out for 6 DON!!.",
    "The cheap targets for those free plays: OP18-044 Mr.Beans & Miss.Katherina draws 1 and trashes 1; OP18-053 Mr.7 & Miss.Father'sDay arranges the top 3; OP09-056 Mr.3 looks at 4 for a {Cross Guild} or Baroque Works card; OP18-047 Mr.1 makes your Leader [Unblockable] for the turn; OP18-054 Mr.8 & Ms. Monday is the protection piece. Doublefinger can also drop Mr.2, Mr.3 & Miss.Goldenweek or Mr.5 itself.",
    "Lock their attackers. OP18-050 Mr.3 & Miss.Goldenweek is a 5-cost [Blocker] that stops a cost 7 or less Character from attacking until the end of their next turn; OP16-056 Mr.3 trashes itself on your Main Phase to draw 2 and stop a cost 9 or less Character the same way.",
    "OP18-046 Mr.0 & Ms. All Sunday is the top end at 9: draw 2 and give your Leader and every Character up to 2 rested DON!! each, which turns a wide board into a lethal swing. On the opponent's attacks it can trash a card from hand to make your Leader's base power 7000 for that turn.",
    "OP18-051 Mr.4 & Miss.MerryChristmas is the removal: as its [On Play] cost you rest 5 DON!!, and it puts a cost 6 or less and a cost 5 or less Character at the bottom of their owners' decks. Paid in full it is a 7-DON!! turn; played free off Mr.5 it is 10.",
  ],
  mulligan: [
    "Keep a hand with two or more 2-costs or OP09-056 Mr.3: the curve and the searchers are what keep the board wide.",
    "Keep OP18-049 Mr.2.Bon.Kurei or a Mr.5 for turn 3 to 5; Mr.2 finds the missing Baroque Works card and gives a DON!!.",
    "A hand of Mr.0 and Doublefinger with no 2-cost takes a new hand.",
  ],
  priorities: [
    "Order the chain from the top: Doublefinger first, then the Mr.5 it plays, then the 3-cost Mr.5 plays. Hold the 2-costs for a free play rather than paying for them on a chain turn.",
    "Do not pay Mr.4's 5 rested DON!! for one small body. Save it for the turn there are two Characters worth removing, or for a 10-DON!! turn behind Mr.5.",
    "OP18-054 Mr.8 & Ms. Monday trashes a card from hand instead of losing a Baroque Works Character to the opponent's effect, once per opponent's turn. Against a K.O. effect that trade skips the Leader's draw and their discard, so use it on Mr.0, Doublefinger or a Character facing a return or bottom-deck effect, and let a 2-cost be K.O.'d.",
    "OP18-059 I Pray For Your Success. costs 0. On your turn rest 1 DON!! and trash a Baroque Works card from hand to draw 2; as a Counter, trash any card from hand for +3000. Your hand is a resource for Mr.8, Mr.0 and this card, so keep it stocked with draws rather than playing out every card.",
    "Play OP18-047 Mr.1 on the turn the Leader's attack matters: its [Unblockable] lasts only that turn.",
    "OP16-056 Mr.3's [Activate: Main] is best right before you pass, on the opponent's biggest attacker; it lasts through their next End Phase.",
    "Counters: Mr.1, Mr.5, Mr.7 and Mr.8 give +2000; Mr.0 and Doublefinger have none.",
  ],
  commonVariants: [
    "johnny_tcg's build runs four OP18-047 Mr.1 and four OP18-055 Mr.9 & Ms. Wednesday, which returns a cost 2 or less Character to hand, and cuts Mr.7 & Miss.Father'sDay and one each of Mr.5 and OP16-056 Mr.3.",
    "NightingaleTCG's build keeps more of the OP-16 Baroque Works cards: OP16-045 Crocodile, OP16-054 Mr.1 and OP16-055 Mr.2 in place of Mr.Beans & Miss.Katherina and Mr.5 & Miss.Valentine, with fewer I Pray For Your Success.",
    "An automated builder's list drops the Mr.3 and Mr.1 singles, Mr.5 and the event for OP17-049 Charlotte Linlin, the vanilla OP18-043 Accelegator, P-004 Crocodile, Mr.9 & Ms. Wednesday and OP18-056 Mr.13 & Ms.Friday, which bottom-decks one of your Baroque Works Characters to make the opponent trash a card.",
  ],
  commonCombos: [
    "Doublefinger plays Mr.5, which plays Mr.Beans or Mr.7: three bodies and a [Rush] attacker in one turn.",
    "Mr.0 gives 2 rested DON!! to the Leader and every Character, and Mr.1 makes the Leader [Unblockable] for the swing.",
    "Mr.3 & Miss.Goldenweek and OP16-056 Mr.3 stop their two best attackers for a turn while the board taxes the rest.",
  ],
  keyCardNumbers: [
    "OP18-041",
    "OP18-046",
    "OP18-048",
    "OP18-052",
    "OP18-050",
    "OP18-051",
    "OP18-054",
    "OP16-056",
    "OP18-059",
  ],
  counterplay: [
    "Every Baroque Works Character with 3000 base power or more you K.O. costs you a card from hand and draws them one. Leave the small bodies standing unless they matter, and remove by returning or bottom-decking where you can.",
    "Mr.8 & Ms. Monday saves one Character per turn from your effects; spend a cheap removal effect first to draw it out.",
    "Their attack locks expire after your End Phase. Keep a second attacker the lock cannot reach: Mr.3 & Miss.Goldenweek only reaches cost 7 or less.",
  ],
  sources: [
    {
      url: "https://www.cardkaizoku.com/deckbuilder?deck=1xOP18-041%7C4xOP09-056%7C4xOP16-056%7C4xOP18-044%7C4xOP18-046%7C2xOP18-047%7C4xOP18-048%7C4xOP18-049%7C4xOP18-050%7C4xOP18-051%7C4xOP18-052%7C4xOP18-053%7C4xOP18-054%7C4xOP18-059&rotation=1&game=onepiece",
      retrievedAt: "2026-11-15",
      note: "The deck's own 50: Card Kaizoku's pre-release build, shared through its deck builder and the cardkaizoku YouTube channel on 10 Nov 2026. The URL encodes the list.",
    },
    {
      url: "https://www.youtube.com/watch?v=-AgzXvus-Wk",
      retrievedAt: "2026-11-15",
      note: "johnny_tcg's pre-release Ms. All Sunday build, the first variants line.",
    },
    {
      url: "https://www.youtube.com/watch?v=ngvmj5sbTQ0",
      retrievedAt: "2026-11-15",
      note: "NightingaleTCG's pre-release Ms. All Sunday build, the second variants line.",
    },
  ],
};
