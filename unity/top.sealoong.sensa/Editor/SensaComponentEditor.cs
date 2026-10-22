using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace UnityBox.Sensa
{
    [CustomEditor(typeof(SensaComponent))]
    public class SensaComponentEditor : Editor
    {
        // Serialized properties
        private SerializedProperty _role;
        private SerializedProperty _orificeType;
        private SerializedProperty _customOrificeType;
        private SerializedProperty _instanceName;

        // Socket
        private SerializedProperty _depthAxis;
        private SerializedProperty _socketLength;
        private SerializedProperty _depthRingCount;
        private SerializedProperty _detectDps;
        private SerializedProperty _generateAngleParams;
        private SerializedProperty _generateSelfParam;

        // Plug
        private SerializedProperty _tipBone;
        private SerializedProperty _rootBone;
        private SerializedProperty _selfPenetration;

        // Aux
        private SerializedProperty _auxSignals;

        // Foldout states
        private bool _showPreview    = false;
        private bool _showAuxSignals = true;

        private void OnEnable()
        {
            _role               = serializedObject.FindProperty("role");
            _orificeType        = serializedObject.FindProperty("orificeType");
            _customOrificeType  = serializedObject.FindProperty("customOrificeType");
            _instanceName       = serializedObject.FindProperty("instanceName");

            _depthAxis          = serializedObject.FindProperty("depthAxis");
            _socketLength       = serializedObject.FindProperty("socketLength");
            _depthRingCount     = serializedObject.FindProperty("depthRingCount");
            _detectDps          = serializedObject.FindProperty("detectDps");
            _generateAngleParams = serializedObject.FindProperty("generateAngleParams");
            _generateSelfParam  = serializedObject.FindProperty("generateSelfParam");

            _tipBone            = serializedObject.FindProperty("tipBone");
            _rootBone           = serializedObject.FindProperty("rootBone");
            _selfPenetration    = serializedObject.FindProperty("selfPenetration");

            _auxSignals         = serializedObject.FindProperty("auxSignals");
        }

        public override void OnInspectorGUI()
        {
            SensaEditorLocalization.DrawLanguageSelector();
            serializedObject.Update();

            var comp = (SensaComponent)target;

            // ── Header ────────────────────────────────────────────────
            EditorGUILayout.Space(4);
            var headerStyle = new GUIStyle(EditorStyles.boldLabel) { fontSize = 13 };
            EditorGUILayout.LabelField("Sensa", headerStyle);
            EditorGUILayout.LabelField(SensaEditorLocalization.Text("VRChat SPS/OGB Contact Sensing"), EditorStyles.miniLabel);
            EditorGUILayout.Space(6);

            DrawSeparator();

            // ── Role & Naming ─────────────────────────────────────────
            EditorGUILayout.LabelField(SensaEditorLocalization.Text("Identity"), EditorStyles.boldLabel);
            SensaInspectorLabels.DrawProperty(_role);
            EditorGUILayout.PropertyField(_instanceName,
                new GUIContent(SensaEditorLocalization.Text("Instance Name"), SensaEditorLocalization.Text("Unique name per component; used in OGB parameter path.")));

            DrawSeparator();

            // ── Role-specific config ──────────────────────────────────
            var role = (BridgeRole)_role.enumValueIndex;

            if (role == BridgeRole.Socket)
                DrawSocketConfig(comp);
            else
                DrawPlugConfig(comp);

            DrawSeparator();

            // ── Aux signals ───────────────────────────────────────────
            _showAuxSignals = EditorGUILayout.Foldout(_showAuxSignals, SensaEditorLocalization.Text("Supplementary Signals"), true);
            if (_showAuxSignals)
            {
                EditorGUI.indentLevel++;
                SensaInspectorLabels.DrawProperty(_auxSignals);
                EditorGUI.indentLevel--;
            }

            DrawSeparator();

            // ── OSC parameter preview ─────────────────────────────────
            _showPreview = EditorGUILayout.Foldout(_showPreview, SensaEditorLocalization.Text("OSC Parameters (Preview)"), true);
            if (_showPreview)
            {
                EditorGUI.indentLevel++;
                var paramList = comp.GetExpectedParameters();
                if (paramList.Count == 0)
                {
                    EditorGUILayout.HelpBox(SensaEditorLocalization.Text("No parameters — check configuration."), MessageType.Warning);
                }
                else
                {
                    foreach (var p in paramList)
                    {
                        var rect = EditorGUILayout.GetControlRect();
                        EditorGUI.SelectableLabel(rect, $"/avatar/parameters/{p}",
                            EditorStyles.miniLabel);
                    }
                }
                EditorGUI.indentLevel--;
            }

            // ── Action buttons ────────────────────────────────────────
            EditorGUILayout.Space(4);
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button(SensaEditorLocalization.Text("Preview Contacts (Scene Gizmos)")))
                    SceneView.RepaintAll();

                if (role == BridgeRole.Socket && comp.depthAxis == null)
                {
                    if (GUILayout.Button(SensaEditorLocalization.Text("Auto-assign depthAxis from Transform")))
                    {
                        _depthAxis.objectReferenceValue = comp.transform;
                        serializedObject.ApplyModifiedProperties();
                    }
                }
            }

            // ── Validation warnings ───────────────────────────────────
            if (role == BridgeRole.Socket && comp.depthAxis == null)
                EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Assign a depth axis on this avatar before building."), MessageType.Error);

            if (role == BridgeRole.Plug && (comp.tipBone == null || comp.rootBone == null))
                EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Assign tip and root bones on this avatar before building."), MessageType.Error);

            serializedObject.ApplyModifiedProperties();
        }

        private void DrawSocketConfig(SensaComponent comp)
        {
            EditorGUILayout.LabelField(SensaEditorLocalization.Text("Orifice Type"), EditorStyles.boldLabel);
            SensaInspectorLabels.DrawProperty(_orificeType);
            if ((OrificeType)_orificeType.enumValueIndex == OrificeType.Custom)
                EditorGUILayout.PropertyField(_customOrificeType, new GUIContent(SensaEditorLocalization.Text("Custom Type")));

            EditorGUILayout.Space(4);
            EditorGUILayout.LabelField(SensaEditorLocalization.Text("Socket Config"), EditorStyles.boldLabel);

            EditorGUILayout.PropertyField(_depthAxis,
                new GUIContent(SensaEditorLocalization.Text("Depth Axis"), SensaEditorLocalization.Text("Bone defining the insertion axis (+Z = inward).")));
            EditorGUILayout.PropertyField(_socketLength,
                new GUIContent(SensaEditorLocalization.Text("Socket range (axis units)"), SensaEditorLocalization.Text("Maximum range along +Z in the selected axis local units. At scale 1, one unit is one metre.")));
            EditorGUILayout.PropertyField(_depthRingCount,
                new GUIContent(SensaEditorLocalization.Text("Depth Ring Count"), SensaEditorLocalization.Text("Number of proximity rings (1–10).")));

            // detectDps is a no-op since TPS_Pen_Penetrating is now always the primary filter;
            // hidden from UI to avoid confusion. The serialized field is retained for backwards compatibility.
            EditorGUILayout.PropertyField(_generateAngleParams,
                new GUIContent(SensaEditorLocalization.Text("Generate Angle Params"), SensaEditorLocalization.Text("Add AngleX/AngleY proximity receivers.")));
            EditorGUILayout.PropertyField(_generateSelfParam,
                new GUIContent(SensaEditorLocalization.Text("Generate Self Param"), SensaEditorLocalization.Text("Also emit PenSelf parameter.")));
        }

        private void DrawPlugConfig(SensaComponent comp)
        {
            EditorGUILayout.LabelField(SensaEditorLocalization.Text("Plug Config"), EditorStyles.boldLabel);

            EditorGUILayout.PropertyField(_tipBone,
                new GUIContent(SensaEditorLocalization.Text("Tip Bone"), SensaEditorLocalization.Text("Tip of the penetrator (TPS_Pen_Penetrating sender placed here).")));
            EditorGUILayout.PropertyField(_rootBone,
                new GUIContent(SensaEditorLocalization.Text("Root Bone"), SensaEditorLocalization.Text("Root of the penetrator (TPS_Pen_Root sender placed here).")));
            EditorGUILayout.PropertyField(_selfPenetration,
                new GUIContent(SensaEditorLocalization.Text("Self Penetration"), SensaEditorLocalization.Text("Detect insertion into own sockets.")));
        }

        // ── Scene Gizmos ──────────────────────────────────────────────

        private void OnSceneGUI()
        {
            var comp = (SensaComponent)target;
            if (comp == null) return;

            if (comp.role == BridgeRole.Socket && comp.depthAxis != null)
            {
                using (new Handles.DrawingScope(new Color(.2f, 1f, .4f, .7f), comp.depthAxis.localToWorldMatrix))
                {
                    int count = Mathf.Clamp(comp.depthRingCount, 1, 10);
                    float step = comp.socketLength / Mathf.Max(count - 1, 1);
                    for (int i = 0; i < count; i++)
                    {
                        var position = Vector3.forward * (i * step);
                        var radius = Mathf.Lerp(.10f, .03f, (float)i / Mathf.Max(count - 1, 1));
                        Handles.DrawWireDisc(position, Vector3.forward, radius);
                        if (i == 0 || i == count - 1)
                            Handles.Label(position + Vector3.up * (radius + .01f), SensaEditorLocalization.Text(i == 0 ? "Tip" : "Root"));
                    }
                    Handles.DrawLine(Vector3.zero, Vector3.forward * comp.socketLength);
                }
            }
            if (comp.role == BridgeRole.Plug)
            {
                DrawPlugMarker(comp.tipBone, "Tip"); DrawPlugMarker(comp.rootBone, "Root");
                if (comp.tipBone != null && comp.rootBone != null)
                {
                    Handles.color = new Color(1f, .5f, .2f, .4f);
                    Handles.DrawLine(comp.tipBone.position, comp.rootBone.position);
                }
            }
        }

        private static void DrawPlugMarker(Transform bone, string label)
        {
            if (bone == null) return;
            using (new Handles.DrawingScope(new Color(1f, .5f, .2f, .7f), bone.localToWorldMatrix))
            {
                Handles.DrawWireDisc(Vector3.zero, Vector3.forward, .02f);
                Handles.Label(Vector3.up * .03f, SensaEditorLocalization.Text(label));
            }
        }

        // ── Helpers ───────────────────────────────────────────────────

        private static void DrawSeparator()
        {
            EditorGUILayout.Space(3);
            var rect = EditorGUILayout.GetControlRect(false, 1f);
            EditorGUI.DrawRect(rect, new Color(0.5f, 0.5f, 0.5f, 0.3f));
            EditorGUILayout.Space(3);
        }
    }
}
