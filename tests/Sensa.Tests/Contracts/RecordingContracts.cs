using System.Text.Json;
using Sensa.Motion;
using Sensa.Recording;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class RecordingContracts
{
    [Fact]
    public void Only_active_recordings_capture_finite_L0_targets_with_relative_virtual_time()
    {
        var clock = new ManualTimeProvider();
        var recorder = new MotionRecorder(clock);
        recorder.Push(new MotionFrame { L0 = .3f });
        Assert.Empty(recorder.TakeSnapshot());
        recorder.Start(); recorder.Push(new MotionFrame { L0 = .2f });
        clock.Advance(TimeSpan.FromMilliseconds(150));
        recorder.Push(new MotionFrame { L0 = float.NaN });
        recorder.Push(new MotionFrame { L0 = .8f, R0 = .1f });
        recorder.Stop(); recorder.Push(new MotionFrame { L0 = .4f });
        var frames = recorder.TakeSnapshot();
        Assert.Equal(new long[] { 0, 150 }, frames.Select(f => f.Ms));
        Assert.Equal(new[] { .2f, .8f }, frames.Select(f => f.L0));
        frames.Clear(); Assert.Equal(2, recorder.FrameCount);
        recorder.Start(); Assert.Empty(recorder.TakeSnapshot());
    }

    [Fact]
    public void Capacity_stops_recording_without_growing_the_buffer()
    {
        var recorder = new MotionRecorder(new ManualTimeProvider());
        recorder.Start();
        for (var i = 0; i < 100001; i++) recorder.Push(new MotionFrame { L0 = .5f });
        Assert.False(recorder.IsActive);
        Assert.Equal(100000, recorder.FrameCount);
    }

    [Fact]
    public void Export_has_funscript_metadata_and_simplifies_linear_targets_to_endpoints()
    {
        var clock = new ManualTimeProvider();
        var recorder = new MotionRecorder(clock);
        Assert.Equal("", FunscriptExporter.Serialize(recorder));
        recorder.Start();
        for (var i = 0; i <= 100; i++)
        {
            recorder.Push(new MotionFrame { L0 = i / 100f });
            clock.Advance(TimeSpan.FromMilliseconds(10));
        }
        recorder.Stop();
        using var json = JsonDocument.Parse(FunscriptExporter.Serialize(recorder));
        var root = json.RootElement; var actions = root.GetProperty("actions");
        Assert.Equal("1.0", root.GetProperty("version").GetString());
        Assert.False(root.GetProperty("inverted").GetBoolean());
        Assert.Equal(100, root.GetProperty("range").GetInt32());
        Assert.Equal(2, actions.GetArrayLength());
        Assert.Equal(0, actions[0].GetProperty("pos").GetInt32());
        Assert.Equal(100, actions[1].GetProperty("pos").GetInt32());
        Assert.Equal(1000, actions[1].GetProperty("at").GetInt64());
    }

    [Fact]
    public void Simplification_preserves_a_direction_change_and_does_not_mutate_capture()
    {
        var clock = new ManualTimeProvider();
        var recorder = new MotionRecorder(clock);
        recorder.Start();
        foreach (var value in new[] { 0f, .5f, 1f, .5f, 0f })
        {
            recorder.Push(new MotionFrame { L0 = value });
            clock.Advance(TimeSpan.FromMilliseconds(100));
        }
        recorder.Stop();
        using var json = JsonDocument.Parse(FunscriptExporter.Serialize(recorder));
        var positions = json.RootElement.GetProperty("actions").EnumerateArray().Select(a => a.GetProperty("pos").GetInt32());
        Assert.Contains(100, positions);
        Assert.Equal(5, recorder.FrameCount);
    }
}
