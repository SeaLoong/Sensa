using System.Text;
using Sensa.Input.Script;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class ScriptContracts
{
    private const string Motion = """{"actions":[{"at":0,"pos":0},{"at":1000,"pos":100},{"at":2000,"pos":0}]}""";
    private static FunscriptPlaybackSnapshot Load(FunscriptPlayer player, string json = Motion)
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));
        return player.Load("contract.funscript", stream);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("[]")]
    [InlineData("""{"actions":null}""")]
    [InlineData("""{"actions":[]}""")]
    [InlineData("""{"actions":[null,7,{},{"at":"x","pos":1}]}""")]
    public void Invalid_script_has_no_playable_state(string json)
    {
        using var player = new FunscriptPlayer(new ManualTimeProvider());
        Assert.Throws<InvalidDataException>(() => Load(player, json));
        Assert.False(player.GetSnapshot().Loaded);
    }

    [Fact]
    public void Valid_actions_are_sorted_clipped_and_invalid_entries_do_not_break_import()
    {
        using var player = new FunscriptPlayer(new ManualTimeProvider());
        var state = Load(player, """{"inverted":true,"range":20,"actions":[null,{"at":1000,"pos":150},{"at":-2,"pos":-10},{"at":500,"pos":50},{"at":0.5,"pos":50}]}""");
        Assert.Equal(3, state.ActionCount);
        Assert.Equal(1000, state.DurationMs);
        Assert.Equal(0, state.CurrentL0);
        Assert.Equal(.5f, player.Seek(500).CurrentL0);
        Assert.Equal(1, player.Seek(1000).CurrentL0);
    }

    [Fact]
    public void Seven_day_limit_rejects_the_script_before_replacing_current_content()
    {
        using var player = new FunscriptPlayer(new ManualTimeProvider());
        Load(player);
        Assert.Throws<InvalidDataException>(() => Load(player, """{"actions":[{"at":604800001,"pos":50}]}"""));
        Assert.Equal(3, player.GetSnapshot().ActionCount);
    }

    [Theory]
    [InlineData(0, .1)]
    [InlineData(-4, .1)]
    [InlineData(12, 4)]
    [InlineData(.125, .125)]
    public void Rate_is_bounded_without_changing_motion_positions(double requested, double expected)
    {
        using var player = new FunscriptPlayer(new ManualTimeProvider());
        Load(player);
        Assert.Equal(expected, player.Configure(speed: requested).Speed);
        Assert.Equal(.5f, player.Seek(500).CurrentL0);
    }

    [Fact]
    public void Nonfinite_rate_is_rejected_before_playback_state_can_be_poisoned()
    {
        using var player = new FunscriptPlayer(new ManualTimeProvider());
        Load(player);
        Assert.Throws<ArgumentOutOfRangeException>(() => player.Configure(speed: double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() => player.Play(speed: double.PositiveInfinity));
        Assert.Equal(1, player.GetSnapshot().Speed);
    }

    [Fact]
    public void Fractional_rates_do_not_accumulate_timer_rounding_error()
    {
        var clock = new ManualTimeProvider();
        using var player = new FunscriptPlayer(clock);
        Load(player); player.Play(speed: .125);
        clock.Advance(TimeSpan.FromMilliseconds(1000));
        var state = player.GetSnapshot();
        Assert.InRange(state.PositionMs, 124, 126);
        Assert.InRange(state.CurrentL0, .124f, .126f);
    }

    [Fact]
    public void Pausing_freezes_position_and_resume_continues_from_the_same_target()
    {
        var clock = new ManualTimeProvider();
        using var player = new FunscriptPlayer(clock);
        Load(player); player.Play(); clock.Advance(TimeSpan.FromMilliseconds(350));
        var paused = player.Pause();
        clock.Advance(TimeSpan.FromSeconds(30));
        Assert.Equal(paused.PositionMs, player.GetSnapshot().PositionMs);
        player.Play(); clock.Advance(TimeSpan.FromMilliseconds(150));
        Assert.InRange(player.GetSnapshot().PositionMs, 499, 501);
    }

    [Fact]
    public void Paused_seek_and_keyframe_steps_are_explicit_frame_events()
    {
        using var player = new FunscriptPlayer(new ManualTimeProvider());
        var frames = new List<float>(); var stops = 0;
        player.OnFrame += frames.Add; player.OnStopped += () => stops++;
        Load(player); Assert.Empty(frames);
        Assert.Equal(.5f, player.Seek(500).CurrentL0);
        Assert.Equal(1000, player.StepAction(1).PositionMs);
        Assert.Equal(0, player.StepAction(-1).PositionMs);
        Assert.Equal(new[] { .5f, 1f, 0f }, frames);
        player.Pause(); player.Stop(); player.Clear();
        Assert.Equal(3, stops);
        Assert.Equal(3, frames.Count);
    }

    [Fact]
    public void Loop_boundaries_are_normalized_and_looping_stays_in_the_selected_window()
    {
        var clock = new ManualTimeProvider();
        using var player = new FunscriptPlayer(clock);
        Load(player);
        var configured = player.Configure(loop: true, updateLoopRange: true, loopStartMs: 700, loopEndMs: 300);
        Assert.Equal(300, configured.LoopStartMs); Assert.Equal(700, configured.LoopEndMs);
        player.Play(restart: true); clock.Advance(TimeSpan.FromMilliseconds(500));
        var state = player.GetSnapshot();
        Assert.True(state.Playing); Assert.InRange(state.PositionMs, 399, 401);
        Assert.False(player.Configure(updateLoopRange: true, loopStartMs: 500, loopEndMs: 500).LoopRangeActive);
        Assert.Null(player.Configure(updateLoopRange: true).LoopStartMs);
    }

    [Fact]
    public void Reading_finished_state_between_ticks_does_not_drop_the_final_frame()
    {
        var clock = new ManualTimeProvider();
        using var player = new FunscriptPlayer(clock);
        Load(player, """{"actions":[{"at":0,"pos":100},{"at":1050,"pos":0}]}""");
        var frames = new List<float>(); player.OnFrame += frames.Add;
        player.Play(); clock.Advance(TimeSpan.FromMilliseconds(1055));
        Assert.Equal("finished", player.GetSnapshot().State);
        clock.Advance(TimeSpan.FromMilliseconds(5));
        Assert.Equal(0, frames.Last());
    }

    [Fact]
    public void Snapshots_include_density_without_exposing_an_editable_action_array()
    {
        using var player = new FunscriptPlayer(new ManualTimeProvider());
        var state = Load(player);
        Assert.Equal(64, state.ActivityBins.Count);
        Assert.Equal(state.ActionCount, state.ActivityBins.Sum());
        Assert.Equal("stopped", state.State);
        Assert.Equal(2000, player.Seek(long.MaxValue).PositionMs);
        Assert.Equal(0, player.Seek(long.MinValue).PositionMs);
        player.Clear(); Assert.Equal("empty", player.GetSnapshot().State);
    }

    [Fact]
    public void Disposing_player_cancels_future_timer_emission()
    {
        var clock = new ManualTimeProvider();
        var player = new FunscriptPlayer(clock); Load(player);
        var frames = 0; player.OnFrame += _ => frames++;
        player.Play(); player.Dispose();
        clock.Advance(TimeSpan.FromSeconds(3));
        Assert.Equal(1, frames);
    }

    [Theory]
    [InlineData("pause")]
    [InlineData("stop")]
    [InlineData("clear")]
    [InlineData("dispose")]
    public void Stopping_during_frame_publication_invalidates_the_sample_for_later_consumers(string operation)
    {
        var clock = new ManualTimeProvider();
        using var player = new FunscriptPlayer(clock);
        var observed = new List<float>();
        var interrupt = false;
        player.OnFrame += _ =>
        {
            if (!interrupt) return;
            interrupt = false;
            switch (operation)
            {
                case "pause": player.Pause(); break;
                case "stop": player.Stop(); break;
                case "clear": player.Clear(); break;
                case "dispose": player.Dispose(); break;
            }
        };
        player.OnFrame += observed.Add;
        Load(player);
        player.Play();
        Assert.Equal(new[] { 0f }, observed);
        interrupt = true;
        clock.Advance(TimeSpan.FromMilliseconds(20));
        clock.Advance(TimeSpan.FromSeconds(3));
        Assert.Equal(new[] { 0f }, observed);
    }

    [Fact]
    public void Pausing_a_final_sample_before_its_scheduled_tick_cancels_final_frame_delivery()
    {
        var clock = new ManualTimeProvider();
        using var player = new FunscriptPlayer(clock);
        Load(player, """{"actions":[{"at":0,"pos":100},{"at":1050,"pos":0}]}""");
        var frames = new List<float>();
        player.OnFrame += frames.Add;
        player.Play();
        clock.Advance(TimeSpan.FromMilliseconds(1055));
        Assert.Equal("finished", player.GetSnapshot().State);
        player.Pause();
        var count = frames.Count;
        clock.Advance(TimeSpan.FromMilliseconds(5));
        Assert.Equal(count, frames.Count);
    }
}
