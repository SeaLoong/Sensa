#if UNITY_INCLUDE_TESTS
using System;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Animations;
using VRC.SDK3.Dynamics.Contact.Components;

namespace UnityBox.Sensa.Tests
{
    public sealed class SpsCompatibilityContracts : AvatarBuildFixture
    {
        // Fixed public schema from VRCFury SPS3 beta commit 59fa4fa0277c0f3eb7c73811d9b24bf73e2133f4.
        private static class Sps3Schema
        {
            public const string Prefix = "SPS/", PublicChannel = "_public", NotHipsChannel = "_nothips";
            public const string LegacyPlugSphere = "TPS_Pen_Penetrating", LegacySocket = "TPS_Orf_Root", LegacySocket2 = "SPSLL_Socket_Root";
            public static string FormatPlug(string channel) => Prefix + "Plug/" + channel;
            public static string FormatSocket(string channel) => Prefix + "Socket/" + channel;
            public static string FormatSocketPath(string channel) => Prefix + "SocketPath/" + channel;
        }
        private static class MissingPathSchema
        {
            public const string Prefix = "SPS/", PublicChannel = "_public", NotHipsChannel = "_nothips";
            public const string LegacyPlugSphere = "TPS_Pen_Penetrating", LegacySocket = "TPS_Orf_Root", LegacySocket2 = "SPSLL_Socket_Root";
            public static string FormatPlug(string channel) => Prefix + "Plug/" + channel;
            public static string FormatSocket(string channel) => Prefix + "Socket/" + channel;
        }
        private static class WrongPathSignatureSchema
        {
            public const string Prefix = "SPS/", PublicChannel = "_public", NotHipsChannel = "_nothips";
            public const string LegacyPlugSphere = "TPS_Pen_Penetrating", LegacySocket = "TPS_Orf_Root", LegacySocket2 = "SPSLL_Socket_Root";
            public static string FormatPlug(string channel) => Prefix + "Plug/" + channel;
            public static string FormatSocket(string channel) => Prefix + "Socket/" + channel;
            public static int FormatSocketPath(string channel) => 0;
        }
        private static class UnrelatedSchema
        {
            public const string Prefix = "SPS4/", PublicChannel = "_public", NotHipsChannel = "_nothips";
            public const string LegacyPlugSphere = "TPS_Pen_Penetrating", LegacySocket = "TPS_Orf_Root", LegacySocket2 = "SPSLL_Socket_Root";
            public static string FormatPlug(string channel) => Prefix + "Plug/" + channel;
            public static string FormatSocket(string channel) => Prefix + "Socket/" + channel;
            public static string FormatSocketPath(string channel) => Prefix + "SocketPath/" + channel;
        }

        [TestCase(typeof(Sps3Schema), true)]
        [TestCase(typeof(MissingPathSchema), false)]
        [TestCase(typeof(WrongPathSignatureSchema), false)]
        [TestCase(typeof(UnrelatedSchema), false)]
        [TestCase(typeof(string), false)]
        [TestCase(null, false)]
        public void Sps3CapabilityRequiresItsActualTagAbi(Type schema, bool expected)
        {
            Assert.That(SensaSpsAdapter.IsSps3ContactApiSchema(schema), Is.EqualTo(expected));
        }

        [Test] public void InstalledSps3SchemaKeepsTheFixedPublicAndPrivateChannelFormats()
        {
            var schema = AppDomain.CurrentDomain.GetAssemblies().Select(assembly => assembly.GetType("VF.Builder.Haptics.SpsTags"))
                .FirstOrDefault(type => type != null);
            if (schema == null) Assert.Ignore("This contract requires the optional VRCFury SPS3 beta.");
            Assert.That(SensaSpsAdapter.HasSps3ContactApi, Is.True);
            foreach (var channel in new[] { "_public", "_nothips", "private-channel" })
                foreach (var name in new[] { "Plug", "Socket", "SocketPath" })
                    Assert.That(schema.GetMethod("Format" + name).Invoke(null, new object[] { channel }),
                        Is.EqualTo("SPS/" + name + "/" + channel));
        }

        [Test] public void InstalledAuthoringComponentsRetainTheirSocketAndPlugGeometryApi()
        {
            var socket = Socket("Socket", Vector3.up).GetComponents<Component>().Single(SensaSpsAdapter.IsTarget);
            var position = new Vector3(.02f, .03f, .04f); var rotation = new Vector3(10, 20, 30);
            socket.GetType().GetField("position").SetValue(socket, position);
            socket.GetType().GetField("rotation").SetValue(socket, rotation);
            var placement = SensaSpsAdapter.ReadRoot(socket);
            Assert.That(placement.encodedContactScale, Is.False);
            Assert.That(Vector3.Distance(placement.position, position), Is.LessThan(.00001f));
            Assert.That(Quaternion.Angle(placement.rotation, Quaternion.Euler(rotation)), Is.LessThan(.001f));
            var plug = Plug("Plug", Vector3.zero).GetComponents<Component>().Single(SensaSpsAdapter.IsTarget);
            plug.transform.localScale = Vector3.one * 2;
            var size = SensaSpsAdapter.Read(plug);
            Assert.That(size.length, Is.EqualTo(.08f).Within(.00001f));
            Assert.That(size.position, Is.EqualTo(Vector3.zero));
            Assert.That(Quaternion.Angle(size.rotation, Quaternion.identity), Is.LessThan(.001f));
        }

