using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Buttplug.Client;
using Buttplug.Core.Messages;
using Sensa.Input.Protocols;
using Sensa.Outputs.Intiface;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Virtual-device input contracts. All delivery uses a fake sink; no engine or hardware starts.</summary>
public sealed class ButtplugInputContracts
{
    private const string V3Handshake = """[{"RequestServerInfo":{"Id":1,"ClientName":"isolated client","MessageVersion":3}}]""";
    private const string V4Handshake = """[{"RequestServerInfo":{"Id":1,"ClientName":"isolated client","ProtocolVersionMajor":4,"ProtocolVersionMinor":0}}]""";

    [Theory]
    [InlineData(3)]
    [InlineData(4)]
    public void Handshake_selects_the_actual_wire_schema_and_only_advertises_configured_capabilities(int version)
    {
        var sink = new Sink();
        using var session = new ButtplugInputSession(Config(), sink);
        using var handshake = JsonDocument.Parse(session.Process(version == 3 ? V3Handshake : V4Handshake));
        var info = handshake.RootElement[0].GetProperty("ServerInfo");
        Assert.Equal(1, info.GetProperty("Id").GetInt32());
        Assert.Equal(version, info.GetProperty(version == 3 ? "MessageVersion" : "ProtocolVersionMajor").GetInt32());
        using var list = JsonDocument.Parse(session.Process("""[{"RequestDeviceList":{"Id":2}}]"""));
        var devices = list.RootElement[0].GetProperty("DeviceList").GetProperty("Devices");
        if (version == 3)
        {
            var messages = devices[0].GetProperty("DeviceMessages");
            Assert.Single(messages.GetProperty("LinearCmd").EnumerateArray());
            Assert.Equal("Linear", messages.GetProperty("LinearCmd")[0].GetProperty("ActuatorType").GetString());
            Assert.Single(messages.GetProperty("ScalarCmd").EnumerateArray());
            Assert.Single(messages.GetProperty("RotateCmd").EnumerateArray());
        }
        else
        {
            var features = devices.GetProperty("0").GetProperty("DeviceFeatures");
            Assert.Equal(3, features.EnumerateObject().Count());
            Assert.Equal(1000, features.GetProperty("0").GetProperty("Output").GetProperty("HwPositionWithDuration").GetProperty("Value")[1].GetInt32());
            Assert.Equal(-1000, features.GetProperty("2").GetProperty("Output").GetProperty("Rotate").GetProperty("Value")[0].GetInt32());
        }
        Assert.Empty(sink.Commands);
        Assert.Equal(1, sink.Acquisitions);
    }

    [Fact]
    public void V3_linear_duration_and_per_command_family_indices_are_preserved()
    {
        var config = Config();
        config.Features.Reverse(); // Global feature0 is rotation; linear Index0 still resolves the position feature.
        var sink = new Sink();
        using var session = Connected(config, sink, 3);
        AssertOk(session.Process("""[{"LinearCmd":{"Id":7,"DeviceIndex":0,"Vectors":[{"Index":0,"Duration":450,"Position":0.25}]}}]"""), 7);
        Assert.Equal(new ExternalControlCommand("L0", .25, 450), Assert.Single(sink.Commands));
    }

    [Fact]
    public void V3_scalar_and_rotation_preserve_distinct_meanings_and_direction()
    {
        var sink = new Sink();
        using var session = Connected(Config(), sink, 3);
        var reply = session.Process("""[{"ScalarCmd":{"Id":3,"DeviceIndex":0,"Scalars":[{"Index":0,"Scalar":0.4,"ActuatorType":"Vibrate"}]}},{"RotateCmd":{"Id":4,"DeviceIndex":0,"Rotations":[{"Index":0,"Speed":0.7,"Clockwise":false}]}}]""");
        using var document = JsonDocument.Parse(reply);
        Assert.Equal(2, document.RootElement.GetArrayLength());
        Assert.Equal(new ExternalControlCommand("V0", .4), sink.Commands[0]);
        Assert.Equal(new ExternalControlCommand("R0", .7, Clockwise: false), sink.Commands[1]);
    }

