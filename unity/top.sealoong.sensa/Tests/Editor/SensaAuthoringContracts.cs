#if UNITY_INCLUDE_TESTS
using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDKBase;

namespace UnityBox.Sensa.Tests
{
    public class AuthoringLifetimeContracts : AvatarBuildFixture
    {
        private static IEnumerable<Type> AuthorTypes => typeof(SensaComponent).Assembly.GetTypes()
            .Where(type => !type.IsAbstract && typeof(MonoBehaviour).IsAssignableFrom(type))
            .OrderBy(type => type.FullName, StringComparer.Ordinal);

        [TestCaseSource(nameof(AuthorTypes))]
        public void EveryRuntimeAuthorComponentHasTheSdkEditorOnlyMarker(Type authorType)
        {
            Assert.That(typeof(IEditorOnly).IsAssignableFrom(authorType), Is.True,
                authorType.FullName + " must be consumed before upload and remain eligible for SDK editor-only cleanup.");
        }

        [Test]
        public void RemovingEditorOnlyComponentsPreservesHostHierarchyAndNativePayload()
        {
            var host = Child("Author and native payload", new Vector3(.1f, 1, .2f));
            var landmark = new GameObject("Native landmark").transform;
            landmark.SetParent(host.transform, false);
            landmark.localPosition = Vector3.forward * .1f;
            var sender = host.AddComponent<VRCContactSender>();
            sender.rootTransform = landmark;
            sender.radius = .015f;
            sender.collisionTags = new List<string> { "SensaAuthorRemovalContract" };
            var receiver = landmark.gameObject.AddComponent<VRCContactReceiver>();
            receiver.parameter = "Sensa/Contract/SurvivesAuthorCleanup";

            var authors = AuthorTypes.Select(type => (MonoBehaviour)host.AddComponent(type)).ToArray();
            Assert.That(authors, Is.Not.Empty);
            Assert.That(authors.All(author => author is IEditorOnly), Is.True);
            foreach (var author in authors) author.enabled = false;

            // Model component-only editor cleanup. This is not execution of an SDK upload.
            foreach (var author in host.GetComponents<MonoBehaviour>().Where(component => component is IEditorOnly))
                UnityEngine.Object.DestroyImmediate(author);

            Assert.That(host, Is.Not.Null);
            Assert.That(host.transform.parent, Is.EqualTo(avatar.transform));
            Assert.That(landmark.parent, Is.EqualTo(host.transform));
            Assert.That(landmark.localPosition, Is.EqualTo(Vector3.forward * .1f));
            Assert.That(host.GetComponents<MonoBehaviour>().Any(component => component is IEditorOnly), Is.False);
            Assert.That(host.GetComponent<VRCContactSender>(), Is.SameAs(sender));
            Assert.That(sender.rootTransform, Is.EqualTo(landmark));
            Assert.That(sender.radius, Is.EqualTo(.015f));
            CollectionAssert.AreEqual(new[] { "SensaAuthorRemovalContract" }, sender.collisionTags);
            Assert.That(landmark.GetComponent<VRCContactReceiver>(), Is.SameAs(receiver));
            Assert.That(receiver.parameter, Is.EqualTo("Sensa/Contract/SurvivesAuthorCleanup"));
        }
    }
}
#endif