        private VRCContactSender MetadataSender(string tag, Vector3 scale)
        {
            var source = Child("SPS3 native marker", new Vector3(.1f, 1, .2f));
            source.transform.localRotation = Quaternion.Euler(0, 35, 0);
            // The beta encodes *world* scale independently of the avatar's authored scale.
            source.transform.localScale = scale / avatar.transform.lossyScale.x;
            var sender = source.AddComponent<VRCContactSender>();
            sender.radius = 0;
            sender.collisionTags = new System.Collections.Generic.List<string> { tag };
            return sender;
        }

        [TestCase("SPS/Plug/private-channel", true)]
        [TestCase("SPS/Socket/_public", true)]
        [TestCase("SPS/SocketPath/_nothips", true)]
        [TestCase("SPS/Flag/Collapse", false)]
        [TestCase("SPS/Socket/", false)]
        [TestCase("TPS_Orf_Root", false)]
        public void OnlySenderChannelTagsIdentifyEncodedScale(string tag, bool expected)
        {
            var sender = MetadataSender(tag, Vector3.one);
            Assert.That(SensaSpsAdapter.HasEncodedSps3Scale(sender), Is.EqualTo(expected));
            var receiver = sender.gameObject.AddComponent<VRCContactReceiver>();
            receiver.collisionTags = sender.collisionTags.ToList();
            Assert.That(SensaSpsAdapter.HasEncodedSps3Scale(receiver), Is.False);
        }

        [Test] public void PrivateSps3RootUsesItsOwnMarkerWithoutAdoptingChannelTagsOrScale()
        {
            var sender = MetadataSender("SPS/Socket/private-channel", new Vector3(4103, 1, 1));
            var scale = sender.transform.localScale; var rotation = sender.transform.rotation; var position = sender.transform.position;
            var host = SensaFixedRootBuilder.Build(avatar, "PrivateRoot", sender, "");
            var ownSender = host.GetComponentInChildren<VRCContactSender>(true);
            Assert.That(ownSender, Is.Not.SameAs(sender));
            Assert.That(Vector3.Distance(ownSender.transform.position, position), Is.LessThan(.00001f));
            Assert.That(Quaternion.Angle(ownSender.transform.rotation, rotation), Is.LessThan(.001f));
            Assert.That(ownSender.transform.lossyScale, Is.EqualTo(Vector3.one));
            Assert.That(ownSender.radius, Is.EqualTo(SensaFixedAnchorProtocol.MarkerRadius));
            Assert.That(host.GetComponentsInChildren<VRCContactReceiver>(true), Has.Length.EqualTo(4));
            Assert.That(host.GetComponentsInChildren<VRCContactReceiver>(true).SelectMany(receiver => receiver.collisionTags)
                .All(tag => tag.StartsWith(SensaFixedRootBuilder.TagPrefix, StringComparison.Ordinal)), Is.True);
            Assert.That(sender.transform.localScale, Is.EqualTo(scale));
            CollectionAssert.AreEqual(new[] { "SPS/Socket/private-channel" }, sender.collisionTags);
        }

        [Test] public void EncodedSenderReferenceOffsetsAndFrameArmsUseAvatarUnits()
        {
            const float scale = 1.25f; // Keep the four-anchor receiver within the SDK's 3 m world radius.
            avatar.transform.localScale = Vector3.one * scale;
            var sender = MetadataSender("SPS/SocketPath/private-channel", new Vector3(12807, 1, 1));
            var author = avatar.AddComponent<SensaTrackingFrame>(); author.reference = sender;
            author.positionOffset = new Vector3(.1f, .05f, -.02f); author.rotationOffset = new Vector3(5, 15, 0);
            var expectedPosition = sender.transform.position + sender.transform.rotation * (author.positionOffset * scale);
            var expectedRotation = sender.transform.rotation * Quaternion.Euler(author.rotationOffset);
            var placement = SensaTrackingFrameBuilder.ResolvePlacement(author);
            Assert.That(Vector3.Distance(placement.WorldMatrix.MultiplyPoint3x4(Vector3.zero), expectedPosition), Is.LessThan(.00001f));
            var frame = SensaTrackingFrameBuilder.Build(avatar, author).transform;
            Assert.That(Vector3.Distance(frame.position, expectedPosition), Is.LessThan(.00001f));
            Assert.That(Quaternion.Angle(frame.rotation, expectedRotation), Is.LessThan(.001f));
            Assert.That(Vector3.Distance(frame.Find("Origin").position, frame.Find("Forward").position), Is.EqualTo(author.axisLength * scale).Within(.00001f));
            Assert.That(Vector3.Distance(frame.Find("Origin").position, frame.Find("Right").position), Is.EqualTo(author.axisLength * scale).Within(.00001f));
            Assert.That(sender.transform.lossyScale.x, Is.EqualTo(12807).Within(.01f));
        }

