import type { DeckStrategyDossier } from "./types.js";

export const op14HancockDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue/Yellow) Boa Hancock - Official Feature Deck",
  archetype:
    "Blue/Yellow [Trigger] midrange behind OP14-041: a {Kuja Pirates} Leader that draws a card whenever you play a Character on your opponent's turn, in a fifty where most Life cards play a Character when they are taken.",
  gamePlan: [
    "Your Life is a resource. OP14-113 Marguerite, OP14-114 Ran, OP14-115 Rindo, OP14-105 Gorgon Sisters and OP14-107 Shakuyaku play themselves as a [Trigger] because your Leader is {Kuja Pirates}, and each one played that way on your opponent's turn draws you a card through the Leader.",
    "EB04-027 Boa Hancock, OP14-112 Boa Hancock and the OP14-118 Event play a Character with a [Trigger] out of your hand when they are taken as a [Trigger]: 5000 power or less for EB04-027, 6000 or less for the other two. Keep such a Character in hand so those [Trigger]s have something to play.",
    "The Leader's second clause needs 1 DON!! on it: once a turn, when one of your {Amazon Lily} or {Kuja Pirates} Characters with 5000 base power or more is K.O.'d, the top card of your opponent's Life goes to their hand. Leave a DON!! on the Leader at the end of your turn so that K.O.ing your bodies costs them a Life.",
    "OP13-052 Boa Marigold is a 5-cost [Blocker] that plays a [Boa Hancock] of cost 6 or less from your hand for free. OP07-051 is the one to play with it: two bodies for five DON!!, and OP07-051 stops an opposing Character attacking through your opponent's next turn and bottom-decks a Character of cost 1 or less.",
    "OP14-108 Silvers Rayleigh K.O.s a Character with 7000 base power or less once your opponent is at 3 Life or fewer, from your hand or off its own [Trigger]. OP14-107 Shakuyaku draws 2 and trashes 2 at the same threshold. Hold them until the opponent is there.",
    "OP14-112 Boa Hancock is the top of the curve at 9: its [On Play] adds a card from your deck to your Life and then takes the top of your opponent's Life into their hand.",
    "Early turns: OP13-113 Lilith looks at 4 for a [Trigger] card, and OP14-113 Marguerite looks at 5 for an {Amazon Lily} or {Kuja Pirates} card, then trashes one from your hand.",
  ],
  mulligan: [
    "Keep a hand with OP13-113 Lilith, OP14-113 Marguerite or OP14-114 Ran: a Character to play before the 5-costs.",
    "The only other cheap card is the OP14-118 Counter Event, which is not a turn-one play. A hand without one of those three Characters does nothing until turn five. Take a new hand.",
  ],
  priorities: [
    "Do not spend Counters to protect Life while you are at 3 or more. A hit on the Leader is a [Trigger], and most [Trigger]s here are a free Character and a card.",
    "Always activate a [Trigger] that plays a Character on your opponent's turn: it is a body and, through the Leader, a draw.",
    "PRB02-017 Boa Hancock's [On Play] costs a [Trigger] card from your hand. Pay it with a card whose [Trigger] you value least, and aim the attack lock at the opponent's biggest attacker or their rested Leader.",
    "OP14-114 Ran and OP14-105 Gorgon Sisters give rested DON!!, and only to {Kuja Pirates} cards. Your Leader is one, so Ran can load the Leader for its second clause.",
    "OP14-118's [Counter] only works at 2 Life or fewer and stops an active Character attacking this turn. It is a late-game Counter; before that, its [Trigger] is the reason it is in the deck.",
    "Once your opponent is at 3 Life or fewer, Rayleigh's K.O. and Shakuyaku's draw come online. Count their Life before you choose which 6-cost to play.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader, built around Characters that play themselves off a [Trigger].",
  ],
  commonCombos: [
    "OP13-052 Boa Marigold plays OP07-051 Boa Hancock for free: a [Blocker] and an attack lock for five DON!!.",
    "A hit on your Leader flips Marguerite, Ran, Rindo, Gorgon Sisters or Shakuyaku from Life onto the board, and the Leader draws a card for it.",
    "EB04-027, OP14-112 or OP14-118 as a [Trigger] plays a [Trigger] Character from your hand, which the Leader also draws for.",
    "Rindo K.O.'d on your opponent's turn puts a card from your deck on your Life and then deals you 1 damage, so the top of your Life is checked again for a [Trigger].",
  ],
  keyCardNumbers: [
    "OP14-041",
    "OP13-113",
    "OP14-113",
    "OP13-052",
    "OP07-051",
    "OP14-108",
    "OP14-112",
    "PRB02-017",
  ],
  counterplay: [
    "Attacking this Leader feeds it: most of its Life cards become a Character and a draw. Take Life when it ends the game, or when you can K.O. what it brings the same turn.",
    "With a DON!! on the Leader, K.O.ing one of its 5000-base-power Kuja bodies puts your top Life card in your hand once a turn. Remove the smaller bodies, or bounce and rest instead of K.O.",
    "Rayleigh's K.O. and Shakuyaku's draw both need you at 3 Life or fewer, so staying above that turns off two of its 6-costs.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_090.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP14-041: the fifty, the Leader's draw on the opponent's turn with Characters played by [Trigger], its K.O. clause deterring attacks on {Amazon Lily} and {Kuja Pirates} bodies, OP13-052 playing OP07-051 for five DON!!, and OP14-108 as removal from hand or Life.",
    },
  ],
};
