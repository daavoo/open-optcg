import {
  chooseSt31Rules,
  createSt31MulliganModule,
} from "./decks/st31-policy.js";
import {
  createOp16LuffyBoardModule,
  createOp16LuffyCrocodileModule,
  createOp16LuffyPrisonerModule,
  createOp16LuffyMulliganModule,
  createOp16LuffyRulesPolicy,
} from "./decks/op16-luffy-policy.js";
import { OP16_NAMI_RULES } from "./decks/op16-nami-policy.js";
import { createOp16TeachRulesPolicy } from "./decks/op16-teach-policy.js";
import {
  createOp16EnelBlockPolicy,
  createOp16EnelCounterReserveModule,
  createOp16EnelDefensePolicy,
  createOp16EnelDonPostureModule,
  createOp16EnelDoubleAttackDonModule,
  createOp16EnelDoubleAttackGiftModule,
  createOp16EnelGiftGuardModule,
  createOp16EnelMulliganModule,
  createOp16EnelRulesPolicy,
} from "./decks/op16-enel-policy.js";
import {
  createOp13SaboDecideModule,
  createOp13SaboMulliganModule,
  createOp13SaboRulesPolicy,
  isElbaphSaboList,
} from "./decks/op13-sabo-policy.js";
import {
  createOp16AceMulliganModule,
  createOp16AceRulesPolicy,
  createOp16AceDefensePolicy,
} from "./decks/op16-ace-policy.js";
import {
  createEb04BonneyDyingBlockModule,
  createEb04BonneyLifeFloorModule,
  createEb04BonneyMulliganModule,
  createEb04BonneyWallModule,
} from "./decks/eb04-bonney-policy.js";
import {
  createOp09RobinMulliganModule,
  ROBIN_RULES,
} from "./decks/op09-robin-policy.js";
import {
  createSt18LuffyModules,
  createSt18LuffyMulliganModule,
} from "./decks/st18-luffy-policy.js";
import {
  createSt26LuffyModules,
  createSt26LuffyMulliganModule,
} from "./decks/st26-luffy-policy.js";
import {
  createSt27TeachModules,
  createSt27TeachMulliganModule,
  createSt27TeachDefensePolicy,
  createSt27TeachPitchPolicy,
} from "./decks/st27-teach-policy.js";
import { createSt22AceNewgateMulliganModule } from "./decks/st22-ace-newgate-policy.js";
import { createSt23ShanksMulliganModule } from "./decks/st23-shanks-policy.js";
import { ST29_PITCH_ORDER } from "./decks/st29-luffy-policy.js";
import {
  createSt30LuffyAceDefenseModule,
  createSt30LuffyAceMulliganModule,
  createSt30LuffyAceRulesPolicy,
} from "./decks/st30-luffy-ace-policy.js";
import {
  createOp06YamatoGiftModule,
  createOp06YamatoLoadLeaderModule,
  createOp06YamatoMulliganModule,
  createOp06YamatoOtamaModule,
  createOp06YamatoRushModule,
} from "./decks/op06-yamato-policy.js";
import {
  OP16_SENGOKU_RULES,
  createOp16SengokuDefensePolicy,
} from "./decks/op16-sengoku-policy.js";
import {
  createOp15KriegBlockDiscountModule,
  createOp15KriegDeadGiftModule,
  createOp15KriegPayoffKoBlockModule,
  createOp15KriegCounterPolicy,
  createOp15KriegAuraModule,
  createOp15KriegJangoFirstModule,
  createOp15KriegJangoModule,
  createOp15KriegMulliganModule,
} from "./decks/op15-krieg-policy.js";
import {
  createOp13LuffyCounterPolicy,
  createOp13LuffyLeaderPolicy,
  createOp13LuffyMulliganModule,
} from "./decks/op13-luffy-policy.js";
import {
  createOp17LinlinCounterPolicy,
  LINLIN_RULES,
} from "./decks/op17-linlin-policy.js";
import {
  createOp17LuffyBlockPolicy,
  createOp17LuffyCounterPolicy,
  OP17_LUFFY_PITCH_ORDER,
} from "./decks/op17-luffy-policy.js";
import {
  createOp15LucyPitchPolicy,
  createOp15LucyStagePolicy,
  createOp15LucyFreeEventPolicy,
  createOp15LucyCounterPolicy,
  createOp15LucyMulliganModule,
  createOp15LucyStageFirstModule,
  createOp15LucyHandPaymentModule,
  createOp15LucyFireFistPolicy,
  createOp15LucyMementoLineModule,
  createOp15LucyPressModule,
} from "./decks/op15-lucy-policy.js";
import {
  createOp13ImuResetGateModule,
  createOp13ImuResetHoldModule,
  createOp13ImuLeaderModule,
  createOp13ImuThroneMarsModule,
  createOp13ImuDiscardModule,
  createOp13ImuIdleRemovalModule,
  createOp13ImuMulliganModule,
  createOp13ImuThroneModule,
} from "./decks/op13-imu-policy.js";
import {
  createOp15RebeccaCounterPolicy,
  createOp15RebeccaDiscardModule,
  createOp15RebeccaFuelFirstModule,
  createOp15RebeccaKyrosModule,
  createOp15RebeccaLeaderModule,
  createOp15RebeccaMulliganModule,
  createOp15RebeccaOrlumbusModule,
} from "./decks/op15-rebecca-policy.js";
import { createOp15LuffyMulliganModule } from "./decks/op15-luffy-policy.js";
import {
  createOp15BrookCounterPolicy,
  createOp15BrookDeckBudgetModule,
  createOp15BrookRestandModule,
  createOp15BrookTrashChoiceModule,
} from "./decks/op15-brook-policy.js";
import {
  createEb03ViviBounceModule,
  createEb03ViviLeaderModule,
  createEb03ViviMulliganModule,
  createEb03ViviSearchModule,
  EB03_VIVI_DISCARD_ORDER,
} from "./decks/eb03-vivi-policy.js";
import { createOp14HancockMulliganModule } from "./decks/op14-hancock-policy.js";
import {
  createOp10UsoppCounterModule,
  createOp10UsoppDeadRestModule,
  createOp10UsoppRestStageModule,
  createOp10UsoppDiscardModule,
  createOp10UsoppMulliganModule,
  createOp10UsoppRebeccaModule,
  createOp10UsoppSearchModule,
} from "./decks/op10-usopp-policy.js";
import {
  createOp12SanjiBoeufModule,
  createOp12SanjiEventModule,
  createOp12SanjiGateModule,
  createOp12SanjiMulliganModule,
} from "./decks/op12-sanji-policy.js";
import {
  createOp11JinbeCounterModule,
  createOp11JinbeDefendModule,
} from "./decks/op11-jinbe-policy.js";
import {
  createOp14LawGuardModule,
  createOp14LawMulliganModule,
  createOp14LawSwapModule,
} from "./decks/op14-law-policy.js";
import {
  createOp14JinbeBounceModule,
  createOp14JinbeLeaderModule,
  createOp14JinbeMulliganModule,
  OP14_JINBE_PITCH_ORDER,
} from "./decks/op14-jinbe-policy.js";
import { createOp13RogerMulliganModule } from "./decks/op13-roger-policy.js";
import {
  createOp16YamatoCounterPolicy,
  createOp16YamatoDigModule,
  createOp16YamatoHoldEightModule,
  createOp16YamatoMulliganModule,
  createOp16YamatoRecoverModule,
  createOp16YamatoReviveModule,
  createOp16YamatoSetupModule,
  createOp16YamatoSwapModule,
} from "./decks/op16-yamato-policy.js";
import { createOp08PuddingMulliganModule } from "./decks/op08-pudding-policy.js";
import { createOp05EnelMulliganModule } from "./decks/op05-enel-policy.js";
import {
  createOp14CrocodileFodderModule,
  createOp14CrocodileGateModule,
  createOp14CrocodileMulliganModule,
  createOp14CrocodileCounterPolicy,
} from "./decks/op14-crocodile-policy.js";
import {
  createOp14MoriaBankModule,
  createOp14MoriaFodderModule,
  createOp14MoriaGateModule,
  createOp14MoriaMulliganModule,
  createOp14MoriaRevivalModule,
  createOp14MoriaCounterPolicy,
} from "./decks/op14-moria-policy.js";
import {
  createOp09BuggyCounterPolicy,
  createOp09BuggyDiscardModule,
  createOp09BuggyLeaderModule,
  createOp09BuggyMulliganModule,
  createOp09BuggyPlayPickModule,
} from "./decks/op09-buggy-policy.js";
import {
  createEb02LuffyCounterPolicy,
  createEb02LuffyModules,
  createEb02LuffyMulliganModule,
} from "./decks/eb02-luffy-policy.js";
import {
  createOp12KoalaMulliganModule,
  createOp12KoalaRobinModule,
  createOp12KoalaCounterPolicy,
} from "./decks/op12-koala-policy.js";
import {
  createOp11ShirahoshiMulliganModule,
  createOp11ShirahoshiLeaderModule,
  createOp11ShirahoshiLeaderPickModule,
  createOp11ShirahoshiOtohimeModule,
  createOp11ShirahoshiZeusModule,
  createOp11ShirahoshiLeaderDonModule,
} from "./decks/op11-shirahoshi-policy.js";
import {
  createOp06ReijuMulliganModule,
  OP06_REIJU_RULES,
} from "./decks/op06-reiju-policy.js";
import { createEb05RobinMulliganModule } from "./decks/eb05-robin-policy.js";
import {
  createOp11KobyCounterPolicy,
  createOp11KobyMulliganModule,
  KOBY_RULES,
} from "./decks/op11-koby-policy.js";
import {
  createOp07VegapunkLeaderFirstModule,
  createOp07VegapunkLeaderModeModule,
  createOp07VegapunkLeaderPickModule,
  createOp07VegapunkMulliganModule,
  createOp07VegapunkSearchModule,
  createOp07VegapunkStageModule,
  createOp07VegapunkTakeTheTriggerModule,
} from "./decks/op07-vegapunk-policy.js";
import {
  ACE_RULES,
  createOp13AceMulliganModule,
} from "./decks/op13-ace-policy.js";
import {
  createOp12RayleighCounterEventsModule,
  createOp12RayleighHancockModule,
  createOp12RayleighMulliganModule,
  createOp12RayleighReachModule,
  createOp12RayleighReserveModule,
  createOp12RayleighSearchModule,
  OP12_RAYLEIGH_PRESS_RULES,
} from "./decks/op12-rayleigh-policy.js";
import {
  createOp14DoflamingoMulliganModule,
  createOp14DoflamingoFinisherModule,
  createOp14DoflamingoRedirectModule,
  OP14_DOFLAMINGO_TRASH_ORDER,
} from "./decks/op14-doflamingo-policy.js";
import {
  createOp17NewgateCostPolicy,
  createOp17NewgateCounterPolicy,
  createOp17NewgateDefensePolicy,
  createOp17NewgateOdenPolicy,
  createOp17NewgateMulliganModule,
} from "./decks/op17-newgate-policy.js";
import {
  createOp17ShanksMulliganModule,
  createOp17ShanksRulesPolicy,
} from "./decks/op17-shanks-policy.js";
import {
  createOp17XebecCounterPolicy,
  createOp17XebecDefensiveTriggerPolicy,
  createOp17XebecDeployPolicy,
  createOp17XebecKeepPayoffPolicy,
  createOp17XebecLethalPumpPolicy,
  createOp17XebecLockPolicy,
  createOp17XebecMulliganModule,
  createOp17XebecRulesPolicy,
  createOp17XebecTrashPolicy,
} from "./decks/op17-xebec-policy.js";
import {
  createOp17KaidoCounterHorizonPolicy,
  createOp17KaidoDefensePolicy,
  createOp17KaidoMulliganModule,
  createOp17KaidoEconomyPolicy,
  createOp17KaidoRulesPolicy,
  createOp17KaidoLeaderFloorPolicy,
  KAIDO_EFFECT_RULES,
  KAIDO_FIELD_LIST_RULES,
} from "./decks/op17-kaido-policy.js";
import {
  createOp14MihawkBlockerHomeModule,
  createOp14MihawkBodySaveModule,
  createOp14MihawkDeadRemovalModule,
  createOp14MihawkDefensePolicy,
  createOp14MihawkHandCostModule,
  createOp14MihawkKinemonFirstModule,
  createOp14MihawkLeaderSwingModule,
  createOp14MihawkOpeningHoldModule,
  createOp14MihawkRemovalPairingModule,
  createOp14MihawkReplayPickModule,
  createOp14MihawkUnpaidRemovalModule,
  createOp14MihawkLinlinBranchModule,
  createOp14MihawkLunaHoldModule,
  createOp14MihawkMulliganModule,
  createOp14MihawkRulesPolicy,
} from "./decks/op14-mihawk-policy.js";
import {
  createSt32MulliganModule,
  createSt32RulesPolicy,
} from "./decks/st32-policy.js";
import { ST32_PLAY_RULES } from "./decks/st32-cards.js";
import {
  createSt33MulliganModule,
  createSt33RulesPolicy,
  ST33_PLAY_RULES,
} from "./decks/st33-policy.js";
import {
  createSt34MulliganModule,
  createSt34RulesPolicy,
  ST34_PLAY_RULES,
} from "./decks/st34-policy.js";
import {
  createSt35DefensePolicy,
  createSt35MulliganModule,
  ST35_RULES,
} from "./decks/st35-policy.js";
import {
  createSt36MulliganModule,
  createSt36RulesPolicy,
} from "./decks/st36-policy.js";
import {
  createCounterBudgetModule,
  createCounterEventReserveModule,
  createOneCardLifeSaveModule,
  createDeadAttachmentModule,
  createPreCombatAttachmentModule,
  createDeadOpeningPlayModule,
  createDeadGiftActivationModule,
  createRestedDonGiftModule,
  createDeadKeywordGrantModule,
  createInertActivationModule,
  createDeadRampModule,
  createCappedRampModule,
  createInertTriggerModule,
  createDeadRampTriggerModule,
  createDeadBuffTriggerModule,
  createDeadTriggerModule,
  createTriggerDebuffTargetModule,
  createMainDebuffTargetModule,
  createDonReservationModule,
  createAttackOrderModule,
  createClauseSwingModule,
  createAuraAttachmentModule,
  createCounterOverDyingBlockModule,
  createDonThresholdModule,
  createKoReachAttachmentModule,
  createKoMarginAttachmentModule,
  createPressThroughBlockersModule,
  createFreeBlockModule,
  LETHAL_CLOSE_RULES,
  COUNTER_SAVE_RULES,
  createNoHopelessAttackModule,
  createAreaReplacementChoiceModule,
  createSearchBlockerModule,
  createHandCostChoiceModule,
  createHandCostOrderModule,
  createEqualCostPlayModule,
  createReplacementBlockerModule,
  createReplacementTempoModule,
  createBoardReplacementModule,
  createOwnBoardRemovalModule,
  createGloriosaBottomModule,
  createThreatRemovalModule,
  createKoPayoffTargetModule,
  createStageReplacementModule,
} from "./format-heuristics.js";
import { heuristicModules, type Heuristic } from "./heuristics.js";
import { RAMP_RULES } from "./strategy/ramp.js";
import { searchValueModules } from "./search-values.js";
import { decideModule, type PolicyModule } from "./policy-module.js";
import { BUILT_IN_STRATEGY_PROFILES } from "./strategy/archetypes.js";
import { compileProfile, resolveProfile } from "./strategy/profile.js";

