import type { DeckStrategyDossier } from "./types.js";

export const op11ShirahoshiDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green/Yellow) Shirahoshi - Official Feature Deck",
  archetype:
    "Green/Yellow {Neptunian} midrange behind OP11-022: a Leader that cannot attack and instead plays a 7000-8000 body for one DON!! every turn, while the deck's own cards turn its Life back face-down to pay for it again.",
  gamePlan: [
    "Your Leader cannot attack. Its [Activate: Main], once per turn: rest 1 DON!! and turn your top Life card face-up to play a {Neptunian} Character or [Megalo] from hand with a cost up to the number of DON!! on your field. With 5 or 6 DON!! out, that is a 5- or 6-cost body for one DON!!, and the rest of your DON!! still pays for normal plays.",
    "The Leader's cost needs a face-down top Life card. OP11-100 Otohime and OP11-108 Neptune turn it face-down on play (for a draw, or draw 2 and trash 1). OP11-103 Long-Jaw Neptunian and OP11-107 Topknot Neptunian turn it face-down off their own [Activate: Main] (for a K.O. of a 3-cost or less, or to stand Topknot up at end of turn). Use one of these every turn so the Leader can play again next turn.",
    "OP11-030 Shirahoshi rests 1 DON!! and itself to look at 5 and take a {Neptunian} or {Fish-Man Island} card. OP11-036 Spotted Neptunian does the same once on play. They keep the Leader's hand fed.",
    "The {Neptunian} bodies the Leader plays: OP11-036 Spotted Neptunian and OP11-028 Lord of the Coast at 4, OP11-103 Long-Jaw Neptunian and OP11-107 Topknot Neptunian at 5, OP11-026 Scaled Neptunian at 6 and 8000. OP11-112 Megalo is a 3-cost [Blocker] that is 6000 on your opponent's turn.",
    "OP10-030 Smoker sets one of your DON!! active. Activate the Leader first, then Smoker: the DON!! the Leader rested comes back for another play.",
    "Late game is removal: OP11-031 Jinbe rests a 5-cost or less on play, ST16-004 Shanks K.O.s any rested Character, OP11-106 Zeus trades your top or bottom Life card for a K.O. of a 5-cost or less, and OP11-028 Lord of the Coast keeps a rested Character rested through their next turn.",
  ],
  mulligan: [
    "Keep a hand with OP11-030 Shirahoshi or OP11-036 Spotted Neptunian: each finds the {Neptunian} the Leader plays.",
    "A hand with neither leaves the Leader nothing to dig for. Take a new hand.",
  ],
  priorities: [
    "Use the Leader's activation every turn you have a {Neptunian} in hand that it can play. It is the cheapest body you will get.",
    "Before ending a turn with a face-up top Life card, turn it back down with Otohime, Neptune, Long-Jaw or Topknot, or the Leader cannot play next turn.",
    "Play the biggest {Neptunian} the Leader can reach off the Leader, and pay full price for the cards it cannot play: Neptune, Jinbe, Shanks, Smoker and Zeus are not {Neptunian}.",
    "Long-Jaw Neptunian's K.O. needs your top Life card face-up to pay. Activate it after the Leader, when the Leader has just turned that card face-up.",
    "Hold OP11-115 You're Just Not My Type! for a Counter: +4000 behind Shirahoshi for one DON!!.",
    "Shanks K.O.s only a rested Character. Play him after your opponent's best body has attacked, or after Jinbe has rested it.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader: eleven OP-11 cards, OP10-030 Smoker and ST16-004 Shanks, with two Lord of the Coast, two Shanks and two You're Just Not My Type!.",
  ],
  commonCombos: [
    "Leader plays Long-Jaw Neptunian, turning the top Life face-up; Long-Jaw then rests and turns that same card face-down to K.O. a 3-cost or less. One DON!! for a 7000 body and a K.O., and the Leader is ready again next turn.",
    "Leader plays a {Neptunian}, then Smoker sets the rested DON!! active again.",
    "Jinbe rests their best 5-cost or less, then Shanks K.O.s it.",
  ],
  keyCardNumbers: [
    "OP11-022",
    "OP11-030",
    "OP11-036",
    "OP11-100",
    "OP11-103",
    "OP11-107",
    "OP11-108",
    "OP10-030",
  ],
  counterplay: [
    "Their Leader cannot attack, so all their pressure comes from Characters. Removing bodies slows them more than it does most decks.",
    "The Leader's play needs a face-down top Life card. Taking their Life cards is not the only way to stop it, but a face-up top Life card left at the end of their turn means no free play next turn.",
    "OP11-112 Megalo is 6000 on your turn, not 2000. Count it as a 6000 [Blocker] when you plan an attack.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_065.php",
      retrievedAt: "2026-10-12",
      note: "Bandai's feature deck for OP11-022: the fifty; getting OP11-030 Shirahoshi out early to dig for {Neptunian} cards; the Leader's play from four DON!! with Spotted Neptunian; Long-Jaw, Topknot and Neptune turning the Life card back face-down so the Leader can go again; Jinbe and Shanks as removal; Lord of the Coast against Rush and Blocker threats.",
    },
  ],
};
