/**
 * One resolver per pending-effect kind, and the table `resolveEffect`
 * dispatches through.
 *
 * `resolveEffect` was 2,229 lines of `if (effect.kind === ...)`, in an order
 * that mattered in two places and nowhere said so. Those two are now local:
 * the shared `skip` answer lives in the K.O./rest resolver that was the only
 * kind able to reach it, and the fallthrough tail is registered under the kind
 * it always handled, `add-top-deck-to-life`.
 *
 * Keyed by every member of `PendingEffect`, so a new kind without a resolver
 * is a compile error rather than an effect that silently resolves to nothing.
 */
import {
  resolveKinemonCost,
  resolveP105LifeCost,
  resolveReduceCost,
  resolveSlaveArrowCost,
  resolveSt34GuessCost,
  resolveSt35AttackCost,
} from "./costs.js";
import {
  resolveBottomDeckCharacter,
  resolveDrawTrash,
  resolveNavySearch,
  resolveSearchTopFive,
} from "./deck.js";
import {
  resolveBadMannersCounter,
  resolveDiscardForLife,
  resolveNavyDiscard,
  resolveOpponentDiscard,
  resolveSt34Discard,
} from "./discards.js";
import { resolveGiveRestedDon, resolveReturnDon } from "./don.js";
import {
  resolveBorsalinoEndTurn,
  resolveKatakuriLeader,
  resolveKidLeaderEndTurn,
  resolveNamiLeader,
} from "./leaders.js";
import {
  resolveAddTopDeckToLife,
  resolveBegeLifeSwap,
  resolveMoveCharacterToLife,
  resolveTrashOpponentLife,
} from "./life.js";
import { resolveMechanicChoiceEffect } from "./mechanic-choice.js";
import {
  resolveFreePlay,
  resolveFreePlayRested,
  resolveReturnOwnForFreePlay,
} from "./plays.js";
import {
  resolveGatlingGun,
  resolveKoCharacter,
  resolveReducePower,
  resolveSetBasePowerZero,
  resolveSt34DonMinusKo,
} from "./removal.js";
import {
  resolveBattleKoReplacement,
  resolveCharacterAreaReplacement,
  resolveDamageReplacement,
  resolveHandTrashReplacement,
  resolveReplacementChoice,
} from "./replacements.js";
import {
  resolveGrantPrisonerBlocker,
  resolvePreventRefresh,
  resolvePreventRest,
  resolveRestOpponentCard,
  resolveSt34PowerBoost,
} from "./restrictions.js";
import type { EffectResolvers } from "./context.js";

export type {
  EffectContext,
  EffectResolver,
  EffectResolvers,
} from "./context.js";

export const EFFECT_RESOLVERS: EffectResolvers = {
  "add-top-deck-to-life": resolveAddTopDeckToLife,
  "bad-manners-counter": resolveBadMannersCounter,
  "battle-ko-replacement": resolveBattleKoReplacement,
  "bege-life-swap": resolveBegeLifeSwap,
  "borsalino-end-turn": resolveBorsalinoEndTurn,
  "bottom-deck-character": resolveBottomDeckCharacter,
  "character-area-replacement": resolveCharacterAreaReplacement,
  "damage-replacement": resolveDamageReplacement,
  "discard-for-life": resolveDiscardForLife,
  "discard-supernova-draw-two": resolveDiscardForLife,
  "draw-trash": resolveDrawTrash,
  "free-play": resolveFreePlay,
  "free-play-rested": resolveFreePlayRested,
  "gatling-gun": resolveGatlingGun,
  "give-rested-don": resolveGiveRestedDon,
  "grant-prisoner-blocker": resolveGrantPrisonerBlocker,
  "hand-trash-replacement": resolveHandTrashReplacement,
  "katakuri-leader": resolveKatakuriLeader,
  "kid-leader-end-turn": resolveKidLeaderEndTurn,
  "kinemon-cost": resolveKinemonCost,
  "ko-character": resolveKoCharacter,
  "mechanic-choice": resolveMechanicChoiceEffect,
  "move-character-to-life": resolveMoveCharacterToLife,
  "nami-leader": resolveNamiLeader,
  "navy-discard": resolveNavyDiscard,
  "navy-search": resolveNavySearch,
  "opponent-discard": resolveOpponentDiscard,
  "p105-life-cost": resolveP105LifeCost,
  "prevent-attack": resolveBottomDeckCharacter,
  "prevent-refresh": resolvePreventRefresh,
  "prevent-rest": resolvePreventRest,
  "reduce-cost": resolveReduceCost,
  "reduce-power": resolveReducePower,
  "replacement-choice": resolveReplacementChoice,
  "rest-character": resolveKoCharacter,
  "rest-opponent-card": resolveRestOpponentCard,
  "return-don": resolveReturnDon,
  "return-own-for-free-play": resolveReturnOwnForFreePlay,
  "search-top-five": resolveSearchTopFive,
  "set-base-power-zero": resolveSetBasePowerZero,
  "slave-arrow-cost": resolveSlaveArrowCost,
  "st34-discard": resolveSt34Discard,
  "st34-don-minus-ko": resolveSt34DonMinusKo,
  "st34-guess-cost": resolveSt34GuessCost,
  "st34-power-boost": resolveSt34PowerBoost,
  "st35-attack-cost": resolveSt35AttackCost,
  "trash-opponent-life": resolveTrashOpponentLife,
};