/**
 * Leader card numbers, so registrations read as decks rather than card ids.
 */
export const LEADERS = {
  ST31: "ST21-001",
  ST32: "OP12-020",
  ST33: "OP12-040",
  ST34: "OP11-062",
  ST35: "OP13-004",
  ST36: "OP10-099",
  OP16_LUFFY: "OP16-022",
  NAMI: "OP11-041",
  TEACH: "OP16-080",
  ENEL: "OP15-058",
  SHANKS: "OP17-020",
  XEBEC: "OP17-039",
  OP14_MIHAWK: "OP14-020",
  OP16_ACE: "OP16-001",
  KAIDO: "OP17-058",
  LUFFY_ACE: "ST30-001",
  BONNEY: "EB04-001",
  YAMATO: "OP06-022",
  NEWGATE: "OP17-001",
  ROBIN: "OP09-062",
  SENGOKU: "OP16-060",
  ST18_LUFFY: "OP05-060",
  ST26_LUFFY: "OP09-061",
  ST27_TEACH: "OP09-081",
  ST22_ACE_NEWGATE: "ST22-001",
  ST23_SHANKS: "OP09-001",
  ST29_LUFFY: "ST29-001",
  KRIEG: "OP15-001",
  LINLIN: "OP17-099",
  LUCY: "OP15-002",
  REBECCA: "OP15-039",
  IMU: "OP13-079",
  RED_PURPLE_ROGER: "OP13-003",
  BROOK: "OP15-022",
  OP15_LUFFY: "OP15-098",
  VIVI: "EB03-001",
  RED_LAW: "OP14-001",
  OP14_HANCOCK: "OP14-041",
  OP14_JINBE: "OP14-040",
  BLACK_YAMATO: "OP16-079",
  BLACK_CROCODILE: "OP14-079",
  BLACK_YELLOW_MORIA: "OP14-080",
  BLACK_YELLOW_KOALA: "OP12-081",
  GREEN_PURPLE_LUFFY: "EB02-010",
  GREEN_YELLOW_SHIRAHOSHI: "OP11-022",
  BLUE_PURPLE_REIJU: "OP06-042",
  RED_BLACK_KOBY: "OP11-001",
  YELLOW_VEGAPUNK: "OP07-097",
  RED_BLUE_ACE: "OP13-002",
  BLUE_PURPLE_SANJI: "OP12-041",
  GREEN_JINBE: "OP11-021",
  BLUE_BUGGY: "OP09-042",
  RED_RAYLEIGH: "OP12-001",
  OP14_DOFLAMINGO: "OP14-060",
  BLUE_BLACK_USOPP: "OP10-042",
  PUDDING: "OP08-058",
  YELLOW_ENEL: "OP05-098",
  OP13_LUFFY: "OP13-001",
  ELBAPH_LUFFY: "OP17-079",
  GREEN_YELLOW_ROBIN: "EB05-010",
} as const;

/**
 * `deck` value for a module that applies to every deck in the format.
 *
 * Format fundamentals -- develop before powering up, lead with the attack that
 * demands the most Counter cards -- are not deck knowledge, and copying them
 * into six policies is how they drift. Registered once here they compose with
 * whatever each deck already does, because they only contribute `rank` and
 * `veto`, never `decide`.
 */
export const EVERY_DECK = "*" as const;

/**
 * A module plus where it belongs. `deck` is the deck whose seat the module
 * pilots, or {@link EVERY_DECK}; `opponent` narrows it to one matchup.
 * Registration is data, so adding a matchup is one entry rather than an edit to
 * every agent class.
 *
 * Registration is by factory, not by instance. No policy currently closes over
 * per-game state -- ST32 was the last one that did, counting its own Leader
 * DON!! attachments in a `Map` until it learned to read `leader.attachedDon`
 * instead -- but sharing one module across agents silently changed 26% of
 * benchmark games when it did, and a factory makes that class of bug
 * unreachable rather than merely absent.
 */
export interface Registration {
  deck: string;
  opponent?: string;
  /** Higher runs first. Matchup entries default above deck entries. */
  priority?: number;
  create: () => PolicyModule;
}

const registrations: Registration[] = [];

export function registerPolicy(registration: Registration): void {
  registrations.push(registration);
}

/**
 * Modules that apply to a deck, most specific first: matchup modules before
 * whole-deck modules, and within each band in registration order.
 */
export function policiesForDeck(deck: string): PolicyModule[] {
  return registrations
    .filter((entry) => entry.deck === deck || entry.deck === EVERY_DECK)
    .map((entry, index) => ({
      entry,
      index,
      priority: entry.priority ?? (entry.opponent === undefined ? 0 : 100),
    }))
    .sort(
      (left, right) =>
        right.priority - left.priority || left.index - right.index,
    )
    .map(({ entry }) => {
      const { opponent } = entry;
      const inner = entry.create();
      if (opponent === undefined) return inner;
      return {
        ...inner,
        applies: (context) =>
          context.opponentLeader === opponent &&
          (inner.applies?.(context) ?? true),
      } satisfies PolicyModule;
    });
}

export function registeredDecks(): string[] {
  return [
    ...new Set(
      registrations
        .map((entry) => entry.deck)
        .filter((deck) => deck !== EVERY_DECK),
    ),
  ];
}

/**
 * Priority band for compiled strategy profiles.
 *
 * Between the format fundamentals (194-200) and the deck policies (0), which is
 * where the layer belongs conceptually: narrower than the format, wider than one
 * deck. The number is close to cosmetic -- profiles contribute only `rank` and
 * `veto`, and both of those are collected from every applicable module rather
 * than raced -- but it keeps `policiesForDeck` readable, and a deeper layer
 * sorting first means a trace lists the most specific claim first.
 */
const STRATEGY_PRIORITY_BASE = 160;

/**
 * Priority band for the per-deck mulligan modules.
 *
 * Above the deck policies (0) and below everything else, which is what the
 * decision needs rather than a preference: the opening hand is the one decision
 * a deck's whole-turn `decide` ladder answers in its first branch, and lifting
 * it out of twelve ladders into `mulligan.ts` has to leave that ordering intact.
 * The format band never reaches it -- no fundamental offers a rule for a
 * five-card hand and no board -- so one number above the ladders is enough.
 */
const MULLIGAN_PRIORITY = 1;

/**
 * Registers each module a compiler produces as its own entry, so `--disable`
 * can address one of them without the others.
 *
 * Compiled once here only to learn how many modules there are. Every
 * registration then calls `compile` again inside its `create`, so each agent
 * gets its own instances -- the factory contract {@link Registration}
 * documents. The per-index re-compile is what keeps a module registered for
 * several Leaders from ever being one shared object.
 */
function registerEachCompiled(
  compile: () => PolicyModule[],
  entry: Omit<Registration, "create">,
  decorate: (module: PolicyModule) => PolicyModule = (module) => module,
): void {
  const count = compile().length;
  for (let index = 0; index < count; index += 1) {
    registerPolicy({
      ...entry,
      create: () => decorate(compile()[index]!),
    });
  }
}

/**
 * Registers every built-in strategy profile against the Leaders that pilot it.
 *
 * One `registerPolicy` per compiled layer, so `--disable strategy:red-aggro`
 * addresses exactly one layer of the hierarchy. A profile with no rules compiles
 * to no modules and so registers nothing, which is what makes naming `midrange`
 * and `control` before they have rules a genuine no-op rather than a silent
 * behaviour change.
 */
function registerStrategyProfiles(): void {
  for (const profile of BUILT_IN_STRATEGY_PROFILES) {
    const leaders = profile.leaders ?? [];
    if (leaders.length === 0) continue;
    const depth = resolveProfile(profile.id).chain.length;
    for (const leader of leaders) {
      registerEachCompiled(() => compileProfile(profile.id), {
        deck: leader,
        priority: STRATEGY_PRIORITY_BASE + depth,
      });
    }
  }
}

/**
 * Registers a format rule set as one module per named rule, for every deck,
 * so `--disable lethal-close` prices the whole fundamental and `--disable
 * lethal-close#no-development` prices one claim inside it.
 */
function registerFormatRules(
  id: string,
  rules: readonly Heuristic[],
  priority: number,
): void {
  registerEachCompiled(() => heuristicModules(id, rules), {
    deck: EVERY_DECK,
    priority,
  });
}

/**
 * Registers a deck's own heuristics as one module per named rule.
 *
 * The deck-level counterpart of {@link registerFormatRules}, and for the same
 * reason: `--disable st35` prices the whole layer, `--disable
 * st35#aura-enabler` prices one claim, and without the second a layer that
 * measures well can be three rules one of which is quietly costing more than
 * the other two make. Issue #170 asks for exactly this granularity as ladders
 * are dissolved.
 */
function registerDeckRules(
  deck: string,
  id: string,
  rules: readonly Heuristic[],
  applies?: PolicyModule["applies"],
): void {
  registerEachCompiled(
    () => heuristicModules(id, rules),
    { deck },
    applies ? (module) => ({ ...module, applies }) : undefined,
  );
}

/**
 * Registers several hand-written modules for one deck, one entry each.
 *
 * The same thing as the `registerPolicy` calls it replaces: each factory is
 * still its own registration, so `pnpm deck:ab --disable <id>` still switches
 * one off at a time. It exists so a deck that ships eight modules reads as a
 * list rather than eight blocks that differ only in the factory's name.
 */
function registerDeckModules(
  deck: string,
  factories: readonly (() => PolicyModule)[],
  priority?: number,
): void {
  for (const create of factories) {
    registerPolicy({
      deck,
      ...(priority === undefined ? {} : { priority }),
      create,
    });
  }
}

// --- Built-in registrations -------------------------------------------------
// Matchup modules keep their own Leader checks for now, so registering them
// with an explicit `opponent` is belt and braces rather than a behaviour change.

