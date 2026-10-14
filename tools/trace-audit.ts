/**
 * Replays diagnostics traces and reports how each seat *played*, not what it
 * chose at any one decision.
 *
 * `pnpm trace:compare` answers "would the rules agent have played this
 * decision differently", one row per disagreement. That is the right instrument
 * for auditing a single game and the wrong one for the question this answers:
 * across a set of traces, which recurring habit separates a strong pilot from a
 * weak one. A hundred rows of `recorded=attack:X rules=attack:Y` do not say
 * that one seat consistently swings its largest attacker first and the other
 * consistently swings its smallest -- and that difference is worth more than any
 * single row in it.
 *
 * So this counts habits, each chosen because it is a claim about play quality
 * that the engine already exposes the numbers for, and each aggregated over
 * whatever traces are passed:
 *
 *  - **Attack ordering.** Public strategy advice for this game is unanimous that
 *    the weakest relevant attack goes first, to spend the defender's Counter
 *    cards before the attack that matters arrives. A turn's attacks are
 *    therefore scored ascending (weakest first), descending, or mixed by
 *    declared attack power.
 *  - **Blocks declined.** A block-phase decision where a Blocker was available
 *    and the seat passed. Split by whether the incoming attack would have taken
 *    Life, since declining a block that only threatens a Character is a normal
 *    choice and declining one aimed at the Leader usually is not.
 *  - **Counter spending by Life.** Counter cards are spent from the same hand
 *    that develops the board, and the standard error is spending them early. The
 *    report buckets every Counter card played by how much Life the defender
 *    still held, so "over-countering at 5 and 4 Life" is a number rather than an
 *    impression.
 *  - **DON!! left active.** Active DON!! still unspent when a seat ends its main
 *    phase: the clearest single measure of a turn left on the table.
 *  - **Attacks per turn, and what they hit.**
 *
 * Every number is per seat and labelled with the controller the trace records
 * (`human`, `llm`, `rules`), which is what makes a mixed folder of traces
 * comparable: the same metric for the same deck under three pilots.
 *
 * Usage:
 *   pnpm trace:audit traces/myst31-sabo/*.jsonl
 *   pnpm trace:audit --by=controller traces/myst31-sabo/*.jsonl
 *   pnpm trace:audit --turns traces/myst31-sabo/game-00.jsonl
 */
import { readFileSync } from "node:fs";
import { GameService, describeStampMismatch } from "@one-piece-sim/engine-core";
import { deckStrategyDossier } from "@one-piece-sim/agents/llm-dossiers";
import { resolveMatchDecks } from "@one-piece-sim/decks";
import { parseExportedMatch } from "../packages/web/src/diagnostics.js";
import type { LegalAction, PlayerId } from "@one-piece-sim/protocol";
import type { ControllerKind } from "../packages/web/src/controller.js";

const args = process.argv.slice(2);
const files = args.filter((arg) => !arg.startsWith("--"));
const groupBy = args.includes("--by=controller") ? "controller" : "seat";
const showTurns = args.includes("--turns");
const force = args.includes("--force");
if (files.length === 0) {
  throw new Error(
    "USAGE: pnpm trace:audit <trace.jsonl...> [--by=controller] [--turns] [--force]",
  );
}

/** How a turn's attacks were ordered by declared power. */
type Ordering = "ascending" | "descending" | "mixed";

