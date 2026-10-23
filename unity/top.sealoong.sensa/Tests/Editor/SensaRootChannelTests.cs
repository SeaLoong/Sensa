#if UNITY_INCLUDE_TESTS
using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using VRC.SDK3.Dynamics.Contact.Components;

namespace UnityBox.Sensa.Tests
{
    public class RootChannelContracts : AvatarBuildFixture
    {
        private static void RequireMethod(bool contactDirect)
        {
            if (contactDirect && !SensaContactRootBuilder.IsSupported)
                Assert.Ignore("Contact channel generation requires an SDK with advanced proximity reports.");
        }

        private Component Probe(bool contactDirect, string instanceName, string channel)
        {
            var node = Child(instanceName + " author", Vector3.zero);
            var native = Child(instanceName + " root", new Vector3(.1f, 1, .1f)).AddComponent<VRCContactSender>();
            native.radius = .02f;
            native.collisionTags = new List<string> { "OriginalNativeTag" };
            if (contactDirect)
            {
                var probe = node.AddComponent<SensaContactRootProbe>();
                probe.instanceName = instanceName; probe.collisionChannel = channel; probe.target = native;
                return probe;
            }
            else
            {
                var probe = node.AddComponent<SensaFixedRootProbe>();
                probe.instanceName = instanceName; probe.collisionChannel = channel; probe.target = native;
                return probe;
            }
        }

        private static void Process(GameObject root, bool contactDirect)
        {
            if (contactDirect) SensaContactRootBuilder.ProcessAvatar(root);
            else SensaFixedRootBuilder.ProcessAvatar(root);
        }
        private static string HostPrefix(bool contactDirect) => contactDirect ? "SensaContactRoot_" : "SensaFixedRoot_";
        private static string TagPrefix(bool contactDirect) => contactDirect ? SensaContactRootBuilder.TagPrefix : SensaFixedRootBuilder.TagPrefix;
        private static string Channel(Component author) => author is SensaContactRootProbe direct
            ? direct.collisionChannel : ((SensaFixedRootProbe)author).collisionChannel;

        [Test]
        public void EmptyChannelsUseStableGuidLengthHashesAndManualChannelsRetainTheirValue()
        {
            Assert.That(SensaSensorUtility.ResolveRootChannel("Root", ""), Is.EqualTo("44cb005ee2e65d9cc817b0a083579369"));
            Assert.That(SensaSensorUtility.ResolveRootChannel("Root", null), Is.EqualTo(SensaSensorUtility.ResolveRootChannel("Root", "")));
            Assert.That(SensaSensorUtility.ResolveRootChannel("Root", ""), Does.Match("^[a-f0-9]{32}$"));
            Assert.That(SensaSensorUtility.ResolveRootChannel("Root", ""), Is.Not.EqualTo(SensaSensorUtility.ResolveRootChannel("root", "")));
            Assert.That(SensaSensorUtility.ResolveRootChannel("Root", "ExistingManualChannel"), Is.EqualTo("ExistingManualChannel"));
            Assert.Throws<InvalidOperationException>(() => SensaSensorUtility.ResolveRootChannel("", "Manual"));
            Assert.Throws<InvalidOperationException>(() => SensaSensorUtility.ResolveRootChannel("Root", " "));
            Assert.Throws<InvalidOperationException>(() => SensaSensorUtility.ResolveRootChannel("Root", "Bad/Channel"));
            Assert.Throws<InvalidOperationException>(() => SensaSensorUtility.ResolveRootChannel("Root\n", "Manual"));
            Assert.Throws<InvalidOperationException>(() => SensaSensorUtility.ResolveRootChannel("Root", "Manual\n"));
        }

        [TestCase("Sps", "NaN offset")]
        [TestCase("Sps", "Infinite offset")]
        [TestCase("Sps", "Zero rotation")]
        [TestCase("Sps", "NaN rotation")]
        [TestCase("Contact", "NaN offset")]
        [TestCase("Contact", "Infinite offset")]
        [TestCase("Contact", "Zero rotation")]
        [TestCase("Contact", "NaN rotation")]
        [TestCase("Shader", "NaN offset")]
        [TestCase("Shader", "Infinite offset")]
        [TestCase("Shader", "Zero rotation")]
        [TestCase("Shader", "NaN rotation")]
        public void MalformedNativeRootFrameFailsBeforeAnyGeneratedObject(string method, string malformed)
        {
            RequireMethod(method == "Contact");
            var target = Child("Native root", Vector3.up).AddComponent<VRCContactSender>();
            target.position = Vector3.zero; target.rotation = Quaternion.identity;
            switch (malformed)
            {
                case "NaN offset": target.position = new Vector3(float.NaN, 0, 0); break;
                case "Infinite offset": target.position = new Vector3(0, float.PositiveInfinity, 0); break;
                case "Zero rotation": target.rotation = new Quaternion(0, 0, 0, 0); break;
                case "NaN rotation": target.rotation = new Quaternion(0, 0, float.NaN, 1); break;
            }
            Assert.Throws<InvalidOperationException>(() => SensaSpsAdapter.ReadRoot(target));
            if (method == "Shader")
            {
                var author = avatar.AddComponent<SensaShaderCapture>(); author.target = target;
                Assert.Throws<InvalidOperationException>(() => SensaShaderCaptureBuilder.ProcessAvatar(avatar));
                Assert.IsNotNull(author);
            }
            else
            {
                Assert.Throws<InvalidOperationException>(() => {
                    if (method == "Contact") SensaContactRootBuilder.Build(avatar, "Root", target, "");
                    else SensaFixedRootBuilder.Build(avatar, "Root", target, "");
                });
            }
            Assert.AreEqual(2, avatar.GetComponentsInChildren<Transform>(true).Length);
            Assert.AreEqual(1, avatar.GetComponentsInChildren<VRCContactSender>(true).Length);
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>(true));
            Assert.IsEmpty(avatar.GetComponentsInChildren<Camera>(true));
        }

