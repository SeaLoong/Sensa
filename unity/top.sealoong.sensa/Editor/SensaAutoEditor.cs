using System;
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
            var setup = (SensaAutoSetup)target;
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Generated during upload/NDMF without changing original SPS. New setups default to Exclusive: one Socket/Plug measurement per group, initially Off, including markers, points and PB handles. Dedicated permits simultaneous measurements. Selection is independent of SPS Auto/activation."), MessageType.Info);
            if (setup.localPlugTipTracking) EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Local Tip uses the chosen Socket frame, auto-selected only when exactly one Socket is selected. It measures your undeformed reference tip and changes only with relative movement, not GPU curve deformation."), MessageType.Info);
            if (GUILayout.Button(SensaEditorLocalization.Text("Configure only this object's SPS")))
            {
                Undo.RecordObject(setup, SensaEditorLocalization.Text("Select local SPS"));
                setup.discoverAll = false; setup.selectedTargets.Clear(); setup.selectedTargets.Add(setup.gameObject);
                EditorUtility.SetDirty(setup);
            }
            if (GUILayout.Button(SensaEditorLocalization.Text("Inspect targets, placement and Contact cost")))
            {
                try
                {
                    var descriptor = setup.GetComponentInParent<VRCAvatarDescriptor>();
                    if (descriptor == null) throw new InvalidOperationException(SensaEditorLocalization.Text("Place the component under an avatar descriptor."));
                    var targets = SensaAutoBuilder.Targets(setup, descriptor.gameObject);
                    report = SensaEditorLocalization.Format("Targets: {0}; new Contacts: {1}\n", targets.Length, SensaAutoBuilder.ContactCost(setup, targets));
                    int slot = 0;
                    foreach (var selected in targets)
                    {
                        var placement = SensaSpsAdapter.Read(selected);
                        bool measured = SensaAutoBuilder.HasMeasurement(setup, selected);
                        if (measured) slot++;
                        var identity = selected.name + " [" + SensaAutoBuilder.InstanceName(setup, selected, descriptor.gameObject) + "] ";
                        identity += measured ? SensaEditorLocalization.Format("Slot {0}", slot) : SensaEditorLocalization.Text("Reference only / no capability");
                        report += SensaEditorLocalization.Format("{0}: {1:F3}, length {2:F3}\n", identity, placement.position, placement.length);
                    }
                    if (targets.Length == 0) report += SensaEditorLocalization.Text("No matching VRCFury SPS components.");
                }
                catch (Exception ex) { report = ex.GetBaseException().Message; }
            }
            if (!string.IsNullOrEmpty(report)) EditorGUILayout.HelpBox(report, MessageType.Info);
        }
    }

    [CustomEditor(typeof(SensaPointProbe))]
    public sealed class SensaPointEditor : Editor
    {
        public override void OnInspectorGUI()
        {
            SensaInspectorLabels.Draw(serializedObject);
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Choose the reference frame and bone to track. Sensa creates four 2 m receivers and one small marker automatically. The green scene-view slices show the usable tracking area, about 1.39 m from the frame origin; tiny orange saturation zones are excluded. Optional grab handles also report grabbing and stretching. This tracks the bone, not Shader-deformed mesh vertices."), MessageType.Info);
        }
        private void OnSceneGUI()
        {
            var probe = (SensaPointProbe)target;
            SensaCoverageGizmos.Pose(probe.reference != null ? probe.reference : probe.transform, true);
        }
    }
}
