import type { DeckManifest } from "./index.js";

/**
 * Yellow Charlotte Linlin, Bandai's own feature deck for OP17-099.
 *
 * Source: https://en.onepiece-cardgame.com/feature/deck/deck_108.php
 * (retrieved 2026-09-20), transcribed slot for slot -- thirteen distinct
 * cards behind the Leader, twelve of them four-ofs and the Event a two-of.
 * Every identity was already stamped by the OP-17 and ST-20 passes in
 * `tools/audit-cards`.
 *
 * ## What the deck does
 *
 * It is the only deck in the catalog whose board is deliberately *below* the
 * curve until one card lands. Nine of its thirteen slots are 4000-power
 * Characters with a [Trigger], from a 3-cost Cracker up to a 7-cost
 * Perospero, and 4000 is a body the format's Leaders beat by attacking. The
 * deck accepts that, because OP17-112 Charlotte Linlin prints "[Your Turn]
 * The base power of all of your Characters with a [Trigger] and 4000 base
 * power becomes 8000" -- so the whole board is re-costed at once the turn the
 * 10-drop arrives, and a Perospero that was a 7-cost 4000 becomes a 7-cost
 * 8000 with three friends the same size.
 *
 * Everything before that turn buys the time to reach it, and it buys it in
 * the one currency this deck prints and the format does not: **Life cards
 * added from the top of the deck**. Six clauses add one -- the Leader's
 * [When Attacking], Cracker, Smoothie, Katakuri, Sweet 3 Generals and
 * OP17-112's own [On Play] -- and because the deck's own Characters are the
 * things sitting on top of that deck, a Life card taken later is not just a
 * turn survived, it is a free body: nine of the thirteen slots read
 * "[Trigger] Play this card." Being attacked is how this deck develops.
 *
 * That is also why the 4000 bodies are correct rather than a compromise.
 * Removal aimed at them is a bad trade for the opponent twice over: OP17-102
 * Charlotte Oven's [On K.O.] plays a 4000-or-less Character back out of the
 * trash, and every Character K.O.'d in combat was one the Leader would
 * otherwise have had to draw.
 *
 * ## The Leader, and why it is not a free action
 *
 * OP17-099 reads "[When Attacking] You may trash 1 card from your hand: Your
 * opponent chooses one: - Trash 1 card from your hand. Then, add up to 1 card
 * from the top of your deck to the top of your Life cards. - Trash 1 card
 * from your opponent's hand." Whichever branch the opponent takes, the seat
 * that attacked has already paid one card out of hand, and both branches cost
 * the opponent something -- so the clause reads as pure profit and is not.
 * It is a one-for-one trade that the opponent gets to price, and the card it
 * spends is a card this deck's small bodies wanted for the Counter phase:
 * Streusen and Brulee print 2000 Counter and the 4000 line prints 1000.
 * Bandai's page and both published guides say the same thing in different
 * words -- "you should not activate the effect automatically" -- and the
 * deck's own failure case is decking out from Life it did not need.
 *
 * ## The turn the deck is built around
 *
 * OP17-110 Charlotte Perospero's [On Play] plays a {Big Mom Pirates}
 * Character of cost 6 or less out of hand and then gives *itself* [Rush].
 * At 7 DON!! that is Perospero plus Katakuri -- a Life card, a -3000 on
 * something of theirs, and an attack from a body that was in hand at the
 * start of the turn. It is the deck's only way to convert a card into
 * pressure the same turn, and it is why the 6-cost slots are Characters
 * rather than anything larger.
 *
 * OP17-115 is the closer: [Main] gives the Leader [Unblockable] for the turn,
 * and its [Counter] half is +4000 on any [Charlotte Linlin], which is either
 * the Leader or the 10-drop. Two copies, because it is a card the deck holds
 * rather than casts.
 *
 * Lives in its own module for the same reason the other community manifests
 * do: `deck-provenance.ts` reads the card list and `index.ts` re-exports from
 * it, so inlining the list would be a cycle.
 */
export const op17LinlinManifest: DeckManifest = {
  id: "(Yellow) Charlotte Linlin - Official Feature Deck",
  featuredOn: { page: 108, posted: "2026-08-28" },
  leader: "OP17-099",
  cards: {
    "OP17-113": 4,
    "OP17-104": 4,
    "OP17-107": 4,
    "OP17-109": 4,
    "OP17-111": 4,
    "ST20-003": 4,
    "OP17-102": 4,
    "OP17-106": 4,
    "OP17-103": 4,
    "OP17-114": 4,
    "OP17-110": 4,
    "OP17-112": 4,
    "OP17-115": 2,
  },
};
