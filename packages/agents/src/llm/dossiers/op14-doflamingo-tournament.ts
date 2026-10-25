import type { DeckStrategyDossier } from "./types.js";

export const op14DoflamingoTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple) Donquixote Doflamingo - 1st Place Store Battle 2026-01-30",
  archetype:
    "Purple {Donquixote Pirates} control behind OP14-060, as a Store Battle winner builds it: the Leader's once-per-turn redirect onto [On K.O.] bodies, DON!! −1 Counter Events that OP14-068 Trebol pays back, and big Blockers in place of Pica.",
  gamePlan: [
    "The Leader's [On Your Opponent's Attack] [Once Per Turn] returns 1 DON!! to change the attack's target to your Leader or one of your {Donquixote Pirates} Characters -- every Character in this fifty. Send the attack onto a body with more power than it, or onto an [On K.O.] body: OP14-067 Dellinger adds a rested DON!! and looks at 5 for a {Donquixote Pirates} card, OP14-074 Monet draws 2, trashes 1 and adds 2 rested DON!!, OP14-072 Baby 5 puts the top card of your deck onto your Life, and OP14-063 Sugar plays a {Donquixote Pirates} Character of cost 5 or less from hand once the opponent has 6 or more DON!! on their field.",
    "The big bodies are where an attack does nothing: OP14-061 Vergo is a 7000, EB04-038 Rosinante & Law an 8000 [Blocker], OP10-071 Doflamingo a 9000 and OP14-069 Doflamingo a 10000.",
    "Your defence spends DON!!. The redirect returns one, and so do OP07-076 Slow-Slow Beam Sword (+2000 and rest an opposing Character) and OP14-078 Bullet String (+2000 for the battle and +2000 more this turn). OP14-068 Trebol adds a rested DON!! back, once per opponent's turn, the first time one returns -- keep Trebol on the board.",
    "Keep the DON!! count up: OP14-063 Sugar, OP14-072 Baby 5 and OP14-074 Monet add an active DON!! when played, EB04-038 adds one and draws while you have no more DON!! than your opponent, OP10-071 rests one on the opponent's attack to add an active one, and OP07-076's [Trigger] adds an active one.",
    "Open with OP14-067 Dellinger, OP10-065 Sugar or OP10-078 to find the {Donquixote Pirates} pieces.",
    "In the middle turns, OP10-071 Doflamingo's [On Play] returns 1 DON!! to play a {Donquixote Pirates} Character of cost 5 or less from hand -- Monet, Sugar or Baby 5, whose own DON!! comes back as they land.",
    "OP14-069 Doflamingo is the finisher: DON!! −3 to K.O. an opposing Character of cost 8 or less, or to stop up to 3 opposing Characters of cost 7 or less from resting until the end of the opponent's next End Phase.",
  ],
  mulligan: [
    "Keep a 1-cost digger -- OP14-067 Dellinger, OP10-065 Sugar or OP10-078 -- together with a body that adds DON!!: OP14-063 Sugar, OP14-072 Baby 5 or OP14-074 Monet.",
    "A hand without the digger cannot find the pieces, and one without a DON!! body leaves the Leader's redirects with nothing to refill them. Take a new hand.",
  ],
  priorities: [
    "Redirect only an attack that would connect, and only when it lands somewhere better: a body with more power than the attack first, an [On K.O.] body second. Moving an attack onto a body that dies with no [On K.O.] trades a DON!! and a card for one Life.",
    "Only one DON!! return a turn is paid back by Trebol. Choose between the redirect and a DON!! −1 Counter by which one saves more; a second return on the same turn is a DON!! you will not have on your own turn.",
    "OP14-061 Vergo can return a DON!! instead of losing a {Donquixote Pirates} Character to the opponent's effect, and its [When Attacking] DON!! −1 gives −2000. Each of those returns is one Trebol can answer on the opponent's turn.",
    "OP13-076 Divine Departure's [Main] rests 5 DON!! for −8000 on an opposing Character only while you have a DON!! given: give one to your Leader or a Character first. Its [Counter] is +3000 for a card from hand and costs no DON!!.",
    "OP10-072 Donquixote Rosinante's [On Play] trashes an Event to draw 2; trash a spare OP10-078. At the end of your turn with 7 or more DON!! it sets 2 DON!! active, which pays for OP10-071's add on the opponent's turn.",
    "OP14-069's K.O. needs your Leader to have the {Donquixote Pirates} type, which OP14-060 does. Choose the rest lock over the K.O. when the opponent has three or more attackers of cost 7 or less.",
    "When OP14-074 Monet's [On K.O.] trashes a card from your hand, trash a searcher that has done its job -- OP10-078 or OP10-065 Sugar -- never OP14-069 or OP10-071 Doflamingo.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader runs OP14-071 Pica, OP14-073 Machvise and OP14-076 Ever White, with more OP10-078, OP14-069 and Baby 5, where this list runs EB04-038 Rosinante & Law, OP10-072 Rosinante and the Counter Events Slow-Slow Beam Sword, Divine Departure and Bullet String.",
  ],
  commonCombos: [
    "Play OP14-067 Dellinger early; on the opponent's turn, redirect an attack onto it. Trebol adds back the DON!! the Leader spent, and Dellinger's [On K.O.] adds another and finds a {Donquixote Pirates} card.",
    "Play OP10-071 Doflamingo, return 1 DON!! to play OP14-074 Monet from hand; Monet's [On Play] adds that DON!! back active.",
    "With Trebol on the board, OP14-078 Bullet String costs a DON!! that comes straight back: +4000 for the turn.",
  ],
  keyCardNumbers: [
    "OP14-060",
    "OP14-068",
    "OP14-067",
    "OP14-074",
    "OP10-071",
    "OP14-069",
    "EB04-038",
    "OP14-078",
  ],
  counterplay: [
    "The redirect is once per turn. Attack with the smallest body first to draw it out, then send the real attack at the Leader.",
    "Each redirect and each DON!! −1 Counter spends a DON!! the Doflamingo player needs on their own turn, and Trebol pays back only the first. Many small attacks cost them more than one big one.",
    "The [On K.O.] bodies are the payoff, and Trebol is the engine. Remove Trebol first, and remove the [On K.O.] bodies with effects that do not K.O. them -- returning them to hand or deck, or resting them.",
    "OP07-076 Slow-Slow Beam Sword rests one of your Characters when it is used, so an attacker you were keeping back can be left rested on their turn.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op-14-eb-04-deck-list-the-azure-sea-seven/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "Neck310" took to 1st, 4-0, at a Store Battle in Germany on 30 Jan 2026 (entry "Purple Doffy").',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_091.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP14-060, the source of the variants line and of the Leader's redirect as this dossier describes it.",
    },
  ],
};
