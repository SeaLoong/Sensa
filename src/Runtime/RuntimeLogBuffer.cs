using System.Collections.Concurrent;

namespace Sensa.Runtime;

public enum RuntimeLogLevel
{
    Debug,
    Info,
    Warning,
    Error,
}

public sealed class RuntimeLogBuffer
{
    private readonly ConcurrentQueue<RuntimeLogEntry> _entries = new();
    private const int MaxEntries = 2000;

    public event Action<RuntimeLogEntry>? EntryAdded;

    public void Add(string message, RuntimeLogLevel level = RuntimeLogLevel.Info)
    {
        var category = ParseCategory(message);
        var entry = new RuntimeLogEntry(DateTimeOffset.Now, level, category, message);
        _entries.Enqueue(entry);
        while (_entries.Count > MaxEntries && _entries.TryDequeue(out _))
        {
        }
        EntryAdded?.Invoke(entry);
    }

    public IReadOnlyList<RuntimeLogEntry> Snapshot(int takeLast = 200, RuntimeLogLevel? minLevel = null, string? category = null)
    {
        var all = _entries.ToArray();
        IEnumerable<RuntimeLogEntry> query = all;

        if (minLevel.HasValue)
            query = query.Where(entry => entry.Level >= minLevel.Value);
        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(entry => string.Equals(entry.Category, category, StringComparison.OrdinalIgnoreCase));

        return query.TakeLast(Math.Max(1, takeLast)).ToArray();
    }

    private static string ParseCategory(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return "General";

        if (message.Length > 2 && message[0] == '[')
        {
            var end = message.IndexOf(']');
            if (end > 1)
                return message[1..end].Trim();
        }

        return "General";
    }
}

public sealed record RuntimeLogEntry(DateTimeOffset Timestamp, RuntimeLogLevel Level, string Category, string Message);
