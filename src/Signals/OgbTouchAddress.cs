namespace Sensa.Signals;

/// <summary>OGB touch paths with exact Close pairing / 精确配对 Close 的 OGB 触摸路径。</summary>
public readonly record struct OgbTouchAddress(string Parent, string Leaf, bool IsSocket)
{
    public string ValuePath => $"{Parent}/{Leaf}";
    public string ClosePath => $"{ValuePath}Close";
    public bool NeedsClose => !IsSocket || Leaf != "FrotOthers";

    public static bool TryParse(string path, out OgbTouchAddress address)
    {
        address = default;
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
