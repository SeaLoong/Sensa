using Sensa.Input.Osc;
using Sensa.Signals;
using Xunit;

namespace Sensa.Tests;

public class SpsPositionTests
{
    private static OscParameterStore Store(PosePoint position)
    {
        var store = new OscParameterStore();
        var samples = PoseTests.Samples(position, .01);
        for (var i = 0; i < 8; i++) store.Set($"Sensa/SpsRoot/v1/Main/Others/Root/A{i}", OscValue.FromFloat(samples[i]), OscSource.Unknown);
        return store;
    }

    [Theory]
    [InlineData(.025, -.02, -.10)]
    [InlineData(-.025, .02, .10)]
    public void StandardRootRecoversPositionWithoutBecomingAPose(double x, double y, double z)
    {
        var point = new PosePoint(x, y, z);
        var entries = Store(point).SnapshotEntries();
        var result = Assert.Single(SpsPositionTracking.Observe(entries));
        Assert.True(result.Valid, result.Reason);
        Assert.InRange((result.Position - point).Length, 0, .00003);
        Assert.Empty(PoseReconstruction.Observe(entries));
        Assert.Empty(SpsPositionTracking.Observe(entries, "different-source"));
    }

    [Fact]
    public void MissingOrClippedSamplesNeverShowAValidPosition()
    {
        var store = Store(new(.02, 0, -.1));
        Assert.False(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries().Take(7))).Valid);
        store.Set("Sensa/SpsRoot/v1/Main/Others/Root/A0", OscValue.FromFloat(0), OscSource.Unknown);
        Assert.False(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries())).Valid);
    }
}
