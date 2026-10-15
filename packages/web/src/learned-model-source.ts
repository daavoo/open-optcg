/**
 * The learned model as a worker gets it: from its own bundle, or from the
 * main thread.
 *
 * A default build inlines the pack and its deck adapters into each worker
 * (`__SCORER_PACK__`). The hosted page is built with `--external-model`, which
 * leaves them out and sets `__SCORER_PACK_BY_MESSAGE__`: the page fetches
 * `learned-model.json` once (`learned-model.ts`) and posts its text to every
 * worker, and a seat that wants the model before it has arrived waits here.
 * Shared by `worker.ts` and `analytics-worker.ts`.
 */
import {
  type CompactAdapter,
  type CompactPack,
  type ScorerPack,
} from "@one-piece-sim/agents/scorer";

/** Baked in by `tools/build-web.ts`; see the module comment. */
declare const __SCORER_PACK__: ScorerPack | CompactPack | null;
declare const __SCORER_ADAPTERS__: CompactAdapter[];
declare const __SCORER_PACK_BY_MESSAGE__: boolean;

export interface LearnedModel {
  pack: ScorerPack | CompactPack;
  adapters: CompactAdapter[];
}

/** What the main thread posts: the file's text, or null if it could not be had. */
export interface LearnedModelMessage {
  learnedModel: string | null;
}

let settle: {
  resolve: (model: LearnedModel) => void;
  reject: (error: Error) => void;
} | null = null;
const arriving = new Promise<LearnedModel>((resolve, reject) => {
  settle = { resolve, reject };
});
// Read only when a seat asks; a page that never plays the model must not
// report the failed download as an unhandled rejection.
arriving.catch(() => undefined);

export function learnedModel(): Promise<LearnedModel> {
  if (__SCORER_PACK__) {
    return Promise.resolve({
      pack: __SCORER_PACK__,
      adapters: __SCORER_ADAPTERS__,
    });
  }
  if (!__SCORER_PACK_BY_MESSAGE__) {
    return Promise.reject(new Error("SCORER_PACK_MISSING"));
  }
  return arriving;
}

export function isLearnedModelMessage(
  data: unknown,
): data is LearnedModelMessage {
  return typeof data === "object" && data !== null && "learnedModel" in data;
}

/** Takes the main thread's message; only the first one counts. */
export function receiveLearnedModel(message: LearnedModelMessage): void {
  const pending = settle;
  if (!pending) return;
  settle = null;
  if (message.learnedModel === null) {
    pending.reject(
      new Error("The learned model could not be downloaded; reload to retry."),
    );
    return;
  }
  pending.resolve(JSON.parse(message.learnedModel) as LearnedModel);
}
