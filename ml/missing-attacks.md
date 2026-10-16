# The scorer passes with attacks on the table

## Resolved: the push-2 web pack was exported with a broken vocabulary

The checkpoint does not pass; its pack did. `sys1/export_web.py` built the
pack's word table from `data/bc/*.jsonl.gz`, which no longer exists (the
corpus is `data/manual-try`), so the table held only card names and
numbers: 2,873 words, missing 67% of the word occurrences in a rendered
decision (`life`, `hand`, `leader`, `rested`, the separators). The browser
tokenises a word outside the table byte by byte, which is not what the model
was trained on, so the in-browser model read about twice the tokens of
near-garbage. Against the MLX model on the same decisions:

| pack                                | top action agrees | worst probability gap | tokens a decision |
| ----------------------------------- | ----------------- | --------------------- | ----------------- |
| push-2 as exported 2026-09-26 20:35 | 24/48             | 0.89                  | 422               |
| push-2 re-exported with the fix     | 48/48             | 0.03                  | 203               |

Re-scored with the fixed pack, every pass in the table below becomes the
attack at 1.00 (15 rev 6, 23, 62; 16 rev 21), and the value head reads
0.6 to -0.05 where the broken pack read 0.96 everywhere. The `play` and
`manual-try` packs were exported from an older render version's corpus and
miss 6% of word occurrences (`me`, `mine`, `theirs`, `end`, ...), so they are
off too, less.

Python is unaffected: rollouts and evaluations tokenise with `bpe.ts`, which
is exact, so every win rate below and in the PPO logs stands. On 600
corpus positions with a landing attack open, every checkpoint from BC to
push-2 puts about 0.001 on passing.

The fix: `export_web.py` takes `--corpus` (default `data/manual-try`), refuses
a corpus in another render version, and refuses to write a pack whose table
misses any word of a shard it did not scan. Always run the `--parity` check
(`bridge/parity-web.ts`) on a new pack before playing it.

The rest of this note is the investigation as it stood before the cause was
found; its "likely mechanism" is not what happened. The entropy climb across
the PPO chain is real but did not produce these passes.

Traces 15, 16 and 17 (2026-09-26, human p1 on a custom ST21-001 list, the
scorer on p2 with Robin EU in 15 and Sabo Elbaph in 16/17): the model ends
turns with Characters that could swing at the Leader and land. The older
checkpoints did not do this.

## What it is not

Not the dominance filter. Replaying each trace and listing the offered
attacks at every pass shows the missed attacks were all offered to the
model, unpruned:

| trace | rev | turn | offered, unpruned                                  | what it did                                |
| ----- | --- | ---- | -------------------------------------------------- | ------------------------------------------ |
| 16/17 | 21  | 4    | OP17-080 5000 into a 5000 Leader (lands)           | pass                                       |
| 15    | 62  | 7    | two OP17-114, 7000 and 9000, into a 5000 Leader    | pass, after loading 8 DON!! onto those two |
| 15    | 6   | 3    | the Leader into the Leader                         | pass                                       |
| 17    | 51  | 6    | OP17-080 / OP17-089 into the Leader and Characters | pass                                       |

The one attack pruned in these traces (trace 16 rev 19, a 2000 Character
into a 5000 Leader) is the correct prune.

Not the renderer or the rules either: the same positions, rendered by the
same `render.ts` build, are attacked by the older packs (below).

## It is the push-2 checkpoint

The web pack is `checkpoints/push-2/best` (`scorer-model.json`, exported
2026-09-26 20:35). Scoring the same positions with that pack and the two
before it:

| position     | push-2 P(pass)          | play P(pass) | manual-try P(pass) |
| ------------ | ----------------------- | ------------ | ------------------ |
| 15 rev 6     | **0.56**                | 0.00         | 0.00               |
| 15 rev 23    | 0.44 (attacked, barely) | 0.00         | 0.00               |
| 15 rev 58    | 0.25                    | 0.00         | 0.00               |
| 15 rev 62    | **0.70**                | 0.00         | 0.00               |
| 16/17 rev 21 | **0.60**                | 0.00         | 0.00               |
| 17 rev 48    | 0.13                    | 0.00         | 0.00               |
| 17 rev 51    | **0.26** (top choice)   | 0.00         | 0.00               |

