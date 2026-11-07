import type { DeckStrategyDossier } from "./types.js";

export const op13SaboTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Black) Sabo - 1st Place PlayTCG EGB 2026-09-20",
  archetype:
    "Red/Black Sabo in front of the OP-17 Elbaph shell: one cost-12 giant grows every cheap {Straw Hat Crew} body by +3000 and switches on the Leader's aura, with a red package that hands DON!! to the Leader and two 4000 Counters that need the giant too.",
  gamePlan: [
    "The deck runs on two cost thresholds. The Leader reads '[DON!! x1] If you have a Character with a cost of 8 or more, your Leader and all of your Characters gain +1000 power'; the Elbaph bodies read 'if there is a Character with a cost of 12 or more'. OP17-089 Jaguar.D.Saul costs 4 and sits on the field at 16, and OP17-119 Loki costs 6 and sits at 18, so one giant meets both at once.",
    "Land a giant, then spend the rest of the turn on the bodies it grew. OP17-080 Usopp, OP17-082 Sanji, OP17-087 Nico Robin and OP17-095 Roronoa Zoro go from 2000 to 5000 power, OP17-083 Jinbe becomes a 5000-power [Blocker], and OP17-093 Monkey.D.Luffy gains [Rush].",
    "OP15-088 Pirates Docking Six sits at 11 and OP17-093 Luffy costs 8: either turns the Leader's aura on, but neither reaches 12, so neither grows the Elbaph bodies. Only Saul and Loki do that.",
    "The Leader's aura needs one DON!! given to the Leader. ST01-011 Brook's [On Play] gives up to 2 rested DON!! to your Leader, and OP13-007 Ace & Sabo & Luffy gives 1 active DON!! to your Leader as the cost of its −3000: both arm the aura without spending an active DON!! that pays for a body.",
    "The Leader's other half runs backwards: 'If you have 4 or more Life cards, give this Leader −1000 power.' You start at 5, so the Leader is a 4000 body until Life is down to 3. An early hit costs little; do not spend Counter cards defending Life at 5 or 4.",
    "EB04-007 Roronoa Zoro is the late body: a 9000-power 7-drop whose [On Play] gives your Leader +2000 until the end of the opponent's next End Phase, and which gains [Rush: Character] for the turn when the opponent has a Character with 8000 power or more.",
  ],
  mulligan: [
    "Keep a hand with a giant: Saul at 4 or Loki at 6. Nothing else in the deck reaches cost 12, and both thresholds are met by the same body.",
    "Failing a giant, keep a card that finds one: Usopp and Saul each look at 3 and reveal an {Elbaph} card, OP17-086 Nami trashes an {Elbaph} card for two draws, and Sanji draws 2 and trashes 2.",
    "A hand of only 2-drops and red cards is a mulligan. The 2-drops are 2000-power bodies until a giant arrives.",
  ],
  priorities: [
    "Play the giant first in the turn. A 2-drop played before it and after it is the same card at 2000 or 5000 power, and OP17-084 Chopper's [On Play] grants [Unblockable] only if the giant is already out.",
    "The two clauses read different boards. 'There is a Character with a cost of 12 or more' scans both sides, so an opposing giant turns the Elbaph half on for free; the Leader's aura reads 'if you have' and only counts your own board.",
    "Protect the giant ahead of anything else, including the Leader at high Life. Its removal takes +3000 off every Elbaph body, the +1000 aura and Luffy's [Rush] at once. OP17-095 Zoro lets you place 3 cards from your trash at the bottom of your deck instead of losing any of your Characters to an opponent's effect.",
    "Pay OP15-088's mill freely: it returns a cost-2-or-less {Straw Hat Crew} body from the trash, and a full trash is what OP14-096 Ground Death's [Counter] reads and what OP17-095's replacement spends.",
    "Hold the Counter Events for the opponent's turn. OP17-096 is +4000 only with a cost-12 Character on the field, OP14-096 is +4000 only with 10 or more cards in your trash, and OP04-016 is +3000 for a card from hand. Spend the conditional ones while their condition holds.",
    "OP14-096's [Main] rests 2 DON!! to negate an opposing Character's effect for the turn, cost 5 or less. Use it on the Blocker or the aura that stands between your attackers and the Leader.",
    "OP13-007's −3000 lands on the turn you use it, and it trashes itself. Activate it before attacking, aimed at the Blocker or the body your attacker cannot beat.",
    "Not every OP17 giant works here. OP17-081 Gerd and OP17-094 Rodo gain +12 cost only under an {Elbaph} Leader, and Sabo is not one.",
  ],
  commonVariants: [
    '"(Red/Black) Sabo - OP17 Elbaph List" is the build with only OP04-016 for red: four OP17-091 Brook, four OP17-098 Gum-Gum Kong Gun and an OP15-094 Roronoa Zoro where this list plays the red package (ST01-011 Brook, OP13-007, EB04-007 Zoro), OP17-083 Jinbe and the two 4000 Counter Events.',
    "Other OP-17 builds play OP01-016 Nami where this list plays OP13-007 and OP14-096, and some run OP17-081 Gerd as a cheap body.",
    "The Leader's starter deck build is the Revolutionary Army list (ST-35 with OP12/OP13 support), which reaches cost 8 through {Revolutionary Army} cost-raising cards instead of giants. Expect either when the Leader is OP13-004.",
  ],
  commonCombos: [
    "Saul (printed 4) on the field: every Elbaph 2-drop is 5000, Jinbe is a [Blocker], and the Leader's aura is on once a DON!! is given to it.",
    "Saul then ST01-011 Brook: Brook's [On Play] gives 2 rested DON!! to the Leader, which arms the aura with DON!! that could not have paid for anything else.",
    "OP17-119 Loki lands at cost 18 with 8000 power, +3000 more on the opponent's turn, and K.O.s opposing Characters totalling 4 cost or less.",
    "OP17-093 Luffy with a giant out: an 8000-power [Rush] body that draws a card and plays a cost-2-or-less Character from the trash -- Usopp for another search, or a Brook that gives the Leader its DON!!.",
    "A giant plus OP17-084 Chopper: one Character gains [Unblockable] for the turn, which takes the opponent's Blocker out of the swing that matters.",
  ],
  keyCardNumbers: [
    "OP13-004",
    "OP17-089",
    "OP17-119",
    "OP17-095",
    "OP17-093",
    "OP15-088",
    "ST01-011",
    "OP13-007",
    "OP17-096",
    "OP14-096",
  ],
  counterplay: [
    "Cost-ceiling removal misses the giants: they sit at 16 and 18. Answer them by power or by effects that do not read cost.",
    "Remove the giant rather than the bodies it grew; first count the trash, because OP17-095 Zoro turns three trash cards into a cancelled removal.",
    "Press Life slowly. The Leader is a 4000 body only while it holds 4 or more Life; every Life card it loses makes it bigger.",
    "Without a DON!! given to the Leader there is no aura, so a turn they cannot spare one is a turn every body is 1000 smaller.",
    "Their two 4000 Counters are conditional: OP17-096 needs a cost-12 Character on the field, OP14-096 needs 10 cards in their trash. Attack while the condition fails.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-11-07",
      note: 'The deck\'s own 50: entry "Red Black Sabo", the list pilot "Manny Walia" took to 1st at PlayTCG\'s EGB event in North America on 20 Sep 2026.',
    },
    {
      url: "https://gumgum.gg/one-piece/decklists/deck/east/op17/1596817e-9bf6-4938-9bc1-c8947cd85d9f",
      retrievedAt: "2026-08-26",
      note: "Top-placing OP17 Red/Black Sabo list with OP01-016 Nami in the red splash; the basis of the variants line and of the OP17 Elbaph List build.",
    },
    {
      url: "https://onepiece.gg/red-black-sabo-guide/",
      retrievedAt: "2026-08-26",
      note: "Leader guide for OP13-004: the -1000-at-4-Life reading, spending Life for hand, and prioritising a cost-8 body before committing to attacks.",
    },
  ],
};
