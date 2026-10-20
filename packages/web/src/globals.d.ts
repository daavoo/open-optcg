declare const __WORKER_SOURCE__: string;
declare const __ANALYTICS_WORKER_SOURCE__: string;
declare const __BUILT_IN_CARD_ART__: Readonly<Record<string, string>>;
/** A `--with-text` build's printed-text pack; null in every published build. */
declare const __BUILT_IN_PRINTED_TEXT__: Readonly<
  Record<string, { effect: string; trigger: string }>
> | null;
/**
 * True when the build inlined a System-1 scorer model pack into the worker
 * (`ml/sys1/export_web.py` output at
 * `packages/web/src/scorer-model.json`). Gates the "Learned model" opponent
 * card on the match setup screen.
 */
declare const __SCORER_AVAILABLE__: boolean;
