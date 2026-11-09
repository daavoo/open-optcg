/**
 * Card records by card number, with their derived rules. Printed card text is
 * not part of the package: a caller that shows it loads a text pack with
 * `loadPrintedText` (see docs/asset-packs.md).
 */
export {
  cardFormatLegality,
  cardRegistry,
  isStandardLegal,
  loadPrintedText,
  parsePrintedTextPack,
  printedText,
  registerCards,
  requireKnownCard,
  type CardDatabase,
  type CardDefinition,
  type CardRecord,
} from "@one-piece-sim/cards";
