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
    internal TimeProvider Clock { get; }

    public OscParameterStore(TimeProvider? timeProvider = null) => Clock = timeProvider ?? TimeProvider.System;

    public event Action? AvatarChanged;

    public void ChangeAvatar(string? sourceKey = null)
    {
        if (string.IsNullOrWhiteSpace(sourceKey)) Clear();
        else ClearSource(sourceKey);
        AvatarChanged?.Invoke();
    }

    public readonly record struct Entry(OscValue Value, long TimestampMs, OscSource Source, long Sequence = 0, long ChangedAtMs = 0, long SourceSequence = 0);

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
    private int _entryCount;
    private readonly Dictionary<string, int> _sourceEntryCounts = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _sourceLastSeen = new(StringComparer.Ordinal);
    private long _lastPrune;
    private long _revision;
    private long _sequence;
    private readonly Dictionary<string, long> _sourceSequences = new(StringComparer.Ordinal);
    public long Revision => Interlocked.Read(ref _revision);
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
        var timestampMs = Clock.GetUtcNow().ToUnixTimeMilliseconds();
        var entry = new Entry(value, timestampMs, normalizedSource);
        lock (_capacityGate)
        {
            if (timestampMs - _lastPrune > 10000)
            {
                _lastPrune = timestampMs;
                // At most 32 source clocks need checking. Do not rebuild the entire
                // parameter catalog on the OSC receive path merely to find idle sources.
                var expired = _sourceLastSeen.Where(pair => timestampMs - pair.Value > 300000)
                    .Select(pair => pair.Key).ToArray();
                foreach (var key in expired) RemoveSource(key);
            }
            var existed = _store.TryGetValue(normalizedPath, out var existing)
                && existing.ContainsKey(normalizedSource.Key);
            if ((!existed && _entryCount >= MaxPaths)
                || (!_sources.ContainsKey(normalizedSource.Key) && _sources.Count >= MaxSources)) return;
            var bucket = _store.GetOrAdd(normalizedPath, static _ => new ConcurrentDictionary<string, Entry>(1, 1, StringComparer.Ordinal));
            // Reception activity is independent from new content. Replayed
            // frames must not renew their content age. / 重发不续期内容变化时间。
            var changedAtMs = bucket.TryGetValue(normalizedSource.Key, out var previous) && previous.Value.Equals(value)
                ? previous.ChangedAtMs : timestampMs;
            var sourceSequence = _sourceSequences.GetValueOrDefault(normalizedSource.Key) + 1;
            _sourceSequences[normalizedSource.Key] = sourceSequence;
            entry = entry with { Sequence = ++_sequence, ChangedAtMs = changedAtMs, SourceSequence = sourceSequence };
            bucket[normalizedSource.Key] = entry;
            if (!existed)
            {
                _entryCount++;
                _sourceEntryCounts[normalizedSource.Key] = _sourceEntryCounts.GetValueOrDefault(normalizedSource.Key) + 1;
            }
            _sourceLastSeen[normalizedSource.Key] = timestampMs;
            _sources[normalizedSource.Key] = normalizedSource;
        }
        OnSet?.Invoke(normalizedPath, value);
        Interlocked.Increment(ref _revision);
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

    public SnapshotEntry[] MatchingEntries(string pattern, string? sourceKey = null)
    {
        if (string.IsNullOrWhiteSpace(pattern)) return [];
        var entries = new List<SnapshotEntry>();
        void AddBucket(string path, ConcurrentDictionary<string, Entry> bucket)
        {
            if (!string.IsNullOrWhiteSpace(sourceKey))
            {
                if (bucket.TryGetValue(sourceKey, out var entry)) entries.Add(new SnapshotEntry(path, entry));
            }
            else foreach (var entry in bucket) entries.Add(new SnapshotEntry(path, entry.Value));
        }
        // Most mappings name one exact parameter. Copying all face/expression
        // parameters for each mapping made receive processing scale with the catalog.
        if (!pattern.Contains('*') && !pattern.Contains(';') && !pattern.Contains('\n'))
        {
            if (_store.TryGetValue(pattern, out var bucket)) AddBucket(pattern, bucket);
        }
        else foreach (var path in _store)
            if (MatchesPathPattern(pattern, path.Key)) AddBucket(path.Key, path.Value);
        return entries.ToArray();
    }

    public void ClearSource(string key)
    {
        lock (_capacityGate)
        {
            RemoveSource(key);
            Interlocked.Increment(ref _revision);
        }
    }

    // The caller owns _capacityGate, including when removing expired sources during Set.
    private void RemoveSource(string key)
    {
        foreach (var pair in _store)
        {
            if (pair.Value.TryRemove(key, out _)) _entryCount--;
            if (pair.Value.IsEmpty) _store.TryRemove(pair.Key, out _);
        }
        _sources.TryRemove(key, out _);
        _sourceSequences.Remove(key);
        _sourceEntryCounts.Remove(key);
        _sourceLastSeen.Remove(key);
    }

    public IEnumerable<string> AllPaths => _store.Keys;

    public KeyValuePair<string, Entry>[] Snapshot() =>
        SnapshotEntries()
            .Select(entry => new KeyValuePair<string, Entry>(entry.Path, entry.Entry))
            .ToArray();

    public SnapshotEntry[] SnapshotEntries() => SnapshotEntriesCore(null, null);

    /// <summary>Copy only entries in an ordinal path prefix and optional exact source.</summary>
    public SnapshotEntry[] SnapshotEntries(string pathPrefix, string? sourceKey = null)
    {
        ArgumentNullException.ThrowIfNull(pathPrefix);
        return SnapshotEntriesCore(pathPrefix, sourceKey);
    }

    private SnapshotEntry[] SnapshotEntriesCore(string? pathPrefix, string? sourceKey)
    {
        var entries = pathPrefix is null ? new SnapshotEntry[Math.Clamp(Volatile.Read(ref _entryCount), 0, MaxPaths)] : [];
        var count = 0;
        // ConcurrentDictionary.Values materializes an array and takes all bucket locks.
        // Enumerating pairs directly avoids one array and LINQ iterator per parameter.
        foreach (var path in _store)
        {
            if (pathPrefix is not null && !path.Key.StartsWith(pathPrefix, StringComparison.Ordinal)) continue;
            foreach (var entry in path.Value)
            {
                if (!string.IsNullOrEmpty(sourceKey) && entry.Key != sourceKey) continue;
                if (count == entries.Length) Array.Resize(ref entries, Math.Max(4, count * 2));
                entries[count++] = new SnapshotEntry(path.Key, entry.Value);
            }
        }
        // Receivers may add/remove entries during this non-blocking snapshot.
        if (count != entries.Length) Array.Resize(ref entries, count);
        return entries;
    }

    public SourceSnapshot[] SnapshotSources()
    {
        lock (_capacityGate)
        {
            return _sources.Values.Select(source => new SourceSnapshot(source.Key, source.Label,
                    source.PersistentId, source.Address, source.Port, _sourceEntryCounts[source.Key],
                    _sourceLastSeen[source.Key]))
                .OrderByDescending(source => source.LastSeenTimestampMs).ToArray();
        }
    }

    internal static SourceSnapshot[] SourcesFromSnapshot(IReadOnlyList<SnapshotEntry> entries)
    {
        var sources = new Dictionary<string, (SourceSnapshot Snapshot, long Sequence)>(StringComparer.Ordinal);
        foreach (var snapshot in entries)
        {
            var source = snapshot.Entry.Source;
            if (sources.TryGetValue(source.Key, out var previous))
            {
                // Several packets can arrive in the same millisecond. Sequence, not
                // enumeration order or timestamp ties, identifies the newest metadata.
                var newest = snapshot.Entry.Sequence >= previous.Sequence ? source
                    : new OscSource(previous.Snapshot.Key, previous.Snapshot.Label, previous.Snapshot.PersistentId,
                        previous.Snapshot.Address, previous.Snapshot.Port);
                sources[source.Key] = (new SourceSnapshot(newest.Key, newest.Label, newest.PersistentId,
                    newest.Address, newest.Port, previous.Snapshot.ParameterCount + 1,
                    Math.Max(previous.Snapshot.LastSeenTimestampMs, snapshot.Entry.TimestampMs)),
                    Math.Max(previous.Sequence, snapshot.Entry.Sequence));
            }
            else sources[source.Key] = (new SourceSnapshot(source.Key, source.Label, source.PersistentId,
                source.Address, source.Port, 1, snapshot.Entry.TimestampMs), snapshot.Entry.Sequence);
        }
        return sources.Values.Select(source => source.Snapshot)
            .OrderByDescending(source => source.LastSeenTimestampMs).ToArray();
    }

    public int SourceCount => _sources.Count;

    public void Clear()
    {
        lock (_capacityGate)
        {
            _store.Clear();
            _entryCount = 0;
            _sourceEntryCounts.Clear();
            _sourceLastSeen.Clear();
            _sources.Clear();
            _sourceSequences.Clear();
            Interlocked.Increment(ref _revision);
        }
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
