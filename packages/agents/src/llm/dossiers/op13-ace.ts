import type { DeckStrategyDossier } from "./types.js";

export const op13AceDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Blue) Portgas.D.Ace - Official Feature Deck",
  archetype:
    "Red/Blue midrange behind OP13-002, a 3-Life Leader: draw off the damage you take and the 6000s you lose, wall with [Blocker]s, and break through with OP13-057 once both sides are low.",
  gamePlan: [
    "The Leader's [DON!! x1]: once a turn, when you take damage or one of your Characters with 6000 base power or more is K.O.'d, draw 1 card. It needs a DON!! given to the Leader, and on your opponent's turn that means one you gave it on yours. Leave one on the Leader whenever you expect to be attacked.",
    "The Leader's [On Your Opponent's Attack], once a turn: you may trash 1 card from hand to give the attacker −2000 for that battle. Spend it when it stops a hit or saves a Character; do not trash a card for an attack that still connects.",
    "Open with OP13-016 Monkey.D.Garp (look at 4, take a 3-cost or more) and OP13-043 Otama (at 3 Life or less, draw 2 and trash 1). You start at 3 Life, so Otama and OP13-054 Yamato draw from turn one.",
    "OP13-054 Yamato, OP13-119 Portgas.D.Ace, ST15-002 Edward.Newgate and OP13-042 Edward.Newgate each give a rested DON!! to your Leader on play: develop and arm the Leader's draw in the same action.",
    "OP13-119 also returns an opposing 5-cost or less to hand (they may play a 4-cost or less from hand in its place), and gains [Rush] at 3 Life or less. ST15-002 rests itself to K.O. a 5000-or-less Character.",
    "PRB02-008 Marco is a 6000 [Blocker] whose [On K.O.] draws 2: blocking with it and losing it is three cards with the Leader's draw. OP13-042 Edward.Newgate is a 12000 [Blocker] that draws 2, trashes 1 and gives your Leader and a Character two DON!! each.",
    "OP13-057: as a [Counter], +3000 to your Leader. As a [Main] at 1 Life or less, rest a DON!!: your opponent cannot activate [Blocker] when your Leader attacks this turn. Hold it for the turn their Life is gone.",
  ],
  mulligan: [
    "Keep a hand with OP13-016 Garp or OP13-043 Otama: they find and draw into the rest of the deck.",
    "A hand with neither has no early play that digs. Take a new hand.",
  ],
  priorities: [
    "Give the Leader a DON!! before ending a turn you expect to be attacked: it turns the first hit into a card.",
    "Trash a card for the Leader's −2000 only when the attack then fails, or when it keeps a Character alive. Pay with the card you need least -- not a [Counter] you will want this turn.",
    "OP13-046 Vista has [Double Attack]; once a turn it can save itself from removal by trashing a {Whitebeard Pirates} card from hand.",
    "OP13-007 Ace & Sabo & Luffy: give an active DON!! and trash it to give an opposing Character −3000 this turn -- a removal for ST15-002's 5000 K.O. or a lost battle.",
    "PRB02-002 Trafalgar Law gives −2000 when attacking, and once a turn shrinks by 2000 instead of leaving the field to your opponent's effect.",
    "Do not cast OP13-057's [Main] above 1 Life: it does nothing there. Keep it as a [Counter] until then.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader, built around drawing off damage and K.O.s and on [Blocker]s that replace themselves.",
  ],
  commonCombos: [
    "Block with PRB02-008 Marco while the Leader has a DON!!: Marco is K.O.'d, draws 2, and the Leader draws 1.",
    "OP13-054 Yamato or OP13-119 Ace on play gives the Leader its DON!!, so the turn you develop is also the turn the draw is armed.",
    "OP13-057's [Main] at 1 Life on the turn your opponent is at 0: the Leader's attack cannot be blocked.",
  ],
  keyCardNumbers: [
    "OP13-002",
    "OP13-016",
    "OP13-043",
    "OP13-054",
    "OP13-119",
    "PRB02-008",
    "OP13-042",
    "OP13-057",
  ],
  counterplay: [
    "Every hit you land while their Leader holds a DON!! gives them a card. Their Leader's draw is once a turn: the first hit pays them, the rest do not.",
    "K.O.ing their 6000s draws them a card; bounce and bottom-deck do not.",
    "At 1 Life their OP13-057 makes the Leader unblockable. Keep enough Counter in hand for the last attack rather than relying on a [Blocker].",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_082.php",
      retrievedAt: "2026-10-04",
      note: "Bandai's feature deck for OP13-002: the fifty, opening on Garp and Otama, giving the Leader DON!! through Yamato, OP13-119 and the Newgates, Marco's [On K.O.] stacking on the Leader's draw, and OP13-057's [Main] stopping [Blocker]s once the opponent's Life is gone.",
    },
  ],
};
