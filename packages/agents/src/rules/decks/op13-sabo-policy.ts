import type { GameObservation } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  type PolicyDecision,
} from "../generic-policy.js";
import { avoid, heuristics, prefer } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/** The two bodies that print "+12 cost", i.e. what switches the deck on. */
const GIANTS = ["OP17-089", "OP17-119"];
/** OP15-088 Pirates Docking Six: printed 5, on the board at 11. */
const DOCKING_SIX = "OP15-088";
/** OP17-098 Gum-Gum Kong Gun, whose [Main] rests six DON!! for a double K.O. */
const KONG_GUN = "OP17-098";
/** The cards that dig for a giant. */
const SEARCHERS = ["OP17-080", "OP17-086", "OP17-082"];
/** The 2-drops whose power depends entirely on a cost-12 body being out. */
const CONDITIONAL_TWO_DROPS = [
  "OP17-080",
  "OP17-082",
  "OP17-087",
  "OP17-091",
  "OP17-095",
];

/**
 * Identities only the Elbaph list plays, for telling the two OP13-004 decks
 * apart.
 *
 * Both Sabo decks share a Leader, and `registerPolicy` keys on the Leader card
 * number, so the ST-35 Revolutionary Army policy would otherwise pilot this deck
 * too -- with a `protectedCards` set and a `CARD_PRIORITY` table that name no
 * card in it, and a mulligan rule that looks for four cards it cannot contain
 * and so always mulligans. Nothing in the observation names a deck (correctly:
 * that is not public), so the discriminator is card identity, and it works
 * because the two lists are disjoint in every slot but the Leader.
 *
 * Only the *first* decision of a game could in principle be unattributed, and it
 * is a mulligan decision taken with a five-card hand of a 50-card deck, so in
 * practice the very first observation already answers it.
 */
const ELBAPH_IDENTITIES: ReadonlySet<string> = new Set([
  "OP17-080",
  "OP17-084",
  "OP17-086",
  "OP17-087",
  "OP17-089",
  "OP17-093",
  "OP17-095",
  "OP17-098",
  "OP17-119",
  "OP15-088",
  "OP15-094",
  "OP17-082",
  "OP17-091",
  "OP04-016",
]);

/** Whether the seat holding this observation is piloting the Elbaph list. */
export function isElbaphSaboList(observation: GameObservation): boolean {
  const seen = [
    ...observation.self.hand.map((card) => card.cardNumber),
    ...observation.self.board.map((card) => card.cardNumber),
    ...observation.self.trash.map((card) => card.cardNumber),
  ];
  return seen.some((cardNumber) => ELBAPH_IDENTITIES.has(cardNumber));
}

/** Characters this player controls at cost 12 or more, read on the field. */
const ownEnablers = (observation: GameObservation): number =>
  observation.self.board.filter((card) => card.currentCost >= 12).length;

/**
 * Whether *anyone* has a cost-12 body, which is what the Elbaph clauses ask.
 *
 * The printed wording is "[printed text omitted -- pnpm card:text <card>]",
 * not "if you have", so an opposing giant switches this deck's own 2-drops on
 * for free. The Leader's aura is the one clause that reads "if you have", and
 * it counts only this player's board -- which is why removing their giant can
 * cost this deck its own +3000s while leaving the aura exactly where it was.
 */
const anyEnabler = (observation: GameObservation): boolean =>
  [...observation.self.board, ...observation.opponent.board].some(
    (card) => card.currentCost >= 12,
  );

/**
 * The power an Elbaph giant is holding up on the board as it stands.
 *
 * Every conditional 2-drop reads +3000 off a cost-12 body, so a giant's removal
 * is not one body lost: it is that much power taken off the rest of the board at
 * once, and the 2-drops go back to being 2000s with no other way to grow. That
 * is the number a Counter card is traded against here, and it is why the field's
 * one-card ceiling -- right for a body that can simply be played again -- prices
 * this deck's two enablers wrong.
 *
 * Floored at the ordinary price so an empty board never buys less than the
 * default would.
 */
const ELBAPH_BOOST = 3_000;
const ORDINARY_CHARACTER_PRICE = 1_000;
const giantSupportPower = (observation: GameObservation): number =>
  Math.max(
    ORDINARY_CHARACTER_PRICE,
    ELBAPH_BOOST *
      observation.self.board.filter((card) =>
        CONDITIONAL_TWO_DROPS.includes(card.cardNumber),
      ).length,
  );

/** Opposing Characters the Kong Gun [Main] could actually K.O. */
const kongGunTargets = (observation: GameObservation): number =>
  observation.opponent.board.filter((card) => card.currentCost <= 6).length;

/**
 * Characters worth a Counter card to keep on the field.
 *
 * Not a power ranking: it is the list of bodies whose removal takes power off
 * *other* cards. Losing a giant drops every conditional 2-drop by 3000, drops
 * the whole team by the Leader's +1000, and takes [Rush] off OP17-093 -- so one
 * removal is worth four cards of tempo, which is what makes a Counter card cheap
 * by comparison. The 2-drops themselves are trade fodder and are deliberately
 * absent.
 *
 * OP15-094 Roronoa Zoro is absent for the reason ST35's set omits
 * OP13-008 Emporio.Ivankov: its printed job is to be trashed in place of another
 * {Straw Hat Crew} Character, so paying to keep it alive buys nothing it was not
 * already going to do.
 */
