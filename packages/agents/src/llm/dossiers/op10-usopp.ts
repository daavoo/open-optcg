import type { DeckStrategyDossier } from "./types.js";

export const op10UsoppDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue/Black) Usopp - Official Feature Deck",
  archetype:
    "Blue/Black {Dressrosa} control behind OP10-042: a Leader that makes your {Dressrosa} Characters harder to remove and draws when one is taken on your opponent's turn, in a fifty that rests the Leader or its Stage to dig and to K.O., and keeps its bodies on the board.",
  gamePlan: [
    "The game is meant to go long. Protect your {Dressrosa} Characters, trade cards for answers, and win once the board and the hand are bigger than your opponent's.",
    "OP10-042 gives your {Dressrosa} Characters of cost 2 or more +1 cost on the field, which takes them out of the reach of \"cost N or less\" removal. On your opponent's turn, the first time one of them is removed by their effect or K.O.'d, you draw a card if you hold 5 or fewer.",
    "OP10-057 Leo, OP10-095 Roronoa Zoro, OP10-043 Moocy and OP10-083 Kouzuki Momonosuke all rest your Leader or your Stage as a cost. A rested Leader cannot attack that turn, so attack with the Leader first and rest OP04-096 Corrida Coliseum or the Leader afterwards only when the dig or the K.O. is worth more than the swing. Early in the game it usually is.",
    "Play OP04-096 Corrida Coliseum early. It is the second card the rest costs can use, and while your Leader is {Dressrosa} your {Dressrosa} Characters can attack Characters on the turn they are played.",
    "OP10-057 Leo looks at 5 and takes up to 2 {Dressrosa} cards other than Leo, then you trash 1 from your hand. OP15-040 Viola looks at 3 for a {Dressrosa} card. Both cost 1.",
    "OP10-095 Roronoa Zoro K.O.s a cost-4-or-less Character when it is played, then trashes 2 from the top of your deck. OP10-083 Momonosuke's −2 cost reaches a bigger target for Zoro.",
    "OP04-083 Sabo stops all of your Characters on the field from being K.O.'d by effects until your next turn, then draws 2 and trashes 2. Play it before a turn you expect removal.",
    "OP10-049 Sabo returns itself to your hand instead of another of your Characters with base cost 7 or less leaving the field to your opponent's effect. It cannot save another Sabo.",
    "OP10-090 Franky is a [Blocker]; when it is K.O.'d it plays a {Dressrosa} Character of cost 3 or less from your trash rested.",
    "The finish: OP10-058 Rebecca reveals up to 2 {Dressrosa} Characters of cost 7 or less from your hand, plays one and the other rested if it costs 4 or less. Play OP10-046 Kyros through her: Kyros returns a cost-5-or-less Character to its owner's hand, so remove a Blocker that would stop your attacks.",
  ],
  mulligan: [
    "Keep a hand with OP10-057 Leo, OP15-040 Viola or OP04-096 Corrida Coliseum.",
    "A hand with none of them has nothing that digs and nothing for the rest costs. Take a new hand.",
  ],
  priorities: [
    "Your Leader is a resource as well as an attacker. Decide each turn whether its swing or the dig and the K.O. a rest buys is worth more.",
    "Kyros returns any Character of cost 5 or less, including your own. Choose an opposing Blocker or your opponent's best attacker, or decline.",
    "OP15-047 Sanji, OP04-077 Ideo, OP10-090 Franky and OP04-083 Sabo are [Blocker]s. Spend Counter cards and Blockers to keep your Life high, since the deck needs time.",
    "OP10-118 Monkey.D.Luffy cannot be K.O.'d by your opponent's effects once per turn. Its [When Attacking] puts 3 cards from your trash at the bottom of your deck to make a hand of 5 or more lose a card.",
  ],
  commonVariants: [
    "Bandai's own recommended list for the Leader, with its four rotated cards replaced by Standard-legal {Dressrosa} cards of the same cost and role: Viola, Sanji, OP15-052 Leo and Momonosuke.",
  ],
  commonCombos: [
    "Rebecca plays Kyros and a 4-cost-or-less body at once. With Corrida Coliseum both can attack Characters the same turn.",
    "Zoro after a Momonosuke −2 K.O.s a Character that started at cost 6.",
    "OP04-083 Sabo before the opponent's turn makes a whole board survive their removal.",
  ],
  keyCardNumbers: [
    "OP10-042",
    "OP10-057",
    "OP04-096",
    "OP10-095",
    "OP04-083",
    "OP10-049",
    "OP10-058",
    "OP10-046",
  ],
  counterplay: [
    "Its Characters cost 1 more on the field, so cost-limited removal often misses. Win battles instead of spending removal.",
    "Every rest cost spends its Leader's attack. Pressure its Life early, before it has the card advantage to stabilise.",
    "OP10-049 Sabo answers effects, not battles. Attack the Characters it protects.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_058.php",
      retrievedAt: "2026-10-12",
      note: "Bandai's feature deck for OP10-042: a control deck for long games that protects its Dressrosa cards; Leo and Zoro rest the Leader or Stage and should be used proactively; Corrida Coliseum early so the Leader can attack in the midgame; Franky and Sabo to hold the board; Counters and Blockers to keep Life and hand stable; the Rebecca-into-Kyros finish bouncing Blockers.",
    },
  ],
};
