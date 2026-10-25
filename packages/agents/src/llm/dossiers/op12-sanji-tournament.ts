import type { DeckStrategyDossier } from "./types.js";

export const op12SanjiTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue/Purple) Sanji - ChinoizeCup #116",
  archetype:
    "Blue/Purple Event control behind OP12-041, as the OP-17 field builds it: a {Straw Hat Crew} Leader that activates a cheap Event from hand for one DON!!, in a fifty that is mostly Events, with [Sanji] Characters that cost less when your DON!! is behind and Events that put them back on the field.",
  gamePlan: [
    "The Leader's [Activate: Main] returns 1 DON!! to activate a {Straw Hat Crew} Event of base cost 3 or less from your hand without paying its cost. In this list those are EB04-029, EB04-041 Stealth Black, OP11-061 Gum-Gum Jet Culverin, OP12-059 Concasser, OP12-060 Boeuf Burst and OP12-079. OP15-078 Mamaragan, OP13-076 Divine Departure and the 5- and 7-cost Events are not, so pay for those.",
    "Use the Leader's [Activate: Main] before you attack with the Leader: its [When Attacking] adds a rested DON!! from your DON!! deck while your field has no more DON!! than your opponent's, which refunds the DON!! the activation returned.",
    "OP07-064 Sanji is a 6-cost 6000 [Blocker] that costs 3 less in your hand while your field has at least 2 fewer DON!! than your opponent's. The Leader's DON!! −1, Gum-Gum Giant's −2, Mamaragan's −2 and Reiju's −1 all push you there. EB04-041 Stealth Black plays a [Sanji] with 6000 power or less from your hand or your trash once you have 4 or more DON!! on your field, so OP07-064 and OP12-070 come back after they fall.",
    "OP12-070 Sanji is a 3-cost 5000 that gains +1000 for every 5 Events in your trash. When your opponent's effect would remove it, you may return 1 DON!! to your DON!! deck instead. That does not protect it from a K.O. in battle.",
    "Your removal is Events. OP12-060 Boeuf Burst returns a cost-4-or-less Character or draws 2, OP11-061 bottoms a base-cost-4-or-less, OP06-058 Gravity Blade Raging Tiger bottoms two of cost 6 or less, EB01-039 Ragnaraku K.O.s a cost-8-or-less for DON!! −1, and OP15-078 Mamaragan draws and rests a 5000-or-less for DON!! −2. EB03-031 Vinsmoke Reiju pays DON!! −1 on play to activate the [Main] of an Event of cost 7 or less in your trash again.",
    "Dig with EB04-029 (a [Sanji] or an Event from the top 3) and OP12-079 (any card from the top 3); both cost 1 and are your first plays. OP13-043 Otama draws 2 and trashes 1 once you are at 3 Life or fewer, and OP16-056 Mr.3 trashes itself to draw 2 and stop a Character of cost 9 or less attacking through your opponent's next turn.",
    "OP17-049 Charlotte Linlin is a 5-cost 7000: on play your opponent chooses whether you draw 2 or they trash 2, and once on each of their turns it trashes a card from your hand to give your Leader or a Character +1000 in a battle.",
  ],
  mulligan: [
    "Keep a hand with EB04-029 or OP12-079: a 1-cost Event that finds the next card, which the Leader can also activate.",
    "OP09-078 Gum-Gum Giant, OP12-059 Concasser, OP13-076 Divine Departure and OP15-078 Mamaragan are Counters first, not openers. A hand with neither EB04-029 nor OP12-079 and no 3-cost Event for the Leader starts nothing. Take a new hand.",
  ],
  priorities: [
    "Spend the Leader's activation on a 3-cost Event, Boeuf Burst, Jet Culverin or Stealth Black, rather than a 1-cost one: it costs the same DON!! −1 either way. Never spend it on OP09-078 Gum-Gum Giant, which prints only a [Counter].",
    "Stealth Black checks for 4 DON!! on your field when it resolves, after the Leader's DON!! −1 has been paid. Count the DON!! left before you activate it through the Leader.",
    "Before you play OP07-064 Sanji, count both fields' DON!!. Paying a DON!! − cost first, the Leader's or Mamaragan's, can bring it down to 3.",
    "If OP12-060 Boeuf Burst has no Character of cost 4 or less to return, take its draw 2 instead.",
    "Play EB03-031 Reiju once the trash holds the Event you want again: Gravity Blade or Boeuf Burst. It is a second use of a card you already spent.",
    "OP12-059 Concasser's [Counter] gives the Leader +4000 only with 4 or more Events in your trash. Before that, use its [Main] to draw.",
    "OP09-078 Gum-Gum Giant pays DON!! −2 and a card from hand for +4000 and draws 2. EB04-029's [Counter] gives a [Sanji], your Leader included, +4000 for a card from hand. OP13-076's [Counter] is +3000 for a card. Mamaragan's is +1000 and draws a card while you have 6 or fewer DON!! on your field. Spend the cheaper ones on Life you need, and keep a Giant for the battle that matters.",
    "Use OP16-056 Mr.3 on your turn against the Character you least want attacking: it draws 2 and that Character cannot attack until the end of your opponent's next turn.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader is built around Characters that read the trash: OP12-063 Vinsmoke Reiju, OP12-066 Carne and OP12-065 Emporio.Ivankov gain [Blocker] at 4 Events, with OP12-071 Charlotte Pudding, OP12-062 Vinsmoke Sora, OP12-074 Patty, OP12-072 Zeff, OP12-078 Brochette Blow and OP09-077 Gum-Gum Lightning. This list drops those for OP07-064 Sanji and Stealth Black, EB03-031 Reiju, Otama, Mr.3, OP17-049 Charlotte Linlin and more removal Events.",
  ],
  commonCombos: [
    "The Leader's DON!! −1 activates Boeuf Burst or Jet Culverin for free, and the Leader's own attack then adds a rested DON!! back.",
    "Pay a DON!! − cost to drop your field 2 DON!! behind your opponent's, then play OP07-064 Sanji for 3.",
    "Stealth Black through the Leader puts an OP07-064 Sanji from your trash back on the field as a [Blocker].",
    "EB03-031 Reiju replays Gravity Blade Raging Tiger's [Main] from the trash: two Characters of cost 6 or less to the bottom of the deck.",
  ],
  keyCardNumbers: [
    "OP12-041",
    "EB04-029",
    "OP12-079",
    "EB04-041",
    "OP07-064",
    "OP12-070",
    "OP12-060",
    "EB03-031",
    "OP09-078",
  ],
  counterplay: [
    "Its DON!! − costs leave its field behind yours, which is what makes OP07-064 Sanji cheap. Expect a 6000 [Blocker] for 3 on any turn its field has 2 fewer DON!! than yours.",
    "OP12-070 Sanji can return a DON!! instead of leaving the field to your effects, but not to a K.O. in battle. Attack it rather than spending removal on it.",
    "Stealth Black brings a [Sanji] back from the trash, so K.O.ing one is not the end of it. Pressure Life and hand instead.",
    "Many of its Counters cost a card from hand as well as the Counter itself, so attacks into its Leader drain its hand fast.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6ab4e651e905c1db687493fe/standings",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list "Mister_Prince" registered for [OP17] ChinoizeCup #116, an online event of 119 played on 29 Sep 2026. The pilot dropped at 0-2, so the list has no placing.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_072.php",
      retrievedAt: "2026-10-04",
      note: "Bandai's feature deck for OP12-041, the source of the variants line and of the Leader's [Activate: Main] before its [When Attacking] as this dossier describes them.",
    },
  ],
};
