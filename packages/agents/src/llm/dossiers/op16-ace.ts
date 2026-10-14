import type { DeckStrategyDossier } from "./types.js";

export const op16AceDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Portgas.D.Ace - Official Feature Deck",
  archetype: "OP-16 Red Portgas.D.Ace Whitebeard Pirates aggro",
  gamePlan: [
    'The Leader is the whole deck: "[Activate: Main] [Once Per Turn] Up to 1 of your [Monkey.D.Luffy] Characters or up to 1 of your Characters with a type including \\"Whitebeard Pirates\\", with 8000 power or more, gains [Rush] during this turn." Play a big body and attack with it the same turn, every turn. Never spend the activation on a Character that could already attack -- the whole value is unlocking one that could not.',
    '"a type including \\"Whitebeard Pirates\\"" reaches {Whitebeard Pirates Allies} too, so OP16-016 Ramba and OP16-017 LittleOars Jr. are legal Rush targets alongside the plain {Whitebeard Pirates} bodies. Only the power floor is exact: 8000 or more.',
    '"8000 power" is the deck\'s real currency and it is spent three different ways from the same card. As a Rush target. As a *reveal* cost -- OP16-010 Namule and OP16-011 Vista each read "You may reveal 1 Character card with 8000 power from your hand", and OP16-003 Edward.Newgate reads two -- which costs nothing but showing the card. And as Counter power, because OP16-118 Portgas.D.Ace makes "the counter of all of your Character cards with 8000 power in your hand" 2000 -- and Bandai rules that this reaches 8000 or more, so OP16-003 Edward.Newgate at 10000 is a 2000 Counter too while Ace stands. A hand of 8000s is simultaneously the board plan, the removal and the defence.',
    "There are no blockers to hide behind beyond two 8000-power bodies that would rather be attacking, so defence is Counter cards out of hand. Racing is correct; stalling is not a plan this deck has.",
    "OP16-003 Edward.Newgate is the top end: while it stands your Leader has [Double Attack] and +2000 power on your turn, so a Leader attack that connects takes two Life. Its [On Play] reveals two 8000s for -6000 on one of their Characters, which is the deck's only way to remove a body bigger than 2000.",
  ],
  mulligan: [
    "Look for OP16-015 Monkey.D.Luffy. It is the most important card in the list: the Leader names [Monkey.D.Luffy] as a Rush target with no power floor, its own clause prices it at 2 once you have six DON!! behind an Ace Leader, and its [On Your Opponent's Attack] puts the Leader at 7000 base for a turn.",
    "Otherwise keep a hand with a 1-cost searcher -- OP13-016 Monkey.D.Garp or OP16-021 Moby Dick -- and at least one 8000-power body for it to find more of. The archetype's known weakness is bricking on a hand of 7- and 8-drops.",
    "Throw back a hand that is only expensive bodies with no searcher: nothing in it does anything before turn 6.",
  ],
  priorities: [
    "Do not activate the Leader's Rush grant unless a Character on your board is barred from attacking only because it was played this turn. Otherwise the [Once Per Turn] use is thrown away, and the deck wants it on every turn from four DON!! onward.",
    "Between the two halves of the grant, take whichever one has such a body, and prefer the 8000-power {Whitebeard Pirates} half when both do -- a bigger attack forces more Counter cards out of the defender, and Counter cost is not linear in power.",
    "OP16-015's [On Your Opponent's Attack] costs an 8000-power Character out of hand and makes the Leader (and itself) 7000 base. Pay it only when 7000 actually stops the attack. Against a 9000 swing at a 5000 Leader it does not, and the card you trashed was a 2000 Counter -- the same defence you just threw away.",
    "What that clause buys lasts the whole turn, not the battle it was paid in, and the clause carries no [Once Per Turn] -- so the opponent's second and third attacks are offered the same trade against a Leader that is already 7000. Paying again buys nothing at all: it is a card out of hand for a base power the board already has. Check what your Leader's base power is now, not what is printed on it.",
    "OP13-016 Garp looks four deep for a card costing 3 or more, which is most of the deck, so it is close to a free draw of the best card in the top four. Play it on any turn with a spare DON!!, not as the turn's main play.",
    "OP16-021 Moby Dick is a Stage: play it for the look-at-3, and only trash it for the rested-DON!! gift when that DON!! wins a battle now. It survives on the board otherwise and is not competing with anything.",
    "OP13-007 Ace & Sabo & Luffy's [Activate: Main] gives an *active* DON!! to a Leader or Character and trashes itself for -3000 on an opposing Character. The DON!! stays active and attached, so this is a +1000 power buff *and* removal support -- but it is also a 2000 Counter, so only convert it when the -3000 changes a battle.",
    "OP16-010 Namule is a 1-cost body whose [On Play] reveals an 8000 to K.O. a Character with 2000 base power or less: play it into a searcher or a 1-drop Blocker of theirs, and hold it when their board has nothing that small.",
    "OP16-017 LittleOars Jr. is 8000 only while you have a {Whitebeard Pirates} Character costing 8 or more; without one it is 4000, which is under the Rush floor and not a legal reveal for the 8000 clauses. Sequence the 8-drop first when both are in hand.",
    "OP16-005 Thatch prices itself at 5 once any 8000-power Whitebeard Pirate is on your board, so the 8-cost printed on it is rarely what you pay. Check the discount before deciding the turn is too expensive.",
    "OP16-004 Curiel and OP16-016 Ramba print nothing: they are 8000-power bodies for 7, which is exactly what the Leader's clause, the reveal costs and the Counter static all ask for. A vanilla 8000 is not a weak card in this list.",
  ],
  commonVariants: [
    "The OP16 core is fixed across every list: Garp, OP16-015 Luffy, LittleOars Jr., Vista, Marco, Thatch and Moby Dick are four-ofs; Bandai's list runs OP16-118 Ace as a fourth four-of and Ramba as the two-of.",
    "Player lists built after OP-17 swap the vanilla 8000s -- Curiel, Ramba, Namule -- for OP17-005 Edward.Newgate, OP17-016 Rakuyo, OP17-006 Kingdew and OP17-004 Inuarashi & Nekomamushi, which are the same 8000-power bodies with a clause attached.",
  ],
  commonCombos: [
    "Play an 8000-power body, activate the Leader for [Rush], attack with it the same turn. That is the deck's default turn from four DON!! on, not a combo.",
    "OP16-003 Newgate on the board, then a Leader attack: [Double Attack] takes two Life from one connecting hit, and the +2000 makes the Leader a 7000 attacker the defender has to answer.",
    "OP16-118 Ace on the board turns every 8000-power Character in hand into a 2000 Counter, which is what lets the deck hold a hand of threats and still survive a race.",
    "OP16-014 Marco's removal replacement plus its [On K.O.]: trash an 8000-power Character from hand to replay Marco out of the trash, so an answer aimed at anything on your board costs the opponent their removal and costs you one card.",
  ],
  keyCardNumbers: [
    "OP16-001",
    "OP16-015",
    "OP16-118",
    "OP16-003",
    "OP13-016",
    "OP16-021",
  ],
  counterplay: [
    "The Rush grant is [Once Per Turn] and needs an 8000-power body (or a [Monkey.D.Luffy]) that was just played. Removal aimed at the fresh body before it attacks, or anything that keeps the board under 8000, turns the Leader off for the turn.",
    "The deck defends with cards, not blockers. Attacks that force two Counter cards rather than one drain it faster than trading on the board does, and it has only two Blockers to interrupt with.",
    "K.O.ing OP16-118 Portgas.D.Ace removes 2000 of Counter power from every 8000-power card in their hand at once -- more defence than any single body on their board is worth.",
    "OP16-003 Newgate is the card that ends games: while it stands every Leader hit is two Life. Answer it before the Leader attacks, not after.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_102.php",
      retrievedAt: "2026-09-20",
      note: "Bandai's own feature deck for OP16-001, posted 12 June 2026: all 50 slots of this list, and the archetype's stated plan of giving [Rush] to 8000-power Characters.",
    },
    {
      url: "https://onepiece.limitlesstcg.com/decks/107/cards",
      retrievedAt: "2026-08-26",
      note: "Card-usage table for the Leader across played lists; the source for which slots are four-ofs and for OP16-015 being the mulligan target.",
    },
    {
      url: "https://www.thornberrymedia.com/post/op-17-red-ace-deck-list",
      retrievedAt: "2026-08-26",
      note: "OP-17 assessment of the archetype: names OP17-005, OP17-006 and OP17-016 as the cards player lists add over the vanilla 8000s, and consistency as the deck's main problem.",
    },
  ],
};