// Format fundamentals. These contribute only `rank`/`veto`, so they narrow what
// each deck policy chooses from and never take a decision over.
registerPolicy({
  deck: EVERY_DECK,
  priority: 200,
  create: createDonReservationModule,
});
registerPolicy({
  deck: EVERY_DECK,
  priority: 198,
  create: createCounterEventReserveModule,
});
registerPolicy({
  deck: EVERY_DECK,
  priority: 194,
  create: createCounterBudgetModule,
});
registerPolicy({
  deck: EVERY_DECK,
  priority: 197,
  create: createNoHopelessAttackModule,
});
// An opponent on 0 Life loses to the next hit that connects, so the turn stops
// being about the board. See `createLethalCloseModule`.
registerFormatRules("lethal-close", LETHAL_CLOSE_RULES, 199);
// Scoped to one Leader while it is measured: what a body is worth to save is a
// fact about the deck that plays it, not about the format.
registerDeckRules(LEADERS.OP16_LUFFY, "counter-save", COUNTER_SAVE_RULES);
registerPolicy({
  deck: EVERY_DECK,
  priority: 195,
  create: createThreatRemovalModule,
});
// Collected before `threat-removal` ranks, so the rank chooses among the bodies
// that are still worth taking rather than re-promoting one this removed. See
// `createKoPayoffTargetModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 193,
  create: createKoPayoffTargetModule,
});
// An "up to N" clause is legal whatever the board holds, so the engine offers a
// [Main] program whose only effect is a selection even with nothing to select.
// Five decks each wrote this rule for one of their own cards before the engine
// answered it; see `createInertActivationModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 196,
  create: createInertActivationModule,
});
// The same "the cost is paid and nothing happens" shape, one zone over: an
// optional whose only payoff is DON!! out of a DON!! deck that has run out. See
// `createDeadRampModule` for the trace and the pool scan.
registerPolicy({
  deck: EVERY_DECK,
  priority: 196,
  create: createDeadRampModule,
});
// The same clause one card earlier in the DON!! deck: with one or two left, the
// next DON!! Phase draws them anyway, so a *rested* add pays a card to move a
// DON!! the seat already had coming. Format-wide for the reason its sibling is
// -- the claim is about the DON!! deck rather than about any deck's plan, and
// only one shipped deck holds a card that reaches it. See
// `createCappedRampModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 196,
  create: createCappedRampModule,
});
// [Unblockable] and [Double Attack] are read by an attack and expire with the
// turn, so a turn that cannot attack -- the first player's first, most often --
// cannot read either. See `createDeadKeywordGrantModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 193,
  create: createDeadKeywordGrantModule,
});
// A DON!! given to a Character is +1000 for this turn only, so an attachment on
// a body that will not win a battle this turn is a spent resource that buys
// nothing. Named as a property of the position rather than of any deck. See
// `createDeadAttachmentModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 193.5,
  create: createDeadAttachmentModule,
});
// The same argument one turn earlier, where it needs no arithmetic at all: no
// attack is legal before turn 3, so a DON!! given to the Leader on turn 1 is
// read by no battle before it returns at that seat's next Refresh. See
// `createPreCombatAttachmentModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 193.6,
  create: createPreCombatAttachmentModule,
});
// And the play-side half of that same turn bound: a card whose entire
// `[On Play]` is a power boost expiring with the turn, on a 0-power body, is
// spent in full for nothing on a turn the rules allow no battle on. See
// `createDeadOpeningPlayModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 193.7,
  create: createDeadOpeningPlayModule,
});
// The same arithmetic one step over, for the DON!! an effect gives rather than
// the DON!! the pilot attaches: a gift onto a card that has already swung buys
// nothing, because attached DON!! is +1000 only on its controller's own turn.
// Named as a rule of the game, not of any one deck. See
// `createRestedDonGiftModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 193.4,
  create: createRestedDonGiftModule,
});
// And the decision above that one: whether to buy the gift at all. Kept apart
// from the ranking because the two answer different questions at different
// decisions, and because a rule that forbids an action has to be measurable on
// its own. See `createDeadGiftActivationModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 193.3,
  create: createDeadGiftActivationModule,
});
registerPolicy({
  deck: EVERY_DECK,
  priority: 196,
  create: createDeadTriggerModule,
});
// The other half of `dead-trigger`'s decision: once a debuff [Trigger] is worth
// activating, which body it lands on was still offer order, and a debuff that
// expires at end of turn does nothing to a unit that has already swung. See
// `createTriggerDebuffTargetModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 196,
  create: createTriggerDebuffTargetModule,
});
// The other side of the table's half of the same decision: a debuff the seat
// pays for in its own Main phase is read only by a battle it can still get
// into, which is a rested body or a live [Blocker]. Registered for ST31 alone
// while it is measured, per the audit playbook -- the trade it prices is the
// deck's own attack step, and a deck that debuffs to set up removal rather
// than an attack should price it differently. See
// `createMainDebuffTargetModule`.
registerPolicy({
  deck: LEADERS.ST31,
  priority: 196,
  create: createMainDebuffTargetModule,
});
// The same rule with the sign flipped: a [Trigger] whose whole effect is a
// power boost on your own cards is defence, and defence bought after the last
// attack of the opponent's turn expires unread. See
// `createDeadBuffTriggerModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 196,
  create: createDeadBuffTriggerModule,
});
// `dead-trigger`'s sibling, for the Trigger that is not a debuff at all: an
// "up to 1" clause with nothing to select resolves nothing, and activating it
// trashes and reveals the card that declining would have put in hand. See
// `createInertTriggerModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 196,
  create: createInertTriggerModule,
});
// `dead-ramp`'s sibling in the same zone: a [Trigger] whose whole payoff is
// DON!! out of a DON!! deck that has run out. The cost that rule looks for is
// not in the program here -- it is the card itself, which activating trashes
// and declining puts in hand. See `createDeadRampTriggerModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 196,
  create: createDeadRampTriggerModule,
});
// Playing a Stage on top of a live copy of itself trashes the incumbent to
// arrive at the field the seat already had, which is why this is a rule of the
// game rather than one each deck states for its own Stage. See
// `createStageReplacementModule`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 196,
  create: createStageReplacementModule,
});
// Removing your own board with a symmetric removal effect. Priority is within
// the fundamentals band and irrelevant to the outcome -- vetoes are collected
// from every applicable module rather than raced -- but it belongs with the rest
// of the band rather than below the deck policies it protects.
registerPolicy({
  deck: EVERY_DECK,
  priority: 192,
  create: createOwnBoardRemovalModule,
});
// The Character area limit, as two fundamentals: what a full board costs a play
// (`board-replacement-cost`) and which body to give up once the play is made
// (`area-replacement-choice`). Both name a rule of the game rather than a deck,
// which is why they sit here instead of in the one deck policy whose trace found
// them; `st31-policy.ts` had the first of the two as a deck-local
// `replacementAdjustment` for months while every other policy stayed board-blind.
registerPolicy({
  deck: EVERY_DECK,
  priority: 191,
  create: createBoardReplacementModule,
});
registerPolicy({
  deck: EVERY_DECK,
  priority: 190,
  create: createAreaReplacementChoiceModule,
});
// Directly below the rule it adjusts, and one band lower, so a trace lists the
// power judgement first and the tempo adjustment as the thing that moved it.
registerPolicy({
  deck: EVERY_DECK,
  priority: 189,
  create: createReplacementTempoModule,
});
// And beside it, the keyword the power judgement cannot see. Ordering among the
// three is cosmetic -- `rank` contributions from every applicable module are
// summed, not raced -- but it reads as the argument it is: power first, then the
// swing the body still owes, then the block it still has.
registerPolicy({
  deck: EVERY_DECK,
  priority: 189,
  create: createReplacementBlockerModule,
});
// One step earlier than the three rules above, and the same judgement: at equal
// printed cost the ladder's "develop the highest-cost legal card" is a stable
// sort, so the winner among a tied band is whichever card the engine offered
// first -- hand order. `EVERY_DECK` because the claim is a dominance one: at
// equal cost nothing is given up, so no deck's plan prices it the other way.
// Scoped to the top band only, which is what leaves the ladder deciding which
// band gets developed at all.
registerPolicy({
  deck: EVERY_DECK,
  priority: 188,
  create: createEqualCostPlayModule,
});
// Which card a *search* hands the deck: the same question
// `area-replacement-choice` answers one step over. Most of the roster reaches a
// contested search several times a game -- one offering more than one card, told
// apart from the "trash 1 card from your deck" arriving in the same
// `mechanic-choice` shape by `LegalAction.destination` -- and without a rule
// every one of them is answered by whichever card the engine enumerated first.
// `search-blocker` answers it; see that module for what it ranks and why a card
// table cannot express it.
//
// Containment is what a format-wide registration has to earn here, because a
// `rankAmong` pass narrows the options *before* a deck's `decide` module
// chooses: where this rule and a deck's own search table disagree, this rule
// wins. ST31 and ST33 are the two that answer a search from a hand-built card
// table, so they are the pair to re-check whenever this rule changes --
// `pnpm deck:ab --deck "<deck>" --disable search-blocker`.
registerPolicy({
  deck: EVERY_DECK,
  priority: 190,
  create: createSearchBlockerModule,
});
// ...and what each deck wants out of its own searches, which is the larger half
// of the same decision: the answer turns on which card *this* deck most wants
// to draw, and no rule about costs or keywords can supply that.
//
// One module per deck, `search:<slug>`, so each table is measurable on its own.
// `search-values.ts` holds the registered tables and the decks that have none.
for (const table of searchValueModules()) {
  registerPolicy({ deck: table.leader, create: table.create });
}
// The one format fundamental that `decide`s rather than ranking. It has to:
// the choice it overrides -- block at all, versus pass -- is made inside
// `chooseGenericBlock`, and `pass` is never vetoable on its own, so no
// rank/veto contribution can reach it. Priority sits below the rest of this
// band so a fundamental that merely narrows the option set still runs first.
registerPolicy({
  deck: EVERY_DECK,
  priority: 193,
  create: createFreeBlockModule,
});
// The other half of the block window, and the case `free-block`'s comment
// assumed `chooseGenericBlock` already got right. Below the rest of the
// fundamentals band so the free block is settled first: the two are mutually
// exclusive by their gates (one needs a Blocker that survives, the other needs
// every Blocker to die), and ordering them makes that independent of the gates
// staying disjoint.
registerPolicy({
  deck: EVERY_DECK,
  priority: 189,
  create: createCounterOverDyingBlockModule,
});
// DON!! sequencing across action types, which no `rank` rule can express: the
// order of plays against attachments is fixed inside `chooseGenericRules`, so
// the claim has to be a veto. See the module for how far apart the three pilots
// are on it.
registerPolicy({
  deck: EVERY_DECK,
  priority: 188,
  create: createAuraAttachmentModule,
});
// Attack ordering, which two deck policies had written for themselves and the
// format layer did not have at all. See the module for the claim and its
// measurement.
registerPolicy({
  deck: EVERY_DECK,
  priority: 187,
  create: createAttackOrderModule,
});
// A `[When Attacking]` clause resolves on declaration, so the ladder's
// `viableAttacks` filter -- which asks only whether the battle can be won --
// declines free value. Overrides `pass` alone; see the module for the price of
// resting a Character.
registerPolicy({
  deck: EVERY_DECK,
  priority: 187,
  create: createClauseSwingModule,
});
// `own-board-removal`'s sibling for the same printed text reached through the
// mechanic DSL, where the pilot picks a side before it picks a card. Decides
// rather than ranks, and only when both sides are on offer; see the module for
// why the veto above cannot reach it.
registerPolicy({
  deck: EVERY_DECK,
  priority: 186,
  create: createGloriosaBottomModule,
});
// Counter-threshold DON!! allocation is registered for ST35 only, not
// format-wide: Sabo's `[DON!! x1]` aura rewards crossing a threshold, and
// every other deck either gains nothing from it or, like Kid, has its own
// reason for Leader power that the rule would override.
registerPolicy({
  deck: LEADERS.ST35,
  priority: 199,
  create: createDonThresholdModule,
});
// This deck's DON!! looks under-spent on power -- 10% of it, where a human
// piloting the same list spent 42% -- and that is not the fault it reads as.
// `dead-attachment` keeps DON!! off a Character that cannot win a battle, and
// DON!! left active into the opponent's turn is the only DON!! a [Counter]
// Event can be paid with. This deck runs four 1-cost [Counter] Events and
// `counter-event-reserve` fires for it, so the surplus is reserved rather than
// wasted.

// The archetype strategy layer. Registered after the format fundamentals and
// before every deck policy, which is also the order the three layers refine each
// other in. See `docs/proposals/archetype-strategy-layer.md`.
registerStrategyProfiles();

// The DON!! ramp plan, which cuts across the archetype tree: Kaido is control,
// Enel is aggro, and all three purple decks trade DON!! for tempo.
// `strategy/ramp.ts` holds the rules; each is measurable alone with
// `pnpm deck:ab --deck <id> --disable ramp#<rule>`.
//
// `free-ramp-first` generalises what was Kaido's card-specific
// `king-ramp-first`. For Enel the rule fires only on an empty board, so in
// practice it is Kaido's rule shared out to the seats that can also use it.
//
// (Purple) Sengoku is the fourth purple ramp deck and is deliberately not in
// this list, which is worth saying because `ramp.ts` promises a fourth deck
// the rules for free. `free-ramp-first` needs an activation costing nothing, and
// every activation in that fifty has a price the engine reports: Kuzan's and
// Marineford's `returnsDon: 1`, the Leader's `returnsDon: 8`, Sakazuki's
// `restsDon: 1`. The rule could never fire there, and registering it would buy
// the deck one more row in `pnpm census`'s never-reached list. What Sakazuki
// needs is the same claim with a price on it, which `op16-sengoku-policy.ts`
// carries as `net-ramp-first` -- written against the same metadata, and the
// note there says what it would take to move it here.
for (const leader of [LEADERS.KAIDO, LEADERS.ENEL, LEADERS.ST34]) {
  registerDeckRules(leader, "ramp", RAMP_RULES);
}

