using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Channels;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class OscContracts
{
    [Theory]
    [InlineData("OGB/Orf/**/PenOthers", "OGB/Orf/Pussy/Main/PenOthers", true)]
    [InlineData("A/*;B/**", "B/x/y", true)]
    [InlineData("A/**", "A", true)]
    [InlineData("A/*", "A/x/y", false)]
    [InlineData("A/*", "a/x", false)]
    [InlineData("A/*\nB/*", "B/x", true)]
    public void Path_patterns_match_whole_segments_and_explicit_aliases(string pattern, string path, bool expected) =>
        Assert.Equal(expected, OscParameterStore.MatchesPathPattern(pattern, path));

    [Theory]
    [InlineData("v2/JawOpen", true)]
    [InlineData("Avatar/Face/v2/EyeLeftXNegative", false)]
    [InlineData("FT/v2/MouthSmileRight4", true)]
    [InlineData("FT/TrackingEnabled", true)]
    [InlineData("FT/v9/FutureExpression", true)]
    [InlineData("/avatar/parameters/FT/CustomControl", true)]
    [InlineData("FTools/Depth", false)]
    [InlineData("Custom/FT/Depth", false)]
    [InlineData("LeftEyeLidExpanded8", false)]
    [InlineData("JawOpen", false)]
    [InlineData("OGB/Orf/Mouth/PenOthers", false)]
    [InlineData("v2/Depth", true)]
    public void Classification_is_a_conservative_hint_not_an_implicit_mapping(string path, bool expected)
    {
        Assert.Equal(expected, OscParameterClassifier.Classify(path).IsFaceTracking);
        Assert.False(OscParameterStore.MatchesPathPattern("OGB/**/PenOthers", "Custom/PenOthres"));
        Assert.True(OscParameterClassifier.Classify("Custom/PenOthres").Relevance > 10);
    }

    [Fact]
    public void Independent_touch_zones_are_discoverable_before_they_are_mapped()
    {
        foreach (var path in new[] { "VFH/Zone/Touch/Chest/Others", "/avatar/parameters/VFH/Zone/Touch/Body/Chest/Self" })
        {
            var hint = OscParameterClassifier.Classify(path);
            Assert.False(hint.IsFaceTracking);
            Assert.Equal(100, hint.Relevance);
        }
        Assert.Equal(10, OscParameterClassifier.Classify("Custom/Body/Others").Relevance);
    }

    [Fact]
    public void Catalog_rejects_invalid_values_bounds_capacity_and_never_changes_selected_source()
    {
        var store = new OscParameterStore(new ManualTimeProvider());
        store.Set("bad", OscValue.FromFloat(float.NaN));
        store.Set("infinite", OscValue.FromFloat(float.PositiveInfinity));
        Assert.Empty(store.SnapshotEntries());
        for (var i = 0; i < 4200; i++) store.Set("FT/" + i, OscValue.FromInt(i));
        Assert.Equal(OscParameterStore.MaxPaths, store.SnapshotEntries().Length);
        Assert.False(store.TryGetLatest("FT/1", "unavailable:selected", out _));
    }

    [Fact]
    public void Source_capacity_and_expiration_use_the_injected_clock()
    {
        var clock = new ManualTimeProvider();
        var store = new OscParameterStore(clock);
        for (var i = 0; i < 40; i++)
            store.Set("Depth", OscValue.FromInt(i), new("source-" + i, "source", null, "127.0.0.1", i));
        Assert.Equal(OscParameterStore.MaxSources, store.SnapshotSources().Length);
        clock.Advance(TimeSpan.FromMinutes(6));
        store.Set("Depth", OscValue.FromFloat(.5f), new("fresh", "fresh", null, "127.0.0.1", 19000));
        Assert.Equal("fresh", Assert.Single(store.SnapshotSources()).Key);
        Assert.Equal(.5f, Assert.Single(store.SnapshotEntries()).Entry.Value.AsFloat());
    }

    [Theory]
    [InlineData('f', .65f)]
    [InlineData('i', 3f)]
    [InlineData('T', 1f)]
    [InlineData('F', 0f)]
    public async Task UDP_adapter_decodes_supported_values_through_the_parameter_store(char type, float value)
    {
        var store = new OscParameterStore();
        using var receiver = Receiver(store);
        using var sender = BoundUdp();
        var arrived = Channel.CreateUnbounded<float>();
        store.OnSet += (_, v) => arrived.Writer.TryWrite(v.AsFloat());
        receiver.Start();
        await Send(sender, receiver.Port, Packet("/avatar/parameters/Depth", type, value));
        Assert.Equal(value, await arrived.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3)));
        Assert.Equal(value, Assert.Single(store.SnapshotEntries()).Entry.Value.AsFloat());
    }

    [Fact]
    public async Task Mixed_bundle_preserves_raw_messages_without_duplicating_avatar_parameters()
    {
        var store = new OscParameterStore();
        using var receiver = Receiver(store);
        using var sender = BoundUdp();
        var raw = Channel.CreateUnbounded<byte[]>();
        var values = Channel.CreateUnbounded<float>();
        receiver.OnUnhandledPacket += (bytes, _) => raw.Writer.TryWrite(bytes);
        store.OnSet += (_, v) => values.Writer.TryWrite(v.AsFloat());
        var tracking = Packet("/tracking/vrsystem/head/position", 'f', .2f);
        var motion = Packet("/avatar/parameters/Depth", 'f', .7f);
        receiver.Start();
        var nested = Bundle(tracking);
        nested[15] = 7;
        var mixed = Bundle(motion, nested);
        mixed[15] = 3;
        var expected = Bundle(nested);
        expected[15] = 3;
        await Send(sender, receiver.Port, mixed);
        Assert.Equal(.7f, await values.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3)));
        Assert.Equal(expected, await raw.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3)));
        Assert.Single(store.SnapshotEntries());
        Assert.False(raw.Reader.TryRead(out _));
    }

    [Fact]
    public async Task NaN_is_diagnostic_only_and_cannot_poison_motion_parameters()
    {
        var store = new OscParameterStore();
        using var receiver = Receiver(store); using var sender = BoundUdp();
        var raw = Channel.CreateUnbounded<byte[]>();
        var arrived = Channel.CreateUnbounded<float>();
        receiver.OnUnhandledPacket += (bytes, _) => raw.Writer.TryWrite(bytes);
        store.OnSet += (_, v) => arrived.Writer.TryWrite(v.AsFloat());
        receiver.Start();
        await Send(sender, receiver.Port, Bundle(Packet("/avatar/parameters/Bad", 'f', float.NaN), Packet("/avatar/parameters/Depth", 'f', .3f)));
        await raw.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(.3f, await arrived.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3)));
        Assert.Equal("Depth", Assert.Single(store.SnapshotEntries()).Path);
    }

    [Fact]
    public async Task UDP_avatar_change_uses_the_same_store_lifecycle_as_Query()
    {
        var store = new OscParameterStore();
        using var receiver = Receiver(store); using var sender = BoundUdp();
        var received = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var changed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        store.OnSet += (_, _) => received.TrySetResult();
        store.AvatarChanged += () => changed.TrySetResult();
        receiver.Start();
        await Send(sender, receiver.Port, Packet("/avatar/parameters/Depth", 'f', .7f));
        await received.Task.WaitAsync(TimeSpan.FromSeconds(3));
        await Send(sender, receiver.Port, Packet("/avatar/change", 's', 0));
        await changed.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Empty(store.SnapshotEntries());
    }

    [Fact]
    public async Task Source_filter_is_applied_before_motion_or_raw_callbacks()
    {
        var store = new OscParameterStore();
        using var receiver = Receiver(store); using var allowed = BoundUdp(); using var denied = BoundUdp();
        receiver.IsSourceAllowed = source => source.Port == Port(allowed);
        var arrived = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        store.OnSet += (_, _) => arrived.TrySetResult();
        receiver.Start();
        await Send(denied, receiver.Port, Packet("/avatar/parameters/Depth", 'f', .9f));
        await Send(allowed, receiver.Port, Packet("/avatar/parameters/Depth", 'f', .2f));
        await arrived.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(.2f, Assert.Single(store.SnapshotEntries()).Entry.Value.AsFloat());
        Assert.Equal(Port(allowed), Assert.Single(store.SnapshotSources()).Port);
    }

    [Fact]
    public async Task Rebinding_and_restart_release_old_socket_without_timing_sleeps()
    {
        var store = new OscParameterStore();
        using var receiver = Receiver(store); using var sender = BoundUdp(); using var next = BoundUdp();
        var secondPort = Port(next); next.Close();
        var packets = Channel.CreateUnbounded<byte>();
        receiver.OnUnhandledPacket += (bytes, _) => packets.Writer.TryWrite(bytes[0]);
        receiver.Start();
        for (byte sequence = 1; sequence <= 4; sequence++)
        {
            await Send(sender, receiver.Port, [sequence]);
            Assert.Equal(sequence, await packets.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3)));
            var previous = receiver.Port;
            await Task.Run(() => receiver.Reconfigure("127.0.0.1", secondPort)).WaitAsync(TimeSpan.FromSeconds(3));
            using var released = new UdpClient(new IPEndPoint(IPAddress.Loopback, previous));
            secondPort = previous;
        }
        await Task.Run(receiver.Stop).WaitAsync(TimeSpan.FromSeconds(3));
        receiver.Start();
        await Send(sender, receiver.Port, [9]);
        Assert.Equal(9, await packets.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3)));
    }

    [Fact]
    public async Task Failed_rebind_restores_the_previous_listener()
    {
        using var busy = BoundUdp(); using var sender = BoundUdp();
        var store = new OscParameterStore(); using var receiver = Receiver(store);
        var previous = receiver.Port;
        var raw = Channel.CreateUnbounded<byte>();
        receiver.OnUnhandledPacket += (bytes, _) => raw.Writer.TryWrite(bytes[0]);
        receiver.Start();
        Assert.Throws<SocketException>(() => receiver.Reconfigure("127.0.0.1", Port(busy)));
        Assert.Equal(previous, receiver.Port); Assert.True(receiver.IsRunning);
        await Send(sender, receiver.Port, [4]);
        Assert.Equal(4, await raw.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3)));
    }

    [Fact]
    public async Task Hub_event_adapter_emits_valid_OSC_and_fixed_rate_keeps_only_latest_parameter()
    {
        using var peer = BoundUdp(); using var hub = new OscHubForwarder();
        var config = new OscHubConfig { Enabled = true, Targets = [new() { Id = "mock", Host = "127.0.0.1", Port = Port(peer), Enabled = true }] };
        hub.Configure(config);
        hub.ForwardParameter("Depth", OscValue.FromFloat(.6f));
        var sent = await peer.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(Packet("/avatar/parameters/Depth", 'f', .6f), sent.Buffer);
        config.Mode = OscHubMode.FixedRate; config.FixedRateHz = 1; hub.Configure(config);
        hub.ForwardParameter("Depth", OscValue.FromFloat(.2f));
        hub.ForwardParameter("Depth", OscValue.FromFloat(.8f));
        Assert.Equal(1, hub.BuildSnapshot().PendingPacketCount);
        hub.ClearPending(); Assert.Equal(0, hub.BuildSnapshot().PendingPacketCount);
    }

    [Fact]
    public async Task Query_HTTP_adapter_parses_only_avatar_nodes_and_preserves_stable_source_identity()
    {
        using var http = new HttpClient(new QueryPeer());
        using var query = new OscQueryClient(http);
        var snapshot = await query.RefreshAsync("fixture.example:9010");
        Assert.Equal("", snapshot.Error);
        Assert.Equal("Fixture", snapshot.Name);
        var node = Assert.Single(snapshot.Nodes);
        Assert.Equal("Depth", node.Path);
        Assert.Equal(.65f, node.ParsedValue!.Value.AsFloat());
        Assert.False(string.IsNullOrWhiteSpace(query.SnapshotSource.PersistentId));
        query.Clear(); Assert.Empty(query.Snapshot.Nodes);
    }

    [Theory]
    [InlineData("127.0.0.1:9001", "http://127.0.0.1:9001/")]
    [InlineData("https://example.test/tree?x=1#x", "https://example.test/tree/")]
    [InlineData("file:///private", "")]
    public void Query_addresses_accept_only_HTTP_and_remove_query_and_fragment(string input, string expected) =>
        Assert.Equal(expected, OscQueryClient.NormalizeUrl(input));

    private static UdpClient BoundUdp() => new(new IPEndPoint(IPAddress.Loopback, 0));
    private static int Port(UdpClient socket) => ((IPEndPoint)socket.Client.LocalEndPoint!).Port;
    private static OscInputReceiver Receiver(OscParameterStore store)
    {
        using var reservation = BoundUdp(); var port = Port(reservation); reservation.Close();
        return new(store, "127.0.0.1", port);
    }
    private static async Task Send(UdpClient socket, int port, byte[] packet) =>
        await socket.SendAsync(packet, new IPEndPoint(IPAddress.Loopback, port));

    private static void String(Stream stream, string value)
    {
        var bytes = Encoding.ASCII.GetBytes(value + "\0");
        stream.Write(bytes); stream.Write(new byte[(4 - bytes.Length % 4) % 4]);
    }

    private static byte[] Packet(string address, char type, float value)
    {
        using var stream = new MemoryStream(); String(stream, address); String(stream, "," + type);
        if (type is 'f' or 'i')
        {
            Span<byte> bytes = stackalloc byte[4];
            BinaryPrimitives.WriteInt32BigEndian(bytes, type == 'f' ? BitConverter.SingleToInt32Bits(value) : (int)value);
            stream.Write(bytes);
        }
        else if (type == 's') String(stream, "");
        return stream.ToArray();
    }

    private static byte[] Bundle(params byte[][] packets)
    {
        using var stream = new MemoryStream(); String(stream, "#bundle");
        stream.Write(new byte[] { 0, 0, 0, 0, 0, 0, 0, 1 });
        Span<byte> length = stackalloc byte[4];
        foreach (var packet in packets)
        {
            BinaryPrimitives.WriteInt32BigEndian(length, packet.Length);
            stream.Write(length); stream.Write(packet);
        }
        return stream.ToArray();
    }

    private sealed class QueryPeer : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var json = request.RequestUri!.Query.Contains("HOST_INFO", StringComparison.Ordinal)
                ? """{"NAME":"Fixture","OSC_IP":"127.0.0.1","OSC_PORT":9001,"EXTENSIONS":{}}"""
                : """{"FULL_PATH":"/","CONTENTS":{"Depth":{"FULL_PATH":"/avatar/parameters/Depth","TYPE":"f","ACCESS":1,"VALUE":[0.65]},"Ignored":{"FULL_PATH":"/tracking/example","TYPE":"f","VALUE":[1]}}}""";
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
        }
    }
}
