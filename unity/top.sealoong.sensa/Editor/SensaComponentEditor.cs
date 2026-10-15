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
            EditorGUILayout.LabelField("VRChat SPS/OGB 触点测量 / VRChat SPS/OGB Contact Sensing", EditorStyles.miniLabel);
            EditorGUILayout.Space(6);

            DrawSeparator();

            // ── Role & Naming ─────────────────────────────────────────
            EditorGUILayout.LabelField("身份与命名 / Identity", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_role, SensaInspectorLabels.Label(_role));
            EditorGUILayout.PropertyField(_instanceName,
                new GUIContent("实例名称 / Instance Name", "每个组件须唯一，用于 OGB 参数路径。 / Unique name per component; used in OGB parameter path."));

            DrawSeparator();

            // ── Role-specific config ──────────────────────────────────
            var role = (BridgeRole)_role.enumValueIndex;

            if (role == BridgeRole.Socket)
                DrawSocketConfig(comp);
            else
                DrawPlugConfig(comp);

            DrawSeparator();

            // ── Aux signals ───────────────────────────────────────────
            _showAuxSignals = EditorGUILayout.Foldout(_showAuxSignals, "辅助信号 / Supplementary Signals", true);
            if (_showAuxSignals)
            {
                EditorGUI.indentLevel++;
                EditorGUILayout.PropertyField(_auxSignals, true);
                EditorGUI.indentLevel--;
            }

            DrawSeparator();

            // ── OSC parameter preview ─────────────────────────────────
            _showPreview = EditorGUILayout.Foldout(_showPreview, "OSC 参数预览 / OSC Parameters (Preview)", true);
            if (_showPreview)
            {
                EditorGUI.indentLevel++;
                var paramList = comp.GetExpectedParameters();
                if (paramList.Count == 0)
                {
                    EditorGUILayout.HelpBox("没有参数，请检查配置。 / No parameters — check configuration.", MessageType.Warning);
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
                if (GUILayout.Button("预览触点（场景辅助线） / Preview Contacts (Scene Gizmos)"))
                    SceneView.RepaintAll();

                if (role == BridgeRole.Socket && comp.depthAxis == null)
                {
                    if (GUILayout.Button("以当前 Transform 自动指定深度轴 / Auto-assign depthAxis from Transform"))
                    {
                        _depthAxis.objectReferenceValue = comp.transform;
                        serializedObject.ApplyModifiedProperties();
                    }
                }
            }

            // ── Validation warnings ───────────────────────────────────
            if (role == BridgeRole.Socket && comp.depthAxis == null)
                EditorGUILayout.HelpBox("未指定 depthAxis，无法生成触点。 / depthAxis is not assigned. Contacts will not be generated.", MessageType.Error);

            if (role == BridgeRole.Plug && (comp.tipBone == null || comp.rootBone == null))
                EditorGUILayout.HelpBox("未指定 tipBone 或 rootBone，无法生成发送器。 / tipBone or rootBone is not assigned. Senders will not be generated.", MessageType.Error);

            serializedObject.ApplyModifiedProperties();
        }

        private void DrawSocketConfig(SensaComponent comp)
        {
            EditorGUILayout.LabelField("孔位类型 / Orifice Type", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_orificeType, SensaInspectorLabels.Label(_orificeType));
            if ((OrificeType)_orificeType.enumValueIndex == OrificeType.Custom)
                EditorGUILayout.PropertyField(_customOrificeType, new GUIContent("自定义类型 / Custom Type"));

            EditorGUILayout.Space(4);
            EditorGUILayout.LabelField("Socket 配置 / Socket Config", EditorStyles.boldLabel);

            EditorGUILayout.PropertyField(_depthAxis,
                new GUIContent("深度轴 / Depth Axis", "定义插入方向的骨骼，+Z 朝内。 / Bone defining the insertion axis (+Z = inward)."));
            EditorGUILayout.PropertyField(_socketLength,
                new GUIContent("Socket 长度（米） / Socket Length (m)", "最大插入深度，单位米。 / Max insertion depth in metres."));
            EditorGUILayout.PropertyField(_depthRingCount,
                new GUIContent("深度环数量 / Depth Ring Count", "近接环数量（1–10）。 / Number of proximity rings (1–10)."));

            // detectDps is a no-op since TPS_Pen_Penetrating is now always the primary filter;
            // hidden from UI to avoid confusion. The serialized field is retained for backwards compatibility.
            EditorGUILayout.PropertyField(_generateAngleParams,
                new GUIContent("生成角度参数 / Generate Angle Params", "增加 AngleX/AngleY 近接接收器。 / Add AngleX/AngleY proximity receivers."));
            EditorGUILayout.PropertyField(_generateSelfParam,
                new GUIContent("生成自身参数 / Generate Self Param", "同时输出 PenSelf 参数。 / Also emit PenSelf parameter."));
        }

        private void DrawPlugConfig(SensaComponent comp)
        {
            EditorGUILayout.LabelField("Plug 配置 / Plug Config", EditorStyles.boldLabel);

            EditorGUILayout.PropertyField(_tipBone,
                new GUIContent("尖端骨骼 / Tip Bone", "尖端位置，放置 TPS_Pen_Penetrating 发送器。 / Tip of the penetrator (TPS_Pen_Penetrating sender placed here)."));
            EditorGUILayout.PropertyField(_rootBone,
                new GUIContent("根部骨骼 / Root Bone", "根部位置，放置 TPS_Pen_Root 发送器。 / Root of the penetrator (TPS_Pen_Root sender placed here)."));
            EditorGUILayout.PropertyField(_selfPenetration,
                new GUIContent("自身交互 / Self Penetration", "检测进入自己的 Socket。 / Detect insertion into own sockets."));
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
