using System.Globalization;
using System.Runtime.InteropServices;

namespace Sensa.Outputs.Adapters;

internal sealed class AlsaMidiDriver : IMidiOutputDriver
{
    public IReadOnlyList<MidiOutputPort> ListPorts()
    {
        var sequencer = OpenSequencer(); nint clientInfo = 0, portInfo = 0;
        try
        {
            Check(Native.snd_seq_client_info_malloc(out clientInfo));
            Check(Native.snd_seq_port_info_malloc(out portInfo));
            var ports = new List<MidiOutputPort>();
            Native.snd_seq_client_info_set_client(clientInfo, -1);
            while (Native.snd_seq_query_next_client(sequencer, clientInfo) >= 0)
            {
                var clientId = Native.snd_seq_client_info_get_client(clientInfo);
                if (clientId == 0) continue; // System timer/announce ports are not MIDI destinations.
                var clientName = Marshal.PtrToStringUTF8(Native.snd_seq_client_info_get_name(clientInfo)) ?? "MIDI client";
                Native.snd_seq_port_info_set_client(portInfo, clientId);
                Native.snd_seq_port_info_set_port(portInfo, -1);
                while (Native.snd_seq_query_next_port(sequencer, portInfo) >= 0)
                {
                    var capabilities = Native.snd_seq_port_info_get_capability(portInfo);
                    var type = Native.snd_seq_port_info_get_type(portInfo);
                    if ((capabilities & 2) == 0 || (type & 0x7e) == 0) continue;
                    var portId = Native.snd_seq_port_info_get_port(portInfo);
                    var name = Marshal.PtrToStringUTF8(Native.snd_seq_port_info_get_name(portInfo)) ?? "MIDI port";
                    ports.Add(new($"ALSA:{clientId}:{portId}", clientName + " / " + name));
                }
            }
            return ports;
        }
        finally
        {
            if (portInfo != 0) Native.snd_seq_port_info_free(portInfo);
            if (clientInfo != 0) Native.snd_seq_client_info_free(clientInfo);
            Native.snd_seq_close(sequencer);
        }
    }

