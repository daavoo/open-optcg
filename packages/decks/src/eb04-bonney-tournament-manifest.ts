import type { DeckManifest } from "./index.js";

/**
 * Red/Yellow Jewelry Bonney (EB04-001): the list pilot "Appelmoes" took to 13th
 * of 64 (4-2) at [OP17] ChinoizeCup #104, an online event played on Tuesday 1
 * Sep 2026.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6a8f03677a62de813013f933/standings,
 * whose API carries the whole fifty as card counts, retrieved 2026-10-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Jewelry Bonney builds in the
 * learned model's training pool it is the one that model wins most with against
 * the meta field. Same Leader as "(Red/Yellow) Jewelry Bonney - Official
 * Feature Deck", so the same rules policy pilots both.
 *
 * Against that list it adds 2 OP06-115 You're the One Who Should Disappear., 4
 * OP07-099 Usopp, 4 OP07-104 Nico Robin, 2 OP11-106 Zeus, 4 OP12-112 Baby 5, 4
 * OP13-113 Lilith, 4 OP16-119 Marshall.D.Teach, 4 OP17-102 Charlotte Oven, 3
 * OP17-106 Charlotte Smoothie, 3 OP17-107 Charlotte Daifuku, 4 OP17-109
 * Charlotte Pudding, 4 OP17-112 Charlotte Linlin, 3 OP17-113 Streusen, 4
 * OP17-114 Sweet 3 Generals. It drops 4 EB03-053 Nami, 4 EB04-002 Jewelry
 * Bonney, 4 EB04-007 Roronoa Zoro, 4 EB04-052 Sanji, 2 EB04-054 Bartholomew
 * Kuma, 4 EB04-056 Pacifista, 4 EB04-058 Borsalino, 4 OP07-107 Franky, 4
 * OP07-114 He Possesses the World's Most Brilliant Mind, 4 OP12-119 Bartholomew
 * Kuma, 4 OP13-108 Jewelry Bonney, 4 ST29-010 Franky. It changes the count of
 * EB04-061 Monkey.D.Luffy 4 to 1.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const eb04BonneyTournamentManifest: DeckManifest = {
  id: "(Red/Yellow) Jewelry Bonney - 13th Place ChinoizeCup #104",
  format: "standard",
  leader: "EB04-001",
  recommended: true,
  cards: {
    "EB04-061": 1,
    "OP06-115": 2,
    "OP07-099": 4,
    "OP07-104": 4,
    "OP11-106": 2,
    "OP12-112": 4,
    "OP13-113": 4,
    "OP16-119": 4,
    "OP17-102": 4,
    "OP17-106": 3,
    "OP17-107": 3,
    "OP17-109": 4,
    "OP17-112": 4,
    "OP17-113": 3,
    "OP17-114": 4,
  },
};