// The opening hand, one module per deck. `mulligan.ts` explains why the
// predicate stays in the deck's own file rather than being shared. The decks
// still on the generic keep are listed there, held to a ratchet by
// `test/mulligan.test.ts`.
registerPolicy({
  deck: LEADERS.ST31,
  priority: MULLIGAN_PRIORITY,
  create: createSt31MulliganModule,
});
registerPolicy({
  deck: LEADERS.ST32,
  priority: MULLIGAN_PRIORITY,
  create: createSt32MulliganModule,
});
registerPolicy({
  deck: LEADERS.ST33,
  priority: MULLIGAN_PRIORITY,
  create: createSt33MulliganModule,
});
registerPolicy({
  deck: LEADERS.ST34,
  priority: MULLIGAN_PRIORITY,
  create: createSt34MulliganModule,
});
// Both Sabo lists, each gated on the cards it can see. This is the pair the
// gate exists for: either rule applied to the other deck mulligans every
// opening hand. See `isElbaphSaboList` in `op13-sabo-policy.ts`.
registerPolicy({
  deck: LEADERS.ST35,
  priority: MULLIGAN_PRIORITY,
  create: createSt35MulliganModule,
});
registerPolicy({
  deck: LEADERS.ST35,
  priority: MULLIGAN_PRIORITY,
  create: createOp13SaboMulliganModule,
});
registerPolicy({
  deck: LEADERS.ST36,
  priority: MULLIGAN_PRIORITY,
  create: createSt36MulliganModule,
});
registerPolicy({
  deck: LEADERS.OP16_LUFFY,
  priority: MULLIGAN_PRIORITY,
  create: createOp16LuffyMulliganModule,
});
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  priority: MULLIGAN_PRIORITY,
  create: createOp14MihawkMulliganModule,
});
registerPolicy({
  deck: LEADERS.KAIDO,
  priority: MULLIGAN_PRIORITY,
  create: createOp17KaidoMulliganModule,
});
// (Green/Yellow) Yamato. Its cheap slot is ten cards and only the four
// ST28-005 do anything on turn 1 -- the other six are a Counter Event and a
// 0-power Otama, which is exactly the hand the generic cost bound keeps and
// should not. `op06-yamato-policy.ts` records the prediction and the arm.
registerPolicy({
  deck: LEADERS.YAMATO,
  priority: MULLIGAN_PRIORITY,
  create: createOp06YamatoMulliganModule,
});
// The Leader's gift is a `choose` over Characters with `attach-don` inside,
// not a `give-rested-don`, so `rested-don-gift` never sees it and the two DON!!
// went to the first body the engine listed. This deck's own ranking of the
// recipient, and the veto on ST28-004 cashing them for a [Rush] it does not
// need; `op06-yamato-policy.ts` has the reasoning for both.
registerPolicy({
  deck: LEADERS.YAMATO,
  priority: 191,
  create: createOp06YamatoGiftModule,
});
registerPolicy({
  deck: LEADERS.YAMATO,
  priority: 191,
  create: createOp06YamatoRushModule,
});
registerPolicy({
  deck: LEADERS.YAMATO,
  priority: 191,
  create: createOp06YamatoOtamaModule,
});
// The ladder develops before it attaches, so `don-threshold` only ever ranks
// the DON!! the turn's plays left over. This is the veto that makes its
// preference reachable, from a human win in the Bonney matchup that put 66%
// of its DON!! on power against the rules seat's 11%.
registerPolicy({
  deck: LEADERS.YAMATO,
  priority: 191,
  create: createOp06YamatoLoadLeaderModule,
});
// (Red) Edward.Newgate. The one list in the field with no cheap Character at
// all: everything costing 2 or less is a searcher or the [Counter] Event, and
// the cheapest body costs 3. `op17-newgate-policy.ts` records the arithmetic
// that made this look like the field's clearest mulligan gap and the arm that
// says how much of it was real.
registerPolicy({
  deck: LEADERS.NEWGATE,
  priority: MULLIGAN_PRIORITY,
  create: createOp17NewgateMulliganModule,
});
// (Purple/Yellow) Nico Robin. Eleven cards cost 2 or less and four of them are
// a [Counter] Event, which is the shape `mulligan.ts` says a cost bound cannot
// tell apart from a play. See `op09-robin-policy.ts`.
registerPolicy({
  deck: LEADERS.ROBIN,
  priority: MULLIGAN_PRIORITY,
  create: createOp09RobinMulliganModule,
});
// The two effect choices the deck answered by offer order: which [Trigger]
// card pays the Leader's ramp or OP17-109's draw, and which card OP16-119
// banks. One module per rule; see `ROBIN_RULES`.
registerDeckRules(LEADERS.ROBIN, "op09-robin", ROBIN_RULES);
// ST-18 (Purple) Monkey.D.Luffy. Its cheap slot is fine -- a 1-cost search and
// a 2-cost body, both of which act -- and what the cost bound cannot see is
// the four copies of a 10-cost vanilla at the other end of the curve. See
// `st18-luffy-policy.ts`.
registerPolicy({
  deck: LEADERS.ST18_LUFFY,
  priority: MULLIGAN_PRIORITY,
  create: createSt18LuffyMulliganModule,
});
// The same deck's Leader activation, which is its whole engine and is
// mispiloted from both ends: the generic ladder develops before it activates,
// so the turn's DON!! is spent at the budget it had before the Leader added to
// it -- and it takes the Life-for-DON!! trade every turn it is offered,
// including the turn that empties the Life stack. `strategy/ramp.ts` does not
// reach the first of those, because its gate is a ramp that costs nothing.
// See `st18-luffy-policy.ts`.
for (const module of createSt18LuffyModules()) {
  registerPolicy({ deck: LEADERS.ST18_LUFFY, create: () => module });
}
// ST-26 (Purple/Black) Monkey.D.Luffy. The deck has no Character costing 2 or
// less at all, so the generic cost bound keeps precisely the hands that cannot
// act. See `st26-luffy-policy.ts`.
registerPolicy({
  deck: LEADERS.ST26_LUFFY,
  priority: MULLIGAN_PRIORITY,
  create: createSt26LuffyMulliganModule,
});
// ST-27 (Black) Marshall.D.Teach. Twenty of its fifty cards cost 2 or less, so
// the generic cost bound keeps nearly every hand -- and three of those five
// cheap slots are 0-power utility or a Stage, so what it keeps on is not a
// board. See `st27-teach-policy.ts`.
registerPolicy({
  deck: LEADERS.ST27_TEACH,
  priority: MULLIGAN_PRIORITY,
  create: createSt27TeachMulliganModule,
});
// The same deck's Leader activation. It is repeatable, costs no DON!! and so is
// offered at every Main-phase decision; the generic ladder took it 9.4 times a
// game, trashing more cards than the deck played. See `st27-teach-policy.ts`.
for (const module of createSt27TeachModules()) {
  registerPolicy({ deck: LEADERS.ST27_TEACH, create: () => module });
}
// The other half of the same clause: once the seat has decided to pay, the
// engine asks which card, and that half was answered as "the first option
// offered" -- hand order -- over a hand holding both 1-cost searchers and a
// 10-cost finisher. See `st27-teach-policy.ts`.
registerPolicy({
  deck: LEADERS.ST27_TEACH,
  create: () => decideModule("st27-teach-pitch", createSt27TeachPitchPolicy()),
});
// And the deck's last wholly unpiloted surface: `pnpm census` reads its
// `counter:counter` at 2.91 decisions a game and 100.0% no rule, answered by a
// generic fallback whose protected-card set is empty. See
// `st27-teach-policy.ts`.
registerPolicy({
  deck: LEADERS.ST27_TEACH,
  create: () =>
    decideModule("st27-teach-defense", createSt27TeachDefensePolicy()),
});
// The same deck's DON!!-return count. Its Leader refunds two DON!! for a return
// of "2 or more" and the deck is ten cards built to trigger that, but the
// generic ladder answers the count prompt with the first option offered, which
// is the printed floor of one -- the one count the refund cannot answer. See
// `st26-luffy-policy.ts`.
for (const module of createSt26LuffyModules()) {
  registerPolicy({ deck: LEADERS.ST26_LUFFY, create: () => module });
}
// The same deck's defence, which is the whole deck: `pnpm census` reads its
// `block:resolve-effect` at 10.00 decisions per game and 100.0% no rule, the
// largest unpiloted surface in the catalog, and every one of those decisions
// is the Leader trading a card for +4000. The generic ladder takes the offer
// every time. See `op17-newgate-policy.ts`.
registerPolicy({
  deck: LEADERS.NEWGATE,
  create: () =>
    decideModule("op17-newgate-defense", createOp17NewgateDefensePolicy()),
});
// (Purple) Sengoku's own plan. The generic ladder answers the Main phase with
// "develop the highest-cost legal card" before it looks at activations, so the
// Leader's eight-DON!! payoff -- the reason the fifty is built this way -- is
// offered every turn and never taken. See `op16-sengoku-policy.ts`.
registerDeckRules(LEADERS.SENGOKU, "op16-sengoku", OP16_SENGOKU_RULES);
// Its Counter step: the generic arithmetic told which cards are the ramp and
// what an Admiral is worth. See `createOp16SengokuDefensePolicy`.
registerPolicy({
  deck: LEADERS.SENGOKU,
  create: () =>
    decideModule("op16-sengoku-defense", createOp16SengokuDefensePolicy()),
});
// (Yellow) Charlotte Linlin. Its Leader's [When Attacking] is the deck's whole
// decision surface -- `pnpm census` reads 20.2 of its 32.6 `main:resolve-effect`
// decisions a game from OP17-099 alone, with 94.1% of the surface unruled -- and
// the generic ladder takes the optional trash every time and pays it with hand
// order. See `op17-linlin-policy.ts`.
registerDeckRules(LEADERS.LINLIN, "op17-linlin", LINLIN_RULES);
// And where that deck's spare DON!! goes. Its five bodies are printed at 4000
// with the board limit reached by mid-game, so its Main phase is a pile of
// unspendable DON!! and a Leader that takes every card of it by offer order --
// a 14000 Leader swinging into a 6000 body while four 4000s sit at printed
// power. Registered for this Leader alone while it is measured: a DON!! moved
// off the Leader is a trade, and a deck whose Leader carries its plan prices it
// the other way. See `createKoReachAttachmentModule` in `format-heuristics.ts`.
registerPolicy({
  deck: LEADERS.LINLIN,
  priority: 199,
  create: createKoReachAttachmentModule,
});
// And its Counter phase, which `pnpm census` reads at 2.94 decisions a game
// with 100.0% no rule at all. See `op17-linlin-policy.ts`.
registerPolicy({
  deck: LEADERS.LINLIN,
  create: () =>
    decideModule("op17-linlin-counter", createOp17LinlinCounterPolicy()),
});
// (Red/Green) Krieg's Counter phase, which `pnpm census` reads at 3.15
// decisions a game with 100.0% no rule at all -- the deck's largest wholly
// unpiloted surface. See `op15-krieg-policy.ts`.
registerPolicy({
  deck: LEADERS.KRIEG,
  create: () =>
    decideModule("op15-krieg-counter", createOp15KriegCounterPolicy()),
});
// (Red/Blue) Lucy's own Leader clause, which `pnpm census` reads as the
// largest unpiloted surface of the least-piloted deck in the catalog: the
// offer to trash Events out of hand for +1000 opens on every attack either
// player declares, and the generic ladder takes it every time and then takes
// it again until the hand is gone. See `op15-lucy-policy.ts`.
registerPolicy({
  deck: LEADERS.LUCY,
  create: () => decideModule("op15-lucy-pitch", createOp15LucyPitchPolicy()),
});
// The same clause one card over: OP15-057 Dressrosa Kingdom asks the same hand
// for the same kind of card on the same window, for 2000 instead of 1000, and
// the ladder answered it the same way. See `op15-lucy-policy.ts`.
registerPolicy({
  deck: LEADERS.LUCY,
  create: () => decideModule("op15-lucy-stage", createOp15LucyStagePolicy()),
});
// And the cast those Events are in the deck for. OP15-014 Bartolomeo and
// OP15-046 Sabo each activate one out of hand for nothing, and the ladder
// picked which one by hand order -- over a menu spanning a 1-cost dig and a
// 7-cost removal Event. See `op15-lucy-policy.ts`.
registerPolicy({
  deck: LEADERS.LUCY,
  create: () =>
    decideModule("op15-lucy-free-event", createOp15LucyFreeEventPolicy()),
});
// And the same deck's Counter phase, which the census reads at 2.03 decisions
// a game with 100.0% no rule at all -- an empty `protectedCards` set, so the
// seat lets the two bodies its Events are cast off die rather than spend a
// card. See `op15-lucy-policy.ts`.
registerPolicy({
  deck: LEADERS.LUCY,
  create: () =>
    decideModule("op15-lucy-counter", createOp15LucyCounterPolicy()),
});
// And the same deck's opening hand. Seven of its ten cards costing 1 or less
// are the three that replace themselves, and the rest of the fifty is Events
// that cannot be cast until a 4-cost body arrives to cast them -- which is the
// shape `mulligan.ts` says a keep predicate pays on. See
// `op15-lucy-policy.ts`.
registerPolicy({
  deck: LEADERS.LUCY,
  create: createOp15LucyMulliganModule,
});
// And the one claim from Bandai's own deck page the generic ladder can be
// taught: play the Stage early. "Develop the highest-cost legal card" loops
// until the DON!! is gone, so a 1-cost Stage that replaces itself was played on
// 37.5% of the turns it was legal. See `op15-lucy-policy.ts`.
registerPolicy({
  deck: LEADERS.LUCY,
  create: createOp15LucyStageFirstModule,
});
// And the three clauses that ask this hand to pay in cards -- Chinjao's
// `[On Play]`, OP15-054's draw-two-trash-one and Fire Fist's rider -- which the
// ladder paid with the first card offered. See `op15-lucy-policy.ts`.
registerPolicy({
  deck: LEADERS.LUCY,
  create: createOp15LucyHandPaymentModule,
});
// And whether Fire Fist's rider is paid at all: two cards for a K.O., taken by
// the ladder whether or not anything was at 0 power. See `op15-lucy-policy.ts`.
registerPolicy({
  deck: LEADERS.LUCY,
  create: () =>
    decideModule("op15-lucy-fire-fist", createOp15LucyFireFistPolicy()),
});
// And the Event that plays a body: OP15-054's first mode draws two and puts a
// cost-4 {Dressrosa} Character down for the same 4 DON!! the ladder was about
// to spend on that Character directly. See `op15-lucy-policy.ts`.
registerPolicy({
  deck: LEADERS.LUCY,
  create: createOp15LucyMementoLineModule,
});
// And the turn the opponent is on their last Life, which the ladder spends on
// the board while a Leader bigger than this deck's bodies goes unattacked. See
// `op15-lucy-policy.ts`.
registerPolicy({
  deck: LEADERS.LUCY,
  create: createOp15LucyPressModule,
});

// The two cards this deck spends on a gift the opponent's cost area cannot pay.
// Both clauses move a DON!! out of the opponent's *rested* pile, which is empty
// on the deck's own first turn and on every turn the opposing seat attached
// everything it drew. See `op15-krieg-policy.ts`.
registerPolicy({
  deck: LEADERS.KRIEG,
  create: createOp15KriegDeadGiftModule,
});

