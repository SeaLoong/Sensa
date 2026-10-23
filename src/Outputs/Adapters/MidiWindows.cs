using System.Globalization;
using System.Runtime.InteropServices;

namespace Sensa.Outputs.Adapters;

internal sealed class WindowsMidiDriver : IMidiOutputDriver
{
    public IReadOnlyList<MidiOutputPort> ListPorts()
    {
        var ports = new List<MidiOutputPort>();
        for (uint index = 0; index < Native.midiOutGetNumDevs(); index++)
        {
            if (Native.midiOutGetDevCapsW((nuint)index, out var caps, (uint)Marshal.SizeOf<Native.Caps>()) == 0)
                ports.Add(new("WinMM:" + index.ToString(CultureInfo.InvariantCulture), caps.Name));
        }
        return ports;
    }

    public IMidiOutputConnection Open(string portId)
    {
        if (!portId.StartsWith("WinMM:", StringComparison.Ordinal)
            || !uint.TryParse(portId[6..], NumberStyles.None, CultureInfo.InvariantCulture, out var index))
            throw new ArgumentException("Choose a Windows MIDI output port.");
        Check(Native.midiOutOpen(out var handle, index, 0, 0, 0));
        return new Connection(handle);
    }

    private static void Check(uint code)
    {
        if (code != 0) throw new IOException("Windows MIDI operation failed (code " + code.ToString(CultureInfo.InvariantCulture) + ").");
    }

    private sealed class Connection(nint handle) : NativeMidiConnection
    {
        protected override void SendCore(byte channel, byte controller, byte value) =>
            Check(Native.midiOutShortMsg(handle, (uint)(0xB0 | channel - 1) | (uint)controller << 8 | (uint)value << 16));

        protected override void CloseCore() => Native.midiOutClose(handle);
    }

    private static class Native
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        internal struct Caps
        {
            public ushort Manufacturer, Product;
            public uint DriverVersion;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Name;
            public ushort Technology, Voices, Notes, ChannelMask;
            public uint Support;
        }

        [DllImport("winmm.dll", ExactSpelling = true)] internal static extern uint midiOutGetNumDevs();
        [DllImport("winmm.dll", ExactSpelling = true, CharSet = CharSet.Unicode)] internal static extern uint midiOutGetDevCapsW(nuint deviceId, out Caps caps, uint size);
        [DllImport("winmm.dll", ExactSpelling = true)] internal static extern uint midiOutOpen(out nint handle, uint deviceId, nuint callback, nuint instance, uint flags);
        [DllImport("winmm.dll", ExactSpelling = true)] internal static extern uint midiOutShortMsg(nint handle, uint message);
        [DllImport("winmm.dll", ExactSpelling = true)] internal static extern uint midiOutClose(nint handle);
    }
}
