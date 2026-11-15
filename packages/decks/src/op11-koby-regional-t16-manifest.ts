import type { DeckManifest } from "./index.js";

/**
 * Red/Black Koby (OP11-001): the list pilot "Madlove" took to Top 16 at the
 * Wolverhampton Regional in the UK on 19 Jul 2026.
 *
 * Source: onepiecetopdecks.com's English OP-16 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/
 * (entry "Koby", T16, Regional, Wolverhampton, 7/19/2026), retrieved
 * 2026-11-15; its `deckgen` link encodes the whole 50 as card counts. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Koby builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. It takes the shelf from "(Red/Black) Koby - 2nd Place Indonesia
 * Regional Final" -- a shelf carries one list per Leader -- and that list
 * stays a training list in `ml/bridge/decks.ts` under its id. The same rules
 * policy pilots both.
 *
 * Against that list it adds 1 EB04-046 Doll, 1 EB04-050 I'll Whip You Into
 * Shape. ♡, 1 OP11-119 Koby. It drops 1 OP11-013 Prince Grus, 1 OP13-020
 * Meteor Fist. It changes the count of EB03-041 Kujyaku 4 to 3, OP11-082
 * Aramaki 4 to 3, OP11-097 After All These Years I'm Losing My Edge!!! 4 to 1,
 * OP13-007 Ace & Sabo & Luffy 2 to 3, PRB02-001 Koby 1 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op11KobyRegionalT16Manifest: DeckManifest = {
  id: "(Red/Black) Koby - Top 16 Wolverhampton Regional 2026-07-19",
  format: "standard",
  leader: "OP11-001",
  recommended: true,
  cards: {
    "EB03-008": 4,
    "EB03-041": 3,
    "EB04-003": 2,
    "EB04-044": 4,
    "EB04-046": 1,
    "EB04-047": 4,
    "EB04-050": 1,
    "OP11-004": 4,
    "OP11-008": 4,
    "OP11-082": 3,
    "OP11-092": 4,
    "OP11-096": 3,
    "OP11-097": 1,
    "OP11-099": 4,
    "OP11-119": 1,
    "OP13-007": 3,
    "PRB02-001": 4,
  },
};
