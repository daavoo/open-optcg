import type { DeckManifest } from "./index.js";

/**
 * Blue/Yellow Boa Hancock as the OP-17 field builds it: the list pilot
 * "whosane24" took to 25th of 64 at ChinoizeCup #105, an online event played
 * on Wednesday 2 Sep 2026.
 *
 * Source: Limitless TCG's standings for that event, retrieved 17 Oct 2026 --
 * https://play.limitlesstcg.com/tournament/6a8f06390580a332c84204b0/standings
 * -- whose API carries the whole fifty as card counts. Every identity is
 * stamped from Bandai's cardlist pages already, so the audit needs no entry
 * for it.
 *
 * It is the Leader's `recommended` list, ahead of Bandai's feature deck: of
 * the Hancock builds in the learned model's training pool it is the one that
 * model wins most with against the OP-17 field.
 *
 * Same Leader as Bandai's feature deck, so `op14-hancock-policy.ts` pilots
 * both. Where the two lists differ is what the field kept and what it
 * replaced:
 *
 * - **The self-playing [Trigger] core stays.** OP14-113 Marguerite, OP14-114
 *   Ran, OP14-115 Rindo, OP14-105 Gorgon Sisters and OP14-107 Shakuyaku at
 *   four each, plus OP16-113 Boa Marigold, a fifth body that plays itself
 *   from Life under the {Kuja Pirates} Leader and gains [Blocker] at 2 Life.
 * - **{The Seven Warlords of the Sea} in place of the Marigold engine.** No
 *   OP13-052 or OP07-051: ST17-004 Boa Hancock is a 4-cost Blocker that gives
 *   a rested DON!! to the Leader, and OP07-057 Perfume Femur and OP07-056
 *   Slave Arrow are the Warlord Events, a Blocker switch-off and a +4000
 *   Counter, each drawing off a [Trigger].
 * - **Life gain.** EB04-058 Borsalino, OP12-119 Bartholomew Kuma and OP16-119
 *   Marshall.D.Teach each add a card to Life, and every card added is another
 *   [Trigger] the Leader can draw from. Teach's [Trigger] is removal too.
 * - **EB03-053 Nami and 2 OP06-058 Gravity Blade** are the reach: Nami takes
 *   a Life card from an opponent at 3 or more and loads the Leader's DON!!,
 *   Gravity Blade bottoms two Characters.
 * - **No Lilith, PRB02-017 or EB04-027, and OP14-118 is gone**: the cheap dig
 *   is Marguerite alone, at four.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op14HancockTournamentManifest: DeckManifest = {
  id: "(Blue/Yellow) Boa Hancock - 25th Place ChinoizeCup #105",
  format: "standard",
  leader: "OP14-041",
  recommended: true,
  cards: {
    "OP07-056": 2,
    "OP07-057": 2,
    "OP14-113": 4,
    "OP14-114": 4,
    "ST17-004": 4,
    "OP14-115": 4,
    "OP16-113": 4,
    "EB03-053": 2,
    "EB04-058": 4,
    "OP12-119": 2,
    "OP14-105": 4,
    "OP14-107": 4,
    "OP14-108": 2,
    "OP06-058": 2,
    "OP16-119": 2,
    "OP14-112": 4,
  },
};
