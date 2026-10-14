import type { DeckStrategyDossier } from "./types.js";

export const st35Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Black) Sabo - Starter Deck 35",
  archetype:
    "Base ST35 Red/Black Revolutionary Army: inflate a Character's cost to 8 to switch on a field-wide +1000, fed by rested DON!! gifts and protected by redirection effects",
  gamePlan: [
    "The whole deck exists to satisfy one condition: a Character with a cost of 8 or more, plus 1 DON!! on the Leader, gives the Leader and every Character +1000 power. Several Characters inflate their own cost on the field to reach it -- Sabo (P-105) and Morley go from 4 to 8, Koala (OP13-081) and Kuma from 5 to 8, and ST35-004 Koala from 7 to 8.",
    "Pay for the Leader's DON!! with rested DON!! rather than active DON!!. Inazuma, both Koalas, Kuma and Sabo all give a rested DON!! to the Leader on play, so the buff turns on without costing a card play.",
    "Accept early Life loss. The Leader is -1000 while at 4 or more Life, so it attacks at 4000 to start and at 5000 once the opponent has broken into the Life stack -- and at 6000 with the DON!! buff online.",
    "Protect the enabler and grind. Ivankov and Dragon absorb removal aimed at Revolutionary Army Characters, so the 8-cost body that carries the buff is far harder to answer than its printed stats suggest.",
  ],
  mulligan: [
    "Prefer a hand that reaches a cost-8 Character by the mid curve: Sabo (P-105) or Morley plus a rested-DON!! gift is the standard opening shape.",
    "Keep Ivankov: it is one card that turns the opponent's first removal spell into nothing, and it protects the piece the whole board's power depends on.",
    "Avoid hands of only Counter Events and small bodies with no cost inflation; without the 8-cost condition the Leader is a 4000-power Leader with no payoff.",
  ],
  priorities: [
    "Check the 8-cost condition before ordering attacks, not after. Every Character on the board is +1000 while it holds, so playing the inflating Character first and giving the Leader its DON!! changes which attacks are profitable.",
    "Cost inflation is checked on the field, not in hand: Sabo (P-105) costs 4 to play and is a cost-8 Character once it lands. Play it for its printed cost and read it as an 8 afterwards.",
    "Prefer the rested-DON!! gifts over manually attaching active DON!! to the Leader. Inazuma, Koala and Kuma give a rested DON!! as part of a body arriving, which leaves the active DON!! free for a second play.",
    "Use P-105 Sabo's Life cost deliberately: adding a Life card to hand accelerates the Leader out of its -1000 penalty and finds a card, but it also shortens the game clock the opponent is racing.",
    "Sequence removal from cheapest gate upward. Hack K.O.s 2000 base power or less, Lindbergh gives -3000 this turn, Belo Betty gives -2 cost, and OP13-019 rests 4 DON!! to give -3000 and then K.O. 3000 or less. Stacking Lindbergh or Belo Betty before the K.O. is what makes the removal reach a real body.",
    "Do not spend Ivankov as a Blocker or an attacker while the opponent holds removal: its value is the trash-instead-of-K.O. redirection on the 8-cost enabler, and it can only do that from the field.",
    "Dragon's redirection is once per turn and gives -2000 power instead of removal, which can itself K.O. a small Character. Check what the -2000 lands on before choosing it.",
    "Hair Removal Fist is +2000, or +4000 while a Revolutionary Army Character of cost 8 or more is on the field. Count the board's current cost inflation before deciding whether a battle is defensible.",
  ],
  commonVariants: [
    "The sealed ST35 list is the base starter plus its OP12 and OP13 Revolutionary Army support. Competitive Red/Black Sabo builds lean further into the self-inflating Characters and add a recursion engine that replays them from the trash, which the starter list does not carry.",
  ],
  commonCombos: [
    "Inazuma or Koala (OP13-081) gives a rested DON!! to the Leader while an inflated Character is already on the board: the Leader and every Character gain +1000 without spending active DON!! on the attachment.",
    "ST35-004 Koala and Kuma each give a rested DON!! and then play a 4000-power Revolutionary Army Character from hand or trash -- two bodies and the Leader condition from one card.",
    "Koala (OP13-081) recurs value once per turn by bottoming a card from the trash to hand out another rested DON!!, which keeps the buff on across turns without further plays.",
    "Ivankov in front of the cost-8 enabler means the opponent's first K.O. effect trashes Ivankov instead, and Dragon's -2000 redirection absorbs a second.",
    "OP13-019 rests 4 DON!! for -3000 then a K.O. at 3000 or less, which together answer a mid-size Character on a turn the deck is not developing.",
  ],
  keyCardNumbers: [
    "P-105",
    "OP13-081",
    "OP13-005",
    "OP13-008",
    "OP13-017",
    "OP13-019",
  ],
  counterplay: [
    "Answer the cost-8 Character and the whole board drops by 1000 at once -- but expect Ivankov and Dragon to eat the first two attempts, so plan removal in threes or attack through it instead.",
    "Early aggression is double-edged. The Leader is 4000 while at 4 or more Life, so early attacks are cheap; but each Life card taken moves it toward 5000 and then 6000. Race only with a line that actually closes.",
    "Watch for Hair Removal Fist reaching +4000 rather than +2000 whenever a cost-8 Revolutionary Army Character is on the board, and for OP13-019's +3000 Counter on the Leader.",
    "The starter list's removal is gated at 2000-or-less base power and 3000-or-less after a debuff. A single large body outside those numbers is far harder for this deck to answer than several small ones.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_084.php",
      retrievedAt: "2026-08-25",
      note: "Official (Red/Black) Sabo feature: play Revolutionary Army Characters whose costs increase on your field, take your time, and the Leader's power climbs to 6000 as Life is lost.",
    },
    {
      url: "https://onepiece.gg/red-black-sabo-guide/",
      retrievedAt: "2026-08-25",
      note: "Archetype guide: mid-game Characters that boost their own cost give access to the Leader's power buff on earlier turns; the Leader starts at 4000 and scales up as Life falls.",
    },
  ],
};