// And the same deck's one self-trashing activation, which the generic ladder
// takes on the turn the body arrives. See `op15-krieg-policy.ts`.
registerPolicy({
  deck: LEADERS.KRIEG,
  create: createOp15KriegJangoModule,
});
// Bandai's own guide for the deck, as an ordering inside the cost band the
// ladder has already chosen. See `op15-krieg-policy.ts`.
registerPolicy({
  deck: LEADERS.KRIEG,
  create: createOp15KriegJangoFirstModule,
});
// And the Leader's own [DON!! x1], which the format's `aura-attachment` cannot
// reach: its text gate reads "all of your Characters" and this clause debuffs
// all of theirs. See `op15-krieg-policy.ts`.
registerPolicy({
  deck: LEADERS.KRIEG,
  create: createOp15KriegAuraModule,
});
registerPolicy({
  deck: LEADERS.KRIEG,
  priority: MULLIGAN_PRIORITY,
  create: createOp15KriegMulliganModule,
});
// (Red/Green) Monkey.D.Luffy's Leader clause, which `pnpm census` reads as
// the deck's largest wholly unpiloted surface: every `block:resolve-effect`
// the seat is asked, 100% no rule at all. See `op13-luffy-policy.ts`.
registerPolicy({
  deck: LEADERS.OP13_LUFFY,
  create: () =>
    decideModule("op13-luffy-leader", createOp13LuffyLeaderPolicy()),
});
// And its Counter phase, which `pnpm census` reads at 2.24 decisions a game
// with 100.0% no rule at all. See `op13-luffy-policy.ts`.
registerPolicy({
  deck: LEADERS.OP13_LUFFY,
  create: () =>
    decideModule("op13-luffy-counter", createOp13LuffyCounterPolicy()),
});
// (Red/Green) Monkey.D.Luffy's opening hand. See `op13-luffy-policy.ts`.
registerPolicy({
  deck: LEADERS.OP13_LUFFY,
  priority: MULLIGAN_PRIORITY,
  create: createOp13LuffyMulliganModule,
});
// (Blue) Rebecca's DON!! attachments: the one rule of the aggro root that pays
// for this deck, registered on its own because the deck is unenrolled from the
// rest of the root. See `aggro-unenrolled` in `strategy/archetypes.ts`.
registerPolicy({
  deck: LEADERS.REBECCA,
  create: createDonThresholdModule,
});
// (Blue/Black) Usopp's opening hand. See `op10-usopp-policy.ts`.
registerPolicy({
  deck: LEADERS.BLUE_BLACK_USOPP,
  priority: MULLIGAN_PRIORITY,
  create: createOp10UsoppMulliganModule,
});
// Which {Dressrosa} cards Leo and Viola take, which card Leo's and Sabo's
// trashes give up, and Rebecca's reveal: all answered in hand order without
// them. See `op10-usopp-policy.ts`.
registerPolicy({
  deck: LEADERS.BLUE_BLACK_USOPP,
  create: createOp10UsoppSearchModule,
});
registerPolicy({
  deck: LEADERS.BLUE_BLACK_USOPP,
  create: createOp10UsoppDiscardModule,
});
registerPolicy({
  deck: LEADERS.BLUE_BLACK_USOPP,
  create: createOp10UsoppRebeccaModule,
});
// The Counter step, which defended none of the bodies the deck cannot replace.
registerPolicy({
  deck: LEADERS.BLUE_BLACK_USOPP,
  create: createOp10UsoppCounterModule,
});
// The rest costs: the Stage before the Leader, and none for nothing.
registerPolicy({
  deck: LEADERS.BLUE_BLACK_USOPP,
  create: createOp10UsoppRestStageModule,
});
registerPolicy({
  deck: LEADERS.BLUE_BLACK_USOPP,
  create: createOp10UsoppDeadRestModule,
});
// (Yellow) Monkey.D.Luffy's opening hand. See `op15-luffy-policy.ts`.
registerPolicy({
  deck: LEADERS.OP15_LUFFY,
  priority: MULLIGAN_PRIORITY,
  create: createOp15LuffyMulliganModule,
});
// (Blue) Rebecca's opening hand. See `op15-rebecca-policy.ts`.
registerPolicy({
  deck: LEADERS.REBECCA,
  priority: MULLIGAN_PRIORITY,
  create: createOp15RebeccaMulliganModule,
});
// (Blue) Rebecca's Leader swap, which the ladder fired at the first chance
// whatever it returned, and the two [Rush] costs it paid on turns the keyword
// bought nothing. See `op15-rebecca-policy.ts`.
registerPolicy({
  deck: LEADERS.REBECCA,
  create: createOp15RebeccaLeaderModule,
});
registerPolicy({
  deck: LEADERS.REBECCA,
  create: createOp15RebeccaOrlumbusModule,
});
registerPolicy({
  deck: LEADERS.REBECCA,
  create: createOp15RebeccaKyrosModule,
});
// (Blue) Rebecca's Counter phase, which `pnpm census` read as the deck's
// largest unruled surface. See `op15-rebecca-policy.ts`.
registerPolicy({
  deck: LEADERS.REBECCA,
  create: () =>
    decideModule("op15-rebecca-counter", createOp15RebeccaCounterPolicy()),
});
registerPolicy({
  deck: LEADERS.REBECCA,
  create: createOp15RebeccaFuelFirstModule,
});
// And the card a discard gives up, which the ladder answered by offer order.
registerPolicy({
  deck: LEADERS.REBECCA,
  create: createOp15RebeccaDiscardModule,
});
// (Black) Imu's opening hand, its Stage, its Leader's draw and OP13-082's
// board reset. See `op13-imu-policy.ts`.
registerPolicy({
  deck: LEADERS.IMU,
  priority: MULLIGAN_PRIORITY,
  create: createOp13ImuMulliganModule,
});
registerPolicy({
  deck: LEADERS.IMU,
  create: createOp13ImuThroneModule,
});
registerPolicy({
  deck: LEADERS.IMU,
  create: createOp13ImuLeaderModule,
});
registerPolicy({
  deck: LEADERS.IMU,
  create: createOp13ImuResetGateModule,
});
registerPolicy({
  deck: LEADERS.IMU,
  create: createOp13ImuResetHoldModule,
});
registerPolicy({
  deck: LEADERS.IMU,
  create: createOp13ImuThroneMarsModule,
});
registerPolicy({
  deck: LEADERS.IMU,
  create: createOp13ImuDiscardModule,
});
registerPolicy({
  deck: LEADERS.IMU,
  create: createOp13ImuIdleRemovalModule,
});
// (Green/Black) Brook's deck budget: the Leader and five of the fifty trash
// off the top of the deck, and the Leader only moves the deck-out loss to the
// end of the turn. See `op15-brook-policy.ts`.
registerPolicy({
  deck: LEADERS.BROOK,
  create: createOp15BrookDeckBudgetModule,
});
// Which card its three trash-reaching clauses take, and when OP15-032 Brook
// trashes itself for a set-active -- the deck's unruled effect surface.
registerPolicy({
  deck: LEADERS.BROOK,
  create: createOp15BrookTrashChoiceModule,
});
registerPolicy({
  deck: LEADERS.BROOK,
  create: createOp15BrookRestandModule,
});
registerPolicy({
  deck: LEADERS.BROOK,
  create: () =>
    decideModule("op15-brook-counter", createOp15BrookCounterPolicy()),
});
// (Red/Blue) Nefeltari Vivi's opening hand. See `eb03-vivi-policy.ts`.
registerPolicy({
  deck: LEADERS.VIVI,
  priority: MULLIGAN_PRIORITY,
  create: createEb03ViviMulliganModule,
});
// (Red/Blue) Nefeltari Vivi's Leader activation, which the ladder fired with
// nothing fresh on the board to take its [Rush]. See `eb03-vivi-policy.ts`.
registerPolicy({
  deck: LEADERS.VIVI,
  create: createEb03ViviLeaderModule,
});
// Marguerite's and Hina's bounce, which the ladder aimed at its own board.
registerPolicy({
  deck: LEADERS.VIVI,
  create: createEb03ViviBounceModule,
});
// OP13-012's dig and EB03-024's free play, taken first-offered.
registerPolicy({
  deck: LEADERS.VIVI,
  create: createEb03ViviSearchModule,
});
registerPolicy({
  deck: LEADERS.VIVI,
  create: () =>
    createHandCostOrderModule("eb03-vivi-discard", EB03_VIVI_DISCARD_ORDER),
});
// (Red) Trafalgar Law's opening hand. See `op14-law-policy.ts`.
registerPolicy({
  deck: LEADERS.RED_LAW,
  priority: MULLIGAN_PRIORITY,
  create: createOp14LawMulliganModule,
});
// The Leader's base-power swap, which the ladder spent on two bodies that
// could both still attack.
registerPolicy({
  deck: LEADERS.RED_LAW,
  create: createOp14LawSwapModule,
});
// OP14-009's trash-two guard, which the ladder paid at any Life.
registerPolicy({
  deck: LEADERS.RED_LAW,
  create: createOp14LawGuardModule,
});
// (Green) Jinbe keeps the generic opening hand; see
// `DECKS_ON_THE_GENERIC_MULLIGAN`. Its Counter step is where the deck's
// decisions are: a hand of bodies the DON!! cannot cast is a hand of Counter
// cards, and the Leader's [End of Your Turn] asks for 6 or fewer.
// The one-card Leader save, and the Character saves beside it.
registerPolicy({
  deck: LEADERS.GREEN_JINBE,
  create: createOp11JinbeCounterModule,
});
registerPolicy({
  deck: LEADERS.GREEN_JINBE,
  create: createOp11JinbeDefendModule,
});
// (Blue/Purple) Sanji's opening hand. See `op12-sanji-policy.ts`.
registerPolicy({
  deck: LEADERS.BLUE_PURPLE_SANJI,
  priority: MULLIGAN_PRIORITY,
  create: createOp12SanjiMulliganModule,
});
// The Leader's [Activate: Main]: which Event its DON!! −1 activates, and
// whether there is one worth a DON!!.
registerPolicy({
  deck: LEADERS.BLUE_PURPLE_SANJI,
  create: createOp12SanjiEventModule,
});
registerPolicy({
  deck: LEADERS.BLUE_PURPLE_SANJI,
  create: createOp12SanjiGateModule,
});
// Which half of Boeuf Burst: the ladder takes the bounce with nothing to bounce.
registerPolicy({
  deck: LEADERS.BLUE_PURPLE_SANJI,
  create: createOp12SanjiBoeufModule,
});
// (Blue/Yellow) Boa Hancock's opening hand. See `op14-hancock-policy.ts`.
registerPolicy({
  deck: LEADERS.OP14_HANCOCK,
  priority: MULLIGAN_PRIORITY,
  create: createOp14HancockMulliganModule,
});
// (Blue) Jinbe's opening hand. See `op14-jinbe-policy.ts`.
registerPolicy({
  deck: LEADERS.OP14_JINBE,
  priority: MULLIGAN_PRIORITY,
  create: createOp14JinbeMulliganModule,
});
// (Blue) Jinbe's Leader gift, which the ladder paid for with the whole hand.
registerPolicy({
  deck: LEADERS.OP14_JINBE,
  create: createOp14JinbeLeaderModule,
});
// The card that pays for the gift and for Fisher Tiger's trim, which the
// ladder took in hand order and so spent the finishers first.
registerPolicy({
  deck: LEADERS.OP14_JINBE,
  create: () =>
    createHandCostOrderModule("op14-jinbe-pitch", OP14_JINBE_PITCH_ORDER),
});
// OP14-049's and OP14-058's bounce, which the ladder aimed at its own board.
registerPolicy({
  deck: LEADERS.OP14_JINBE,
  create: createOp14JinbeBounceModule,
});
// (Purple) Donquixote Doflamingo's opening hand. See
// `op14-doflamingo-policy.ts`.
registerPolicy({
  deck: LEADERS.OP14_DOFLAMINGO,
  priority: MULLIGAN_PRIORITY,
  create: createOp14DoflamingoMulliganModule,
});
// OP14-060's redirect, which the ladder paid for on every attack and pointed
// at whatever was offered first.
registerPolicy({
  deck: LEADERS.OP14_DOFLAMINGO,
  create: createOp14DoflamingoRedirectModule,
});
// Monet's [On K.O.] trash, which the ladder took in hand order and so spent
// the finisher as often as a spent searcher.
registerPolicy({
  deck: LEADERS.OP14_DOFLAMINGO,
  create: () =>
    createHandCostOrderModule(
      "op14-doflamingo-trash",
      OP14_DOFLAMINGO_TRASH_ORDER,
    ),
});
// OP14-069's choice of branch, which the ladder always took as the K.O.
registerPolicy({
  deck: LEADERS.OP14_DOFLAMINGO,
  create: createOp14DoflamingoFinisherModule,
});
// (Red/Purple) Gol.D.Roger's opening hand. See `op13-roger-policy.ts`.
registerPolicy({
  deck: LEADERS.RED_PURPLE_ROGER,
  priority: MULLIGAN_PRIORITY,
  create: createOp13RogerMulliganModule,
});
// (Black) Yamato's opening hand. See `op16-yamato-policy.ts`.
registerPolicy({
  deck: LEADERS.BLACK_YAMATO,
  priority: MULLIGAN_PRIORITY,
  create: createOp16YamatoMulliganModule,
});
// OP16-098's swap, which the ladder took before the 6-cost had attacked.
registerPolicy({
  deck: LEADERS.BLACK_YAMATO,
  create: createOp16YamatoSwapModule,
});
// OP16-098's own [On Play] trash, which the ladder left to hand order.
registerPolicy({
  deck: LEADERS.BLACK_YAMATO,
  create: createOp16YamatoSetupModule,
});
// An 8-cost Yamato cast from hand, where OP16-098 would play it with [Rush].
registerPolicy({
  deck: LEADERS.BLACK_YAMATO,
  create: createOp16YamatoHoldEightModule,
});
// The deck's choices of which card: what a trash play brings back, what
// OP16-097 recovers, and what Nami and Kin'emon keep. The ladder took each in
// offer order.
registerPolicy({
  deck: LEADERS.BLACK_YAMATO,
  create: createOp16YamatoReviveModule,
});
registerPolicy({
  deck: LEADERS.BLACK_YAMATO,
  create: createOp16YamatoRecoverModule,
});
registerPolicy({
  deck: LEADERS.BLACK_YAMATO,
  create: createOp16YamatoDigModule,
});
// OP16-098, which the generic Counter spent as a 1000 from hand.
registerPolicy({
  deck: LEADERS.BLACK_YAMATO,
  create: createOp16YamatoCounterPolicy,
});
// (Black) Crocodile's opening hand. See `op14-crocodile-policy.ts`.
registerPolicy({
  deck: LEADERS.BLACK_CROCODILE,
  priority: MULLIGAN_PRIORITY,
  create: createOp14CrocodileMulliganModule,
});
// The Leader's own [Activate: Main]: which body it K.O.s, and whether there is
// one worth K.O.ing. The ladder activated it whenever it was offered and took
// the first body in board order.
registerPolicy({
  deck: LEADERS.BLACK_CROCODILE,
  create: createOp14CrocodileFodderModule,
});
registerPolicy({
  deck: LEADERS.BLACK_CROCODILE,
  create: createOp14CrocodileGateModule,
});
// The Characters the generic Counter step let die rather than spend a card on.
registerPolicy({
  deck: LEADERS.BLACK_CROCODILE,
  create: createOp14CrocodileCounterPolicy,
});
// (Black/Yellow) Gecko Moria's opening hand. See `op14-moria-policy.ts`.
registerPolicy({
  deck: LEADERS.BLACK_YELLOW_MORIA,
  priority: MULLIGAN_PRIORITY,
  create: createOp14MoriaMulliganModule,
});
// The Leader's own [Activate: Main]: which body it K.O.s, and whether there is
// one worth K.O.ing.
registerPolicy({
  deck: LEADERS.BLACK_YELLOW_MORIA,
  create: createOp14MoriaFodderModule,
});
registerPolicy({
  deck: LEADERS.BLACK_YELLOW_MORIA,
  create: createOp14MoriaGateModule,
});
// The Leader's [When Attacking]: whether three cards from hand are worth a Life
// card.
registerPolicy({
  deck: LEADERS.BLACK_YELLOW_MORIA,
  create: createOp14MoriaBankModule,
});
// Which body the [Trigger]s, Dr. Hogback and the Gecko Morias play back.
registerPolicy({
  deck: LEADERS.BLACK_YELLOW_MORIA,
  create: createOp14MoriaRevivalModule,
});
// The Characters the generic Counter step let die rather than spend a card on.
registerPolicy({
  deck: LEADERS.BLACK_YELLOW_MORIA,
  create: createOp14MoriaCounterPolicy,
});
// (Black/Yellow) Koala's opening hand. See `op12-koala-policy.ts`.
registerPolicy({
  deck: LEADERS.BLACK_YELLOW_KOALA,
  priority: MULLIGAN_PRIORITY,
  create: createOp12KoalaMulliganModule,
});
// Nico Robin's [On Play], paid only when it can make the opponent discard.
registerPolicy({
  deck: LEADERS.BLACK_YELLOW_KOALA,
  create: createOp12KoalaRobinModule,
});
// The cost-8 bodies the Leader's draw counts, defended in the Counter step.
registerPolicy({
  deck: LEADERS.BLACK_YELLOW_KOALA,
  create: createOp12KoalaCounterPolicy,
});
// (Green/Purple) Monkey.D.Luffy's opening hand. See `eb02-luffy-policy.ts`.
registerPolicy({
  deck: LEADERS.GREEN_PURPLE_LUFFY,
  priority: MULLIGAN_PRIORITY,
  create: createEb02LuffyMulliganModule,
});
// The same deck's in-game rules. See `eb02-luffy-policy.ts`.
for (const module of createEb02LuffyModules()) {
  registerPolicy({ deck: LEADERS.GREEN_PURPLE_LUFFY, create: () => module });
}
// Sanji & Pudding and EB02-061 Luffy, defended in the Counter step.
registerPolicy({
  deck: LEADERS.GREEN_PURPLE_LUFFY,
  create: createEb02LuffyCounterPolicy,
});
// (Green/Yellow) Shirahoshi's opening hand. See `op11-shirahoshi-policy.ts`.
registerPolicy({
  deck: LEADERS.GREEN_YELLOW_SHIRAHOSHI,
  priority: MULLIGAN_PRIORITY,
  create: createOp11ShirahoshiMulliganModule,
});
// The Leader's play before any hard cast, and the body it plays.
registerPolicy({
  deck: LEADERS.GREEN_YELLOW_SHIRAHOSHI,
  create: createOp11ShirahoshiLeaderModule,
});
registerPolicy({
  deck: LEADERS.GREEN_YELLOW_SHIRAHOSHI,
  create: createOp11ShirahoshiLeaderPickModule,
});
// Otohime held until there is a face-up Life card for her [On Play] to pay with.
registerPolicy({
  deck: LEADERS.GREEN_YELLOW_SHIRAHOSHI,
  create: createOp11ShirahoshiOtohimeModule,
});
// Zeus's Life card paid only into a board with a K.O. target.
registerPolicy({
  deck: LEADERS.GREEN_YELLOW_SHIRAHOSHI,
  create: createOp11ShirahoshiZeusModule,
});
// No DON!! for a Leader that cannot attack.
registerPolicy({
  deck: LEADERS.GREEN_YELLOW_SHIRAHOSHI,
  create: createOp11ShirahoshiLeaderDonModule,
});
// (Blue/Purple) Vinsmoke Reiju's opening hand. See `op06-reiju-policy.ts`.
registerPolicy({
  deck: LEADERS.BLUE_PURPLE_REIJU,
  priority: MULLIGAN_PRIORITY,
  create: createOp06ReijuMulliganModule,
});
// Its DON!! parity sequencing and the hand-cost choices. One module per rule;
// see `OP06_REIJU_RULES`.
registerDeckRules(LEADERS.BLUE_PURPLE_REIJU, "op06-reiju", OP06_REIJU_RULES);
// (Green/Yellow) Nico Robin's opening hand. See `eb05-robin-policy.ts`.
registerPolicy({
  deck: LEADERS.GREEN_YELLOW_ROBIN,
  priority: MULLIGAN_PRIORITY,
  create: createEb05RobinMulliganModule,
});
// (Red/Black) Koby's opening hand. See `op11-koby-policy.ts`.
registerPolicy({
  deck: LEADERS.RED_BLACK_KOBY,
  priority: MULLIGAN_PRIORITY,
  create: createOp11KobyMulliganModule,
});
// Which body gets Hibari's and Aramaki's right to attack active Characters,
// which card pays a hand cost, where Kujyaku's +1000 lands, and when Aramaki
// is worth trashing. See `op11-koby-policy.ts`.
registerDeckRules(LEADERS.RED_BLACK_KOBY, "op11-koby", KOBY_RULES);
// The bodies worth a Counter card, and the ones too valuable to spend as one.
registerPolicy({
  deck: LEADERS.RED_BLACK_KOBY,
  create: createOp11KobyCounterPolicy,
});
// (Yellow) Vegapunk's opening hand. See `op07-vegapunk-policy.ts`.
registerPolicy({
  deck: LEADERS.YELLOW_VEGAPUNK,
  priority: MULLIGAN_PRIORITY,
  create: createOp07VegapunkMulliganModule,
});
// The Leader's [Activate: Main] before the hand is hard-cast.
registerPolicy({
  deck: LEADERS.YELLOW_VEGAPUNK,
  create: createOp07VegapunkLeaderFirstModule,
});
// Which {Egghead} card the Leader selects.
registerPolicy({
  deck: LEADERS.YELLOW_VEGAPUNK,
  create: createOp07VegapunkLeaderPickModule,
});
// The Leader's card goes face-up on Life rather than to the field.
registerPolicy({
  deck: LEADERS.YELLOW_VEGAPUNK,
  create: createOp07VegapunkLeaderModeModule,
});
// Which body the Egghead Stage sets active.
registerPolicy({
  deck: LEADERS.YELLOW_VEGAPUNK,
  create: createOp07VegapunkStageModule,
});
// Let a Leader hit through onto a banked [Trigger] body.
registerPolicy({
  deck: LEADERS.YELLOW_VEGAPUNK,
  create: createOp07VegapunkTakeTheTriggerModule,
});
// Which card the deck's searches take.
registerPolicy({
  deck: LEADERS.YELLOW_VEGAPUNK,
  create: createOp07VegapunkSearchModule,
});
// (Red/Blue) Portgas.D.Ace's opening hand. See `op13-ace-policy.ts`.
registerPolicy({
  deck: LEADERS.RED_BLUE_ACE,
  priority: MULLIGAN_PRIORITY,
  create: createOp13AceMulliganModule,
});
// The Leader's [On Your Opponent's Attack]: whether a card is worth −2000, and
// which card pays. See `op13-ace-policy.ts`.
registerDeckRules(LEADERS.RED_BLUE_ACE, "op13-ace", ACE_RULES);
// (Blue) Buggy's opening hand. See `op09-buggy-policy.ts`.
registerPolicy({
  deck: LEADERS.BLUE_BUGGY,
  priority: MULLIGAN_PRIORITY,
  create: createOp09BuggyMulliganModule,
});
// The Leader's [Activate: Main] before the hand is hard-cast.
registerPolicy({
  deck: LEADERS.BLUE_BUGGY,
  create: createOp09BuggyLeaderModule,
});
// Which body the Leader and the deck's other free plays put down.
registerPolicy({
  deck: LEADERS.BLUE_BUGGY,
  create: createOp09BuggyPlayPickModule,
});
// Which cards the deck's draw-and-trash and its costs spend.
registerPolicy({
  deck: LEADERS.BLUE_BUGGY,
  create: createOp09BuggyDiscardModule,
});
// The bodies the Leader paid for, defended in the Counter step.
registerPolicy({
  deck: LEADERS.BLUE_BUGGY,
  create: createOp09BuggyCounterPolicy,
});
// (Red) Silvers Rayleigh's opening hand. See `op12-rayleigh-policy.ts`.
registerPolicy({
  deck: LEADERS.RED_RAYLEIGH,
  priority: MULLIGAN_PRIORITY,
  create: createOp12RayleighMulliganModule,
});
// The two Events in hand the Leader's and five Characters' reveals need.
registerPolicy({
  deck: LEADERS.RED_RAYLEIGH,
  create: createOp12RayleighReserveModule,
});
// Boa Hancock's own [Activate: Main], which trashes her.
registerPolicy({
  deck: LEADERS.RED_RAYLEIGH,
  create: createOp12RayleighHancockModule,
});
// OP12-016 and OP12-019, held for the Counter step.
registerPolicy({
  deck: LEADERS.RED_RAYLEIGH,
  create: createOp12RayleighCounterEventsModule,
});
// What Shakuyaku, Hancock and Color of Observation Haki take off the deck.
registerPolicy({
  deck: LEADERS.RED_RAYLEIGH,
  create: createOp12RayleighSearchModule,
});
// The spare DON!! that makes one more small body connect. Above the aggro
// profile, whose `don-threshold` would otherwise hide the attachment.
registerPolicy({
  deck: LEADERS.RED_RAYLEIGH,
  priority: 175,
  create: createOp12RayleighReachModule,
});
// The Leader's swing in the turns the Events were cast for. Above
// `threat-removal`, whose `prefer` would otherwise hide the Leader hit.
registerEachCompiled(
  () => heuristicModules("op12-rayleigh-press", OP12_RAYLEIGH_PRESS_RULES),
  { deck: LEADERS.RED_RAYLEIGH, priority: 197.5 },
);
// (Purple/Yellow) Charlotte Pudding's opening hand. See `op08-pudding-policy.ts`.
registerPolicy({
  deck: LEADERS.PUDDING,
  priority: MULLIGAN_PRIORITY,
  create: createOp08PuddingMulliganModule,
});
// (Yellow) Enel's opening hand. See `op05-enel-policy.ts`.
registerPolicy({
  deck: LEADERS.YELLOW_ENEL,
  priority: MULLIGAN_PRIORITY,
  create: createOp05EnelMulliganModule,
});
// And the same deck's block window, one step earlier. Both sit between
// `free-block` (193) and `counter-over-dying-block` (189): the free block is
// still settled first, and what is left of that lower rule's states is the ones
// where keeping the body costs more than spending it. The payoff K.O. outranks
// the discount because it asks nothing of the Counter window. Scoped to this
// Leader while the claims are measured. See `format/defence.ts`.
registerPolicy({
  deck: LEADERS.KRIEG,
  priority: 192,
  create: createOp15KriegPayoffKoBlockModule,
});
registerPolicy({
  deck: LEADERS.KRIEG,
  priority: 191,
  create: createOp15KriegBlockDiscountModule,
});
// The other half of the same clause: once the offer is accepted the engine
// asks which card pays for it, and that half was answered as "the first option
// offered", which is hand order, over a hand holding both 1-cost Events and a
// 12000 finisher. It pays with the smallest body. Note
// that in this list Counter value is anti-correlated with card value, so
// "spend the least Counter" is the wrong reading of the same decision.
registerPolicy({
  deck: LEADERS.NEWGATE,
  create: () =>
    decideModule("op17-newgate-cost", createOp17NewgateCostPolicy()),
});
// And the deck's Counter phase. `chooseGenericCounter`'s protected set is
// empty by default, and for a battle over a Character that set is the whole
// test -- so an unpiloted seat lets every body die rather than spend a card,
// while this deck's Leader eats a card of that same hand every turn to keep
// the board it is not defending. See `op17-newgate-policy.ts`.
registerPolicy({
  deck: LEADERS.NEWGATE,
  create: () =>
    decideModule("op17-newgate-counter", createOp17NewgateCounterPolicy()),
});
// And the same deck's attacks. `threat-removal` stops preferring a K.O. over a
// Leader hit only when `lethalInRange` says the kill is on, and that field
// demands an opposing board with no Blocker at all -- so on the board where a
// Blocker has just blocked and rested itself, the removal it promotes is the
// seat's own Leader spending the swing that would have emptied the Life stack.
// See `createPressThroughBlockersModule` in `format-heuristics.ts`.
registerPolicy({
  deck: LEADERS.NEWGATE,
  priority: 197.5,
  create: createPressThroughBlockersModule,
});
// And OP17-007 Kouzuki Oden's free deploy, which is the deck's tempo turn and
// was answered as "the first option offered" -- hand order -- over a hand
// holding both 2000s and 6000s. See `op17-newgate-policy.ts`.
registerPolicy({
  deck: LEADERS.NEWGATE,
  create: () =>
    decideModule("op17-newgate-oden", createOp17NewgateOdenPolicy()),
});

