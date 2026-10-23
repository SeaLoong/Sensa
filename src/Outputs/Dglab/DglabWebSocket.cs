using System.Net.WebSockets;
using System.Text;

namespace Sensa.Outputs.Dglab;

/// <summary>Bounded text-only transport. A protocol disconnect never reconnects or replays.</summary>
public sealed class DglabWebSocket : IDglabSocket
{
    public const int MaximumMessageBytes = 1024 * 1024;
    private readonly ClientWebSocket _socket = new();
    public bool IsOpen => _socket.State == WebSocketState.Open;

    public Task ConnectAsync(Uri address, CancellationToken cancellationToken) =>
        _socket.ConnectAsync(address, cancellationToken);

    public async Task SendTextAsync(string message, CancellationToken cancellationToken)
    {
        var bytes = Encoding.UTF8.GetBytes(message);
        if (bytes.Length > MaximumMessageBytes) throw new ArgumentException("DG-LAB message exceeds 1 MiB.");
        await _socket.SendAsync(bytes.AsMemory(), WebSocketMessageType.Text, true, cancellationToken);
    }

    public async Task<string?> ReceiveTextAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[8192];
        using var message = new MemoryStream();
        while (true)
        {
            var part = await _socket.ReceiveAsync(buffer.AsMemory(), cancellationToken);
            if (part.MessageType == WebSocketMessageType.Close) return null;
            if (part.MessageType != WebSocketMessageType.Text)
                throw new InvalidDataException("DG-LAB V4 requires text frames.");
            if (message.Length + part.Count > MaximumMessageBytes)
                throw new InvalidDataException("DG-LAB message exceeds 1 MiB.");
            message.Write(buffer, 0, part.Count);
            if (part.EndOfMessage) return new UTF8Encoding(false, true).GetString(message.GetBuffer(), 0, (int)message.Length);
        }
    }

    public void Abort() => _socket.Abort();
    public ValueTask DisposeAsync() { _socket.Dispose(); return ValueTask.CompletedTask; }
}
