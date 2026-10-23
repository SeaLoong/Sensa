using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Sensa.Configuration;
using Sensa.Outputs;
using Sensa.Outputs.Dglab;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Coordinator integration through the real V4 client and an in-memory relay; no device is opened.</summary>
public sealed class DglabRoutingContracts
{
    private const string OutputId = "dglab", AppId = "app-one", SlotId = "coyote-one";
    private static readonly string[] Frames = ["0A0A0A0A01010101", "0A0A0A0A02020202", "0A0A0A0A03030303"];
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);
    private static SignalOutputBinding Binding(string id, string address, int channel = 0) => new()
    {
        Id = id, Name = id, Address = address, Channel = channel,
        Source = new() { SourceMode = "Manual", OscPath = id },
    };

    [Fact]
    public async Task Choosing_a_target_reuses_the_existing_pairing_without_sending_before_selection()
    {
        await using var rig = new Rig(Binding("strength", "Intensity"));
        rig.Output.Signal.ClientId = ""; rig.Output.Signal.SlotId = "";
        await rig.Coordinator.ReloadAsync();
        Assert.True(await rig.Coordinator.ConnectAsync(OutputId));
        var pairing = rig.Snapshot.GetProperty("pairingUrl").GetString();
        rig.Publish();
        Assert.Empty(rig.Socket.Requests);
        Assert.True(rig.Coordinator.IsConnected(OutputId));
        Assert.False(rig.Snapshot.GetProperty("routes")[0].GetProperty("valid").GetBoolean());

        await rig.Attach();
        rig.Output.Signal.ClientId = AppId; rig.Output.Signal.SlotId = SlotId;
        await rig.Coordinator.ReloadAsync();
        Assert.Single(rig.Clients);
        Assert.Equal(pairing, rig.Snapshot.GetProperty("pairingUrl").GetString());
        rig.Publish();
        var sent = await rig.Socket.NextRequest();
        Assert.Equal(4, Operation(sent)["t"]!.GetValue<int>());
        Assert.Equal(5, Operation(sent)["v"]!.GetValue<double>());
    }

    [Fact]
    public async Task Discovery_and_device_removal_keep_the_relay_available_without_invalid_target_commands()
    {
        await using var rig = new Rig(Binding("strength", "Intensity"));
        Assert.True(await rig.Coordinator.ConnectAsync(OutputId));
        rig.Publish();
        Assert.Empty(rig.Socket.Requests);
        Assert.True(rig.Coordinator.IsConnected(OutputId));
        await rig.Attach();
        rig.Publish(); await rig.Socket.NextRequest();
        await rig.Receive(new { type = "message", clientId = AppId, data = new
        { t = "ev", ev = "devices.patch", removed = new[] { SlotId } } });
        rig.Clock.Advance(TimeSpan.FromMilliseconds(200)); rig.Publish();
        Assert.Single(rig.Socket.Requests);
        Assert.True(rig.Coordinator.IsConnected(OutputId));
        Assert.False(rig.Snapshot.GetProperty("routes")[0].GetProperty("valid").GetBoolean());
    }

    [Fact]
    public async Task Command_failure_requires_explicit_reconnection_and_never_replays_a_previous_command()
    {
        await using var rig = new Rig(Binding("strength", "Intensity"));
        Assert.True(await rig.Coordinator.ConnectAsync(OutputId)); await rig.Attach();
        rig.Socket.Error = request => Operation(request)["t"]?.GetValue<int>() == 4 ? "device_busy" : null;
        rig.Publish(); await rig.Socket.NextRequest();
        await Until(() => rig.Snapshot.GetProperty("status").GetString() == "CommandError");
        Assert.False(rig.Coordinator.IsConnected(OutputId));
        rig.Clock.Advance(TimeSpan.FromMilliseconds(200)); rig.Publish();
        Assert.Single(rig.Socket.Requests);

        Assert.True(await rig.Coordinator.ConnectAsync(OutputId));
        Assert.Equal(2, rig.Clients.Count); await rig.Attach();
        Assert.Empty(rig.Socket.Requests);
        rig.Publish();
        Assert.Equal(4, Operation(await rig.Socket.NextRequest())["t"]!.GetValue<int>());
        Assert.True(rig.Coordinator.IsConnected(OutputId));
    }

    [Fact]
    public async Task Continuous_waveform_advances_in_100ms_frames_even_when_the_binding_requests_60Hz()
    {
        var pulse = Binding("wave", "Pulse"); pulse.SendMode = "FixedRate"; pulse.RateHz = 60;
        await using var rig = new Rig(pulse);
        Assert.True(await rig.Coordinator.ConnectAsync(OutputId)); await rig.Attach();
        rig.Publish();
        var first = Operation(await rig.Socket.NextRequest());
        Assert.Equal(Frames[0], first["v"]![0]!.GetValue<string>());
        for (var tick = 0; tick < 4; tick++)
        {
            rig.Clock.Advance(TimeSpan.FromMilliseconds(20)); rig.Publish();
            Assert.Single(rig.Socket.Requests);
        }
        rig.Clock.Advance(TimeSpan.FromMilliseconds(20)); rig.Publish();
        Assert.Equal(Frames[1], Operation(await rig.Socket.NextRequest())["v"]![0]!.GetValue<string>());
        rig.Clock.Advance(TimeSpan.FromMilliseconds(100)); rig.Publish();
        Assert.Equal(Frames[2], Operation(await rig.Socket.NextRequest())["v"]![0]!.GetValue<string>());
        rig.Clock.Advance(TimeSpan.FromMilliseconds(100)); rig.Publish();
        Assert.Equal(Frames[0], Operation(await rig.Socket.NextRequest())["v"]![0]!.GetValue<string>());
        Assert.Equal(4, rig.Socket.Requests.Count);
    }

    [Fact]
    public async Task Invalid_intensity_and_waveform_replace_only_their_own_task_type()
    {
        var pulse = Binding("wave", "Pulse"); pulse.SendMode = "OnEvent";
        await using var rig = new Rig(Binding("strength", "Intensity"), pulse);
        Assert.True(await rig.Coordinator.ConnectAsync(OutputId)); await rig.Attach();
        rig.Publish(); await rig.Socket.NextRequest(); await rig.Socket.NextRequest();
        rig.Clock.Advance(TimeSpan.FromMilliseconds(150));
        rig.Publish(input => input.OscPath == "strength" ? ComputedSignalSample.Invalid("expired") : rig.Sample());
        var intensityStop = Operation(await rig.Socket.NextRequest());
        Assert.Equal(4, intensityStop["t"]!.GetValue<int>());
        Assert.Equal(0, intensityStop["v"]!.GetValue<double>());
        Assert.Equal(100, intensityStop["d"]!.GetValue<int>());
        rig.Clock.Advance(TimeSpan.FromMilliseconds(150));
        rig.Publish(input => input.OscPath == "wave" ? ComputedSignalSample.Invalid("expired") : rig.Sample());
        var replacements = new[] { Operation(await rig.Socket.NextRequest()), Operation(await rig.Socket.NextRequest()) };
        var silence = Assert.Single(replacements, operation => operation["t"]!.GetValue<int>() == 0);
        Assert.Equal("0A0A0A0A00000000", silence["v"]![0]!.GetValue<string>());
        Assert.Equal(100, silence["d"]!.GetValue<int>());
        Assert.Contains(replacements, operation => operation["t"]!.GetValue<int>() == 4 && operation["v"]!.GetValue<double>() > 0);
        Assert.All(rig.Socket.Requests, request => Assert.Equal("device.op", request["data"]!["m"]!.GetValue<string>()));
    }

    [Fact]
    public async Task Global_stop_attempts_clear_and_zero_on_both_channels_when_channel_A_reports_an_error()
    {
        await using var rig = new Rig(Binding("a", "Intensity", 0), Binding("b", "Intensity", 1));
        Assert.True(await rig.Coordinator.ConnectAsync(OutputId)); await rig.Attach();
        rig.Socket.Error = request => Operation(request)["c"]?.GetValue<int>() == 0 ? "device_busy" : null;
        await rig.Coordinator.StopAsync();
        var operations = rig.Socket.Requests.Select(request =>
            (Method: request["data"]!["m"]!.GetValue<string>(), Channel: Operation(request)["c"]!.GetValue<int>(),
                Type: Operation(request)["t"]?.GetValue<int>())).ToArray();
        foreach (var channel in new[] { 0, 1 })
        {
            Assert.Contains(operations, operation => operation.Channel == channel && operation.Method == "device.op.clear");
            Assert.Contains(operations, operation => operation.Channel == channel && operation.Method == "device.op" && operation.Type == 7);
        }
    }

    [Fact]
    public async Task Stop_cancels_old_dispatched_replies_without_turning_the_next_generation_into_CommandError()
    {
        await using var rig = new Rig(Binding("strength", "Intensity"));
        Assert.True(await rig.Coordinator.ConnectAsync(OutputId)); await rig.Attach();
        rig.Socket.Drop = request => Operation(request)["t"]?.GetValue<int>() == 4;
        rig.Publish(); var previous = await rig.Socket.NextRequest();
        await rig.Coordinator.StopAsync();
        await rig.Receive(new { type = "message", clientId = AppId, data = new
        { t = "resp", reqId = previous["data"]!["reqId"]!.GetValue<string>(), error = "late_old_failure" } });
        rig.Clock.Advance(TimeSpan.FromMilliseconds(3000));
        await rig.Receive(new { type = "pong" });
        Assert.True(rig.Coordinator.IsConnected(OutputId));
        Assert.NotEqual("CommandError", rig.Snapshot.GetProperty("status").GetString());
        Assert.True(rig.Snapshot.GetProperty("error").ValueKind is JsonValueKind.Null or JsonValueKind.Undefined);
    }

    private static JsonObject Operation(JsonObject request) => request["data"]!["data"]!.AsObject();
    private static async Task Until(Func<bool> condition)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        while (!condition()) await Task.Delay(1, timeout.Token);
    }

    private sealed class Rig : IAsyncDisposable
    {
        public ManualTimeProvider Clock { get; } = new();
        public List<DglabV4Client> Clients { get; } = [];
        private readonly List<FakeSocket> _sockets = [];
        public FakeSocket Socket => _sockets[^1];
        private DglabV4Client Client => Clients[^1];
        public OutputDeviceConfig Output { get; }
        public SignalOutputCoordinator Coordinator { get; }
        public JsonElement Snapshot => JsonSerializer.SerializeToElement(Coordinator.Snapshot(OutputId), WebJson);
        public long Now => Clock.GetUtcNow().ToUnixTimeMilliseconds();
        public Rig(params SignalOutputBinding[] bindings)
        {
            Output = new() { Id = OutputId, Type = OutputDeviceType.Dglab, Enabled = true, Signal = new()
            {
                ServerUrl = "wss://relay.example/v4", ClientId = AppId, SlotId = SlotId,
                MaxIntensity = 10, TaskDurationMs = 250, WaveformFrames = Frames.ToList(), Bindings = bindings.ToList(),
            } };
            Coordinator = new(new() { Outputs = [Output] }, _ => false, (_, _) => Task.CompletedTask,
                _ => Task.CompletedTask, clock: Clock, dglabFactory: () =>
                {
                    var socket = new FakeSocket(); _sockets.Add(socket);
                    var client = new DglabV4Client(() => socket, Clock); Clients.Add(client); return client;
                }) { CanSend = () => true };
        }
        public ComputedSignalSample Sample() => ComputedSignalSample.Success(.5f, null, Now);
        public void Publish(Func<ComputedSignalInputConfig, ComputedSignalSample>? resolve = null) => Coordinator.Publish(resolve ?? (_ => Sample()), Now);
        public async Task Attach()
        {
            await Receive(new { type = "client_attached", clientId = AppId });
            await Receive(new { type = "message", clientId = AppId, data = new { t = "ev", ev = "devices.snapshot", devices = new[]
            {
                new { slotId = SlotId, name = "Coyote", type = "COYOTE_030", props = new { power = 80 }, slotState = new
                { hasDevice = true, channelA = new { intensityMax = 50, isMuted = false }, channelB = new { intensityMax = 50, isMuted = false } } },
            } } });
        }
        public async Task Receive(object message)
        {
            TaskCompletionSource changed = new(TaskCreationOptions.RunContinuationsAsynchronously);
            void OnChanged() => changed.TrySetResult();
            Client.Changed += OnChanged;
            try { Socket.Push(message); await changed.Task.WaitAsync(TimeSpan.FromSeconds(3)); }
            finally { Client.Changed -= OnChanged; }
        }
        public ValueTask DisposeAsync() => Coordinator.DisposeAsync();
    }

    private sealed class FakeSocket : IDglabSocket
    {
        private readonly Channel<string?> _incoming = Channel.CreateUnbounded<string?>(new() { AllowSynchronousContinuations = true });
        private readonly Channel<JsonObject> _outgoing = Channel.CreateUnbounded<JsonObject>();
        public ConcurrentQueue<JsonObject> Requests { get; } = new();
        public Func<JsonObject, string?>? Error { get; set; }
        public Func<JsonObject, bool>? Drop { get; set; }
        public bool IsOpen { get; private set; }
        public Task ConnectAsync(Uri address, CancellationToken cancellationToken)
        { cancellationToken.ThrowIfCancellationRequested(); IsOpen = true; Push(new { type = "hello", clientId = "controller-id" }); return Task.CompletedTask; }
        public Task SendTextAsync(string message, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!IsOpen) throw new IOException("closed");
            var request = JsonNode.Parse(message)!.AsObject();
            if (request["type"]!.GetValue<string>() == "ping") { Push(new { type = "pong" }); return Task.CompletedTask; }
            Requests.Enqueue(request); _outgoing.Writer.TryWrite(request);
            if (Drop?.Invoke(request) != true) Push(new { type = "message", clientId = request["clientId"]!.GetValue<string>(), data = new
            { t = "resp", reqId = request["data"]!["reqId"]!.GetValue<string>(), result = new { }, error = Error?.Invoke(request) } });
            return Task.CompletedTask;
        }
        public Task<JsonObject> NextRequest() => _outgoing.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
        public void Push(object message) => _incoming.Writer.TryWrite(JsonSerializer.Serialize(message));
        public Task<string?> ReceiveTextAsync(CancellationToken cancellationToken) => _incoming.Reader.ReadAsync(cancellationToken).AsTask();
        public void Abort() { IsOpen = false; _incoming.Writer.TryComplete(); }
        public ValueTask DisposeAsync() { Abort(); return ValueTask.CompletedTask; }
    }
}
