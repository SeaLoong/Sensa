using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEditor;
using UnityEditor.Animations;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Avatars.ScriptableObjects;
using VRC.SDKBase;
using nadena.dev.modular_avatar.core;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;

namespace UnityBox.Sensa
{
    public static class SensaSelectionAnimator
    {
        public static void Build(GameObject avatar, GameObject host, string group, GameObject[] rigs, string[] names, int[] rigSlots = null)
        {
            rigSlots = rigSlots ?? Enumerable.Range(1, rigs.Length).ToArray();
            if (rigSlots.Length != rigs.Length || rigSlots.Any(slot => slot < 1 || slot > names.Length))
                throw new ArgumentException("Selection bindings must match generated rigs and slots. / 选择绑定必须对应生成对象与槽位。");
            string selector = "Sensa/Select/" + group, current = "Sensa/Internal/" + group + "/Selected";
            var controller = new AnimatorController { name = "Sensa selection " + group };
            controller.AddParameter(selector, AnimatorControllerParameterType.Int); controller.AddParameter(current, AnimatorControllerParameterType.Int);
            var machine = new AnimatorStateMachine { name = "Sensa selection" };
            controller.AddLayer(new AnimatorControllerLayer { name = "Sensa " + group, stateMachine = machine, defaultWeight = 1 });
            SensaSensorUtility.Parameter(host, selector, ParameterSyncType.Int);
            var resetParameters = new Dictionary<string, AnimatorControllerParameterType>();
            foreach (var rig in rigs)
            {
                foreach (var receiver in rig.GetComponentsInChildren<VRCContactReceiver>(true)) resetParameters[receiver.parameter] = AnimatorControllerParameterType.Float;
                foreach (var bone in rig.GetComponentsInChildren<VRCPhysBone>(true)) if (!string.IsNullOrEmpty(bone.parameter))
                {
                    resetParameters[bone.parameter + "_IsGrabbed"] = AnimatorControllerParameterType.Bool;
                    resetParameters[bone.parameter + "_Stretch"] = AnimatorControllerParameterType.Float;
                }
            }
            foreach (var parameter in resetParameters) controller.AddParameter(parameter.Key, parameter.Value);
            var states = new List<AnimatorState>();
            for (int slot = 0; slot <= names.Length; slot++)
            {
                var state = machine.AddState(slot == 0 ? "Off" : "Select " + slot); state.writeDefaultValues = false;
                var clip = new AnimationClip { name = state.name };
                for (int i = 0; i < rigs.Length; i++)
                    clip.SetCurve(AnimationUtility.CalculateTransformPath(rigs[i].transform, avatar.transform), typeof(GameObject), "m_IsActive",
                        AnimationCurve.Constant(0, .25f, slot == rigSlots[i] ? 1 : 0));
                state.motion = clip;
                var driver = state.AddStateMachineBehaviour<VRCAvatarParameterDriver>(); driver.localOnly = true;
                driver.parameters = new List<VRC_AvatarParameterDriver.Parameter> { new VRC_AvatarParameterDriver.Parameter { name = current, value = slot } };
                foreach (var parameter in resetParameters) driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = parameter.Key, value = 0 });
                states.Add(state);
            }
            machine.defaultState = states[0];
            for (int slot = 0; slot <= names.Length; slot++)
            {
                var transition = machine.AddAnyStateTransition(states[slot]); transition.hasExitTime = false; transition.duration = 0; transition.canTransitionToSelf = false;
                transition.AddCondition(AnimatorConditionMode.Equals, slot, selector); transition.AddCondition(AnimatorConditionMode.NotEqual, slot, current);
            }
            foreach (var condition in new[] { AnimatorConditionMode.Greater, AnimatorConditionMode.Less })
            {
                var invalid = machine.AddAnyStateTransition(states[0]); invalid.hasExitTime = false; invalid.duration = 0; invalid.canTransitionToSelf = false;
                invalid.AddCondition(condition, condition == AnimatorConditionMode.Greater ? names.Length : 0, selector);
                invalid.AddCondition(AnimatorConditionMode.NotEqual, 0, current);
            }
            var merge = host.AddComponent<ModularAvatarMergeAnimator>(); merge.animator = controller;
            merge.layerType = VRCAvatarDescriptor.AnimLayerType.FX; merge.pathMode = MergeAnimatorPathMode.Absolute; merge.matchAvatarWriteDefaults = false;
            var root = ScriptableObject.CreateInstance<VRCExpressionsMenu>(); root.name = "Sensa " + group;
            var page = root;
            for (int i = 0; i <= names.Length; i++)
            {
                if (page.controls.Count == 7 && i < names.Length)
                {
                    var next = ScriptableObject.CreateInstance<VRCExpressionsMenu>(); next.name = "Sensa more";
                    page.controls.Add(new VRCExpressionsMenu.Control { name = "More", type = VRCExpressionsMenu.Control.ControlType.SubMenu, subMenu = next }); page = next;
                }
                page.controls.Add(new VRCExpressionsMenu.Control { name = i == 0 ? "Off" : names[i - 1], type = VRCExpressionsMenu.Control.ControlType.Toggle,
                    parameter = new VRCExpressionsMenu.Control.Parameter { name = selector }, value = i });
            }
            var menu = ScriptableObject.CreateInstance<VRCExpressionsMenu>(); menu.name = "Sensa installer";
            menu.controls.Add(new VRCExpressionsMenu.Control { name = "Sensa " + group, type = VRCExpressionsMenu.Control.ControlType.SubMenu, subMenu = root });
            host.AddComponent<ModularAvatarMenuInstaller>().menuToAppend = menu;
            foreach (var rig in rigs) rig.SetActive(false);
        }
    }
}
