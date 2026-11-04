#if UNITY_INCLUDE_TESTS
using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.IO;
using System.Linq;
using UnityEditor;
using NUnit.Framework;
using UnityEngine;

namespace UnityBox.Sensa.Tests
{
    public class GpuReadbackContracts
    {
        private static Color[] ValidPixels()
        {
            var pixels = new Color[36];
            pixels[0] = new Color(1947, 1, 1, .2f);
            pixels[1] = new Color(.01f, .02f, .03f, 1);
            pixels[2] = new Color(0, 0, 1, 1);
            for (var index = 3; index < pixels.Length; index++)
                pixels[index] = new Color(.01f, 0, (index - 3) / 32f * .2f, 1);
            return pixels;
        }

        [Test]
        public void ValidReadbackPreservesHeaderLandmarksAndEverySample()
        {
            var result = new SensaGpuProbe.Capture();
            SensaGpuProbe.Decode(ValidPixels(), result);
            Assert.That(result.valid, Is.True);
            Assert.That(result.worldLength, Is.EqualTo(.2f));
            Assert.That(result.entryPosition, Is.EqualTo(new Vector3(.01f, .02f, .03f)));
            Assert.That(result.entryNormal, Is.EqualTo(Vector3.forward));
            Assert.That(result.centerline, Has.Length.EqualTo(33));
            Assert.That(result.firstSegmentStrength, Has.Length.EqualTo(33));
            Assert.That(result.centerline[0].z, Is.EqualTo(0));
            Assert.That(result.centerline[32].z, Is.EqualTo(.2f));
            Assert.That(result.firstSegmentStrength, Is.All.EqualTo(1f));
        }

        [TestCase(0)]
        [TestCase(35)]
        [TestCase(37)]
        public void MissingOrWrongWidthReadbackIsRejected(int width)
        {
            var result = new SensaGpuProbe.Capture();
            SensaGpuProbe.Decode(new Color[width], result);
            Assert.That(result.valid, Is.False);
        }

        [Test]
        public void NullReadbackIsRejected()
        {
            var result = new SensaGpuProbe.Capture();
            SensaGpuProbe.Decode(null, result);
            Assert.That(result.valid, Is.False);
        }