// No deck currently has a matchup module against any other. What earns one is
// a claim true only of the opposing Leader's ability, and nothing in the
// current field has needed it; see
// `.claude/skills/audit-deck-policy/SKILL.md` section 6.
registerPolicy({
  deck: LEADERS.ST31,
  create: () => decideModule("st31", chooseSt31Rules),
});
// This deck keeps a `decide` scorer rather than the named `rank` rules the
// other ST decks use, and two things block the migration.
//
// The first is the deference gap `Heuristic.tier` records. `scorePlay` runs
// inside `decide`, so it chooses from what the wider layers already narrowed
// to; a `rank` rule sums with them instead, and there is no weight that means
// "defer to the archetype, then apply my table". This deck carries more
// archetype rules than any other -- the whole `aggro` -> `red-aggro` ->
// `red-aggro-luffy-st31` chain, eleven compiled modules, several of them
// ranking plays -- so it has the most to collide with.
//
// The second is a coupling the other decks do not have: `scorePlay` answers
// two different questions. The development step asks "which play is best", and
// `chooseExactCostPlay` asks "which play exactly spends the active DON!!",
// which is a curve claim that keeps the Leader attachment line alive. Moving
// the scorer into `rank` narrows the offered plays to the single best one, and
// that play is usually not the exact-cost one -- so the exact-cost line loses
// its ordering, and the alternatives are to duplicate the card knowledge into
// two places or to change what that step means.

