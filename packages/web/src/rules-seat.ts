import {
  deckManifests,
  SEALED_LEADER,
  type DeckManifest,
} from "@one-piece-sim/decks";

/**
 * The Leader whose registered policy a rules seat in the browser should play.
 *
 * Its own module rather than an inline branch in `worker.ts` because that file
 * is bundled separately and imports `self`, so nothing can test it -- and the
 * thing that needs testing here is a *correspondence*, between the decks the app
 * ships and the policies `packages/agents` registers.
 *
 * That correspondence used to be a hand-written switch over the six ST deck ids,
 * which meant every OP-set deck fell through to `GenericRulesAgent` and played
 * the browser with no deck policy at all -- silently, because a generic agent
 * still returns legal actions. A trace of the OP16-TEACH-ZAGREB seat is what
 * found it: the seat trashed a [Trigger] card to "redirect" an attack on its
 * Leader onto its Leader, three payoff bodies standing beside it unconsidered,
 * which is what taking the first non-skip option offered looks like. Reading the
 * Leader off the manifest instead means a deck plays its policy in the browser
 * the moment its manifest exists.
 *
 * Returns `null` for a deck with no manifest and no Leader to key a policy on;
 * the caller falls back to the generic agent rather than stranding the match.
 */
export function rulesSeatLeader(
  deckId: string,
  manifest?: DeckManifest,
): string | null {
  // Sealed decks are one-off manifests (`SEALED-<seed>`), never a deckId with a
  // manifest in `deckManifests`, but they all share `SEALED_LEADER` -- the
  // Leader identity the registry keys its sealed-specific modules (free-block,
  // Gloriosa) on, and the one this repo's sealed tooling
  // (`sealed-heuristic-ab.ts`, `sealed-analysis.ts`) benchmarks against.
  if (deckId.startsWith("SEALED-")) return SEALED_LEADER;
  return (manifest ?? deckManifests[deckId])?.leader ?? null;
}
