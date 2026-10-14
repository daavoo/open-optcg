import type { DeckStrategyDossier } from "./types.js";

/**
 * ST-18 is a precon and an old one, and the dossier says so. There is no
 * tournament write-up to cite for a starter deck, and unlike OP09-061 this
 * Leader has no Bandai feature-deck page either -- so both sources below are
 * the product itself: Bandai's card list for the series, and the deck list the
 * same product ships with. Everything here is read off the fifteen cards.
 */
export const st18Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple) Monkey.D.Luffy - Starter Deck 18",
  archetype:
    'ST-18 Purple Land of Wano Straw Hats: a DON!!-count deck whose payoffs all read "8 or more DON!! on your field", and whose Leader buys that count with Life cards',
  gamePlan: [
    "Count DON!! before anything else. Nine of the fifteen identities do nothing at all below 8 DON!! on your field -- OP05-061, OP05-063, OP05-068, OP05-070, OP05-072, OP05-066, ST18-001, ST18-002 and ST18-003 -- so the question every turn is whether this turn's plays leave the field at 8 or drop it below.",
    "Use OP05-060's activation every turn you can. It adds 1 active DON!! from the DON!! deck for 1 card off the top of your Life cards, once per turn, and the DON!! it adds is usable the same turn. It is the only reason the deck reaches 8 DON!! before turn 8.",
    'The activation\'s own condition is "0 or 3 or more DON!! cards on your field", so it works on turn 1 and from turn 3 onward, and is dead only on turn 2. Taking it on turn 1 is real: it puts the deck a full DON!! ahead before the first body lands.',
    "Accept that the Life you spend is the game you are playing. The deck has no Life recursion and its Counters are 2000 at best, so every activation shortens your own clock -- take it while the board is even, and stop taking it once the opponent can close from the Life you would be left with.",
    "ST18-005 Luffy-Tarou is the deck's only double-spell turn, and it argues with the plan: its DON!! -1 plays a purple {Straw Hat Crew} Character of cost 5 or less free from hand, but paying it takes the field back below 8. Cast it on a turn nothing else was going to fire, or on the turn it wins the board outright.",
  ],
  mulligan: [
    "Keep a hand with OP05-076, the 1-cost Event: it looks at 3 and adds a {Straw Hat Crew} card, which is the only card selection the deck has and a fine turn-one play.",
    "Keep OP05-068 Chopa-Emon, the only 2-cost body. Its [On Play] is dead early, but a 3000 body on turn two is what stops the deck falling behind while the Leader spends Life.",
    "Keep a hand whose cheapest card is a 3-cost body -- OP05-061, OP05-067 or ST18-001. Turn two is the Leader's activation, which costs no card, so a hand that can act on turn three is on curve.",
    "Ship a hand whose cheapest card is a 4-drop. The deck has no searcher, so a top-heavy opener stays top-heavy, and four of the fifty are a 10-cost vanilla.",
  ],
  priorities: [
    "Before committing DON!! to a play, check whether it drops the field below 8 and whether anything on the board or in hand was going to read that number this turn. A 4-cost body cast down to 7 DON!! can cost you O-Robi's K.O. and San-Gorou's draw at once.",
    "ST18-003 San-Gorou's draw is [When Attacking] and [Once Per Turn]: it fires on the attack, not on the play, so attack with it even into a board that will trade, provided the field is still at 8.",
    "ST18-002 O-Nami is a 4-cost 2000 [Blocker] first and a card-filter second. Its [On Play] trashes 1 and draws 2 only at 8 DON!!, and the blocking body is the half you can rely on.",
    "ST18-004 Zoro-Juurou is the deck's deep search -- 5 cards, take 1 purple {Straw Hat Crew} -- and a 6000 body with no Counter. Playing it is always right when you need a specific piece; holding it does nothing, since it has no Counter to hold.",
    "OP05-067 Zoro-Juurou's ramp reads your own Life total: at 3 or less Life its [When Attacking] adds an active DON!!. That gets better as the Leader spends Life, so the two clauses work together late rather than early.",
    "OP05-066 Jinbe's +1000 needs all 10 DON!! on your field, which only happens after the Leader has added from the DON!! deck. Treat it as a 6000 [Blocker] and take the +1000 as a bonus.",
    "Hold OP05-061 and OP05-070 as 2000 Counters when the field is short of 8: below that number both are vanilla bodies, and 2000 off a Leader hit is worth more than a 4000 body.",
  ],
  commonVariants: [
    "This is the sealed product, unchanged, and it is an old one. Purple Luffy lists built since run the OP05-060 Leader with a cheaper curve and real removal; nothing in this fifty costs less than 3 except one Event and one 2-drop.",
  ],
  commonCombos: [
    "OP05-060's activation into an 8-DON!! payoff on the same turn: the DON!! it adds is active, so it can be the eighth card on the field that switches on O-Robi's K.O. or Hone-Kichi's -2000.",
    "OP05-068 Chopa-Emon sets a purple {Straw Hat Crew} Character of 6000 power or less active, which on a board of 6000 bodies is a second attack from ST18-003 San-Gorou or OP05-072 Hone-Kichi.",
    "ST18-005 Luffy-Tarou into ST18-002 O-Nami: an 8000 body and a [Blocker] in one turn, which is the deck's best defensive turn even though the DON!! -1 turns the [On Play]s off.",
    "OP05-076 and ST18-004 are the same search at two depths -- 3 cards at 1 cost, 5 cards at 4 cost with a 6000 body attached -- so a hand with both can find the piece twice.",
  ],
  keyCardNumbers: [
    "OP05-060",
    "ST18-005",
    "ST18-004",
    "OP05-076",
    "OP05-066",
    "P-041",
  ],
  counterplay: [
    "Attack the Life total the Leader is already spending. Each activation is a Life card this deck chose to give up, so a board that can close from 2 Life punishes the ramp rather than racing it.",
    "Keep their field below 8 DON!! where you can. Anything that makes them spend DON!! -- forcing blocks, trading bodies they have to replace -- turns most of their fifty into vanillas for a turn.",
    "Their removal is all soft: rest a cost-5, K.O. a cost-3, -2000 to two bodies. A single body above 5 cost and 5000 power is answered by none of it.",
    "The two [Blocker]s are OP05-066 Jinbe at 6000 and ST18-002 O-Nami at 2000. O-Nami blocks once and dies to almost anything, so an attack that forces it out is cheap.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569018",
      retrievedAt: "2026-09-11",
      note: "Bandai's own ST-18 card list: the fifteen identities the product contains, with the printed text every line above is read from.",
    },
    {
      url: "https://deckbuilder.egmanevents.com/api/gamedata/optcg",
      retrievedAt: "2026-09-11",
      note: "The ST18 entry in the structure-deck list, which is where the per-slot counts in the manifest come from -- 50 main-deck cards behind OP05-060.",
    },
  ],
};
