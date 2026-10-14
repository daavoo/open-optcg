import type { DeckManifest } from "./index.js";

/**
 * Yellow Vegapunk, the {Egghead} deck whose Leader never attacks and instead
 * puts bodies onto the field or into Life: the list that went 3-0 and took 1st
 * at a Store Battle at Sci Fi Factory (US) on 3 Aug 2025, pilot handle
 * "RyByte".
 *
 * Source: onepiecetopdecks.com's English EB-02 deck-list page, retrieved
 * 9 Oct 2026, whose `deckgen` link for the entry (`hs=Sci Fi Factory`,
 * `tn=SB(3-0)`) encodes the whole 50 as machine-readable card counts. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * Why this list: of the 28 Vegapunk lists on the aggregator, all are wholly
 * Standard-legal under OP-17 and agree on the {Egghead} core (Lilith, Edison,
 * Shaka, Pythagoras, Atlas and EB02-056 Vegapunk at or near four). This 1st
 * place plays fifteen identities no other shipped deck does, the most of any.
 *
 * ## What the deck does
 *
 * The Leader cannot attack. Once a turn, for one rested DON!!, it plays an
 * {Egghead} card of cost 5 or less from hand or puts it face-up on top of
 * Life, and nearly every body in the list has a [Trigger] that plays itself
 * while the Leader is Vegapunk (Lilith, Edison, Shaka, Pythagoras, Atlas). So
 * Life is a second hand: a card taken as damage comes back as a body.
 *
 * The other half is the low-Life switch. At 2 Life or less Edison and
 * EB02-054 Sanji draw, Pythagoras replays an {Egghead} 4 from the trash on
 * K.O., OP07-109 Luffy trashes itself to K.O. a 4, ST13-011 Ace gains [Rush],
 * OP07-115 is a +3000 Counter, and the Egghead Stage re-stands a body each
 * turn at 3 or less. Atlas cannot be K.O.'d in battle while behind on Life.
 * OP08-106 Nami and OP08-112 S-Snake remove or lock a Character, OP10-112 Kid
 * trashes a Life card, and Lilith, EB02-056 Vegapunk and three Events dig.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op07VegapunkTournamentManifest: DeckManifest = {
  id: "(Yellow) Vegapunk - 1st Place Store Battle",
  format: "standard",
  leader: "OP07-097",
  cards: {
    "OP07-111": 4,
    "OP07-100": 4,
    "OP07-107": 3,
    "ST13-011": 1,
    "EB02-054": 2,
    "EB02-056": 4,
    "OP07-101": 4,
    "OP07-105": 4,
    "OP07-109": 3,
    "OP07-098": 4,
    "OP08-106": 4,
    "OP08-112": 1,
    "OP10-112": 2,
    "OP07-114": 2,
    "OP07-115": 4,
    "OP07-117": 2,
    "OP09-117": 2,
  },
};
