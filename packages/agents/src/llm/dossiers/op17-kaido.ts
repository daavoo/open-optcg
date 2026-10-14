import type { DeckStrategyDossier } from "./types.js";

export const op17KaidoDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple) Kaido - Official Feature Deck",
  archetype: "OP-17 Purple Kaido DON!! ramp",
  gamePlan: [
    "Ramp, then out-scale. The curve, counting only this deck's own turns: turn 1 nothing or a 1-DON!! attach; turn 2 EB04-032 Queen or OP17-075 X.Drake; turn 3 a 3-cost ramp body -- OP17-073 Basil Hawkins or OP17-074 Yamato -- or Queen's [Activate: Main] for a fifth DON!!; turn 4-5 EB04-031 King; turn 6-7 you are at 10 DON!! and pick the Kaido the board asks for. Going first is this deck's best start.",
    "Ramping does not mean an empty board, and this is the mistake that loses the games. OP17-074 Yamato and OP17-073 Basil Hawkins each add a DON!! *on a body* -- Yamato's is a [Blocker], Hawkins's DON!! arrives active. All eight published tournament lists run four of each. A 3-cost ramp body buys the same DON!! as Queen's [Activate: Main] and leaves something on the table, so prefer it whenever the turn can pay for it.",
    "EB04-031 King is the engine. Its [Activate: Main] adds one active and one rested DON!! every turn, and its replacement clause means the only way to remove it is a K.O. you can pay a DON!! to cancel. Play it the turn it is castable; do not hold it for a better turn, because it is what makes the better turn.",
    "Only one King works at a time -- the clause reads 'you have no other [King] Characters' -- so a second copy in hand is a card to trash to EB04-032 Queen, not a second engine.",
    "At 10 DON!! OP17-062 Kaido is the default and OP17-063 the exception. OP17-062 is a 12000 [Blocker] that refunds a DON!! every time one is returned to your DON!! deck, and it is a four-of in all eight tournament lists; OP17-063 is the answer to a specific cost-6-or-less Character you need dead this turn. Take OP17-063 when that Character is on the board and OP17-062 otherwise.",
    "OP17-060 Ulti & Page One is the ramp body that also answers a board: an active DON!! and a K.O. on anything with 3000 power or less, for six. OP17-069 Jack is the same idea at nine with [Rush: Character] and a -2000, so it can remove the turn it lands rather than the turn after.",
  ],
  mulligan: [
    "Keep a hand that can act before turn 4: EB04-032 Queen, OP17-075 X.Drake, OP17-068 Sasaki, OP17-073 Basil Hawkins or OP17-074 Yamato. This list runs no search at all -- Bandai spent the slot on X.Drake -- so a keepable hand is one with cheap bodies in it, not one with a way to dig.",
    "A hand of two or more cost-9-or-10 bodies and no 1-cost play is the deck's brick and the reason to take a new seven; the guide's own weakness list leads with 'inconsistent early game (can brick easily)'.",
  ],
  priorities: [
    "Being raced is the loss condition, and the plan does not survive on its own against it. Every published assessment names a fast aggro start as this deck's worst matchup, so count the opponent's attackers against your Life before spending a turn on DON!!: once they can take the rest of your Life next turn, the turn is spent on bodies and [Blocker]s, not on ramp. A hand of twelve cards at 1 Life has already lost -- Life is the resource that does not come back, and cards held past the turn they were needed bought nothing.",
    "Buy a Life card back while one card still buys it. Attacks get bigger every turn, so a hit a single 2000 Counter stops outright on turn 4 is one that takes three cards on turn 7 -- and three cards is the hand this deck needs for the turn it is ramping towards. The test is the price, not the Life total: spend one card on a hit you can stop outright, and take the hit rather than spend two or three on it. Dribbling Counters into a hit you cannot stop at all is the worst of the three, because it pays the cards and loses the Life.",
    "The Leader's ability spends a DON!! off the field rather than resting one, and any DON!! on the field pays it -- rested, active, or given to a card. 'DON!! −1: give up to 1 of your opponent's Characters −2000 power' is once per turn and works on either player's attack, so a turn that ended tapped out still has the debuff available on defence. Spend it to make a Counter cheaper or a trade favourable, and remember it also turns on OP17-062 Kaido, whose reaction hands a DON!! straight back and stands another up.",
    "Every DON!! returned to your DON!! deck is a trigger while OP17-062 Kaido is on the board -- the Leader's ability, a DON!! −N cost, or a King/Kaido replacement all count -- so with Kaido out the deck's costs are close to free once per turn.",
    "Eleven slots print no Counter and eight of those cost 9 or more, so count actual Counter power before assuming a turn is defensible. OP17-076 at four copies is the real Counter density; OP17-063 in play gives every Counter-less Character in hand a +1000 Counter, which is often the difference on the turn it lands.",
    "EB04-032 Queen's [Activate: Main] loses a DON!! now to gain one next turn: two active DON!! become one rested, and the rested one still stands up in the next Refresh Phase. Use it on a turn where the two active DON!! were not going to be spent, not on a turn where they were -- and note that OP17-074 Yamato buys that same one DON!! for three DON!! and a card while leaving a [Blocker] behind, which is the better version of the trade on any turn you can afford it. Queen's conversion is also worth nothing once you are at ten DON!! on the field; the pool caps there.",
    "OP17-075 X.Drake's [On Play] costs DON!! −2, and DON!! −N *returns* those DON!! to the DON!! deck rather than resting them. Two DON!! off the field is roughly two turns of natural progression, traded for one card the opponent picks out of a hand they refill. Decline it and play X.Drake as a 2-cost body with a 2000 Counter, unless the field is already at ten DON!! -- where the ramp has nowhere left to put one and King refills the gap for free -- or the opponent is down to their last card.",
    "OP17-061 Lead Performers costs 9 itself, so it is not a way to reach anything early -- EB04-031 King costs 6 and arrives on its own turn long before this card is castable. What it is: an 11000 body whose [On Play] pays DON!! -1 to put the top card of your deck into your Life while your Leader is {Animal Kingdom Pirates}, and whose [Activate: Main] trashes it from the board to play a [King], [Queen] or [Jack] out of hand for free. Both halves are late-game value -- a Life card back, then one 9-drop converted into another -- and the [Activate: Main] is dead unless a [King], [Queen] or [Jack] is still in hand when you want it.",
    "OP17-068 Sasaki's [When Attacking] buys two rested DON!! for two cards out of hand, and OP17-078 Drunken Dragon Bagua buys three for two cards and two rested DON!!. Both are the right trade only while the ramp still has somewhere to go and the hand is deep enough to lose two; at ten DON!! the new DON!! have nothing to buy and the cards are simply gone. Pay with the bricks -- a cost-9-or-10 body this turn cannot cast, or the second King -- never with a Counter you will need this turn.",
  ],
  commonVariants: [
    "This 50 is Bandai's own feature deck for the Leader, so it is the reference build rather than one pilot's tuning. It is close to the eight published tournament lists (ChinoizeCup, Europe, 17-26 Aug 2026, one 5-0 first place), which also run four OP17-062 Kaido, four OP17-073 Basil Hawkins and four OP17-074 Yamato.",
    "The tournament field shares this list's ramp core and differs almost everywhere else. It runs four OP07-077 We're Going to Claim the One Piece!!! (a 1-cost look at five for an {Animal Kingdom Pirates} or {Big Mom Pirates} card), three ST34-004 Charlotte Linlin, OP07-076 Slow-Slow Beam Sword and OP15-078 Mamaragan as its Events, and OP08-074 Black Maria and EB04-030 Kaido, where this list runs OP17-060, OP17-068, OP17-069 and OP17-078. Against that build expect a searched King and removal Events rather than X.Drake's discard.",
    "Bandai's list is OP-17 plus the two EB-04 ramp engines and nothing else.",
    "OP17-065 Queen and OP17-069 Jack at three copies each are this list's tuning dials on the 9-drop count.",
  ],
  commonCombos: [
    "Turn 2 Queen, Queen's [Activate: Main] on turn 3, King a turn early on turn 4-5 -- the whole reason the curve works.",
    "OP17-062 Kaido plus any DON!! −N cost: the cost pays for itself once per turn, so the Leader's debuff and OP17-063's K.O. both become close to free.",
    "OP17-063 Kaido lands, gives every Counter-less Character in hand a +1000 Counter, and negates and K.O.s a cost-6-or-less Character on the same turn -- the turn a hand of bricks becomes a defence.",
    "OP17-061 Lead Performers, already on the board, trashes itself to deploy King out of hand, and King ramps on the same turn it lands. This is a turn-9-or-later line, not an acceleration one: paying 9 for Lead Performers is strictly slower than casting the 6-cost King itself.",
  ],
  keyCardNumbers: [
    "OP17-058",
    "EB04-031",
    "EB04-032",
    "OP17-062",
    "OP17-063",
    "OP17-060",
  ],
  counterplay: [
    "Race it. The deck spends its first five turns on DON!! rather than board, and every published assessment names a fast aggro start as its worst matchup.",
    "Answer King rather than the cost-10 bodies: it is the card that buys the extra turns, and it can only cancel one K.O. per DON!! on its field -- so removal on a turn where its DON!! is already committed sticks.",
    "Attack into a hand of uncastable 10-drops. Much of the deck cannot Counter at all, so pressure on an early turn costs cards it does not have.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_110.php",
      retrievedAt: "2026-09-01",
      note: "Bandai's own '(Purple) Kaido - Recommended Deck' feature page: the 50 this dossier describes, transcribed card-for-card, and the source of its one-line description of the archetype.",
    },
    {
      url: "https://opdeckguide.com/deck-guides/kaido-op17/",
      retrievedAt: "2026-08-26",
      note: "Curve and weakness list for OP17-058. No longer the source of the 50 -- the deck now runs Bandai's feature list -- but its 'Your Best Curve'/'Even Curve' sections are still the sequencing this dossier's game plan restates, and its 'highly dependent on playing 6c King exactly on curve' is the claim the mulligan encodes.",
    },
    {
      url: "https://www.thornberrymedia.com/post/op-17-kaido-deck-list",
      retrievedAt: "2026-08-26",
      note: "Independent pre-release assessment of the same shell; source for 'there really isn't a proven best OP-17 Kaido deck yet' and for the debated flex slots.",
    },
    {
      url: "https://gumgum.gg/one-piece/decklists/leader/OP17-058/kaido/OP17",
      retrievedAt: "2026-08-27",
      note: "Tournament decklist index for this Leader: still zero events listed as of 27 Aug 2026, which is why the tournament lists cited above come from onepiecetopdecks rather than from here.",
    },
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-08-27",
      note: "Eight OP17-058 tournament lists, ChinoizeCup 17-26 Aug 2026, one of them a 5-0 first place. Source for the invariant core, for the four-of counts on OP17-074, OP17-073 and OP17-062, and for OP07-076 appearing in all eight. Supersedes the 'no tournament-proven build yet' reading the other two sources were written under.",
    },
  ],
};
