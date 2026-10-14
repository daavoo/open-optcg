import type { DeckStrategyDossier } from "./types.js";

export const op05EnelOpenDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Yellow) Enel - Open OPTCG",
  archetype:
    "OP-05 Yellow Enel Life control with the OP-17 Big Mom Pirates package: 4000-power [Trigger] bodies that Charlotte Linlin re-prices at 8000, Life spent for cards and removal, and a Leader that refills the last Life card once each opponent's turn.",
  gamePlan: [
    "The Leader's clause fires on the opponent's turn when your Life reaches 0: the top of your deck becomes a Life card and you trash a card from hand. It is once per turn, so a single attack at 0 Life does not end the game, but a second one in the same turn does.",
    "Life is a resource here, spent and refilled. EB01-056 Charlotte Flampe draws for a Life card, OP11-106 Zeus K.O.s a cost 5 or less for one, and EB01-059 Kingdom Come K.O.s any Character and trashes your Life down to 1.",
    "Six Characters put a card from your deck on top of your Life: OP15-113 Zoro, EB04-058 Borsalino at 2 Life or less, OP16-119 Teach, OP17-106 Smoothie, OP17-114 Sweet 3 Generals and OP17-112 Linlin. What goes back is often a Big Mom Pirates Character with [Trigger] Play this card, so a Life card taken can put a body on the board.",
    "OP17-112 Charlotte Linlin is the top end: on your turn every Character with a [Trigger] and 4000 base power becomes 8000, which is Daifuku, Pudding, Oven, Smoothie and Sweet 3 Generals.",
  ],
  mulligan: [
    "Keep a hand with a Character costing 3 or less -- Flampe, Zeus, OP17-107 Daifuku or OP17-109 Pudding -- so the board starts before turn 4.",
    "Throw back a hand whose only cheap cards are OP06-115 and OP06-117 The Ark Maxim: neither puts a body on the board.",
  ],
  priorities: [
    "The Leader's refill trashes a hand card after it adds the Life card, and it is not optional. Going into the opponent's turn at 1 Life, count one card of your hand as already spent when you plan your Counters.",
    "Spend Life with Flampe, Zeus and Kingdom Come on turns when you can bank it back, or when the Leader's refill is still unused for the opponent's next turn.",
    "EB04-058 Borsalino only adds Life at 2 or less; play it after you have spent Life, not before.",
    "OP17-106 Smoothie and OP17-114 Sweet 3 Generals rest two DON!! for their [On Play]. Count that into the turn before choosing them over a second play.",
    "OP06-115 is a 0-cost +3000 Counter that costs a card from hand; its [Trigger] refills a Life at 0, the same as the Leader.",
    "OP06-117 The Ark Maxim rests itself and an [Enel] card -- the Leader -- to K.O. every opposing Character costing 2 or less. Use it after the Leader has attacked, against a wide board of cheap bodies.",
  ],
  commonVariants: [
    "OP-17 Yellow Enel lists vary in the Thriller Bark and Sky Island slots around the same Big Mom Pirates core; this list runs Borsalino, Teach and Zoro for Life gain where others play OP14 Thriller Bark cards.",
  ],
  commonCombos: [
    "OP17-112 Linlin on the board, then attack with every 4000 [Trigger] body at 8000.",
    "Kingdom Come to trash Life down to 1 and K.O. their best Character, then rely on the Leader's refill on their turn.",
    "OP17-102 Oven K.O.'d in battle plays a 4000-power-or-less Character back from your trash.",
  ],
  keyCardNumbers: [
    "OP05-098",
    "OP17-112",
    "EB01-059",
    "OP11-106",
    "OP17-102",
    "OP16-119",
    "OP06-115",
  ],
  counterplay: [
    "Attack twice in one turn once their Life is at 1 or 0: the Leader's refill is once per turn.",
    "Empty their hand before the late game: the refill and OP06-115 both trash a hand card.",
    "K.O. OP17-112 Linlin before their next turn: without it the board is 4000-power bodies.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_028.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP05-098: the Leader tanks an attack a turn for one card, and the deck turns low Life into an advantage rather than defending early.",
    },
    {
      url: "https://gumgum.gg/one-piece/decklists/deck/east/op17/1ee9250f-9239-4861-88aa-bb291b86f4ef",
      retrievedAt: "2026-09-28",
      note: "An OP-17 Standard Battle first place under OP05-098 with the same Big Mom Pirates core; the source for the variants line. This deck's own 50 was supplied by the maintainer.",
    },
  ],
};
