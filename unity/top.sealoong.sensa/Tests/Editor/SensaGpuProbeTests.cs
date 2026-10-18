#if UNITY_INCLUDE_TESTS
using System;
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
}
#endif
