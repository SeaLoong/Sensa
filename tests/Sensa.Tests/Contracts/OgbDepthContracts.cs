using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>OGB capability selection and source isolation / OGB 能力选择与来源隔离。</summary>
public sealed class OgbDepthContracts
{
    private const string Pattern = "OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers";
    private const string Stem = "OGB/Orf/Body/Main/PenOthers";
    private static SignalMapping Mapping(string pattern = Pattern) => new() { OscPath = pattern, SourceMode = "OgbDepth" };

    [Theory]
    [InlineData("OGB/Orf/Old/PenOthers")]
    [InlineData("OGB/Pen/Old/PenOthers")]
    [InlineData("OGB/Pen/Body/Old/PenOthers")]
    public async Task Legacy_single_proximity_remains_direct_without_inversion(string path)
    {
        using var rig = new MotionRig(Mapping());
        rig.Put(path, .7f);
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, .698f, .702f);
    }

    [Fact]
    public async Task Modern_activity_suppresses_legacy_even_before_length_is_known()
    {
        using var rig = new MotionRig(Mapping(), new() { OscPath = "checkpoint", Role = SignalRole.V0 });
        rig.Put(Stem, 1);
        rig.Put(Stem + "NewRoot", .9f);
        rig.Put(Stem + "NewTip", 1);
        rig.Activate();
        Assert.Equal(0, (await rig.Output.NextFrame()).L0);
        rig.Put(Stem + "NewRoot", .71f); rig.Put(Stem + "NewTip", .9f);
        rig.Put("checkpoint", .3f);
        rig.Advance(30); await rig.Output.NextFrame(frame => frame.V0 > .2f);
        rig.Put(Stem + "NewRoot", .91f); rig.Put(Stem + "NewTip", 1);
        rig.Advance(30);
        Assert.InRange((await rig.Output.NextFrame()).L0, .498f, .502f);
    }

    [Fact]
    public async Task A_partial_positive_modern_pair_cannot_fall_back_to_full_legacy()
    {
        using var rig = new MotionRig(Mapping());
        rig.Put(Stem, 1); rig.Put(Stem + "NewTip", .9f);
        rig.Activate();
        Assert.Equal(0, (await rig.Output.NextFrame()).L0);
    }

    [Fact]
    public async Task Zero_modern_values_allow_legacy_and_a_present_close_gate_is_honoured()
    {
        using var rig = new MotionRig(Mapping());
        rig.Put(Stem, .7f); rig.Put(Stem + "NewRoot", 0); rig.Put(Stem + "NewTip", 0);
        rig.Put(Stem + "Close", 0);
        rig.Activate(); Assert.Equal(0, (await rig.Output.NextFrame()).L0);
        // The preset does not list Close: changing it must still rebuild this instance.
        rig.Put(Stem + "Close", 1); rig.Advance(30);
        Assert.InRange((await rig.Output.NextFrame()).L0, .698f, .702f);
    }

    [Theory]
    [InlineData("OGB/Orf/Body/Main/PenOthersNewTip", "other")]
    [InlineData("OGB/Orf/Body/Else/PenOthersNewTip", "test")]
    [InlineData("OGB/Orf/Body/Main/PenSelfNewTip", "test")]
    public async Task Root_and_tip_never_cross_source_instance_or_party(string tipPath, string source)
    {
        using var rig = new MotionRig(Mapping(), new() { OscPath = "checkpoint", Role = SignalRole.V0 });
        rig.Put(Stem, 1); rig.Put(Stem + "NewRoot", .71f);
        rig.Put(tipPath, .9f, source);
        rig.Activate();
        Assert.Equal(0, (await rig.Output.NextFrame()).L0);
        rig.Put(Stem + "NewRoot", .91f); rig.Put(tipPath, 1, source);
        rig.Put("checkpoint", 1); rig.Advance(30);
        Assert.Equal(0, (await rig.Output.NextFrame(frame => frame.V0 > .99f)).L0);
    }

    [Fact]
    public async Task A_cached_saturated_tip_is_valid_delta_data_but_cannot_relearn_length()
    {
        using var rig = new MotionRig(Mapping());
        rig.Put(Stem + "NewRoot", .71f); rig.Put(Stem + "NewTip", .9f);
        rig.Activate(); await rig.Output.NextFrame();
        rig.Put(Stem + "NewRoot", .91f); rig.Put(Stem + "NewTip", 1); rig.Advance(30);
        await rig.Output.NextFrame();
        rig.Put(Stem + "NewRoot", .95f); rig.Advance(30);
        Assert.InRange((await rig.Output.NextFrame()).L0, .698f, .702f);
    }

    [Fact]
    public async Task Fresh_suppressed_legacy_cannot_keep_an_expired_modern_pair_alive()
    {
        using var rig = new MotionRig(Mapping());
        rig.Config.Osc.InputTimeoutMs = 100;
        rig.Put(Stem, 1); rig.Put(Stem + "NewRoot", .71f); rig.Put(Stem + "NewTip", .9f);
        rig.Activate(); await rig.Output.NextFrame();
        rig.Advance(450); rig.Put(Stem, 1);
        rig.Advance(100); await rig.Output.NextStop();
        Assert.True(rig.Runtime.IsEmergency);
    }

    [Fact]
    public async Task Close_metadata_does_not_refresh_a_legacy_motion_sample()
    {
        using var rig = new MotionRig(Mapping());
        rig.Config.Osc.InputTimeoutMs = 100;
        rig.Put(Stem, .7f); rig.Put(Stem + "Close", 1);
        rig.Activate(); await rig.Output.NextFrame();
        rig.Advance(450); rig.Put(Stem + "Close", 1);
        rig.Advance(100); await rig.Output.NextStop();
        Assert.True(rig.Runtime.IsEmergency);
    }

    [Fact]
    public async Task Reactivation_does_not_reuse_length_from_an_unobserved_disarmed_interval()
    {
        using var rig = new MotionRig(Mapping());
        rig.Put(Stem + "NewRoot", .71f); rig.Put(Stem + "NewTip", .9f);
        rig.Activate(); await rig.Output.NextFrame();
        rig.Put(Stem + "NewRoot", .91f); rig.Put(Stem + "NewTip", 1); rig.Advance(30);
        Assert.InRange((await rig.Output.NextFrame()).L0, .498f, .502f);
        rig.Runtime.SetInputActive(false); await rig.Output.NextStop();
        rig.Put(Stem + "NewRoot", .95f);
        rig.Runtime.SetInputActive(true);
        Assert.Equal(0, (await rig.Output.NextFrame()).L0);
    }

    [Fact]
    public async Task Selecting_an_osc_source_is_respected_for_every_capability()
    {
        using var rig = new MotionRig(Mapping());
        rig.Put(Stem, 1, "unselected"); rig.Put(Stem, .3f, "selected");
        rig.SelectedSource = "selected";
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, .298f, .302f);
    }

    [Theory]
    [InlineData("OGB/Orf/Main/PenOthersNewRoot", true)]
    [InlineData("OGB/Orf/Body/Main/PenSelfNewTip", true)]
    [InlineData("OGB/Pen/Main/PenOthers", true)]
    [InlineData("OGB/Orf//PenOthers", false)]
    [InlineData("OGB/Pen/Main/PenOthersNewRoot", false)]
    [InlineData("OGB/Orf/Main/PenSelfClose", false)]
    [InlineData("OGB/Orf/Main/PenOthersClose", true)]
    [InlineData("OGB/Orf/Main/PenOthersTrigger", false)]
    [InlineData("Other/Orf/Main/PenOthers", false)]
    public void Only_verified_leaf_families_form_an_ogb_identity(string path, bool accepted) =>
        Assert.Equal(accepted, OgbDepthAddress.TryParse(path, out _));
}
