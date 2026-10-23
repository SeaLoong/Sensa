using System.Text.Json;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class ComputedGeometryContracts
{
    private static ComputedSignalInputConfig Constant(float value) => new() { SourceMode = "Constant", Value = value };
    private static ComputedSignalInputConfig Direct(int index) => new() { OscPath = "v" + index };
    private static ComputedSignalConfig Definition(ComputedSignalOperation operation, IEnumerable<ComputedSignalInputConfig> inputs) =>
        new() { Id = "geometry", Operation = operation, Inputs = inputs.ToList(), MaxAgeMs = 1000 };
    private static ComputedSignalSample Evaluate(ComputedSignalOperation operation, params float[] values) =>
        new ComputedSignalEvaluator([Definition(operation, values.Select(Constant))])
            .Evaluate(5000, _ => throw new InvalidOperationException())["geometry"];
    private static ComputedSignalSample EvaluateSamples(ComputedSignalOperation operation, float[] values,
        Func<int, string?> frame, Func<int, string?>? source = null, Func<int, long>? time = null) =>
        new ComputedSignalEvaluator([Definition(operation, Enumerable.Range(0, values.Length).Select(Direct))])
            .Evaluate(5000, input =>
            {
                var index = int.Parse(input.OscPath.AsSpan(1));
                return ComputedSignalSample.Success(values[index], source?.Invoke(index) ?? "avatar",
                    time?.Invoke(index) ?? 4900, frame(index), "sample:" + index);
            })["geometry"];
    private static void Near(ComputedSignalSample sample, double expected, double tolerance = 1e-6)
    {
        Assert.True(sample.Valid, sample.Reason);
        Assert.InRange(Math.Abs(sample.Value!.Value - expected), 0, tolerance);
    }

    [Fact]
    public void PointDistanceDepthAndOffsetMeasureTheSpecifiedPointAndPlane()
    {
        Near(Evaluate(ComputedSignalOperation.PointDistance, .03f, .04f, .12f, 0, 0, 0), .13);
        Near(Evaluate(ComputedSignalOperation.PlaneDepth, .03f, .04f, .12f, 0, 0, 0, 0, 0, 8), .12);
        Near(Evaluate(ComputedSignalOperation.PlaneOffset, .03f, .04f, .12f, 0, 0, 0, 0, 0, 8), .05);
        Near(Evaluate(ComputedSignalOperation.PlaneDepth, .03f, .04f, .12f, 0, 0, 0, 0, 0, -8), -.12);
        Near(Evaluate(ComputedSignalOperation.PlaneOffset, .03f, .04f, .12f, 0, 0, 0, 0, 0, -8), .05);
        Near(Evaluate(ComputedSignalOperation.PointDistance, 1, 2, 3, 1, 2, 3), 0);
        Near(Evaluate(ComputedSignalOperation.PlaneDepth, 0, 0, -2, 0, 0, 0, 0, 0, 1), -2);
    }

    [Fact]
    public void RotatedTranslatedPlanesDoNotAssumeWorldZOrAnUprightAvatar()
    {
        var origin = new PosePoint(1, 2, 3);
        var normal = new PosePoint(2, -3, 6) * (1d / 7);
        var tangent = new PosePoint(3, 2, 0) * (1 / Math.Sqrt(13));
        var point = origin + normal * .12 + tangent * .05;
        var input = new[] { (float)point.X, (float)point.Y, (float)point.Z,
            (float)origin.X, (float)origin.Y, (float)origin.Z,
            (float)normal.X, (float)normal.Y, (float)normal.Z };
        Near(Evaluate(ComputedSignalOperation.PlaneDepth, input), .12);
        Near(Evaluate(ComputedSignalOperation.PlaneOffset, input), .05);
        Near(Evaluate(ComputedSignalOperation.PointDistance, input.Take(6).ToArray()), .13);
    }

    [Fact]
    public void TwoMeasuredTangentsDefineTheActualShearedPlaneAndTheirOrderDefinesItsPositiveSide()
    {
        // U is a sheared X tangent and V a scaled Z tangent. U×V points along -Y;
        // V itself is not that plane's normal.
        var input = new float[] { .3f, .2f, .4f, 0, 0, 0, 2, 0, 1, 0, 0, 3 };
        Near(Evaluate(ComputedSignalOperation.PlaneDepthFromAxes, input), -.2);
        Near(Evaluate(ComputedSignalOperation.PlaneOffsetFromAxes, input), .5);
        var reversed = input.Take(6).Concat(input.Skip(9)).Concat(input.Skip(6).Take(3)).ToArray();
        Near(Evaluate(ComputedSignalOperation.PlaneDepthFromAxes, reversed), .2);
        Near(Evaluate(ComputedSignalOperation.PlaneOffsetFromAxes, reversed), .5);
        Near(Evaluate(ComputedSignalOperation.PlaneDepth, input.Take(6).Concat(input.Skip(9)).ToArray()), .4);
    }

    [Theory]
    [InlineData(ComputedSignalOperation.VectorAngle, 1, 0, 0, 0, 0, 1, 90)]
    [InlineData(ComputedSignalOperation.VectorAngle, 1, 0, 0, 1, 0, 0, 0)]
    [InlineData(ComputedSignalOperation.VectorAngle, 1, 0, 0, -1, 0, 0, 180)]
    [InlineData(ComputedSignalOperation.PlaneAngle, 1, 0, 0, 0, 0, 1, 0)]
    [InlineData(ComputedSignalOperation.PlaneAngle, 0, 0, 1, 0, 0, 1, 90)]
    [InlineData(ComputedSignalOperation.PlaneAngle, 0, 0, -1, 0, 0, 1, -90)]
    [InlineData(ComputedSignalOperation.PlaneAngle, 1, 0, 1, 0, 0, 1, 45)]
    public void AnglesUseDegreesAndPlaneAnglesRetainTheirSign(ComputedSignalOperation operation,
        float ax, float ay, float az, float bx, float by, float bz, double expected)
    {
        var result = Evaluate(operation, ax, ay, az, bx, by, bz);
        Near(result, expected);
        Assert.Equal("Angle", result.CoordinateFrame);
    }

    [Fact]
    public void DoubleIntermediatesPreserveSmallOffsetsAndHandleLargeOrTinyNonzeroVectors()
    {
        Near(Evaluate(ComputedSignalOperation.VectorAngle, float.MaxValue, 0, 0, 0, float.MaxValue, 0), 90);
        Near(Evaluate(ComputedSignalOperation.VectorAngle, float.Epsilon, 0, 0, 0, float.Epsilon, 0), 90);
        Near(Evaluate(ComputedSignalOperation.PlaneDepth, 0, 0, .2f, 0, 0, 0, 0, 0, float.Epsilon), .2);
        var offset = Evaluate(ComputedSignalOperation.PlaneOffset, 3e30f, 4e30f, 1e38f, 0, 0, 0, 0, 0, 1);
        Assert.True(offset.Valid, offset.Reason);
        Assert.InRange(offset.Value!.Value / 5e30f, .99999f, 1.00001f);
        Near(Evaluate(ComputedSignalOperation.PlaneDepthFromAxes,
            0, 0, .2f, 0, 0, 0, float.MaxValue, 0, 0, 0, float.Epsilon, 0), .2);
        Assert.False(Evaluate(ComputedSignalOperation.PointDistance, float.MaxValue, 0, 0, -float.MaxValue, 0, 0).Valid);
        var tinyAngle = Evaluate(ComputedSignalOperation.VectorAngle, 1, 0, 0, 1, 1e-8f, 0);
        Assert.True(tinyAngle.Valid);
        Assert.InRange(tinyAngle.Value!.Value, 5e-7f, 6e-7f);
    }

    [Theory]
    [InlineData(ComputedSignalOperation.VectorAngle)]
    [InlineData(ComputedSignalOperation.PlaneAngle)]
    public void AZeroAngleVectorIsInvalidInsteadOfMeaningZeroDegrees(ComputedSignalOperation operation)
    {
        var invalid = Evaluate(operation, 0, 0, 0, 0, 0, 1);
        Assert.False(invalid.Valid);
        Assert.Null(invalid.Value);
    }

    [Theory]
    [InlineData(ComputedSignalOperation.PlaneDepth)]
    [InlineData(ComputedSignalOperation.PlaneOffset)]
    public void ZeroNormalsInvalidatePlanes(ComputedSignalOperation operation) =>
        Assert.False(Evaluate(operation, 1, 2, 3, 0, 0, 0, 0, 0, 0).Valid);

    [Theory]
    [InlineData(1f)]
    [InlineData(1e-30f)]
    [InlineData(1e30f)]
    public void NearlyCollinearPlaneAxesAreRejectedIndependentOfTheirLength(float scale)
    {
        var input = new float[] { 1, 2, 3, 0, 0, 0, scale, 0, 0, scale, scale * 1e-5f, 0 };
        Assert.False(Evaluate(ComputedSignalOperation.PlaneDepthFromAxes, input).Valid);
        Assert.False(Evaluate(ComputedSignalOperation.PlaneOffsetFromAxes, input).Valid);
        input[10] = scale * .001f;
        Near(Evaluate(ComputedSignalOperation.PlaneDepthFromAxes, input), 3);
    }

    [Fact]
    public void PositionsKeepTheirUnitsAndBasisDirectionsCanCrossOnlyKnownAvatarRootUnitConversions()
    {
        var input = new float[] { .03f, .04f, .12f, 0, 0, 0, 0, 0, 3 };
        var sample = EvaluateSamples(ComputedSignalOperation.PlaneDepth, input,
            index => index < 6 ? "AvatarRootMeters" : "AvatarRootLocal:Basis");
        Near(sample, .12);
        Assert.Equal("AvatarRootMeters", sample.CoordinateFrame);
        Assert.Equal("avatar", sample.SourceKey);
        Assert.Equal(4900, sample.TimestampMs);
        Assert.False(EvaluateSamples(ComputedSignalOperation.PlaneDepth, input,
            index => index < 3 ? "AvatarRootMeters" : "AvatarRootLocal").Valid);
        Assert.False(EvaluateSamples(ComputedSignalOperation.PlaneDepth, input,
            index => index < 6 ? "ReferenceLocal:one" : "ReferenceLocal:two:Basis").Valid);
        Near(EvaluateSamples(ComputedSignalOperation.PlaneDepth, input,
            index => "ReferenceLocal:one"), .12);
        Near(EvaluateSamples(ComputedSignalOperation.PlaneDepth, input,
            index => index < 6 ? "ReferenceLocal:one" : "ReferenceLocal:one:Basis"), .12);
    }

    [Fact]
    public void XYZGroupsCannotSilentlyMixCoordinateUnitsOrPositionAndVelocityComponents()
    {
        Assert.False(EvaluateSamples(ComputedSignalOperation.PointDistance, [1, 2, 3, 0, 0, 0],
            index => index == 1 ? "AvatarRootMeters" : "AvatarRootLocal").Valid);
        Assert.False(EvaluateSamples(ComputedSignalOperation.PointDistance, [1, 2, 3, 0, 0, 0],
            index => index < 3 ? "AvatarRootMeters:Velocity" : "AvatarRootMeters").Valid);
        Assert.False(EvaluateSamples(ComputedSignalOperation.VectorAngle, [1, 0, 0, 0, 0, 1],
            index => index == 1 ? "AvatarRootLocal" : "AvatarRootLocal:Basis").Valid);
        var angle = EvaluateSamples(ComputedSignalOperation.VectorAngle, [1, 0, 0, 0, 0, 1],
            index => index < 3 ? "AvatarRootMeters:Velocity" : "AvatarRootMeters:Basis");
        Near(angle, 90);
        Assert.Equal("AvatarRootMeters:Angle", angle.CoordinateFrame);
    }

    [Fact]
    public void GeometryRetainsOldestAgeAndNeverReusesAResultAfterInvalidity()
    {
        var definition = Definition(ComputedSignalOperation.PointDistance, Enumerable.Range(0, 6).Select(Direct));
        var evaluator = new ComputedSignalEvaluator([definition]);
        ComputedSignalSample Resolve(ComputedSignalInputConfig input, long timestamp, bool valid = true) => valid
            ? ComputedSignalSample.Success(input.OscPath == "v0" ? 1 : 0, "avatar", timestamp, "AvatarRootLocal")
            : ComputedSignalSample.Invalid("tracking expired");
        var first = evaluator.Evaluate(5000, input => Resolve(input, input.OscPath == "v1" ? 4100 : 4900))["geometry"];
        Near(first, 1);
        Assert.Equal(4100, first.TimestampMs);
        var expired = evaluator.Evaluate(5200, input => Resolve(input, 4100))["geometry"];
        Assert.False(expired.Valid);
        Assert.Null(expired.Value);
        Assert.False(evaluator.Evaluate(5200, input => Resolve(input, 5150, input.OscPath != "v0"))["geometry"].Valid);
        Near(evaluator.Evaluate(5300, input => Resolve(input, 5250))["geometry"], 1);
        Assert.False(evaluator.Evaluate(5300, input => Resolve(input, 5301))["geometry"].Valid);
        Assert.False(EvaluateSamples(ComputedSignalOperation.PointDistance, [1, 0, 0, 0, 0, 0],
            _ => "AvatarRootLocal", index => index < 3 ? "one" : "two").Valid);
    }

    [Fact]
    public void ComputedDifferencesCanSupplyPlaneNormalsAndAngularOutputsCannotBecomePositions()
    {
        var normal = new ComputedSignalConfig { Id = "normalZ", Operation = ComputedSignalOperation.Difference,
            Inputs = [Constant(4), Constant(1)] };
        var depth = Definition(ComputedSignalOperation.PlaneDepth,
            new float[] { .03f, .04f, .12f, 0, 0, 0, 0, 0 }.Select(Constant)
                .Append(new() { SourceMode = "Computed", OscPath = "normalZ" }));
        var evaluator = new ComputedSignalEvaluator([depth, normal]);
        Near(evaluator.Evaluate(5000, _ => throw new InvalidOperationException())["geometry"], .12);
        var angle = Definition(ComputedSignalOperation.VectorAngle, new float[] { 1, 0, 0, 0, 0, 1 }.Select(Constant));
        angle.Id = "angle";
        var distance = Definition(ComputedSignalOperation.PointDistance,
            new[] { new ComputedSignalInputConfig { SourceMode = "Computed", OscPath = "angle" } }.Concat(new float[] { 0, 0, 0, 0, 0 }.Select(Constant)));
        var values = new ComputedSignalEvaluator([angle, distance]).Evaluate(5000, _ => throw new InvalidOperationException());
        Near(values["angle"], 90);
        Assert.False(values["geometry"].Valid);
    }

    [Theory]
    [InlineData(ComputedSignalOperation.PointDistance, 6)]
    [InlineData(ComputedSignalOperation.PlaneDepth, 9)]
    [InlineData(ComputedSignalOperation.PlaneOffset, 9)]
    [InlineData(ComputedSignalOperation.VectorAngle, 6)]
    [InlineData(ComputedSignalOperation.PlaneAngle, 6)]
    [InlineData(ComputedSignalOperation.PlaneDepthFromAxes, 12)]
    [InlineData(ComputedSignalOperation.PlaneOffsetFromAxes, 12)]
    public void GeometryRequiresCompleteXYZGroupsAndDoesNotBecomeATimeGenerator(ComputedSignalOperation operation, int count)
    {
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([Definition(operation, Enumerable.Repeat(Constant(0), count - 1))]));
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([Definition(operation, Enumerable.Repeat(Constant(0), count + 1))]));
        Assert.False(ComputedSignalEvaluator.IsTemporal(operation));
        var definition = Definition(operation, Enumerable.Range(0, count).Select(index => Constant(index)));
        var config = new AppConfig { ComputedSignals = [definition] };
        var copy = JsonSerializer.Deserialize<AppConfig>(JsonSerializer.Serialize(config))!;
        Assert.Equal(operation, Assert.Single(copy.ComputedSignals).Operation);
        Assert.Equal(count, Assert.Single(copy.ComputedSignals).Inputs.Count);
        Assert.Equal(21, (int)ComputedSignalOperation.Envelope);
    }

    [Fact]
    public void ActualTrackingResolverFeedsGeometryAndRejectsDisabledOrExpiredTracking()
    {
        using var rig = new MotionRig();
        const string target = "Sensa/SPS/Target", origin = "Sensa/SPS/Origin";
        var definition = Definition(ComputedSignalOperation.PlaneDepth,
            new[] { target, origin }.SelectMany(prefix => new[] { PointMetric.X, PointMetric.Y, PointMetric.Z }
                .Select(metric => new ComputedSignalInputConfig { SourceMode = "SensaPoint", OscPath = prefix + "/**", PointMetric = metric }))
                .Concat(new float[] { 0, 0, 1 }.Select(Constant)));
        SpatialSamples.FixedRoot(rig.Store, target, new(.03, 1.04, .12));
        SpatialSamples.FixedRoot(rig.Store, origin, new(0, 1, 0));
        var now = rig.Clock.GetUtcNow().ToUnixTimeMilliseconds();
        var evaluator = new ComputedSignalEvaluator([definition]);
        var resolver = new ComputedSignalResolver(rig.Store.SnapshotEntries(), "test", now, 1000, true);
        var sample = evaluator.Evaluate(now, resolver.Resolve)["geometry"];
        Near(sample, .12, 1e-5);
        Assert.Equal("AvatarRootLocal", sample.CoordinateFrame);
        var forbidden = new ComputedSignalResolver(rig.Store.SnapshotEntries(), "test", now, 1000, false);
        Assert.False(evaluator.Evaluate(now, forbidden.Resolve)["geometry"].Valid);
        rig.Advance(1001);
        var old = new ComputedSignalResolver(rig.Store.SnapshotEntries(), "test", now + 1001, 1000, true);
        Assert.False(evaluator.Evaluate(now + 1001, old.Resolve)["geometry"].Valid);
    }

    [Fact]
    public async Task AnUndefinedPlaneStopsTheRealComputedMappingWithoutReusingItsPreviousDepth()
    {
        using var rig = new MotionRig();
        const string target = "Sensa/SPS/Target";
        var definition = Definition(ComputedSignalOperation.PlaneDepth,
            new[] { PointMetric.X, PointMetric.Y, PointMetric.Z }
                .Select(metric => new ComputedSignalInputConfig { SourceMode = "SensaPoint", OscPath = target + "/**", PointMetric = metric })
                .Concat(new float[] { 0, 1, 0, 0, 0 }.Select(Constant))
                .Append(new() { SourceMode = "Direct", OscPath = "Plane/NormalZ" }));
        rig.Config.ComputedSignals = [definition];
        rig.Config.Signals = [new() { SourceMode = "Computed", OscPath = definition.Id,
            Role = SignalRole.Depth, VrchatMin = -.2f, VrchatMax = .2f }];
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        rig.Config.NormalizeForRuntime();
        rig.Runtime.RebuildProcessors();
        SpatialSamples.FixedRoot(rig.Store, target, new(.03, 1.04, .12));
        rig.Put("Plane/NormalZ", 1);
        rig.Activate();
        var command = await rig.Output.NextFrame();
        Assert.InRange(command.L0, .7990f, .7994f);
        var initialStops = rig.Output.StopCount;
        for (var index = 0; index < initialStops; index++) await rig.Output.NextStop();
        var stopped = rig.Output.NextStop();
        rig.Put("Plane/NormalZ", 0);
        rig.Advance(31);
        await stopped;
        Assert.True(rig.Runtime.ComputedInputBlocked);
        Assert.False(rig.Runtime.CanSend);
        var invalid = rig.Runtime.GetComputedSignalResults()[definition.Id];
        Assert.False(invalid.Valid);
        Assert.Null(invalid.Value);
    }

}
