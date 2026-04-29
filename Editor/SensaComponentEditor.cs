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
            serializedObject.Update();

            var comp = (SensaComponent)target;

            // ── Header ────────────────────────────────────────────────
            EditorGUILayout.Space(4);
            var headerStyle = new GUIStyle(EditorStyles.boldLabel) { fontSize = 13 };
            EditorGUILayout.LabelField("Sensa", headerStyle);
            EditorGUILayout.LabelField("VRChat SPS/OGB Contact Sensing", EditorStyles.miniLabel);
            EditorGUILayout.Space(6);

            DrawSeparator();

            // ── Role & Naming ─────────────────────────────────────────
            EditorGUILayout.LabelField("Identity", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_role);
            EditorGUILayout.PropertyField(_instanceName,
                new GUIContent("Instance Name", "Unique name per component; used in OGB parameter path."));

            DrawSeparator();

            // ── Role-specific config ──────────────────────────────────
            var role = (BridgeRole)_role.enumValueIndex;

            if (role == BridgeRole.Socket)
                DrawSocketConfig(comp);
            else
                DrawPlugConfig(comp);

            DrawSeparator();

            // ── Aux signals ───────────────────────────────────────────
            _showAuxSignals = EditorGUILayout.Foldout(_showAuxSignals, "Supplementary Signals", true);
            if (_showAuxSignals)
            {
                EditorGUI.indentLevel++;
                EditorGUILayout.PropertyField(_auxSignals, true);
                EditorGUI.indentLevel--;
            }

            DrawSeparator();

            // ── OSC parameter preview ─────────────────────────────────
            _showPreview = EditorGUILayout.Foldout(_showPreview, "OSC Parameters (Preview)", true);
            if (_showPreview)
            {
                EditorGUI.indentLevel++;
                var paramList = comp.GetExpectedParameters();
                if (paramList.Count == 0)
                {
                    EditorGUILayout.HelpBox("No parameters — check configuration.", MessageType.Warning);
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
                if (GUILayout.Button("Preview Contacts (Scene Gizmos)"))
                    SceneView.RepaintAll();

                if (role == BridgeRole.Socket && comp.depthAxis == null)
                {
                    if (GUILayout.Button("Auto-assign depthAxis from Transform"))
                    {
                        _depthAxis.objectReferenceValue = comp.transform;
                        serializedObject.ApplyModifiedProperties();
                    }
                }
            }

            // ── Validation warnings ───────────────────────────────────
            if (role == BridgeRole.Socket && comp.depthAxis == null)
                EditorGUILayout.HelpBox("depthAxis is not assigned. Contacts will not be generated.", MessageType.Error);

            if (role == BridgeRole.Plug && (comp.tipBone == null || comp.rootBone == null))
                EditorGUILayout.HelpBox("tipBone or rootBone is not assigned. Senders will not be generated.", MessageType.Error);

            serializedObject.ApplyModifiedProperties();
        }

        private void DrawSocketConfig(SensaComponent comp)
        {
            EditorGUILayout.LabelField("Orifice Type", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_orificeType);
            if ((OrificeType)_orificeType.enumValueIndex == OrificeType.Custom)
                EditorGUILayout.PropertyField(_customOrificeType, new GUIContent("Custom Type"));

            EditorGUILayout.Space(4);
            EditorGUILayout.LabelField("Socket Config", EditorStyles.boldLabel);

            EditorGUILayout.PropertyField(_depthAxis,
                new GUIContent("Depth Axis", "Bone defining the insertion axis (+Z = inward)."));
            EditorGUILayout.PropertyField(_socketLength,
                new GUIContent("Socket Length (m)", "Max insertion depth in metres."));
            EditorGUILayout.PropertyField(_depthRingCount,
                new GUIContent("Depth Ring Count", "Number of proximity rings (1–10)."));

            EditorGUILayout.Space(2);
            EditorGUILayout.PropertyField(_detectDps,
                new GUIContent("DPS/TPS Compat", "Also filter TPS_Pen_Penetrating tag."));
            EditorGUILayout.PropertyField(_generateAngleParams,
                new GUIContent("Generate Angle Params", "Add AngleX/AngleY proximity receivers."));
            EditorGUILayout.PropertyField(_generateSelfParam,
                new GUIContent("Generate Self Param", "Also emit PenSelf parameter."));
        }

        private void DrawPlugConfig(SensaComponent comp)
        {
            EditorGUILayout.LabelField("Plug Config", EditorStyles.boldLabel);

            EditorGUILayout.PropertyField(_tipBone,
                new GUIContent("Tip Bone", "Tip of the penetrator (SPS_Pen_Tip sender placed here)."));
            EditorGUILayout.PropertyField(_rootBone,
                new GUIContent("Root Bone", "Root of the penetrator (SPS_Pen_Root sender placed here)."));
            EditorGUILayout.PropertyField(_selfPenetration,
                new GUIContent("Self Penetration", "Detect insertion into own sockets."));
        }

        // ── Scene Gizmos ──────────────────────────────────────────────

        private void OnSceneGUI()
        {
            var comp = (SensaComponent)target;
            if (comp == null) return;

            if (comp.role == BridgeRole.Socket && comp.depthAxis != null)
            {
                Handles.color = new Color(0.2f, 1f, 0.4f, 0.7f);

                int   N        = Mathf.Clamp(comp.depthRingCount, 1, 10);
                float stepSize = comp.socketLength / Mathf.Max(N - 1, 1);

                for (int i = 0; i < N; i++)
                {
                    float depth  = i * stepSize;
                    float radius = Mathf.Lerp(0.10f, 0.03f, (float)i / Mathf.Max(N - 1, 1));

                    Vector3 worldPos = comp.depthAxis.TransformPoint(Vector3.forward * depth);
                    Vector3 worldNormal = comp.depthAxis.forward;

                    Handles.DrawWireDisc(worldPos, worldNormal, radius);

                    // Label entry and deepest
                    if (i == 0)
                        Handles.Label(worldPos + Vector3.up * (radius + 0.01f), "Tip");
                    else if (i == N - 1)
                        Handles.Label(worldPos + Vector3.up * (radius + 0.01f), "Root");
                }

                // Draw insertion axis line
                Handles.color = new Color(0.2f, 1f, 0.4f, 0.4f);
                Vector3 start = comp.depthAxis.position;
                Vector3 end   = comp.depthAxis.TransformPoint(Vector3.forward * comp.socketLength);
                Handles.DrawLine(start, end);
            }

            if (comp.role == BridgeRole.Plug)
            {
                Handles.color = new Color(1f, 0.5f, 0.2f, 0.7f);
                if (comp.tipBone != null)
                {
                    Handles.DrawWireDisc(comp.tipBone.position, comp.tipBone.forward, 0.02f);
                    Handles.Label(comp.tipBone.position + Vector3.up * 0.03f, "Tip");
                }
                if (comp.rootBone != null)
                {
                    Handles.DrawWireDisc(comp.rootBone.position, comp.rootBone.forward, 0.02f);
                    Handles.Label(comp.rootBone.position + Vector3.up * 0.03f, "Root");
                }
                if (comp.tipBone != null && comp.rootBone != null)
                {
                    Handles.color = new Color(1f, 0.5f, 0.2f, 0.4f);
                    Handles.DrawLine(comp.tipBone.position, comp.rootBone.position);
                }
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
