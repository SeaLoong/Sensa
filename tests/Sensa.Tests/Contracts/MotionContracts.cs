using System.Text;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Motion;
using Sensa.Runtime;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class MotionContracts
{
    [Fact]
    public void New_session_has_no_input_permission_or_device_motion()
    {
        using var rig = new MotionRig();
        Assert.Equal(RuntimeInputMode.Manual, rig.Runtime.CurrentInputMode);
        Assert.False(rig.Runtime.InputActive);
        Assert.False(rig.Runtime.CanSend);
        Assert.Empty(rig.Output.Frames);
    }

    [Fact]
    public async Task Manual_draft_requires_activation_and_identical_target_resends_after_stop()
    {
        using var rig = new MotionRig();
        rig.Runtime.SetManualOverride(new MotionFrame { L0 = .75f, R0 = .3f });
        Assert.Empty(rig.Output.Frames);
        rig.Activate(RuntimeInputMode.Manual);
        Assert.Equal(.75f, (await rig.Output.NextFrame()).L0);
        rig.Runtime.SetInputActive(false);
        await rig.Output.NextStop();
        Assert.False(rig.Runtime.CanSend);
        rig.Runtime.SetInputActive(true);
        Assert.Equal(.75f, (await rig.Output.NextFrame()).L0);
    }

    [Theory]
    [InlineData(RuntimeInputMode.Osc)]
    [InlineData(RuntimeInputMode.Script)]
    public async Task Changing_input_mode_disarms_instead_of_replaying_another_input(RuntimeInputMode mode)
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = "Depth" });
        rig.Runtime.SetManualOverride(new MotionFrame { L0 = .2f });
        rig.Activate(RuntimeInputMode.Manual);
        await rig.Output.NextFrame();
        rig.Put("Depth", .9f);
        rig.Runtime.SetInputMode(mode);
        await rig.Output.NextStop();
        Assert.Equal(mode, rig.Runtime.CurrentInputMode);
        Assert.False(rig.Runtime.InputActive);
        Assert.Single(rig.Output.Frames);
    }

    [Fact]
    public async Task Clearing_emergency_never_reactivates_input()
    {
        using var rig = new MotionRig();
        rig.Runtime.SetManualOverride(new MotionFrame { L0 = .4f });
        rig.Activate(RuntimeInputMode.Manual);
        await rig.Output.NextFrame();
        rig.Runtime.EmergencyStop();
        await rig.Output.NextStop();
        rig.Runtime.ClearEmergency();
        Assert.False(rig.Runtime.IsEmergency);
        Assert.False(rig.Runtime.InputActive);
        Assert.Single(rig.Output.Frames);
    }

    [Fact]
    public async Task Emergency_discards_queued_old_generation_even_when_transport_is_blocked()
    {
        using var rig = new MotionRig();
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        rig.Output.Sending = _ => release.Task;
        rig.Activate(RuntimeInputMode.Manual);
        rig.Runtime.SetManualOverride(new MotionFrame { L0 = .1f });
        await rig.Output.NextFrame();
        rig.Runtime.SetManualOverride(new MotionFrame { L0 = .3f });
        rig.Runtime.SetManualOverride(new MotionFrame { L0 = .8f });
        rig.Runtime.EmergencyStop();
        release.SetResult();
        await rig.Output.NextStop();
        Assert.Single(rig.Output.Frames);
        rig.Runtime.ClearEmergency();
        rig.Runtime.SetInputActive(true);
        Assert.Equal(.8f, (await rig.Output.NextFrame()).L0);
    }

    [Fact]
    public async Task Every_gate_mapping_must_be_satisfied_but_aliases_within_one_gate_are_alternatives()
    {
        using var rig = new MotionRig(
            new SignalMapping { OscPath = "Depth" },
            new SignalMapping { OscPath = "GripA;GripAlias", Role = SignalRole.GateEnable },
            new SignalMapping { OscPath = "GripB", Role = SignalRole.GateEnable });
        rig.Put("Depth", .8f);
        rig.Activate();
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.IsGateClosed);
        rig.Put("GripAlias", 1);
        Assert.Empty(rig.Output.Frames);
        rig.Put("GripB", 1);
        Assert.InRange((await rig.Output.NextFrame()).L0, .798f, .801f);
        rig.Put("GripAlias", 0);
        await rig.Output.NextStop();
        Assert.False(rig.Runtime.CanSend);
    }

    [Fact]
    public async Task Partial_OSC_patch_preserves_axes_not_controlled_by_that_input()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = "Depth" });
        rig.Runtime.SetManualOverride(new MotionFrame { L0 = .2f, R0 = .7f, V1 = .3f });
        rig.Activate(RuntimeInputMode.Manual);
        await rig.Output.NextFrame();
        rig.Runtime.SetInputMode(RuntimeInputMode.Osc);
        await rig.Output.NextStop();
        rig.Put("Depth", .4f);
        rig.Runtime.SetInputActive(true);
        var frame = await rig.Output.NextFrame();
        Assert.InRange(frame.L0, .398f, .401f);
        Assert.Equal(.7f, frame.R0);
        Assert.Equal(.3f, frame.V1);
    }

    [Fact]
    public async Task Explicit_source_does_not_fall_back_to_another_sender()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = "Depth" });
        rig.SelectedSource = "selected";
        rig.Put("Depth", 1, "other");
        rig.Activate();
        Assert.Empty(rig.Output.Frames);
        rig.Put("Depth", .3f, "selected");
        Assert.InRange((await rig.Output.NextFrame()).L0, .298f, .301f);
    }

    [Fact]
    public async Task Override_replaces_depth_but_does_not_bypass_a_closed_gate()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = "Depth" },
            new SignalMapping { OscPath = "Override", Role = SignalRole.DepthOverride },
            new SignalMapping { OscPath = "Gate", Role = SignalRole.GateEnable });
        rig.Put("Depth", .2f); rig.Put("Override", .8f); rig.Put("Gate", 1);
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, .798f, .801f);
        rig.Put("Gate", 0);
        await rig.Output.NextStop();
        rig.Put("Override", 1);
        Assert.False(rig.Runtime.CanSend);
        Assert.Single(rig.Output.Frames);
    }

    [Fact]
    public async Task Avatar_lifecycle_resets_and_stops_active_input_for_every_transport_adapter()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = "Depth" });
        rig.Put("Depth", .7f); rig.Activate(); await rig.Output.NextFrame();
        rig.Store.ChangeAvatar();
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.IsEmergency);
        Assert.Empty(rig.Store.SnapshotEntries());
        Assert.False(rig.Runtime.InputActive);
    }

    [Fact]
    public async Task Watchdog_uses_related_data_and_cannot_be_kept_alive_by_unmapped_traffic()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = "Depth" });
        rig.Config.Osc.InputTimeoutMs = 150;
        rig.Put("Depth", .7f); rig.Activate(); await rig.Output.NextFrame();
        rig.Advance(400); rig.Put("FT/JawOpen", 1); rig.Advance(100);
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.IsEmergency);
    }

    [Fact]
    public async Task Latest_related_scalar_controls_overall_outage_without_requiring_delta_only_axes_to_repeat()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = "Depth" }, new SignalMapping { OscPath = "Vibe", Role = SignalRole.V0 });
        rig.Config.Osc.InputTimeoutMs = 150;
        rig.Put("Depth", .4f); rig.Put("Vibe", .2f); rig.Activate(); await rig.Output.NextFrame();
        rig.Advance(400); rig.Put("Vibe", .3f); rig.Advance(100);
        Assert.True(rig.Runtime.InputActive);
        rig.Advance(500);
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.IsEmergency);
    }

    [Fact]
    public async Task SPS_root_tip_learning_is_source_local_and_accepts_a_cached_coordinate()
    {
        const string root = "OGB/Orf/Test/PenSelfNewRoot";
        using var rig = new MotionRig(new SignalMapping { OscPath = root, SourceMode = "SpsSocketDepth" });
        rig.Put(root, .77f); rig.Put(root.Replace("NewRoot", "NewTip"), .96f);
        rig.Activate(); await rig.Output.NextFrame();
        rig.Put(root, .89f); rig.Put(root.Replace("NewRoot", "NewTip"), 1);
        rig.Advance(30);
        Assert.InRange((await rig.Output.NextFrame()).L0, .398f, .402f);
    }

    [Fact]
    public async Task Expired_point_cannot_be_rearmed_by_fresh_grab_metadata()
    {
        const string prefix = "Sensa/Handle/v1/Grip/Self";
        using var rig = new MotionRig(new SignalMapping { OscPath = prefix + "/Root/**", SourceMode = "SensaPoint", VrchatMax = .2f });
        rig.Config.Osc.InputTimeoutMs = 100;
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        SpatialSamples.Point(rig.Store, prefix, new(.02, 0, .1));
        rig.Advance(180);
        rig.Put(prefix + "/Handle_IsGrabbed", 1);
        rig.Activate();
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.PoseBlocked);
        Assert.Empty(rig.Output.Frames);
    }

    [Fact]
    public async Task PB_release_stops_even_when_mapping_only_names_coordinate_paths()
    {
        const string prefix = "Sensa/Handle/v1/Grip/Self";
        using var rig = new MotionRig(new SignalMapping { OscPath = prefix + "/Root/**", SourceMode = "SensaPoint", VrchatMax = .2f });
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        SpatialSamples.Point(rig.Store, prefix, new(.02, 0, .1));
        rig.Put(prefix + "/Handle_IsGrabbed", 1);
        rig.Activate();
        Assert.InRange((await rig.Output.NextFrame()).L0, .498f, .502f);
        rig.Put(prefix + "/Handle_IsGrabbed", 0); rig.Advance(30);
        await rig.Output.NextStop();
        Assert.False(rig.Runtime.CanSend);
    }

    [Fact]
    public async Task Multiple_spatial_sources_require_selection_and_missing_geometry_has_no_scalar_fallback()
    {
        using var rig = new MotionRig(new SignalMapping { OscPath = "Sensa/Pose/v1/**", SourceMode = "SensaPose" },
            new SignalMapping { OscPath = "legacy" });
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        rig.Put("legacy", 1);
        foreach (var source in new[] { "a", "b" })
            SpatialSamples.Pose(rig.Store, new(0, 0, -.1), new(0, 0, .1), new(.03, 0, -.1), source: source);
        rig.Activate(); await rig.Output.NextStop();
        Assert.Empty(rig.Output.Frames);
        rig.SelectedSource = "a"; rig.Runtime.RebuildProcessors();
        Assert.InRange((await rig.Output.NextFrame()).L0, .498f, .502f);
        rig.Put("Sensa/Pose/v1/Main/Others/Tip/A0", 0, "a"); rig.Advance(30);
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.PoseBlocked);
    }


    [Theory]
    [InlineData("SensaPose")]
    [InlineData("SensaPoint")]
    public async Task ContactSpatialMappingsRemainBlockedUntilExplicitExperimentalOptIn(string mode)
    {
        const string prefix = "Sensa/Point/v1/Bone/Self";
        using var rig = new MotionRig(new SignalMapping { SourceMode = mode,
            OscPath = mode == "SensaPose" ? "Sensa/Pose/v1/**" : prefix + "/Root/**",
            VrchatMax = mode == "SensaPose" ? 1 : .2f }, new SignalMapping { OscPath = "legacy" });
        rig.Put("legacy", 1);
        if (mode == "SensaPose") SpatialSamples.Pose(rig.Store, new(0, 0, -.1), new(0, 0, .1), new(.03, 0, -.1));
        else SpatialSamples.Point(rig.Store, prefix, new(.02, 0, .1));
        rig.Activate(); await rig.Output.NextStop();
        Assert.True(rig.Runtime.PoseBlocked);
        Assert.Contains("disabled", rig.Runtime.SpatialInputBlockedReason);
        Assert.Equal(1000, rig.Runtime.SpatialSampleMaxAgeMs);
        Assert.Empty(rig.Output.Frames);
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        rig.Runtime.RebuildProcessors();
        Assert.InRange((await rig.Output.NextFrame()).L0, .498f, .502f);
        Assert.Contains("Experimental local estimate", rig.Runtime.SpatialInputStatus);
        rig.Config.Osc.AllowExperimentalSpatialInput = false;
        rig.Runtime.RebuildProcessors(); await rig.Output.NextStop();
        Assert.False(rig.Runtime.CanSend);
    }

    [Theory]
    [InlineData("SensaPose")]
    [InlineData("SensaPoint")]
    public async Task OneFreshContactRangeCannotRearmExpiredGeometry(string mode)
    {
        const string pointPrefix = "Sensa/Point/v1/Bone/Self";
        using var rig = new MotionRig(new SignalMapping { SourceMode = mode,
            OscPath = mode == "SensaPose" ? "Sensa/Pose/v1/**" : pointPrefix + "/Root/**" });
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        rig.Config.Osc.InputTimeoutMs = 100;
        if (mode == "SensaPose") SpatialSamples.Pose(rig.Store, new(0, 0, -.1), new(0, 0, .1), new(.03, 0, -.1));
        else SpatialSamples.Point(rig.Store, pointPrefix, new(.02, 0, .1));
        rig.Advance(180);
        var freshPath = mode == "SensaPose" ? "Sensa/Pose/v1/Main/Others/Root/A0" : pointPrefix + "/Root/A0";
        Assert.True(rig.Store.TryGetLatest(freshPath, out var stale));
        rig.Put(freshPath, stale.Value.AsFloat());
        rig.Activate(); await rig.Output.NextStop();
        Assert.True(rig.Runtime.PoseBlocked);
        Assert.Empty(rig.Output.Frames);
    }

    [Fact]
    public async Task ContactInputWithDefaultScalarTimeoutStillExpiresAfterOneSecond()
    {
        const string prefix = "Sensa/Point/v1/Bone/Self";
        using var rig = new MotionRig(new SignalMapping { SourceMode = "SensaPoint", OscPath = prefix + "/Root/**", VrchatMax = .2f });
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        SpatialSamples.Point(rig.Store, prefix, new(.02, 0, .1));
        rig.Activate(); await rig.Output.NextFrame();
        rig.Advance(1600); await rig.Output.NextStop();
        Assert.True(rig.Runtime.IsEmergency);
        Assert.False(rig.Runtime.InputActive);
    }

    [Fact]
    public async Task AmbiguousContactPointsCannotKeepTheWatchdogFresh()
    {
        const string prefix = "Sensa/Point/v1/Bone/Self";
        using var rig = new MotionRig(new SignalMapping { SourceMode = "SensaPoint", OscPath = "Sensa/Point/v1/*/Self/Root/**", VrchatMax = .2f });
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        SpatialSamples.Point(rig.Store, prefix, new(.02, 0, .1));
        rig.Activate(); await rig.Output.NextFrame();
        rig.Advance(900);
        SpatialSamples.Point(rig.Store, prefix, new(.02, 0, .12));
        SpatialSamples.Point(rig.Store, "Sensa/Point/v1/Other/Self", new(.01, 0, .1));
        rig.Advance(30); await rig.Output.NextStop();
        Assert.True(rig.Runtime.PoseBlocked);
        rig.Advance(570);
        Assert.True(rig.Runtime.IsEmergency);
    }

    [Fact]
    public async Task FreshUnselectedPoseCannotExtendTheSelectedPosesLifetime()
    {
        using var rig = new MotionRig(
            new SignalMapping { SourceMode = "SensaPose", OscPath = "Sensa/Pose/v1/**" },
            new SignalMapping { OscPath = "activity", Role = SignalRole.V0 });
        rig.Config.Osc.AllowExperimentalSpatialInput = true;
        SpatialSamples.Pose(rig.Store, new(0, 0, -.1), new(0, 0, .1), new(.03, 0, -.1));
        rig.Activate(); await rig.Output.NextFrame();
        rig.Advance(900);
        SpatialSamples.Pose(rig.Store, new(0, 0, -.15), new(0, 0, .05), new(.03, 0, -.15), instance: "Other");
        rig.Put("activity", .75f);
        rig.Advance(30);
        await rig.Output.NextFrame(frame => frame.V0 > .74f);
        Assert.Contains("/Main/", rig.Runtime.ActivePoseKey);
        rig.Advance(570); await rig.Output.NextStop();
        Assert.True(rig.Runtime.IsEmergency);
        Assert.False(rig.Runtime.CanSend);
    }

    [Fact]
    public async Task Recorder_tracks_runtime_targets_even_when_output_adapter_rejects_a_send()
    {
        using var rig = new MotionRig();
        rig.Output.Sending = _ => Task.FromException(new IOException("mock output failure"));
        rig.Recorder.Start(); rig.Runtime.SetManualOverride(new MotionFrame { L0 = .6f });
        rig.Activate(RuntimeInputMode.Manual); await rig.Output.NextFrame();
        Assert.Equal(1, rig.Recorder.FrameCount);
        Assert.Equal(.6f, Assert.Single(rig.Recorder.TakeSnapshot()).L0);
    }

    [Fact]
    public async Task Pausing_and_stopping_player_stop_outputs_but_explicit_paused_seek_can_move()
    {
        using var rig = new MotionRig();
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        rig.Output.Sending = _ => release.Task;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("""{"actions":[{"at":0,"pos":0},{"at":1000,"pos":100}]}"""));
        rig.Player.Load("test.funscript", stream);
        rig.Activate(RuntimeInputMode.Script); await rig.Output.NextFrame();
        rig.Player.Play(false, false, 1);
        rig.Advance(500);
        Assert.InRange(rig.Player.GetSnapshot().CurrentL0, .49f, .51f);
        Assert.Equal(0f, rig.Runtime.LastCommand.L0);
        release.SetResult();
        await rig.Output.NextFrame(frame => frame.L0 >= .49f && frame.L0 <= .51f);
        Assert.InRange(rig.Runtime.LastCommand.L0, .49f, .51f);
        rig.Player.Pause(); await rig.Output.NextStop();
        Assert.True(rig.Runtime.InputActive);
        rig.Player.Seek(1000);
        await rig.Output.NextFrame(frame => frame.L0 == 1f);
        Assert.Equal(1f, rig.Runtime.LastCommand.L0);
        var count = rig.Output.Frames.Count;
        rig.Player.Stop(); await rig.Output.NextStop();
        Assert.Equal(count, rig.Output.Frames.Count);
        Assert.Equal(1f, rig.Runtime.LastCommand.L0);
        Assert.Equal(0, rig.Player.GetSnapshot().PositionMs);
    }
    [Fact]
    public async Task Pausing_latches_automatic_output_permission_until_an_explicit_script_action()
    {
        using var rig = new MotionRig();
        using var script = new MemoryStream(Encoding.UTF8.GetBytes("""{"actions":[{"at":0,"pos":0},{"at":1000,"pos":100}]}"""));
        rig.Player.Load("pause.funscript", script);
        rig.Activate(RuntimeInputMode.Script);
        await rig.Output.NextFrame();
        rig.Player.Play();
        rig.Advance(400);
        await rig.Output.NextFrame(frame => frame.L0 >= .39f);
        rig.Player.Pause();
        await rig.Output.NextStop();
        Assert.True(rig.Runtime.InputActive);
        Assert.False(rig.Runtime.CanSend);
        var sent = rig.Output.Frames.Count;
        rig.Advance(3000);
        Assert.False(rig.Runtime.CanSend);
        Assert.Equal(sent, rig.Output.Frames.Count);

        rig.Player.Seek(750);
        Assert.Equal(.75f, (await rig.Output.NextFrame(frame => frame.L0 == .75f)).L0);
        Assert.True(rig.Runtime.CanSend);
        rig.Player.Stop();
        await rig.Output.NextStop();
        Assert.False(rig.Runtime.CanSend);
        rig.Player.Play();
        await rig.Output.NextFrame(frame => frame.L0 == 0);
        Assert.True(rig.Runtime.CanSend);
    }

    [Fact]
    public async Task A_sample_interrupted_before_runtime_admission_cannot_move_after_the_stop()
    {
        var clock = new ManualTimeProvider();
        using var player = new Sensa.Input.Script.FunscriptPlayer(clock);
        var pauseBeforeRuntime = false;
        player.OnFrame += _ =>
        {
            if (!pauseBeforeRuntime) return;
            pauseBeforeRuntime = false;
            player.Pause();
        };
        var output = new ProbeOutput();
        using var runtime = new MotionRuntime(new AppConfig(), new OscParameterStore(clock), output, scriptPlayer: player, timeProvider: clock);
        using var script = new MemoryStream(Encoding.UTF8.GetBytes("""{"actions":[{"at":0,"pos":0},{"at":1000,"pos":100}]}"""));
        player.Load("interrupted.funscript", script);
        runtime.SetInputMode(RuntimeInputMode.Script);
        runtime.SetInputActive(true);
        await output.NextFrame();
        player.Play();
        var before = output.Frames.Count;
        pauseBeforeRuntime = true;
        clock.Advance(TimeSpan.FromMilliseconds(20));
        await output.NextStop();
        Assert.False(runtime.CanSend);
        Assert.Equal(before, output.Frames.Count);
        player.Seek(500);
        Assert.Equal(.5f, (await output.NextFrame(frame => frame.L0 == .5f)).L0);
    }

}
