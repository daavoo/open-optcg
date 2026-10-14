# Towards the strongest pilot

Where the three kinds of opponent stand, what the game actually asks of a
pilot, what the field has learned about card-game AI, and a staged plan for the
learned opponent that ends with it beating the rules agents on every deck and
shipping in the browser. This is a proposal, not a record; each stage names the
instrument that decides whether it stays, and nothing here is done until that
instrument says so.

[ml/README.md](../ml/README.md) documents the sidecar as it is;
[theorycrafting.md](theorycrafting.md) documents the measurement tools this plan
leans on; [llm-opponents.md](llm-opponents.md) documents the LLM seat.

## 1. What the game asks of a pilot

Everything below is what the engine already enforces (the rules map is
[rules-map/comprehensive-rules.md](rules-map/comprehensive-rules.md)); this is
the reading of it that matters for an agent.

**One resource, three uses.** DON!! is the only mana. Every turn adds two (one
for the first player's first turn), and each DON!! can be spent on a card,
rested for an activation cost, or given to a Leader or Character for +1000
power and progress towards a `[DON!! xN]` gate. A given DON!! stays attached
through the opponent's turn, so it defends too, and comes back at Refresh.
Allocating DON!! is the decision the game is about, and it is made one DON!! at
a time as a sequence of `attach-don` actions.

**Hand is both development and defence.** Most Characters print a Counter
value (1000 or 2000), so every card kept in hand is a Counter that can be
thrown in front of an attack, and every card played is a Counter gone. The
defender's power must exceed the attacker's to survive, so pressure is measured
in Counter _cards_ forced out, not in raw power: raising an attack from 5000 to
6000 costs the defender a whole card, raising it from 5000 to 5500 costs nothing.

**Life is hit points and card advantage at once.** A Leader hit moves the top
Life card into the defender's hand, so taking a hit is nearly card-neutral and
countering is not. Some Life cards carry a `[Trigger]` that fires when taken.
Whether to absorb or defend is a question about the clock, not the board:
who wins the race decides it, and `packages/agents/src/rules/race.ts` exists
because none of the deck policies could ask that question.

**Attacks are a sequence with order effects.** An attacker rests when it
declares, its power is frozen at declaration, and a rested Blocker cannot
block on the next turn. The defender answers each attack with at most one
Blocker and then Counters, some of which are once-per-turn. So a turn is not
"pick the best action" but "pick the best ordered line of six to fifteen
actions", where the value of an early attack depends on what it baits out
before the big one.

**Hidden information is asymmetric and public knowledge accumulates.** Hidden:
the opponent's hand (its size is public), both deck orders, both Life stacks
(your own included, unless turned face-up). Public: both boards, both trashes,
DON!! counts, hand counts, face-up Life, everything revealed by searches
announced as public, and deck-top knowledge an effect granted (`observe()`
tracks it in `self.knowledge`). In constructed play the opponent's list is a
scouting profile rather than a known list; the LLM dossier is explicit that it
is "not the opponent's submitted deck list" and this plan keeps that stance.

**The decision tree is shallow and wide in the wrong places.** Measured over
the thirty format pairings with the rules agents on both seats:

| Quantity                                 | Value                                        |
| ---------------------------------------- | -------------------------------------------- |
| Decisions per game                       | 176                                          |
| Turns per game                           | 14                                           |
| Legal actions per decision (mean / p50)  | 6.7 / 4                                      |
| Legal actions per decision (p95 / max)   | 21 / 80                                      |
| Decisions with exactly one legal action  | 20%                                          |
| Most frequent action types               | attack 34%, attach-don 16%, pass 12%         |
| Engine throughput, rules agents thinking | ~770 decisions/s on one core                 |
| Engine throughput, random agent          | ~4,000 decisions/s (`ml/README.md`)          |
| Randomness                               | shuffles, Life order, Triggers; all seeded   |
| Outcome                                  | Leader hit at 0 Life or deck-out; no draws\* |

\*A game that hits the 800-action cap is `truncated` and scored 0 in the
sidecar; the committed standings record zero such games.

The wide tail is `resolve-effect`: a search that offers every card it found,
a DON!! return that offers every pool. The frequent decisions are narrow
(attack or not, which target, where the DON!! goes), and that is what makes
one-ply search cheap and a full-turn search affordable (stage 3 below).

## 2. Where each pilot stands

### Rules agents

`packages/agents/src/rules/` is a registry of policy modules keyed by Leader:
a whole-turn `decide` ladder per deck, `rank`/`veto` modules that narrow what
the ladder chooses from, format fundamentals measured one by one with
`pnpm heuristic:ab`, and strategy profiles layered by archetype. Two modules
already use the engine as a simulator: `don-lookahead` vetoes a DON!!
attachment that a one-ply simulation shows to unlock a strictly worse attack
set, and `don-sequence` scores DON!! plans. Every decision carries its module
id and reasons, so a trace explains itself.

What the instruments say:

- Deck standings: two committed round-robins, the built lists in
  [deck-standings-featured.csv](rules-map/deck-standings-featured.csv) and
  Bandai's precons in
  [deck-standings-starter.csv](rules-map/deck-standings-starter.csv). Each is a
  closed field with a mean of 50% by construction, so a row says how a deck
  fares against its own shelf, and the spread measures policy quality at least
  as much as deck quality. `pnpm census` names the
  share of a deck's decisions no rule shaped at all.
- [Puzzle pilots](rules-map/puzzle-pilots.md): 3 of 4 forced wins found. The
  miss, `three-don-and-one-of-them-is-the-body`, is a DON!! allocation: the
  pilot gives the DON!! to its Leader where the solver gives it to the
  Character it just played. The one-ply lookahead counts the attacks one
  attachment unlocks and cannot price the whole line.
- The rules layer is 19,100 lines for 22 decks, and adding a deck means
  writing 300-600 lines of ladder plus a mulligan module and measuring each
  rule with `deck:ab`. There are 1,122 cards in the registry and a new set
  every few weeks; hand-written piloting does not scale to the pool.

The rules agents are the right baseline and the right opponent pool seed:
deterministic, fast, and instrumented to the decision. They are not the
strongest pilot this engine can host, and the two gaps `analysis/` named
(sequence value and DON!! allocation) are search problems, not rule problems.

### The LLM agent

`packages/agents/src/llm/agent.ts` sends one request per real decision with the
hidden-safe observation, the legal action ids and a deck dossier, resolves
forced steps locally, commits to a whole Counter line in one reply, and
offers effect follow-ups read off `simulateLine` so an On Play and its target
cost one call rather than two. It is the closest thing in the repo to a human
across the table, and its reasoning fold in the match history is the best
explanation surface the app has.

What is known about its play, all of it from the header of `agent.ts`:

- Two prompt interventions were measured with `pnpm trace:shadow` and did
  nothing: a bullet on completing `[DON!! xN]` (9/16 vs 8/16) and a bullet on
  body versus removal (10/18 vs 9/18). The model develops a body half as often
  from the conversation it actually held as from a fresh context (4/12 vs
  8/12). The bias lives in the conversation, not in the instructions.
- It costs a few hundred requests a game, cannot run on the hosted page, and
  is nondeterministic, so its puzzle score is reported and never committed.
- There is no committed win rate against the rules agents. `pnpm matchup:llm`
  can produce one but nothing in the repo records it.

The LLM is not going to be the strongest pilot per decision or per dollar. Its
strengths are reading printed text it has never seen and explaining a line in
words; section 7 proposes using it for exactly that.

### The learned opponent

`ml/` trains a pointer policy with MaskablePPO: an 849-float global vector
(scalars per side, Leader one-hot, five sorted board slots per side, six
multi-hot bags over a 90-card format vocabulary plus OP17) and one 111-float
row per legal action (type one-hot, engine-computed combat arithmetic, card
one-hot), softmaxed over the legal rows. The opponent is a rules agent run
inside the Node process, or a frozen earlier checkpoint. A potential-based
dense reward is available. The actor is exported as JSON and replayed by a
hand-ported forward pass in `learned-sealed-agent.ts`, so the browser build
offers it as the "Learned model" sealed opponent without a tensor runtime.

Results, from `ml/README.md`: 60% against `RegistryRulesAgent` on ST31 vs ST32
after 1.4M steps, 77% on OP17 sealed with the deck mirrored, ten minutes of CPU
each. That is the important fact about this codebase: a small policy trained
for minutes beats the hand-written pilot on the one matchup and the one format
it was trained on. What stops it being the strongest pilot:

1. **It was measured against one opponent and trained against it.** A policy
   that beats a fixed opponent may have learned that opponent's mistakes.
   `tools/decision-regret.ts` warns about exactly this for rollouts, and the
   ByteRL study (section 3) found the same for a published card-game agent.
   Nothing in the repo measures the learned policy against the other 21 deck
   policies, against the LLM, or against a best response trained to beat it.
2. **It cannot see a card it was not trained on.** Card identity is a one-hot
   over a frozen vocabulary; a new set reindexes every column and the
   checkpoint becomes meaningless, which is why the shipped sealed opponent is
   OP17-only and why `encode.ts` says to retrain before touching the
   vocabulary. The observation is 849 floats of which almost all are zero.
3. **It never looks ahead.** The engine is a deterministic, hidden-info-safe
   simulator that steps 4,000 times a second, the rules agent uses it for
   one-ply lookahead, the LLM uses it for follow-ups, and the learned policy
   uses it for nothing. The two documented weaknesses of the rules agents,
   sequence value and DON!! allocation, are the ones a policy without search
   inherits.
4. **The critic is as blind as the actor.** Credit assignment over 176
   decisions with a terminal reward is hard; the critic sees only the
   observation although at training time the true state is right there.
5. **Throughput is IPC-bound.** 2,000 learner steps a second against 4,000
   the engine can do, one JSON line per step per environment.
6. **The self-play is one frozen snapshot**, with no opponent pool and no
   sampling by difficulty, and the two-seat AEC environment exists but the
   trainer does not use it.

## 3. What the field has learned

Read for what transfers to a TypeScript engine on a laptop, not for what
needed a datacentre.

**Policy gradient is a sound base for hidden-information games.** The
motivation for CFR-, fictitious-play- and double-oracle-based deep RL was the
supposed failure of plain self-play policy gradient in imperfect-information
games. A 2025 study over 5,600 training runs found the FP, DO and CFR families
fail to outperform generic policy gradient methods, and magnetic mirror descent
(a policy gradient regularised towards a "magnet" policy) converges to
quantal-response equilibria with a proof. The practical reading: keep PPO, add
a KL term towards a slowly moving reference policy, and spend the effort on
opponents and representation rather than on porting Deep CFR across a
subprocess boundary. `ml/README.md` already reached the same conclusion for
different reasons.

**Collectible card game agents that got strong share one shape.** ygo-agent
(Yu-Gi-Oh!, over 100M self-play games) encodes each card as a token with a
learned id embedding plus LLM embeddings of the card text, runs a sequence
model over the tokens, masks the legal actions and deploys to TFLite; its
roadmap names league training as the next step. DeNA's Pokémon TCG Pocket agent
(CEDEC 2025/2026) is a stateless transformer of about two million parameters
trained with HandyRL, an IMPALA-style learner-worker with V-trace and UPGO,
for 50 million episodes per model. The open-source Pokémon TCG Pocket
simulator trains PPO with a custom transformer policy. Cards as tokens,
attention over them, pointer over legal actions, self-play at scale.

**A card-game agent trained against fixed opponents is exploitable.** The
"Learning to Beat ByteRL" study took the strongest published Legends of Code
and Magic agent and trained a best response that beat it, and reads that as a
warning about opponent diversity. AlphaStar's answer was a league with
prioritised fictitious self-play, sampling opponents in proportion to how
often they beat the learner, plus exploiter agents whose job is to find the
main agent's blind spots; PFSP measured better than plain fictitious self-play
on population strength, exploitability and final performance.

**Search under hidden information is done, cheaply, with determinization.**
The strongest Hearthstone bots combine perfect-information Monte Carlo (sample
the hidden cards, search the resulting perfect-information game, aggregate)
with information-set MCTS, and add a heuristic attack solver so the search
does not have to rediscover combat arithmetic every node. Magic: The Gathering
work used ensemble determinization the same way. The principled alternatives,
ReBeL and Student of Games, search over public belief states with a
counterfactual value network and are sound; they are also built for games
whose public state and private-state count fit a belief vector, and they cost
orders of magnitude more compute than this project has. Determinization with a
learned value at the leaves is the right first search here, and the shape of
this game makes it cheaper than in Hearthstone: within the pilot's own turn the
opponent's only decisions are block and Counter, so the hidden information that
matters for a turn is "what Counters do they hold", which the hand count bounds.

**Self-play learns faster from diverse starts.** A 2026 study on
data-augmented game starts for imperfect-information self-play resets episodes
from varied mid-game positions rather than from the opening, and reports faster
exploration. This repo already has the corpus: benchmark traces, exported
browser traces, and a puzzle catalog built through `GameService.create`'s
`setup` hook.

**The critic may know what the actor may not.** Suphx (Mahjong) trained with
"oracle guiding", a critic that sees hidden information during training and is
withdrawn at play; asymmetric actor-critic is the same idea under a different
name. Nothing at inference changes, hidden information is still enforced by
`observe()`, and the variance of the value target drops.

## 4. The plan

Six stages. Each is independently useful, each names its gate, and the order is
the order of expected return per week of work. Stages 0 and 1 are
prerequisites for trusting anything after them.

### Stage 0: measure the right thing

Nothing after this stage is worth doing without a way to know it worked.

- **An arena.** `pnpm arena` (or `head-to-head` grown to take a pilot as well
  as a deck) plays any two pilots over paired seeds: rules, learned checkpoint,
  LLM, search-augmented, random. Output is a win rate with a paired confidence
  interval, and over a pool of pilots a Bradley-Terry rating, the same way the
  standings report decks. The learned pilot enters the arena against every
  registered deck policy, not the one it trained on.
- **Exploitability, measured.** Train a best response against a frozen
  checkpoint for a fixed budget (the sidecar already has `--opponent self
--frozen-checkpoint`); its win rate after that budget is the exploitability
  number. A pilot whose exploitability keeps rising with the budget has
  memorised an opponent.
- **The learned pilot on the puzzle scoreboard.** Greedy play over a fixed
  checkpoint is deterministic, so `pnpm puzzles:pilot --pilot=learned` can be
  committed to [puzzle-pilots.md](rules-map/puzzle-pilots.md) like the rules
  pilot, with the checkpoint hash in the header.
- **Regret mining, from a tool to a pipeline.** `pnpm trace:regret` asks of one
  recorded decision whether another legal action would have won. Run it over a
  whole benchmark report, keep the positions where a one-turn forced win
  existed and the pilot missed it (`solveFromState` proves the win), and emit
  them as puzzle candidates. Four puzzles is a smoke test; a few hundred mined
  positions is a tactics suite with no noise in it, and it grows with every
  benchmark run. This is the single instrument every later stage regresses
  against.
- **Per-action-type regret.** The same tool split by action type says whether
  a pilot loses games in the Counter step, in DON!! allocation or in target
  choice, which decides where search (stage 3) is aimed first.

Gate: the arena, the exploitability number and the mined-puzzle suite exist and
are reported for the shipped OP17 checkpoint. Expect the checkpoint's arena
rating against the other deck policies to be well below its 60% headline.

### Stage 1: cards as tokens, actions as pointers

Replace the one-hot bags and the fixed board slots with a set of card tokens.

- **A card token** is the concatenation of a learned embedding of the card's
  registry index (all 1,122 cards, extended append-only as sets land, so a
  checkpoint's embedding table grows rather than reindexes), the derived facts
  the observation already carries (category, cost, power, Counter, colours,
  types, attribute, keywords, `donRequirement`, `hasTrigger`,
  `hasCounterEvent`, and the boolean and clause-kind fields of `CardRules`),
  and the instance state (zone, owner, rested, summoning sick, attached DON!!,
  current power and cost, face-up). Unknown cards (the opponent's hand, face-
  down Life) are tokens too, with only zone and owner filled.
- **A decision** is the set of tokens on both sides plus a handful of global
  tokens (turn, phase, DON!! counts, Life counts, deck counts, the active
  battle's arithmetic), run through two to four layers of a small transformer
  encoder or, as the cheap first cut, a DeepSets encoder. Order-invariance
  removes the board-sorting hack in `slotOf` and the five-slot cap.
- **An action** points at the tokens it touches: an attack is (attacker token,
  target token, the engine's `attackPower`, `effectiveTargetPower`,
  `counterShortfall`, `unspentActiveDon`); a play is (hand token); a DON!!
  attachment is (target token); an effect option is (source token, chosen
  token). The pointer head scores each legal action from the pooled encoder
  state and the referenced token states. This is the existing pointer policy
  with the action row built from token embeddings instead of a one-hot.
- **Generalisation is the point.** A card the policy has never seen enters
  with its `CardRules` features filled and a fresh embedding, so a new set is
  playable at reduced strength on day one rather than after a retrain, and
  sealed can draw from every supported expansion instead of OP17. The printed
  text embeddings ygo-agent uses would help further but the printed text is a
  runtime asset here and stays out of the repo; a text-embedding table can be
  an optional, gitignored feature file like the weights themselves.
- **Layout drift stays fatal.** Keep the `rl-encoding.test.ts` contract: the
  encoder version and card-table hash are written into the checkpoint and
  refused on mismatch, as `rl-server.ts` does today for `observationSize`.

Gate: the token policy trained with the current recipe matches the 849-float
policy on ST31 vs ST32 and OP17 sealed within noise, and additionally plays
the OP16 sealed pool without retraining at better than the random agent. Then
it becomes the default and the flat action table is deleted.

_Status:_ implemented as `--policy token` (`ml/bridge/tokens.ts`,
`ml/bridge/card-table.ts`, `ml/python/token_policy.py`); see the token policy
section of [ml/README.md](../ml/README.md). The gate has not been run.

### Stage 2: the training signal

- **An asymmetric critic.** The bridge emits, alongside the observation, a
  critic-only vector built from the true `GameState` on the Node side: the
  opponent's hand tokens, the Life contents, the next few cards of each deck.
  The critic reads both; the actor reads only the observation. The vector never
  leaves the training process and `observe()` is untouched, so the hidden-
  information guarantee is unchanged at play. Expected effect: a value target
  that knows whether the Counter is in hand, and so a much lower-variance
  advantage over 176 steps.
- **Two seats from one learner.** Use the AEC environment: both seats play the
  same parameters with a seat feature, every game yields two trajectories, and
  the opponent is the current policy rather than a snapshot half the time.
- **An opponent pool with PFSP.** The pool holds the deck's rules agent, the
  rules agents of the decks it will face, past checkpoints at intervals, and
  the random agent as a sanity floor. Opponents are sampled in proportion to
  how often they beat the current learner. This keeps the rules agents in the
  curriculum, which is what makes the arena number comparable to the
  standings, while making them one opponent among many rather than the thing
  being fitted.
- **A magnet.** Add a KL penalty towards an exponential moving average of the
  policy's own weights (the magnetic-mirror-descent recipe; R-NaD is the same
  idea with a periodically reset reference). Cheap, and the finding is that it
  is what makes policy gradient behave in hidden-information games. The Counter
  step is where this game is most a game of bluff, and it is where an
  unregularised self-play policy is most likely to cycle.
- **Diverse starts.** Sample a fraction of episodes from mid-game positions in
  the benchmark corpus and the mined-puzzle suite, through the `setup` hook.
  The corpus positions are engine-produced, so every one of them passes the
  invariants a dealt game does.
- **Reward stays terminal.** ±1 on the result, 0 on truncation. The dense
  potential in `train.py` stays behind its flag as a curriculum aid for the
  first minutes; it must never be on for the run that produces a shipped
  checkpoint.
- **One policy for the format.** `--deck all` with the Leader token already
  exists; make it the default. Sealed episodes draw a pool from every supported
  expansion and mirror it, as today.
- **Throughput.** Add a vectorised `step` to `rl-server.ts` that takes N
  actions and returns N payloads in one line, so the IPC cost is paid once per
  vector step rather than once per environment; measure, then if the gap to
  4,000 steps a second is still large, move rollout inference into Node with
  the TypeScript forward pass that already exists for the browser and ship
  trajectories to Python in batches, learner-worker style. Do not reimplement
  the engine in Python; that argument in `ml/README.md` still holds.

Gate: on the arena, the constructed checkpoint beats every one of the 22 deck
policies from the same deck at 55% or better over 200 paired games, its
exploitability under a fixed best-response budget is lower than the stage-1
policy's, and its mined-puzzle score is higher.

_Status:_ the asymmetric critic, the PFSP opponent pool with snapshots, the
magnet, rules-agent warm-up starts, per-process batched stepping over several
engine processes and `--sealed-expansion any` are implemented
(`ml/python/bridge_vec_env.py`, `ml/python/magnet_ppo.py`, `rl-server.ts`).
Two-seat self-play into one rollout buffer and starts from the trace corpus
are not. The gate depends on the stage-0 arena, which is not built.

### Stage 3: search at decision time

The largest expected jump, because it attacks the two gaps every pilot here
shares, and because the engine makes it cheap.

- **A belief sampler, built from the observation.** A function in the agents
  package that takes a `GameObservation` and a prior over the opponent's list
  and returns a hypothetical `GameState` with the opponent's hidden zones
  re-dealt from the unknown remainder: the hand of the observed size, the Life
  stack of the observed size, the deck. The prior is the deck list when the
  format makes it public (a training-time convenience, and an open-decklist
  option in the app), the scouting profile the dossiers already hold otherwise,
  and the expansion's card frequencies in sealed. Cards seen on the board, in
  the trash, revealed or known on top of the deck are subtracted. This is
  inference from public information, not leakage, and it gets its own test in
  the style of `hidden-knowledge.test.ts`: the sampler must produce the same
  distribution whether or not the true hidden cards are changed behind it.
- **Turn search.** At each Main Phase decision, enumerate the pilot's own
  lines to end of turn with the policy as a prior (beam of two to three per
  decision, depth eight to twelve), and for each line evaluate it against K
  sampled opponent hands, playing the opponent's blocks and Counters with the
  rules agent or the learned policy over the sampled hand, and score the end-
  of-turn position with the critic. At 770-4,000 engine steps a second and a
  few hundred simulated steps per decision this is well under a second per
  decision in Node, which is fine for the app and for the arena. It answers,
  finally, "what is this DON!! allocation worth as a whole line" and "which
  attack order forces the most Counters".
- **A lethal oracle.** Before searching, ask the exact question the puzzle
  solver already answers: is there a line that wins this turn against every
  answer the opponent could hold? The upper bound on their answer is the hand
  count times the largest Counter plus any Counter Event in the prior; the
  solver's `solveFromState` with a determinized defender hand set to that bound
  is the check. A pilot that never misses lethal and never walks into it is
  the single biggest strength jump the Hearthstone literature reports, and the
  mined-puzzle suite measures exactly this.
- **Defence search.** The Block and Counter decisions are the pilot's other
  half, and the imperfect-information half: whether to spend two cards now
  depends on what the attacker will do next, which is the opponent's turn
  and needs a value estimate rather than enumeration. The critic covers it,
  and per-action-type regret from stage 0 says how much is being lost there.
- **Expert iteration.** Once search is in place, its improved policy is a
  training target: distil the search's action distribution and value into the
  network (AlphaZero's loop, here with determinized search). This is where the
  belief sampler pays for itself twice.
- **Value-guided narrowing for the rules agents.** The critic and the turn
  search plug into the existing `PolicyModule` API as a `rank` or `veto`
  module, so the hand-written pilots gain lookahead without rewriting a
  ladder. Measured with `deck:ab` and `heuristic:ab` like any other module;
  if it helps, the standings move.

Gate: the search-augmented pilot solves every puzzle the solver proves,
scores higher than the bare policy on the arena against every deck policy,
and stays under a fixed per-decision time budget in a Web Worker.

### Stage 4: ship it

- **Export keeps its shape.** The hand-ported forward pass in
  `learned-sealed-agent.ts` grows an attention layer; it is a hundred lines, it
  needs no runtime, and it keeps the "one HTML file, no server" property. A
  two-million-parameter model is about 8 MB in fp32 JSON; quantise to fp16 or
  int8 on export and set a size budget the build enforces.
- **Constructed decks, not just sealed.** Register the learned pilot as a
  controller for every deck it clears the arena gate on, per deck, and default
  the opponent seat to whichever of rules and learned rates higher for that
  deck. The gate is a table in `docs/rules-map/`, regenerated like the
  standings and checked by CI.
- **The search runs in the worker.** The engine already does; the sampler and
  the beam are plain TypeScript. Budget it by time, not by nodes, and degrade
  to the bare policy under the budget.
- **Traces stay the bug-report currency.** A learned pilot's decision records
  the top-k actions with their scores and, when search ran, the line it
  preferred and the sampled hands it was evaluated against. That is the
  "reasons" field the rules agents already carry, so `trace:match` and the
  match history need no new shape.

### Stage 5: the loop

A new set lands every few weeks. The pipeline for a set becomes: run
`reference:fetch` and `reference:audit` (as now), implement the cards (as now),
append the new registry indices to the embedding table, fine-tune the format
policy for an hour with the new decks in the pool, re-run the arena, regenerate
the gate table. The card-token representation is what makes the fine-tune an
hour and not a retrain.

## 5. Why this order

Stage 0 first because the current headline number is measured against the
opponent the policy trained on; every later claim needs the arena and the
exploitability number to mean anything. Stage 1 before stage 2 because the
opponent pool and the sealed curriculum both need a representation that
survives a new card. Search after the token policy because the search's prior
and leaf value are that policy and its critic; search over the current 849-
float policy would work, but its improvements would be thrown away at stage 1.
Shipping after search because the strength jump players will notice is the
one search provides, and because shipping twice costs the export path twice.

Estimated cost, all on a laptop CPU unless stated: stage 0 is tooling, a week;
stage 1 is the encoder and bridge changes plus reproducing the two baselines,
two weeks; stage 2 is a series of training runs, each under an hour, over two
weeks; stage 3 is the sampler, the beam and the oracle, two to three weeks,
plus the distillation runs; stage 4 is a week. The DeNA and ygo-agent numbers
(50M episodes, 100M games) are for pools of thousands of cards under one
policy against humans; the target here is beating the rules agents on 22
decks and one sealed pool per expansion, which the 1.4M-step result says is
within an order of magnitude of what a laptop already does.

## 6. Risks and what holds them

- **Hidden-information leakage.** Everything the actor sees goes through
  `observe()`; the critic-only vector exists only in the training process; the
  belief sampler is built from an observation and tested for independence from
  the true hidden state. A search that touched the true `GameState` would be
  the one way to break the engine's central guarantee, so the sampler is the
  only path to a hypothetical state and lives in the agents package where the
  test suite can see it.
- **Beating the rules agent by learning its mistakes.** The arena against all
  22 policies, the best-response exploitability number, and PFSP over a pool
  that includes past checkpoints. A checkpoint that beats its training
  opponent and loses the arena is rejected by the gate, not shipped.
- **Feature-layout drift.** Encoder version and card-table hash in every
  checkpoint, refused on mismatch, as today.
- **Pool churn.** Card tokens from `CardRules` plus an append-only embedding
  table; a new card plays at reduced strength immediately and at full strength
  after the fine-tune.
- **Compute.** Every stage is gated on a result reproducible on one machine in
  under an hour of training; a stage that needs more than that says so and
  measures the return per hour first.
- **Determinism.** Search and sampling take the engine's RNG, seeded from the
  game seed and the decision revision, so a learned pilot's game replays from
  its trace like every other pilot's.

## 7. The other two pilots in this plan

**Rules agents** stay the baseline, the opponent-pool seed, the puzzle
defender and the fallback for a deck the learned pilot has not cleared. The
mined-puzzle suite and per-action regret from stage 0 are as useful for
auditing a ladder as for training a network, and value-guided narrowing
(stage 3) is the cheapest way for a deck policy to gain lookahead. The
`audit-deck-policy` playbook does not change; it gains two instruments.

**The LLM agent** is measured on the arena and the puzzle scoreboard like the
others, and the one intervention `agent.ts` says is left untried, a decision
message that carries the seat's own committed plan so the plan survives without
the conversation that anchored it, is measured with `pnpm matchup:llm` as
proposed there. Beyond that, its comparative advantage is language: given the
search pilot's preferred line and its top alternatives, the model can write
the match-history explanation the rules agents give as reason strings and the
learned pilot cannot give at all; and given a card the engine has never seen,
it can read the printed text. A hybrid where the model chooses among the
search's top-k lines is the pattern PokéChamp used for competitive Pokémon and
is worth one arena run; a model choosing among 176 raw decisions a game is not
the strongest use of it.

## Sources

- Sokota et al., "A Unified Approach to Reinforcement Learning, Quantal
  Response Equilibria, and Two-Player Zero-Sum Games" (magnetic mirror
  descent), and "Reevaluating Policy Gradient Methods for Imperfect-Information
  Games", <https://arxiv.org/abs/2502.08938>, with the benchmark at
  <https://github.com/nathanlct/IIG-RL-Benchmark>.
- ygo-agent, <https://github.com/sbl1996/ygo-agent>: LLM card-text embeddings,
  100M self-play games, TFLite deployment, league training on the roadmap.
- DeNA on Pokémon TCG Pocket at CEDEC 2025/2026 (HandyRL, ~2M-parameter
  stateless transformer, 50M episodes per model):
  <https://www.invenglobal.com/articles/24133/how-reinforcement-learning-ai-tackles-the-complex-rules-of-pok%C3%A9mon-trading-card-game-pocket>;
  HandyRL itself at <https://github.com/DeNA/HandyRL>.
- Pokémon TCG Pocket simulator with PPO and a transformer policy,
  <https://github.com/sethkarten/tcg>.
- "Learning to Beat ByteRL: Exploitability of Collectible Card Game Agents",
  <https://arxiv.org/abs/2404.16689>.
- Vinyals et al., "Grandmaster level in StarCraft II using multi-agent
  reinforcement learning" (league training, PFSP, exploiters),
  <https://www.nature.com/articles/s41586-019-1724-z>.
- Świechowski, Tajmajer, Janusz, "Improving Hearthstone AI by Combining MCTS
  and Supervised Learning Algorithms", <https://arxiv.org/abs/1808.04794>, and
  "A Practical Solution to Handling Randomness and Imperfect Information in
  Monte Carlo Tree Search" (PIMC + ISMCTS + heuristic attack solver).
- Cowling, Ward, Powley, "Ensemble Determinization in Monte Carlo Tree Search
  for the Imperfect Information Card Game Magic: The Gathering".
- Brown et al., "Combining Deep Reinforcement Learning and Search for
  Imperfect-Information Games" (ReBeL), <https://arxiv.org/abs/2007.13544>;
  Schmid et al., "Student of Games", <https://arxiv.org/abs/2112.03178>;
  Perolat et al., "Mastering the game of Stratego with model-free multiagent
  reinforcement learning" (DeepNash, R-NaD).
- "Data-Augmented Game Starts for Accelerating Self-Play Exploration in
  Imperfect Information Games", <https://arxiv.org/abs/2605.14379>.
- Li et al., "Suphx: Mastering Mahjong with Deep Reinforcement Learning"
  (oracle guiding), <https://arxiv.org/abs/2003.13590>.
- "Self-Play Reinforcement Learning under Imperfect Information in Big 2",
  <https://arxiv.org/abs/2605.28863>, and "A Survey on Self-play Methods in
  Reinforcement Learning", <https://arxiv.org/abs/2408.01072>.
