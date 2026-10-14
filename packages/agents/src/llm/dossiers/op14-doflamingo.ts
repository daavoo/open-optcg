import type { DeckStrategyDossier } from "./types.js";

export const op14DoflamingoDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple) Donquixote Doflamingo - Official Feature Deck",
  archetype:
    "Purple {Donquixote Pirates} control behind OP14-060: a Leader whose [On Your Opponent's Attack] [Once Per Turn] returns 1 DON!! to change the attack's target to your Leader or one of your {Donquixote Pirates} Characters, with a board of [On K.O.] bodies that pay back what the redirect costs.",
  gamePlan: [
    "The Leader's redirect is the deck's defence. Send an attack onto a {Donquixote Pirates} Character whose [On K.O.] you want: OP14-067 Dellinger adds a rested DON!! from your DON!! deck and looks at 5 for a {Donquixote Pirates} card, OP14-074 Monet draws 2, trashes 1 and adds 2 rested DON!!, OP14-072 Baby 5 puts the top card of your deck onto your Life, and OP14-063 Sugar plays a {Donquixote Pirates} Character of cost 5 or less from hand once the opponent has 6 or more DON!! on their field.",
    "Every redirect costs a DON!!, so keep the count up. OP14-063 Sugar, OP14-072 Baby 5 and OP14-074 Monet add an active DON!! when played, OP14-071 Pica adds one at the end of each of your turns, OP10-071 Doflamingo rests one on the opponent's attack to add an active one, and OP14-068 Trebol adds a rested one, once per opponent's turn, when one of your DON!! goes back to the DON!! deck -- which the Leader's own redirect does, so with Trebol on the board the first redirect of each opponent's turn is paid back.",
    "Open with OP14-067 Dellinger, OP10-065 Sugar or OP10-078 to find the rest of the {Donquixote Pirates} pieces. Dellinger is also the best early target for the redirect, since its [On K.O.] adds back a DON!! for the one the Leader spent.",
    "In the middle turns, OP10-071 Doflamingo's [On Play] returns 1 DON!! to play a {Donquixote Pirates} Character of cost 5 or less from hand -- Monet or Pica, whose own DON!! comes back as they land.",
    "OP14-069 Doflamingo is the finisher: DON!! -3 to K.O. an opposing Character of cost 8 or less, or to stop up to 3 opposing Characters of cost 7 or less from resting until the end of the opponent's next End Phase. Fewer opposing attackers means fewer redirects to pay for, which is what the Leader wants.",
  ],
  mulligan: [
    "Keep a 1-cost digger -- OP14-067 Dellinger, OP10-065 Sugar or OP10-078 -- together with a body that adds DON!!: OP14-063 Sugar, OP14-072 Baby 5, OP14-074 Monet or OP14-071 Pica.",
    "A hand without the digger cannot find the pieces, and one without a DON!! body leaves the Leader's redirects with nothing to refill them. Take a new hand.",
  ],
  priorities: [
    "Redirect only an attack that would connect, and only when it lands somewhere better. The best landing is a body with more power than the attack, since the attack then does nothing; next is an [On K.O.] body -- Dellinger, Monet, Baby 5, OP14-063 Sugar -- that pays you back when it falls. Moving an attack onto a body that dies with no [On K.O.] trades a DON!! and a card for one Life. The Leader returns a DON!! each time, and that DON!! is not there on your next turn unless something adds it back.",
    "OP14-061 Vergo can return a DON!! to your DON!! deck instead of losing a {Donquixote Pirates} Character to the opponent's effect. That returned DON!! is what OP14-068 Trebol's add answers on the opponent's turn.",
    "OP14-069's K.O. needs your Leader to have the {Donquixote Pirates} type, which OP14-060 does. Choose the rest lock over the K.O. when the opponent has three or more attackers of cost 7 or less.",
    "OP14-076 Ever White is a +3000 Counter for your Leader, or on your turn it rests 2 DON!! to add 1 rested DON!!. Keep it for the Counter when the opponent is attacking the Leader.",
    "OP10-078 is also a [Counter] Event with no power: it digs mid-battle rather than defending the hit.",
    "When OP14-074 Monet's [On K.O.] trashes a card from your hand, trash a searcher that has done its job -- OP10-078 or OP10-065 Sugar -- never OP14-069 or OP10-071 Doflamingo, and keep OP14-076 Ever White for its +3000.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader: every Character in the fifty is a {Donquixote Pirates}, so every body on your board is a legal redirect target.",
  ],
  commonCombos: [
    "Play OP14-067 Dellinger early; on the opponent's turn, redirect an attack onto it. When it is K.O.'d it adds back the DON!! the Leader spent and finds another {Donquixote Pirates} card.",
    "Play OP10-071 Doflamingo, return 1 DON!! to play OP14-074 Monet from hand; Monet's [On Play] adds that DON!! back active.",
    "Redirect onto OP14-072 Baby 5 late in the game: its [On K.O.] adds a card to your Life, and the Leader's redirect keeps the opposing attack off your Life in the first place.",
  ],
  keyCardNumbers: [
    "OP14-060",
    "OP14-067",
    "OP14-074",
    "OP14-071",
    "OP10-071",
    "OP14-069",
    "OP10-078",
  ],
  counterplay: [
    "The redirect is once per turn. Attack with the smallest body first to draw it out, then send the real attack at the Leader.",
    "Each redirect spends a DON!! the Doflamingo player needs on their own turn. Many small attacks cost them more than one big one.",
    "The [On K.O.] bodies are the payoff. Removing one with an effect that does not K.O. it -- returning it to hand or deck, or resting it -- gives nothing back.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_091.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP14-060: the fifty, the Leader's redirect onto {Donquixote Pirates} Characters with an [On K.O.], OP10-078 and Dellinger in the early game, Monet and Pica replenishing DON!!, OP10-071 Doflamingo playing them in the mid game, and OP14-069 Doflamingo and Baby 5 in the end game.",
    },
  ],
};
