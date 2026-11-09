import type { DeckStrategyDossier } from "./types.js";

export const op13SaboTcgmmDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Black) Sabo - TCG Match Making EB05 #8",
  archetype:
    "Red/Black Sabo in front of the OP-17 Elbaph shell with the EB-05 cards: three cost-12 giants -- Saul, Ripley and Loki -- grow every cheap {Straw Hat Crew} body by +3000 and switch on the Leader's aura, ST01-011 Brook hands the Leader its DON!!, and EB05-046 Yamato is the defence against big bodies.",
  gamePlan: [
    "The deck runs on two cost lines. The Leader's aura needs a Character of yours at cost 8 or more and one DON!! given to the Leader; the Elbaph bodies grow when any Character on the field is at cost 12 or more. OP17-089 Jaguar.D.Saul and EB05-047 Ripley cost 4 and sit at 16, and OP17-119 Loki costs 6 and sits at 18, so one giant meets both lines at once.",
    "Land a giant, then spend the rest of the turn on the bodies it grew. OP17-080 Usopp, OP17-082 Sanji, OP17-087 Nico Robin and OP17-095 Roronoa Zoro go from 2000 to 5000 power, OP17-083 Jinbe becomes a 5000-power [Blocker], and OP17-093 Monkey.D.Luffy gains [Rush].",
    "EB05-047 Ripley's [On Play] trashes a card from hand to play a Character of cost 2 or less from your trash, so the giant arrives with a body behind it. OP15-088 Pirates Docking Six and OP17-093 Luffy recur the same way.",
    "OP15-088 sits at 11 and OP17-093 costs 8: either turns the Leader's aura on, but neither reaches 12, so neither grows the Elbaph bodies. Only the three giants do that.",
    "The aura needs one DON!! given to the Leader. ST01-011 Brook's [On Play] gives up to 2 rested DON!! to the Leader, which arms the aura with DON!! that could not have paid for anything else.",
    "The Leader is 1000 smaller while you have 4 or more Life. You start at 5, so the Leader is a 4000 body until Life is down to 3. An early hit costs little; do not spend Counter cards defending Life at 5 or 4.",
  ],
  mulligan: [
    "Keep a hand with a giant: Saul or Ripley at 4, Loki at 6. Nothing else in the deck reaches cost 12, and both lines are met by the same body.",
    "Failing a giant, keep a card that finds one: Usopp and Saul each look at 3 and reveal an {Elbaph} card, OP17-086 Nami trashes an {Elbaph} card for two draws, and Sanji draws 2 and trashes 2.",
    "A hand of only 2-drops and Yamato is a mulligan. The 2-drops are 2000-power bodies until a giant arrives.",
  ],
  priorities: [
    "Play the giant first in the turn. A 2-drop played before it and after it is the same card at 2000 or 5000 power, and OP17-084 Chopper's [On Play] grants [Unblockable] only if a cost-12 Character is already out.",
    "The two lines read different boards. The Elbaph bodies count a cost-12 Character on either side, so an opposing giant turns them on for free; the Leader's aura counts only your own board.",
    "Protect the giant ahead of anything else, including the Leader at high Life. Its removal takes +3000 off every Elbaph body, the aura and Luffy's [Rush] at once. OP17-095 Zoro lets you place 3 cards from your trash at the bottom of your deck instead of losing any of your Characters to an opponent's effect.",
    "A second giant is insurance, not waste: with two on the field one removal no longer shrinks the board.",
    "EB05-046 Yamato gains [Blocker] and +3000 while the opponent has a Character with 8000 base power or more. On the opponent's attack it can trash a card from hand to make your Leader's base power 7000 for the turn, once your trash holds 10 or more cards. Fill the trash -- Docking Six's mill, Usopp's and Saul's leftovers, Sanji's discard -- and the Leader defends at 7000.",
    "Pay OP15-088's mill freely: it returns a cost-2-or-less {Straw Hat Crew} body from the trash, and a full trash is what Yamato and OP17-095's replacement read.",
    "Hold the Counter Events for the opponent's turn. OP17-096 is +4000 only with a cost-12 Character on the field; OP04-016 is +3000 for a card from hand. OP17-096's [Trigger] returns an {Elbaph} card from your trash to hand, which can be a giant.",
    "Not every OP17 giant works here. OP17-081 Gerd and OP17-094 Rodo gain their +12 cost only under an {Elbaph} Leader, and Sabo is not one. Ripley's +12 has no such condition.",
  ],
  commonVariants: [
    '"(Red/Black) Sabo - 1st Place PlayTCG EGB 2026-09-20" plays a wider red package -- EB04-007 Roronoa Zoro and OP13-007 Ace & Sabo & Luffy -- and OP14-096 Ground Death where this list plays Yamato and Ripley. Expect a −3000 and a negation from it, and one giant fewer.',
    '"(Red/Black) Sabo - OP17 Elbaph List" is the build with only OP04-016 for red: OP17-091 Brook, OP17-098 Gum-Gum Kong Gun and OP15-094 Roronoa Zoro in the flex slots.',
    "The Leader's starter deck build is the Revolutionary Army list (ST-35 with OP12/OP13 support), which reaches cost 8 through {Revolutionary Army} cost-raising cards instead of giants. Expect either when the Leader is OP13-004.",
  ],
  commonCombos: [
    "A 4-cost giant on the field: every Elbaph 2-drop is 5000, Jinbe is a [Blocker], and the Leader's aura is on once a DON!! is given to it.",
    "Ripley trashes a card to replay Usopp or a Brook from the trash: a second search, or the DON!! the Leader's aura needs.",
    "Saul then ST01-011 Brook: Brook gives 2 rested DON!! to the Leader, which arms the aura with DON!! that could not have paid for anything else.",
    "OP17-119 Loki lands at cost 18 with 8000 power, +3000 more on the opponent's turn, and K.O.s opposing Characters totalling 4 cost or less.",
    "OP17-093 Luffy with a giant out: an 8000-power [Rush] body that draws a card and plays a cost-2-or-less Character from the trash.",
    "A giant plus OP17-084 Chopper: one Character gains [Unblockable] for the turn, which takes the opponent's Blocker out of the swing that matters.",
  ],
  keyCardNumbers: [
    "OP13-004",
    "OP17-089",
    "EB05-047",
    "OP17-119",
    "OP17-095",
    "OP17-093",
    "EB05-046",
    "OP15-088",
    "ST01-011",
    "OP17-096",
  ],
  counterplay: [
    "Cost-ceiling removal misses the giants: they sit at 16 and 18. Answer them by power or by effects that do not read cost.",
    "Remove the giant rather than the bodies it grew; first count the trash, because OP17-095 Zoro turns three trash cards into a cancelled removal. With three giants in the list, expect another.",
    "Press Life slowly. The Leader is a 4000 body only while it holds 4 or more Life; every Life card it loses makes it bigger.",
    "Yamato is a [Blocker] only against an 8000-base-power body, and the Leader's 7000 needs 10 cards in their trash. Attack with smaller bodies, and early.",
    "Without a DON!! given to the Leader there is no aura, so a turn they cannot spare one is a turn every body is 1000 smaller.",
    "OP17-096 needs a cost-12 Character on the field to Counter. Attack while the giant is gone.",
  ],
  sources: [
    {
      url: "https://www.patreon.com/tcgmatchmaking",
      retrievedAt: "2026-11-09",
      note: "The deck's own 50: the Red/Black Sabo list in TCG Match Making's \"EB05 Weekly Power Rankings - November 5th\" post (5 Nov 2026), ranked 8th, from high-rank online play. A Patreon post with no pilot or event.",
    },
    {
      url: "https://stats.tcgmatchmaking.com/",
      retrievedAt: "2026-11-09",
      note: "TCG Match Making's stats dashboard, the play data the power rankings are drawn from.",
    },
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-11-07",
      note: 'Entry "Red Black Sabo", the list pilot "Manny Walia" took to 1st at PlayTCG\'s EGB event on 20 Sep 2026: the first variants line.',
    },
    {
      url: "https://onepiece.gg/red-black-sabo-guide/",
      retrievedAt: "2026-08-26",
      note: "Leader guide for OP13-004: the -1000-at-4-Life reading, spending Life for hand, and prioritising a cost-8 body before committing to attacks.",
    },
  ],
};
