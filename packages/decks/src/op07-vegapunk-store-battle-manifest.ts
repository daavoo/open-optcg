import type { DeckManifest } from "./index.js";

/**
 * Yellow Vegapunk (OP07-097): the list pilot "hazzasjanktank" took to 1st, 4-0,
 * at a Store Battle in Australia on 19 Jun 2026.
 *
 * Source: onepiecetopdecks.com's English OP-16 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/
 * (entry "Vegapunk", 1st (4-0), SB, 6/19/2026), retrieved 2026-10-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Vegapunk builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. It takes the Community shelf from the 2025 Sci Fi Factory list,
 * "(Yellow) Vegapunk - 1st Place Store Battle", which the learned model still
 * trains on under that id (`ml/bridge/decks.ts`); `op07-vegapunk-policy.ts`
 * pilots both.
 *
 * Against that list it adds 4 EB03-058 Lilith, 4 EB04-058 Borsalino, 4 OP07-113
 * Roronoa Zoro, 2 OP13-108 Jewelry Bonney, 4 OP13-113 Lilith, 3 OP15-119
 * Monkey.D.Luffy, 4 OP16-119 Marshall.D.Teach. It drops 4 OP07-100 Edison, 1
 * ST13-011 Portgas.D.Ace, 2 EB02-054 Sanji, 4 EB02-056 Vegapunk, 4 OP07-105
 * Pythagoras, 3 OP07-109 Monkey.D.Luffy, 1 OP08-112 S-Snake, 2 OP10-112
 * Eustass"Captain"Kid, 2 OP07-114 He Possesses the World's Most Brilliant Mind,
 * 4 OP07-115 I Re-Quasar Helllp!!. It changes the count of OP07-107 Franky 3 to
 * 4, OP09-117 Dereshi! 2 to 3.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op07VegapunkStoreBattleManifest: DeckManifest = {
  id: "(Yellow) Vegapunk - 1st Place Store Battle 2026-06-19",
  format: "standard",
  leader: "OP07-097",
  recommended: true,
  cards: {
    "EB03-058": 4,
    "EB04-058": 4,
    "OP07-098": 4,
    "OP07-101": 4,
    "OP07-107": 4,
    "OP07-111": 4,
    "OP07-113": 4,
    "OP07-117": 2,
    "OP08-106": 4,
    "OP09-117": 3,
    "OP13-108": 2,
    "OP13-113": 4,
    "OP15-119": 3,
    "OP16-119": 4,
  },
};
