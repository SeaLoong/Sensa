using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Sensa.Input.Protocols;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>
/// Wire v2 fixtures follow upstream's RequestServerInfoV1, ServerInfoV2,
/// GenericDeviceMessageAttributesV2 and VibrateCmdV1 at immutable revision
/// https://github.com/buttplugio/buttplug/tree/179b0d9306f519912c10bdddd111686622b7f63a/crates/buttplug_server/src/message.
/// These contracts advertise only implemented virtual actuators, not hardware feedback.
/// </summary>
public sealed class ButtplugV2InputContracts
{
    private const string Handshake = """[{"RequestServerInfo":{"Id":1,"ClientName":"isolated legacy client","MessageVersion":2}}]""";

    [Fact]
    public void Negotiation_uses_v2_capability_objects_and_only_actual_vibration_features()
    {
        var sink = new Sink();
        using var session = new ButtplugInputSession(Config(), sink);
        using var handshake = JsonDocument.Parse(session.Process(Handshake));
        var server = handshake.RootElement[0].GetProperty("ServerInfo");
        Assert.Equal(2, server.GetProperty("MessageVersion").GetInt32());
        Assert.False(server.TryGetProperty("ProtocolVersionMajor", out _));
        using var reply = JsonDocument.Parse(session.Process("""[{"RequestDeviceList":{"Id":2}}]"""));
        var device = Assert.Single(reply.RootElement[0].GetProperty("DeviceList").GetProperty("Devices").EnumerateArray());
        Assert.False(device.TryGetProperty("DeviceMessageTimingGap", out _));
        var messages = device.GetProperty("DeviceMessages");
        Assert.Equal(4, messages.EnumerateObject().Count());
        foreach (var (command, count) in new[] { ("LinearCmd", 1), ("VibrateCmd", 2), ("RotateCmd", 1) })
        {
            var metadata = messages.GetProperty(command);
            Assert.Equal(JsonValueKind.Object, metadata.ValueKind);
            Assert.Equal(count, metadata.GetProperty("FeatureCount").GetInt32());
            Assert.Equal(Enumerable.Repeat(1000, count), metadata.GetProperty("StepCount").EnumerateArray().Select(value => value.GetInt32()));
        }
        Assert.False(messages.TryGetProperty("ScalarCmd", out _));
        Assert.False(messages.TryGetProperty("BatteryLevelCmd", out _));
        Assert.False(messages.TryGetProperty("RSSILevelCmd", out _));
        Assert.False(messages.TryGetProperty("RawWriteCmd", out _));
        Assert.Empty(sink.Commands);
    }

    [Fact]
    public void Command_family_indices_preserve_vibration_types_rotation_direction_and_linear_duration()
    {
        var sink = new Sink(); using var session = Connected(sink);
        Ok(session.Process("""[{"VibrateCmd":{"Id":3,"DeviceIndex":0,"Speeds":[{"Index":1,"Speed":0.7},{"Index":0,"Speed":0.2}]}}]"""), 3);
        Ok(session.Process("""[{"LinearCmd":{"Id":4,"DeviceIndex":0,"Vectors":[{"Index":0,"Position":0.75,"Duration":450}]}}]"""), 4);
        Ok(session.Process("""[{"RotateCmd":{"Id":5,"DeviceIndex":0,"Rotations":[{"Index":0,"Speed":0.6,"Clockwise":false}]}}]"""), 5);
        Assert.Equal(new[] { new ExternalControlCommand("vibrate-b", .7), new("vibrate-a", .2), new("L0", .75, 450), new("rotation", .6, Clockwise: false) }, sink.Commands);
    }

