namespace UnityBox.Sensa
{
    // Shared verbatim with the desktop project. Changing geometry requires a new protocol version.
    public static class SensaPoseProtocol
    {
        public const string SpsRootPrefix = "Sensa/SpsRoot/v1";
        public const string SpsRootTag = "TPS_Pen_Root";
        public const string Prefix = "Sensa/Pose/v1";
        public const float AnchorHalfSpan = 0.06f;
        public const float ReceiverRadius = 0.35f;
        public const float MarkerRadius = 0.001f;
        public const float ApertureRadius = 0.04f;
        public const float MaximumTiltDegrees = 65f;
        public const float MaximumFitResidual = 0.002f;
        public const int AnchorsPerMarker = 8;
        public static readonly string[] Markers = { "Root", "Tip", "Side" };
        public static float AnchorX(int index) => (index & 1) == 0 ? -AnchorHalfSpan : AnchorHalfSpan;
        public static float AnchorY(int index) => (index & 2) == 0 ? -AnchorHalfSpan : AnchorHalfSpan;
        public static float AnchorZ(int index) => (index & 4) == 0 ? -AnchorHalfSpan : AnchorHalfSpan;
        public static string Tag(string channel, string marker) => "SensaPoseV1_" + channel + "_" + marker;
    }
}
