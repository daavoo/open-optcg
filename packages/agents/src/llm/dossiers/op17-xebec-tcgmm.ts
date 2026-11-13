import type { DeckStrategyDossier } from "./types.js";

export const op17XebecTcgmmDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Rocks.D.Xebec - TCG Match Making EB05 2026-11-12 #1",
  archetype:
    "OP-17 Blue Rocks D. Xebec draw engine as the EB-05 field builds it: the feature deck's tribe core with four OP17-052 Don Marlon, two EB05-028 Boa Hancock against a full hand, and no Stage.",
  gamePlan: [
    "Attack every turn the Leader can, and pay its [When Attacking] cost: trash 1 card from hand, reveal the top card, and draw 2 if the revealed card's type includes {Rocks Pirates}. Forty-six of the fifty are on the tribe, so the reveal almost always hits and the trade is almost always profitable.",
    "Four cards are not: two OP08-051 Buckin, whose printed type is 'Former Rocks Pirates', which no {Rocks Pirates} clause reads, and two EB05-028 Boa Hancock. Neither is a reveal hit or an OP17-118 deploy target, and both are the best cards to trash to the Leader once their job is done.",
    "Convert the hand into board control rather than damage: OP17-054 Miss Buckingham Stussy stops a Character attacking, OP17-046 Gloriosa bottoms a cost-5-or-less body, OP17-042 Kaido debuffs, OP17-048 Shiki debuffs on either turn.",
    "EB05-028 Boa Hancock makes the opponent trash 4 cards when they hold 9 or more. A deck that draws as hard as yours meets that hand size against other draw decks; hold her for that turn rather than playing her as a 4-cost body.",
    "Close with OP17-118 Rocks D. Xebec at 10 DON!!: draw 1, then play up to 2 {Rocks Pirates} cards with different names and a total cost of 9 or less straight out of hand. Pick the two as a pair, because the 9 is shared.",
    "Both 0-cost Events (OP17-055, OP17-056) are dual-purpose: Counters when needed, and cards the Leader is happy to trash when they are not.",
    "There is no Stage in this list, so its defence is three [On Your Opponent's Attack] clauses that each cost a card out of hand -- OP17-049 Charlotte Linlin for +1000, OP17-040 Edward.Newgate for +3000 on the Leader, OP17-048 Shiki for -3000 on an opposing Character -- plus the two Events and OP17-118.",
  ],
  mulligan: [
    "Keep a cheap body -- OP17-045 Kyo, OP17-050 Streusen, OP08-051 Buckin, OP17-052 Don Marlon -- so the early turns have something on the board and the Leader has something to trash.",
    "Keep at least one of the two Events: the tribe's Characters print no Counter, so the Events are most of the hand defence.",
  ],
  priorities: [
    "Only Buckin and Boa Hancock print a Counter among the Characters. A large hand is not a safe board -- count actual Counter power before assuming a defensive turn is covered.",
    "Fire an [On Your Opponent's Attack] pump only when it decides that battle by itself, except on the turn the opponent's board can finish you: then count the clauses together, since they all land on the same battle.",
    "When something asks you to trash a card from hand, pay with a body, not with OP17-055 or OP17-056. Buckin, and Boa Hancock against a small hand, are the best bodies to pay with: nothing the tribe reads asks for them.",
    "Keep the last OP17-118. It is the only card in the fifty that puts a board back after the opponent clears one; spare copies are fuel for the Leader.",
    "OP17-044 Captain John rested under a {Rocks Pirates} Leader forces the opponent to attack it and nothing else, and OP17-054's [Activate: Main] switches off an attacker for their turn. With one John in this list, the taunt is a card to hold for the turn their board can end the game.",
    "Develop the biggest body you can afford, not the most bodies: the 1- and 2-cost bodies are fuel and early board, not a wide board to hold.",
  ],
  commonVariants: [
    "Bandai's feature deck under this Leader runs four OP17-057 Fullalead, four OP17-042 Kaido and four OP17-044 Captain John, with two each of Streusen, Kyo and Don Marlon, in the slots this list gives to Buckin, Boa Hancock and the cheap bodies.",
  ],
  commonCombos: [
    "Leader attack trashes a spare card, reveals a Rocks Pirates card, draws 2 -- repeated every turn, this is the deck's whole engine.",
    "OP17-118 at 10 DON!! deploys two different tribe members totalling 9 or less, rebuilding a board the opponent has just cleared.",
    "OP17-052 Don Marlon returns a 0-cost blue Event from the trash, recycling a Counter the Leader trashed earlier; with four in the list, that is most of the Events coming back.",
  ],
  keyCardNumbers: [
    "OP17-039",
    "OP17-118",
    "OP17-054",
    "OP17-046",
    "OP17-049",
    "OP17-048",
    "EB05-028",
  ],
  counterplay: [
    "Pressure Life early: the deck spends cards and DON!! on draw and control rather than tempo, and is weakest before OP17-118 comes online.",
    "Attack into the counterless bodies: the tribe cannot defend itself from hand, and this list has no Stage to add +1000.",
    "Keep your hand under 9 cards while they can still play Boa Hancock.",
    "Expect a rebuilt board at 10 DON!!; hold removal for after OP17-118 lands.",
  ],
  sources: [
    {
      url: "https://www.patreon.com/tcgmatchmaking",
      retrievedAt: "2026-11-12",
      note: "TCG Match Making's EB05 Weekly Power Rankings of 12 Nov 2026: this fifty is its #1 list, described there as consistent with a big hand and almost no bad matchups.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_111.php",
      retrievedAt: "2026-08-30",
      note: "Bandai's feature deck for OP17-039, which the variants line compares against.",
    },
    {
      url: "https://note.com/happy_robin1243/n/nefebd1212d52",
      retrievedAt: "2026-08-30",
      note: "Archetype guide: the Leader must attack every turn or the hand does not grow.",
    },
  ],
};
