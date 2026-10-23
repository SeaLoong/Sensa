using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Sensa.Outputs.Dglab;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class DglabV4Contracts
{
    private static readonly DglabTarget Target = new("app-one", "coyote-one");
    private static DglabConnectionOptions Options(int timeout = 3000) => new()
    { ServerUrl = "wss://relay.example/v4", ConnectTimeoutMs = 1000, ResponseTimeoutMs = timeout };

    [Fact]
    public void V4PairingUsesTidPreservesOtherQueryAndRejectsEmbeddedCredentials()
    {
        var url = DglabV4Protocol.BuildPairingUrl("wss://relay.example/v4/?x=1&tid=old", "new target");
        Assert.Contains("x=1", url); Assert.Contains("tid=new%20target", url); Assert.DoesNotContain("tid=old", url);
        Assert.StartsWith("https://dungeon-lab.cn/s/?v=1&action=socket&url=", DglabV4Protocol.BuildAppPairingUrl("wss://relay.example/v4", "target"));
        Assert.Throws<ArgumentException>(() => DglabV4Protocol.ValidateServerUrl("wss://user:secret@relay.example/v4"));
        Assert.Throws<ArgumentException>(() => DglabV4Protocol.ValidateServerUrl("https://relay.example/v4"));
    }

    [Fact]
    public void TemporaryIntensityAndWaveformUseOfficialFiniteTaskFields()
    {
        var intensity = DglabV4Protocol.TemporaryIntensity(Target, 12.5, 250);
        Assert.Equal(4, intensity["t"]!.GetValue<int>());
        Assert.Equal(12.5, intensity["v"]!.GetValue<double>());
        Assert.Equal(250, intensity["d"]!.GetValue<int>());
        Assert.True(intensity["im"]!.GetValue<bool>());
        Assert.Equal(0, intensity["c"]!.GetValue<int>());
        Assert.Equal(0, DglabV4Protocol.Reset(Target)["v"]!.GetValue<int>());
        Assert.Equal(7, DglabV4Protocol.Reset(Target)["t"]!.GetValue<int>());
        var waveform = DglabV4Protocol.Pulse(Target with { Channel = DglabChannel.B }, ["0a0a0a0a00000000"], 500);
        Assert.Equal(0, waveform["t"]!.GetValue<int>());
        Assert.Equal(1, waveform["c"]!.GetValue<int>());
        Assert.Equal("0A0A0A0A00000000", waveform["v"]![0]!.GetValue<string>());
        Assert.Throws<ArgumentOutOfRangeException>(() => DglabV4Protocol.TemporaryIntensity(Target, double.NaN, 250));
        Assert.Throws<ArgumentOutOfRangeException>(() => DglabV4Protocol.TemporaryIntensity(Target, -1, 250));
        Assert.Throws<ArgumentOutOfRangeException>(() => DglabV4Protocol.TemporaryIntensity(Target, 1, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => DglabV4Protocol.Pulse(Target, ["0000000000000000"], 10001));
        Assert.Throws<ArgumentException>(() => DglabV4Protocol.Pulse(Target, ["00GG"], 100));
        Assert.Throws<ArgumentException>(() => DglabV4Protocol.Pulse(Target, ["000000"], 100));
        Assert.Equal(2, DglabV4Protocol.Pulse(Target, ["010203"], 100, 2)["ver"]!.GetValue<int>());
    }

    [Fact]
    public async Task PairingDiscoveryIncrementalFeedbackAndRemovalKeepImmutableSnapshots()
    {
        var socket = new FakeSocket();
        await using var client = new DglabV4Client(() => socket);
        var connected = await client.ConnectAsync(Options());
        Assert.True(connected.Connected); Assert.Equal("WaitingForApp", connected.Status);
        Assert.Equal("controller-id", connected.TargetId);
        Assert.Contains("tid=controller-id", connected.PairingUrl);
        await Attach(client, socket);
        var first = client.Snapshot;
        Assert.Single(first.Clients); Assert.Single(first.Devices);
        Assert.True(client.TryReadFeedback(Target, "props.power", out var power)); Assert.Equal(80, power);
        await Receive(client, socket, new { type = "message", clientId = Target.ClientId, data = new
        {
            t = "ev", ev = "slots.patch", slots = new[] { new
            { slotId = Target.SlotId, props = new { intensityA = 9 }, slotState = new { channelA = new { isMuted = true } } } },
        } });
        Assert.True(client.TryReadFeedback(Target, "props.intensityA", out var intensity)); Assert.Equal(9, intensity);
        Assert.True(client.TryReadFeedback(Target, "props.power", out power)); Assert.Equal(80, power);
        Assert.True(client.TryReadFeedback(Target, "slotState.channelA.intensityMax", out var maximum)); Assert.Equal(7, maximum);
        Assert.False(first.Devices[0].SlotState.GetProperty("channelA").GetProperty("isMuted").GetBoolean());
        await Receive(client, socket, new { type = "message", clientId = Target.ClientId, data = new { t = "ev", ev = "custom.action", action = 3 } });
        Assert.True(client.TryReadFeedback(Target, "action.3", out var action)); Assert.Equal(1, action);
        Assert.True(client.TryReadFeedback(Target, "actionSequence", out var sequence)); Assert.Equal(1, sequence);
        await Receive(client, socket, new { type = "message", clientId = Target.ClientId, data = new
        { t = "ev", ev = "devices.patch", removed = new[] { Target.SlotId } } });
        Assert.Empty(client.Snapshot.Devices); Assert.False(client.TryReadFeedback(Target, "props.power", out _));
    }

    [Fact]
    public async Task UserCommandHonoursReportedAppLimitAndMuteWithoutInventingPercentageUnits()
    {
        var socket = new FakeSocket();
        await using var client = new DglabV4Client(() => socket);
        await client.ConnectAsync(Options()); await Attach(client, socket);
        await client.SetTemporaryIntensityAsync(Target, 20, 250);
        var sent = JsonNode.Parse(socket.Sent.Last())!["data"]!["data"]!;
        Assert.Equal(7, sent["v"]!.GetValue<double>());
        Assert.Equal(4, sent["t"]!.GetValue<int>());
        await Receive(client, socket, new { type = "message", clientId = Target.ClientId, data = new
        { t = "ev", ev = "slots.patch", slots = new[] { new { slotId = Target.SlotId, slotState = new { channelA = new { isMuted = true } } } } } });
        await client.SetTemporaryIntensityAsync(Target, 20, 250);
        sent = JsonNode.Parse(socket.Sent.Last())!["data"]!["data"]!;
        Assert.Equal(0, sent["v"]!.GetValue<double>());
    }

    [Fact]
    public async Task RpcResponsesAreCorrelatedByBothAppAndRequestIdAndUnknownRepliesDoNotSettle()
    {
        var socket = new FakeSocket { AutoRespond = false };
        await using var client = new DglabV4Client(() => socket);
        await client.ConnectAsync(Options()); await Attach(client, socket);
        await Receive(client, socket, new { type = "client_attached", clientId = "other-app" });
        var command = client.SetTemporaryIntensityAsync(Target, 2, 250);
        var request = JsonNode.Parse(await socket.NextSent())!;
        var id = request["data"]!["reqId"]!.GetValue<string>();
        await Receive(client, socket, new { type = "message", clientId = "other-app", data = new { t = "resp", reqId = id, result = new { wrong = true } } });
        Assert.False(command.IsCompleted);
        await Receive(client, socket, new { type = "message", clientId = Target.ClientId, data = new { t = "resp", reqId = "old", result = new { wrong = true } } });
        Assert.False(command.IsCompleted);
        await Receive(client, socket, new { type = "message", clientId = Target.ClientId, data = new { t = "resp", reqId = id, result = new { accepted = true } } });
        Assert.True((await command).GetProperty("accepted").GetBoolean());
        socket.AutoRespond = true;
    }

    [Fact]
    public async Task RpcTimeoutReleasesTheQueueAndNeverRetriesAnOperation()
    {
        var clock = new ManualTimeProvider(); var socket = new FakeSocket { AutoRespond = false };
        await using var client = new DglabV4Client(() => socket, clock);
        await client.ConnectAsync(Options(500)); await Attach(client, socket);
        var command = client.SetTemporaryIntensityAsync(Target, 2, 250);
        await socket.NextSent();
        clock.Advance(TimeSpan.FromMilliseconds(500));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => command);
        Assert.Single(socket.Sent);
        socket.AutoRespond = true;
        await client.SetTemporaryIntensityAsync(Target, 3, 250);
        Assert.Equal(2, socket.Sent.Count);
    }

    [Fact]
    public async Task PendingRequestsAreBoundedAndDisconnectRejectsThemWithoutKeepingFeedback()
    {
        var socket = new FakeSocket { AutoRespond = false };
        await using var client = new DglabV4Client(() => socket);
        await client.ConnectAsync(Options()); await Attach(client, socket);
        var tasks = Enumerable.Range(0, DglabV4Client.MaximumPendingRequests).Select(_ => client.RequestDevicesAsync(Target.ClientId)).ToArray();
        await Assert.ThrowsAsync<InvalidOperationException>(() => client.RequestDevicesAsync(Target.ClientId));
        Assert.Equal(DglabV4Client.MaximumPendingRequests, socket.Sent.Count);
        await Receive(client, socket, new { type = "client_disconnected", clientId = Target.ClientId });
        await Assert.ThrowsAnyAsync<IOException>(() => Task.WhenAll(tasks));
        Assert.Empty(client.Snapshot.Clients);
        Assert.False(client.TryReadFeedback(Target, "props.power", out _));
    }

    [Fact]
    public async Task StopSendsChannelClearAndAbsoluteZeroAndReconnectDoesNotResume()
    {
        var first = new FakeSocket(); var second = new FakeSocket(); var sockets = new Queue<FakeSocket>([first, second]);
        await using var client = new DglabV4Client(() => sockets.Dequeue());
        await client.ConnectAsync(Options()); await Attach(client, first);
        await client.SetTemporaryIntensityAsync(Target, 2, 250);
        await client.StopAsync(Target);
        var requests = first.Sent.Select(text => JsonNode.Parse(text)!).ToArray();
        Assert.Equal("device.op.clear", requests[^2]["data"]!["m"]!.GetValue<string>());
        Assert.Equal(Target.SlotId, requests[^2]["data"]!["data"]!["s"]!.GetValue<string>());
        Assert.Equal(0, requests[^2]["data"]!["data"]!["c"]!.GetValue<int>());
        Assert.Equal(7, requests[^1]["data"]!["data"]!["t"]!.GetValue<int>());
        Assert.Equal(0, requests[^1]["data"]!["data"]!["v"]!.GetValue<int>());
        await client.DisconnectAsync(); await client.ConnectAsync(Options()); await Attach(client, second);
        Assert.Empty(second.Sent);
    }

    [Fact]
    public async Task RelayCloseInvalidatesPendingOperationsAndExplicitReconnectHasNoReplay()
    {
        var first = new FakeSocket { AutoRespond = false }; var second = new FakeSocket();
        var sockets = new Queue<FakeSocket>([first, second]);
        await using var client = new DglabV4Client(() => sockets.Dequeue());
        await client.ConnectAsync(Options()); await Attach(client, first);
        var command = client.SetTemporaryIntensityAsync(Target, 2, 250); await first.NextSent();
        var changed = NextChange(client); first.RemoteClose(); await changed;
        await Assert.ThrowsAnyAsync<IOException>(() => command);
        Assert.False(client.Snapshot.Connected); Assert.Null(client.Snapshot.TargetId); Assert.Empty(client.Snapshot.Devices);
        await client.ConnectAsync(Options()); await Attach(client, second);
        Assert.Empty(second.Sent);
    }

    [Fact]
    public async Task RelayPingNeedsPongAndThreeMissedResponsesInvalidateTheConnection()
    {
        var clock = new ManualTimeProvider(); var socket = new FakeSocket();
        await using var client = new DglabV4Client(() => socket, clock);
        await client.ConnectAsync(Options());
        for (var count = 0; count < 3; count++)
        {
            clock.Advance(TimeSpan.FromSeconds(2));
            Assert.Equal("ping", JsonNode.Parse(await socket.NextSent())!["type"]!.GetValue<string>());
        }
        var change = NextChange(client); clock.Advance(TimeSpan.FromSeconds(2)); await change;
        Assert.False(client.Snapshot.Connected);
        Assert.Contains("ping timeout", client.Snapshot.LastError);
    }

    [Fact]
    public async Task ConnectWaitsForHelloAndTimesOutWithoutRetryOrBackgroundContinuation()
    {
        var clock = new ManualTimeProvider(); var socket = new FakeSocket { AutoHello = false };
        await using var client = new DglabV4Client(() => socket, clock);
        var attempt = client.ConnectAsync(Options());
        clock.Advance(TimeSpan.FromSeconds(1));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => attempt);
        Assert.False(client.Snapshot.Connected); Assert.Single(socket.Addresses);
        socket.Push(new { type = "hello", clientId = "too-late" });
        Assert.Null(client.Snapshot.TargetId);
    }

    [Fact]
    public async Task PulseAndDeviceErrorsAreReportedWithoutConvertingThemToSuccessfulCommands()
    {
        var socket = new FakeSocket();
        await using var client = new DglabV4Client(() => socket);
        await client.ConnectAsync(Options()); await Attach(client, socket);
        await client.SendPulseAsync(Target, ["0A0A0A0A00000000"], 400);
        var request = JsonNode.Parse(socket.Sent.Last())!;
        Assert.Equal(0, request["data"]!["data"]!["t"]!.GetValue<int>());
        socket.ResponseError = "device_unavailable";
        var error = await Assert.ThrowsAsync<IOException>(() => client.SetTemporaryIntensityAsync(Target, 2, 250));
        Assert.Contains("device_unavailable", error.Message);
        socket.ResponseError = null;
    }

    [Fact]
    public async Task DispatchReturnsAfterWriteWhileObservingTheRealTaskCompletionAndErrorLatch()
    {
        var socket = new FakeSocket { AutoRespond = false };
        await using var client = new DglabV4Client(() => socket);
        await client.ConnectAsync(Options()); await Attach(client, socket);
        await client.DispatchTemporaryIntensityAsync(Target, 3, 250);
        var request = JsonNode.Parse(await socket.NextSent())!;
        var id = request["data"]!["reqId"]!.GetValue<string>();
        Assert.Null(client.Snapshot.LastError);
        var errorChanged = NextMatchingChange(client, () => client.Snapshot.Status == "CommandError");
        socket.Push(new { type = "message", clientId = Target.ClientId, data = new { t = "resp", reqId = id, error = "device_unavailable" } });
        await errorChanged;
        Assert.Contains("device_unavailable", client.Snapshot.LastError);
        await Assert.ThrowsAsync<InvalidOperationException>(() => client.DispatchTemporaryIntensityAsync(Target, 3, 250));
        Assert.Single(socket.Sent);
        // Stop remains available after a rejected task, and does not silently re-arm the channel.
        socket.AutoRespond = true;
        await client.StopAsync(Target);
        Assert.Equal("CommandError", client.Snapshot.Status);
    }

    [Fact]
    public async Task DispatchedTaskTimeoutIsObservedAndRequiresExplicitReconnect()
    {
        var clock = new ManualTimeProvider(); var socket = new FakeSocket { AutoRespond = false };
        await using var client = new DglabV4Client(() => socket, clock);
        await client.ConnectAsync(Options(500)); await Attach(client, socket);
        await client.DispatchPulseAsync(Target, ["0A0A0A0A00000000"], 250);
        var failed = NextMatchingChange(client, () => client.Snapshot.Status == "CommandError");
        clock.Advance(TimeSpan.FromMilliseconds(500)); await failed;
        Assert.Contains("response timeout", client.Snapshot.LastError);
        await Assert.ThrowsAsync<InvalidOperationException>(() => client.DispatchPulseAsync(Target, ["0A0A0A0A00000000"], 250));
        Assert.Single(socket.Sent);
    }

    [Fact]
    public async Task FullDispatchQueueStillReservesBoundedClearAndZeroCapacity()
    {
        var socket = new FakeSocket { AutoRespond = false };
        await using var client = new DglabV4Client(() => socket);
        await client.ConnectAsync(Options()); await Attach(client, socket);
        for (var index = 0; index < DglabV4Client.MaximumPendingRequests; index++)
            await client.DispatchTemporaryIntensityAsync(Target, 3, 250);
        await Assert.ThrowsAsync<InvalidOperationException>(() => client.DispatchTemporaryIntensityAsync(Target, 3, 250));
        Assert.Equal(32, socket.Sent.Count);
        socket.AutoRespond = true;
        await client.StopAsync(Target);
        Assert.Equal(34, socket.Sent.Count);
        await client.DisconnectAsync();
        Assert.Equal("Disconnected", client.Snapshot.Status);
    }

    [Fact]
    public async Task ExplicitRouteCancellationDoesNotLatchAnUnrelatedCommandError()
    {
        var socket = new FakeSocket { AutoRespond = false };
        await using var client = new DglabV4Client(() => socket);
        await client.ConnectAsync(Options()); await Attach(client, socket);
        using var cancellation = new CancellationTokenSource();
        await client.DispatchTemporaryIntensityAsync(Target, 3, 250, cancellation.Token);
        cancellation.Cancel();
        socket.AutoRespond = true;
        await client.StopAsync(Target);
        Assert.Null(client.Snapshot.LastError);
    }

    private static Task NextMatchingChange(DglabV4Client client, Func<bool> condition)
    {
        TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
        Action? handler = null;
        handler = () => { if (condition()) { client.Changed -= handler; ready.TrySetResult(); } };
        client.Changed += handler;
        if (condition()) { client.Changed -= handler; ready.TrySetResult(); }
        return ready.Task.WaitAsync(TimeSpan.FromSeconds(3));
    }

    private static async Task Attach(DglabV4Client client, FakeSocket socket)
    {
        await Receive(client, socket, new { type = "client_attached", clientId = Target.ClientId });
        await Receive(client, socket, new { type = "message", clientId = Target.ClientId, data = new
        {
            t = "ev", ev = "devices.snapshot", devices = new[] { new
            {
                slotId = Target.SlotId, name = "Coyote", type = "COYOTE_030", props = new { power = 80, intensityA = 1 },
                slotState = new { hasDevice = true, channelA = new { intensityMax = 7, isMuted = false } },
            } },
        } });
    }
    private static async Task Receive(DglabV4Client client, FakeSocket socket, object message)
    { var next = NextChange(client); socket.Push(message); await next; }
    private static Task NextChange(DglabV4Client client)
    {
        TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
        Action? handler = null;
        handler = () => { client.Changed -= handler; ready.TrySetResult(); };
        client.Changed += handler;
        return ready.Task.WaitAsync(TimeSpan.FromSeconds(3));
    }

    private sealed class FakeSocket : IDglabSocket
    {
        private readonly Channel<string?> _incoming = Channel.CreateUnbounded<string?>(new UnboundedChannelOptions { AllowSynchronousContinuations = true });
        private readonly Channel<string> _outgoing = Channel.CreateUnbounded<string>();
        public ConcurrentQueue<string> Sent { get; } = new();
        public List<Uri> Addresses { get; } = [];
        public bool AutoHello { get; set; } = true;
        public bool AutoRespond { get; set; } = true;
        public string? ResponseError { get; set; }
        public bool IsOpen { get; private set; }
        public Task ConnectAsync(Uri address, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested(); IsOpen = true; Addresses.Add(address);
            if (AutoHello) Push(new { type = "hello", clientId = "controller-id" });
            return Task.CompletedTask;
        }
        public Task SendTextAsync(string message, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!IsOpen) throw new IOException("closed");
            Sent.Enqueue(message); _outgoing.Writer.TryWrite(message);
            var node = JsonNode.Parse(message)!;
            if (AutoRespond && node["type"]!.GetValue<string>() == "message")
                Push(new { type = "message", clientId = node["clientId"]!.GetValue<string>(), data = new
                { t = "resp", reqId = node["data"]!["reqId"]!.GetValue<string>(), result = new { }, error = ResponseError } });
            return Task.CompletedTask;
        }
        public Task<string?> ReceiveTextAsync(CancellationToken cancellationToken) => _incoming.Reader.ReadAsync(cancellationToken).AsTask();
        public void Push(object message) => _incoming.Writer.TryWrite(JsonSerializer.Serialize(message));
        public Task<string> NextSent() => _outgoing.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
        public void RemoteClose() { IsOpen = false; _incoming.Writer.TryWrite(null); }
        public void Abort() { IsOpen = false; _incoming.Writer.TryComplete(); }
        public ValueTask DisposeAsync() { Abort(); return ValueTask.CompletedTask; }
    }
}
