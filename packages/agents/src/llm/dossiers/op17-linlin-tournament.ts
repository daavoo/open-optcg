import type { DeckStrategyDossier } from "./types.js";

export const op17LinlinTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Yellow) Charlotte Linlin - ChinoizeCup #121",
  archetype:
    "Yellow OP17-099 Charlotte Linlin as a Life-bank with a yellow toolbox: the {Big Mom Pirates} 4000 [Trigger] bodies and the 10-cost OP17-112 that makes them 8000, plus OP15-113 Zoro, EB04-058 Borsalino and OP16-119 Teach adding Life cards off the top of the deck, OP11-106 Zeus as removal, and OP14-104 Gecko Moria and Teach as Triggers that answer an attack.",
  gamePlan: [
    "OP17-112 Charlotte Linlin's [Your Turn] makes the base power of all of your Characters with a [Trigger] and 4000 base power 8000. Daifuku, Pudding, Oven, Cracker, Katakuri, Sweet 3 Generals and Perospero are those bodies; Streusen, Zeus, Zoro, Borsalino, Teach and Moria are not.",
    "Life cards come off the top of your own deck. Katakuri, Cracker, Sweet 3 Generals, OP17-112, OP15-113 Zoro (a card from hand), EB04-058 Borsalino (only at 2 or fewer Life) and OP16-119 Teach (the best of the top 3) each add one, and a Life card the opponent takes later often plays itself off its [Trigger].",
    "OP11-106 Zeus is the deck's removal: a 2-cost that takes a card from the top or bottom of your Life into hand to K.O. a cost 5 or less Character. Spend a Life card on it when the K.O. matters, and refill with the Life adders.",
    "OP16-119 Teach and OP14-104 Gecko Moria are 8-cost bodies whose value is mostly their [Trigger]s: Teach negates a Character's effect and K.O.s a cost 5 or less, Moria plays a cost 4 or less Character from your trash. Moria's [On Play] finds only {Thriller Bark Pirates}, which this list does not play.",
    "OP17-110 Charlotte Perospero plays a {Big Mom Pirates} Character of cost 6 or less from hand and then gains [Rush] on your turn: at 7 DON!! that is Katakuri or Sweet 3 Generals as well, two bodies and an attack from one card.",
  ],
  mulligan: [
    "Keep a hand with OP17-113 Streusen or OP17-109 Pudding: Streusen looks 3 deep for a {Big Mom Pirates} card on turn one, and Pudding trades a [Trigger] card for three.",
    "Keep Zeus or Zoro with a 1- or 3-cost: they are the deck's early plays outside the tribe.",
    "A hand of 6- to 10-costs with nothing under 4 goes back.",
  ],
  priorities: [
    "Do not activate the Leader's [When Attacking] automatically. It costs a card before your opponent chooses, and a hand spent into Life is a hand with no Counter for a board of 4000s.",
    "Watch the deck count. Zoro, Borsalino, Teach and the Big Mom Pirates all add Life off the top of your deck, and an empty deck loses the game; stop adding Life once you are ahead of the attacks you face.",
    "Play Zeus while the Life card it takes still leaves you a cushion; with 1 Life the K.O. costs your last Life card.",
    "EB04-058 Borsalino adds a Life only at 2 or fewer Life cards, and it is a 5-cost [Blocker] at any count. Play it as the Blocker early and as the Life refill late.",
    "Pay Zoro's and Pudding's hand costs with the card the plan can most afford: OP17-107 Charlotte Daifuku prints nothing but a [Trigger], so it does the same thing from Life as from hand. Never pay with OP17-112.",
    "Hold OP17-112 until it lifts at least two 4000 bodies; into an empty board it is a 12000 vanilla that draws a card.",
    "Cracker and Sweet 3 Generals rest 2 of your DON!! for their Life card: pay the turn's other plays first.",
    "Katakuri's and Sweet 3 Generals' −3000 is for this turn only; point it at the body stopping an attack and take that attack the same turn.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader is all {Big Mom Pirates}: four each of OP17-106 Smoothie, OP17-111 Mont-d'or and ST20-003 Brulee, two OP17-115, and four each of Oven, Cracker and Perospero. This list cuts the first four, one Oven, two Cracker and two Perospero for three Borsalino and four each of Zeus, Zoro, Teach and Gecko Moria.",
  ],
  commonCombos: [
    "Perospero into Katakuri at 7 DON!!: a Life card, −3000 on their blocker, and Perospero attacks on [Rush].",
    "Zeus takes a Life card to K.O. a cost 5 or less; Zoro or Teach puts a Life card back the next turn.",
    "OP17-112 onto a board of 4000 [Trigger] bodies: each is 8000 on your turn, and its [On Play] draws a card and adds a Life card or takes the top of theirs.",
  ],
  keyCardNumbers: [
    "OP17-099",
    "OP17-112",
    "OP17-110",
    "OP17-103",
    "OP11-106",
    "OP16-119",
    "OP15-113",
    "OP17-113",
    "OP17-109",
  ],
  counterplay: [
    "Every Life card you take hands them a card and may play a body or fire Teach's or Moria's [Trigger]; attack their board when their Life is high.",
    "Race the turn before OP17-112: at 10 DON!! every 4000 [Trigger] body they have becomes 8000 on their turn.",
    "Zeus and Teach reach cost 5 or less; a Character at cost 6 or more is out of reach of everything but battle and the −3000s.",
    "They bank Life off their own deck. A long game that makes them keep adding Life can run them out of cards.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6ac7870a85920e4d253669db/standings",
      retrievedAt: "2026-11-06",
      note: 'The deck\'s own 50: the list pilot "Namik" registered for [OP17.5] ChinoizeCup #121, an online event of 64 on 12 Oct 2026, dropping at 2-2.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_108.php",
      retrievedAt: "2026-09-20",
      note: "Bandai's feature deck for OP17-099, the source of the variants line and of the Perospero turn.",
    },
    {
      url: "https://opdeckguide.com/deck-guides/charlotte-linlin-op17/",
      retrievedAt: "2026-09-20",
      note: "A written guide for this Leader. Source for the Streusen-first mulligan and the claim that the Leader's clause should not be activated automatically.",
    },
  ],
};
