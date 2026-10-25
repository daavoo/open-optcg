import type { DeckStrategyDossier } from "./types.js";

export const op05LuffyTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple) Monkey.D.Luffy - 1st Place Store Battle 2025-07-01",
  archetype:
    "Purple Luffy DON!! ramp as a Store Battle winner builds it behind OP05-060: the Leader buys active DON!! with Life cards, and the deck spends it on DON!!-return cards -- Rush Sanji and Luffy, Gum-Gum Giant -- with Hitokiri Kamazo K.O.ing off each return.",
  gamePlan: [
    "OP05-060's [Activate: Main] [Once Per Turn] moves the top card of your Life to your hand to add 1 active DON!! from your DON!! deck, if you have 0 or 3 or more DON!! on your field. It works on turn 1 and from turn 3, not on turn 2. The DON!! is usable the same turn.",
    "EB01-061 Mr.2.Bon.Kurei adds another active DON!! on play, so the deck reaches its 7-costs early.",
    "Spend DON!! back to the DON!! deck for value. OP09-065 Sanji returns 1 or more to gain [Rush] and rest a Character of cost 6 or less; OP09-119 Monkey.D.Luffy returns 1 or more to draw and gain [Rush]; OP09-078 Gum-Gum Giant is a DON!! -2 [Counter] for +4000 and 2 cards.",
    "OP06-076 Hitokiri Kamazo K.O.s a Character of cost 2 or less the first time a DON!! is returned on your turn. Play it before Sanji, Luffy, Luffy-Tarou, Gamma Knife or Chopper.",
    "Returning DON!! also feeds OP07-064 Sanji: it costs 3 less in hand while you have at least 2 fewer DON!! than your opponent, and it is a 6000 [Blocker].",
    "The ST18 Wano Straw Hats still read 8 or more DON!! on your field: ST18-001 Uso-Hachi rests a cost 5 or less, ST18-002 O-Nami trashes 1 and draws 2, ST18-003 San-Gorou draws on attack. Play them on a turn you are at 8, and return DON!! afterwards.",
  ],
  mulligan: [
    "Keep OP09-069 Trafalgar Law: it costs 1 and looks at 4 for a {Straw Hat Crew} or {Heart Pirates} card of cost 2 or more.",
    "Keep EB01-061 Mr.2 or ST18-004 Zoro-Juurou as the 4-cost turn: one ramps, the other looks at 5 for a purple {Straw Hat Crew} card.",
    "Ship a hand of only 7-cost and higher with no Law, Mr.2 or Zoro-Juurou.",
  ],
  priorities: [
    "Use the Leader's activation on turn 1 and on turns you will spend the extra DON!!, but count your Life: the deck has no way to add Life back, and every activation is a card you will not have later.",
    "Sequence a turn as: add DON!!, cast the 8-DON!! payoffs, then return DON!! with Sanji, Luffy or Luffy-Tarou. A return before the payoff can take the field below 8.",
    "Kamazo's K.O. is [Your Turn] and once per turn. Gum-Gum Giant on your opponent's turn does not set it off.",
    "OP09-078 Gum-Gum Giant needs 2 DON!! to return and a card to trash. Leave 2 DON!! on the field at the end of your turn when you hold it.",
    "EB01-061 Mr.2's [When Attacking] sets its base power to an opposing Character's power for the turn. Attack with it after choosing the biggest Character on their board.",
    "OP11-067 Charlotte Katakuri is an 8-cost 8000 [Blocker] that at the end of your turn adds a rested DON!! and can set itself active, since it is a {Big Mom Pirates} Character of cost 3 or more: attack with it and still block.",
    "ST18-005 Luffy-Tarou's DON!! -1 plays a purple {Straw Hat Crew} Character of cost 5 or less from hand: San-Gorou, Zoro-Juurou, Uso-Hachi, O-Nami or ST26-002 Chopper. On your turn that return also sets off Kamazo.",
    "OP05-077 Gamma Knife is -5000 for DON!! -1, and OP03-072 Gum-Gum Jet Gatling is +3000 for a card. Both [Trigger]s add an active DON!!.",
  ],
  commonVariants: [
    "The starter list for this Leader is the OP05 Wano Straw Hats: OP05-061 Uso-Hachi, OP05-063 O-Robi, OP05-066 Jinbe, OP05-067 Zoro-Juurou, OP05-068 Chopa-Emon, OP05-070 Fra-Nosuke, OP05-072 Hone-Kichi, OP05-076 and P-041 Monkey.D.Luffy, nearly all of it reading 8 DON!!. This list cuts them for DON!!-return cards, Mr.2, Law, Kamazo and OP11-067 Katakuri.",
  ],
  commonCombos: [
    "Kamazo on the board, then OP09-065 Sanji returning DON!!: Sanji gains [Rush] and rests a cost 6 or less, and Kamazo K.O.s a cost 2 or less.",
    "Return DON!! with Sanji or Luffy until you are 2 below your opponent, and OP07-064 Sanji costs 3.",
    "Luffy-Tarou's DON!! -1 plays San-Gorou or Zoro-Juurou from hand and sets off Kamazo on the same turn.",
    "Leader activation into OP09-119 Luffy: the added DON!! pays for it, and returning DON!! gives it [Rush] and a draw.",
  ],
  keyCardNumbers: [
    "OP05-060",
    "OP06-076",
    "OP09-065",
    "OP09-119",
    "OP09-078",
    "EB01-061",
    "OP09-069",
  ],
  counterplay: [
    "The Leader spends its own Life for DON!!, and the list has no way to add Life back. Keep pressure on the Leader.",
    "Kamazo turns every DON!! return on its turn into a K.O. on a cost 2 or less. Remove it, or keep your cheap searchers off the board when it is out.",
    "OP09-065 Sanji and OP09-119 Luffy attack the turn they land. Keep a Blocker or a Counter for a [Rush] attack.",
    "Gum-Gum Giant is +4000 on their defence whenever they have 2 DON!! untouched. An attack that wins by 4000 or less is not safe.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-eb-02-deck-list-anime-25th-collection/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "Desaparecido" took to 1st, 5-0, at a Store Battle in Italy on 1 Jul 2025 (entry "Purple Luffy").',
    },
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569018",
      retrievedAt: "2026-09-11",
      note: "Bandai's ST-18 card list: the ST18 cards this list keeps, and the source of the variants line.",
    },
  ],
};
