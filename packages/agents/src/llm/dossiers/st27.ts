import type { DeckStrategyDossier } from "./types.js";

/**
 * ST-27, and unlike ST-26 this starter has a real piloting write-up: Bandai's
 * own "recommended deck" page is the same page the manifest's card list comes
 * from, and it runs an Early/Mid/End Game breakdown of how the list is meant to
 * be played. Everything below that names a sequence -- when to spend the
 * Leader's negation, which two K.O. clauses want a cost debuff first, which one
 * cannot use one, and Kuzan into Burgess as the free reload -- is that page's
 * claim rather than a reading of ours.
 *
 * The rest is read off the thirteen cards, and off the OP-09 Blackbeard package
 * this list shares with the OP-16 (Black/Yellow) Teach deck, whose dossier is
 * the other place OP09-093 and OP09-096 are described.
 */
export const st27Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Black) Marshall.D.Teach - Starter Deck 27",
  archetype:
    "ST-27 Black Blackbeard Pirates: a removal-control deck that pays for its interaction with its own hand and gets the cards back out of its trash",
  gamePlan: [
    "Read the Leader as a trade, not as a drawback. OP09-081 negates your own [On Play] effects -- which is why the list runs almost none -- and in exchange lets you trash 1 card from hand on any of your Main phases to negate your opponent's [On Play] effects until the end of their next turn. Bandai's guide is explicit that timing this well is the deck's main way to break up an opponent's plan.",
    "Every card the Leader trashes is a resource, not a loss. The trash is the deck's second board: OP09-086 Jesus Burgess gains +1000 power for every 4 cards in it, PRB02-014 Sabo costs 3 instead of 6 once it holds 15, and ST27-003 Kuzan and ST27-005 Marshall.D.Teach both play or draw cards back out of it.",
    "Refill with OP09-096 My Era...Begins!! and OP09-099 Fullalead. Both dig for a {Blackbeard Pirates} card and both put cards in the trash while they do it, so they answer the hand the Leader is spending and feed Burgess at the same time.",
    "The mid-game plan is a two-card K.O.: OP09-090 Doc Q reaches a cost of 1 or less and ST27-005 Marshall.D.Teach a cost of 3 or less, and neither ceiling reaches anything real on its own. EB01-048 Laboon (-4 cost), OP09-083 Van Augur (-3) and OP09-089 Stronger (-2) are what drop a body inside them. Debuff first, K.O. second, and both bodies rest to do it, so plan the turn before attacking.",
    "PRB02-015 Shiryu is the exception and must be played as one. Its [On K.O.] reads a *base* cost of 4 or less, which no cost debuff can widen -- Bandai's page says so directly. Play it as an early [Blocker] that takes a Character with it when it dies.",
    "Close with the trash you built. Burgess is the attacker once the trash is deep, ST27-003 Kuzan's [On K.O.] plays a Blackbeard Pirates body of cost 5 or less out of the trash rested -- Burgess for free, is the guide's own line -- and OP09-093 Marshall.D.Teach is the last turn: played and activated on the same turn it switches off the opponent's Leader, negates and locks down a Character, and blocks.",
  ],
  mulligan: [
    "Keep a hand that can act before turn 4. OP09-095 Laffitte and OP09-099 Fullalead both cost 1 and dig, and PRB02-015 Shiryu is a 4-cost Blocker that trades up -- any of them is a keep.",
    "Keep OP09-096 My Era...Begins!!: the deck has one searcher's worth of consistency and this is most of it.",
    "Ship a hand of 6- and 7-cost bodies. ST27-003 Kuzan, ST27-005 Marshall.D.Teach and PRB02-014 Sabo are all top end, and Sabo is only cheap once the trash is 15 deep, which is not a turn-one state.",
  ],
  priorities: [
    "Spend the Leader's [Activate: Main] on a turn where the opponent's next turn actually has an [On Play] to negate -- it is not once per turn, but each use costs a card, and against a deck with no [On Play] text it costs a card for nothing.",
    "Order the removal: cost debuffs (EB01-048, OP09-083, OP09-089) resolve before the K.O. clauses (OP09-090, ST27-005) that read the cost they lowered. All of them last only this turn.",
    "EB01-048 Laboon and ST27-005 Marshall.D.Teach both rest themselves to fire and both are repeatable, so the question every turn is whether the K.O. is worth the attack or the block that body would otherwise make.",
    'ST27-005\'s K.O. names "1 Character" with no side, so it can take one of your own -- a Shiryu you want to trade, or a Kuzan whose [On K.O.] you would rather have now. Do not do it by accident.',
    "OP09-086 Jesus Burgess cannot be K.O.'d by the opponent's effects, which makes it the body to leave in front of a removal deck; its power moves in steps of 4 trash cards, so count before attacking rather than after.",
    "OP09-093 Marshall.D.Teach only fires on the turn it is played, and the negation and the attack ban both run until the end of the opponent's next turn. Hold it for the turn that ends the game rather than casting it on curve.",
    "PRB02-014 Sabo is a 6-cost 6000 Blocker with a 2000 Counter until the trash reaches 15, and a 3-cost one after. Counting the trash before spending it as a Counter is a real decision.",
  ],
  commonVariants: [
    "This is Bandai's recommended list for ST-27: the sealed starter with four slots swapped for PRB02-014 Sabo, PRB02-015 Shiryu and EB01-048 Laboon. Competitive OP09-081 lists go further -- more OP-09 and OP-10 Blackbeard bodies and a second Stage -- but the Leader's trash-a-card negation is the axis of every build.",
  ],
  commonCombos: [
    "Cost debuff into K.O.: EB01-048 Laboon rests for -4 cost, then ST27-005 Marshall.D.Teach rests and K.O.s a Character of cost 3 or less -- together they take a 7-cost body off the board.",
    "ST27-003 Kuzan blocks, dies, and plays OP09-086 Jesus Burgess out of the trash rested for no cards from hand. Bandai's page names this pair as the end-game engine.",
    "ST27-005 Marshall.D.Teach dying is not a loss: its [On K.O.] adds any black card back from the trash, which in this deck is usually OP09-096 My Era...Begins!!.",
    "The Leader's trash-a-card cost and OP09-086 Jesus Burgess are the same clause read twice -- every negation is a quarter of a +1000, and the deck reaches 15 trash cards for PRB02-014 Sabo on the same schedule.",
  ],
  keyCardNumbers: [
    "OP09-081",
    "ST27-005",
    "ST27-003",
    "OP09-086",
    "PRB02-015",
    "OP09-093",
  ],
  counterplay: [
    "Make the Leader's negation cost them. It eats a card from a hand that has no repeatable draw, so a fast board forces them to choose between the negation and a body.",
    "Do not over-commit bodies at cost 3 or less into an untapped ST27-005, or bodies at cost 7 or less into one with a Laboon or a Van Augur standing beside it.",
    "Removal aimed at OP09-086 Jesus Burgess does not work -- it cannot be K.O.'d by effects. Bounce it, put it in Life, or attack it down instead.",
    "Trading with PRB02-015 Shiryu is what it wants. If you can attack past it or make it block a body you do not mind losing, do that rather than K.O.ing something they choose.",
    "The deck's trash is its clock. Games that end before it reaches 15-20 cards deny Burgess its power and Sabo its discount at once.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_076.php",
      retrievedAt: "2026-09-07",
      note: "Bandai's own recommended-deck page for ST-27: the card list and per-slot counts in the manifest, and the Early/Mid/End Game breakdown every sequencing claim above is taken from.",
    },
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569027",
      retrievedAt: "2026-09-07",
      note: "Bandai's ST-27 card list, with the printed text for the two set exclusives the list plays.",
    },
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569302",
      retrievedAt: "2026-09-07",
      note: "Bandai's PRB-02 card list: the printed text for PRB02-014 Sabo and PRB02-015 Shiryu, and the only English printing of EB01-048 Laboon.",
    },
  ],
};
