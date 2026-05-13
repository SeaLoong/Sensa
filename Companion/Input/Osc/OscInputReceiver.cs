using System.Net;
using System.Net.Sockets;
using System.Text;

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
                ParseOscPacket(data);
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

    // ────────────────────────────────────────────────────────────────
    //  Minimal OSC 1.0 parser
    //  Only handles the message types VRChat actually sends.
    // ────────────────────────────────────────────────────────────────

    private void ParseOscPacket(byte[] data)
    {
        if (data.Length < 8) return;

        int pos = 0;
        string? address = ReadOscString(data, ref pos);
        if (address is null) return;

        // Check for OSC bundle header (#bundle)
        if (address == "#bundle")
        {
            // Skip timetag (8 bytes) and parse nested messages
            pos += 8;
            while (pos + 4 <= data.Length)
            {
                int size = ReadInt32(data, ref pos);
                if (size <= 0 || pos + size > data.Length) break;
                var nested = new byte[size];
                Array.Copy(data, pos, nested, 0, size);
                ParseOscPacket(nested);
                pos += size;
            }
            return;
        }

        string? typeTag = ReadOscString(data, ref pos);
        if (typeTag is null || typeTag.Length < 2 || typeTag[0] != ',') return;

        // Avatar change notification
        if (address == "/avatar/change")
        {
            _store.Clear();
            OnAvatarChange?.Invoke();
            return;
        }

        // We only care about /avatar/parameters/*
        if (!address.StartsWith("/avatar/parameters/", StringComparison.Ordinal)) return;
        string paramName = address["/avatar/parameters/".Length..];

        // Parse first argument from type tag
        char t = typeTag[1];
        OscValue value;
        switch (t)
        {
            case 'f':
                if (pos + 4 > data.Length) return;
                value = OscValue.FromFloat(ReadFloat(data, ref pos));
                break;
            case 'i':
                if (pos + 4 > data.Length) return;
                value = OscValue.FromInt(ReadInt32(data, ref pos));
                break;
            case 'T':
                value = OscValue.FromBool(true);
                break;
            case 'F':
                value = OscValue.FromBool(false);
                break;
            default:
                return; // unsupported type
        }

        _store.Set(paramName, value);
    }

    // ────────────────────────────────────────────────────────────────
    //  OSC wire helpers  (big-endian, 4-byte aligned)
    // ────────────────────────────────────────────────────────────────

    private static string? ReadOscString(byte[] data, ref int pos)
    {
        int start = pos;
        int end   = pos;
        while (end < data.Length && data[end] != 0) end++;
        if (end >= data.Length) return null;

        string s = Encoding.ASCII.GetString(data, start, end - start);
        // advance past null terminator, padded to 4-byte boundary
        pos = ((end + 1) + 3) & ~3;
        return s;
    }

    private static int ReadInt32(byte[] data, ref int pos)
    {
        if (pos + 4 > data.Length) return 0;
        int v = (data[pos] << 24) | (data[pos+1] << 16) | (data[pos+2] << 8) | data[pos+3];
        pos += 4;
        return v;
    }

    private static float ReadFloat(byte[] data, ref int pos)
    {
        int raw = ReadInt32(data, ref pos);
        return BitConverter.Int32BitsToSingle(raw);
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
}
