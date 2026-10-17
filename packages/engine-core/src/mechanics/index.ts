/**
 * The twelve program registries, merged from one module per set.
 *
 * Adding a set means adding its module here; adding a card means editing only
 * that set's module. `card-mechanics.ts` reads the maps below and owns the
 * lookup and dispatch on top of them.
 */
import { formatMechanics } from "./format.js";
import { op07BattleMechanics } from "./op07-battle.js";
import { op07MainMechanics } from "./op07-main.js";
import { op07OnPlayMechanics } from "./op07-on-play.js";
import { op07ReplacementMechanics } from "./op07-replacements.js";
import { op07TriggerMechanics } from "./op07-triggers.js";
import { op08BattleMechanics } from "./op08-battle.js";
import { op08MainMechanics } from "./op08-main.js";
import { op08OnPlayMechanics } from "./op08-on-play.js";
import { op08ReplacementMechanics } from "./op08-replacements.js";
import { op08TriggerMechanics } from "./op08-triggers.js";
import { op09BattleMechanics } from "./op09-battle.js";
import { op09MainMechanics } from "./op09-main.js";
import { op09OnPlayMechanics } from "./op09-on-play.js";
import { op09ReplacementMechanics } from "./op09-replacements.js";
import { op09TriggerMechanics } from "./op09-triggers.js";
import { op10BattleMechanics } from "./op10-battle.js";
import { op10ReplacementMechanics } from "./op10-replacements.js";
import { op10TriggerMechanics } from "./op10-triggers.js";
import { op10MainMechanics } from "./op10-main.js";
import { op10OnPlayMechanics } from "./op10-on-play.js";
import { op11BattleMechanics } from "./op11-battle.js";
import { op11ReplacementMechanics } from "./op11-replacements.js";
import { op11TriggerMechanics } from "./op11-triggers.js";
import { op11MainMechanics } from "./op11-main.js";
import { op11OnPlayMechanics } from "./op11-on-play.js";
import { op12BattleMechanics } from "./op12-battle.js";
import { op12TriggerMechanics } from "./op12-triggers.js";
import { op12ReplacementMechanics } from "./op12-replacements.js";
import { op13BattleMechanics } from "./op13-battle.js";
import { offFieldReplacementMechanics } from "./op13-replacements.js";
import { op13TriggerMechanics } from "./op13-triggers.js";
import { op13MainMechanics } from "./op13-main.js";
import { op13OnPlayMechanics } from "./op13-on-play.js";
import { op12MainMechanics } from "./op12-main.js";
import { op12OnPlayMechanics } from "./op12-on-play.js";
import { op12RosinanteMechanics } from "./op12-rosinante.js";
import { op14BattleMechanics } from "./op14-battle.js";
import { op14ReplacementMechanics } from "./op14-replacements.js";
import { op14MainMechanics } from "./op14-main.js";
import { op14MihawkMechanics } from "./op14-mihawk.js";
import { op14OnPlayMechanics } from "./op14-on-play.js";
import { op14TriggerMechanics } from "./op14-triggers.js";
import { op15BattleMechanics } from "./op15-battle.js";
import { op15MainMechanics } from "./op15-main.js";
import { op15OnPlayMechanics } from "./op15-on-play.js";
import { op15TriggerMechanics } from "./op15-triggers.js";
import { op16EnelMechanics } from "./op16-enel.js";
import { op16AceMechanics } from "./op16-ace.js";
import { op16BattleMechanics } from "./op16-battle.js";
import { op16MainMechanics } from "./op16-main.js";
import { op16OnPlayMechanics } from "./op16-on-play.js";
import { op16TriggerMechanics } from "./op16-triggers.js";
import { replacementMechanics } from "./op16-replacements.js";
import { op16LuffyMechanics } from "./op16-luffy.js";
import { op16NamiMechanics } from "./op16-nami.js";
import { op16TeachMechanics } from "./op16-teach.js";
import { op17BattleMechanics } from "./op17-battle.js";
import { op17MainMechanics } from "./op17-main.js";
import { op17KaidoMechanics } from "./op17-kaido.js";
import { op17LuffyAceMechanics } from "./op17-luffy-ace.js";
import { op05BattleMechanics } from "./op05-battle.js";
import { op05MainMechanics } from "./op05-main.js";
import { op05OnPlayMechanics } from "./op05-on-play.js";
import { op05ReplacementMechanics } from "./op05-replacements.js";
import { op05TriggerMechanics } from "./op05-triggers.js";
import { op06BattleMechanics } from "./op06-battle.js";
import { op06MainMechanics } from "./op06-main.js";
import { op06OnPlayMechanics } from "./op06-on-play.js";
import { op06TriggerMechanics } from "./op06-triggers.js";
import { op06YamatoMechanics } from "./op06-yamato.js";
import { eb04BonneyMechanics } from "./eb04-bonney.js";
import { eb04OnPlayMechanics } from "./eb04-on-play.js";
import { eb04MainMechanics } from "./eb04-main.js";
import { eb04BattleMechanics } from "./eb04-battle.js";
import { eb04TriggerMechanics } from "./eb04-triggers.js";
import { eb04ReplacementMechanics } from "./eb04-replacements.js";
import { eb02OnPlayMechanics } from "./eb02-on-play.js";
import { eb02MainMechanics } from "./eb02-main.js";
import { eb02BattleMechanics } from "./eb02-battle.js";
import { eb02TriggerMechanics } from "./eb02-triggers.js";
import { eb01OnPlayMechanics } from "./eb01-on-play.js";
import { eb01MainMechanics } from "./eb01-main.js";
import { eb01BattleMechanics } from "./eb01-battle.js";
import { eb01TriggerMechanics } from "./eb01-triggers.js";
import { eb01ReplacementMechanics } from "./eb01-replacements.js";
import { prb02OnPlayMechanics } from "./prb02-on-play.js";
import { prb02BattleMechanics } from "./prb02-battle.js";
import { prb02ReplacementMechanics } from "./prb02-replacements.js";
import { prb02TriggerMechanics } from "./prb02-triggers.js";
import { eb03OnPlayMechanics } from "./eb03-on-play.js";
import { eb03MainMechanics } from "./eb03-main.js";
import { eb03BattleMechanics } from "./eb03-battle.js";
import { eb03TriggerMechanics } from "./eb03-triggers.js";
import { eb03ReplacementMechanics } from "./eb03-replacements.js";
import { op17MetaMechanics } from "./op17-meta.js";
import { op17OnPlayMechanics } from "./op17-on-play.js";
import { op17TriggerMechanics } from "./op17-triggers.js";
import { op17ReplacementMechanics } from "./op17-replacements.js";
import {
  registerEventMainPrograms,
  registerReplacementPrograms,
  registerWhenRestedCards,
} from "../mechanics.js";
import { mergeSetMechanics } from "./registry.js";
import {
  registerRemovalImmunities,
  registerStaticAbilities,
} from "../static-abilities.js";
import { registerReactionRules } from "../reaction-rules.js";
import { op07ReactionRules } from "./op07-reactions.js";
import { op12ReactionRules } from "./op12-reactions.js";
import { op10ReactionRules } from "./op10-reactions.js";
import { op11ReactionRules } from "./op11-reactions.js";
import { op13ReactionRules } from "./op13-reactions.js";
import { op16ReactionRules } from "./op16-reactions.js";
import { op14ReactionRules } from "./op14-reactions.js";
import { eb04ReactionRules } from "./eb04-reactions.js";
import { op09ReactionRules } from "./op09-reactions.js";
import { eb03ReactionRules } from "./eb03-reactions.js";
import { op08ReactionRules } from "./op08-reactions.js";
import { op06ReactionRules } from "./op06-reactions.js";
import { op15ReactionRules } from "./op15-reactions.js";
import { op05ReactionRules } from "./op05-reactions.js";
import { eb02ReactionRules } from "./eb02-reactions.js";
import { eb01ReactionRules } from "./eb01-reactions.js";
import { promoReactionRules } from "./promo-reactions.js";
import { st10ReactionRules } from "./st10-reactions.js";
import { op14StaticAbilities } from "./op14-static.js";
import { op10RemovalImmunities, op10StaticAbilities } from "./op10-static.js";
import { op11RemovalImmunities, op11StaticAbilities } from "./op11-static.js";
import { op17StaticAbilities } from "./op17-static.js";
import {
  promoRemovalImmunities,
  promoStaticAbilities,
} from "./promo-static.js";
import { op15RemovalImmunities, op15StaticAbilities } from "./op15-static.js";
import { op13RemovalImmunities, op13StaticAbilities } from "./op13-static.js";
import { op16StaticAbilities } from "./op16-static.js";
import { formatStaticAbilities } from "./format-static.js";
import { op12RemovalImmunities, op12StaticAbilities } from "./op12-static.js";
import { st21StaticAbilities } from "./st21-static.js";
import { st13StaticAbilities } from "./st13-static.js";
import { st15StaticAbilities } from "./st15-static.js";
import { op09RemovalImmunities, op09StaticAbilities } from "./op09-static.js";
import { st25StaticAbilities } from "./st25-static.js";
import { st30StaticAbilities } from "./st30-static.js";
import { st28StaticAbilities } from "./st28-static.js";
import { op06RemovalImmunities, op06StaticAbilities } from "./op06-static.js";
import { eb04RemovalImmunities, eb04StaticAbilities } from "./eb04-static.js";
import { eb03RemovalImmunities, eb03StaticAbilities } from "./eb03-static.js";
import { op08RemovalImmunities, op08StaticAbilities } from "./op08-static.js";
import { op05StaticAbilities } from "./op05-static.js";
import { st26StaticAbilities } from "./st26-static.js";
import { op04StaticAbilities } from "./op04-static.js";
import { st23StaticAbilities } from "./st23-static.js";
import { st19StaticAbilities } from "./st19-static.js";
import { prb02StaticAbilities } from "./prb02-static.js";
import { op07RemovalImmunities, op07StaticAbilities } from "./op07-static.js";
import { eb02StaticAbilities } from "./eb02-static.js";
import { eb01StaticAbilities } from "./eb01-static.js";
import { st16StaticAbilities } from "./st16-static.js";
import { st27StaticAbilities } from "./st27-static.js";
import { st29StaticAbilities } from "./st29-static.js";
import { st14RemovalImmunities, st14StaticAbilities } from "./st14-static.js";
import { st10StaticAbilities } from "./st10-static.js";
import { st18Mechanics } from "./st18.js";
import { op03Mechanics } from "./op03.js";
import { st23Mechanics } from "./st23.js";
import { st01Mechanics } from "./st01.js";
import { st10BattleMechanics } from "./st10-battle.js";
import { st10MainMechanics } from "./st10-main.js";
import { st10OnPlayMechanics } from "./st10-on-play.js";
import { st10TriggerMechanics } from "./st10-triggers.js";
import { st14BattleMechanics } from "./st14-battle.js";
import { st14MainMechanics } from "./st14-main.js";
import { st14OnPlayMechanics } from "./st14-on-play.js";
import { st14TriggerMechanics } from "./st14-triggers.js";
import { st29BattleMechanics } from "./st29-battle.js";
import { st29MainMechanics } from "./st29-main.js";
import { st29OnPlayMechanics } from "./st29-on-play.js";
import { st29ReplacementMechanics } from "./st29-replacements.js";
import { st29TriggerMechanics } from "./st29-triggers.js";
import { st30BattleMechanics } from "./st30-battle.js";
import { st30MainMechanics } from "./st30-main.js";
import { st30OnPlayMechanics } from "./st30-on-play.js";
import { st30ReplacementMechanics } from "./st30-replacements.js";
import { st30TriggerMechanics } from "./st30-triggers.js";
import { st21BattleMechanics } from "./st21-battle.js";
import { st21MainMechanics } from "./st21-main.js";
import { st21TriggerMechanics } from "./st21-triggers.js";
import { st21Mechanics } from "./st21.js";
import { st22BattleMechanics } from "./st22-battle.js";
import { st22MainMechanics } from "./st22-main.js";
import { st22OnPlayMechanics } from "./st22-on-play.js";
import { st22ReplacementMechanics } from "./st22-replacements.js";
import { st22TriggerMechanics } from "./st22-triggers.js";
import { promoBattleMechanics } from "./promo-battle.js";
import { promoMainMechanics } from "./promo-main.js";
import { promoOnPlayMechanics } from "./promo-on-play.js";
import { promoReplacementMechanics } from "./promo-replacements.js";
import { promoTriggerMechanics } from "./promo-triggers.js";
import { st11Mechanics } from "./st11.js";
import { st12BattleMechanics } from "./st12-battle.js";
import { st12MainMechanics } from "./st12-main.js";
import { st12OnPlayMechanics } from "./st12-on-play.js";
import { st12TriggerMechanics } from "./st12-triggers.js";
import { st13MainMechanics } from "./st13-main.js";
import { st13OnPlayMechanics } from "./st13-on-play.js";
import { st13TriggerMechanics } from "./st13-triggers.js";
import { st15Mechanics } from "./st15.js";
import { st16Mechanics } from "./st16.js";
import { st17Mechanics } from "./st17.js";
import { st19Mechanics } from "./st19.js";
import { st20Mechanics } from "./st20.js";
import { st24Mechanics } from "./st24.js";
import { st25Mechanics } from "./st25.js";
import { st26Mechanics } from "./st26.js";
import { op04Mechanics } from "./op04.js";
import { st27Mechanics } from "./st27.js";
import { stMainMechanics } from "./st-main.js";

