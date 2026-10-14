import { loadPrintedTextCache } from "@one-piece-sim/cards/node";

// Printed text is not committed. Tests that quote it -- a clause's exact
// wording, the markup renderer -- read the cache `pnpm reference:audit` writes,
// and skip themselves when a checkout has none. Everything that decides rules
// reads the derived `CardRules` and needs nothing here.
loadPrintedTextCache();
