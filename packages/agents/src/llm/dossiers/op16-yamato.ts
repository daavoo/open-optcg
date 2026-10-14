import type { DeckStrategyDossier } from "./types.js";

export const op16YamatoDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Black) Yamato - Official Feature Deck",
  archetype:
    "Black {Land of Wano} trash recursion behind OP16-079: a Leader that gives every {Land of Wano} Character played from your trash [Rush] for the turn, so the deck fills its trash early and plays 8-cost bodies back out of it that attack the turn they land.",
  gamePlan: [
    "Early turns fill the trash. OP16-091 Nami looks at 4 and OP16-082 Kin'emon looks at 5 for a {Land of Wano} card, and both trash everything else they looked at. OP16-092 Nico Robin trashes a Character of cost 8 or more from your hand to draw 2 -- pitch an 8-cost Yamato with it, because that is where you want it.",
    "Hold OP16-098, the 6-cost Yamato, until an 8-cost Yamato is in the trash. Its [On Play] draws 1 and trashes 1, which is another way to put an 8-cost there.",
    "OP16-098's [Activate: Main] trashes itself to play a black 8-cost [Yamato] from your trash, and the one it plays has [Rush] from the Leader. Its cost is only trashing itself, so attack with the 6-cost first, then swap it and attack again with the 8-cost.",
    "OP16-096 is the [Unblockable] 8-cost, and its [On K.O.] plays a [Yamato] of cost 6 or less from your trash -- usually the OP16-098 you swapped away, which can swap again next turn. OP16-097's [On Play] adds a {Land of Wano} Character of cost 6 or less from your trash to your hand, then plays a Character of cost 2 or less from your hand.",
    "The late game is the two Momonosuke. OP16-087 Shinobu trashes itself to draw 1 and give an OP16-084 Momonosuke +20 cost for the turn. With 9 or more DON!! on your field, OP16-084 then trashes itself to play the 9-cost OP16-085 from your trash, and OP16-085's [On Play] plays one more {Land of Wano} Character of cost 6 or less from your trash. Both arrive with [Rush].",
    "OP16-099's [Main] rests 6 DON!! to trash the top 5 of your deck and play a {Land of Wano} Character of cost 6 or less from your trash, which also gets [Rush]. A card it just milled is already a legal target.",
  ],
  mulligan: [
    "Keep a hand with OP16-091 Nami, OP16-092 Nico Robin, OP16-082 Kin'emon or OP16-098 Yamato. Every payoff in the deck plays a card back out of the trash, and these are the cards that put one there.",
    "An 8-cost Yamato in the opening hand is not dead: Nico Robin and OP16-098 both trash it, which is where it is played from.",
  ],
  priorities: [
    "Only Characters played from the trash get [Rush]. An 8-cost Yamato cast from your hand does not, so prefer trashing it and playing it back.",
    "Attack with a body before you trash it for its swap: OP16-098 and OP16-084 pay their cost by trashing themselves, not by resting, so a rested one still pays it.",
    "Kin'emon is a 4-cost in your hand and your trash, and costs 7 only on the field. The +3 keeps it out of cost-6 removal; OP16-097 and OP16-099 can still reach it in the trash.",
    "OP16-094 Portgas.D.Ace's [On K.O.] makes your opponent trash 2 cards from hand, and its [Activate: Main] gives a rested DON!! to a {Land of Wano} Leader or Character once a turn. Give it to the body about to attack.",
    "OP16-095 Monkey.D.Luffy's [On Play] makes a black {Land of Wano} Character [Unblockable] for the turn. Play it on the turn a big Yamato attacks.",
    "OP16-099 is also a +3000 [Counter] for your Leader. Keep one in hand when the trash already has what you need.",
    "Two OP16-088 Shimotsuki Ushimaru and OP16-085 Momonosuke are the deck's only [Blocker]s.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader: fifty cards, all from OP-16, every Character {Land of Wano}.",
  ],
  commonCombos: [
    "OP16-092 Nico Robin pitches an 8-cost Yamato from hand; next turn OP16-098 attacks, trashes itself, and plays that Yamato with [Rush] for a second attack.",
    "OP16-087 Shinobu gives OP16-084 Momonosuke +20 cost; at 9 DON!! OP16-084 trashes itself for OP16-085 from the trash, which plays OP16-098 from the trash -- two [Rush] attackers, and OP16-098 can swap again for an 8-cost.",
    "OP16-096 is K.O.'d and plays OP16-098 back from the trash; OP16-098 then swaps itself for an 8-cost Yamato on your turn.",
  ],
  keyCardNumbers: [
    "OP16-079",
    "OP16-082",
    "OP16-084",
    "OP16-085",
    "OP16-091",
    "OP16-092",
    "OP16-096",
    "OP16-097",
    "OP16-098",
    "OP16-099",
  ],
  counterplay: [
    "The deck's engine is its own trash. An effect that removes cards from their trash, or a fast race before the 8-cost bodies are in it, takes the Leader's [Rush] away.",
    "OP16-098 on the board is the swap waiting to happen. Removing it before their turn removes the extra attack.",
    "OP16-096 comes back as a 6-cost when it is K.O.'d; returning it to hand or deck does not trigger that.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_106.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP16-079: the fifty; Nami and Nico Robin filling the trash early; OP16-098 swapped for an 8-cost Yamato with [Rush] in the mid game; Shinobu and OP16-084 into OP16-085 in the end game. The page's prose names OP16-096 and OP16-097 the other way round from their printed text; the gamePlan follows the cards.",
    },
  ],
};
