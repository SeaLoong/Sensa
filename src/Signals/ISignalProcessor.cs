namespace Sensa.Signals;

/// <summary>Evaluates reusable signals independently of their input and output transports.</summary>
public interface ISignalProcessor
{
    IReadOnlyDictionary<string, ComputedSignalSample> Evaluate(long nowMs,
        Func<ComputedSignalInputConfig, ComputedSignalSample> resolver);
    IReadOnlyList<ComputedSignalInputConfig> GetRequiredInputs(IEnumerable<string> ids);
    void Reset();
}
