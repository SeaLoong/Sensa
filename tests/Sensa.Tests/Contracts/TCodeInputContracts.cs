using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Channels;
using Sensa.Input.Protocols;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class TCodeInputContracts
{
    [Fact]
    public void Magnitudes_are_decimal_fractions_and_axes_keep_independent_intervals()
    {
        var frame = TCodeProtocol.ParseLine("l277I42 R09I900 V317439\r\n");
        Assert.Collection(frame.Commands,
            command => { Assert.Equal("L2", command.Channel); Assert.Equal(.77, command.Value, 10); Assert.Equal(42, command.IntervalMs); },
            command => { Assert.Equal("R0", command.Channel); Assert.Equal(.9, command.Value, 10); Assert.Equal(900, command.IntervalMs); },
            command => { Assert.Equal("V3", command.Channel); Assert.Equal(.17439, command.Value, 10); Assert.Null(command.IntervalMs); });
        Assert.Equal(.5, Assert.Single(TCodeProtocol.ParseLine("L01 L05").Commands).Value);
    }

    [Theory]
    [InlineData("L0")]
    [InlineData("L00.5")]
    [InlineData("L050I-1")]
    [InlineData("L050I60001")]
    [InlineData("L050I99999999999999999999")]
    [InlineData("L050S0")]
    [InlineData("L050I100<>")]
    [InlineData("L050I100G0")]
    [InlineData("L050 UNKNOWN")]
    [InlineData("DSTOP L050")]
    [InlineData("$L0-0000-9999")]
    public void Unsupported_or_malformed_terms_reject_the_whole_line(string line)
    {
        var sink = new TCodeTestSink();
        using var session = new TCodeInputSession(Config(), sink, "test");
        Assert.False(session.TryProcessLine(line, out _, out var error));
        Assert.NotEmpty(error); Assert.Equal(0, sink.BatchCount); Assert.True(sink.StopCount > 0);
    }

    [Fact]
    public void A_valid_prefix_never_moves_when_a_later_token_is_invalid_or_not_configured()
    {
        var sink = new TCodeTestSink();
        using var session = new TCodeInputSession(Config(), sink, "test");
        Assert.False(session.TryProcessLine("L050I500 R180I300", out _, out _));
        Assert.Equal(0, sink.BatchCount);
        Assert.True(session.TryProcessLine("L050I500 R025I300", out _, out _));
        Assert.Collection(sink.LastBatch!,
            command => { Assert.Equal("L0", command.Channel); Assert.Equal(500, command.DurationMs); },
            command => { Assert.Equal("R0", command.Channel); Assert.Equal(300, command.DurationMs); });
    }

    [Fact]
    public void Speed_uses_the_in_flight_commanded_position_and_stop_discards_its_baseline()
    {
        var clock = new ManualTimeProvider();
        var sink = new TCodeTestSink();
        using var session = new TCodeInputSession(Config(), sink, "test", clock);
        Assert.False(session.TryProcessLine("L0625S1000", out _, out _));
        Assert.True(session.TryProcessLine("L00", out _, out _));
        Assert.True(session.TryProcessLine("L05I1000", out _, out _));
        clock.Advance(TimeSpan.FromMilliseconds(250));
        Assert.True(session.TryProcessLine("L0625S1000", out _, out _));
        Assert.Equal(500, Assert.Single(sink.LastBatch!).DurationMs);
        Assert.True(session.TryProcessLine("DSTOP", out _, out _));
        Assert.False(session.TryProcessLine("L080S1000", out _, out _));
    }

    [Fact]
    public void An_initial_interval_does_not_invent_a_position_for_a_following_speed_command()
    {
        var clock = new ManualTimeProvider();
        var sink = new TCodeTestSink();
        using var session = new TCodeInputSession(Config(), sink, "test", clock);
        Assert.True(session.TryProcessLine("L05I1000", out _, out _));
        clock.Advance(TimeSpan.FromMilliseconds(500));
        Assert.False(session.TryProcessLine("L0625S1000", out _, out _));
        Assert.Equal(1, sink.BatchCount);
    }

    [Fact]
    public void Device_queries_describe_only_implemented_protocol_and_configured_channels()
    {
        var sink = new TCodeTestSink();
        using var session = new TCodeInputSession(Config(), sink, "test");
        var response = session.ProcessLine("D0 D1 D2");
        Assert.Contains("Sensa", response); Assert.Contains("TCode v0.3\n", response);
        Assert.Contains("L0 0 9999\n", response); Assert.Contains("R0 0 9999\n", response);
        Assert.DoesNotContain("V0", response); Assert.Equal(0, sink.BatchCount);
    }

    [Fact]
    public void Finite_motion_retains_its_arrival_plus_grace_but_replacement_and_reset_discard_old_deadlines()
    {
        var clock = new ManualTimeProvider(); var config = Config(); config.TimeoutMs = 1000;
        using var session = new TCodeInputSession(config, new TCodeTestSink(), "test", clock);
        Assert.True(session.TryProcessLine("L05I6000 R025I8000", out _, out _));
        Assert.Equal(TimeSpan.FromMilliseconds(9000), session.RemainingIdleTime);
        clock.Advance(TimeSpan.FromMilliseconds(1500));
        Assert.Equal(TimeSpan.FromMilliseconds(7500), session.RemainingIdleTime);
        Assert.True(session.TryProcessLine("L02I100 R07I200", out _, out _));
        Assert.Equal(TimeSpan.FromMilliseconds(1200), session.RemainingIdleTime);
        clock.Advance(TimeSpan.FromMilliseconds(1199));
        Assert.Equal(TimeSpan.FromMilliseconds(1), session.RemainingIdleTime);
        clock.Advance(TimeSpan.FromMilliseconds(1));
        Assert.Equal(TimeSpan.Zero, session.RemainingIdleTime);
        Assert.True(session.TryProcessLine("L05I60000", out _, out _));
        session.ResetCommands();
        Assert.Equal(TimeSpan.FromMilliseconds(1000), session.RemainingIdleTime);
        Assert.False(session.TryProcessLine("L02S1000", out _, out _));
    }

    [Fact]
    public async Task Serial_finite_move_survives_the_idle_timeout_then_partial_bytes_do_not_renew_arrival_grace()
    {
        var clock = new ManualTimeProvider(); var stream = new QueuedDuplexStream();
        var sink = new TCodeTestSink(); var config = Config("TCodeSerial"); config.TimeoutMs = 10000;
        await using var service = new TCodeInputService(config, sink, (_, _) => Task.FromResult<Stream>(stream), clock);
        await service.StartAsync();
        stream.Enqueue("L05I60000\nD1\n");
        await sink.NextAsync(); Assert.Equal("TCode v0.3\n", await stream.NextResponseAsync());
        await stream.WaitForReadAsync(2);
        clock.Advance(TimeSpan.FromMilliseconds(65000));
        Assert.False(sink.Released.Task.IsCompleted);
        stream.Enqueue("L0"); await stream.WaitForReadAsync(3);
        clock.Advance(TimeSpan.FromMilliseconds(5000));
        await sink.Released.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(1, sink.BatchCount); Assert.True(stream.Disposed);
    }

    [Fact]
    public async Task Serial_eof_interrupts_a_long_accepted_move_without_waiting_for_its_arrival()
    {
        var clock = new ManualTimeProvider(); var stream = new QueuedDuplexStream();
        var sink = new TCodeTestSink(); var config = Config("TCodeSerial"); config.TimeoutMs = 1000;
        await using var service = new TCodeInputService(config, sink, (_, _) => Task.FromResult<Stream>(stream), clock);
        await service.StartAsync(); stream.Enqueue("L05I60000\n"); await sink.NextAsync();
        stream.EndInput();
        await sink.Released.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(sink.StopCount > 0); Assert.Equal(0, clock.GetTimestamp());
    }

    [Fact]
    public async Task A_driver_timeout_is_a_terminal_read_error_not_a_retry_of_the_same_faulted_task()
    {
        var clock = new ManualTimeProvider(); var stream = new QueuedDuplexStream(new TimeoutException("Isolated driver timeout"));
        var sink = new TCodeTestSink();
        await using var service = new TCodeInputService(Config("TCodeSerial"), sink, (_, _) => Task.FromResult<Stream>(stream), clock);
        await service.StartAsync();
        Assert.True(sink.Released.Task.IsCompleted); Assert.True(stream.Disposed);
        Assert.Equal("TimeoutException", service.LastError); Assert.Equal(0, clock.GetTimestamp());
    }

    [Fact]
    public async Task Clearing_a_stream_recomputes_its_pending_read_deadline_without_the_old_long_move()
    {
        var clock = new ManualTimeProvider(); var stream = new QueuedDuplexStream();
        var sink = new TCodeTestSink(); var config = Config("TCodeSerial"); config.TimeoutMs = 1000;
        await using var service = new TCodeInputService(config, sink, (_, _) => Task.FromResult<Stream>(stream), clock);
        await service.StartAsync(); stream.Enqueue("L05I60000\n"); await sink.NextAsync();
        await stream.WaitForReadAsync(2);
        clock.Advance(TimeSpan.FromMilliseconds(100)); service.ResetCommands();
        clock.Advance(TimeSpan.FromMilliseconds(1100));
        await sink.Released.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(1, sink.BatchCount);
    }

    [Fact]
    public async Task Udp_retains_a_finite_move_until_arrival_and_grace_without_application_pings()
    {
        var clock = new ManualTimeProvider(); var sink = new TCodeTestSink(); var config = Config("TCodeUdp"); config.TimeoutMs = 1000;
        await using var service = new TCodeInputService(config, sink, clock: clock);
        await service.StartAsync();
        using var client = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        await client.SendAsync("L05I5000\nD1\n"u8.ToArray(), new IPEndPoint(IPAddress.Loopback, service.BoundPort));
        await sink.NextAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        Assert.Equal("TCode v0.3\n", Encoding.ASCII.GetString((await client.ReceiveAsync(timeout.Token)).Buffer));
        clock.Advance(TimeSpan.FromMilliseconds(5500)); Assert.False(sink.Released.Task.IsCompleted);
        clock.Advance(TimeSpan.FromMilliseconds(500));
        await sink.Released.Task.WaitAsync(TimeSpan.FromSeconds(3)); Assert.Equal(1, sink.BatchCount);
    }

    [Fact]
    public void Framing_preserves_partial_lines_and_rejects_invalid_bytes_before_publishing_a_prefix()
    {
        var framer = new TCodeLineFramer();
        Assert.Empty(framer.Push("L05I"u8));
        Assert.Equal(new[] { "L05I200", "R025" }, framer.Push("200\r\nR025\n"u8));
        Assert.Throws<FormatException>(() => framer.Push(new byte[] { 76, 48, 53, 10, 255 }));
        Assert.Empty(framer.Push("L0999\n"u8)); // Discard through the next boundary after a framing error.
        Assert.Single(framer.Push("L05\n"u8));
        Assert.Throws<FormatException>(() => framer.Push(Encoding.ASCII.GetBytes(new string('0', 4097))));
    }

    [Fact]
    public async Task Tcp_owns_one_session_frames_chunks_and_releases_on_disconnect()
    {
        var sink = new TCodeTestSink();
        var config = Config("TCodeTcp");
        await using var service = new TCodeInputService(config, sink);
        await service.StartAsync();
        using var client = new TcpClient(); await client.ConnectAsync(IPAddress.Loopback, service.BoundPort);
        var stream = client.GetStream();
        await stream.WriteAsync("L050I"u8.ToArray());
        Assert.Equal(0, sink.BatchCount);
        await stream.WriteAsync("200 R025I450\nD1\n"u8.ToArray());
        var batch = await sink.NextAsync(); Assert.Equal(2, batch.Count);
        Assert.Equal(200, batch[0].DurationMs); Assert.Equal(450, batch[1].DurationMs);
        using var reader = new StreamReader(stream, Encoding.ASCII);
        Assert.Equal("TCode v0.3", await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3)));
        using var other = new TcpClient(); await other.ConnectAsync(IPAddress.Loopback, service.BoundPort);
        using var rejected = new StreamReader(other.GetStream(), Encoding.ASCII);
        Assert.StartsWith("ERR", await rejected.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3)));
        client.Dispose();
        await sink.Released.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(sink.StopCount > 0);
    }

    [Fact]
    public async Task Tcp_invalid_line_returns_error_closes_and_releases_before_a_fresh_session_can_send()
    {
        var sink = new TCodeTestSink();
        await using var service = new TCodeInputService(Config("TCodeTcp"), sink);
        await service.StartAsync();
        using var first = new TcpClient(); await first.ConnectAsync(IPAddress.Loopback, service.BoundPort);
        await first.GetStream().WriteAsync("L0650I300\n"u8.ToArray());
        Assert.Equal(.65, Assert.Single(await sink.NextAsync()).Value, 10);
        using var reader = new StreamReader(first.GetStream(), Encoding.ASCII);
        await first.GetStream().WriteAsync("L0900I400 INVALID\n"u8.ToArray());
        Assert.StartsWith("ERR ", await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3)));
        Assert.Null(await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(3)));
        await sink.Released.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(1, sink.BatchCount); Assert.True(sink.StopCount > 0);
        using var fresh = new TcpClient(); await fresh.ConnectAsync(IPAddress.Loopback, service.BoundPort);
        await fresh.GetStream().WriteAsync("L0250I150\n"u8.ToArray());
        var accepted = Assert.Single(await sink.NextAsync());
        Assert.Equal(.25, accepted.Value, 10); Assert.Equal(150, accepted.DurationMs);
        Assert.Equal(2, sink.BatchCount);
    }

    [Fact]
    public async Task Tcp_idle_partial_input_expires_and_dispose_interrupts_an_outstanding_read()
    {
        var sink = new TCodeTestSink(); var config = Config("TCodeTcp"); config.TimeoutMs = 100;
        await using var service = new TCodeInputService(config, sink);
        await service.StartAsync();
        using var client = new TcpClient(); await client.ConnectAsync(IPAddress.Loopback, service.BoundPort);
        await client.GetStream().WriteAsync("L05I"u8.ToArray());
        await sink.Released.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(0, sink.BatchCount);
        await service.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
    }

    [Fact]
    public async Task Udp_rejects_truncated_datagrams_and_keeps_a_single_remote_owner()
    {
        var sink = new TCodeTestSink(); var config = Config("TCodeUdp");
        await using var service = new TCodeInputService(config, sink);
        await service.StartAsync();
        using var client = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        var endpoint = new IPEndPoint(IPAddress.Loopback, service.BoundPort);
        await client.SendAsync("L05\n"u8.ToArray(), endpoint);
        await sink.NextAsync();
        using var other = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        await other.SendAsync("L0999\n"u8.ToArray(), endpoint);
        await client.SendAsync("L025I300\nD1\n"u8.ToArray(), endpoint);
        Assert.Equal(.25, Assert.Single(await sink.NextAsync()).Value, 10);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        Assert.Equal("TCode v0.3\n", Encoding.ASCII.GetString((await client.ReceiveAsync(timeout.Token)).Buffer));
        await client.SendAsync("L0999"u8.ToArray(), endpoint);
        await client.SendAsync("D1\n"u8.ToArray(), endpoint);
        Assert.Equal("TCode v0.3\n", Encoding.ASCII.GetString((await client.ReceiveAsync(timeout.Token)).Buffer));
        Assert.Equal(2, sink.BatchCount); Assert.True(sink.StopCount > 0);
    }

    [Fact]
    public async Task Serial_input_uses_an_injected_stream_and_never_opens_hardware_in_tests()
    {
        using var peer = new TcpListener(IPAddress.Loopback, 0); peer.Start();
        using var client = new TcpClient();
        var connecting = client.ConnectAsync(IPAddress.Loopback, ((IPEndPoint)peer.LocalEndpoint).Port);
        using var accepted = await peer.AcceptTcpClientAsync(); await connecting;
        var sink = new TCodeTestSink();
        await using var service = new TCodeInputService(Config("TCodeSerial"), sink,
            (_, _) => Task.FromResult<Stream>(accepted.GetStream()));
        await service.StartAsync();
        await client.GetStream().WriteAsync("L077I250\n"u8.ToArray());
        var command = Assert.Single(await sink.NextAsync());
        Assert.Equal(.77, command.Value, 10); Assert.Equal(250, command.DurationMs);
        await service.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(sink.Released.Task.IsCompleted);
    }

    internal static ProtocolInputConfig Config(string type = "TCodeTcp") => new()
    {
        Id = "tcode-test", Name = "Isolated TCode input", Type = type, Port = 0, TimeoutMs = 3000,
        Features = [new() { Channel = "L0" }, new() { Channel = "R0", TargetAxis = "R0" }],
    };

    [Fact]
    public async Task Serial_read_deadline_closes_even_a_driver_stream_that_ignores_cancellation()
    {
        var stream = new CancellationIgnoringStream();
        var sink = new TCodeTestSink(); var config = Config("TCodeSerial"); config.TimeoutMs = 100;
        await using var service = new TCodeInputService(config, sink, (_, _) => Task.FromResult<Stream>(stream));
        await service.StartAsync();
        await sink.Released.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(stream.Disposed); Assert.Equal(0, sink.BatchCount);
    }

    private sealed class CancellationIgnoringStream : Stream
    {
        private readonly TaskCompletionSource<int> _read = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public bool Disposed { get; private set; }
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => new(_read.Task);
        protected override void Dispose(bool disposing) { Disposed = true; _read.TrySetResult(0); base.Dispose(disposing); }
        public override bool CanRead => true;
        public override bool CanWrite => true;
        public override bool CanSeek => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
    }

    private sealed class QueuedDuplexStream(Exception? readFailure = null) : Stream
    {
        private readonly Channel<byte[]> _input = Channel.CreateUnbounded<byte[]>();
        private readonly Channel<string> _responses = Channel.CreateUnbounded<string>();
        private readonly Channel<int> _reads = Channel.CreateUnbounded<int>();
        private int _readCount;
        public bool Disposed { get; private set; }
        public void Enqueue(string value) => _input.Writer.TryWrite(Encoding.ASCII.GetBytes(value));
        public void EndInput() => _input.Writer.TryComplete();
        public Task<string> NextResponseAsync() => _responses.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
        public async Task WaitForReadAsync(int expected)
        {
            while (await _reads.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3)) < expected) { }
        }
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            _reads.Writer.TryWrite(Interlocked.Increment(ref _readCount));
            if (readFailure is not null) throw readFailure;
            byte[] bytes;
            try { bytes = await _input.Reader.ReadAsync(cancellationToken); }
            catch (ChannelClosedException) { return 0; }
            bytes.CopyTo(buffer); return bytes.Length;
        }
        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        { _responses.Writer.TryWrite(Encoding.ASCII.GetString(buffer.Span)); return ValueTask.CompletedTask; }
        protected override void Dispose(bool disposing) { Disposed = true; EndInput(); base.Dispose(disposing); }
        public override bool CanRead => true;
        public override bool CanWrite => true;
        public override bool CanSeek => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
    }
}

