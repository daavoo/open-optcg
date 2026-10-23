import type { DeckManifest } from "./index.js";

/**
 * Green/Yellow Nico Robin, the EB-05 Leader, as the deck's guide builds it:
 * a midrange list of 6000-power <Wisdom> bodies.
 *
 * Source: Car D. Kaizoku's "EB05 Robin Swings A LOT", 12 Oct 2026 --
 * https://www.youtube.com/watch?v=4L5S8I6hnrI -- whose description carries the
 * fifty, and which OPDeckGuide hosts as its "Nico Robin EB05" guide --
 * https://opdeckguide.com/deck-guides/nico-robin-eb05/ -- both retrieved
 * 23 Oct 2026. Thornberry Media's 13 Oct early build describes the same core.
 *
 * Pre-release, like the OP-17 Elbaph Sabo list (`op13-sabo-manifest.ts`): EB-05
 * reaches English shelves on 30 Oct 2026, so the id names the format and the
 * archetype rather than a placing. Why this list rather than a placed one: the
 * only EB05-010 list with a top-eight finish so far is 2nd of 24 at an online
 * league, a small event, and it is a different deck -- the OP-17 yellow Big
 * Mom [Trigger] package with the Leader in front, where most of the bodies
 * lack the <Wisdom> attribute both of the Leader's clauses read. This list is
 * built on those clauses and on the EB-05 cards printed for this Leader:
 * EB05-056 Nico Olvia draws only under a [Nico Robin] Leader, and EB05-057
 * Nojiko feeds a DON!! to a <Wisdom> card. The placed list is a training
 * variant in `ml/bridge/deck-variants.ts`.
 *
 * ## What the deck does
 *
 * The Leader has two clauses. Once a turn it sets one of your <Wisdom>
 * Characters with 6000 power or less active again, so a body that has
 * attacked attacks again; and once a turn, when a <Wisdom> Character without
 * [Blocker] is K.O.'d, it adds the top card of the deck to your Life. Nearly
 * every Character here is a 6000-power <Wisdom> body:
 *
 * - EB05-016 Nico Robin plays a <Wisdom> Character of cost 5 or less from
 *   hand on your turn, so a 6-cost is two bodies.
 * - EB05-055 Nami adds a Life card under a <Wisdom> Leader; EB05-052 Gloriosa
 *   can be trashed instead of taking damage; EB04-018 Megalo rests itself to
 *   K.O. a rested Character.
 * - The digging is EB05-050 Atlas (a <Wisdom> card), OP13-113 Lilith (a
 *   [Trigger] card), OP17-109 Charlotte Pudding and EB05-056 Nico Olvia, the
 *   last two trading a [Trigger] card from hand for draws.
 * - The non-<Wisdom> slots are the format's yellow and green staples:
 *   EB04-058 Borsalino, OP13-031 Trafalgar Law, OP14-108 Silvers Rayleigh and
 *   OP17-022 Shanks.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const eb05RobinManifest: DeckManifest = {
  id: "(Green/Yellow) Nico Robin - EB05 Wisdom List",
  format: "standard",
  leader: "EB05-010",
  cards: {
    "EB04-018": 4,
    "EB04-058": 4,
    "EB05-016": 4,
    "EB05-050": 4,
    "EB05-052": 4,
    "EB05-055": 4,
    "EB05-056": 4,
    "EB05-057": 4,
    "OP13-031": 4,
    "OP13-113": 4,
    "OP14-108": 3,
    "OP17-022": 3,
    "OP17-109": 4,
  },
};
