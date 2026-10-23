using System.Text.Json;

namespace Sensa.Outputs.Adapters;

/// <summary>The wire type of a named output value; range/curves belong to the binding.</summary>
public enum SignalOutputValueType { Float, Int, Bool }

public sealed record SignalOutputValue(string Address, double Value,
    SignalOutputValueType Type = SignalOutputValueType.Float, string SignalId = "",
    string Unit = "", long TimestampMs = 0, string? CoordinateFrame = null)
{
    public object TypedValue()
    {
        if (!double.IsFinite(Value)) throw new ArgumentException("Output values must be finite.");
        return Type switch
        {
            SignalOutputValueType.Float when float.IsFinite((float)Value) => (float)Value,
            SignalOutputValueType.Int when Math.Round(Value, MidpointRounding.AwayFromZero) is >= int.MinValue and <= int.MaxValue
                => (int)Math.Round(Value, MidpointRounding.AwayFromZero),
            SignalOutputValueType.Bool => Value >= .5,
            _ => throw new ArgumentException("Choose a supported output type and range."),
        };
    }
}

/// <summary>
/// An explicit connection owns protocol encoding. The coordinator owns rates, latest-value
/// backpressure, cancellation generations and each binding's configured stop value.
/// </summary>
public interface ISignalOutputAdapter : IAsyncDisposable
{
    bool IsConnected { get; }
    Task ConnectAsync(CancellationToken cancellationToken = default);
    ValueTask SendAsync(SignalOutputValue value, CancellationToken cancellationToken = default);
    /// <summary>Wait for in-flight writes; generic adapters do not invent a stop value.</summary>
    ValueTask StopAsync(CancellationToken cancellationToken = default);
}

public readonly record struct OutputPayload(ReadOnlyMemory<byte> Data, string Address = "",
    string ContentType = "application/octet-stream");

/// <summary>Reusable transport, independent of the signal's mathematical or device meaning.</summary>
public interface IOutputPayloadTransport : IAsyncDisposable
{
    bool IsConnected { get; }
    Task ConnectAsync(CancellationToken cancellationToken = default);
    ValueTask SendAsync(OutputPayload payload, CancellationToken cancellationToken = default);
    ValueTask FlushAsync(CancellationToken cancellationToken = default);
}

public sealed class EncodedSignalOutputAdapter(IOutputPayloadTransport transport,
    Func<SignalOutputValue, OutputPayload> encode) : ISignalOutputAdapter
{
    public bool IsConnected => transport.IsConnected;
    public Task ConnectAsync(CancellationToken cancellationToken = default) => transport.ConnectAsync(cancellationToken);
    public ValueTask SendAsync(SignalOutputValue value, CancellationToken cancellationToken = default) =>
        transport.SendAsync(encode(value), cancellationToken);
    public ValueTask StopAsync(CancellationToken cancellationToken = default) => transport.FlushAsync(cancellationToken);
    public ValueTask DisposeAsync() => transport.DisposeAsync();
}

public static class SignalOutputAdapters
{
    public static ISignalOutputAdapter OscUdp(string host, int port, TimeSpan? timeout = null) =>
        new EncodedSignalOutputAdapter(new UdpOutputTransport(host, port, timeout), OscSignalOutputCodec.Encode);

    public static ISignalOutputAdapter HttpJson(Uri address, HttpClient? client = null, TimeSpan? timeout = null) =>
        new EncodedSignalOutputAdapter(new HttpJsonOutputTransport(address, client, timeout), JsonSignalOutputCodec.Encode);

    public static ISignalOutputAdapter WebSocketJson(Uri address, TimeSpan? timeout = null) =>
        new EncodedSignalOutputAdapter(new WebSocketOutputTransport(address, timeout), JsonSignalOutputCodec.Encode);

    public static ISignalOutputAdapter Mqtt(MqttOutputOptions options) =>
        new EncodedSignalOutputAdapter(new MqttOutputTransport(options), JsonSignalOutputCodec.Encode);

    public static ISignalOutputAdapter Midi(string portName) =>
        new EncodedSignalOutputAdapter(new MidiOutputTransport(portName), MidiCcOutputCodec.Encode);
}

public static class JsonSignalOutputCodec
{
    public static OutputPayload Encode(SignalOutputValue value)
    {
        ArgumentNullException.ThrowIfNull(value);
        if (string.IsNullOrWhiteSpace(value.Address) || value.Address.Length > 512 || value.Address.Any(char.IsControl))
            throw new ArgumentException("Choose an output address of at most 512 characters.");
        return new(JsonSerializer.SerializeToUtf8Bytes(new
        {
            address = value.Address, value = value.TypedValue(), type = value.Type.ToString(),
            signalId = value.SignalId, unit = value.Unit, timestampMs = value.TimestampMs,
            coordinateFrame = value.CoordinateFrame,
        }), value.Address, "application/json");
    }
}
