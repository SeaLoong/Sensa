using System.Text.Json;
using Sensa.Motion;
using Sensa.Recording;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Capture duration and lifecycle, using a virtual monotonic clock. / 用虚拟单调时钟验证录制时长与生命周期。</summary>
public sealed class RecordingLifecycleContracts
{
    [Fact]
    public void Stop_exports_the_last_target_held_until_the_real_stop_time()
    {
        var clock = new ManualTimeProvider();
        var recorder = new MotionRecorder(clock);
        recorder.Start();
        recorder.Push(new MotionFrame { L0 = .2f });
        clock.Advance(TimeSpan.FromSeconds(1));
        recorder.Push(new MotionFrame { L0 = .8f });
        clock.Advance(TimeSpan.FromSeconds(9));

        recorder.Stop();

        using var exported = JsonDocument.Parse(FunscriptExporter.Serialize(recorder));
        var actions = exported.RootElement.GetProperty("actions").EnumerateArray().ToArray();
        Assert.Equal(new long[] { 0, 1000, 10000 }, actions.Select(action => action.GetProperty("at").GetInt64()));
        Assert.Equal(new[] { 20, 80, 80 }, actions.Select(action => action.GetProperty("pos").GetInt32()));
        Assert.False(recorder.IsActive);
    }

    [Fact]
    public void A_second_stop_and_later_frames_do_not_extend_a_completed_recording()
    {
        var clock = new ManualTimeProvider();
        var recorder = new MotionRecorder(clock);
        recorder.Start();
        recorder.Push(new MotionFrame { L0 = .6f });
        clock.Advance(TimeSpan.FromSeconds(2));
        recorder.Stop();
        var completed = recorder.TakeSnapshot();

        clock.Advance(TimeSpan.FromSeconds(8));
        recorder.Stop();
        recorder.Push(new MotionFrame { L0 = .1f });

        Assert.Equal(completed, recorder.TakeSnapshot());
        using var exported = JsonDocument.Parse(FunscriptExporter.Serialize(recorder));
        Assert.Equal(2000, exported.RootElement.GetProperty("actions").EnumerateArray().Last().GetProperty("at").GetInt64());
    }

    [Fact]
    public void Stop_within_the_last_sample_millisecond_does_not_add_a_duplicate()
    {
        var clock = new ManualTimeProvider();
        var recorder = new MotionRecorder(clock);
        recorder.Start();
        clock.Advance(TimeSpan.FromMilliseconds(1));
        recorder.Push(new MotionFrame { L0 = .4f });
        clock.Advance(TimeSpan.FromTicks(9000));

        recorder.Stop();

        var frame = Assert.Single(recorder.TakeSnapshot());
        Assert.Equal(1, frame.Ms);
        Assert.Equal(.4f, frame.L0);
    }

    [Fact]
    public void A_recording_without_a_finite_sample_never_invents_an_action()
    {
        var clock = new ManualTimeProvider();
        var recorder = new MotionRecorder(clock);
        recorder.Stop();
        recorder.Start();
        recorder.Push(new MotionFrame { L0 = float.NaN });
        clock.Advance(TimeSpan.FromSeconds(10));

        recorder.Stop();
        recorder.Stop();

        Assert.Empty(recorder.TakeSnapshot());
        Assert.Equal("", FunscriptExporter.Serialize(recorder));
        Assert.False(recorder.IsActive);
    }

    [Fact]
    public void Reaching_capacity_finishes_at_the_last_captured_frame_and_later_stop_is_inert()
    {
        var clock = new ManualTimeProvider();
        var recorder = new MotionRecorder(clock);
        recorder.Start();
        for (var index = 0; index < 100000; index++)
            recorder.Push(new MotionFrame { L0 = .5f });
        Assert.False(recorder.IsActive);

        clock.Advance(TimeSpan.FromSeconds(10));
        recorder.Stop();
        recorder.Push(new MotionFrame { L0 = .9f });

        Assert.Equal(100000, recorder.FrameCount);
        Assert.Equal((0L, .5f), recorder.TakeSnapshot()[^1]);
    }

    [Fact]
    public void Stopping_with_one_slot_left_preserves_duration_without_exceeding_capacity()
    {
        var clock = new ManualTimeProvider();
        var recorder = new MotionRecorder(clock);
        recorder.Start();
        for (var index = 0; index < 99999; index++)
            recorder.Push(new MotionFrame { L0 = .5f });
        clock.Advance(TimeSpan.FromSeconds(10));

        recorder.Stop();

        Assert.Equal(100000, recorder.FrameCount);
        Assert.Equal((10000L, .5f), recorder.TakeSnapshot()[^1]);
        Assert.False(recorder.IsActive);
    }
}