const ELBAPH_PROTECTED_CARDS: ReadonlySet<string> = new Set([
  "OP17-089",
  "OP17-119",
  "OP15-088",
  "OP17-093",
]);

/**
 * OP-17 Red/Black Sabo -- the OP13 Leader in front of OP17's Elbaph shell.
 *
 * ## The engine, in one paragraph
 *
 * Two cost thresholds, answered by the same card. The Leader prints
 * `[DON!! x1] If you have a Character with a cost of 8 or more, your Leader and
 * all of your Characters gain +1000 power`, and six of the OP17 bodies print
 * `if there is a Character with a cost of 12 or more, ...`. OP17-089
 * Jaguar.D.Saul costs 4 in hand and sits on the field at 16; OP17-119 Loki
 * costs 6 and sits at 18. So one cheap giant simultaneously grows every 2-drop
 * by 3000, hands OP17-093 [Rush], and -- with a single DON!! on the Leader --
 * adds another +1000 to everything. The Leader's other clause runs backwards:
 * `If you have 4 or more Life cards, give this Leader −1000 power`, so the
 * Leader is a 4000 body until Life is spent.
 *
 * Source for the plan: the top-placing OP17 RB Sabo list on gumgum.gg and
 * onepiece.gg's OP13-004 Leader guide, both restated in
 * `packages/agents/src/llm/dossiers/op13-sabo.ts`.
 *
 * ## Why this file exists
 *
 * Two reasons, and the first is the one that had to be fixed rather than tuned.
 *
 * `registerPolicy` keys on the Leader card number, and this deck shares
 * OP13-004 with the ST-35 Revolutionary Army starter. So `st35-policy.ts`
 * piloted this deck as well, holding a `protectedCards` set, a `CARD_PRIORITY`
 * table and a mulligan rule that between them name fourteen cards, none of
 * which this list contains. The mulligan rule is the worst of it: it keeps a
 * hand only when it holds one of four ST-35 cards, so on this deck it threw
 * every opening hand away. See {@link isElbaphSaboList}, which is how the two
 * lists are now told apart, and the guard at the top of the ST-35 policy.
 *
 * Second, the deck's whole plan is a *within-turn ordering* claim -- giant
 * before 2-drops, because the same 2-drop is worth 2000 or 6000 depending only
 * on that -- and ordering is exactly what a `rank` layer expresses. The generic
 * policy still decides; these rules narrow what it decides between.
 *
 * Price the pair with:
 *
 *     pnpm deck:ab --deck "(Red/Black) Sabo - OP17 Elbaph List" \
 *       --disable op13-sabo,op13-sabo-decide
 *
 * ST32 is the matchup to watch rather than dismiss: it is where this deck is
 * most often the *slower* one, and "land the giant first" is a tempo rule
 * that pays worst there.
 *
 * Note what this instrument does *not* cover. The ST-35 guard lives in
 * `st35-policy.ts`, so it is in both arms of this A/B -- the control is the
 * generic policy, not the ST-35 policy misapplied. That fix is pinned by
 * `test/op13-sabo-policy.test.ts` instead, which is the right shape for it: a
 * mulligan rule that discards every opening hand is a bug to be made
 * unreachable, not an effect size to be estimated.
 *
 * The two matchups these rules do not reach are the two fastest clocks in the
 * field, Green Mihawk and ST31 aggro. A deck whose plan starts at a 4-cost
 * giant is structurally behind both, and an ordering rule does not change
 * that.
 */