    [Theory]
    [InlineData("""[{"VibrateCmd":{"Id":9,"DeviceIndex":0,"Speeds":[{"Index":0,"Speed":0.5},{"Index":1,"Speed":1.1}]}}]""", 9)]
    [InlineData("""[{"VibrateCmd":{"Id":9,"DeviceIndex":0,"Speeds":[{"Index":0,"Speed":0.5},{"Index":0,"Speed":0.7}]}}]""", 9)]
    [InlineData("""[{"VibrateCmd":{"Id":9,"DeviceIndex":0,"Speeds":[{"Index":2,"Speed":0.5}]}}]""", 9)]
    [InlineData("""[{"VibrateCmd":{"Id":9,"DeviceIndex":1,"Speeds":[{"Index":0,"Speed":0.5}]}}]""", 9)]
    [InlineData("""[{"VibrateCmd":{"Id":9,"DeviceIndex":0,"Speeds":[]}}]""", 9)]
    [InlineData("""[{"VibrateCmd":{"Id":9,"DeviceIndex":0,"Speeds":[{"Index":0,"Speed":0.5,"Speed":0.7}]}}]""", 0)]
    [InlineData("""[{"ScalarCmd":{"Id":9,"DeviceIndex":0,"Scalars":[{"Index":0,"Scalar":0.5,"ActuatorType":"Vibrate"}]}}]""", 9)]
    [InlineData("""[{"OutputCmd":{"Id":9,"DeviceIndex":0,"FeatureIndex":0,"Command":{"Position":{"Value":500}}}}]""", 9)]
    [InlineData("""[{"BatteryLevelCmd":{"Id":9,"DeviceIndex":0}}]""", 9)]
    public void Invalid_or_wrong_version_commands_reject_the_entire_command_without_publishing_a_prefix(string command, int errorId)
    {
        var sink = new Sink(); using var session = Connected(sink);
        using var reply = JsonDocument.Parse(session.Process(command));
        Assert.Equal(errorId, Assert.Single(reply.RootElement.EnumerateArray()).GetProperty("Error").GetProperty("Id").GetInt32());
        Assert.Empty(sink.Commands);
    }

    [Fact]
    public void Non_vibration_scalars_are_not_advertised_or_silently_relabelled_for_legacy_clients()
    {
        var config = Config();
        config.Features.RemoveAll(feature => feature.ScalarType == "Vibrate" && feature.Actuator == "Scalar");
        var sink = new Sink(); using var session = Connected(sink, config);
        using var list = JsonDocument.Parse(session.Process("""[{"RequestDeviceList":{"Id":2}}]"""));
        var messages = list.RootElement[0].GetProperty("DeviceList").GetProperty("Devices")[0].GetProperty("DeviceMessages");
        Assert.False(messages.TryGetProperty("VibrateCmd", out _));
        Assert.True(messages.TryGetProperty("LinearCmd", out _));
        using var rejected = JsonDocument.Parse(session.Process("""[{"VibrateCmd":{"Id":3,"DeviceIndex":0,"Speeds":[{"Index":0,"Speed":0.6}]}}]"""));
        Assert.True(rejected.RootElement[0].TryGetProperty("Error", out _));
        Assert.Empty(sink.Commands);
    }

    [Fact]
    public void Scanning_and_stop_use_v2_events_and_reply_ids_without_starting_motion()
    {
        var sink = new Sink(); using var session = Connected(sink);
        using var scan = JsonDocument.Parse(session.Process("""[{"StartScanning":{"Id":7}}]"""));
        Assert.Equal(7, scan.RootElement[0].GetProperty("Ok").GetProperty("Id").GetInt32());
        var added = scan.RootElement[1].GetProperty("DeviceAdded");
        Assert.Equal(0, added.GetProperty("Id").GetInt32());
        Assert.Equal(2, added.GetProperty("DeviceMessages").GetProperty("VibrateCmd").GetProperty("FeatureCount").GetInt32());
        Assert.True(scan.RootElement[2].TryGetProperty("ScanningFinished", out _));
        Ok(session.Process("""[{"StopDeviceCmd":{"Id":8,"DeviceIndex":0}}]"""), 8);
        Ok(session.Process("""[{"StopAllDevices":{"Id":9}}]"""), 9);
        Assert.Equal(2, sink.Stops);
        Assert.Empty(sink.Commands);
    }

    [Fact]
    public void Legacy_commands_cannot_replace_protocol_ping_or_revive_a_timed_out_session()
    {
        var clock = new ManualTimeProvider(); var config = Config(); config.TimeoutMs = 1000;
        var sink = new Sink(); using var session = new ButtplugInputSession(config, sink, clock);
        session.Process(Handshake);
        clock.Advance(TimeSpan.FromMilliseconds(500));
        Ok(session.Process("""[{"Ping":{"Id":2}}]"""), 2);
        clock.Advance(TimeSpan.FromMilliseconds(900));
        Ok(session.Process("""[{"VibrateCmd":{"Id":3,"DeviceIndex":0,"Speeds":[{"Index":0,"Speed":0.5}]}}]"""), 3);
        clock.Advance(TimeSpan.FromMilliseconds(100));
        using var reply = JsonDocument.Parse(session.Process("""[{"Ping":{"Id":4}}]"""));
        Assert.True(reply.RootElement[0].TryGetProperty("Error", out _));
        Assert.Equal(1, sink.Releases);
        Assert.Single(sink.Commands);
    }

