using System.Text;
using Sensa.Input.Script;
using Sensa.Runtime;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class ScriptSnapshotContracts
{
    private static void LoadNonzeroStart(FunscriptPlayer player)
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(
            """{"actions":[{"at":0,"pos":80},{"at":1000,"pos":20}]}"""));
        player.Load("nonzero-start.funscript", stream);
    }

    [Theory]
    [InlineData("load")]
    [InlineData("seek-zero")]
    [InlineData("previous-action")]
    [InlineData("pause-at-zero")]
    public void Reading_a_stationary_script_preserves_the_selected_nonzero_start_without_playing(string operation)
    {
        var clock = new ManualTimeProvider();
        using var player = new FunscriptPlayer(clock);
        var frames = new List<float>();
        player.OnFrame += frames.Add;
        LoadNonzeroStart(player);
        switch (operation)
        {
            case "seek-zero": player.Seek(0); break;
            case "previous-action": player.Seek(500); player.StepAction(-1); break;
            case "pause-at-zero": player.Play(); player.Pause(); break;
        }

        var emitted = frames.Count;
        for (var read = 0; read < 3; read++)
        {
            var snapshot = player.GetSnapshot();
            Assert.True(snapshot.Loaded);
            Assert.False(snapshot.Playing);
            Assert.Equal(0, snapshot.PositionMs);
            Assert.Equal(.8f, snapshot.CurrentL0);
            clock.Advance(TimeSpan.FromSeconds(1));
        }
        Assert.Equal(emitted, frames.Count);
    }

    [Fact]
    public void Explicit_stop_keeps_its_zero_target_across_snapshots_and_configuration_reads()
    {
        var clock = new ManualTimeProvider();
        using var player = new FunscriptPlayer(clock);
        var frames = new List<float>();
        player.OnFrame += frames.Add;
        LoadNonzeroStart(player);
        player.Seek(500);
        var stopped = player.Stop();
        var emitted = frames.Count;
        Assert.Equal(0, stopped.CurrentL0);
        Assert.Equal(0, player.Configure(loop: true).CurrentL0);
        for (var read = 0; read < 3; read++)
        {
            var snapshot = player.GetSnapshot();
            Assert.False(snapshot.Playing);
            Assert.Equal(0, snapshot.PositionMs);
            Assert.Equal(0, snapshot.CurrentL0);
            clock.Advance(TimeSpan.FromSeconds(1));
        }
        Assert.Equal(emitted, frames.Count);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Explicit_activation_uses_the_selected_script_target_while_an_explicit_stop_stays_zero(bool stopBeforeReactivation)
    {
        using var rig = new MotionRig();
        LoadNonzeroStart(rig.Player);
        rig.Player.Seek(0);
        Assert.False(rig.Runtime.InputActive);
        Assert.Empty(rig.Output.Frames);

        rig.Activate(RuntimeInputMode.Script);
        Assert.Equal(.8f, (await rig.Output.NextFrame()).L0);
        Assert.False(rig.Player.GetSnapshot().Playing);
        rig.Runtime.SetInputActive(false);
        await rig.Output.NextStop();
        if (stopBeforeReactivation) rig.Player.Stop();

        rig.Runtime.SetInputActive(true);
        Assert.Equal(stopBeforeReactivation ? 0f : .8f, (await rig.Output.NextFrame()).L0);
        Assert.False(rig.Player.GetSnapshot().Playing);
    }
}
