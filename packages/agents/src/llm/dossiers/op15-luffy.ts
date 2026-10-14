import type { DeckStrategyDossier } from "./types.js";

export const op15LuffyDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Yellow) Monkey.D.Luffy - Official Feature Deck",
  archetype:
    "Mono-Yellow {Sky Island} midrange behind OP15-098: a Leader that spends your Life to keep your big bodies on the field. When the opponent would remove one of your {Sky Island} Characters with 6000 base power or more, by an effect or in battle, you may add the top card of your Life to your hand instead. The deck refills its Life and closes with OP15-119 Luffy's [Rush].",
  gamePlan: [
    "The Leader has no activated ability. Its replacement is the deck: while you have Life, the opponent cannot remove OP15-107 Chopper, OP15-113 Zoro, OP15-114 Wyper, OP15-119 Luffy or OP15-109 Nico Robin -- each removal costs you one Life card, which goes to your hand, not to the trash.",
    "Early: play OP15-108 Nami, whose [On Play] looks at three cards and adds a {Sky Island} card, and land a 4-cost 6000 -- OP15-113 Roronoa Zoro or OP15-107 Chopper. Zoro's [On Play] trashes a card from hand to put the top of your deck on top of your Life, which pays for the next save.",
    "Mid game: OP15-109 Nico Robin takes a Life card into hand, banks a deck card on Life, and plays a {Sky Island} Character of cost 5 or less from your hand for free. OP15-114 Wyper turns a Life card face-up to give every opposing Character −2000 this turn and K.O. whatever reaches 0 -- then attack the rested Characters it shrank.",
    "EB03-055 Nico Robin is not {Sky Island} and the Leader does not protect it, but its [On K.O.] on the opponent's turn deals them 1 damage. Play it when you have no OP15-109.",
    "To close: OP15-119 Monkey.D.Luffy has [Rush] with 6 or more DON!! on your field. Every time the opponent activates an Event or a [Blocker], you may reveal your top Life card and Luffy gains +1000 per cost on it this turn -- so a Luffy attack is hard to stop with Counters or a block while you have Life. ST29-016 gives the Leader [Unblockable] for one turn.",
  ],
  mulligan: [
    "Keep a hand with OP15-113 Roronoa Zoro, OP15-107 Chopper or OP15-108 Nami: a protected 4-cost, or the 1-cost that digs for one.",
    "A hand with none of them has nothing for the Leader to protect in the first turns. Take a new hand.",
  ],
  priorities: [
    "When the Leader offers to save a {Sky Island} Character by adding your top Life card to hand, take it for a body you want to keep -- Luffy, Robin, Wyper, Zoro. Each save is a card in hand, but also one less Life between you and losing.",
    "Keep Life to spend: OP15-113 Zoro, OP15-109 Robin and OP15-116 Gum-Gum Golden Rifle put cards back on it. At 0 Life the Leader protects nothing and OP15-119 Luffy reveals nothing.",
    "OP15-119 Luffy's reveal is up to 1: take it whenever it is offered during your attack. A high-cost card on top of Life is worth thousands of power.",
    "Play OP15-119 Luffy on the turn you reach 6 DON!!, so it attacks at once.",
    "Cast OP15-114 Wyper when the −2000 K.O.s something or sets up a won battle; turning a Life card face-up only shows it to your opponent.",
    "OP15-102 Gan.Fall costs 3 less while you have a {Sky Island} Character with 7000 power or more, and rests an opposing Character with cost at or below their Life count.",
    "OP15-116 and ST29-016 are also +4000 and +3000 [Counter] Events for your Leader.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader: forty-eight Characters and Events at four copies, with two ST29-016 as the only two-of.",
  ],
  commonCombos: [
    "OP15-113 Roronoa Zoro banks a Life card, then the Leader spends it to keep Zoro in play.",
    "OP15-113 Zoro and OP15-116 Gum-Gum Golden Rifle on the same turn put two cards back on your Life.",
    "OP15-114 Wyper's −2000 on the opponent's board, then attack the Characters it left rested and small.",
    "OP15-119 Luffy with [Rush] at 6 DON!!, backed by a Life card to reveal against every Counter Event or [Blocker].",
  ],
  keyCardNumbers: [
    "OP15-098",
    "OP15-113",
    "OP15-109",
    "OP15-114",
    "OP15-119",
    "OP15-116",
    "OP15-108",
  ],
  counterplay: [
    "Every save costs a Life card, so removing a protected body is still damage. At 0 Life the Leader protects nothing.",
    "EB03-055 Nico Robin, OP15-102 Gan.Fall, OP15-108 Nami, ST29-004 Sanji, ST29-009 Nico Robin and EB03-053 Nami are outside the Leader's protection.",
    "Against OP15-119 Luffy, every Event and [Blocker] you use makes it bigger. Remove it before it attacks, or let the hit through.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_100.php",
      retrievedAt: "2026-09-27",
      note: "Bandai's feature deck for OP15-098, posted 3 April 2026: the fifty, Nami and Zoro early, Robin and Wyper mid game, EB03-055 as the stand-in for OP15-109, and the OP15-119 [Rush] finish, with OP15-116 refilling Life.",
    },
  ],
};