interface SeatAudit {
  label: string;
  deck: string;
  controller: ControllerKind;
  games: number;
  turns: number;
  decisions: number;
  attacks: number;
  attacksAtLeader: number;
  /** Attacks declared that could not win, i.e. below the target's power. */
  attacksBelowTarget: number;
  /** Turns with two or more attacks, by how their powers were ordered. */
  ordering: Record<Ordering, number>;
  blockOffered: number;
  blockDeclined: number;
  /** Declined a block against an attack aimed at the Leader, i.e. at Life. */
  blockDeclinedAtLife: number;
  /** Counter cards played, keyed by the defender's Life at the time. */
  counterByLife: Map<number, number>;
  counterOffered: number;
  /** Active DON!! still unspent at each end of the seat's own main phase. */
  donLeftActive: number[];
  /** Main phases ended while a legal attack was still on the table. */
  passedWithAttack: number;
  /** ...of those, ended while an attack that beats its target was available. */
  passedWithWinningAttack: number;
  /** Attacks declared that active DON!! could have pushed over the target. */
  attackLeftDonUnspent: number;
  /**
   * Decisions offering two or more differently-powered *winning* attacks on the
   * opposing Leader, and how often the smallest was taken.
   *
   * Sharper than the ordering classification above, and it supersedes it where
   * the two disagree. A turn's declared powers can descend for reasons that are
   * not a choice -- the second attack was aimed at a Character, or the small
   * attack could not win and was correctly skipped -- whereas this counts only
   * positions where the seat was offered the same choice the advice is about.
   */
  leaderAttackChoices: number;
  leaderAttackSmallest: number;
  /** Own main phases that ended with no card played all turn. */
  turnsWithNoPlay: number;
  /**
   * Own turns that opened with a Character affordable, spent three or more
   * DON!! on effects or attachments, and played nothing.
   *
   * The sharpest single measure of the removal-versus-body trade, and the one a
   * folder of traces of the same matchup separates the pilots on. It is not
   * `turnsWithNoPlay`: a turn with nothing affordable is a turn with no choice,
   * and a turn that ends on `pass` with DON!! unspent is already counted by
   * `donLeftActive`. This counts the turn that had the DON!! for a body, had a
   * body in hand, and converted the DON!! into power or a one-shot effect
   * instead.
   */
  turnsSpentWithoutDeveloping: number;
  /** ...of those, ones that still had an affordable play on offer at the end. */
  turnsWithNoPlayButCould: number;
  /** DON!! spent on card costs, and DON!! given to units, per own turn. */
  donOnPlays: number;
  donAttached: number;
  /** Main-phase activations used. */
  activations: number;
  /** Attacks aimed at a Character while the opponent held 3 or fewer Life. */
  attacksAtCharacterNearLethal: number;
  /** ...against attacks aimed at the Leader in the same window. */
  attacksAtLeaderNearLethal: number;
  /**
   * The deck's own key cards: turns each was affordable, and turns it was
   * affordable and went unplayed.
   *
   * "Key" is not this tool's judgement -- it is `keyCardNumbers` from the deck's
   * dossier, the same list the LLM seat is handed as its plan. That makes the
   * metric a check of a pilot against the plan it was given, and it is what
   * separated the three pilots in this repository's first use of it: the model
   * held OP17-119 Loki, the card its own dossier names first among the giants,
   * on seven of the nine turns it could have cast it.
   */
  keyCards: Map<string, { affordable: number; unplayed: number }>;
  /** Per-turn attack powers, for `--turns`. */
  turnAttacks: { turn: number; powers: number[]; targets: string[] }[];
}

function emptyAudit(
  label: string,
  deck: string,
  controller: ControllerKind,
): SeatAudit {
  return {
    label,
    deck,
    controller,
    games: 0,
    turns: 0,
    decisions: 0,
    attacks: 0,
    attacksAtLeader: 0,
    attacksBelowTarget: 0,
    ordering: { ascending: 0, descending: 0, mixed: 0 },
    blockOffered: 0,
    blockDeclined: 0,
    blockDeclinedAtLife: 0,
    counterByLife: new Map(),
    counterOffered: 0,
    donLeftActive: [],
    passedWithAttack: 0,
    passedWithWinningAttack: 0,
    attackLeftDonUnspent: 0,
    leaderAttackChoices: 0,
    leaderAttackSmallest: 0,
    turnsWithNoPlay: 0,
    turnsWithNoPlayButCould: 0,
    turnsSpentWithoutDeveloping: 0,
    keyCards: new Map(),
    donOnPlays: 0,
    donAttached: 0,
    activations: 0,
    attacksAtCharacterNearLethal: 0,
    attacksAtLeaderNearLethal: 0,
    turnAttacks: [],
  };
}

