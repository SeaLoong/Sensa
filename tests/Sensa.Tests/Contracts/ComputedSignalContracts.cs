using Sensa.Configuration;
using Sensa.Signals;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class ComputedSignalContracts
{
    private static ComputedSignalInputConfig Constant(float value, float weight = 1) =>
        new() { SourceMode = "Constant", Value = value, Weight = weight };
    private static ComputedSignalInputConfig Direct(string path, float weight = 1) =>
        new() { OscPath = path, Weight = weight };
    private static ComputedSignalInputConfig Reference(string id, float weight = 1) =>
        new() { SourceMode = "Computed", OscPath = id, Weight = weight };
    private static ComputedSignalConfig Calculation(string id, ComputedSignalOperation operation,
        params ComputedSignalInputConfig[] inputs) => new() { Id = id, Operation = operation, Inputs = inputs.ToList(), MaxAgeMs = 1000 };

    [Theory]
    [InlineData(ComputedSignalOperation.Average, 4)]
    [InlineData(ComputedSignalOperation.Sum, 8)]
    [InlineData(ComputedSignalOperation.Difference, -4)]
    [InlineData(ComputedSignalOperation.Product, 12)]
    [InlineData(ComputedSignalOperation.Ratio, 1f / 3)]
    [InlineData(ComputedSignalOperation.Minimum, 2)]
    [InlineData(ComputedSignalOperation.Maximum, 6)]
    [InlineData(ComputedSignalOperation.Magnitude, 6.32455532f)]
    public void ArithmeticPreservesTheRawResultForDownstreamCalibration(ComputedSignalOperation operation, float expected)
    {
        var evaluator = new ComputedSignalEvaluator([Calculation("result", operation, Constant(2), Constant(6))]);
        var sample = evaluator.Evaluate(5000, _ => throw new InvalidOperationException())["result"];
        Assert.True(sample.Valid, sample.Reason);
        Assert.Equal(expected, sample.Value!.Value, 5);
        Assert.Null(sample.SourceKey);
        Assert.Equal(5000, sample.TimestampMs);
        var channel = new SignalChannelProcessor(new() { SourceMode = "Computed", OscPath = "result", VrchatMin = -10, VrchatMax = 20 });
        Assert.InRange(channel.Process(sample.Value.Value), 0, 1);
    }

    [Fact]
    public void WeightedAverageUsesPositiveWeightsAndSkipsZeroWeightDependencies()
    {
        var evaluator = new ComputedSignalEvaluator([Calculation("blend", ComputedSignalOperation.WeightedAverage,
            Direct("a", 1), Direct("b", 3), Direct("unused", 0))]);
        var required = evaluator.GetRequiredInputs(["blend"]);
        Assert.Equal(["a", "b"], required.Select(input => input.OscPath));
        var reads = new List<string>();
        var sample = evaluator.Evaluate(5000, input =>
        {
            reads.Add(input.OscPath);
            return ComputedSignalSample.Success(input.OscPath == "a" ? -2 : 10, "avatar", 4800);
        })["blend"];
        Assert.Equal(["a", "b"], reads);
        Assert.True(sample.Valid, sample.Reason);
        Assert.Equal(7, sample.Value);
        Assert.Equal("avatar", sample.SourceKey);
        Assert.Equal(4800, sample.TimestampMs);
    }

    [Fact]
    public void NestedCalculationsCompileOutOfOrderAndShareLeafReads()
    {
        var evaluator = new ComputedSignalEvaluator([
            Calculation("combined", ComputedSignalOperation.Sum, Reference("average"), Direct("a")),
            Calculation("average", ComputedSignalOperation.Average, Direct("a"), Direct("b")),
            Calculation("unused", ComputedSignalOperation.Sum, Direct("c")),
        ]);
        Assert.Equal(["a", "b"], evaluator.GetRequiredInputs(["combined"]).Select(input => input.OscPath));
        Assert.Empty(evaluator.GetRequiredInputs([]));
        var reads = new Dictionary<string, int>();
        var results = evaluator.Evaluate(5000, input =>
        {
            reads[input.OscPath] = reads.GetValueOrDefault(input.OscPath) + 1;
            return ComputedSignalSample.Success(input.OscPath == "a" ? 2 : 6, "avatar", input.OscPath == "a" ? 4900 : 4500);
        });
        Assert.Equal(6, results["combined"].Value);
        Assert.Equal(4500, results["combined"].TimestampMs);
        Assert.All(reads.Values, count => Assert.Equal(1, count));
    }

    [Fact]
    public void LeafReadCacheKeepsDifferentSpatialMetricsSeparate()
    {
        var evaluator = new ComputedSignalEvaluator([Calculation("length", ComputedSignalOperation.Magnitude,
            new() { SourceMode = "SensaPoint", OscPath = "Sensa/SPS/Root/**", PointMetric = PointMetric.X },
            new() { SourceMode = "SensaPoint", OscPath = "Sensa/SPS/Root/**", PointMetric = PointMetric.Y })]);
        var calls = 0;
        var sample = evaluator.Evaluate(5000, input =>
        {
            calls++;
            return ComputedSignalSample.Success(input.PointMetric == PointMetric.X ? 3 : 4, "avatar", 4900, "AvatarRootLocal");
        })["length"];
        Assert.Equal(2, calls);
        Assert.Equal(5, sample.Value);
        Assert.Equal("AvatarRootLocal", sample.CoordinateFrame);
    }

    [Fact]
    public void ConstantCalculationsRemainFreshAndDoNotIntroduceASourceOrFrame()
    {
        var evaluator = new ComputedSignalEvaluator([
            Calculation("offset", ComputedSignalOperation.Product, Constant(2), Constant(3)),
            Calculation("result", ComputedSignalOperation.Sum, Reference("offset"), Direct("point")),
        ]);
        foreach (var now in new long[] { 5000, 100000 })
        {
            var results = evaluator.Evaluate(now, _ => ComputedSignalSample.Success(4, "avatar", now - 20, "AvatarRootMeters"));
            Assert.Equal(now, results["offset"].TimestampMs);
            Assert.Equal(10, results["result"].Value);
            Assert.Equal("avatar", results["result"].SourceKey);
            Assert.Equal("AvatarRootMeters", results["result"].CoordinateFrame);
            Assert.Equal(now - 20, results["result"].TimestampMs);
        }
    }

    [Fact]
    public void MissingOrInvalidInputsInvalidateEveryDependentCalculationWithoutReusingLastValue()
    {
        var evaluator = new ComputedSignalEvaluator([
            Calculation("a", ComputedSignalOperation.Sum, Direct("value")),
            Calculation("b", ComputedSignalOperation.Sum, Reference("a"), Constant(1)),
        ]);
        Assert.Equal(3, evaluator.Evaluate(5000, _ => ComputedSignalSample.Success(2, "avatar", 5000))["b"].Value);
        var invalid = evaluator.Evaluate(5100, _ => ComputedSignalSample.Invalid("waiting for sample"));
        Assert.All(invalid.Values, sample => { Assert.False(sample.Valid); Assert.Null(sample.Value); Assert.Equal("waiting for sample", sample.Reason); });
    }

    [Theory]
    [InlineData(3999, false)]
    [InlineData(4000, true)]
    [InlineData(5000, true)]
    [InlineData(5001, false)]
    public void EveryContributingInputMustMeetTheCalculationAgeLimit(long timestamp, bool valid)
    {
        var evaluator = new ComputedSignalEvaluator([Calculation("sum", ComputedSignalOperation.Sum, Direct("a"), Direct("b"))]);
        var sample = evaluator.Evaluate(5000, input => ComputedSignalSample.Success(1, "avatar", input.OscPath == "a" ? timestamp : 5000))["sum"];
        Assert.Equal(valid, sample.Valid);
        if (valid) Assert.Equal(timestamp, sample.TimestampMs);
        else Assert.Null(sample.Value);
    }

    [Fact]
    public void DefaultAgeFollowsTheSourceAndRetainsStationaryDeltaOnlyValues()
    {
        var definition = new ComputedSignalConfig
        {
            Id = "blend", Inputs = [Direct("a"), Direct("b", 3)],
        };
        Assert.Equal(0, definition.MaxAgeMs);
        var evaluator = new ComputedSignalEvaluator([definition]);
        var result = evaluator.Evaluate(100000,
            input => ComputedSignalSample.Success(input.OscPath == "a" ? .2f : .8f, "avatar", 5000))["blend"];
        Assert.True(result.Valid, result.Reason);
        Assert.Equal(.65f, result.Value!.Value, 5);
        Assert.Equal(5000, result.TimestampMs);
        Assert.False(evaluator.Evaluate(100000,
            _ => ComputedSignalSample.Success(1, "avatar", 100001))["blend"].Valid);
    }

    [Fact]
    public void AnOuterCalculationCannotRefreshAnOlderDependency()
    {
        var inner = Calculation("inner", ComputedSignalOperation.Sum, Direct("a"));
        inner.MaxAgeMs = 2000;
        var outer = Calculation("outer", ComputedSignalOperation.Sum, Reference("inner"), Constant(1));
        var results = new ComputedSignalEvaluator([inner, outer]).Evaluate(5000,
            _ => ComputedSignalSample.Success(1, "avatar", 3500));
        Assert.True(results["inner"].Valid);
        Assert.False(results["outer"].Valid);
    }

    [Fact]
    public void MultipleOscSourcesAndKnownCoordinateFramesRemainSeparate()
    {
        var evaluator = new ComputedSignalEvaluator([Calculation("sum", ComputedSignalOperation.Sum, Direct("a"), Direct("b"))]);
        Assert.False(evaluator.Evaluate(5000, input => ComputedSignalSample.Success(1, input.OscPath, 5000))["sum"].Valid);
        Assert.False(evaluator.Evaluate(5000, input => ComputedSignalSample.Success(1, "same", 5000,
            input.OscPath == "a" ? "AvatarRootLocal" : "AvatarRootMeters"))["sum"].Valid);
        Assert.True(evaluator.Evaluate(5000, input => ComputedSignalSample.Success(1, "same", 5000,
            input.OscPath == "a" ? "AvatarRootLocal" : null))["sum"].Valid);
    }

    [Fact]
    public void ZeroDenominatorsNonFiniteInputsAndOverflowProduceAnInvalidResult()
    {
        var ratio = new ComputedSignalEvaluator([Calculation("ratio", ComputedSignalOperation.Ratio, Constant(1), Constant(0))]);
        Assert.False(ratio.Evaluate(5000, _ => throw new InvalidOperationException())["ratio"].Valid);
        var sum = new ComputedSignalEvaluator([Calculation("sum", ComputedSignalOperation.Sum, Direct("a"))]);
        foreach (var value in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
            Assert.False(sum.Evaluate(5000, _ => ComputedSignalSample.Success(value, "same", 5000))["sum"].Valid);
        var product = new ComputedSignalEvaluator([Calculation("product", ComputedSignalOperation.Product,
            Constant(float.MaxValue), Constant(float.MaxValue))]);
        Assert.False(product.Evaluate(5000, _ => throw new InvalidOperationException())["product"].Valid);
    }

    [Fact]
    public void LargeFiniteWeightsUseDoublePrecisionDuringAveraging()
    {
        var evaluator = new ComputedSignalEvaluator([Calculation("average", ComputedSignalOperation.WeightedAverage,
            Constant(float.MaxValue, float.MaxValue), Constant(float.MaxValue, float.MaxValue))]);
        var sample = evaluator.Evaluate(5000, _ => throw new InvalidOperationException())["average"];
        Assert.True(sample.Valid, sample.Reason);
        Assert.Equal(float.MaxValue, sample.Value);
    }

    [Fact]
    public void GraphValidationRejectsMissingReferencesCyclesDuplicateIdsAndExcessiveDepth()
    {
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([
            Calculation("a", ComputedSignalOperation.Sum, Reference("missing"))]));
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([
            Calculation("a", ComputedSignalOperation.Sum, Reference("b")), Calculation("b", ComputedSignalOperation.Sum, Reference("a"))]));
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([
            Calculation("same", ComputedSignalOperation.Sum, Constant(1)), Calculation("same", ComputedSignalOperation.Sum, Constant(2))]));
        var chain = Enumerable.Range(0, 17).Select(index => Calculation($"n{index}", ComputedSignalOperation.Sum,
            index == 0 ? Constant(1) : Reference($"n{index - 1}"))).ToArray();
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator(chain));
        Assert.Equal(16, new ComputedSignalEvaluator(chain.Take(16)).Evaluate(5000, _ => throw new InvalidOperationException()).Count);
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([
            Calculation("a", ComputedSignalOperation.WeightedAverage, Reference("missing", 0), Constant(1))]));
    }

    [Theory]
    [InlineData("")]
    [InlineData("1bad")]
    [InlineData("bad.id")]
    [InlineData("位置")]
    public void CalculationIdsHaveAStablePortableFormat(string id)
    {
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([Calculation(id, ComputedSignalOperation.Sum, Constant(1))]));
    }

    [Fact]
    public void ConfigurationValidationBoundsWorkAndRejectsInvalidOperationsAndInputs()
    {
        var tooMany = Enumerable.Range(0, 65).Select(index => Calculation($"n{index}", ComputedSignalOperation.Sum, Constant(1)));
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator(tooMany));
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([Calculation("a", ComputedSignalOperation.Sum)]));
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([Calculation("a", ComputedSignalOperation.Sum,
            Enumerable.Range(0, 17).Select(_ => Constant(1)).ToArray())]));
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([Calculation("a", ComputedSignalOperation.Difference, Constant(1))]));
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([Calculation("a", ComputedSignalOperation.Ratio, Constant(1), Constant(2), Constant(3))]));
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([Calculation("a", (ComputedSignalOperation)999, Constant(1))]));
        foreach (var input in new[] { Constant(float.NaN), Constant(1, -1), Constant(1, float.PositiveInfinity),
            new ComputedSignalInputConfig { SourceMode = "Unknown", OscPath = "a" }, Direct(""),
            new ComputedSignalInputConfig { SourceMode = "SensaPoint", OscPath = "a", PointMetric = (PointMetric)999 } })
            Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([Calculation("a", ComputedSignalOperation.Sum, input)]));
        Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([Calculation("a", ComputedSignalOperation.WeightedAverage, Constant(1, 0))]));
        foreach (var age in new[] { -1, 99, 60001 })
        {
            var definition = Calculation("a", ComputedSignalOperation.Sum, Constant(1));
            definition.MaxAgeMs = age;
            Assert.Throws<ArgumentException>(() => new ComputedSignalEvaluator([definition]));
        }
    }

    [Fact]
    public void ConfigurationCopiesDefinitionsAndPreservesComputedMappings()
    {
        var original = new AppConfig
        {
            ComputedSignals = [Calculation("blend", ComputedSignalOperation.WeightedAverage, Direct("a"), Direct("b", 3))],
            Signals = [new() { SourceMode = "Computed", OscPath = "blend", Role = SignalRole.V0 }],
            OscMappingPresets = [new() { Id = "custom", Mappings = [new() { SourceMode = "Computed", OscPath = "blend" }] }],
        };
        var copy = new AppConfig();
        copy.CopyFrom(original);
        Assert.Equal("Computed", Assert.Single(copy.Signals).SourceMode);
        Assert.Equal("Computed", Assert.Single(Assert.Single(copy.OscMappingPresets).Mappings).SourceMode);
        copy.ComputedSignals[0].Inputs[0].OscPath = "edited";
        Assert.Equal("a", original.ComputedSignals[0].Inputs[0].OscPath);
        var evaluator = new ComputedSignalEvaluator(original.ComputedSignals);
        original.ComputedSignals[0].Inputs[0].OscPath = "later edit";
        Assert.Equal("a", evaluator.GetRequiredInputs(["blend"])[0].OscPath);
        var required = evaluator.GetRequiredInputs(["blend"]);
        required[0].OscPath = "consumer edit";
        Assert.Equal("a", evaluator.GetRequiredInputs(["blend"])[0].OscPath);
    }

    [Fact]
    public void MappingReferencesAreValidatedBeforeAConfigurationCanBeApplied()
    {
        var config = new AppConfig { Signals = [new() { SourceMode = "Computed", OscPath = "missing" }] };
        Assert.Throws<ArgumentException>(() => config.NormalizeForRuntime());
        config.Signals = [];
        config.OscMappingPresets = [new() { Id = "custom", Mappings = [new() { SourceMode = "Computed", OscPath = "missing" }] }];
        Assert.Throws<ArgumentException>(() => config.NormalizeForRuntime());
    }
}