        [TestCase(0, 0)]
        [TestCase(0, 1)]
        [TestCase(0, 2)]
        [TestCase(0, 3)]
        [TestCase(1, 0)]
        [TestCase(2, 2)]
        [TestCase(12, 0)]
        [TestCase(35, 3)]
        public void NonFiniteValuesInAnyPacketRegionAreRejected(int pixel, int channel)
        {
            foreach (var invalid in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
            {
                var pixels = ValidPixels();
                pixels[pixel][channel] = invalid;
                var result = new SensaGpuProbe.Capture();
                SensaGpuProbe.Decode(pixels, result);
                Assert.That(result.valid, Is.False);
            }
        }

        [TestCase(0, 0, 1946f)]
        [TestCase(0, 1, 0f)]
        [TestCase(0, 2, 2f)]
        [TestCase(0, 3, .001f)]
        [TestCase(0, 3, 10f)]
        [TestCase(2, 2, .5f)]
        [TestCase(3, 3, -.01f)]
        [TestCase(35, 3, 1.01f)]
        [TestCase(12, 0, 1000001f)]
        public void HeaderNormalStrengthAndMagnitudeConstraintsAreEnforced(int pixel, int channel, float invalid)
        {
            var pixels = ValidPixels();
            pixels[pixel][channel] = invalid;
            var result = new SensaGpuProbe.Capture();
            SensaGpuProbe.Decode(pixels, result);
            Assert.That(result.valid, Is.False);
        }

        [Test]
        public void ReusingAnEarlierSuccessfulCaptureCannotKeepItsValidityAfterCorruption()
        {
            var result = new SensaGpuProbe.Capture();
            SensaGpuProbe.Decode(ValidPixels(), result);
            Assert.That(result.valid, Is.True);
            SensaGpuProbe.Decode(new Color[36], result);
            Assert.That(result.valid, Is.False);
        }
    }
    public sealed class Sps3RendererModelContracts
    {
        private MemoryEditorLocale locale;
        private GameObject host;
        private Material first, second;
        private MeshRenderer renderer;
        [SetUp] public void SetUp()
        {
            locale = new MemoryEditorLocale(); locale.Preference = "en-US";
            host = new GameObject("SPS3 model probe unit fixture"); renderer = host.AddComponent<MeshRenderer>();
            var shader = Shader.Find("Unlit/Color"); Assert.NotNull(shader);
            first = new Material(shader); second = new Material(shader); renderer.sharedMaterials = new[] { first, second };
        }
        [TearDown] public void TearDown()
        {
            UnityEngine.Object.DestroyImmediate(host); UnityEngine.Object.DestroyImmediate(first); UnityEngine.Object.DestroyImmediate(second);
            locale.Dispose();
        }
        private static float IntBits(int value) => BitConverter.ToSingle(BitConverter.GetBytes(value), 0);
        private static MaterialPropertyBlock Contacts(int count = 0, string channel = "SPS_Self", float offset = 0)
        {
            var matrices = new Matrix4x4[9]; var data = new Vector4[9];
            matrices[8] = Matrix4x4.Translate(Vector3.one * offset);
            for (var index = 0; index < Math.Min(Math.Max(count, 0), 8); index++) matrices[index] = Matrix4x4.identity;
            data[8] = new Vector4(0, IntBits(count), 0, 0);
            var block = new MaterialPropertyBlock(); block.SetMatrixArray("_VRChatContact_Transforms_" + channel, matrices);
            block.SetVectorArray("_VRChatContact_Data_" + channel, data); return block;
        }
        [Test] public void MaterialAbisDistinguishSps3ContactChannelsFromTheSps2Resolver()
        {
            var properties = new HashSet<string> { "_SPS_BakedLength", "_SPS_BakedRadius", "_SPS_OthersChannelTagCount", "_SPS_OthersLegacyTags" };
            Assert.IsTrue(SensaGpuProbe.UsesRendererContactData(properties.Contains));
            properties.Add("_SPS_Configured"); Assert.IsFalse(SensaGpuProbe.UsesRendererContactData(properties.Contains));
            properties.Remove("_SPS_Configured"); properties.Remove("_SPS_OthersLegacyTags");
            Assert.IsFalse(SensaGpuProbe.UsesRendererContactData(properties.Contains)); Assert.IsFalse(SensaGpuProbe.UsesRendererContactData(null));
        }
        private static string DependencyLock(string source, string path = "com.vrcfury.vrcfury/SPS/deform/unit.cginc")
        {
            using (var hash = SHA256.Create())
                return BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(source))).Replace("-", "").ToLowerInvariant() + " " + path;
        }
        private static string[] DependencyPaths()
        {
            var assets = AssetDatabase.FindAssets("Sps3GpuDependencies").Select(AssetDatabase.GUIDToAssetPath)
                .Where(path => Path.GetFileName(path) == "Sps3GpuDependencies.sha256.txt").ToArray();
            Assert.That(assets, Has.Length.EqualTo(1));
            return File.ReadAllLines(assets[0]).Where(line => line.Length > 0 && !line.StartsWith("#"))
                .Select(line => line.Split(new[] { ' ' }, 2)[1]).ToArray();
        }
        private static string CompleteDependencyLock(string source) => string.Join("\n", DependencyPaths().Select(path => DependencyLock(source, path)));
        [Test] public void DependencyLocksAcceptIdenticalCrlfTextButRejectMissingAndChangedSources()
        {
            const string original = "// exact SPS3 source\nfloat value;\n";
            var manifest = CompleteDependencyLock(original);
            Assert.DoesNotThrow(() => SensaGpuProbe.ValidateSps3DependencySources(manifest, path => original.Replace("\n", "\r\n")));
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateSps3DependencySources(manifest, path => null));
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateSps3DependencySources(manifest, path => original + " "));
        }
        [Test] public void EmptyMalformedDuplicateAndEscapingDependencyLocksCannotDisableTheGuard()
        {
            const string source = "fixed"; var valid = CompleteDependencyLock(source);
            foreach (var manifest in new[] { "# no dependencies", "bad", valid + "\n" + DependencyLock(source, DependencyPaths()[0]),
                DependencyLock(source, "com.vrcfury.vrcfury/SPS/../../outside.cginc"), DependencyLock(source, "other-package/secret.cginc") })
                Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateSps3DependencySources(manifest, path => source));
        }
        [Test] public void ATruncatedOrSubstitutedLockCannotAcceptAPartiallyMatchedShaderAbi()
        {
            const string source = "fixed"; var paths = DependencyPaths(); Assert.That(paths, Has.Length.EqualTo(14));
            var truncated = string.Join("\n", paths.Take(paths.Length - 1).Select(path => DependencyLock(source, path)));
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateSps3DependencySources(truncated, path => source));
            var substituted = string.Join("\n", paths.Take(paths.Length - 1).Concat(new[] { "com.vrcfury.vrcfury/SPS/deform/other.cginc" })
                .Select(path => DependencyLock(source, path)));
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateSps3DependencySources(substituted, path => source));
        }
        private static Dictionary<string, float> Configuration() => new Dictionary<string, float>
        {
            ["_SPS_Enabled"] = 1, ["_SPS_BakedLength"] = .2f, ["_SPS_BakedRadius"] = .02f,
            ["_SPS_OthersChannelTagCount"] = 1, ["_SPS_OthersLegacyTags"] = 1, ["_SPS_UseLegacyLights"] = 0, ["_SPS_Overrun"] = 1
        };
        [Test] public void ContactOnlyConfigurationIsValidButLegacyLightStateIsNotInvented()
        {
            var values = Configuration(); Assert.DoesNotThrow(() => SensaGpuProbe.ValidateSps3Configuration(property => values[property]));
            values["_SPS_UseLegacyLights"] = 1;
            var error = Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateSps3Configuration(property => values[property]));
            StringAssert.Contains("legacy lights", error.Message); StringAssert.Contains("Sensa Shader Root Capture", error.Message);
        }
        [TestCase("_SPS_Enabled", 0f)] [TestCase("_SPS_BakedLength", 0f)] [TestCase("_SPS_BakedRadius", -1f)]
        public void DisabledOrInvalidBakedConfigurationIsRejected(string property, float invalid)
        {
            var values = Configuration(); values[property] = invalid;
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateSps3Configuration(name => values[name]));
        }
        [Test] public void NonFiniteConfigurationCannotReachTheGpu()
        {
            foreach (var property in Configuration().Keys)
            {
                var values = Configuration(); values[property] = float.NaN;
                Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateSps3Configuration(name => values[name]));
            }
            Assert.Throws<ArgumentNullException>(() => SensaGpuProbe.ValidateSps3Configuration(null));
        }
        [Test] public void RendererWideContactArraysAreCopiedWithoutChangingTheSource()
        {
            renderer.SetPropertyBlock(Contacts(1, offset: 3));
            var slot = SensaGpuProbe.SurfaceMaterialSlot(second, renderer); Assert.AreEqual(1, slot);
            var copied = SensaGpuProbe.SurfaceProperties(second, renderer, slot);
            Assert.DoesNotThrow(() => SensaGpuProbe.ValidateContactProperties(copied));
            Assert.AreEqual(Matrix4x4.Translate(Vector3.one * 3), copied.GetMatrixArray("_VRChatContact_Transforms_SPS_Self")[8]);
            var source = new MaterialPropertyBlock(); renderer.GetPropertyBlock(source);
            Assert.AreEqual(copied.GetMatrixArray("_VRChatContact_Transforms_SPS_Self"), source.GetMatrixArray("_VRChatContact_Transforms_SPS_Self"));
        }
        [Test] public void APerMaterialBlockReplacesTheWideBlockRatherThanMergingContacts()
        {
            renderer.SetPropertyBlock(Contacts(1, offset: 3));
            renderer.SetPropertyBlock(Contacts(2, offset: 7), 1);
            var copied = SensaGpuProbe.SurfaceProperties(second, renderer, 1);
            Assert.AreEqual(Matrix4x4.Translate(Vector3.one * 7), copied.GetMatrixArray("_VRChatContact_Transforms_SPS_Self")[8]);
            var nonContact = new MaterialPropertyBlock(); nonContact.SetFloat("_SPS_Enabled", 1); renderer.SetPropertyBlock(nonContact, 1);
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateContactProperties(SensaGpuProbe.SurfaceProperties(second, renderer, 1)));
        }
        [Test] public void MissingAmbiguousInactiveAndReorderedTargetsCannotReuseAnArmedSlot()
        {
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.SurfaceMaterialSlot(null, renderer));
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.SurfaceMaterialSlot(second, null));
            var slot = SensaGpuProbe.SurfaceMaterialSlot(second, renderer);
            renderer.sharedMaterials = new[] { second, first }; Assert.IsFalse(SensaGpuProbe.SurfaceTargetMatches(second, renderer, slot));
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.SurfaceProperties(second, renderer, slot));
            renderer.sharedMaterials = new[] { second, second }; Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.SurfaceMaterialSlot(second, renderer));
            renderer.sharedMaterials = new[] { first, second }; renderer.enabled = false;
            Assert.IsFalse(SensaGpuProbe.SurfaceTargetMatches(second, renderer, slot)); renderer.enabled = true; host.SetActive(false);
            Assert.IsFalse(SensaGpuProbe.SurfaceTargetMatches(second, renderer, slot));
        }
        [Test] public void MissingPartialAndUnknownBufferLayoutsAreRejected()
        {
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateContactProperties(null));
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateContactProperties(new MaterialPropertyBlock()));
            var partial = new MaterialPropertyBlock(); partial.SetMatrixArray("_VRChatContact_Transforms_SPS_Self", new Matrix4x4[9]);
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateContactProperties(partial));
            partial.SetVectorArray("_VRChatContact_Data_SPS_Self", new Vector4[8]);
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateContactProperties(partial));
        }
        [TestCase(-1)] [TestCase(9)]
        public void InvalidNativeTargetCountsCannotBeClampedIntoAValidCapture(int count)
        { Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateContactProperties(Contacts(count))); }
        [Test] public void ZeroContactCountIsValidDataButMissingSelfFrameAndNonFiniteActiveTransformsAreNot()
        {
            Assert.DoesNotThrow(() => SensaGpuProbe.ValidateContactProperties(Contacts()));
            var block = Contacts(); var matrices = block.GetMatrixArray("_VRChatContact_Transforms_SPS_Self"); matrices[8] = Matrix4x4.zero;
            block.SetMatrixArray("_VRChatContact_Transforms_SPS_Self", matrices);
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateContactProperties(block));
            block = Contacts(1); matrices = block.GetMatrixArray("_VRChatContact_Transforms_SPS_Self"); matrices[0][0] = float.NaN;
            block.SetMatrixArray("_VRChatContact_Transforms_SPS_Self", matrices);
            Assert.Throws<InvalidOperationException>(() => SensaGpuProbe.ValidateContactProperties(block));
        }
        [Test] public void PackedOwnerBitsAndUnusedSlotsRemainUninterpreted()
        {
            var block = Contacts(1); var data = block.GetVectorArray("_VRChatContact_Data_SPS_Self");
            data[0] = new Vector4(float.NaN, IntBits(65535), float.NaN, float.PositiveInfinity);
            block.SetVectorArray("_VRChatContact_Data_SPS_Self", data);
            var matrices = block.GetMatrixArray("_VRChatContact_Transforms_SPS_Self"); matrices[4][0] = float.NaN;
            block.SetMatrixArray("_VRChatContact_Transforms_SPS_Self", matrices);
            Assert.DoesNotThrow(() => SensaGpuProbe.ValidateContactProperties(block));
        }
    }

}
#endif
