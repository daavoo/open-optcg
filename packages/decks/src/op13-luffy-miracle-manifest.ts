import type { DeckManifest } from "./index.js";

/**
 * Red/Green Monkey.D.Luffy (OP13-001) as the "Miracle Luffy" EB-05 build: a
 * green Land of Wano chain behind the Leader rather than its Straw Hat
 * DON!!-refresh deck.
 *
 * Source: OPTCG Web Sim's "Miracle Luffy EB05 Guide",
 * https://optcgwebsim.com/learn/miracle-luffy-eb05-guide/ (updated
 * 2026-11-05; the page footer read 6 Nov 2026 when retrieved 2026-11-07),
 * whose decklist is this fifty. A community deck guide rather than an event
 * placing, so like the EB05 Wisdom Robin list (now a training list in
 * `ml/bridge/decks.ts`) the id names the archetype and the set rather than a
 * placing. Every identity is
 * stamped from Bandai's cardlist pages already, so the audit needs no entry
 * for it.
 *
 * It is the Leader's `recommended` list. It replaces "(Red/Green)
 * Monkey.D.Luffy - Open OPTCG" as the Leader's Community list -- a shelf
 * carries one list per Leader -- and that list stays a training list in
 * `ml/bridge/decks.ts` under its id. The same rules policy pilots both.
 *
 * Against that list it adds 4 EB01-013 Kouzuki Hiyori, 4 EB05-001 Jewelry
 * Bonney, 3 OP01-055 You Can Be My Samurai!!, 4 OP06-033 Vander Decken IX, 4
 * OP07-022 Otama, 4 OP12-023 Kawamatsu, 4 OP13-016 Monkey.D.Garp, 4 OP13-031
 * Trafalgar Law, 1 OP17-022 Shanks, 4 PRB02-003 Lucky.Roux, 4 ST30-004
 * Emporio.Ivankov, 4 ST32-002 Kouzuki Oden. It drops 4 EB02-017 Nami, 4
 * EB04-002 Jewelry Bonney, 4 EB04-007 Roronoa Zoro, 4 OP01-016 Nami, 1
 * OP04-016, 1 OP05-038 Charlestone, 4 OP13-027 Sanji, 1 OP13-040, 2 OP13-118
 * Monkey.D.Luffy, 4 OP14-022 Usopp, 2 OP15-032 Brook, 3 ST21-003 Sanji, 4
 * ST31-004 Monkey.D.Luffy, 4 ST31-005 Thousand Sunny. It changes the count of
 * OP08-036 Electrical Luna 4 to 2.
 *
 * ## What the deck does
 *
 * The Leader is {Supernovas}, which turns on EB05-001 Jewelry Bonney's
 * [On Play]: draw 2 and play up to two Characters with 2000 power or less from
 * hand. EB01-013 Kouzuki Hiyori is the one it wants: she trashes herself to
 * play a {Land of Wano} Character of cost 5 or less -- ST32-002 Kouzuki Oden
 * or OP12-023 Kawamatsu -- and draws, so one 5-cost lands three bodies.
 * OP13-031 Trafalgar Law returns a Character to hand to play a cost 5 or less
 * rested, which replays Bonney. OP17-022 Shanks is the one finisher.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op13LuffyMiracleManifest: DeckManifest = {
  id: "(Red/Green) Monkey.D.Luffy - Miracle Luffy EB05",
  format: "standard",
  leader: "OP13-001",
  recommended: true,
  cards: {
    "EB01-013": 4,
    "EB05-001": 4,
    "OP01-055": 3,
    "OP06-033": 4,
    "OP07-022": 4,
    "OP08-036": 2,
    "OP12-023": 4,
    "OP13-016": 4,
    "OP13-031": 4,
    "OP14-031": 4,
    "OP17-022": 1,
    "PRB02-003": 4,
    "ST30-004": 4,
    "ST32-002": 4,
  },
};
