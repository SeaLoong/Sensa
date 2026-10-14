using System;
using System.IO;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UdonSharp;
using UdonSharpEditor;
using VRC.SDK3.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using UnityBox.Sensa;

namespace SensaLab
{
    public static class QuickStartLab
    {
        [MenuItem("Tools/Sensa Lab/Add first-run avatar bench")]
        public static void Install()
        {
            foreach (var name in new[] { "QuickStartStation", "QuickStartButton" })
            {
                string path = "Assets/SensaLab/Runtime/" + name + ".asset";
                if (AssetDatabase.LoadAssetAtPath<UdonSharpProgramAsset>(path) == null)
                {
                    var program = ScriptableObject.CreateInstance<UdonSharpProgramAsset>();
                    program.sourceCsScript = AssetDatabase.LoadAssetAtPath<MonoScript>("Assets/SensaLab/Runtime/" + name + ".cs");
                    program.ScriptVersion = UdonSharpProgramVersion.CurrentVersion; AssetDatabase.CreateAsset(program, path);
                }
            }
            UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync(new UdonSharp.Compiler.UdonSharpCompileOptions { IsEditorBuild = true });
            EditorSceneManager.OpenScene(FunctionalLab.Scene);
            if (GameObject.Find("00 START HERE") != null) throw new InvalidOperationException("First-run bench already exists; preserve scene edits before rebuilding.");
            var root = new GameObject("00 START HERE"); root.transform.position = new Vector3(1.4f, 0, .6f);
            var station = UdonSharpUndo.AddComponent<QuickStartStation>(root);
            station.depthSender = Sender(root.transform, "Depth stimulus", SensaQuickStartProtocol.DepthTag);
            station.activeSender = Sender(root.transform, "Active stimulus", SensaQuickStartProtocol.ActiveTag);
            var ball = GameObject.CreatePrimitive(PrimitiveType.Sphere); ball.name = "Touch target - pickup";
            ball.transform.SetParent(root.transform, false); ball.transform.localPosition = new Vector3(0, 1, -.1f); ball.transform.localScale = Vector3.one * .06f;
            var material = new Material(Shader.Find("Standard")) { color = Color.cyan };
            AssetDatabase.CreateAsset(material, FunctionalLab.Root + "/QuickStartBall.mat"); ball.GetComponent<Renderer>().sharedMaterial = material;
            var body = ball.AddComponent<Rigidbody>(); body.useGravity = false; body.drag = 8; body.angularDrag = 8;
            ball.AddComponent<VRCPickup>(); station.pickup = ball.transform;
            station.status = FunctionalLab.Board(root.transform, "First run instructions", new Vector3(0, 1.8f, .4f),
                "START HERE: YOUR AVATAR -> OSC -> SENSA\nAdd Quick Start World Receiver to your avatar root, upload privately.\nIn Sensa import Quick Start preset; apply OSC input.\nPreview first, then connect OSR with a small L0 range.\nSelect a step below, or TOUCH and move your right wrist to the ball.\nNo Python, camera or second avatar is needed.\nExpected values are shown in Play Mode. Actual OSC is in Sensa.");
            string[] actions = { "Zero", "Quarter", "Half", "ThreeQuarters", "Full", "Touch", "Stop", "ResetBall" };
            string[] labels = { "0%", "25%", "50%", "75%", "100%", "TOUCH", "STOP", "RESET" };
            for (int i = 0; i < actions.Length; i++)
            {
                var button = GameObject.CreatePrimitive(PrimitiveType.Cube); button.name = labels[i]; button.transform.SetParent(root.transform, false);
                button.transform.localPosition = new Vector3((i % 4 - 1.5f) * .25f, .95f - (i / 4) * .2f, -.45f);
                button.transform.localScale = new Vector3(.19f, .12f, .1f);
                var action = UdonSharpUndo.AddComponent<QuickStartButton>(button); action.station = station; action.action = actions[i]; UdonSharpEditorUtility.CopyProxyToUdon(action);
                var text = new GameObject("Label").AddComponent<TextMesh>(); text.transform.SetParent(root.transform, false); text.transform.position = button.transform.position + new Vector3(0, .08f, -.06f);
                text.text = labels[i]; text.anchor = TextAnchor.MiddleCenter; text.characterSize = .014f; text.fontSize = 40;
            }
            UdonSharpEditorUtility.CopyProxyToUdon(station);
            Style(station);
            EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene()); AssetDatabase.SaveAssets();
            InteractiveLab.Upgrade();
        }
        [MenuItem("Tools/Sensa Lab/Refresh first-run bench appearance")]
        public static void RefreshAppearance()
        {
            EditorSceneManager.OpenScene(FunctionalLab.Scene);
            Style(UnityEngine.Object.FindObjectOfType<QuickStartStation>());
            EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene()); AssetDatabase.SaveAssets();
        }
        static void Style(QuickStartStation station)
        {
            station.status.fontSize = 42;
            string[] labels = { "0%", "25%", "50%", "75%", "100%", "TOUCH", "STOP", "RESET" };
            for (int i = 0; i < labels.Length; i++)
            {
                string path = FunctionalLab.Root + "/QuickStartButton" + i + ".mat";
                var material = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (material == null) { material = new Material(Shader.Find("Unlit/Color")); AssetDatabase.CreateAsset(material, path); }
                material.color = i == 6 ? new Color(.65f, .08f, .1f) : i == 5 ? new Color(0, .35f, .35f) : new Color(.08f, .18f + i * .018f, .32f);
                station.transform.Find(labels[i]).GetComponent<Renderer>().sharedMaterial = material;
            }
        }
        static GameObject Sender(Transform parent, string name, string tag)
        {
            var node = new GameObject(name); node.transform.SetParent(parent, false);
            var sender = node.AddComponent<VRCContactSender>(); sender.radius = SensaQuickStartProtocol.SenderRadius; sender.collisionTags = new List<string> { tag };
            node.SetActive(false); return node;
        }
    }
}