    [Fact]
    public async Task A_real_legacy_WebSocket_connects_from_any_website_and_preserves_timed_targets_without_taking_over_an_existing_owner()
    {
        var config = Config(); config.Port = FreePort();
        using var store = new ExternalControlStore();
        await using var listeners = new ProtocolInputCoordinator(store, _ => { });
        await listeners.ReloadAsync([config]);
        using var first = new ClientWebSocket(); first.Options.SetRequestHeader("Origin", "https://legacy-player.example");
        using var second = new ClientWebSocket(); second.Options.SetRequestHeader("Origin", "https://different-player.example");
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var address = new Uri($"ws://127.0.0.1:{config.Port}");
        await first.ConnectAsync(address, deadline.Token); await second.ConnectAsync(address, deadline.Token);
        Assert.Equal(2, (await Exchange(first, Handshake, deadline.Token))[0].GetProperty("ServerInfo").GetProperty("MessageVersion").GetInt32());
        var refused = await Exchange(second, Handshake, deadline.Token);
        Assert.Equal(4, refused[0].GetProperty("Error").GetProperty("ErrorCode").GetInt32());
        var accepted = await Exchange(first, """[{"LinearCmd":{"Id":3,"DeviceIndex":0,"Vectors":[{"Index":0,"Position":0.75,"Duration":450}]}}]""", deadline.Token);
        Assert.True(accepted[0].TryGetProperty("Ok", out _));
        Assert.Equal(.75f, store.Read(config.Id + "/L0/target", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()).Value);
        var released = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        store.Changed += () => { if (store.GetStatus(config.Id)?.Session is null) released.TrySetResult(); };
        await first.CloseAsync(WebSocketCloseStatus.NormalClosure, "", deadline.Token);
        await released.Task.WaitAsync(deadline.Token);
        var retry = await Exchange(second, Handshake, deadline.Token);
        Assert.True(retry[0].TryGetProperty("ServerInfo", out _));
        Assert.Empty(store.GetStatus(config.Id)!.Channels);
        await second.CloseAsync(WebSocketCloseStatus.NormalClosure, "", deadline.Token);
    }

    private static int FreePort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }
    private static async Task<JsonElement> Exchange(ClientWebSocket socket, string json, CancellationToken cancellation)
    {
        await socket.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, cancellation);
        using var buffer = new MemoryStream(); var chunk = new byte[2048]; ValueWebSocketReceiveResult frame;
        do
        {
            frame = await socket.ReceiveAsync(chunk.AsMemory(), cancellation);
            Assert.Equal(WebSocketMessageType.Text, frame.MessageType);
            buffer.Write(chunk, 0, frame.Count);
        } while (!frame.EndOfMessage);
        using var reply = JsonDocument.Parse(buffer.ToArray()); return reply.RootElement.Clone();
    }
    private static ProtocolInputConfig Config() => new()
    {
        Id = "legacy", Type = "Buttplug", Enabled = true, RouteToMotion = false,
        Features = [
            new() { Channel = "oscillate", Name = "Oscillation", Actuator = "Scalar", ScalarType = "Oscillate", TargetAxis = "" },
            new() { Channel = "L0", Name = "Position", Actuator = "Position", TargetAxis = "" },
            new() { Channel = "vibrate-a", Name = "First vibration", Actuator = "Scalar", ScalarType = "Vibrate", TargetAxis = "" },
            new() { Channel = "led", Name = "LED", Actuator = "Scalar", ScalarType = "Led", TargetAxis = "" },
            new() { Channel = "rotation", Name = "Rotation", Actuator = "Rotation", TargetAxis = "" },
            new() { Channel = "vibrate-b", Name = "Second vibration", Actuator = "Scalar", ScalarType = "Vibrate", TargetAxis = "" },
        ],
    };
    private static ButtplugInputSession Connected(Sink sink, ProtocolInputConfig? config = null)
    {
        var session = new ButtplugInputSession(config ?? Config(), sink); session.Process(Handshake); return session;
    }
    private static void Ok(string json, int id)
    {
        using var reply = JsonDocument.Parse(json);
        Assert.Equal(id, Assert.Single(reply.RootElement.EnumerateArray()).GetProperty("Ok").GetProperty("Id").GetInt32());
    }
    private sealed class Sink : IExternalControlSink
    {
        public readonly List<ExternalControlCommand> Commands = [];
        public int Stops, Releases;
        public bool TryAcquire(string inputId, string sessionId, out string error) { error = ""; return true; }
        public bool Publish(string inputId, string sessionId, IReadOnlyList<ExternalControlCommand> commands, out string error) { error = ""; Commands.AddRange(commands); return true; }
        public void Stop(string inputId, string sessionId, string? channel = null) => Stops++;
        public void Release(string inputId, string sessionId) => Releases++;
        public void Heartbeat(string inputId, string sessionId) { }
    }
}
