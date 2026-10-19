using System.Globalization;
using Sensa.Input.Osc;
using UnityBox.Sensa;

namespace Sensa.Signals;

/// <summary>Complete native coordinate packets; diagnostic traffic has its own non-mappable namespace.
/// 完整原生坐标包；诊断数据使用不参与运动的独立命名空间。</summary>
public static class ShaderRootTracking
{
    public const string Prefix = "Sensa/Shader";
    public const int MaximumFrameAgeMs = 500;
    private static readonly string[] PacketFields = ["Frame", "X", "Y", "Z", "Valid"];

    public static IEnumerable<SpsPositionTracking.Observation> Observe(
        IEnumerable<OscParameterStore.SnapshotEntry> snapshot, string? sourceKey,
        int maxAgeMs, TimeProvider? timeProvider)
    {
        var now = (timeProvider ?? TimeProvider.System).GetUtcNow().ToUnixTimeMilliseconds();
        return snapshot.Where(entry => entry.Path.StartsWith(Prefix + "/", StringComparison.Ordinal)
                && (string.IsNullOrEmpty(sourceKey) || sourceKey == entry.Entry.Source.Key))
            .Select(entry => (Sample: entry, Parts: entry.Path.Split('/')))
            .Where(entry => entry.Parts.Length == 4 && PacketFields.Contains(entry.Parts[3]))
            .GroupBy(entry => (Source: entry.Sample.Entry.Source.Key, Producer: entry.Parts[2]))
            .OrderBy(group => group.Key.Source, StringComparer.Ordinal)
            .ThenBy(group => group.Key.Producer, StringComparer.Ordinal).Take(64)
            .Select(group =>
            {
                var fields = group.ToDictionary(entry => entry.Parts[3], entry => entry.Sample.Entry);
                var complete = PacketFields.All(fields.ContainsKey);
                var prefix = Prefix + "/" + group.Key.Producer;
                var idValid = ushort.TryParse(group.Key.Producer, NumberStyles.None, CultureInfo.InvariantCulture, out var id)
                    && id > 0 && id.ToString(CultureInfo.InvariantCulture) == group.Key.Producer;
                var position = complete ? new PosePoint(fields["X"].Value.AsFloat(),
                    fields["Y"].Value.AsFloat(), fields["Z"].Value.AsFloat()) : default;
                var timestamp = fields.TryGetValue("Frame", out var frameEntry) ? frameEntry.ChangedAtMs : 0;
                var frame = complete ? fields["Frame"].Value.AsFloat() : float.NaN;
                var ordered = complete && Enumerable.Range(1, PacketFields.Length - 1)
                    .All(index => fields[PacketFields[index]].SourceSequence == fields["Frame"].SourceSequence + index);
                var inBounds = double.IsFinite(position.X) && double.IsFinite(position.Y) && double.IsFinite(position.Z)
                    && Math.Abs(position.X - SensaFixedAnchorProtocol.CenterX) <= SensaFixedAnchorProtocol.PositionHalfRange
                    && Math.Abs(position.Y - SensaFixedAnchorProtocol.CenterY) <= SensaFixedAnchorProtocol.PositionHalfRange
                    && Math.Abs(position.Z - SensaFixedAnchorProtocol.CenterZ) <= SensaFixedAnchorProtocol.PositionHalfRange;
                var ageLimit = maxAgeMs > 0 ? Math.Min(maxAgeMs, MaximumFrameAgeMs) : MaximumFrameAgeMs;
                var valid = complete && idValid && ordered && inBounds && fields["Valid"].Value.AsFloat() == 1f
                    && float.IsFinite(frame) && frame == MathF.Truncate(frame) && frame is >= 0 and <= ushort.MaxValue
                    && timestamp <= now && now - timestamp <= ageLimit;
                var reason = valid ? "已接收原生根点编码；坐标非设备回读 / Native root frame received; coordinates are not device feedback"
                    : "等待完整、新鲜且身份匹配的原生根点包 / Waiting for a complete fresh native-root packet with matching identity";
                return new SpsPositionTracking.Observation(group.Key.Source + "|" + prefix, group.Key.Producer,
                    "Self", group.First().Sample.Entry.Source.Label, new[] { "X", "Y", "Z" }.Count(fields.ContainsKey),
                    valid, valid ? position : default, 0, 0, reason, prefix, group.Key.Source, "ShaderRoot", timestamp);
            });
    }
}
