import type { DeckStrategyDossier } from "./types.js";

export const op13AceTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Blue) Portgas.D.Ace - 1st Place OPTCGSim 2026-06-01",
  archetype:
    "Red/Blue {Whitebeard Pirates} midrange behind OP13-002, as an online event winner builds it: dig and draw early, then land the two Edward.Newgates -- OP16-003 makes the Leader a [Double Attack] -- behind 8000 and 6000 [Blocker]s, with OP09-118 Gol.D.Roger as the finisher.",
  gamePlan: [
    "The Leader's [DON!! x1]: once a turn, when you take damage or one of your Characters with 6000 base power or more is K.O.'d, draw 1 card. It needs a DON!! given to the Leader, so leave one there when you expect to be attacked. Its [On Your Opponent's Attack] trashes a card from hand, once a turn, for −2000 on the attacker during that battle.",
    "Open with OP13-016 Monkey.D.Garp (look at 4, take a 3-cost or more), ST22-002 Izo (look at 5 for a {Whitebeard Pirates} card), OP13-043 Otama and OP13-054 Yamato. You start at 3 Life, so Otama and Yamato draw from the first turn; Yamato also gives a rested DON!! to your Leader.",
    "OP16-021 Moby Dick looks at 3 and takes 1, and later trashes itself to give a rested DON!! to your Leader or a Character -- an armed Leader draw on a turn you have nothing else to spend it on.",
    "OP16-003 Edward.Newgate is the engine: on your turn your Leader has [Double Attack] and +2000 while it stays. Its [On Play] reveals two 8000-power Characters from hand -- OP07-051 Boa Hancock, OP16-004 Curiel, OP16-017 LittleOars Jr. -- for −6000 on an opposing Character.",
    "ST22-015 I Am Whitebeard!! costs 8 and plays an [Edward.Newgate] from hand: OP13-042 for less than its 10, or OP16-003 with the Event's own rider -- take a Life card into hand to give your Leader +2000 until the end of your opponent's next turn.",
    "OP13-042 Edward.Newgate is a 12000 [Blocker] that draws 2, trashes 1 and gives your Leader and a Character two rested DON!! each. With it or OP16-003 on the field, OP16-017 LittleOars Jr. is a 4-cost 8000 [Blocker], and ST23-001 Uta costs 2.",
    "OP09-118 Gol.D.Roger is a 13000 with [Rush]. Once either player is at 0 Life, a [Blocker] your opponent activates wins you the game, so it attacks their Leader through any wall.",
  ],
  mulligan: [
    "Keep a hand with OP13-016 Garp, ST22-002 Izo or OP13-043 Otama: they find and draw into the rest of the deck.",
    "Newgates, ST22-015 and Roger in the opening hand are late cards, not dead ones: keep them beside a 1-cost dig.",
  ],
  priorities: [
    "Give the Leader a DON!! before ending a turn you expect to be attacked: it turns the first hit, or the K.O. of a 6000-or-more, into a card.",
    "Keep an 8000-power Character in hand for OP16-003's [On Play] reveal. It reveals them; it does not spend them.",
    "OP16-017 LittleOars Jr. is a 4000 without a {Whitebeard Pirates} Character costing 8 or more on your field. Play it after a Newgate, not before.",
    "OP07-051 Boa Hancock stops an opposing Character other than [Monkey.D.Luffy] attacking until the end of their next turn, and bottom-decks a Character costing 1 or less.",
    "OP08-047 Jozu returns one of your own Characters to hand to return an opposing 6-cost or less: bounce Izo or Garp and replay them for their [On Play].",
    "EB04-007 Roronoa Zoro gives your Leader +2000 until the end of your opponent's next End Phase, and gains [Rush: Character] once a turn while they have an 8000-or-more Character.",
    "PRB02-008 Marco is a 6000 [Blocker] whose [On K.O.] draws 2: losing it to a block with the Leader's DON!! armed is three cards.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader leans on OP13-119 Portgas.D.Ace, ST15-002 Edward.Newgate, OP13-046 Vista, PRB02-002 Trafalgar Law and OP13-057; this list replaces them with OP16-003 Newgate and its 8000-power reveal package, ST22-015, Izo, Moby Dick, Jozu, Boa Hancock, Zoro, Uta and Roger.",
  ],
  commonCombos: [
    "OP16-003 Newgate on the field, then the Leader attacks twice at +2000.",
    "ST22-015 into OP16-003: the Newgate lands, the −6000 reveal fires, and the Leader holds +2000 through your opponent's turn.",
    "A Newgate on the field, then OP16-017 LittleOars Jr. for 4 and ST23-001 Uta for 2: two 8000-and-4000 [Blocker]s in one turn.",
    "Opponent at 0 Life: OP09-118 attacks with [Rush], and a block wins the game as surely as the hit.",
  ],
  keyCardNumbers: [
    "OP13-002",
    "OP16-003",
    "OP13-042",
    "ST22-015",
    "ST22-002",
    "OP13-016",
    "PRB02-008",
    "OP09-118",
  ],
  counterplay: [
    "K.O. OP16-003 Edward.Newgate on sight: while it stays, their Leader attacks twice every turn and LittleOars Jr. is an 8000.",
    "Every hit you land while their Leader holds a DON!! gives them a card, but only the first each turn.",
    "Do not go to 0 Life with OP09-118 Gol.D.Roger possible: a [Blocker] does not save you, it ends the game.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "Asce712" took to 1st, 6-0, at an online OPTCGSim event (Europe) on 1 Jun 2026 (entry "BR Ace").',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_082.php",
      retrievedAt: "2026-10-04",
      note: "Bandai's feature deck for OP13-002, the source of the variants line and of the Leader's draw as this dossier describes it.",
    },
  ],
};
