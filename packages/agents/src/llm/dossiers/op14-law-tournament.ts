import type { DeckStrategyDossier } from "./types.js";

export const op14LawTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Trafalgar Law - 9th Place ChinoizeCup #125",
  archetype:
    "Red go-wide {Supernovas} midrange behind OP14-001, as the EB-05 field builds it: a Leader that swaps the base power of two of your {Supernovas} or {Heart Pirates} Characters once a turn, EB05-001 Jewelry Bonney to fill the board, and the Red-Haired Pirates package for defence.",
  gamePlan: [
    "The Leader's [Activate: Main], once a turn: two of your {Supernovas} or {Heart Pirates} Characters swap base power for the turn. Lend a big body's base to a small one that can still attack, while the big one cannot -- played this turn, or already rested from its own attack.",
    "EB05-001 Jewelry Bonney is the turn-five play. Under this Leader her [On Play] draws 2 and plays up to two Characters with 2000 power or less from your hand, so she is three bodies, and her 7000 base is what you lend to the small ones.",
    "OP14-002 Urouge draws a card and K.O.s an opposing Character with 3000 base power or less when it attacks at 5000 power or more, and OP14-004 Cavendish gains [Rush] at 5000 or more. Both are 2000 bodies until the Leader lends them a bigger base.",
    "OP14-010 Basil Hawkins' [On K.O.] plays a {Supernovas} Character with 2000 power or less off the top five, and OP14-014 Kid plays a red 2000 body from hand: losing bodies and landing them both refill the board.",
    "EB05-006 Miss Buckingham Stussy, once a turn, takes a Life card into your hand to give a Character +3000 or −4000 for the turn: removal on your turn, or the push that makes an attack connect.",
    "OP14-009 Trafalgar Law has [Rush]; attack with it, then lend its 10000 base to a body that has not attacked.",
  ],
  mulligan: [
    "Keep a hand with a Character of cost 2 or less -- OP14-010 Hawkins, OP14-013 Luffy, OP14-004 Cavendish or OP14-011 Bartolomeo. The Leader needs two of your Characters on the board before its swap does anything.",
    "OP14-019 is a search Event, not a body: a hand with it and no cheap Character still has nothing to swap.",
  ],
  priorities: [
    "Do not swap two bodies that can both still attack: the total power across your attacks does not change, only which Character carries it.",
    "Play the cheap Characters before EB05-001 Bonney when you can, so her [On Play] draws 2 into a hand that still holds 2000-power bodies for her to play.",
    "EB05-006 Stussy spends a Life card. Use it when the −4000 removes a Character that matters or the +3000 makes a lethal or near-lethal attack connect, not every turn.",
    "OP17-005 Edward.Newgate sets your Leader's base power to 8000 until the end of your opponent's next turn, and costs 4 less while your opponent has a Character with 10000 power or more. Play it when the opponent's big attackers come out.",
    "PRB02-003 Lucky.Roux is a [Blocker] whose [On Play] trashes a Character with 6000 power or more from your hand for 2 cards; OP14-011 Bartolomeo is a [Blocker] only with 2 DON!! given.",
    "OP09-009 Benn.Beckman trashes one of your opponent's Characters with 6000 power or less; aim it at what your swaps cannot out-power.",
    "OP14-009 Law's [On Your Opponent's Attack] trashes 2 cards from hand to swap its 10000 base with your Leader's for that battle. Use it when the attack on your Leader would otherwise decide the game, not on every attack.",
  ],
  commonVariants: [
    "Creator builds of the same EB-05 shell play OP14-005 Killer, OP14-016 X.Drake, four OP14-014 Kid and EB05-061 Nami, and no Benn.Beckman, Shachi & Penguin or Ace & Sabo & Luffy.",
    "Bandai's feature deck for the Leader is all OP-14 {Supernovas}, with Zoro, Killer and X.Drake and no EB-05 cards.",
  ],
  commonCombos: [
    "EB05-001 Bonney plays OP14-002 Urouge and OP14-004 Cavendish from hand; the Leader swaps Bonney's 7000 base onto Cavendish, which gains [Rush] and attacks the turn it lands.",
    "OP14-009 Law attacks with [Rush], then the Leader lends Law's 10000 base to Urouge, which attacks for 10000, draws and K.O.s a small Character.",
    "OP14-010 Hawkins is K.O.'d and plays a 2000 {Supernovas} body off the top five: the board stays two wide for next turn's swap.",
  ],
  keyCardNumbers: [
    "OP14-001",
    "EB05-001",
    "EB05-006",
    "OP14-002",
    "OP14-004",
    "OP14-009",
    "OP17-005",
  ],
  counterplay: [
    "Most of the board is 2000 bodies that only hit hard after the Leader's swap. Remove the big body the swap borrows from -- Bonney, Law, Newgate -- and the small ones have nothing to borrow.",
    "EB05-006 Stussy spends their Life for removal and reach; the lower their Life, the more each use costs them.",
    "OP14-010 Hawkins and OP14-014 Kid replace themselves, so trading one removal for one Hawkins loses a card. Remove the payoffs, not the cheap bodies.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6ad092328a8383117e3ec30c/standings",
      retrievedAt: "2026-10-23",
      note: "The deck's own 50: the 9th-place list of 120 at [EB05] ChinoizeCup #125, an online event played on 20 Oct 2026.",
    },
    {
      url: "https://www.youtube.com/watch?v=bX2M4mR5yiY",
      retrievedAt: "2026-10-23",
      note: "NightingaleTCG's EB-05 Red Law deck tech: Bonney as the turn-five three-body play, lending her base to Cavendish and Urouge, and Stussy as removal; the source of the Killer, X.Drake and Nami variant line.",
    },
    {
      url: "https://www.youtube.com/watch?v=bzwTPXx3_hU",
      retrievedAt: "2026-10-23",
      note: "Car D. Kaizoku's EB-05 Red Law list and piloting notes, the second source for the creator variant line.",
    },
  ],
};
