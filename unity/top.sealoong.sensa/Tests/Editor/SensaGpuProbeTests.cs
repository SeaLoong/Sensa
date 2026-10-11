#if UNITY_INCLUDE_TESTS
using NUnit.Framework;
using UnityEngine;

namespace UnityBox.Sensa.Tests
{
    public class SensaGpuProbeTests
    {
        [Test]
        public void ReadbackRejectsMissingTargetAndNonFiniteData()
        {
            var pixels = new Color[36];
            var result = new SensaGpuProbe.Capture();
            SensaGpuProbe.Decode(pixels, result);
            Assert.IsFalse(result.valid);
            pixels[0] = new Color(1947, 1, 1, .2f);
            pixels[2] = new Color(0, 0, 1, 1);
            for (var i = 3; i < 36; i++) pixels[i] = new Color(0, 0, (i - 3) / 32f * .2f, 1);
            SensaGpuProbe.Decode(pixels, result);
            Assert.IsTrue(result.valid);
            Assert.AreEqual(33, result.centerline.Length);
            pixels[12].r = float.NaN;
            SensaGpuProbe.Decode(pixels, result);
            Assert.IsFalse(result.valid);
        }
    }
}
#endif
