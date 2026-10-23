using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

namespace Sensa.Outputs.Adapters;

internal sealed class MacMidiDriver : IMidiOutputDriver
{
    public IReadOnlyList<MidiOutputPort> ListPorts()
    {
        var ports = new List<MidiOutputPort>();
        for (nuint index = 0; index < Native.MIDIGetNumberOfDestinations(); index++)
        {
            var endpoint = Native.MIDIGetDestination(index);
            if (endpoint == 0 || GetInteger(endpoint, "uniqueID", out var id) != 0) continue;
            ports.Add(new("CoreMIDI:" + id.ToString(CultureInfo.InvariantCulture), GetName(endpoint)));
        }
        return ports;
    }

    public IMidiOutputConnection Open(string portId)
    {
        if (!portId.StartsWith("CoreMIDI:", StringComparison.Ordinal)
            || !int.TryParse(portId[9..], NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var id))
            throw new ArgumentException("Choose a macOS MIDI output port.");
        uint endpoint = 0;
        for (nuint index = 0; index < Native.MIDIGetNumberOfDestinations(); index++)
        {
            var candidate = Native.MIDIGetDestination(index);
            if (candidate != 0 && GetInteger(candidate, "uniqueID", out var actual) == 0 && actual == id) { endpoint = candidate; break; }
        }
        if (endpoint == 0) throw new IOException("The selected macOS MIDI destination is unavailable.");
        var name = MakeString("Sensa output");
        uint client = 0, port = 0;
        try
        {
            Check(Native.MIDIClientCreate(name, 0, 0, out client));
            Check(Native.MIDIOutputPortCreate(client, name, out port));
            return new Connection(client, port, endpoint);
        }
        catch { if (port != 0) Native.MIDIPortDispose(port); if (client != 0) Native.MIDIClientDispose(client); throw; }
        finally { Native.CFRelease(name); }
    }

    private static int GetInteger(uint endpoint, string property, out int value)
    {
        var key = MakeString(property);
        try { return Native.MIDIObjectGetIntegerProperty(endpoint, key, out value); }
        finally { Native.CFRelease(key); }
    }

    private static string GetName(uint endpoint)
    {
        var key = MakeString("displayName"); nint text = 0;
        try
        {
            if (Native.MIDIObjectGetStringProperty(endpoint, key, out text) != 0 || text == 0) return "MIDI destination";
            var buffer = new byte[1024];
            if (!Native.CFStringGetCString(text, buffer, buffer.Length, 0x08000100)) return "MIDI destination";
            return Encoding.UTF8.GetString(buffer.AsSpan(0, Array.IndexOf(buffer, (byte)0)));
        }
        finally { if (text != 0) Native.CFRelease(text); Native.CFRelease(key); }
    }

    private static nint MakeString(string text)
    {
        var value = Native.CFStringCreateWithCString(0, text, 0x08000100);
        return value != 0 ? value : throw new OutOfMemoryException("A MIDI display string could not be allocated.");
    }
    private static void Check(int code)
    {
        if (code != 0) throw new IOException("macOS MIDI operation failed (code " + code.ToString(CultureInfo.InvariantCulture) + ").");
    }

    private sealed class Connection(uint client, uint port, uint destination) : NativeMidiConnection
    {
        protected override void SendCore(byte channel, byte controller, byte value)
        {
            var packetList = Marshal.AllocHGlobal(256);
            try
            {
                var packet = Native.MIDIPacketListInit(packetList);
                var added = Native.MIDIPacketListAdd(packetList, 256, packet, 0, 3, [(byte)(0xB0 | channel - 1), controller, value]);
                if (added == 0) throw new IOException("The macOS MIDI packet could not be constructed.");
                Check(Native.MIDISend(port, destination, packetList));
            }
            finally { Marshal.FreeHGlobal(packetList); }
        }

        protected override void CloseCore()
        {
            Native.MIDIPortDispose(port); Native.MIDIClientDispose(client);
        }
    }

    private static class Native
    {
        private const string Midi = "/System/Library/Frameworks/CoreMIDI.framework/CoreMIDI";
        private const string Core = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
        [DllImport(Midi)] internal static extern nuint MIDIGetNumberOfDestinations();
        [DllImport(Midi)] internal static extern uint MIDIGetDestination(nuint index);
        [DllImport(Midi)] internal static extern int MIDIObjectGetIntegerProperty(uint endpoint, nint property, out int value);
        [DllImport(Midi)] internal static extern int MIDIObjectGetStringProperty(uint endpoint, nint property, out nint value);
        [DllImport(Midi)] internal static extern int MIDIClientCreate(nint name, nint callback, nint context, out uint client);
        [DllImport(Midi)] internal static extern int MIDIOutputPortCreate(uint client, nint name, out uint port);
        [DllImport(Midi)] internal static extern nint MIDIPacketListInit(nint packetList);
        [DllImport(Midi)] internal static extern nint MIDIPacketListAdd(nint packetList, nuint listSize, nint current, ulong timestamp, nuint length, byte[] data);
        [DllImport(Midi)] internal static extern int MIDISend(uint port, uint destination, nint packetList);
        [DllImport(Midi)] internal static extern int MIDIPortDispose(uint port);
        [DllImport(Midi)] internal static extern int MIDIClientDispose(uint client);
        [DllImport(Core)] internal static extern nint CFStringCreateWithCString(nint allocator, [MarshalAs(UnmanagedType.LPUTF8Str)] string text, uint encoding);
        [DllImport(Core)] [return: MarshalAs(UnmanagedType.I1)] internal static extern bool CFStringGetCString(nint text, byte[] buffer, nint size, uint encoding);
        [DllImport(Core)] internal static extern void CFRelease(nint reference);
    }
}
