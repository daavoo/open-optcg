import type { DeckStrategyDossier } from "./types.js";

export const op11KatakuriTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple) Charlotte Katakuri - 1st Place Store Battle 2026-08-02",
  archetype:
    "Purple Big Mom Pirates DON!! ramp as a Store Battle winner builds it behind OP11-062: every DON!! -N cost refunds through ST34-001 Katakuri, and the deck turns that into OP11-067 Katakuri, Charlotte Linlin and K.O. Events.",
  gamePlan: [
    "The Leader's [When Attacking]/[On Your Opponent's Attack] [Once Per Turn] DON!! -1 looks at the top card of your opponent's deck and gives it +1000 for the battle. This list has no cost-guessing cards, so the peek is information and power; the DON!! it returns is the part that matters.",
    "ST34-001 Charlotte Katakuri turns the first DON!! returned on your turn into 2 rested DON!! from your DON!! deck, once per turn. With it on the board, the Leader's DON!! -1, Mamaragan's DON!! -2, Conquest of the Sea's DON!! -2 and PRB02-010 Pudding's DON!! -2 all pay for themselves.",
    "Ramp toward the top of the curve. ST34-002 Cracker and EB03-035 Pudding add a rested DON!!, and OP11-067 Katakuri adds one at the end of each of your turns.",
    "OP11-067 Charlotte Katakuri is an 8-cost 8000 [Blocker] that, at the end of your turn, sets up to 2 of your {Big Mom Pirates} Characters of cost 3 or more active. Attack with them, then stand them back up to block.",
    "Remove with OP08-077 Conquest of the Sea (two Characters of cost 6 or less), ST34-002 Cracker (cost 2 or less), ST34-005 Baron Tamago & Pekoms (2000 base power or less) and ST34-004 Charlotte Linlin, whose [On Play] sets a Character's base power to 0 for the turn.",
  ],
  mulligan: [
    "Keep ST34-003 Charlotte Brulee, OP11-070 Charlotte Pudding or OP07-077: each looks at the top of your deck for a {Big Mom Pirates} card, and they cost 1.",
    "Keep ST34-002 Cracker or ST34-001 Katakuri as the turn the ramp starts.",
    "Ship a hand of only 8-cost and higher. Linlin and OP11-067 Katakuri need the ramp to arrive on time.",
  ],
  priorities: [
    "Get ST34-001 Katakuri on the board before the turns you spend DON!! -N. Without it, every DON!! -N is a real loss of DON!!; with it, the first one each turn is +1.",
    "ST34-001's refund is [Your Turn] only. A Leader peek on your opponent's attack, or a Mamaragan used as a [Counter], does not refund.",
    "Use the Leader's peek on your own attack first each turn: it is the cheapest DON!! -1 you have, and it sets off ST34-001's refund before the larger costs.",
    "PRB02-010 Charlotte Pudding draws 2 and plays a {Big Mom Pirates} Character of 6000 to 8000 power from hand, but only while your opponent has 6 or more DON!!. Hold OP11-067 Katakuri, ST34-001 Katakuri or OP11-068 Daifuku to play with it.",
    "OP08-062 Charlotte Katakuri trashes itself to play a [Charlotte Katakuri] of cost 3 or more and no more than your opponent's DON!! count from hand: ST34-001 once they have 5 DON!!, OP11-067 once they have 8.",
    "EB03-035 Pudding only ramps while your DON!! count is at or below your opponent's. Play it on a turn you are behind or level.",
    "Mamaragan is a 0-cost Event: its [Main] draws and rests a Character of 5000 power or less for DON!! -2, and its [Counter] is +1000 that also draws while you have 6 or fewer DON!!.",
    "ST34-004 Charlotte Linlin costs DON!! -4 and a discard. Play it on a turn where a Character at 0 base power clears a Blocker or a lethal attacker, not just because you have 10 DON!!.",
    "OP08-069 Charlotte Linlin puts an opposing Character of cost 6 or less into their Life face-up for DON!! -1 and a discard: it removes the Character from the board, but it gives your opponent a Life card, so use it when the body matters more than the Life.",
  ],
  commonVariants: [
    "The starter list for this Leader runs the cost-guess package -- OP11-066 Charlotte Oven, OP11-071 Charlotte Perospero, OP11-079 and OP11-081 Cognac Mama-Mash -- with EB03-032 Charlotte Flampe, OP11-065 Charlotte Anana and P-090 Charlotte Smoothie. This list cuts all of them for OP11-067 Katakuri, PRB02-010 Pudding, Mamaragan, Conquest of the Sea and more searchers.",
  ],
  commonCombos: [
    "Leader peek with ST34-001 on the board: DON!! -1, then 2 rested DON!! back, and +1000 on the attack.",
    "PRB02-010 Pudding plays OP11-067 Katakuri from hand: draw 2 and an 8000 [Blocker] in one card.",
    "Attack with ST34-001 and Daifuku, then OP11-067 sets both active at the end of your turn and adds a rested DON!!.",
    "ST34-001 is K.O.'d and plays a Character of 8000 power or less from hand, so trading it still leaves a body.",
    "OP08-062 Katakuri is trashed to play ST34-001 or OP11-067 for 2 DON!!.",
  ],
  keyCardNumbers: [
    "OP11-062",
    "ST34-001",
    "OP11-067",
    "PRB02-010",
    "OP08-077",
    "ST34-004",
  ],
  counterplay: [
    "Remove ST34-001 Katakuri first. Without it, every DON!! -N this deck pays is a real DON!! lost.",
    "OP11-067 Katakuri sets its {Big Mom Pirates} attackers active again at the end of its turn, so they block on yours. Count them as Blockers.",
    "PRB02-010 Pudding and OP08-062 Katakuri read your DON!! count. Their payoffs are smaller while you have fewer than 6 DON!!.",
    "Conquest of the Sea K.O.s two Characters of cost 6 or less: put a body above cost 6 down rather than three smaller ones.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list Luke Tyler took to 1st at a Store Battle in the UK on 2 Aug 2026 (entry "Katakuri").',
    },
    {
      url: "https://onepiece.limitlesstcg.com/cards/OP11-062",
      retrievedAt: "2026-08-25",
      note: "Leader text: [When Attacking]/[On Your Opponent's Attack] once per turn, DON!! -1 to look at the top card of the opponent's deck and gain +1000 power for the battle.",
    },
  ],
};
