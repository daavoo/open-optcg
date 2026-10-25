import type { DeckStrategyDossier } from "./types.js";

export const op17ShanksTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green) Shanks - 16th Place Rumble League #9",
  archetype:
    "Green Shanks rest-lock control behind OP17-020, as the OP-17 field builds it: rest the opponent's Characters, keep them rested with the Leader and OP08-036 Electrical Luna, K.O. them while they are down, and protect your own board with OP15-035 Laboon and OP17-021 Crone Oli.",
  gamePlan: [
    "Rest an opposing Character with a Character effect, then spend the Leader's [Activate: Main] -- trash 1 card from hand or rest 1 DON!! -- to stop that Character becoming active in the opponent's next Refresh Phase. A Character that never wakes is a body removed without removal.",
    "Every meaningful play in the list rests something on the way in: OP17-029 Hongo rests two cost-2-or-less bodies and refunds a DON!!, OP17-031 Yasopp draws and rests a cost-8-or-less body, OP17-027 Benn.Beckman draws and rests two of anything.",
    "OP08-036 Electrical Luna is the Leader's clause for the whole board: every rested opposing Character of cost 7 or less stays rested through their next Refresh Phase. Cast it after Beckman or OP17-022 Shanks has rested several.",
    "Removal only reaches *rested* Characters. OP17-036 rests one and then K.O.s two rested bodies of cost 6 or less for six rested DON!!. Rest first, then shoot.",
    "OP17-022 Shanks at 10 DON!! is the finisher: set 2 DON!! as active, rest the opponent's entire board, and attack with [Rush] the same turn. Follow it with the Leader ability or Electrical Luna so their board stays down.",
    "Laboon and Crone Oli keep your board on the field: when your opponent's effect would remove one of your Characters, you may rest your own cards instead -- 2 for a Character of 7000 base power or less with Laboon, 1 for a {Red-Haired Pirates} Character with Crone Oli.",
  ],
  mulligan: [
    "Keep a hand with an early searcher -- OP17-032 Limejuice, OP17-033 Lucky.Roux or OP12-034 Perona -- plus at least one rest effect to give the Leader ability a target.",
    "Throw back hands that are only large bodies: the deck needs the cheap rest effects to make its removal legal.",
  ],
  priorities: [
    "Before using the Leader ability, check that a rested opposing Character is actually worth freezing. The cost is a card or a DON!! every turn, so freeze an attacker or a Blocker rather than a spent 1-drop.",
    "Prefer paying the Leader cost with a rested DON!! over a card when the DON!! would otherwise go unspent this turn; prefer trashing a card when the DON!! is needed to develop.",
    "OP12-034 Perona looks at 5 for a <Slash> card or a green Event, because your Leader is <Slash>: OP17-022 Shanks, OP10-030 Smoker, OP17-036 or Electrical Luna. Limejuice and Lucky.Roux find {Red-Haired Pirates} cards.",
    "OP17-036 is a K.O. spell that costs six of your DON!! for the turn, so it is the whole turn: cast it when two rested bodies of cost 6 or less are on their board and nothing you would develop instead matters more. Its [Counter] half is +4000 on a [Shanks], which the Leader is, so it is also the deck's biggest defensive card.",
    "ST32-002 Kouzuki Oden draws and stops one of their Characters with a base cost of 6 or less becoming rested until their next End Phase, which is the lock in reverse: point it at a Blocker or a body they need to use, and it cannot be rested to block or attack.",
    "OP17-033 Lucky.Roux's [On Your Opponent's Attack] trashes itself to rest their attacking Leader or a Character, so a Lucky.Roux left on the board is a Counter that stops an attack outright. Keep one standing when you are low on Life.",
    "OP10-030 Smoker has [Banish], so its hits skip the opponent's [Trigger]s, and its [Activate: Main] sets a DON!! active; once used, Character effects cannot set DON!! active this turn, so take Hongo's and OP17-022's refunds first.",
    "Laboon and Crone Oli cost 1 and carry a 2000 Counter. Keep one on the field once you have a Character worth protecting; the replacement rests your own cards, so leave something spare to rest.",
    "OP17-038's [Main] rests 4 of your own cards to rest one of theirs. Use it as the last play of a turn, on cards that were done for the turn; its [Counter] is +3000 for a card from hand.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader runs OP17-025 Building Snake, ST16-004 Shanks, ST24-004 Law & Bepo, OP17-024 Howling Gab, OP17-026 Fugar and OP17-037 where this list runs Laboon, Perona, Smoker and Electrical Luna, and it plays two each of Crone Oli and OP17-036 to this list's four.",
  ],
  commonCombos: [
    "Hongo or Benn.Beckman rests a body, then the Leader ability keeps it rested through Refresh; OP17-036 K.O.s it on a later turn while it is still down.",
    "OP17-022 Shanks rests the whole board with [Rush], then Electrical Luna keeps every rested Character of cost 7 or less down for the following turn as well.",
    "OP17-031 Yasopp's [End of Your Turn] sets a {Red-Haired Pirates} Character active again, so a body used for an activation cost or rested by Crone Oli is available to block on the opponent's turn.",
    "Beckman rests two of their bodies, then OP17-036 rests a third and K.O.s two of them at once.",
  ],
  keyCardNumbers: [
    "OP17-020",
    "OP17-022",
    "OP17-027",
    "OP17-029",
    "OP17-031",
    "OP17-036",
    "OP08-036",
    "OP15-035",
  ],
  counterplay: [
    "Do not leave a key Character rested if it can be avoided: a rested body is both frozen by the Leader and Electrical Luna and the only legal target for OP17-036.",
    "The Leader ability costs a card or a DON!! every activation, so trading resources and forcing it to be used on low-value targets is how the deck runs dry.",
    "Play around 10 DON!! turn: OP17-022 rests the whole board and attacks immediately, so hold Counters rather than committing every body before it lands.",
    "Laboon and Crone Oli turn your removal into a rest of their cards. K.O. them first, or remove in battle, which they do not stop.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6aa39894ab080c8c95800dcd/standings",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "ShanksAlSole" took to 16th of 32 at [OP17] Win a box | Rumble league #9, an online event played on 17 Sep 2026.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_112.php",
      retrievedAt: "2026-09-20",
      note: "Bandai's feature deck for OP17-020, the source of the variants line and of the rest-then-lock plan as this dossier describes it.",
    },
  ],
};
