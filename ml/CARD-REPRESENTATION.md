# How the scorer represents cards: the plan

How the model should represent a card so it plays cards it has never seen,
in the order to test the changes. The queue of other runs lives in
`EXPERIMENTS.md`; the ground rules there (one job at a time, a fresh
`compare-<n>` seed set per comparison, `test` seeds only for the final
number) apply here too.

## Where things stand

A card enters the model as one token whose vector is:

```
card = project(text encoding of the card) + per-card embedding
```

The text encoding comes from the same backbone that scores decisions,
reading the card's facts (and its printed text with `--text pack`). It is
recomputed every few hundred training steps and precomputed in the browser
pack. The per-card embedding starts at zero and moves only for cards played
in training. That is 414 of the 2,139 cards in the table: the other 1,725,
and any card a player puts in a custom deck from outside the 31 lists, are
known only through their text.

## What the literature says

- **Seen-card metrics do not separate representations; unseen-card metrics
  do.** On Magic: The Gathering drafts, IDs, stats, text, images and
  metadata score about the same on known cards and very differently on new
  ones; the generalised model reaches about 55% accuracy on picks among
  entirely unseen cards. DraftFM uses no card IDs at all: a frozen text
  embedding plus about 390 structured features per card reaches 51-60%
  agreement with human picks on three held-out expansions.
- **Reading descriptions generalises.** Agents that read entity descriptions
  transfer zero-shot to unseen dynamics (RTFM, EMMA); in Hearthstone, a
  policy built on card descriptions generalises to unseen cards
  (Cardsformer).
- **ID embeddings starve the content path; dropping them at random is the
  fix.** DropoutNet and its follow-ups (Heater, CLCRec); Metamon masks
  entity names to an unknown token in training for the same reason.
- **Fine-tuning a pretrained encoder distorts it.** Full fine-tuning gains
  about 2% in-distribution and loses about 7% out of it (LP-FT); a locked
  encoder with a trained other side works best (LiT); a language-initialised
  decision model needs LoRA and an auxiliary language loss to keep its
  language (LaMo), and LoRA forgets less than full fine-tuning.
- **LLMs as the policy still trail small domain models** (UrzaGPT: 66%
  LoRA-tuned, 43% zero-shot, both below domain models), and the evidence
  that language pretraining helps on structured state is mixed.

## The plan, in order

### 1. An unseen-cards evaluation

Nothing below can be judged without it: every card in today's evaluations
was played in training.

- **Build.** An `--exclude-decks` option on `sys1.ppo` (and on the corpus
  dump for behaviour cloning) so neither seat is ever drawn from the
  excluded decks, and a `--decks <list>` option on `sys1.evaluate` to score
  on those decks alone. Choose 3-4 decks whose cards overlap least with the
  rest (count unique card numbers), from both divisions.
- **Baseline.** Behaviour-clone from scratch without them, then 40 PPO
  iterations without them, and score the result on the excluded decks and
  on the rest, against the rules agents piloting the same games
  (`--baseline`). Every existing checkpoint has played all 31 lists, so a
  fine-tune from one would measure forgetting rather than reading. The
  model's edge over the rules pilot on excluded decks versus included ones
  is the generalisation gap every later step is measured by.
- **Built.** `heldout-decks.txt` holds Krieg, Lucy, Xebec and ST-35 Sabo:
  every card in each is in no other selectable deck. `--exclude-decks` on
  `sys1.train_bc` (drops the corpus games either seat of which played one)
  and on `sys1.ppo` (rollouts and its own evaluations), `--only-decks` /
  `--exclude-decks` on `sys1.evaluate`. `checkpoints/heldout-run.sh` runs
  the whole step, and `python -m sys1.heldout checkpoints/heldout-eval`
  prints the gap: piloting a held-out deck, piloting against one, and on
  pairings with none.
- **Result (2026-09-26, `compare-4`).** The gap is about 25 points. The
  model's paired edge over the rules pilot is -18.5pt ± 4.1 piloting a
  held-out deck, +4.6pt ± 4.1 piloting against one, and +6.1pt ± 2.0 on
  pairings with none. The model plays the lists it trained on and does not
  read a list of unseen cards; facing one costs it little. Three of the four
  held-out decks have deck-specific rules policies from earlier audits, so
  the rules pilot is unusually strong on exactly these decks; every later
  arm is read against the same baseline.

