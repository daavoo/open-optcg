import type { DeckStrategyDossier } from "./types.js";

export const op13RogerDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Purple) Gol.D.Roger - Official Feature Deck",
  archetype:
    "Red/Purple {Roger Pirates} DON!! ramp behind OP13-003: a 5-Life Leader that is a 5000 until your field holds ten DON!!, so the deck adds DON!! from the DON!! deck every turn it can and lands the 10-cost OP13-064 Gol.D.Roger at ten.",
  gamePlan: [
    "From your second DON!! Phase on, while you already have DON!! on the field, one of the DON!! that phase places goes onto your Leader instead of into your cost area. Plan each turn with one DON!! fewer to spend than you placed.",
    "That given DON!! is what most of the deck checks. OP13-061 Inuarashi, OP13-062 Crocus, OP13-063 Kouzuki Oden, OP13-066 Silvers Rayleigh and OP13-075's [Main] each add a DON!! only while you have a DON!! given to your Leader or a Character.",
    "Ramp early with OP13-072 Buggy and OP13-075 (both need a given DON!!), and OP13-068 Douglas Bullet, which only needs your {Roger Pirates} Leader. Crocus adds its DON!! active, so it pays for something else the same turn; the rest add it rested.",
    "Mid game, build a board with the 5-cost Crocus and Kouzuki Oden, and the 6-cost OP13-067 Scopper Gaban, which draws 2, trashes 1 and adds a DON!!.",
    "At ten DON!!, play OP13-064 Gol.D.Roger. Its [On Play] returns 3 DON!! to give your Leader +2000 and every opposing Character -2000 until the end of your opponent's next turn. While it is on your field your Leader's own effects are negated, so the -2000 below ten DON!! and the DON!! given in the DON!! Phase both stop, and the Leader is a 9000 through the opponent's turn.",
    "The turn after OP13-064, play OP13-066 Silvers Rayleigh: it has [Rush], rests an opposing Character with a cost of 5 or less, and adds a DON!! active at the end of your turn -- back towards ten for the next OP13-064.",
  ],
  mulligan: [
    "Keep a hand with OP13-072 Buggy, OP13-068 Douglas Bullet, OP13-061 Inuarashi, OP13-075 or OP13-065 Shanks. Those are the cards cheap enough to add a DON!! before turn 5, and Shanks finds a {Roger Pirates} card from the top 5.",
    "OP13-064 and OP13-066 in the opening hand are late cards, not dead ones: keep them if the hand can ramp.",
  ],
  priorities: [
    "Give a DON!! to your Leader or a Character before playing a card whose ramp needs one. The Leader supplies one each DON!! Phase once your field has DON!!, but on the turn you go second the first phase gives none.",
    'OP13-064\'s negation reaches your Leader and every Character of yours whose type does not include "Roger Pirates". Every Character in this fifty has the type, so only the Leader is switched off -- which is the point.',
    "OP13-071 Nekomamushi K.O.s a Character with 3000 base power or less only while your field has 8 or more DON!!; play it after the ramp, not before.",
    "OP13-062 Crocus's [When Attacking] returns an opposing Character with a base power of 3000 or less to its owner's hand. Attack with it into a board that has one.",
    "OP13-076 Divine Departure rests 5 DON!! for -8000 on an opposing Character while you have a DON!! given, and is a +3000 [Counter] for a card from your hand. OP13-075's [Counter] is +3000 on your Leader for its own 1 DON!!.",
    "OP13-060 Amatsuki Toki trashes herself when your opponent's effect would K.O. another {Roger Pirates} Character of yours. Keep her beside the bodies you most want to keep.",
    "OP13-063 Kouzuki Oden is the deck's only [Blocker].",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader: fifty cards, all from OP-13, every Character {Roger Pirates}.",
  ],
  commonCombos: [
    "Buggy or OP13-075 with a DON!! on the Leader: one more DON!! each, so the ten arrives a turn or two early.",
    "OP13-064 at ten DON!!, then OP13-066 Rayleigh the next turn: Rayleigh attacks at once and adds the DON!! back at the end of the turn, so the next OP13-064 is in reach again.",
  ],
  keyCardNumbers: [
    "OP13-003",
    "OP13-064",
    "OP13-066",
    "OP13-062",
    "OP13-067",
    "OP13-072",
    "OP13-075",
    "OP13-076",
  ],
  counterplay: [
    "The deck is slow until ten DON!!, and its Leader is a 5000 until then. Pressure early, before OP13-064 lands.",
    "Most of its ramp needs a DON!! given. Their Leader carries one from their second DON!! Phase, so the gate is rarely off -- but a turn where it is costs them the ramp.",
    "OP13-064's -2000 lasts through your next turn; small bodies played after it resolves are not shrunk by it.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_083.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP13-003: the fifty; Buggy and OP13-075 ramping early; the DON!! given to the Leader in the DON!! Phase and what it leaves to spend; Crocus, Kouzuki Oden and Scopper Gaban in the mid game; OP13-064 at ten DON!! switching off the Leader's -2000, then OP13-066 Rayleigh the turn after.",
    },
  ],
};