    [Theory]
    [InlineData("Position", 0, 750, 0, "L0", .75, true)]
    [InlineData("HwPositionWithDuration", 0, 250, 400, "L0", .25, true)]
    [InlineData("Vibrate", 1, 550, 0, "V0", .55, true)]
    [InlineData("Rotate", 2, -700, 0, "R0", .7, false)]
    public void V4_values_follow_advertised_integer_ranges(string type, int index, int value, int duration, string channel, double expected, bool clockwise)
    {
        var sink = new Sink();
        using var session = Connected(Config(), sink, 4);
        var arguments = type == "HwPositionWithDuration" ? new { Value = value, Duration = duration } as object : new { Value = value };
        var message = JsonSerializer.Serialize(new[] { new { OutputCmd = new { Id = 20, DeviceIndex = 0, FeatureIndex = index, Command = new Dictionary<string, object> { [type] = arguments } } } });
        AssertOk(session.Process(message), 20);
        Assert.Equal(new ExternalControlCommand(channel, expected, duration, clockwise), Assert.Single(sink.Commands));
    }

    [Theory]
    [InlineData("""[{"LinearCmd":{"Id":2,"DeviceIndex":0,"Vectors":[{"Index":0,"Duration":100,"Position":0.5}]}}]""")]
    [InlineData("""[{"Ping":{"Id":2}}]""")]
    [InlineData("""[{"RequestDeviceList":{"Id":2}}]""")]
    public void No_operation_is_accepted_before_handshake(string message)
    {
        var sink = new Sink();
        using var session = new ButtplugInputSession(Config(), sink);
        AssertError(session.Process(message), 2);
        Assert.Equal(0, sink.Acquisitions);
        Assert.Empty(sink.Commands);
    }

    [Theory]
    [InlineData("""[{"RequestServerInfo":{"Id":1,"ClientName":"test","MessageVersion":2}}]""")]
    [InlineData("""[{"RequestServerInfo":{"Id":1,"ClientName":"test","ProtocolVersionMajor":5,"ProtocolVersionMinor":0}}]""")]
    [InlineData("""[{"RequestServerInfo":{"Id":1,"ClientName":"test","MessageVersion":3,"ProtocolVersionMajor":4}}]""")]
    [InlineData("""[{"RequestServerInfo":{"Id":1,"ClientName":"","MessageVersion":3}}]""")]
    public void Unsupported_or_ambiguous_handshakes_never_acquire_control(string message)
    {
        var sink = new Sink();
        using var session = new ButtplugInputSession(Config(), sink);
        AssertError(session.Process(message), 1);
        Assert.Equal(0, sink.Acquisitions);
    }

    [Theory]
    [InlineData("""[{"LinearCmd":{"Id":5,"DeviceIndex":1,"Vectors":[{"Index":0,"Duration":100,"Position":0.5}]}}]""")]
    [InlineData("""[{"LinearCmd":{"Id":5,"DeviceIndex":0,"Vectors":[{"Index":1,"Duration":100,"Position":0.5}]}}]""")]
    [InlineData("""[{"LinearCmd":{"Id":5,"DeviceIndex":0,"Vectors":[{"Index":0,"Duration":100,"Position":1.1}]}}]""")]
    [InlineData("""[{"LinearCmd":{"Id":5,"DeviceIndex":0,"Vectors":[{"Index":0,"Duration":600001,"Position":0.5}]}}]""")]
    [InlineData("""[{"LinearCmd":{"Id":5,"DeviceIndex":0,"Vectors":[{"Index":0,"Duration":-1,"Position":0.5}]}}]""")]
    [InlineData("""[{"LinearCmd":{"Id":5,"DeviceIndex":0,"Vectors":[{"Index":0,"Duration":100,"Position":1e999}]}}]""")]
    [InlineData("""[{"ScalarCmd":{"Id":5,"DeviceIndex":0,"Scalars":[{"Index":0,"Scalar":0.5,"ActuatorType":"Inflate"}]}}]""")]
    [InlineData("""[{"RotateCmd":{"Id":5,"DeviceIndex":0,"Rotations":[{"Index":0,"Speed":0.5,"Clockwise":1}]}}]""")]
    [InlineData("""[{"OutputCmd":{"Id":5,"DeviceIndex":0,"FeatureIndex":0,"Command":{"Position":{"Value":500}}}}]""")]
    public void V3_invalid_device_feature_value_type_duration_or_wrong_version_never_publish(string message)
    {
        var sink = new Sink();
        using var session = Connected(Config(), sink, 3);
        AssertError(session.Process(message), 5);
        Assert.Empty(sink.Commands);
    }

