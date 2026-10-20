using UnityEditor;
using UnityEngine;

namespace UnityBox.Sensa
{
    [CustomEditor(typeof(SensaPoseSocket))]
    public sealed class SensaPoseSocketEditor : Editor
    {
        public override void OnInspectorGUI()
        {
            SensaInspectorLabels.Draw(serializedObject);
            var socket = (SensaPoseSocket)target;
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text("+Z points inward. 24 local Proximity receivers per Self/Others group. Both sides need matching three-point markers and channel; ordinary TPS tags lack this geometry. Uniform scale required."), MessageType.Info);
            try { SensaPoseBuilder.Validate(socket); }
            catch (System.Exception ex) { EditorGUILayout.HelpBox(ex.Message, MessageType.Error); }
            EditorGUILayout.LabelField(SensaEditorLocalization.Text("Protocol"), SensaPoseProtocol.Prefix);
            EditorGUILayout.LabelField(SensaEditorLocalization.Text("Aperture radius / position limit"), SensaEditorLocalization.Text("4 cm / about 24 cm (local units; saturation can still occur inside)"));
            if (GUILayout.Button(SensaEditorLocalization.Text("Bake a native VRC prefab copy"))) SensaPoseMenus.Bake(socket.gameObject);
        }
        private void OnSceneGUI()
        {
            var socket = (SensaPoseSocket)target;
            using (new Handles.DrawingScope(new Color(.15f, .65f, 1f), socket.transform.localToWorldMatrix))
            {
                Handles.DrawWireDisc(Vector3.zero, Vector3.forward, SensaPoseProtocol.ApertureRadius);
                Handles.ArrowHandleCap(0, Vector3.zero, Quaternion.identity, .14f, EventType.Repaint);
                Handles.DrawWireCube(Vector3.zero, Vector3.one * SensaPoseProtocol.AnchorHalfSpan * 2);
                for (var i = 0; i < 8; i++)
                {
                    var point = new Vector3(SensaPoseProtocol.AnchorX(i), SensaPoseProtocol.AnchorY(i), SensaPoseProtocol.AnchorZ(i));
                    Handles.SphereHandleCap(0, point, Quaternion.identity, .004f, EventType.Repaint);
                    Handles.Label(point, "A" + i);
                }
                Handles.Label(Vector3.forward * .16f, SensaEditorLocalization.Text("+Z inward"));
            }
        }
    }

    [CustomEditor(typeof(SensaPosePlug))]
    public sealed class SensaPosePlugEditor : Editor
    {
        public override void OnInspectorGUI()
        {
            SensaInspectorLabels.Draw(serializedObject);
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Root and Tip define the straight axis; Side defines twist. Reference actual bone markers if needed. Uses three tiny spherical Senders without changing SPS deformation. One target per channel at a time."), MessageType.Info);
            try { SensaPoseBuilder.Validate((SensaPosePlug)target); }
            catch (System.Exception ex) { EditorGUILayout.HelpBox(ex.Message, MessageType.Error); }
            if (GUILayout.Button(SensaEditorLocalization.Text("Bake a native VRC prefab copy"))) SensaPoseMenus.Bake(((SensaPosePlug)target).gameObject);
        }
        private void OnSceneGUI()
        {
            var plug = (SensaPosePlug)target;
            if (plug.rootMarker == null || plug.tipMarker == null || plug.sideMarker == null) return;
            Handles.color = Color.cyan;
            Handles.DrawLine(plug.rootMarker.position, plug.tipMarker.position);
            Handles.DrawLine(plug.rootMarker.position, plug.sideMarker.position);
            Handles.Label(plug.rootMarker.position, SensaEditorLocalization.Text("Root")); Handles.Label(plug.tipMarker.position, SensaEditorLocalization.Text("Tip")); Handles.Label(plug.sideMarker.position, SensaEditorLocalization.Text("Side / roll"));
        }
    }

    public static class SensaPoseMenus
    {
        private const string Package = "Packages/top.sealoong.sensa/";
        [MenuItem("GameObject/Sensa/Spatial Pose Socket", false, 10)]
        public static void Socket() => Create("SensaPoseSocket");
        [MenuItem("GameObject/Sensa/Fixed-anchor SPS Root Probe", false, 10)]
        public static void SpsRoot() => Create("SensaSpsRootProbe");
        [MenuItem("GameObject/Sensa/Spatial Pose Plug", false, 10)]
        public static void Plug() => Create("SensaPosePlug");
        private static GameObject Create(string name)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Package + "Prefabs/" + name + ".prefab");
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            Undo.RegisterCreatedObjectUndo(instance, SensaEditorLocalization.Text("Create Sensa pose rig"));
            if (Selection.activeTransform != null) instance.transform.SetParent(Selection.activeTransform, false);
            Selection.activeGameObject = instance; return instance;
        }
        [MenuItem("GameObject/Sensa/Local Calibration Pair", false, 10)]
        public static void CalibrationPair()
        {
            var parent = new GameObject("SensaPose_CalibrationPair"); Undo.RegisterCreatedObjectUndo(parent, SensaEditorLocalization.Text("Create Sensa calibration pair"));
            if (Selection.activeTransform != null) parent.transform.SetParent(Selection.activeTransform, false);
            Selection.activeGameObject = parent;
            var socket = Create("SensaPoseSocket"); Selection.activeGameObject = parent;
            var plug = Create("SensaPosePlug");
            var profile = AssetDatabase.LoadAssetAtPath<SensaPoseProfile>(Package + "Profiles/SelfTest.asset");
            socket.GetComponent<SensaPoseSocket>().profile = profile;
            plug.GetComponent<SensaPosePlug>().profile = profile;
            plug.transform.localPosition = new Vector3(0, 0, -.10f);
            Selection.activeGameObject = parent;
        }
        public static void Bake(GameObject source)
        {
            foreach (var plug in source.GetComponentsInChildren<SensaPosePlug>(true))
                foreach (var marker in new[] { plug.rootMarker, plug.tipMarker, plug.sideMarker })
                    if (marker != null && !marker.IsChildOf(source.transform))
                    {
                        EditorUtility.DisplayDialog("Sensa Pose", SensaEditorLocalization.Text("Standalone baking requires markers inside the selected object. External bone references need full-avatar NDMF processing."), SensaEditorLocalization.Text("OK"));
                        return;
                    }
            var path = EditorUtility.SaveFilePanelInProject(SensaEditorLocalization.Text("Bake native VRC contacts"), source.name + "_Baked", "prefab", SensaEditorLocalization.Text("Save a copy; the authoring prefab stays editable."));
            if (string.IsNullOrEmpty(path)) return;
            var copy = Object.Instantiate(source);
            try { SensaPoseBuilder.ProcessAvatar(copy); PrefabUtility.SaveAsPrefabAsset(copy, path); }
            finally { Object.DestroyImmediate(copy); }
        }
    }
}
