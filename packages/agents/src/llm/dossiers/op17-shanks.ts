import type { DeckStrategyDossier } from "./types.js";

export const op17ShanksDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green) Shanks - Official Feature Deck",
  archetype: "OP-17 Green Shanks rest-lock control",
  gamePlan: [
    "Rest an opposing Character with a Character effect, then spend the Leader's [Activate: Main] -- trash 1 card from hand or rest 1 DON!! -- to stop that Character becoming active in the opponent's next Refresh Phase. A Character that never wakes is a body removed without removal.",
    "Every meaningful play in the list rests something on the way in: OP17-029 Hongo rests two cost-2-or-less bodies and refunds a DON!!, OP17-031 Yasopp draws and rests a cost-8-or-less body, OP17-027 Benn.Beckman draws and rests two of anything, OP17-024 Howling Gab rests one of anything.",
    "Removal only reaches *rested* Characters. ST16-004 Shanks K.O.s one on play, OP17-025 Building Snake K.O.s one of cost 6 or less when it is K.O.'d, and OP17-036 rests one and then K.O.s two rested bodies of cost 6 or less for six rested DON!!. Rest first, then shoot.",
    "OP17-022 Shanks at 10 DON!! is the finisher: set 2 DON!! as active, rest the opponent's entire board, and attack with [Rush] the same turn. Follow it with the Leader ability so the biggest body stays down.",
    "ST24-004 Law & Bepo is the Leader's clause on a body: the Character it rests skips the opponent's next Refresh Phase without the Leader paying a card or a DON!! for it, and if they then have two or more rested Characters the Leader is +2000 through their next End Phase.",
  ],
  mulligan: [
    "Keep a hand with an early searcher -- OP17-032 Limejuice, OP17-033 Lucky.Roux or the OP17-037 Event -- plus at least one rest effect to give the Leader ability a target.",
    "Throw back hands that are only large bodies: the deck needs the cheap rest effects to make its removal legal.",
  ],
  priorities: [
    "Before using the Leader ability, check that a rested opposing Character is actually worth freezing. The cost is a card or a DON!! every turn, so freeze an attacker or a Blocker rather than a spent 1-drop.",
    "Prefer paying the Leader cost with a rested DON!! over a card when the DON!! would otherwise go unspent this turn; prefer trashing a card when the DON!! is needed to develop.",
    "Hold ST16-004 until something worth K.O.ing is already rested. Playing it into an all-active board wastes a 9-cost body -- its [On Play] offers no target at all in that position.",
    "OP17-025 Building Snake's [Activate: Main] gives one rested DON!! to your [Shanks] Leader each turn, so it turns the DON!! the Leader ability rested into +1000 on your own Leader. Use it every turn it stands; the [On K.O.] is why the opponent will not want to remove it.",
    "OP17-036 is a K.O. spell that costs six of your DON!! for the turn, so it is the whole turn: cast it when two rested bodies of cost 6 or less are on their board and nothing you would develop instead matters more. Its [Counter] half is +4000 on a [Shanks], which the Leader is, so it is also the deck's biggest defensive card.",
    "ST32-002 Kouzuki Oden draws and stops one of their Characters becoming rested until their next End Phase, which is the lock in reverse: point it at a Blocker or a body they need to use, and it cannot be rested to block or attack.",
    "OP17-033 Lucky.Roux's [On Your Opponent's Attack] trashes itself to rest their attacking Leader or a Character, so a Lucky.Roux left on the board is a Counter that stops an attack outright. Keep one standing when you are low on Life.",
  ],
  commonVariants: [
    "Bandai's list runs two copies each of OP17-021 Crone Oli, OP17-026 Fugar, OP17-024 Howling Gab, ST16-004, ST24-004 and the two situational Events; player lists tend to consolidate those two-ofs into four-ofs of ST16-004 and OP17-034 Rockstar.",
    "ST24-004 Law & Bepo and ST32-002 Kouzuki Oden are the off-tribe slots; OP13-031 Trafalgar Law is the other Green body lists reach for in their place.",
  ],
  commonCombos: [
    "Hongo or Benn.Beckman rests a body, then the Leader ability keeps it rested through Refresh; ST16-004 K.O.s it on a later turn while it is still down.",
    "OP17-022 Shanks rests the whole board with [Rush], and the Leader ability then denies the opponent their best blocker for the following turn as well.",
    "OP17-031 Yasopp's [End of Your Turn] sets a {Red-Haired Pirates} Character active again, so a body used for an activation cost is available to block on the opponent's turn.",
    "Howling Gab or Law & Bepo rests two of their bodies across two turns, then OP17-036 K.O.s both at once for the six DON!! the deck would otherwise spend on one Character.",
  ],
  keyCardNumbers: [
    "OP17-020",
    "OP17-022",
    "OP17-027",
    "OP17-029",
    "OP17-031",
    "OP17-025",
    "ST16-004",
  ],
  counterplay: [
    "Do not leave a key Character rested if it can be avoided: a rested body is both frozen by the Leader and the only legal target for ST16-004, Building Snake and OP17-036.",
    "The Leader ability costs a card or a DON!! every activation, so trading resources and forcing it to be used on low-value targets is how the deck runs dry.",
    "Play around 10 DON!! turn: OP17-022 rests the whole board and attacks immediately, so hold Counters rather than committing every body before it lands.",
    "K.O.ing OP17-025 Building Snake gives them a K.O. of their own on a rested cost-6-or-less Character; remove it while your board is active, or not at all.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_112.php",
      retrievedAt: "2026-09-20",
      note: "Bandai's feature deck for OP17-020, posted 28 August 2026: all 50 slots of this list, and the stated plan of resting the opponent's Characters and keeping them rested with the Leader.",
    },
    {
      url: "https://opdeckguide.com/deck-guides/shanks-op17/",
      retrievedAt: "2026-08-21",
      note: "Pre-release guide for OP17-020: the rest-then-remove game plan, the searcher-plus-rest-effect mulligan, and the player-list variants named above.",
    },
    {
      url: "https://www.thornberrymedia.com/post/op-17-shanks-deck-list",
      retrievedAt: "2026-08-21",
      note: "Independent pre-release assessment ranking OP17-020 the strongest OP-17 Leader; corroborates the archetype, not the counts.",
    },
  ],
};