    [Theory]
    [InlineData("""[{"OutputCmd":{"Id":5,"DeviceIndex":0,"FeatureIndex":0,"Command":{"Position":{"Value":1001}}}}]""")]
    [InlineData("""[{"OutputCmd":{"Id":5,"DeviceIndex":0,"FeatureIndex":0,"Command":{"Position":{"Value":0.5}}}}]""")]
    [InlineData("""[{"OutputCmd":{"Id":5,"DeviceIndex":0,"FeatureIndex":0,"Command":{"Vibrate":{"Value":500}}}}]""")]
    [InlineData("""[{"OutputCmd":{"Id":5,"DeviceIndex":0,"FeatureIndex":10,"Command":{"Position":{"Value":500}}}}]""")]
    [InlineData("""[{"OutputCmd":{"Id":5,"DeviceIndex":0,"FeatureIndex":0,"Command":{"Position":{"Value":500},"Vibrate":{"Value":500}}}}]""")]
    [InlineData("""[{"OutputCmd":{"Id":5,"DeviceIndex":0,"FeatureIndex":0,"Command":{"HwPositionWithDuration":{"Value":500}}}}]""")]
    [InlineData("""[{"LinearCmd":{"Id":5,"DeviceIndex":0,"Vectors":[{"Index":0,"Duration":100,"Position":0.5}]}}]""")]
    public void V4_invalid_or_wrong_version_commands_never_publish(string message)
    {
        var sink = new Sink();
        using var session = Connected(Config(), sink, 4);
        AssertError(session.Process(message), 5);
        Assert.Empty(sink.Commands);
    }

    [Fact]
    public void A_multi_actuator_command_is_fully_validated_before_any_delivery()
    {
        var config = Config();
        config.Features.Add(new() { Channel = "L1", Name = "Second position", Actuator = "Position", TargetAxis = "L1" });
        var sink = new Sink();
        using var session = Connected(config, sink, 3);
        AssertError(session.Process("""[{"LinearCmd":{"Id":5,"DeviceIndex":0,"Vectors":[{"Index":0,"Duration":100,"Position":0.5},{"Index":1,"Duration":100,"Position":-0.1}]}}]"""), 5);
        Assert.Empty(sink.Commands);
        AssertError(session.Process("""[{"LinearCmd":{"Id":5,"DeviceIndex":0,"Vectors":[{"Index":0,"Duration":100,"Position":0.5},{"Index":0,"Duration":100,"Position":0.7}]}}]"""), 5);
        Assert.Empty(sink.Commands);
    }

    [Theory]
    [InlineData("not JSON")]
    [InlineData("{}")]
    [InlineData("[]")]
    [InlineData("""[{"Ping":{"Id":0}}]""")]
    [InlineData("""[{"Ping":{"Id":1,"Id":2}}]""")]
    [InlineData("""[{"Ping":{"Id":1},"StopAllDevices":{"Id":2}}]""")]
    public void Malformed_or_ambiguous_envelopes_return_errors_without_side_effects(string message)
    {
        var sink = new Sink();
        using var session = Connected(Config(), sink, 3);
        using var reply = JsonDocument.Parse(session.Process(message));
        Assert.True(reply.RootElement[0].TryGetProperty("Error", out _));
        Assert.Empty(sink.Commands);
        Assert.Empty(sink.Stops);
    }

    [Fact]
    public void Text_size_and_batch_count_are_bounded()
    {
        var sink = new Sink();
        using var session = Connected(Config(), sink, 3);
        AssertError(session.Process(new string(' ', ButtplugInputSession.MaximumMessageBytes + 1)), 0);
        var oversized = "[" + string.Join(',', Enumerable.Repeat("{\"Ping\":{\"Id\":2}}", 129)) + "]";
        AssertError(session.Process(oversized), 0);
        Assert.Empty(sink.Commands);
    }

    [Fact]
    public void Scanning_announces_a_virtual_device_once_and_preserves_reply_correlation()
    {
        var sink = new Sink();
        using var session = Connected(Config(), sink, 3);
        using var first = JsonDocument.Parse(session.Process("""[{"StartScanning":{"Id":30}}]"""));
        Assert.Equal(30, first.RootElement[0].GetProperty("Ok").GetProperty("Id").GetInt32());
        Assert.Equal(0, first.RootElement[1].GetProperty("DeviceAdded").GetProperty("Id").GetInt32());
        Assert.Equal(0, first.RootElement[2].GetProperty("ScanningFinished").GetProperty("Id").GetInt32());
        using var next = JsonDocument.Parse(session.Process("""[{"StartScanning":{"Id":31}}]"""));
        Assert.Equal(2, next.RootElement.GetArrayLength());
        Assert.Empty(sink.Commands);
    }

