using System.Globalization;

namespace Sensa.Outputs.Adapters;

public sealed record MidiOutputPort(string Id, string Name);

/// <summary>Native device access can be substituted without opening a device in tests.</summary>
public interface IMidiOutputDriver
{
    IReadOnlyList<MidiOutputPort> ListPorts();
    IMidiOutputConnection Open(string portId);
}

public interface IMidiOutputConnection : IDisposable
{
    void SendControlChange(byte channel, byte controller, byte value);
}

/// <summary>MIDI 1.0 CC output over the OS MIDI service, with explicit port selection.</summary>
public sealed class MidiOutputTransport : SerializedOutputPayloadTransport
{
    private readonly string _port;
    private readonly IMidiOutputDriver _driver;
    private IMidiOutputConnection? _connection;

    public MidiOutputTransport(string portName, IMidiOutputDriver? driver = null, TimeSpan? timeout = null) : base(timeout)
    {
        if (string.IsNullOrWhiteSpace(portName) || portName.Length > 256 || portName.Any(char.IsControl))
            throw new ArgumentException("Choose a MIDI output port.");
        _port = portName;
        _driver = driver ?? NativeMidiDrivers.Create();
    }

    public static IReadOnlyList<MidiOutputPort> ListPorts() => NativeMidiDrivers.Create().ListPorts();

    protected override async Task ConnectCoreAsync(CancellationToken cancellationToken)
    {
        var opening = Task.Run(() =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            var ports = _driver.ListPorts();
            var matches = ports.Where(port => port.Id == _port).ToArray();
            if (matches.Length == 0) matches = ports.Where(port => port.Name == _port).ToArray();
            if (matches.Length != 1) throw new InvalidOperationException("Select one available MIDI output port by its unique ID.");
            cancellationToken.ThrowIfCancellationRequested();
            return _driver.Open(matches[0].Id);
        }, cancellationToken);
        var adopted = false;
        try
        {
            var connection = await opening.WaitAsync(cancellationToken).ConfigureAwait(false);
            _connection = connection; adopted = true;
            cancellationToken.ThrowIfCancellationRequested();
        }
        catch
        {
            // A native API cannot be interrupted in managed code. If it returns after the
            // connection deadline, close its handle and never publish the late connection.
            if (!adopted)
                _ = opening.ContinueWith(task =>
                {
                    if (task.IsCompletedSuccessfully) task.Result.Dispose();
                    else _ = task.Exception;
                }, CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
            throw;
        }
    }

    protected override async ValueTask SendCoreAsync(OutputPayload payload, CancellationToken cancellationToken)
    {
        var data = payload.Data.ToArray();
        if (data.Length != 3 || data[0] is < 0xB0 or > 0xBF || data[1] > 127 || data[2] > 127)
            throw new ArgumentException("MIDI output accepts one three-byte control-change message.");
        var connection = _connection ?? throw new InvalidOperationException("The MIDI output is disconnected.");
        await Task.Run(() =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            connection.SendControlChange((byte)((data[0] & 15) + 1), data[1], data[2]);
        }, cancellationToken).WaitAsync(cancellationToken).ConfigureAwait(false);
    }

    protected override void AbortCore()
    {
        _connection?.Dispose(); _connection = null;
    }
}

public static class MidiCcOutputCodec
{
    public static OutputPayload Encode(SignalOutputValue value)
    {
        ArgumentNullException.ThrowIfNull(value);
        var address = value.Address ?? "";
        var parts = address.Split('/');
        if (parts.Length != 3 || !parts[0].Equals("CC", StringComparison.OrdinalIgnoreCase)
            || !int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var channel) || channel is < 1 or > 16
            || !int.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out var controller) || controller is < 0 or > 127)
            throw new ArgumentException("MIDI CC addresses use CC/channel/controller, with channel 1–16 and controller 0–127.");
        if (!Enum.IsDefined(value.Type) || value.Type == SignalOutputValueType.Bool
            || !double.IsFinite(value.Value) || value.Value is < 0 or > 127)
            throw new ArgumentException("MIDI CC values use a numeric range of 0–127.");
        var rounded = (byte)Math.Round(value.Value, MidpointRounding.AwayFromZero);
        return new(new byte[] { (byte)(0xB0 | channel - 1), (byte)controller, rounded }, address);
    }
}

internal static class NativeMidiDrivers
{
    public static IMidiOutputDriver Create()
    {
        if (OperatingSystem.IsWindows()) return new WindowsMidiDriver();
        if (OperatingSystem.IsMacOS()) return new MacMidiDriver();
        if (OperatingSystem.IsLinux()) return new AlsaMidiDriver();
        throw new PlatformNotSupportedException("Native MIDI output is available on Windows, macOS and Linux with their MIDI services installed.");
    }
}

internal abstract class NativeMidiConnection : IMidiOutputConnection
{
    private readonly object _gate = new();
    private int _disposed;

    public void SendControlChange(byte channel, byte controller, byte value)
    {
        if (channel is < 1 or > 16 || controller > 127 || value > 127) throw new ArgumentOutOfRangeException(nameof(channel));
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(Volatile.Read(ref _disposed) != 0, this);
            SendCore(channel, controller, value);
        }
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        // Retire immediately; never free a native handle while its OS call is using it.
        // Closing happens off the coordinator thread, including an unresponsive driver.
        ThreadPool.QueueUserWorkItem(_ => { lock (_gate) { try { CloseCore(); } catch (Exception) { } } });
    }

    protected abstract void SendCore(byte channel, byte controller, byte value);
    protected abstract void CloseCore();
}
