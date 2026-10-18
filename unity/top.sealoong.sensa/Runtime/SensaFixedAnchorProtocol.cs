namespace UnityBox.Sensa
{
    // One fixed avatar-root local profile for Unity authors and the desktop solver.
    // Unity 作者端与桌面解算器共用同一头像根局部坐标定义。
    public static class SensaFixedAnchorProtocol
    {
        public const string Prefix = "Sensa/SpsRoot/v1";
        public const string ProfileId = "AvatarRootTetrahedron";
        public const float ProfileValue = 1f;
        public const string CoordinateFrame = "AvatarRootLocal";
        public const int AnchorCount = 4;
        public const float CenterX = 0f;
        public const float CenterY = 1f;
        public const float CenterZ = 0f;
        public const float AnchorHalfSpan = .5f;
        public const float ReceiverRadius = 2.5f;
        public const float MarkerRadius = .001f;
        public const float PositionHalfRange = 1.5f;
        public const float MaximumFitResidual = .01f;
        public const float MinimumProximity = .001f;
        public const float MaximumProximity = .999f;
        public const float MaximumWorldContactRadius = 3f;
        public const float ScaleGuardMargin = .001f;
        public const float HeartbeatPeriodSeconds = .05f;
        public const int HeartbeatSteps = 32;
        public const int MaximumHeartbeatAgeMs = 1250;
        public const string ProfileSuffix = "/Profile";
        public const string ValidSuffix = "/Valid";
        public const string ScaleSuffix = "/Scale";
        public const string HeartbeatSuffix = "/Heartbeat";

        private static int AnchorBits(int index)
        {
            switch (index)
            {
                case 0: return 0;
                case 1: return 5;
                case 2: return 3;
                case 3: return 6;
                default: throw new System.ArgumentOutOfRangeException(nameof(index));
            }
        }

        public static float AnchorX(int index) => CenterX + ((AnchorBits(index) & 1) == 0 ? -AnchorHalfSpan : AnchorHalfSpan);
        public static float AnchorY(int index) => CenterY + ((AnchorBits(index) & 2) == 0 ? -AnchorHalfSpan : AnchorHalfSpan);
        public static float AnchorZ(int index) => CenterZ + ((AnchorBits(index) & 4) == 0 ? -AnchorHalfSpan : AnchorHalfSpan);
        public static float MaximumScaleFactor(float authoredRootScale) =>
            (MaximumWorldContactRadius - ScaleGuardMargin) / (ReceiverRadius * authoredRootScale);
        public static bool IsScaleSupported(double authoredRootScale, double scaleFactor) =>
            !double.IsNaN(authoredRootScale) && !double.IsInfinity(authoredRootScale) && authoredRootScale > 0
            && !double.IsNaN(scaleFactor) && !double.IsInfinity(scaleFactor) && scaleFactor > 0
            && ReceiverRadius * authoredRootScale * scaleFactor <= MaximumWorldContactRadius - ScaleGuardMargin;
    }
}
