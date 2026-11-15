import type { DeckStrategyDossier } from "./types.js";

export const op18FrankyPreviewDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green/Purple) Franky - Sunny_OPTCG OP-18 Pre-release",
  archetype:
    "Green/Purple OP18-021 Franky as a Stage deck built on purple Straw Hats: twelve Stages (EB02-041 Merry Go, OP18-078 Mini-Merry, OP05-040 Birdcage) that are +3000 Counters in hand and that the Leader puts out for one returned DON!!, ST-18 Characters that turn on at 8 DON!! on the field, and OP17-022 Shanks plus Birdcage as a board-clearing finish at 10 DON!!.",
  gamePlan: [
    "The Leader gives every Stage in your hand a +3000 Counter, and once per turn its [Activate: Main] returns 1 DON!! to the DON!! deck to play a Stage costing 5 or less from hand without paying its cost. Only one Stage stands at a time: playing another trashes the one in play, so pick the Stage you want on the field and keep the rest as Counters.",
    "OP18-078 Mini-Merry is the Stage to play through the Leader: its [On Play] draws 1 and adds a rested DON!! from the DON!! deck, which gives back the DON!! the Leader returned. On the field, rest it to give up to 4 of your Leader and Characters 1 rested DON!! each -- it turns the DON!! you spent this turn into attack power.",
    "EB02-041 Merry Go costs 1 and draws a card on play with a {Straw Hat Crew} Leader. Pay its cost rather than spend the Leader's activation on it. Rest it while your DON!! count is not above theirs to give one {Straw Hat Crew} Character +2 cost until the end of their next turn, which lifts it out of reach of cost-capped removal.",
    "OP05-040 Birdcage's refresh lock needs a [Donquixote Doflamingo] Leader, so here it does nothing until its [End of Your Turn]: with 10 DON!! on your field it K.O.s every rested Character costing 5 or less on both boards, then trashes itself. OP17-022 Shanks rests all of their Characters and ST18-001 Uso-Hachi rests one more at 8 DON!!, so a Shanks turn with Birdcage on the field ends with their small board gone.",
    "Birdcage counts your rested Characters too. On the turn it fires, attack with the Leader, Shanks, OP07-064 Sanji and ST18-005 Luffy-Tarou (all cost 6 or more), and leave your 5-or-less bodies unrested or accept losing them. The Leader's DON!! −1 drops you below 10, so play Birdcage on an earlier turn, or follow the Leader's activation with Mini-Merry or OP17-074 Yamato to get back to 10.",
    "The ST-18 Characters want 8 DON!! on the field: ST18-001 Uso-Hachi rests a cost 5 or less on play and ST18-003 San-Gorou draws once per turn when it attacks. ST18-004 Zoro-Juurou looks at 5 for a purple {Straw Hat Crew} card at any count, and ST18-005 Luffy-Tarou returns 1 DON!! to play a purple {Straw Hat Crew} Character costing 5 or less from hand.",
    "The deck's two halves pull against each other on DON!!: Merry Go's rest and OP07-064 Sanji's -3 cost in hand want you behind on DON!! (Sanji needs 2 fewer than them), while the ST-18 clauses, Birdcage and Shanks want 8 to 10. The early DON!! −1 costs help Sanji land as a 3-cost [Blocker]; from the mid game Mini-Merry and Yamato rebuild the count.",
  ],
  mulligan: [
    "Keep EB02-017 or PRB02-012 Nami, or ST18-004 Zoro-Juurou: each digs 5 deep for a {Straw Hat Crew} card, and finds Mini-Merry, Merry Go or a ST-18 Character.",
    "Keep a Mini-Merry with the Leader: on turn two the activation plays it for the price of a DON!! it gives back, and draws.",
    "Stages in hand are not dead cards -- each is a +3000 Counter -- so a hand heavy in Stages still defends. A hand of only 7- and 10-costs with no searcher takes a new hand.",
  ],
  priorities: [
    "Use the Leader's activation every turn you hold a 5-cost Stage you want on the field; Mini-Merry first, Birdcage when a 10-DON!! turn is coming.",
    "Activate Mini-Merry after your DON!! have paid for the turn's plays: it gives rested DON!!, so the DON!! you just spent come back as +1000 each on up to four attackers.",
    "Keep at least one Stage in hand as a +3000 Counter that needs no DON!!. OP09-078 Gum-Gum Giant is +4000 and draws 2, but costs 1, returns 2 DON!! and trashes a card from hand -- the DON!! loss slows the 8- and 10-DON!! clauses, so spend it when the hit matters.",
    "OP17-022 Shanks has [Rush] and sets 2 DON!! active on play: with every Character of theirs rested, nothing blocks that turn. With Birdcage out and 10 DON!! still on the field at end of turn, their rested cost 5 or less Characters die as well.",
    "OP17-023 Nami rests herself instead of one of your {East Blue} or {Straw Hat Crew} Characters being K.O.'d; she must be active to do it, so do not attack with her on a turn you need the shield.",
    "OP17-074 Yamato is a 3-cost [Blocker] that adds a rested DON!! on play; ST18-005 Luffy-Tarou can play San-Gorou, Zoro-Juurou, Uso-Hachi or PRB02-012 Nami for free alongside it.",
  ],
  commonVariants: [
    "This is the Straw Hat build. The same video's Ramp build swaps the ST-18 San-Gorou, Zoro-Juurou and Luffy-Tarou, OP07-064 Sanji and Gum-Gum Giant for DON!!-gaining cards -- EB01-061 Mr.2.Bon.Kurei, OP05-067 Zoro-Juurou, OP08-076 It's to Die For..., the OP17-062 and OP17-063 Kaido -- plus OP13-118 Monkey.D.Luffy and ST34-004 Charlotte Linlin, and plays four Yamato.",
    "An earlier fan build leans on {Water Seven}: EB01-031 Kalifa and EB01-033 Blueno, EB02-037 Franky and EB02-061 Monkey.D.Luffy, OP06-041 The Ark Noah as a second rest-everything card beside Birdcage, OP15-032 Brook and OP18-031 Nico Robin.",
    "An automated deck builder's list, made once OP-18 was fully revealed, drops Birdcage and the ST-18 Characters for DON!!-active Straw Hats (P-102 Nami, OP13-027 Sanji, OP13-037 Roronoa Zoro, OP14-022 Usopp), OP18-034 Franky to play a Stage or {Straw Hat Crew} card from hand, and OP18-076 Shark Submerge 3 as a second draw-and-ramp Stage.",
  ],
  commonCombos: [
    "Leader DON!! −1 into Mini-Merry: draw 1, the DON!! comes back rested, and the Stage then gives up to four rested DON!! to your attackers.",
    "Birdcage on the field, reach 10 DON!!, play Shanks: their whole board is rested, Shanks attacks with [Rush], and at end of turn every rested Character of theirs costing 5 or less is K.O.'d.",
    "Luffy-Tarou returns a DON!! to play a free San-Gorou or Uso-Hachi; at 8 DON!! Uso-Hachi rests a cost 5 or less for Birdcage to take.",
  ],
  keyCardNumbers: [
    "OP18-021",
    "OP18-078",
    "OP05-040",
    "OP17-022",
    "EB02-041",
    "ST18-005",
    "ST18-001",
    "OP07-064",
  ],
  counterplay: [
    "Twelve Stages are hidden +3000 Counters: count their hand as Counter-rich even when it holds few Characters.",
    "A Birdcage on their field is a clock at 10 DON!!. Keep your Characters active, or cost 6 or more, on the turn they can reach 10 with Shanks.",
    "Their ST-18 clauses stop at 7 DON!! or fewer, and the Leader and Luffy-Tarou keep returning DON!!; pressure them early, before Mini-Merry and Yamato rebuild the count.",
  ],
  sources: [
    {
      url: "https://www.youtube.com/watch?v=VBPnhuFmRE8",
      retrievedAt: "2026-11-15",
      note: "The deck's own 50: the \"Straw Hat package\" list Sunny_OPTCG tested in a video on 16 Sep 2026, before most OP-18 support was revealed. The same video's Ramp package list is the source of the first variants line.",
    },
  ],
};
