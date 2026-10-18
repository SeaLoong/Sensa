using System.Text.Json;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Outputs.Intiface;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Concurrent real adapters with isolated peers / 并发真实适配器与隔离模拟端。</summary>
public sealed class IntifaceInitializationContracts
{
    [Fact]
    public async Task Concurrent_clients_can_initialize_discover_scan_send_and_stop_without_shared_metadata_corruption()
    {
        // Amplify the cold metadata race while using only isolated local peers.
        // 放大首次元数据初始化竞态；只使用本地隔离模拟端。
        const int count = 16;
        var peers = Enumerable.Range(0, count).Select(_ => new IntifaceMockServer(withPosition: true)).ToArray();
        var clients = new IntifaceOutputClient?[count];
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        try
        {
            var operations = Enumerable.Range(0, count).Select(index => Task.Run(async () =>
            {
                await start.Task;
                var client = new IntifaceOutputClient(new IntifaceConfig
                    { WebsocketAddress = peers[index].Address, ManageEngineProcess = false });
                clients[index] = client;
                var discovered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                client.DevicesChanged += () => { if (client.Devices.Count == 1) discovered.TrySetResult(); };
                await client.ConnectAsync();
                await discovered.Task.WaitAsync(TimeSpan.FromSeconds(5));
                Assert.True(client.IsConnected);
                await client.StartScanAsync();
                await client.StopScanAsync();
                await client.SendAsync(new MotionFrame { L0 = .25f, V0 = .5f, DeltaMs = 100 });
                var vibration = await peers[index].NextCommandAsync(IsVibration);
                Assert.Equal(500, vibration.GetProperty("OutputCmd").GetProperty("Command")
                    .GetProperty("Vibrate").GetProperty("Value").GetDouble());
                await client.StopAllAsync();
                var stop = await peers[index].NextCommandAsync(message => message.TryGetProperty("StopCmd", out _));
                Assert.True(stop.TryGetProperty("StopCmd", out _));
                Assert.Equal("stopped", client.Telemetry.Snapshot.State);
            })).ToArray();
            start.SetResult();
            await Task.WhenAll(operations).WaitAsync(TimeSpan.FromSeconds(20));
            Assert.All(peers, peer => Assert.Equal(1, peer.ConnectionCount));
        }
        finally
        {
            foreach (var client in clients) if (client is not null) await client.DisposeAsync();
            foreach (var peer in peers) await peer.DisposeAsync();
        }
    }

    private static bool IsVibration(JsonElement message) =>
        message.TryGetProperty("OutputCmd", out var output) && output.GetProperty("Command").TryGetProperty("Vibrate", out _);
}
