import type { DeckManifest } from "./index.js";

/**
 * Purple Monkey.D.Luffy (OP05-060): the list pilot "Zach S" took to 1st, 4-0,
 * at a Store Battle in Australia on 10 Sep 2026.
 *
 * Source: onepiecetopdecks.com's English OP-17 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/
 * (entry "Purple Luffy", 1st Place, SB(4-0), 9/10/2026), retrieved
 * 2026-10-17 by the pool scan that also keeps it as a training variant of
 * "(Purple) Monkey.D.Luffy - Starter Deck 18". Every identity is stamped from
 * Bandai's cardlist pages already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list. It replaces "(Purple) Monkey.D.Luffy
 * - 1st Place Store Battle 2025-07-01" as the Leader's Community list -- a
 * shelf carries one list per Leader -- and that list stays a training list in
 * `ml/bridge/decks.ts` under its id. Same Leader as "(Purple) Monkey.D.Luffy -
 * Starter Deck 18", so the same rules policy pilots all three.
 *
 * Against the 2025-07-01 list it adds 4 EB03-035 Charlotte Pudding, 2 OP07-076
 * Slow-Slow Beam Sword, 2 OP08-069 Charlotte Linlin, 4 OP11-068 Charlotte
 * Daifuku, 4 OP11-070 Charlotte Pudding, 2 OP13-076 Divine Departure, 4
 * OP15-078 Mamaragan, 4 OP17-062 Kaido, 4 OP17-074 Yamato, 4 ST34-003 Charlotte
 * Brulee, 4 ST34-004 Charlotte Linlin. It drops 1 OP03-072 Gum-Gum Jet
 * Gatling, 1 OP05-077 Gamma Knife, 4 OP06-076 Hitokiri Kamazo, 4 OP07-064
 * Sanji, 4 OP09-065 Sanji, 4 OP09-069 Trafalgar Law, 3 OP09-119
 * Monkey.D.Luffy, 4 ST18-001 Uso-Hachi, 2 ST18-002 O-Nami, 3 ST18-003
 * San-Gorou, 4 ST18-004 Zoro-Juurou, 3 ST18-005 Luffy-Tarou, 1 ST26-002 Tony
 * Tony.Chopper.
 *
 * ## What the deck does
 *
 * A {Big Mom Pirates} ramp list behind the Straw Hat Leader: no ST-18 card is
 * left. The Leader, EB01-061 Mr.2, EB03-035 Pudding and OP17-074 Yamato add
 * DON!! from the DON!! deck, and the payoffs are the 10-cost OP17-062 Kaido and
 * ST34-004 Charlotte Linlin, with OP11-067 Charlotte Katakuri standing the
 * {Big Mom Pirates} bodies back up at the end of the turn. OP11-070 and
 * ST34-003 dig for those bodies; the Events are Counters with a removal or
 * draw half, most of them paid by returning DON!!.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op05LuffyStoreBattle2026Manifest: DeckManifest = {
  id: "(Purple) Monkey.D.Luffy - 1st Place Store Battle 2026-09-10",
  format: "standard",
  leader: "OP05-060",
  recommended: true,
  cards: {
    "EB01-061": 4,
    "EB03-035": 4,
    "OP07-076": 2,
    "OP08-069": 2,
    "OP09-078": 4,
    "OP11-067": 4,
    "OP11-068": 4,
    "OP11-070": 4,
    "OP13-076": 2,
    "OP15-078": 4,
    "OP17-062": 4,
    "OP17-074": 4,
    "ST34-003": 4,
    "ST34-004": 4,
  },
};
