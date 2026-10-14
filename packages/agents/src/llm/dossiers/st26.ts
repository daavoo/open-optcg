import type { DeckStrategyDossier } from "./types.js";

/**
 * ST-26 is a precon, and the dossier says so. There is no tournament write-up
 * to cite for a starter deck and no competitive build to compare it to, so two
 * of the three sources below are the product itself: Bandai's card list for the
 * series, and the deck list the same product ships with.
 *
 * The third is a real piloting guide -- Bandai's own feature-deck page for this
 * Leader, which is not about ST-26 but is about OP09-061 and its DON!!-return
 * package. The two claims it makes about play order are the two this file
 * repeats: return more than one DON!! with Roronoa Zoro so the Leader answers
 * it, and spend the removal Event before the refund has fired rather than
 * after. Everything else here is read off the fifteen cards.
 */
export const st26Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple/Black) Monkey.D.Luffy - Starter Deck 26",
  archetype:
    "ST-26 Purple/Black Straw Hat Crew: a DON!!-return deck whose Leader refunds the DON!! its own cards spend, so almost every body is paid for twice",
  gamePlan: [
    "Read the Leader as a refund, not as a cost. OP09-061 gives all of your Characters +1 cost with a DON!! attached, which is pure downside; what pays for it is the second clause -- once on each of your turns, returning 2 or more DON!! to the DON!! deck adds 1 active DON!! and 1 rested DON!! back.",
    "Spend the DON!! -2 cards on your own turn, and spend the first one early in the turn: the refund is [Once Per Turn], so the first return of the turn is the cheap one and every later return that turn costs full price.",
    "When a card asks how many DON!! to return -- OP09-070 Nami and OP09-076 Roronoa Zoro both say \"1 or more\" -- return exactly 2. One is below the Leader's threshold and buys nothing from it; two is the threshold; three or more hands over a DON!! for the same refund. Bandai's own guide for this Leader opens by saying to return more than one with Zoro for exactly this reason.",
    "Curve into ST26-001 Soba Mask through OP05-065 San-Gorou. San-Gorou is a vanilla 6-cost 8000 whose only job is to switch on Soba Mask's -5 cost; Soba Mask then returns San-Gorou to hand on play, so the 8000 body comes back and the 9000 one stays.",
    "Hold ST26-005 Monkey.D.Luffy for a turn the opponent has 5 or more DON!! on their field. The Leader is multicoloured, so the condition is met from the mid-game on, and the clause sets your Leader's base power to 7000 until the end of their next End Phase -- it defends the turn after it fires as much as the turn it fires.",
  ],
  mulligan: [
    "Keep a hand with a 3-cost DON!! -2 body -- ST26-002 Chopper or ST26-003 Nico Robin -- so the Leader's refund is live on the first turn the deck can pay for it.",
    "Keep San-Gorou alongside Soba Mask: the pair is the deck's best turn and neither half does much alone.",
    "Ship a hand of 6-, 7- and 8-cost bodies with no DON!! -2 card. The deck has no searcher, so a top-heavy opener stays top-heavy.",
  ],
  priorities: [
    "Sequence the first DON!! -2 of your turn before deciding what else you can afford. Two DON!! go back and one active DON!! comes straight back, so a 3-cost body that pays DON!! -2 actually costs 3 DON!! and one rested DON!! -- not 5.",
    "ST26-002 Chopper's rest may take an opponent's DON!! card instead of a Character, and unlike the Character half that choice has no cost ceiling. Against a board with nothing at cost 1 or less it is still a real effect: a rested DON!! is one fewer the opponent unrests into next turn.",
    "ST26-004 General Franky picks both -2000 targets at once. Point them at two bodies an attack this turn can actually kill; the debuff lasts only this turn and buys nothing on defence.",
    "OP09-078 Gum-Gum Giant is a Counter that costs DON!! -2 and a card from hand and draws 2 back, so it replaces itself. It is the deck's only Counter Event -- use it to save the Leader, not to win a Character trade.",
    "OP05-070 Fra-Nosuke gains [Rush] only with a DON!! attached and 8 or more DON!! on your field. Before that it is a 5-cost 4000 with a 2000 Counter, and the Counter is usually the better half.",
    "OP05-066 Jinbe's +1000 needs all 10 DON!! on your field, which means the DON!! deck is empty. Every DON!! -2 you pay before then pushes that turn further out, so do not plan around it.",
  ],
  commonVariants: [
    "This is the sealed product, unchanged. Competitive OP09-061 lists cut the vanillas -- OP05-065 San-Gorou, OP09-063 Usopp, ST14-010 Brook -- for more DON!!-return bodies and a searcher, but San-Gorou stays in any build that runs Soba Mask.",
  ],
  commonCombos: [
    "San-Gorou on the board makes Soba Mask a 2-cost 9000; Soba Mask's [On Play] then returns San-Gorou to hand, so the same 6-cost body can be replayed for another discount later.",
    "OP09-076 Roronoa Zoro and ST26-003 Nico Robin both turn a DON!! return into an active DON!!, which with the Leader's refund is the whole ramp package: return 2, get 2 back plus 1.",
    "OP09-070 Nami returns DON!! and hands 2 rested DON!! to a Character, which is how ST26-005's DON!! -2 gets paid on the turn it is played rather than the turn after.",
    "OP09-077 Gum-Gum Lightning K.O.s a Character with 6000 power or less for DON!! -2, and its [Trigger] adds an active DON!! -- the one card in the deck that is a fine Life card and a fine draw.",
  ],
  keyCardNumbers: [
    "OP09-061",
    "ST26-001",
    "ST26-005",
    "OP05-065",
    "OP09-077",
    "OP09-078",
  ],
  counterplay: [
    "Play around the refund by counting it. Once per your opponent's turn a DON!! -2 costs them almost nothing; the second one that turn costs full price, so pressure that forces two returns in a turn is what actually taxes them.",
    "Kill San-Gorou. Without a [San-Gorou] or [Sanji] Character at 7000 base power or more, ST26-001 Soba Mask is a 7-cost 9000 with no Counter -- a card the deck usually cannot cast.",
    "Do not leave an attack that only wins by 2000 or less against their Leader: ST26-005 sets it to 7000 base until the end of your next End Phase, and OP09-078 adds another 4000 in the battle.",
    "Keep your board clear of 1-cost bodies where it is cheap to do so; ST26-002 Chopper's rest then has to take a DON!! card instead, which is the weaker half.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569026",
      retrievedAt: "2026-09-07",
      note: "Bandai's own ST-26 card list: the fifteen identities the product contains, with the printed text every line above is read from.",
    },
    {
      url: "https://deckbuilder.egmanevents.com/api/gamedata/optcg",
      retrievedAt: "2026-09-07",
      note: "The ST26 entry in the structure-deck list, which is where the per-slot counts in the manifest come from -- 50 main-deck cards behind OP09-061.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_052.php",
      retrievedAt: "2026-09-07",
      note: "Bandai's feature-deck guide for OP09-061, the only piloting write-up that exists for this Leader. Source of the two sequencing claims above: return more than one DON!! with OP09-076 to trigger the refund, and cast OP09-077 before the refund has fired that turn rather than after.",
    },
  ],
};
