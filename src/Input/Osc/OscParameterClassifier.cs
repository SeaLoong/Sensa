namespace Sensa.Input.Osc;

public sealed record OscParameterHint(bool IsFaceTracking, int Relevance, string Hint);

/// <summary>Display hints only: heuristic matches never create device mappings.</summary>
public static class OscParameterClassifier
{
    private static readonly string[] KnownNames = ["PenOthers", "PenSelf", "PenOthersNewRoot", "PenOthersNewTip", "PenSelfNewRoot", "PenSelfNewTip", "TouchOthers", "TouchSelf", "FrotOthers", "AngleRight_Raw", "AngleLeft_Raw", "AngleUp_Raw", "AngleDown_Raw"];

    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, OscParameterHint> Cache = new(StringComparer.Ordinal);
    public static OscParameterHint Classify(string path) => Cache.TryGetValue(path, out var cached) ? cached
        : Cache.Count < 4096 ? Cache.GetOrAdd(path, ClassifyCore) : ClassifyCore(path);

    private static OscParameterHint ClassifyCore(string path)
    {
        var normalized = path.Trim('/');
        if (normalized.StartsWith("avatar/parameters/", StringComparison.Ordinal))
            normalized = normalized["avatar/parameters/".Length..];
        var leaf = normalized.Split('/')[^1];
        // Classify explicit namespaces; similar expression names remain visible.
        // 只识别明确命名空间；名称相似的自定义参数保持可见。
        // https://docs.vrcft.io/docs/tutorial-avatars/tutorial-avatars-extras/parameters
        if (normalized.StartsWith("FT/", StringComparison.OrdinalIgnoreCase)
            || normalized.StartsWith("v2/", StringComparison.OrdinalIgnoreCase))
            return new(true, 0, "面部追踪参数");
        var segments = normalized.Split('/');
        if (segments.Any(s => s.Equals("OGB", StringComparison.OrdinalIgnoreCase) || s.Equals("Sensa", StringComparison.OrdinalIgnoreCase)))
            return new(false, 100, "已知触觉参数路径");
        if (KnownNames.Contains(leaf, StringComparer.OrdinalIgnoreCase))
            return new(false, 90, "名称匹配已知触觉参数，请确认来源与含义");
        if (segments.Any(s => s.Equals("SPS", StringComparison.OrdinalIgnoreCase) || s.Equals("TPS", StringComparison.OrdinalIgnoreCase))
            || new[] { "penetr", "depth", "frot", "socket", "touchzone" }.Any(k => normalized.Contains(k, StringComparison.OrdinalIgnoreCase)))
            return new(false, 60, "可能是目标参数（关键词匹配），请确认后再映射");
        if (leaf.Length >= 7 && KnownNames.Any(name => EditDistance(leaf.ToLowerInvariant(), name.ToLowerInvariant()) <= 2))
            return new(false, 40, "可能是目标参数（名称相近），请确认后再映射");
        return new(false, 10, "");
    }

    private static int EditDistance(string a, string b)
    {
        if (Math.Abs(a.Length - b.Length) > 2) return 3;
        var row = Enumerable.Range(0, b.Length + 1).ToArray();
        for (var i = 1; i <= a.Length; i++)
        {
            var previous = row[0]; row[0] = i;
            for (var j = 1; j <= b.Length; j++)
            {
                var old = row[j];
                row[j] = Math.Min(Math.Min(row[j] + 1, row[j - 1] + 1), previous + (a[i - 1] == b[j - 1] ? 0 : 1));
                previous = old;
            }
        }
        return row[^1];
    }
}
