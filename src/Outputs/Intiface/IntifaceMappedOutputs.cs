using Buttplug.Client;
using Buttplug.Core.Messages;
using Sensa.Motion;

namespace Sensa.Outputs.Intiface;

public sealed partial class IntifaceOutputClient
{
    private readonly List<IntifaceFeatureRoute> _featureRoutes;
    private readonly Dictionary<(uint Device, uint Feature, OutputType Type), (int Value, uint? Duration)> _lastMappedSent = new();
    private readonly HashSet<(uint Device, int Route)> _mappingWarnings = new();
    private long _motionEpoch;

    private bool OverridesDefault(ButtplugClientDevice device, ButtplugClientDeviceFeature feature, string type) =>
        _featureRoutes.Any(route => route.Matches(device.Name, feature.FeatureIndex) && IntifaceFeatureRoute.SameCapability(route.OutputType, type));

    private bool IsMotionEpochCurrent(long epoch)
    { lock (_devLock) return _connected && epoch == _motionEpoch; }

    private void ClearMappedOutputs(uint? device = null)
    {
        if (device is null)
        { ++_motionEpoch; _lastMappedSent.Clear(); _mappingWarnings.Clear(); }
        else
        {
            foreach (var key in _lastMappedSent.Keys.Where(key => key.Device == device).ToArray()) _lastMappedSent.Remove(key);
            _mappingWarnings.RemoveWhere(key => key.Device == device);
        }
    }

    private async Task SendMappedOutputsAsync(ButtplugClientDevice device, MotionFrame frame, long epoch, CancellationToken cancellation)
    {
        for (var index = 0; index < _featureRoutes.Count; index++)
        {
            var route = _featureRoutes[index];
            if (route.DeviceName.Length > 0 && route.DeviceName != device.Name || !route.UsesActiveAxes(frame)) continue;
            var type = Enum.Parse<OutputType>(route.OutputType);
            var candidates = device.Features.Values.Where(feature => route.Matches(device.Name, feature.FeatureIndex)).ToArray();
            var supported = candidates.Where(feature => feature.HasOutput(type)).ToArray();
            if (supported.Length == 0 && (route.FeatureIndex.HasValue || route.DeviceName.Length > 0))
            {
                bool warn;
                lock (_devLock) warn = _mappingWarnings.Add((device.Index, index));
                if (warn) OnLog?.Invoke($"[Intiface] Mapping {index + 1} has no advertised {type} capability on {device.Name}.");
                Telemetry.SetState("error");
            }
            foreach (var feature in supported)
            {
                cancellation.ThrowIfCancellationRequested();
                if (!IsMotionEpochCurrent(epoch)) return;
                var command = route.CreateCommand(feature.FeatureDefinition, frame);
                var key = (device.Index, feature.FeatureIndex, type);
                var target = (command.Value.Steps!.Value, command.Duration);
                bool changed;
                lock (_devLock) changed = !_lastMappedSent.TryGetValue(key, out var previous) || previous != target;
                if (!changed) continue;
                await feature.RunOutputAsync(command, cancellation).WaitAsync(cancellation).ConfigureAwait(false);
                lock (_devLock)
                {
                    if (!_connected || epoch != _motionEpoch) return;
                    _lastMappedSent[key] = target;
                }
                Telemetry.RecordTarget($"#{device.Index}/Feature{feature.FeatureIndex}/{type}",
                    $"{device.Name} · {feature.FeatureDescription} · {type}", target.Item1);
                OnDebugLog?.Invoke($"TX {device.Name}#{device.Index} feature={feature.FeatureIndex} {type}={target.Item1} duration={command.Duration}");
            }
        }
    }
}
