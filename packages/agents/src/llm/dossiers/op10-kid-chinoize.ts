import type { DeckStrategyDossier } from "./types.js";

export const op10KidChinoizeDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Yellow) Eustass Kid - 1st Place ChinoizeCup #94",
  archetype:
    "Yellow {Supernovas} Life-control midrange behind OP10-099: the Leader stands a {Supernovas} Character back up as a [Blocker] each turn, Characters that add Life cards keep the Life total and its [Trigger]s high, and OP11-106 Zeus and OP15-105 Jewelry Bonney cash a Life card into removal or protection. OP10-112 Kid and OP10-109 Basil Hawkins trash the opponent's Life without giving them the card.",
  gamePlan: [
    'At the end of each of your turns the Leader may turn your top Life card face-up to set one of your {Supernovas} Characters of cost 3 to 8 active and give it [Blocker] until the end of your opponent\'s next turn. Attack with that Character first, then stand it up to defend. The {Supernovas} it can reach here are ST36-001 Cavendish, ST36-002 Killer, ST36-003 Scratchmen Apoo, OP10-109 Hawkins, ST36-005 Eustass"Captain"Kid, OP10-119 Trafalgar Law and OP10-112 Eustass"Captain"Kid.',
    "Find the curve: OP10-111 Monkey.D.Luffy looks 5 deep for a {Supernovas} card, and ST36-004 Bartolomeo trashes a {Supernovas} card from hand to draw 2.",
    "Add Life. ST36-002 Killer adds a card from the deck on your turn under this {Kid Pirates} Leader, OP16-119 Marshall.D.Teach looks at 3 and puts the best on top, OP10-119 Law puts a {Supernovas} Character from your hand on top face-down and gives the Leader a rested DON!!, EB04-058 Borsalino adds one at 2 Life or fewer, and ST36-001 Cavendish and OP06-104 Kikunojo add one when K.O.'d.",
    "Spend Life. OP11-106 Zeus takes a Life card from the top or bottom into hand to K.O. a Character of cost 5 or less. OP15-105 Jewelry Bonney takes the top Life card into hand instead of one of your Characters with 7000 base power or less leaving the field to the opponent's effect. A Life card taken this way is a card in hand and not a hit.",
    "OP10-112 Eustass\"Captain\"Kid rests itself on play to trash the top card of your opponent's Life, and OP10-109 Hawkins does the same when K.O.'d: Life taken without giving them the card or a [Trigger]. The Leader then sets Kid active as a [Blocker] at the end of the same turn.",
    'ST36-005 Eustass"Captain"Kid, on your opponent\'s attack, turns a Life card face-down to move the attack onto one of your Eustass"Captain"Kid Characters with 5000 base power or more: itself or OP10-112. Its [Activate: Main] turns a Life card face-up to give the Leader a rested DON!!.',
    "EB04-059 Black Rope Dragon Twister turns a Life card face-up to K.O. a cost 6 or less and a cost 5 or less while you have fewer Characters than the opponent: the catch-up card when they have gone wide.",
  ],
  mulligan: [
    'Keep OP10-111 Luffy, ST36-002 Killer or ST36-005 Eustass"Captain"Kid: the search, the first Life-adder and the redirect are what the early turns need.',
    "A hand of 8-costs and Black Rope Dragon Twister with no Character under 5 takes a new hand.",
  ],
  priorities: [
    "Use the Leader's end-of-turn clause every turn you have a {Supernovas} Character of cost 3 to 8 that attacked: it is a free extra [Blocker] for your opponent's turn.",
    "Zeus and Bonney turn Life into cards in hand. Spend Life with them while you are ahead on Life and the Life-adders are coming; at 2 Life or fewer, keep it.",
    "Bartolomeo's draw costs a {Supernovas} card from hand: trash a spare Luffy or a Cavendish, not Kid or Law.",
    "OP10-119 Law wants a {Supernovas} Character in hand to put on top of your Life: a Killer or Apoo there is a [Trigger] the opponent hits into later.",
    "OP10-112 Kid draws and trashes at the end of your turn while your opponent is at 2 Life or fewer. Trash their Life with it on the way there.",
    "ST36-002 Killer and OP06-104 Kikunojo play themselves off a [Trigger] while the opponent is at 3 Life or fewer; ST36-003 Apoo's [Trigger] draws and makes the Leader's base power 7000; Hawkins and Black Rope Dragon Twister draw 2 and trash 1; Teach's negates and K.O.s a cost 5 or less. Late in the game every hit on your Leader gives you something.",
  ],
  commonVariants: [
    "The ChinoizeCup #104 list for this Leader (1 Sep 2026) runs a Thriller Bark recursion package -- OP14-102 Kumacy, OP14-110 Dr. Hogback, OP14-111 Perona -- with OP17-109 Charlotte Pudding, OP17-114 Sweet 3 Generals, OP15-119 Monkey.D.Luffy and P-088 Trafalgar Law, where this list runs Zeus, Bonney, Hawkins, Kikunojo, OP10-119 Law, Black Rope Dragon Twister and the starter's searchers.",
    'The Starter Deck 36 list runs OP10-101 Urouge, OP10-103 Capone"Gang"Bege, OP10-114 X.Drake, OP12-113 Roronoa Zoro, P-085 Jewelry Bonney, P-088 Law and OP13-116, where this list runs Borsalino, Teach, OP10-112 Kid, Zeus and the Life-adders.',
  ],
  commonCombos: [
    "OP10-112 Kid rests to trash a Life card, and the Leader sets it active as a [Blocker] at the end of the turn.",
    "OP16-119 Teach puts the best of three on top of your Life; Zeus later takes it into hand for a K.O.",
    "OP10-119 Law puts a Killer on top of your Life face-down; when the opponent takes it at 3 Life or fewer, Killer plays itself and adds another Life card.",
    "ST36-005 Kid redirects an attack to OP10-112 Kid, a 9000 body, with a Life card turned face-down as the cost.",
  ],
  keyCardNumbers: [
    "OP10-099",
    "OP10-112",
    "ST36-005",
    "ST36-002",
    "OP16-119",
    "OP11-106",
    "OP15-105",
    "OP10-119",
  ],
  counterplay: [
    "The Leader turns one attacker into a [Blocker] each turn. Count one more Blocker than you see when you plan an attack.",
    "Their Life total is a resource: Zeus and Bonney spend it and half the list puts it back. Hitting Life early gives them [Trigger]s; removing the Life-adders (Killer, Teach, Law) slows the refill.",
    "ST36-005 Kid moves an attack onto a Kid with 5000 base power or more. Make it spend that on a small attack before the one that matters.",
    "Black Rope Dragon Twister only works while they have fewer Characters than you: going wide on your turn feeds it.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/",
      retrievedAt: "2026-11-25",
      note: 'The deck\'s own 50: the list "Enderu" took to 1st (6-0) at ChinoizeCup on OPTCGSim on 10 Aug 2026 (entry "Yellow Kid").',
    },
    {
      url: "https://play.limitlesstcg.com/tournament/6a72eef32b308b6067b4a76b/standings",
      retrievedAt: "2026-11-25",
      note: "Limitless TCG's standings for ChinoizeCup #94 MONDAY (10 Aug 2026, 61 players): Enderu, OP10-099, 1st at 6-0.",
    },
    {
      url: "https://play.limitlesstcg.com/tournament/6a8f03677a62de813013f933/standings",
      retrievedAt: "2026-10-17",
      note: "ChinoizeCup #104 (1 Sep 2026), the Thriller Bark list in the first variants line.",
    },
  ],
};
