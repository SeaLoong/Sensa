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
}

public sealed class ComputedSignalInputConfig
{
    public string SourceMode { get; set; } = "Direct";
    /// <summary>An OSC path pattern, spatial measurement pattern, or computed signal ID.</summary>
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
}
