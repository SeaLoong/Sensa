using System.Text.Json;
using Sensa.Application;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Runtime;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Save through the real configuration workflow to a loopback-only peer. / 真实配置工作流保存到隔离回环模拟端。</summary>
public sealed class ConnectedIntifaceRoutingContracts
{
    [Fact]
    public async Task Saving_a_new_vibration_axis_rebuilds_an_already_connected_client_before_reactivation()
    {
        await using var peer = new IntifaceMockServer(withPosition: false);
        var clock = new ManualTimeProvider();
        var config = new AppConfig
        {
            Outputs = [new() { Id = "vibrator", Type = OutputDeviceType.Intiface, Enabled = true,
                WebsocketAddress = peer.Address, VibrationAxis = "V0" }]
        };
        config.NormalizeForRuntime();
        var logs = new System.Collections.Concurrent.ConcurrentQueue<string>();
        await using var outputs = new OutputCoordinator(config, logs.Enqueue, logs.Enqueue, logs.Enqueue);
        using var runtime = new MotionRuntime(config, new OscParameterStore(clock), outputs, timeProvider: clock);
        outputs.CanSend = () => runtime.CanSend;
        Assert.True(await outputs.ConnectAsync("vibrator"), string.Join("\n", logs));
        await DeviceReadyAsync(outputs);
        runtime.SetManualOverride(new() { L0 = .75f, V0 = .25f });
        runtime.SetInputActive(true);
        Assert.Equal(250, VibrationValue(await peer.NextCommandAsync(IsVibration)));
        var beforeSave = peer.Commands.Count;
        var candidate = new AppConfig();
        candidate.CopyFrom(config);
        candidate.Outputs[0].VibrationAxis = "L0";
        var update = new ConfigurationUpdate(config, runtime, outputs, (_, _) => { }, () => { }, _ => { }, _ => { });

        await update.ApplyAsync(candidate);

        Assert.False(runtime.InputActive);
        Assert.Equal("L0", config.Outputs[0].VibrationAxis);
        Assert.True(outputs.IsConnected("vibrator"));
        Assert.Contains(peer.Commands.Skip(beforeSave), command => command.TryGetProperty("StopCmd", out _));
        Assert.DoesNotContain(peer.Commands.Skip(beforeSave), command => command.TryGetProperty("OutputCmd", out _));
        await DeviceReadyAsync(outputs);
        runtime.SetInputActive(true);
        Assert.Equal(750, VibrationValue(await peer.NextCommandAsync(IsVibration)));
        Assert.Equal(2, peer.ConnectionCount);
    }

    private static bool IsVibration(JsonElement command) => command.TryGetProperty("OutputCmd", out var output)
        && output.GetProperty("Command").TryGetProperty("Vibrate", out _);

    private static double VibrationValue(JsonElement command) =>
        command.GetProperty("OutputCmd").GetProperty("Command").GetProperty("Vibrate").GetProperty("Value").GetDouble();

    private static async Task DeviceReadyAsync(OutputCoordinator outputs)
    {
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        void Check() { if (outputs.GetDevices("vibrator").Count == 1) ready.TrySetResult(); }
        outputs.StateChanged += Check;
        try
        {
            Check();
            await ready.Task.WaitAsync(TimeSpan.FromSeconds(5));
        }
        finally { outputs.StateChanged -= Check; }
    }
}
