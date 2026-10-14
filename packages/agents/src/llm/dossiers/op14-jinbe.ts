import type { DeckStrategyDossier } from "./types.js";

export const op14JinbeDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Jinbe - Official Feature Deck",
  archetype:
    "Blue {Fish-Man} aggro behind OP14-040: a Leader whose [Activate: Main] trashes a card from your hand to give up to 2 rested DON!! to one of your {Fish-Man} or {Merfolk} Leader or Character cards, as often as the hand and the rested DON!! allow, so a board of cheap bodies attacks above its cost.",
  gamePlan: [
    "The Leader's gift moves DON!! that are already rested, so it only has something to give after you have paid for plays this turn. Play your Characters and Events first, then trash cards for the gift.",
    "Each gift costs a card. Give it only to a Leader or Character that still has an attack this turn: DON!! given to a card that has already attacked add nothing until the Refresh Phase takes them back.",
    "A 3000-power 1-cost -- OP14-042 Arlong, OP14-050 Chew, OP14-051 Hatchan -- becomes a 5000 attacker with one gift, which is enough to hit a 5000 Leader. Past the opposing Leader's power by 2000, a further gift only asks for one more Counter card, so stop there.",
    "Trashing a card from your hand with an effect switches three cards on for the rest of the turn: OP14-045 Kuroobi and OP14-049 Jinbe gain [Rush], and OP14-056 Wadatsumi's \"cannot attack\" is negated. Play them, then use the Leader's gift on them the same turn.",
    "The rest of the list refills the hand the Leader spends: Arlong looks at 4 cards for one of cost 2 or more, Chew draws 1, OP14-043 Aladine and OP14-047 Shirahoshi play a 3-cost {Fish-Man} or {Merfolk} from hand, and Aladine, Kuroobi and Hatchan draw when they are K.O.'d.",
    "OP14-054 Fisher Tiger draws 3 cards but trims your hand to 5 at the end of each of your turns. Play it when the Leader's gifts have left your hand low.",
    "OP14-049 Jinbe is the finisher: 8 cost, 10000 power, and its [On Play] rests 2 DON!! to draw 2 and return a Character with a cost of 7 or less to its owner's hand.",
  ],
  mulligan: [
    "Keep a 1-cost {Fish-Man} -- Arlong, Chew or Hatchan -- together with a 3- or 4-cost body (Kuroobi, Wadatsumi, Aladine or Shirahoshi).",
    "A hand missing the 1-cost gives the Leader nothing to hand DON!! to on your second turn. Take a new hand.",
  ],
  priorities: [
    "Pay the Leader's gift with the card least worth keeping: OP14-057 first, then the 1-costs once the opening turns are over, and the 8-cost Jinbe, Fisher Tiger and the OP14-058 Counter Event last.",
    "Do not trash a card for the Leader's gift with no rested DON!! in your cost area: the card is gone and the gift gives nothing.",
    "When your hand is down to Jinbe, Fisher Tiger and OP14-058, spend one on the gift only when it makes an attack that would not otherwise hit the opposing Leader.",
    "OP14-049 Jinbe and OP14-058 can return one of your own Characters. Only ever return an opposing Character, or none.",
    "OP14-046 Koala is not a {Fish-Man} and cannot receive the Leader's gift. Its [Activate: Main] trashes itself to give a {Fish-Man} or {Merfolk} +2000 this turn, and it is a 2000 Counter in hand.",
    "OP14-058 is the deck's only +3000 Counter. On your turn it rests 3 DON!! to play a 3-cost {Fish-Man} from hand and return a Character with 6000 base power.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader: every Character except Koala is a {Fish-Man} or {Merfolk}, so almost every body the deck plays can take the Leader's gift.",
  ],
  commonCombos: [
    "Play a 1-cost {Fish-Man}, then trash a card with the Leader to give it the 2 DON!! that paid for it: a 5000 attacker on turn 2.",
    "Play Kuroobi, then trash a card with the Leader: Kuroobi gains [Rush] off the trash and attacks at 5000 the turn it lands.",
    "Play OP14-049 Jinbe, rest 2 DON!! to draw 2 and return an opposing Blocker, then trash one of the drawn cards with the Leader: Jinbe gains [Rush] and attacks with the 2 DON!! on it.",
  ],
  keyCardNumbers: [
    "OP14-040",
    "OP14-042",
    "OP14-045",
    "OP14-049",
    "OP14-054",
    "OP14-056",
    "OP14-058",
  ],
  counterplay: [
    "Every gift is a card out of the Jinbe player's hand, so a long game runs it out of Counters. Block and Counter the early 5000 hits and let the hand empty.",
    "The deck's attackers are mostly 3000 bodies lifted by DON!! that leave at the Refresh Phase. Removing a 1-cost on your turn costs you less than stopping the 5000 attack it becomes.",
    "Fisher Tiger trims its own controller's hand to 5 at each end of turn, so a big draw turn is followed by a discard.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_089.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP14-040: the fifty, the Leader's discard handing out DON!!, Arlong and Chew keeping the hand up, Aladine playing Kuroobi, Kuroobi's [Rush] off the discard, Fisher Tiger as the refill with its hand limit, OP14-049 Jinbe as the finisher, and Koala as the last push.",
    },
  ],
};
