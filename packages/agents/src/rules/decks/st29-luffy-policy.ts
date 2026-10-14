/**
 * ## The deck's engine, in one paragraph
 *
 * ST29-001's deck converts its own Life into cards, and almost nothing in the
 * fifty works until it has. The Leader draws and discards on an attack only at
 * 2 or less Life; ST29-003 Kaku gains +1000 only while its controller's Life is
 * at or below the opponent's; ST29-015 adds a -2000 debuff at 1 or less Life
 * and ST29-017 a 3-cost K.O. at 2 or less. The conversion is not only the
 * counter coming down: a Life card taken goes to hand, and four identities --
 * ST29-005 Jinbe, ST29-008 Nami, ST29-009 Nico Robin and ST29-012
 * Monkey.D.Luffy -- print "play this card" on a [Trigger], so a Life card lost
 * is also a body gained for nothing. ST29-007 Tony Tony.Chopper makes it a loop
 * rather than a slide, trading a Life card for a card of the seat's own
 * choosing placed back on top of Life.
 *
 * ## Sources
 *
 * None. ST-29 is a precon with no tournament record and no Bandai feature-deck
 * write-up, so every claim here is read off the fifty rather than cited.
 */

/**
 * Which card in hand pays a trash cost: the [Counter] Events first.
 *
 * Three clauses raise this decision and together they are the deck's largest
 * surface -- the Leader's [When Attacking] draw-and-trash, ST29-014 Roronoa
 * Zoro's [Activate: Main], which asks for a card printing a [Trigger], and
 * ST29-004 Sanji's [Trigger]. `pnpm census` puts `main:resolve-effect` at 12.10
 * decisions a game with 55.5% answered by no rule at all, and the engine offers
 * the hand in hand order, so an unpiloted seat pays with whatever it drew
 * first.
 *
 * All three clauses are paid on the seat's **own turn**: one while attacking,
 * one from the Main phase, one to put a body down. At that moment a [Counter]
 * Event is the only card in hand that cannot change the turn being played --
 * every Character can be cast now or block later, and ST29-016's [Main] half is
 * a card for the turn the game ends rather than for this one. So the Event is
 * what the deck gives up, and the body is what it keeps.
 *
 * Two tiers rather than a card-by-card order, because two tiers is the whole of
 * what was measured. A seven-tier version ranking the bodies among themselves
 * -- worst-for-its-cost first -- was weaker than this one, so the ordering
 * below claims nothing about which body to keep: inside a tier the choice falls
 * back to the order the engine offered, which is unbiased.
 *
 * The format's own {@link createHandCostChoiceModule} answers the same decision
 * from a printed Counter value and reaches the opposite conclusion here: an
 * Event carries no Counter stat, so it reads there as the card that defends
 * nothing and is the first thing kept back.
 */
export const ST29_PITCH_ORDER: readonly (readonly string[])[] = [
  // Spent first.
  ["ST29-015", "ST29-016", "ST29-017"],
  // Kept. Ranked alike on purpose; see above.
  [
    "ST29-002",
    "ST29-003",
    "ST29-004",
    "ST29-005",
    "ST29-006",
    "ST29-007",
    "ST29-008",
    "ST29-009",
    "ST29-010",
    "ST29-011",
    "ST29-012",
    "ST29-013",
    "ST29-014",
  ],
];
