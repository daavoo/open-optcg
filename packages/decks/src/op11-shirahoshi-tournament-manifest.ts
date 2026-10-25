import type { DeckManifest } from "./index.js";

/**
 * Green/Yellow Shirahoshi (OP11-022): the list pilot "kevyzhou" took to 3rd of
 * 120 (6-1) at [EB05] ChinoizeCup #125, an online event played on 20 Oct 2026
 * that allowed EB-05 cards ahead of their 30 Oct English release.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6ad092328a8383117e3ec30c/standings,
 * whose API carries the whole fifty as card counts, retrieved 2026-10-23. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Shirahoshi builds in the
 * learned model's training pool it is the one that model wins most with against
 * the meta field. Same Leader as "(Green/Yellow) Shirahoshi - Official Feature
 * Deck", so the same rules policy pilots both.
 *
 * Against that list it adds 3 EB03-052 Shirahoshi, 4 EB04-011 Scaled Neptunian,
 * 4 EB04-016 Bird Neptunian, 4 EB04-018 Megalo, 4 EB05-014 Shirahoshi, 4
 * EB05-020 My name is Shirahoshi!!, 2 OP08-036 Electrical Luna, 4 OP11-033 Bird
 * Neptunian, 3 OP12-102 Shirahoshi, 3 OP17-022 Shanks, 3 OP17-114 Sweet 3
 * Generals. It drops 4 OP11-030 Shirahoshi, 4 OP11-100 Otohime, 4 OP11-106
 * Zeus, 4 OP11-112 Megalo, 4 OP10-030 Smoker, 4 OP11-103 Long-Jaw Neptunian, 4
 * OP11-108 Neptune, 4 OP11-026 Scaled Neptunian, 4 OP11-031 Jinbe, 2 ST16-004
 * Shanks.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op11ShirahoshiTournamentManifest: DeckManifest = {
  id: "(Green/Yellow) Shirahoshi - 3rd Place ChinoizeCup #125",
  format: "standard",
  leader: "OP11-022",
  recommended: true,
  cards: {
    "EB03-052": 3,
    "EB04-011": 4,
    "EB04-016": 4,
    "EB04-018": 4,
    "EB05-014": 4,
    "EB05-020": 4,
    "OP08-036": 2,
    "OP11-028": 2,
    "OP11-033": 4,
    "OP11-036": 4,
    "OP11-107": 4,
    "OP11-115": 2,
    "OP12-102": 3,
    "OP17-022": 3,
    "OP17-114": 3,
  },
};
