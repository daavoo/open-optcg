import type { DeckStrategyDossier } from "./types.js";

export const st22AceNewgateTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Ace & Newgate - 1st Place Patriot Games 2025-09-07",
  archetype:
    "Blue ST22-001 Ace & Newgate as a bounce-and-tempo Whitebeard Pirates deck: every card in the fifty has the type, the Leader puts a card you chose on top of the deck once a turn, and OP08-052 Portgas.D.Ace and OP12-058 turn that known top card into a free body -- a cheap Character at 5 DON!!, or ST22-003 Edward.Newgate with [Rush] at 9. Atmos, Jozu and OP10-055 Marco return the opponent's Characters to hand along the way.",
  gamePlan: [
    "The Leader's [Activate: Main], once a turn, shows a Whitebeard Pirates card from your hand, draws one, then puts the shown card on top of your deck. Your hand stays the same size, and the next reveal or draw is the card you chose. Use it before every reveal that cares what the card is.",
    "All fourteen identities in the list are Whitebeard Pirates, so a reveal that only asks for the type -- ST22-003 Newgate's draw 2, ST22-012 Marco's +1000, ST22-016's +4000 -- hits unless your deck is empty. OP08-052 Ace and OP12-058 ask for more: a Character, within a cost cap. Those are the reveals the Leader sets up.",
    "OP08-052 Portgas.D.Ace (5 cost) reveals the top card and plays a Whitebeard Pirates Character costing 4 or less from it. Put OP08-040 Atmos, OP08-044 Kingdew, either Marco, ST22-002 Izo or ST22-011 Whitey Bay on top first, and Ace is two bodies for one card; a card that cannot be played goes to the top or bottom, your choice.",
    "OP12-058 is a 9-cost Event that plays the top card if it is a Whitebeard Pirates Character costing 9 or less, with [Rush] this turn. Put ST22-003 Edward.Newgate on top with the Leader and cast it: a 10000 [Double Attack] that attacks the turn it lands, and whose own [On Play] reveals again to draw 2. It cannot play OP08-043 Edward.Newgate, which costs 10. Its [Trigger] draws a card.",
    "Bounce is the removal. OP08-040 Atmos returns a cost 4 or less for two Whitebeard Pirates cards shown from hand; OP08-047 Jozu returns one of your other Characters to hand to return any Character costing 6 or less; OP10-055 Marco is a 3-cost [Blocker] whose [On K.O.] returns a cost 4 or less.",
    "ST22-005 Kouzuki Oden is the body that sticks: an opponent's effect cannot remove him while you can trash two cards from hand instead. OP08-043 Edward.Newgate is the late defensive play: at 2 Life or less, its [On Play] makes every Character the opponent has cost them two cards from hand to attack, through their next turn.",
  ],
  mulligan: [
    "Keep ST22-002 Izo: it looks five deep for any Whitebeard Pirates card but another Izo, so it finds the 4- or 5-cost the hand lacks.",
    "Keep a hand with a 3- to 5-cost play -- OP10-055 Marco, ST22-012 Marco, Kingdew, Atmos, or either Portgas.D.Ace.",
    "A hand of Newgates, Oden and OP12-058 with nothing under 5 takes a new hand.",
  ],
  priorities: [
    "Use the Leader's activation before OP08-052 Ace or OP12-058, and show the card you want them to hit. Before ST22-003 Newgate's or ST22-012 Marco's reveal it matters less, since any card hits those.",
    "Showing cards from hand spends nothing. Atmos, Kingdew and Whitey Bay each want two Whitebeard Pirates cards shown, so keep two in hand when one of them is the play.",
    "OP08-047 Jozu's cost is one of your own Characters back to hand. Return ST22-002 Izo, ST22-011 Whitey Bay or OP08-040 Atmos, whose [On Play] you get again on the replay, rather than a body you paid for.",
    "ST22-005 Oden's [Activate: Main] rests three DON!! and returns another of your Characters to hand to set Oden active: a second Oden attack, or an 8000 body standing for their turn, and another replayed [On Play].",
    "ST22-011 Whitey Bay's +2000 is on your Leader for this turn only: play it before the Leader attacks. OP08-044 Kingdew's +2000 is its own, also this turn.",
    "ST22-012 Marco's +1000 lasts through the opponent's next turn, and it trades one card from hand for an effect K.O. once a turn -- not for a bounce.",
    "ST22-002 Izo can trash itself when the opponent attacks to draw one and put one from hand on the bottom. Spend it when Izo would be lost anyway.",
    "Hold OP08-043 Edward.Newgate for the turn you are at 2 Life or less; above that its [On Play] does nothing and it is only a 12000 body for 10.",
    "Keep one DON!! for ST22-016 on their turn: +4000 from a reveal that does not miss. Kingdew, Whitey Bay and ST22-010 Portgas.D.Ace are the 2000 Counters in hand.",
  ],
  commonVariants: [
    "Bandai's ST-22 starter runs the vanillas Elmy, Decalvan Brothers, LittleOars Jr. and A.O., with ST22-006 Jozu, Squard, Vista, I Am Whitebeard!! and Fire Fist. This list cuts all of them for OP-08's Whitebeard Pirates -- Atmos, Kingdew, Jozu, Portgas.D.Ace and the 10-cost Edward.Newgate -- plus OP10-055 Marco and OP12-058, and runs four each of Izo, ST22-003 Newgate and the +4000 Counter.",
  ],
  commonCombos: [
    "Leader shows ST22-003 Newgate and puts it on top; OP12-058 plays it with [Rush]; Newgate's [On Play] reveals and draws 2; it attacks twice for damage that turn.",
    "Leader shows Atmos or Kingdew; OP08-052 Ace plays it off the top. Atmos played that way still runs its [On Play] bounce, if you can show two cards.",
    "OP08-047 Jozu returns your Atmos to bounce a cost 6 or less; replay Atmos to bounce a cost 4 or less.",
  ],
  keyCardNumbers: [
    "ST22-001",
    "ST22-003",
    "OP12-058",
    "OP08-052",
    "OP08-047",
    "OP08-040",
    "ST22-005",
    "ST22-002",
  ],
  counterplay: [
    "Their removal is bounce at cost 4 or less, and Jozu at 6 or less. A Character costing 7 or more is out of reach of all of it.",
    "Do not K.O. OP10-055 Marco cheaply: its [On K.O.] returns one of your cost 4 or less Characters.",
    "Count 9 DON!! as a [Rush] [Double Attack] turn: OP12-058 puts Newgate in play to attack immediately. Keep a [Blocker] or Counters for it.",
    "Do not spend effect removal on ST22-005 Oden while they hold two cards. Take Life down to 2 knowing OP08-043 Newgate may make every attack cost two cards.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op-12-deck-list-legacy-of-the-master/",
      retrievedAt: "2026-11-15",
      note: 'The deck\'s own 50: entry "Ace and Newgate", the list pilot "John Piece TCG" took to 1st, 5-0, at an event hosted by Patriot Games in the United Kingdom on 7 Sep 2025; the page lists the event type as "TB".',
    },
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569022",
      retrievedAt: "2026-10-04",
      note: "Bandai's own ST-22 card list, the source of the variants line.",
    },
  ],
};
