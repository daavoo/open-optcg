import type { DeckManifest } from "./index.js";

/**
 * ST-30 "Luffy & Ace", Bandai's Red/Green Impel Down starter deck, exactly as
 * sold.
 *
 * Source: Bandai's own card list for the product
 * (https://en.onepiece-cardgame.com/cardlist/?series=569030), which is the 17
 * identities below and nothing else, and the deck's per-slot counts from the
 * structure-deck list in the egman secondary source the audit already reads.
 * Both are in the 2026-08-22 reference snapshot, and every one of the 17 is
 * stamped `sourceMatch: true`.
 *
 * ## What the deck does
 *
 * It is a tribe deck whose tribe is a number. "Character with 6000 base power"
 * is printed on nine of the seventeen identities, and the list is built so that
 * the number is nearly always true: eight of its fourteen Character identities
 * are 6000-power bodies, and the ones that are not are the cheap interaction.
 * ST30-003 Edward.Newgate makes every one of them a 7000 on its controller's
 * turn, ST30-014 Mr.3(Galdino) hands two of them two rested DON!! each, and
 * ST30-015 turns two of them on the board into a +4000 [Counter].
 *
 * The Leader is the reason the deck wants those bodies rather than bigger ones.
 * ST30-001 gives itself −2000 power while its controller has a Character with
 * 7000 base power or more, so the deck's own curve is capped from above: a
 * 7000-power body is a downgrade, not an upgrade, which is the opposite of what
 * a power-ranking heuristic assumes. Against that it prints "[Opponent's Turn]
 * All of your [Portgas.D.Ace] and [Monkey.D.Luffy] cards gain +3000 power", so
 * the two named bodies defend at 9000 and the Leader itself at 9000 -- the
 * deck's defence is the Leader clause, not its hand.
 *
 * ST30-009 LittleOars Jr. and ST30-011 Buggy are the same protection twice,
 * both keyed to 6000 base power: a replacement that trades itself for a draw,
 * and one that rests instead of dying. ST30-008 Marco replays itself out of the
 * trash for a 6000-power card from hand, so the deck's bodies are hard to
 * spend down.
 *
 * ## What it is not
 *
 * A tuned list. It is a precon, and it is here as a shipped deck rather than as
 * a benchmark target: expect it near the bottom of
 * `docs/rules-map/deck-standings-starter.csv`, beside ST-26, ST-27 and ST-29.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason every other hand-authored manifest does: `deck-provenance.ts` reads
 * the card list and `index.ts` re-exports from `deck-provenance.ts`, so the
 * reverse import would be a cycle.
 */
export const st30LuffyAceManifest: DeckManifest = {
  id: "(Red/Green) Luffy & Ace - Starter Deck 30",
  leader: "ST30-001",
  cards: {
    "ST30-002": 2,
    "ST30-003": 4,
    "ST30-004": 2,
    "ST30-005": 4,
    "ST30-006": 4,
    "ST30-007": 2,
    "ST30-008": 4,
    "ST30-009": 4,
    "ST30-010": 4,
    "ST30-011": 2,
    "ST30-012": 2,
    "ST30-013": 4,
    "ST30-014": 2,
    "ST30-015": 4,
    "ST30-016": 2,
    "ST30-017": 4,
  },
};
