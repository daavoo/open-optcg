import type { DeckManifest } from "./index.js";

/**
 * Purple Kaido as the OP-17 tournament field plays it: the list that won a
 * Standard Battle at Sci-Fi Factory (USA, 20 September 2026) 4-0, pilot
 * handle "Angelito_1023".
 *
 * Source: onepiecetopdecks.com's OP-17 deck-list page, retrieved 25 Sep 2026,
 * whose `deckgen` link for the entry encodes the whole 50 as machine-readable
 * card counts rather than a transcription from an image. The same page and its
 * Japanese sibling carry thirty-two OP17-058 lists from 19 August to 21
 * September 2026 -- a Cardfest win, a Regional top 8, two EU Final placings and
 * thirteen Japanese shop wins among them -- and this one is chosen because it
 * is the most typical of the thirty-two, not because it is the best finish:
 * it is the list nearest the field's average count for every identity. That is
 * also why it ships as "- Open OPTCG" rather than under the event's name: it
 * stands for the field, and the event is where the 50 was read. Every
 * identity is already stamped by `pnpm reference:audit`, so the deck needs no
 * audit entry of its own.
 *
 * ## Where it differs from the feature deck
 *
 * Same Leader as `op17-kaido-manifest.ts`, the same ramp core -- four EB04-031
 * King, four EB04-032 Queen, four OP17-073 Basil Hawkins, four OP17-074 Yamato,
 * four OP17-062 Kaido -- and `op17-kaido-policy.ts` pilots both. What the field
 * does with the other thirty slots is close to the opposite of Bandai's list:
 *
 * - **four OP07-077**, the 1-cost look-at-five for an {Animal Kingdom Pirates}
 *   or {Big Mom Pirates} card. Every one of the thirty-two lists runs it, and
 *   it is the answer to the archetype's stated weakness, "highly dependent on
 *   playing 6c King exactly on curve": King is in its pool, and so is every
 *   other body here but Yamato.
 * - **three ST34-004 Charlotte Linlin**, a third cost-10 alongside OP17-062 and
 *   OP17-063 (three, where the feature deck runs four). Its `DON!! −4` buys a
 *   Life card and zeroes a Character's base power -- a cost the deck pays out
 *   of the rested DON!! a 10-cost play has just left on the field.
 * - **the removal and Counter Events the feature deck cut.** Three OP07-076
 *   Slow-Slow Beam Sword (`[Counter] DON!! −1` for +2000 and a rest, a
 *   `[Trigger]` that ramps), three OP15-078 Mamaragan, two OP08-077 Conquest of
 *   the Sea (`DON!! −2`, K.O. two cost-6-or-less) and one OP17-076. While
 *   OP17-062 is on the board it refunds one `DON!! −N` a turn.
 * - **two OP08-074 Black Maria**, whose activation adds five rested DON!! and
 *   gives back, at the end of the turn, whatever puts the field level with the
 *   opponent's -- DON!! a turn of `DON!! −N` costs can be paid out of.
 * - **two EB04-030 Kaido** at 7 cost, which buys [Rush] and a rest with a
 *   `DON!! −2` and answers its own K.O. with a DON!!.
 * - **OP17-060, OP17-068, OP17-069 and OP17-078 are all gone**, X.Drake drops
 *   to two and OP17-065 Queen to two, OP17-061 Lead Performers to three.
 *
 * Lives in its own module for the reason `op17-kaido-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op17KaidoFieldManifest: DeckManifest = {
  id: "(Purple) Kaido - Open OPTCG",
  format: "standard",
  leader: "OP17-058",
  cards: {
    "EB04-032": 4,
    "OP17-075": 2,
    "OP17-073": 4,
    "OP17-074": 4,
    "OP08-074": 2,
    "EB04-031": 4,
    "EB04-030": 2,
    "OP17-061": 3,
    "OP17-065": 2,
    "OP17-062": 4,
    "OP17-063": 3,
    "ST34-004": 3,
    "OP07-077": 4,
    "OP07-076": 3,
    "OP15-078": 3,
    "OP08-077": 2,
    "OP17-076": 1,
  },
};
