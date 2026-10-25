import type { DeckStrategyDossier } from "./types.js";

export const eb03ViviTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Blue) Nefeltari Vivi - 1st Place Store Battle 2026-05-28",
  archetype:
    "Red/Blue removal midrange behind EB03-001, as a Store Battle winner builds it: a Leader that rests to give an opposing Character −2000 and one of your Characters without a [When Attacking] effect [Rush], with draw-heavy {Alabasta} bodies, Blockers, and 8-to-10-cost removal at the top.",
  gamePlan: [
    "The Leader's [Activate: Main] is the deck: play a Character with an [On Play] first, let the [On Play] resolve, then rest the Leader to give that Character [Rush] and attack with it the same turn. The same activation gives one opposing Character −2000.",
    "[Rush] only matters on a Character played this turn, and only on one without a [When Attacking] effect -- every Character here except OP10-045 Cavendish. On a turn with nothing new to rush, attack with the Leader instead of resting it.",
    "The removal bodies are what the Leader rushes: OP06-007 Shanks K.O.s a Character with 10000 power or less, OP09-009 Benn.Beckman trashes one with 6000 power or less, and OP08-118 Silvers Rayleigh gives one −3000 and another −2000 until the end of your opponent's next turn, then K.O.s one with 3000 power or less.",
    "EB03-006 Nami draws 1 and EB04-023 Chaka & Pell draws 2 for −5000 on your active Leader this turn. That costs nothing on a turn the Leader rests to give them [Rush], which is the turn to play them. Chaka & Pell has [Double Attack], so a rushed one is two Life.",
    "EB04-024 Terracotta rests and trashes a card from hand to give an {Alabasta} Character [Unblockable]: Chaka & Pell, either Vivi or EB03-006 Nami.",
    "EB03-024 Vivi is a 5-cost [Blocker] whose [On Play] plays an {Alabasta} or {Straw Hat Crew} Character of cost 5 or less from hand -- EB03-006 Nami or OP11-054 Nami -- and then stops you playing more Characters this turn. Play your other Characters first.",
    "OP11-054 Nami is a [Blocker] that draws 3 and puts 2 back on top or bottom, since your Leader is multicolored. OP10-045 Cavendish draws 2 and trashes 1 each time it attacks.",
    "With a 10000-or-more Character on your field -- OP06-007 Shanks or OP05-118 Kaido -- ST23-001 Uta costs 4 less: a 2-cost [Blocker]. Kaido draws 4 if your opponent has 3 or fewer Life.",
  ],
  mulligan: [
    "Keep an early play -- OP13-012 Vivi, EB04-024 Terracotta, OP10-011 Chopper or OP10-045 Cavendish -- together with a Character of cost 5 or more for the Leader to give [Rush] to.",
    "A hand missing either half gives the Leader nothing to do for several turns. Take a new hand.",
  ],
  priorities: [
    "Rest the Leader for its ability only when a Character you played this turn, without a [When Attacking] effect, is on the board to take [Rush]. Give the [Rush] to the largest one, or to Chaka & Pell for its [Double Attack].",
    "Aim the −2000 at a rested opposing Character your attacker can then beat, since only rested Characters can be attacked; failing that, at an active [Blocker].",
    "When OP13-012 Vivi's search offers them, take EB03-006 Nami or OP11-054 Nami first, then EB03-024 Vivi, then OP10-011 Chopper.",
    "When the Leader's replacement, Terracotta or Cavendish asks you to trash a card from hand, trash OP13-012, a spare Terracotta or a second Uta before Shanks, Beckman, Rayleigh or Chaka & Pell.",
    "The Leader's replacement protects Characters with a base cost of 4 or more once a turn, so a rested removal body that has already attacked is still worth defending.",
    "OP10-011 Chopper is 6000 on the opponent's turn and a [Blocker]: leave it untapped in front of the Leader.",
    "OP13-058 Phoenix Pyreapple rests 1 DON!! to put a 3000-or-less Character on the bottom of its owner's deck, or is +3000 [Counter] on your Leader. OP06-058 Gravity Blade bottoms two Characters of cost 6 or less for 7.",
    "Do not give DON!! to the Leader after it has rested for its ability; it can no longer attack this turn.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader runs EB03-025 Hina, EB03-026 Boa Hancock, EB03-027 Marguerite, OP13-011 Cobra, OP13-054 Yamato, OP13-007 Ace & Sabo & Luffy and the EB03-011 Counter Event, where this list runs Chaka & Pell, Terracotta, OP11-054 Nami, Cavendish, Rayleigh, Kaido, Zoro, Uta and the two blue Events.",
  ],
  commonCombos: [
    "EB04-023 Chaka & Pell draws 2 off the Leader's −5000, then the Leader gives it [Rush] and Terracotta makes it [Unblockable]: two Life the turn it lands.",
    "OP06-007 Shanks K.O.s a Character, then the Leader gives Shanks [Rush] and it attacks for 12000; with Shanks on the board, ST23-001 Uta costs 2.",
    "OP08-118 Rayleigh shrinks two Characters and K.O.s a small one, then the Leader's −2000 and [Rush] let Rayleigh attack into one of the shrunk Characters.",
    "EB03-024 Vivi plays a Nami from hand for free, and the Leader gives that Nami [Rush] while the Vivi [Blocker] stays back.",
  ],
  keyCardNumbers: [
    "EB03-001",
    "OP13-012",
    "EB04-023",
    "EB04-024",
    "EB03-024",
    "OP11-054",
    "OP06-007",
    "OP08-118",
  ],
  counterplay: [
    "The deck's attacks come from Characters played that turn with [Rush], so each one is a removal effect first. Keep your important bodies above 10000 for Shanks and above 6000 for Beckman.",
    "Chaka & Pell with Terracotta is two unblockable Life in one attack. Keep a Counter for the Leader on the turn it can land, and remove Terracotta when you can.",
    "The Leader can save one base-cost-4-or-more Character a turn by trashing a card from hand; a second K.O. in the same turn gets through, and each save costs it a card.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op15-eb04-deck-list-adventure-on-kamis-island/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list Jorge Recabal took to 1st, 4-0, at a Store Battle in Chile on 28 May 2026 (entry "Vivi"); the same fifty also placed 21st at the Lille Regional on 11 Apr 2026.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_094.php",
      retrievedAt: "2026-09-27",
      note: "Bandai's feature deck for EB03-001, the source of the variants line and of the Leader's [Rush] line as this dossier describes it.",
    },
  ],
};