internal sealed class TCodeTestSink : IExternalControlSink
{
    private readonly object _sync = new();
    private readonly Channel<IReadOnlyList<ExternalControlCommand>> _batches = Channel.CreateUnbounded<IReadOnlyList<ExternalControlCommand>>();
    private string? _owner;
    public int BatchCount { get; private set; }
    public int StopCount { get; private set; }
    public IReadOnlyList<ExternalControlCommand>? LastBatch { get; private set; }
    public TaskCompletionSource Released { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public bool TryAcquire(string inputId, string sessionId, out string error)
    {
        lock (_sync) { error = _owner is null || _owner == sessionId ? "" : "Busy"; if (error.Length > 0) return false; _owner = sessionId; return true; }
    }
    public bool Publish(string inputId, string sessionId, IReadOnlyList<ExternalControlCommand> commands, out string error)
    {
        lock (_sync)
        {
            error = _owner == sessionId ? "" : "No owner"; if (error.Length > 0) return false;
            LastBatch = commands.ToArray(); BatchCount++; _batches.Writer.TryWrite(LastBatch); return true;
        }
    }
    public void Stop(string inputId, string sessionId, string? channel = null) { lock (_sync) if (_owner == sessionId) StopCount++; }
    public void Release(string inputId, string sessionId) { lock (_sync) if (_owner == sessionId) { _owner = null; Released.TrySetResult(); } }
    public void Heartbeat(string inputId, string sessionId) { }
    public Task<IReadOnlyList<ExternalControlCommand>> NextAsync() => _batches.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
}
