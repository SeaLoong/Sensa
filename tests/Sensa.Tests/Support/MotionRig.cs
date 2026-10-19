using System.Threading.Channels;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Input.Script;
using Sensa.Motion;
using Sensa.Recording;
using Sensa.Runtime;
using Sensa.Signals;
using UnityBox.Sensa;

namespace Sensa.Tests.Support;

internal sealed class ProbeOutput : IMotionOutput
{
    private readonly Channel<MotionFrame> _frames = Channel.CreateUnbounded<MotionFrame>();
    private readonly Channel<bool> _stops = Channel.CreateUnbounded<bool>();
    public Func<MotionFrame, Task>? Sending { get; set; }
    public List<MotionFrame> Frames { get; } = [];
    public int StopCount { get; private set; }

    public async Task SendAsync(MotionFrame frame)
    {
        Frames.Add(frame);
        _frames.Writer.TryWrite(frame);
        if (Sending is not null) await Sending(frame);
    }

    public Task EmergencyStopAsync()
    {
        StopCount++;
        _stops.Writer.TryWrite(true);
        return Task.CompletedTask;
    }

    public async Task<MotionFrame> NextFrame(Func<MotionFrame, bool>? predicate = null)
    {
        while (true)
        {
            var frame = await _frames.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
            if (predicate is null || predicate(frame)) return frame;
        }
    }
    public Task<bool> NextStop() => _stops.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
}

internal sealed class MotionRig : IDisposable
{
    public ManualTimeProvider Clock { get; } = new();
    public AppConfig Config { get; }
    public OscParameterStore Store { get; }
    public ProbeOutput Output { get; } = new();
    public MotionRecorder Recorder { get; }
    public FunscriptPlayer Player { get; }
    public MotionRuntime Runtime { get; }
    public string? SelectedSource { get; set; }

    public MotionRig(params SignalMapping[] mappings)
    {
        Config = new AppConfig { Signals = mappings.ToList(), Outputs = [] };
        Config.NormalizeForRuntime();
        Store = new(Clock);
        Recorder = new(Clock);
        Player = new(Clock);
        Runtime = new(Config, Store, Output, Recorder, Player, () => SelectedSource, Clock);
    }

    public void Activate(RuntimeInputMode mode = RuntimeInputMode.Osc)
    {
        Runtime.SetInputMode(mode);
        Runtime.SetInputActive(true);
    }

    public void Put(string path, float value, string source = "test") =>
        Store.Set(path, OscValue.FromFloat(value), new(source, source, null, "127.0.0.1", 19000));

    public void Advance(int milliseconds) => Clock.Advance(TimeSpan.FromMilliseconds(milliseconds));

    public void Dispose()
    {
        Runtime.Dispose();
        Player.Dispose();
    }
}

internal static class SpatialSamples
{
    public static float[] Marker(PosePoint point, double radius = .001) => PoseReconstruction.Anchors
        .Select(a => (float)Math.Clamp(1 - Math.Max(0, (point - a).Length - radius) / SensaPoseProtocol.ReceiverRadius, 0, 1))
        .ToArray();

    public static void Pose(OscParameterStore store, PosePoint root, PosePoint tip, PosePoint side,
        string instance = "Main", string source = "test")
    {
        var points = new[] { root, tip, side };
        for (var m = 0; m < points.Length; m++)
        {
            var values = Marker(points[m]);
            for (var i = 0; i < values.Length; i++)
                store.Set($"Sensa/Pose/v1/{instance}/Others/{SensaPoseProtocol.Markers[m]}/A{i}",
                    OscValue.FromFloat(values[i]), new(source, source, null, "127.0.0.1", 19000));
        }
    }

    public static void FixedRoot(OscParameterStore store, string prefix, PosePoint position, string source = "test")
    {
        var sender = new OscSource(source, source, null, "127.0.0.1", 19000);
        for (var i = 0; i < SensaFixedAnchorProtocol.AnchorCount; i++)
        {
            var distance = (position - FixedAnchorReconstruction.Anchor(i)).Length;
            var proximity = (float)Math.Clamp(1 - Math.Max(0, distance - SensaFixedAnchorProtocol.MarkerRadius) / SensaFixedAnchorProtocol.ReceiverRadius, 0, 1);
            store.Set($"{prefix}/P{i}", OscValue.FromFloat(proximity), sender);
        }
        store.Set(prefix + SensaFixedAnchorProtocol.SampleSuffix, OscValue.FromFloat(1 / 32f), sender);
    }

    public static void Point(OscParameterStore store, string prefix, PosePoint position, string source = "test")
    {
        var values = Marker(position);
        for (var i = 0; i < 4; i++)
            store.Set($"{prefix}/Root/A{i}", OscValue.FromFloat(values[SensaPoseProtocol.PointAnchorIndex(i)]),
                new(source, source, null, "127.0.0.1", 19000));
    }
}
