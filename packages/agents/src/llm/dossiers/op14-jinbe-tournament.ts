import type { DeckStrategyDossier } from "./types.js";

export const op14JinbeTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Jinbe - 11th Place ChinoizeCup #120",
  archetype:
    "Blue OP14-040 Jinbe as a Seven Warlords bounce deck: the Leader is both {Fish-Man} and {The Seven Warlords of the Sea}, so OP07-045 Jinbe, ST17-002 Trafalgar Law and ST17-004 Boa Hancock all work under it, and Jozu, Law, Gloriosa and OP14-049 Jinbe return or bottom the opponent's board while the Leader's discard hands DON!! to the {Fish-Man} attackers.",
  gamePlan: [
    "The Leader's [Activate: Main] trashes a card from your hand to give up to 2 rested DON!! to one of your {Fish-Man} or {Merfolk} Leader or Character cards. It moves DON!! already rested, so play the turn's cards first, then gift to a card that still has an attack.",
    "The {Fish-Man} bodies here are OP07-045 Jinbe, OP14-042 Arlong, OP14-050 Chew, OP14-056 Wadatsumi, OP14-049 Jinbe and OP17-053 Barbell, plus the Leader itself.",
    "OP07-045 Jinbe plays a {The Seven Warlords of the Sea} Character costing 4 or less other than [Jinbe] from your hand: ST17-002 Trafalgar Law or ST17-004 Boa Hancock. That is two bodies for 4 DON!!.",
    "Clear the way with bounce and bottom-deck. ST17-002 Law returns one of your Characters to return an opposing cost 4 or less (the Leader has the Warlords type); OP08-047 Jozu returns one of yours to return a cost 6 or less; OP17-046 Gloriosa is a [Blocker] that puts a cost 5 or less at the bottom of its owner's deck; OP06-058 places two cost 6 or less at the bottom; OP14-049 Jinbe rests 2 DON!! to draw 2 and return a cost 7 or less.",
    "Trashing a card from your hand by an effect -- the Leader's gift or OP17-053 Barbell's activation -- gives OP14-049 Jinbe [Rush] and negates Wadatsumi's \"cannot attack\" for the turn.",
    "OP13-043 Otama draws 2 and trashes 1 at 3 or less Life, and Arlong (look at 4 for a card costing 2 or more) and Chew (draw 1) refill the hand the Leader spends.",
  ],
  mulligan: [
    "Keep a 1-cost {Fish-Man} -- Arlong or Chew -- with OP07-045 Jinbe or a 4-cost Warlord, so turn 2 has a body for the Leader's gift.",
    "A hand of 5- to 8-costs with nothing under 4 takes a new hand.",
  ],
  priorities: [
    "Law and Jozu return one of your own Characters as their cost. Return a spent 1-cost whose [On Play] you can replay -- Arlong or Chew -- or OP07-045 Jinbe to replay its Warlord play, never a body worth more.",
    "OP08-047 Jozu and ST17-002 Law return to the owner's hand; Gloriosa, OP06-058 and its [Trigger] go to the bottom of the deck, which the opponent does not get back. Point the bottom-deck at the card they would replay.",
    "OP17-049 Charlotte Linlin's [On Play] lets your opponent choose: they draw 2, or they trash 2. Play it when their hand is small enough that either choice costs them.",
    "Linlin's [On Your Opponent's Attack], once per turn, trashes a card for +1000 to your Leader or a Character in that battle: treat it as a Counter that costs a card.",
    "OP14-046 Koala is not a {Fish-Man}; it trashes itself to give a {Fish-Man} +2000 this turn, and it is a 2000 Counter in hand. OP13-043 Otama is a 2000 Counter too.",
    "OP07-057 Perfume Femur gives a Warlord Leader or Character +2000 this turn and stops [Blocker] when it attacks: put it on the Leader, or on OP14-049 Jinbe, for the hit that must land.",
    "ST17-004 Boa Hancock is a [Blocker] that arranges the top 3 of your deck and gives a rested DON!! to a Warlord -- the Leader or a Jinbe.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader is all OP-14 {Fish-Man}: OP14-043 Aladine, OP14-045 Kuroobi, OP14-047 Shirahoshi, OP14-051 Hatchan, OP14-054 Fisher Tiger, OP14-055 The Macro Gang and the OP14-057 and OP14-058 Events. This list swaps them for the Seven Warlords package (OP07-045 Jinbe, ST17 Law and Hancock, Perfume Femur), Jozu, Otama, Gloriosa, the Rocks Pirates Linlin and Barbell, and OP06-058.",
  ],
  commonCombos: [
    "OP07-045 Jinbe plays Law from hand; Law returns Arlong to bounce an opposing cost 4 or less; replay Arlong to search.",
    "OP14-049 Jinbe draws 2 and returns their best Character, then the Leader trashes one of the drawn cards: Jinbe gains [Rush] and attacks with 2 DON!! on it.",
    "Gloriosa or OP06-058 on the body they built the turn around: it is gone to the bottom of their deck.",
  ],
  keyCardNumbers: [
    "OP14-040",
    "OP07-045",
    "ST17-002",
    "ST17-004",
    "OP08-047",
    "OP14-049",
    "OP17-046",
    "OP14-042",
  ],
  counterplay: [
    "Every Leader gift is a card from the Jinbe player's hand. Make them pay for it, and the long game leaves them short of Counters.",
    "Their removal returns and bottom-decks; cheap Characters with strong [On Play]s lose little to a bounce. Lean on those rather than one expensive body.",
    "Gloriosa and Hancock are their [Blocker]s; clear or outsize them before the lethal turn.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6abcff56783097f8dcb74097/standings",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "dercan" took to 11th of 63 (4-2) at [EGB] ChinoizeCup #120, an online event on Wednesday 7 Oct 2026.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_089.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP14-040, the source of the variants line.",
    },
  ],
};
