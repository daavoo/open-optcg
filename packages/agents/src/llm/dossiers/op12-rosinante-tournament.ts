import type { DeckStrategyDossier } from "./types.js";

export const op12RosinanteTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple/Yellow) Donquixote Rosinante - 2nd Place ChinoizeCup #125",
  archetype:
    "Purple/Yellow Donquixote Rosinante behind OP12-061: four names of Trafalgar Law that ramp DON!! back while you hold no more than the opponent, {Navy} and {Donquixote Pirates} searchers, and removal paid for by returning DON!! -- a midrange deck that trades on the board and keeps its DON!! count low on purpose.",
  gamePlan: [
    "The Leader's [Activate: Main], once a turn, returns a DON!! to take 2 off the cost of the next [Trafalgar Law] of cost 4 or more you play from hand that turn. EB04-038 Rosinante & Law counts as a [Trafalgar Law], so it comes down at 4, and EB03-062 Trafalgar Law at 6.",
    "The Leader's other clause, once a turn: when one of your [Trafalgar Law] Characters would be K.O.'d, you may add the top card of your Life to your hand instead, and the Law stays. EB04-038 Rosinante & Law is covered too.",
    "DON!! parity is the engine. P-093 Trafalgar Law adds a rested DON!!, and EB04-038 Rosinante & Law draws a card and adds an active DON!!, only if you have no more DON!! on your field than the opponent. The Leader's discount, EB05-040, Sakazuki, Sugar, Mamaragan and ST10-010 all return DON!!, which is what keeps you at or under their count.",
    "Dig early: OP10-065 Sugar rests itself and a DON!! to find a {Donquixote Pirates} card in the top 5, OP16-064 Koby and OP16-078 Marineford each find a {Navy} card, and EB05-040 returns an active DON!! to draw 3 and trash 1.",
    "The removal spends DON!!: OP16-065 Sakazuki gives −6000 until the end of the opponent's next End Phase, EB05-034 Sugar gives −4000 once you have 7 or more DON!! on the field, and OP15-078 Mamaragan draws and rests a Character with 5000 power or less. Sakazuki then rests a DON!! once a turn to add 2 active DON!!, since the Leader is {Navy}.",
    "Most of the deck blocks: P-093, ST10-010, EB04-038 and EB04-058 Borsalino all have [Blocker]. Win by outlasting the opponent's board, not by racing their Life.",
  ],
  mulligan: [
    "Keep a hand with a 1-cost searcher (OP10-065 Sugar, OP16-064 Koby, OP16-078 Marineford), EB05-040, or a 4-cost Law to play on curve.",
    "A hand of only Counter Events, 6- and 7-costs finds nothing to do until turn five. Take a new one.",
  ],
  priorities: [
    "Play P-093 Trafalgar Law and EB04-038 Rosinante & Law while your DON!! count is at or under the opponent's; one turn later they may ramp nothing. Return DON!! with the Leader or an Event first if that brings you back to parity.",
    "Use the Leader's discount on the turn you play EB04-038 or EB03-062, not on a 4-cost Law: it costs a DON!! and saves 2 either way, but the big Laws are what it lets you play early.",
    "Hold ST10-010 Trafalgar Law until the opponent has 7 or more cards in hand; its [On Play] trashes 2 of them for a DON!!.",
    "Aim Sakazuki's −6000 at the body you cannot otherwise remove: it lasts through the opponent's next turn, so it also keeps that body from attacking well.",
    "EB05-034 Sugar's −4000 needs 7 DON!! on the field before you pay its DON!! −2. Count first.",
    "The Leader's K.O. replacement costs a Life card. Let a cheap Law go when your Life is low; keep EB04-038 and EB03-062.",
    "OP12-115 I Love You!! is a +2000 Counter that also returns a Trafalgar Law from the trash at 2 or fewer Life.",
    "EB04-058 Borsalino adds a Life card on play only at 2 or fewer Life; hold it for that turn when the board allows.",
  ],
  commonVariants: [
    "Car D. Kaizoku's list plays 2 OP09-077 Gum-Gum Lightning (DON!! −2: K.O. a Character with 6000 power or less) and a third OP16-064 Koby, where this list plays 1 EB03-062 Trafalgar Law, 1 OP07-076 Slow-Slow Beam Sword and 1 OP13-076 Divine Departure.",
  ],
  commonCombos: [
    "Leader's DON!! −1, then EB04-038 Rosinante & Law for 4: back at parity, it draws a card and returns the DON!! as an active one.",
    "Sakazuki's −6000, then attack the weakened body; the next turn Sakazuki ramps 2 DON!! back.",
    "EB03-062 Trafalgar Law trashes itself and a card from hand to add a Life card and play a Law of cost 7 or less from hand -- EB04-038 Rosinante & Law for a fresh [On Play].",
  ],
  keyCardNumbers: [
    "OP12-061",
    "P-093",
    "EB04-038",
    "ST10-010",
    "OP16-065",
    "EB05-040",
    "OP10-065",
    "OP16-078",
    "EB05-034",
  ],
  counterplay: [
    "Keep your own DON!! count low against them when you can: at parity or below theirs, P-093 and EB04-038 ramp nothing.",
    "Their Laws survive one K.O. a turn for a Life card. Bounce, rest or trash them instead, or K.O. a second Law the same turn.",
    "Keep your hand under 7 cards when ST10-010 Trafalgar Law can come down.",
    "Sakazuki's −6000 lasts through your turn. Attack with the bodies it did not hit, and save power boosts for the one it did.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6ad092328a8383117e3ec30c/standings",
      retrievedAt: "2026-10-23",
      note: "The deck's own 50: FlyestRaven's list, 2nd of 120 (6-1) at [EB05] ChinoizeCup #125 on 20 Oct 2026, an online event that allowed EB-05 ahead of its release.",
    },
    {
      url: "https://www.tcgplayer.com/content/article/6-One-Piece-Decks-that-Get-Way-Better-with-Heroines-Edition-Vol-2-EB-05/43bf2e6d-3dc8-4abd-8930-eb84f43e3c2f/",
      retrievedAt: "2026-11-12",
      note: "Peter Day's \"6 One Piece Decks that Get Way Better with Heroines Edition Vol.2 (EB-05)\" (28 Oct 2026): EB05-040 finds the Law on curve and draws, EB05-034 Sugar stretches the power reduction; Car D. Kaizoku's list in the variants line.",
    },
  ],
};
