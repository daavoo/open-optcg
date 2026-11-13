import type { DeckStrategyDossier } from "./types.js";

export const op17KaidoTcgmmDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple) Kaido - TCG Match Making EB05 2026-11-12 #5",
  archetype:
    "OP-17 Purple Kaido DON!! ramp as the EB-05 field builds it: the King, Queen, Basil Hawkins and Yamato ramp core, two 1-cost searches (OP07-077 and EB05-037 Black Maria) to find King, and a top end of 9-costs -- OP17-061 Lead Performers and OP17-065 Queen -- with four EB04-030 Kaido as the 7-cost swing. No cost-10 body.",
  gamePlan: [
    "Ramp, then out-scale. Turn 2 EB04-032 Queen, OP07-077 or EB05-037 Black Maria; turn 3 a 3-cost ramp body -- OP17-073 Basil Hawkins or OP17-074 Yamato; turn 4-5 EB04-031 King; then a 7- or 9-cost body every turn.",
    "OP07-077 looks at the top five cards and EB05-037 Black Maria at the top three for an {Animal Kingdom Pirates} card. Every body in this deck but Yamato and OP15-069 Nola qualifies, so they are how the deck finds King on curve. Take King whenever it is among them; otherwise take the next card the curve can cast -- Hawkins, Queen, or the 7-cost EB04-030 Kaido.",
    "EB04-031 King is the engine: its [Activate: Main] adds one active and one rested DON!! every turn, and it answers its own K.O. with a DON!!. Only one King works at a time, so a second copy in hand is a card to trash, not a second engine.",
    "EB04-030 Kaido costs 7 and its [On Play] DON!! −2 gives it [Rush] and rests a cost-7-or-less Character, so it attacks the turn it lands. With four copies it is the deck's main swing between King and the 9-costs.",
    "OP17-065 Queen costs 9, has [Banish], and its [On Play] DON!! −1 draws 1 and stops two of the opponent's cost-5-or-less Characters attacking until the end of their next turn. OP17-061 Lead Performers adds a Life card on play for DON!! −1 and can trash itself to play a [King] or [Queen] from hand for free -- including OP17-065 Queen.",
  ],
  mulligan: [
    "Keep a hand with a cheap ramp piece in it: EB04-032 Queen, OP17-073 Basil Hawkins, OP17-074 Yamato or OP17-075 X.Drake. A search alone -- OP07-077 or EB05-037 Black Maria -- is not enough; a hand whose only early play is a search has not found its ramp yet.",
    "A hand of two or more 9-cost bodies and no early play is the deck's brick; take a new seven.",
  ],
  priorities: [
    "Being raced is the loss condition. Count the opponent's attackers against your Life before spending a turn on DON!!; once they can take the rest of your Life next turn, spend the turn on bodies and [Blocker]s.",
    "DON!! −N returns DON!! to the DON!! deck rather than resting them, so every such cost takes DON!! off the field of a deck whose plan is the field's DON!! count. Pay one out of your own plan only if the field still reaches six DON!! next turn.",
    "Do not cast OP15-078 Mamaragan in the Main phase on a field that will be below six DON!! next turn. Two DON!! off the field for a card and a rest is a turn of ramp; held, the same card is a +1000 Counter that draws while you have six or fewer DON!!, which is exactly the field you were about to spend.",
    "OP15-069 Nola lets you return a DON!! instead of losing a Character of 7000 base power or less to the opponent's effect. Keep it on the field in front of King and EB04-030 Kaido.",
    "The Leader's DON!! −1 gives an opposing Character −2000 on either player's attack, once per turn. Spend it when the 2000 decides the battle in front of it and the field still reaches six DON!! next turn.",
    "Count Counter before calling a turn defensible: OP17-076 is +3000 for a card from hand, EB04-040 Flame Dragon Torch is +4000 on the Leader for DON!! −1, and the 1- and 2-costs print 1000 or 2000. The 7- and 9-cost bodies print none; pay a hand cost with one of them before a card that Counters.",
    "OP17-061 Lead Performers is late-game value, not a way to reach King early: its free play is for the second King or the 9-cost Queen once the 9 DON!! are there.",
  ],
  commonVariants: [
    'The OP-17 tournament field\'s Kaido lists ("(Purple) Kaido - Open OPTCG", now a training list) play four OP17-062 and three OP17-063 Kaido and three ST34-004 Charlotte Linlin as cost-10 finishers, OP08-074 Black Maria and OP08-077 Conquest of the Sea, where this list runs the 9-costs, Nola, X.Drake and EB05-037 Black Maria.',
    "Bandai's feature deck under the same Leader cuts the search and the off-set cards for four OP17-060 Ulti & Page One, four OP17-068 Sasaki, three OP17-069 Jack and two OP17-078 Drunken Dragon Bagua. Against it expect more cost-9 bodies and X.Drake's discard, and no search.",
  ],
  commonCombos: [
    "Turn 2 OP07-077 or Black Maria into King, King on turn 4-5, then EB04-030 Kaido with [Rush]: the searches are what make the curve reliable.",
    "OP17-061 Lead Performers adds a Life card, then trashes itself to play OP17-065 Queen from hand for free: a 9-cost and its [On Play] without paying for it.",
    "EB04-030 Kaido rests their best cost-7-or-less body on play, then attacks with [Rush].",
  ],
  keyCardNumbers: [
    "OP17-058",
    "EB04-031",
    "EB04-032",
    "OP07-077",
    "EB05-037",
    "EB04-030",
    "OP17-065",
    "OP17-061",
    "OP15-078",
  ],
  counterplay: [
    "Race it: the deck spends its first five turns on DON!!, and every published assessment names a fast aggro start as its worst matchup.",
    "Answer King rather than the big bodies; it is what buys the extra turns, and it can cancel only one K.O. per DON!! it can return.",
    "OP17-065 Queen stops two cost-5-or-less attackers for a turn: keep a bigger attacker for the turn after it lands.",
  ],
  sources: [
    {
      url: "https://www.patreon.com/tcgmatchmaking",
      retrievedAt: "2026-11-12",
      note: "TCG Match Making's EB05 Weekly Power Rankings of 12 Nov 2026: this fifty is its #5 list, described there as a good matchup spread with a payoff ceiling high enough that a slow start is not fatal.",
    },
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-09-25",
      note: "OP-17 tournament deck lists: the OP17-058 entries are the source of the first variants line.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_110.php",
      retrievedAt: "2026-09-01",
      note: "Bandai's '(Purple) Kaido - Recommended Deck': the other list under this Leader, and the source of the ramp plan the two share.",
    },
    {
      url: "https://opdeckguide.com/deck-guides/kaido-op17/",
      retrievedAt: "2026-08-26",
      note: "Curve and weakness list for OP17-058: 'highly dependent on playing 6c King exactly on curve', which is the job the two searches do in this list.",
    },
  ],
};
