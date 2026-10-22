namespace UnityBox.Sensa
{
    // Shared verbatim with desktop. Native SDK reports remain separate from four-anchor ranges.
    public static class SensaContactProtocol
    {
        public const string Prefix = "Sensa/Contact";
        // The receiver follows avatar-root rotation, but SDK vectors retain metre units, without root-scale division.
        public const string CoordinateFrame = "AvatarRootMeters";
        public const string ProximityLeaf = "Proximity";
        public const string SenderTypeLeaf = "Proximity_SenderType";
        public static readonly string[] PositionLeaves = {
            "Proximity_SenderLocalPositionX", "Proximity_SenderLocalPositionY", "Proximity_SenderLocalPositionZ"
        };
        public static readonly string[] VelocityLeaves = {
            "Proximity_SenderVelocityX", "Proximity_SenderVelocityY", "Proximity_SenderVelocityZ"
        };
        public const string SpeedLeaf = "Proximity_SenderVelocityMagnitude";
        public const string ProximitySpeedLeaf = "Proximity_ProximitySpeed";
        public const string SampleLeaf = "Sample";
        public const string RadiusLeaf = "Radius";
        public static readonly string[] ReportLeaves = {
            ProximityLeaf, SenderTypeLeaf,
            PositionLeaves[0], PositionLeaves[1], PositionLeaves[2],
            VelocityLeaves[0], VelocityLeaves[1], VelocityLeaves[2], SpeedLeaf, ProximitySpeedLeaf
        };
        public static readonly string[] PublicLeaves = {
            ProximityLeaf, SenderTypeLeaf,
            PositionLeaves[0], PositionLeaves[1], PositionLeaves[2],
            VelocityLeaves[0], VelocityLeaves[1], VelocityLeaves[2], SpeedLeaf, ProximitySpeedLeaf,
            SampleLeaf, RadiusLeaf
        };
        public const int SelfSenderType = 1;
        public const float ReceiverRadius = SensaFixedAnchorProtocol.ReceiverRadius;
        public const float MarkerRadius = SensaFixedAnchorProtocol.MarkerRadius;
        public const float MaximumWorldContactRadius = SensaFixedAnchorProtocol.MaximumWorldContactRadius;
        public const int SampleSteps = SensaFixedAnchorProtocol.SampleSteps;
        public const float SamplePeriodSeconds = SensaFixedAnchorProtocol.SamplePeriodSeconds;
        public const int MaximumSampleAgeMs = 1000;
        // Activity does not establish an atomic SDK frame or authenticate a Contact Sender.
        public static bool IsSampleActive(float sample) => SensaFixedAnchorProtocol.IsSampleActive(sample);
        public static float MaximumScaleFactor(float authoredRootScale) => SensaFixedAnchorProtocol.MaximumScaleFactor(authoredRootScale);
        public static bool IsScaleSupported(double authoredRootScale, double scaleFactor) =>
            SensaFixedAnchorProtocol.IsScaleSupported(authoredRootScale, scaleFactor);
    }
}
