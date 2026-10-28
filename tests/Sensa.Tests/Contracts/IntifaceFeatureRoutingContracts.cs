using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Text.Json;
using Buttplug.Core.Messages;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Outputs.Intiface;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class IntifaceFeatureRoutingContracts
{
    [Fact]
    public async Task All_nine_scalar_or_position_types_use_the_actual_advertised_range_on_the_wire()
    {
        var definitions = new Dictionary<uint, (string Type, int Minimum, int Maximum)>
        {
            [0] = ("Rotate", -20, 80), [1] = ("Oscillate", 10, 210), [2] = ("Constrict", 0, 30),
            [3] = ("Led", 0, 255), [4] = ("Spray", 0, 100), [5] = ("Temperature", -40, 80),
            [6] = ("Position", 100, 1100), [7] = ("HwPositionWithDuration", 50, 1050), [8] = ("Vibrate", 0, 1000),
        };
        await using var peer = await RoutingPeer.CreateAsync(definitions);
        var routes = definitions.Select(pair => new IntifaceFeatureRoute
            { FeatureIndex = pair.Key, OutputType = pair.Value.Type, SourceAxis = "V0" }).ToList();
        await using var client = await ConnectAsync(peer, routes);
        await client.SendAsync(new() { V0 = .25f, DeltaMs = 275, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.V0 } });
        var expected = new[] { 20, 60, 8, 64, 25, -10, 350, 300, 250 };
        var commands = peer.Commands.Select(command => command.GetProperty("OutputCmd")).ToArray();
        Assert.Equal(9, commands.Length);
        foreach (var command in commands)
        {
            var index = command.GetProperty("FeatureIndex").GetUInt32();
            var payload = command.GetProperty("Command").GetProperty(definitions[index].Type);
            Assert.Equal(expected[index], payload.GetProperty("Value").GetInt32());
            if (index == 7) Assert.Equal(275, payload.GetProperty("Duration").GetInt32());
        }
    }

    [Fact]
    public async Task Direction_axis_changes_signed_rotation_without_changing_speed_and_zero_always_stops()
    {
        await using var peer = await RoutingPeer.CreateAsync(new() { [0] = ("Rotate", -20, 80) });
        await using var client = await ConnectAsync(peer,
            [new() { OutputType = "Rotate", SourceAxis = "V0", DirectionAxis = "A0" }]);
        await client.SendAsync(new() { V0 = .5f, A0 = 1, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.V0 } });
        await client.SendAsync(new() { V0 = .5f, A0 = 0, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.A0 } });
        await client.SendAsync(new() { V0 = 0, A0 = 0, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.V0 } });
        Assert.Equal(new[] { 40, -10, 0 }, peer.Commands.Select(command => command.GetProperty("OutputCmd")
            .GetProperty("Command").GetProperty("Rotate").GetProperty("Value").GetInt32()));
    }

    [Fact]
    public async Task Mapped_position_overrides_the_legacy_axis_and_inversion_is_explicit()
    {
        await using var peer = await RoutingPeer.CreateAsync(new() { [4] = ("HwPositionWithDuration", 0, 1000) });
        await using var client = await ConnectAsync(peer,
            [new() { FeatureIndex = 4, OutputType = "HwPositionWithDuration", SourceAxis = "R1", Invert = true }]);
        await client.SendAsync(new() { L0 = .9f, R1 = .25f, DeltaMs = 450 });
        var command = Assert.Single(peer.Commands).GetProperty("OutputCmd");
        Assert.Equal(4U, command.GetProperty("FeatureIndex").GetUInt32());
        var position = command.GetProperty("Command").GetProperty("HwPositionWithDuration");
        Assert.Equal(750, position.GetProperty("Value").GetInt32()); Assert.Equal(450, position.GetProperty("Duration").GetInt32());
    }

    [Fact]
    public async Task Deduplication_includes_duration_and_stop_clears_the_last_accepted_target()
    {
        await using var peer = await RoutingPeer.CreateAsync(new() { [0] = ("HwPositionWithDuration", 0, 1000) });
        await using var client = await ConnectAsync(peer,
            [new() { OutputType = "HwPositionWithDuration", SourceAxis = "L0" }]);
        var frame = new MotionFrame { L0 = .5f, DeltaMs = 200 };
        await client.SendAsync(frame); await client.SendAsync(frame);
        Assert.Single(peer.Commands);
        await client.SendAsync(frame with { DeltaMs = 400 });
        Assert.Equal(2, peer.Commands.Count);
        await client.StopAllAsync();
        Assert.True(peer.Commands[^1].TryGetProperty("StopCmd", out _));
        await client.SendAsync(frame with { DeltaMs = 400 });
        Assert.Equal(4, peer.Commands.Count);
    }

    [Fact]
    public async Task An_unchanged_default_position_with_a_new_arrival_time_is_reissued()
    {
        await using var peer = new IntifaceMockServer(withPosition: true);
        await using var client = new IntifaceOutputClient(new() { WebsocketAddress = peer.Address });
        await client.ConnectAsync();
        var frame = new MotionFrame { L0 = .5f, DeltaMs = 200, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.L0 } };
        await client.SendAsync(frame); await client.SendAsync(frame with { DeltaMs = 450 });
        Assert.Equal(new[] { 200, 450 }, peer.Commands.Select(command => command.GetProperty("OutputCmd")
            .GetProperty("Command").GetProperty("HwPositionWithDuration").GetProperty("Duration").GetInt32()));
    }

    [Fact]
    public async Task Device_feature_and_active_axis_filters_prevent_unintended_outputs()
    {
        await using var peer = await RoutingPeer.CreateAsync(new() { [0] = ("Rotate", -100, 100), [1] = ("Rotate", -100, 100) });
        await using var client = await ConnectAsync(peer,
            [new() { DeviceName = "Mapped mock device", FeatureIndex = 1, OutputType = "Rotate", SourceAxis = "V1" }]);
        await client.SendAsync(new() { V0 = 1, V1 = .6f, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.V0 } });
        Assert.Empty(peer.Commands);
        await client.SendAsync(new() { V1 = .6f, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.V1 } });
        Assert.Equal(1U, Assert.Single(peer.Commands).GetProperty("OutputCmd").GetProperty("FeatureIndex").GetUInt32());
    }

    [Fact]
    public async Task Unsupported_reverse_rotation_reports_error_without_sending_an_out_of_range_value()
    {
        await using var peer = await RoutingPeer.CreateAsync(new() { [0] = ("Rotate", 0, 100) });
        await using var client = await ConnectAsync(peer,
            [new() { OutputType = "Rotate", SourceAxis = "V0", Clockwise = false }]);
        await client.SendAsync(new() { V0 = .5f });
        Assert.Empty(peer.Commands); Assert.Equal("error", client.Telemetry.Snapshot.State);
        await client.SendAsync(new() { V0 = 0 });
        Assert.Equal(0, Assert.Single(peer.Commands).GetProperty("OutputCmd").GetProperty("Command").GetProperty("Rotate").GetProperty("Value").GetInt32());
    }

    [Theory]
    [InlineData("Inflate")]
    [InlineData("Unknown")]
    [InlineData("RGB")]
    [InlineData("rotate")]
    public void Unsupported_or_inexact_capability_names_are_rejected(string type) =>
        Assert.Throws<ArgumentException>(() => IntifaceFeatureRoute.CloneAndValidate([new() { OutputType = type }]));

    [Fact]
    public void Overlapping_wildcards_and_both_position_variants_are_rejected_but_distinct_devices_are_allowed()
    {
        Assert.Throws<ArgumentException>(() => IntifaceFeatureRoute.CloneAndValidate(
            [new() { OutputType = "Rotate" }, new() { DeviceName = "specific", FeatureIndex = 0, OutputType = "Rotate" }]));
        Assert.Throws<ArgumentException>(() => IntifaceFeatureRoute.CloneAndValidate(
            [new() { OutputType = "Position" }, new() { OutputType = "HwPositionWithDuration" }]));
        Assert.Equal(2, IntifaceFeatureRoute.CloneAndValidate(
            [new() { DeviceName = "first" }, new() { DeviceName = "second" }]).Count);
        Assert.Throws<ArgumentException>(() => IntifaceFeatureRoute.CloneAndValidate(
            [new() { OutputType = "Vibrate", DirectionAxis = "A0" }]));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(1001)]
    public void Timed_mapping_rejects_duration_outside_advertised_bounds(int duration)
    {
        var feature = new DeviceFeature { Output = new() { ["HwPositionWithDuration"] = new() { Value = [0, 100], Duration = [0, 1000] } } };
        Assert.Throws<ArgumentException>(() => new IntifaceFeatureRoute { OutputType = "HwPositionWithDuration" }
            .CreateCommand(feature, new() { V0 = .5f, DeltaMs = duration }));
    }

    [Fact]
    public async Task Default_position_scales_both_ends_of_a_nonzero_advertised_range()
    {
        await using var peer = await RoutingPeer.CreateAsync(new() { [0] = ("HwPositionWithDuration", 100, 1100) });
        await using var client = await ConnectAsync(peer, []);
        await client.SendAsync(new() { L0 = .75f, DeltaMs = 175, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.L0 } });
        var target = Assert.Single(peer.Commands).GetProperty("OutputCmd").GetProperty("Command").GetProperty("HwPositionWithDuration");
        Assert.Equal(350, target.GetProperty("Value").GetInt32());
        Assert.Equal(175, target.GetProperty("Duration").GetInt32());
    }

    [Fact]
    public async Task Default_vibration_scales_both_ends_of_a_nonzero_advertised_range()
    {
        await using var peer = await RoutingPeer.CreateAsync(new() { [0] = ("Vibrate", 10, 210) });
        await using var client = await ConnectAsync(peer, []);
        await client.SendAsync(new() { V0 = .25f, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.V0 } });
        Assert.Equal(60, Assert.Single(peer.Commands).GetProperty("OutputCmd").GetProperty("Command").GetProperty("Vibrate").GetProperty("Value").GetInt32());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task An_explicit_instant_command_is_not_replaced_with_the_runtime_tick_duration(bool mapped)
    {
        await using var peer = await RoutingPeer.CreateAsync(new() { [0] = ("HwPositionWithDuration", 0, 1000) });
        await using var client = await ConnectAsync(peer, mapped
            ? [new() { OutputType = "HwPositionWithDuration", SourceAxis = "L0" }] : []);
        await client.SendAsync(new() { L0 = .25f, DeltaMs = 37, RequestedCommandMode = TCodeCommandMode.None,
            ActiveAxes = new HashSet<MotionAxis> { MotionAxis.L0 } });
        Assert.Equal(0, Assert.Single(peer.Commands).GetProperty("OutputCmd").GetProperty("Command").GetProperty("HwPositionWithDuration").GetProperty("Duration").GetInt32());
    }

    [Fact]
    public async Task Clockwise_rotation_is_rejected_if_the_feature_only_advertises_counterclockwise_steps()
    {
        await using var peer = await RoutingPeer.CreateAsync(new() { [0] = ("Rotate", -100, 0) });
        await using var client = await ConnectAsync(peer,
            [new() { OutputType = "Rotate", SourceAxis = "V0", Clockwise = true }]);
        await client.SendAsync(new() { V0 = .5f });
        Assert.Empty(peer.Commands);
        Assert.Equal("error", client.Telemetry.Snapshot.State);
        await client.SendAsync(new() { V0 = 0 });
        Assert.Equal(0, Assert.Single(peer.Commands).GetProperty("OutputCmd").GetProperty("Command").GetProperty("Rotate").GetProperty("Value").GetInt32());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Large_or_fragmented_utf8_device_lists_are_reassembled_before_json_parsing(bool splitUtf8)
    {
        var name = splitUtf8 ? "测试设备 😀" : "Large feature list";
        var count = splitUtf8 ? 1 : 40;
        var definitions = Enumerable.Range(0, count).ToDictionary(index => (uint)index, _ => ("Rotate", -1000, 1000));
        await using var peer = await RoutingPeer.CreateAsync(definitions, name, splitUtf8);
        await using var client = await ConnectAsync(peer,
            [new() { FeatureIndex = (uint)(count - 1), OutputType = "Rotate", SourceAxis = "V0" }]);
        var device = Assert.Single(client.Devices);
        Assert.Equal(name, device.Name);
        Assert.Equal(count, device.Features.Count);
        await client.SendAsync(new() { V0 = .5f, ActiveAxes = new HashSet<MotionAxis> { MotionAxis.V0 } });
        var command = Assert.Single(peer.Commands).GetProperty("OutputCmd");
        Assert.Equal((uint)(count - 1), command.GetProperty("FeatureIndex").GetUInt32());
        Assert.Equal(500, command.GetProperty("Command").GetProperty("Rotate").GetProperty("Value").GetInt32());
    }

    private static async Task<IntifaceOutputClient> ConnectAsync(RoutingPeer peer, List<IntifaceFeatureRoute> routes)
    {
        var client = new IntifaceOutputClient(new IntifaceConfig { WebsocketAddress = peer.Address, FeatureRoutes = routes });
        try { await client.ConnectAsync(); Assert.Single(client.Devices); return client; }
        catch { await client.DisposeAsync(); throw; }
    }

    /// <summary>Actual v4 JSON over an isolated loopback WebSocket, without launching Sensa or an engine.</summary>
    private sealed class RoutingPeer : IAsyncDisposable
    {
        private readonly WebApplication _app;
        private readonly ConcurrentQueue<JsonElement> _commands = new();
        public string Address { get; private set; } = "";
        public IReadOnlyList<JsonElement> Commands => _commands.ToArray();
        private RoutingPeer(WebApplication app) => _app = app;

        public static async Task<RoutingPeer> CreateAsync(Dictionary<uint, (string Type, int Minimum, int Maximum)> definitions,
            string deviceName = "Mapped mock device", bool splitUtf8 = false)
        {
            var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions { Args = [], ContentRootPath = AppContext.BaseDirectory });
            builder.Logging.ClearProviders();
            builder.WebHost.ConfigureKestrel(server => server.Listen(IPAddress.Loopback, 0));
            var app = builder.Build(); var peer = new RoutingPeer(app); app.UseWebSockets();
            app.Run(async context =>
            {
                using var socket = await context.WebSockets.AcceptWebSocketAsync();
                using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, app.Lifetime.ApplicationStopping);
                var buffer = new byte[16384];
                try
                {
                    while (!lifetime.IsCancellationRequested)
                    {
                        using var message = new MemoryStream(); WebSocketReceiveResult part;
                        do
                        {
                            part = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), lifetime.Token);
                            if (part.MessageType == WebSocketMessageType.Close)
                            { await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", lifetime.Token); return; }
                            message.Write(buffer, 0, part.Count);
                            if (message.Length > 65536) throw new InvalidDataException("Oversized mock message.");
                        } while (!part.EndOfMessage);
                        using var document = JsonDocument.Parse(message.ToArray());
                        foreach (var command in document.RootElement.EnumerateArray())
                        {
                            var entry = command.EnumerateObject().Single(); var id = entry.Value.GetProperty("Id").GetUInt32(); object response;
                            if (entry.Name == "RequestServerInfo") response = new { ServerInfo = new { Id = id, ServerName = "Feature routing peer", ProtocolVersionMajor = 4, ProtocolVersionMinor = 0, MaxPingTime = 0 } };
                            else if (entry.Name == "RequestDeviceList")
                            {
                                var features = definitions.ToDictionary(pair => pair.Key.ToString(), pair => (object)new
                                {
                                    FeatureIndex = pair.Key, FeatureDescription = pair.Value.Type,
                                    Output = new Dictionary<string, object> { [pair.Value.Type] = pair.Value.Type == "HwPositionWithDuration"
                                        ? new { Value = new[] { pair.Value.Minimum, pair.Value.Maximum }, Duration = new[] { 0, 60000 } }
                                        : new { Value = new[] { pair.Value.Minimum, pair.Value.Maximum } } },
                                });
                                response = new { DeviceList = new { Id = id, Devices = new Dictionary<string, object> { ["0"] = new
                                    { DeviceName = deviceName, DeviceIndex = 0, DeviceMessageTimingGap = 0, DeviceFeatures = features } } } };
                            }
                            else if (entry.Name is "OutputCmd" or "StopCmd")
                            { peer._commands.Enqueue(command.Clone()); response = new { Ok = new { Id = id } }; }
                            else response = new { Ok = new { Id = id } };
                            var payload = JsonSerializer.SerializeToUtf8Bytes(new[] { response }, new JsonSerializerOptions
                                { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
                            if (splitUtf8 && entry.Name == "RequestDeviceList")
                            {
                                var boundary = Array.FindIndex(payload, value => value >= 0x80) + 1;
                                Assert.True(boundary > 0, "Fixture must split a real non-escaped UTF-8 codepoint.");
                                await socket.SendAsync(payload.AsMemory(0, boundary), WebSocketMessageType.Text, false, lifetime.Token);
                                await socket.SendAsync(payload.AsMemory(boundary), WebSocketMessageType.Text, true, lifetime.Token);
                            }
                            else await socket.SendAsync(payload, WebSocketMessageType.Text, true, lifetime.Token);
                        }
                    }
                }
                catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
                catch (WebSocketException) { }
            });
            await app.StartAsync(); peer.Address = app.Urls.Single().Replace("http://", "ws://", StringComparison.Ordinal); return peer;
        }

        public async ValueTask DisposeAsync()
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            await _app.StopAsync(deadline.Token); await _app.DisposeAsync();
        }
    }
}
