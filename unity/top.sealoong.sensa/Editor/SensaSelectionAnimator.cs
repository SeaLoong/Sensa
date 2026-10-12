using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Animations;
using UnityEditor;
using UnityEditor.Animations;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Avatars.ScriptableObjects;
using VRC.SDKBase;
using nadena.dev.modular_avatar.core;

namespace UnityBox.Sensa
{
    public static class SensaSelectionAnimator
    {
        public static void Build(GameObject avatar,GameObject host,string group,GameObject[] rigs,string[] names,ParentConstraint shared=null,string prefix=null)
        {
            string selector="Sensa/Select/"+group;
            var controller=new AnimatorController{name="Sensa selection "+group};controller.AddParameter(selector,AnimatorControllerParameterType.Int);
            var machine=new AnimatorStateMachine{name="Sensa selection"};controller.AddLayer(new AnimatorControllerLayer{name="Sensa "+group,stateMachine=machine,defaultWeight=1});
            SensaSensorUtility.Parameter(host,selector,ParameterSyncType.Int);
            if(shared!=null){SensaSensorUtility.Parameter(host,prefix+"/Ready",ParameterSyncType.Bool);SensaSensorUtility.Parameter(host,prefix+"/Slot",ParameterSyncType.Int);controller.AddParameter(prefix+"/Ready",AnimatorControllerParameterType.Bool);controller.AddParameter(prefix+"/Slot",AnimatorControllerParameterType.Int);}
            if(shared!=null)for(int i=0;i<8;i++)controller.AddParameter(prefix+"/Root/A"+i,AnimatorControllerParameterType.Float);
            AnimationClip Clip(string name,int slot,bool enabled)
            {
                var clip=new AnimationClip{name=name};
                for(int i=0;i<rigs.Length;i++)clip.SetCurve(AnimationUtility.CalculateTransformPath(rigs[i].transform,avatar.transform),typeof(GameObject),"m_IsActive",AnimationCurve.Constant(0,.25f,enabled && (shared!=null || slot==i+1)?1:0));
                if(shared!=null)for(int i=0;i<names.Length;i++)clip.SetCurve(AnimationUtility.CalculateTransformPath(shared.transform,avatar.transform),typeof(ParentConstraint),"m_Sources.Array.data["+i+"].weight",AnimationCurve.Constant(0,.25f,slot==i+1?1:0));
                return clip;
            }
            void Driver(AnimatorState state,int slot,bool ready)
            {
                if(shared==null)return;
                var driver=state.AddStateMachineBehaviour<VRCAvatarParameterDriver>();driver.localOnly=true;
                driver.parameters=new List<VRC_AvatarParameterDriver.Parameter>{new VRC_AvatarParameterDriver.Parameter{name=prefix+"/Ready",value=ready?1:0}};
                if(!ready){driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter{name=prefix+"/Slot",value=slot});for(int i=0;i<8;i++)driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter{name=prefix+"/Root/A"+i,value=0});}
            }
            var off=machine.AddState("Off");off.writeDefaultValues=false;off.motion=Clip("Off",0,false);machine.defaultState=off;Driver(off,0,false);
            var states=new List<AnimatorState>{off};
            for(int slot=1;slot<=names.Length;slot++) {
                var move=machine.AddState("Select "+slot);move.writeDefaultValues=false;move.motion=Clip("Settle "+slot,slot,shared==null);Driver(move,slot,false);states.Add(move);
                if(shared!=null){var active=machine.AddState("Active "+slot);active.writeDefaultValues=false;active.motion=Clip("Active "+slot,slot,true);Driver(active,slot,true);states.Add(active);var settled=move.AddTransition(active);settled.hasExitTime=true;settled.exitTime=1;settled.duration=0;settled.AddCondition(AnimatorConditionMode.Equals,slot,selector);}
            }
            // Transition only when the selected slot changes. Never restart a settle timer every frame.
            for(int slot=0;slot<=names.Length;slot++) {
                var target=slot==0?off:states[shared==null?slot:slot*2-1];
                foreach(var source in states) {
                    if(source==target || shared!=null && slot>0 && source==states[slot*2])continue;
                    var transition=source.AddTransition(target);transition.hasExitTime=false;transition.duration=0;transition.AddCondition(AnimatorConditionMode.Equals,slot,selector);
                }
            }
            foreach(var state in states)if(state!=off){var invalid=state.AddTransition(off);invalid.hasExitTime=false;invalid.duration=0;invalid.AddCondition(AnimatorConditionMode.Greater,names.Length,selector);var negative=state.AddTransition(off);negative.hasExitTime=false;negative.duration=0;negative.AddCondition(AnimatorConditionMode.Less,0,selector);}
            var merge=host.AddComponent<ModularAvatarMergeAnimator>();merge.animator=controller;merge.layerType=VRCAvatarDescriptor.AnimLayerType.FX;merge.pathMode=MergeAnimatorPathMode.Absolute;merge.matchAvatarWriteDefaults=false;
            var root=ScriptableObject.CreateInstance<VRCExpressionsMenu>();root.name="Sensa "+group;
            var page=root;
            for(int i=0;i<=names.Length;i++) {
                if(page.controls.Count==7 && i<names.Length){var next=ScriptableObject.CreateInstance<VRCExpressionsMenu>();next.name="Sensa more";page.controls.Add(new VRCExpressionsMenu.Control{name="More",type=VRCExpressionsMenu.Control.ControlType.SubMenu,subMenu=next});page=next;}
                page.controls.Add(new VRCExpressionsMenu.Control{name=i==0?"Off":names[i-1],type=VRCExpressionsMenu.Control.ControlType.Toggle,parameter=new VRCExpressionsMenu.Control.Parameter{name=selector},value=i});
            }
            var menu=ScriptableObject.CreateInstance<VRCExpressionsMenu>();menu.name="Sensa installer";menu.controls.Add(new VRCExpressionsMenu.Control{name="Sensa "+group,type=VRCExpressionsMenu.Control.ControlType.SubMenu,subMenu=root});host.AddComponent<ModularAvatarMenuInstaller>().menuToAppend=menu;
            foreach(var rig in rigs)rig.SetActive(false);
        }
    }
}