        [Test] public void DirectContactRootKeepsEncodedPlugScaleOutOfItsDedicatedSender()
        {
            if (!SensaContactRootBuilder.IsSupported) Assert.Ignore("Requires SDK advanced Contact parameters.");
            avatar.transform.localScale = Vector3.one * 1.25f;
            var sender = MetadataSender("SPS/Plug/private-channel", new Vector3(.02f, 0, .16f));
            var host = SensaContactRootBuilder.Build(avatar, "PrivateRoot", sender, "");
            var ownSender = host.GetComponentInChildren<VRCContactSender>(true);
            Assert.That(Vector3.Distance(ownSender.transform.position, sender.transform.position), Is.LessThan(.00001f));
            Assert.That(ownSender.transform.lossyScale.y, Is.EqualTo(1.25f).Within(.00001f));
            Assert.That(ownSender.radius, Is.EqualTo(SensaContactProtocol.MarkerRadius));
            Assert.That(host.GetComponentsInChildren<VRCContactReceiver>(true), Has.Length.EqualTo(1));
            Assert.That(sender.transform.localScale.y, Is.Zero);
        }

        [Test] public void ShaderRootPlacementDoesNotTreatCollapsedPlugRadiusAsACollapsedFrame()
        {
            avatar.transform.localScale = Vector3.one * 2;
            var sender = MetadataSender("SPS/Plug/private-channel", new Vector3(.02f, 0, .16f));
            var author = avatar.AddComponent<SensaShaderCapture>(); author.target = sender;
            author.positionOffset = new Vector3(.1f, .05f, -.02f); author.rotationOffset = new Vector3(5, 15, 0);
            var placement = SensaShaderCaptureBuilder.ResolvePlacement(author);
            var expectedPosition = sender.transform.position + sender.transform.rotation * (author.positionOffset * 2);
            Assert.That(Vector3.Distance(placement.WorldMatrix.MultiplyPoint3x4(Vector3.zero), expectedPosition), Is.LessThan(.00001f));
            Assert.That((avatar.transform.worldToLocalMatrix * placement.WorldMatrix).MultiplyVector(Vector3.right).magnitude,
                Is.EqualTo(1).Within(.00001f));
            var source = SensaSpsAdapter.BuildRootSource(avatar, placement, "Test shader source");
            Assert.That(source.localToWorldMatrix.MultiplyVector(Vector3.up).magnitude, Is.EqualTo(2).Within(.00001f));
            Assert.That(source.GetComponentInParent<ParentConstraint>(), Is.Not.Null);
            Assert.That(sender.transform.localScale.y, Is.Zero);
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android
                && UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline == null)
            {
                Assert.DoesNotThrow(() => SensaShaderCaptureBuilder.Validate(avatar, author));
                sender.collisionTags = new System.Collections.Generic.List<string> { "TPS_Pen_Root" };
                Assert.Throws<InvalidOperationException>(() => SensaShaderCaptureBuilder.Validate(avatar, author));
            }
        }

        [Test] public void SceneHandlePoseRoundTripsThroughThePhysicalSps3Frame()
        {
            avatar.transform.localScale = Vector3.one * 2;
            var sender = MetadataSender("SPS/Socket/private-channel", new Vector3(28679, 1, 1));
            var author = avatar.AddComponent<SensaTrackingFrame>(); author.reference = sender;
            var position = new Vector3(.4f, 1.2f, -.3f); var rotation = Quaternion.Euler(15, 45, 5);
            SensaTrackingFrameEditor.SetWorldPose(author, position, rotation);
            var placement = SensaTrackingFrameBuilder.ResolvePlacement(author);
            Assert.That(Vector3.Distance(placement.WorldMatrix.MultiplyPoint3x4(Vector3.zero), position), Is.LessThan(.00001f));
            Assert.That(Quaternion.Angle(placement.WorldRotation, rotation), Is.LessThan(.001f));
            Assert.That(sender.transform.lossyScale.x, Is.EqualTo(28679).Within(.01f));
        }

        [Test] public void OrdinaryContactReferencesKeepTheirPhysicalScaleAndShapeOffset()
        {
            var sender = MetadataSender("TPS_Orf_Root", Vector3.one * 3);
            sender.position = new Vector3(.01f, .02f, .03f);
            var placement = SensaSpsAdapter.ReadRoot(sender);
            Assert.That(placement.encodedContactScale, Is.False);
            Assert.That(placement.position, Is.EqualTo(sender.position));
            Assert.That(placement.WorldMatrix.MultiplyVector(Vector3.right).magnitude, Is.EqualTo(3).Within(.00001f));
            var source = SensaSpsAdapter.BuildRootSource(avatar, placement, "Legacy source");
            Assert.That(source.parent, Is.SameAs(sender.transform));
            Assert.That(source.localPosition, Is.EqualTo(sender.position));
        }
    }
}
#endif