export function createOp13SaboRulesPolicy(): PolicyModule {
  return heuristics("op13-sabo", [
    // The deck's one ordering claim, and the reason the rank layer is the right
    // tier for it. A giant is cheap (4 and 6) and is worth more than its own
    // body: it is the only card in the list that makes other cards bigger.
    prefer("Land a giant; it is what switches both of the deck's clauses on.")
      .when((t) => ownEnablers(t.observation) === 0)
      .by(45)
      .play((card) => GIANTS.includes(card.cardNumber)),
    // A second giant is still good -- Loki's [On Play] is removal, and the aura
    // survives the first one dying -- but it no longer buys the whole curve.
    // These rules stay `prefer` rather than `preferAmong`, which is unusual --
    // most deck modules ranking plays carry a bottom-of-ladder total order so
    // a whitelist cannot hide the cards it does not name. Here the hiding is
    // the point. This deck's plan is one 4-cost body, and a ladder that will
    // trade that commitment for the largest body in hand plays a worse
    // version of the deck: `preferAmong` plus a total order does make the
    // seat play its 8-cost OP17-093, which reads like a fix and costs games.
    // A whitelist that hides too much is how the commitment is expressed.
    //
    // These rules are also gated on board state that is *usually false* --
    // `ownEnablers() > 0`, "the trash recursion has a target" -- so the
    // whitelist window is narrow to begin with, where OP16-ACE-WBP's searcher
    // rule is gated on `turn <= 6` and `preferAmong` pays there.
    //
    // Note that `--disable op13-sabo#largest-body` measures nothing -- every
    // rule inside one `heuristics()` call shares that call's module id, so a
    // rule added there cannot be A/B'd by name and needs a two-report paired
    // diff.
    prefer("Add a second giant for the removal and the redundancy.")
      .when((t) => ownEnablers(t.observation) > 0)
      .by(12)
      .play((card) => GIANTS.includes(card.cardNumber)),

    // The same 2-drop is a 2000 body or a 6000 one depending only on whether a
    // cost-12 Character is on either board. Playing it first is how a turn's
    // whole tempo gets thrown away, so it is discouraged only while a giant is
    // actually still playable this turn -- otherwise a 2000 body now beats
    // nothing now.
    avoid("Do not spend the turn on a 2-drop while a giant is affordable.")
      .when(
        (t) =>
          !anyEnabler(t.observation) &&
          t.affordablePlays.some((action) => {
            const card = t.hand.find(
              (held) => held.instanceId === action.cardInstanceId,
            );
            return card !== undefined && GIANTS.includes(card.cardNumber);
          }),
      )
      .by(25)
      .play((card) => CONDITIONAL_TWO_DROPS.includes(card.cardNumber)),

    // "Do not rest six DON!! for a K.O. with nothing in range." was here, and is
    // now `inert-activation` in `format-heuristics.ts`. The two test the same
    // thing -- Kong Gun's selector is "[printed text omitted -- pnpm card:text <card>]", which is `kongGunTargets` -- except that the engine's version
    // also drops a Character that cannot be targeted, so it is the more accurate
    // of the two. The `prefer` below is a different claim and stays: it is about
    // spending the six DON!! on *two* bodies rather than one.
    prefer("Spend the six DON!! when it answers two bodies rather than one.")
      .when((t) => kongGunTargets(t.observation) >= 2)
      .by(35)
      .activate((action) => action.sourceCardNumber === KONG_GUN),

    // Docking Six is a 5-cost that lands at 11 -- one short of the threshold --
    // so it is a body plus a trash recursion, not an enabler. Worth most once
    // there is something in the trash to bring back.
    prefer("Deploy Docking Six once its trash recursion has a target.")
      .when((t) =>
        t.observation.self.trash.some((card) =>
          CONDITIONAL_TWO_DROPS.includes(card.cardNumber),
        ),
      )
      .by(18)
      .play((card) => card.cardNumber === DOCKING_SIX),

    // The searchers cost 1 and 2 and are what a hand with no giant is looking
    // for. Only early: past the mid-game a body beats a card.
    prefer("Dig for the missing giant while the turns are still cheap.")
      .when((t) => t.turn <= 6 && ownEnablers(t.observation) === 0)
      .by(15)
      .play((card) => SEARCHERS.includes(card.cardNumber)),
  ]);
}

/**
 * The opening hand, by the guide's own rule: a giant, or something that finds
 * one. A hand of nothing but 2-drops is 2000-power bodies with no way to grow,
 * which is the hand this deck cannot play out of.
 *
 * Gated on {@link isElbaphSaboList} like everything else here, and this is the
 * decision that gate was written for: the ST-35 policy's keep names four cards
 * this list does not contain, so before the split it discarded every one of
 * this deck's opening hands.
 */
export function createOp13SaboMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op13-sabo-mulligan",
    applies: (context) => isElbaphSaboList(context.observation),
    keep: (observation) =>
      observation.self.hand.some(
        (card) =>
          GIANTS.includes(card.cardNumber) ||
          SEARCHERS.includes(card.cardNumber),
      ),
    keepBecause: "Keep a hand holding a giant or a card that digs for one.",
    mulliganBecause: "Mulligan a hand with no giant and no way to find one.",
  });
}

/**
 * The decision the rank layer above cannot reach: which Characters are worth a
 * Counter card.
 *
 * Separate from the heuristics module because it has to be gated on
 * {@link isElbaphSaboList} -- it would otherwise take this decision for the
 * ST-35 list, which has its own policy for it -- while the rules above are
 * safe unregistered: every one of them names a card only this list plays.
 */
export function createOp13SaboDecideModule(): PolicyModule {
  return {
    id: "op13-sabo-decide",
    applies: (context) => isElbaphSaboList(context.observation),
    decide: ({ observation }): PolicyDecision | undefined => {
      const actions = observation.legalActions;
      if (observation.phase === "counter") {
        return chooseGenericCounter(observation, actions, {
          protectedCards: ELBAPH_PROTECTED_CARDS,
          // Only the two enablers are repriced. OP15-088 and OP17-093 are worth
          // a Counter card for their own sake -- a 5-cost body and an 8-cost
          // [Rush] one -- but nothing else on the board shrinks when they go,
          // so the ordinary price is the right one for them.
          characterDefensePower: (cardNumber) =>
            GIANTS.includes(cardNumber)
              ? giantSupportPower(observation)
              : ORDINARY_CHARACTER_PRICE,
        });
      }
      return undefined;
    },
  };
}