### 2. Randomly zero the per-card embedding in training

- **Build.** `--id-dropout p` on `sys1.ppo` (try 0.3): each weight version
  drops a fixed share of the card table, a mask that is a pure function of
  the version (`ppo.card_keep`). The collector plays with that version's
  mask and the update trains every decision under the mask it was played
  with, so the PPO ratio compares the dropped policy with itself; a mask
  drawn fresh per minibatch compares it with the undropped policy the
  rollouts recorded, and the KL early stop then ends every update after a
  few steps. Never in evaluation or in the browser.
- **Run.** 40 iterations from step 1's behaviour-cloned checkpoint, with
  its exclusion; step 1's PPO run is the control without dropout. Then
  both arms with `--no-card-embed` on `sys1.evaluate`, which zeroes every
  learned card embedding.
- **Read.** The gap from step 1, and an evaluation with all per-card
  embeddings switched off, which shows how much the text path carries alone.
- **Keep** if the excluded-deck edge rises and the included decks hold
  within about a point.
- **Result (2026-09-27, `compare-4`, p = 0.3): not kept.** Against the
  control on the same games, dropout gains +4.2pt ± 3.4 piloting a
  held-out deck (edge over the rules pilot -14.4 from -18.5) and loses
  -5.1pt ± 2.4 on pairings with no held-out deck (+1.0 from +6.1). With
  every learned embedding zeroed, the control's edge on trained decks falls
  to -0.3 and the dropout arm's to -0.9: the learned embeddings carry the
  whole edge, and dropout lowers the model's reliance on them without
  making the text path read any better. That points at the card vector
  itself -- steps 3 and 4 -- rather than at another dropout rate. Dropout's
  first few updates stopped at the KL bound after 4-12 steps against the
  control's 4-25, then ran full from iteration 10.

### 3. Shared embeddings from `CardRules`

- **Build.** Export more of each card's derived rules in `bridge/cards.ts`:
  keywords, clause types (`clauses`), clause costs and granted power
  (`clauseSummaries`), `donRequirement`, the boolean flags (`removalText`,
  `advantageText`, `cannotAttack`, `addsDonFromDonDeck`, ...), types. Give
  each value a learned vector, sum them into the card vector, and feed cost,
  power and counter through a small MLP as numbers. All new tables start at
  zero, so the current checkpoint loads and plays exactly as before.
- **Why here.** This is the structured half of DraftFM's recipe, and the
  only rules signal a shareable (`--text none`) model can have: `CardRules`
  is in the repo, the printed text is not.
- **Run and read.** As step 2.
- **Built.** `bridge/card-features.ts` writes each card's tokens to
  `data/card-features.json` -- its facts, clauses and `CardRules` flags,
  and what its engine program does: each node kind a clause's program
  reaches (`[On Play]:knock-out`) and each zone its selectors read
  (`[On Play]@opponent:board`) -- plus cost, power, counter and DON!!
  requirement. `features.py` keeps the 680 tokens at least two cards share.
  `--card-features` on `train_bc` and `sys1.ppo`. The tables start at zero
  but PPO's learning rate barely moves them in 40 iterations, so the arm is
  behaviour-cloned from scratch, as step 1's control was.
- **Result (2026-09-27, `compare-4`, re-scored on the engine with the
  replacement-cost fix): kept.** Against the control on the same games,
  +6.4pt ± 3.5 piloting a held-out deck (edge over the rules pilot -12.2
  from -18.5), +1.4pt ± 3.7 piloting against one, and -2.0pt ± 2.4 on
  pairings with no held-out deck (+4.1 from +6.1): the held-out gain is
  clear and the trained-deck cost is within noise. With every learned
  per-card embedding zeroed the features arm plays exactly as with them
  (+4.1 on trained decks, where the control falls to -0.3): its edge is
  carried by the shared features, not by memorised cards.

