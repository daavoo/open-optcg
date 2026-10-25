import type { DeckStrategyDossier } from "./types.js";

export const op13RogerTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Purple) Gol.D.Roger - 1st Place OPTCGSim 2026-04-22",
  archetype:
    "Red/Purple DON!! ramp behind OP13-003, as an online event winner builds it: the {Roger Pirates} ramp bodies to reach ten DON!!, then 10000-plus top end -- P-107 and OP09-118 Gol.D.Roger and OP09-004 Shanks -- and Leader buffs in place of OP13-064.",
  gamePlan: [
    "From your second DON!! Phase on, while you already have DON!! on the field, one of the DON!! that phase places goes onto your Leader instead of into your cost area. Plan each turn with one DON!! fewer to spend than you placed.",
    "The Leader is a 7000 that gets −2000 while you have 9 or fewer DON!! on your field. Reaching ten makes it a 7000 for good, so ramp every turn you can.",
    'Ramp early with OP13-072 Buggy and OP13-075 (both need a DON!! given to your Leader or a Character) and OP13-068 Douglas Bullet, which only needs your Leader\'s type to include "Roger Pirates". OP13-061 Inuarashi and OP13-063 Kouzuki Oden add one too while a DON!! is given, and OP13-067 Scopper Gaban draws 2, trashes 1 and adds one.',
    "At eight DON!!, OP13-071 Nekomamushi K.O.s a Character with 3000 base power or less, ST18-001 Uso-Hachi rests a Character with a cost of 5 or less, and Douglas Bullet becomes a 6000.",
    "At ten, play the top end. P-107 Gol.D.Roger is a 10000 whose [On Play] gives your Leader +2000 until the end of your opponent's next End Phase, and EB04-007 Roronoa Zoro does the same for 7 -- a 9000 Leader through their turn. OP09-004 Shanks has [Rush] and gives every opposing Character −1000 while it stays.",
    "OP09-118 Gol.D.Roger is the finisher: a 13000 with [Rush]. Once your opponent is at 0 Life, attacking their Leader with it wins either way -- the hit ends the game, and if they activate a [Blocker] while either player has 0 Life, you win.",
    "With a 10000-or-more Character on your field, ST23-001 Uta costs 4 less: a 2-cost [Blocker] beside the top end.",
  ],
  mulligan: [
    'Keep a hand with OP13-072 Buggy, OP13-068 Douglas Bullet, OP13-061 Inuarashi, OP13-075 or OP13-065 Shanks. Those are the cards cheap enough to add a DON!! before turn 5, and Shanks looks at 5 for a card whose type includes "Roger Pirates".',
    "P-107, OP09-118 and OP09-004 in the opening hand are late cards, not dead ones: keep them if the hand can ramp.",
  ],
  priorities: [
    "Give a DON!! to your Leader or a Character before playing a card whose ramp needs one. The Leader supplies one each DON!! Phase once your field has DON!!, but on the turn you go second the first phase gives none.",
    "P-107's +2000 needs ten DON!! on either player's field. Play it after the ramp gets you there, or when your opponent is already at ten.",
    'OP13-065 Shanks finds only cards whose type includes "Roger Pirates": Buggy, Douglas Bullet, Inuarashi, Oden, Scopper Gaban, Nekomamushi, P-107, OP09-118 and the two Events. It cannot find Zoro, OP09-004 Shanks, Uso-Hachi or Uta.',
    "OP13-007 Ace & Sabo & Luffy gives one of your active DON!! to your Leader or a Character and trashes itself for −3000 on an opposing Character. That given DON!! also turns on the ramp of Buggy and OP13-075 the same turn.",
    "OP13-076 Divine Departure rests 5 DON!! for −8000 on an opposing Character while you have a DON!! given, and is a +3000 [Counter] for a card from your hand. OP13-075's [Counter] is +3000 on your Leader for its own 1 DON!!.",
    "EB04-007 Zoro gains [Rush: Character] once per turn while your opponent has a Character with 8000 power or more: use it to attack that Character the turn Zoro lands.",
    "OP13-063 Kouzuki Oden and ST23-001 Uta are the deck's [Blocker]s. Keep one back while the Leader is still a 5000.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader is all OP-13 {Roger Pirates}: it runs OP13-064 Gol.D.Roger, whose [On Play] negates your own Leader, with OP13-066 Silvers Rayleigh, OP13-062 Crocus and OP13-060 Amatsuki Toki, where this list runs P-107, OP09-118, OP09-004 Shanks, EB04-007 Zoro, Uso-Hachi, Ace & Sabo & Luffy and Uta.",
  ],
  commonCombos: [
    "OP13-007 gives a DON!! to the Leader, then Buggy or OP13-075 adds a DON!!: a cut and a ramp in one turn.",
    "P-107 or EB04-007 Zoro at ten DON!!: a 9000 Leader through your opponent's turn.",
    "P-107 or OP09-004 Shanks on the board, then ST23-001 Uta for 2.",
    "Opponent at 0 Life: OP09-118 attacks with [Rush], and a block wins the game as surely as the hit.",
  ],
  keyCardNumbers: [
    "OP13-003",
    "OP13-072",
    "OP13-068",
    "OP13-075",
    "OP13-067",
    "P-107",
    "OP09-118",
    "OP09-004",
  ],
  counterplay: [
    "The deck is slow until ten DON!!, and its Leader is a 5000 until then. Pressure early, before the 10-costs land.",
    "Most of its ramp needs a DON!! given. Their Leader carries one from their second DON!! Phase, so the gate is rarely off -- but a turn where it is costs them the ramp.",
    "Do not go to 0 Life with OP09-118 Gol.D.Roger possible: a [Blocker] does not save you, it ends the game.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op15-eb04-deck-list-adventure-on-kamis-island/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "RubenTr" took to 1st, 6-0, at an online OPTCGSim event (Europe) on 22 Apr 2026 (entry "PR Roger").',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_083.php",
      retrievedAt: "2026-09-28",
      note: "Bandai's feature deck for OP13-003, the source of the variants line and of the Leader's DON!! Phase clause as this dossier describes it.",
    },
  ],
};
