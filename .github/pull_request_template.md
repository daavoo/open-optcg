<!--
Thanks for contributing. The rules from CONTRIBUTING, restated as a checklist,
plus the question a reviewer always has to ask: what does it do to the games.
-->

## What this changes

<!-- One or two sentences. If it fixes a card, name the card and the printed
     clause it was getting wrong. -->

## Checklist

- [ ] Scoped: a bug fix does not carry a refactor along with it.
- [ ] Tests added or updated for any rules-engine behaviour change, built with
      [`test/support`](../test/support/README.md).
- [ ] `pnpm verify` passes. (`pnpm verify:browser` too, for web changes.)
- [ ] No hand-edits to `generated.ts` / `generated-op17.ts` /
      `generated-community.ts` — those come out of `pnpm reference:fetch` +
      `pnpm reference:audit`.

## Effect on play

<!-- If this changes how a deck plays, say so with numbers: docs/theorycrafting.md
     has the paired-comparison tools. "No effect on play" is a fine answer for a
     refactor or a docs change. -->
