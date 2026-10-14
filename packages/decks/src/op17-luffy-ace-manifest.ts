import type { DeckManifest } from "./index.js";

/**
 * Red/Green Luffy & Ace as the OP-17 field builds it: a Straw Hat rush list
 * under the ST-30 Leader, rather than the starter's 6000-power tribe deck.
 *
 * Source: supplied as a card list by the project maintainer on 26 Sep 2026,
 * without an event or pilot, which is why it ships as "- Open OPTCG" rather
 * than under a placing. It is close to the gumgum.gg OP-17 lists for ST30-001
 * (the "Standard Battle, 1st" entry, retrieved 26 Sep 2026, shares thirteen of
 * its sixteen identities) and differs where noted below. Every identity is
 * already stamped by `pnpm reference:audit` from its own set, so the deck needs
 * no audit entry of its own.
 *
 * ## What the deck does
 *
 * The Leader is the thing that attacks; the Characters are the thing that
 * walls. On the opponent's turn ST30-001 gives +3000 to every one of its
 * controller's [Portgas.D.Ace] and [Monkey.D.Luffy] cards, and twelve of the
 * fifty are [Monkey.D.Luffy]: ST21-014 and ST30-012 are 6000s that defend at 9000, and
 * OP12-015 is a 4000 that is a 9000 with two given DON!!. Nothing in the list
 * has 7000 base power, so the Leader's own −2000 never switches on.
 *
 * On offence it is a rush deck. ST21-014 has [Rush], ST30-012 buys it with a
 * rested DON!! and rests a [Blocker] on the way in, ST31-001 Sanji draws and
 * drops a second Straw Hat body, and OP12-015 reveals two Events to cheat a
 * third out of hand. ST21-003 Sanji takes [Blocker] away from a 6000's attack
 * for the turn. Sixteen look-at-the-top cards find them: four each of
 * OP01-016, EB02-017, EB04-002 and ST31-005, all costing 1, and two OP14-019.
 *
 * The Events are defence: OP04-016, OP17-017 and OP06-017 are Counters,
 * OP13-040 and OP12-037 are Green rest-locks with a Leader Counter half, and
 * one ST21-017 is the removal.
 *
 * ## Where it differs from the gumgum list
 *
 * - **four ST30-012**, up from two: the Blocker-rester is the body the ST-30
 *   policy already swings first.
 * - **four OP17-017 Ga Ha Ha Ha!!** and **one OP06-017** in place of P-135 and
 *   OP12-018. The Leader is {Whitebeard Pirates}, so OP17-017's +2000 always
 *   has a target, and its −2000 on the attacker is the second half.
 * - **one ST21-003 Sanji**, and one ST21-017 rather than four.
 * - **four EB04-002**, **four OP04-016**, **three OP12-037** and **two
 *   OP13-040**, where the gumgum list runs three, three, one and four.
 *
 * Lives in its own module for the reason `st30-luffy-ace-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op17LuffyAceManifest: DeckManifest = {
  id: "(Red/Green) Luffy & Ace - Open OPTCG",
  format: "standard",
  leader: "ST30-001",
  cards: {
    "EB04-002": 4,
    "OP01-016": 4,
    "EB02-017": 4,
    "ST31-005": 4,
    "ST21-003": 1,
    "OP12-015": 4,
    "ST30-012": 4,
    "ST21-014": 4,
    "ST31-001": 4,
    "OP04-016": 4,
    "OP14-019": 2,
    "OP17-017": 4,
    "OP06-017": 1,
    "OP12-037": 3,
    "OP13-040": 2,
    "ST21-017": 1,
  },
};
