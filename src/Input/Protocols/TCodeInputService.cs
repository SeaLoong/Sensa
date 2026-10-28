using System.IO.Ports;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace Sensa.Input.Protocols;

/// <summary>TCode TCP/UDP listeners and an explicitly selected serial input. Opening a listener never enables output.</summary>
public sealed class TCodeInputService : IAsyncDisposable
{
    private readonly ProtocolInputConfig _config;
    private readonly IExternalControlSink _sink;
    private readonly Func<ProtocolInputConfig, CancellationToken, Task<Stream>>? _serialStreamFactory;
    private readonly TimeProvider _clock;
    private readonly object _sync = new();
    private readonly HashSet<Stream> _streams = new();
    private readonly HashSet<Task> _sessions = new();
    private readonly Dictionary<TCodeInputSession, TCodeLineFramer> _activeSessions = new();
    private CancellationTokenSource? _shutdown;
    private TcpListener? _listener;
    private UdpClient? _udp;
    private SerialPort? _serial;
    private Task? _worker;
    private bool _disposed;
    public int BoundPort { get; private set; }
    public string? LastError { get; private set; }

    public TCodeInputService(ProtocolInputConfig config, IExternalControlSink sink,
        Func<ProtocolInputConfig, CancellationToken, Task<Stream>>? serialStreamFactory = null, TimeProvider? clock = null)
    {
        _config = config; _sink = sink; _serialStreamFactory = serialStreamFactory; _clock = clock ?? TimeProvider.System;
    }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (_shutdown is not null) throw new InvalidOperationException("TCode input has already started.");
        // Validate feature channel names before exposing any transport.
        using (new TCodeInputSession(_config, _sink, "validation")) { }
        _shutdown = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var token = _shutdown.Token;
        try
        {
            if (_config.Type == "TCodeSerial")
            {
                Stream stream;
                if (_serialStreamFactory is not null) stream = await _serialStreamFactory(_config, token);
                else
                {
                    _serial = new SerialPort(_config.ComPort, _config.BaudRate, Parity.None, 8, StopBits.One)
                    { ReadTimeout = Math.Max(100, _config.TimeoutMs), WriteTimeout = 1000 };
                    _serial.Open();
                    stream = _serial.BaseStream;
                }
                lock (_sync) _streams.Add(stream);
                _worker = RunStreamAsync(stream, "serial:" + _config.Id, token);
                return;
            }
            var host = string.IsNullOrWhiteSpace(_config.Host) ? "127.0.0.1" : _config.Host;
            var address = IPAddress.TryParse(host, out var parsed) ? parsed
                : (await Dns.GetHostAddressesAsync(host, token)).First();
            if (_config.Type == "TCodeTcp")
            {
                _listener = new(address, _config.Port); _listener.Start(16);
                BoundPort = ((IPEndPoint)_listener.LocalEndpoint).Port;
                _worker = AcceptAsync(token);
            }
            else if (_config.Type == "TCodeUdp")
            {
                _udp = new(new IPEndPoint(address, _config.Port));
                BoundPort = ((IPEndPoint)_udp.Client.LocalEndPoint!).Port;
                _worker = ReceiveDatagramsAsync(token);
            }
            else throw new ArgumentException("Choose a TCodeTcp, TCodeUdp or TCodeSerial input.");
        }
        catch
        {
            await DisposeAsync();
            throw;
        }
    }

    private async Task AcceptAsync(CancellationToken cancellation)
    {
        try
        {
            while (!cancellation.IsCancellationRequested)
            {
                var client = await _listener!.AcceptTcpClientAsync(cancellation);
                client.NoDelay = true;
                var stream = client.GetStream();
                lock (_sync)
                {
                    if (_streams.Count >= 8) { client.Dispose(); continue; }
                    _streams.Add(stream);
                }
                var session = RunTcpClientAsync(client, stream, cancellation);
                lock (_sync) _sessions.Add(session);
                _ = session.ContinueWith(completed => { lock (_sync) _sessions.Remove(completed); },
                    CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
            }
        }
        catch (Exception exception) when (cancellation.IsCancellationRequested && exception is OperationCanceledException or ObjectDisposedException or SocketException) { }
        catch (Exception exception) { LastError = exception.GetType().Name; }
    }

    private async Task RunTcpClientAsync(TcpClient client, Stream stream, CancellationToken cancellation)
    {
        using (client) await RunStreamAsync(stream, "tcp:" + Guid.NewGuid().ToString("N"), cancellation);
    }

    private async Task RunStreamAsync(Stream stream, string id, CancellationToken cancellation)
    {
        using var session = new TCodeInputSession(_config, _sink, id, _clock);
        var framer = new TCodeLineFramer();
        try
        {
            if (!session.TryAcquire(out _))
            {
                await WriteAsync(stream, "ERR input is controlled by another session\n", cancellation);
                return;
            }
            lock (_sync) _activeSessions.Add(session, framer);
            var buffer = new byte[2048];
            while (!cancellation.IsCancellationRequested)
            {
                var count = await ReadWithinIdleBudgetAsync(stream, buffer, session, cancellation);
                if (count == 0) break;
                var epoch = session.Epoch;
                IReadOnlyList<string> lines;
                try { lines = framer.Push(buffer.AsSpan(0, count)); }
                catch (FormatException)
                {
                    session.Stop();
                    await WriteAsync(stream, "ERR invalid TCode frame\n", cancellation);
                    return;
                }
                foreach (var line in lines)
                {
                    var accepted = session.TryProcessLine(line, out var response, out var error, epoch);
                    if (!accepted) response = "ERR " + error + "\n";
                    if (response.Length > 0) await WriteAsync(stream, response, cancellation);
                    if (!accepted) return;
                }
            }
        }
        catch (Exception exception) when (exception is OperationCanceledException or ObjectDisposedException or IOException or SocketException or TimeoutException)
        {
            if (!cancellation.IsCancellationRequested && exception is not OperationCanceledException) LastError = exception.GetType().Name;
        }
        finally
        {
            session.Stop();
            lock (_sync) { _streams.Remove(stream); _activeSessions.Remove(session); }
            stream.Dispose();
        }
    }

    private async Task ReceiveDatagramsAsync(CancellationToken cancellation)
    {
        IPEndPoint? owner = null;
        TCodeInputSession? session = null;
        var framer = new TCodeLineFramer();
        Task<UdpReceiveResult>? pendingReceive = null;
        try
        {
            while (!cancellation.IsCancellationRequested)
            {
                UdpReceiveResult received;
                pendingReceive ??= _udp!.ReceiveAsync(cancellation).AsTask();
                if (session is not null)
                {
                    var remaining = session.RemainingIdleTime;
                    if (remaining <= TimeSpan.Zero)
                    {
                        lock (_sync) _activeSessions.Remove(session);
                        session.Dispose(); session = null; owner = null; framer.Reset(); continue;
                    }
                }
                try
                {
                    received = session is null ? await pendingReceive.WaitAsync(cancellation)
                        : await pendingReceive.WaitAsync(MinimumBudget(session.RemainingIdleTime), _clock, cancellation);
                }
                catch (TimeoutException) when (!pendingReceive.IsCompleted) { continue; }
                pendingReceive = null;
                if (owner is not null && !owner.Equals(received.RemoteEndPoint)) continue;
                if (session is null)
                {
                    session = new(_config, _sink, "udp:" + received.RemoteEndPoint, _clock);
                    if (!session.TryAcquire(out _)) { session.Dispose(); session = null; continue; }
                    lock (_sync) _activeSessions.Add(session, framer);
                    owner = received.RemoteEndPoint;
                }
                // UDP frames are self-contained. Never join a lost/truncated datagram with the next one.
                if (received.Buffer.Length == 0 || received.Buffer.Length > TCodeProtocol.MaximumLineBytes
                    || received.Buffer[^1] is not (10 or 13))
                {
                    lock (_sync) _activeSessions.Remove(session);
                    session.Dispose(); session = null; owner = null; framer.Reset(); continue;
                }
                IReadOnlyList<string> lines;
                var epoch = session.Epoch;
                try { lines = framer.Push(received.Buffer); }
                catch (FormatException)
                {
                    lock (_sync) _activeSessions.Remove(session);
                    session.Dispose(); session = null; owner = null; framer.Reset(); continue;
                }
                foreach (var line in lines)
                {
                    var accepted = session.TryProcessLine(line, out var response, out var error, epoch);
                    if (!accepted) response = "ERR " + error + "\n";
                    if (response.Length > 0)
                    {
                        var payload = Encoding.ASCII.GetBytes(response);
                        await _udp!.SendAsync(payload, received.RemoteEndPoint, cancellation);
                    }
                    if (!accepted)
                    {
                        lock (_sync) _activeSessions.Remove(session);
                        session.Dispose(); session = null; owner = null; framer.Reset(); break;
                    }
                }
            }
        }
        catch (Exception exception) when (cancellation.IsCancellationRequested && exception is OperationCanceledException or ObjectDisposedException or SocketException) { }
        catch (Exception exception) { LastError = exception.GetType().Name; }
        finally
        {
            if (session is not null) { lock (_sync) _activeSessions.Remove(session); session.Dispose(); }
        }
    }

    private static TimeSpan MinimumBudget(TimeSpan remaining) => remaining < TimeSpan.FromMilliseconds(250)
        ? remaining : TimeSpan.FromMilliseconds(250);

    private async Task<int> ReadWithinIdleBudgetAsync(Stream stream, Memory<byte> buffer, TCodeInputSession session, CancellationToken cancellation)
    {
        // Reuse one pending read while checking the absolute command deadline. Serial drivers may
        // ignore cancellation; byte fragments must not renew a lease, and reset must shorten an old
        // long-trajectory deadline without leaving abandoned concurrent reads on the same stream.
        var pending = stream.ReadAsync(buffer, cancellation).AsTask();
        _ = pending.ContinueWith(completed => { _ = completed.Exception; }, CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
        while (true)
        {
            var remaining = session.RemainingIdleTime;
            if (remaining <= TimeSpan.Zero) throw new TimeoutException("The TCode command and idle grace have expired.");
            try { return await pending.WaitAsync(MinimumBudget(remaining), _clock, cancellation); }
            catch (TimeoutException) when (!pending.IsCompleted) { }
        }
    }

    private static async Task WriteAsync(Stream stream, string response, CancellationToken cancellation)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(TimeSpan.FromSeconds(1));
        await stream.WriteAsync(Encoding.ASCII.GetBytes(response), deadline.Token).AsTask().WaitAsync(deadline.Token);
        await stream.FlushAsync(deadline.Token).WaitAsync(deadline.Token);
    }

    public void ResetCommands()
    {
        KeyValuePair<TCodeInputSession, TCodeLineFramer>[] sessions;
        lock (_sync) sessions = _activeSessions.ToArray();
        foreach (var (session, framer) in sessions) { framer.Reset(); session.ResetCommands(); }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return; _disposed = true;
        if (_shutdown is null) return;
        _shutdown.Cancel(); _listener?.Stop(); _udp?.Dispose();
        Stream[] streams; Task[] sessions;
        lock (_sync) { streams = _streams.ToArray(); sessions = _sessions.ToArray(); }
        // Closing a serial handle also interrupts drivers that do not honor async read cancellation.
        _serial?.Dispose();
        foreach (var stream in streams) stream.Dispose();
        var pending = sessions.Concat(_worker is null ? [] : new[] { _worker }).ToArray();
        try { await Task.WhenAll(pending).WaitAsync(TimeSpan.FromSeconds(3)); }
        catch (Exception exception) when (exception is OperationCanceledException or ObjectDisposedException or IOException or SocketException or TimeoutException) { }
        _shutdown.Dispose();
    }
}
