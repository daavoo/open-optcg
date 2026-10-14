import type { DeckStrategyDossier } from "./types.js";

export const op17XebecOpenDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Rocks.D.Xebec - Open OPTCG",
  archetype:
    "OP-17 Blue Rocks D. Xebec draw engine on a lower curve: the feature deck's tribe core with more cheap draw bodies, three OP08-051 Buckin, and no Stage.",
  gamePlan: [
    "Attack every turn the Leader can, and pay its [When Attacking] cost: trash 1 card from hand, reveal the top card, and draw 2 if the revealed card's type includes {Rocks Pirates}. Forty-seven of the fifty are on the tribe, so the reveal almost always hits and the trade is almost always profitable.",
    "OP08-051 Buckin is the three cards that are not: its printed type is 'Former Rocks Pirates', which no {Rocks Pirates} clause reads. It is a 1-cost body for the early turns beside OP17-050 Streusen, and nothing more -- not a reveal hit, not an OP17-118 deploy target.",
    "Convert the hand into board control rather than damage: OP17-054 Miss Buckingham Stussy stops a Character attacking, OP17-046 Gloriosa bottoms a cost-5-or-less body, OP17-042 Kaido debuffs, OP17-048 Shiki debuffs on either turn.",
    "Close with OP17-118 Rocks D. Xebec at 10 DON!!: draw 1, then play up to 2 {Rocks Pirates} cards with different names and a total cost of 9 or less straight out of hand. Pick the two as a pair, because the 9 is shared.",
    "Both 0-cost Events (OP17-055, OP17-056) are dual-purpose: Counters when needed, and cards the Leader is happy to trash when they are not.",
    "There is no Stage in this list, so its defence is three [On Your Opponent's Attack] clauses that each cost a card out of hand -- OP17-049 Charlotte Linlin for +1000, OP17-040 Edward.Newgate for +3000 on the Leader, OP17-048 Shiki for -3000 on an opposing Character -- plus the two Events and OP17-118.",
  ],
  mulligan: [
    "Keep a cheap body -- OP17-050 Streusen, OP17-045 Kyo, OP08-051 Buckin -- so the early turns have something on the board and the Leader has something to trash.",
    "Keep at least one of the two Events: with no Character in the list printing a Counter, they are the entire hand defence.",
  ],
  priorities: [
    "No Character in this list has a printed Counter. A large hand is not a safe board -- count actual Counter power before assuming a defensive turn is covered.",
    "Fire an [On Your Opponent's Attack] pump only when it decides that battle by itself, except on the turn the opponent's board can finish you: then count the clauses together, since they all land on the same battle.",
    "When something asks you to trash a card from hand, pay with a body, not with OP17-055 or OP17-056. Buckin is the best body to pay with once the board has one: it does nothing the tribe reads.",
    "Keep the last OP17-118. It is the only card in the fifty that puts a board back after the opponent clears one; spare copies are fuel for the Leader.",
    "OP17-044 Captain John rested under a {Rocks Pirates} Leader forces the opponent to attack it and nothing else, and OP17-054's [Activate: Main] switches off an attacker for their turn. With two John in this list rather than four, the taunt is a card to hold for the turn their board can end the game.",
    "Develop the biggest body you can afford, not the most bodies: the 1- and 2-cost bodies are fuel and early board, not a wide board to hold.",
  ],
  commonVariants: [
    "Bandai's feature deck under this Leader runs four OP17-057 Fullalead, four OP17-042 Kaido and four OP17-044 Captain John, with two each of Streusen, Kyo and Don Marlon, in the slots this list gives to Buckin and the cheap bodies.",
  ],
  commonCombos: [
    "Leader attack trashes a spare card, reveals a Rocks Pirates card, draws 2 -- repeated every turn, this is the deck's whole engine.",
    "OP17-118 at 10 DON!! deploys two different tribe members totalling 9 or less, rebuilding a board the opponent has just cleared.",
    "OP17-052 Don Marlon returns a 0-cost blue Event from the trash, recycling a Counter the Leader trashed earlier.",
  ],
  keyCardNumbers: [
    "OP17-039",
    "OP17-118",
    "OP17-054",
    "OP17-046",
    "OP17-049",
    "OP17-048",
  ],
  counterplay: [
    "Pressure Life early: the deck spends cards and DON!! on draw and control rather than tempo, and is weakest before OP17-118 comes online.",
    "Attack into the counterless bodies: the tribe cannot defend itself from hand, and this list has no Stage to add +1000.",
    "Expect a rebuilt board at 10 DON!!; hold removal for after OP17-118 lands.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_111.php",
      retrievedAt: "2026-08-30",
      note: "Bandai's feature deck for OP17-039, which the variants line compares against. This deck's own 50 was supplied by the maintainer.",
    },
    {
      url: "https://note.com/happy_robin1243/n/nefebd1212d52",
      retrievedAt: "2026-08-30",
      note: "Archetype guide: the Leader must attack every turn or the hand does not grow.",
    },
  ],
};
