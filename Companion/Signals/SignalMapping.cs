namespace Sensa.Signals;

public sealed class SignalMapping
{
    public string OscPath { get; set; } = "";
    public bool InvertDirection { get; set; }
    public float VrchatMin { get; set; } = 0f;
    public float VrchatMax { get; set; } = 1f;
    public float SmoothingAlpha { get; set; } = 0.7f;
    public float DeadZone { get; set; } = 0.01f;
    public SignalCurve Curve { get; set; } = SignalCurve.Linear;
    public SignalRole Role { get; set; } = SignalRole.Depth;
    public float OutputMin { get; set; } = 0f;
    public float OutputMax { get; set; } = 1f;
    public int? MappedMin { get; set; }
    public int? MappedMax { get; set; }
    public bool IsOgbSocket { get; set; }
    public bool IsOgbPlug { get; set; }
}

public enum SignalRole
{
    Depth,
    AngleX,
    AngleY,
    Twist,
    Surge,
    Sway,
    V0,
    V1,
    V2,
    Auxiliary,
}

public enum SignalCurve
{
    Linear,
    EaseIn,
    EaseOut,
    SCurve,
}
