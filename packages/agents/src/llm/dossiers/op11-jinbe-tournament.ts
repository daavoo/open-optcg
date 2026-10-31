import type { DeckStrategyDossier } from "./types.js";

export const op11JinbeTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green) Jinbe - 1st Place Shop Event 2026-09-16",
  archetype:
    "Green OP11-021 Jinbe as a rest-and-lock deck: most of its Characters rest the opponent's board on play, Megalo and Vander Decken IX K.O. what is rested, Jewelry Bonney and Arlong keep it rested through the next Refresh Phase, and OP17-022 Shanks rests everything for the finish. The Leader stands up one {Fish-Man} or {Merfolk} Character and one DON!! at the end of each of your turns while you hold 6 or fewer cards.",
  gamePlan: [
    "The Leader's [End of Your Turn] sets up to 1 of your {Fish-Man} or {Merfolk} Characters and up to 1 DON!! active, but only with 6 or fewer cards in hand. Spend down to 6 before the turn ends; the active DON!! pays for a 1-cost Counter Event on their turn, and the Character that attacked stands up to block or to stay out of reach of rested-only removal.",
    "The {Fish-Man} or {Merfolk} bodies it can stand are OP06-025 Camie, OP06-033 Vander Decken IX, OP11-030 Shirahoshi, OP11-031 Jinbe, OP11-035 Fisher Tiger, OP15-023 Arlong and EB04-015 Jinbe. EB04-018 Megalo is {Animal}, and the Straw Hat and Red-Haired cards are not either type.",
    "Rest first, then take. OP11-031 Jinbe (cost 5 or less), OP11-035 Fisher Tiger (any Character), OP14-031 Nami (two at cost 8 or less), OP15-032 Brook (any card), OP17-029 Hongo (two at cost 2 or less) and OP17-022 Shanks (all of them) rest the board; EB04-018 Megalo rests itself to K.O. a rested Character with 8000 power or less, and OP06-033 Vander Decken IX trashes a {Fish-Man} card from hand to K.O. any rested Character.",
    "OP11-031 Jinbe's [Activate: Main] lets a {Fish-Man} or {Merfolk} Character attack Characters on the turn it is played: rest a Character with an [On Play] and attack it with the body that rested it.",
    "Make the rests stick. OP07-026 Jewelry Bonney stops one rested Character or DON!! of theirs from refreshing next turn, and OP15-023 Arlong's [On K.O.] does the same to two rested cards. A rested DON!! that stays rested is one fewer they can pay with.",
    "OP17-022 Shanks is the finisher: [Rush], sets 2 of your DON!! active, and rests all of your opponent's Characters, so nothing of theirs can block that turn.",
  ],
  mulligan: [
    "Keep OP06-025 Camie or OP11-030 Shirahoshi: each finds a body for the curve, and Shirahoshi digs for any {Fish-Man Island} card every turn the Leader stands it up.",
    "Keep a 2- or 4-cost rest or K.O. -- Vander Decken IX, Megalo, Hongo or Nami -- for the turn the opponent first has a Character worth taking.",
    "A hand of 6- to 10-costs with nothing under 5 takes a new hand.",
  ],
  priorities: [
    "Order a turn's plays so the rests come before the K.O.s and the attacks: Megalo and Vander Decken IX only reach a rested Character.",
    "OP11-030 Shirahoshi's [Activate: Main] rests itself and a DON!!: use it early in the turn, and the Leader's end-of-turn stand-up gives both back.",
    "OP15-032 Brook's [Activate: Main] trashes itself to set a Character with a base cost of 8 or less active -- the Leader is {Straw Hat Crew}, so it is live. Use it to re-use an attacker, or to stand a Blocker before passing.",
    "EB04-015 Jinbe is a 7-cost [Blocker]. Its [On K.O.] rests one of your cards to play a green Character costing 6 or less from hand, so let it be K.O.'d with a 6-cost -- OP11-031 Jinbe, Fisher Tiger or Brook -- in hand.",
    "OP11-035 Fisher Tiger replays a {Fish-Man} or {Merfolk} costing 4 or less from hand, resting a DON!!, when the opponent's effect K.O.s it; battle does not count.",
    "OP14-031 Nami sets up to 5 of your DON!! active at the end of the turn it is played: spend everything before passing, and those DON!! defend on their turn.",
    "EB04-020 Shark Brick Fist and OP11-039 Vagabond Drill are 1-cost +3000 Counters that also stand a {Fish-Man} Character or rest a cost 3 or less. Keep 1 DON!! for them; the Leader's stand-up is often that DON!!.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader is OP-10 and OP-11 {Fish-Man}: OP11-024 Aladine, OP06-035 Hody Jones, OP11-029 Charlotte Praline, the vanilla OP11-032 Surume and OP11-033 Bird Neptunian, the Navy pair OP10-030 Smoker and OP10-032 Tashigi, and OP11-038 Gum-Gum Elephant Gatling, with four Fisher Tiger. This list cuts all of them and three Fisher Tiger for EB04 Jinbe, Megalo and Shark Brick Fist, Vander Decken IX, Jewelry Bonney, Arlong, Brook, Nami, Hongo and OP17-022 Shanks.",
  ],
  commonCombos: [
    "Hongo or Nami rests their small bodies, Megalo rests itself to K.O. one of them, and Vander Decken IX takes another for a {Fish-Man} card from hand.",
    "OP11-031 Jinbe rests a cost 5 or less, then its [Activate: Main] lets it attack that Character the turn it lands.",
    "Shanks rests their whole board; Bonney keeps the biggest one rested through their next Refresh Phase.",
  ],
  keyCardNumbers: [
    "OP11-021",
    "OP17-022",
    "EB04-018",
    "OP06-033",
    "OP11-031",
    "OP07-026",
    "OP14-031",
    "OP11-030",
  ],
  counterplay: [
    "Most of their removal needs your Character rested. Attack with what you can afford to leave rested, and keep a body back.",
    "Make them hold more than 6 cards at the end of their turn and the Leader does nothing.",
    "Count the 10-cost: Shanks rests every Character you have, so a [Blocker] does not save a lethal turn once they reach 10 DON!!.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-10-31",
      note: 'The deck\'s own 50: entry "G Jinbe", the list pilot "JinbeEnjoyerNr1" took to 1st, 4-0, at a Shop Event in North America on 16 Sep 2026.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_066.php",
      retrievedAt: "2026-10-12",
      note: "Bandai's feature deck for OP11-021, the source of the variants line.",
    },
  ],
};