registerPolicy({
  deck: LEADERS.ST32,
  create: () => decideModule("st32", createSt32RulesPolicy()),
});
// ST-32's play ordering. Only the play ordering: the rest of that deck's
// ladder is a cross-type sequencing claim, and no tier in `heuristics.ts` can
// express one. See `st32-policy.ts`.
registerDeckRules(LEADERS.ST32, "st32", ST32_PLAY_RULES);

registerPolicy({
  deck: LEADERS.ST33,
  create: () => decideModule("st33", createSt33RulesPolicy()),
});
// ST-33's play ordering, a twelve-entry card-number order with no board
// condition in it. The rest of that ladder is cross-type sequencing, including
// a Leader-attacks-first step that has to stay where it is. See #170.
registerDeckRules(LEADERS.ST33, "st33", ST33_PLAY_RULES);
registerPolicy({
  deck: LEADERS.ST34,
  create: () => decideModule("st34", createSt34RulesPolicy()),
});
// ST-34's play ordering, plus one rule about the finisher's `DON!! −4`. The
// rest of that ladder is a cost-guessing combo order and cross-type
// sequencing. #170.
registerDeckRules(LEADERS.ST34, "st34", ST34_PLAY_RULES);
// Both Sabo lists. Registration keys on the Leader and OP13-004 fronts two
// shipped decks -- the ST-35 Revolutionary Army starter and the OP-17 Elbaph
// list -- so both of these are offered for either seat and each one identifies
// its own deck from the cards it can see. `op13-sabo` needs no such gate: every
// rule in it names a card only the Elbaph list plays, so it is inert on ST-35.
// See `isElbaphSaboList` in `op13-sabo-policy.ts`.
// The gate is not belt and braces: OP13-004 fronts two shipped decks and
// `registerPolicy` keys on the Leader, so without it the *opponent* seat in an
// ST-35 mirror picks up ST-35's rules on top of `op13-sabo`'s. A deck policy
// scoped to a Leader that fronts two decks has to say which one it is; see
// `isElbaphSaboList`.
registerDeckRules(
  LEADERS.ST35,
  "st35",
  ST35_RULES,
  (context) => !isElbaphSaboList(context.observation),
);
registerPolicy({
  deck: LEADERS.ST35,
  create: () => decideModule("st35-defense", createSt35DefensePolicy()),
});
registerPolicy({
  deck: LEADERS.ST35,
  create: createOp13SaboDecideModule,
});
registerPolicy({
  deck: LEADERS.ST35,
  create: createOp13SaboRulesPolicy,
});
registerPolicy({
  deck: LEADERS.ST36,
  create: () => decideModule("st36", createSt36RulesPolicy()),
});
// Green/Blue Impel Down Luffy. Each rank module is registered on its own so
// `pnpm deck:ab --disable <id>` measures it alone. They sit above the deck
// policy because they exist to narrow what its ladder chooses from, and a
// `decide` module that has already answered cannot be narrowed afterwards.
//
// The load-bearing part of this deck's policy is the sequencing in its
// `decide` ladder -- pay costs, refund, pay again, and only then give DON!!
// away -- which follows from how the Leader's refund reads the rested pool.
// The header of `op16-luffy-policy.ts` states that engine.
registerDeckModules(
  LEADERS.OP16_LUFFY,
  [
    createOp16LuffyPrisonerModule,
    createOp16LuffyCrocodileModule,
    createOp16LuffyBoardModule,
  ],
  10,
);
// No rule here keeps Character names on the board unique, though OP16-034
// Monkey.D.Luffy and OP16-038 Let's Go!! To the Navy Headquarters!! both pay
// for diversity. `static-abilities.ts` implements OP16-034 as the size of the
// `Set` of names on the board, which the OP-16 official Q&A confirms is the
// printed reading: two copies of one name are not two different names, and a
// lone copy still counts itself for +1000. In this field OP16-034 is played
// as a trait-pure body that enables the Leader untap and absorbs an attack,
// and its clause is worth pursuing only once the policy attaches DON!! to it
// and swings it.
registerPolicy({
  deck: LEADERS.OP16_LUFFY,
  create: () => decideModule("op16-luffy", createOp16LuffyRulesPolicy()),
});
// Blue/Yellow Nami narrows what `chooseGenericRules` picks from rather than
// replacing it, and registers one module per named rule so each can be priced
// on its own. See `op16-nami-policy.ts`.
registerDeckRules(LEADERS.NAMI, "op16-nami", OP16_NAMI_RULES);
registerPolicy({
  deck: LEADERS.ENEL,
  create: createOp16EnelRulesPolicy,
});
// The Counter phase, which the heuristics module above cannot reach: `pass` is
// never vetoable and `chooseGenericCounter` answers this window by passing.
// `pnpm census` read 98.7% of 19,309 Counter decisions with no rule scoped to
// this deck. See `createOp16EnelDefensePolicy`.
registerPolicy({
  deck: LEADERS.ENEL,
  create: () =>
    decideModule("op16-enel-defense", createOp16EnelDefensePolicy()),
});
// The mulligan. `chooseGenericRules` keeps on "any card costs 2 or less", which
// twenty 0-cost Events satisfy, so this deck kept 120 of 120 hands. The keep
// that matters is a *Character* the early turns can pay for, because the
// Leader's activation is built one-per-Character and is not offered at all with
// an empty board. See `createOp16EnelMulliganModule`.
registerPolicy({
  deck: LEADERS.ENEL,
  priority: MULLIGAN_PRIORITY,
  create: createOp16EnelMulliganModule,
});
// The block window for an attack on a Character, which neither
// `chooseGenericBlock` nor the format's `free-block` reaches -- both open with
// `targetInstanceId.endsWith("-leader")`. See `createOp16EnelBlockPolicy`.
registerPolicy({
  deck: LEADERS.ENEL,
  create: () => decideModule("op16-enel-block", createOp16EnelBlockPolicy()),
});
// A `DON!! −N` Event cast with an empty cost area is paid from the DON!! the
// Leader just gave a Character, and `chooseGenericRules` fires every activation
// before its first attack -- so the gift was being cancelled before it swung.
// See `createOp16EnelGiftGuardModule`.
registerPolicy({
  deck: LEADERS.ENEL,
  create: createOp16EnelGiftGuardModule,
});
registerPolicy({
  deck: LEADERS.ENEL,
  create: createOp16EnelDonPostureModule,
});
registerPolicy({
  deck: LEADERS.ENEL,
  create: createOp16EnelCounterReserveModule,
});
// Holly, which the EU Championship 26-27 S1 list under this Leader runs and the
// feature deck does not: which body the gift goes to once one of them has
// [Double Attack]. Silent on a board without one. See
// `createOp16EnelDoubleAttackGiftModule`.
registerPolicy({
  deck: LEADERS.ENEL,
  create: createOp16EnelDoubleAttackGiftModule,
});
registerPolicy({
  deck: LEADERS.ENEL,
  create: createOp16EnelDoubleAttackDonModule,
});
// Black/Yellow Marshall.D.Teach is `rank`-only for the same reason Nami is: the
// rules it adds narrow what `chooseGenericRules` picks from. Its one genuinely
// new decision -- the Leader's redirect, which no other deck in the pool has an
// analogue for -- is scored rather than decided, so a trace still shows the
// generic policy making the choice between the candidates it left standing.
registerPolicy({
  deck: LEADERS.TEACH,
  create: createOp16TeachRulesPolicy,
});
// OP-17 Green Shanks, which until now had no policy of its own: every decision
// fell through to `chooseGenericRules`, and the two things that policy does
// with an unfamiliar activation -- fire the first one offered, answer a hand
// choice with the first card -- are both disasters for this Leader. See
// `op17-shanks-policy.ts` for the traced lines.
registerPolicy({
  deck: LEADERS.SHANKS,
  create: createOp17ShanksRulesPolicy,
});

// OP-16 Red Portgas.D.Ace, which had no policy of its own: the generic policy
// fired the Leader's Rush grant with nothing to unlock, took the wrong half of
// its printed "or", and paid OP16-015's cost against attacks 7000 cannot stop.
// See `op16-ace-policy.ts` for the traced lines.
registerPolicy({
  deck: LEADERS.OP16_ACE,
  create: createOp16AceRulesPolicy,
});
// The same deck's Counter phase, its largest wholly unpiloted surface: `pnpm
// census` reads `counter:counter` at 2.44 decisions a game and 100.0% no rule,
// answered by a generic fallback whose protected-card set is empty -- so the
// deck whose manifest calls cards in hand its whole defence never spent one on
// a body. See `op16-ace-policy.ts`.
registerPolicy({
  deck: LEADERS.OP16_ACE,
  create: () => decideModule("op16-ace-defense", createOp16AceDefensePolicy()),
});

// OP-17 Purple Kaido, which had no policy of its own. `chooseGenericRules`
// pilots a ramp deck backwards: it plays the highest-cost affordable card and
// only looks at `activate-main` once nothing is affordable, so over eleven
// traced turns the seat activated its ramp zero times. See
// `op17-kaido-policy.ts` for the trace.
registerPolicy({
  deck: LEADERS.KAIDO,
  create: createOp17KaidoRulesPolicy,
});
// Ahead of the defense policy and answering the same Counter decision with one
// number changed, so `deck:ab --disable op17-kaido-counter-horizon` leaves the
// shipped Counter policy standing as the control.
registerPolicy({
  deck: LEADERS.KAIDO,
  create: () =>
    decideModule(
      "op17-kaido-counter-horizon",
      createOp17KaidoCounterHorizonPolicy(),
    ),
});
registerPolicy({
  deck: LEADERS.KAIDO,
  create: () =>
    decideModule("op17-kaido-defense", createOp17KaidoDefensePolicy()),
});
// The same deck's DON!!-and-card economy, which Bandai's feature list needs and
// the guide list did not: eight of its clauses buy something with a DON!! off
// the field or a card out of hand, and the generic ladder takes every one of
// them. See `op17-kaido-policy.ts` for the fire-rate probe.
registerPolicy({
  deck: LEADERS.KAIDO,
  create: createOp17KaidoEconomyPolicy,
});
// The DON!! floor under the Leader's -2000, which `op17-kaido-defense` has no
// reading of: it asks only whether the 2000 changes the battle in front of it.
registerPolicy({
  deck: LEADERS.KAIDO,
  create: createOp17KaidoLeaderFloorPolicy,
});
// The two decisions a probe found this seat answering by first offer: which
// body OP17-061 free-plays, and the attack the Leader's -2000 would win that
// the ladder never declares. See `KAIDO_EFFECT_RULES`.
registerDeckRules(LEADERS.KAIDO, "op17-kaido-effects", KAIDO_EFFECT_RULES);
// The tournament list's Black Maria and Mamaragan, which spend DON!! on the
// field that the generic ladder spends whenever offered. See
// `KAIDO_FIELD_LIST_RULES`.
registerDeckRules(LEADERS.KAIDO, "op17-kaido-field", KAIDO_FIELD_LIST_RULES);
// ST-30 Red/Green Luffy & Ace. The generic policy declared ST30-012's
// Blocker-resting attack last, after the Blocker had already blocked. See
// `st30-luffy-ace-policy.ts`.
registerPolicy({
  deck: LEADERS.LUFFY_ACE,
  create: createSt30LuffyAceRulesPolicy,
});

