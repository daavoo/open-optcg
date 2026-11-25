import type { DeckStrategyDossier } from "./types.js";

export const op15RebeccaTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Rebecca - 1st Place Store Battle 2026-04-04",
  archetype:
    "Mono-Blue {Dressrosa} bounce tempo behind OP15-039, as a Store Battle winner builds it: a Leader that cannot attack but rests once a turn to return one of your {Dressrosa} Characters and play a cost-3 {Dressrosa} Character from hand for free, cheap diggers to feed it, and a top end of off-type bounce -- OP07-051 Boa Hancock, OP14-049 Jinbe and OP08-047 Jozu -- that returns the opponent's board to hand or the bottom of their deck while OP08-046 Shakuyaku trims their hand.",
  gamePlan: [
    "The Leader never attacks. Its [Activate: Main] is the deck: rest it and return one of your {Dressrosa} Characters to hand, then play a {Dressrosa} Character of cost exactly 3 from your hand for nothing -- OP10-054 Blue Gilly, OP15-042 Kyros, OP15-047 Sanji or OP15-051 Luffy.",
    "Turn 1: play a 1-cost -- OP15-053 Rebecca or OP15-040 Viola, whose [On Play] looks at three cards and adds a {Dressrosa} card -- then use the Leader to return it and play a 3-cost such as Kyros. You end the turn with a 3-cost on the board and the 1-cost back in hand.",
    "Every later turn: replay the 1-cost you bounced for one DON!! (its [On Play] digs again), then bounce it again with the Leader for another free 3-cost. The 1-costs are the fuel; the 3-costs are the attackers.",
    "Spend the DON!! the free play saved on the top end. OP07-051 Boa Hancock stops an opposing Character other than [Monkey.D.Luffy] from attacking through their next turn and puts a Character of cost 1 or less on the bottom of its owner's deck. OP14-049 Jinbe rests 2 DON!! to draw 2 and return a Character of cost 7 or less to its owner's hand. OP08-047 Jozu returns one of your Characters to hand to return an opposing one of cost 6 or less.",
    "OP08-046 Shakuyaku, on your turn, once per turn: when a Character leaves the field to your effect while the opponent holds 5 or more cards, they put a card from hand on the bottom of their deck. Every Leader swap and every bounce counts, so play it before the turn's swaps.",
    "To close: OP15-042 Kyros's [On Play] trashes a card from hand to give it [Rush]. OP14-049 Jinbe gains [Rush] for the turn when a card is trashed from your hand by an effect: play Jinbe first, then attack with OP10-045 Cavendish, whose [When Attacking] draws 2 and trashes 1. OP15-047 Sanji's [On Play] makes one of your Characters [Unblockable] this turn.",
  ],
  mulligan: [
    "Keep a hand with both halves of the turn-one swap: a 1-cost {Dressrosa} Character (OP15-053, OP15-040, OP15-052) and a cost-3 {Dressrosa} Character (OP10-054, OP15-042, OP15-047, OP15-051), or OP10-059, which searches five cards for a {Dressrosa} Character.",
    "A hand missing either half leaves the Leader with nothing to do on the first turns. Take a new hand.",
  ],
  priorities: [
    "Use the Leader every turn you have a {Dressrosa} Character on the board and a cost-3 {Dressrosa} Character in hand. Resting the Leader costs nothing, because it cannot attack.",
    "The Leader returns only {Dressrosa} Characters. Hancock, Jinbe, Jozu and Shakuyaku are not, so the Leader cannot bounce them; Jozu's own [On Play] can return one of your Characters, Dressrosa or not.",
    "Jozu's cost is a Character of yours returned to hand: return a 1-cost digger you will replay for one DON!!, so its [On Play] digs again.",
    "Play the 1-cost before you use the Leader, not after: the Leader needs a {Dressrosa} Character on the board to return.",
    "Prefer swapping a 1-cost that is back in hand for one DON!! over replaying an attacked Kyros: the 1-cost swap costs no card, while every Kyros replay trashes one from hand for its [Rush].",
    "When Cavendish or Kyros makes you trash a card, trash OP10-059 or a spare Blue Gilly first, and keep Kyros, the 1-cost diggers and the top end.",
    "OP10-049 Sabo, when one of your other Characters of base cost 7 or less would leave the field to the opponent's effect, returns itself to hand instead: keep it out in front of Hancock and Cavendish, and replay it.",
    "OP15-053 Rebecca has 0 power and gains [Blocker] only with a DON!! given to it. Once it is no longer needed for swaps, give it one DON!! and leave it on the board as a Blocker.",
    "OP15-051 Luffy is 7000 on the opponent's turn: a body worth leaving untapped in front of the Leader, and worth not bouncing.",
    "OP15-052 Leo: when the opponent's effect would remove one of your Characters with 7000 base power or less, you may put one of your Characters on the bottom of your deck instead. A 1-cost you were going to replay is a cheap price.",
    "OP15-042 Kyros returns to your hand from the trash when it is K.O.'d, so trading it in battle is cheap.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader stays all {Dressrosa}: four OP15-041 Orlumbus, two OP10-046 Kyros and four OP15-046 Sabo, four Barrier-Barrier Pistol and four OP15-051 Luffy. This list cuts Orlumbus, OP10-046 and OP15-046 for the off-type top end -- four Boa Hancock and four Jinbe, two Jozu, two Shakuyaku -- and OP10-049 Sabo, and halves the Pistols and the Luffys.",
  ],
  commonCombos: [
    "OP15-053 Rebecca -> Leader returns it -> free OP15-042 Kyros; then replay Rebecca for one DON!! to dig again.",
    "Shakuyaku out, the Leader returns a 1-cost, Jozu returns another of yours and an opposing Character: one card off their hand to the bottom of their deck, while they hold 5 or more.",
    "Jinbe lands, draws 2 and returns their Character; Cavendish attacks, draws 2 and trashes 1, and Jinbe gains [Rush] and attacks at 10000 the turn it lands.",
    "OP07-051 Boa Hancock locks their best attacker and sends a cost-1 Character to the bottom of the deck.",
  ],
  keyCardNumbers: [
    "OP15-039",
    "OP15-053",
    "OP15-040",
    "OP15-042",
    "OP15-047",
    "OP07-051",
    "OP14-049",
    "OP08-047",
    "OP08-046",
  ],
  counterplay: [
    "The Leader never attacks, so every hit comes from a Character. Removing or outsizing the 3-cost attackers starves the clock.",
    "The Leader's swap needs a {Dressrosa} Character already on the board. Clearing its board on your turn leaves it nothing to return next turn.",
    "Their removal returns your Characters to hand or the deck bottom rather than K.O.ing them, and Shakuyaku taxes a full hand: keep your hand under 5 on their turn when Shakuyaku is out.",
    "OP15-051 Luffy is 7000 only on your turn; attack around it or remove it on theirs.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op15-eb04-deck-list-adventure-on-kamis-island/",
      retrievedAt: "2026-11-25",
      note: 'The deck\'s own 50: the list "Aserty" took to 1st (5-0) at a Store Battle at Canon Cosmo, Europe, on 4 Apr 2026 (entry "Blue Rebecca").',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_098.php",
      retrievedAt: "2026-09-26",
      note: "Bandai's feature deck for OP15-039: the turn-one Rebecca-for-Kyros swap, replaying an attacked Kyros for a second [Rush] attack, and leaving OP15-053 on the board as a [Blocker] late; the source of the variants line.",
    },
    {
      url: "https://onepiece.cardsrealm.com/en-zw/articles/one-piece-tcg-deck-tech-rebecca-op15",
      retrievedAt: "2026-09-26",
      note: "Deck tech for OP15-039: searchers first in the opening (OP15-040, OP15-053), Kyros as the Leader's priority target, and the deck as a midrange tempo list that wins by exhaustion rather than one finisher.",
    },
  ],
};
