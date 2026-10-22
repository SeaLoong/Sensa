using Sensa.Input.Osc;
using Sensa.Signals;
using Sensa.Tests.Support;
using UnityBox.Sensa;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Computed inputs use the same spatial contracts, source identity and output gates as ordinary mappings.</summary>
public sealed class ComputedRuntimeContracts
{
    private const string First = "Sensa/SPS/First";
    private const string Second = "Sensa/SPS/Second";

    private static ComputedSignalInputConfig Scalar(string path, float weight = 1) => new()
    { SourceMode = "Direct", OscPath = path, Weight = weight };
    private static ComputedSignalInputConfig Point(string path, PointMetric metric = PointMetric.Z, float weight = 1) => new()
    { SourceMode = "SensaPoint", OscPath = path, PointMetric = metric, Weight = weight };
    private static ComputedSignalInputConfig Constant(float value, float weight = 1) => new()
    { SourceMode = "Constant", Value = value, Weight = weight };
    private static ComputedSignalConfig Calculation(params ComputedSignalInputConfig[] inputs) => new()
    { Id = "Combined", Inputs = inputs.ToList() };
    private static ComputedSignalResolver Resolver(MotionRig rig, bool allowSpatial = true, string? source = null) =>
        new(rig.Store.SnapshotEntries(), source, rig.Clock.GetUtcNow().ToUnixTimeMilliseconds(), 1000, allowSpatial);

    private static void Configure(MotionRig rig, ComputedSignalConfig calculation, float min = 0, float max = 1)
    {
        rig.Config.ComputedSignals = [calculation];
        rig.Config.Signals = [new() { SourceMode = "Computed", OscPath = calculation.Id,
            Role = SignalRole.Depth, VrchatMin = min, VrchatMax = max, MappedMin = 0, MappedMax = 999 }];
        rig.Config.NormalizeForRuntime();
        rig.Runtime.RebuildProcessors();
    }

    private static async Task DrainStops(MotionRig rig, int alreadyRead = 0)
    {
        for (var index = alreadyRead; index < rig.Output.StopCount; index++) await rig.Output.NextStop();
    }