const registries = mergeSetMechanics([
  { name: "format", mechanics: formatMechanics },
  { name: "st18", mechanics: st18Mechanics },
  { name: "op03", mechanics: op03Mechanics },
  { name: "st23", mechanics: st23Mechanics },
  { name: "st01", mechanics: st01Mechanics },
  { name: "st10-on-play", mechanics: st10OnPlayMechanics },
  { name: "st10-main", mechanics: st10MainMechanics },
  { name: "st10-battle", mechanics: st10BattleMechanics },
  { name: "st10-triggers", mechanics: st10TriggerMechanics },
  { name: "st14-on-play", mechanics: st14OnPlayMechanics },
  { name: "st14-main", mechanics: st14MainMechanics },
  { name: "st14-battle", mechanics: st14BattleMechanics },
  { name: "st14-triggers", mechanics: st14TriggerMechanics },
  { name: "st29-on-play", mechanics: st29OnPlayMechanics },
  { name: "st29-main", mechanics: st29MainMechanics },
  { name: "st29-battle", mechanics: st29BattleMechanics },
  { name: "st29-triggers", mechanics: st29TriggerMechanics },
  { name: "st29-replacements", mechanics: st29ReplacementMechanics },
  { name: "st30-on-play", mechanics: st30OnPlayMechanics },
  { name: "st30-main", mechanics: st30MainMechanics },
  { name: "st30-battle", mechanics: st30BattleMechanics },
  { name: "st30-triggers", mechanics: st30TriggerMechanics },
  { name: "st30-replacements", mechanics: st30ReplacementMechanics },
  { name: "st21", mechanics: st21Mechanics },
  { name: "st21-main", mechanics: st21MainMechanics },
  { name: "st21-battle", mechanics: st21BattleMechanics },
  { name: "st21-triggers", mechanics: st21TriggerMechanics },
  { name: "st22-on-play", mechanics: st22OnPlayMechanics },
  { name: "st22-main", mechanics: st22MainMechanics },
  { name: "st22-battle", mechanics: st22BattleMechanics },
  { name: "st22-triggers", mechanics: st22TriggerMechanics },
  { name: "st22-replacements", mechanics: st22ReplacementMechanics },
  { name: "promo-on-play", mechanics: promoOnPlayMechanics },
  { name: "promo-main", mechanics: promoMainMechanics },
  { name: "promo-battle", mechanics: promoBattleMechanics },
  { name: "promo-triggers", mechanics: promoTriggerMechanics },
  { name: "promo-replacements", mechanics: promoReplacementMechanics },
  { name: "st11", mechanics: st11Mechanics },
  { name: "st12-on-play", mechanics: st12OnPlayMechanics },
  { name: "st12-main", mechanics: st12MainMechanics },
  { name: "st12-battle", mechanics: st12BattleMechanics },
  { name: "st12-triggers", mechanics: st12TriggerMechanics },
  { name: "st13-on-play", mechanics: st13OnPlayMechanics },
  { name: "st13-main", mechanics: st13MainMechanics },
  { name: "st13-triggers", mechanics: st13TriggerMechanics },
  { name: "st15", mechanics: st15Mechanics },
  { name: "st16", mechanics: st16Mechanics },
  { name: "st17", mechanics: st17Mechanics },
  { name: "st19", mechanics: st19Mechanics },
  { name: "st20", mechanics: st20Mechanics },
  { name: "st24", mechanics: st24Mechanics },
  { name: "st25", mechanics: st25Mechanics },
  { name: "st26", mechanics: st26Mechanics },
  { name: "op04", mechanics: op04Mechanics },
  { name: "st27", mechanics: st27Mechanics },
  { name: "st-main", mechanics: stMainMechanics },
  { name: "op07-on-play", mechanics: op07OnPlayMechanics },
  { name: "op07-main", mechanics: op07MainMechanics },
  { name: "op07-battle", mechanics: op07BattleMechanics },
  { name: "op07-triggers", mechanics: op07TriggerMechanics },
  { name: "op07-replacements", mechanics: op07ReplacementMechanics },
  { name: "op08-on-play", mechanics: op08OnPlayMechanics },
  { name: "op08-main", mechanics: op08MainMechanics },
  { name: "op08-battle", mechanics: op08BattleMechanics },
  { name: "op08-triggers", mechanics: op08TriggerMechanics },
  { name: "op08-replacements", mechanics: op08ReplacementMechanics },
  { name: "op09-on-play", mechanics: op09OnPlayMechanics },
  { name: "op09-main", mechanics: op09MainMechanics },
  { name: "op09-battle", mechanics: op09BattleMechanics },
  { name: "op09-triggers", mechanics: op09TriggerMechanics },
  { name: "op09-replacements", mechanics: op09ReplacementMechanics },
  { name: "op10-on-play", mechanics: op10OnPlayMechanics },
  { name: "op10-main", mechanics: op10MainMechanics },
  { name: "op10-battle", mechanics: op10BattleMechanics },
  { name: "op10-triggers", mechanics: op10TriggerMechanics },
  { name: "op10-replacements", mechanics: op10ReplacementMechanics },
  { name: "op11-on-play", mechanics: op11OnPlayMechanics },
  { name: "op11-main", mechanics: op11MainMechanics },
  { name: "op11-battle", mechanics: op11BattleMechanics },
  { name: "op11-triggers", mechanics: op11TriggerMechanics },
  { name: "op11-replacements", mechanics: op11ReplacementMechanics },
  { name: "op12-on-play", mechanics: op12OnPlayMechanics },
  { name: "op12-main", mechanics: op12MainMechanics },
  { name: "op12-battle", mechanics: op12BattleMechanics },
  { name: "op12-triggers", mechanics: op12TriggerMechanics },
  { name: "op12-replacements", mechanics: op12ReplacementMechanics },
  { name: "op13-on-play", mechanics: op13OnPlayMechanics },
  { name: "op13-main", mechanics: op13MainMechanics },
  { name: "op13-battle", mechanics: op13BattleMechanics },
  { name: "op13-triggers", mechanics: op13TriggerMechanics },
  { name: "off-field-replacements", mechanics: offFieldReplacementMechanics },
  { name: "op12-rosinante", mechanics: op12RosinanteMechanics },
  { name: "op14-on-play", mechanics: op14OnPlayMechanics },
  { name: "op14-main", mechanics: op14MainMechanics },
  { name: "op14-battle", mechanics: op14BattleMechanics },
  { name: "op14-triggers", mechanics: op14TriggerMechanics },
  { name: "op14-replacements", mechanics: op14ReplacementMechanics },
  { name: "op14-mihawk", mechanics: op14MihawkMechanics },
  { name: "op15-on-play", mechanics: op15OnPlayMechanics },
  { name: "op15-main", mechanics: op15MainMechanics },
  { name: "op15-battle", mechanics: op15BattleMechanics },
  { name: "op15-triggers", mechanics: op15TriggerMechanics },
  { name: "op16-enel", mechanics: op16EnelMechanics },
  { name: "op16-on-play", mechanics: op16OnPlayMechanics },
  { name: "op16-main", mechanics: op16MainMechanics },
  { name: "op16-battle", mechanics: op16BattleMechanics },
  { name: "op16-triggers", mechanics: op16TriggerMechanics },
  { name: "op16-ace", mechanics: op16AceMechanics },
  { name: "replacements", mechanics: replacementMechanics },
  { name: "op16-luffy", mechanics: op16LuffyMechanics },
  { name: "op16-nami", mechanics: op16NamiMechanics },
  { name: "op16-teach", mechanics: op16TeachMechanics },
  { name: "op17-main", mechanics: op17MainMechanics },
  { name: "op17-battle", mechanics: op17BattleMechanics },
  { name: "op17-on-play", mechanics: op17OnPlayMechanics },
  { name: "op17-triggers", mechanics: op17TriggerMechanics },
  { name: "op17-replacements", mechanics: op17ReplacementMechanics },
  { name: "op17-meta", mechanics: op17MetaMechanics },
  { name: "op17-kaido", mechanics: op17KaidoMechanics },
  { name: "op17-luffy-ace", mechanics: op17LuffyAceMechanics },
  { name: "op05-on-play", mechanics: op05OnPlayMechanics },
  { name: "op05-main", mechanics: op05MainMechanics },
  { name: "op05-battle", mechanics: op05BattleMechanics },
  { name: "op05-triggers", mechanics: op05TriggerMechanics },
  { name: "op05-replacements", mechanics: op05ReplacementMechanics },
  { name: "op06-on-play", mechanics: op06OnPlayMechanics },
  { name: "op06-main", mechanics: op06MainMechanics },
  { name: "op06-battle", mechanics: op06BattleMechanics },
  { name: "op06-triggers", mechanics: op06TriggerMechanics },
  { name: "op06-yamato", mechanics: op06YamatoMechanics },
  { name: "eb04-bonney", mechanics: eb04BonneyMechanics },
  { name: "eb04-on-play", mechanics: eb04OnPlayMechanics },
  { name: "eb04-main", mechanics: eb04MainMechanics },
  { name: "eb04-battle", mechanics: eb04BattleMechanics },
  { name: "eb04-triggers", mechanics: eb04TriggerMechanics },
  { name: "eb04-replacements", mechanics: eb04ReplacementMechanics },
  { name: "eb03-on-play", mechanics: eb03OnPlayMechanics },
  { name: "eb03-main", mechanics: eb03MainMechanics },
  { name: "eb03-battle", mechanics: eb03BattleMechanics },
  { name: "eb03-triggers", mechanics: eb03TriggerMechanics },
  { name: "eb03-replacements", mechanics: eb03ReplacementMechanics },
  { name: "eb02-on-play", mechanics: eb02OnPlayMechanics },
  { name: "eb02-main", mechanics: eb02MainMechanics },
  { name: "eb02-battle", mechanics: eb02BattleMechanics },
  { name: "eb02-triggers", mechanics: eb02TriggerMechanics },
  { name: "eb01-on-play", mechanics: eb01OnPlayMechanics },
  { name: "eb01-main", mechanics: eb01MainMechanics },
  { name: "eb01-battle", mechanics: eb01BattleMechanics },
  { name: "eb01-triggers", mechanics: eb01TriggerMechanics },
  { name: "eb01-replacements", mechanics: eb01ReplacementMechanics },
  { name: "prb02-on-play", mechanics: prb02OnPlayMechanics },
  { name: "prb02-battle", mechanics: prb02BattleMechanics },
  { name: "prb02-replacements", mechanics: prb02ReplacementMechanics },
  { name: "prb02-triggers", mechanics: prb02TriggerMechanics },
]);

