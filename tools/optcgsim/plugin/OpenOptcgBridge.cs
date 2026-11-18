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
// Every name below is OPTCGSim 1.45b's. Most of the members the plugin needs
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
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace OpenOptcg.OptcgSimBridge
{
    [BepInPlugin("dev.open-optcg.optcgsim-bridge", "open-optcg model bridge", "0.1.0")]
    public class Plugin : BaseUnityPlugin
    {
        // GameplayState values the model is asked about.
        const int MulliganChoice = 4;
        const int DrawCardWait = 10;
        const int DrawDonWait = 12;
        const int MainAction = 14;
        const int AttachingDon = 15;
        const int SelectingTarget = 17;
        const int WaitOnCounters = 19;
        const int WaitOnBlocker = 20;

        static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

        ConfigEntry<string> bridgeUrl;
        ConfigEntry<int> modelSeat;
        ConfigEntry<float> stepDelay;

        static Plugin instance;

        bool active;
        string status = "off";
        GameplayLogicScript gls;
        float nextLookAt;
        Rect panel = new Rect(12, 12, 380, 110);
        // A Solo V Self game is on the table: set when the sim starts one, and
        // cleared when it goes back to the main menu. The menu and the game
        // share a scene, so the GameplayLogicScript alone does not say which.
        bool inSoloGame;
        // The game being set up was started from "Solo vs AI", so the model
        // takes its seat when it begins.
        bool aiRequested;
        GameObject aiMenuButton;
        GameObject soloMenuButton;
        // The model gave the current decision back to the person (a move it
        // cannot click, or a click the sim refused); cleared on its next turn
        // to decide.
        bool handedBack;
        // Set while the plugin itself clicks, so its clicks pass the block on
        // the person's.
        static bool ownClick;
        // A Solo vs AI game has just been dealt and its decks are not checked
        // yet; the model does nothing until they are.
        bool deckCheckPending;
        // Why the last Solo vs AI game was called off, shown on the main menu.
        string menuMessage;
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
            instance = this;
            try
            {
                new Harmony("dev.open-optcg.optcgsim-bridge").PatchAll(typeof(MenuPatches));
            }
            catch (Exception error)
            {
                Logger.LogError("could not hook the sim's menu: " + error.Message);
            }
            Logger.LogInfo("open-optcg model bridge loaded; \"Solo vs AI\" is on the main menu");
        }

        bool InSoloGame()
        {
            if (!inSoloGame) return false;
            // Leaving a game reloads the scene, which destroys the table the
            // game started on.
            if (gls == null)
            {
                OnMainMenu();
                return false;
            }
            return gls.e_GameStyle == GameStyle.SoloVSelf;
        }

        void OnSoloGameStarted()
        {
            gls = FindAnyObjectByType<GameplayLogicScript>();
            inSoloGame = gls != null;
            active = inSoloGame && aiRequested;
            // Solo vs AI seats the model as the sim's "Opponent", across the
            // table from the person.
            if (active) modelSeat.Value = 1;
            deckCheckPending = active;
            if (active) menuMessage = null;
            aiRequested = false;
            steps.Clear();
            request = null;
            lastAnsweredKey = null;
            handedBack = false;
            status = active ? "waiting for its turn" : "off";
        }

        void OnMainMenu()
        {
            inSoloGame = false;
            active = false;
            steps.Clear();
            request = null;
        }

        // The sim's menu methods: "Start" on the Solo V Self deck screen and a
        // loaded save state begin a game; going back to the main menu ends one.
        [HarmonyPatch]
        static class MenuPatches
        {
            [HarmonyPostfix, HarmonyPatch(typeof(HostJoinScript), "SoloSelf")]
            static void SoloStarted() => instance?.OnSoloGameStarted();

            [HarmonyPostfix, HarmonyPatch(typeof(HostJoinScript), "LoadSaveState")]
            static void SaveStateLoaded() => instance?.OnSoloGameStarted();

            [HarmonyPrefix, HarmonyPatch(typeof(HostJoinScript), "LoadMain")]
            static void MainMenuLoading() => instance?.OnMainMenu();

            [HarmonyPostfix, HarmonyPatch(typeof(HostJoinScript), "BackToMain")]
            static void BackedOut() => instance?.OnMainMenu();

            // Solo V Self lets one person click for both seats; while the
            // model holds a decision, the person's clicks on cards and on the
            // choice buttons are dropped so the two cannot interleave.
            [HarmonyPrefix, HarmonyPatch(typeof(GameplayLogicScript), "HandleMouseClickCard")]
            static bool CardClicked() => PersonMayClick();

            [HarmonyPrefix, HarmonyPatch(typeof(ChoiceButtonScript), "ImClicked")]
            static bool ChoiceClicked() => PersonMayClick();

            static bool PersonMayClick() => ownClick || instance == null || !instance.ModelHasTheTable();
        }

        // ---- Deck check --------------------------------------------------------

        // A Solo vs AI game is only played with decks whose every card the
        // engine knows: one unknown card, on either side, leaves the model
        // unable to read the table for the whole game. The decks are read once
        // the sim has dealt them, and a game that fails goes back to the menu
        // with the cards named.
        bool DecksArePlayable()
        {
            var decks = new JObject();
            for (var seat = 0; seat < 2; seat++)
            {
                var player = gls.Lps_Players[seat];
                var list = new JArray();
                foreach (var zone in new[] { player.Lgo_MyLeader, player.Lgo_MyDeck, player.Lgo_MyHand, player.Lgo_MyDeploy, player.Lgo_MyStage, player.Lgo_MyLifeDeck, player.Lgo_MyTrash })
                    foreach (var card in zone)
                        if (card != null) list.Add(CardNumber(card));
                decks[seat == 0 ? "p1" : "p2"] = list;
            }
            string problem;
            try
            {
                var body = new StringContent(new JObject { ["decks"] = decks }.ToString(Formatting.None), Encoding.UTF8, "application/json");
                var call = Http.PostAsync(bridgeUrl.Value.TrimEnd('/') + "/check", body);
                if (!call.Wait(TimeSpan.FromSeconds(3))) throw new TimeoutException();
                var missing = (JObject)JObject.Parse(call.Result.Content.ReadAsStringAsync().Result)["missing"];
                var ai = modelSeat.Value == 0 ? "p1" : "p2";
                var you = modelSeat.Value == 0 ? "p2" : "p1";
                var parts = new List<string>();
                if (missing[ai] is JArray aiMissing && aiMissing.Count > 0)
                    parts.Add("the AI's deck has " + string.Join(", ", aiMissing));
                if (missing[you] is JArray yourMissing && yourMissing.Count > 0)
                    parts.Add("your deck has " + string.Join(", ", yourMissing));
                problem = parts.Count == 0
                    ? null
                    : "The AI can't play with these decks: " + string.Join("; ", parts)
                        + ". Pick decks made of cards it knows.";
            }
            catch (Exception)
            {
                problem = "No AI bridge at " + bridgeUrl.Value + ". Start it with `pnpm optcgsim:bridge`, then try again.";
            }
            if (problem == null) return true;
            Logger.LogWarning(problem);
            menuMessage = problem;
            OnMainMenu();
            var menu = FindAnyObjectByType<HostJoinScript>();
            if (menu != null) AccessTools.Method(typeof(HostJoinScript), "LoadMain").Invoke(menu, null);
            return false;
        }

        // ---- The "Solo vs AI" menu button -------------------------------------

        // A copy of the sim's own Solo V Self button, beside it: it opens the
        // same deck screen, and marks the game it starts as one the model plays.
        void AddMenuButton()
        {
            if (aiMenuButton != null || Time.unscaledTime < nextLookAt) return;
            nextLookAt = Time.unscaledTime + 1f;
            var menu = FindAnyObjectByType<HostJoinScript>();
            if (menu == null) return;
            var solo = (GameObject)AccessTools.Field(typeof(HostJoinScript), "go_SoloVSelf").GetValue(menu);
            var soloButton = solo == null ? null : solo.GetComponent<Button>();
            if (soloButton == null) return;

            soloMenuButton = solo;
            aiMenuButton = Instantiate(solo, solo.transform.parent);
            aiMenuButton.name = "SoloVsAI";
            aiMenuButton.transform.SetSiblingIndex(solo.transform.GetSiblingIndex() + 1);
            if (solo.transform.parent.GetComponent<LayoutGroup>() == null)
            {
                var rect = (RectTransform)aiMenuButton.transform;
                rect.anchoredPosition -= new Vector2(0, rect.rect.height * 1.15f);
            }
            foreach (var text in aiMenuButton.GetComponentsInChildren<TMP_Text>(true)) text.text = "Solo vs AI";
            foreach (var text in aiMenuButton.GetComponentsInChildren<Text>(true)) text.text = "Solo vs AI";

            // A fresh event rather than the copied one, so the copy runs the
            // original's handlers (inspector-wired or added in code) first and
            // the request survives them.
            var button = aiMenuButton.GetComponent<Button>();
            button.onClick = new Button.ButtonClickedEvent();
            button.onClick.AddListener(() =>
            {
                soloButton.onClick.Invoke();
                aiRequested = true;
            });
            soloButton.onClick.AddListener(() => aiRequested = false);
            aiMenuButton.SetActive(solo.activeSelf);
        }

        void Update()
        {
            AddMenuButton();
            // The sim hides and shows its menu buttons by screen; the copy
            // follows the original.
            if (aiMenuButton != null && soloMenuButton != null && aiMenuButton.activeSelf != soloMenuButton.activeSelf)
                aiMenuButton.SetActive(soloMenuButton.activeSelf);
            if (!InSoloGame()) return;
            if (deckCheckPending)
            {
                deckCheckPending = false;
                if (!DecksArePlayable()) return;
            }
            Trace();
            if (!active) return;
            if (Time.unscaledTime < nextAt) return;

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
            if (PressTurnStep()) return;
            AskIfOurDecision();
        }

        void OnGUI()
        {
            if (!InSoloGame())
            {
                if (menuMessage == null) return;
                var box = new Rect(Screen.width / 2f - 300, Screen.height / 2f - 90, 600, 180);
                GUILayout.BeginArea(box, GUI.skin.box);
                GUILayout.Label("Solo vs AI");
                GUILayout.Label(menuMessage);
                GUILayout.FlexibleSpace();
                if (GUILayout.Button("OK")) menuMessage = null;
                GUILayout.EndArea();
                return;
            }
            // A window, so it can be dragged off whatever part of the sim's UI
            // it covers.
            panel = GUI.Window(0x6f70, panel, DrawPanel, "AI opponent (open-optcg)");
        }

        void DrawPanel(int id)
        {
            // The sim's own log calls Player 1 "You" (the bottom of the table)
            // and Player 2 "Opponent" (the top), so the panel does too.
            var side = modelSeat.Value == 1 ? "Opponent (top)" : "You (bottom)";
            GUILayout.Label(active ? $"The AI plays: {side}" : "The AI is off");
            GUILayout.Label(status, GUILayout.MinHeight(36));
            GUILayout.BeginHorizontal();
            if (GUILayout.Button(active ? "Stop the AI" : "Start the AI"))
            {
                active = !active;
                steps.Clear();
                request = null;
                handedBack = false;
                status = active ? "waiting for its turn" : "off";
            }
            if (GUILayout.Button("Switch side"))
            {
                modelSeat.Value = 1 - modelSeat.Value;
                steps.Clear();
                request = null;
                handedBack = false;
            }
            GUILayout.EndHorizontal();
            GUI.DragWindow();
        }

        // The model is working on a decision: asking the bridge, clicking its
        // move, or about to ask. A decision it has handed back, or one inside
        // an effect it does not click, belongs to the person.
        bool ModelHasTheTable()
        {
            if (!active || !InSoloGame()) return false;
            if (steps.Count > 0 || request != null) return true;
            if (TurnStepButton() != null) return true;
            return !handedBack && AskableStep() != null;
        }

        // Solo V Self waits for a click on "Draw Card" and "Draw Don" at the
        // start of each turn. They are not choices, so on the model's turn the
        // plugin presses them itself rather than asking the bridge.
        ButtonChoiceType? TurnStepButton()
        {
            var game = gls.gsv_CurrentGame;
            if (game == null || game.iPlayerTurn != modelSeat.Value || gls.bCardIsMoving) return null;
            switch ((int)gls.e_CurrentState)
            {
                case DrawCardWait: return ButtonChoiceType.DrawCard;
                case DrawDonWait: return ButtonChoiceType.DrawDon;
                default: return null;
            }
        }

        bool PressTurnStep()
        {
            var button = TurnStepButton();
            if (button == null || !Press(button.Value)) return false;
            status = button == ButtonChoiceType.DrawCard ? "drawing" : "drawing DON!!";
            nextAt = Time.unscaledTime + stepDelay.Value;
            return true;
        }

        // The step the model is asked about at this moment, or null when it is
        // not the model's decision or not one it plays.
        string AskableStep()
        {
            var game = gls.gsv_CurrentGame;
            if (game == null || game.iPlayerAction != modelSeat.Value) return null;
            if (gls.acaActive != null || gls.bOpponentResolving || gls.bForcingOpponentAction) return null;
            if (gls.bCardIsMoving) return null;
            var pendingAbilities = Get<List<GameObject>>("lgo_ActionChoices");
            if (pendingAbilities != null && pendingAbilities.Count > 0) return null;
            switch ((int)gls.e_CurrentState)
            {
                case MulliganChoice: return "mulligan";
                case MainAction: return "main";
                case WaitOnBlocker: return "block";
                case WaitOnCounters: return "counter";
                default: return null;
            }
        }

        // One log line each time what the plugin decides on changes, so a
        // seat that stops moving can be read from BepInEx/LogOutput.log.
        string lastTrace;
        void Trace()
        {
            var game = gls.gsv_CurrentGame;
            if (game == null) return;
            var pending = Get<List<GameObject>>("lgo_ActionChoices");
            var line = $"state {gls.e_CurrentState} ({(int)gls.e_CurrentState}), action P{game.iPlayerAction + 1}, turn P{game.iPlayerTurn + 1} #{game.iPlayerTurnNumber}, first P{game.iPlayerGoesFirst + 1}"
                + $" | ability {(gls.acaActive != null ? "active" : "-")}, resolving {gls.bOpponentResolving}, forcing {gls.bForcingOpponentAction}, moving {gls.bCardIsMoving}, pending {pending?.Count ?? 0}"
                + $" | model {(active ? "on" : "off")} P{modelSeat.Value + 1}, steps {steps.Count}, asking {request != null}, handed back {handedBack}: {status}";
            if (line == lastTrace) return;
            lastTrace = line;
            Logger.LogInfo(line);
        }

        // A summary's first clause: the move, without the bridge's reasoning.
        static string Short(string summary)
        {
            var cut = summary.IndexOf(" (", StringComparison.Ordinal);
            return cut > 0 ? summary.Substring(0, cut) : summary;
        }

        // ---- When to ask ----------------------------------------------------

        void AskIfOurDecision()
        {
            var game = gls.gsv_CurrentGame;
            if (game == null) return;
            if (game.iPlayerAction != modelSeat.Value)
            {
                handedBack = false;
                if (status != "off") status = "waiting for its turn";
                return;
            }
            var step = AskableStep();
            if (step == null)
            {
                if (!gls.bCardIsMoving && gls.acaActive != null) status = "over to you: make the effect's choice for it";
                return;
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
                // Keep the reason a handed-back decision already shows.
                if (!handedBack) status = "its last move did not take; over to you";
                handedBack = true;
                return;
            }
            handedBack = false;
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
                handedBack = true;
                status = "over to you: " + ((string)move["reason"] ?? Short(summary));
                return;
            }
            status = Short(summary);
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
                handedBack = true;
                status = "a click did not take; over to you";
            }
            nextAt = Time.unscaledTime + stepDelay.Value;
        }

        bool Click(GameObject card)
        {
            if (card == null) return false;
            ownClick = true;
            try
            {
                AccessTools.Method(typeof(GameplayLogicScript), "HandleMouseClickCard").Invoke(gls, new object[] { card });
            }
            finally
            {
                ownClick = false;
            }
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
                ownClick = true;
                try
                {
                    script.ImClicked();
                }
                finally
                {
                    ownClick = false;
                }
                return true;
            }
            return false;
        }

        T Get<T>(string field) => (T)AccessTools.Field(typeof(GameplayLogicScript), field).GetValue(gls);
    }
}
