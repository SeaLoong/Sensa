namespace Sensa.Motion;

public record MotionFrame
{
    public float L0 { get; init; }
    public float R0 { get; init; } = 0.5f;
    public float R1 { get; init; } = 0.5f;
    public float R2 { get; init; } = 0.5f;
    public float L1 { get; init; } = 0.5f;
    public float L2 { get; init; } = 0.5f;
    public float V0 { get; init; }
    public float V1 { get; init; }
    public float V2 { get; init; }
    public float A0 { get; init; } = 0.5f;
    public double DeltaMs { get; init; }
    public bool UseMaxSpeed { get; init; }

    public static readonly MotionFrame Zero = new();
}
