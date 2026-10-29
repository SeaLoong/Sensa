namespace Sensa.Hosting;

/// <summary>Tracks actual page heartbeats rather than persistent shared-worker connections.</summary>
internal sealed class BrowserPagePresence
{
    private readonly object _sync = new();
    private readonly Dictionary<string, (DateTimeOffset SeenAt, long Revision, bool Open)> _pages = new(StringComparer.Ordinal);
    private readonly Func<DateTimeOffset> _now;
    private DateTimeOffset? _lastLaunch;
    internal static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(20);

    internal BrowserPagePresence(Func<DateTimeOffset>? now = null) => _now = now ?? (() => DateTimeOffset.UtcNow);

    internal int Count
    {
        get { lock (_sync) { RemoveExpired(); return _pages.Values.Count(page => page.Open); } }
    }

    internal bool Update(string? id, bool open, long revision = 0)
    {
        if (revision < 0 || id is null || id.Length is < 1 or > 64 || id.Any(value => !char.IsAsciiLetterOrDigit(value) && value is not '-' and not '_'))
            return false;
        lock (_sync)
        {
            RemoveExpired();
            if (_pages.TryGetValue(id, out var current) && revision < current.Revision) return true;
            if (_pages.Count >= 128 && !_pages.ContainsKey(id)) return false;
            // Retain a closed page's revision for one lease: a delayed heartbeat
            // must not arrive after its close beacon and resurrect that page.
            _pages[id] = (_now(), revision, open);
            return true;
        }
    }

    internal bool TryBeginLaunch()
    {
        lock (_sync)
        {
            RemoveExpired();
            var now = _now();
            if (_pages.Values.Any(page => page.Open) || _lastLaunch is { } last && now - last < TimeSpan.FromSeconds(3)) return false;
            _lastLaunch = now;
            return true;
        }
    }

    private void RemoveExpired()
    {
        var oldest = _now() - Lifetime;
        foreach (var key in _pages.Where(pair => pair.Value.SeenAt <= oldest).Select(pair => pair.Key).ToArray()) _pages.Remove(key);
    }
}

internal sealed record BrowserPresenceUpdate(string Id, bool Open, long Revision = 0);
