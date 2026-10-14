import type { DeckManifest } from "./index.js";

/**
 * (Green/Yellow) Yamato, the deck that attacks the Life total it needs low.
 *
 * Source: Bandai's own featured deck for this Leader,
 * https://en.onepiece-cardgame.com/feature/deck/deck_075.php, retrieved
 * 4 Sep 2026 and transcribed slot for slot -- the publisher's list, so the
 * counts below are the primary record rather than somebody's read of the
 * archetype.
 *
 * ## Why this list and not a newer one
 *
 * The request that added this deck asked for the OP-17-era update, and the
 * honest answer is that there is not one. Three things were checked:
 *
 *  - **Bandai has not refreshed it.** `/feature/deck/` carries three Yamato
 *    decks -- deck_032 (Mar 2024), this one (3 Oct 2025) and deck_106 (Jun
 *    2026), and deck_106 is *Black* Yamato, OP16-079, a different Leader. This
 *    is the newest published list for OP06-022.
 *  - **The OP-17 tournament field does not play it.** OP06-022 appears in
 *    exactly zero of the lists on
 *    onepiecetopdecks.com's English OP-17 page; the two "Yamato" entries there
 *    are OP16-079 Black Yamato. That is the aggregator this repo trusts for
 *    tournament records (see the OP-17 Kaido and Mihawk manifests), and an
 *    absence there is a real absence rather than a client-rendered empty
 *    table.
 *  - **OP-17 prints nothing for it.** The set has six {Land of Wano} cards and
 *    not one is Green or Yellow: three are Red Whitebeard-Pirates crossovers
 *    (OP17-003, OP17-004, OP17-007) and three are Purple Kaido-side bodies
 *    (OP17-066, OP17-067, OP17-074). There is no OP-17 slot to swap in.
 *
 * So the list ships as Bandai printed it. Every printing in the 50 is block 2
 * or 3 -- the five ST-28 exclusives and PRB02-016 are block 3, the rest block
 * 2 -- so it is Standard-legal against the block-2 floor in `block-icons.ts`,
 * and it is the *oldest* Standard-legal core in the repo: OP-06 goes first if
 * the floor moves to block 3 in April 2027, which would take nine of these
 * fourteen slots at once. `pnpm decks:legality` prints the icons per card.
 *
 * ## What the deck does
 *
 * It races to put the opponent on three Life and then collects. Nine of the
 * list's printed clauses read "if your opponent has 3 or less Life cards", and
 * three of those are `[Trigger]`s that play their own Character for free
 * (OP06-104, OP06-109, OP06-110, ST28-003) -- so the damage that crosses the
 * threshold is also what refills the board that keeps crossing it. The
 * Leader's [Double Attack] is what gets there in one attack rather than two,
 * and its [Activate: Main] spends DON!! a *second* time in a turn by moving
 * rested ones onto a Character.
 *
 * The tension is that the same Trigger package wants damage taken *by the
 * opponent* while ST28-004 Kouzuki Momonosuke wants the deck's own Life at 2
 * or less, and PRB02-016 Otama is the card that spends it: rest Otama, turn a
 * Life card into a card in hand, hand something +3000. That is why the list is
 * comfortable at low Life on both sides of the table, and why ST28-002 Izo's
 * one-turn [Banish] on the Leader matters more than a 2-cost 1000 body should
 * -- a [Double Attack] that banishes takes two Life cards without giving the
 * opponent two Triggers back.
 *
 * ST28-001 Ashura Doji is the one card priced the other way, K.O.ing a body
 * only while the opponent still has 3 or *more* Life. It is the turn-3
 * interaction slot, and it goes dead exactly when the rest of the deck turns
 * on.
 */
export const op06YamatoManifest: DeckManifest = {
  id: "(Green/Yellow) Yamato - Official Feature Deck",
  featuredOn: { page: 75, posted: "2025-10-03" },
  format: "standard",
  leader: "OP06-022",
  cards: {
    "ST28-005": 4,
    "PRB02-016": 4,
    "ST28-002": 4,
    "ST28-001": 4,
    "OP06-104": 4,
    "OP06-110": 4,
    "OP10-109": 4,
    "ST28-003": 4,
    "OP06-107": 2,
    "OP06-109": 4,
    "OP08-023": 4,
    "ST28-004": 4,
    "OP06-118": 2,
    "OP06-115": 2,
  },
};
