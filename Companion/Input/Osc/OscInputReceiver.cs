using System.Net;
using System.Net.Sockets;

namespace Sensa.Input.Osc;

/// <summary>
/// Minimal OSC UDP receiver.  Listens on UDP :9001 (configurable) and
/// decodes VRChat avatar parameter packets into the <see cref="OscParameterStore"/>.
///
/// VRChat sends one OSC message per UDP datagram with paths of the form
///   /avatar/parameters/{name}
/// and types: float (f), int (i), true (T), false (F).
///
/// Runs on its own background thread; safe to create and dispose from any thread.
/// </summary>
public sealed class OscInputReceiver : IDisposable
{
    private readonly OscParameterStore _store;
    private string _host;
    private int _port;
    private UdpClient?  _udp;
    private Thread?     _thread;
    private volatile bool _running;

    public event Action? OnAvatarChange;

    public OscInputReceiver(OscParameterStore store, string host = "0.0.0.0", int port = 9001)
    {
        _store = store;
        _host  = NormalizeHost(host);
        _port  = NormalizePort(port);
    }

    public string Host => _host;
    public int Port => _port;
    public bool IsRunning => _running;

    public void Start()
    {
        if (_running) return;
        // Create socket first; if the port is in use this throws before _running is set,
        // so a subsequent call to Start() will retry instead of silently no-oping.
        _udp     = new UdpClient(new IPEndPoint(ResolveBindAddress(_host), _port));
        _running = true;
        _thread  = new Thread(ReceiveLoop) { IsBackground = true, Name = "OscReceiver" };
        _thread.Start();
    }

    public void Reconfigure(string host, int port)
    {
        host = NormalizeHost(host);
        port = NormalizePort(port);

        if (string.Equals(_host, host, StringComparison.OrdinalIgnoreCase) && _port == port)
            return;

        var wasRunning = _running;
        var previousHost = _host;
        var previousPort = _port;

        Stop();

        _host = host;
        _port = port;

        try
        {
            if (wasRunning)
                Start();
        }
        catch
        {
            _host = previousHost;
            _port = previousPort;

            if (wasRunning)
                Start();

            throw;
        }
    }

    public void Stop()
    {
        _running = false;
        _udp?.Close();
        _thread?.Join(500);
        _udp = null;
        _thread = null;
    }

    public void Dispose() => Stop();

    // ────────────────────────────────────────────────────────────────
    //  Receive loop
    // ────────────────────────────────────────────────────────────────

    private void ReceiveLoop()
    {
        var endPoint = new IPEndPoint(IPAddress.Any, 0);
        while (_running)
        {
            try
            {
                byte[] data = _udp!.Receive(ref endPoint);
                var source = CreateSource(endPoint);
                OscPacketParser.ParseAvatarPacket(
                    data,
                    source,
                    (path, value, resolvedSource) => _store.Set(path, value, resolvedSource),
                    () =>
                    {
                        _store.Clear();
                        OnAvatarChange?.Invoke();
                    });
            }
            catch (SocketException) when (!_running)
            {
                break; // graceful shutdown
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[OscReceiver] {ex.Message}");
            }
        }
    }

    private static string NormalizeHost(string? host)
    {
        return string.IsNullOrWhiteSpace(host) ? "0.0.0.0" : host.Trim();
    }

    private static int NormalizePort(int port)
    {
        return port is > 0 and <= 65535 ? port : 9001;
    }

    private static IPAddress ResolveBindAddress(string host)
    {
        if (host == "0.0.0.0" || host == "*" || host.Equals("any", StringComparison.OrdinalIgnoreCase))
            return IPAddress.Any;

        if (host == "::")
            return IPAddress.IPv6Any;

        if (IPAddress.TryParse(host, out var ip))
            return ip;

        var resolved = Dns.GetHostAddresses(host)
            .FirstOrDefault(address => address.AddressFamily == AddressFamily.InterNetwork || address.AddressFamily == AddressFamily.InterNetworkV6);

        return resolved ?? throw new InvalidOperationException($"Cannot resolve OSC bind host '{host}'.");
    }

    private static OscSource CreateSource(IPEndPoint endPoint)
    {
        var address = endPoint.Address.ToString();
        var port = endPoint.Port;
        var label = $"{address}:{port}";
        return new OscSource(label, label, null, address, port);
    }
}
