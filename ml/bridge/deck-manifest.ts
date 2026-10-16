/**
 * Prints a training deck's list as JSON, for `sys1.export_adapter`, which
 * puts it in a deck adapter so the app can tell which seats it is for.
 *
 *   pnpm exec tsx ml/bridge/deck-manifest.ts mon
 */
import { trainingManifest } from "./decks.js";

const [deckId] = process.argv.slice(2);
const manifest = deckId ? trainingManifest(deckId) : undefined;
if (!manifest) throw new Error(`unknown deck: ${deckId ?? "(none)"}`);
console.log(
  JSON.stringify({
    id: manifest.id,
    leader: manifest.leader,
    cards: manifest.cards,
  }),
);
