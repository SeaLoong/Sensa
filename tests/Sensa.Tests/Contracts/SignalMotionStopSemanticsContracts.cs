using System.Collections.Concurrent;
using System.Text.Json;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Outputs.TCode;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Binding invalidity uses its configured value; whole-output stop uses the device command.</summary>
public sealed class SignalMotionStopSemanticsContracts
{
    [Theory]
    [InlineData(0, "L0400I100")]
    [InlineData(.25, "L0450I50")]
    [InlineData(.75, "L0550I50")]
    public async Task Invalid_motion_binding_emits_its_configured_stop_value_through_the_axis_profile(double stopValue, string expected)
    {
        await using var rig = new Rig(stopValue);
        rig.PublishInvalid();
        await rig.WaitForCount(1);
        rig.Advance(); rig.Publish(.5f);
        await rig.WaitForCount(2);
        rig.Advance(); rig.PublishInvalid();
        await rig.WaitForCount(3);
        Assert.Equal(expected, rig.Wire.Last());
        Assert.Equal(stopValue, rig.Frames.Last().L0, 5);
        Assert.Equal(0, rig.DeviceStops);
        var route = JsonSerializer.SerializeToElement(rig.Coordinator.Snapshot("motion"), new JsonSerializerOptions(JsonSerializerDefaults.Web))
            .GetProperty("routes")[0];
        Assert.False(route.GetProperty("valid").GetBoolean());
        Assert.Equal(JsonValueKind.Null, route.GetProperty("value").ValueKind);

        // Further invalid samples cannot keep driving the fallback or replay the old target.
        rig.Advance(); rig.PublishInvalid();
        rig.Advance(); rig.PublishInvalid();
        Assert.Equal(3, rig.Wire.Count);
        Assert.DoesNotContain("DSTOP", rig.Wire);
    }

    [Fact]
    public async Task Invalidity_replaces_an_old_queued_motion_target_before_the_worker_delivers_it()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = true;
        await using var rig = new Rig(.25, async _ =>
        {
            if (!first) return;
            first = false; entered.TrySetResult(); await release.Task;
        });
        try
        {
            rig.Publish(.4f);
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(2));
            rig.Advance(); rig.Publish(.8f);
            rig.Advance(); rig.PublishInvalid();
        }
        finally { release.TrySetResult(); }
        await rig.WaitForCount(2);
        Assert.Equal(new[] { "L0480I20", "L0450I30" }, rig.Wire.ToArray());
        Assert.Equal(new[] { .4f, .25f }, rig.Frames.Select(frame => frame.L0).ToArray());
        Assert.Equal(0, rig.DeviceStops);
    }

    [Fact]
    public async Task Whole_output_stop_calls_the_device_stop_instead_of_sending_another_stop_value_target()
    {
        await using var rig = new Rig(.25);
        rig.Publish(.5f);
        await rig.WaitForCount(1);
        rig.Advance(); rig.PublishInvalid();
        await rig.WaitForCount(2);
        Assert.Equal("L0450I50", rig.Wire.Last());
        Assert.Equal(0, rig.DeviceStops);
        await rig.Coordinator.StopAsync();
        Assert.Equal(1, rig.DeviceStops);
        Assert.Equal("DSTOP", rig.Wire.Last());
        Assert.Equal(2, rig.Frames.Count);
    }

    private sealed class Rig : IAsyncDisposable
    {
        private readonly ManualTimeProvider _clock = new();
        private readonly TCodeMotionProfile _profile = new()
        {
            L0 = new() { Min = 400, Max = 600, RemapMin = 400, RemapMax = 600, MaxSpeed = 100, CommandMode = TCodeCommandMode.Interval },
        };
        private readonly Dictionary<MotionAxis, AxisVelocityTracker> _velocity = MotionAxisHelper.All.ToDictionary(axis => axis, _ => new AxisVelocityTracker());
        private MotionFrame? _effective, _source;
        private int _deviceStops;
        public ConcurrentQueue<string> Wire { get; } = new();
        public ConcurrentQueue<MotionFrame> Frames { get; } = new();
        public int DeviceStops => Volatile.Read(ref _deviceStops);
        public SignalOutputCoordinator Coordinator { get; }
        private long Now => _clock.GetUtcNow().ToUnixTimeMilliseconds();

        public Rig(double stopValue, Func<MotionFrame, Task>? beforeSend = null)
        {
            var config = new AppConfig { Outputs = [new()
            {
                Id = "motion", Type = OutputDeviceType.TCodeUdp, Enabled = true,
                Signal = new() { Bindings = [new()
                {
                    Id = "blend", Source = new() { SourceMode = "Manual", OscPath = "L0" },
                    Address = "L0", StopValue = stopValue, RateHz = 20, SendMode = "OnChange",
                }] },
            }] };
            Coordinator = new(config, _ => true, async (_, frame) =>
            {
                if (beforeSend is not null) await beforeSend(frame);
                var encoded = TCodeEncoder.BuildLine(_profile, null, _effective, _source, _velocity, null, frame, false);
                _effective = encoded.EffectiveFrame; _source = frame;
                Frames.Enqueue(frame); Wire.Enqueue(encoded.Line);
            }, _ =>
            {
                Interlocked.Increment(ref _deviceStops);
                _effective = _source = null;
                Wire.Enqueue("DSTOP"); return Task.CompletedTask;
            }, clock: _clock) { CanSend = () => true };
        }
        public void Publish(float value) => Coordinator.Publish(_ => ComputedSignalSample.Success(value, null, Now), Now);
        public void PublishInvalid() => Coordinator.Publish(_ => ComputedSignalSample.Invalid("The required protocol source disconnected."), Now);
        public void Advance() => _clock.Advance(TimeSpan.FromMilliseconds(100));
        public async Task WaitForCount(int count)
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            while (Wire.Count < count) await Task.Delay(1, deadline.Token);
        }
        public ValueTask DisposeAsync() => Coordinator.DisposeAsync();
    }
}
