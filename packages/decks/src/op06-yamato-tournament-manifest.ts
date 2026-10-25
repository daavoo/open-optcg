import type { DeckManifest } from "./index.js";

/**
 * Green/Yellow Yamato (OP06-022): the list pilot "New_Genisis_Cam" took to 1st
 * at a Pirates Party in the USA on 20 Sep 2026.
 *
 * Source: onepiecetopdecks.com's English OP-17 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/
 * (entry "YG Yamato", 1st Place, PirateParty, 9/20/2026), retrieved 2026-10-17.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Yamato builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. Same Leader as "(Green/Yellow) Yamato - Official Feature Deck",
 * so the same rules policy pilots both.
 *
 * Against that list it adds 4 EB03-057 Yamato, 4 EB04-058 Borsalino, 2 OP05-037
 * Because the Side of Justice Will Be Whichever Side Wins!!, 4 OP06-106 Kouzuki
 * Hiyori, 2 OP13-031 Trafalgar Law, 2 OP13-117 Gum-Gum Dawn Stamp, 4 OP15-113
 * Roronoa Zoro, 3 OP16-119 Marshall.D.Teach, 4 OP17-022 Shanks, 2 OP17-102
 * Charlotte Oven, 2 OP17-106 Charlotte Smoothie, 4 OP17-107 Charlotte Daifuku,
 * 4 OP17-109 Charlotte Pudding, 3 OP17-112 Charlotte Linlin, 3 OP17-113
 * Streusen, 3 OP17-114 Sweet 3 Generals. It drops 4 ST28-005 Yamato, 4
 * PRB02-016 Otama, 4 ST28-002 Izo, 4 ST28-001 Ashura Doji, 4 OP06-104 Kikunojo,
 * 4 OP06-110 Nekomamushi, 4 OP10-109 Basil Hawkins, 4 ST28-003 Kin'emon, 2
 * OP06-107 Kouzuki Momonosuke, 4 OP06-109 Denjiro, 4 OP08-023 Carrot, 4
 * ST28-004 Kouzuki Momonosuke, 2 OP06-118 Roronoa Zoro, 2 OP06-115 You're the
 * One Who Should Disappear..
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op06YamatoTournamentManifest: DeckManifest = {
  id: "(Green/Yellow) Yamato - 1st Place Pirates Party 2026-09-20",
  format: "standard",
  leader: "OP06-022",
  recommended: true,
  cards: {
    "EB03-057": 4,
    "EB04-058": 4,
    "OP05-037": 2,
    "OP06-106": 4,
    "OP13-031": 2,
    "OP13-117": 2,
    "OP15-113": 4,
    "OP16-119": 3,
    "OP17-022": 4,
    "OP17-102": 2,
    "OP17-106": 2,
    "OP17-107": 4,
    "OP17-109": 4,
    "OP17-112": 3,
    "OP17-113": 3,
    "OP17-114": 3,
  },
};
