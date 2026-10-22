using Sensa.Input.Osc;
using UnityBox.Sensa;

namespace Sensa.Signals;

/// <summary>Native SDK sender midpoint and relative velocity, in receiver axes and metres.
/// The dedicated receiver follows the avatar root with zero position/rotation offsets.
/// 原生 SDK 发送器中点及相对速度；专用接收器在 Avatar 根点且无位置／旋转偏移。</summary>
public static class ContactRootTracking
{
    private const double BoundaryTolerance = .003;

    public static IEnumerable<SpsPositionTracking.Observation> Observe(
        IEnumerable<OscParameterStore.SnapshotEntry> snapshot, string? sourceKey,
        int maxAgeMs, TimeProvider? timeProvider)
    {
        var now = (timeProvider ?? TimeProvider.System).GetUtcNow().ToUnixTimeMilliseconds();
        return snapshot.Where(entry => entry.Path.StartsWith(SensaContactProtocol.Prefix + "/", StringComparison.Ordinal)
                && (string.IsNullOrEmpty(sourceKey) || sourceKey == entry.Entry.Source.Key))
            .Select(entry => (Sample: entry, Parts: entry.Path.Split('/')))
            .Where(entry => entry.Parts.Length == 4 && !string.IsNullOrWhiteSpace(entry.Parts[2])
                && SensaContactProtocol.PublicLeaves.Contains(entry.Parts[3]))
            .GroupBy(entry => (Source: entry.Sample.Entry.Source.Key, Instance: entry.Parts[2]))
            .OrderBy(group => group.Key.Source, StringComparer.Ordinal)
            .ThenBy(group => group.Key.Instance, StringComparer.Ordinal).Take(64)
            .Select(group =>
            {
                var fields = group.ToDictionary(entry => entry.Parts[3], entry => entry.Sample.Entry);
                var complete = SensaContactProtocol.PublicLeaves.All(fields.ContainsKey);
                double Value(string leaf) => fields.TryGetValue(leaf, out var entry) ? entry.Value.AsFloat() : double.NaN;
                PosePoint Vector(string[] leaves) => new(Value(leaves[0]), Value(leaves[1]), Value(leaves[2]));
                var finite = complete && fields.Values.All(entry => float.IsFinite(entry.Value.AsFloat()));
                var position = Vector(SensaContactProtocol.PositionLeaves);
                var velocity = Vector(SensaContactProtocol.VelocityLeaves);
                var radius = Value(SensaContactProtocol.RadiusLeaf);
                var speed = Value(SensaContactProtocol.SpeedLeaf);
                var proximity = Value(SensaContactProtocol.ProximityLeaf);
                var senderIsSelf = Value(SensaContactProtocol.SenderTypeLeaf) == SensaContactProtocol.SelfSenderType;
                var timestamp = fields.TryGetValue(SensaContactProtocol.SampleLeaf, out var sample) ? sample.ChangedAtMs : 0;
                var ageLimit = maxAgeMs > 0 ? Math.Min(maxAgeMs, SensaContactProtocol.MaximumSampleAgeMs)
                    : SensaContactProtocol.MaximumSampleAgeMs;
                // Native values may stay unchanged. Sample establishes producer activity, not atomic sampling or sender identity.
                var active = fields.ContainsKey(SensaContactProtocol.SampleLeaf)
                    && SensaContactProtocol.IsSampleActive((float)Value(SensaContactProtocol.SampleLeaf))
                    && timestamp <= now && now - timestamp <= ageLimit;
                var inBounds = radius > 0 && radius <= SensaContactProtocol.MaximumWorldContactRadius
                    && position.Length <= radius + BoundaryTolerance && speed >= 0;
                var valid = finite && senderIsSelf && proximity > 0 && proximity <= 1 && inBounds && active;
                var reason = !complete ? "等待完整 Contact 参数 / Waiting for complete Contact parameters"
                    : !senderIsSelf || !(proximity > 0 && proximity <= 1) ? "等待专用 Self Contact 发送器 / Waiting for the dedicated Self Contact sender"
                    : !active ? "Contact 采样停用或活动计数无效／冻结 / Contact sampling is inactive or its counter is invalid/frozen"
                    : !finite || !inBounds ? "Contact 坐标、速度或接收半径无效 / Contact coordinates, velocity or receiver radius are invalid"
                    : "Contact 直接定位；位置以米、速度以米每秒表示 / Direct Contact tracking; position in metres and velocity in metres per second";
                var prefix = SensaContactProtocol.Prefix + "/" + group.Key.Instance;
                return new SpsPositionTracking.Observation(group.Key.Source + "|" + prefix, group.Key.Instance, "Self",
                    group.First().Sample.Entry.Source.Label, SensaContactProtocol.PositionLeaves.Count(fields.ContainsKey),
                    valid, valid ? position : default, double.IsFinite(radius) ? radius : 0, 0, reason,
                    prefix, group.Key.Source, "ContactRoot", timestamp)
                {
                    Velocity = valid ? velocity : null,
                    Speed = valid ? speed : null,
                    ProximitySpeed = valid ? Value(SensaContactProtocol.ProximitySpeedLeaf) : null,
                };
            });
    }
}
