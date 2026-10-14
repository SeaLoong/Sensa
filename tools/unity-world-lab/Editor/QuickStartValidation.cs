using System;
using System.IO;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UdonSharpEditor;
using VRC.SDKBase;
using VRC.SDK3.Dynamics.Contact.Components;
using UnityBox.Sensa;

namespace SensaLab
{
    [InitializeOnLoad]
    public static class QuickStartValidation
    {
        const string Key = "Sensa.QuickStartValidation";
        static double next;
        static int stage;
        static VRCContactReceiver witness;
        static List<Row> rows;
        [Serializable] class Row { public string action; public float expected, observed; public bool passed; }
        [Serializable] class Report { public bool passed; public Row[] steps; public string scope = "ClientSim Udon + SDK proximity against a world witness; uploaded avatar OSC/hardware not tested"; }
        static QuickStartValidation() { EditorApplication.playModeStateChanged += Changed; EditorApplication.update += Tick; }
        public static void Run()
        {
            EditorSceneManager.OpenScene(FunctionalLab.Scene);
            // The first-run bench has no dependency on SPS baking.
            SessionState.SetBool(Key + "hasPref", EditorPrefs.HasKey("com.vrcfury.playMode"));
            SessionState.SetBool(Key + "pref", EditorPrefs.GetBool("com.vrcfury.playMode", true));
            EditorPrefs.SetBool("com.vrcfury.playMode", false);
            SessionState.SetInt(Key, 1); EditorApplication.isPlaying = true;
        }
        static void Changed(PlayModeStateChange state)
        {
            if (SessionState.GetInt(Key, 0) == 0) return;
            if (state == PlayModeStateChange.EnteredPlayMode) { stage = -1; rows = new List<Row>(); next = EditorApplication.timeSinceStartup + 5; SessionState.SetInt(Key, 2); }
            if (state == PlayModeStateChange.EnteredEditMode)
            {
                if (SessionState.GetBool(Key + "hasPref", false)) EditorPrefs.SetBool("com.vrcfury.playMode", SessionState.GetBool(Key + "pref", true)); else EditorPrefs.DeleteKey("com.vrcfury.playMode");
                SessionState.SetInt(Key, 0); if (Application.isBatchMode) EditorApplication.Exit(SessionState.GetBool(Key + "passed", false) ? 0 : 1);
            }
        }
        static void Tick()
        {
            if (SessionState.GetInt(Key, 0) != 2 || EditorApplication.timeSinceStartup < next) return;
            next = EditorApplication.timeSinceStartup + 1;
            try
            {
                var station = UnityEngine.Object.FindObjectOfType<QuickStartStation>();
                var runtime = UdonSharpEditorUtility.GetBackingUdonBehaviour(station);
                var player = Networking.LocalPlayer;
                if (stage == -1)
                {
                    rows.Add(new Row { action = "Initial stop", passed = !station.depthSender.activeSelf && !station.activeSender.activeSelf });
                    witness = new GameObject("Validation only: avatar-sized receiver").AddComponent<VRCContactReceiver>();
                    witness.radius = player.GetAvatarEyeHeightAsMeters() * SensaQuickStartProtocol.RadiusPerEyeHeight;
                    witness.collisionTags = new List<string> { SensaQuickStartProtocol.DepthTag };
                    witness.ApplyConfigurationChanges();
                }
                else if (stage <= 4)
                {
                    witness.transform.position = player.GetBonePosition(HumanBodyBones.RightHand);
                    float observed = witness.CalculateProximity(station.depthSender.GetComponent<VRCContactSender>());
                    rows.Add(new Row { action = "Step " + stage, expected = stage * .25f, observed = observed,
                        passed = station.depthSender.activeSelf && station.activeSender.activeSelf && Mathf.Abs(observed - stage * .25f) < .01f });
                }
                else if (stage == 5) rows.Add(new Row { action = "Stop", passed = !station.depthSender.activeSelf && !station.activeSender.activeSelf });
                else if (stage == 6)
                {
                    witness.transform.position = player.GetBonePosition(HumanBodyBones.RightHand);
                    float observed = witness.CalculateProximity(station.depthSender.GetComponent<VRCContactSender>());
                    rows.Add(new Row { action = "Touch wrist", expected = 1, observed = observed, passed = station.activeSender.activeSelf && observed > .99f });
                }
                else if (stage == 7)
                {
                    rows.Add(new Row { action = "Expired session", passed = !station.depthSender.activeSelf && !station.activeSender.activeSelf });
                    runtime.SendCustomEvent("ResetBall");
                    Capture(station);
                    bool passed = rows.TrueForAll(r => r.passed);
                    Directory.CreateDirectory("Validation/quick-start"); File.WriteAllText("Validation/quick-start/results.json", JsonUtility.ToJson(new Report { passed = passed, steps = rows.ToArray() }, true));
                    SessionState.SetBool(Key + "passed", passed); SessionState.SetInt(Key, 3); EditorApplication.isPlaying = false; return;
                }
                stage++;
                if (stage <= 4) runtime.SendCustomEvent(new[] { "Zero", "Quarter", "Half", "ThreeQuarters", "Full" }[stage]);
                if (stage == 5) runtime.SendCustomEvent("Stop");
                if (stage == 6) { station.pickup.position = player.GetBonePosition(HumanBodyBones.RightHand); runtime.SendCustomEvent("Touch"); }
                if (stage == 7) runtime.SetProgramVariable("deadline", Time.time - 1);
            }
            catch (Exception e)
            {
                Directory.CreateDirectory("Validation/quick-start"); File.WriteAllText("Validation/quick-start/error.txt", e.ToString());
                SessionState.SetBool(Key + "passed", false); SessionState.SetInt(Key, 3); EditorApplication.isPlaying = false;
            }
        }
        static void Capture(QuickStartStation station)
        {
            var camera = new GameObject("Bench documentation camera").AddComponent<Camera>();
            camera.transform.position = station.transform.position + new Vector3(0, 1.65f, -2.7f); camera.transform.LookAt(station.transform.position + Vector3.up * 1.35f);
            var render = new RenderTexture(1400, 1000, 24); render.Create(); camera.targetTexture = render; camera.Render();
            var previous = RenderTexture.active; var texture = new Texture2D(1400, 1000, TextureFormat.RGB24, false);
            try { RenderTexture.active = render; texture.ReadPixels(new Rect(0, 0, 1400, 1000), 0, 0); texture.Apply(); Directory.CreateDirectory("Validation/quick-start"); File.WriteAllBytes("Validation/quick-start/bench.png", texture.EncodeToPNG()); }
            finally { RenderTexture.active = previous; UnityEngine.Object.DestroyImmediate(texture); UnityEngine.Object.DestroyImmediate(camera.gameObject); render.Release(); UnityEngine.Object.DestroyImmediate(render); }
        }
    }
}
