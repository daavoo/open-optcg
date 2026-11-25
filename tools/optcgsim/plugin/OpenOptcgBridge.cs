// A BepInEx plugin that lets open-optcg's learned model play one seat of
// OPTCGSim's Solo V Self mode ("Solo vs AI"), or both ("AI vs AI"). With both
// seats the model's, every move of the game passes through the bridge, which
// records it as a game the engine can load (tools/optcgsim/shadow.ts).
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
        const int TurnSelection = 0;
        const int MulliganChoice = 4;
        const int DrawCardWait = 10;
        const int DrawDonWait = 12;
        const int LifeTrigger = 21;
        // The second Life card of a [Double Attack], asked the same way.
        const int LifeDoubleTrigger = 22;
        // The sim's "Back to Main" only switches to this state; it calls
        // neither of the menu methods the plugin hooks.
        const int MainMenu = 23;
        const int GameOver = 26;
        const int ConfirmRevealedCard = 30;
        const int ConfirmRevealedCardOnOpponentsTurn = 31;

        // The buttons that close a target selection: confirming fewer targets
        // than the most an "up to" effect allows, or none, or finishing a
        // look-at-the-top arrangement.
        static readonly ButtonChoiceType[] ConfirmButtons =
        {
            ButtonChoiceType.SelectTargets, ButtonChoiceType.SelectFriendlyTargets,
            ButtonChoiceType.SelectEnemyTargets, ButtonChoiceType.SelectEnemyCharacters,
            ButtonChoiceType.SelectEnemyLeaders, ButtonChoiceType.SelectEnemyStage,
            ButtonChoiceType.SelectTrashTargets, ButtonChoiceType.ConfirmInfiniteTargets,
            ButtonChoiceType.FinalizeTopDeck, ButtonChoiceType.ConfirmRevealedCard,
            ButtonChoiceType.DrawNone,
        };
        const int MainAction = 14;
        const int AttachingDon = 15;
        // A sixth Character is being played: which of the five it replaces.
        const int SelectingDeploySwap = 16;
        const int SelectingTarget = 17;
        const int WaitOnCounters = 19;
        const int WaitOnBlocker = 20;

        // The buttons of the table itself: turn steps, a selected card's
        // actions, the answers to an attack. Any other button the sim shows
        // the deciding player is a prompt inside an effect.
        static readonly HashSet<ButtonChoiceType> TableButtons = new HashSet<ButtonChoiceType>
        {
            ButtonChoiceType.EndTurn, ButtonChoiceType.ConfirmEndTurn, ButtonChoiceType.Cancel,
            ButtonChoiceType.Deploy, ButtonChoiceType.Attack, ButtonChoiceType.CardAction,
            ButtonChoiceType.DrawCard, ButtonChoiceType.DrawDon, ButtonChoiceType.ConfirmDon,
            ButtonChoiceType.NoBlocker, ButtonChoiceType.ResolveAttack, ButtonChoiceType.ConfirmCounter,
            ButtonChoiceType.NormalCounter, ButtonChoiceType.StartingHand_Keep, ButtonChoiceType.StartingHand_Mulligan,
            ButtonChoiceType.GoFirst, ButtonChoiceType.GoSecond, ButtonChoiceType.Trigger,
            ButtonChoiceType.TriggerOutOfOrder, ButtonChoiceType.NoTrigger, ButtonChoiceType.NoTriggerOutOfOrder,
            ButtonChoiceType.BackToMain, ButtonChoiceType.Rematch, ButtonChoiceType.PeekMyLife,
            ButtonChoiceType.PeekOppLife, ButtonChoiceType.ShowFullDeck, ButtonChoiceType.ShowOnlyValid,
            ButtonChoiceType.AttachAllActiveDon, ButtonChoiceType.ConfirmAttachAllActiveDon,
            ButtonChoiceType.HostNetwork, ButtonChoiceType.HostServer, ButtonChoiceType.JoinNetwork,
            ButtonChoiceType.OpponentDisconnect,
        };

        static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

        ConfigEntry<string> bridgeUrl;
        ConfigEntry<int> modelSeat;
        ConfigEntry<float> stepDelay;
        ConfigEntry<int> autoGames;
        ConfigEntry<float> bothSeatsDelay;
        ConfigEntry<bool> stopWhenNotRecorded;
        ConfigEntry<float> autoSpeed;
        ConfigEntry<bool> ourDecks;
        ConfigEntry<int> firstGame;
        // The catalog's decks, by the names they are saved under in the sim.
        List<string> deckNames;
        int gamesStarted;
        // AI vs AI games still to start by themselves this launch.
        int gamesLeft;
        bool autoStarted;
        float autoStartAt = -1;
        // The model plays both seats of this game, and the bridge records it.
        bool bothSeats;
        bool bothRequested;
        // Every game the model plays is recorded by the bridge: its snapshots
        // carry the cards nobody at the table sees, so the bridge's engine can
        // play the same game, and with a person in one seat the table is also
        // shown to the bridge at their decisions, so it can follow their moves.
        bool Recorded => aiGame;
        string lastObservedKey;
        // The table being shown to the bridge, which is finished with before
        // anything else is sent so the bridge sees the game in order.
        Task<string> showing;
        // Names this game to the bridge, so its record is not the last game's.
        string gameId;
        // The sim has ended this game, and the bridge has been told.
        bool gameEnded;
        int endedWinner = -1;
        float nextGameAt = -1;
        // When the table last changed, for giving up a game that has stopped.
        float quietSince;
        GameObject bothMenuButton;

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
        // This game was started from "Solo vs AI": the model's hand and the
        // cards its effects look at are kept face down for the person, even
        // while the model is stopped.
        bool aiGame;
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
            autoGames = Config.Bind("AiVsAi", "Games", 0, "Play this many AI vs AI games by themselves when the sim starts, one after another, with the decks the Solo V Self screen remembers. 0 leaves the menu alone.");
            bothSeatsDelay = Config.Bind("AiVsAi", "StepDelay", 0.15f, "Seconds between clicks in an AI vs AI game.");
            firstGame = Config.Bind("AiVsAi", "FirstGame", 0, "Where in the rotation of open-optcg's decks the games started by Games begin, to play one pairing again.");
            ourDecks = Config.Bind("AiVsAi", "OurDecks", true, "Play the games started by Games with open-optcg's own deck lists, a different pair each game, instead of the decks the Solo V Self screen remembers. The lists are on the deck screen beside your own decks either way.");
            autoSpeed = Config.Bind("AiVsAi", "Speed", 4f, "How many times faster the sim runs during the games started by Games.");
            stopWhenNotRecorded = Config.Bind("AiVsAi", "StopWhenNotRecorded", false, "In the games started by Games, give a game up at the first ruling the bridge's engine and the sim make differently, where its record ends, instead of playing it out to find the rest.");
            gamesLeft = autoGames.Value;
            // open-optcg's lists, offered on the deck screen beside a person's
            // own decks -- before the sim reads the folder, which it does once
            // its menu loads.
            deckNames = SaveOurDecks();
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
            if ((int)gls.e_CurrentState == MainMenu)
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
            aiGame = active;
            // Solo vs AI seats the model as the sim's "Opponent", across the
            // table from the person.
            if (active) modelSeat.Value = 1;
            bothSeats = active && bothRequested;
            gameId = Guid.NewGuid().ToString("N");
            decisionsThisGame = 0;
            if (gls != null) Logger.LogInfo($"decks: \"{Get<string>("s_SelectedDeck")}\" against \"{Get<string>("s_EnemySelectedDeck")}\"");
            gameEnded = false;
            endedWinner = -1;
            nextGameAt = -1;
            quietSince = Time.unscaledTime;
            // Nobody watches the games `Games` starts, so they run fast.
            Time.timeScale = bothSeats && gamesLeft > 0 ? Mathf.Max(1f, autoSpeed.Value) : 1f;
            deckCheckPending = active;
            if (active) menuMessage = null;
            aiRequested = false;
            bothRequested = false;
            steps.Clear();
            request = null;
            lastAnsweredKey = null;
            lastObservedKey = null;
            showing = null;
            handedBack = false;
            status = active ? "waiting for its turn" : "off";
        }

        void OnMainMenu()
        {
            Time.timeScale = 1f;
            inSoloGame = false;
            aiGame = false;
            bothSeats = false;
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

            // How the sim reports a finished game: the winner to its replay
            // log first, then the end of the game itself.
            [HarmonyPostfix, HarmonyPatch(typeof(GameplayLogicScript), "CDKReplay_EmitResult")]
            static void ResultEmitted(int winnerOwner)
            {
                if (instance != null) instance.endedWinner = winnerOwner;
            }

            [HarmonyPostfix, HarmonyPatch(typeof(GameplayLogicScript), "EndGame")]
            static void GameEnded(bool bWin) => instance?.OnGameEnded(bWin);

            // Solo V Self lets one person click for both seats; while the
            // model holds a decision, the person's clicks on cards and on the
            // choice buttons are dropped so the two cannot interleave.
            [HarmonyPrefix, HarmonyPatch(typeof(GameplayLogicScript), "HandleMouseClickCard")]
            static bool CardClicked() => PersonMayClick();

            [HarmonyPrefix, HarmonyPatch(typeof(ChoiceButtonScript), "ImClicked")]
            static bool ChoiceClicked() => ownClick || (PersonMayClick() && (instance == null || !instance.ButtonsCovered()));

            static bool PersonMayClick() => ownClick || instance == null || !instance.ModelHasTheTable();

            // Solo V Self deals both hands face up. The model's hand is turned
            // face down as the sim lays it out, which also keeps it out of the
            // hover preview (that shows face-up cards only); the states in
            // which the sim itself shows a hand card are left alone.
            [HarmonyPostfix, HarmonyPatch(typeof(GameplayLogicScript), "SetupHandCard")]
            static void HandCardLaidOut(GameObject card, int playerIndex, GameplayState currentState)
            {
                if (instance == null || !instance.HidesSeat(playerIndex)) return;
                var state = (int)currentState;
                if (state == GameOver || state == ConfirmRevealedCard || state == ConfirmRevealedCardOnOpponentsTurn) return;
                var script = card == null ? null : card.GetComponent<CardLogicScript>();
                if (script != null && script.myCard.bFaceUp) script.SetFaceUp(false);
            }

            // The cards one of the model's effects looks at from its deck.
            [HarmonyPostfix, HarmonyPatch(typeof(GameplayLogicScript), "RefreshTopDeckPositions")]
            static void TopDeckLaidOut(GameplayLogicScript __instance)
            {
                var aca = __instance.acaActive;
                if (instance == null || aca == null || !instance.HidesSeat(instance.EffectOwner(aca))) return;
                foreach (var card in TopDeck(__instance))
                {
                    var script = card == null ? null : card.GetComponent<CardLogicScript>();
                    if (script != null && script.myCard.bFaceUp) script.SetFaceUp(false);
                }
            }
        }

        static List<GameObject> TopDeck(GameplayLogicScript script) =>
            (List<GameObject>)AccessTools.Field(typeof(GameplayLogicScript), "lgo_TopDeck").GetValue(script) ?? new List<GameObject>();

        // `SetupHandCard` does not see every way a card reaches the hand -- the
        // opening hand is dealt before the game is known to be the model's --
        // so any of the model's hand cards still face up is turned down here.
        void KeepModelHandHidden()
        {
            if (!InSoloGame() || !HidesSeat(modelSeat.Value)) return;
            var state = (int)gls.e_CurrentState;
            if (state == GameOver || state == ConfirmRevealedCard || state == ConfirmRevealedCardOnOpponentsTurn) return;
            var players = gls.Lps_Players;
            if (players == null || modelSeat.Value >= players.Count) return;
            foreach (var card in players[modelSeat.Value].Lgo_MyHand)
            {
                var script = card == null ? null : card.GetComponent<CardLogicScript>();
                if (script != null && script.myCard.bFaceUp) script.SetFaceUp(false);
            }
        }

        // With the model in both seats there is nobody to hide a hand from.
        bool HidesSeat(int seat) => aiGame && inSoloGame && !bothSeats && seat == modelSeat.Value;

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

        // Copies of the sim's own Solo V Self button, beside it: each opens the
        // same deck screen, and marks the game it starts as one the model plays
        // -- one seat of ("Solo vs AI"), or both ("AI vs AI").
        bool menuButtonPlaced;

        void AddMenuButton()
        {
            if (aiMenuButton != null && !menuButtonPlaced && aiMenuButton.activeInHierarchy)
                menuButtonPlaced = PlaceInFreeSlot(aiMenuButton, soloMenuButton);
            if (aiMenuButton != null || Time.unscaledTime < nextLookAt) return;
            nextLookAt = Time.unscaledTime + 1f;
            var menu = FindAnyObjectByType<HostJoinScript>();
            if (menu == null) return;
            var solo = (GameObject)AccessTools.Field(typeof(HostJoinScript), "go_SoloVSelf").GetValue(menu);
            var soloButton = solo == null ? null : solo.GetComponent<Button>();
            if (soloButton == null) return;

            soloMenuButton = solo;
            aiMenuButton = CopyMenuButton(solo, soloButton, "Solo vs AI", 1, false);
            menuButtonPlaced = false;
            // AI vs AI is how a batch of games is collected, so it is on the
            // menu only while `Games` is running one; a player has no use for it.
            if (gamesLeft > 0) bothMenuButton = CopyMenuButton(solo, soloButton, "AI vs AI", 2, true);
            soloButton.onClick.AddListener(() => { aiRequested = false; bothRequested = false; });
        }

        // Below Solo V Self the sim keeps its own beta buttons and the account
        // button, so the copy goes in the gap above it instead: in Solo V
        // Self's column, centred between Multiplayer's bottom edge and Solo V
        // Self's top edge. Tried every frame until the menu has a layout to
        // measure: before that, every button reports the same place. Says
        // whether it is done; the copy stays below Solo V Self when there is
        // no Multiplayer button to measure from.
        bool PlaceInFreeSlot(GameObject copy, GameObject solo)
        {
            if (copy == null || solo == null) return true;
            var parent = solo.transform.parent as RectTransform;
            if (parent == null || parent.GetComponent<LayoutGroup>() != null) return true;
            // The Button whose label reads "Multiplayer", not a panel that
            // merely contains it, so its corners are the button's own.
            var multiplayer = parent.GetComponentsInChildren<Button>(true)
                .Where(button => button.gameObject != copy && button.gameObject != solo
                    && !button.transform.IsChildOf(copy.transform) && !button.transform.IsChildOf(solo.transform))
                .FirstOrDefault(button =>
                    button.GetComponentsInChildren<TMP_Text>(true).Select(t => t.text)
                        .Concat(button.GetComponentsInChildren<Text>(true).Select(t => t.text))
                        .Any(text => text != null && text.Trim() == "Multiplayer"));
            if (multiplayer == null)
            {
                Logger.LogWarning("Solo vs AI: no Multiplayer button beside Solo V Self; left below it");
                return true;
            }
            var corners = new Vector3[4];
            float Edge(RectTransform rect, bool top)
            {
                rect.GetWorldCorners(corners);
                return parent.InverseTransformPoint(top ? corners[1] : corners[0]).y;
            }
            var below = (RectTransform)solo.transform;
            var gapTop = Edge((RectTransform)multiplayer.transform, false);
            var gapBottom = Edge(below, true);
            if (gapTop - gapBottom < below.rect.height * 0.5f) return false;
            var soloCentre = parent.InverseTransformPoint(below.TransformPoint(below.rect.center)).y;
            var rect = (RectTransform)copy.transform;
            rect.anchorMin = below.anchorMin;
            rect.anchorMax = below.anchorMax;
            rect.pivot = below.pivot;
            rect.anchoredPosition = below.anchoredPosition
                + new Vector2(0, (gapTop + gapBottom) / 2f - soloCentre);
            Logger.LogInfo($"Solo vs AI: placed between Multiplayer (bottom {gapTop:0}) and Solo V Self (top {gapBottom:0})");
            return true;
        }

        // The deck files this plugin wrote last time, one name a line, kept
        // beside its config so they can be told from a person's own decks.
        string DeckManifestPath =>
            System.IO.Path.Combine(Paths.ConfigPath, "dev.open-optcg.optcgsim-bridge.decks.txt");

        // Deletes the deck files this plugin wrote: the ones its manifest
        // names, and any from before it kept one (named "open-optcg ...").
        void RemoveOurDecks()
        {
            try
            {
                var folder = Application.persistentDataPath;
                var files = System.IO.Directory.GetFiles(folder, "open-optcg *.txt").ToList();
                if (System.IO.File.Exists(DeckManifestPath))
                {
                    files.AddRange(System.IO.File.ReadAllLines(DeckManifestPath)
                        .Where(name => name.Trim().Length > 0)
                        .Select(name => System.IO.Path.Combine(folder, name.Trim() + ".txt")));
                }
                foreach (var file in files.Distinct().Where(System.IO.File.Exists)) System.IO.File.Delete(file);
                System.IO.File.Delete(DeckManifestPath);
            }
            catch (Exception error)
            {
                Logger.LogWarning("could not remove open-optcg's deck lists: " + error.Message);
            }
        }

        GameObject CopyMenuButton(GameObject solo, Button soloButton, string label, int place, bool both)
        {
            var copy = Instantiate(solo, solo.transform.parent);
            copy.name = label.Replace(" ", "");
            copy.transform.SetSiblingIndex(solo.transform.GetSiblingIndex() + place);
            if (solo.transform.parent.GetComponent<LayoutGroup>() == null)
            {
                var rect = (RectTransform)copy.transform;
                rect.anchoredPosition -= new Vector2(0, rect.rect.height * 1.15f * place);
            }
            foreach (var text in copy.GetComponentsInChildren<TMP_Text>(true)) text.text = label;
            foreach (var text in copy.GetComponentsInChildren<Text>(true)) text.text = label;

            // A fresh event rather than the copied one, so the copy runs the
            // original's handlers (inspector-wired or added in code) first and
            // the request survives them.
            var button = copy.GetComponent<Button>();
            button.onClick = new Button.ButtonClickedEvent();
            button.onClick.AddListener(() =>
            {
                soloButton.onClick.Invoke();
                aiRequested = true;
                bothRequested = both;
            });
            copy.SetActive(solo.activeSelf);
            return copy;
        }

        // The games `Games` asks for: open AI vs AI and press its Start, with
        // whichever decks the deck screen remembers.
        void AutoStart()
        {
            if (gamesLeft <= 0 || inSoloGame || autoStarted) return;
            var menu = FindAnyObjectByType<HostJoinScript>();
            if (menu == null) return;
            if (autoStartAt < 0)
            {
                // The deck screen hides the menu's buttons, so only the first
                // step waits for one.
                if (bothMenuButton == null || !bothMenuButton.activeInHierarchy) return;
                bothMenuButton.GetComponent<Button>().onClick.Invoke();
                autoStartAt = Time.unscaledTime + 2f;
                Logger.LogInfo($"AI vs AI: opened the deck screen ({gamesLeft} games to play)");
                return;
            }
            if (Time.unscaledTime < autoStartAt) return;
            autoStarted = true;
            ChooseOurDecks();
            Logger.LogInfo("AI vs AI: starting the game");
            AccessTools.Method(typeof(HostJoinScript), "SoloSelf").Invoke(menu, null);
        }

        // Saves the bridge's deck lists as decks of the sim, in place of the
        // ones saved last time, and returns their names. With no bridge to
        // ask, last time's are left as they are.
        List<string> SaveOurDecks()
        {
            var names = new List<string>();
            try
            {
                var call = Http.GetStringAsync(bridgeUrl.Value.TrimEnd('/') + "/decks");
                if (!call.Wait(TimeSpan.FromSeconds(3))) throw new TimeoutException();
                var decks = (JArray)JObject.Parse(call.Result)["decks"];
                RemoveOurDecks();
                foreach (var deck in decks)
                {
                    var name = (string)deck["name"];
                    var lines = ((JArray)deck["lines"]).Select(line => (string)line);
                    System.IO.File.WriteAllLines(System.IO.Path.Combine(Application.persistentDataPath, name + ".txt"), lines);
                    names.Add(name);
                }
                System.IO.File.WriteAllLines(DeckManifestPath, names);
                Logger.LogInfo($"saved {names.Count} open-optcg decks to {Application.persistentDataPath}");
            }
            catch (Exception error)
            {
                Logger.LogWarning("could not fetch open-optcg's decks from the bridge: " + error.Message);
            }
            return names;
        }

        // A different pair of the catalog's decks for each game: every deck
        // takes Player 1's seat in turn, against a deck that moves through
        // the list at another pace.
        void ChooseOurDecks()
        {
            if (!ourDecks.Value) return;
            if (deckNames == null || deckNames.Count == 0) deckNames = SaveOurDecks();
            var logic = FindAnyObjectByType<GameplayLogicScript>();
            if (deckNames.Count == 0 || logic == null) return;
            var game = firstGame.Value + gamesStarted;
            var first = deckNames[game % deckNames.Count];
            var second = deckNames[(game * 7 + 3) % deckNames.Count];
            gamesStarted++;
            AccessTools.Field(typeof(GameplayLogicScript), "s_SelectedDeck").SetValue(logic, first);
            AccessTools.Field(typeof(GameplayLogicScript), "s_EnemySelectedDeck").SetValue(logic, second);
        }

        // ---- The end of an AI vs AI game ---------------------------------------

        void OnGameEnded(bool playerOneWon)
        {
            if (!Recorded || gameEnded) return;
            // The replay log's winner when the sim wrote one; otherwise the
            // result as the sim told its own Player 1.
            var winner = endedWinner == 0 || endedWinner == 1 ? endedWinner : (playerOneWon ? 0 : 1);
            Logger.LogInfo($"AI vs AI: the game is over, Player {winner + 1} won (EndGame bWin {playerOneWon}, replay winner {endedWinner})");
            TellBridgeGameIsOver(new JObject { ["game"] = gameId, ["winner"] = winner == 0 ? "p1" : "p2" });
        }

        // A game that cannot go on -- the sim is waiting on something the
        // plugin has no click for, or its record has parted from it.
        void GiveUpGame(string why)
        {
            if (gameEnded) return;
            Logger.LogWarning("AI vs AI: giving the game up: " + why);
            TellBridgeGameIsOver(new JObject { ["game"] = gameId, ["abandoned"] = why });
        }

        void TellBridgeGameIsOver(JObject report)
        {
            gameEnded = true;
            active = false;
            steps.Clear();
            request = null;
            status = "the game is over";
            var body = new StringContent(report.ToString(Formatting.None), Encoding.UTF8, "application/json");
            Http.PostAsync(bridgeUrl.Value.TrimEnd('/') + "/finish", body).ContinueWith(t =>
            {
                if (t.IsFaulted) return;
                Logger.LogInfo("bridge: " + t.Result.Content.ReadAsStringAsync().Result);
            });
            if (gamesLeft > 0) nextGameAt = Time.unscaledTime + 3f;
        }

        void StartNextGame()
        {
            nextGameAt = -1;
            gamesLeft--;
            Logger.LogInfo($"AI vs AI: {gamesLeft} games left");
            autoStarted = false;
            autoStartAt = -1;
            OnMainMenu();
            var menu = FindAnyObjectByType<HostJoinScript>();
            if (menu != null) AccessTools.Method(typeof(HostJoinScript), "LoadMain").Invoke(menu, null);
        }

        // Whose effect is in progress. The sim's older effects (a look at the
        // top of the deck that predates its "V3" actions) leave the effect's
        // player unset and name the card instead, so the card's owner is read
        // first.
        int EffectOwner(ActivatedCardAction aca)
        {
            if (aca.goActor != null)
                for (var seat = 0; seat < gls.Lps_Players.Count; seat++)
                {
                    var player = gls.Lps_Players[seat];
                    foreach (var zone in new[] { player.Lgo_MyLeader, player.Lgo_MyDeploy, player.Lgo_MyStage, player.Lgo_MyHand, player.Lgo_MyTrash, player.Lgo_MyLifeDeck, player.Lgo_MyDeck })
                        if (zone.Contains(aca.goActor)) return seat;
                }
            return aca.iPlayerID;
        }

        // The card whose effect it is: named outright by the older effects,
        // and by its id in the deck by the rest.
        GameObject EffectActor(ActivatedCardAction aca)
        {
            if (aca.goActor != null) return aca.goActor;
            try
            {
                return (GameObject)AccessTools.Method(typeof(GameplayLogicScript), "FindCardByUniqueDeckID").Invoke(gls, new object[] { aca.iActorID });
            }
            catch (Exception)
            {
                return null;
            }
        }

        // With both seats the model's, its seat is whichever seat the sim is
        // waiting on.
        void FollowDecider()
        {
            var game = gls.gsv_CurrentGame;
            if (game == null || steps.Count > 0 || request != null) return;
            var seat = gls.acaActive != null ? EffectOwner(gls.acaActive) : game.iPlayerAction;
            if (seat != 0 && seat != 1) return;
            if (modelSeat.Value != seat) modelSeat.Value = seat;
        }

        void Update()
        {
            AddMenuButton();
            // The sim hides and shows its menu buttons by screen; the copy
            // follows the original.
            if (aiMenuButton != null && soloMenuButton != null && aiMenuButton.activeSelf != soloMenuButton.activeSelf)
                aiMenuButton.SetActive(soloMenuButton.activeSelf);
            if (bothMenuButton != null && soloMenuButton != null && bothMenuButton.activeSelf != soloMenuButton.activeSelf)
                bothMenuButton.SetActive(soloMenuButton.activeSelf);
            AutoStart();
            RefreshHud();
            KeepModelHandHidden();
            if (!InSoloGame()) return;
            if (nextGameAt > 0 && Time.unscaledTime >= nextGameAt)
            {
                StartNextGame();
                return;
            }
            if (bothSeats) FollowDecider();
            if (deckCheckPending)
            {
                deckCheckPending = false;
                if (!DecksArePlayable()) return;
            }
            Trace();
            // Nobody is at the table of a game `Games` started, so one that
            // has stopped is given up rather than left waiting.
            if (bothSeats && gamesLeft > 0 && !gameEnded)
            {
                // No game needs this many decisions; one that has made them
                // is going round in a circle the other checks did not see.
                if (decisionsThisGame > 900) GiveUpGame($"the game has taken {decisionsThisGame} decisions without ending: " + lastTrace);
                if (handedBack) GiveUpGame("the sim is waiting on a decision the plugin could not make: " + lastTrace);
                else if (Time.unscaledTime - quietSince > 30f) GiveUpGame("the sim did not move for 30 seconds: " + lastTrace);
            }
            if (!active) return;
            if (Time.unscaledTime < nextAt) return;

            if (showing != null)
            {
                if (!showing.IsCompleted) return;
                showing = null;
            }
            if (steps.Count > 0)
            {
                // The sim drops a click made while its cards are in the air.
                if (gls.bCardIsMoving) return;
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
            if (ChooseAbility()) return;
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
            CoverChoiceButtons();
            if (hud != null) return;
            // A window, so it can be dragged off whatever part of the sim's UI
            // it covers.
            panel = GUI.Window(0x6f70, panel, DrawPanel, "AI opponent (open-optcg)");
        }

        GUIStyle coverStyle;

        // While the decision on the table is the model's, the sim's choice
        // buttons are its to press: they are drawn over with "AI playing", and
        // the person's clicks on them are dropped (`ChoiceClicked`). A decision
        // handed back uncovers them.
        bool ButtonsCovered() => active && InSoloGame() && !handedBack && ModelDecides();

        void CoverChoiceButtons()
        {
            if (!ButtonsCovered()) return;
            var area = Rect.zero;
            foreach (var button in VisibleChoiceButtons())
            {
                var rect = ScreenRect(button.GetComponent<RectTransform>());
                if (rect.width <= 0) continue;
                area = area.width <= 0 ? rect : Rect.MinMaxRect(Mathf.Min(area.xMin, rect.xMin), Mathf.Min(area.yMin, rect.yMin), Mathf.Max(area.xMax, rect.xMax), Mathf.Max(area.yMax, rect.yMax));
            }
            if (area.width <= 0) return;
            if (coverStyle == null)
            {
                coverStyle = new GUIStyle(GUI.skin.box) { alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
                var fill = new Texture2D(1, 1);
                fill.SetPixel(0, 0, new Color(0.12f, 0.12f, 0.14f, 0.96f));
                fill.Apply();
                coverStyle.normal.background = fill;
                coverStyle.normal.textColor = Color.white;
            }
            coverStyle.fontSize = Mathf.Clamp((int)(area.height * 0.4f), 14, 64);
            GUI.Box(area, "AI playing", coverStyle);
        }

        // Whose decision the sim is waiting on: the owner of an effect in
        // progress, otherwise the player it is waiting on to act.
        bool ModelDecides()
        {
            var game = gls.gsv_CurrentGame;
            if (game == null) return false;
            var seat = gls.acaActive != null ? EffectOwner(gls.acaActive) : game.iPlayerAction;
            return seat == modelSeat.Value;
        }

        // A UI element's rectangle in IMGUI's coordinates (origin top left).
        static Rect ScreenRect(RectTransform rect)
        {
            if (rect == null) return Rect.zero;
            var canvas = rect.GetComponentInParent<Canvas>();
            var camera = canvas == null || canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.worldCamera;
            var corners = new Vector3[4];
            rect.GetWorldCorners(corners);
            var min = RectTransformUtility.WorldToScreenPoint(camera, corners[0]);
            var max = RectTransformUtility.WorldToScreenPoint(camera, corners[2]);
            return Rect.MinMaxRect(min.x, Screen.height - max.y, max.x, Screen.height - min.y);
        }

        void DrawPanel(int id)
        {
            GUILayout.Label(PanelHeadline());
            GUILayout.Label(PanelStatus(), GUILayout.MinHeight(36));
            GUILayout.BeginHorizontal();
            if (GUILayout.Button(active ? "Stop the AI" : "Start the AI")) ToggleAi();
            if (GUILayout.Button("Switch side")) SwitchSide();
            GUILayout.EndHorizontal();
            GUI.DragWindow();
        }

        void ToggleAi()
        {
            active = !active;
            steps.Clear();
            request = null;
            handedBack = false;
            status = active ? "waiting for its turn" : "off";
        }

        void SwitchSide()
        {
            modelSeat.Value = 1 - modelSeat.Value;
            steps.Clear();
            request = null;
            handedBack = false;
        }

        string PanelHeadline()
        {
            // The sim's own log calls Player 1 "You" (the bottom of the table)
            // and Player 2 "Opponent" (the top), so the panel does too.
            var side = bothSeats ? "both seats" : modelSeat.Value == 1 ? "Opponent (top)" : "You (bottom)";
            return active ? $"The AI plays: {side}" : gameEnded ? "The game is over" : "The AI is off";
        }

        string PanelStatus() => bothSeats && recordStatus != null ? status + "\n" + recordStatus : status;

        // ---- The in-game panel, built from the sim's own UI ---------------------

        // The panel is made of copies of the sim's choice button -- its sprite
        // for the frame and the buttons, its text for the labels -- on the
        // canvas the table is drawn on, so it looks like the rest of the
        // table. It goes in the sim's right-hand column of table controls,
        // under its "< Restart this turn >" row and as wide as it, where the
        // cards shown on the left and the choices below do not reach. The
        // IMGUI window in `OnGUI` stands in only when there is nothing to copy.
        GameObject hud;
        TMP_Text hudHeadline, hudStatus, hudToggleLabel;
        RectTransform[] restartRow;
        float nextRowLook;

        // The Restart button and the arrows either side of it, in the root
        // canvas's space; null until the sim has shown them.
        Rect? RestartRow(RectTransform root)
        {
            if (restartRow == null || restartRow.Any(rect => rect == null))
            {
                restartRow = null;
                if (Time.unscaledTime < nextRowLook) return null;
                nextRowLook = Time.unscaledTime + 1f;
                string Label(Button button) =>
                    string.Join(" ", button.GetComponentsInChildren<TMP_Text>(true).Select(t => t.text)
                        .Concat(button.GetComponentsInChildren<Text>(true).Select(t => t.text))).Trim();
                var buttons = root.GetComponentsInChildren<Button>(false)
                    .Where(button => hud == null || !button.transform.IsChildOf(hud.transform)).ToList();
                var restart = buttons.FirstOrDefault(button => Label(button).StartsWith("Restart"));
                if (restart == null) return null;
                var restartRect = (RectTransform)restart.transform;
                var span = Bounds(root, restartRect);
                restartRow = buttons
                    .Where(button => button == restart || ((Label(button) == "<" || Label(button) == ">")
                        && Mathf.Abs(Bounds(root, (RectTransform)button.transform).center.y - span.center.y) < span.height / 2))
                    .Select(button => (RectTransform)button.transform).ToArray();
            }
            var row = Bounds(root, restartRow[0]);
            foreach (var rect in restartRow.Skip(1))
            {
                var bounds = Bounds(root, rect);
                row = Rect.MinMaxRect(Mathf.Min(row.xMin, bounds.xMin), Mathf.Min(row.yMin, bounds.yMin),
                    Mathf.Max(row.xMax, bounds.xMax), Mathf.Max(row.yMax, bounds.yMax));
            }
            return row.width > 0 && row.height > 0 ? row : (Rect?)null;
        }

        static Rect Bounds(RectTransform space, RectTransform rect)
        {
            var corners = new Vector3[4];
            rect.GetWorldCorners(corners);
            var low = space.InverseTransformPoint(corners[0]);
            var high = space.InverseTransformPoint(corners[2]);
            return Rect.MinMaxRect(low.x, low.y, high.x, high.y);
        }

        bool EnsureHud()
        {
            if (hud != null) return true;
            if (gls == null) return false;
            var template = Get<GameObject>("go_ChoiceButton1");
            var templateText = template == null ? null : template.GetComponentInChildren<TMP_Text>(true);
            var templateImage = template == null ? null : template.GetComponent<Image>();
            var canvas = template == null ? null : template.GetComponentInParent<Canvas>(true);
            if (templateText == null || templateImage == null || canvas == null) return false;
            var root = (RectTransform)canvas.rootCanvas.transform;
            if (!(RestartRow(root) is Rect row)) return false;

            // Sized from the row it hangs under, so it reads as one more of
            // that column's controls.
            float pad = row.height * 0.1f;
            float lineHeight = row.height * 0.4f;
            var buttonSize = new Vector2((row.width - pad * 3) / 2, row.height * 0.55f);
            var panelSize = new Vector2(row.width, pad * 3 + lineHeight * 2 + buttonSize.y);

            hud = new GameObject("OpenOptcgPanel", typeof(RectTransform));
            hud.transform.SetParent(root, false);
            hud.transform.SetAsLastSibling();
            var frame = (RectTransform)hud.transform;
            frame.anchorMin = frame.anchorMax = new Vector2(0.5f, 0.5f);
            frame.pivot = new Vector2(0.5f, 1);
            frame.sizeDelta = panelSize;
            // Its own sorting, so the cards the sim draws later -- a hand
            // fanned out, a card lifted on hover -- do not cover it.
            var sorting = hud.AddComponent<Canvas>();
            sorting.overrideSorting = true;
            sorting.sortingOrder = 30000;
            hud.AddComponent<GraphicRaycaster>();
            var background = hud.AddComponent<Image>();
            background.sprite = templateImage.sprite;
            background.type = templateImage.sprite != null && templateImage.sprite.border != Vector4.zero ? Image.Type.Sliced : Image.Type.Simple;
            background.color = templateImage.color;

            TMP_Text Label(float top)
            {
                var copy = Instantiate(templateText.gameObject, hud.transform);
                copy.name = "OpenOptcgLabel";
                var text = copy.GetComponent<TMP_Text>();
                text.enableAutoSizing = false;
                // Small enough that the font's own line spacing fits the
                // line: a TMP label whose line does not fit draws nothing.
                text.fontSize = lineHeight * 0.6f;
                text.margin = Vector4.zero;
                text.alignment = TextAlignmentOptions.MidlineLeft;
                text.textWrappingMode = TextWrappingModes.NoWrap;
                text.overflowMode = TextOverflowModes.Overflow;
                text.raycastTarget = false;
                var rect = (RectTransform)copy.transform;
                rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(0, 1);
                rect.anchoredPosition = new Vector2(pad, -top);
                rect.sizeDelta = new Vector2(panelSize.x - pad * 2, lineHeight);
                rect.localScale = Vector3.one;
                return text;
            }
            hudHeadline = Label(pad);
            hudStatus = Label(pad + lineHeight);

            TMP_Text Button(float left, string label, UnityEngine.Events.UnityAction onClick)
            {
                var copy = Instantiate(template, hud.transform);
                copy.name = "OpenOptcgButton";
                // The copy is a plain button: the sim's script would read it
                // as one of its own choices.
                foreach (var script in copy.GetComponents<MonoBehaviour>())
                    if (!(script is Button) && !(script is Graphic)) DestroyImmediate(script);
                var button = copy.GetComponent<Button>();
                button.onClick = new Button.ButtonClickedEvent();
                button.onClick.AddListener(onClick);
                button.interactable = true;
                var rect = (RectTransform)copy.transform;
                rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(0, 1);
                rect.anchoredPosition = new Vector2(left, -(pad * 2 + lineHeight * 2));
                rect.sizeDelta = buttonSize;
                rect.localScale = Vector3.one;
                var text = copy.GetComponentInChildren<TMP_Text>(true);
                text.enableAutoSizing = false;
                text.fontSize = buttonSize.y * 0.45f;
                text.margin = Vector4.zero;
                text.text = label;
                copy.SetActive(true);
                return text;
            }
            hudToggleLabel = Button(pad, "Stop the AI", ToggleAi);
            Button(pad * 2 + buttonSize.x, "Switch side", SwitchSide);
            return true;
        }

        // Followed every frame, since the sim's controls move with the window.
        void PlaceHud()
        {
            var frame = (RectTransform)hud.transform;
            if (!(RestartRow((RectTransform)frame.parent) is Rect row)) return;
            frame.localPosition = new Vector3(row.center.x, row.yMin - row.height * 0.15f, 0);
        }

        void RefreshHud()
        {
            var show = InSoloGame();
            if (!show)
            {
                if (hud != null) hud.SetActive(false);
                return;
            }
            if (!EnsureHud()) return;
            if (!hud.activeSelf) hud.SetActive(true);
            PlaceHud();
            hudHeadline.text = PanelHeadline();
            hudStatus.text = PanelStatus();
            hudToggleLabel.text = active ? "Stop the AI" : "Start the AI";
        }

        // The model is working on a decision: asking the bridge, clicking its
        // move, or about to ask. A decision it has handed back, or one inside
        // an effect it does not click, belongs to the person.
        bool ModelHasTheTable()
        {
            if (!active || !InSoloGame()) return false;
            if (steps.Count > 0 || request != null) return true;
            if (TurnStepButton() != null) return true;
            var pending = Get<List<GameObject>>("lgo_ActionChoices");
            var game = gls.gsv_CurrentGame;
            if (pending != null && pending.Count > 0 && game != null && game.iPlayerAction == modelSeat.Value) return true;
            return !handedBack && AskableStep() != null;
        }

        // Solo V Self waits for a click on "Draw Card" and "Draw Don" at the
        // start of each turn. They are not choices, so on the model's turn the
        // plugin presses them itself rather than asking the bridge.
        // The button the plugin presses for a step that is not a choice, among
        // the ones the sim is showing; null when it shows none of them, so a
        // prompt the plugin does not know never holds the table.
        ButtonChoiceType? TurnStepButton()
        {
            var game = gls.gsv_CurrentGame;
            if (game == null || gls.bCardIsMoving) return null;
            foreach (var type in TurnStepCandidates(game))
                if (FindButton(type) != null) return type;
            return null;
        }

        IEnumerable<ButtonChoiceType> TurnStepCandidates(GameStateVars game)
        {
            var state = (int)gls.e_CurrentState;
            // A hit Life card: its [Trigger] is activated whenever the sim
            // offers one -- a Trigger is printed to be worth taking, and the
            // engine is not asked about a hit taken on the person's turn. A
            // card without one offers "No Trigger Effect" instead.
            if ((state == LifeTrigger || state == LifeDoubleTrigger) && game.iPlayerAction == modelSeat.Value && gls.acaActive == null)
            {
                // In a recorded game the engine is asked instead (`AskableStep`).
                if (Recorded && OfferedTrigger() != null) yield break;
                yield return ButtonChoiceType.Trigger;
                yield return ButtonChoiceType.TriggerOutOfOrder;
                yield return ButtonChoiceType.NoTrigger;
                yield return ButtonChoiceType.NoTriggerOutOfOrder;
                yield break;
            }
            // With no person at the table, the plugin also answers who goes
            // first.
            if (bothSeats && state == TurnSelection)
            {
                yield return ButtonChoiceType.GoFirst;
                yield break;
            }
            if (game.iPlayerTurn != modelSeat.Value) yield break;
            if (state == DrawCardWait) yield return ButtonChoiceType.DrawCard;
            if (state == DrawDonWait) yield return ButtonChoiceType.DrawDon;
        }

        // The sim's button for activating the hit Life card's [Trigger], when
        // it is offering one.
        ButtonChoiceType? OfferedTrigger()
        {
            if (FindButton(ButtonChoiceType.Trigger) != null) return ButtonChoiceType.Trigger;
            if (FindButton(ButtonChoiceType.TriggerOutOfOrder) != null) return ButtonChoiceType.TriggerOutOfOrder;
            return null;
        }

        // "Name a cost": the sim asks for a number with its own three buttons,
        // minus, plus, and one showing the number that confirms it. The
        // number lives on the effect, and the buttons are the sim's own
        // fields: their object names are not theirs alone.
        bool GuessOpen() =>
            gls.acaActive != null
            && Traverse.Create(gls).Field("go_GuessButton").GetValue<GameObject>() is GameObject confirm
            && confirm.activeInHierarchy;

        int? GuessShown() =>
            GuessOpen() ? Traverse.Create(gls.acaActive).Field("sSavedInt").GetValue<int>() : (int?)null;

        IEnumerable<ButtonChoiceType> PromptButtons() =>
            VisibleChoiceButtons()
                .Select(button => button.GetComponent<ChoiceButtonScript>())
                .Where(script => script != null && !TableButtons.Contains(script.myType))
                .Select(script => script.myType);

        float Delay() => bothSeats ? bothSeatsDelay.Value : stepDelay.Value;

        // Several of the model's abilities waiting at once: the sim asks which
        // resolves first, and the plugin takes them in the order offered.
        bool ChooseAbility()
        {
            var game = gls.gsv_CurrentGame;
            if (game == null || gls.bCardIsMoving || game.iPlayerAction != modelSeat.Value || gls.acaActive != null) return false;
            var choices = Get<List<GameObject>>("lgo_ActionChoices");
            var first = choices?.FirstOrDefault(c => c != null && c.activeInHierarchy);
            if (first == null || !Click(first)) return false;
            status = "choosing which ability resolves";
            nextAt = Time.unscaledTime + Delay();
            return true;
        }

        bool PressTurnStep()
        {
            var button = TurnStepButton();
            if (button == null || !Press(button.Value)) return false;
            status = button == ButtonChoiceType.DrawCard ? "drawing" : "drawing DON!!";
            nextAt = Time.unscaledTime + Delay();
            return true;
        }

        // The step the model is asked about at this moment, or null when it is
        // not the model's decision or not one it plays.
        string AskableStep() => StepFor(modelSeat.Value);

        // The same for either seat: the decision the sim is waiting on `seat`
        // for, if it is.
        string StepFor(int seat)
        {
            var game = gls.gsv_CurrentGame;
            if (game == null || gls.bCardIsMoving) return null;
            // An effect belongs to the seat whose card it is, whichever
            // player's turn it is.
            var aca = gls.acaActive;
            if (aca != null) return EffectOwner(aca) == seat ? "effect" : null;
            if (game.iPlayerAction != seat) return null;
            if (gls.bOpponentResolving || gls.bForcingOpponentAction) return null;
            var pendingAbilities = Get<List<GameObject>>("lgo_ActionChoices");
            if (pendingAbilities != null && pendingAbilities.Count > 0) return null;
            // A prompt the sim raises without an effect object: which
            // Character a sixth replaces, or a question asked with buttons.
            if ((int)gls.e_CurrentState == SelectingDeploySwap || PromptButtons().Any()) return "effect";
            switch ((int)gls.e_CurrentState)
            {
                case LifeTrigger:
                case LifeDoubleTrigger: return Recorded && OfferedTrigger() != null ? "trigger" : null;
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
                + $" | buttons [{string.Join(",", VisibleChoiceButtons().Select(b => b.GetComponent<ChoiceButtonScript>()?.myType.ToString() ?? "?"))}]"
                + $" | ability {(gls.acaActive != null ? $"P{gls.acaActive.iPlayerID + 1} step {gls.acaActive.iActionStep} of {(gls.acaActive.goActor != null ? CardNumber(gls.acaActive.goActor) : "?")}" : "-")}, resolving {gls.bOpponentResolving}, forcing {gls.bForcingOpponentAction}, moving {gls.bCardIsMoving}, pending {pending?.Count ?? 0}"
                + $" | model {(active ? "on" : "off")} P{modelSeat.Value + 1}, steps {steps.Count}, asking {request != null}, handed back {handedBack}: {status}";
            if (line == lastTrace) return;
            lastTrace = line;
            quietSince = Time.unscaledTime;
            Logger.LogInfo(line);
        }

        // A summary's first clause: the move, without the bridge's reasoning.
        static string Short(string summary)
        {
            var cut = summary.IndexOf(" (", StringComparison.Ordinal);
            return cut > 0 ? summary.Substring(0, cut) : summary;
        }

        // ---- When to ask ----------------------------------------------------

        string lastMove;
        // Answers in a row that left the table as it was.
        int sameTable;
        // A click of the last move could not be made.
        bool planFailed;
        // Whether a prompt was cancelled since the last move made at the
        // table: what tells an ability the sim backed out of from one that
        // resolved and changed nothing a snapshot shows (an effect negated, a
        // Character that cannot attack).
        bool backedOut;
        // The tables the model has decided from this turn.
        readonly HashSet<string> seenThisTurn = new HashSet<string>();
        int seenOnTurn = -1;
        int decisionsThisGame;
        float unchangedSince = -1;
        // How the bridge's record of an AI vs AI game stands, for the panel.
        string recordStatus;

        void AskIfOurDecision()
        {
            var game = gls.gsv_CurrentGame;
            if (game == null) return;
            var step = AskableStep();
            if (step == null)
            {
                if (game.iPlayerAction != modelSeat.Value)
                {
                    handedBack = false;
                    if (status != "off") status = "waiting for its turn";
                }
                ShowPersonsDecision();
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
            if (snapshot == null)
            {
                nextAt = Time.unscaledTime + 0.3f;
                return;
            }
            // The same table twice means the last move changed nothing the
            // snapshot can see.
            var key = snapshot.ToString(Formatting.None);
            var sent = key;
            if (key == lastAnsweredKey)
            {
                if (handedBack) return;
                // Not before the sim has had a second to act on the click.
                if (unchangedSince < 0) unchangedSince = Time.unscaledTime;
                if (Time.unscaledTime - unchangedSince < 1f) return;
                unchangedSince = -1;
                if (sameTable == 2) DescribeStuckPrompt();
                if (++sameTable > 5)
                {
                    status = "its moves are changing nothing; over to you";
                    handedBack = true;
                    return;
                }
                // A click the sim would not take leaves the table as it was:
                // the bridge is told, takes the move back and answers again.
                // Clicks that all went through and changed nothing a snapshot
                // shows are a move like any other -- an ability whose
                // condition was not met, a keyword gained -- and in a recorded
                // game the engine has made it too. Without a record, the
                // rebuilt position cannot know the move is spent, so it is
                // not offered again either way.
                // The bridge is told how many answers in a row changed
                // nothing, so it can try another.
                snapshot["repeat"] = sameTable;
                sent = snapshot.ToString(Formatting.None);
                if (planFailed || !Recorded || sameTable >= 2)
                {
                    Logger.LogWarning("the sim did not take " + lastMove + "; asking for another move");
                    snapshot["refused"] = true;
                    sent = snapshot.ToString(Formatting.None);
                }
            }
            else
            {
                sameTable = 0;
                unchangedSince = -1;
                // A move the sim backed out of -- an ability cancelled inside
                // its own prompt -- leaves the table as it was before the
                // move, at the same decision. The bridge is told that move is
                // not one the sim takes.
                if (game.iPlayerTurnNumber != seenOnTurn)
                {
                    seenOnTurn = game.iPlayerTurnNumber;
                    seenThisTurn.Clear();
                }
                var seenBefore = step != "effect" && step != "trigger" && !seenThisTurn.Add(key);
                if (seenBefore && backedOut)
                {
                    Logger.LogWarning("the table is back where it was before " + lastMove + "; asking for another move");
                    snapshot["refused"] = true;
                    sent = snapshot.ToString(Formatting.None);
                }
            }
            planFailed = false;
            handedBack = false;
            requestKey = key;
            status = "thinking";
            var body = new StringContent(sent, Encoding.UTF8, "application/json");
            request = Http.PostAsync(bridgeUrl.Value.TrimEnd('/') + "/decide", body)
                .ContinueWith(t => t.Result.Content.ReadAsStringAsync().Result);
        }

        // With a person in the other seat, the table is shown to the bridge
        // each time it changes at a decision of theirs. No move comes back:
        // it is how the bridge's engine keeps up with what they clicked.
        void ShowPersonsDecision()
        {
            if (!Recorded || bothSeats || gameEnded) return;
            var person = 1 - modelSeat.Value;
            var step = StepFor(person);
            if (step == null || step == "effect" || step == "trigger") return;
            JObject snapshot;
            try
            {
                snapshot = Snapshot(step, person);
            }
            catch (Exception)
            {
                return;
            }
            if (snapshot == null) return;
            var key = snapshot.ToString(Formatting.None);
            if (key == lastObservedKey) return;
            lastObservedKey = key;
            var body = new StringContent(key, Encoding.UTF8, "application/json");
            showing = Http.PostAsync(bridgeUrl.Value.TrimEnd('/') + "/observe", body)
                .ContinueWith(t => t.Result.Content.ReadAsStringAsync().Result);
        }

        // What the sim is showing at a prompt no answer has moved, for the
        // log: every button on screen, and where the cards an effect could
        // want are.
        void DescribeStuckPrompt()
        {
            try
            {
                var buttons = FindObjectsByType<Button>(FindObjectsSortMode.None)
                    .Where(b => b.isActiveAndEnabled && b.interactable)
                    .Select(b => b.name + " \"" + (b.GetComponentInChildren<TMP_Text>()?.text ?? b.GetComponentInChildren<Text>()?.text ?? "") + "\"");
                Logger.LogWarning("stuck prompt: buttons on screen: " + string.Join(" | ", buttons));
                var aca = gls.acaActive;
                if (aca == null) return;
                var viable = AccessTools.Method(typeof(GameplayLogicScript), "CheckCardIsViableTargetV3");
                var objects = FindObjectsByType<CardLogicScript>(FindObjectsSortMode.None)
                    .Where(c => c.gameObject.activeInHierarchy)
                    .Where(c => { try { return (bool)viable.Invoke(gls, new object[] { aca, c.gameObject, -1 }); } catch (Exception) { return false; } })
                    .Select(c => c.myCard.cardDef?.cardID + " in " + (c.transform.parent != null ? c.transform.parent.name : "?"));
                Logger.LogWarning("stuck prompt: cards the effect would take: " + string.Join(" | ", objects));
                var text = AccessTools.Field(typeof(GameplayLogicScript), "text_Mismatch");
                foreach (var field in new[] { "go_ActionText", "text_ActionPrompt", "go_PromptText", "text_Prompt" })
                {
                    var info = AccessTools.Field(typeof(GameplayLogicScript), field);
                    if (info == null) continue;
                    var value = info.GetValue(gls);
                    var shown = value is GameObject go ? go.GetComponentInChildren<TMP_Text>()?.text : (value as TMP_Text)?.text;
                    Logger.LogWarning($"stuck prompt: {field}: {shown}");
                }
            }
            catch (Exception error)
            {
                Logger.LogWarning("stuck prompt: could not describe it: " + error.Message);
            }
        }

        void ReceiveDecision()
        {
            var finished = request;
            request = null;
            lastAnsweredKey = requestKey;
            decisionsThisGame++;
            if (finished.IsFaulted)
            {
                status = "no bridge at " + bridgeUrl.Value + " (run `pnpm optcgsim:bridge`)";
                active = false;
                return;
            }
            var decision = JObject.Parse(finished.Result);
            var move = (JObject)decision["move"];
            var summary = (string)decision["summary"] ?? "";
            lastMove = move.ToString(Formatting.None);
            var moveKind = (string)move["kind"];
            if (moveKind != "choose" && moveKind != "trigger") backedOut = false;
            Logger.LogInfo($"model: {Short(summary)} -> {lastMove}");
            if (decision["record"] is JObject record)
            {
                var parted = (string)record["status"] == "diverged";
                recordStatus = parted ? "not recorded: " + (string)record["why"] : $"recording ({(int)record["actions"]} actions)";
                if (parted && gamesLeft > 0 && stopWhenNotRecorded.Value)
                {
                    GiveUpGame("the record parted from the sim: " + (string)record["why"]);
                    return;
                }
            }
            if (!Plan(move))
            {
                handedBack = true;
                status = "over to you: " + ((string)move["reason"] ?? Short(summary));
                return;
            }
            // An effect's choice can name a card from the model's hand or deck,
            // which the panel must not show the person.
            status = (string)move["kind"] == "choose" ? "resolving an effect" : Short(summary);
        }

        // ---- Reading the table ---------------------------------------------

        int unreadyEffectReads;
        int emptyEffectReads;

        // The table as the bridge is sent it, or null when the sim is between
        // two states and should be read again.
        JObject Snapshot(string step) => Snapshot(step, modelSeat.Value);

        JObject Snapshot(string step, int decider)
        {
            cardsById.Clear();
            var game = gls.gsv_CurrentGame;
            var players = new JObject();
            for (var seat = 0; seat < 2; seat++)
                players[seat == 0 ? "p1" : "p2"] = Side(gls.Lps_Players[seat], Recorded || seat == modelSeat.Value);

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
            if (step == "effect" && gls.acaActive == null)
            {
                // A prompt with no effect object: the cards it takes are the
                // deciding player's own Characters when one is to be replaced,
                // and none when it is a question asked with buttons.
                stepJson["source"] = "";
                stepJson["candidates"] = (int)gls.e_CurrentState == SelectingDeploySwap
                    ? new JArray(gls.Lps_Players[decider].Lgo_MyDeploy.Where(c => c != null).Select(Id))
                    : new JArray();
                stepJson["revealed"] = new JArray();
                stepJson["remaining"] = 1;
            }
            else if (step == "effect")
            {
                var aca = gls.acaActive;
                var actor = EffectActor(aca);
                stepJson["source"] = actor != null ? Id(actor) : "";
                // The card's number too: an Event being resolved is in no
                // zone the snapshot lists.
                if (actor != null) stepJson["sourceCard"] = CardNumber(actor);
                var candidates = new JArray();
                var seen = new HashSet<GameObject>();
                var viable = AccessTools.Method(typeof(GameplayLogicScript), "CheckCardIsViableTargetV3");
                foreach (var card in TableCards())
                {
                    if (card == null || !seen.Add(card)) continue;
                    bool ok;
                    try
                    {
                        // -1: no override, the effect's own current step.
                        ok = (bool)viable.Invoke(gls, new object[] { aca, card, -1 });
                    }
                    catch (Exception)
                    {
                        ok = false;
                    }
                    if (ok) candidates.Add(Id(card));
                }
                // The older effects take a click on any card they turned
                // over, and say which were allowed only by ignoring the rest.
                if (candidates.Count == 0)
                    foreach (var card in TopDeck(gls))
                        if (card != null) candidates.Add(Id(card));
                // An older effect with nothing turned over is asking for a
                // card on the table -- one to trash from hand as its cost, or
                // the card it is for -- and the sim says which only by what
                // it does with the click. Its player's hand comes first, then
                // their Leader and Characters, then the other player's.
                if (candidates.Count == 0 && aca.goActor != null)
                {
                    var owner = EffectOwner(aca);
                    foreach (var seat in new[] { owner, 1 - owner })
                    {
                        var player = gls.Lps_Players[seat];
                        var zones = seat == owner
                            ? new[] { player.Lgo_MyHand, player.Lgo_MyLeader, player.Lgo_MyDeploy }
                            : new[] { player.Lgo_MyLeader, player.Lgo_MyDeploy };
                        foreach (var zone in zones)
                            foreach (var card in zone)
                                if (card != null && card != aca.goActor) candidates.Add(Id(card));
                    }
                }
                stepJson["candidates"] = candidates;
                // Likewise an effect whose cards are still being laid out
                // offers nothing yet; one that really has no target (a prompt
                // to confirm) is sent after the same few tries.
                if (candidates.Count == 0 && ++emptyEffectReads < 5) return null;
                emptyEffectReads = 0;
                stepJson["revealed"] = new JArray(TopDeck(gls).Where(c => c != null).Select(Card));
                // An effect that has just opened, or is closing, has no
                // current step for a moment and the sim's own count throws:
                // the table is read again shortly, and after a few tries the
                // effect is taken to want one target.
                try
                {
                    stepJson["remaining"] = (int)AccessTools.Method(typeof(GameplayLogicScript), "RemainingTargetsToSelect").Invoke(gls, new object[] { aca });
                    unreadyEffectReads = 0;
                }
                catch (Exception)
                {
                    if (candidates.Count == 0 && ++unreadyEffectReads < 10) return null;
                    stepJson["remaining"] = 1;
                }
            }
            var snapshot = new JObject
            {
                ["version"] = 1,
                ["turn"] = Math.Max(1, game.iPlayerTurnNumber),
                ["turnPlayer"] = game.iPlayerTurn == 0 ? "p1" : "p2",
                ["seat"] = decider == 0 ? "p1" : "p2",
                ["step"] = stepJson,
                ["players"] = players,
                ["buttons"] = new JArray(VisibleChoiceButtons().Select(b => b.GetComponent<ChoiceButtonScript>()?.myType.ToString() ?? "")),
                // What each says: several buttons of one kind ("choose one")
                // are told apart only by their text.
                ["guess"] = GuessShown() is int guess ? (JToken)guess : JValue.CreateNull(),
                ["labels"] = new JArray(VisibleChoiceButtons().Select(b => b.GetComponentInChildren<TMP_Text>()?.text ?? b.GetComponentInChildren<Text>()?.text ?? "")),
            };
            if (Recorded)
            {
                snapshot["record"] = true;
                snapshot["game"] = gameId;
                snapshot["first"] = game.iPlayerGoesFirst == 0 ? "p1" : "p2";
                if (!bothSeats) snapshot["person"] = modelSeat.Value == 0 ? "p2" : "p1";
            }
            return snapshot;
        }

        // Every card an effect could name: both players' zones, and the cards
        // an effect has turned over from the top of a deck.
        IEnumerable<GameObject> TableCards()
        {
            foreach (var player in gls.Lps_Players)
                foreach (var zone in new[] { player.Lgo_MyHand, player.Lgo_MyDeploy, player.Lgo_MyLeader, player.Lgo_MyStage, player.Lgo_MyTrash, player.Lgo_MyLifeDeck })
                    foreach (var card in zone)
                        yield return card;
            foreach (var card in TopDeck(gls))
                yield return card;
            // DON!! an effect is paid with or moves: rested first, since that
            // is the DON!! a payment is taken from when there is a choice.
            foreach (var player in gls.Lps_Players)
                foreach (var don in player.Lgo_MyDonCostArea.Where(d => d != null).OrderBy(d => Live(d).bTapped ? 0 : 1))
                    yield return don;
            // And the DON!! given to cards, which is all there is to pay with
            // once the cost area is empty.
            foreach (var player in gls.Lps_Players)
                foreach (var zone in new[] { player.Lgo_MyLeader, player.Lgo_MyDeploy })
                    foreach (var card in zone)
                    {
                        var given = card == null ? null : card.GetComponent<CardLogicScript>()?.lgo_AttachedDon;
                        if (given == null) continue;
                        foreach (var don in given)
                            if (don != null) yield return don;
                    }
        }

        JObject Side(PlayerState player, bool mine)
        {
            var ownersTurn = gls.Lps_Players[gls.gsv_CurrentGame.iPlayerTurn] == player;
            var leader = player.Lgo_MyLeader.FirstOrDefault();
            var deckList = new JArray();
            foreach (var zone in new[] { player.Lgo_MyDeck, player.Lgo_MyHand, player.Lgo_MyDeploy, player.Lgo_MyStage, player.Lgo_MyLifeDeck, player.Lgo_MyTrash })
                foreach (var card in zone)
                    if (card != null) deckList.Add(CardNumber(card));

            var don = player.Lgo_MyDonCostArea.Where(d => d != null).ToList();
            var side = new JObject
            {
                // Every one of the seat's 50 is somewhere on the table, so the
                // list is read off the zones rather than the deck file.
                ["deckList"] = deckList,
                ["leader"] = Field(leader, ownersTurn),
                ["hand"] = mine ? (JToken)new JArray(player.Lgo_MyHand.Where(c => c != null).Select(Card)) : player.Lgo_MyHand.Count,
                ["characters"] = new JArray(player.Lgo_MyDeploy.Where(c => c != null).Select(c => Field(c, ownersTurn))),
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
            // A recorded game is dealt again in the engine, which needs the
            // cards nobody sees. The sim keeps the top of a pile at the end of
            // its list; the snapshot names piles top first.
            if (Recorded)
            {
                side["deck"] = new JArray(player.Lgo_MyDeck.Where(c => c != null).Reverse().Select(Card));
                side["lifeCards"] = new JArray(player.Lgo_MyLifeDeck.Where(c => c != null).Reverse().Select(Card));
            }
            return side;
        }

        JObject Card(GameObject card) => new JObject { ["id"] = Id(card), ["cardNumber"] = CardNumber(card) };

        JObject Field(GameObject card, bool ownersTurn)
        {
            var live = Live(card);
            var logic = card.GetComponent<CardLogicScript>();
            return new JObject
            {
                ["id"] = Id(card),
                ["cardNumber"] = CardNumber(card),
                ["rested"] = live.bTapped,
                ["don"] = logic.lgo_AttachedDon?.Count ?? 0,
                // DON!! given to a card counts on its owner's turn only, which
                // is what the sim's "attacking" flag switches on.
                ["power"] = gls.CardPower(card, ownersTurn, false),
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
                        // A target the engine's action names is asked for by
                        // the sim as the effect's own prompt, and answered
                        // there.
                        var source = card("card");
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
                case "trigger":
                    {
                        var activate = (bool?)move["activate"] ?? true;
                        steps.Enqueue(() => activate
                            ? Press(ButtonChoiceType.Trigger) || Press(ButtonChoiceType.TriggerOutOfOrder)
                            : Press(ButtonChoiceType.NoTrigger) || Press(ButtonChoiceType.NoTriggerOutOfOrder));
                        return true;
                    }
                case "no-block":
                    steps.Enqueue(() => Press(ButtonChoiceType.NoBlocker));
                    return true;
                case "no-counter":
                    steps.Enqueue(() => Press(ButtonChoiceType.ResolveAttack));
                    return true;
                case "choose":
                {
                    var aca = gls.acaActive;
                    var stepAt = aca == null ? -1 : aca.iActionStep;
                    foreach (var id in move["cards"] ?? new JArray())
                    {
                        var target = cardsById.TryGetValue((string)id ?? "", out var go) ? go : null;
                        if (target == null) return false;
                        steps.Enqueue(() => Click(target));
                    }
                    // "V3Choice#2" names the second button of that kind: the
                    // sim asks "choose one" with several of the same type.
                    var buttonName = ((string)move["button"] ?? "").Split('#');
                    var nth = buttonName.Length > 1 && int.TryParse(buttonName[1], out var parsed) ? parsed : 1;
                    var named = Enum.TryParse<ButtonChoiceType>(buttonName[0], out var button) ? button : (ButtonChoiceType?)null;
                    var chose = (move["cards"] ?? new JArray()).Any();
                    if (move["guess"] != null && move["guess"].Type == JTokenType.Integer)
                    {
                        var wanted = (int)move["guess"];
                        steps.Enqueue(() =>
                        {
                            // The number is set on the effect and confirmed the
                            // way the sim's own button confirms it.
                            if (!GuessOpen()) return false;
                            var effect = gls.acaActive;
                            Traverse.Create(effect).Field("sSavedInt").SetValue(Math.Max(0, Math.Min(99, wanted)));
                            ownClick = true;
                            try { AccessTools.Method(typeof(GameplayLogicScript), "V3Guess").Invoke(gls, new object[] { effect }); }
                            finally { ownClick = false; }
                            return true;
                        });
                        return true;
                    }
                    steps.Enqueue(() =>
                    {
                        // The button the bridge named answers the prompt.
                        if (named != null) return Press(named.Value, nth);
                        // A card picked at a prompt with no effect object (the
                        // Character a sixth replaces) is the whole answer; a
                        // confirm button showing by now belongs to whatever
                        // effect the play went on to start.
                        if (aca == null && chose) return true;
                        // A prompt for several cards stays open for the next.
                        if (chose && ((bool?)move["more"] ?? false)) return true;
                        // The sim moves on by itself once the last target it
                        // needs is chosen; otherwise its confirm button closes
                        // the selection with the targets so far, or with none.
                        if (aca != null && (gls.acaActive != aca || aca.iActionStep != stepAt)) return true;
                        // "Draw none" closes a look at the deck with nothing
                        // taken, so it never follows a card that was.
                        foreach (var type in ConfirmButtons)
                            if (!(chose && type == ButtonChoiceType.DrawNone) && Press(type)) return true;
                        // A question the bridge had no answer for is given the
                        // sim's first one, so the game goes on.
                        if (!chose)
                        {
                            foreach (var type in PromptButtons().ToList())
                                if (Press(type)) return true;
                            // With nothing else to press, an optional effect
                            // is passed on.
                            if (aca != null && gls.acaActive == aca) Press(ButtonChoiceType.Cancel);
                        }
                        return true;
                    });
                    return true;
                }
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
                // The rest of the move is dropped, and whatever it had
                // selected is let go, so the decision can be asked again.
                steps.Clear();
                planFailed = true;
                Press(ButtonChoiceType.Cancel);
                Logger.LogWarning("a click of " + lastMove + " did not take");
            }
            nextAt = Time.unscaledTime + Delay();
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
        static readonly string[] ChoiceButtonFields = { "go_ChoiceButton1", "go_ChoiceButton2", "go_ChoiceButton3", "go_ChoiceButton4" };

        IEnumerable<GameObject> VisibleChoiceButtons()
        {
            foreach (var name in ChoiceButtonFields)
            {
                var button = Get<GameObject>(name);
                if (button != null && button.activeInHierarchy) yield return button;
            }
        }

        ChoiceButtonScript FindButton(ButtonChoiceType type, int nth = 1)
        {
            foreach (var button in VisibleChoiceButtons())
            {
                var script = button.GetComponent<ChoiceButtonScript>();
                if (script != null && script.myType == type && --nth == 0) return script;
            }
            return null;
        }

        bool Press(ButtonChoiceType type, int nth = 1)
        {
            var script = FindButton(type, nth);
            if (script == null) return false;
            if (type == ButtonChoiceType.Cancel) backedOut = true;
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

        T Get<T>(string field) => (T)AccessTools.Field(typeof(GameplayLogicScript), field).GetValue(gls);
    }
}
