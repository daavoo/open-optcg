import type { DeckManifest } from "./index.js";

/**
 * Green/Yellow Nico Robin (EB05-010) as the EB-05 field builds it: the Robin
 * list ranked 6th in TCG Match Making's EB05 Weekly Power Rankings of 5 Nov
 * 2026, drawn from high-rank online play (stats at
 * https://stats.tcgmatchmaking.com/). The post is a power ranking rather than
 * an event's results and names no pilot, so the id carries the ranking rather
 * than a placing.
 *
 * Source: TCG Match Making's "EB05 Weekly Power Rankings - November 5th" post
 * of 5 Nov 2026 on its Patreon, https://www.patreon.com/tcgmatchmaking,
 * retrieved 2026-11-09. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list. It replaces "(Green/Yellow) Nico
 * Robin - EB05 Wisdom List" as the Leader's Community list -- a shelf carries
 * one list per Leader -- and that list stays a training list in
 * `ml/bridge/decks.ts` under its id. The same rules policy pilots both.
 *
 * Against that list it adds 4 OP17-107 Charlotte Daifuku, 4 OP12-112 Baby 5,
 * 4 OP17-102 Charlotte Oven, 4 OP17-114 Sweet 3 Generals, 4 OP17-112 Charlotte
 * Linlin, 2 OP06-115 You're the One Who Should Disappear. It drops 4 EB05-056
 * Nico Olvia, 4 EB05-057 Nojiko, 4 OP13-031 Trafalgar Law, 4 OP13-113 Lilith,
 * 3 OP14-108 Silvers Rayleigh. It changes the count of EB04-058 Borsalino 4 to
 * 2, OP17-022 Shanks 3 to 2.
 *
 * ## What the deck does
 *
 * The <Wisdom> core stays -- EB05-016 Nico Robin, EB05-055 Nami, EB05-052
 * Gloriosa, EB04-018 Megalo, EB05-050 Atlas and OP17-109 Charlotte Pudding --
 * and the rest of the fifty is the OP-17 yellow Big Mom Pirates [Trigger]
 * package: bodies that play themselves off a Life card, cards that put cards
 * back on Life, and OP17-112 Charlotte Linlin, which makes every [Trigger]
 * Character printed at 4000 an 8000 on your turn.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const eb05RobinTcgmmManifest: DeckManifest = {
  id: "(Green/Yellow) Nico Robin - TCG Match Making EB05 #6",
  format: "standard",
  leader: "EB05-010",
  recommended: true,
  cards: {
    "EB04-018": 4,
    "EB04-058": 2,
    "EB05-016": 4,
    "EB05-050": 4,
    "EB05-052": 4,
    "EB05-055": 4,
    "OP06-115": 2,
    "OP12-112": 4,
    "OP17-022": 2,
    "OP17-102": 4,
    "OP17-107": 4,
    "OP17-109": 4,
    "OP17-112": 4,
    "OP17-114": 4,
  },
};