        [Test]
        public void FiniteSerializedQuaternionIsNormalizedWithoutChangingTheNativeSource()
        {
            var target = Child("Native root", Vector3.up).AddComponent<VRCContactSender>();
            target.position = new Vector3(.1f, .2f, .3f); target.rotation = new Quaternion(0, 0, 0, 2);
            var original = JsonUtility.ToJson(target);
            var placement = SensaSpsAdapter.ReadRoot(target);
            Assert.AreEqual(target.position, placement.position);
            Assert.AreEqual(Quaternion.identity, placement.rotation);
            Assert.AreEqual(original, JsonUtility.ToJson(target));
        }

        [TestCase(false)]
        [TestCase(true)]
        public void RenamedCopiesReceiveIndependentChannelsWithoutWritingBackToAuthoredData(bool contactDirect)
        {
            RequireMethod(contactDirect);
            var first = Probe(contactDirect, "First", "");
            var second = UnityEngine.Object.Instantiate(first.gameObject, avatar.transform);
            second.name = "Second author";
            Component secondAuthor;
            if (contactDirect)
            {
                var probe = second.GetComponent<SensaContactRootProbe>(); probe.instanceName = "Second"; secondAuthor = probe;
            }
            else
            {
                var probe = second.GetComponent<SensaFixedRootProbe>(); probe.instanceName = "Second"; secondAuthor = probe;
            }
            var sourceAuthors = new[] { first, secondAuthor };
            var copy = Own(UnityEngine.Object.Instantiate(avatar));

            Process(copy, contactDirect);

            var firstHost = copy.transform.Find(HostPrefix(contactDirect) + "First");
            var secondHost = copy.transform.Find(HostPrefix(contactDirect) + "Second");
            Assert.That(firstHost, Is.Not.Null); Assert.That(secondHost, Is.Not.Null);
            var firstSender = firstHost.GetComponentInChildren<VRCContactSender>(true);
            var secondSender = secondHost.GetComponentInChildren<VRCContactSender>(true);
            Assert.That(firstSender.collisionTags.Single(), Is.EqualTo(TagPrefix(contactDirect) + SensaSensorUtility.ResolveRootChannel("First", "")));
            Assert.That(secondSender.collisionTags.Single(), Is.Not.EqualTo(firstSender.collisionTags.Single()));
            foreach (var host in new[] { firstHost, secondHost })
            {
                var sender = host.GetComponentInChildren<VRCContactSender>(true);
                Assert.That(host.GetComponentsInChildren<VRCContactReceiver>(true).All(receiver => receiver.collisionTags.SequenceEqual(sender.collisionTags)), Is.True);
            }
            Assert.That(sourceAuthors.All(author => author != null && Channel(author) == ""), Is.True);
            Assert.That(avatar.transform.Find(HostPrefix(contactDirect) + "First"), Is.Null);
            var contactCount = copy.GetComponentsInChildren<VRCContactSender>(true).Length + copy.GetComponentsInChildren<VRCContactReceiver>(true).Length;
            Process(copy, contactDirect);
            Assert.That(copy.GetComponentsInChildren<VRCContactSender>(true).Length + copy.GetComponentsInChildren<VRCContactReceiver>(true).Length, Is.EqualTo(contactCount));
        }

        [TestCase(false, "manual")]
        [TestCase(true, "manual")]
        [TestCase(false, "same-name")]
        [TestCase(true, "same-name")]
        [TestCase(false, "resolved-collision")]
        [TestCase(true, "resolved-collision")]
        public void DuplicateNamesOrResolvedChannelsFailBeforeGeneratingAnyReceivers(bool contactDirect, string collision)
        {
            RequireMethod(contactDirect);
            var first = Probe(contactDirect, "First", collision == "manual" ? "Manual" : "");
            var second = Probe(contactDirect, collision == "same-name" ? "First" : "Second",
                collision == "manual" ? "Manual" : collision == "resolved-collision" ? SensaSensorUtility.ResolveRootChannel("First", "") : "");
            Assert.Throws<InvalidOperationException>(() => Process(avatar, contactDirect));
            Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(true), Is.Empty);
            Assert.That(avatar.transform.Find(HostPrefix(contactDirect) + "First"), Is.Null);
            Assert.That(first, Is.Not.Null); Assert.That(second, Is.Not.Null);
        }
    }
}
#endif
