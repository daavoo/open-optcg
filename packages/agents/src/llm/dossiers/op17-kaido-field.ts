import type { DeckStrategyDossier } from "./types.js";

export const op17KaidoFieldDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple) Kaido - Open OPTCG",
  archetype:
    "OP-17 Purple Kaido DON!! ramp as the tournament field builds it: the same King, Queen, Basil Hawkins and Yamato ramp core as Bandai's list, a 1-cost search to find King, three cost-10 finishers, and removal Events paid for with DON!! −N costs that OP17-062 Kaido refunds.",
  gamePlan: [
    "Ramp, then out-scale. Turn 2 EB04-032 Queen or OP07-077; turn 3 a 3-cost ramp body -- OP17-073 Basil Hawkins or OP17-074 Yamato; turn 4-5 EB04-031 King; from about turn 6 you are at 10 DON!! and cast a cost-10 body every turn.",
    "OP07-077 looks at the top five cards for an {Animal Kingdom Pirates} or {Big Mom Pirates} card. Every body in this deck but Yamato qualifies, so it is how the deck finds King on curve. Take King whenever it is among the five; otherwise take the next card the curve can cast -- Hawkins, Queen, or the 7-cost EB04-030 Kaido -- before a cost-10 body, which the deck draws into on its own.",
    "EB04-031 King is the engine: its [Activate: Main] adds one active and one rested DON!! every turn, and it answers its own K.O. with a DON!!. Only one King works at a time, so a second copy in hand is a card to trash, not a second engine.",
    "At 10 DON!! pick the finisher the board asks for. OP17-062 Kaido is the default -- a 12000 [Blocker] that refunds a DON!! every time one returns to your DON!! deck, which makes every DON!! −N cost after it close to free. OP17-063 Kaido negates and K.O.s a cost-6-or-less Character the turn it lands. ST34-004 Charlotte Linlin pays DON!! −4 and trashes a card to add the top of your deck to your Life and set an opposing Character's base power to 0 for the turn -- cast it when the Life card matters or when that 0 opens an attack.",
    "EB04-030 Kaido costs 7 and its [On Play] DON!! −2 gives it [Rush] and rests a cost-7-or-less Character, so it attacks the turn it lands. It is the deck's mid-game swing between King and the cost-10 turn.",
  ],
  mulligan: [
    "Keep a hand with a cheap ramp piece in it: EB04-032 Queen, OP17-073 Basil Hawkins, OP17-074 Yamato or OP17-075 X.Drake. OP07-077 alone is not enough -- it looks at five cards for one, and a hand whose only early play is the search has not found its ramp yet.",
    "A hand of two or more cost-9-or-10 bodies and no early play is the deck's brick; take a new seven.",
  ],
  priorities: [
    "Being raced is the loss condition. Count the opponent's attackers against your Life before spending a turn on DON!!; once they can take the rest of your Life next turn, spend the turn on bodies and [Blocker]s.",
    "DON!! −N returns DON!! to the DON!! deck rather than resting them, so every such cost takes DON!! off the field of a deck whose plan is the field's DON!! count. Pay one out of your own plan only if the field still reaches six DON!! next turn -- or while OP17-062 Kaido is on the board, which hands one back.",
    "Do not cast OP15-078 Mamaragan in the Main phase on a field that will be below six DON!! next turn. Two DON!! off the field for a card and a rest is a turn of ramp; held, the same card is a +1000 Counter that draws while you have six or fewer DON!!, which is exactly the field you were about to spend.",
    "OP08-074 Black Maria's [Activate: Main] adds five rested DON!!, and at the end of the turn returns DON!! until your field matches the opponent's. Activate it only when you are level with or behind the opponent's DON!! count: then its five DON!! pay the turn's DON!! −N costs for free. From ahead it throws your lead back into the DON!! deck.",
    "OP08-077 Conquest of the Sea K.O.s two cost-6-or-less Characters for six DON!! and DON!! −2. That is the whole turn; a cost-9-or-10 body is usually the better use of it, and Conquest is for the turn two bodies have to go at once.",
    "The Leader's DON!! −1 gives an opposing Character −2000 on either player's attack, once per turn. Spend it when the 2000 decides the battle in front of it and the field still reaches six DON!! next turn.",
    "Count Counter before calling a turn defensible. OP07-076 Slow-Slow Beam Sword is +2000 and a rest for DON!! −1, OP17-076 is +3000 for a card from hand, and OP17-063 in play gives every Counter-less Character in hand a +1000 Counter. The cost-10 bodies print no Counter; pay a hand cost with one of them before a card that Counters.",
    "OP17-061 Lead Performers costs 9: a Life card on its [On Play] for DON!! −1, and an [Activate: Main] that trashes it to play a [King] or [Queen] from hand for free. It is late-game value, not a way to reach King early.",
  ],
  commonVariants: [
    "This is the list nearest the average of the OP-17 tournament field's Kaido lists: across them the King, Queen, Hawkins, Yamato, OP17-062 and OP07-077 counts are fixed at four, ST34-004 at three, and OP07-076 and OP15-078 at three or four. The flex is two to four slots among OP17-065 Queen, EB04-030 Kaido, OP13-076 Divine Departure, OP08-074 Black Maria and OP17-077 Kundali Dragon Swarm.",
    "Bandai's feature deck under the same Leader cuts the search and the off-set cards for four OP17-060 Ulti & Page One, four OP17-068 Sasaki, three OP17-069 Jack and two OP17-078 Drunken Dragon Bagua. Against it expect more cost-9 bodies and X.Drake's discard, and no search.",
  ],
  commonCombos: [
    "Turn 2 OP07-077 into King, King on turn 4-5, cost-10 bodies from turn 6: the search is what makes the curve reliable.",
    "OP17-062 Kaido plus any DON!! −N cost: the refund pays for it once per turn, so Mamaragan, EB04-030's [Rush] and the Leader's debuff are close to free while it is out.",
    "Black Maria from level or behind, then the turn's DON!! −N costs paid out of its five rested DON!!, which were going back at the end of the turn anyway.",
    "ST34-004 Charlotte Linlin sets an opposing Character's base power to 0 for the turn, so any attacker K.O.s it the same turn.",
  ],
  keyCardNumbers: [
    "OP17-058",
    "EB04-031",
    "EB04-032",
    "OP07-077",
    "OP17-062",
    "ST34-004",
    "OP17-063",
    "OP08-074",
    "OP15-078",
  ],
  counterplay: [
    "Race it: the deck spends its first five turns on DON!!, and every published assessment names a fast aggro start as its worst matchup.",
    "Answer King rather than the cost-10 bodies; it is what buys the extra turns, and it can cancel only one K.O. per DON!! it can return.",
    "Keep your own DON!! count low when Black Maria is on the board: the fewer DON!! you hold, the more its activation takes back from theirs at the end of the turn.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-09-25",
      note: "OP-17 tournament deck lists. The 'Purple Kaido, 1st (4-0), SB, Sci-Fi Factory' entry dated 20 Sep 2026 is the list this deck is transcribed from, read off its machine-readable deckgen link; the seventeen OP17-058 entries on this page are the source of the field counts above.",
    },
    {
      url: "https://onepiecetopdecks.com/deck-list/japan-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-09-25",
      note: "The Japanese OP-17 tournament lists: fifteen more OP17-058 entries, mostly shop wins, which agree with the English field on the core and run more OP13-076 in the flex slots.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_110.php",
      retrievedAt: "2026-09-01",
      note: "Bandai's '(Purple) Kaido - Recommended Deck': the other list under this Leader, and the source of the ramp plan the two share.",
    },
    {
      url: "https://opdeckguide.com/deck-guides/kaido-op17/",
      retrievedAt: "2026-08-26",
      note: "Curve and weakness list for OP17-058: 'highly dependent on playing 6c King exactly on curve', which is the job OP07-077 does in this list.",
    },
  ],
};