The older packs put essentially zero on pass whenever an attack is open, and
their top choice is the attack a player would make (OP17-080 into the
Leader at 16 rev 21 at 1.00; OP17-114 into the 6000 Character at 15 rev 62).
push-2 does not play these badly by a small margin: it spreads its mass over
pass and every attack, and pass comes out on top.

Two other signs in the same runs:

- **The value head is saturated.** push-2 reads 0.90-0.98 at every decision
  in all three traces, including 17 rev 51, where the older packs read
  -0.14 and -0.19. Against the human it is not winning those games by that
  much.
- **Entropy has climbed across the chain of PPO runs**, each starting from
  the last one's best: `manual-try-ppo` 0.23 → 0.42, `manual-try-selfplay`
  0.42 → 0.48, `push-sp150` 0.47 → 0.53, `push-2` 0.51 → 0.55. The policy is
  getting flatter each run, not sharper, while the win rate against the
  rules agents holds at 0.70-0.76.

## The likely mechanism (not yet tested)

`sys1/ppo.py` uses GAE with no discount (`gae`, "no discount") and the only
reward is the game result, plus an entropy bonus (`--entropy-coef 0.01`).
Against the rules agents push-2 wins ~75% of rollouts, and its value head
has learned to say "winning" almost everywhere. In that regime:

- A swing not taken costs nothing the reward can see. With no discount, a
  game won on turn 9 instead of turn 8 has the same return, so the
  advantage of attacking over passing is close to zero whenever the value
  head already reads ~1.
- With the policy gradient near zero on these choices, the entropy bonus is
  the only force left on them, and it pushes every option towards equal
  probability -- including pass. That is exactly the push-2 shape: pass,
  attack-the-Leader and attack-a-Character all within a few tenths.
- The rules agents do not punish a lost tempo turn the way a person does,
  so the win rate that picks `best/` does not register the drift.

The human seat is outside that distribution: the games are closer than the
rollouts, and the value head's 0.97 is wrong there.

## What would confirm it, and what would fix it

Checks, cheapest first:

1. Score the `push-2/iter-0025`, `-0050`, `-0075` snapshots and
   `push-sp150/best` on these positions. If P(pass) climbs with the
   iteration, the drift is a PPO effect, not something push-2's start did.
2. Count, over a batch of push-2 vs rules-agent games, turns that end with
   a landing attack still offered (the renderer's end-turn audit already
   computes the attacks left). Compare with the `play` pack. That gives a
   rate instead of three traces.
3. Look at the advantages PPO assigned to pass in those decisions -- if
   they are ~0, the mechanism above is the story.

Fixes to try, one at a time:

- A discount (gamma ≈ 0.99 per scorer decision, or per turn) so a faster
  win is worth more than a slower one.
- Lower or anneal the entropy coefficient once the policy is past BC; the
  bonus is doing the damage only where the reward has gone flat.
- A dominance rule: passing while an attack that lands is offered. Not a
  strict dominance (keeping a Blocker back is real), so this is a
  judgement rule and does not belong in `dominance.ts` as it stands; at most
  an "end the turn with every free swing" check limited to attackers that are
  not Blockers and a Leader attack, which loses nothing by declaring.
- Until then, export the web pack from `play` or `manual-try` instead of
  push-2.

## Reproducing

Two scratch scripts, not part of the pipeline:

```sh
# offered attacks and what was pruned at each of the scorer's decisions
pnpm exec tsx ml/bridge/_inspect-trace.ts "open-optcg-trace(16).jsonl"
# P(pass) and the top four options under each pack
C=ml/checkpoints
pnpm exec tsx ml/bridge/_score-trace.ts "open-optcg-trace(16).jsonl" \
  $C/push-2-scorer-model.json $C/play-scorer-model.json $C/manual-try-scorer-model.json
```
