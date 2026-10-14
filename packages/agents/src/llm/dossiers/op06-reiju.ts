import type { DeckStrategyDossier } from "./types.js";

export const op06ReijuDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue/Purple) Vinsmoke Reiju - 1st Place Store Battle",
  archetype:
    "Blue/Purple {GERMA 66} value behind OP06-042: return DON!! cards to draw off the Leader, swap small Vinsmoke siblings for their bigger namesakes, and keep your DON!! count at or under the opponent's so those [On Play]s work.",
  gamePlan: [
    "Your Leader draws 1 card the first time each of your turns a DON!! card on your field is returned to your DON!! deck. Return one every turn: it is a card drawn.",
    "OP06-068 Reiju (2 cost), OP06-064 Niji (3 cost) and OP06-060 Ichiji (4 cost) each pay DON!! −1 and trash themselves to play their bigger namesake from hand or trash: OP06-069 Reiju, OP06-065 Niji and OP06-061 Ichiji. The DON!! returned turns on the Leader's draw, and the namesake arrives without paying its cost.",
    "OP06-069 Reiju draws 2, OP06-065 Niji K.O.s an opposing cost-2-or-less Character or returns a cost-4-or-less one to hand, and OP06-061 Ichiji gives an opposing Character −2000 and gains [Rush]. Each of those [On Play]s, and OP06-063 Sora's and OP07-066 Chopper's, only works while your field has no more DON!! cards than your opponent's.",
    "Because of that condition you are usually behind on DON!! by choice. The DON!! −1 costs keep you there, and OP07-066 Chopper adds a rested DON!! when you have fallen behind.",
    "OP08-074 Black Maria adds up to 5 rested DON!! for one big turn, then at the end of it returns DON!! until the counts match the opponent's again -- which also triggers your Leader's draw if nothing else has this turn.",
    "OP10-063 Sanji, OP11-047 Reiju, OP06-078 GERMA 66 and the OP06-079 Kingdom of GERMA Stage look for a card with GERMA in its type. OP07-072 Porche pays DON!! −1 to dig for a {Foxy Pirates} card and then plays a purple Character with 4000 power or less from hand.",
    "OP06-062 Judge is the late game: DON!! −1 and two cards from hand play up to 4 {GERMA 66} Characters with different names and 4000 power or less from your trash.",
  ],
  mulligan: [
    "Keep a hand with OP06-068 Reiju, OP06-064 Niji, OP06-060 Ichiji, OP10-063 Sanji or Kingdom of GERMA: a small sibling turns on the Leader's draw, and Sanji and the Stage find one.",
    "A hand with none of them has nothing that returns a DON!! early, so the Leader draws nothing. Take a new hand.",
  ],
  priorities: [
    "Return a DON!! every turn you can. The first one each turn is a card; later ones in the same turn draw nothing.",
    "Count DON!! before you play an [On Play] namesake. If your field holds more DON!! cards than your opponent's, pay a DON!! −1 first, or the [On Play] does nothing.",
    "Swap a sibling into its namesake rather than hard-casting the namesake: the swap costs one DON!! and puts the namesake out for free.",
    "Do not hard-cast a namesake while your field holds more DON!! than the opponent's and its sibling is on your field or in your hand: its [On Play] does nothing from ahead, and the sibling plays the same card later for a DON!! −1 that levels the counts first.",
    "When Kingdom of GERMA, Sora or Judge asks you to trash a card from hand, trash OP06-061 Ichiji, OP06-065 Niji or OP06-069 Reiju first: their siblings play them from the trash as readily as from hand. Keep the small siblings and Judge.",
    "When a {GERMA} search shows the missing half of a sibling pair -- the namesake for a sibling you hold, or the sibling for a namesake in your hand or trash -- take it.",
    "Activate Black Maria last in the turn: her five rested DON!! keep your field ahead until the end of the turn, which switches off every [On Play] played after her.",
    "Play OP06-069 Reiju with 5 or fewer cards in hand, or its draw does not happen.",
    "Use OP06-065 Niji to clear a cheap Blocker before attacking, and OP06-061 Ichiji's −2000 to win a battle the same turn it gains [Rush].",
    "OP06-065 Niji's K.O. only reaches a cost-2-or-less Character; with none on the other side, take the bounce.",
    "Hold OP06-047 Pudding for when the opponent has built a hand: it sends their whole hand back and gives them a fresh 5.",
    "Save Judge until the trash holds several different {GERMA 66} bodies with 4000 power or less.",
  ],
  commonVariants: [
    "A Store Battle winning list from mid-2025: four each of the three sibling pairs, four Sanji, four OP11-047 Reiju, four Porche, four Chopper, four Black Maria and four Kingdom of GERMA, with single copies of Judge, Pudding, OP11-045 Niji and the GERMA 66 Event.",
  ],
  commonCombos: [
    "OP06-068 Reiju's DON!! −1 into OP06-069 Reiju: the Leader draws 1 for the returned DON!!, and Reiju draws 2 more.",
    "OP06-064 Niji's DON!! −1 into OP06-065 Niji with your DON!! now under the opponent's: bounce their cost-4 Character and draw off the Leader.",
    "Black Maria for a 5-DON!! turn that plays OP06-061 Ichiji or Judge from hand; the DON!! go back at end of turn and the Leader draws.",
  ],
  keyCardNumbers: [
    "OP06-042",
    "OP06-068",
    "OP06-069",
    "OP06-064",
    "OP06-065",
    "OP06-060",
    "OP06-061",
    "OP08-074",
    "OP10-063",
    "OP06-079",
    "OP06-062",
  ],
  counterplay: [
    "Their namesakes' [On Play]s only work while they have no more DON!! than you. They pay DON!! −1 to stay there, so their turns are smaller than their DON!! curve suggests; punish the turns where they spend DON!! returning rather than developing.",
    "Their Leader draws only once a turn, however many DON!! go back. The engine is card advantage, not tempo, so press Life early.",
    "OP06-065 Niji answers cost-2 and cost-4 bodies; a cost-5 or larger Character is out of reach of it.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-eb-02-deck-list-anime-25th-collection/",
      retrievedAt: "2026-10-09",
      note: "The 1st-place Store Battle list for OP06-042: the fifty, built on the three Vinsmoke sibling pairs, Black Maria's DON!! turn, and Sanji, OP11-047 Reiju, Porche and Kingdom of GERMA as the {GERMA} searchers.",
    },
  ],
};
