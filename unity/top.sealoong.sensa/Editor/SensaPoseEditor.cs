using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;
using VRC.SDK3.Avatars.Components;

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
            EditorGUILayout.LabelField(SensaEditorLocalization.Text("Aperture radius / position limit"),
                SensaEditorLocalization.Format("4 cm / {0:F2} m; receiver radius 2 m", SensaPoseProtocol.PositionRadius));
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Green scene-view slices show where all required distances can be measured. Orange anchor centers are excluded because the signal saturates. Tracking a point does not mean it has entered the 4 cm opening."), MessageType.Info);
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
            SensaCoverageGizmos.Pose(socket.transform, false);
        }
    }

    // Scene-view cross sections of the actual common receiver volume, not four overlapping
    // receiver outlines mistaken for a fully measurable box. Distances are in the authored frame.
    internal static class SensaCoverageGizmos
    {
        internal static void Fixed(Transform frame)
        {
            var center = new Vector3(SensaFixedAnchorProtocol.CenterX, SensaFixedAnchorProtocol.CenterY, SensaFixedAnchorProtocol.CenterZ);
            var anchors = new Vector3[SensaFixedAnchorProtocol.AnchorCount];
            for (int i = 0; i < anchors.Length; i++)
                anchors[i] = new Vector3(SensaFixedAnchorProtocol.AnchorX(i), SensaFixedAnchorProtocol.AnchorY(i), SensaFixedAnchorProtocol.AnchorZ(i));
            Draw(frame, center, anchors, SensaFixedAnchorProtocol.MaximumCenterDistance,
                SensaFixedAnchorProtocol.MinimumCenterDistance, SensaFixedAnchorProtocol.PositionHalfRange, float.PositiveInfinity);
        }

        internal static void Pose(Transform frame, bool tetrahedron)
        {
            var anchors = new Vector3[tetrahedron ? 4 : 8];
            for (int i = 0; i < anchors.Length; i++)
            {
                int index = tetrahedron ? SensaPoseProtocol.PointAnchorIndex(i) : i;
                anchors[i] = new Vector3(SensaPoseProtocol.AnchorX(index), SensaPoseProtocol.AnchorY(index), SensaPoseProtocol.AnchorZ(index));
            }
            Draw(frame, Vector3.zero, anchors, SensaPoseProtocol.ReceiverRadius * (1 - SensaPoseProtocol.MinimumProximity) + SensaPoseProtocol.MarkerRadius,
                SensaPoseProtocol.ReceiverRadius * (1 - SensaPoseProtocol.MaximumProximity) + SensaPoseProtocol.MarkerRadius,
                float.PositiveInfinity, SensaPoseProtocol.PositionRadius);
        }

        internal static float Boundary(Vector3 direction, Vector3 center, Vector3[] anchors,
            float maximumDistance, float halfRange, float positionRadius)
        {
            float limit = positionRadius;
            if (!float.IsPositiveInfinity(halfRange))
                limit = Mathf.Min(limit, halfRange / Mathf.Max(Mathf.Abs(direction.x), Mathf.Abs(direction.y), Mathf.Abs(direction.z)));
            foreach (var anchor in anchors)
            {
                var offset = anchor - center;
                float projection = Vector3.Dot(direction, offset);
                float discriminant = maximumDistance * maximumDistance - offset.sqrMagnitude + projection * projection;
                if (discriminant <= 0) return 0;
                limit = Mathf.Min(limit, projection + Mathf.Sqrt(discriminant));
            }
            return Mathf.Max(0, limit);
        }

        private static void Draw(Transform frame, Vector3 center, Vector3[] anchors, float maximumDistance,
            float minimumDistance, float halfRange, float positionRadius)
        {
            using (new Handles.DrawingScope(frame.localToWorldMatrix))
            {
                for (int plane = 0; plane < 3; plane++)
                {
                    const int steps = 96;
                    var points = new Vector3[steps + 1];
                    for (int i = 0; i < steps; i++)
                    {
                        float angle = 2 * Mathf.PI * i / steps;
                        var direction = plane == 0 ? new Vector3(Mathf.Cos(angle), Mathf.Sin(angle), 0)
                            : plane == 1 ? new Vector3(Mathf.Cos(angle), 0, Mathf.Sin(angle)) : new Vector3(0, Mathf.Cos(angle), Mathf.Sin(angle));
                        points[i] = center + direction * Boundary(direction, center, anchors, maximumDistance, halfRange, positionRadius);
                    }
                    points[steps] = points[0];
                    Handles.color = new Color(.12f, .8f, .45f, .035f);
                    Handles.DrawAAConvexPolygon(points);
                    Handles.color = new Color(.12f, .8f, .45f, .75f);
                    Handles.DrawAAPolyLine(2, points);
                }
                for (int i = 0; i < anchors.Length; i++)
                {
                    Handles.color = new Color(1, .5f, .1f, .9f);
                    foreach (var normal in new[] { Vector3.up, Vector3.right, Vector3.forward })
                        Handles.DrawWireDisc(anchors[i], normal, minimumDistance);
                    Handles.Label(anchors[i], "P" + i);
                }
                Handles.color = new Color(.12f, .8f, .45f);
                Handles.Label(center, SensaEditorLocalization.Text("Common measurable volume; orange centers excluded"));
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
        [MenuItem("GameObject/Sensa/SPS four-anchor tracking", false, 10)]
        public static void SpsRoot() => Create("SensaSpsRootProbe");
        [MenuItem("GameObject/Sensa/Contact direct tracking (SDK Beta)", false, 10)]
        public static void ContactRoot() => Create("SensaContactRootProbe");
        [MenuItem("GameObject/Sensa/Shader Root Capture (Experimental)", false, 10)]
        public static void ShaderCapture() => Create("SensaShaderCapture");
        [MenuItem("GameObject/Sensa/Automatic SPS Setup", false, 10)]
        public static void Automatic() => Create("SensaAutoSetup");
        [MenuItem("GameObject/Sensa/Local Bone or PB Probe", false, 10)]
        public static void Point() => Create("SensaLocalPoint");
        [MenuItem("GameObject/Sensa/PB Grab Handle", false, 10)]
        public static void Handle() => Create("SensaGrabHandle");
        [MenuItem("GameObject/Sensa/Spatial Pose Plug", false, 10)]
        public static void Plug() => Create("SensaPosePlug");
        private static GameObject Create(string name)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Package + "Prefabs/" + name + ".prefab");
            if (prefab == null) throw new System.InvalidOperationException(SensaEditorLocalization.Text("Install the complete Sensa package: the authoring prefab is missing.") + " " + name);
            var selected = Selection.activeTransform;
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            if (selected != null) instance.transform.SetParent(selected, false);
            try { ConfigureCreatedAuthor(instance, selected); }
            catch { Object.DestroyImmediate(instance); throw; }
            Undo.RegisterCreatedObjectUndo(instance, SensaEditorLocalization.Text("Create Sensa pose rig"));
            Selection.activeGameObject = instance; return instance;
        }
        private static void ConfigureCreatedAuthor(GameObject instance, Transform selected)
        {
            var avatar = selected != null ? selected.GetComponentInParent<VRCAvatarDescriptor>() : null;
            var scope = avatar != null ? avatar.transform : selected != null ? selected.root : instance.transform;
            var target = SelectedRoot(selected);
            var usedNames = new HashSet<string>(scope.GetComponentsInChildren<SensaFixedRootProbe>(true)
                .Where(probe => probe.gameObject != instance).Select(probe => probe.instanceName)
                .Concat(scope.GetComponentsInChildren<SensaContactRootProbe>(true)
                    .Where(probe => probe.gameObject != instance).Select(probe => probe.instanceName)), System.StringComparer.Ordinal);
            string rootName = "Root";
            for (int suffix = 2; usedNames.Contains(rootName); suffix++) rootName = "Root_" + suffix;
            var fixedRoot = instance.GetComponent<SensaFixedRootProbe>();
            if (fixedRoot != null) { fixedRoot.instanceName = rootName; fixedRoot.target = target; PrefabUtility.RecordPrefabInstancePropertyModifications(fixedRoot); }
            var contactRoot = instance.GetComponent<SensaContactRootProbe>();
            if (contactRoot != null) { contactRoot.instanceName = rootName; contactRoot.target = target; PrefabUtility.RecordPrefabInstancePropertyModifications(contactRoot); }
            var shader = instance.GetComponent<SensaShaderCapture>();
            if (shader != null)
            {
                var used = new HashSet<int>(scope.GetComponentsInChildren<SensaShaderCapture>(true)
                    .Where(probe => probe != shader).Select(probe => probe.producerId));
                shader.producerId = Enumerable.Range(1, 65535).FirstOrDefault(id => !used.Contains(id));
                if (shader.producerId == 0) throw new System.InvalidOperationException(SensaEditorLocalization.Text("Choose an unused Shader producer ID from 1–65535."));
                shader.target = target;
                PrefabUtility.RecordPrefabInstancePropertyModifications(shader);
            }
            var setup = instance.GetComponent<SensaAutoSetup>();
            if (setup != null)
            {
                var groups = new HashSet<string>(scope.GetComponentsInChildren<SensaAutoSetup>(true)
                    .Where(author => author != setup).Select(author => author.groupName), System.StringComparer.Ordinal);
                string group = "Auto";
                for (int suffix = 2; groups.Contains(group); suffix++) group = "Auto_" + suffix;
                setup.groupName = group;
                if (selected != null && selected.GetComponents<Component>().Count(SensaSpsAdapter.IsTarget) == 1)
                { setup.discoverAll = false; setup.selectedTargets = new List<GameObject> { selected.gameObject }; }
                PrefabUtility.RecordPrefabInstancePropertyModifications(setup);
            }
        }
        private static Component SelectedRoot(Transform selected)
        {
            if (selected == null) return null;
            var roots = selected.GetComponents<Component>().Where(component => !(component is Transform) && SensaSpsAdapter.IsRootTarget(component)).ToArray();
            if (roots.Length == 1) return roots[0];
            // A selected bone/marker is explicit. An Avatar descriptor or multiple root components need a choice.
            // 明确选择骨骼／标记即可使用其 Transform；Avatar 根或多组件对象留待用户选择。
            return roots.Length == 0 && selected.GetComponent<VRCAvatarDescriptor>() == null ? selected : null;
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
    }
}
