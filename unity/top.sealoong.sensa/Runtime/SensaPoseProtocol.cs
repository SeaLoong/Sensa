namespace UnityBox.Sensa
{
    // Shared verbatim with the desktop project. Unreleased initial protocol; desktop and Unity are updated together.
    public static class SensaPoseProtocol
    {
        public const string PointPrefix = "Sensa/Point/v1";
        public const string HandlePrefix = "Sensa/Handle/v1";
        // Regular tetrahedron, fixed-radius local sender. Used by all local point and PB probes.
        public static int PointAnchorIndex(int index) => index == 0 ? 0 : index == 1 ? 3 : index == 2 ? 5 : 6;
        public const string Prefix = "Sensa/Pose/v1";
        public const float AnchorHalfSpan = 0.35f;
        public const float ReceiverRadius = 2f;
        public const float MarkerRadius = 0.001f;
        public const float MinimumProximity = .00001f;
        public const float MaximumProximity = .99999f;
        // A conservative outer fit radius; tiny saturated regions around anchors remain excluded.
        // Scale anchor spacing with receiver range to preserve directional conditioning.
        public const float PositionRadius = ReceiverRadius * (1f - MinimumProximity) + MarkerRadius
            - 1.7320508f * AnchorHalfSpan - .001f;
        public const float ApertureRadius = 0.04f;
        public const float MaximumTiltDegrees = 65f;
        public const float MaximumFitResidual = 0.002f;
        public const int MaximumSampleAgeMs = 1000;
        public const int AnchorsPerMarker = 8;
        public static readonly string[] Markers = { "Root", "Tip", "Side" };
        public static float AnchorX(int index) => (index & 1) == 0 ? -AnchorHalfSpan : AnchorHalfSpan;
        public static float AnchorY(int index) => (index & 2) == 0 ? -AnchorHalfSpan : AnchorHalfSpan;
        public static float AnchorZ(int index) => (index & 4) == 0 ? -AnchorHalfSpan : AnchorHalfSpan;
        public static string Tag(string channel, string marker) => "SensaPoseV1_" + channel + "_" + marker;
    }
}
