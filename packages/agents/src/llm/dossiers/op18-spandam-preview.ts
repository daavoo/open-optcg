import type { DeckStrategyDossier } from "./types.js";

export const op18SpandamPreviewDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Black/Yellow) Spandam - tinkerer OP-18 Pre-release",
  archetype:
    "Black/Yellow OP18-079 Spandam as an all-yellow {CP9} Trigger deck. Almost every card carries a [Trigger] that turns on with a CP Leader, Kaku, Kalifa and Kumadori put CP cards from hand into Life face-up, and the Leader buys extra Life off the deck, so each hit the opponent lands pays you a card or a removal. Rob Lucci and Jabra take the opponent's Life without attacking.",
  gamePlan: [
    "The Leader starts on 4 Life. Its [Activate: Main] rests 2 DON!!, rests the Leader itself and trashes a CP card from hand to put the top card of your deck on top of your Life. It is not once per turn, but it needs the Leader active, so each use is the Leader's attack for that turn: take it on turns when the Leader's attack would not connect or would not matter, and when your Life is low.",
    "Your Life is a hand you draw from when hit. Of the 50, only EB04-058 Borsalino and OP18-108 Funkfreed have no [Trigger]; every CP Trigger checks for a CP Leader, which Spandam is. Do not spend Counters to save a Life card while the opponent's attack is not lethal: the Trigger it reveals is often worth more than the Counter.",
    "OP18-099 Kaku (7 cost, 9000), OP18-100 Kalifa (6 cost, 7000, draws 1 first) and OP18-101 Kumadori (4 cost, 6000, on its [On K.O.]) each add a CP card from your hand to the top or bottom of your Life face-up. Top means that Trigger is the next one you get; bottom saves it for the last Life card. Face-up shows it to the opponent, so they may choose not to attack into a removal Trigger.",
    "The Triggers to bank are the removal ones: OP18-099 Kaku, OP18-103 Jabra and OP18-113 Rob Lucci draw 1 and send a Character with a cost of 8 or less to the bottom of its owner's deck; OP18-101 Kumadori and OP18-109 Fukurou K.O. or rest a cost 6 or less; OP18-115 Ten Finger Pistol draws and bottoms a cost 7 or less; OP18-110 Blueno draws and K.O.s a cost 2 or less; OP18-100 Kalifa draws and rests a Leader or Character; OP18-116 Iron Body Empty Tree rests a Character. The bottom-deck Triggers can pick either side's Character: aim them at the opponent's.",
    "OP18-105 Spandam has no effect on the field, but its [Trigger] reveals another CP card from your hand and runs that card's [Trigger]; the revealed card stays in hand. Keep a removal-Trigger card in hand while a Spandam can come off your Life.",
    "OP18-113 Rob Lucci (8 cost, 10000) trashes the opponent's top Life card on play and again when K.O.'d; OP18-103 Jabra (6 cost, 8000) on K.O. adds your top deck card to your Life and trashes their top Life. A trashed Life card is damage that gives them no [Trigger] and no card in hand.",
    "The card flow is OP18-110 Blueno (look at 4 for a CP card), OP18-108 Funkfreed (trash a CP card: draw 2) and OP17-109 Charlotte Pudding (trash a card with a [Trigger]: draw 3). Every card except Borsalino and Funkfreed can pay Pudding.",
  ],
  mulligan: [
    "Keep a hand with a 1-cost opener -- Blueno, Funkfreed or OP18-105 Spandam -- plus Pudding or Kumadori for the next turns.",
    "Keep spare CP cards: the Leader, Funkfreed, Kaku, Kalifa and Kumadori each want one in hand to pay or to move into Life.",
    "A hand of only 6- to 8-costs with no 1- or 3-cost takes a new hand.",
  ],
  priorities: [
    "Before casting Kaku or Kalifa, decide which CP card goes into Life: a removal Trigger (Rob Lucci, Jabra, Kaku, Fukurou, Kumadori) you cannot cast soon is the best choice; Iron Body Empty Tree and the 2000-Counter cards are better kept in hand to defend.",
    "Kumadori, Jabra and Rob Lucci have no Counter and pay off when K.O.'d: let the opponent take them rather than defending them.",
    "OP18-109 Fukurou is a 5-cost [Blocker] with a 2000 Counter, and EB04-058 Borsalino a 5-cost [Blocker] that adds a card to your Life on play when you have 2 or fewer. Hold Borsalino until your Life is at 2 or below.",
    "OP18-105 Spandam (2000 Counter), Funkfreed, Blueno, Kalifa, Borsalino and Pudding (1000 each) and Iron Body Empty Tree (0 cost, trash a card from hand for +3000) are the defence. Spend them when an attack would be lethal or would take your last Life cards, not earlier.",
    "Funkfreed rests itself to give a Spandam +1000 this turn: it lifts the 5000 Leader to 6000 for an attack into a 6000 Leader or Character. It does nothing on the opponent's turn.",
    "OP18-115 Ten Finger Pistol K.O.s a cost 5 or less from hand; it is the one removal you choose the timing of, so save it for a Blocker or an engine piece.",
  ],
  commonVariants: [
    "The other Spandam build in circulation (StrawHatScott's) is a black trash-count CP list: EB04-043 Kaku, EB04-048 Rob Lucci, OP15-083 Spoil and OP07-088 Hattori grow the trash, Six King Pistol and Ground Death are its Counters, OP17-095 Zoro protects the board, and Portgas.D.Ace, Lilith, Baby 5 and ST29-013 Rob Lucci fill out the Life and Trigger side, with only OP18-100 Kalifa and OP18-113 Rob Lucci from OP-18. This list is almost all OP-18 CP9 instead, built on face-up Life and CP Triggers rather than on trash size.",
  ],
  commonCombos: [
    "Kalifa draws 1, then puts Rob Lucci into Life face-up on top: the next hit on you draws a card and bottoms their best Character.",
    "OP18-105 Spandam comes off Life, reveals a Fukurou or Kumadori from hand, and K.O.s or rests a cost 6 or less while that card stays in hand.",
    "Rob Lucci trashes their top Life on play; when they K.O. it, it trashes another.",
  ],
  keyCardNumbers: [
    "OP18-079",
    "OP18-113",
    "OP18-100",
    "OP18-099",
    "OP18-105",
    "OP18-103",
    "OP18-101",
    "OP17-109",
  ],
  counterplay: [
    "Read their face-up Life before attacking: a face-up removal Trigger on top punishes the hit, so attack Characters or hold the attack until it is gone.",
    "Their biggest bodies have no Counter and only pay off when K.O.'d by you; leaving Rob Lucci or Jabra alone denies the second Life trash.",
    "The Leader trades its own attack for Life: pressure them so they must attack back instead of resting the Leader.",
  ],
  sources: [
    {
      url: "https://www.duelvoyager.com/deck/view/ONh3UPODmgFO",
      retrievedAt: "2026-11-15",
      note: 'The deck\'s own 50: DuelVoyager user "tinkerer"\'s share "OP18 Spandam", posted by the YouTube channel BerryTCG on 3 Nov 2026 as the 1st-place list of a DuelVoyager online weekly, a simulator event before OP-18\'s release.',
    },
  ],
};
