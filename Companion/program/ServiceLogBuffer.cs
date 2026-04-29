using System.Collections.Concurrent;

public sealed class ServiceLogBuffer
{
    private readonly ConcurrentQueue<LogEntry> _entries = new();
    private const int MaxEntries = 1000;

    public void Add(string message)
    {
        var entry = new LogEntry(DateTimeOffset.Now, message);
        _entries.Enqueue(entry);
        while (_entries.Count > MaxEntries && _entries.TryDequeue(out _))
        {
        }
    }

    public IReadOnlyList<LogEntry> Snapshot(int takeLast = 200)
    {
        return _entries.ToArray().TakeLast(Math.Max(1, takeLast)).ToArray();
    }
}

public sealed record LogEntry(DateTimeOffset Timestamp, string Message);
