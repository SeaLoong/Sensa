namespace UnityBox.Sensa
{
    // One canonical, incompatible SPS contract shared by Unity and desktop. / Unity 与桌面共用唯一 SPS 契约，不兼容旧路径。
    public static class SensaFixedAnchorProtocol
    {
        public const string Prefix = "Sensa/SPS";
        public const string CoordinateFrame = "AvatarRootLocal";
        public const int AnchorCount = 4;
        public const float CenterX = 0f;
        public const float CenterY = 1f;
        public const float CenterZ = 0f;
        public const float AnchorHalfSpan = .35f;
        public const float ReceiverRadius = 2f;
        public const float MarkerRadius = .001f;
        public const float PositionHalfRange = 2f;
        public const float MaximumFitResidual = .01f;
        public const float MinimumProximity = .001f;
        public const float MaximumProximity = .999f;
        // All four ranges must remain strictly between the saturation thresholds.
        public const float MinimumCenterDistance = ReceiverRadius * (1f - MaximumProximity) + MarkerRadius;
        public const float MaximumCenterDistance = ReceiverRadius * (1f - MinimumProximity) + MarkerRadius;
        public const float MaximumWorldContactRadius = 3f;
        public const float ScaleGuardMargin = .001f;
        public const string SampleSuffix = "/Sample";
        public const float SamplePeriodSeconds = .05f;
        public const int SampleSteps = 32;
        public const int MaximumSampleAgeMs = 1250;

        public static bool IsSampleActive(float sample) => !float.IsNaN(sample) && !float.IsInfinity(sample)
            && sample > 0 && sample <= 1 && sample * SampleSteps == (int)(sample * SampleSteps);

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
