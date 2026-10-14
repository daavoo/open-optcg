import type { DeckStrategyDossier } from "./types.js";

export const op07VegapunkDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Yellow) Vegapunk - 1st Place Store Battle",
  archetype:
    "Yellow {Egghead} Trigger midrange behind OP07-097: the Leader never attacks, it plays an {Egghead} body for one DON!! each turn or banks it face-up on Life, where a [Trigger] plays it again when it is turned over.",
  gamePlan: [
    "Your Leader cannot attack. Its [Activate: Main], once per turn, rests 1 DON!! to play an {Egghead} card of cost 5 or less from your hand, or put it face-up on top of your Life. Use it every turn: for 1 DON!! it moves a card of up to cost 5 out of your hand, and your remaining DON!! still pay for the rest of it.",
    "OP07-111 Lilith, OP07-100 Edison, OP07-101 Shaka, OP07-105 Pythagoras and OP07-098 Atlas each have a [Trigger] that plays the card while your Leader is Vegapunk. Your Life is a second hand: a card taken as damage comes back as a body.",
    "Banking a card face-up on Life shows your opponent what their next hit turns over. Bank a body with a [Trigger] that plays itself, so the hit costs them a body on your side.",
    "OP07-111 Lilith and the Event OP07-114 add an {Egghead} card from the top 5. EB02-056 Vegapunk plays a {Scientist} Character of cost 5 or less straight from the top 5, so played by your Leader it is two bodies for 1 DON!!. OP09-117 Dereshi! adds up to 2 cards with a [Trigger].",
    "Much of the list switches on at 2 Life or less: OP07-100 Edison and EB02-054 Sanji draw 2, OP07-105 Pythagoras plays an {Egghead} 4-or-less from the trash rested on K.O., OP07-109 Monkey.D.Luffy trashes itself to K.O. a cost-4-or-less Character and draw, ST13-011 Portgas.D.Ace gains [Rush], and OP07-115 is a +3000 Counter. Taking damage is part of the plan.",
    "OP07-098 Atlas cannot be K.O.'d in battle while you have fewer Life cards than your opponent. OP07-117 Egghead sets an {Egghead} Character of cost 5 or less active at the end of your turn while you are at 3 Life or less, so a body can attack and still block.",
    "OP08-106 Nami trashes a [Trigger] card from hand to K.O. a cost-5-or-less Character. OP08-112 S-Snake stops a cost-6-or-less Character attacking through your opponent's next turn. OP10-112 Eustass\"Captain\"Kid rests itself to trash the top of your opponent's Life, and draws then trashes at the end of your turn once they are at 2 Life or less.",
  ],
  mulligan: [
    "Keep a hand with OP07-111 Lilith, EB02-056 Vegapunk, OP07-114 or OP09-117 Dereshi!: each finds the next {Egghead} card for your Leader to play.",
    "Almost every card in the deck is an {Egghead} body your Leader can play, so a hand without one of those four plays one body and then has nothing to find the next. Take a new hand.",
  ],
  priorities: [
    "Activate the Leader before you hard-cast anything, every turn you have an {Egghead} card of cost 5 or less in hand: it needs one active DON!!, and plays made first can spend it.",
    "Send the Leader's card face-up to Life rather than to the field, and send a body whose [Trigger] plays itself -- Shaka, Atlas, Pythagoras, Edison or Lilith. Each one is another hit your Leader can take that puts a body on your field when it lands; hard-cast the rest of your hand with the DON!! that is left.",
    "The Leader can only bank an {Egghead} Event, never play it: OP07-114 and OP07-115 are not Characters.",
    "When your top Life card is a face-up body that plays itself and you have 2 Life or more, let a Leader attack through rather than block it: the hit plays that body, and the block would only rest one.",
    "Do not spend Counter cards to keep Life you can afford to lose: at 2 Life or less Edison and Sanji draw, Pythagoras replays, Luffy removes, Ace rushes and OP07-115 becomes a +3000 Counter.",
    "Use OP07-109 Monkey.D.Luffy's [Activate: Main] only at 2 Life or less: above that the K.O. does not happen and it trashes itself for a single draw.",
    "Pay OP08-106 Nami's cost with a card whose [Trigger] you would least miss, such as a spare Event.",
    "Keep EB02-054 Sanji, Shaka and EB02-056 Vegapunk untapped as [Blocker]s once your Life is low.",
    'Play OP10-112 Eustass"Captain"Kid when trashing their top Life card brings them within reach of lethal; its end-of-turn draw only works once they are at 2 Life or less.',
  ],
  commonVariants: [
    "Every Vegapunk list on the aggregator shares the {Egghead} core: Lilith, Edison, Shaka, Pythagoras, Atlas and EB02-056 Vegapunk at or near four.",
    'This list adds a single ST13-011 Portgas.D.Ace and two OP10-112 Eustass"Captain"Kid as the non-{Egghead} finishers.',
  ],
  commonCombos: [
    "Hard-cast EB02-056 Vegapunk: it plays a {Scientist} body off the top 5, two bodies for one card.",
    "Leader banks Shaka or Atlas face-up on Life; your opponent's next hit turns it over and its [Trigger] plays it.",
    "At 2 Life, OP07-105 Pythagoras is K.O.'d and plays an {Egghead} 4-or-less back from the trash rested.",
    "OP07-117 Egghead at 3 Life or less sets the Character that attacked active again, so it blocks on your opponent's turn.",
  ],
  keyCardNumbers: [
    "OP07-097",
    "OP07-111",
    "EB02-056",
    "OP07-100",
    "OP07-101",
    "OP07-105",
    "OP07-098",
    "OP07-117",
    "OP07-115",
    "OP10-112",
  ],
  counterplay: [
    "Their Leader never attacks, so their pressure is all Characters. Removing bodies slows them more than racing does.",
    "Most of their bodies have a [Trigger] that plays itself. Every Life card you take may hand them a free body, and a face-up Life card tells you which one.",
    "They get stronger at 2 Life or less: Edison and Sanji draw, Pythagoras replays from the trash and OP07-115 becomes a +3000 Counter. Take their last Life cards in one turn rather than leaving them at 1 or 2.",
    "OP07-098 Atlas cannot be K.O.'d in battle while they have fewer Life cards than you; remove it with an effect.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-eb-02-deck-list-anime-25th-collection/",
      retrievedAt: "2026-10-09",
      note: 'The 1st place Store Battle list (Sci Fi Factory, 3-0) for OP07-097: the fifty, the {Egghead} core shared by the other Vegapunk lists on the page, and this list\'s Portgas.D.Ace and Eustass"Captain"Kid.',
    },
  ],
};
