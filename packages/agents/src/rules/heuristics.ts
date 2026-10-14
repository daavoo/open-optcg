import type { LegalAction } from "@one-piece-sim/protocol";
import type { AttackAction, EffectAction } from "./generic-policy.js";
import type {
  PolicyContext,
  PolicyModule,
  ScoreContribution,
} from "./policy-module.js";
import {
  tacticsFor,
  type ActivateMainAction,
  type AttachDonAction,
  type BlockAction,
  type CounterAction,
  type HandCard,
  type Tactics,
  type TriggerAction,
} from "./tactics.js";

/**
 * A small declarative surface for deck knowledge.
 *
 * The problem this solves is cost, not capability. Adding one preference to a
 * deck today means editing a 200-500 line first-match-wins ladder whose order is
 * load-bearing, or hand-writing a `PolicyModule` and re-deriving the same
 * quantities every other policy already derives. Both are expensive enough that
 * matchup knowledge tends not to get written down at all.
 *
 * Here a heuristic is one expression:
 *
 * ```ts
 * const module = heuristics("st33", [
 *   prefer("keep a Blocker up while behind on Life")
 *     .when((t) => t.selfLife <= 2)
 *     .play((card) => card.facts.keywords.includes("Blocker")),
 *
 *   avoid("feeding a cheap body to cost-2 removal")
 *     .when((t) => t.opponentLeader === LEADERS.ST34)
 *     .play((card) => card.cost <= 2),
 *
 *   never("attacking into a trade that loses the body")
 *     .attack((attack, t) => t.attackPressure(attack) === 0),
 * ]);
 * ```
 *
 * Register it with `registerPolicy({ deck: LEADERS.ST33, create: () => module })`,
 * or `deck: EVERY_DECK` for a format fundamental.
 *
 * Each rule ends in a *terminal* naming the kind of action it is about --
 * `play`, `attack`, `attachDon`, `activate`, `effect`, `counter`, `block`,
 * `trigger` -- and the subject it is handed is already narrowed to that
 * action's shape, so a rule about an `[Activate: Main]` reads
 * `sourceCardNumber` straight off its argument. `action` is the one terminal
 * that sees every type, for the rare rule that is genuinely about two kinds of
 * action at once ("cash the Leader's DON!! before spending it on a body *or* an
 * attachment"). A rule written through `action` with a type guard as its first
 * line is one that should be using the terminal for that type.
 *
 * Every rule compiles to a narrowing contribution, so the deck's existing policy
 * still makes the decision -- the rule only narrows what it is choosing between.
 * See `PolicyModule.rank` for why that containment matters.
 *
 * Two narrowing tiers, and the difference is what happens to a candidate a rule
 * says nothing about:
 *
 *  - {@link prefer}/{@link avoid} compile to `rank`, which compares against the
 *    best score in the whole action type. Silence therefore reads as a score of
 *    0, so a rule that names two cards hides every other card of that type --
 *    it is a commitment ("take one of these"), not a comparison. Most rules in
 *    this repository want exactly that, and are safe because they carry a gate
 *    *and* because their module ends with a total-order rule such as
 *    `prefer("Develop the largest body ...").play((card) => card.facts.power /
 *    1000)`, which scores every candidate and so keeps them all in the running.
 *    Six of the ten deck modules that rank plays end that way, and two more
 *    rank plays only with `avoid`, which can hide nothing but the card it
 *    names. A module that ranks plays with `prefer` and has no total-order rule
 *    is the one worth looking at twice: `op13-sabo` and `op16-ace` are the two,
 *    and whether the whitelist is what their author meant differs between
 *    them.
 *  - {@link preferAmong}/{@link avoidAmong} compile to `rankAmong`, which
 *    compares only the candidates the rule scored and leaves the rest alone --
 *    a comparison ("if you take one of these, take the best one").
 *
 * Weights are ordinal, not physical. A rule's weight decides which of two rules
 * wins when they disagree about the same candidate; it is never compared against
 * power, cost or any other in-game number.
 */

/** Default weight. Deliberately coarse: these are preferences, not valuations. */
const DEFAULT_WEIGHT = 10;