/**
 * How a sequence of attack powers is ordered.
 *
 * Equal powers are not evidence either way, so a run of equal attacks counts as
 * ascending: the claim being measured is "did the seat lead with its smallest
 * attack", and two identical attacks answer it the same in both orders.
 */
function classifyOrdering(powers: readonly number[]): Ordering {
  let rises = false;
  let falls = false;
  for (let index = 1; index < powers.length; index += 1) {
    if (powers[index]! > powers[index - 1]!) rises = true;
    if (powers[index]! < powers[index - 1]!) falls = true;
  }
  if (falls && rises) return "mixed";
  return falls ? "descending" : "ascending";
}

const audits = new Map<string, SeatAudit>();

function auditFor(
  seat: PlayerId,
  deck: string,
  controller: ControllerKind,
): SeatAudit {
  const key =
    groupBy === "controller" ? `${controller}:${deck}` : `${seat}:${deck}`;
  const existing = audits.get(key);
  if (existing) return existing;
  const created = emptyAudit(
    groupBy === "controller" ? controller : `${seat} ${controller}`,
    deck,
    controller,
  );
  audits.set(key, created);
  return created;
}

for (const file of files) {
  const match = parseExportedMatch(readFileSync(file, "utf8"));
  const staleReason = describeStampMismatch(match.rules);
  if (staleReason && !force) {
    console.error(`skipped ${file}: ${staleReason} (--force to replay anyway)`);
    continue;
  }
  const config = match.config;
  const controllerOf: Record<PlayerId, ControllerKind> = {
    p1: config.p1Controller,
    p2: config.p2Controller,
  };
  const deckOf: Record<PlayerId, string> = {
    p1: config.p1Deck,
    p2: config.p2Deck,
  };
  // A custom deck has no dossier of its own and borrows one; the trace records
  // which, so the key-card list is the one that seat was actually given.
  const dossierOf: Record<PlayerId, string | undefined> = {
    p1: config.p1Dossier,
    p2: config.p2Dossier,
  };
  const seats: readonly PlayerId[] = ["p1", "p2"];
  for (const seat of seats) {
    auditFor(seat, deckOf[seat], controllerOf[seat]).games += 1;
  }

  const service = new GameService();
  let observation = service.create({
    ...resolveMatchDecks(config),
    seed: config.seed,
    ...(config.seedMode ? { seedMode: config.seedMode } : {}),
    startingPlayer: config.startingPlayer,
  });

  /** Attacks declared this turn by the turn player, in declaration order. */
  let turnPowers: number[] = [];
  /** Cards played by the turn player this turn, and what it spent DON!! on. */
  let turnPlays = 0;
  let turnCouldStillPlay = false;
  let turnOpenedWithAffordableBody = false;
  let turnDonSpentElsewhere = 0;
  /** Key cards affordable at some point this turn, and the ones cast. */
  let keyAffordable = new Set<string>();
  let keyPlayed = new Set<string>();
  const keyCardsOf = (deckId: string): ReadonlySet<string> =>
    new Set(deckStrategyDossier(deckId).keyCardNumbers);
  let turnTargets: string[] = [];
  let currentTurn = observation.turn;
  let turnPlayer = observation.turnPlayer;

  const flushTurn = (): void => {
    const audit = auditFor(
      turnPlayer,
      deckOf[turnPlayer],
      controllerOf[turnPlayer],
    );
    audit.turns += 1;
    if (turnPowers.length >= 2) {
      audit.ordering[classifyOrdering(turnPowers)] += 1;
    }
    if (turnPowers.length > 0) {
      audit.turnAttacks.push({
        turn: currentTurn,
        powers: [...turnPowers],
        targets: [...turnTargets],
      });
    }
    if (turnPlays === 0) {
      audit.turnsWithNoPlay += 1;
      if (turnCouldStillPlay) audit.turnsWithNoPlayButCould += 1;
      if (turnOpenedWithAffordableBody && turnDonSpentElsewhere >= 3) {
        audit.turnsSpentWithoutDeveloping += 1;
      }
    }
    turnPowers = [];
    turnTargets = [];
    turnPlays = 0;
    turnCouldStillPlay = false;
    for (const cardNumber of keyAffordable) {
      const row = audit.keyCards.get(cardNumber) ?? {
        affordable: 0,
        unplayed: 0,
      };
      row.affordable += 1;
      if (!keyPlayed.has(cardNumber)) row.unplayed += 1;
      audit.keyCards.set(cardNumber, row);
    }
    turnOpenedWithAffordableBody = false;
    turnDonSpentElsewhere = 0;
    keyAffordable = new Set();
    keyPlayed = new Set();
  };

  let failed: string | undefined;
  for (const actionId of match.actions) {
    if (observation.phase === "finished") break;
    if (
      observation.turn !== currentTurn ||
      observation.turnPlayer !== turnPlayer
    ) {
      flushTurn();
      currentTurn = observation.turn;
      turnPlayer = observation.turnPlayer;
    }
    const seat = observation.activePlayer;
    const audit = auditFor(seat, deckOf[seat], controllerOf[seat]);
    audit.decisions += 1;
    if (
      observation.phase === "main" &&
      seat === observation.turnPlayer &&
      turnPlays === 0 &&
      turnDonSpentElsewhere === 0 &&
      !turnOpenedWithAffordableBody
    ) {
      turnOpenedWithAffordableBody = observation.legalActions.some(
        (action) => action.type === "play-card",
      );
    }
    const chosen = observation.legalActions.find(
      (action) => action.actionId === actionId,
    );

    if (observation.phase === "block") {
      const blocks = observation.legalActions.filter(
        (action) => action.type === "block",
      );
      if (blocks.length > 0) {
        audit.blockOffered += 1;
        if (chosen?.type !== "block") {
          audit.blockDeclined += 1;
          // The pending attack's target is on the block action itself: every
          // block offered in a decision answers the same attack.
          const aimedAtLeader = blocks.some((action) =>
            /Leader/.test(action.summary),
          );
          if (aimedAtLeader) audit.blockDeclinedAtLife += 1;
        }
      }
    }

    if (observation.phase === "counter") {
      const counters = observation.legalActions.filter(
        (action) => action.type === "counter",
      );
      if (counters.length > 0) audit.counterOffered += 1;
      if (chosen?.type === "counter") {
        const life = observation.self.lifeCount;
        audit.counterByLife.set(life, (audit.counterByLife.get(life) ?? 0) + 1);
      }
    }

    if (observation.phase === "main") {
      const winningLeaderAttacks = observation.legalActions.filter(
        (action): action is Extract<LegalAction, { type: "attack" }> =>
          action.type === "attack" &&
          action.targetInstanceId.endsWith("-leader") &&
          (action.attackPower ?? 0) >= (action.effectiveTargetPower ?? 0),
      );
      const powers = [
        ...new Set(
          winningLeaderAttacks.map((action) => action.attackPower ?? 0),
        ),
      ].sort((left, right) => left - right);
      if (powers.length >= 2 && chosen?.type === "attack") {
        const chosenIsLeaderAttack = winningLeaderAttacks.some(
          (action) => action.actionId === chosen.actionId,
        );
        if (chosenIsLeaderAttack) {
          audit.leaderAttackChoices += 1;
          if ((chosen.attackPower ?? 0) === powers[0]) {
            audit.leaderAttackSmallest += 1;
          }
        }
      }
    }

    if (observation.phase === "main" && seat === observation.turnPlayer) {
      const key = keyCardsOf(dossierOf[seat] ?? deckOf[seat]);
      for (const action of observation.legalActions) {
        if (action.type !== "play-card") continue;
        const card = observation.self.hand.find(
          (held) => held.instanceId === action.cardInstanceId,
        );
        if (card && key.has(card.cardNumber))
          keyAffordable.add(card.cardNumber);
      }
    }
    if (chosen?.type === "play-card") {
      turnPlays += 1;
      const played = observation.self.hand.find(
        (held) => held.instanceId === chosen.cardInstanceId,
      );
      if (played) keyPlayed.add(played.cardNumber);
      const card = observation.self.hand.find(
        (held) => held.instanceId === chosen.cardInstanceId,
      );
      audit.donOnPlays += card?.cost ?? 0;
    }
    if (chosen?.type === "attach-don") {
      audit.donAttached += 1;
      turnDonSpentElsewhere += 1;
    }
    if (chosen?.type === "activate-main") {
      audit.activations += 1;
      // An activation's DON!! cost is not on the action, and the ones this
      // metric is about rest most of the pool -- Kong Gun rests six. Counting
      // it as three keeps the threshold meaningful without pretending to a
      // precision the action does not carry.
      turnDonSpentElsewhere += 3;
    }

    if (chosen?.type === "attack") {
      audit.attacks += 1;
      // Attacking a body while the opponent is one or two hits from dead is the
      // decision the race arithmetic is about, so it is counted separately from
      // target selection in general.
      if (observation.opponent.lifeCount <= 3) {
        if (chosen.targetInstanceId.endsWith("-leader")) {
          audit.attacksAtLeaderNearLethal += 1;
        } else {
          audit.attacksAtCharacterNearLethal += 1;
        }
      }
      const power = chosen.attackPower ?? 0;
      turnPowers.push(power);
      const atLeader = chosen.targetInstanceId.endsWith("-leader");
      turnTargets.push(atLeader ? "leader" : "character");
      if (atLeader) audit.attacksAtLeader += 1;
      if (power < (chosen.effectiveTargetPower ?? 0)) {
        audit.attacksBelowTarget += 1;
      }
      // Power is fixed at declaration, so DON!! still active when an attack is
      // declared short of its target's power is DON!! that can never buy this
      // battle. `donToReach` is what the engine says it would have cost.
      const donToReach = chosen.donToReach ?? 0;
      if (
        donToReach > 0 &&
        (chosen.unspentActiveDon ?? 0) >= donToReach &&
        power < (chosen.effectiveTargetPower ?? 0)
      ) {
        audit.attackLeftDonUnspent += 1;
      }
    }

    if (
      chosen?.type === "pass" &&
      observation.phase === "main" &&
      observation.activePlayer === observation.turnPlayer
    ) {
      audit.donLeftActive.push(observation.self.activeDon);
      // Ending a main phase is the one decision that can leave a whole attack
      // unmade, and an unmade attack on the Leader is unmade damage: the Leader
      // can never block, so declaring one is free even when it fails.
      turnCouldStillPlay = observation.legalActions.some(
        (action) => action.type === "play-card",
      );
      const attacks = observation.legalActions.filter(
        (action) => action.type === "attack",
      );
      if (attacks.length > 0) {
        audit.passedWithAttack += 1;
        if (
          attacks.some(
            (action) =>
              (action.attackPower ?? 0) >= (action.effectiveTargetPower ?? 0),
          )
        ) {
          audit.passedWithWinningAttack += 1;
        }
      }
    }

    try {
      observation = service.act(
        observation.gameId,
        observation.revision,
        actionId,
      );
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
      break;
    }
  }
  flushTurn();
  if (failed) console.error(`${file}: replay stopped -- ${failed}`);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const ordered = [...audits.values()].sort(
  (left, right) =>
    left.label.localeCompare(right.label) ||
    left.deck.localeCompare(right.deck),
);

for (const audit of ordered) {
  const orderTurns =
    audit.ordering.ascending + audit.ordering.descending + audit.ordering.mixed;
  const counterTotal = [...audit.counterByLife.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const counterEarly = [...audit.counterByLife.entries()]
    .filter(([life]) => life >= 4)
    .reduce((sum, [, count]) => sum + count, 0);
  console.log(`\n=== ${audit.label} -- ${audit.deck}`);
  console.log(
    `  ${audit.games} game(s), ${audit.turns} own turns, ${audit.decisions} decisions`,
  );
  console.log(
    `  attacks ${audit.attacks} (${audit.attacksAtLeader} at Leader, ${audit.attacksBelowTarget} below the target's power), ${(audit.attacks / Math.max(1, audit.turns)).toFixed(2)} per own turn`,
  );
  if (orderTurns > 0) {
    const pct = (value: number) => `${Math.round((100 * value) / orderTurns)}%`;
    console.log(
      `  multi-attack turns ordered: weakest-first ${audit.ordering.ascending} (${pct(audit.ordering.ascending)}), largest-first ${audit.ordering.descending} (${pct(audit.ordering.descending)}), mixed ${audit.ordering.mixed} (${pct(audit.ordering.mixed)})`,
    );
  }
  console.log(
    `  blocks: offered ${audit.blockOffered}, declined ${audit.blockDeclined} (${audit.blockDeclinedAtLife} against an attack on the Leader)`,
  );
  const byLife = [...audit.counterByLife.entries()]
    .sort(([left], [right]) => right - left)
    .map(([life, count]) => `${life}L:${count}`)
    .join(" ");
  console.log(
    `  Counter cards played ${counterTotal} over ${audit.counterOffered} counter decisions${byLife ? ` (${byLife})` : ""}; ${counterEarly} at 4+ Life`,
  );
  console.log(
    `  active DON!! left at end of own main phase: mean ${mean(audit.donLeftActive).toFixed(2)} over ${audit.donLeftActive.length} turns`,
  );
  console.log(
    `  main phases ended with an attack still available: ${audit.passedWithAttack} (${audit.passedWithWinningAttack} with an attack that beats its target)`,
  );
  console.log(
    `  attacks declared short of the target with the DON!! to reach it unspent: ${audit.attackLeftDonUnspent}`,
  );
  console.log(
    `  own turns with no card played at all: ${audit.turnsWithNoPlay} (${audit.turnsWithNoPlayButCould} of them still had an affordable play on offer at the end)`,
  );
  console.log(
    `  own turns that opened with a body affordable, spent 3+ DON!! elsewhere and developed nothing: ${audit.turnsSpentWithoutDeveloping} of ${audit.turns}`,
  );
  console.log(
    `  DON!! spent: ${audit.donOnPlays} on card costs, ${audit.donAttached} given to units (${((audit.donAttached / Math.max(1, audit.donOnPlays + audit.donAttached)) * 100).toFixed(0)}% on power); ${(audit.activations / Math.max(1, audit.turns)).toFixed(2)} activations per own turn`,
  );
  const nearLethal =
    audit.attacksAtCharacterNearLethal + audit.attacksAtLeaderNearLethal;
  if (nearLethal > 0) {
    console.log(
      `  attacks with the opponent at 3 or fewer Life: ${audit.attacksAtLeaderNearLethal} at the Leader, ${audit.attacksAtCharacterNearLethal} at a Character (${Math.round((100 * audit.attacksAtCharacterNearLethal) / nearLethal)}% off the clock)`,
    );
  }
  const keyRows = [...audit.keyCards.entries()]
    .filter(([, row]) => row.affordable > 0)
    .sort(([, left], [, right]) => right.unplayed - left.unplayed);
  if (keyRows.length > 0) {
    console.log(
      `  dossier key cards, turns affordable -> turns left uncast: ${keyRows
        .map(([card, row]) => `${card} ${row.affordable}->${row.unplayed}`)
        .join(", ")}`,
    );
  }
  if (audit.leaderAttackChoices > 0) {
    const share = Math.round(
      (100 * audit.leaderAttackSmallest) / audit.leaderAttackChoices,
    );
    console.log(
      `  offered a choice of winning Leader attacks ${audit.leaderAttackChoices} times, led with the smallest ${audit.leaderAttackSmallest} (${share}%)`,
    );
  }
  if (showTurns) {
    for (const turn of audit.turnAttacks) {
      console.log(
        `    t${turn.turn}: ${turn.powers.map((power, index) => `${power}->${turn.targets[index]}`).join(", ")}`,
      );
    }
  }
}