    [Fact]
    public void V4_stop_selection_matches_device_feature_and_outputs_flag()
    {
        var sink = new Sink();
        using var session = Connected(Config(), sink, 4);
        AssertOk(session.Process("""[{"StopCmd":{"Id":3,"DeviceIndex":0,"FeatureIndex":1}}]"""), 3);
        Assert.Equal("V0", Assert.Single(sink.Stops));
        AssertOk(session.Process("""[{"StopCmd":{"Id":4,"DeviceIndex":0,"Inputs":true,"Outputs":false}}]"""), 4);
        Assert.Single(sink.Stops);
        AssertOk(session.Process("""[{"StopCmd":{"Id":5,"FeatureIndex":100}}]"""), 5);
        Assert.Null(sink.Stops[1]);
        AssertError(session.Process("""[{"StopCmd":{"Id":6,"DeviceIndex":0,"FeatureIndex":99}}]"""), 6);
        Assert.Equal(2, sink.Stops.Count);
    }

    [Fact]
    public void Single_owner_failure_and_sink_rejection_are_reported_as_errors()
    {
        var sink = new Sink { AllowAcquire = false };
        using var session = new ButtplugInputSession(Config(), sink);
        AssertError(session.Process(V3Handshake), 1);
        sink.AllowAcquire = true;
        Assert.True(JsonDocument.Parse(session.Process(V3Handshake)).RootElement[0].TryGetProperty("ServerInfo", out _));
        sink.AllowPublish = false;
        AssertError(session.Process("""[{"LinearCmd":{"Id":4,"DeviceIndex":0,"Vectors":[{"Index":0,"Duration":100,"Position":0.5}]}}]"""), 4);
        Assert.Empty(sink.Commands);
    }

    [Fact]
    public void Expiration_and_disposal_stop_and_release_exactly_once_without_reactivation()
    {
        var clock = new Clock();
        var sink = new Sink();
        var session = new ButtplugInputSession(Config(), sink, clock);
        Assert.True(JsonDocument.Parse(session.Process(V3Handshake)).RootElement[0].TryGetProperty("ServerInfo", out _));
        clock.Advance(1000);
        AssertError(session.Process("""[{"Ping":{"Id":2}}]"""), 0);
        session.Dispose();
        Assert.Single(sink.Stops);
        Assert.Equal(1, sink.Releases);
        AssertError(session.Process(V3Handshake), 0);
        Assert.Equal(1, sink.Acquisitions);
    }

    [Fact]
    public void Commands_do_not_replace_the_ping_promised_by_ServerInfo()
    {
        var clock = new Clock();
        var sink = new Sink();
        using var session = new ButtplugInputSession(Config(), sink, clock);
        session.Process(V3Handshake);
        clock.Advance(500);
        AssertOk(session.Process("""[{"LinearCmd":{"Id":2,"DeviceIndex":0,"Vectors":[{"Index":0,"Duration":100,"Position":0.5}]}}]"""), 2);
        clock.Advance(500);
        AssertError(session.Process("""[{"LinearCmd":{"Id":3,"DeviceIndex":0,"Vectors":[{"Index":0,"Duration":100,"Position":0.7}]}}]"""), 0);
        Assert.Single(sink.Commands);
        Assert.Equal(1, sink.Releases);
    }

    [Fact]
    public void Protocol_ping_refreshes_the_connection_without_replaying_commands()
    {
        var clock = new Clock();
        var sink = new Sink();
        using var session = new ButtplugInputSession(Config(), sink, clock);
        session.Process(V4Handshake);
        clock.Advance(700);
        AssertOk(session.Process("""[{"Ping":{"Id":2}}]"""), 2);
        clock.Advance(700);
        AssertOk(session.Process("""[{"Ping":{"Id":3}}]"""), 3);
        Assert.Empty(sink.Commands);
        Assert.Equal(0, sink.Releases);
    }

