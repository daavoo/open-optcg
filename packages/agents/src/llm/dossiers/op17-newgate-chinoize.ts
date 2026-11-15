import type { DeckStrategyDossier } from "./types.js";

export const op17NewgateChinoizeDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Edward.Newgate - ChinoizeCup #115",
  archetype:
    "Mono-Red {Whitebeard Pirates} defensive grind behind OP17-001, as the OP-17 online field builds it: a Leader that turns any card in hand into +4000 on the opponent's turn, a fifty of 6000-power bodies that feed two draw engines, and two Gol.D.Roger as the closer.",
  gamePlan: [
    "Your hand is your Counter pile. Once per turn, when your opponent attacks, the Leader lets you trash one card from your hand to give itself or one of your Characters +4000 for that battle. It does not care which card, so a 10-cost you cannot cast yet, a used-up searcher or a card with no Counter is worth 4000 of defence.",
    "So every card you add to hand is defence on a later turn. OP17-019 looks five deep for a {Whitebeard Pirates} card, OP16-021 Moby Dick looks three deep and takes anything, and OP16-118 Portgas.D.Ace searches a {Whitebeard Pirates} card both when it enters and when it is K.O.'d. A search is a Counter here.",
    "This build also draws. ST30-004 Emporio.Ivankov is a 1-cost that, on play, reveals two Characters with 6000 power from your hand to draw 3 and then trash 2. PRB02-003 Lucky.Roux is a 4-cost [Blocker] whose [On Play] trashes a Character of 6000 power or more from your hand to draw 2. Twenty of the fifty are 6000-power Characters (OP12-002, ST30-005, OP16-118, OP17-002, OP17-003), so both almost always have something to show or pay with.",
    "Raise the number the 4000 is added to. OP17-008 Jozu and OP17-005 Edward.Newgate both set your Leader's base power to 8000 until the end of your opponent's next End Phase. That is a new base, still there on the turn they attack, so an 8000 Leader plus one trashed card defends at 12000.",
    "OP17-005 Edward.Newgate is a 10-cost 12000 that costs 4 less while your opponent has a Character with 10000 power or more. Against the format's big bodies it lands on 6 DON!!, with DON!! left for a Counter Event.",
    "OP09-118 Gol.D.Roger is the closer: a 10-cost 13000 with [Rush], and while it is on your field, if either player has 0 Life, your opponent activating a [Blocker] wins you the game. Once their Life is gone, Roger's attack cannot be blocked safely, and every other attack they would block becomes a loss for them.",
  ],
  mulligan: [
    "Keep a hand with OP17-019 or OP16-021 Moby Dick: both cost 1, are playable on your first turn, and turn one card into a better one.",
    "ST30-004 Emporio.Ivankov is also a keep when the hand holds two of OP12-002, ST30-005, OP16-118, OP17-002 or OP17-003 to reveal. Without two of those it is a 1-cost 2000 and nothing else.",
    "A hand of 10-costs (OP17-005, OP09-118) and no cheap play goes back. They are Leader fuel and Lucky.Roux fuel later, but an opening with nothing to do for three turns spends those turns trading cards for 4000 one at a time.",
  ],
  priorities: [
    "Use the Leader's ability on the attack that would actually connect, not the first one offered. It is [Once Per Turn] and lasts one battle, so an opponent with two attacks can bait it with the smaller one.",
    "Spend it on the Leader when your Life is what is under threat, and on a Character when losing that body costs more than a card. Both are legal targets.",
    "Trash the card you are least likely to use: a second OP09-118 or OP17-005 you cannot cast soon, a spent OP17-019, a surplus ST30-004. Keep the 2000 Counters (OP12-002, ST30-005) and OP17-017 for battles the ability has already been spent on.",
    "Cast OP17-008 Jozu or OP17-005 before ending your turn. Their base-8000 clause only matters on the opponent's turn, so the turn you cast them is the turn they defend.",
    "Play ST30-004 Ivankov early, when the trash 2 can pitch your clunkiest cards and the draw 3 digs for your curve. Reveal, do not trash, the 6000-power Characters: they stay in hand.",
    "Pay PRB02-003 Lucky.Roux's cost with a big body you cannot cast this game (a second OP09-118, or OP17-005 when nothing of theirs is at 10000 or more). It leaves a 2000 [Blocker] behind, which is worth more as a block than as an attacker.",
    "While OP16-118 Portgas.D.Ace is on your field, Characters with 8000 power in your hand have a 2000 Counter. That makes OP17-008 Jozu a Counter card instead of a dead one.",
    "Point OP17-003 Izo at a RESTED opposing Character only: its -6000 is printed for rested targets, so it answers a board that has already attacked. It has [Rush: Character], so it can follow up into the Character it just shrank.",
    "OP17-002 Atmos gains +3000 on your opponent's turn: it defends at 9000. Value it as a wall, not as an attacker.",
    "Hold OP17-017 Ga Ha Ha Ha!! for a battle where the target is a {Whitebeard Pirates} card -- the Leader and most of the Characters here, but not Ivankov, Lucky.Roux or Roger. Its +2000 only lands on such a target; the -2000 on an opposing card lands either way.",
    "Roger's win clause reads either player's Life. Bring it down when your opponent is at 0 Life, or when you are and they must block to survive.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader is built around OP17-007 Kouzuki Oden deploying OP17-003 Izo for free, with OP17-004 Inuarashi & Nekomamushi, OP17-006 Kingdew, OP17-009 Haruta, OP17-013 Portgas.D.Ace, OP17-015 Marco and OP17-016 Rakuyo. This list cuts all of those for vanilla 6000-power 2000-Counter bodies (OP12-002 Edward.Newgate, ST30-005 Jozu), the ST30-004 Ivankov and PRB02-003 Lucky.Roux draw engines and two OP09-118 Gol.D.Roger, and goes to four OP17-002 Atmos and four OP17-017.",
    "Other Newgate lists at the same event show the same direction with different counts: one kept ST30-004 Ivankov and ST30-005 Jozu alongside Marco and Haruta, another played OP09-118 and PRB02-003 with OP17-006 Kingdew and OP16 Whitebeard Pirates bodies. More Counter and fewer conditional bodies is the shared read.",
  ],
  commonCombos: [
    "OP17-008 Jozu or OP17-005 on your turn, then the Leader's ability on theirs: an 8000 base plus 4000 is a 12000 defence for one card.",
    "ST30-004 Ivankov revealing two 6000-power Characters: draw 3, trash the two cards you need least, and the trashed cards are cards the Leader would have burned anyway.",
    "PRB02-003 Lucky.Roux trashing an uncastable OP09-118 or OP17-005: two fresh cards and a [Blocker] for a card that was only Leader fuel.",
    "OP16-118 Portgas.D.Ace on the field turns OP17-008 Jozu in hand into a 2000 Counter, and when Ace is K.O.'d it searches the next {Whitebeard Pirates} card.",
    "Your opponent at 0 Life with OP09-118 Gol.D.Roger on your field: Roger attacks with [Rush] the turn it lands, and any [Blocker] they use loses them the game.",
  ],
  keyCardNumbers: [
    "OP17-001",
    "OP17-019",
    "OP16-021",
    "ST30-004",
    "PRB02-003",
    "OP17-008",
    "OP17-005",
    "OP16-118",
    "OP17-003",
    "OP09-118",
    "OP17-017",
  ],
  counterplay: [
    "Attack twice, or not at all. The Leader's +4000 is [Once Per Turn] and lasts one battle, so a small attack to draw it out followed by the real one is the cheapest way through.",
    "Its defence costs it a card every turn. Pressure that makes it spend the ability and its Counters every turn runs the hand down, and the base-8000 clauses only cover the turn after Jozu or OP17-005 is played.",
    "Keep nothing at 10000 power or more on the board if you can help it: that is what prices OP17-005 at 6 DON!! instead of 10.",
    "Its only removal is OP17-003 Izo's -6000 on a rested Character and OP17-017's -2000. It K.O.s nothing by effect, so a Character you do not rest is safe from everything but a battle.",
    "With OP09-118 Gol.D.Roger on its field and either player at 0 Life, do not activate a [Blocker]: it loses you the game. Plan your Life so you are not relying on blocks when Roger can land.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6ab4e5b8f127b1b52c28101c/standings",
      retrievedAt: "2026-11-15",
      note: 'The deck\'s own 50: the list "Maciasoptcg" registered for [OP17] ChinoizeCup #115, an online event of 128 played on 28 Sep 2026. The pilot dropped at 4-2 after six of seven Swiss rounds, so the list has no placing. The same standings carry the two other Newgate lists the variants line describes.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_113.php",
      retrievedAt: "2026-09-04",
      note: "Bandai's feature deck for OP17-001, the list the variants line compares against and the source of the Leader-base plan described above.",
    },
  ],
};
