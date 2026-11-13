import type { DeckStrategyDossier } from "./types.js";

export const op12RosinanteTcgmmDossier: DeckStrategyDossier = {
  version: 1,
  deckId:
    "(Purple/Yellow) Donquixote Rosinante - TCG Match Making EB05 2026-11-12 #9",
  archetype:
    "Purple/Yellow OP12-061 Donquixote Rosinante as a [Trafalgar Law] midrange deck: twelve 4-cost Laws and four EB04-038 Rosinante & Law, which the Leader saves from a K.O. once a turn for a Life card, cheap searches that find them, DON!! ramp while at or under the opponent's DON!! count, and a {Navy} package -- OP16-065 Sakazuki, the OP16-078 Marineford Stage -- that the Leader's {Navy} type switches on.",
  gamePlan: [
    "Dig first. OP12-108 Donquixote Rosinante looks at 5 for a [Trafalgar Law]; OP16-064 Koby and OP16-078 Marineford look at 5 for a {Navy} card -- Rosinante, Rosinante & Law, Borsalino, Sakazuki or OP12-115.",
    "The Leader's [Activate: Main] pays DON!! −1 to make the turn's next [Trafalgar Law] of cost 4 or more cost 2 less. A 4-cost Law for 2 DON!! leaves room for a second play on the same turn; EB04-038 Rosinante & Law, which is also named [Trafalgar Law], costs 4 instead of 6.",
    "Ramp while behind on DON!!. P-093 Trafalgar Law adds a rested DON!! when your field holds no more DON!! than the opponent's, and EB04-038 Rosinante & Law draws 1 and adds an active one on the same condition. OP16-065 Sakazuki, under this {Navy} Leader, rests a DON!! once a turn to add two active.",
    "The Laws are the board, and most of them defend: P-093, ST10-010 and EB04-038 are [Blocker]s. The Leader's first clause takes the top Life card into hand instead of letting a [Trafalgar Law] be K.O.'d, once a turn -- block with a Law, lose a Life card to hand instead of the body, and keep the board.",
    "OP16-065 Sakazuki's [On Play] pays DON!! −1 to give an opposing Character −6000 until the end of the opponent's next turn: the deck's removal for a big body. OP09-077 K.O.s a Character of 6000 power or less for DON!! −2.",
    "EB04-058 Borsalino is a [Blocker] that adds a Life card at 2 or fewer, and OP17-114 Sweet 3 Generals adds one for 2 rested DON!!: the Life the Leader spends saving Laws comes back.",
  ],
  mulligan: [
    "Keep a 1-cost search -- OP12-108 Rosinante, OP16-064 Koby or OP16-078 Marineford -- or a 4-cost Law: P-088, P-093 or ST10-010.",
    "A hand whose only cheap cards are Events -- EB05-040, OP15-078, OP12-115 -- puts nothing on the board. Take a new one.",
  ],
  priorities: [
    "Spend the Leader's DON!! −1 discount on a turn that plays a Law and something else: it is DON!! off the field, which only pays when the 2 saved buy a second play.",
    "Mind the DON!! comparison before playing P-093 or EB04-038: their ramp needs your field at or under the opponent's DON!! count, so play them before a turn's other DON!! gains, or on the turn the opponent has ramped past you.",
    "The Leader's save takes a Life card into hand: count it as a card and a Life point. Let it save a Law that matters; a Law worth less than a Life card can be let go.",
    "EB05-040 You Need Me, Don't You?!!♡ returns an active DON!! to draw 3 and trash 1 under this {Donquixote Pirates} Leader, or Counters +2000 on the Leader. OP12-115 Counters +2000 and, at 2 or fewer Life, returns a [Trafalgar Law] from the trash to hand.",
    "ST10-010 Trafalgar Law's [On Play] pays DON!! −1 to trash 2 cards from the opponent's hand only when they hold 7 or more: hold it for a turn their hand is that full, or play it as a 4-cost [Blocker] without the clause.",
    "OP16-078 Marineford's [Activate: Main] pays DON!! −1 and rests it to draw 1 and trash 1: a late use for spare DON!!, not an early one.",
  ],
  commonVariants: [
    "The ChinoizeCup #125 2nd-place list for this Leader (20 Oct 2026, a training list here) plays two OP16-064 Koby, three ST10-010 and a wider purple package -- OP10-065, EB05-034, EB03-062, OP13-076 -- where this one plays four OP12-108 Rosinante, four Koby and Sweet 3 Generals.",
  ],
  commonCombos: [
    "Leader DON!! −1, then a 4-cost Law for 2 and a second 2-cost play the same turn.",
    "P-093 or EB04-038 played while at or under the opponent's DON!! count: a body and a DON!!, so next turn reaches the 7-cost Sakazuki.",
    "A Law blocks and would be K.O.'d; the Leader takes a Life card into hand instead and the Law stays.",
    "Sakazuki's −6000 on the opponent's best body, then attack it the same turn.",
  ],
  keyCardNumbers: [
    "OP12-061",
    "OP12-108",
    "P-093",
    "ST10-010",
    "EB04-038",
    "OP16-065",
    "OP16-078",
    "EB05-040",
  ],
  counterplay: [
    "The Leader saves one Law a turn: K.O. two in the same turn, or remove them by effects that do not K.O. -- bounce, bottom-deck, rest.",
    "Every save costs them a Life card. Press Life while forcing saves, and the low-Life turns come early.",
    "Keep your DON!! count low against P-093 and EB04-038: their ramp needs theirs at or under yours.",
    "Keep your hand under 7 cards while ST10-010 can still land.",
  ],
  sources: [
    {
      url: "https://www.patreon.com/tcgmatchmaking",
      retrievedAt: "2026-11-12",
      note: "The deck's own 50: the Purple/Yellow Rosinante list in TCG Match Making's EB05 Weekly Power Rankings of 12 Nov 2026, ranked 9th from a smaller sample, with a positive matchup against Xebec. A Patreon post with no pilot or event.",
    },
    {
      url: "https://play.limitlesstcg.com/tournament/6ad092328a8383117e3ec30c/standings",
      retrievedAt: "2026-10-23",
      note: "The 2nd-place OP12-061 list of 120 at [EB05] ChinoizeCup #125, an online event played on 20 Oct 2026: the variants line.",
    },
  ],
};
