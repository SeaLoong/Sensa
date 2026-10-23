namespace Sensa.Signals;

/// <summary>A reusable calculation evaluated before calibration and output mapping.</summary>
public sealed class ComputedSignalConfig
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public ComputedSignalOperation Operation { get; set; } = ComputedSignalOperation.WeightedAverage;
    public List<ComputedSignalInputConfig> Inputs { get; set; } = new();
    /// <summary>Zero uses the source's freshness rules; positive values add a calculation-level age limit.</summary>
    public int MaxAgeMs { get; set; }
    /// <summary>Time constant, delay, hold, pulse width, cooldown or envelope ramp, depending on the operation.</summary>
    public int TimeMs { get; set; } = 250;
    /// <summary>Active threshold, or the absolute dead-zone size.</summary>
    public float Threshold { get; set; } = .5f;
    /// <summary>The lower switching threshold for hysteresis.</summary>
    public float ReleaseThreshold { get; set; } = .4f;
    public float FrequencyHz { get; set; } = 1;
    public float Amplitude { get; set; } = 1;
    public float Offset { get; set; }
}

public sealed class ComputedSignalInputConfig
{
    public string SourceMode { get; set; } = "Direct";
    /// <summary>An OSC/spatial path, calculation ID, manual axis, script metric or output feedback/replay path.</summary>
    public string OscPath { get; set; } = "";
    public PointMetric PointMetric { get; set; } = PointMetric.Z;
    public PoseMetric PoseMetric { get; set; } = PoseMetric.Depth;
    public float Weight { get; set; } = 1;
    public float Value { get; set; }
}

public enum ComputedSignalOperation
{
    WeightedAverage,
    Average,
    Sum,
    Difference,
    Product,
    Ratio,
    Minimum,
    Maximum,
    Magnitude,
    Smooth,
    DeadZone,
    Hysteresis,
    Delay,
    Derivative,
    PeakHold,
    RisingEdge,
    FallingEdge,
    Pulse,
    Cooldown,
    Duration,
    Sine,
    Envelope,
    PointDistance,
    PlaneDepth,
    PlaneOffset,
    VectorAngle,
    PlaneAngle,
    PlaneDepthFromAxes,
    PlaneOffsetFromAxes,
}
