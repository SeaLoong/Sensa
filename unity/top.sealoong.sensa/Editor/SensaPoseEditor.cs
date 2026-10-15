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
            EditorGUILayout.HelpBox(socket.standardSpsRoot
                ? "单侧 SPS 根部定位：每组 Self/Others 使用 8 个接收器，对方只需现有 TPS_Pen_Root 球形 Sender，无需 Sensa。仅测根部 XYZ，不能测尖端、角度或行程；通道字段不用于筛选标准标签。单目标、均匀缩放。\nOne-sided SPS root tracking: 8 receivers per Self/Others group. The other avatar only needs a standard spherical TPS_Pen_Root Sender. Root XYZ only, no tip/orientation/stroke. Channel does not filter standard tags. One target and uniform scale required."
                : "+Z 指向孔内。每组 Self/Others 使用 24 个本地 Proximity 接收器。双方必须使用配套三点标记和相同通道；普通 TPS 标签不提供足够的几何信息。缩放必须均匀。\n+Z points inward. 24 local Proximity receivers per Self/Others group. Both sides need matching three-point markers and channel; ordinary TPS tags lack this geometry. Uniform scale required.", MessageType.Info);
            try { SensaPoseBuilder.Validate(socket); }
            catch (System.Exception ex) { EditorGUILayout.HelpBox(ex.Message, MessageType.Error); }
            EditorGUILayout.LabelField("协议 / Protocol", socket.standardSpsRoot ? SensaPoseProtocol.SpsRootPrefix : SensaPoseProtocol.Prefix);
            EditorGUILayout.LabelField("孔口半径 / 解算位置上限 / Aperture radius / position limit", "4 cm / 约 24 cm（局部单位；范围内仍可能饱和） / 4 cm / about 24 cm (local units; saturation can still occur inside)");
            if (GUILayout.Button("烘焙副本为原生 VRC 预制件 / Bake a native VRC prefab copy")) SensaPoseMenus.Bake(socket.gameObject);
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
                Handles.Label(Vector3.forward * .16f, "+Z 入孔方向 / +Z inward");
            }
        }
    }

    [CustomEditor(typeof(SensaPosePlug))]
    public sealed class SensaPosePlugEditor : Editor
    {
        public override void OnInspectorGUI()
        {
            SensaInspectorLabels.Draw(serializedObject);
            EditorGUILayout.HelpBox("Root 与 Tip 定义直线轴，Side 定义扭转。可将引用改为实际骨骼上的标记。仅使用三个微型球形 Sender，不修改原有 SPS 形变组件。一个通道同一时刻只对应一个目标。\nRoot and Tip define the straight axis; Side defines twist. Reference actual bone markers if needed. Uses three tiny spherical Senders without changing SPS deformation. One target per channel at a time.", MessageType.Info);
            try { SensaPoseBuilder.Validate((SensaPosePlug)target); }
            catch (System.Exception ex) { EditorGUILayout.HelpBox(ex.Message, MessageType.Error); }
            if (GUILayout.Button("烘焙副本为原生 VRC 预制件 / Bake a native VRC prefab copy")) SensaPoseMenus.Bake(((SensaPosePlug)target).gameObject);
        }
        private void OnSceneGUI()
        {
            var plug = (SensaPosePlug)target;
            if (plug.rootMarker == null || plug.tipMarker == null || plug.sideMarker == null) return;
            Handles.color = Color.cyan;
            Handles.DrawLine(plug.rootMarker.position, plug.tipMarker.position);
            Handles.DrawLine(plug.rootMarker.position, plug.sideMarker.position);
            Handles.Label(plug.rootMarker.position, "Root"); Handles.Label(plug.tipMarker.position, "Tip"); Handles.Label(plug.sideMarker.position, "Side / roll");
        }
    }

    public static class SensaPoseMenus
    {
        private const string Package = "Packages/top.sealoong.sensa/";
        [MenuItem("GameObject/Sensa/Spatial Pose Socket", false, 10)]
        public static void Socket() => Create("SensaPoseSocket");
        [MenuItem("GameObject/Sensa/Single-sided SPS Root Probe", false, 10)]
        public static void SpsRoot() => Create("SensaSpsRootProbe");
        [MenuItem("GameObject/Sensa/Spatial Pose Plug", false, 10)]
        public static void Plug() => Create("SensaPosePlug");
        private static GameObject Create(string name)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Package + "Prefabs/" + name + ".prefab");
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            Undo.RegisterCreatedObjectUndo(instance, "Create Sensa pose rig");
            if (Selection.activeTransform != null) instance.transform.SetParent(Selection.activeTransform, false);
            Selection.activeGameObject = instance; return instance;
        }
        [MenuItem("GameObject/Sensa/Local Calibration Pair", false, 10)]
        public static void CalibrationPair()
        {
            var parent = new GameObject("SensaPose_CalibrationPair"); Undo.RegisterCreatedObjectUndo(parent, "Create Sensa calibration pair");
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
                        EditorUtility.DisplayDialog("Sensa Pose", "独立烘焙的标记必须在选中对象内部。外部骨骼引用请由完整头像的 NDMF 构建处理。 / Standalone baking requires markers inside the selected object. External bone references need full-avatar NDMF processing.", "确定 / OK");
                        return;
                    }
            var path = EditorUtility.SaveFilePanelInProject("Bake native VRC contacts", source.name + "_Baked", "prefab", "Save a copy; the authoring prefab stays editable.");
            if (string.IsNullOrEmpty(path)) return;
            var copy = Object.Instantiate(source);
            try { SensaPoseBuilder.ProcessAvatar(copy); PrefabUtility.SaveAsPrefabAsset(copy, path); }
            finally { Object.DestroyImmediate(copy); }
        }
    }
}
