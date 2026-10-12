using System;
using System.Linq;
using UnityEditor;
using UnityEngine;
using VRC.SDK3.Avatars.Components;

namespace UnityBox.Sensa
{
    [CustomEditor(typeof(SensaAutoSetup))]
    public sealed class SensaAutoEditor : Editor
    {
        private string report;
        public override void OnInspectorGUI()
        {
            DrawDefaultInspector();
            var setup=(SensaAutoSetup)target;
            EditorGUILayout.HelpBox("上传/NDMF 预览时自动生成，不修改原 SPS。新组件默认 Exclusive：每组一次只启用一个 Socket 或 Plug 的 Sensa 辅助对象（含标记、局部点和 PB 手柄），初始 Off。Dedicated 可同时测量；SharedRootArray 复用标准 Root 阵列。选择菜单独立于 SPS 自带的 Auto/开关。",MessageType.Info);
            if(setup.arrayPolicy==SensaArrayPolicy.SharedRootArray)EditorGUILayout.HelpBox("共享仅支持标准 Root、相同缩放、最多 16 个目标。切换先关闭接收器、清零参数并等待 0.25 秒，再启用。它不移动 SPS 本身，也不提供同时测量多个位置的能力。",MessageType.Warning);
            if(setup.localPlugTipTracking)EditorGUILayout.HelpBox("本地 Tip 使用指定 Socket 的坐标系；只有一个选中 Socket 时自动选取。它测量自己 Plug 的未形变参考尖端，只有两者相对移动时坐标才变化；不是 GPU 曲线尖端。",MessageType.Info);
            if(GUILayout.Button("只配置当前对象的 SPS")){Undo.RecordObject(setup,"Select local SPS");setup.discoverAll=false;setup.selectedTargets.Clear();setup.selectedTargets.Add(setup.gameObject);EditorUtility.SetDirty(setup);}
            if(GUILayout.Button("检查目标、自动位置与 Contact 开销")) {
                try {
                    var descriptor=setup.GetComponentInParent<VRCAvatarDescriptor>();if(descriptor==null)throw new InvalidOperationException("Place the component under an avatar descriptor.");
                    var targets=SensaAutoBuilder.Targets(setup,descriptor.gameObject);
                    report=$"目标 {targets.Length}；新增 Contact {SensaAutoBuilder.ContactCost(setup,targets)}\n";
                    int slot=0;
                    for(int i=0;i<targets.Length;i++){var placement=SensaSpsAdapter.Read(targets[i]);bool measured=SensaAutoBuilder.HasMeasurement(setup,targets[i]);if(measured)slot++;report+=$"{targets[i].name} [{SensaAutoBuilder.InstanceName(setup,targets[i],descriptor.gameObject)}]"+(measured?$" 槽位 {slot}":" 仅参考/未启用能力")+$": {placement.position:F3}, 长度 {placement.length:F3}\n";}
                    if(targets.Length==0)report+="没有匹配的 VRCFury SPS 组件。";
                }catch(Exception ex){report=ex.GetBaseException().Message;}
            }
            if(!string.IsNullOrEmpty(report))EditorGUILayout.HelpBox(report,MessageType.Info);
        }
    }
    [CustomEditor(typeof(SensaPointProbe))]
    public sealed class SensaPointEditor : Editor
    {
        public override void OnInspectorGUI()
        {
            DrawDefaultInspector();
            EditorGUILayout.HelpBox("本地骨骼测量：选择参考坐标系与目标骨骼，不用手摆触点。每组 8 Receiver + 1 Sender。PB 把手可自动生成，抓取状态与 Stretch 一并导出。辅助约束与 PhysBone 不作用于同一对象。局部有效范围约 24 cm；这不测量 GPU 形变后的网格。",MessageType.Info);
        }
    }
}