export const eventMainPrograms = registries.eventMain;
export const counterEventPrograms = registries.counterEvent;
export const onOpponentAttackPrograms = registries.onOpponentAttack;
export const leaderWatcherPrograms = registries.leaderWatcher;
export const whenAttackingPrograms = registries.whenAttacking;
export const whenRestedPrograms = registries.whenRested;
export const activateMainPrograms = registries.activateMain;
export const onPlayPrograms = registries.onPlay;
export const onBlockPrograms = registries.onBlock;
export const onKoPrograms = registries.onKo;
export const onEndOfYourTurnPrograms = registries.onEndOfYourTurn;
export const onStartOfYourTurnPrograms = registries.onStartOfYourTurn;
export const triggerPrograms = registries.trigger;
export const replacementPrograms = registries.replacement;

// The interpreter offers a registered replacement whenever its own `knock-out`
// node would remove a Character, and it cannot import this module to find them:
// every set module here imports `../mechanics.js`, so the edge would close a
// cycle. Handing the merged registry over once, at init, is the seam.
registerReplacementPrograms(replacementPrograms);
// Same seam, for the two Characters whose text activates an Event out of hand.
registerEventMainPrograms(eventMainPrograms);
// Same seam again, for the one fact the inertness walk needs about a card it is
// only ever handed the *program* of: whether resting it is a price or a payoff.
registerWhenRestedCards(new Set(whenRestedPrograms.keys()));
// Same seam for continuous text. Order is the order an observation's static
// power breakdown lists the auras reaching one card in.
registerStaticAbilities([
  ...op14StaticAbilities,
  ...op10StaticAbilities,
  ...op11StaticAbilities,
  ...op17StaticAbilities,
  ...promoStaticAbilities,
  ...op15StaticAbilities,
  ...op13StaticAbilities,
  ...op16StaticAbilities,
  ...formatStaticAbilities,
  ...op12StaticAbilities,
  ...st21StaticAbilities,
  ...st13StaticAbilities,
  ...st15StaticAbilities,
  ...op09StaticAbilities,
  ...st25StaticAbilities,
  ...st30StaticAbilities,
  ...st28StaticAbilities,
  ...op06StaticAbilities,
  ...eb04StaticAbilities,
  ...eb03StaticAbilities,
  ...op08StaticAbilities,
  ...op05StaticAbilities,
  ...st26StaticAbilities,
  ...op04StaticAbilities,
  ...st23StaticAbilities,
  ...st19StaticAbilities,
  ...prb02StaticAbilities,
  ...op07StaticAbilities,
  ...eb02StaticAbilities,
  ...eb01StaticAbilities,
  ...st16StaticAbilities,
  ...st27StaticAbilities,
  ...st29StaticAbilities,
  ...st14StaticAbilities,
  ...st10StaticAbilities,
]);
// Same seam for the signal-driven reactions. Order is the order one player's
// reactions to the same signal are offered in.
registerReactionRules([
  ...op07ReactionRules,
  ...op12ReactionRules,
  ...op10ReactionRules,
  ...op11ReactionRules,
  ...op13ReactionRules,
  ...op16ReactionRules,
  ...op14ReactionRules,
  ...eb04ReactionRules,
  ...op09ReactionRules,
  ...eb03ReactionRules,
  ...op08ReactionRules,
  ...op06ReactionRules,
  ...op15ReactionRules,
  ...op05ReactionRules,
  ...eb02ReactionRules,
  ...eb01ReactionRules,
  ...promoReactionRules,
  ...st10ReactionRules,
]);
registerRemovalImmunities([
  ...op06RemovalImmunities,
  ...op07RemovalImmunities,
  ...op08RemovalImmunities,
  ...op09RemovalImmunities,
  ...op10RemovalImmunities,
  ...op11RemovalImmunities,
  ...op12RemovalImmunities,
  ...op13RemovalImmunities,
  ...op15RemovalImmunities,
  ...eb03RemovalImmunities,
  ...eb04RemovalImmunities,
  ...promoRemovalImmunities,
  ...st14RemovalImmunities,
]);
