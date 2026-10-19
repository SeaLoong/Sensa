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

    [Theory]
    [InlineData("Self")]
    [InlineData("Others")]
    public async Task Independent_vfh_zone_is_direct_proximity_without_an_invented_close_gate(string party)
    {
        var path = "VFH/Zone/Touch/Body/Chest/" + party;
        using var rig = new MotionRig(Mapping(path));
        rig.Put(path, .7f); rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).V0, .698f, .702f);
        Assert.True(OgbTouchAddress.TryParse(path, out var address));
        Assert.False(address.NeedsClose);
        Assert.Equal("VFH/Zone/Touch/Body/Chest", address.Parent);
    }

    [Fact]
    public async Task Zone_value_keeps_the_selected_source_complete_instance_and_party()
    {
        const string path = "VFH/Zone/Touch/Body/Main/Others";
        using var rig = new MotionRig(Mapping(path));
        rig.SelectedSource = "selected";
        rig.Put(path, .3f, "selected");
        rig.Put(path, 1, "other");
        rig.Put("VFH/Zone/Touch/Else/Main/Others", 1, "selected");
        rig.Put("VFH/Zone/Touch/Body/Main/Self", 1, "selected");
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).V0, .298f, .302f);
    }

    [Fact]
    public async Task Vfh_capability_or_profile_metadata_cannot_refresh_an_old_zone_value()
    {
        const string path = "VFH/Zone/Touch/Body/Main/Others";
        using var rig = new MotionRig(Mapping("VFH/Zone/Touch/**/Others"));
        rig.Config.Osc.InputTimeoutMs = 100;
        rig.Put(path, .7f);
        rig.Activate(); await rig.Output.NextFrame();
        rig.Advance(450);
        rig.Put("VFH/Version/10", 1);
        rig.Put("VFH/Zone/Touch/Body/Main/Profile", 1);
        rig.Put("VFH/Other/Body/Main/Others", 1);
        rig.Advance(100);
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.IsEmergency);
    }

    [Theory]
    [InlineData(-.1f)]
    [InlineData(1.1f)]
    public async Task Zone_values_outside_proximity_range_do_not_drive_vibration(float value)
    {
        const string path = "VFH/Zone/Touch/Main/Others";
        using var rig = new MotionRig(Mapping(path));
        rig.Put(path, value); rig.Activate();
        Assert.Equal(0, (await rig.Output.NextFrame()).V0);
    }

    [Theory]
    [InlineData("VFH/Version/10")]
    [InlineData("VFH/Zone/Other/Main/Others")]
    [InlineData("VFH/Zone/Touch/Main/OthersClose")]
    [InlineData("VFH/Zone/Touch/Main/Angle")]
    [InlineData("VFH/Zone/Touch/Main/Profile")]
    [InlineData("VFH/Zone/Touch//Others")]
    [InlineData("VFH/Zone/Touch/ /Others")]
    public void Only_real_zone_proximity_leaves_are_automatically_interpreted(string path) =>
        Assert.False(OgbTouchAddress.TryParse(path, out _));

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
