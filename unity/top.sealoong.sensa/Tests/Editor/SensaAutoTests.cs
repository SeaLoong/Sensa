#if UNITY_INCLUDE_TESTS
using System;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Animations;
using UnityEditor;
using UnityEditor.Animations;
using nadena.dev.modular_avatar.core;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;
using System.Collections;
using UnityEngine.TestTools;

namespace UnityBox.Sensa.Tests
{
    public class PointProbeBuildContracts : AvatarBuildFixture
    {
        [Test] public void BoneProbeCreatesFourSelfReceiversWithoutChangingTarget()
        {
            var bone=new GameObject("Bone").transform;bone.SetParent(avatar.transform,false);bone.localPosition=new Vector3(.01f,.02f,.1f);
            var probe=avatar.AddComponent<SensaPointProbe>();probe.target=bone;SensaPointBuilder.ProcessAvatar(avatar);
            Assert.AreEqual(4,avatar.GetComponentsInChildren<VRCContactReceiver>().Length);Assert.AreEqual(1,avatar.GetComponentsInChildren<VRCContactSender>().Length);
            Assert.AreEqual(new Vector3(.01f,.02f,.1f),bone.localPosition);Assert.IsNull(bone.GetComponent<PositionConstraint>());
            Assert.AreEqual(bone,avatar.GetComponentInChildren<PositionConstraint>().GetSource(0).sourceTransform);
        }
        [TestCase(false)]
        [TestCase(true)]
        public void PointProbeUsesFourTetrahedralReceiversAndASeparateKnownRadiusSender(bool handle)
        {
            var target=new GameObject("Target").transform;target.SetParent(avatar.transform,false);target.localPosition=Vector3.forward*.1f;
            var probe=avatar.AddComponent<SensaPointProbe>();probe.target=target;probe.createGrabHandle=handle;
            SensaPointBuilder.ProcessAvatar(avatar);
            var receivers=avatar.GetComponentsInChildren<VRCContactReceiver>();Assert.AreEqual(4,receivers.Length);
            var sender=avatar.GetComponentInChildren<VRCContactSender>();Assert.AreEqual(SensaPoseProtocol.MarkerRadius,sender.radius);
            Assert.IsNull(sender.GetComponentInParent<VRCPhysBone>());
            for(int i=0;i<4;i++){
                int a=SensaPoseProtocol.PointAnchorIndex(i);Assert.AreEqual(new Vector3(SensaPoseProtocol.AnchorX(a),SensaPoseProtocol.AnchorY(a),SensaPoseProtocol.AnchorZ(a)),receivers[i].transform.localPosition);
                Assert.IsTrue(receivers[i].parameter.Contains("/v1/"));
            }
        }
        [TestCase(false)]
        [TestCase(true)]
        public void StandaloneProbeProvidesWritableContactAndGrabParameters(bool handle)
        {
            var target = new GameObject("Target").transform; target.SetParent(avatar.transform, false);
            var probe = avatar.AddComponent<SensaPointProbe>(); probe.target = target; probe.createGrabHandle = handle;
            SensaPointBuilder.ProcessAvatar(avatar);
            var merge = avatar.GetComponentInChildren<ModularAvatarMergeAnimator>(); Assert.NotNull(merge);
            var animator = avatar.GetComponent<Animator>(); animator.runtimeAnimatorController = merge.animator; animator.Rebind();
            foreach (var receiver in avatar.GetComponentsInChildren<VRCContactReceiver>())
            {
                Assert.IsTrue(animator.parameters.Any(p => p.name == receiver.parameter && p.type == AnimatorControllerParameterType.Float));
                animator.SetFloat(receiver.parameter, .25f); Assert.AreEqual(.25f, animator.GetFloat(receiver.parameter));
            }
            if (handle)
            {
                var prefix = avatar.GetComponentInChildren<VRCPhysBone>().parameter;
                Assert.IsTrue(animator.parameters.Any(p => p.name == prefix + "_IsGrabbed" && p.type == AnimatorControllerParameterType.Bool));
                animator.SetBool(prefix + "_IsGrabbed", true); Assert.IsTrue(animator.GetBool(prefix + "_IsGrabbed"));
                Assert.IsTrue(animator.parameters.Any(p => p.name == prefix + "_Stretch" && p.type == AnimatorControllerParameterType.Float));
            }
        }
        [Test] public void HandleUsesSeparatePhysBoneAndFollowerObjects()
        {
            var probe=avatar.AddComponent<SensaPointProbe>();probe.createGrabHandle=true;SensaPointBuilder.ProcessAvatar(avatar);
            var pb=avatar.GetComponentInChildren<VRCPhysBone>();Assert.NotNull(pb);Assert.IsNull(pb.GetComponent<PositionConstraint>());
            Assert.AreEqual(VRC.Dynamics.VRCPhysBoneBase.AdvancedBool.True,pb.allowGrabbing);
            Assert.AreEqual(VRC.Dynamics.VRCPhysBoneBase.AdvancedBool.False,pb.allowCollision);
            Assert.IsEmpty(pb.colliders);Assert.Greater(pb.radius,0);Assert.IsEmpty(pb.GetComponentsInChildren<Collider>());
            Assert.IsTrue(avatar.GetComponentsInChildren<ModularAvatarParameters>().SelectMany(p=>p.parameters).Any(p=>p.nameOrPrefix.EndsWith("Handle_IsGrabbed")&&p.localOnly));
        }
        [Test] public void SeparateReferencesCannotReusePointSenderIdentity()
        {
            var left=new GameObject("Left").transform;left.SetParent(avatar.transform,false);
            var right=new GameObject("Right").transform;right.SetParent(avatar.transform,false);
            var probe=left.gameObject.AddComponent<SensaPointProbe>();probe.target=right;SensaPointBuilder.Build(probe);
            var other=right.gameObject.AddComponent<SensaPointProbe>();other.target=left;
            Assert.Throws<InvalidOperationException>(()=>SensaPointBuilder.Build(other));
        }
    }