    [Theory]
    [InlineData("Input/*")]
    [InlineData("Other/**;Input/A")]
    [InlineData("Other/A\nInput/A")]
    public async Task CalculationPatternsRefreshWhenAMatchingParameterChanges(string pattern)
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Scalar(pattern)));
        rig.Put("Input/A", .2f);
        rig.Activate();
        Assert.Equal(.2f * .999f, (await rig.Output.NextFrame()).L0, 5);
        rig.Put("Unrelated/Expression", .9f);
        rig.Put("Input/A", .8f);
        rig.Advance(30);
        Assert.Equal(.8f * .999f, (await rig.Output.NextFrame(frame => frame.L0 > .7f)).L0, 5);
        Assert.False(rig.Runtime.ComputedInputBlocked);
    }

    [Fact]
    public void ExactScalarAndPatternsRequireOneParameterFromOneSource()
    {
        using var rig = new MotionRig();
        rig.Put("Input/A", .2f, "one");
        rig.Put("Input/A", .8f, "two");
        Assert.False(Resolver(rig).Resolve(Scalar("Input/A")).Valid);
        var selected = Resolver(rig, source: "one").Resolve(Scalar("Input/A"));
        Assert.True(selected.Valid, selected.Reason);
        Assert.Equal(.2f, selected.Value);
        Assert.Equal("one", selected.SourceKey);
        rig.Put("Input/B", .7f, "one");
        Assert.False(Resolver(rig, source: "one").Resolve(Scalar("Input/*")).Valid);
        Assert.False(Resolver(rig).Resolve(Scalar("Missing")).Valid);
        Assert.False(Resolver(rig, source: "missing-source").Resolve(Scalar("Input/A")).Valid);
    }

    [Fact]
    public void ResolverUsesOneSnapshotAndRejectsFutureOrNonfiniteScalarValues()
    {
        using var rig = new MotionRig();
        rig.Put("Input/A", .2f);
        var snapshot = rig.Store.SnapshotEntries();
        var resolver = Resolver(rig);
        rig.Put("Input/A", .8f);
        Assert.Equal(.2f, resolver.Resolve(Scalar("Input/A")).Value);
        var now = rig.Clock.GetUtcNow().ToUnixTimeMilliseconds();
        foreach (var entry in new[] {
            snapshot[0] with { Entry = snapshot[0].Entry with { TimestampMs = now + 1 } },
            snapshot[0] with { Entry = snapshot[0].Entry with { Value = OscValue.FromFloat(float.NaN) } } })
            Assert.False(new ComputedSignalResolver([entry], null, now, 1000, true).Resolve(Scalar("Input/A")).Valid);
    }

    [Fact]
    public void SpatialResolutionRequiresPermissionOneTargetAndASupportedMetric()
    {
        using var rig = new MotionRig();
        SpatialSamples.FixedRoot(rig.Store, First, new(.2, 1, .3));
        Assert.False(Resolver(rig, allowSpatial: false).Resolve(Point(First + "/**")).Valid);
        var result = Resolver(rig).Resolve(Point(First + "/**"));
        Assert.True(result.Valid, result.Reason);
        Assert.InRange(result.Value!.Value, .29999f, .30001f);
        Assert.Equal("AvatarRootLocal", result.CoordinateFrame);
        Assert.False(Resolver(rig).Resolve(Point(First + "/**", PointMetric.VelocityZ)).Valid);
        SpatialSamples.FixedRoot(rig.Store, Second, new(.1, 1, .4));
        Assert.False(Resolver(rig).Resolve(Point("Sensa/SPS/*/**")).Valid);
        rig.Put(Second + "/Sample", 0);
        Assert.False(Resolver(rig).Resolve(Point("Sensa/SPS/*/**")).Valid);
    }

    [Fact]
    public void SpatialCoordinatesCannotBeCompletedAcrossSources()
    {
        using var rig = new MotionRig();
        SpatialSamples.FixedRoot(rig.Store, First, new(.2, 1, .3), "one");
        SpatialSamples.FixedRoot(rig.Store, First, new(.2, 1, .5), "two");
        var split = rig.Store.SnapshotEntries().Where(entry => entry.Entry.Source.Key == "one"
            ? !entry.Path.EndsWith("P3") : entry.Path.EndsWith("P3")).ToArray();
        var now = rig.Clock.GetUtcNow().ToUnixTimeMilliseconds();
        Assert.False(new ComputedSignalResolver(split, null, now, 1000, true).Resolve(Point(First + "/**")).Valid);
        Assert.False(Resolver(rig).Resolve(Point(First + "/**")).Valid);
        Assert.InRange(Resolver(rig, source: "two").Resolve(Point(First + "/**")).Value!.Value, .49999f, .50001f);
    }

    [Fact]
    public void ReferenceLocalPointsKeepTheirReferenceIdentityAndContactMetricsKeepTheirQuantity()
    {
        using var rig = new MotionRig();
        const string one = "Sensa/Point/v1/One/Self", two = "Sensa/Point/v1/Two/Self";
        SpatialSamples.Point(rig.Store, one, new(.02, 0, .1));
        SpatialSamples.Point(rig.Store, two, new(.02, 0, .1));
        var resolver = Resolver(rig);
        Assert.NotEqual(resolver.Resolve(Point(one + "/**")).CoordinateFrame,
            resolver.Resolve(Point(two + "/**")).CoordinateFrame);
        PutContact(rig);
        resolver = Resolver(rig);
        var position = resolver.Resolve(Point("Sensa/Contact/Root/**", PointMetric.X));
        var speed = resolver.Resolve(Point("Sensa/Contact/Root/**", PointMetric.Speed));
        var velocity = resolver.Resolve(Point("Sensa/Contact/Root/**", PointMetric.VelocityX));
        var rate = resolver.Resolve(Point("Sensa/Contact/Root/**", PointMetric.ProximitySpeed));
        Assert.Equal("AvatarRootMeters", position.CoordinateFrame);
        Assert.Equal(speed.CoordinateFrame, velocity.CoordinateFrame);
        Assert.NotEqual(position.CoordinateFrame, speed.CoordinateFrame);
        Assert.NotEqual(rate.CoordinateFrame, speed.CoordinateFrame);
    }

    [Fact]
    public void PoseMetricsRequireCompleteFreshEngagedGeometryAndOneRig()
    {
        using var rig = new MotionRig();
        SpatialSamples.Pose(rig.Store, new(.02, 0, -.1), new(.02, 0, .1), new(.05, 0, -.1));
        var input = new ComputedSignalInputConfig { SourceMode = "SensaPose", OscPath = "Sensa/Pose/v1/Main/Others/**" };
        Assert.False(Resolver(rig, allowSpatial: false).Resolve(input).Valid);
        var result = Resolver(rig).Resolve(input);
        Assert.True(result.Valid, result.Reason);
        Assert.InRange(result.Value!.Value, .499f, .501f);
        Assert.EndsWith(":NormalizedDepth", result.CoordinateFrame);
        rig.Advance(1001);
        rig.Put("Sensa/Pose/v1/Main/Others/Root/A0", .5f);
        Assert.False(Resolver(rig).Resolve(input).Valid);
    }

    [Fact]
    public async Task WeightedAverageUsesRawInputsBeforeCalibrationAndMapping()
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Scalar("Input/A"), Scalar("Input/B", 3)), 0, 1);
        rig.Config.Signals[0].MappedMin = 200;
        rig.Config.Signals[0].MappedMax = 800;
        rig.Runtime.RebuildProcessors();
        rig.Put("Input/A", .2f); rig.Put("Input/B", .8f);
        var preview = rig.Runtime.GetComputedSignalResults()["Combined"];
        Assert.True(preview.Valid, preview.Reason);
        Assert.Equal(.65f, preview.Value!.Value, 5);
        rig.Activate();
        Assert.Equal(.59f, (await rig.Output.NextFrame()).L0, 5);
        Assert.True(rig.Runtime.CanSend);
    }

    [Fact]
    public async Task MissingInputStopsTheWholeComputedMappingAndArrivalRestoresIt()
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Scalar("Input/A"), Scalar("Input/B", 3)));
        rig.Put("Input/A", .2f);
        rig.Activate();
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.ComputedInputBlocked);
        Assert.False(rig.Runtime.CanSend);
        Assert.True(rig.Runtime.InputActive);
        Assert.Empty(rig.Output.Frames);
        rig.Put("Input/B", .8f);
        rig.Advance(31);
        Assert.InRange((await rig.Output.NextFrame()).L0, .649f, .650f);
        Assert.False(rig.Runtime.ComputedInputBlocked);
    }

    [Fact]
    public async Task FreshOneInputCannotExtendTheOldestInputsLifetimeAndWatchdogStopsWithoutAnotherPacket()
    {
        using var rig = new MotionRig();
        var calculation = Calculation(Scalar("Input/A"), Scalar("Input/B", 3));
        calculation.MaxAgeMs = 600;
        Configure(rig, calculation);
        rig.Put("Input/A", .2f); rig.Put("Input/B", .8f);
        rig.Activate();
        await rig.Output.NextFrame();
        await DrainStops(rig);
        rig.Advance(500); rig.Put("Input/B", .8f); rig.Advance(31);
        var stop = rig.Output.NextStop();
        rig.Advance(470);
        await stop;
        Assert.True(rig.Runtime.ComputedInputBlocked);
        Assert.False(rig.Runtime.CanSend);
        Assert.True(rig.Runtime.InputActive);
        Assert.False(rig.Runtime.IsEmergency);
        rig.Put("Input/A", .4f); rig.Advance(31);
        Assert.InRange((await rig.Output.NextFrame(frame => frame.L0 > .69f)).L0, .699f, .700f);
    }

    [Fact]
    public async Task DefaultCalculationKeepsUnchangedDeltaOnlyParametersAvailable()
    {
        using var rig = new MotionRig();
        var calculation = Calculation(Scalar("Input/A"), Scalar("Input/B", 3));
        Assert.Equal(0, calculation.MaxAgeMs);
        Configure(rig, calculation);
        rig.Put("Input/A", .2f); rig.Put("Input/B", .8f);
        rig.Activate();
        await rig.Output.NextFrame();
        var stops = rig.Output.StopCount;
        rig.Advance(5000);
        var result = rig.Runtime.GetComputedSignalResults()["Combined"];
        Assert.True(result.Valid, result.Reason);
        Assert.Equal(.65f, result.Value!.Value, 5);
        Assert.True(rig.Runtime.CanSend);
        Assert.Equal(stops, rig.Output.StopCount);
    }

    [Fact]
    public async Task GlobalInputTimeoutStillAppliesToEveryComputedScalarLeaf()
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Scalar("Input/A"), Scalar("Input/B", 3)));
        rig.Config.Osc.InputTimeoutMs = 600;
        rig.Put("Input/A", .2f); rig.Put("Input/B", .8f);
        rig.Activate();
        await rig.Output.NextFrame();
        await DrainStops(rig);
        rig.Advance(500); rig.Put("Input/B", .8f); rig.Advance(31);
        var stop = rig.Output.NextStop();
        rig.Advance(470);
        await stop;
        Assert.False(rig.Runtime.GetComputedSignalResults()["Combined"].Valid);
        Assert.True(rig.Runtime.ComputedInputBlocked);
        Assert.False(rig.Runtime.CanSend);
    }

    [Fact]
    public async Task HealthyComputedAxisWithDirectGateUsesItsContributingInputsForTimeouts()
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Constant(.4f)));
        rig.Config.Osc.InputTimeoutMs = 600;
        rig.Config.Signals.Add(new() { SourceMode = "Direct", OscPath = "Input/Gate", Role = SignalRole.GateEnable });
        rig.Config.NormalizeForRuntime(); rig.Runtime.RebuildProcessors();
        rig.Put("Input/Gate", 1);
        rig.Activate();
        await rig.Output.NextFrame();
        rig.Advance(500); rig.Put("Input/Gate", 1); rig.Advance(501);
        Assert.True(rig.Runtime.GetComputedSignalResults()["Combined"].Valid);
        Assert.False(rig.Runtime.IsEmergency);
        Assert.True(rig.Runtime.CanSend);
    }

    [Fact]
    public async Task SelectedSourceSuppliesTheCompleteCalculation()
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Scalar("Input/A"), Scalar("Input/B")));
        rig.Put("Input/A", .2f, "one"); rig.Put("Input/B", .8f, "two");
        Assert.False(rig.Runtime.GetComputedSignalResults()["Combined"].Valid);
        rig.Put("Input/B", .4f, "one");
        rig.Put("Input/A", .6f, "two");
        Assert.False(rig.Runtime.GetComputedSignalResults()["Combined"].Valid);
        rig.SelectedSource = "one";
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, .299f, .300f);
    }

    [Fact]
    public async Task SolvedSpsCoordinatesCanCombineMultipleSelectedTargetsBeforeMapping()
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Point(First + "/**"), Point(Second + "/**", weight: 3)));
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        SpatialSamples.FixedRoot(rig.Store, First, new(.2, 1, .2));
        SpatialSamples.FixedRoot(rig.Store, Second, new(.3, 1, .8));
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, .649f, .650f);
        var result = rig.Runtime.GetComputedSignalResults()["Combined"];
        Assert.True(result.Valid, result.Reason);
        Assert.Equal("AvatarRootLocal", result.CoordinateFrame);
    }

    [Fact]
    public async Task ComputedSpatialInputsRetainPermissionAndImmediateInactiveSampleStops()
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Point(First + "/**"), Constant(.4f)));
        SpatialSamples.FixedRoot(rig.Store, First, new(.2, 1, .2));
        rig.Activate();
        await rig.Output.NextStop();
        Assert.False(rig.Runtime.CanSend);
        Assert.Empty(rig.Output.Frames);
        rig.Runtime.SetInputActive(false);
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        rig.Runtime.SetInputActive(true);
        Assert.InRange((await rig.Output.NextFrame()).L0, .299f, .300f);
        await DrainStops(rig, alreadyRead: 1);
        var stop = rig.Output.NextStop();
        rig.Put(First + "/Sample", 0); rig.Advance(31);
        await stop;
        Assert.False(rig.Runtime.CanSend);
        Assert.True(rig.Runtime.ComputedInputBlocked);
    }

    [Fact]
    public async Task LargeCalculationAgeCannotExtendFrozenSpatialSampleActivity()
    {
        using var rig = new MotionRig();
        var calculation = Calculation(Point(First + "/**"));
        calculation.MaxAgeMs = 60000;
        Configure(rig, calculation);
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        SpatialSamples.FixedRoot(rig.Store, First, new(.2, 1, .2));
        rig.Activate();
        await rig.Output.NextFrame();
        await DrainStops(rig);
        var stop = rig.Output.NextStop();
        rig.Advance(1500);
        rig.Put(First + "/Sample", 1 / 32f); rig.Advance(31);
        await stop;
        Assert.False(rig.Runtime.GetComputedSignalResults()["Combined"].Valid);
        Assert.False(rig.Runtime.CanSend);
        rig.Put(First + "/Sample", 2 / 32f); rig.Advance(31);
        Assert.InRange((await rig.Output.NextFrame()).L0, .199f, .200f);
    }

    [Fact]
    public async Task ZeroWeightedSpatialLeafDoesNotRequireGeometryOrSpatialPermission()
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Point(First + "/**", weight: 0), Scalar("Input/A")));
        rig.Put("Input/A", .7f);
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, .699f, .700f);
        Assert.True(rig.Runtime.CanSend);
        Assert.False(rig.Runtime.ComputedInputBlocked);
    }

    [Fact]
    public async Task UnmappedInvalidCalculationsDoNotBlockAnOtherwiseValidMapping()
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Scalar("Input/A")));
        rig.Config.ComputedSignals.Add(new() { Id = "Unused", Inputs = [Point(First + "/**")] });
        rig.Config.NormalizeForRuntime(); rig.Runtime.RebuildProcessors();
        rig.Put("Input/A", .4f);
        Assert.False(rig.Runtime.GetComputedSignalResults()["Unused"].Valid);
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, .399f, .400f);
        Assert.True(rig.Runtime.CanSend);
    }

    [Theory]
    [InlineData("SensaPoint", SignalRole.Depth)]
    [InlineData("SensaPoint", SignalRole.DepthOverride)]
    [InlineData("SensaPose", SignalRole.Depth)]
    [InlineData("SensaPose", SignalRole.DepthOverride)]
    public async Task OrdinarySpatialAxisKeepsPriorityOverAnInvalidComputedInput(string mode, SignalRole role)
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Scalar("Missing/Input")));
        rig.Config.Signals[0].Role = role;
        var expected = AddOrdinarySpatialAxis(rig, mode);
        Assert.False(rig.Runtime.GetComputedSignalResults()["Combined"].Valid);
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, expected - .001f, expected + .001f);
        Assert.False(rig.Runtime.ComputedInputBlocked);
        Assert.True(rig.Runtime.CanSend);
    }

    [Theory]
    [InlineData("SensaPoint", SignalRole.Depth)]
    [InlineData("SensaPoint", SignalRole.DepthOverride)]
    [InlineData("SensaPose", SignalRole.Depth)]
    [InlineData("SensaPose", SignalRole.DepthOverride)]
    public async Task OrdinarySpatialAxisKeepsPriorityOverAHigherComputedValue(string mode, SignalRole role)
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Constant(.9f)));
        rig.Config.Signals[0].Role = role;
        var expected = AddOrdinarySpatialAxis(rig, mode);
        Assert.Equal(.9f, rig.Runtime.GetComputedSignalResults()["Combined"].Value);
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, expected - .001f, expected + .001f);
        Assert.False(rig.Runtime.ComputedInputBlocked);
        Assert.True(rig.Runtime.CanSend);
    }

    [Fact]
    public async Task ComputedGateStillControlsAnOrdinarySpatialAxis()
    {
        using var rig = new MotionRig();
        Configure(rig, Calculation(Scalar("Input/Gate")));
        rig.Config.Signals[0].Role = SignalRole.GateEnable;
        var expected = AddOrdinarySpatialAxis(rig, "SensaPoint");
        rig.Put("Input/Gate", 1);
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, expected - .001f, expected + .001f);
        await DrainStops(rig);
        var stop = rig.Output.NextStop();
        rig.Put("Input/Gate", 0); rig.Advance(31);
        await stop;
        Assert.True(rig.Runtime.IsGateClosed);
        Assert.False(rig.Runtime.ComputedInputBlocked);
        Assert.False(rig.Runtime.CanSend);
        rig.Put("Input/Gate", 1); rig.Advance(31);
        Assert.InRange((await rig.Output.NextFrame()).L0, expected - .001f, expected + .001f);
        Assert.True(rig.Runtime.CanSend);
    }

    private static float AddOrdinarySpatialAxis(MotionRig rig, string mode)
    {
        rig.Config.Signals.Add(new() { SourceMode = mode, Role = SignalRole.Depth,
            OscPath = mode == "SensaPoint" ? First + "/**" : "Sensa/Pose/v1/Main/Others/**",
            PointMetric = PointMetric.Z, PoseMetric = PoseMetric.Depth });
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        rig.Config.NormalizeForRuntime(); rig.Runtime.RebuildProcessors();
        if (mode == "SensaPoint")
        {
            SpatialSamples.FixedRoot(rig.Store, First, new(.2, 1, .2));
            return .2f;
        }
        SpatialSamples.Pose(rig.Store, new(.02, 0, -.1), new(.02, 0, .1), new(.05, 0, -.1));
        return .5f;
    }

    private static void PutContact(MotionRig rig)
    {
        const string prefix = "Sensa/Contact/Root/";
        rig.Put(prefix + SensaContactProtocol.ProximityLeaf, .5f);
        rig.Put(prefix + SensaContactProtocol.SenderTypeLeaf, 1);
        foreach (var leaf in SensaContactProtocol.PositionLeaves) rig.Put(prefix + leaf, .1f);
        foreach (var leaf in SensaContactProtocol.VelocityLeaves) rig.Put(prefix + leaf, .2f);
        rig.Put(prefix + SensaContactProtocol.SpeedLeaf, .35f);
        rig.Put(prefix + SensaContactProtocol.ProximitySpeedLeaf, .8f);
        rig.Put(prefix + SensaContactProtocol.SampleLeaf, 1 / 32f);
        rig.Put(prefix + SensaContactProtocol.RadiusLeaf, 2);
    }
}
