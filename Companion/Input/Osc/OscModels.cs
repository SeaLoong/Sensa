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

public sealed class OscParameterStore
{
    public readonly record struct Entry(OscValue Value, long TimestampMs);

    private readonly ConcurrentDictionary<string, Entry> _store = new();

    public event Action<string, OscValue>? OnSet;

    public void Set(string path, OscValue value)
    {
        var timestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _store[path] = new Entry(value, timestampMs);
        OnSet?.Invoke(path, value);
    }

    public bool TryGetLatest(string pathOrPattern, out Entry entry) =>
        TryGetLatest(pathOrPattern, out _, out entry);

    public bool TryGetLatest(string pathOrPattern, out string matchedPath, out Entry entry)
    {
        matchedPath = string.Empty;
        entry = default;

        if (string.IsNullOrWhiteSpace(pathOrPattern))
            return false;

        if (_store.TryGetValue(pathOrPattern, out entry))
        {
            matchedPath = pathOrPattern;
            return true;
        }

        if (!pathOrPattern.Contains('*'))
            return false;

        var found = false;
        var latestTimestampMs = long.MinValue;

        foreach (var (path, current) in _store)
        {
            if (!MatchesPathPattern(pathOrPattern, path))
                continue;

            if (found && current.TimestampMs <= latestTimestampMs)
                continue;

            matchedPath = path;
            entry = current;
            latestTimestampMs = current.TimestampMs;
            found = true;
        }

        return found;
    }

    public static bool MatchesPathPattern(string pathOrPattern, string actualPath)
    {
        if (string.IsNullOrWhiteSpace(pathOrPattern) || string.IsNullOrWhiteSpace(actualPath))
            return false;

        if (!pathOrPattern.Contains('*'))
            return string.Equals(pathOrPattern, actualPath, StringComparison.Ordinal);

        var patternSegments = pathOrPattern.Split('/');
        var pathSegments = actualPath.Split('/');
        return GlobMatch(patternSegments, pathSegments);
    }

    private static bool GlobMatch(ReadOnlySpan<string> pattern, ReadOnlySpan<string> path)
    {
        var patternIndex = 0;
        var pathIndex = 0;

        while (patternIndex < pattern.Length && pathIndex < path.Length)
        {
            if (pattern[patternIndex] == "**")
            {
                for (var end = pathIndex; end <= path.Length; end++)
                {
                    if (GlobMatch(pattern[(patternIndex + 1)..], path[end..]))
                        return true;
                }

                return false;
            }

            if (pattern[patternIndex] == "*" || pattern[patternIndex] == path[pathIndex])
            {
                patternIndex++;
                pathIndex++;
                continue;
            }

            return false;
        }

        if (patternIndex < pattern.Length && pattern[patternIndex] == "**" && patternIndex + 1 == pattern.Length)
            return true;

        return patternIndex == pattern.Length && pathIndex == path.Length;
    }

    public IEnumerable<string> AllPaths => _store.Keys;

    public KeyValuePair<string, Entry>[] Snapshot() => _store.ToArray();

    public void Clear() => _store.Clear();
}
