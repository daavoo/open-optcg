import type { DeckStrategyDossier } from "./types.js";

export const eb02LuffyDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green/Purple) Monkey.D.Luffy - Official Feature Deck",
  archetype:
    "Green/Purple {Straw Hat Crew} midrange behind EB02-010: return DON!! through the Leader and Sanji & Pudding to keep DON!! active, build ST-18's eight-DON!! board, and close with EB02-061 Monkey.D.Luffy attacking twice.",
  gamePlan: [
    "Your Leader's [Activate: Main] returns 2 DON!! from your field to your DON!! deck, sets up to 2 of your rested DON!! active, and gives the Leader +1000 until the end of your opponent's next turn. Every Character in this deck is {Straw Hat Crew}, so its condition always holds.",
    "The returned DON!! do not come back by themselves: your DON!! phase still adds only 2 a turn. Activating with 8 or fewer DON!! on the field leaves you 2 DON!! short next turn, so take it when it pays: after Sanji & Pudding is on the field, and with 4 rested DON!! so that it returns 2 spent ones and readies 2 more.",
    "EB02-035 Sanji & Pudding adds 1 active DON!! from your DON!! deck, once per turn, when 2 or more of your DON!! are returned. With it on the field the Leader's activation is 3 DON!! to spend this turn for 1 off your field.",
    "Three cards read 'if the number of DON!! cards on your field is equal to or less than your opponent's': Sanji & Pudding's [On Play] draw, EB02-037 Franky's ramp on play and when attacking, and EB02-041 Merry Go's +2 cost. Returning DON!! is how you get under your opponent's count.",
    "The purple half is ST-18's: OP05-061 Uso-Hachi rests a cost-4 when attacking, ST18-001 Uso-Hachi rests a cost-5 on play, and OP05-070 Fra-Nosuke gains [Rush], each with 8 or more DON!! on your field. ST18-005 Luffy-Tarou returns 1 DON!! to play a purple {Straw Hat Crew} Character costing 5 or less from your hand.",
    "EB02-061 Monkey.D.Luffy is the finisher. Under this multicolour Leader it has [Rush] once your opponent has 5 DON!!, and when it attacks it can return 2 of your active DON!! to stand back up and take your top Life card into hand -- which also triggers Sanji & Pudding.",
  ],
  mulligan: [
    "Keep a hand with Sanji & Pudding, EB02-017 Nami or OP05-076: the two 1-cost searches find Sanji & Pudding, and Sanji & Pudding is what makes the Leader's activation pay.",
    "Without any of them the Leader has nothing to refund it. Take a new hand.",
  ],
  priorities: [
    "Search for Sanji & Pudding first; play it before activating the Leader in the same turn, so the refund applies.",
    "Spend DON!! on your plays before activating the Leader. It sets rested DON!! active, so it only adds DON!! after you have rested some.",
    "Do not activate the Leader early just for the +1000. Two DON!! off a 5- or 6-DON!! field is a whole play lost next turn.",
    "Keep 2 active DON!! when EB02-061 Luffy attacks if you want it to attack again. Its restand also costs a Life card, so be careful with it at low Life; it still works at 0 Life, which can be right if you win next turn.",
    "Uso-Hachi and Fra-Nosuke carry 2000 Counters. Use them to keep Sanji & Pudding and Luffy on the field.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader: twelve 4-ofs from EB-02, OP-05 and ST-18, plus two OP03-072 Gum-Gum Jet Gatling.",
  ],
  commonCombos: [
    "Sanji & Pudding, then the Leader's activation with two other DON!! rested: 2 rested DON!! come back active plus 1 more from the refund, and your field drops under your opponent's for Franky.",
    "EB02-061 Luffy attacks, returns 2 active DON!! to stand up, Sanji & Pudding refunds 1, and Luffy attacks again.",
    "Luffy-Tarou returns 1 DON!! to play Sanji & Pudding from hand.",
  ],
  keyCardNumbers: [
    "EB02-010",
    "EB02-035",
    "EB02-061",
    "EB02-037",
    "ST18-005",
    "EB02-017",
    "OP05-076",
  ],
  counterplay: [
    "Sanji & Pudding is what makes their Leader's DON!! return pay. K.O. it and every activation costs them 2 DON!! on the next turn.",
    "EB02-061 Luffy gains [Rush] from your 5th DON!! and attacks twice. Keep a [Blocker] or Counter for its second attack.",
    "Their ST-18 cards switch on at 8 DON!!, which their own Leader keeps pushing them away from. Pressure early, before the board is set.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_062.php",
      retrievedAt: "2026-10-12",
      note: "Bandai's feature deck for EB02-010: the fifty, securing Sanji & Pudding with Nami or OP05-076, activating the Leader after it with two other DON!! rested, Franky refilling DON!!, EB02-061 Luffy as the finisher with Luffy-Tarou playing Sanji & Pudding, and EB02-061's restand costing a Life card but usable at 0 Life.",
    },
  ],
};
