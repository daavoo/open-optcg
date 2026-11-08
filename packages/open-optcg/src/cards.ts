/**
 * Card records by card number, with their derived rules. Printed card text is
 * not part of the package: a caller that shows it loads a text pack with
 * `loadPrintedText` (see docs/asset-packs.md).
 */
export {
  cardFormatLegality,
  cardRegistry,
  createCardDatabase,
  isStandardLegal,
  loadPrintedText,
  parsePrintedTextPack,
  printedText,
  requireKnownCard,
  type CardDatabase,
  type CardDefinition,
} from "@one-piece-sim/cards";
