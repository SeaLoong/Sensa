using Sensa.Signals;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class ComputedTemporalContracts
{
    private static ComputedSignalConfig Node(ComputedSignalOperation operation, int timeMs = 250) => new()
    {
        Id = "signal", Operation = operation, TimeMs = timeMs,
        Inputs = [new() { OscPath = "value" }],
    };

    private static ComputedSignalSample Read(ComputedSignalEvaluator evaluator, long nowMs, float value,
        string? source = "avatar", long? timestamp = null, string? frame = null, string? origin = null) =>
        evaluator.Evaluate(nowMs, _ => ComputedSignalSample.Success(value, source, timestamp ?? nowMs, frame, origin))["signal"];

    private static float Value(ComputedSignalSample sample)
    {
        Assert.True(sample.Valid, sample.Reason);
        Assert.NotNull(sample.Value);
        return sample.Value.Value;
    }

    [Fact]
    public void SmoothUsesElapsedTimeAndKeepsOldestInputFreshness()
    {
        var evaluator = new ComputedSignalEvaluator([Node(ComputedSignalOperation.Smooth, 1000)]);
        Assert.Equal(0, Value(Read(evaluator, 1000, 0, frame: "AvatarRootMeters")));
        var sample = Read(evaluator, 2000, 1, timestamp: 1500, frame: "AvatarRootMeters");
        Assert.Equal((float)(1 - Math.Exp(-1)), Value(sample), 6);
        Assert.Equal(1500, sample.TimestampMs);
        Assert.Equal("AvatarRootMeters", sample.CoordinateFrame);
        Assert.Equal(1 - (float)Math.Exp(-2), Value(Read(evaluator, 3000, 1, frame: "AvatarRootMeters")), 6);
    }

    [Theory]
    [InlineData(-.5f, 0)]
    [InlineData(.5f, 0)]
    [InlineData(.6f, .6f)]
    [InlineData(-.6f, -.6f)]
    public void DeadZoneKeepsSignedValuesOutsideItsAbsoluteThreshold(float input, float expected)
    {
        var evaluator = new ComputedSignalEvaluator([Node(ComputedSignalOperation.DeadZone)]);
        Assert.Equal(expected, Value(Read(evaluator, 1000, input)));
    }

    [Fact]
    public void HysteresisHasSeparateActivationAndReleaseThresholds()
    {
        var definition = Node(ComputedSignalOperation.Hysteresis);
        definition.Threshold = .7f;
        definition.ReleaseThreshold = .4f;
        var evaluator = new ComputedSignalEvaluator([definition]);
        Assert.Equal(0, Value(Read(evaluator, 0, .5f)));
        Assert.Equal(1, Value(Read(evaluator, 1, .7f)));
        var held = Read(evaluator, 2, .5f, frame: "AvatarRootMeters");
        // Changing the input frame resets state; use a stable frame to check the held gate below.
        Assert.Equal(0, Value(held));
        Assert.Null(held.CoordinateFrame);
        Assert.Equal(1, Value(Read(evaluator, 3, .8f, frame: "AvatarRootMeters")));
        Assert.Equal(1, Value(Read(evaluator, 4, .5f, frame: "AvatarRootMeters")));
        Assert.Equal(0, Value(Read(evaluator, 5, .4f, frame: "AvatarRootMeters")));
    }

    [Fact]
    public void DelayWaitsForHistoryAndRetainsTheActualDelayedSampleProvenance()
    {
        var evaluator = new ComputedSignalEvaluator([Node(ComputedSignalOperation.Delay)]);
        Assert.False(Read(evaluator, 1000, 2, timestamp: 900, frame: "AvatarRootMeters", origin: "point:A").Valid);
        Assert.False(Read(evaluator, 1100, 4, frame: "AvatarRootMeters", origin: "point:A").Valid);
        var delayed = Read(evaluator, 1250, 6, frame: "AvatarRootMeters", origin: "point:A");
        Assert.Equal(2, Value(delayed));
        Assert.Equal("avatar", delayed.SourceKey);
        Assert.Equal(900, delayed.TimestampMs);
        Assert.Equal("AvatarRootMeters", delayed.CoordinateFrame);
        Assert.Equal("point:A", delayed.OriginKey);
        Assert.Equal(4, Value(Read(evaluator, 1350, 8, frame: "AvatarRootMeters", origin: "point:A")));
        Assert.False(evaluator.Evaluate(1400, _ => ComputedSignalSample.Invalid("lost"))["signal"].Valid);
        Assert.False(Read(evaluator, 1650, 10, frame: "AvatarRootMeters", origin: "point:A").Valid);
    }

    [Fact]
    public void DelayCapacityIsBoundedAndOverflowDiscardsTheOldHistory()
    {
        var evaluator = new ComputedSignalEvaluator([Node(ComputedSignalOperation.Delay, 60000)]);
        for (var index = 0; index < ComputedSignalEvaluator.MaximumDelaySamples; index++)
            Assert.False(Read(evaluator, index, index).Valid);
        var overflow = Read(evaluator, ComputedSignalEvaluator.MaximumDelaySamples, 1);
        Assert.False(overflow.Valid);
        Assert.Contains("buffer is full", overflow.Reason);
        var restarted = Read(evaluator, 60000, 2);
        Assert.False(restarted.Valid);
        Assert.Contains("first delayed sample", restarted.Reason);
    }

    [Fact]
    public void ZeroDelayImmediatelyReturnsTheCurrentSample()
    {
        var evaluator = new ComputedSignalEvaluator([Node(ComputedSignalOperation.Delay, 0)]);
        Assert.Equal(2, Value(Read(evaluator, 1000, 2)));
        Assert.Equal(3, Value(Read(evaluator, 1001, 3)));
    }

    [Fact]
    public void DerivativeReportsPerSecondAndChangesKnownQuantityTags()
    {
        var evaluator = new ComputedSignalEvaluator([Node(ComputedSignalOperation.Derivative)]);
        var first = Read(evaluator, 1000, .05f, frame: "AvatarRootMeters");
        Assert.Equal(0, Value(first));
        Assert.Equal("AvatarRootMeters:Velocity", first.CoordinateFrame);
        var next = Read(evaluator, 1250, .15f, frame: "AvatarRootMeters");
        Assert.Equal(.4f, Value(next), 6);
        Assert.Equal("AvatarRootMeters:Velocity", next.CoordinateFrame);
        var acceleration = new ComputedSignalEvaluator([Node(ComputedSignalOperation.Derivative)]);
        Assert.Equal("AvatarRootMeters:Acceleration", Read(acceleration, 0, 1, frame: "AvatarRootMeters:Velocity").CoordinateFrame);
        Assert.Equal("ReferenceLocal:Rig:AngularVelocity", Read(acceleration, 1, 1, frame: "ReferenceLocal:Rig:Angle").CoordinateFrame);
        Assert.Equal("AvatarRootMeters:ProximityAcceleration", Read(acceleration, 2, 1, frame: "AvatarRootMeters:ProximityRate").CoordinateFrame);
    }

    [Fact]
    public void PeakHoldKeepsThePeakUntilItsHoldExpires()
    {
        var evaluator = new ComputedSignalEvaluator([Node(ComputedSignalOperation.PeakHold)]);
        Assert.Equal(.9f, Value(Read(evaluator, 0, .9f)));
        Assert.Equal(.9f, Value(Read(evaluator, 100, .2f)));
        Assert.Equal(.9f, Value(Read(evaluator, 249, .3f)));
        Assert.Equal(.2f, Value(Read(evaluator, 250, .2f)));
        Assert.Equal(.8f, Value(Read(evaluator, 251, .8f)));
        Assert.Equal(.8f, Value(Read(evaluator, 500, .1f)));
        Assert.Equal(.1f, Value(Read(evaluator, 501, .1f)));
    }

    [Theory]
    [InlineData(ComputedSignalOperation.RisingEdge)]
    [InlineData(ComputedSignalOperation.FallingEdge)]
    [InlineData(ComputedSignalOperation.Pulse)]
    [InlineData(ComputedSignalOperation.Cooldown)]
    public void EventNodesEstablishABaselineAndDoNotInventAnInitialEdge(ComputedSignalOperation operation)
    {
        var evaluator = new ComputedSignalEvaluator([Node(operation)]);
        Assert.Equal(0, Value(Read(evaluator, 1000, 1)));
        var falling = Value(Read(evaluator, 1100, 0));
        Assert.Equal(operation == ComputedSignalOperation.FallingEdge ? 1 : 0, falling);
        var rising = Read(evaluator, 1200, 1, frame: null);
        Assert.Equal(operation == ComputedSignalOperation.FallingEdge ? 0 : 1, Value(rising));
        Assert.Null(rising.CoordinateFrame);
        Assert.Equal(rising, Read(evaluator, 1200, 1));
    }

    [Fact]
    public void PulseKeepsItsWidthAfterTheTriggerReturnsLowAndCanRetrigger()
    {
        var evaluator = new ComputedSignalEvaluator([Node(ComputedSignalOperation.Pulse)]);
        Assert.Equal(0, Value(Read(evaluator, 0, 0)));
        Assert.Equal(1, Value(Read(evaluator, 100, 1)));
        Assert.Equal(1, Value(Read(evaluator, 200, 0)));
        Assert.Equal(1, Value(Read(evaluator, 300, 1)));
        Assert.Equal(1, Value(Read(evaluator, 549, 0)));
        Assert.Equal(0, Value(Read(evaluator, 550, 0)));
    }

    [Fact]
    public void CooldownAdmitsNewEdgesAfterItsIntervalAndDoesNotRepeatAHeldHigh()
    {
        var evaluator = new ComputedSignalEvaluator([Node(ComputedSignalOperation.Cooldown)]);
        Assert.Equal(0, Value(Read(evaluator, 0, 0)));
        Assert.Equal(1, Value(Read(evaluator, 100, 1)));
        Assert.Equal(0, Value(Read(evaluator, 150, 0)));
        Assert.Equal(0, Value(Read(evaluator, 200, 1)));
        Assert.Equal(0, Value(Read(evaluator, 400, 1)));
        Assert.Equal(0, Value(Read(evaluator, 410, 0)));
        Assert.Equal(1, Value(Read(evaluator, 420, 1)));
    }

    [Fact]
    public void DurationRequiresAnUninterruptedCondition()
    {
        var evaluator = new ComputedSignalEvaluator([Node(ComputedSignalOperation.Duration)]);
        Assert.Equal(0, Value(Read(evaluator, 0, 1)));
        Assert.Equal(0, Value(Read(evaluator, 200, 1)));
        Assert.Equal(0, Value(Read(evaluator, 220, 0)));
        Assert.Equal(0, Value(Read(evaluator, 300, 1)));
        Assert.Equal(0, Value(Read(evaluator, 549, 1)));
        Assert.Equal(1, Value(Read(evaluator, 550, 1)));
        Assert.Equal(1, Value(Read(evaluator, 600, 1)));
        Assert.Equal(0, Value(Read(evaluator, 601, 0)));
    }

    [Fact]
    public void EnvelopeRisesAndFallsLinearlyWithoutLosingItsPartialLevel()
    {
        var evaluator = new ComputedSignalEvaluator([Node(ComputedSignalOperation.Envelope, 1000)]);
        Assert.Equal(0, Value(Read(evaluator, 0, 1)));
        Assert.Equal(.25f, Value(Read(evaluator, 250, 1)));
        Assert.Equal(.5f, Value(Read(evaluator, 500, 1)));
        Assert.Equal(.25f, Value(Read(evaluator, 750, 0)));
        Assert.Equal(0, Value(Read(evaluator, 1000, 0)));
        Assert.Equal(1, Value(Read(evaluator, 3000, 1)));
    }

    [Fact]
    public void SineCanGenerateWithoutAnExternalInputAndSupportsAmplitudeModulation()
    {
        var generator = Node(ComputedSignalOperation.Sine);
        generator.Inputs = [];
        ISignalProcessor evaluator = new ComputedSignalEvaluator([generator]);
        Assert.Empty(evaluator.GetRequiredInputs(["signal"]));
        Assert.Equal(0, Value(evaluator.Evaluate(1000, _ => throw new InvalidOperationException())["signal"]));
        Assert.Equal(1, Value(evaluator.Evaluate(1250, _ => throw new InvalidOperationException())["signal"]), 6);
        Assert.Equal(-1, Value(evaluator.Evaluate(1750, _ => throw new InvalidOperationException())["signal"]), 6);
        evaluator.Reset();
        Assert.Equal(0, Value(evaluator.Evaluate(2000, _ => throw new InvalidOperationException())["signal"]));

        var modulated = Node(ComputedSignalOperation.Sine);
        modulated.Amplitude = 3;
        modulated.Offset = 2;
        var wave = new ComputedSignalEvaluator([modulated]);
        Assert.Equal(2, Value(Read(wave, 0, 2)));
        Assert.Equal(8, Value(Read(wave, 250, 2)), 6);
    }

    [Theory]
    [InlineData(ComputedSignalOperation.Smooth)]
    [InlineData(ComputedSignalOperation.Hysteresis)]
    [InlineData(ComputedSignalOperation.Delay)]
    [InlineData(ComputedSignalOperation.Derivative)]
    [InlineData(ComputedSignalOperation.PeakHold)]
    [InlineData(ComputedSignalOperation.Pulse)]
    [InlineData(ComputedSignalOperation.Cooldown)]
    [InlineData(ComputedSignalOperation.Duration)]
    [InlineData(ComputedSignalOperation.Envelope)]
    public void InvalidSamplesResetTemporalStateBeforeRecovery(ComputedSignalOperation operation)
    {
        var evaluator = new ComputedSignalEvaluator([Node(operation)]);
        Read(evaluator, 0, 0);
        Read(evaluator, 100, 1);
        var invalid = evaluator.Evaluate(200, _ => ComputedSignalSample.Invalid("disconnected"))["signal"];
        Assert.False(invalid.Valid);
        Assert.Equal("disconnected", invalid.Reason);
        var recovered = Read(evaluator, 1000, .6f);
        var fresh = Read(new ComputedSignalEvaluator([Node(operation)]), 1000, .6f);
        Assert.Equal(fresh, recovered);
    }

    [Fact]
    public void ExplicitResetClockReversalAndOriginChangesStartANewTemporalHistory()
    {
        var evaluator = new ComputedSignalEvaluator([Node(ComputedSignalOperation.Smooth, 1000)]);
        Read(evaluator, 1000, 0, source: null, origin: "manual:L0");
        Assert.InRange(Value(Read(evaluator, 1500, 1, source: null, origin: "manual:L0")), 0, .5f);
        Assert.Equal(1, Value(Read(evaluator, 1501, 1, source: null, origin: "manual:L1")));
        Assert.Equal(0, Value(Read(evaluator, 10, 0, source: null, origin: "manual:L1")));
        evaluator.Reset();
        Assert.Equal(.7f, Value(Read(evaluator, 20, .7f, source: null, origin: "manual:L1")));
    }

    [Fact]
    public void NeutralLocalSourcesCanCombineWithOscAndOriginsStayBoundedThroughDeepReuse()
    {
        var definitions = new List<ComputedSignalConfig>
        {
            new() { Id = "first", Operation = ComputedSignalOperation.Product,
                Inputs = [new() { OscPath = "value" }, new() { SourceMode = "Manual", OscPath = "L0" },
                    new() { SourceMode = "Script", OscPath = "Progress" },
                    new() { SourceMode = "DeviceFeedback", OscPath = "device/battery" },
                    new() { SourceMode = "RecordingReplay", OscPath = "recording/strength" }] },
        };
        for (var index = 1; index < 16; index++) definitions.Add(new()
        {
            Id = "n" + index, Operation = ComputedSignalOperation.Average,
            Inputs = Enumerable.Range(0, 16).Select(_ => new ComputedSignalInputConfig
                { SourceMode = "Computed", OscPath = index == 1 ? "first" : "n" + (index - 1) }).ToList(),
        });
        var evaluator = new ComputedSignalEvaluator(definitions);
        var results = evaluator.Evaluate(1000, input => ComputedSignalSample.Success(1,
            input.SourceMode == "Direct" ? "avatar" : null, 900, originKey: input.SourceMode + ":" + input.OscPath));
        Assert.All(results.Values, sample =>
        {
            Assert.Equal(1, Value(sample));
            Assert.Equal("avatar", sample.SourceKey);
            Assert.Equal(900, sample.TimestampMs);
            Assert.NotNull(sample.OriginKey);
            Assert.True(sample.OriginKey.Length <= 73);
        });
        Assert.Equal(5, evaluator.GetRequiredInputs(["n15"]).Count);
    }

    [Fact]
    public void NewConfigurationFieldsAreCopiedAndTheirSemanticsAreValidated()
    {
        var original = Node(ComputedSignalOperation.Sine, 1234);
        original.FrequencyHz = 2;
        original.Amplitude = .3f;
        original.Offset = .5f;
        original.Threshold = .7f;
        original.ReleaseThreshold = .4f;
        var copy = Assert.Single(ComputedSignalEvaluator.CloneAndValidate([original]));
        Assert.Equal((1234, 2, .3f, .5f, .7f, .4f),
            (copy.TimeMs, copy.FrequencyHz, copy.Amplitude, copy.Offset, copy.Threshold, copy.ReleaseThreshold));
        original.TimeMs = 2;
        Assert.Equal(1234, copy.TimeMs);
        foreach (var operation in new[] { ComputedSignalOperation.Smooth, ComputedSignalOperation.Duration, ComputedSignalOperation.Sine })
        {
            var tooMany = Node(operation);
            tooMany.Inputs.Add(new() { SourceMode = "Constant", Value = 1 });
            Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([tooMany]));
        }
        foreach (var time in new[] { -1, 60001 })
        {
            var bad = Node(ComputedSignalOperation.Delay, time);
            Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([bad]));
        }
        var deadZone = Node(ComputedSignalOperation.DeadZone);
        deadZone.Threshold = -1;
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([deadZone]));
        var hysteresis = Node(ComputedSignalOperation.Hysteresis);
        hysteresis.ReleaseThreshold = .8f;
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([hysteresis]));
        foreach (var frequency in new[] { -1, 101, float.NaN, float.PositiveInfinity })
        {
            var wave = Node(ComputedSignalOperation.Sine);
            wave.FrequencyHz = frequency;
            Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([wave]));
        }
    }
}
