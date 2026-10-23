using System;
using System.Linq;
using UnityEngine;
using UnityEngine.Animations;

namespace UnityBox.Sensa
{
    public static class SensaTrackingFrameBuilder
    {
        internal static readonly string[] MarkerNames = { "Origin", "Forward", "Right" };
        internal static string Instance(SensaTrackingFrame author, string marker) => author.instanceName + "_" + marker;

        public static void ProcessAvatar(GameObject avatar)
        {
            var all = avatar.GetComponentsInChildren<SensaTrackingFrame>(true);
            var authors = all.Where(author => author.enabled).ToArray();
            if (authors.GroupBy(author => author.instanceName, StringComparer.Ordinal).Any(group => group.Count() > 1))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Tracking frame names must be unique."));
            foreach (var author in authors) Validate(avatar, author);
            SensaSensorUtility.Budget(avatar, authors.Sum(ContactCount));
            foreach (var author in authors) Build(avatar, author);
            foreach (var author in all) UnityEngine.Object.DestroyImmediate(author);
        }

        internal static int ContactCount(SensaTrackingFrame author) =>
            author.trackingMethod == SensaRootTrackingMethod.ContactDirect ? 6 : 15;

        internal static SensaSpsAdapter.RootPlacement ResolvePlacement(SensaTrackingFrame author)
        {
            if (author.reference == null)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Choose the bone or root that the tracking frame follows."));
            if (!Finite(author.positionOffset) || !Finite(author.rotationOffset))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Choose finite measurement position and rotation offsets."));
            var placement = SensaSpsAdapter.ReadRoot(author.reference);
            placement.position += placement.rotation * author.positionOffset;
            placement.rotation *= Quaternion.Euler(author.rotationOffset);
            if (!Finite(placement.position) || !Finite(placement.root.TransformPoint(placement.position)))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Choose finite measurement position and rotation offsets."));
            return placement;
        }

        private static bool Finite(Vector3 value) => !(float.IsNaN(value.x) || float.IsInfinity(value.x)
            || float.IsNaN(value.y) || float.IsInfinity(value.y) || float.IsNaN(value.z) || float.IsInfinity(value.z));

        public static void Validate(GameObject avatar, SensaTrackingFrame author)
        {
            if (author == null || author.transform != avatar.transform && !author.transform.IsChildOf(avatar.transform))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Place the tracking frame author on this avatar."));
            SensaSensorUtility.Name(author.instanceName);
            if (author.instanceName.Length > 40)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Tracking frame names may contain at most 40 characters."));
            if (!Enum.IsDefined(typeof(SensaRootTrackingMethod), author.trackingMethod))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Choose a supported tracking frame method."));
            if (float.IsNaN(author.axisLength) || author.axisLength < .05f || author.axisLength > .5f)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Tracking frame axis length must be between 0.05 and 0.5 Avatar-root units."));
            var placement = ResolvePlacement(author);
            if (placement.root != avatar.transform && !placement.root.IsChildOf(avatar.transform))
                throw new InvalidOperationException(SensaEditorLocalization.Text("The selected root must belong to this avatar."));
            if (avatar.transform.Find("SensaTrackingFrame_" + author.instanceName) != null)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Tracking frame instance already exists."));
            // Validate all three public identities before creating any frame or Contacts.
            foreach (var marker in MarkerNames)
            {
                var id = Instance(author, marker);
                if (author.trackingMethod == SensaRootTrackingMethod.ContactDirect)
                {
                    SensaContactRootBuilder.Validate(avatar, id, author.reference, "");
                    SensaSensorUtility.ValidateParameters(avatar, SensaContactProtocol.PublicLeaves.Select(leaf => SensaContactProtocol.Prefix + "/" + id + "/" + leaf));
                }
                else
                {
                    SensaFixedRootBuilder.Validate(avatar, id, author.reference, "");
                    SensaSensorUtility.ValidateParameters(avatar, new[] { "P0", "P1", "P2", "P3", "Sample" }
                        .Select(leaf => SensaFixedAnchorProtocol.Prefix + "/" + id + "/" + leaf));
                }
            }
        }

        public static GameObject Build(GameObject avatar, SensaTrackingFrame author)
        {
            Validate(avatar, author);
            SensaSensorUtility.Budget(avatar, ContactCount(author));
            var placement = ResolvePlacement(author);
            var source = SensaSensorUtility.Child(placement.root, "SensaFrameSource_" + author.instanceName);
            source.localPosition = placement.position;
            source.localRotation = placement.rotation;
            // Keep the plane rigid in avatar-root units even when the reference bone is scaled or sheared.
            // Only the chosen origin and quaternion rotation follow the bone; the frame inherits Avatar scale.
            var frame = SensaSensorUtility.Child(avatar.transform, "SensaTrackingFrame_" + author.instanceName);
            frame.SetPositionAndRotation(source.position, source.rotation);
            var follow = frame.gameObject.AddComponent<ParentConstraint>();
            follow.AddSource(new ConstraintSource { sourceTransform = source, weight = 1 });
            follow.SetTranslationOffset(0, Vector3.zero); follow.SetRotationOffset(0, Vector3.zero);
            follow.locked = true; follow.constraintActive = true;
            for (int i = 0; i < MarkerNames.Length; i++)
            {
                var marker = SensaSensorUtility.Child(frame, MarkerNames[i]);
                marker.localPosition = i == 1 ? Vector3.forward * author.axisLength
                    : i == 2 ? Vector3.right * author.axisLength : Vector3.zero;
                var id = Instance(author, MarkerNames[i]);
                if (author.trackingMethod == SensaRootTrackingMethod.ContactDirect)
                    SensaContactRootBuilder.Build(avatar, id, marker, "");
                else SensaFixedRootBuilder.Build(avatar, id, marker, "");
            }
            return frame.gameObject;
        }
    }
}
