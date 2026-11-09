import type { DeckManifest } from "./index.js";

/**
 * Red/Green Luffy & Ace (ST30-001): the list pilot "Eduardo De La O" took to
 * 2nd at the CDMX Regional in Mexico on 19 Sep 2026.
 *
 * Source: onepiecetopdecks.com's English OP-17 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/
 * (entry "Ace and Luffy", 2nd Place, Regional, 9/19/2026), retrieved
 * 2026-10-17 by the pool scan behind `ml/bridge/deck-variants.ts`. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list, the Community list for ST30-001. It
 * takes the shelf from "(Red/Green) Luffy & Ace - Open OPTCG" -- a shelf
 * carries one list per Leader -- and that list stays a training list in
 * `ml/bridge/decks.ts` under its id. "(Red/Green) Luffy & Ace - Starter Deck
 * 30" keeps the Leader's starter shelf, and the same rules policy pilots all
 * three.
 *
 * Against the Open OPTCG list it adds 2 OP12-018 Color of the Supreme King
 * Haki. It drops 1 ST21-003 Sanji, 1 ST21-017 Gum-Gum Mole Pistol. It changes
 * the count of OP12-037 Demon Aura Nine Sword Style Asura Blades Drawn Dead
 * Man's Game 3 to 2, OP14-019 I Have a Plan to Take Down One of the Four
 * Emperors!! 2 to 4, OP17-017 Ga Ha Ha Ha!! 4 to 3.
 *
 * ## What the deck does
 *
 * The same Straw Hat rush shell: twelve [Monkey.D.Luffy] bodies that the
 * Leader lifts by +3000 on the opponent's turn, nothing printed at 7000 or
 * more so the Leader's own −2000 never switches on, and twenty 1-cost looks
 * at the top of the deck, four of them OP14-019. Every other Event is a
 * Counter; the list plays no removal, and OP12-018 is a Counter whose second
 * half shrinks the opponent's whole side for the turn.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const st30LuffyAceCdmxManifest: DeckManifest = {
  id: "(Red/Green) Luffy & Ace - 2nd Place CDMX Regional 2026-09-19",
  format: "standard",
  leader: "ST30-001",
  recommended: true,
  cards: {
    "EB02-017": 4,
    "EB04-002": 4,
    "OP01-016": 4,
    "OP04-016": 4,
    "OP06-017": 1,
    "OP12-015": 4,
    "OP12-018": 2,
    "OP12-037": 2,
    "OP13-040": 2,
    "OP14-019": 4,
    "OP17-017": 3,
    "ST21-014": 4,
    "ST30-012": 4,
    "ST31-001": 4,
    "ST31-005": 4,
  },
};
