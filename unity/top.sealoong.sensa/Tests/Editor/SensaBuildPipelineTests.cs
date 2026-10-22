#if UNITY_INCLUDE_TESTS
using System;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using VRC.SDKBase;
using VRC.SDK3.Dynamics.Contact.Components;
using Object = UnityEngine.Object;

namespace UnityBox.Sensa.Tests
{
    public sealed class SensaBuildPipelineTests : AvatarBuildFixture
    {
        [Test] public void UploadGuardRejectsUnprocessedAuthorsWithoutGeneratingOrDeleting()
        {
            var author = avatar.AddComponent<SensaFixedRootProbe>();
            author.target = Child("Landmark", new Vector3(0, 1, 0)).transform;
            var exception = Assert.Throws<InvalidOperationException>(() =>
                new SensaPreprocessCallback().OnPreprocessAvatar(avatar));
            StringAssert.Contains(nameof(SensaFixedRootProbe), exception.Message);
            Assert.AreSame(author, avatar.GetComponent<SensaFixedRootProbe>());
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>(true));
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactSender>(true));
        }

        [Test] public void BuildCopyConsumesDisabledAuthorsAndKeepsOriginalLandmarksAndNativeComponents()
        {
            var landmark = Child("Landmark", new Vector3(0, 1, .1f));
            landmark.AddComponent<VRCContactSender>();
            var authorTypes = typeof(SensaComponent).Assembly.GetTypes().Where(type =>
                !type.IsAbstract && typeof(MonoBehaviour).IsAssignableFrom(type)
                && typeof(IEditorOnly).IsAssignableFrom(type)).ToArray();
            foreach (var type in authorTypes) ((Behaviour)avatar.AddComponent(type)).enabled = false;
            var copy = Own(Object.Instantiate(avatar));
            SensaBuildPipeline.Generate(copy);
            Assert.IsEmpty(copy.GetComponentsInChildren<MonoBehaviour>(true).Where(component => component is IEditorOnly));
            Assert.AreEqual(1, copy.GetComponentsInChildren<VRCContactSender>(true).Length);
            Assert.IsEmpty(copy.GetComponentsInChildren<VRCContactReceiver>(true));
            Assert.IsNotNull(copy.transform.Find("Landmark"));
            Assert.AreEqual(authorTypes.Length, avatar.GetComponents<MonoBehaviour>().Count(component => component is IEditorOnly));
            Assert.AreSame(landmark, avatar.transform.Find("Landmark").gameObject);
            Assert.IsTrue(new SensaPreprocessCallback().OnPreprocessAvatar(copy));
        }

        [Test] public void UnifiedGenerationIsRepeatableAndReadsRootBeforeRemovingItsSensaSource()
        {
            var source = avatar.AddComponent<SensaComponent>();
            source.instanceName = "Source";
            source.depthAxis = Child("Axis", new Vector3(0, 1, .1f)).transform;
            var root = avatar.AddComponent<SensaFixedRootProbe>();
            root.instanceName = "Measured"; root.target = source;
            SensaBuildPipeline.Generate(avatar);
            Assert.IsNull(avatar.GetComponent<SensaComponent>());
            Assert.IsNull(avatar.GetComponent<SensaFixedRootProbe>());
            var receivers = avatar.GetComponentsInChildren<VRCContactReceiver>(true);
            Assert.AreEqual(4, receivers.Count(receiver => receiver.parameter.StartsWith("Sensa/SPS/Measured/", StringComparison.Ordinal)));
            int contacts = receivers.Length + avatar.GetComponentsInChildren<VRCContactSender>(true).Length;
            SensaBuildPipeline.Generate(avatar);
            Assert.AreEqual(contacts, avatar.GetComponentsInChildren<VRCContactReceiver>(true).Length
                + avatar.GetComponentsInChildren<VRCContactSender>(true).Length);
            Assert.IsTrue(new SensaPreprocessCallback().OnPreprocessAvatar(avatar));
        }
    }
}
#endif