/**
 * Weight bands, so precedence between layers is specified rather than emergent.
 *
 * `applyRanking` *sums* contributions from every module and then keeps the
 * per-action-type maximum. With one carefully-audited module per action type that
 * is fine. With a strategy hierarchy -- format fundamentals, then an archetype,
 * then a colour archetype, then a specific deck, all ranking `attack` -- the
 * winner would otherwise be an artifact of weight choices made in unrelated
 * files.
 *
 * The bands are spaced so that one rule in a deeper band outranks any single rule
 * in a shallower one, which is what inheritance should mean: a child overrides a
 * parent's preference on the same candidate without either rule being deleted.
 * They are *not* spaced to outrank several shallower rules at once, deliberately
 * -- two independent format fundamentals agreeing should be able to outvote one
 * archetype preference.
 *
 * Still ordinal. A weight is never compared against power, cost, or any other
 * in-game number.
 */
export const WEIGHT = {
  /** Format fundamentals, true of every deck. Equal to {@link DEFAULT_WEIGHT}. */
  format: 10,
  /** A root archetype: `aggro`, `midrange`, `control`. */
  archetype: 20,
  /** A colour or sub-archetype: `red-aggro`. */
  subArchetype: 40,
  /** One deck's own knowledge. */
  deck: 80,
  /**
   * A commitment the rest of the turn depends on -- "this is the line, take it".
   *
   * Large enough to beat every other band combined, so it must be used sparingly
   * and each use documented at the rule. A plan that can be outvoted is not a
   * plan; a plan that outvotes everything and is wrong is worse than no plan.
   */
  commitment: 400,
} as const;

export interface Heuristic {
  /** Human-readable intent. Becomes the reason string in traces. */
  readonly because: string;
  /**
   * Stable kebab-case name, for the module id a strategy profile compiles this
   * rule into -- and therefore for `--disable strategy:<profile>#<name>`.
   *
   * Optional, but a rule without one is measurable only by its position in its
   * profile's list, which changes the moment a rule is inserted above it. Name
   * every rule you intend to A/B, which is every rule.
   */
  readonly name?: string;
  /**
   * `rank` narrows the candidate set within one action type and leaves the deck
   * policy to choose; `veto` removes a candidate outright.
   *
   * Both tiers exist because they answer different questions. `rank` compares
   * candidates of the same kind ("which play"), so it cannot express a
   * cross-type judgement like "developing beats powering up right now" -- the
   * two are different action types and ranking never compares across groups.
   * `veto` can, because removing the attachment leaves the deck policy to fall
   * through to its own play logic. Reach for `rank` first; use `never` when the
   * rule is about *not doing a kind of thing at all* in this state.
   */
  readonly tier: "rank" | "rank-among" | "veto";
  /** Gate. A rule with no gate is always considered. */
  readonly gate?: (t: Tactics) => boolean;
  readonly contribute: (t: Tactics, action: LegalAction) => number | undefined;
}

type Sign = 1 | -1;

/**
 * Builder returned by {@link prefer} and {@link avoid}.
 *
 * Each terminal method (`play`, `attack`, `attachDon`, `activate`, `effect`,
 * `counter`, `block`, `trigger`) narrows to one action type and returns the
 * finished rule, so a rule can never accidentally express an opinion about a
 * kind of decision it was not written for. `action` is the exception, and is
 * meant for a rule that spans types.
 */
class HeuristicBuilder {
  #gate: ((t: Tactics) => boolean) | undefined;
  #weight = DEFAULT_WEIGHT;
  #name: string | undefined;

  constructor(
    private readonly because: string,
    private readonly sign: Sign,
    private readonly tier: "rank" | "rank-among" | "veto" = "rank",
  ) {}

  /**
   * Restrict the rule to states where this holds.
   *
   * A second `when` narrows further rather than replacing the first, so a
   * shared gate can be added to a rule without re-reading it for the one it
   * already carries.
   */
  when(gate: (t: Tactics) => boolean): this {
    const existing = this.#gate;
    this.#gate = existing ? (t) => existing(t) && gate(t) : gate;
    return this;
  }

  /** Override the weight, for rules that must beat or lose to another rule. */
  by(weight: number): this {
    this.#weight = Math.abs(weight);
    return this;
  }

  /**
   * Name the rule, so it compiles to its own addressable module.
   *
   * `pnpm deck:ab --deck ST31 --disable strategy:aggro#press-leader` then
   * measures this rule alone, which is the granularity the repository's
   * one-change-at-a-time discipline actually needs.
   */
  as(name: string): this {
    this.#name = name;
    return this;
  }