    public IMidiOutputConnection Open(string portId)
    {
        var parts = portId.Split(':');
        if (parts.Length != 3 || parts[0] != "ALSA"
            || !byte.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var clientId)
            || !byte.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out var destinationPort))
            throw new ArgumentException("Choose a Linux ALSA MIDI destination.");
        var sequencer = OpenSequencer(); nint parser = 0;
        try
        {
            Check(Native.snd_seq_set_client_name(sequencer, "Sensa"));
            var sourcePort = Native.snd_seq_create_simple_port(sequencer, "Sensa CC output", 33, (1u << 1) | (1u << 20));
            Check(sourcePort);
            Check(Native.snd_midi_event_new(32, out parser));
            return new Connection(sequencer, parser, checked((byte)Native.snd_seq_client_id(sequencer)),
                checked((byte)sourcePort), clientId, destinationPort);
        }
        catch { if (parser != 0) Native.snd_midi_event_free(parser); Native.snd_seq_close(sequencer); throw; }
    }

    private static nint OpenSequencer()
    {
        try
        {
            var result = Native.snd_seq_open(out var sequencer, "default", 1, 1); // Output, non-blocking.
            if (result < 0) throw new IOException("Linux MIDI requires an available ALSA sequencer (including /dev/snd/seq).");
            return sequencer;
        }
        catch (DllNotFoundException) { throw new PlatformNotSupportedException("Linux MIDI requires the libasound ALSA library and sequencer service."); }
    }

    private static void Check(int code)
    {
        if (code < 0) throw new IOException("ALSA MIDI operation failed (code " + code.ToString(CultureInfo.InvariantCulture) + ").");
    }

    private sealed class Connection(nint sequencer, nint parser, byte sourceClient, byte sourcePort,
        byte destinationClient, byte destinationPort) : NativeMidiConnection
    {
        protected override void SendCore(byte channel, byte controller, byte value)
        {
            // snd_seq_event_t has its fixed header at offsets 0–15 on all supported
            // x64/ARM64 targets; libasound constructs its union using the official encoder.
            var midi = new byte[] { (byte)(0xB0 | channel - 1), controller, value };
            var encodedEvent = Marshal.AllocHGlobal(64);
            try
            {
                Marshal.Copy(new byte[64], 0, encodedEvent, 64);
                var consumed = Native.snd_midi_event_encode(parser, midi, midi.Length, encodedEvent);
                if (consumed != midi.Length) throw new IOException("ALSA could not encode the MIDI control change.");
                Marshal.WriteByte(encodedEvent, 3, 253); // SND_SEQ_QUEUE_DIRECT.
                Marshal.WriteByte(encodedEvent, 12, sourceClient); Marshal.WriteByte(encodedEvent, 13, sourcePort);
                Marshal.WriteByte(encodedEvent, 14, destinationClient); Marshal.WriteByte(encodedEvent, 15, destinationPort);
                Check(Native.snd_seq_event_output_direct(sequencer, encodedEvent));
            }
            finally { Marshal.FreeHGlobal(encodedEvent); }
        }

        protected override void CloseCore()
        {
            Native.snd_midi_event_free(parser); Native.snd_seq_close(sequencer);
        }
    }

    private static class Native
    {
        private const string Alsa = "libasound.so.2";
        [DllImport(Alsa)] internal static extern int snd_seq_open(out nint handle, [MarshalAs(UnmanagedType.LPUTF8Str)] string name, int streams, int mode);
        [DllImport(Alsa)] internal static extern int snd_seq_close(nint handle);
        [DllImport(Alsa)] internal static extern int snd_seq_set_client_name(nint handle, [MarshalAs(UnmanagedType.LPUTF8Str)] string name);
        [DllImport(Alsa)] internal static extern int snd_seq_client_id(nint handle);
        [DllImport(Alsa)] internal static extern int snd_seq_create_simple_port(nint handle, [MarshalAs(UnmanagedType.LPUTF8Str)] string name, uint caps, uint type);
        [DllImport(Alsa)] internal static extern int snd_seq_client_info_malloc(out nint info);
        [DllImport(Alsa)] internal static extern void snd_seq_client_info_free(nint info);
        [DllImport(Alsa)] internal static extern void snd_seq_client_info_set_client(nint info, int client);
        [DllImport(Alsa)] internal static extern int snd_seq_client_info_get_client(nint info);
        [DllImport(Alsa)] internal static extern nint snd_seq_client_info_get_name(nint info);
        [DllImport(Alsa)] internal static extern int snd_seq_query_next_client(nint handle, nint info);
        [DllImport(Alsa)] internal static extern int snd_seq_port_info_malloc(out nint info);
        [DllImport(Alsa)] internal static extern void snd_seq_port_info_free(nint info);
        [DllImport(Alsa)] internal static extern void snd_seq_port_info_set_client(nint info, int client);
        [DllImport(Alsa)] internal static extern void snd_seq_port_info_set_port(nint info, int port);
        [DllImport(Alsa)] internal static extern int snd_seq_port_info_get_port(nint info);
        [DllImport(Alsa)] internal static extern nint snd_seq_port_info_get_name(nint info);
        [DllImport(Alsa)] internal static extern uint snd_seq_port_info_get_capability(nint info);
        [DllImport(Alsa)] internal static extern uint snd_seq_port_info_get_type(nint info);
        [DllImport(Alsa)] internal static extern int snd_seq_query_next_port(nint handle, nint info);
        [DllImport(Alsa)] internal static extern int snd_midi_event_new(nuint size, out nint parser);
        [DllImport(Alsa)] internal static extern void snd_midi_event_free(nint parser);
        [DllImport(Alsa)] internal static extern nint snd_midi_event_encode(nint parser, byte[] data, nint length, nint encodedEvent);
        [DllImport(Alsa)] internal static extern int snd_seq_event_output_direct(nint handle, nint encodedEvent);
    }
}
