declare const __WORKER_SOURCE__: string;
declare const __ANALYTICS_WORKER_SOURCE__: string;
declare const __BUILT_IN_CARD_ART__: Readonly<Record<string, string>>;
/** A `--with-text` build's printed-text pack; null in every published build. */
declare const __BUILT_IN_PRINTED_TEXT__: Readonly<
  Record<string, { effect: string; trigger: string }>
> | null;
/**
 * Where this build's match server is: `""` when it has none, `"self"` for the
 * origin serving the page, or an absolute origin. Set by
 * `pnpm web:build:server`; see `tools/build-web.ts`.
 *
 * A build with no server does not offer online play, because there is nothing
 * behind it: the GitHub Pages site and the `wrangler` deploy are the same
 * bundle, and only one of them has a Worker.
 */
declare const __MATCH_SERVER__: string;
/**
 * True when the build inlined a trained OP17 sealed policy into the worker
 * (`ml/python/export_web_policy.py` output present at build time). Only
 * gates whether the "Learned model" sealed opponent option is offered; the
 * weights themselves live in the worker bundle, not here.
 */
declare const __LEARNED_SEALED_POLICY_AVAILABLE__: boolean;
/**
 * True when the build inlined a System-1 scorer model pack into the worker
 * (`research/system1/sys1/export_web.py` output at
 * `packages/web/src/scorer-model.json`). Gates the "Learned model" opponent
 * card on the match setup screen.
 */
declare const __SCORER_AVAILABLE__: boolean;
