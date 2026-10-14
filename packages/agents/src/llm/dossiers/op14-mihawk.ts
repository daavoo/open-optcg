import type { DeckStrategyDossier } from "./types.js";

export const op14MihawkDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
  archetype:
    "Green Dracule Mihawk control: rest your own cards for value, refund DON!! through the Leader, and lock the opponent's Characters out of attacking",
  gamePlan: [
    "The Leader converts one rested card per turn into up to 3 active DON!!, provided a Character of cost 5 or more is on the board. That is the deck's engine: it turns a turn's worth of DON!! into roughly double.",
    "Read the drawback before using it -- after the Leader ability resolves you cannot play Character cards for the rest of the turn. So develop first, then restand DON!!, then spend the refunded DON!! on Events, DON!! attachments and attacks.",
    "Rest cards you wanted rested anyway. Coffin Boat is a free rest target that also refunds a DON!! at end of turn.",
    "Do not remove the opponent's board -- keep it lying down. Electrical Luna and Jewelry Bonney (OP07-026) both say 'will not become active in your opponent's next Refresh Phase', and a rested Character can neither attack nor use [Blocker].",
    "You Can Be My Samurai!! (OP01-055) is the card flow: rest two of your Characters, draw two. Pay it with Characters you were not going to attack with -- one that landed this turn, or Kikunojo (OP14-023), which sets itself active again at the end of your turn.",
  ],
  mulligan: [
    "Keep Coffin Boat. It draws on play, gives the Leader a rest target that costs nothing, and refunds a DON!! every turn it survives.",
    "Prefer a 1-cost searcher -- Otama or Perona (OP12-034) -- plus a cost-5 Character, since the Leader ability does nothing until a cost-5-or-more Character is on the board.",
    "Avoid hands of only top-end Characters; the deck needs the cost-5 body and the rest targets before Shanks (OP17-022) is castable on a doubled DON!! turn.",
  ],
  priorities: [
    "Sequence every Character play before using the Leader ability. Using it first locks out Character plays for the rest of the turn, which is the single most expensive mistake available in this deck.",
    "Rest the cheapest card that is not doing work. A rest cost only ever offers cards that are still active, so the order is: the Stage (Coffin Boat) first, then a body that cannot attack this turn anyway, then the smallest attack on the board. Resting the Leader is the last resort -- it gives up a 6000 attack.",
    "'Will not become active' is the deck's real removal. Rest a Character first and lock it second: Shanks (OP17-022) rests the whole board, and Electrical Luna then holds down every one of them that costs 7 or less. That pair is the deck's strongest turn.",
    "Yasopp (OP17-031) draws and rests a cost-8-or-less Character on play, then sets a Red-Haired Pirates body active at the end of your turn -- so it is both a rest effect and a way to keep an attacker up. Play it before the Leader ability, not after.",
    "Count the Leader's restand into the turn's DON!! before deciding a line is unaffordable. A 7-DON!! turn with 3 DON!! set active is effectively a 10-DON!! turn for anything that is not a Character play.",
    "The Leader gains +1000 only against a Slash-attribute Leader. Do not plan attack thresholds around it in other matchups.",
    "Vander Decken IX's K.O. only reaches a *rested* Character, so it is removal that follows a rest rather than opening a turn. Its cost is a {Fish-Man} from hand, and Kawamatsu is one -- weigh the 5-drop you are trashing against the body you are shooting.",
    "The Billion-fold World Trichiliocosm is +2000, or +4000 while you have 8 or more rested cards. On a turn built around resting your own board, that threshold is usually already met -- count it before conceding a battle.",
    "Do not pay a rest cost with Yasopp or Shanks (OP17-022) just because Yasopp's [End of Your Turn] can set one of them active again. That restand happens after attacks, so it does not give the swing back -- it only makes the body active during the opponent's turn, and this deck has one conditional Blocker to use that with.",
    "You Can Be My Samurai!! can only be paid with Characters -- not the Leader, not Coffin Boat. With fewer than two active Characters it cannot be cast at all, and with exactly two it rests both of them; count what is left to attack with before you cast it.",
    "Jewelry Bonney (OP07-026) is one lock on one rested thing, Character or DON!!. Play it after something across the table is rested, or its [On Play] finds nothing.",
    "The fast red decks are the bad matchup, and they are bad on tempo rather than on defence: by the time a second attacker lands you are behind, and one extra prevented hit does not change it. Spend the early turns developing and locking, not holding cards for a Counter step.",
  ],
  commonVariants: [
    "Green Mihawk lists agree on the searcher package (4 Otama, 4 Perona), the Land of Wano bodies and 4 You Can Be My Samurai!!, and differ mainly in the removal and lock count: Vander Decken IX at three or four, Law & Bepo (ST24-004) or OP13-040 in some lists, Electrical Luna at one to three, and a single Kikunojo or Jewelry Bonney as the last slot.",
  ],
  commonCombos: [
    "Play a cost-5 Character, then rest Coffin Boat for the Leader ability: 3 DON!! come back active and Coffin Boat still refunds another DON!! at the end of the turn.",
    "Shanks (OP17-022) sets 2 DON!! active and rests every opposing Character; follow it with Electrical Luna and none of the ones costing 7 or less stands back up.",
    "Trafalgar Law (OP13-031) returns one of your own Characters to hand to put a cost-5-or-less Character into play rested -- which re-buys an [On Play] and, at 1 or less Life, leaves Law itself as a [Blocker].",
    "Otama digs 5 for a green {Land of Wano} body; Kin'emon, Oden and Kawamatsu are all {Land of Wano}, so it rarely whiffs and it is what finds the cost-5 body the Leader ability needs.",
    "Play Kikunojo, rest it and one other Character for You Can Be My Samurai!!, and Kikunojo stands back up at the end of the turn: two cards for one attack given up.",
  ],
  keyCardNumbers: [
    "OP14-039",
    "OP17-022",
    "OP17-031",
    "OP13-031",
    "OP08-036",
    "OP01-055",
  ],
  counterplay: [
    "A turn in which the Leader restands DON!! is a turn with no new Characters. Removing their board on the turn before forces a choice between developing and doubling their DON!!.",
    "Coffin Boat is the cheapest piece of the engine and the easiest to answer: without it the Leader ability has to rest a real card every turn.",
    "The Leader ability needs a Character of cost 5 or more on the board. Answering the cost-5 body switches the restand off entirely for that turn.",
    "The refresh locks stop attacks and [Blocker] declarations alike, since both are paid for with a rest, but not abilities that cost no rest -- a Character whose value is an [On Play] or an aura loses nothing to them.",
    "The Leader is only 6000 against a Slash-attribute Leader. From a non-Slash Leader it is a plain 5000, and attack thresholds should be set accordingly.",
  ],
  sources: [
    {
      url: "https://onepiece.limitlesstcg.com/cards/OP14-020",
      retrievedAt: "2026-08-25",
      note: "Leader text: +1000 against Slash-attribute Leaders; [Activate: Main] once per turn, rest 1 of your cards to set up to 3 DON!! active if a cost-5-or-more Character is present, then no Character plays that turn.",
    },
    {
      url: "https://www.optcg.gg/api/deck-lists/07594072-7398-437d-9a53-204c52ff6a91",
      retrievedAt: "2026-09-20",
      note: "The list this deck transcribes: Zyrios, 3rd place, EU Final (Championship 26-27 Season 1 Finals), Bandai Card Games Fest Utrecht, 5-6 September 2026, one row per copy. It matches Bandai's own deck image for the placing identity for identity.",
    },
    {
      url: "https://en.onepiece-cardgame.com/rules/blockicon-card/",
      retrievedAt: "2026-09-20",
      note: "Bandai's block-number updates: OP01-055 is assigned to block 4 regardless of its printings and is Standard-legal from 1 April 2026 to 31 March 2029.",
    },
  ],
};
