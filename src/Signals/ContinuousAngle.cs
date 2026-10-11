namespace Sensa.Signals;

/// <summary>Keeps a bounded actuator's input continuous across the atan2 ±180° seam.</summary>
public sealed class ContinuousAngle
{
    private double? _last;
    private double _continuous;
    public float Update(double degrees)
    {
        if (!double.IsFinite(degrees)) return (float)_continuous;
        if (_last.HasValue) _continuous += ((degrees - _last.Value + 540) % 360) - 180;
        else _continuous = degrees;
        _last = degrees;
        return (float)_continuous;
    }
}
