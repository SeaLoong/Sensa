#if UNITY_INCLUDE_TESTS
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEditor;
using VRC.SDK3.Dynamics.Contact.Components;
using nadena.dev.modular_avatar.core;

namespace UnityBox.Sensa.Tests
{
    public class SensaPoseTests
    {
        [Test]
        public void StandardProbeCreatesOnlyEightRootReceivers()
        {
            var instance = Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>("Packages/top.sealoong.sensa/Prefabs/SensaSpsRootProbe.prefab"));
            try
            {
                SensaPoseBuilder.ProcessAvatar(instance);
                var contacts = instance.GetComponentsInChildren<VRCContactReceiver>();
                Assert.AreEqual(8, contacts.Length);
                Assert.IsTrue(contacts.All(c => c.localOnly && c.allowOthers && !c.allowSelf));
                Assert.IsTrue(contacts.All(c => c.collisionTags.SequenceEqual(new[] { "TPS_Pen_Root" })));
                Assert.IsTrue(contacts.All(c => c.parameter.StartsWith("Sensa/SpsRoot/v1/")));
                Assert.IsEmpty(instance.GetComponentsInChildren<VRCContactSender>());
            }
            finally { Object.DestroyImmediate(instance); }
        }

        [Test]
        public void SocketCreates24LocalFloatReceivers()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Packages/top.sealoong.sensa/Prefabs/SensaPoseSocket.prefab");
            Assert.NotNull(prefab);
            var instance = Object.Instantiate(prefab);
            try
            {
                SensaPoseBuilder.ProcessAvatar(instance);
                var contacts = instance.GetComponentsInChildren<VRCContactReceiver>();
                Assert.AreEqual(24, contacts.Length);
                Assert.AreEqual(24, contacts.Select(c => c.parameter).Distinct().Count());
                Assert.IsTrue(contacts.All(c => c.localOnly && c.allowOthers && !c.allowSelf));
                Assert.IsTrue(instance.GetComponent<ModularAvatarParameters>().parameters.All(p => p.syncType == ParameterSyncType.Float && p.localOnly));
                Assert.IsNull(instance.GetComponent<SensaPoseSocket>());
            }
            finally { Object.DestroyImmediate(instance); }
        }

        [Test]
        public void PlugCreatesThreeDistinctSphericalMarkers()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Packages/top.sealoong.sensa/Prefabs/SensaPosePlug.prefab");
            Assert.NotNull(prefab);
            var instance = Object.Instantiate(prefab);
            try
            {
                SensaPoseBuilder.ProcessAvatar(instance);
                var contacts = instance.GetComponentsInChildren<VRCContactSender>();
                Assert.AreEqual(3, contacts.Length);
                Assert.AreEqual(3, contacts.SelectMany(c => c.collisionTags).Distinct().Count());
                Assert.IsTrue(contacts.All(c => !c.localOnly && Mathf.Approximately(c.radius, .001f)));
                Assert.IsTrue(contacts.All(c => c.rootTransform != null));
            }
            finally { Object.DestroyImmediate(instance); }
        }

        [Test]
        public void NonUniformScaleFailsBeforeGeneratingContacts()
        {
            var instance = Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>("Packages/top.sealoong.sensa/Prefabs/SensaPoseSocket.prefab"));
            try
            {
                instance.transform.localScale = new Vector3(1, 2, 1);
                Assert.Throws<System.InvalidOperationException>(() => SensaPoseBuilder.ProcessAvatar(instance));
                Assert.IsEmpty(instance.GetComponentsInChildren<VRCContactReceiver>());
            }
            finally { Object.DestroyImmediate(instance); }
        }
    }
}
#endif