    [Fact]
    public void V4_disconnect_stops_releases_and_ends_the_batch_before_later_commands()
    {
        var sink = new Sink();
        using var session = Connected(Config(), sink, 4);
        AssertOk(session.Process("""[{"Disconnect":{"Id":4}},{"OutputCmd":{"Id":5,"DeviceIndex":0,"FeatureIndex":0,"Command":{"Position":{"Value":500}}}}]"""), 4);
        Assert.Empty(sink.Commands);
        Assert.Single(sink.Stops);
        Assert.Equal(1, sink.Releases);
    }

    [Fact]
    public async Task The_pinned_real_v4_client_discovers_features_sends_timed_position_and_stops()
    {
        // The existing output adapter serializes upstream5.0.1 metadata initialization for parallel tests.
        System.Runtime.CompilerServices.RuntimeHelpers.RunClassConstructor(typeof(IntifaceOutputClient).TypeHandle);
        var sink = new Sink();
        var config = Config();
        config.TimeoutMs = 60000;
        using var session = new ButtplugInputSession(config, sink);
        using var connector = new JsonConnector(session);
        var client = new ButtplugClient("Isolated real v4 client");
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try
        {
            await client.ConnectAsync(connector, deadline.Token);
            var device = Assert.Single(client.Devices);
            var position = Assert.Single(device.GetFeaturesWithOutput(OutputType.HwPositionWithDuration));
            await position.RunOutputAsync(DeviceOutput.PositionWithDuration.Percent(.375, 275), deadline.Token);
            Assert.Equal(new ExternalControlCommand("L0", .375, 275), Assert.Single(sink.Commands));
            await client.StopAllDevicesAsync(deadline.Token);
            Assert.Null(Assert.Single(sink.Stops));
            Assert.Equal(4, connector.NegotiatedVersion);
        }
        finally { await client.DisconnectAsync().WaitAsync(deadline.Token); }
    }

    [Theory]
    [InlineData("Vibrate")]
    [InlineData("Oscillate")]
    [InlineData("Constrict")]
    [InlineData("Led")]
    [InlineData("Temperature")]
    [InlineData("Spray")]
    public void V4_scalar_output_type_is_advertised_and_cannot_be_replaced_by_another_type(string type)
    {
        var config = Config();
        config.Features = [new() { Channel = "typed-scalar", Name = type, Actuator = "Scalar", ScalarType = type, TargetAxis = "" }];
        var sink = new Sink();
        using var session = Connected(config, sink, 4);
        using var list = JsonDocument.Parse(session.Process("""[{"RequestDeviceList":{"Id":2}}]"""));
        var output = list.RootElement[0].GetProperty("DeviceList").GetProperty("Devices").GetProperty("0")
            .GetProperty("DeviceFeatures").GetProperty("0").GetProperty("Output");
        Assert.Equal(type, Assert.Single(output.EnumerateObject()).Name);
        string Command(string outputType) => JsonSerializer.Serialize(new[] { new { OutputCmd = new { Id = 3, DeviceIndex = 0,
            FeatureIndex = 0, Command = new Dictionary<string, object> { [outputType] = new { Value = 500 } } } } });
        AssertOk(session.Process(Command(type)), 3);
        Assert.Equal(new ExternalControlCommand("typed-scalar", .5), Assert.Single(sink.Commands));
        AssertError(session.Process(Command(type == "Vibrate" ? "Constrict" : "Vibrate")), 3);
        Assert.Single(sink.Commands);
    }