### 4. A frozen, separate card-text encoder

- **Build.** Encode each card's text once with a frozen model (the
  pretrained Ettin before any fine-tuning, or a stronger sentence-embedding
  model offline), store the vectors, and learn only the projection. The
  refresh every few hundred steps goes away. With `--text pack` the vectors
  come from printed text: personal builds only, as now.
- **Check first (nearly free).** Whether the shared encoder is actually
  losing its reading: train a linear probe to predict card facts (keywords,
  cost) from the card encodings of the starting checkpoint and of the
  latest one. A clear drop is the forgetting this step removes.
- **Run.** It changes every card vector, so it goes in the next behaviour
  cloning run (`sys1.pipeline`), compared on step 1's split against a
  behaviour-cloning run with today's encoder.

### Not planned

A verbose, natural-language state rendering (mixed evidence, and 2-3x the
tokens a decision), and an LLM playing directly (behind domain models, and
far past the browser's per-decision budget).

## Where it ends up, if each step pays

```
card = project(frozen text embedding)          -- pack builds only
     + sum of CardRules embeddings + MLP(cost, power, counter)
     + per-card embedding, randomly zeroed in training
```

Each part is kept only on the step 1 evaluation.

## References

Each was checked against its paper page.

- Bertram, Fürnkranz, Müller. Learning With Generalised Card
  Representations for Magic: The Gathering. IEEE CoG 2024.
  https://arxiv.org/abs/2407.05879
- Ward. DraftFM: A Foundation Model for Day-Zero Drafting in MTG. 2026.
  https://arxiv.org/abs/2608.19568
- Bertram. UrzaGPT: LoRA-Tuned LLMs for Card Selection. 2025.
  https://arxiv.org/abs/2508.08382
- Xia, Yang, Ruan, Xing, Xu. Cardsformer. ECAI 2023.
  https://ebooks.iospress.nl/doi/10.3233/FAIA230581
- Grigsby et al. Human-Level Competitive Pokémon via Scalable Offline RL
  with Transformers (Metamon). RLC 2025. https://arxiv.org/abs/2504.04395
- Zhong, Rocktäschel, Grefenstette. RTFM: Generalising to Novel Environment
  Dynamics via Reading. ICLR 2020. https://arxiv.org/abs/1910.08210
- Hanjie, Zhong, Narasimhan. Grounding Language to Entities and Dynamics
  for Generalization in Reinforcement Learning (EMMA, Messenger). ICML 2021. https://arxiv.org/abs/2101.07393
- Volkovs, Yu, Poutanen. DropoutNet: Addressing Cold Start in Recommender
  Systems. NeurIPS 2017.
  https://proceedings.neurips.cc/paper/2017/hash/dbd22ba3bd0df8f385bdac3e9f8be207-Abstract.html
- Zhu et al. Heater. SIGIR 2020. https://dl.acm.org/doi/10.1145/3397271.3401178
- Wei et al. CLCRec. ACM MM 2021. https://arxiv.org/abs/2107.05315
- Pan et al. Meta-Embedding. SIGIR 2019. https://arxiv.org/abs/1904.11547
- Kumar et al. Fine-Tuning can Distort Pretrained Features and
  Underperform Out-of-Distribution (LP-FT). ICLR 2022.
  https://arxiv.org/abs/2202.10054
- Zhai et al. LiT: Zero-Shot Transfer with Locked-image text Tuning. CVPR 2022. https://arxiv.org/abs/2111.07991
- Shi et al. LaMo: Unleashing the Power of Pre-trained Language Models for
  Offline Reinforcement Learning. ICLR 2024. https://arxiv.org/abs/2310.20587
- Biderman et al. LoRA Learns Less and Forgets Less. TMLR 2024.
  https://arxiv.org/abs/2405.09673
- Reid, Yamada, Gu. Can Wikipedia Help Offline Reinforcement Learning? 2022. https://arxiv.org/abs/2201.12122
- Takagi. On the Effect of Pre-training for Transformer in Different
  Modality on Offline Reinforcement Learning. NeurIPS 2022.
  https://arxiv.org/abs/2211.09817
