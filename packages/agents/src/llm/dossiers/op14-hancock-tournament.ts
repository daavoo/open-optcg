import type { DeckStrategyDossier } from "./types.js";

export const op14HancockTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue/Yellow) Boa Hancock - 25th Place ChinoizeCup #105",
  archetype:
    "Blue/Yellow [Trigger] midrange behind OP14-041, as the OP-17 field builds it: the self-playing Kuja [Trigger] Characters, {The Seven Warlords of the Sea} support, and Characters that add cards to your own Life so there are more [Trigger]s to flip.",
  gamePlan: [
    "Your Life is a resource. OP14-113 Marguerite, OP14-114 Ran, OP14-115 Rindo, OP14-105 Gorgon Sisters, OP14-107 Shakuyaku and OP16-113 Boa Marigold play themselves as a [Trigger] because your Leader is {Kuja Pirates}, and each one played that way on your opponent's turn draws you a card through the Leader.",
    "Refill your Life. EB04-058 Borsalino adds a card at 2 Life or fewer, OP12-119 Bartholomew Kuma adds one for a card from hand and again when it is K.O.'d on your opponent's turn, OP16-119 Marshall.D.Teach picks the best of three, and OP14-112 Boa Hancock adds one on entry. Every card added is another [Trigger] the Leader can draw from.",
    "The Leader's second clause needs 1 DON!! on it: once a turn, when one of your {Amazon Lily} or {Kuja Pirates} Characters with 5000 base power or more is K.O.'d, the top card of your opponent's Life goes to their hand. ST17-004 Boa Hancock, EB03-053 Nami and Ran each give the Leader a rested DON!!, so leave one there at the end of your turn.",
    "OP14-108 Silvers Rayleigh K.O.s a Character with 7000 base power or less once your opponent is at 3 Life or fewer, from your hand or off its own [Trigger]. OP14-107 Shakuyaku draws 2 and trashes 2 at the same threshold. Hold them until the opponent is there.",
    "OP14-112 Boa Hancock is the top of the curve at 9: it adds a card to your Life and takes the top of your opponent's Life into their hand.",
    "Early turns: OP14-113 Marguerite looks at 5 for an {Amazon Lily} or {Kuja Pirates} card, and ST17-004 Boa Hancock is a 4-cost [Blocker] that sets up your top 3 cards.",
  ],
  mulligan: [
    "Keep a hand with OP14-113 Marguerite, OP14-114 Ran or ST17-004 Boa Hancock: a Character to play before the 5-costs.",
    "The other cheap cards are the Events, which are not early plays. A hand without one of those three Characters does nothing until turn five. Take a new hand.",
  ],
  priorities: [
    "Do not spend Counters to protect Life while you are at 3 or more. A hit on the Leader is a [Trigger], and most [Trigger]s here are a free Character and a card.",
    "Always activate a [Trigger] that plays a Character on your opponent's turn: it is a body and, through the Leader, a draw.",
    "EB03-053 Nami takes the top of your opponent's Life into their hand only while they are at 3 or more. Play it early, while that is still true, and use its [On K.O.] to play a Character from hand.",
    "OP07-057 Perfume Femur turns off [Blocker] for the attack of a Warlord: your Leader, ST17-004, OP14-105, OP14-112, OP12-119 and OP16-119 all qualify. Play it on the turn a Blocker is the only thing between you and lethal.",
    "OP07-056 Slave Arrow is a +4000 Counter that costs a Character of cost 2 or more back to your hand. Return one whose [On Play] you want again, such as Marguerite or ST17-004.",
    "OP06-058 Gravity Blade bottoms two Characters of cost 6 or less for 7: save it for a turn that clears the way to the Leader.",
    "Once your opponent is at 3 Life or fewer, Rayleigh's K.O. and Shakuyaku's draw come online. Count their Life before you choose which 6-cost to play.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader runs OP13-113 Lilith, OP13-052 Boa Marigold with OP07-051 Boa Hancock, PRB02-017, EB04-027 and OP14-118 where this list runs ST17-004, the Life-gain Characters, the Warlord Events and Gravity Blade.",
  ],
  commonCombos: [
    "A hit on your Leader flips a Kuja [Trigger] Character onto the board, and the Leader draws a card for it.",
    "Borsalino or Kuma refills your Life, and the next hit is another [Trigger] and another card.",
    "Rindo K.O.'d on your opponent's turn puts a card from your deck on your Life and then deals you 1 damage, so the top of your Life is checked again for a [Trigger].",
    "ST17-004 gives the Leader a rested DON!!, which arms the Leader's K.O. clause for your opponent's turn.",
  ],
  keyCardNumbers: [
    "OP14-041",
    "OP14-113",
    "ST17-004",
    "EB04-058",
    "OP14-108",
    "OP14-112",
    "OP16-119",
  ],
  counterplay: [
    "Attacking this Leader feeds it: most of its Life cards become a Character and a draw, and it keeps adding Life back. Take Life when it ends the game, or when you can K.O. what it brings the same turn.",
    "With a DON!! on the Leader, K.O.ing one of its 5000-base-power Kuja bodies puts your top Life card in your hand once a turn. Remove the smaller bodies, or bounce and rest instead of K.O.",
    "Rayleigh's K.O. and Shakuyaku's draw both need you at 3 Life or fewer, so staying above that turns off two of its 6-costs.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6a8f06390580a332c84204b0/standings",
      retrievedAt: "2026-10-17",
      note: "The deck's own 50: the 25th-place list of 64 at [OP17] ChinoizeCup #105, an online event played on 2 Sep 2026.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_090.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP14-041, the source of the variants line and of the Leader's two clauses as this dossier describes them.",
    },
  ],
};
