using System.Collections.Concurrent;

public enum LogLevel
{
    Debug,
    Info,
    Warning,
    Error,
}

public sealed class ServiceLogBuffer
{
    private readonly ConcurrentQueue<LogEntry> _entries = new();
    private const int MaxEntries = 2000;

    public void Add(string message, LogLevel level = LogLevel.Info)
    {
        var category = ParseCategory(message);
        var entry = new LogEntry(DateTimeOffset.Now, level, category, message);
        _entries.Enqueue(entry);
        while (_entries.Count > MaxEntries && _entries.TryDequeue(out _))
        {
        }
    }

    public IReadOnlyList<LogEntry> Snapshot(int takeLast = 200, LogLevel? minLevel = null, string? category = null)
    {
        var all = _entries.ToArray();
        IEnumerable<LogEntry> query = all;

        if (minLevel.HasValue)
            query = query.Where(e => e.Level >= minLevel.Value);
        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(e => string.Equals(e.Category, category, StringComparison.OrdinalIgnoreCase));

        return query.TakeLast(Math.Max(1, takeLast)).ToArray();
    }

    private static string ParseCategory(string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return "General";
        if (message.Length > 2 && message[0] == '[')
        {
            var end = message.IndexOf(']');
            if (end > 1)
                return message[1..end].Trim();
        }
        return "General";
    }
}

public sealed record LogEntry(DateTimeOffset Timestamp, LogLevel Level, string Category, string Message);
