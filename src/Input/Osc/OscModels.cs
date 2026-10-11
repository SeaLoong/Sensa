using System.Collections.Concurrent;

namespace Sensa.Input.Osc;

public enum OscValueType
{
    Float,
    Int,
    Bool,
}

public readonly struct OscValue
{
    public readonly OscValueType Type;
    public readonly float Float;
    public readonly int Int;
    public readonly bool Bool;

    public static OscValue FromFloat(float value) => new(OscValueType.Float, value, 0, false);
    public static OscValue FromInt(int value) => new(OscValueType.Int, 0f, value, false);
    public static OscValue FromBool(bool value) => new(OscValueType.Bool, value ? 1f : 0f, 0, value);

    private OscValue(OscValueType type, float floatValue, int intValue, bool boolValue)
    {
        Type = type;
        Float = floatValue;
        Int = intValue;
        Bool = boolValue;
    }

    public float AsFloat() => Type switch
    {
        OscValueType.Float => Float,
        OscValueType.Int => Int,
        OscValueType.Bool => Bool ? 1f : 0f,
        _ => 0f,
    };
}

public readonly record struct OscSource(
    string Key,
    string Label,
    string? PersistentId,
    string Address,
    int Port)
{
    public static OscSource Unknown => new("unknown", "未知来源", null, string.Empty, 0);
}

public sealed class OscParameterStore
{
    public readonly record struct Entry(OscValue Value, long TimestampMs, OscSource Source);

    public readonly record struct SnapshotEntry(string Path, Entry Entry);

    public readonly record struct SourceSnapshot(
        string Key,
        string Label,
        string? PersistentId,
        string Address,
        int Port,
        int ParameterCount,
        long LastSeenTimestampMs);

    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, Entry>> _store = new(StringComparer.Ordinal);
    private readonly object _capacityGate = new();
    public const int MaxPaths = 4096;
    public const int MaxSources = 32;
    private long _lastPrune;
    private readonly ConcurrentDictionary<string, OscSource> _sources = new(StringComparer.Ordinal);

    public event Action<string, OscValue>? OnSet;
    public event Action<string, OscValue, OscSource>? OnSetWithSource;

    public void Set(string path, OscValue value)
    {
        Set(path, value, OscSource.Unknown);
    }

