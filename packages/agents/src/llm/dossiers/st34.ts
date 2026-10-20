import type { DeckStrategyDossier } from "./types.js";

export const st34Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple) Charlotte Katakuri - Starter Deck 34",
  archetype:
    "Base ST34 Purple Big Mom Pirates: the Leader's top-of-deck peek turns every cost-guess effect into a certainty, funded by DON!! ramp",
  gamePlan: [
    "Use the Leader's once-per-turn DON!! -1 peek early. It is not primarily a +1000 power boost -- it reveals the top card of the opponent's deck, which is the cost every 'choose a cost and reveal 1 card from the top of your opponent's deck' effect in this deck has to name.",
    "Recover the DON!! that peek costs. Cracker, Pudding, Oven and Perospero each add a DON!! card back, and ST34-001 Katakuri turns the peek itself into two rested DON!!, so the Leader ability can be used on curve without falling behind on resources.",
    "Convert guaranteed guesses into removal: Oven K.O.s a base-cost-3-or-less Character, Cognac Mama-Mash reaches base cost 8 or less, and the Counter Event gives +5000 in a battle the opponent thought they had won.",
    "Close with Charlotte Linlin and Daifuku behind a board of Blockers, using Smoothie to replace anything the opponent removes on their own turn.",
  ],
  mulligan: [
    "Prefer Brulee or another cheap Big Mom Pirates play plus one ramp piece, so the Leader's DON!! -1 is paid back on the turn it is first used.",
    "Keep Cracker: it ramps and answers a cost-2-or-less Character in one card, which is the deck's most efficient early turn.",
    "Avoid an opening hand built around the 10-cost Linlin with no ramp; without Cracker, Pudding, Oven or Perospero the deck simply arrives late.",
  ],
  priorities: [
    "Peek before guessing, always in that order within a turn. Using the Leader's [When Attacking] peek and then naming that exact cost on Oven, Perospero, Cognac Mama-Mash or the Counter Event converts a coin flip into a guaranteed effect; naming a cost blind is close to a wasted card.",
    "The peek is also available on the opponent's attack. Use it there when holding OP11-079: the Counter reveals the same top card, so the peek during their attack tells you whether the +5000 will actually apply before you commit the card.",
    "With ST34-001 Katakuri on the field, the Leader's DON!! -1 is a ramp effect: returning that DON!! to the DON!! deck adds 2 rested DON!! back. Sequence the Leader ability before deciding how much DON!! remains for development. That trigger is [Your Turn] only -- it does not fire on the opponent's attack.",
    "Prefer Pudding's ramp on a turn the opponent is ahead on DON!!; its [On Play] only adds a DON!! while your DON!! count is equal to or below theirs, so playing it while ahead throws away half the card.",
    "Spend Oven's rest on a turn it removes a real target. Both the K.O. and the DON!! need the guessed cost to match the revealed card, the K.O. only reaches a base cost of 3 or less, and a rested Oven is not blocking or attacking.",
    "Do not spend Baron Tamago & Pekoms' [When Attacking] DON!! -1 unless the K.O. connects: it reaches only 2000 base power or less, and the DON!! is gone regardless.",
    "Charlotte Linlin's [On Play] costs DON!! -4 plus a discard. Play it on a turn where setting an opposing Character's base power to 0 makes an attack lethal or clears a Blocker, not simply because 10 DON!! is available -- the Life card it adds is worth little if the board is already lost.",
    "Flampe's +2000 applies only to [Charlotte Katakuri] cards, which means the Leader as well as the ST34-001 Character. Use it to push a Leader attack over a Blocker rather than saving it for a Character battle it cannot affect.",
  ],
  commonVariants: [
    "The sealed ST34 list is the base starter plus its OP11 and EB03 Big Mom Pirates support; competitive Katakuri builds lean harder on the cost-guess package and the DON!! ramp, and trim the vanilla Daifuku bodies the starter uses for curve.",
  ],
  commonCombos: [
    "Leader DON!! -1 peeks at the opponent's top card; with ST34-001 Katakuri out, that returned DON!! becomes 2 rested DON!!, so the information is free and the turn gets bigger rather than smaller.",
    "Peek, then Perospero: name the revealed cost to draw 1 and add an active DON!! -- the only ramp in the deck that comes back active rather than rested.",
    "Peek, then Cognac Mama-Mash: a guaranteed K.O. on a base cost 8 or less, which reaches almost any finisher on the board.",
    "Cracker ramps and K.O.s a cost-2-or-less Character on the same card, which usually means an opposing searcher or Blocker on the early curve.",
    "Smoothie's [Opponent's Turn] [On K.O.] pays DON!! -1 to replay a Big Mom Pirates Character with a cost up to the opponent's DON!! count, so removing it on a late turn hands back a large body.",
    "ST34-001 Katakuri's [On K.O.] plays a Character of 8000 power or less from hand, so trading it off still leaves a board behind.",
  ],
  keyCardNumbers: [
    "ST34-001",
    "ST34-002",
    "OP11-066",
    "OP11-071",
    "OP11-079",
    "OP11-081",
  ],
  counterplay: [
    "Remove ST34-001 Katakuri. Without it the Leader's peek is a real DON!! -1 every turn rather than a ramp step, and the deck's whole tempo depends on that DON!! coming back.",
    "The cost-guess effects are only reliable while the Leader ability has been used this turn. Forcing the peek to be spent defensively, or attacking on a turn it has already been used, leaves Oven and Cognac Mama-Mash guessing.",
    "Keep the board clear of base cost 3 or less and 2000-or-less base power bodies where possible: Oven, Cracker and Baron Tamago & Pekoms are all gated on those numbers and blank out entirely against a board above them.",
    "Play around +5000 from OP11-079 when the opponent has DON!! for the Leader peek: an attack that beats their Leader by 4000 or less is not safe.",
  ],
  sources: [
    {
      url: "https://onepiece.limitlesstcg.com/cards/OP11-062",
      retrievedAt: "2026-08-25",
      note: "Leader text: [When Attacking]/[On Your Opponent's Attack] once per turn, DON!! -1 to look at the top card of the opponent's deck and gain +1000 power for the battle.",
    },
    {
      url: "https://opdeckguide.com/deck-guides/katakuri-op11/",
      retrievedAt: "2026-08-25",
      note: "Archetype guide: the deck is built around knowing the opponent's top card so the cost-guessing effects (Perospero, Linlin, Cognac Mama-Mash) always hit, with multiple ramp lines to recover the DON!! the Leader ability spends.",
    },
  ],
};
