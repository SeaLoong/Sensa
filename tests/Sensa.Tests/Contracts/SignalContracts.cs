using Sensa.Motion;
using Sensa.Signals;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Calibrate → curve → map → mix contracts / 校准、曲线、映射和混合契约。</summary>
public sealed class SignalContracts
{
    [Theory]
    [InlineData(SignalCurve.Linear, 15f, .5f)]
    [InlineData(SignalCurve.EaseIn, 15f, .35f)]
    [InlineData(SignalCurve.EaseOut, 15f, .65f)]
    [InlineData(SignalCurve.SCurve, 12.5f, .275f)]
    [InlineData(SignalCurve.SCurve, 17.5f, .725f)]
    public void CalibrationCurvesAndMappedRangeComposeAtThePublicInterface(SignalCurve curve, float raw, float expected)
    {
        var processor = new SignalChannelProcessor(new() { VrchatMin = 10, VrchatMax = 20, Curve = curve, MappedMin = 200, MappedMax = 800 });
        var sample = processor.ProcessSample(raw);
        Assert.InRange(sample.Normalized, .25f, .75f);
        Assert.Equal(expected, sample.Output, 5);
        Assert.Equal(.2f, processor.Process(-100), 5);
        Assert.Equal(.8f, processor.Process(100), 5);
        Assert.Equal(-100, processor.ObservedMin);
        Assert.Equal(100, processor.ObservedMax);
        processor.ResetCalibration();
        processor.Process(17);
        Assert.Equal(17, processor.ObservedMin);
        Assert.Equal(17, processor.ObservedMax);
    }

    [Fact]
    public void DirectionReversalPrecedesCurveAndDegenerateCalibrationStaysAtMappedMinimum()
    {
        var inverted = new SignalChannelProcessor(new() { VrchatMin = 0, VrchatMax = 1, InvertDirection = true,
            Curve = SignalCurve.EaseIn, MappedMin = 200, MappedMax = 800 });
        Assert.Equal(.5375f, inverted.Process(.25f), 5);
        var collapsed = new SignalChannelProcessor(new() { VrchatMin = .5f, VrchatMax = .5f, MappedMin = 300, MappedMax = 700 });
        Assert.Equal(.3f, collapsed.Process(.9f), 5);
    }

    [Fact]
    public void MixingSelectsStrongestRoleWithoutOverwritingUnmappedAxes()
    {
        var patch = new SignalMixer().FusePatch(new (SignalRole, float)[] {
            (SignalRole.Depth, .8f), (SignalRole.Depth, .1f),
            (SignalRole.Twist, .6f), (SignalRole.Twist, .1f),
            (SignalRole.GateEnable, 1f) });
        var original = MotionAxisHelper.CreateNeutralFrame() with { L1 = .72f, V1 = .4f };
        var frame = MotionAxisHelper.ApplyPatch(original, patch);
        Assert.Equal(.8f, frame.L0);
        Assert.Equal(.1f, frame.R0);
        Assert.Equal(.72f, frame.L1);
        Assert.Equal(.4f, frame.V1);
        Assert.Equal(2, patch.Count);
    }

    [Fact]
    public void ExplicitPriorityCanSelectLowerOutputAndEqualPriorityUsesRoleStrength()
    {
        var frame = new SignalMixer().Fuse(new SignalMixInput[] {
            new(SignalRole.Depth, .9f, .1f), new(SignalRole.Depth, .2f, .8f),
            new(SignalRole.AngleX, .55f, .8f), new(SignalRole.AngleX, .1f, .8f) }, 25);
        Assert.Equal(.2f, frame.L0);
        Assert.Equal(.1f, frame.R1);
        Assert.Equal(25, frame.DeltaMs);
    }

    [Fact]
    public void AxisPatchesRejectInvalidNumbersAndClonesAreIndependent()
    {
        var patch = new MotionPatch();
        patch.Set(MotionAxis.L0, float.NaN);
        patch.Set(MotionAxis.R1, float.PositiveInfinity);
        Assert.True(patch.IsEmpty);
        patch.Set(MotionAxis.L0, 3);
        var clone = patch.Clone();
        clone.Set(MotionAxis.L0, 0);
        Assert.Equal(1, patch.GetValueOrNull(MotionAxis.L0));
        Assert.Equal(0, clone.GetValueOrNull(MotionAxis.L0));
    }

    [Fact]
    public void VelocityUsesTCodeHundredMillisecondUnitsCapsAndResetSemantics()
    {
        var tracker = new AxisVelocityTracker();
        Assert.Equal(0, tracker.Estimate(0, 100));
        Assert.Equal(100, tracker.Estimate(1, 1000, 999));
        Assert.Equal(30, tracker.Estimate(0, 1, 30));
        Assert.Equal(0, tracker.Estimate(0, 20));
        tracker.Sync(.25f);
        Assert.Equal(50, tracker.Estimate(.75f, 1000, 999));
        tracker.Reset();
        Assert.Equal(0, tracker.Estimate(.9f, 100));
        Assert.Equal(0, tracker.Estimate(.1f, 100, 0));
    }

    [Fact]
    public void SpsDepthLearnsNativeRootRadiusAndResetsWhenThePlugLeaves()
    {
        var estimator = new SpsDepthEstimator();
        Assert.Equal(0, estimator.Process(.9f, 1));
        Assert.Equal(0, estimator.Process(.71f, .9f));
        Assert.InRange(estimator.Process(.91f, 1), .4999f, .5001f);
        Assert.Equal(0, estimator.Process(0, 0));
        Assert.Equal(0, estimator.Process(.9f, 1));
    }

    [Fact]
    public void SpsReplacementLengthCanShrinkAndCachedTipCannotRecalibrate()
    {
        var estimator = new SpsDepthEstimator();
        estimator.Process(.77f, .96f, 10);
        Assert.Equal(0, estimator.Process(.99f, .96f, 10));
        Assert.InRange(estimator.Process(.99f, 1, 11), .8999f, .9001f);
        Assert.Equal(0, estimator.Process(.77f, .86f, 12));
        Assert.InRange(estimator.Process(.95f, 1, 13), .3999f, .4001f);
    }

    [Fact]
    public void SpsRadialEstimateRetainsItsDocumentedOffAxisLimitation()
    {
        var estimator = new SpsDepthEstimator();
        estimator.Process(.77f, .96f);
        Assert.InRange(estimator.Process(.89f, 1), .3999f, .4001f);
        var radialDistance = MathF.Sqrt(.12f * .12f + .06f * .06f);
        Assert.InRange(estimator.Process(1 - radialDistance + .01f, 1), .3291f, .3293f);
        Assert.InRange(estimator.Process(1, 1), .9499f, .9501f);
    }

    [Theory]
    [InlineData(float.NaN, 1)]
    [InlineData(.8f, float.PositiveInfinity)]
    [InlineData(1.1f, 1)]
    [InlineData(.8f, 1.1f)]
    [InlineData(.9f, .8f)]
    public void InvalidSpsPairsDiscardPreviouslyLearnedLength(float root, float tip)
    {
        var estimator = new SpsDepthEstimator();
        estimator.Process(.77f, .96f);
        Assert.Equal(0, estimator.Process(root, tip));
        Assert.Equal(0, estimator.Process(.89f, 1));
    }

    [Fact]
    public void WrappedAnglesStayContinuousAndIgnoreNonFiniteSamples()
    {
        var angle = new ContinuousAngle();
        Assert.Equal(179, angle.Update(179));
        Assert.Equal(181, angle.Update(-179));
        Assert.Equal(178, angle.Update(178));
        Assert.Equal(178, angle.Update(double.NaN));
    }
}
