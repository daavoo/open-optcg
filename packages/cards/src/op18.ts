import type { CardRecord } from "./index.js";
import { op18CardRecords } from "./generated-op18.js";

/**
 * OP18 "The Dominance of God" booster identities.
 *
 * Read from Bandai's English card list (series 569118) by the audit's
 * `setSeries` pass, as every other booster is.
 */
export const op18Cards: readonly CardRecord[] = op18CardRecords;
