namespace Sensa.Signals;

public sealed class SignalMapping
{
    public string OscPath { get; set; } = "";
    public bool InvertDirection { get; set; }
    public float VrchatMin { get; set; } = 0f;
    public float VrchatMax { get; set; } = 1f;
    public SignalCurve Curve { get; set; } = SignalCurve.Linear;
    public SignalRole Role { get; set; } = SignalRole.Depth;
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
    Auxiliary1,
    Auxiliary2,
}

public enum SignalCurve
{
    Linear,
    EaseIn,
    EaseOut,
    SCurve,
}