    public void Set(string path, OscValue value, OscSource source)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Length > 512 || !float.IsFinite(value.AsFloat()))
            return;

        var normalizedPath = path.Trim();
        var normalizedSource = NormalizeSource(source);
        var timestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var entry = new Entry(value, timestampMs, normalizedSource);
        lock (_capacityGate)
        {
            if (timestampMs - _lastPrune > 10000)
            {
                _lastPrune = timestampMs;
                var lastSeen = _store.Values.SelectMany(bucket => bucket.Values)
                    .GroupBy(item => item.Source.Key).ToDictionary(group => group.Key, group => group.Max(item => item.TimestampMs));
                foreach (var pair in _store)
                {
                    foreach (var item in pair.Value)
                        if (timestampMs - lastSeen.GetValueOrDefault(item.Key) > 300000) pair.Value.TryRemove(item.Key, out _);
                    if (pair.Value.IsEmpty) _store.TryRemove(pair.Key, out _);
                }
                var liveSources = _store.Values.SelectMany(b => b.Keys).ToHashSet();
                foreach (var key in _sources.Keys) if (!liveSources.Contains(key)) _sources.TryRemove(key, out _);
            }
            if ((!_store.ContainsKey(normalizedPath) && _store.Count >= MaxPaths)
                || (!_sources.ContainsKey(normalizedSource.Key) && _sources.Count >= MaxSources)) return;
            if ((!_store.TryGetValue(normalizedPath, out var existing) || !existing.ContainsKey(normalizedSource.Key)) && _store.Sum(p => p.Value.Count) >= MaxPaths) return;
            var bucket = _store.GetOrAdd(normalizedPath, static _ => new ConcurrentDictionary<string, Entry>(StringComparer.Ordinal));
            bucket[normalizedSource.Key] = entry;
            _sources[normalizedSource.Key] = normalizedSource;
        }
        OnSet?.Invoke(normalizedPath, value);
        OnSetWithSource?.Invoke(normalizedPath, value, normalizedSource);
    }

    public bool TryGetLatest(string pathOrPattern, out Entry entry) =>
        TryGetLatest(pathOrPattern, preferredSourceKey: null, out _, out entry);

    public bool TryGetLatest(string pathOrPattern, out string matchedPath, out Entry entry)
    {
        return TryGetLatest(pathOrPattern, preferredSourceKey: null, out matchedPath, out entry);
    }

    public bool TryGetLatest(string pathOrPattern, string? preferredSourceKey, out Entry entry) =>
        TryGetLatest(pathOrPattern, preferredSourceKey, out _, out entry);

    public bool TryGetLatest(string pathOrPattern, string? preferredSourceKey, out string matchedPath, out Entry entry)
    {
        matchedPath = string.Empty;
        entry = default;

        if (string.IsNullOrWhiteSpace(pathOrPattern))
            return false;

        if (pathOrPattern.Contains(';') || pathOrPattern.Contains('\n'))
        {
            var latest = MatchingEntries(pathOrPattern, preferredSourceKey).OrderByDescending(e => e.Entry.TimestampMs).FirstOrDefault();
            if (latest.Path is null) return false;
            matchedPath = latest.Path; entry = latest.Entry; return true;
        }
        var sourceKey = ResolvePreferredSourceKey(preferredSourceKey);

        if (_store.TryGetValue(pathOrPattern, out var exactEntries))
        {
            if (TryGetLatestFromBucket(exactEntries, sourceKey, out entry))
            {
                matchedPath = pathOrPattern;
                return true;
            }

            if (!pathOrPattern.Contains('*'))
                return false;
        }

        if (!pathOrPattern.Contains('*'))
            return false;

        var found = false;
        var latestTimestampMs = long.MinValue;

        foreach (var (path, bucket) in _store)
        {
            if (!MatchesPathPattern(pathOrPattern, path))
                continue;

            if (!TryGetLatestFromBucket(bucket, sourceKey, out var current))
                continue;

            if (!found || current.TimestampMs > latestTimestampMs)
            {
                matchedPath = path;
                entry = current;
                latestTimestampMs = current.TimestampMs;
                found = true;
            }
        }

        return found;
    }

    public static bool MatchesPathPattern(string pathOrPattern, string actualPath)
    {
        if (string.IsNullOrWhiteSpace(pathOrPattern) || string.IsNullOrWhiteSpace(actualPath))
            return false;

        if (pathOrPattern.Contains(';') || pathOrPattern.Contains('\n'))
            return pathOrPattern.Split([';', '\n'], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Take(32).Any(p => MatchesPathPattern(p, actualPath));
        if (!pathOrPattern.Contains('*'))
            return string.Equals(pathOrPattern, actualPath, StringComparison.Ordinal);

        var patternSegments = pathOrPattern.Split('/');
        var pathSegments = actualPath.Split('/');
        return GlobMatch(patternSegments, pathSegments);
    }

    private static bool GlobMatch(ReadOnlySpan<string> pattern, ReadOnlySpan<string> path)
    {
        if (pattern.Length > 64 || path.Length > 64) return false;
        var row = new bool[path.Length + 1]; row[0] = true;
        foreach (var segment in pattern)
        {
            var next = new bool[path.Length + 1];
            if (segment == "**") next[0] = row[0];
            for (var j = 1; j <= path.Length; j++)
                next[j] = segment == "**" ? row[j] || next[j - 1] : row[j - 1] && (segment == "*" || segment == path[j - 1]);
            row = next;
        }
        return row[path.Length];
    }

    public SnapshotEntry[] MatchingEntries(string pattern, string? sourceKey = null) => SnapshotEntries()
        .Where(e => (string.IsNullOrWhiteSpace(sourceKey) || e.Entry.Source.Key == sourceKey) && MatchesPathPattern(pattern, e.Path)).ToArray();

    public void ClearSource(string key)
    {
        lock (_capacityGate)
        {
            foreach (var pair in _store)
            {
                pair.Value.TryRemove(key, out _);
                if (pair.Value.IsEmpty) _store.TryRemove(pair.Key, out _);
            }
            _sources.TryRemove(key, out _);
        }
    }

    public IEnumerable<string> AllPaths => _store.Keys;

    public KeyValuePair<string, Entry>[] Snapshot() =>
        SnapshotEntries()
            .Select(entry => new KeyValuePair<string, Entry>(entry.Path, entry.Entry))
            .ToArray();

    public SnapshotEntry[] SnapshotEntries() =>
        _store
            .SelectMany(static pathEntry => pathEntry.Value.Values.Select(entry => new SnapshotEntry(pathEntry.Key, entry)))
            .ToArray();

    public SourceSnapshot[] SnapshotSources()
    {
        var snapshots = SnapshotEntries();
        var grouped = snapshots
            .GroupBy(snapshot => snapshot.Entry.Source.Key, StringComparer.Ordinal)
            .Select(group =>
            {
                var first = group.First().Entry.Source;
                return new SourceSnapshot(
                    first.Key,
                    first.Label,
                    first.PersistentId,
                    first.Address,
                    first.Port,
                    group.Select(item => item.Path).Distinct(StringComparer.Ordinal).Count(),
                    group.Max(item => item.Entry.TimestampMs));
            })
            .OrderByDescending(source => source.LastSeenTimestampMs)
            .ToArray();

        return grouped;
    }

    public int SourceCount => _sources.Count;

    public void Clear()
    {
        _store.Clear();
        _sources.Clear();
    }

    private string? ResolvePreferredSourceKey(string? preferredSourceKey)
    {
        var normalized = string.IsNullOrWhiteSpace(preferredSourceKey) ? null : preferredSourceKey.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        return normalized;
    }

    private static bool TryGetLatestFromBucket(ConcurrentDictionary<string, Entry> bucket, string? preferredSourceKey, out Entry entry)
    {
        entry = default;

        if (!string.IsNullOrWhiteSpace(preferredSourceKey))
            return bucket.TryGetValue(preferredSourceKey, out entry);

        var found = false;
        var latestTimestampMs = long.MinValue;

        foreach (var current in bucket.Values)
        {
            if (found && current.TimestampMs <= latestTimestampMs)
                continue;

            entry = current;
            latestTimestampMs = current.TimestampMs;
            found = true;
        }

        return found;
    }

    private static OscSource NormalizeSource(OscSource source)
    {
        var key = string.IsNullOrWhiteSpace(source.Key) ? OscSource.Unknown.Key : source.Key.Trim();
        var label = string.IsNullOrWhiteSpace(source.Label) ? key : source.Label.Trim();
        var address = string.IsNullOrWhiteSpace(source.Address) ? string.Empty : source.Address.Trim();
        var port = source.Port is > 0 and <= 65535 ? source.Port : 0;
        var persistentId = string.IsNullOrWhiteSpace(source.PersistentId) ? null : source.PersistentId.Trim();

        return new OscSource(key, label, persistentId, address, port);
    }
}
