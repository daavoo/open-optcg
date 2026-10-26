import type { DeckStrategyDossier } from "./types.js";

export const op12RayleighTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Silvers Rayleigh - 4th Place ChinoizeCup #124",
  archetype:
    "Red Event-reveal tempo behind OP12-001, as the first EB-05 field builds it: no card costs 5 or more, eighteen red Events feed every reveal, and cheap searchers and EB-05's Baby 5 and Nami keep a board of small bodies attacking above their size.",
  gamePlan: [
    "The Leader bans cards costing 5 or more from the deck, so every body is cheap. Its [Activate: Main], once per turn, reveals 2 Events from your hand to give one of your Characters with 4000 base power or less +2000 this turn. Holding two Events is the deck's currency: the Leader, OP12-015 Monkey.D.Luffy, OP12-009 Jinbe, EB05-004 Baby 5 and EB05-008 all ask for the same reveal.",
    "Keep Events coming. OP03-008 Buggy looks at 5 for a red Event, OP12-006 Shakuyaku and OP12-014 Boa Hancock look at 5 for a [Monkey.D.Luffy] or a red Event, and OP12-017 Color of Observation Haki gives a DON!! to the Leader to look at 4 for a red Event or a Character costing 3 or more.",
    "Go wide cheaply. OP12-015 Luffy reveals 2 Events to play a red Character with 3000 power or less from your hand and gives a rested DON!!; EB05-061 Nami plays a red Character costing 2 or less from your hand. Buggy, Shakuyaku, Hancock, OP10-016 Monet and OP10-005 Sanji are the bodies they put down.",
    "EB05-061 Nami protects the board once per turn: when your Character with 6000 base power or less would be removed by your opponent, you may take your top Life card into your hand instead. Every Character in this list qualifies.",
    "OP10-005 Sanji is a 6000 on your turn. With him or EB05-004 Baby 5 (a 6000 body) on the field, ST21-017 Gum-Gum Mole Pistol's −5000 also K.O.s a Character with 2000 power or less.",
    "EB05-008 Luffy, Now's Your Chance is removal on your turn and a big Counter on theirs. [Main]: give an active DON!! to your Leader and reveal 2 red Events to give an opposing rested Character −7000. [Counter]: +4000, which this deck always gets because it can never have a Character costing 5 or more.",
  ],
  mulligan: [
    "Keep a hand with a searcher -- Buggy, Shakuyaku or Hancock -- plus at least two Events, so the first reveal is ready by turn 3.",
    "A hand of only Events and no body to play before turn 3 gives the Leader nothing to pump. Take a new hand.",
  ],
  priorities: [
    "Revealing Events does not spend them. Reveal for the Leader and for Luffy, Jinbe or Baby 5 every time the clause is on offer, then keep the same Events for Counters.",
    "The Leader's +2000 only reaches a Character with 4000 base power or less. EB05-004 Baby 5 is a 6000 and never takes it.",
    "OP12-016 To Never Doubt--That Is Power! gives 2 active DON!! to your Leader so its attack cannot be blocked this turn: play it the turn a [Blocker] stands between the Leader and lethal. On defence it is a +2000 Counter.",
    "OP12-018 Color of the Supreme King Haki is a +2000 Counter that can rest one of your DON!! to give the opposing Leader and every opposing Character −1000 this turn. Rest a DON!! you do not need on their turn.",
    "OP10-016 Monet rests itself to give up to 2 rested DON!! to your Leader or a Character and −1000 to an opposing Character; Hancock trashes itself for the same gift. Use them after paying for the turn's plays, on the card that still has an attack.",
    "EB05-004 Baby 5's [On K.O.] plays a Character with 6000 power or less from your hand rested, so trading it off costs no board.",
    "OP12-009 Jinbe reveals 2 Events for [Rush] the turn it lands, then +1000 until the end of your opponent's next End Phase.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader is all OP-12: OP12-003 Crocus, OP12-004 Kouzuki Oden, OP12-007 Shanks, OP12-012 Buggy, OP12-013 Hatchan and OP12-019 Color of Arms Haki, with four Jinbe. This list runs EB-05's Baby 5, Nami and Luffy, Now's Your Chance, OP03-008 Buggy, OP10 Sanji and Monet and ST21-017 instead, and two Jinbe.",
  ],
  commonCombos: [
    "OP12-015 Luffy reveals 2 Events, plays Hancock or Buggy from hand and gives a rested DON!!: two bodies and a search for 5 DON!!.",
    "EB05-061 Nami plays Shakuyaku or Hancock: a search and a body, behind a once-per-turn shield on the whole board.",
    "Sanji on the board on your turn, then ST21-017: −5000 on one Character and a K.O. of a 2000 or less.",
    "EB05-008 on an opposing Character they rested to attack, then the Leader's reveal on an attacker.",
  ],
  keyCardNumbers: [
    "OP12-001",
    "OP12-015",
    "EB05-061",
    "EB05-008",
    "EB05-004",
    "OP03-008",
    "OP12-014",
    "OP12-016",
  ],
  counterplay: [
    "The deck's bodies are small and its tricks need two Events revealed. Attack the hand: a turn with fewer than two Events turns off the Leader, Luffy and EB05-008's [Main].",
    "Nami's shield pays with a Life card into their hand; it buys them cards, so removing Nami first is worth more than removing the body she protects.",
    "Every Counter Event in the list is red and costed 1 or less, and EB05-008 is +4000. Make the attacks that matter overshoot by more than one Counter.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6ad09157115c12b73a5a4654/standings",
      retrievedAt: "2026-10-24",
      note: 'The deck\'s own 50: the list pilot "Spartacus2224" took to 4th of 128 (6-1) at [EB05] ChinoizeCup #124, an online event on 19 Oct 2026 that allowed EB-05 cards ahead of their 30 Oct English release.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_073.php",
      retrievedAt: "2026-10-04",
      note: "Bandai's feature deck for OP12-001, the source of the variants line.",
    },
  ],
};
