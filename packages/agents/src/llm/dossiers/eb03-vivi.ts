import type { DeckStrategyDossier } from "./types.js";

export const eb03ViviDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Blue) Nefeltari Vivi - Official Feature Deck",
  archetype:
    "Red/Blue removal midrange behind EB03-001: a Leader that rests to give an opposing Character −2000 and one of your Characters without a [When Attacking] effect [Rush] -- which is every Character in this fifty -- and trashes a card from hand once a turn to keep a base-cost-4-or-more Character from being K.O.'d.",
  gamePlan: [
    "The Leader's [Activate: Main] is the deck: play a Character with an [On Play] first, let the [On Play] resolve, then rest the Leader to give that Character [Rush] and attack with it the same turn. The same activation gives one opposing Character −2000.",
    "[Rush] only matters on a Character played this turn. On a turn with nothing new on the board, attack with the Leader instead of resting it.",
    "The removal bodies are what the Leader rushes: OP06-007 Shanks K.O.s a Character with 10000 power or less, OP09-009 Benn.Beckman trashes one with 6000 power or less, EB03-027 Marguerite returns a Character with 7000 base power to its owner's hand, EB03-025 Hina trashes a card from your hand to return one with 6000 base power, and EB03-026 Boa Hancock makes an opponent with 5 or more cards in hand put one at the bottom of their deck.",
    "EB03-006 Nami's [On Play] draws a card for −5000 on your Leader this turn. That costs nothing on a turn the Leader rests to give Nami [Rush] instead of attacking, which is the turn you should play her.",
    "EB03-024 Vivi is a 5-cost [Blocker] whose [On Play] plays an {Alabasta} or {Straw Hat Crew} Character of cost 5 or less from your hand -- Nami is the best one -- and then stops you playing more Characters this turn. Play your other Characters first.",
    "Early turns: OP13-012 Vivi looks at 4 cards for an {Alabasta} or {Straw Hat Crew} card of cost 2 or more, and OP13-007 Ace & Sabo & Luffy trashes itself and gives a DON!! to shrink a Character by −3000.",
  ],
  mulligan: [
    "Keep an early play -- OP13-012 Vivi, OP13-007 Ace & Sabo & Luffy or OP10-011 Chopper -- together with a Character of cost 5 or more for the Leader to give [Rush] to.",
    "A hand missing either half gives the Leader nothing to do for several turns. Take a new hand.",
  ],
  priorities: [
    "Rest the Leader for its ability only when a Character you played this turn is on the board to take [Rush]. Give the [Rush] to the largest one.",
    "Aim the −2000 at a rested opposing Character your biggest attacker can then beat, since only rested Characters can be attacked; failing that, at an active [Blocker].",
    "Marguerite and Hina can return any Character at their power, yours included. Only ever return an opposing Character, and do not pay Hina's card from hand when no opposing Character has 6000 base power.",
    "When OP13-012 Vivi's search offers them, take EB03-006 Nami first, then EB03-024 Vivi, then OP10-011 Chopper, then OP13-011 Cobra.",
    "When the Leader's replacement or Hina asks you to trash a card from hand, trash OP13-007, OP13-012 or a vanilla body before Shanks, Beckman, Nami, Marguerite or the EB03-011 Counter Event.",
    "The Leader's replacement protects Characters with a base cost of 4 or more once a turn, so a rested removal body that has already attacked is still worth defending.",
    "OP10-011 Chopper is 6000 on the opponent's turn and a [Blocker]: leave it untapped in front of the Leader.",
    "EB03-011 is +4000 Counter only while your Leader is Nefeltari Vivi, which it always is in this deck.",
    "Do not give DON!! to the Leader after it has rested for its ability; it can no longer attack this turn.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader. Every Character in it is chosen to have no [When Attacking] effect, so every body the deck plays can take the Leader's [Rush].",
  ],
  commonCombos: [
    "OP06-007 Shanks K.O.s a Character, then the Leader gives Shanks [Rush] and it attacks for 12000 the same turn.",
    "Leader −2000 on an opposing Character, then OP09-009 Benn.Beckman trashes it if that brought it to 6000 power or less.",
    "EB03-006 Nami draws off the Leader's −5000, then the Leader rests to give Nami [Rush]: a card and a 7000 attack on the turn she lands.",
    "EB03-024 Vivi plays Nami from hand for free, then the Leader gives Nami [Rush] while the Vivi [Blocker] stays back.",
  ],
  keyCardNumbers: [
    "EB03-001",
    "OP13-012",
    "EB03-006",
    "EB03-024",
    "EB03-027",
    "OP09-009",
    "OP06-007",
    "EB03-011",
  ],
  counterplay: [
    "The deck's attacks come from Characters played that turn with [Rush], so each one is a removal effect first. Keep your important bodies at a power or cost its removal cannot reach: above 10000 for Shanks, above 6000 for Beckman, not exactly 6000 or 7000 base power for Hina and Marguerite.",
    "The Leader can save one base-cost-4-or-more Character a turn by trashing a card from hand; a second K.O. in the same turn gets through, and each save costs it a card.",
    "On a turn the Leader rests for its ability it does not attack, so the deck deals less Leader damage than its bodies suggest.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_094.php",
      retrievedAt: "2026-09-27",
      note: "Bandai's feature deck for EB03-001: the fifty, OP13-012 gathering Characters without [When Attacking], EB03-006 Nami's draw paid by a Leader that rests anyway, EB03-024 Vivi playing a second body while holding [Blocker], and [On Play] removal (Shanks) given [Rush] in the end game.",
    },
  ],
};
