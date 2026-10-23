namespace Sensa.Signals;

/// <summary>Input providers retain value, validity, sample age and source identity.</summary>
public interface ISignalInputSource
{
    ComputedSignalSample Read(ComputedSignalInputConfig input, long nowMs);
}

public sealed class SignalInputSource(Func<ComputedSignalInputConfig, long, ComputedSignalSample> read) : ISignalInputSource
{
    public ComputedSignalSample Read(ComputedSignalInputConfig input, long nowMs) => read(input, nowMs);
}
