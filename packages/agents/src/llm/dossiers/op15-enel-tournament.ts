import type { DeckStrategyDossier } from "./types.js";

export const op15EnelTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple) Enel - 1st Place Store Battle 2026-04-11",
  archetype:
    "Purple Enel DON!! ramp behind OP15-058, as the OP-15 field built it: a six-card DON!! deck spent on turn 2 to arm a 1-cost body, a Holly package that gives every Ohm [Double Attack], eight removal-proof 6-cost Enels, and the 0-cost thunder Events that double as the Counter suite.",
  gamePlan: [
    "Turn 1, play a 1-cost body -- Ohm first if you hold one, otherwise Satori, Shura or Charlotte Pudding. Ohm is the body Holly makes a two-damage attacker, so it is the one you want on the board before the Leader's gift arrives.",
    "On your second turn, activate the Leader: it adds 1 active DON!! and 4 rested ones, then gives the 4 rested DON!! to one of your Characters. Give them to a body that can attack this turn. A vassal becomes at least 6000 power, enough to connect into a 5000-power Leader, and given DON!! returns at Refresh, so a gift saved for next turn is a gift wasted.",
    "OP15-071 Holly is a 3-cost play for turn 2 or turn 3. With Holly on the board, every Ohm and Holly itself has [Double Attack]: the gift on an Ohm is then a 6000-power swing that takes two Life, and on the opponent's turn both sit at 6000 base power.",
    "From the third turn six DON!! pay for OP15-118 Enel or OP15-060 Enel. Both are 10000-power bodies that cannot be removed by your opponent's effects while you have 6 or fewer DON!! on your field; neither has [Rush]. OP15-118 digs 5 for a card on play; OP15-060 can pay DON!! −1 and a card from hand to gain [Blocker] until the end of your opponent's next End Phase.",
    "Once the DON!! deck is empty the deck stops ramping: cycle the 0-cost Events, hold Counter Events for the turn an Enel must survive, and keep attacking with the bodies that have been swinging since turn 2. OP07-064 Sanji and OP12-063 Vinsmoke Reiju are the Blockers; Sanji costs 3 rather than 6 whenever your field holds at least 2 fewer DON!! than the opponent's, which under this Leader is most of the game.",
    "Count the clock. This is not a grind deck; a turn that develops without attacking spends a turn of a short clock, and a Double Attack that connects is two Life for one attack.",
  ],
  mulligan: [
    "The keep is a Character the first two turns can pay for -- a 1-cost vassal, Pudding or Holly -- with enough Events behind it. An Ohm in the opening hand is the best keep in the deck, because it is the body Holly makes worth the gift.",
    "Redraw hands of nothing but Events: with no Character on the board the Leader's activation gives its DON!! to no one, and a hand of Counters defends a Life total that nothing is pressuring.",
    "A 6-cost Enel is not a reason to keep on its own. It cannot be the second-turn gift target and it cannot attack the turn it is played; a hand of 6-costs and Events is a slow hand.",
  ],
  priorities: [
    "Attack every turn, and attack the Leader unless a Character is the better target. The deck wins on Life, and a Double Attack body kept home trades two Life you would have taken for at most one you might save.",
    "The Leader attacks too. It is 5000 power and the attacker wins ties, so it connects into any 5000-power Leader for a Life card with no DON!! spent on it.",
    "Activate the Leader on turn 2 rather than saving it. The DON!! deck is six cards, so every turn of delay compresses the window in which the power advantage exists.",
    "Give the 4 rested DON!! to a Character that can still attack this turn, and among those prefer an Ohm while Holly is on the board: the same 6000 power takes two Life instead of one. A newly played Enel cannot attack and should receive the gift only when nothing else can swing.",
    "Keep the field at 6 or fewer DON!! cards. Both 6-cost Enels cannot be removed by the opponent's effects and gain +2000 power under that line, Shura has [Rush] under it, and Ohm's and Satori's [When Attacking] and Mamaragan's Counter draw read the same condition.",
    "Spend a DON!! −N cost from the cost area, never from DON!! that is buying an attack this turn. Given DON!! is on the field and a DON!! −1 will take it if the cost area is empty; attack with the armed body first, then cast the Events.",
    "Hold Varie, El Thor and Lightning Beast Kiten out of the Main phase when the hand is short of Counters. Each is +2000 on an [Enel] card -- your Leader or either 6-cost Enel -- for 0 cost; Mamaragan is +1000 on anything and draws a card under the DON!! ceiling.",
    "Removal is thin: El Thor K.O.s a Character with 3000 power or less, Kiten and Ohm give −1000, Mamaragan rests a 5000-or-less body, and Lightning Dragon keeps a rested 6000-or-less body down through Refresh. Save them for a Blocker or a body that out-powers your attacker, not a 2000-power searcher.",
    "OP13-076 Divine Departure is the single answer to a big body: with any DON!! given, resting 5 DON!! gives a Character −8000 for the turn. It fires only after the gift, so it is the last card cast in a Main phase, into the one body whose removal wins the race. Its Counter half trashes a card for +3000.",
    "OP15-060 Enel's [Blocker] costs DON!! −1 and a card from hand each time. Give it [Blocker] at the end of a turn when the opponent has a lethal or near-lethal swing and you have a card to spare.",
    "Do not Counter with a Blocker. Sanji is printed at 2000 Counter and Reiju at 1000, and a Blocker spent once was a body that blocked every turn from then on. Counter with the Events, then with the vassals. Reiju is 7000 power once 4 Events are in your trash.",
  ],
  commonVariants: [
    "The EU Championship 26-27 S1 winning list under this Leader runs ST10-010 Trafalgar Law, OP10-067 Senor Pink, OP05-077 Gamma Knife and OP09-077 Gum-Gum Lightning where this list runs Vinsmoke Reiju and OP15-060 Enel, and plays only two OP15-118 and one Sanji. Expect more removal and fewer 6-cost bodies from it.",
    '"(Purple) Enel - Official Feature Deck", Bandai\'s build, runs four OP15-118, Franky and Reiju as Blockers and no Holly. Against it, expect a finisher on turn 3 and a Blocker wall rather than Double Attack pressure.',
  ],
  commonCombos: [
    "Holly plus an Ohm that receives the Leader's four rested DON!!: a 6000-power [Double Attack] swing on turn 2 or 3 that takes two Life through a 5000-power Leader, and Ohm's own [When Attacking] gives an opposing Character −1000 on the way in.",
    "Holly on the opponent's turn: Holly and every Ohm sit at 6000 base power, so a 5000-power attack into them bounces.",
    "Charlotte Pudding costs 1 and digs 4 for a Sanji or an Event, which in this list nearly always hits.",
    "A 6-cost Enel for a removal-proof 10000-power body under the DON!! ceiling. It does not attack the turn it lands; on later turns it can receive the gift before attacking and reach 14000 for that swing.",
    "Divine Departure after the gift: with DON!! given to a Character, resting 5 DON!! gives an opposing Character −8000 for the turn, which puts any body in range of the vassals and the Leader.",
    "Varie gives one of your Characters +2 cost until the end of the opponent's next End Phase, lifting a Holly or an Ohm out of 'cost 3 or less' removal for the turn it matters.",
  ],
  keyCardNumbers: [
    "OP15-058",
    "OP15-071",
    "OP15-061",
    "OP15-067",
    "OP15-118",
    "OP15-060",
    "OP07-064",
    "OP15-075",
    "OP15-076",
    "OP15-078",
    "OP13-076",
  ],
  counterplay: [
    "While Enel holds 6 or fewer DON!! cards, both 6-cost Enels cannot be removed by effects at all. Answer them by racing, by blocking, or by forcing the DON!! count above six.",
    "Holly is the card to remove. Without it every Ohm is a 2000-power body that takes one Life per swing; with it the gift takes two Life and the bodies sit at 6000 on your turn. Holly itself is a 4000-power Character on Enel's turn, in range of most removal.",
    "The DON!! deck is six cards and gone early; pressure that survives the first turns meets a deck with no more ramp.",
    "Their removal is small: the largest unconditional answer is El Thor on a 3000-power body. A Character above 6000 power survives everything but Divine Departure.",
    "Rested DON!! buy no Counter, so a turn where Enel gave 4 rested DON!! away is a turn with little active DON!! behind the Leader.",
    "Enel's Life is 5, more buffer than most opponents plan for; count the extra Life before committing to a race.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op15-eb04-deck-list-adventure-on-kamis-island/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "Bloodya" took to 1st, 6-0, at a Store Battle in Argentina on 11 Apr 2026 (entry "Purple Enel").',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_099.php",
      retrievedAt: "2026-09-19",
      note: "Bandai's feature deck for OP15-058: vassals on turn 1, six DON!! on the field by turn 3, the 6-cost Enel as a removal-proof 10000-power attacker, and 0-cost Events spent because the Leader refunds the DON!!.",
    },
  ],
};
