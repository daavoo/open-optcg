import type { DeckStrategyDossier } from "./types.js";

export const st33Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Kuzan - Starter Deck 33",
  archetype:
    "Base ST33 Blue Navy control: trash-from-hand as a draw engine, cost- and power-gated removal, and large Blockers that win a long game",
  gamePlan: [
    "Nearly every effect in the deck is paid for by trashing a card from hand, and the Leader turns each of those trashes into a draw. Treat 'trash 1 from your hand' as a cantrip, not a cost: Koby, Sengoku, Smoker, Kuzan and Ice Time all replace what they discard.",
    "Answer the opponent's board on tempo rather than by trading bodies: Smoker and Bluegrass put small Characters at the bottom of the deck, Zephyr bounces a cost-5-or-less Character to hand, and Kuzan and Ice Time stop attackers without removing them.",
    "Land Saul, Borsalino and Koby as Blockers behind that removal, then close the game with 8000-power Kuzan and Jango once the opponent has run out of pressure.",
  ],
  mulligan: [
    "Prefer a hand with an early trash outlet -- Koby or Sengoku -- plus a cost-2-to-4 play, so the Leader's draw starts on the first turn a Navy effect resolves.",
    "Keep Sengoku over a second copy of a large finisher: its five-card dig finds two Navy cards and is the deck's only real search.",
    "Avoid hands of only cost-6 Characters with no trash outlet; the engine, not the curve, is what makes this deck function.",
  ],
  priorities: [
    "Take the 'you may trash 1 card from your hand' option almost every time a Navy effect offers it: the Leader draws for each card trashed, so the true cost is the card's strategic value, not card economy. Decline it only when hand size itself is the resource being protected.",
    "Trash before playing OP12-043 Kuzan when the hand is at 5 or more cards. Kuzan gains +1 cost at 5-or-more cards in hand, so spending a trash effect first can be the difference between paying 6 and paying 7.",
    "Play ST33-004 Borsalino only after a card has been trashed from hand this turn; the discount is -3 cost, which turns a 6-cost Blocker into a 3-cost one, and it is checked while the card is still in hand.",
    "Match the removal to the target's gate rather than spending the strongest answer first: Smoker and Bluegrass only reach cost 2 or less and cost 1 or less, Zephyr only reaches cost 5 or less, and Ice Time only reaches 10000 power or less. Spend the narrow answer on the body it can still catch before that body grows.",
    "Prefer bottom-decking to bouncing when both reach the target. Smoker's bottom-of-deck removal is permanent in a way Zephyr's return-to-hand is not, and the opponent simply replays a bounced Character.",
    "Use Kuzan's and Ice Time's attack locks on the attacker that would otherwise take Life this turn, not on the largest body on the board: neither effect removes anything, so their value is the attack they deny in the next turn cycle.",
    "Hold Ice Block Pheasant Peck for a battle its +4000 actually decides. It trashes a card from hand as part of the Counter, which the Leader converts into a draw, so it is close to free defence once the Leader engine is online.",
    "Treat Life as a resource. This deck wins long games, so take early attacks that would cost real Counter cards and spend the Counters on the attacks that would otherwise break the Blocker wall.",
  ],
  commonVariants: [
    "The sealed ST33 list is the base starter plus its EB04 Navy support; upgraded builds usually add more bounce and cost-reduction removal and trim the vanilla bodies (Jango, Fullbody) that the starter uses to fill its curve.",
  ],
  commonCombos: [
    "Koby's [On Play] trashes 1 to draw 1, and the Leader draws another for the trashed card: a 2-cost Blocker that replaces itself twice over.",
    "Bluegrass's [When Attacking] draws 1 and trashes 1 from hand; the trash is by a Navy Character's effect, so the Leader draws a third card off one attack.",
    "Zephyr's [On Play] trashes 2 cards from hand -- two Leader draws -- and it can later trash itself to bounce a cost-5-or-less Character, so it is removal on the way in and on the way out.",
    "Sakazuki's [On K.O.] plays a cost-4-or-less Navy Character from hand, so trading it off in battle still develops the board; its [When Attacking] strips a card from a hand of 6 or more while drawing off the Leader.",
    "Garp's [On Play] puts a blue Navy Character of 8000 power or less onto the board for free, which most often means the 8000-power Kuzan or Jango.",
  ],
  keyCardNumbers: [
    "ST33-001",
    "ST33-003",
    "OP12-043",
    "OP12-047",
    "OP12-046",
    "OP12-057",
  ],
  counterplay: [
    "Play above the gates. A cost-3-or-more Character is out of range of Smoker and Bluegrass, a cost-6-or-more body cannot be bounced by Zephyr, and a Character over 10000 power ignores Ice Time.",
    "Pressure early. The deck's Blockers -- Saul at 7000, Borsalino, Koby -- arrive on the mid curve, and its removal is at its weakest before the trash engine has drawn into it.",
    "Attacking a hand this deck refills is not wasted, but forcing Counters is: Kuzan converts discards into cards, so the way to starve it is to end the game before the long-game Blockers stabilise, not to try to out-resource it.",
    "Sakazuki's [When Attacking] only strips a card from a hand of 6 or more, so a hand held at 5 blanks it entirely.",
  ],
  sources: [
    {
      url: "https://onepiece.gg/starter-deck-blue-kuzan-st-33/",
      retrievedAt: "2026-08-25",
      note: "Product page for ST-33; confirms the deck is the mono-blue Kuzan starter and its five new exclusive cards.",
    },
    {
      url: "https://en.onepiece-cardgame.com/products/st33.html",
      retrievedAt: "2026-08-25",
      note: "Official ST-33 product page: mono-blue control built to dominate the opponent's field, returning Characters to hand or the bottom of the deck and turning discards into draw.",
    },
  ],
};
