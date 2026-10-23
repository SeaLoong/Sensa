using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Outputs.TCode;
using Sensa.Signals;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class RoutedTCodeContracts
{
    [Fact]
    public void A_newly_selected_axis_sends_its_neutral_value_after_a_different_axis_was_sent()
    {
        var encoder = new Encoder();
        var depth = Frame() with { L0 = 1, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.L0 } };
        Assert.Equal("L0999", encoder.Send(depth));
        var vibration = Frame() with { ActiveAxes = new HashSet<MotionAxis> { MotionAxis.V0 } };
        Assert.Equal("V0000", encoder.Send(vibration));
    }

    [Fact]
    public void Repeated_explicit_axis_commands_are_sent_without_emitting_other_axes()
    {
        var encoder = new Encoder();
        var vibration = Frame() with { V0 = 1, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.V0 } };
        Assert.Equal("V0999", encoder.Send(vibration));
        Assert.Equal("V0999", encoder.Send(vibration));
        Assert.Equal("V0999", encoder.Send(vibration));
    }

    [Fact]
    public void Traditional_complete_frames_continue_to_suppress_unchanged_targets()
    {
        var encoder = new Encoder(); var complete = Frame() with { L0 = .7f, V0 = .4f };
        Assert.NotEmpty(encoder.Send(complete, forceAll: true));
        Assert.Empty(encoder.Send(complete));
        Assert.Empty(encoder.Send(complete));
    }

    private static MotionFrame Frame() => MotionAxisHelper.CreateNeutralFrame() with
    {
        RequestedCommandMode = TCodeCommandMode.None, DeltaMs = 50,
    };

    /// <summary>Retains the same source/effective frame history used by each TCode transport.</summary>
    private sealed class Encoder
    {
        private readonly TCodeMotionProfile _profile = new();
        private readonly Dictionary<MotionAxis, AxisVelocityTracker> _velocity =
            MotionAxisHelper.All.ToDictionary(axis => axis, _ => new AxisVelocityTracker());
        private MotionFrame? _effective, _source;

        public string Send(MotionFrame frame, bool forceAll = false)
        {
            var encoded = TCodeEncoder.BuildLine(_profile, null, _effective, _source, _velocity, null, frame, forceAll);
            _effective = encoded.EffectiveFrame; _source = frame;
            return encoded.Line;
        }
    }
}
