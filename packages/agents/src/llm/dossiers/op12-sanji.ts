import type { DeckStrategyDossier } from "./types.js";

export const op12SanjiDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue/Purple) Sanji - Official Feature Deck",
  archetype:
    "Blue/Purple Event midrange behind OP12-041: a {Straw Hat Crew} Leader that activates a cheap Event from hand for one DON!!, in a fifty where half the cards are Events and the Characters grow with the Events in your trash.",
  gamePlan: [
    "Fill your trash with Events early. OP12-063 Vinsmoke Reiju, OP12-066 Carne and OP12-065 Emporio.Ivankov all switch on at 4 Events in your trash, OP12-059 Concasser's [Counter] needs 4 too, and OP12-070 Sanji gains +1000 for every 5.",
    "OP12-071 Charlotte Pudding looks at 4 for a [Sanji] or an Event, and OP12-079 looks at 3 and takes any card. Both cost 1 and are your turn-one and turn-two plays.",
    "The Leader's [Activate: Main] returns 1 DON!! to activate a {Straw Hat Crew} Event of base cost 3 or less from your hand without paying its cost. OP12-060 Boeuf Burst (bounce a cost-4-or-less Character, or draw 2) and OP12-078 Brochette Blow (draw 1, then −3000 to an opposing Character) are the best Events to activate this way, since they cost 3.",
    "Do not spend the Leader's activation on OP09-078 Gum-Gum Giant, which prints only a [Counter] and does nothing in your main phase, or on OP09-077 Gum-Gum Lightning when no opposing Character has 6000 power or less. Lightning still pays its own DON!! −2. If OP12-060 Boeuf Burst has no Character of cost 3 or 4 to return, take its draw 2 instead.",
    "Use the Leader's [Activate: Main] before you attack with the Leader: its [When Attacking] adds a rested DON!! from your DON!! deck while your field has no more DON!! than your opponent's, which refunds the DON!! the activation returned.",
    "OP12-062 Vinsmoke Sora and OP12-074 Patty put DON!! back on the field. Sora needs your field level or behind on DON!!; Patty trashes an Event from your hand, which also counts towards the trash.",
    "OP12-070 Sanji is a 3-cost that reaches 8000 power at 15 Events. When your opponent's effect would remove it, you may return 1 DON!! to your DON!! deck instead. That does not protect it from a K.O. in battle.",
    "OP12-072 Zeff gains [Rush] in any turn a DON!! on your field goes back to your DON!! deck. Play it, then pay the Leader's DON!! −1, and it attacks that turn.",
  ],
  mulligan: [
    "Keep a hand with OP12-071 Charlotte Pudding or OP12-079: a 1-cost that finds the Events everything else counts.",
    "OP09-078 Gum-Gum Giant and OP12-059 Concasser are cheap but are Counters, not openers. A hand with neither Pudding nor OP12-079 starts nothing. Take a new hand.",
  ],
  priorities: [
    "Count the Events in your trash before every play. The fourth one turns on Reiju's +2000 and [Blocker], Carne's and Ivankov's [Blocker] and Concasser's +4000 Counter.",
    "You run few Characters with a Counter value. Keep Gum-Gum Giant and Concasser in hand for defence, and do not trash them to Patty or Gum-Gum Giant while a weaker Event can pay.",
    "OP09-078 Gum-Gum Giant pays DON!! −2 for +4000 and draws 2. The Leader's [When Attacking] can refund one, but the next turn's Leader activation needs a DON!! too. Spend it when a Life or a key Character is at stake.",
    "OP12-059 Concasser's [Main] draws 1. Use it as a Counter once the trash holds 4 Events, and as a draw before that.",
    "OP09-077 Gum-Gum Lightning K.O.s a 6000-or-less Character for DON!! −2. Use it on a threat you cannot otherwise answer, since the DON!! it costs slows the Leader's activation.",
    "Late in the game, Reiju at 7000 and Sanji at 7000 or 8000 are attackers, not only defenders.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader, built around Events and Characters that read the Events in the trash.",
  ],
  commonCombos: [
    "The Leader's DON!! −1 activates Boeuf Burst or Brochette Blow for free, and the Leader's own attack then adds a rested DON!! back.",
    "Play Zeff, then pay a DON!! −1 or −2: Zeff gains [Rush] and attacks the same turn.",
    "Patty trashes an Event from hand for an active DON!!, which both adds to the trash count and pays for the next play.",
    "Ivankov's [On K.O.] returns an Event from your trash to your hand, such as a Counter you have already spent.",
  ],
  keyCardNumbers: [
    "OP12-041",
    "OP12-071",
    "OP12-079",
    "OP12-063",
    "OP12-070",
    "OP12-060",
    "OP12-059",
    "OP09-078",
  ],
  counterplay: [
    "Its Characters are weak until the trash holds 4 Events. Pressure it early, before Reiju, Carne and Ivankov become [Blocker]s.",
    "OP12-070 Sanji can return a DON!! instead of leaving the field to your effects, but not to a K.O. in battle. Attack it rather than spending removal on it.",
    "Few of its Characters carry a Counter value, so attacks into its Leader cost it Events from hand.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_072.php",
      retrievedAt: "2026-10-04",
      note: "Bandai's feature deck for OP12-041: the fifty, filling the trash with Events through Charlotte Pudding and OP12-079, Concasser as a Leader Counter at 4 Events, the Leader's [Activate: Main] before its [When Attacking], OP12-070 Sanji's growth and protection, Reiju as a 7000 [Blocker] and late attacker, and Gum-Gum Giant's DON!! −2 trade-off.",
    },
  ],
};