  /**
   * Rank `play-card` candidates.
   *
   * The predicate form (`() => boolean`) applies the flat weight; returning a
   * number instead uses it as a magnitude, which is how "prefer the biggest X"
   * is written without a card table.
   */
  play(subject: (card: HandCard, t: Tactics) => boolean | number): Heuristic {
    return this.#build((t, action) => {
      if (action.type !== "play-card") return undefined;
      const card = t.playedCard(action);
      if (!card) return undefined;
      return magnitude(subject(card, t));
    });
  }

  /** Rank `attack` candidates. */
  attack(
    subject: (attack: AttackAction, t: Tactics) => boolean | number,
  ): Heuristic {
    return this.#ofType("attack", subject);
  }

  /** Rank `attach-don` candidates. */
  attachDon(
    subject: (action: AttachDonAction, t: Tactics) => boolean | number,
  ): Heuristic {
    return this.#ofType("attach-don", subject);
  }

  /**
   * Rank `activate-main` candidates: `[Activate: Main]` abilities and Events
   * cast from hand. `sourceCardNumber` names the card, so "Kuzan's ability" is
   * `(action) => action.sourceCardNumber === KUZAN`.
   */
  activate(
    subject: (action: ActivateMainAction, t: Tactics) => boolean | number,
  ): Heuristic {
    return this.#ofType("activate-main", subject);
  }

  /**
   * Rank `resolve-effect` candidates: the options of a pending effect --
   * which card a search hands over, which body pays a cost, whether to accept
   * a "you may". `optionCard`, `isOptionCardIn` and `isSearchResult` in
   * `generic-policy.ts` read the typed option descriptor.
   */
  effect(
    subject: (action: EffectAction, t: Tactics) => boolean | number,
  ): Heuristic {
    return this.#ofType("resolve-effect", subject);
  }

  /** Rank `counter` candidates: a card spent from hand in the Counter step. */
  counter(
    subject: (action: CounterAction, t: Tactics) => boolean | number,
  ): Heuristic {
    return this.#ofType("counter", subject);
  }

  /** Rank `block` candidates: a [Blocker] declared in the Block step. */
  block(
    subject: (action: BlockAction, t: Tactics) => boolean | number,
  ): Heuristic {
    return this.#ofType("block", subject);
  }

  /**
   * Rank `resolve-trigger` candidates: activate a [Trigger] or add the card
   * to hand. The `skip` option is the add-to-hand branch, and a veto on every
   * activate option must leave it standing -- see `dead-trigger`.
   */
  trigger(
    subject: (action: TriggerAction, t: Tactics) => boolean | number,
  ): Heuristic {
    return this.#ofType("resolve-trigger", subject);
  }

  /**
   * The terminal that sees every action type.
   *
   * For a rule that is genuinely about more than one kind of action at once.
   * A rule that opens with `if (action.type !== "...") return false` is not
   * that rule, and reads better through the terminal for its type.
   */
  action(
    subject: (action: LegalAction, t: Tactics) => boolean | number,
  ): Heuristic {
    return this.#build((t, action) => magnitude(subject(action, t)));
  }

  /**
   * One terminal per action type, from the type's name. Adding a terminal for
   * a new kind of `LegalAction` is one method above delegating here.
   */
  #ofType<K extends LegalAction["type"]>(
    type: K,
    subject: (
      action: Extract<LegalAction, { type: K }>,
      t: Tactics,
    ) => boolean | number,
  ): Heuristic {
    return this.#build((t, action) => {
      if (action.type !== type) return undefined;
      return magnitude(subject(action as Extract<LegalAction, { type: K }>, t));
    });
  }

  #build(
    contribute: (t: Tactics, action: LegalAction) => number | undefined,
  ): Heuristic {
    const gate = this.#gate;
    const weight = this.#weight;
    const sign = this.sign;
    const name = this.#name;
    return {
      because: this.because,
      tier: this.tier,
      ...(name === undefined ? {} : { name }),
      ...(gate ? { gate } : {}),
      contribute: (t, action) => {
        const raw = contribute(t, action);
        if (raw === undefined || raw === 0) return undefined;
        return sign * weight * raw;
      },
    };
  }
}

function magnitude(value: boolean | number): number | undefined {
  if (value === false) return undefined;
  if (value === true) return 1;
  return Number.isFinite(value) ? value : undefined;
}

/** Start a rule that raises a candidate's standing. */
export function prefer(because: string): HeuristicBuilder {
  return new HeuristicBuilder(because, 1);
}

