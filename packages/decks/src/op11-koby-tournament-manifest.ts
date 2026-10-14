import type { DeckManifest } from "./index.js";

/**
 * Red/Black Koby, the {SWORD} deck whose Characters attack Characters the turn
 * they land: the list that went 9-3 and took 2nd at a Bandai-hosted Regional
 * Final in Indonesia on 22 Aug 2026 (OP-16 format), pilot handle "Tridtigger".
 *
 * Source: onepiecetopdecks.com's Japan OP-17 deck-list page, retrieved
 * 9 Oct 2026, whose `deckgen` link for the entry (`hs=Bandai`,
 * `tn=Regional Finals(OP16)`) encodes the whole 50 as machine-readable card
 * counts. Every identity is stamped from Bandai's cardlist pages already, so
 * the audit needs no entry for it.
 *
 * Why this list: it is the deepest finish among the 37 Koby lists, it was
 * built after block 1 rotated, and it is wholly Standard-legal under OP-17.
 * The same pilot placed with three near-identical builds between May and
 * August 2026, so it is a settled list rather than a one-off.
 *
 * ## What the deck does
 *
 * The Leader lets {SWORD} Characters attack Characters the turn they are
 * played, and once a turn replaces the removal of a {Navy} body of 7000 base
 * power or less with three trash cards to the bottom of the deck. So the deck
 * turns every play into a removal attack: EB03-008 Hibari and OP11-082 Aramaki
 * let a body attack active Characters too, OP11-008 Doll (−6000), OP13-020
 * Meteor Fist (−5000), EB03-008 Hibari (−1000) and OP13-007 Ace & Sabo & Luffy
 * (−3000) shrink the target first, and PRB02-001 Koby K.O.s a 3000 when it
 * attacks. OP11-013 Prince Grus turns off small Blockers.
 *
 * The trash is both fuel and a resource. EB04-047 Helmeppo trashes itself to
 * play a 3-or-less {SWORD} from hand or trash; OP11-092 Helmeppo pulls an
 * 8-or-less {SWORD} back from the trash for the turn. OP11-004 Kujyaku and
 * OP11-099 dig for {Navy} cards, EB03-041 Kujyaku draws two and grows every
 * small {SWORD} on the opponent's turn, and OP11-097 returns a black 3-cost
 * from a ten-card trash. EB04-003 Smoker & Tashigi sets the Leader at 7000 on
 * defence.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op11KobyTournamentManifest: DeckManifest = {
  id: "(Red/Black) Koby - 2nd Place Indonesia Regional Final",
  format: "standard",
  leader: "OP11-001",
  cards: {
    "OP11-082": 4,
    "OP11-096": 3,
    "EB04-047": 4,
    "EB03-041": 4,
    "OP11-092": 4,
    "EB04-044": 4,
    "OP11-004": 4,
    "OP11-013": 1,
    "OP13-007": 2,
    "EB03-008": 4,
    "OP11-008": 4,
    "PRB02-001": 1,
    "EB04-003": 2,
    "OP11-097": 4,
    "OP11-099": 4,
    "OP13-020": 1,
  },
};
