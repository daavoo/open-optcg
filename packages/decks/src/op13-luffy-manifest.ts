import type { DeckManifest } from "./index.js";

/**
 * Red/Green Monkey.D.Luffy behind the OP13-001 Leader, as the OP-16/OP-17
 * field builds it.
 *
 * Source: the list that won the Malmo Regional (1st, 13-1, 22 Aug 2026), read
 * off the `deckgen` link on onepiecetopdecks' English OP-16 deck-list page
 * (https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/).
 * Among the 25 tournament lists for the Leader from August to October 2026 it
 * is a Regional winner, and it runs the cards most of them share: OP14-031
 * Nami, OP13-027 Sanji, EB04-007 Zoro, OP14-022 Usopp and ST31-005 at four,
 * ST21-003 Sanji, and OP08-036 Electrical Luna. The deck keeps the "- Open OPTCG" id it shipped
 * with, under which a maintainer-supplied list ran until 12 Oct 2026; that
 * list is a training variant in `research/system1/bridge/deck-variants.ts`.
 * Every identity is already stamped by `pnpm reference:audit`, so the deck
 * needs no audit entry of its own.
 *
 * ## What the deck does
 *
 * It spends DON!! twice a turn. OP13-027 Sanji, OP13-118 Luffy, OP14-031 Nami
 * and OP14-022 Usopp all set rested DON!! active again -- on play, at the end
 * of the turn, or both -- and OP05-038 Charlestone does it from the Counter
 * step. What the refreshed DON!! is for is the Leader: on the opponent's turn
 * it rests any number of them, at 5 or fewer active, for +2000 apiece on
 * itself or a {Straw Hat Crew} Character. A turn that ends with DON!! active
 * is a turn whose leftover resources become defence.
 *
 * Green's half is a rest-lock: OP14-031 Nami rests two Characters, OP15-032
 * Brook rests any one card, and OP08-036 Electrical Luna (and the one
 * OP13-040) keep rested Characters from standing up in the opponent's next
 * Refresh Phase, so a board the deck rests stays out of the next turn. Red's
 * half is the pressure: OP13-118's [Double Attack], ST31-004's conditional
 * [Rush], EB04-007 Zoro's +2000 on the Leader through the opponent's turn, and
 * ST21-003 Sanji, which turns off the opponent's [Blocker] for a 6000 attacker.
 *
 * Three look-at-fives (OP01-016, EB02-017, ST31-005) and EB04-002's look-at-4
 * dig for Straw Hats, which is every Character here.
 *
 * Lives in its own module so `deck-provenance.ts` can read the list without
 * importing `index.ts`.
 */
export const op13LuffyManifest: DeckManifest = {
  id: "(Red/Green) Monkey.D.Luffy - Open OPTCG",
  format: "standard",
  leader: "OP13-001",
  cards: {
    "EB02-017": 4,
    "EB04-002": 4,
    "EB04-007": 4,
    "OP01-016": 4,
    "OP04-016": 1,
    "OP05-038": 1,
    "OP08-036": 4,
    "OP13-027": 4,
    "OP13-040": 1,
    "OP13-118": 2,
    "OP14-022": 4,
    "OP14-031": 4,
    "OP15-032": 2,
    "ST21-003": 3,
    "ST31-004": 4,
    "ST31-005": 4,
  },
};
