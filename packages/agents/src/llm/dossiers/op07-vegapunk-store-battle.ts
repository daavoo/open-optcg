import type { DeckStrategyDossier } from "./types.js";

export const op07VegapunkStoreBattleDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Yellow) Vegapunk - 1st Place Store Battle 2026-06-19",
  archetype:
    "Yellow {Egghead} Trigger midrange behind OP07-097: the Leader never attacks, it plays an {Egghead} body for one DON!! each turn or banks it face-up on Life, where a [Trigger] plays it again when it is turned over; this build adds Life-gain Characters and big Yellow finishers.",
  gamePlan: [
    "Your Leader cannot attack. Its [Activate: Main], once per turn, rests 1 DON!! to play an {Egghead} card of cost 5 or less from your hand, or put it face-up on top of your Life. Use it every turn: for 1 DON!! it moves a card of up to cost 5 out of your hand, and your remaining DON!! still pay for the rest of it.",
    "Your Leader starts on 2 Life. EB04-058 Borsalino adds a card to your Life and EB03-058 Lilith draws a card on your turn while you are at 2 Life or fewer, so both work from the first turn you can play them. OP07-117 Egghead works at 3 Life or fewer.",
    "OP07-111 Lilith, EB03-058 Lilith, OP07-101 Shaka and OP07-098 Atlas each have a [Trigger] that plays the card while your Leader is Vegapunk. OP08-106 Nami's [Trigger] activates its K.O., and OP07-107 Franky's draws a card and plays it at 1 Life or fewer. Your Life is a second hand: a card taken as damage comes back as a body or an effect.",
    "Banking a card face-up on Life shows your opponent what their next hit turns over. Bank a body with a [Trigger] that plays itself, so the hit costs them a body on your side.",
    "Dig with OP13-113 Lilith (a [Trigger] card from the top 4, for 1), OP07-111 Lilith (an {Egghead} card from the top 5) and OP09-117 Dereshi! (up to two [Trigger] cards from the top 5).",
    "OP16-119 Marshall.D.Teach is an 8-cost 10000 that puts the best of your top 3 on your Life; its [Trigger] negates an opposing Character's effect and K.O.s a cost-5-or-less. OP13-108 Jewelry Bonney is a 9-cost 10000 that gains [Rush] behind your {Egghead} Leader and puts the top of your opponent's Life into their hand.",
    "OP15-119 Monkey.D.Luffy is a 5-cost 7000 with [Rush] once you have 6 or more DON!! on your field. When your opponent activates an Event or a [Blocker], it reveals your top Life card and gains +1000 for each point of that card's cost, so a high-cost card on top of your Life makes its attacks hard to stop.",
    "OP07-098 Atlas cannot be K.O.'d in battle while you have fewer Life cards than your opponent. OP07-117 Egghead sets an {Egghead} Character of cost 5 or less active at the end of your turn while you are at 3 Life or less, so a body can attack and still block. OP08-106 Nami trashes a [Trigger] card from hand to K.O. a cost-5-or-less Character.",
  ],
  mulligan: [
    "Keep a hand with OP13-113 Lilith, OP07-111 Lilith or OP09-117 Dereshi!: each finds the next card for your Leader to play.",
    "Most of the deck is an {Egghead} body your Leader can play, so a hand without one of those three plays one body and then has nothing to find the next. Take a new hand.",
  ],
  priorities: [
    "Activate the Leader before you hard-cast anything, every turn you have an {Egghead} card of cost 5 or less in hand: it needs one active DON!!, and plays made first can spend it.",
    "Send the Leader's card face-up to Life rather than to the field when it is a body whose [Trigger] plays itself, such as Shaka, Atlas or a Lilith: the hit your Leader takes puts it on your field. Hard-cast the rest of your hand with the DON!! that is left.",
    "OP15-119 Monkey.D.Luffy, OP16-119 Teach and OP13-108 Bonney are not {Egghead} cards or are above cost 5: pay full price for them.",
    "When your top Life card is a face-up body that plays itself and you have 2 Life or more, let a Leader attack through rather than block it: the hit plays that body, and the block would only rest one.",
    "Play EB04-058 Borsalino while you are at 2 Life or fewer, so its Life card is added; above that it is only a [Blocker].",
    "Pay OP08-106 Nami's cost with a card whose [Trigger] you would least miss, such as a spare Dereshi!.",
    "With OP15-119 Luffy on the field, put a high-cost card on top of your Life with Teach's look at 3: Bonney or Teach on top is +9000 or +8000 the moment your opponent counters with an Event or blocks.",
    "Keep Shaka and Borsalino untapped as [Blocker]s once your Life is low.",
    "Play OP13-108 Bonney when taking their top Life card and attacking at once brings them within reach of lethal.",
  ],
  commonVariants: [
    "Every Vegapunk list shares the {Egghead} core: OP07-111 Lilith, Shaka and Atlas at or near four.",
    'The 2025 Sci Fi Factory Store Battle list runs OP07-100 Edison, OP07-105 Pythagoras, EB02-056 Vegapunk, EB02-054 Sanji and OP07-109 Monkey.D.Luffy for the 2-Life payoffs, the Events OP07-114 and OP07-115, OP08-112 S-Snake, ST13-011 Portgas.D.Ace and OP10-112 Eustass"Captain"Kid. This list replaces them with the two other Liliths, Borsalino, OP07-113 Roronoa Zoro, Teach, OP15-119 Luffy and Bonney.',
  ],
  commonCombos: [
    "Leader banks Shaka or Atlas face-up on Life; your opponent's next hit turns it over and its [Trigger] plays it.",
    "At 2 Life, Borsalino adds a card to your Life and is a 6000 [Blocker]; the added card is another [Trigger] to flip.",
    "Teach puts Bonney on top of your Life; OP15-119 Luffy reveals it when your opponent blocks or counters with an Event and attacks at 16000.",
    "OP07-117 Egghead at 3 Life or less sets the Character that attacked active again, so it blocks on your opponent's turn.",
  ],
  keyCardNumbers: [
    "OP07-097",
    "OP07-111",
    "OP13-113",
    "OP07-101",
    "OP07-098",
    "EB04-058",
    "OP08-106",
    "OP16-119",
    "OP15-119",
  ],
  counterplay: [
    "Their Leader never attacks, so their pressure is all Characters. Removing bodies slows them more than racing does.",
    "Most of their bodies have a [Trigger] that plays itself. Every Life card you take may hand them a free body, and a face-up Life card tells you which one.",
    "OP15-119 Monkey.D.Luffy grows by the cost of their top Life card whenever you activate an Event or a [Blocker]. Against its attack, a Character Counter from hand does not wake it.",
    "OP07-098 Atlas cannot be K.O.'d in battle while they have fewer Life cards than you; remove it with an effect.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: entry "Vegapunk", the list "hazzasjanktank" took to 1st, 4-0, at a Store Battle in Australia on 19 Jun 2026.',
    },
    {
      url: "https://onepiecetopdecks.com/deck-list/english-eb-02-deck-list-anime-25th-collection/",
      retrievedAt: "2026-10-09",
      note: "The 2025 Sci Fi Factory Store Battle list for OP07-097, the source of the variants line and of the Leader's play-or-bank activation as this dossier describes it.",
    },
  ],
};
