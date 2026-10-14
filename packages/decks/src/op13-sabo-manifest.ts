import type { DeckManifest } from "./index.js";

/**
 * The OP-17 Red/Black Sabo list: the OP13 Leader in front of OP17's Elbaph
 * shell, rather than the Revolutionary Army build the Leader shipped with.
 *
 * Source: the top-placing OP17 RB Sabo decklist on gumgum.gg, retrieved
 * 26 Aug 2026 --
 * https://gumgum.gg/one-piece/decklists/deck/east/op17/1596817e-9bf6-4938-9bc1-c8947cd85d9f
 * -- for the Leader, the OP17 core (OP17-080, OP17-087, OP17-089, OP17-093,
 * OP17-095, OP17-098, OP17-119) and the flex band this list draws its own
 * OP17-082 and OP17-091 from. It differs in going wider on the giants and on
 * OP15-088 where that list spends the slots on OP17-081/083/096 and OP13-120.
 * The archetype is covered by several OP-17 deck guides, e.g.
 * https://www.youtube.com/watch?v=pW0WQAHiZyk.
 *
 * Pre-release for the OP-17 half, like the other three OP-17 lists here -- see
 * `op17-shanks-manifest.ts` for why there is no tournament finish to cite.
 *
 * ## Why this is not the red-splash version
 *
 * The list this started from ran a three-card red splash -- OP01-016 Nami,
 * OP04-016 Bad Manners Kick Course and ST01-011 Brook. Bandai's Block Icon
 * System retired Block 1 from Standard on 1 April 2026, and legality is a
 * property of a *printing* rather than of an identity: a card is legal if any
 * of its printings carries a block icon still in the format. Per the icons
 * `pnpm reference:audit` now stamps into `generated-blocks.ts`:
 *
 *  - ST01-011 Brook is block 1 on every printing the snapshot carries. Never
 *    reprinted into a legal block, and the one card here that is Extra-only.
 *  - OP01-016 Nami is block 1 in OP-01, in the OP-05 reprint and in the ST-10
 *    one, and block `X` on its ST-31 printing. `X` never rotates, so it is
 *    legal -- by the printing, not by the set it was first in. This entry
 *    originally read that Nami was block 1 everywhere; the per-printing data
 *    says otherwise, which is the whole reason the data exists.
 *  - OP04-016 stays too, and by the other route: block 1 in PRB-02, but block 4
 *    on its ST-31 printing.
 *
 * The eight red slots became 4x OP17-082 Sanji and 4x OP17-091 Brook, which are
 * the same two jobs inside the OP-17 shell -- card flow and a cheap body that
 * grows with the giants. Only ST01-011's slots had to go; the rest of the swap
 * is a deck-building choice this list keeps, since the black package already
 * pays for those jobs without spending the colour. Nothing modelled blocks when
 * that swap was made, which is why no gate caught the original: see
 * https://github.com/daavoo/open-optcg/issues/44, and `block-icons.ts` for what
 * closed it.
 *
 * The deck is now black but for three copies of OP04-016. That is a legal use
 * of a Red/Black Leader and it is what removing the red splash leaves; the
 * Leader is still the reason to play it, because its aura is what the black
 * package cannot print for itself.
 *
 * ## What the deck does
 *
 * Two different cost thresholds, answered by the same cards.
 *
 * The Leader prints "[printed text omitted -- pnpm card:text OP04-016]", and the
 * Elbaph shell prints "[printed text omitted -- pnpm card:text OP04-016]" on
 * six of its bodies. OP17-089 Jaguar.D.Saul costs 4 in hand and sits on the
 * board at 16, and OP17-119 Loki at 18, so one giant satisfies both clauses at
 * once: the 2-drops grow +3000 each, OP17-093 Luffy gains [Rush], and the
 * Leader's aura turns on for everything. That is the whole engine, and it is
 * why the giants are the four-ofs rather than the flex.
 *
 * Note the asymmetry between the two clauses, which decides several turns:
 * "there is" scans both boards (`anyCharacterWithCost` in
 * `static-abilities.ts`), so an opposing giant switches the Elbaph half on for
 * free -- but the Leader's own aura reads "if *you* have", and only ever counts
 * this player's board.
 *
 * The Leader's other half runs the other way: "[printed text omitted -- pnpm card:text OP17-093]" Starting at 5 Life, the Leader is a
 * 4000 body that becomes a 5000 one -- 6000 with the aura up -- as Life is
 * spent, so taking a hit early is a cost this deck is happy to pay.
 *
 * Which giants count is not obvious from the set, and it is the one thing to
 * get right when tuning this list. Four OP17 bodies print "+12 cost", but
 * OP17-081 Gerd and OP17-094 Rodo gate theirs on "if your Leader has the
 * {Elbaph} type" -- and Sabo is {Dressrosa} {Revolutionary Army}. Under this
 * Leader they are a vanilla 2-drop and a vanilla 1-drop, which is why neither is
 * here despite both being staples of the Black Luffy build. OP17-085 Dorry and
 * OP17-092 Brogy do gain their +12 unconditionally, but the [On Play] that
 * fetches the other half is Elbaph-Leader-gated too, so they are 5-cost bodies
 * with a dead clause. Only OP17-089 and OP17-119 are enablers here.
 *
 * OP04-016 is the last red card and the reason the Leader's second colour still
 * earns a slot: a free [Counter] the black half does not print, plus a [Trigger]
 * that takes 3000 off an opposing card when it comes off Life instead.
 *
 * OP15-094 Roronoa Zoro is the deck's one singleton: a 2-cost [Blocker] that
 * can trash itself to answer removal aimed at any other {Straw Hat Crew} body,
 * which is the redundancy layer under OP17-095's trash-bury.
 */
export const op13SaboManifest: DeckManifest = {
  id: "(Red/Black) Sabo - OP17 Elbaph List",
  format: "standard",
  leader: "OP13-004",
  cards: {
    "OP04-016": 3,
    "OP17-082": 4,
    "OP17-091": 4,
    "OP15-094": 1,
    "OP15-088": 4,
    "OP17-084": 3,
    "OP17-086": 4,
    "OP17-080": 4,
    "OP17-087": 3,
    "OP17-095": 4,
    "OP17-089": 4,
    "OP17-093": 4,
    "OP17-119": 4,
    "OP17-098": 4,
  },
};
