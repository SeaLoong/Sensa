namespace Sensa.Signals;

/// <summary>
/// Exact OGB instance/party identity, without guessing leaf aliases.
/// 精确的 OGB 实例与 Self/Others 身份；不猜测叶子别名。
/// </summary>
public readonly record struct OgbDepthAddress(string Parent, string Party, bool IsSocket)
{
    public string LegacyPath => $"{Parent}/Pen{Party}";
    public string RootPath => $"{LegacyPath}NewRoot";
    public string TipPath => $"{LegacyPath}NewTip";
    public string ClosePath => $"{LegacyPath}Close";

    public static bool TryParse(string path, out OgbDepthAddress address)
    {
        address = default;
        if (!TrySplitParent(path, out var parent, out var leaf, out var socket)) return false;
        foreach (var party in new[] { "Self", "Others" })
        {
            var stem = "Pen" + party;
            if (leaf == stem || socket && (leaf == stem + "NewRoot"
                || leaf == stem + "NewTip" || party == "Others" && leaf == stem + "Close"))
            {
                address = new(parent, party, socket);
                return true;
            }
        }
        return false;
    }

    internal static bool TrySplitParent(string path, out string parent, out string leaf, out bool socket)
    {
        parent = leaf = "";
        socket = path.StartsWith("OGB/Orf/", StringComparison.Ordinal);
        if (!socket && !path.StartsWith("OGB/Pen/", StringComparison.Ordinal)) return false;
        var slash = path.LastIndexOf('/');
        if (slash <= 8) return false;
        parent = path[..slash];
        // Preserve the complete parent, including nested instance IDs.
        // 保留完整父路径，避免嵌套实例的末段同名导致串线。
        if (parent[8..].Split('/').Any(string.IsNullOrWhiteSpace)) return false;
        leaf = path[(slash + 1)..];
        return true;
    }
}
