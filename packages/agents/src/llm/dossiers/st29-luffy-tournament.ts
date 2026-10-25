import type { DeckStrategyDossier } from "./types.js";

export const st29LuffyTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Yellow) Monkey.D.Luffy - 1st Place Store Battle 2026-07-15",
  archetype:
    "Yellow Egghead Luffy as a Store Battle winner builds it: the ST29-001 Leader's low-Life draw, the starter's self-playing [Trigger] Straw Hats, and a refill package of Characters that put cards back on top of your own Life, so the deck sits at 2 Life without dying there.",
  gamePlan: [
    "The Leader only does something at 2 Life or fewer: then each attack draws 1 and trashes 1. Do not protect your Life on the way down to 2; spend Counters on Characters and on hits that would take you below that.",
    "A hit on your Leader is often a free Character. ST29-005 Jinbe and ST29-009 Nico Robin play themselves off a [Trigger] because your Leader is [Monkey.D.Luffy], ST29-004 Sanji plays itself for a card from hand, and OP06-104 Kikunojo plays itself once your opponent is at 3 Life or fewer.",
    "Once you are low, put Life back on top rather than letting it run out. EB04-058 Borsalino adds a card only at 2 Life or fewer, which keeps the Leader's draw switched on. OP15-113 Roronoa Zoro adds one for a card from hand, EB03-055 Nico Robin trashes one and adds two, and OP16-119 Marshall.D.Teach chooses the best of three for the top.",
    "Take your opponent's Life without dealing damage. EB03-053 Nami moves the top of their Life to their hand while they are at 3 or more, and OP13-108 Jewelry Bonney does it unconditionally and gains [Rush] because your Leader is {Egghead}. Neither checks for a [Trigger].",
    "OP15-114 Wyper's [On Play] turns a Life card face-up to give every opposing Character -2000 and K.O. any left at 0 power or less: play it into a board of small bodies.",
    "Close with ST29-016: its [Main] makes the Leader [Unblockable] for the turn, on the turn that attack ends the game.",
  ],
  mulligan: [
    "Keep a hand with ST29-004 Sanji, ST29-009 Nico Robin or OP07-099 Usopp: Sanji looks at 4 for a {Straw Hat Crew} card, and the other two are cheap bodies or 2000 Counters.",
    "Keep OP06-104 Kikunojo or OP15-113 Roronoa Zoro as the 4-cost turn; both are 6000 bodies.",
    "Ship a hand that is only 7-cost and higher. Bonney, Teach and both Nico Robins at 7 do nothing until late, and the deck has one searcher.",
  ],
  priorities: [
    "Count both Life totals before every play. Borsalino, the Leader and Bonney's [Trigger] read your Life (2 or fewer, 2 or fewer, 1 or fewer); Nami's take reads your opponent's at 3 or more; Kikunojo's [Trigger] and [On K.O.] read theirs at 3 or fewer.",
    "Play EB03-053 Nami while your opponent still has 3 or more Life, and give its rested DON!! to the Leader. Its [On K.O.] turns your top Life card face-up to play a 6000-or-less Character from hand.",
    "OP15-109 Nico Robin trades a Life card to your hand for one off your deck, then plays a {Sky Island} Character of cost 5 or less from hand: Roronoa Zoro, Wyper or OP15-119 Monkey.D.Luffy. Hold one of those with it.",
    "Use OP16-119 Teach's look at 3 to put a high-cost card on top of your Life when OP15-119 Monkey.D.Luffy is on the board: when your opponent uses an Event or a [Blocker], Luffy reveals that card and gains +1000 per cost. Teach himself and Bonney are the biggest.",
    "OP15-119 Monkey.D.Luffy has [Rush] with 6 or more DON!! on your field, so it can attack the turn you play it.",
    "ST29-016's [Counter] half is +3000 to the Leader. Spend it there unless the [Main] half wins the game this turn.",
    "OP07-099 Usopp's [Trigger] gives an {Egghead} Leader or Character +2000 until the end of your next turn: put it on the Leader, which is {Egghead}, when you will attack next turn.",
  ],
  commonVariants: [
    "The starter list for this Leader runs ST29-002 Usopp, ST29-003 Kaku, ST29-013 Rob Lucci, ST29-012 Monkey.D.Luffy, ST29-014 Roronoa Zoro, ST29-015 and ST29-017, and the vanillas ST29-006 Stussy and ST29-010 Franky. This list cuts all of them for the Life-refill Characters, the OP-15 {Sky Island} package, Bonney and Teach.",
  ],
  commonCombos: [
    "Take hits down to 2 Life, then Borsalino adds a card back: the Leader keeps drawing, and the card on top is another [Trigger].",
    "OP15-109 Nico Robin plays Wyper from hand for free: a 7000 body and a -2000 sweep on the same turn.",
    "OP16-119 Teach puts Bonney or another Teach on top of your Life; OP15-119 Luffy then gains +8000 or +9000 when your opponent blocks or plays an Event.",
    "EB03-053 Nami's [On Play] gives the Leader a rested DON!! and takes a Life card from your opponent before they fall under 3, where Kikunojo's [Trigger] switches on.",
  ],
  keyCardNumbers: [
    "ST29-001",
    "ST29-005",
    "ST29-009",
    "EB04-058",
    "OP13-108",
    "OP15-109",
    "OP16-119",
  ],
  counterplay: [
    "Do not race this deck to 2 Life: its Leader starts drawing there and Borsalino starts refilling. Win the board, and take the last Life cards in one turn.",
    "Jinbe, Nico Robin and Sanji come off its Life as free Characters. Expect a body for most hits on the Leader.",
    "Bonney and Nami take your Life cards to your hand without damage, so a Life card is not a guaranteed [Trigger] for you either.",
    "Wyper's -2000 sweep K.O.s anything at 2000 power or less on entry. Do not leave a board of small bodies against 5 DON!!.",
    "OP15-119 Luffy grows when you use a [Blocker] or an Event. Remove it rather than block it.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "Angelito_1023" took to 1st at a Store Battle in England on 15 Jul 2026 (entry "Egghead Luffy").',
    },
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569029",
      retrievedAt: "2026-09-19",
      note: "Bandai's ST-29 card list: the Leader's text and the starter cards this list keeps, and the source of the variants line.",
    },
  ],
};
