using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Official OGB close-gated touch behavior / 官方 OGB 的 Close 约束触摸行为。</summary>
public sealed class OgbTouchContracts
{
    private static SignalMapping Mapping(string path) => new() { OscPath = path, SourceMode = "OgbTouch", Role = SignalRole.V0 };

    [Theory]
    [InlineData("OGB/Orf/Body/Main/TouchSelf")]
    [InlineData("OGB/Orf/Body/Main/TouchOthers")]
    [InlineData("OGB/Pen/Body/Main/TouchSelf")]
    [InlineData("OGB/Pen/Body/Main/TouchOthers")]
    [InlineData("OGB/Pen/Body/Main/FrotOthers")]
    public async Task Wide_proximity_requires_its_matching_close_detector(string path)
    {
        using var rig = new MotionRig(Mapping(path));
        rig.Put(path, .7f); rig.Activate();
        Assert.Equal(0, (await rig.Output.NextFrame()).V0);
        rig.Put(path + "Close", 1); rig.Advance(30);
        Assert.InRange((await rig.Output.NextFrame()).V0, .698f, .702f);
        rig.Put(path + "Close", 0); rig.Advance(30);
        Assert.Equal(0, (await rig.Output.NextFrame()).V0);
    }

    [Fact]
    public async Task Socket_frottage_is_direct_and_does_not_require_a_nonexistent_close_channel()
    {
        const string path = "OGB/Orf/Main/FrotOthers";
        using var rig = new MotionRig(Mapping(path));
        rig.Put(path, .7f); rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).V0, .698f, .702f);
    }

    [Theory]
    [InlineData("OGB/Pen/Body/Main/TouchOthersClose", "other")]
    [InlineData("OGB/Pen/Else/Main/TouchOthersClose", "test")]
    [InlineData("OGB/Pen/Body/Main/TouchSelfClose", "test")]
    public async Task Close_never_crosses_source_complete_parent_or_party(string closePath, string source)
    {
        const string path = "OGB/Pen/Body/Main/TouchOthers";
        using var rig = new MotionRig(Mapping("OGB/Pen/**/TouchOthers"));
        rig.Put(path, .7f); rig.Put(closePath, 1, source);
        rig.Activate();
        Assert.Equal(0, (await rig.Output.NextFrame()).V0);
    }

    [Fact]
    public async Task Direct_mode_remains_available_for_explicit_raw_mapping()
    {
        const string path = "OGB/Pen/Main/TouchOthers";
        using var rig = new MotionRig(new SignalMapping { OscPath = path, SourceMode = "Direct", Role = SignalRole.V0 });
        rig.Put(path, .7f); rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).V0, .698f, .702f);
    }

    [Fact]
    public async Task Fresh_close_metadata_cannot_keep_stale_touch_motion_alive()
    {
        const string path = "OGB/Pen/Main/TouchOthers";
        using var rig = new MotionRig(Mapping(path));
        rig.Config.Osc.InputTimeoutMs = 100;
        rig.Put(path, .7f); rig.Put(path + "Close", 1);
        rig.Activate(); await rig.Output.NextFrame();
        rig.Advance(450); rig.Put(path + "Close", 1); rig.Advance(100);
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.IsEmergency);
    }
}
