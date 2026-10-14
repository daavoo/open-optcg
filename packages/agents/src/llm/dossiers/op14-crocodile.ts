import type { DeckStrategyDossier } from "./types.js";

export const op14CrocodileDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Black) Crocodile - Official Feature Deck",
  archetype:
    "Black {Baroque Works} midrange behind OP14-079: a Leader that K.O.s one of your own Baroque Works Characters to give an opposing Character -10 cost, in a fifty where most cards pay off either the K.O. or a Character at cost 0.",
  gamePlan: [
    "Your Leader's first clause means your effects cannot remove your opponent's Characters from the field: no K.O., bounce or trash by effect. You beat their Characters in battle, or you rest, lock and negate them.",
    "The Leader's [Activate: Main], once a turn: K.O. one of your {Baroque Works} Characters, give up to one opposing Character -10 cost this turn, then you may trash the top 2 cards of your deck. Use it every turn you have a body to spend. The K.O. is a payoff too: most of your Characters print an [On K.O.].",
    "A Character at cost 0 switches on the rest of the list. OP14-090 Mr.1 rests an opposing 0-cost Character when it is played; OP14-090 and OP14-094 read a Character of cost 0 or 8 or more on either side, so your own 8-cost OP14-120 Crocodile counts too. While one is on the field, Mr.1 can attack Characters the turn it lands; OP14-094 Mr.5 draws 2 and trashes 1; OP14-120 Crocodile draws 1; OP14-083 Ms. Wednesday trashes itself to give a 0-cost Character -3000 power; OP14-096 Ground Death's [Main] rests 2 of your DON!! to negate a Character of cost 5 or less, which after the drain is any Character.",
    "Bandai's main line: K.O. OP14-091 Mr.2 with the Leader, draining their best Character. Mr.2's [On K.O.] plays OP14-090 Mr.1 from your hand or trash; Mr.1 rests the drained Character, then attacks it the same turn.",
    "OP14-120 Crocodile is the top of the curve at 8. Its [On Play] stops a Character of cost 9 or less attacking until the end of your opponent's next turn. K.O. it with the Leader and its [On K.O.] trashes one card from your hand to play it again from the trash, so its [On Play] runs a second time and locks a second attacker.",
    "Fill the trash early. OP14-087 Miss.Valentine and OP14-099 Disappointed? dig for Baroque Works cards and trash the rest, OP14-085 Miss.Goldenweek draws 2 and trashes 2 when K.O.'d, and the Leader mills 2. OP14-084 Ms. All Sunday then plays a 4-or-less and a 1-cost Baroque Works Character back from the trash.",
    "At 7 or more cards in your trash, OP14-086 Miss Doublefinger gains +1000 power and your Baroque Works Characters on the field gain +2 cost, out of range of your opponent's cost-limited removal. At 10 or more, OP14-096's [Counter] gives +4000.",
  ],
  mulligan: [
    "Keep a hand with a 1-cost Baroque Works Character: OP14-083 Ms. Wednesday, OP14-085 Miss.Goldenweek, OP14-087 Miss.Valentine or OP14-088 Miss.MerryChristmas. It is a turn-one play and the Leader's first K.O.",
    "A hand without one has nothing on the board for the Leader to K.O. until the 4-costs. Take a new hand.",
  ],
  priorities: [
    "Drain before you play the card that reads cost 0. The -10 only lasts the turn, so run the Leader's activation first, then play Mr.1, Mr.5 or OP14-120, or cast Ground Death, on the same turn.",
    "Spend the body whose [On K.O.] you want: Mr.2 when you hold Mr.1 or have one in the trash, OP14-120 when you have a spare card in hand, Goldenweek or MerryChristmas when you want cards. MerryChristmas' [On K.O.] also K.O.s an opposing Stage of cost 1; Stages are not Characters, so the Leader's clause does not stop it.",
    "Drain the Character you most need gone. Mr.1 can rest it and then beat it in battle, and a battle K.O. is not an effect.",
    "OP14-092 Mr.3 survives a K.O. once per opponent's turn by putting 3 cards from your trash at the bottom of your deck. That thins the trash your Doublefinger and Ground Death count, so watch the count.",
    "Mr.5 is your only [Blocker]. Keep one back when the opponent has a lethal swing.",
    "Your Leader K.O.s one of your own bodies every turn, so the ones it is not built to spend are the board you keep. Spend a Counter card from hand to save Mr.5, OP14-120 Crocodile or Ms. All Sunday from an attack, and one 2000 for Mr.1 or Doublefinger, as long as your Life can take what is still coming. Your 1-cost Characters are the Counters to spend; the Leader will K.O. them anyway.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader, built around draining a Character to 0 cost and the Baroque Works bodies that read it.",
  ],
  commonCombos: [
    "Leader K.O.s OP14-091 Mr.2, draining their Character; Mr.2 plays OP14-090 Mr.1, which rests that Character and attacks it the same turn.",
    "Leader K.O.s OP14-120 Crocodile; its [On K.O.] trashes one card from hand to replay it, and the second [On Play] locks another attacker and draws, since the drained Character is at cost 0.",
    "Leader drains a Character of any size, then OP14-096 Ground Death negates it: after -10 it is cost 5 or less.",
    "OP14-084 Ms. All Sunday plays Mr.2 and a 1-cost body back from the trash, which feeds the Leader's next two turns.",
  ],
  keyCardNumbers: [
    "OP14-079",
    "OP14-091",
    "OP14-090",
    "OP14-120",
    "OP14-084",
    "OP14-096",
    "OP14-094",
    "OP14-087",
  ],
  counterplay: [
    "This deck cannot K.O. or bounce your Characters with effects, only in battle. A big body that stays active is hard for it to remove; it has to rest it with Mr.1 and attack it.",
    "The -10 cost lasts one turn. What it enables -- Mr.1's rest, Ground Death's negate, Mr.5's draw -- all happens on that turn, so plan around one Character going down a turn, not the board.",
    "OP14-120's attack lock and replay are its best defence. Force it to spend its hand on the replay, and attack with what OP14-120 did not lock.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_092.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP14-079: the fifty, the Leader draining an opposing Character's cost by K.O.ing your own Baroque Works bodies, OP14-087 and OP14-083 filling the trash early, OP14-084 playing two bodies from the trash, OP14-091 K.O.'d to play OP14-090 which rests and attacks the drained Character, OP14-120 replayed by its [On K.O.], and OP14-096 negating a drained [Blocker].",
    },
  ],
};
