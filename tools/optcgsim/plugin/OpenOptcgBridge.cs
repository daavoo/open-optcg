// A BepInEx plugin that lets open-optcg's learned model play one seat of
// OPTCGSim's Solo V Self mode.
//
// At each decision of the model's seat it reads the table, sends it to the
// bridge (`pnpm optcgsim:bridge`, tools/optcgsim/server.ts) and performs the
// move that comes back by making the same calls a click makes: a card click
// goes through `HandleMouseClickCard`, a button press through the button's own
// `ImClicked`. Nothing in the sim's rules is bypassed; when the model's move
// has no click sequence here (a choice inside an effect), the seat waits for
// the person at the table.
//
// Every name below is OPTCGSim 1.45a's. Most of the members the plugin needs
// are private, so they are reached through Harmony's AccessTools; a rename in
// a later sim build shows up as one "missing member" line in the BepInEx log.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using BepInEx;
using BepInEx.Configuration;
using HarmonyLib;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace OpenOptcg.OptcgSimBridge
{
    [BepInPlugin("dev.open-optcg.optcgsim-bridge", "open-optcg model bridge", "0.1.0")]
    public class Plugin : BaseUnityPlugin
    {
        // GameplayState values the model is asked about.
        const int MulliganChoice = 4;
        const int MainAction = 14;
        const int AttachingDon = 15;
        const int SelectingTarget = 17;
        const int WaitOnCounters = 19;
        const int WaitOnBlocker = 20;

        static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

        ConfigEntry<string> bridgeUrl;
        ConfigEntry<int> modelSeat;
        ConfigEntry<float> stepDelay;
        ConfigEntry<KeyboardShortcut> toggleKey;
        ConfigEntry<KeyboardShortcut> seatKey;

        bool active;
        string status = "off";
        GameplayLogicScript gls;
        Task<string> request;
        string requestKey;
        string lastAnsweredKey;
        readonly Queue<Func<bool>> steps = new Queue<Func<bool>>();
        readonly Dictionary<string, GameObject> cardsById = new Dictionary<string, GameObject>();
        float nextAt;

        void Awake()
        {
            bridgeUrl = Config.Bind("Bridge", "Url", "http://127.0.0.1:7788", "Where `pnpm optcgsim:bridge` listens.");
            modelSeat = Config.Bind("Bridge", "Seat", 1, "The seat the model plays: 0 for Player 1, 1 for Player 2.");
            stepDelay = Config.Bind("Bridge", "StepDelay", 0.7f, "Seconds between the model's clicks, so a person can follow them.");
            toggleKey = Config.Bind("Keys", "Toggle", new KeyboardShortcut(KeyCode.F8), "Turns the model on and off.");
            seatKey = Config.Bind("Keys", "SwitchSeat", new KeyboardShortcut(KeyCode.F9), "Switches the seat the model plays.");
            Logger.LogInfo("open-optcg model bridge loaded; F8 in a Solo V Self game hands a seat to the model");
        }

        void Update()
        {
            if (toggleKey.Value.IsDown())
            {
                active = !active;
                steps.Clear();
                status = active ? "on" : "off";
            }
            if (seatKey.Value.IsDown())
            {
                modelSeat.Value = 1 - modelSeat.Value;
                steps.Clear();
            }
            if (!active) return;
            if (gls == null) gls = FindAnyObjectByType<GameplayLogicScript>();
            if (gls == null) return;
            if (gls.e_GameStyle != GameStyle.SoloVSelf)
            {
                status = "Solo V Self only";
                return;
            }
            if (Time.time < nextAt) return;

            if (steps.Count > 0)
            {
                RunStep();
                return;
            }
            if (request != null)
            {
                if (!request.IsCompleted) return;
                ReceiveDecision();
                return;
            }
            AskIfOurDecision();
        }

        void OnGUI()
        {
            if (!active && status == "off") return;
            var seat = modelSeat.Value == 0 ? "P1" : "P2";
            GUI.Label(new Rect(12, 12, 900, 24), $"open-optcg model ({seat}): {status}   [F8 on/off, F9 seat]");
        }

        // ---- When to ask ----------------------------------------------------

        void AskIfOurDecision()
        {
            var game = gls.gsv_CurrentGame;
            if (game == null || game.iPlayerAction != modelSeat.Value) return;
            if (gls.acaActive != null || gls.bOpponentResolving || gls.bForcingOpponentAction) return;
            if (gls.bCardIsMoving) return;
            var pendingAbilities = Get<List<GameObject>>("lgo_ActionChoices");
            if (pendingAbilities != null && pendingAbilities.Count > 0) return;

            string step;
            switch ((int)gls.e_CurrentState)
            {
                case MulliganChoice: step = "mulligan"; break;
                case MainAction: step = "main"; break;
                case WaitOnBlocker: step = "block"; break;
                case WaitOnCounters: step = "counter"; break;
                default: return;
            }
            JObject snapshot;
            try
            {
                snapshot = Snapshot(step);
            }
            catch (Exception error)
            {
                status = "could not read the table: " + error.Message;
                Logger.LogError(error);
                active = false;
                return;
            }
            // The same table twice means the last move changed nothing the
            // snapshot can see -- most often a click the sim refused. Asking
            // again would loop on it, so the seat goes back to the person.
            var key = snapshot.ToString(Formatting.None);
            if (key == lastAnsweredKey)
            {
                status = "the last move did not take; over to you";
                return;
            }
            requestKey = key;
            status = "thinking";
            var body = new StringContent(key, Encoding.UTF8, "application/json");
            request = Http.PostAsync(bridgeUrl.Value.TrimEnd('/') + "/decide", body)
                .ContinueWith(t => t.Result.Content.ReadAsStringAsync().Result);
        }

        void ReceiveDecision()
        {
            var finished = request;
            request = null;
            lastAnsweredKey = requestKey;
            if (finished.IsFaulted)
            {
                status = "no bridge at " + bridgeUrl.Value + " (run `pnpm optcgsim:bridge`)";
                active = false;
                return;
            }
            var decision = JObject.Parse(finished.Result);
            var move = (JObject)decision["move"];
            var summary = (string)decision["summary"] ?? "";
            Logger.LogInfo($"model: {summary} -> {move.ToString(Formatting.None)}");
            if (!Plan(move))
            {
                status = "over to you: " + ((string)move["reason"] ?? summary);
                return;
            }
            status = summary;
        }

        // ---- Reading the table ---------------------------------------------

        JObject Snapshot(string step)
        {
            cardsById.Clear();
            var game = gls.gsv_CurrentGame;
            var players = new JObject();
            for (var seat = 0; seat < 2; seat++)
                players[seat == 0 ? "p1" : "p2"] = Side(gls.Lps_Players[seat], seat == modelSeat.Value);

            var stepJson = new JObject { ["kind"] = step };
            if (step == "block" || step == "counter")
            {
                var attacker = Get<GameObject>("go_Attacker");
                var defender = Get<GameObject>("go_Defender");
                stepJson["attacker"] = Id(attacker);
                stepJson["target"] = Id(defender);
                stepJson["attackPower"] = gls.CardPower(attacker, true, false);
                stepJson["counterPower"] = gls.iCounterAmount;
            }
            return new JObject
            {
                ["version"] = 1,
                ["turn"] = Math.Max(1, game.iPlayerTurnNumber),
                ["turnPlayer"] = game.iPlayerTurn == 0 ? "p1" : "p2",
                ["seat"] = modelSeat.Value == 0 ? "p1" : "p2",
                ["step"] = stepJson,
                ["players"] = players,
            };
        }

        JObject Side(PlayerState player, bool mine)
        {
            var leader = player.Lgo_MyLeader.FirstOrDefault();
            var deckList = new JArray();
            foreach (var zone in new[] { player.Lgo_MyDeck, player.Lgo_MyHand, player.Lgo_MyDeploy, player.Lgo_MyStage, player.Lgo_MyLifeDeck, player.Lgo_MyTrash })
                foreach (var card in zone)
                    if (card != null) deckList.Add(CardNumber(card));

            var don = player.Lgo_MyDonCostArea.Where(d => d != null).ToList();
            return new JObject
            {
                // Every one of the seat's 50 is somewhere on the table, so the
                // list is read off the zones rather than the deck file.
                ["deckList"] = deckList,
                ["leader"] = Field(leader),
                ["hand"] = mine ? (JToken)new JArray(player.Lgo_MyHand.Where(c => c != null).Select(Card)) : player.Lgo_MyHand.Count,
                ["characters"] = new JArray(player.Lgo_MyDeploy.Where(c => c != null).Select(Field)),
                ["stage"] = player.Lgo_MyStage.FirstOrDefault(c => c != null) is GameObject stage
                    ? new JObject { ["id"] = Id(stage), ["cardNumber"] = CardNumber(stage), ["rested"] = Live(stage).bTapped }
                    : null,
                ["trash"] = new JArray(player.Lgo_MyTrash.Where(c => c != null).Select(Card)),
                ["life"] = player.Lgo_MyLifeDeck.Count,
                ["deckCount"] = player.Lgo_MyDeck.Count,
                ["don"] = new JObject
                {
                    ["active"] = don.Count(d => !Live(d).bTapped),
                    ["rested"] = don.Count(d => Live(d).bTapped),
                },
            };
        }

        JObject Card(GameObject card) => new JObject { ["id"] = Id(card), ["cardNumber"] = CardNumber(card) };

        JObject Field(GameObject card)
        {
            var live = Live(card);
            var logic = card.GetComponent<CardLogicScript>();
            return new JObject
            {
                ["id"] = Id(card),
                ["cardNumber"] = CardNumber(card),
                ["rested"] = live.bTapped,
                ["don"] = logic.lgo_AttachedDon?.Count ?? 0,
                ["power"] = gls.CardPower(card, false, false),
                ["playedThisTurn"] = live.bSummonSick,
            };
        }

        string Id(GameObject card)
        {
            var id = card.GetInstanceID().ToString();
            cardsById[id] = card;
            return id;
        }

        static LiveCard Live(GameObject card) => card.GetComponent<CardLogicScript>().myCard;

        static string CardNumber(GameObject card) => Live(card).cardDef.cardID;

        // ---- Performing a move ---------------------------------------------

        // Queues the clicks for a move, each a step that reports whether it
        // could be made. Returns false for a move with no clicks here.
        bool Plan(JObject move)
        {
            var kind = (string)move["kind"];
            GameObject card(string field) => cardsById.TryGetValue((string)move[field] ?? "", out var go) ? go : null;
            switch (kind)
            {
                case "keep":
                    steps.Enqueue(() => Press(ButtonChoiceType.StartingHand_Keep));
                    return true;
                case "mulligan":
                    steps.Enqueue(() => Press(ButtonChoiceType.StartingHand_Mulligan));
                    return true;
                case "play":
                    {
                        var target = card("card");
                        steps.Enqueue(() => Click(target));
                        // A Character or Stage offers Deploy; an Event offers
                        // its ability as a CardAction instead.
                        steps.Enqueue(() => Press(ButtonChoiceType.Deploy) || Press(ButtonChoiceType.CardAction));
                        return true;
                    }
                case "attach-don":
                    {
                        var target = card("target");
                        steps.Enqueue(() =>
                        {
                            var don = gls.CurrentPlayer().Lgo_MyDonCostArea.FirstOrDefault(d => d != null && !Live(d).bTapped);
                            return Click(don) && (int)gls.e_CurrentState == AttachingDon;
                        });
                        steps.Enqueue(() => Click(target));
                        // Only offered with the sim's "confirm DON!!" setting on.
                        steps.Enqueue(() => { Press(ButtonChoiceType.ConfirmDon); return true; });
                        return true;
                    }
                case "attack":
                    {
                        var attacker = card("attacker");
                        var target = card("target");
                        steps.Enqueue(() => Click(attacker));
                        steps.Enqueue(() => Press(ButtonChoiceType.Attack) && (int)gls.e_CurrentState == SelectingTarget);
                        steps.Enqueue(() => Click(target));
                        return true;
                    }
                case "activate":
                    {
                        var source = card("card");
                        if (move["target"] != null) return false;
                        steps.Enqueue(() => Click(source));
                        steps.Enqueue(() => Press(ButtonChoiceType.CardAction));
                        return true;
                    }
                case "block":
                    {
                        var blocker = card("blocker");
                        steps.Enqueue(() => Click(blocker));
                        return true;
                    }
                case "counter":
                    {
                        var counter = card("card");
                        steps.Enqueue(() => Click(counter));
                        // With "confirm counter" on, or for a [Counter] Event.
                        steps.Enqueue(() => { if (!Press(ButtonChoiceType.ConfirmCounter)) Press(ButtonChoiceType.CardAction); return true; });
                        return true;
                    }
                case "no-block":
                    steps.Enqueue(() => Press(ButtonChoiceType.NoBlocker));
                    return true;
                case "no-counter":
                    steps.Enqueue(() => Press(ButtonChoiceType.ResolveAttack));
                    return true;
                case "end-turn":
                    steps.Enqueue(() => Press(ButtonChoiceType.EndTurn));
                    steps.Enqueue(() => { Press(ButtonChoiceType.ConfirmEndTurn); return true; });
                    return true;
                default:
                    return false;
            }
        }

        void RunStep()
        {
            var step = steps.Dequeue();
            bool ok;
            try
            {
                ok = step();
            }
            catch (Exception error)
            {
                Logger.LogError(error);
                ok = false;
            }
            if (!ok)
            {
                steps.Clear();
                status = "a click did not take; over to you";
            }
            nextAt = Time.time + stepDelay.Value;
        }

        bool Click(GameObject card)
        {
            if (card == null) return false;
            AccessTools.Method(typeof(GameplayLogicScript), "HandleMouseClickCard").Invoke(gls, new object[] { card });
            return true;
        }

        // Presses the first visible choice button of that type, the way a
        // click on it does.
        bool Press(ButtonChoiceType type)
        {
            foreach (var name in new[] { "go_ChoiceButton1", "go_ChoiceButton2", "go_ChoiceButton3", "go_ChoiceButton4" })
            {
                var button = Get<GameObject>(name);
                if (button == null || !button.activeInHierarchy) continue;
                var script = button.GetComponent<ChoiceButtonScript>();
                if (script == null || script.myType != type) continue;
                script.ImClicked();
                return true;
            }
            return false;
        }

        T Get<T>(string field) => (T)AccessTools.Field(typeof(GameplayLogicScript), field).GetValue(gls);
    }
}