    [Fact]
    public void V3_scalar_metadata_and_indices_filter_newer_types_without_aliasing_their_meaning()
    {
        var config = Config();
        config.Features = new[] { "Led", "Oscillate", "Temperature", "Constrict", "Spray", "Vibrate" }
            .Select(type => new ProtocolFeatureConfig { Channel = type, Name = type, Actuator = "Scalar", ScalarType = type, TargetAxis = "" }).ToList();
        var sink = new Sink();
        using var session = Connected(config, sink, 3);
        using var list = JsonDocument.Parse(session.Process("""[{"RequestDeviceList":{"Id":2}}]"""));
        var scalars = list.RootElement[0].GetProperty("DeviceList").GetProperty("Devices")[0].GetProperty("DeviceMessages").GetProperty("ScalarCmd");
        Assert.Equal(new[] { "Oscillate", "Constrict", "Vibrate" }, scalars.EnumerateArray().Select(value => value.GetProperty("ActuatorType").GetString()).ToArray());
        AssertOk(session.Process("""[{"ScalarCmd":{"Id":4,"DeviceIndex":0,"Scalars":[{"Index":0,"Scalar":0.25,"ActuatorType":"Oscillate"},{"Index":1,"Scalar":0.5,"ActuatorType":"Constrict"}]}}]"""), 4);
        Assert.Equal(new ExternalControlCommand("Oscillate", .25), sink.Commands[0]);
        Assert.Equal(new ExternalControlCommand("Constrict", .5), sink.Commands[1]);
        AssertError(session.Process("""[{"ScalarCmd":{"Id":5,"DeviceIndex":0,"Scalars":[{"Index":0,"Scalar":0.5,"ActuatorType":"Vibrate"}]}}]"""), 5);
        AssertError(session.Process("""[{"ScalarCmd":{"Id":6,"DeviceIndex":0,"Scalars":[{"Index":3,"Scalar":0.5,"ActuatorType":"Led"}]}}]"""), 6);
        Assert.Equal(2, sink.Commands.Count);
    }

    [Theory]
    [InlineData(OutputType.Oscillate)]
    [InlineData(OutputType.Constrict)]
    public async Task The_real_v4_client_preserves_configured_non_vibration_scalar_features(OutputType type)
    {
        System.Runtime.CompilerServices.RuntimeHelpers.RunClassConstructor(typeof(IntifaceOutputClient).TypeHandle);
        var config = Config();
        config.TimeoutMs = 60000;
        config.Features = [new() { Channel = "typed-scalar", Name = type.ToString(), Actuator = "Scalar", ScalarType = type.ToString(), TargetAxis = "" }];
        var sink = new Sink();
        using var session = new ButtplugInputSession(config, sink);
        using var connector = new JsonConnector(session);
        var client = new ButtplugClient("Isolated typed scalar client");
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try
        {
            await client.ConnectAsync(connector, deadline.Token);
            var feature = Assert.Single(Assert.Single(client.Devices).GetFeaturesWithOutput(type));
            var command = type == OutputType.Oscillate ? DeviceOutput.Oscillate.Percent(.625) : DeviceOutput.Constrict.Percent(.625);
            await feature.RunOutputAsync(command, deadline.Token);
            Assert.Equal(new ExternalControlCommand("typed-scalar", .625), Assert.Single(sink.Commands));
        }
        finally { await client.DisconnectAsync().WaitAsync(deadline.Token); }
    }

    [Fact]
    public async Task Transport_reassembles_fragmented_text_and_releases_on_close()
    {
        var sink = new Sink();
        using var session = new ButtplugInputSession(Config(), sink);
        using var socket = new FragmentSocket([
            (WebSocketMessageType.Text, V3Handshake[..30], false),
            (WebSocketMessageType.Text, V3Handshake[30..], true),
            (WebSocketMessageType.Close, "", true)]);
        await session.RunAsync(socket);
        Assert.True(JsonDocument.Parse(Assert.Single(socket.Sent)).RootElement[0].TryGetProperty("ServerInfo", out _));
        Assert.Single(sink.Stops);
        Assert.Equal(1, sink.Releases);
    }

    [Fact]
    public async Task Transport_rejects_binary_payloads_without_acquiring_control()
    {
        var sink = new Sink();
        using var session = new ButtplugInputSession(Config(), sink);
        using var socket = new FragmentSocket([(WebSocketMessageType.Binary, V3Handshake, true)]);
        await session.RunAsync(socket);
        Assert.Empty(socket.Sent);
        Assert.Equal(WebSocketCloseStatus.InvalidPayloadData, socket.CloseStatus);
        Assert.Equal(0, sink.Acquisitions);
    }