    public class AutoSelectionBuildContracts : AvatarBuildFixture
    {
        [Test] public void AutoSelectionPreservesSpsAndPlacesArrayAtSocketOffset()
        {
            var selected=Socket("Selected",new Vector3(0,1,0));var ignored=Socket("Ignored",Vector3.right);
            var source=selected.GetComponents<Component>().Single(SensaSpsAdapter.IsTarget);source.GetType().GetField("position").SetValue(source,new Vector3(.02f,.03f,.04f));
            var setup=avatar.AddComponent<SensaAutoSetup>();setup.discoverAll=false;setup.selectedTargets.Add(selected);
            var expected=SensaSpsAdapter.Read(source);SensaAutoBuilder.ProcessAvatar(avatar);
            Assert.AreEqual(8,avatar.GetComponentsInChildren<VRCContactReceiver>(true).Length);Assert.IsNotNull(source);Assert.AreEqual(0,ignored.transform.childCount);
            Assert.That(Vector3.Distance(selected.transform.GetChild(0).localPosition,expected.position),Is.LessThan(.00001));
        }
        [Test] public void SharedArrayUsesOneBankAndGuardedAnimator()
        {
            Socket("A",Vector3.zero);Socket("B",Vector3.right*.1f);
            var setup=avatar.AddComponent<SensaAutoSetup>();setup.arrayPolicy=SensaArrayPolicy.SharedRootArray;SensaAutoBuilder.ProcessAvatar(avatar);
            Assert.AreEqual(8,avatar.GetComponentsInChildren<VRCContactReceiver>(true).Length);
            var constraint=avatar.GetComponentInChildren<ParentConstraint>();Assert.AreEqual(2,constraint.sourceCount);
            var merge=avatar.GetComponentInChildren<ModularAvatarMergeAnimator>();var controller=(AnimatorController)merge.animator;
            var states = States();Assert.AreEqual(5,states.Length);
            var settle=states.Single(s=>s.name=="Select 2");((AnimationClip)settle.motion).SampleAnimation(avatar,0);
            Assert.AreEqual(1,constraint.GetSource(1).weight);Assert.IsFalse(avatar.GetComponentsInChildren<VRCContactReceiver>(true)[0].gameObject.activeInHierarchy);
            var driver=settle.behaviours.OfType<VRCAvatarParameterDriver>().Single();Assert.AreEqual(11,driver.parameters.Count);
            Assert.AreEqual(1,states.Single(s=>s.name=="Active 2").behaviours.OfType<VRCAvatarParameterDriver>().Single().parameters.Count);
            Assert.IsTrue(settle.transitions.Any(t=>t.hasExitTime&&t.exitTime==1&&t.duration==0));
        }
        [Test] public void DedicatedAndExclusiveHaveDifferentActiveCosts()
        {
            Socket("A",Vector3.zero);Socket("B",Vector3.right*.1f);var setup=avatar.AddComponent<SensaAutoSetup>();setup.arrayPolicy=SensaArrayPolicy.Exclusive;
            Assert.AreEqual(16,SensaAutoBuilder.ContactCost(setup,SensaAutoBuilder.Targets(setup,avatar)));SensaAutoBuilder.ProcessAvatar(avatar);
            Assert.AreEqual(16,avatar.GetComponentsInChildren<VRCContactReceiver>(true).Length);Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>());
        }
        [TestCase(SensaArrayPolicy.Exclusive)]
        [TestCase(SensaArrayPolicy.SharedRootArray)]
        public void ManyTargetsUseLinearTransitionsWithoutReenteringTheSelectedSlot(SensaArrayPolicy policy)
        {
            for(int i=0;i<16;i++)Socket("Socket"+i,Vector3.right*i*.005f);
            var setup=avatar.AddComponent<SensaAutoSetup>();setup.arrayPolicy=policy;SensaAutoBuilder.ProcessAvatar(avatar);
            var machine=((AnimatorController)avatar.GetComponentInChildren<ModularAvatarMergeAnimator>().animator).layers[0].stateMachine;
            Assert.AreEqual(19,machine.anyStateTransitions.Length);
            Assert.AreEqual(policy==SensaArrayPolicy.SharedRootArray?16:0,machine.states.Sum(s=>s.state.transitions.Length));
            foreach(var transition in machine.anyStateTransitions){
                Assert.IsFalse(transition.canTransitionToSelf);Assert.AreEqual(0,transition.duration);
                var guard=transition.conditions.Single(c=>c.parameter=="Sensa/Internal/Auto/Selected");Assert.AreEqual(AnimatorConditionMode.NotEqual,guard.mode);
                if(transition.destinationState.name.StartsWith("Select ")){
                    var slot=int.Parse(transition.destinationState.name.Substring(7));Assert.AreEqual(slot,guard.threshold);
                    var driver=transition.destinationState.behaviours.OfType<VRCAvatarParameterDriver>().Single();
                    Assert.AreEqual(slot,driver.parameters.Single(p=>p.name==guard.parameter).value);
                }
            }
            nadena.dev.ndmf.AvatarProcessor.ProcessAvatar(avatar);
            Assert.NotNull(avatar.GetComponent<VRCAvatarDescriptor>().expressionsMenu);
        }
        [Test] public void NdmfBuildMergesLocalSelectorAndRemovesAuthoringComponents()
        {
            Socket("A",Vector3.zero);Socket("B",Vector3.right*.1f);var setup=avatar.AddComponent<SensaAutoSetup>();setup.arrayPolicy=SensaArrayPolicy.SharedRootArray;
            nadena.dev.ndmf.AvatarProcessor.ProcessAvatar(avatar);
            var descriptor=avatar.GetComponent<VRCAvatarDescriptor>();
            Assert.IsNull(avatar.GetComponent<SensaAutoSetup>());
            Assert.AreEqual(8,avatar.GetComponentsInChildren<VRCContactReceiver>(true).Length);
            Assert.NotNull(descriptor.expressionsMenu);Assert.NotNull(descriptor.expressionParameters);
            Assert.IsTrue(descriptor.expressionParameters.parameters.Any(p=>p.name=="Sensa/Select/Auto"&&!p.networkSynced));
            Assert.IsTrue(descriptor.baseAnimationLayers.Any(layer=>layer.type==VRCAvatarDescriptor.AnimLayerType.FX && layer.animatorController!=null));
        }
        [Test] public void LocalTipUsesSocketFrameRatherThanItsOwnMovingPlugFrame()
        {
            var socket=Socket("Socket",Vector3.zero);
            var plug = Plug("Plug", Vector3.back * .1f);
            var setup=avatar.AddComponent<SensaAutoSetup>();setup.localPlugTipTracking=true;setup.pairedPlugMarkers=true;SensaAutoBuilder.ProcessAvatar(avatar);
            var follower=avatar.GetComponentInChildren<PositionConstraint>(true);Assert.NotNull(follower);
            Assert.IsTrue(follower.transform.IsChildOf(socket.transform));Assert.IsTrue(follower.GetSource(0).sourceTransform.IsChildOf(plug.transform));
            Assert.AreEqual(16,avatar.GetComponentsInChildren<VRCContactReceiver>(true).Length+avatar.GetComponentsInChildren<VRCContactSender>(true).Length);
        }
        [Test] public void AutomaticGripRendererStaysOutsideSpsDiscoveryTree()
        {
            Socket("Socket",Vector3.zero);
            var plug = Plug("Plug", Vector3.zero);
            var setup=avatar.AddComponent<SensaAutoSetup>();setup.createPlugGrabHandles=true;SensaAutoBuilder.ProcessAvatar(avatar);
            Assert.IsEmpty(plug.GetComponentsInChildren<Renderer>(true));Assert.IsNotEmpty(avatar.GetComponentsInChildren<Renderer>(true));
            Assert.IsFalse(avatar.GetComponentInChildren<VRCPhysBone>(true).transform.IsChildOf(plug.transform));
        }
        [TestCase(SensaArrayPolicy.Exclusive)]
        [TestCase(SensaArrayPolicy.SharedRootArray)]
        public void OneSelectorGatesSocketAndEveryPlugHelper(SensaArrayPolicy policy)
        {
            var socket=Socket("A Socket",Vector3.zero);
            var plug = Plug("B Plug", Vector3.zero);
            var setup=avatar.AddComponent<SensaAutoSetup>();setup.arrayPolicy=policy;setup.localPlugTipTracking=true;setup.pairedPlugMarkers=true;setup.createPlugGrabHandles=true;
            Assert.AreEqual(21,SensaAutoBuilder.ContactCost(setup,SensaAutoBuilder.Targets(setup,avatar)));
            SensaAutoBuilder.ProcessAvatar(avatar);
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>());
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactSender>());
            var controller=(AnimatorController)avatar.GetComponentInChildren<ModularAvatarMergeAnimator>().animator;
            var states = States();
            void Select(int slot) { SampleState((policy == SensaArrayPolicy.SharedRootArray ? "Active " : "Select ") + slot); }
            Select(2);
            Assert.AreEqual(8,avatar.GetComponentsInChildren<VRCContactReceiver>().Length);
            Assert.AreEqual(5,avatar.GetComponentsInChildren<VRCContactSender>().Length);
            Assert.AreEqual(1,avatar.GetComponentsInChildren<VRCPhysBone>().Length);
            Assert.IsTrue(socket.transform.GetChild(0).gameObject.activeInHierarchy,"Plug 参考坐标系必须保持启用。 / The Plug reference frame must remain active.");
            Assert.IsTrue(socket.activeSelf && plug.activeSelf,"保持用户 SPS 对象启用。 / Keep user SPS owner objects enabled.");
            if(policy==SensaArrayPolicy.SharedRootArray){
                var parameters=states.Single(s=>s.name=="Active 2").behaviours.OfType<VRCAvatarParameterDriver>().Single().parameters;
                Assert.AreEqual(0,parameters.Single(p=>p.name.EndsWith("/Ready")).value);
            }
            Select(1);
            Assert.AreEqual(8,avatar.GetComponentsInChildren<VRCContactReceiver>().Length);
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactSender>());
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCPhysBone>());
            var resets=states.Single(s=>s.name=="Select 1").behaviours.OfType<VRCAvatarParameterDriver>().Single().parameters;
            Assert.IsTrue(resets.Any(p=>p.name.EndsWith("Handle_IsGrabbed")&&p.value==0));
            SampleState("Off");
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>());
            nadena.dev.ndmf.AvatarProcessor.ProcessAvatar(avatar);
            Assert.IsTrue(avatar.GetComponent<VRCAvatarDescriptor>().baseAnimationLayers.Any(layer=>layer.type==VRCAvatarDescriptor.AnimLayerType.FX && layer.animatorController!=null));
        }
        [UnityTest] public IEnumerator SharedConstraintActuallyMovesToTheSelectedSocket()
        {
            Socket("A",new Vector3(0,.1f,0));var b=Socket("B",new Vector3(.15f,.3f,.02f));
            var setup=avatar.AddComponent<SensaAutoSetup>();setup.arrayPolicy=SensaArrayPolicy.SharedRootArray;SensaAutoBuilder.ProcessAvatar(avatar);
            var merge=avatar.GetComponentInChildren<ModularAvatarMergeAnimator>();var controller=(AnimatorController)merge.animator;
            var clip=(AnimationClip)controller.layers[0].stateMachine.states.Single(s=>s.state.name=="Select 2").state.motion;
            clip.SampleAnimation(avatar,0);
            for(int i=0;i<4;i++){EditorApplication.QueuePlayerLoopUpdate();yield return null;}
            var constraint=avatar.GetComponentInChildren<ParentConstraint>();
            Assert.That(Vector3.Distance(constraint.transform.position,b.transform.GetChild(0).position),Is.LessThan(.0001f));
        }
    }
}
#endif
