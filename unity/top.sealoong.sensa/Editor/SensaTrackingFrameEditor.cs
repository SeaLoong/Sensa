using System;
using UnityEditor;
using UnityEngine;
using VRC.SDK3.Avatars.Components;

namespace UnityBox.Sensa
{
    [CustomEditor(typeof(SensaTrackingFrame))]
    public sealed class SensaTrackingFrameEditor : Editor
    {
        public override void OnInspectorGUI()
        {
            SensaInspectorLabels.Draw(serializedObject);
            var author = (SensaTrackingFrame)target;
            EditorGUILayout.LabelField(SensaEditorLocalization.Text("Depth direction in reference axes"));
            using (new EditorGUILayout.HorizontalScope())
            {
                var directions = new[] { Vector3.forward, Vector3.back, Vector3.right, Vector3.left, Vector3.up, Vector3.down };
                var labels = new[] { "+Z", "−Z", "+X", "−X", "+Y", "−Y" };
                for (int i = 0; i < directions.Length; i++)
                    if (GUILayout.Button(labels[i]))
                        SetDepthDirection(author, directions[i]);
            }
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text(
                "The XY reference plane follows the selected root on this Avatar. +Z gives positive depth. Origin, Forward and Right are three separate measured points; the rigid frame keeps Avatar scale when a bone changes size."), MessageType.Info);
            var prefix = author.trackingMethod == SensaRootTrackingMethod.ContactDirect ? SensaContactProtocol.Prefix : SensaFixedAnchorProtocol.Prefix;
            foreach (var marker in SensaTrackingFrameBuilder.MarkerNames)
                EditorGUILayout.SelectableLabel(prefix + "/" + SensaTrackingFrameBuilder.Instance(author, marker), GUILayout.Height(EditorGUIUtility.singleLineHeight));
            EditorGUILayout.HelpBox(SensaEditorLocalization.Format("This frame adds {0} Contacts. Select its Origin measurement in the WebUI follow-plane template.",
                SensaTrackingFrameBuilder.ContactCount(author)), MessageType.Info);
            var avatar = author.GetComponentInParent<VRCAvatarDescriptor>();
            if (avatar == null) return;
            try { SensaTrackingFrameBuilder.Validate(avatar.gameObject, author); }
            catch (InvalidOperationException error) { EditorGUILayout.HelpBox(error.Message, MessageType.Warning); }
        }

        internal static Quaternion DepthRotation(Vector3 forward) => Quaternion.LookRotation(forward,
            Mathf.Abs(Vector3.Dot(forward.normalized, Vector3.up)) > .9f ? Vector3.forward : Vector3.up);

        internal static void SetDepthDirection(SensaTrackingFrame author, Vector3 forward)
        {
            Undo.RecordObject(author, SensaEditorLocalization.Text("Orient tracking frame"));
            author.rotationOffset = DepthRotation(forward).eulerAngles;
            RecordPrefabChange(author);
        }

        internal static void SetWorldPose(SensaTrackingFrame author, Vector3 position, Quaternion rotation)
        {
            var root = SensaSpsAdapter.ReadRoot(author.reference);
            Undo.RecordObject(author, SensaEditorLocalization.Text("Move tracking frame"));
            author.positionOffset = Quaternion.Inverse(root.rotation) * (root.root.InverseTransformPoint(position) - root.position);
            author.rotationOffset = (Quaternion.Inverse(root.root.rotation * root.rotation) * rotation).eulerAngles;
            RecordPrefabChange(author);
        }

        private static void RecordPrefabChange(SensaTrackingFrame author)
        {
            PrefabUtility.RecordPrefabInstancePropertyModifications(author);
            EditorUtility.SetDirty(author);
        }

        private void OnSceneGUI()
        {
            var author = (SensaTrackingFrame)target;
            var avatar = author.GetComponentInParent<VRCAvatarDescriptor>();
            if (avatar == null) return;
            SensaSpsAdapter.RootPlacement placement;
            try { placement = SensaTrackingFrameBuilder.ResolvePlacement(author); }
            catch (InvalidOperationException) { return; }
            var origin = placement.root.TransformPoint(placement.position);
            var rotation = placement.root.rotation * placement.rotation;
            var length = Mathf.Clamp(author.axisLength, .05f, .5f);
            var scale = avatar.transform.lossyScale.x;
            if (author.trackingMethod == SensaRootTrackingMethod.FourAnchor) SensaCoverageGizmos.Fixed(avatar.transform);
            else using (new Handles.DrawingScope(new Color(.12f, .8f, .45f, .5f), avatar.transform.localToWorldMatrix))
                foreach (var normal in new[] { Vector3.right, Vector3.up, Vector3.forward })
                    Handles.DrawWireDisc(Vector3.zero, normal, SensaContactProtocol.ReceiverRadius);
            using (new Handles.DrawingScope(Matrix4x4.TRS(origin, rotation, Vector3.one * scale)))
            {
                Handles.color = new Color(.1f, .7f, .65f, .16f);
                Handles.DrawSolidDisc(Vector3.zero, Vector3.forward, length);
                Handles.color = new Color(.1f, .7f, .65f);
                Handles.DrawWireDisc(Vector3.zero, Vector3.forward, length);
                Handles.color = Color.blue;
                Handles.ArrowHandleCap(0, Vector3.zero, Quaternion.identity, length, EventType.Repaint);
                Handles.Label(Vector3.forward * length, SensaEditorLocalization.Text("Depth +Z"));
                Handles.color = Color.red; Handles.DrawLine(Vector3.zero, Vector3.right * length);
                Handles.Label(Vector3.right * length, SensaEditorLocalization.Text("Right +X"));
                Handles.color = Color.green; Handles.DrawLine(Vector3.zero, Vector3.up * length);
            }
            EditorGUI.BeginChangeCheck();
            var moved = Tools.current == Tool.Move ? Handles.PositionHandle(origin, rotation) : origin;
            var rotated = Tools.current == Tool.Rotate ? Handles.RotationHandle(rotation, origin) : rotation;
            if (!EditorGUI.EndChangeCheck()) return;
            SetWorldPose(author, moved, rotated);
        }
    }
}
