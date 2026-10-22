using System;
using System.Linq;
using UnityEngine;
using VRC.SDKBase;
using VRC.SDKBase.Editor.BuildPipeline;
using nadena.dev.ndmf;

[assembly: ExportsPlugin(typeof(UnityBox.Sensa.SensaPlugin))]

namespace UnityBox.Sensa
{
    /// <summary>Generates native components on the disposable NDMF build avatar.</summary>
    public sealed class SensaPlugin : Plugin<SensaPlugin>
    {
        public override string QualifiedName => "top.sealoong.unitybox.sensa";
        public override string DisplayName => "Sensa";

        private sealed class BuildState
        {
            public bool Generated;
            public BuildState() { }
        }

        protected override void Configure()
        {
            InPhase(BuildPhase.Generating)
                .BeforePlugin("nadena.dev.modular-avatar")
                .Run("Sensa/GenerateNativeComponents", context =>
                {
                    var state = context.GetState<BuildState>();
                    if (state.Generated) return;
                    SensaBuildPipeline.Generate(context.AvatarRootObject);
                    state.Generated = true;
                });
            InPhase(BuildPhase.Optimizing)
                .AfterPlugin("nadena.dev.modular-avatar")
                .Run("Sensa/ValidateFinalAvatar", context =>
                {
                    SensaBuildPipeline.EnsureAuthorsConsumed(context.AvatarRootObject);
                    SensaSensorUtility.Budget(context.AvatarRootObject, 0);
                });
        }
    }

    public static class SensaBuildPipeline
    {
        /// <summary>Pass a build copy; the source scene and authoring prefabs stay editable.</summary>
        public static void Generate(GameObject buildAvatar)
        {
            if (buildAvatar == null) throw new ArgumentNullException(nameof(buildAvatar));
            SensaProcessor.ValidateAvatar(buildAvatar);
            SensaQuickStartBuilder.ProcessAvatar(buildAvatar);
            // Read every root target before removing any SensaComponent used as its source.
            SensaFixedRootBuilder.ProcessAvatar(buildAvatar);
            SensaContactRootBuilder.ProcessAvatar(buildAvatar);
            SensaAutoBuilder.ProcessAvatar(buildAvatar);
            SensaPointBuilder.ProcessAvatar(buildAvatar);
            SensaPoseBuilder.ProcessAvatar(buildAvatar);
            SensaShaderCaptureBuilder.ProcessAvatar(buildAvatar);
            SensaProcessor.ProcessAvatar(buildAvatar);
            EnsureAuthorsConsumed(buildAvatar);
        }

        public static void EnsureAuthorsConsumed(GameObject buildAvatar)
        {
            if (buildAvatar == null) throw new ArgumentNullException(nameof(buildAvatar));
            var remaining = buildAvatar.GetComponentsInChildren<MonoBehaviour>(true)
                .Where(component => component != null && component is IEditorOnly
                    && (component is SensaComponent || component.GetType().Assembly == typeof(SensaComponent).Assembly))
                .Select(component => component.GetType().Name).Distinct().OrderBy(name => name, StringComparer.Ordinal).ToArray();
            if (remaining.Length == 0) return;
            throw new InvalidOperationException(SensaEditorLocalization.Text(
                "Sensa authoring components still need processing. Enable NDMF processing and place Sensa authoring prefabs on the avatar before building: ")
                + string.Join(", ", remaining));
        }
    }

    /// <summary>Checks after VRCFury and before SDK editor-only cleanup; never generates a second rig.</summary>
    public sealed class SensaPreprocessCallback : IVRCSDKPreprocessAvatarCallback
    {
        // NDMF generation: -11000; VRCFury: -10000; NDMF optimization: -1025; SDK cleanup: -1024.
        public const int AuthoringCheckOrder = -1026;
        public int callbackOrder => AuthoringCheckOrder;

        public bool OnPreprocessAvatar(GameObject avatarGameObject)
        {
            SensaBuildPipeline.EnsureAuthorsConsumed(avatarGameObject);
            return true;
        }
    }
}
