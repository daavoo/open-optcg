import type { DeckStrategyDossier } from "./types.js";

export const op18LuffyTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green) Monkey.D.Luffy - 2nd Place DuelVoyager Weekly 2026-11-03",
  archetype:
    "Green OP18-022 Monkey.D.Luffy as a reset deck: the Leader stands itself up to attack twice a turn, and {Water Seven} Straw Hats -- OP18-031 Nico Robin, OP18-036 Monkey.D.Luffy and OP18-118 Monkey.D.Luffy -- set it active again at the end of your turn, so it still stands to defend, at 7000 behind OP18-027 Zoro & Sogeking. Around that engine the deck rests the opponent's Characters (OP14-031 Nami, OP17-029 Hongo, OP12-037), K.O.s rested ones with EB04-018 Megalo, and keeps others from being rested, so they can neither attack nor block (OP14-033 Perona, Zoro & Sogeking, OP18-118 Luffy).",
  gamePlan: [
    "The Leader's [DON!! x3] [When Attacking] is optional and once per turn: set the Leader active, and it then skips your next Refresh Phase. Attack with the Leader holding 3 given DON!!, stand it up, and attack with it again.",
    "The skipped Refresh only costs something if the Leader ends your turn rested. This deck's reset pieces set it active at the end of your turn: OP18-031 Nico Robin sets up to 1 {Water Seven} card and 1 DON!! active, OP18-118 Luffy sets up to 1 Water Seven card active, and OP18-036 Luffy can trash itself to draw 1 and set the Leader active. The Leader is a Water Seven card, so with one of them on the field the second Leader attack is free -- take it every turn.",
    "Without a reset piece on the field, the second attack leaves the Leader rested through the opponent's turn and your whole next turn. Take it then only when the extra hit takes a Life that matters -- the opponent at 2 or fewer, or a turn you can close.",
    "OP18-027 Zoro & Sogeking keeps the reset Leader safe: on the opponent's turn an active [Monkey.D.Luffy] Leader holding 3 or more given DON!! has 7000 base power. Given DON!! stay on the Leader until your Refresh Phase, so the Leader that attacked twice with 3 given and was set active at your end of turn defends at 7000.",
    "Rest, then K.O.: OP14-031 Nami ([Blocker]) rests up to 2 of the opponent's Characters with cost 8 or less, OP17-029 Hongo ([Blocker]) rests up to 2 with cost 2 or less, and OP12-037's [Main] rests 3 of your DON!! to rest up to 2 of their Characters or DON!!. EB04-018 Megalo rests itself to K.O. a rested Character with 8000 power or less. A rested Character cannot block, so resting their [Blocker]s also opens the Leader's two attacks.",
    "Lock what you cannot remove: OP14-033 Perona keeps up to 2 Characters with cost 5 or less from being rested, Zoro & Sogeking one with cost 6 or less, and OP18-118 Luffy any one, each until the end of the opponent's next turn. A Character that cannot be rested cannot attack or block -- but your own rest effects and Megalo cannot reach it either, so lock the ones you will not K.O.",
    "DON!! comes back: Zoro & Sogeking sets 2 DON!! active on play, OP18-118 Luffy sets 3 (a 9-cost that costs 6), Hongo sets 1, and OP14-031 Nami sets up to 5 active at the end of the turn, which leaves DON!! standing for OP12-037's Counter on the opponent's turn.",
  ],
  mulligan: [
    "Keep a hand with a Character at 4 or less -- the 4-cost rest and K.O. bodies, EB02-017 Nami or OP18-036 Luffy -- and prefer one with a reset piece or a way to find one: Robin and OP18-036 Luffy, or EB02-017 Nami and OP18-038 Shoot Down That Flag., which look 5 deep for a {Straw Hat Crew} card.",
    "A hand of Perona, Zoro & Sogeking and the 9-cost Luffy with nothing at 4 or less takes a new hand.",
  ],
  priorities: [
    "Get a reset piece on the field before the turn the Leader attacks twice: Robin is the one that stays, OP18-036 Luffy is spent when it resets the Leader, and OP18-118 Luffy is the late one.",
    "OP18-036 Luffy's reset trashes it, so use it on a turn the Leader attacked twice and no Robin or 9-cost Luffy is on the field; with one of those already out, keep the 2-cost as a +2000 Counter body.",
    "Rest before you K.O.: play OP14-031 Nami or Hongo, or OP12-037's [Main], to rest their Characters, then Megalo K.O.s one of 8000 power or less. Their Characters are also rested after they attack.",
    "Do not lock a Character with Perona, Zoro & Sogeking or the 9-cost Luffy that you mean to rest or K.O. this turn: a Character that cannot be rested is out of reach of Megalo and the rest effects too.",
    "Robin, on the opponent's turn, can rest itself instead of one of your Characters being removed by their effect: keep it active when the Character it would save matters.",
    "OP18-030 Nami is a 4-cost 6000 that loses 2000 while rested on the opponent's turn: attack with it when the swing matters, keep it back when you need the body to hold up.",
    "Yokozuna and Hongo are the cheap [Blocker]s; when Yokozuna is K.O.'d it rests up to 1 of the opponent's cards, so block with it before an attacker that has not swung yet.",
    "Counters: Megalo, Hongo, OP18-030 Nami and OP18-036 Luffy give +2000; EB02-017 Nami, OP14-031 Nami, Perona, Robin and Yokozuna give +1000; Zoro & Sogeking and the 9-cost Luffy give nothing. OP12-037 as a [Counter] gives the Leader +3000.",
  ],
  commonVariants: [
    "Other OP-18 builds of this Leader play OP18-026 Sanji, OP16-035 Roronoa Zoro, OP13-037 Roronoa Zoro and OP18-029 Tony Tony.Chopper, with OP18-039 Gum-Gum Giant Axe and OP16-039 Gum-Gum Twin Jet Pistol as Events; some add OP18-024 Kokoro, OP18-025 Gonbe and OP18-028 Chimney, which also set the Leader active at the end of your turn.",
    "A DON!!-ramp build without the reset package runs the FILM and Egghead Straw Hats that set DON!! active, OP12-029 Shimotsuki Kouzaburou and OP08-023 Carrot to rest and lock, and Chopper to load the Leader with DON!!; it spends the Leader's restand sparingly.",
  ],
  commonCombos: [
    "Attack with the Leader holding 3 given DON!!, stand it up and attack again; at the end of your turn Robin or the 9-cost Luffy sets it active, and with Zoro & Sogeking out it defends at 7000.",
    "OP14-031 Nami rests two of their Characters and Megalo K.O.s one; the other cannot block your Leader's two attacks.",
    "OP18-118 Luffy sets 3 DON!! active as it lands: spend them on Hongo or Megalo the same turn.",
  ],
  keyCardNumbers: [
    "OP18-022",
    "OP18-031",
    "OP18-036",
    "OP18-118",
    "OP18-027",
    "OP14-031",
    "EB04-018",
    "OP14-033",
    "OP17-029",
  ],
  counterplay: [
    "The reset pieces are what make the Leader's second attack free: remove Robin and the 9-cost Luffy, and a Leader that attacks twice stays rested through your turn and theirs.",
    "Zoro & Sogeking's 7000 needs the Leader active with 3 given DON!! -- remove Zoro & Sogeking and the Leader defends at 5000.",
    "Their K.O. reaches only rested Characters of 8000 power or less; keep larger bodies back, and a Character they lock against resting is also safe from their rest effects.",
    "Robin rests itself to save one of their Characters from your effect on your turn; draw it out with a cheap removal effect first.",
  ],
  sources: [
    {
      url: "https://www.duelvoyager.com/deck/view/nw5aki09O9IE",
      retrievedAt: "2026-11-15",
      note: "The deck's own 50: BerryTCG's DuelVoyager share, shown on the BerryTCG YouTube channel as the 2nd-place list of a DuelVoyager online weekly on 3 Nov 2026.",
    },
    {
      url: "https://play.limitlesstcg.com/tournament/6af5879bdcbca32da6c4f034/standings",
      retrievedAt: "2026-11-17",
      note: "Other OP18-022 lists at ChinoizeCup #136 on 16 Nov 2026, the first variants line.",
    },
    {
      url: "https://optcgdeckexplorer.com/",
      retrievedAt: "2026-11-15",
      note: "An automated builder's DON!!-ramp list for the Leader, the second variants line.",
    },
  ],
};
