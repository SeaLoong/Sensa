using Sensa.Hosting;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class OscSourceSelectionContracts
{
    [Theory]
    [InlineData("source-b")]
    [InlineData(null)]
    public async Task Changing_the_actual_source_stops_and_requires_explicit_reactivation(string? nextSource)
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = "Depth" });
        rig.SelectedSource = "source-a";
        rig.Put("Depth", .2f, "source-a");
        rig.Activate();
        await rig.Output.NextFrame(frame => Math.Abs(frame.L0 - .2f) < .001f);

        using (SensaHost.PrepareOscSourceSelection(rig.Runtime, rig.SelectedSource, nextSource))
            rig.SelectedSource = nextSource;
        await rig.Output.NextStop();
        Assert.False(rig.Runtime.InputActive);
        Assert.False(rig.Runtime.CanSend);

        rig.Advance(1);
        rig.Put("Depth", .9f, "source-b");
        await rig.Runtime.RefreshCurrentTargetAsync(_ => throw new InvalidOperationException("A disarmed target must not refresh"));
        Assert.Single(rig.Output.Frames);

        rig.Runtime.SetInputActive(true);
        var resumed = await rig.Output.NextFrame(frame => Math.Abs(frame.L0 - .9f) < .001f);
        Assert.InRange(resumed.L0, .899f, .901f);
    }

    [Fact]
    public async Task Selecting_the_same_actual_source_preserves_activation()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = "Depth" });
        rig.SelectedSource = "source-a";
        rig.Put("Depth", .2f, "source-a");
        rig.Activate();
        await rig.Output.NextFrame();

        using var sourceChange = SensaHost.PrepareOscSourceSelection(rig.Runtime, rig.SelectedSource, "source-a");
        Assert.True(rig.Runtime.InputActive);
        Assert.Equal(0, rig.Output.StopCount);
        rig.Put("Depth", .7f, "source-a");
        await rig.Output.NextFrame(frame => Math.Abs(frame.L0 - .7f) < .001f);
    }
}
