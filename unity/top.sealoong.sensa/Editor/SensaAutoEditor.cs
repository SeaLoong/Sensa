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
            SensaInspectorLabels.Draw(serializedObject);
            var setup=(SensaAutoSetup)target;
            EditorGUILayout.HelpBox("上传/NDMF 预览时自动生成，不修改原 SPS。新组件默认 Exclusive：每组一次只启用一个 Socket 或 Plug 的 Sensa 辅助对象（含标记、局部点和 PB 手柄），初始 Off。Dedicated 可同时测量。选择菜单独立于 SPS 自带的 Auto/开关。\nGenerated during upload/NDMF without changing original SPS. New setups default to Exclusive: one Socket/Plug measurement per group, initially Off, including markers, points and PB handles. Dedicated permits simultaneous measurements. Selection is independent of SPS Auto/activation.",MessageType.Info);
            if(setup.localPlugTipTracking)EditorGUILayout.HelpBox("本地 Tip 使用指定 Socket 的坐标系；只有一个选中 Socket 时自动选取。它测量自己 Plug 的未形变参考尖端，只有两者相对移动时坐标才变化；不是 GPU 曲线尖端。\nLocal Tip uses the chosen Socket frame, auto-selected only when exactly one Socket is selected. It measures your undeformed reference tip and changes only with relative movement, not GPU curve deformation.",MessageType.Info);
            if(GUILayout.Button("只配置当前对象的 SPS / Configure only this object's SPS")){Undo.RecordObject(setup,"Select local SPS");setup.discoverAll=false;setup.selectedTargets.Clear();setup.selectedTargets.Add(setup.gameObject);EditorUtility.SetDirty(setup);}
            if(GUILayout.Button("检查目标、自动位置与 Contact 开销 / Inspect targets, placement and Contact cost")) {
                try {
                    var descriptor=setup.GetComponentInParent<VRCAvatarDescriptor>();if(descriptor==null)throw new InvalidOperationException("Place the component under an avatar descriptor.");
                    var targets=SensaAutoBuilder.Targets(setup,descriptor.gameObject);
                    report=$"目标 / Targets {targets.Length}；新增 Contact / New Contacts {SensaAutoBuilder.ContactCost(setup,targets)}\n";
                    int slot=0;
                    for(int i=0;i<targets.Length;i++){var placement=SensaSpsAdapter.Read(targets[i]);bool measured=SensaAutoBuilder.HasMeasurement(setup,targets[i]);if(measured)slot++;report+=$"{targets[i].name} [{SensaAutoBuilder.InstanceName(setup,targets[i],descriptor.gameObject)}]"+(measured?$" 槽位 / Slot {slot}":" 仅参考/未启用能力 /  Reference only / no capability")+$": {placement.position:F3}, 长度 / Length {placement.length:F3}\n";}
                    if(targets.Length==0)report+="没有匹配的 VRCFury SPS 组件。 / No matching VRCFury SPS components.";
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
            SensaInspectorLabels.Draw(serializedObject);
            EditorGUILayout.HelpBox("本地骨骼测量：选择参考坐标系与目标骨骼，不用手摆触点。每组使用四面体 4 Receiver + 1 Sender，无需选择协议或布局。PB 把手可自动生成，抓取状态与 Stretch 一并导出。辅助约束与 PhysBone 不作用于同一对象。局部有效范围约 24 cm；这不测量 GPU 形变后的网格。\nSelect a reference frame and local bone; no manual probe placement. Each tetrahedron uses 4 Receivers + 1 Sender. Optional PB handles export grab and Stretch. Constraints and PhysBone act on separate objects. Approximate range: 24 local cm. Does not measure GPU-deformed meshes.",MessageType.Info);
        }
    }
}
