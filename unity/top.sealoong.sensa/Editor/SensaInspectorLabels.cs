using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace UnityBox.Sensa
{
    // Presentation only: serialized names, enum values and OSC identifiers stay intact.
    internal static class SensaInspectorLabels
    {
        private static readonly Dictionary<string, string> Fields = new Dictionary<string, string>
        {
            { "groupName", "Group name" },
            { "discoverAll", "Discover all" },
            { "selectedTargets", "Selected targets" },
            { "excludedTargets", "Excluded targets" },
            { "socketRootTracking", "Root tracking" },
            { "rootTrackingMethod", "Root tracking method" },
            { "pairedSocketTracking", "Paired Socket tracking" },
            { "pairedPlugMarkers", "Paired Plug markers" },
            { "localPlugTipTracking", "Local Plug tip tracking" },
            { "localReferenceSocket", "Reference Socket" },
            { "createPlugGrabHandles", "Create Plug PB handles" },
            { "pairChannel", "Pair channel" },
            { "arrayPolicy", "Array policy" },
            { "instanceName", "Instance name" },
            { "reference", "Reference frame" },
            { "target", "Target" },
            { "collisionChannel", "Unique collision channel" },
            { "createGrabHandle", "Create grab handle" },
            { "handleLength", "Handle length" },
            { "profile", "Pair profile" },
            { "rootMarker", "Root marker" },
            { "tipMarker", "Tip marker" },
            { "sideMarker", "Side marker" },
            { "channel", "Channel" },
            { "receiveOthers", "Receive Others" },
            { "receiveSelf", "Receive Self" },
            { "role", "Role" },
            { "orificeType", "Orifice type" },
            { "auxSignals", "Supplementary signals" },
            { "customOrificeType", "Custom orifice type" },
            { "depthAxis", "Depth axis" },
            { "socketLength", "Socket length (m)" },
            { "depthRingCount", "Depth ring count" },
            { "detectDps", "Deprecated DPS filter" },
            { "generateAngleParams", "Generate angle parameters" },
            { "generateSelfParam", "Generate Self parameter" },
            { "tipBone", "Tip bone" },
            { "rootBone", "Root bone" },
            { "selfPenetration", "Self interaction" },
            { "label", "Label" },
            { "sourceType", "Signal source" },
            { "existingParameterName", "Existing parameter name" },
            { "physBoneSignal", "PhysBone signal" },
            { "physBoneRoot", "PhysBone root" },
            { "contactRadius", "Contact radius" },
            { "raycastOrigin", "Raycast origin" },
            { "raycastMaxRange", "Raycast maximum range" },
            { "spsTarget", "SPS target" },
            { "producerId", "Producer ID" },
            { "desktopViewport", "Desktop viewport" },
        };
        private static readonly Dictionary<string, string> Enums = new Dictionary<string, string>
        {
            { "Socket", "Socket (receiver)" },
            { "Plug", "Plug (sender)" },
            { "Pussy", "Pussy" },
            { "Ass", "Ass" },
            { "Mouth", "Mouth" },
            { "Custom", "Custom" },
            { "Dedicated", "Dedicated (simultaneous)" },
            { "Exclusive", "Exclusive (one at a time)" },
            { "FourAnchor", "Four-anchor tracking" },
            { "ContactDirect", "Contact direct tracking (SDK Beta)" },
            { "PhysBone", "PhysBone" },
            { "Contact", "Contact" },
            { "ExistingParameter", "Existing parameter" },
            { "Raycast", "Raycast" },
            { "Vibrate", "Vibration" },
            { "GateEnable", "Enable gate" },
            { "DepthOverride", "Depth override" },
            { "AngleX", "Lateral angle" },
            { "AngleY", "Vertical angle" },
            { "Angle", "Angle" },
            { "Stretch", "Stretch" },
            { "Squish", "Squish" },
            { "IsGrabbed", "Is grabbed" },
        };

        internal static GUIContent Label(SerializedProperty property)
        {
            var english = Fields.TryGetValue(property.name, out var name) ? name : property.displayName;
            return new GUIContent(SensaEditorLocalization.Text(english), SensaEditorLocalization.Text(property.tooltip));
        }

        internal static GUIContent EnumLabel(string name) => new GUIContent(
            SensaEditorLocalization.Text(Enums.TryGetValue(name, out var english) ? english : ObjectNames.NicifyVariableName(name)));

        internal static void DrawProperty(SerializedProperty property, GUIContent label = null)
        {
            label = label ?? Label(property);
            if (property.isArray && property.propertyType != SerializedPropertyType.String)
            {
                property.isExpanded = EditorGUILayout.Foldout(property.isExpanded, label, true);
                if (!property.isExpanded) return;
                using (new EditorGUI.IndentLevelScope())
                {
                    int size = EditorGUILayout.IntField(SensaEditorLocalization.Text("Size"), property.arraySize);
                    if (size != property.arraySize) property.arraySize = Mathf.Max(0, size);
                    for (int i = 0; i < property.arraySize; i++)
                        DrawProperty(property.GetArrayElementAtIndex(i), new GUIContent(SensaEditorLocalization.Format("Element {0}", i)));
                }
            }
            else if (property.propertyType == SerializedPropertyType.Enum)
            {
                var labels = new GUIContent[property.enumNames.Length];
                for (int i = 0; i < labels.Length; i++) labels[i] = EnumLabel(property.enumNames[i]);
                int next = EditorGUILayout.Popup(label, property.enumValueIndex, labels);
                if (next != property.enumValueIndex) property.enumValueIndex = next;
            }
            else if (property.propertyType == SerializedPropertyType.Generic && property.hasVisibleChildren)
            {
                property.isExpanded = EditorGUILayout.Foldout(property.isExpanded, label, true);
                if (!property.isExpanded) return;
                using (new EditorGUI.IndentLevelScope())
                {
                    var child = property.Copy();
                    var end = property.GetEndProperty();
                    if (child.NextVisible(true))
                        do { DrawProperty(child); }
                        while (child.NextVisible(false) && !SerializedProperty.EqualContents(child, end));
                }
            }
            else EditorGUILayout.PropertyField(property, label, true);
        }

        internal static void Draw(SerializedObject serialized)
        {
            SensaEditorLocalization.DrawLanguageSelector();
            serialized.Update();
            var property = serialized.GetIterator();
            bool enterChildren = true;
            while (property.NextVisible(enterChildren))
            {
                using (new EditorGUI.DisabledScope(property.propertyPath == "m_Script"))
                    DrawProperty(property, property.propertyPath == "m_Script" ? new GUIContent(SensaEditorLocalization.Text("Script")) : null);
                enterChildren = false;
            }
            serialized.ApplyModifiedProperties();
        }
    }

    [CustomEditor(typeof(SensaPoseProfile))]
    public sealed class SensaPoseProfileEditor : Editor
    {
        public override void OnInspectorGUI() => SensaInspectorLabels.Draw(serializedObject);
    }

    [CustomEditor(typeof(SensaShaderCapture))]
    public sealed class SensaShaderCaptureEditor : Editor
    {
        public override void OnInspectorGUI()
        {
            SensaInspectorLabels.Draw(serializedObject);
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text("The scene-view box shows the coordinate range that the image can encode. The target must remain inside it, and the desktop capture must still contain the complete data area. A visible box does not confirm that VRChat or your headset displays the image."), MessageType.Info);
        }
        private void OnSceneGUI()
        {
            var author = (SensaShaderCapture)target;
            var avatar = author.GetComponentInParent<VRC.SDK3.Avatars.Components.VRCAvatarDescriptor>();
            if (avatar == null) return;
            using (new Handles.DrawingScope(new Color(.12f, .8f, .45f), avatar.transform.localToWorldMatrix))
            {
                var center = new Vector3(SensaFixedAnchorProtocol.CenterX, SensaFixedAnchorProtocol.CenterY, SensaFixedAnchorProtocol.CenterZ);
                Handles.DrawWireCube(center, Vector3.one * (2 * SensaFixedAnchorProtocol.PositionHalfRange));
                Handles.Label(center, SensaEditorLocalization.Text("Shader coordinate range; image capture must be verified separately"));
            }
        }
    }
}
