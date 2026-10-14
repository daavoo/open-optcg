import type { DeckStrategyDossier } from "./types.js";

export const op15RebeccaDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Rebecca - Official Feature Deck",
  archetype:
    "Mono-Blue {Dressrosa} tempo behind OP15-039: a Leader that cannot attack, but rests once a turn to bounce one of your {Dressrosa} Characters and play a cost-3 {Dressrosa} Character from hand for free. Cheap bodies that dig when replayed, a wide board of 3-cost attackers, and bounce removal.",
  gamePlan: [
    "The Leader never attacks. Its [Activate: Main] is the deck: rest it and return one of your {Dressrosa} Characters to hand, then play a {Dressrosa} Character of cost exactly 3 from your hand for nothing. A 1-cost cannot be played this way, and neither can the 4-cost OP10-045 Cavendish or the 7-costs -- pay for those with DON!!.",
    "Turn 1: play a 1-cost -- OP15-053 Rebecca or OP15-040 Viola, whose [On Play] looks at three cards and adds a {Dressrosa} card -- then use the Leader to return it and play a 3-cost such as OP15-042 Kyros. You end the turn with a 3-cost on the board and the 1-cost back in hand.",
    "Every later turn: replay the 1-cost you bounced for one DON!! (its [On Play] digs again), then bounce it again with the Leader for another free 3-cost. The 1-costs are the fuel; the twenty 3-costs are the attackers.",
    "Spend the DON!! the free play saved on what the Leader cannot play: OP10-045 Cavendish (draws two and trashes one when it attacks), OP10-046 Kyros (returns a cost-5-or-less Character to its owner's hand), OP15-046 Sabo (a [Blocker] whose [On Play] activates a {Dressrosa} Event from your hand for free) and OP10-060 Barrier-Barrier Pistol (a 6000-power-or-less Character to the bottom of its owner's deck).",
    "To close: OP15-042 Kyros's [On Play] trashes a card from hand to give it [Rush]. After a Kyros has attacked, bounce it with the Leader and replay it for free -- it pays the trash again, takes [Rush] again, and attacks again. OP15-047 Sanji's [On Play] makes one of your Characters [Unblockable] this turn.",
  ],
  mulligan: [
    "Keep a hand with both halves of the turn-one swap: a 1-cost {Dressrosa} Character (OP15-053, OP15-040, OP15-052) and a cost-3 {Dressrosa} Character (OP10-054, OP15-041, OP15-042, OP15-047, OP15-051), or OP10-059, which searches five cards for a {Dressrosa} Character.",
    "A hand missing either half leaves the Leader with nothing to do on the first turns. Take a new hand.",
  ],
  priorities: [
    "Use the Leader every turn you have a {Dressrosa} Character on the board and a cost-3 {Dressrosa} Character in hand. Resting the Leader costs nothing, because it cannot attack.",
    "While the Leader is still unused, play a 1-cost {Dressrosa} Character before a dearer body: it digs on the way in and it is the card the swap returns. Spend DON!! on the 4-cost first and the swap may have nothing to return.",
    "Prefer swapping a 1-cost that is back in hand for one DON!! over replaying an attacked Kyros: the 1-cost swap costs no card, while every Kyros replay trashes one from hand for its [Rush].",
    "Spend Counter cards to save OP15-046 Sabo, OP10-046 Kyros, OP10-045 Cavendish and OP15-051 Luffy, even when it takes more than one card: none of them can come back through the Leader, which only plays a cost-3. Do not spend Counters to save OP15-042 Kyros; it returns to your hand when K.O.'d.",
    "When a search offers OP15-042 Kyros, take it; after that, OP15-053 Rebecca or OP15-040 Viola to keep the swap fed.",
    "When Cavendish or Kyros makes you trash a card, trash OP10-059 or a spare vanilla cost-3 (OP10-054, OP15-041) first, and keep Kyros and the 1-cost diggers.",
    "Do not use OP15-041 Orlumbus's [Activate: Main]: it puts one of your Characters on the bottom of your deck for one 4000 attack.",
    "Bounce the Character worth replaying: a 1-cost digger you can replay for one DON!!, or a Kyros that has already attacked. Do not bounce a 3-cost that has not attacked yet, and do not return the only body you meant to swing with.",
    "Play the 1-cost before you use the Leader, not after: the Leader needs a {Dressrosa} Character on the board to return.",
    "OP15-053 Rebecca has 0 power and gains [Blocker] only with a DON!! given to it. Once it is no longer needed for swaps, give it one DON!! and leave it on the board as a Blocker.",
    "OP15-051 Luffy is 7000 on the opponent's turn: a body worth leaving untapped in front of the Leader, and worth not bouncing.",
    "OP15-052 Leo: when the opponent's effect would remove one of your Characters with 7000 base power or less, you may put one of your Characters on the bottom of your deck instead. A 1-cost you were going to replay is a cheap price.",
    "OP15-041 Orlumbus draws a card when K.O.'d.",
    "OP15-042 Kyros returns to your hand from the trash when it is K.O.'d, so trading it in battle is cheap.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader. Its structure -- twelve 1-cost {Dressrosa} bodies to bounce, twenty cost-3 {Dressrosa} Characters for the Leader to play, and a small top end paid for with DON!! -- follows directly from the Leader's text.",
  ],
  commonCombos: [
    "OP15-053 Rebecca -> Leader returns it -> free OP15-042 Kyros; then replay Rebecca for one DON!! to dig again.",
    "Kyros attacks, then the Leader returns it and replays it for free: trash a card for [Rush] and attack again. Worth it when no 1-cost is there to swap, or when the second attack wins the game.",
    "OP15-046 Sabo activates OP10-060 Barrier-Barrier Pistol from hand for free: a 7-cost body and a removal Event on the same DON!!.",
    "OP15-047 Sanji on a turn the opponent has a [Blocker] up: make your biggest attacker [Unblockable], then swing it at the Leader.",
  ],
  keyCardNumbers: [
    "OP15-039",
    "OP15-053",
    "OP15-040",
    "OP15-042",
    "OP15-047",
    "OP15-051",
    "OP15-046",
    "OP10-060",
  ],
  counterplay: [
    "The Leader never attacks, so every hit comes from a Character. Removing or outsizing the 3-cost attackers starves the clock.",
    "The Leader's swap needs a {Dressrosa} Character already on the board. Clearing its board on your turn leaves it nothing to return next turn.",
    "OP15-051 Luffy is 7000 only on your turn; attack around it or remove it on theirs.",
  ],
  sources: [
    {
      url: "https://onepiece.cardsrealm.com/en-zw/articles/one-piece-tcg-deck-tech-rebecca-op15",
      retrievedAt: "2026-09-26",
      note: "Deck tech for OP15-039: searchers first in the opening (OP15-040, OP15-053), Kyros as the Leader's priority target, and the deck as a midrange tempo list that wins by exhaustion rather than one finisher.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_098.php",
      retrievedAt: "2026-09-26",
      note: "Bandai's feature deck for OP15-039: the fifty, the turn-one Rebecca-for-Kyros swap, replaying an attacked Kyros for a second [Rush] attack, and leaving OP15-053 on the board as a [Blocker] late.",
    },
  ],
};
