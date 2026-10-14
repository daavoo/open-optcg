import type { DeckManifest } from "./index.js";

/**
 * Purple/Yellow Nico Robin, the deck that buys DON!! with the cards it wants
 * in its Life stack.
 *
 * Source: onepiecetopdecks' English OP-17 page
 * https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/
 * retrieved 19 Sep 2026 -- KDZ Millan, 2nd Place, EU Final, BCG Fest 26-27
 * (Bandai, Utrecht), 6 Sep 2026. Taken from that page's own `deckgen` link,
 * which encodes the fifty slots as machine-readable counts rather than as a
 * transcription from a photograph; Bandai's own published image of the list
 * (fourteen identities, no counts) agrees with it card for card.
 *
 * The same Europe Championship 26-27 Season 1 Final that
 * `op16-enel-eu-final-manifest.ts` won, which is why the two ids name the
 * event the same way and why both sit on the Tournaments shelf: the placing
 * is the claim, and `deckShelf` reads it off the id.
 *
 * ## Why this list
 *
 * The page carries five Robin lists from the Utrecht weekend alone -- a 10-0
 * first, a 9-1 top four, two finals placings and a side-event win -- and they
 * agree on a core of forty-four: four each of OP17-102, OP17-106, OP17-107,
 * OP17-109, OP17-112, OP17-114, OP16-119, OP17-074 and OP09-078, OP17-113 at
 * three or four, OP17-110 at two, and ST34-003 at two to four. Four of the
 * five run OP12-112 Baby 5 in the remaining slots, at two to four copies; the
 * fifth runs OP17-111 instead, and two lists reach into OP-05 and OP-08 for
 * extra 2-cost Counters.
 *
 * This is the EU Final's runner-up. The 10-0 list differs from it in two
 * slots -- a fourth OP17-113 for a fourth ST34-003 -- and both are the same
 * 1-cost search, so the two lists are one deck. Every card in it is in a set
 * this repo already imports.
 *
 * ## What the deck does
 *
 * The Leader prints [Banish], so every point of damage it deals trashes the
 * Life card without giving the opponent its Trigger, and a `[When Attacking]`
 * that trades one Trigger card out of hand for a rested DON!!. Both halves
 * point the same way: this deck wants a hand full of Trigger cards and it
 * wants the *opponent's* Life stack to be worth nothing.
 *
 * Its own Life stack is worth a great deal, and that is the engine. Five of
 * the deck's Characters print "[Trigger] Play this card" -- OP17-107
 * Charlotte Daifuku, OP17-102 Charlotte Oven, OP17-106 Charlotte Smoothie,
 * OP17-114 Sweet 3 Generals and OP17-110 Charlotte Perospero -- and five
 * cards in the list put a card from the top of the deck *into* Life
 * (OP17-106, OP17-114, OP16-119 Marshall.D.Teach, OP17-112 Charlotte Linlin,
 * and EB04-058 Borsalino from behind). So taking damage deploys the board,
 * and the deck spends its own tempo stacking the cards it will be paid for
 * losing.
 *
 * OP17-112 Charlotte Linlin is what makes that trade lopsided: on its
 * controller's turn every one of their 4000-power Characters with a [Trigger]
 * has a base power of 8000 instead. Daifuku, Oven, Smoothie, Sweet 3 Generals
 * and Perospero are all printed 4000, so the ten-drop turns a board that
 * arrived for free into a board of 8000s.
 *
 * OP12-112 Baby 5 is the one card in the list that is neither {Big Mom
 * Pirates} nor Purple, and it earns the slot on its Trigger: behind a
 * multicolored Leader, which this Robin is, it draws two when it comes off
 * Life. In hand it is a 5000 body the aura never reaches with a 2000 Counter,
 * and the [Trigger] card the Leader's ramp and OP17-109's draw are paid with.
 *
 * The Purple half is three cards and does one job each: ST34-003 Charlotte
 * Brulee and OP17-113 Streusen search {Big Mom Pirates}, OP17-074 Yamato is a
 * [Blocker] that ramps a rested DON!!, and OP09-078 Gum-Gum Giant is the
 * Counter -- +4000 in the battle and two cards back, gated on a
 * {Straw Hat Crew} Leader, which this Robin is.
 *
 * ## The off-set slots
 *
 * Five, all stamped by set-level passes in `tools/audit-cards`, so this deck
 * needs no entry there: OP09-062 and OP09-078 from OP-09, OP12-112 from
 * OP-12, OP16-119 Marshall.D.Teach from OP-16, EB04-058 Borsalino from EB-04
 * and ST34-003 Charlotte Brulee from ST-34.
 *
 * ## How it measures
 *
 * `pnpm deck:benchmark run --deck "(Purple/Yellow) Nico Robin - OP17
 * Tournament List" --seeds 50` against the whole field, on the same policy,
 * reads this list +0.7pt over the one it replaced (+373/-353 of 2800, z =
 * 0.74) -- a wash, as swapping three slots should be. The reason to carry it
 * is provenance, not points: a final at a Bandai regional over a 4-0 local.
 * Its worst matchups are the decks that spend their own Life rather than
 * taking this one's, and its best are the ones that race into a stacked Life
 * stack.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other community manifests do: `deck-provenance.ts` reads the card
 * list and `index.ts` re-exports from `deck-provenance.ts`, so the reverse
 * import would be a cycle.
 */
export const op09RobinManifest: DeckManifest = {
  id: "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1",
  format: "standard",
  leader: "OP09-062",
  cards: {
    "OP17-113": 3,
    "OP17-107": 4,
    "OP17-109": 4,
    "OP12-112": 3,
    "OP17-102": 4,
    "EB04-058": 2,
    "OP17-106": 4,
    "OP17-114": 4,
    "OP17-110": 2,
    "OP16-119": 4,
    "OP17-112": 4,
    "ST34-003": 4,
    "OP17-074": 4,
    "OP09-078": 4,
  },
};