// OP-17 Blue Rocks D. Xebec, in the same position Shanks was: no policy of its
// own, 79.0% of its decisions shaped by no rule at all. The specific fault is
// that its Leader is a 5000 body whose whole engine is `[When Attacking]`, and
// `chooseGenericRules` only declares attacks it can win -- so the engine sat
// idle for whole games. See `op17-xebec-policy.ts`.
// Eight registrations rather than one, so each is measurable on its own with
// `pnpm deck:ab --deck "(Blue) Rocks.D.Xebec - Official Feature Deck" --disable
// <id>`.
registerDeckModules(LEADERS.XEBEC, [
  createOp17XebecRulesPolicy,
  createOp17XebecCounterPolicy,
  createOp17XebecLethalPumpPolicy,
  createOp17XebecDefensiveTriggerPolicy,
  createOp17XebecDeployPolicy,
  createOp17XebecKeepPayoffPolicy,
  createOp17XebecTrashPolicy,
  createOp17XebecLockPolicy,
]);
registerPolicy({
  deck: LEADERS.XEBEC,
  priority: MULLIGAN_PRIORITY,
  create: createOp17XebecMulliganModule,
});
// OP-17 Black Luffy has no Main-phase policy of its own and does not need one
// yet: the generic ladder develops its giants first because they are its
// highest-cost legal plays. What it lacked was any defence of them -- the two
// windows that decide whether an attacked giant lives had no deck rule, and
// the format's rules never block for a Character or spend more than one 1000
// card on one. See `op17-luffy-policy.ts`. Two registrations so each is
// measurable alone with `pnpm deck:ab --deck "(Black) Monkey.D.Luffy - Official
// Feature Deck" --disable <id>`.
registerDeckModules(LEADERS.ELBAPH_LUFFY, [
  createOp17LuffyBlockPolicy,
  createOp17LuffyCounterPolicy,
]);
// Which hand card pays Sanji's, Nami's and Gerd's trash costs: the cheap Straw
// Hats the trash replays go first, the giants last. See
// `OP17_LUFFY_PITCH_ORDER`.
registerPolicy({
  deck: LEADERS.ELBAPH_LUFFY,
  create: () =>
    createHandCostOrderModule("op17-luffy-pitch", OP17_LUFFY_PITCH_ORDER),
});
registerPolicy({
  deck: LEADERS.LUFFY_ACE,
  priority: MULLIGAN_PRIORITY,
  create: createSt30LuffyAceMulliganModule,
});
// ST-22 Blue Ace & Newgate. Eighteen of its fifty cost 2 or less, so the
// generic cost bound keeps nearly every hand, and most of that cheap slot is
// text rather than a body that can attack. See `st22-ace-newgate-policy.ts`.
registerPolicy({
  deck: LEADERS.ST22_ACE_NEWGATE,
  priority: MULLIGAN_PRIORITY,
  create: createSt22AceNewgateMulliganModule,
});
// ST-23 Red Shanks. Twelve of its fifty cost 1, so the generic cost bound
// keeps nearly every hand, and that slot is text on 1000-to-2000 bodies
// rather than the 3-and-4-cost curve that carries its attacks. See
// `st23-shanks-policy.ts`.
registerPolicy({
  deck: LEADERS.ST23_SHANKS,
  priority: MULLIGAN_PRIORITY,
  create: createSt23ShanksMulliganModule,
});
// EB-04 Red/Yellow Jewelry Bonney. Its cheap slot is eight searchers and four
// Pacifista that are blank until 0 Life, so the generic cost bound keeps hands
// whose only early card cannot act -- the shape `mulligan.ts` records as the one
// a keep predicate pays on.
registerPolicy({
  deck: LEADERS.BONNEY,
  priority: MULLIGAN_PRIORITY,
  create: createEb04BonneyMulliganModule,
});
// The same deck's Counter window, which `pnpm census` reads at 4.37 decisions
// per game and **100.0% "no rule at all"** -- its largest fully unpiloted
// surface. Bandai's own page for the list says to gather Counter in hand
// "instead of needlessly defending" until Life is 1 or less; the generic policy
// does the opposite at 2 Life, because `mustPreventCurrentLeaderHit` widens to
// the refreshed board there. See the rule for the trace it was read off and for
// why the floor, not `facingLethal`, is the safety property.
registerPolicy({
  deck: LEADERS.BONNEY,
  create: createEb04BonneyLifeFloorModule,
});
// The block half of the same doctrine. `counter-over-dying-block` was passing
// this deck's blocks by promising the Counter line the rule above refuses --
// the false-promise shape `leaderCounterBudget` exists to prevent -- so the
// decline is stated here by the deck instead. Gated on the Blocker *dying*, so
// `free-block`'s surviving block is untouched.
//
// It fires rarely, and is here for the invariant rather than for a win: the
// life floor above must not rest on another module's false promise, and this
// is what makes repairing that module safe. See the rule for the dominance
// argument.
registerPolicy({
  deck: LEADERS.BONNEY,
  create: createEb04BonneyDyingBlockModule,
});
// Which card in hand pays a cost that trashes one. Shared code, registered for
// this Leader alone while it is measured: what a [Counter] card is worth
// against a body is the deck's own plan, so the exchange rate cannot be
// asserted format-wide on an argument -- section 6b of the audit playbook. The
// surface is this deck's largest by a wide margin (`main:resolve-effect`, 16.02
// decisions a game, 95.7% "no rule at all"), and the choice reaches a policy as
// a bare "Choose <name>" until `destinationOfChoice` labels it.
registerPolicy({
  deck: LEADERS.BONNEY,
  create: createHandCostChoiceModule,
});
// ST-30's Counter phase. See `st30-luffy-ace-policy.ts`.
registerPolicy({
  deck: LEADERS.LUFFY_ACE,
  create: createSt30LuffyAceDefenseModule,
});
// ST-29's pitch order: the [Counter] Events pay, the bodies stay. All three
// clauses that raise this decision are paid on the seat's own turn, where an
// Event is the one card in hand that cannot change the turn being played. The
// format module above reaches the opposite answer, because it prices a hand
// card by its printed Counter and an Event has none. See
// `st29-luffy-policy.ts`.
registerPolicy({
  deck: LEADERS.ST29_LUFFY,
  create: () => createHandCostOrderModule("st29-luffy-pitch", ST29_PITCH_ORDER),
});
// And the wall itself, on the turn it is about to matter. The two shared rules
// that price a body for the area limit both read EB04-056 Pacifista as a 1000,
// and each is right by its own terms -- the block is not available yet, and a
// duplicated name is usually worth less than the first copy. For a card whose
// only text is a [Blocker] at 0 Life, and which the list runs four of, both
// readings are inverted at 1 Life. See the rule for why this cannot be a format
// rule over `conditionalKeywords`.
registerPolicy({
  deck: LEADERS.BONNEY,
  create: createEb04BonneyWallModule,
});
registerPolicy({
  deck: LEADERS.SHANKS,
  priority: MULLIGAN_PRIORITY,
  create: createOp17ShanksMulliganModule,
});
registerPolicy({
  deck: LEADERS.OP16_ACE,
  priority: MULLIGAN_PRIORITY,
  create: createOp16AceMulliganModule,
});

// OP-14 Green Dracule Mihawk. Two registrations, so each half is measurable on
// its own with `pnpm deck:ab --disable <id>`.
//
// It keeps its `control` archetype layer from `registerStrategyProfiles` rather
// than moving to `control-unenrolled`: the deck policy is `rank`/`veto` plus a
// Counter-phase `decide`, so the archetype root still composes underneath it.
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOp14MihawkRulesPolicy,
});
// A note on the format-wide `counter-event-reserve`, which holds a seat's last
// DON!! active to pay for a [Counter] Event rather than attaching it for +1000
// power: it cannot be tuned per deck today. `resolveWithModules` collects
// vetoes from every applicable module and never removes one, so a
// Mihawk-scoped rule cannot lift a format-wide veto, and the only knob is that
// module's own gate. The reservation would have to move into
// `strategy/profile.ts`, where per-deck `StrategyParams` already exist, before
// "turn it down for this deck" is expressible at all.
//
// Note also that "has a [Main] clause" does not predict "will be spent before
// the Counter step", so a gate written on the card text does not generalise:
// OP-15 Enel casts its dual-purpose Events in the Main phase almost always,
// OP-17 Xebec holds them for the Counter step most of the time. That is a
// property of a deck's policy, not of its card text.

registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: () =>
    decideModule("op14-mihawk-defense", createOp14MihawkDefensePolicy()),
});
// The two decisions OP17-099 Charlotte Linlin's [When Attacking] hands to the
// seat it attacks. See `createOp14MihawkLinlinBranchModule`: a format claim,
// registered for this Leader alone while it is measured.
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOp14MihawkLinlinBranchModule,
});
// Three more, each from the same pair of human-won traces against the OP-17
// Sabo list, and each its own module so `pnpm deck:ab --disable <id>` prices
// it apart. See the doc comment on each in `op14-mihawk-policy.ts`.
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOp14MihawkLunaHoldModule,
});
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  priority: 199,
  create: createKoReachAttachmentModule,
});
// Behind `ko-reach-attachment` in the same window: that rule arms a body onto
// its target exactly, this one buys the thousand that puts the K.O. past one
// Counter card. Scoped here while it is measured.
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  priority: 199,
  create: createKoMarginAttachmentModule,
});
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOp14MihawkHandCostModule,
});
// Ahead of `op14-mihawk-defense` so an attack on a cost-5 body reaches the
// uncapped save first; every other Counter decision falls through to it.
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  priority: 1,
  create: createOp14MihawkBodySaveModule,
});
// Five more from human-piloted traces against this seat, each its own module
// so `pnpm deck:ab --disable <id>` prices it apart. See the doc comment on each
// in `op14-mihawk-policy.ts`.
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOp14MihawkOpeningHoldModule,
});
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOp14MihawkDeadRemovalModule,
});
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOp14MihawkReplayPickModule,
});
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOp14MihawkBlockerHomeModule,
});
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOp14MihawkRemovalPairingModule,
});
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOp14MihawkUnpaidRemovalModule,
});
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOp14MihawkLeaderSwingModule,
});
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOp14MihawkKinemonFirstModule,
});
// `createOneCardLifeSaveModule` is shared code in `format/defence.ts`, scoped
// here to one Leader while it is measured: it is a *trade* -- a card for a Life
// -- and the exchange rate belongs to a deck's curve, not to the rules. This
// deck's hand is four-of cost-5 bodies against a DON!! count that reaches 5 on
// turn 5, so a Counter card held is usually a card that was never castable.
registerPolicy({
  deck: LEADERS.OP14_MIHAWK,
  create: createOneCardLifeSaveModule,
});

// OP17 sealed (`"SEALED-LUFFY"`, `SEALED_LEADER` in `packages/decks`), which
// pilots both seats of every sealed game. It has no modules of its own: a
// sealed pool is a different 66+ cards every seed under a colourless wildcard
// Leader, so a claim worth making about it is usually a claim about the format
// and belongs in `format-heuristics.ts`. The one module that shipped here --
// Gloriosa's "bottom theirs, not yours" -- was exactly that, and is now
// registered for `EVERY_DECK` as `gloriosa-bottom-opponent`; a fixed deck
// running the same card made the same mistake.
//
// `pnpm sealed:heuristic:ab` (`tools/sealed-heuristic-ab.ts`) is how a
// candidate for this seat is measured: each seed's two pools are played twice,
// swapping which one the candidate module's seat pilots, so pool-strength
// asymmetry cancels the way first-player advantage does in
// `pnpm heuristic:ab`.

/**
 * Where a module sits in the hierarchy, narrowest first.
 *
 * `matchup` is one pairing, `deck` is one Leader's own policy, `strategy` is a
 * compiled archetype layer shared by several Leaders, `format` applies to every
 * deck. `generic` is not a scope: it is the absence of one, and belongs to
 * `chooseGenericRules` rather than to any registration.
 */
export type ModuleScope = "matchup" | "deck" | "strategy" | "format";

/**
 * The scope of every registered module, by id.
 *
 * Attribution recorded in a trace or a census is a bare `moduleId`, which says
 * which module decided but not how narrow its claim was -- and "this deck's
 * decisions are 90% format fundamentals" is a different finding from "90% its
 * own policy". Reading the scope back off the registration is the only way to
 * tell them apart without a second hand-maintained table to drift.
 *
 * Ids are unique per module rather than per registration, so a factory
 * registered for several Leaders reports one scope. Where the same id is
 * registered at two scopes the narrowest wins, which is the one that decided.
 */
export function moduleScopes(): Map<string, ModuleScope> {
  const rank: Record<ModuleScope, number> = {
    matchup: 0,
    deck: 1,
    strategy: 2,
    format: 3,
  };
  const scopes = new Map<string, ModuleScope>();
  for (const entry of registrations) {
    const { id } = entry.create();
    // The strategy layers register per Leader, so their registration reads as
    // deck-scoped. They are not: one profile pilots every Leader that shares an
    // archetype, and counting them as a deck's own policy is what would hide a
    // deck that has no policy of its own. The id prefix is the only thing that
    // distinguishes them, and `registerStrategyProfiles` owns it.
    const scope: ModuleScope = id.startsWith("strategy:")
      ? "strategy"
      : entry.deck === EVERY_DECK
        ? "format"
        : entry.opponent !== undefined
          ? "matchup"
          : "deck";
    const existing = scopes.get(id);
    if (existing === undefined || rank[scope] < rank[existing])
      scopes.set(id, scope);
  }
  return scopes;
}
