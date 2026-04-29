using System.Net;
using System.Net.Sockets;
using System.Text;
using Sensa.Core;

namespace Sensa.Core;

/// <summary>
/// Minimal OSC UDP receiver.  Listens on UDP :9001 (configurable) and
/// decodes VRChat avatar parameter packets into the <see cref="ParameterStore"/>.
///
/// VRChat sends one OSC message per UDP datagram with paths of the form
///   /avatar/parameters/{name}
/// and types: float (f), int (i), true (T), false (F).
///
/// Runs on its own background thread; safe to create and dispose from any thread.
/// </summary>
public sealed class OscReceiver : IDisposable
{
    private readonly ParameterStore _store;
    private readonly int _port;
    private UdpClient?  _udp;
    private Thread?     _thread;
    private volatile bool _running;

    public event Action? OnAvatarChange;

    public OscReceiver(ParameterStore store, int port = 9001)
    {
        _store = store;
        _port  = port;
    }

    public void Start()
    {
        if (_running) return;
        // Create socket first; if the port is in use this throws before _running is set,
        // so a subsequent call to Start() will retry instead of silently no-oping.
        _udp     = new UdpClient(new IPEndPoint(IPAddress.Any, _port));
        _running = true;
        _thread  = new Thread(ReceiveLoop) { IsBackground = true, Name = "OscReceiver" };
        _thread.Start();
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
}
