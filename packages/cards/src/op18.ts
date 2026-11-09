import type { CardRecord } from "./index.js";
import { op18CardRecords } from "./generated-op18.js";

/**
 * OP18 "The Dominance of God" booster identities.
 *
 * Provisional. Bandai has not listed OP-18 on its English card list, so the
 * records come from Logbook's English rendering of the Japanese cards through
 * the audit's provisional pass (`tools/audit-cards/src/index.ts`), every one
 * `sourceMatch: false`. When Bandai lists the set, its entry moves to the
 * audit's `setSeries` and this module reads the primary records instead; the
 * card programs stay, and whatever the primary text corrects shows up as a
 * failing clause test rather than as a silent drift.
 */
export const op18Cards: readonly CardRecord[] = op18CardRecords;
