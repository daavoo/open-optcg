import type { DeckStrategyDossier } from "./types.js";

export const op14LawTcgplayerDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Trafalgar Law - TCGplayer EB-05 Heroines Vol.2",
  archetype:
    "Red go-wide {Supernovas} midrange behind OP14-001, rebuilt around EB-05: a Leader that swaps the base power of two of your {Supernovas} or {Heart Pirates} Characters once a turn, EB05-001 Jewelry Bonney to refill the board, four OP14-009 Trafalgar Law as the [Rush] body whose base the swap lends out, and four each of the cheap bodies that come back -- Basil Hawkins, Bartolomeo, OP14-013 Luffy -- with Koby and Lucky.Roux to hold the board.",
  gamePlan: [
    "The Leader's [Activate: Main], once a turn: two of your {Supernovas} or {Heart Pirates} Characters swap base power for the turn. Lend a big body's base to a small one that can still attack, while the big one cannot -- played this turn, or already rested from its own attack.",
    "EB05-001 Jewelry Bonney is the turn-five play. Under this Leader her [On Play] draws 2 and plays up to two Characters with 2000 power or less from your hand, so she is three bodies, and her 7000 base is what you lend to the small ones.",
    "OP14-002 Urouge draws a card and K.O.s an opposing Character with 3000 base power or less when it attacks at 5000 power or more, and OP14-004 Cavendish gains [Rush] at 5000 or more. Both are 2000 bodies until the Leader lends them a bigger base.",
    "OP14-010 Basil Hawkins' [On K.O.] plays a {Supernovas} Character with 2000 power or less off the top five, and OP14-014 Kid, a [Blocker], plays a red 2000 body from hand: losing bodies and landing them both refill the board.",
    "OP14-019 looks 4 deep for a {Supernovas} or {Straw Hat Crew} Character, and OP14-013 Luffy 5 deep for a {Supernovas} card: four of each keep the curve and Bonney's targets coming.",
    "OP14-009 Trafalgar Law and OP14-015 Roronoa Zoro have [Rush]; attack with one, then lend its 10000 or 8000 base to a body that has not attacked. Zoro's attack also gives one of their Characters −1000 for the turn.",
  ],
  mulligan: [
    "Keep a hand with a Character of cost 2 or less -- OP14-010 Hawkins, OP14-013 Luffy, OP14-004 Cavendish or OP14-011 Bartolomeo. The Leader needs two of your Characters on the board before its swap does anything.",
    "OP14-019 is a search Event, not a body: a hand with it and no cheap Character still has nothing to swap.",
  ],
  priorities: [
    "Do not swap two bodies that can both still attack: the total power across your attacks does not change, only which Character carries it.",
    "Play the cheap Characters before EB05-001 Bonney when you can, so her [On Play] draws 2 into a hand that still holds 2000-power bodies for her to play.",
    "EB05-006 Miss Buckingham Stussy, once a turn, takes a Life card into your hand for +3000 or −4000 on a Character for the turn. Use it when the −4000 removes a Character that matters or the +3000 makes a lethal or near-lethal attack connect, not every turn.",
    "OP17-005 Edward.Newgate sets your Leader's base power to 8000 until the end of your opponent's next turn, and costs 4 less while your opponent has a Character with 10000 power or more. Play it when the opponent's big attackers come out.",
    "PRB02-003 Lucky.Roux is a [Blocker] whose [On Play] trashes a Character with 6000 power or more from your hand for 2 cards: pay with a spare Newgate or a third Law. OP14-011 Bartolomeo is a [Blocker] only with 2 DON!! given.",
    "OP15-009 Koby lets the Leader take −2000 for the turn instead of losing a Character of 7000 base power or less to the opponent's effect. Keep it out in front of Bonney.",
    "OP09-118 Gol.D.Roger is a 10-cost [Rush] that wins the game if a [Blocker] is used while either player is at 0 Life: the one-of that closes a game the opponent means to block out.",
    "OP14-009 Law's [On Your Opponent's Attack] trashes 2 cards from hand to swap its 10000 base with your Leader's for that battle. Use it when the attack on your Leader would otherwise decide the game, not on every attack.",
  ],
  commonVariants: [
    "TCG Match Making's ranked EB-05 list (12 Nov 2026) runs two EB04-005 Trafalgar Law, two OP14-005 Killer, two OP14-007 Jewelry Bonney and OP10-019 Divine Departure, with four Zoro and only two each of Hawkins, Koby, Lucky.Roux and OP14-019. This list plays the cheap bodies, the search and the protection at four instead.",
    "The ChinoizeCup #125 9th place list (20 Oct 2026) plays OP09-009 Benn.Beckman, OP14-006 Shachi & Penguin and OP13-007 Ace & Sabo & Luffy, and four EB05-006 Stussy and four Cavendish.",
    "Bandai's feature deck for the Leader is all OP-14 {Supernovas}, with Zoro, Killer and X.Drake and no EB-05 cards.",
  ],
  commonCombos: [
    "EB05-001 Bonney plays OP14-002 Urouge and OP14-004 Cavendish from hand; the Leader swaps Bonney's 7000 base onto Cavendish, which gains [Rush] and attacks the turn it lands.",
    "OP14-009 Law or OP14-015 Zoro attacks with [Rush], then the Leader lends its base to Urouge, which attacks at 8000 or more, draws and K.O.s a small Character.",
    "OP14-010 Hawkins is K.O.'d and plays a 2000 {Supernovas} body off the top five: the board stays two wide for next turn's swap.",
  ],
  keyCardNumbers: [
    "OP14-001",
    "EB05-001",
    "OP14-009",
    "OP14-002",
    "OP14-004",
    "OP14-010",
    "EB05-006",
    "OP17-005",
  ],
  counterplay: [
    "Most of the board is 2000 bodies that only hit hard after the Leader's swap. Remove the big body the swap borrows from -- Bonney, Law, Zoro, Newgate -- and the small ones have nothing to borrow.",
    "EB05-006 Stussy spends their Life for removal and reach; the lower their Life, the more each use costs them.",
    "OP14-010 Hawkins and OP14-014 Kid replace themselves, and OP15-009 Koby turns your removal into −2000 on their Leader. Remove the payoffs, not the cheap bodies, and remove Koby first when you can.",
  ],
  sources: [
    {
      url: "https://www.tcgplayer.com/content/article/6-One-Piece-Decks-that-Get-Way-Better-with-Heroines-Edition-Vol-2-EB-05/43bf2e6d-3dc8-4abd-8930-eb84f43e3c2f/",
      retrievedAt: "2026-11-25",
      note: "The deck's own 50: Kuranoo Narumi's Red Law list, embedded as \"#2 Red Law\" in Peter Day's TCGplayer article of 28 Oct 2026; an article list with no event placing. The article frames EB05-001 Bonney as the card that refills Law's board after it is cleared and EB05-006 Stussy as extra removal and reach.",
    },
    {
      url: "https://www.patreon.com/tcgmatchmaking",
      retrievedAt: "2026-11-12",
      note: "TCG Match Making's EB05 Weekly Power Rankings of 12 Nov 2026, whose 8th-ranked Red Law list is the first variants line.",
    },
    {
      url: "https://play.limitlesstcg.com/tournament/6ad092328a8383117e3ec30c/standings",
      retrievedAt: "2026-10-23",
      note: "The 9th-place list of 120 at [EB05] ChinoizeCup #125, an online event played on 20 Oct 2026: the second variants line.",
    },
    {
      url: "https://www.youtube.com/watch?v=bX2M4mR5yiY",
      retrievedAt: "2026-10-23",
      note: "NightingaleTCG's EB-05 Red Law deck tech: Bonney as the turn-five three-body play, lending her base to Cavendish and Urouge, and Stussy as removal.",
    },
  ],
};