    private static ProtocolInputConfig Config() => new()
    {
        Id = "buttplug-input", Name = "Sensa test virtual device", Type = "Buttplug", Enabled = true, TimeoutMs = 1000,
        Features = [
            new() { Channel = "L0", Name = "Stroke", Actuator = "Position", TargetAxis = "L0" },
            new() { Channel = "V0", Name = "Intensity", Actuator = "Scalar", TargetAxis = "V0" },
            new() { Channel = "R0", Name = "Rotation speed", Actuator = "Rotation", TargetAxis = "R0" },
        ],
    };
    private static ButtplugInputSession Connected(ProtocolInputConfig config, Sink sink, int version)
    {
        var session = new ButtplugInputSession(config, sink);
        session.Process(version == 3 ? V3Handshake : V4Handshake);
        return session;
    }
    private static void AssertOk(string json, uint id)
    {
        using var document = JsonDocument.Parse(json);
        Assert.Equal(id, Assert.Single(document.RootElement.EnumerateArray()).GetProperty("Ok").GetProperty("Id").GetUInt32());
    }
    private static void AssertError(string json, uint id)
    {
        using var document = JsonDocument.Parse(json);
        Assert.Equal(id, Assert.Single(document.RootElement.EnumerateArray()).GetProperty("Error").GetProperty("Id").GetUInt32());
    }
    private sealed class Sink : IExternalControlSink
    {
        public readonly List<ExternalControlCommand> Commands = [];
        public readonly List<string?> Stops = [];
        public bool AllowAcquire = true;
        public bool AllowPublish = true;
        public int Acquisitions;
        public int Releases;
        public bool TryAcquire(string inputId, string sessionId, out string error) { error = AllowAcquire ? "" : "Busy"; if (AllowAcquire) Acquisitions++; return AllowAcquire; }
        public bool Publish(string inputId, string sessionId, IReadOnlyList<ExternalControlCommand> commands, out string error)
        { error = AllowPublish ? "" : "Disabled"; if (AllowPublish) Commands.AddRange(commands); return AllowPublish; }
        public void Stop(string inputId, string sessionId, string? channel = null) => Stops.Add(channel);
        public void Release(string inputId, string sessionId) => Releases++;
        public void Heartbeat(string inputId, string sessionId) { }
    }
    private sealed class Clock : TimeProvider
    {
        private long _timestamp;
        public override long TimestampFrequency => 1000;
        public override long GetTimestamp() => _timestamp;
        public void Advance(int milliseconds) => _timestamp += milliseconds;
    }
    private sealed class JsonConnector(ButtplugInputSession session) : ButtplugRemoteJSONConnector, IButtplugClientConnector
    {
        public event EventHandler? Disconnected;
        public bool Connected { get; private set; }
        public int NegotiatedVersion { get; private set; }
        public Task ConnectAsync(CancellationToken token = default) { Connected = true; return Task.CompletedTask; }
        public Task DisconnectAsync(CancellationToken token = default)
        {
            Connected = false;
            Disconnected?.Invoke(this, EventArgs.Empty);
            return Task.CompletedTask;
        }
        public async Task<ButtplugMessage> SendAsync(ButtplugMessage msg, CancellationToken token = default)
        {
            var outbound = PrepareMessage(msg, token);
            if (msg is RequestServerInfo request) NegotiatedVersion = (int)request.ProtocolVersionMajor;
            ReceiveMessages(session.Process(outbound.Message));
            return await outbound.Promise;
        }
    }
    private sealed class FragmentSocket(IEnumerable<(WebSocketMessageType Type, string Text, bool End)> parts) : WebSocket
    {
        private readonly Queue<(WebSocketMessageType Type, string Text, bool End)> _parts = new(parts);
        private WebSocketState _state = WebSocketState.Open;
        private WebSocketCloseStatus? _close;
        public readonly List<string> Sent = [];
        public override WebSocketCloseStatus? CloseStatus => _close;
        public override string? CloseStatusDescription => "test";
        public override string? SubProtocol => null;
        public override WebSocketState State => _state;
        public override void Abort() => _state = WebSocketState.Aborted;
        public override void Dispose() => _state = WebSocketState.Closed;
        public override Task CloseAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) => CloseOutputAsync(closeStatus, statusDescription, cancellationToken);
        public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) { _close = closeStatus; _state = WebSocketState.Closed; return Task.CompletedTask; }
        public override Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken cancellationToken)
        {
            var part = _parts.Dequeue();
            var bytes = Encoding.UTF8.GetBytes(part.Text);
            bytes.CopyTo(buffer.AsSpan());
            if (part.Type == WebSocketMessageType.Close) _state = WebSocketState.CloseReceived;
            return Task.FromResult(new WebSocketReceiveResult(bytes.Length, part.Type, part.End));
        }
        public override Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken)
        { Sent.Add(Encoding.UTF8.GetString(buffer)); return Task.CompletedTask; }
    }
}
