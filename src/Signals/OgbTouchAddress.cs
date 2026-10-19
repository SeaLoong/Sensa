namespace Sensa.Signals;

/// <summary>OGB touch paths with exact Close pairing / 精确配对 Close 的 OGB 触摸路径。</summary>
public readonly record struct OgbTouchAddress(string Parent, string Leaf, bool IsSocket)
{
    public string ValuePath => $"{Parent}/{Leaf}";
    public string ClosePath => $"{ValuePath}Close";
    private const string ZonePrefix = "VFH/Zone/Touch/";
    public bool IsZone => Parent?.StartsWith(ZonePrefix, StringComparison.Ordinal) == true;
    public bool NeedsClose => !IsZone && (!IsSocket || Leaf != "FrotOthers");

    public static bool TryParse(string path, out OgbTouchAddress address)
    {
        address = default;
        if (path.StartsWith(ZonePrefix, StringComparison.Ordinal))
        {
            var slash = path.LastIndexOf('/');
            if (slash <= ZonePrefix.Length) return false;
            var zoneParent = path[..slash];
            var zoneLeaf = path[(slash + 1)..];
            if (zoneParent[ZonePrefix.Length..].Split('/').Any(string.IsNullOrWhiteSpace)
                || zoneLeaf is not ("Self" or "Others")) return false;
            // Independent touch zones are proximity-only and have no Close parameter.
            // 独立触摸区仅发布近接值，没有 Close 门控参数。
            address = new(zoneParent, zoneLeaf, false);
            return true;
        }
        if (!OgbDepthAddress.TrySplitParent(path, out var parent, out var leaf, out var socket)) return false;
        foreach (var feature in new[] { "TouchSelf", "TouchOthers", "FrotOthers" })
        {
            var candidate = new OgbTouchAddress(parent, feature, socket);
            if (leaf == feature || candidate.NeedsClose && leaf == feature + "Close")
            {
                address = candidate;
                return true;
            }
        }
        return false;
    }
}
