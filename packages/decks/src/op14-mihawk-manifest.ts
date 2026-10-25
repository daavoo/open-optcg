import type { DeckManifest } from "./index.js";

/**
 * OP-14 Green Mihawk, as it placed 3rd at the Championship 26-27 Season 1
 * Finals for Europe.
 *
 * Source: Zyrios's list, 3rd place at the EU Final, Bandai Card Games Fest
 * feat. ONE PIECE CARD GAME, Utrecht, 5-6 September 2026 (Standard). The
 * transcription is optcg.gg's machine-readable record of it,
 * https://www.optcg.gg/api/deck-lists/07594072-7398-437d-9a53-204c52ff6a91,
 * which lists the Leader and all fifty deck cards one row per copy. It agrees
 * identity for identity with Bandai's own deck image for the placing, which
 * is the primary record: fifteen distinct deck cards, Kikunojo among them.
 *
 * Named plainly: onepiecetopdecks.com's `deckgen` link for the same placing
 * carries fourteen identities -- no OP14-023, and OP06-033 at four rather than
 * three -- and opdecks.xyz repeats that reading. Both are one card off the
 * image, in the same slot, so the image and the record that matches it win.
 *
 * The transcription is still self-checking on the one point that matters --
 * the quantities sum to exactly 50 behind one Leader, which
 * `validateDeckCardRows` re-asserts.
 *
 * ## What the deck does
 *
 * The Leader is the engine: `pnpm card:text OP14-020`. A three-DON!! refund
 * bought with one rested card, gated on a board that already has a 5-drop, and
 * paid for by giving up the Character plays for the turn -- so the deck spends
 * the refunded DON!! on Events, on OP14-039's stage trickle, and on attacking.
 *
 * The deck turns the *opponent's* rested board into a board that does not
 * stand back up. OP08-036 Electrical Luna holds down every rested body of cost
 * 7 or less through their Refresh Phase, OP07-026 Jewelry Bonney holds down
 * one rested Character or DON!!, and OP17-022 Shanks is what rests the board
 * for them to bite on, resting every opposing Character on play and setting 2
 * DON!! active while it does. A Character that cannot become active can
 * neither attack nor use [Blocker].
 *
 * The searcher package is the part every Green Mihawk list agrees on: 4x
 * OP07-022 Otama digging 5 for a green {Land of Wano} body, 4x OP12-034 Perona
 * digging 5 for a <Slash> card or green Event. ST32-001 Kin'emon, ST32-002
 * Kouzuki Oden, OP12-023 Kawamatsu and OP14-023 Kikunojo are the {Land of
 * Wano} bodies Otama finds, and all four are <Slash>, so Perona finds them
 * too.
 *
 * OP01-055 "You Can Be My Samurai!!" is the card flow: rest two of your own
 * Characters, draw two. It is the whole reason Kikunojo is in the list -- a
 * 1-cost body that sets itself active at the end of your turn is a rest cost
 * that pays itself back -- and, with Kin'emon's Leader-or-DON!! rest, why the
 * deck never wants for cards to rest.
 *
 * OP06-033 Vander Decken IX is the cheap removal, and it is why the
 * {Fish-Man} count is not an accident: its cost is a {Fish-Man} out of hand,
 * and Kawamatsu is one. OP06-038 is the defensive Counter, +2000 normally and
 * +4000 once eight cards are rested, which a deck that rests its own field to
 * ramp reaches routinely. OP13-031 Trafalgar Law re-buys an [On Play] by
 * bouncing a body and putting a 5-drop back into play rested, and is a
 * [Blocker] at 1 Life.
 *
 * ## OP01-055 and Standard
 *
 * Every printing of OP01-055 carries block icon 1, and block 1 left Standard
 * on 1 April 2026. It is Standard-legal anyway: Bandai's "Overview of Cards
 * Subject to Block Number Updates" (`/rules/blockicon-card/`) assigns fifteen
 * block-1 card numbers to block 4 "regardless of reprints", legal "from April
 * 1, 2026, to March 31, 2029", and OP01-055 is one of them. `reference:audit`
 * reads that page into `generated-blocks.ts` beside the printed icons, which
 * is what lets this list declare `standard` and pass `validateDeckCardRows`.
 * Before the page was read, this manifest swapped the four copies for
 * OP14-038 to stay legal; the swap is gone with the reason for it.
 *
 * Off-set slots: OP01-055, OP06-033, OP06-038, OP07-022, OP08-036 and OP12-034
 * are stamped by this deck's community entry in `tools/audit-cards`.
 * OP12-023, ST32-001 and ST32-002 come from the ST31-36 format pass, OP07-026
 * from the OP-07 set pass, OP13-031 from the OP-13 one, OP17-022 and OP17-031
 * from the OP-17 one, and OP14-020, OP14-023 and OP14-039 from the OP-14 one,
 * so their data is already in the pool.
 *
 * A `deck:benchmark` rate for this deck is its share of games against the
 * rest of the field under `op14-mihawk-policy.ts`. Read it as a rating of the
 * policy, not of the list: every such rate is a share against the field, so adopting a new list for any *other* deck moves
 * this row without anything here changing.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 and OP-17 manifests do: `deck-provenance.ts` reads the card
 * list and `index.ts` re-exports from `deck-provenance.ts`, so the reverse
 * import would be a cycle.
 */
export const op14MihawkManifest: DeckManifest = {
  id: "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
  format: "standard",
  leader: "OP14-020",
  cards: {
    "OP07-022": 4,
    "OP12-034": 4,
    "ST32-001": 4,
    "OP14-023": 1,
    "OP06-033": 3,
    "OP07-026": 1,
    "OP12-023": 4,
    "ST32-002": 4,
    "OP17-031": 4,
    "OP13-031": 4,
    "OP17-022": 4,
    "OP01-055": 4,
    "OP06-038": 4,
    "OP14-039": 3,
    "OP08-036": 2,
  },
};
