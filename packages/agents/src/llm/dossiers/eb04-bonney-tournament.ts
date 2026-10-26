import type { DeckStrategyDossier } from "./types.js";

export const eb04BonneyTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Yellow) Jewelry Bonney - 13th Place ChinoizeCup #104",
  archetype:
    "Red/Yellow EB04-001 Jewelry Bonney as a yellow [Trigger] deck: the OP-17 Big Mom Pirates package, whose 4000-power [Trigger] bodies OP17-112 Charlotte Linlin turns into 8000s on your turn, plus Egghead and multicolour [Trigger] draws, with Life spent by the Leader and put back by Teach, Smoothie, Sweet 3 Generals and Linlin.",
  gamePlan: [
    "The Leader's [Activate: Main], once per turn, gives an opposing Character −1000 this turn, then, if you have 2 or more Life cards, you may take your top Life card into your hand. On your opponent's turn it is a 7000 while you have 1 or less Life. Use the activation every turn you are on 2 or more Life: it is a free card.",
    "Nearly every Character has a [Trigger], so a Life card taken by either player is often worth something. OP17-102 Oven, OP17-106 Smoothie, OP17-107 Daifuku and OP17-114 Sweet 3 Generals play themselves; OP07-104 Nico Robin draws 2 under this {Egghead} Leader, OP12-112 Baby 5 draws 2 because the Leader is multicoloured, OP07-099 Usopp gives an {Egghead} Leader or Character +2000 until the end of your next turn, and OP13-113 Lilith and OP17-109 Pudding search.",
    "Put Life back on top of the deck's best cards. OP16-119 Teach looks at 3 and adds one to the top of your Life; OP17-106 Smoothie and OP17-114 Sweet 3 Generals rest 2 DON!! on your turn to add the top card of your deck to your Life; OP17-112 Linlin draws 1 and either adds a Life card or takes the top of the opponent's Life into their hand.",
    "OP17-112 Charlotte Linlin is the top end. On your turn the base power of every Character of yours with a [Trigger] and 4000 base power becomes 8000: Robin, Oven, Smoothie, Daifuku, Pudding and Sweet 3 Generals.",
    "OP11-106 Zeus and OP16-119 Teach's [Trigger] are the removal: Zeus takes a card from the top or bottom of your Life to K.O. a cost 5 or less, and a Teach turned up as a Life card negates a Character and K.O.s a cost 5 or less.",
  ],
  mulligan: [
    "Keep a hand with OP13-113 Lilith or OP17-113 Streusen (1-cost searchers) and a 3-cost body -- Robin, Daifuku or Pudding -- so the board starts before turn 4.",
    "Linlin, Teach and EB04-061 Luffy are late cards; keep one only beside early plays.",
  ],
  priorities: [
    "Spend Life with the Leader while you are on 2 or more, then refill it with Teach, Smoothie, Sweet 3 Generals and Linlin. Going to 1 Life makes the Leader a 7000 on defence and turns the activation's draw off.",
    "OP17-109 Pudding's [On Play] trashes a card with a [Trigger] from your hand to draw 3. Almost any card in hand qualifies; pitch the one you need least.",
    "Smoothie and Sweet 3 Generals rest 2 of your DON!! for their [On Play], and only on your turn. Count those two DON!! before planning the rest of the turn. Sweet 3 Generals also gives up to two opposing Characters −3000 this turn: play it before attacking.",
    "OP17-102 Oven's [On K.O.] plays a Character with 4000 power or less other than Oven from your trash: trading it off rebuilds the board.",
    "OP06-115 is a +3000 Counter for a card from your hand; turned up at 0 Life, its [Trigger] puts the top of your deck back as a Life card.",
    "EB04-061 Monkey.D.Luffy costs 1 less in hand at 1 or less Life. Its [On Play] trashes a card for +2000 on the Leader and [Blocker] on itself until the end of the opponent's next End Phase.",
    "Linlin's choice: add a Life card when you are low, or take the top of their Life into their hand when the extra attack it saves wins the game.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader is an Egghead low-Life list: EB04-002 Jewelry Bonney and OP07-114 to search, EB04-058 Borsalino, EB04-054 and OP12-119 Bartholomew Kuma, EB04-052 Sanji, EB04-056 Pacifista, OP07-107 and ST29-010 Franky, EB04-007 Roronoa Zoro and OP13-108 Jewelry Bonney, with four EB04-061 Luffy. This list keeps one Luffy and plays the OP-17 Big Mom Pirates [Trigger] package with Teach, Zeus, Baby 5, Usopp, Robin and Lilith in their place.",
  ],
  commonCombos: [
    "Linlin on the board, then attack with every 4000 [Trigger] body at 8000.",
    "Leader activation for the top Life card, then Teach or Sweet 3 Generals to put a card back: a card drawn and the Life total unchanged.",
    "Pudding pitches a spare [Trigger] card to draw 3, finding Linlin or Teach.",
  ],
  keyCardNumbers: [
    "EB04-001",
    "OP17-112",
    "OP16-119",
    "OP17-109",
    "OP17-114",
    "OP17-106",
    "OP13-113",
    "OP11-106",
  ],
  counterplay: [
    "Taking their Life cards can play bodies and draw them cards: the [Trigger]s are the deck. Close the game in as few hits as you can rather than chipping.",
    "K.O. OP17-112 Linlin before their next turn: without it the board is 4000-power bodies.",
    "At 1 Life their Leader is a 7000 on your turn; plan attacks that clear that, not 5000.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6a8f03677a62de813013f933/standings",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "Appelmoes" took to 13th of 64 (4-2) at [OP17] ChinoizeCup #104, an online event on Tuesday 1 Sep 2026.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_101.php",
      retrievedAt: "2026-09-04",
      note: "Bandai's feature deck for EB04-001, the source of the variants line.",
    },
  ],
};
