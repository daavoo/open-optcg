import type { DeckStrategyDossier } from "./types.js";

export const op06ReijuRegionalDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue/Purple) Vinsmoke Reiju - Top 32 Regional 2025-09-27",
  archetype:
    "Blue/Purple {GERMA 66} value behind OP06-042: return DON!! cards to draw off the Leader, swap the small Reiju and Ichiji for their bigger namesakes, and keep your DON!! count at or under the opponent's so those [On Play]s work -- or two under it, where OP06-072 Cosette becomes a [Blocker].",
  gamePlan: [
    "Your Leader draws 1 card the first time each of your turns a DON!! card on your field is returned to your DON!! deck. Return one every turn: it is a card drawn.",
    "OP06-068 Reiju (2 cost) and OP06-060 Ichiji (4 cost) each pay DON!! −1 and trash themselves to play their bigger namesake from hand or trash: a 4-cost Reiju, or a 7-cost Ichiji. The DON!! returned turns on the Leader's draw, and the namesake arrives without paying its cost.",
    "OP06-060 Ichiji's swap plays either 7-cost Ichiji. OP06-061 gives an opposing Character −2000 and gains [Rush] while your field has no more DON!! than the opponent's; OP11-043 is a [Blocker] that gives your Leader or a Character +1000 in a battle on the opponent's attack while every Character you have is a GERMA type. Take OP06-061 on your turn to attack, OP11-043 when the board needs a wall.",
    "OP06-069 Reiju draws 2 with 5 or fewer cards in hand, and it, OP06-061 Ichiji, OP06-063 Sora and OP07-066 Chopper only work while your field has no more DON!! cards than your opponent's. The DON!! −1 costs keep you there, and Chopper adds a rested DON!! when you have fallen behind.",
    "OP06-072 Cosette is a 1-cost [Blocker] only while your field has at least 2 fewer DON!! cards than the opponent's. Returning DON!! is what switches it on.",
    "OP08-074 Black Maria adds up to 5 rested DON!! for one big turn, then at the end of it returns DON!! until the counts match the opponent's again -- which also triggers your Leader's draw if nothing else has this turn.",
    "OP10-063 Sanji, OP11-047 Reiju and the OP06-079 Kingdom of GERMA Stage look for a card with GERMA in its type; OP11-047 trashes what it does not take, which feeds Sora and Judge. OP07-072 Porche pays DON!! −1 to dig for a {Foxy Pirates} card and then plays a purple Character with 4000 power or less from hand.",
    "OP06-062 Judge is the late game: DON!! −1 and two cards from hand play up to 4 {GERMA 66} Characters with different names and 4000 power or less from your trash.",
  ],
  mulligan: [
    "Keep a hand with OP06-068 Reiju, OP06-060 Ichiji, OP10-063 Sanji or Kingdom of GERMA: a small sibling turns on the Leader's draw, and Sanji and the Stage find one.",
    "A hand with none of them has nothing that returns a DON!! early, so the Leader draws nothing. Take a new hand.",
  ],
  priorities: [
    "Return a DON!! every turn you can. The first one each turn is a card; later ones in the same turn draw nothing.",
    "Count DON!! before you play an [On Play] namesake. If your field holds more DON!! cards than your opponent's, pay a DON!! −1 first, or the [On Play] does nothing.",
    "Swap a sibling into its namesake rather than hard-casting the namesake: the swap costs one DON!! and puts the namesake out for free.",
    "Do not hard-cast a namesake while your field holds more DON!! than the opponent's and its sibling is on your field or in your hand: its [On Play] does nothing from ahead, and the sibling plays the same card later for a DON!! −1 that levels the counts first.",
    "When Kingdom of GERMA, Sora or Judge asks you to trash a card from hand, trash a 7-cost Ichiji or OP06-069 Reiju first: the small siblings play them from the trash as readily as from hand. Keep the small siblings and Judge.",
    "When a GERMA search shows the missing half of a sibling pair -- the namesake for a sibling you hold, or the sibling for a namesake in your hand or trash -- take it.",
    "Activate Black Maria last in the turn: her five rested DON!! keep your field ahead until the end of the turn, which switches off every [On Play] played after her.",
    "Play OP06-069 Reiju with 5 or fewer cards in hand, or its draw does not happen.",
    "OP11-043 Ichiji's +1000 needs every Character you control to be a GERMA type. Porche and Chopper are {Foxy Pirates} and Black Maria is {Animal Kingdom Pirates}; with any of them on the field, the +1000 does not fire.",
    "Save Judge until the trash holds several different {GERMA 66} bodies with 4000 power or less.",
  ],
  commonVariants: [
    "Earlier Store Battle lists for this Leader run the third sibling pair, OP06-064 and OP06-065 Niji, with OP06-047 Pudding, OP11-045 Niji and the OP06-078 GERMA 66 Event. This list cuts them for three Cosette, two OP11-043 Ichiji and two more Sora.",
  ],
  commonCombos: [
    "OP06-068 Reiju's DON!! −1 into OP06-069 Reiju: the Leader draws 1 for the returned DON!!, and Reiju draws 2 more.",
    "OP06-060 Ichiji's DON!! −1 into OP06-061 Ichiji with your DON!! now under the opponent's: −2000 on their Blocker, then Ichiji attacks the same turn on [Rush].",
    "Black Maria for a 5-DON!! turn that plays Ichiji or Judge from hand; the DON!! go back at end of turn and the Leader draws.",
  ],
  keyCardNumbers: [
    "OP06-042",
    "OP06-068",
    "OP06-069",
    "OP06-060",
    "OP06-061",
    "OP11-043",
    "OP06-072",
    "OP08-074",
    "OP10-063",
    "OP06-079",
    "OP06-062",
  ],
  counterplay: [
    "Their namesakes' [On Play]s only work while they have no more DON!! than you. They pay DON!! −1 to stay there, so their turns are smaller than their DON!! curve suggests; punish the turns where they spend DON!! returning rather than developing.",
    "Their Leader draws only once a turn, however many DON!! go back. The engine is card advantage, not tempo, so press Life early.",
    "Cosette blocks only while they are 2 or more DON!! behind you; a turn they spend Black Maria's DON!! leaves it a 0-power body.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op-12-deck-list-legacy-of-the-master/",
      retrievedAt: "2026-11-06",
      note: 'The deck\'s own 50: entry "Reiju", the list pilot "Svinci" took to the top 32 of a 1024-player VictoryRoad Regional in Europe on 27 Sep 2025.',
    },
    {
      url: "https://onepiecetopdecks.com/deck-list/english-eb-02-deck-list-anime-25th-collection/",
      retrievedAt: "2026-10-09",
      note: "The 1st-place Store Battle list for OP06-042, the source of the variants line: the three Vinsmoke sibling pairs, Black Maria's DON!! turn, and Sanji, OP11-047 Reiju, Porche and Kingdom of GERMA as the GERMA searchers.",
    },
  ],
};