/**
 * Start a rule that orders the candidates it scores, and leaves the rest alone.
 *
 * The difference from {@link prefer} is what happens to a candidate the rule
 * says nothing about. `prefer` compares against the best score in the whole
 * action type, so silence reads as a score of 0 and the candidate is hidden the
 * moment anything scores above it -- which turns "these two cards are better"
 * into "these two cards are the only ones you may take". That is usually what
 * the author of a *gated* rule meant, and it is what 64 of this repository's 72
 * `prefer`/`avoid` rules do.
 *
 * It is not always what they meant. `op17-kaido-policy.ts` records two rules,
 * both straight from a published deck guide and both true of the card game,
 * that were catastrophic for that deck because naming its ramp bodies hid its
 * cost-10 finishers for the rest of the game.
 *
 * Use this when the rule is a comparison ("if you play a Blocker, play the
 * biggest one") rather than a commitment ("play a Blocker"). For a commitment,
 * `prefer` with a gate is still the right tier, and `never` on the alternative
 * says it louder.
 *
 * A caveat worth knowing before reaching for it: because the final chooser is
 * the generic ladder rather than a scorer, a `preferAmong` rule that scores
 * exactly one candidate has no effect at all -- there is nothing for it to
 * outrank. It is a rule about *which of several*, not about *whether*.
 */
export function preferAmong(because: string): HeuristicBuilder {
  return new HeuristicBuilder(because, 1, "rank-among");
}

/** {@link preferAmong}'s negative: lowers a candidate only against its peers. */
export function avoidAmong(because: string): HeuristicBuilder {
  return new HeuristicBuilder(because, -1, "rank-among");
}

/** Start a rule that lowers a candidate's standing without forbidding it. */
export function avoid(because: string): HeuristicBuilder {
  return new HeuristicBuilder(because, -1);
}

/**
 * Start a rule that removes a candidate outright.
 *
 * The deck policy is not replaced: it simply never sees the action and falls
 * through to its own next-best line. `pass` is never removed, so a policy can
 * always end its turn.
 */
export function never(because: string): HeuristicBuilder {
  return new HeuristicBuilder(because, 1, "veto");
}

/**
 * Builder returned by {@link mustAct}, whose only terminal is
 * {@link MustActBuilder.insteadOfPass}.
 *
 * Its own class rather than a mode of {@link HeuristicBuilder} so that the
 * additive tier cannot be reached from `prefer` or `avoid`: a `pass` ranked
 * rather than vetoed is skipped by `applyRanking` and the rule silently does
 * nothing, and a `never(...).play(...)` cannot be turned into a forced action
 * by choosing the wrong terminal.
 */
class MustActBuilder {
  #gate: ((t: Tactics) => boolean) | undefined;
  #name: string | undefined;

  constructor(private readonly because: string) {}

  /** Restrict the rule to states where this holds; see {@link HeuristicBuilder.when}. */
  when(gate: (t: Tactics) => boolean): this {
    const existing = this.#gate;
    this.#gate = existing ? (t) => existing(t) && gate(t) : gate;
    return this;
  }

  /** Name the rule; see {@link HeuristicBuilder.as}. */
  as(name: string): this {
    this.#name = name;
    return this;
  }

  /**
   * Remove `pass`, forcing the turn to continue, whenever `available` holds.
   *
   * The additive terminal. Every other tier in this file is subtractive: a rule
   * narrows what the deck policy chooses from and can never cause an action to
   * be *taken* that the policy declined. That is usually right, and for one class
   * of rule it is fatal -- "the race is lost, block this hit rather than absorb
   * it" is unexpressible, because `chooseGenericBlock` answers a survivable hit
   * with `pass` and nothing downstream can overrule it.
   *
   * `resolveWithModules` applies a `pass` veto only when at least one non-`pass`
   * action survives, so the safety property a blanket exemption would buy -- a
   * policy always has a legal move -- holds exactly.
   *
   * `available` is the guard that makes it safe to write: state the action you
   * actually want to happen instead, so the rule cannot force a turn to continue
   * into nothing useful. It is checked against the game's own legal actions.
   */
  insteadOfPass(available: (t: Tactics) => boolean): Heuristic {
    const gate = this.#gate;
    const name = this.#name;
    return {
      because: this.because,
      tier: "veto",
      ...(name === undefined ? {} : { name }),
      ...(gate ? { gate } : {}),
      contribute: (t, action) => {
        if (action.type !== "pass") return undefined;
        return available(t) ? 1 : undefined;
      },
    };
  }
}

