import type { DeckStrategyDossier } from "./types.js";

export const op05EnelTcgmmDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Yellow) Enel - TCG Match Making EB05 2026-11-12 #6",
  archetype:
    "OP-05 Yellow Enel Life control with the OP-17 Big Mom Pirates package: 4000-power [Trigger] bodies that Charlotte Linlin re-prices at 8000, searchers that find them, Life refilled from the deck, and a Leader that refills the last Life card once each opponent's turn.",
  gamePlan: [
    "The Leader's clause fires on the opponent's turn when your Life reaches 0: the top of your deck becomes a Life card and you trash a card from hand. It is once per turn, so a single attack at 0 Life does not end the game, but a second one in the same turn does.",
    "Five Characters put a card from your deck on top of your Life: EB04-058 Borsalino at 2 Life or less, OP16-119 Teach (look at 3, pick one), OP17-114 Sweet 3 Generals, OP17-112 Linlin, and EB02-052 Enel when it attacks at 1 Life or less. OP11-106 Zeus spends a Life card into hand to K.O. a cost 5 or less.",
    "What goes into Life is mostly cards with a [Trigger]: OP17-102 Oven, OP17-107 Daifuku, OP17-110 Perospero and OP17-114 play themselves, OP15-103 Genbo draws and plays itself at 2 Life or less, and OP16-119 Teach negates and K.O.s a cost 5 or less. A Life card the opponent takes often puts a body on your board.",
    "OP17-113 Streusen looks at 3 for a {Big Mom Pirates} card. OP17-109 Pudding trashes a [Trigger] card from hand to draw 3. OP17-110 Charlotte Perospero, on your turn, plays a {Big Mom Pirates} Character of cost 6 or less from your hand and gains [Rush]: two bodies for one card's DON!!, and an attacker the turn it lands.",
    "OP17-112 Charlotte Linlin is the top end: on your turn every Character with a [Trigger] and 4000 base power becomes 8000 -- Oven, Daifuku, Pudding, Genbo, Perospero and Sweet 3 Generals. Its [On Play] draws 1 and either adds a Life card or takes the top of your opponent's Life into their hand.",
    "EB02-052 Enel is a 10-cost 11000 with [Rush] under this {Sky Island} Leader: one copy, a second big threat beside Linlin.",
  ],
  mulligan: [
    "Keep a hand with OP17-113 Streusen, OP11-106 Zeus, OP15-103 Genbo or a 3-cost Big Mom Pirates body: the board and the searches start before turn 4.",
    "Throw back a hand whose only cheap cards are OP06-115 and EB05-060: neither puts a body on the board.",
  ],
  priorities: [
    "The Leader's refill trashes a hand card after it adds the Life card, and it is not optional. Going into the opponent's turn at 1 Life, count one card of your hand as already spent when you plan your Counters.",
    "EB04-058 Borsalino only adds Life at 2 or less; play it after you have lost Life, not before.",
    "OP17-114 Sweet 3 Generals rests two DON!! for its [On Play]: draw 1, add a Life card, and −3000 on up to two opposing Characters this turn. Count that into the turn before choosing it over a second play.",
    "OP17-109 Pudding's draw costs a [Trigger] card from hand. Pay with a 2000-Counter body you do not need, not OP06-115.",
    "OP06-115 is a 0-cost +3000 Counter that costs a card from hand; its [Trigger] refills a Life at 0, the same as the Leader.",
    "EB05-060 Take Care of Lilith!!! is a +4000 Counter for turning your top Life card face-up, and in the Main phase it trashes an {Egghead} Character of cost 5 or more -- EB04-058 Borsalino is the one here -- to add a Life card. Turn a Life card face-up only when the opponent seeing it costs you least.",
    "Pick Linlin's second mode by the race: add a Life card when you need the cushion, or take their top Life card when you are pushing for lethal.",
  ],
  commonVariants: [
    "Yellow Enel lists vary in the Life-gain and removal slots around the same Big Mom Pirates core. The OP17.5 build ranked 3rd by TCG Match Making on 22 Oct 2026 runs four OP13-113 Lilith and two EB02-052 Enel where this one runs Perospero and EB05-060; others play OP15-113 Roronoa Zoro, OP17-106 Smoothie, EB01-059 Kingdom Come and OP06-117 The Ark Maxim.",
  ],
  commonCombos: [
    "OP17-112 Linlin on the board, then attack with every 4000 [Trigger] body at 8000.",
    "OP16-119 Teach looks at 3 and puts the best [Trigger] on top of your Life for the opponent to hit.",
    "OP17-102 Oven K.O.'d in battle plays a 4000-power-or-less Character back from your trash.",
  ],
  keyCardNumbers: [
    "OP05-098",
    "OP17-112",
    "OP17-114",
    "OP16-119",
    "OP17-110",
    "OP11-106",
    "OP17-102",
    "OP06-115",
  ],
  counterplay: [
    "Attack twice in one turn once their Life is at 1 or 0: the Leader's refill is once per turn.",
    "Empty their hand before the late game: the refill and OP06-115 both trash a hand card.",
    "K.O. OP17-112 Linlin before their next turn: without it the board is 4000-power bodies.",
    "Every Life card you take may be a [Trigger] that plays a body or K.O.s one of yours. Take Life when the trigger costs you least.",
  ],
  sources: [
    {
      url: "https://www.patreon.com/tcgmatchmaking",
      retrievedAt: "2026-11-12",
      note: "The deck's own 50: Yellow Enel as TCG Match Making's EB05 Weekly Power Rankings of 12 Nov 2026 list it, ranked 6 of the top ten, from high-rank online play; its OP17.5 rankings of 22 Oct 2026 are the source of the variants line's earlier build. A Patreon post with no pilot or event.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_028.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP05-098: the Leader tanks an attack a turn for one card, and the deck turns low Life into an advantage rather than defending early.",
    },
  ],
};
