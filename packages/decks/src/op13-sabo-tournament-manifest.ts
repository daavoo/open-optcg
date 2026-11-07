import type { DeckManifest } from "./index.js";

/**
 * Red/Black Sabo (OP13-004): the list pilot "Manny Walia" took to 1st at
 * PlayTCG's EGB event in North America on 20 Sep 2026.
 *
 * Source: onepiecetopdecks.com's English OP-17 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/
 * (entry "Red Black Sabo", 1st Place, EGB, PlayTCG, 9/20/2026), whose
 * `deckgen` link encodes the whole fifty as card counts, retrieved 2026-11-07.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it. ST01-011 Brook is Standard by its block-4 printing.
 *
 * It is the Leader's `recommended` list: of the Sabo builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. It replaces "(Red/Black) Sabo - OP17 Elbaph List" as the
 * Leader's Community list -- a shelf carries one list per Leader -- and that
 * list stays a training list in `ml/bridge/decks.ts` under its id. The same
 * rules policy pilots both, and ST-35 shares the Leader.
 *
 * Against that list it adds 2 EB04-007 Roronoa Zoro, 2 OP13-007 Ace & Sabo &
 * Luffy, 2 OP14-096 Ground Death, 2 OP17-083 Jinbe, 2 OP17-096 I'm Luffy!!, 3
 * ST01-011 Brook. It drops 1 OP15-094 Roronoa Zoro, 4 OP17-091 Brook, 4
 * OP17-098 Gum-Gum Kong Gun. It changes the count of OP04-016 Bad Manners Kick
 * Course 3 to 2, OP17-086 Nami 4 to 2, OP17-093 Monkey.D.Luffy 4 to 3.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op13SaboTournamentManifest: DeckManifest = {
  id: "(Red/Black) Sabo - 1st Place PlayTCG EGB 2026-09-20",
  format: "standard",
  leader: "OP13-004",
  recommended: true,
  cards: {
    "EB04-007": 2,
    "OP04-016": 2,
    "OP13-007": 2,
    "OP14-096": 2,
    "OP15-088": 4,
    "OP17-080": 4,
    "OP17-082": 4,
    "OP17-083": 2,
    "OP17-084": 3,
    "OP17-086": 2,
    "OP17-087": 3,
    "OP17-089": 4,
    "OP17-093": 3,
    "OP17-095": 4,
    "OP17-096": 2,
    "OP17-119": 4,
    "ST01-011": 3,
  },
};
