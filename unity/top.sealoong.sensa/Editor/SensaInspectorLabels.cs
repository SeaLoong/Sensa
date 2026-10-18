using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace UnityBox.Sensa
{
    // Presentation only: serialized names, enum values and OSC identifiers stay intact.
    internal static class SensaInspectorLabels
    {
        private static readonly Dictionary<string, string> Chinese = new Dictionary<string, string>
        {
            { "groupName", "组名" },
            { "discoverAll", "发现全部" },
            { "selectedTargets", "选中目标" },
            { "excludedTargets", "排除目标" },
            { "socketRootTracking", "固定 SPS 根部定位" },
            { "pairedSocketTracking", "配对 Socket 定位" },
            { "pairedPlugMarkers", "配对 Plug 标记" },
            { "localPlugTipTracking", "本地 Plug 尖端定位" },
            { "localReferenceSocket", "本地参考 Socket" },
            { "createPlugGrabHandles", "生成 Plug PB 把手" },
            { "pairChannel", "配对通道" },
            { "arrayPolicy", "阵列策略" },
            { "instanceName", "实例名称" },
            { "reference", "参考坐标系" },
            { "target", "测量目标" },
            { "collisionChannel", "独有碰撞通道" },
            { "othersDiagnostic", "他人范围诊断" },
            { "createGrabHandle", "生成可抓把手" },
            { "handleLength", "把手长度" },
            { "profile", "配对配置" },
            { "standardSpsRoot", "旧八路模式（需要迁移）" },
            { "rootMarker", "根部标记" },
            { "tipMarker", "尖端标记" },
            { "sideMarker", "侧向标记" },
            { "channel", "通道" },
            { "receiveOthers", "接收他人" },
            { "receiveSelf", "接收自身" },
            { "role", "角色" },
            { "orificeType", "孔位类型" },
            { "auxSignals", "辅助信号" },
            { "customOrificeType", "自定义孔位类型" },
        };
        internal static GUIContent Label(SerializedProperty property)
        {
            var display = property.displayName;
            if (Chinese.TryGetValue(property.name, out var chinese)) display = chinese + " / " + display;
            return new GUIContent(display, property.tooltip);
        }
        internal static void Draw(SerializedObject serialized)
        {
            serialized.Update();
            var property = serialized.GetIterator();
            var enterChildren = true;
            while (property.NextVisible(enterChildren))
            {
                using (new EditorGUI.DisabledScope(property.propertyPath == "m_Script"))
                    EditorGUILayout.PropertyField(property, Label(property), true);
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
}
