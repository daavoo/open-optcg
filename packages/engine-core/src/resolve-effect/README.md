# resolve-effect/

One resolver per `PendingEffect` kind: what answering that effect does.

`resolveEffect` in `effects.ts` was 2,229 lines — forty-five
`if (effect.kind === …)` blocks in an order that mattered in three places and
nowhere said so. It is now the shared preamble plus a dispatch through
`EFFECT_RESOLVERS`, a mapped type over every kind, so a new kind without a
resolver is a compile error rather than an effect that silently resolves to
nothing.

The three order dependencies, now stated instead of implied:

- A bare `state.pendingEffect = null` sat between the eleventh and twelfth
  branch, so whether an effect stayed pending depended on where its branch
  happened to be written. That is now `KEEPS_EFFECT_PENDING` in `effects.ts`,
  naming the eleven kinds that suspend again and need the effect they are
  amending to still be there. (Dropping this statement in the first draft of the
  split lost five cards into a resolved search's `revealed` list — the engine's
  own card-conservation invariant caught it, which is what that invariant is
  for.)
- A shared `if (optionId === "skip")` block below every other branch could only
  ever be reached by `ko-character` and `rest-character`; it now lives in their
  resolver.
- The fallthrough tail handled exactly one kind, `add-top-deck-to-life`, and is
  registered under it.

Modules group kinds by what they do to the game, not by which deck prints them:
`costs`, `replacements`, `removal`, `restrictions`, `deck`, `discards`, `life`,
`leaders`, `plays`, `don`, `mechanic-choice`. A resolver that handles two kinds
(`ko-character`/`rest-character`, `bottom-deck-character`/`prevent-attack`,
`discard-for-life`/`discard-supernova-draw-two`) takes a union of contexts and is
registered under both keys.