/**
 * Start a rule that removes `pass`, so the turn cannot simply end here.
 *
 * The one additive tier. Its only terminal is
 * {@link MustActBuilder.insteadOfPass}; name in `because` the action you want
 * taken instead -- that string is what a trace will show for a turn that
 * continued when the deck policy wanted to stop.
 */
export function mustAct(because: string): MustActBuilder {
  return new MustActBuilder(because);
}

/**
 * `Tactics` is derived once per decision point and shared by every rule, so
 * adding rules costs almost nothing at runtime. See {@link tacticsFor} for why
 * the cache is keyed on the observation object rather than on its fields.
 *
 * It is derived from the *observation*, not from `context.actions`, so a rule
 * reads the game's own legal actions rather than whatever survived other modules'
 * vetoes. That is deliberate: "can I afford a play this turn" is a fact about the
 * position, and making it depend on the order modules happen to run in would make
 * rules read differently depending on what else is registered.
 */
function deriveTactics(context: PolicyContext): Tactics {
  return tacticsFor(context.observation);
}

/**
 * The sum of every gated rule's contribution to one candidate, with the reasons
 * that made it up, or `undefined` when no rule had an opinion.
 *
 * The one loop behind both ranking tiers: `rank` and `rankAmong` differ in how
 * `applyRanking` reads the number, not in how it is added up.
 */
function sumContributions(
  rules: readonly Heuristic[],
  t: Tactics,
  action: LegalAction,
): ScoreContribution {
  let score = 0;
  const because: string[] = [];
  for (const rule of rules) {
    if (rule.gate && !rule.gate(t)) continue;
    const delta = rule.contribute(t, action);
    if (delta === undefined || delta === 0) continue;
    score += delta;
    because.push(rule.because);
  }
  if (score === 0) return undefined;
  return { score, reason: because.join("; ") };
}

/**
 * Compiles a rule list into one module per {@link Heuristic.name}, plus one for
 * whatever was left unnamed.
 *
 * The granularity `--disable` needs. `RegistryRulesAgent` treats a `--disable`
 * entry as a prefix, so `st35` addresses the whole layer and `st35#karasu-mill`
 * addresses one claim -- without which a layer that measures well can be
 * three rules, one of which is quietly costing more than the other two make.
 *
 * `compileProfile` has done this for strategy layers since they existed; a deck
 * dissolving its ladder into rules wants exactly the same thing, and issue #170
 * asks for it by name. Unnamed rules come first as one module, then each named
 * rule in declaration order -- cosmetic, since `rank` and `veto` are collected
 * from every applicable module rather than raced, but it keeps a trace's module
 * list stable as rules are named.
 */
export function heuristicModules(
  id: string,
  rules: readonly Heuristic[],
): PolicyModule[] {
  const unnamed = rules.filter((rule) => rule.name === undefined);
  return [
    ...(unnamed.length > 0 ? [heuristics(id, unnamed)] : []),
    ...rules
      .filter((rule) => rule.name !== undefined)
      .map((rule) => heuristics(`${id}#${rule.name}`, [rule])),
  ];
}

export function heuristics(
  id: string,
  rules: readonly Heuristic[],
): PolicyModule {
  const rankRules = rules.filter((rule) => rule.tier === "rank");
  const rankAmongRules = rules.filter((rule) => rule.tier === "rank-among");
  const vetoRules = rules.filter((rule) => rule.tier === "veto");

  return {
    id,
    ...(rankRules.length > 0
      ? {
          rank: (context: PolicyContext, action: LegalAction) =>
            sumContributions(rankRules, deriveTactics(context), action),
        }
      : {}),
    ...(rankAmongRules.length > 0
      ? {
          rankAmong: (context: PolicyContext, action: LegalAction) =>
            sumContributions(rankAmongRules, deriveTactics(context), action),
        }
      : {}),
    ...(vetoRules.length > 0
      ? {
          veto(
            context: PolicyContext,
            action: LegalAction,
          ): string | undefined {
            const t = deriveTactics(context);
            for (const rule of vetoRules) {
              if (rule.gate && !rule.gate(t)) continue;
              const delta = rule.contribute(t, action);
              if (delta !== undefined && delta !== 0) return rule.because;
            }
            return undefined;
          },
        }
      : {}),
  };
}
