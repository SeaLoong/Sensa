using System.Text.Json;
using System.Text.Json.Nodes;

namespace Sensa.Outputs.Dglab;

/// <summary>
/// Official protocol reference: dungeonlab-open/dglab-kit, src/socket/v4/types.ts.
/// Channel intensity units belong to the APP/device; they are not percentages.
/// </summary>
public static class DglabV4Protocol
{
    public const int MaximumTaskDurationMs = 10000;
    public const int MaximumPulseFrames = 256;

    public static Uri ValidateServerUrl(string value)
    {
        if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var uri)
            || uri.Scheme is not ("ws" or "wss") || string.IsNullOrEmpty(uri.Host)
            || !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Fragment))
            throw new ArgumentException("请选择有效的 DG-LAB WebSocket V4 地址 / Choose a valid DG-LAB WebSocket V4 URL.");
        return uri;
    }

    public static string BuildPairingUrl(string serverUrl, string targetId)
    {
        var uri = ValidateServerUrl(serverUrl);
        ValidateIdentifier(targetId, nameof(targetId));
        var builder = new UriBuilder(uri);
        var existing = builder.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Where(item => !string.Equals(Uri.UnescapeDataString(item.Split('=')[0]), "tid", StringComparison.Ordinal));
        builder.Query = string.Join('&', existing.Append("tid=" + Uri.EscapeDataString(targetId)));
        return builder.Uri.AbsoluteUri;
    }

    public static string BuildAppPairingUrl(string serverUrl, string targetId) =>
        "https://dungeon-lab.cn/s/?v=1&action=socket&url=" + Uri.EscapeDataString(BuildPairingUrl(serverUrl, targetId));

    public static string Request(string clientId, string requestId, string method, JsonNode? data = null)
    {
        ValidateIdentifier(clientId, nameof(clientId));
        ValidateIdentifier(requestId, nameof(requestId));
        return new JsonObject
        {
            ["type"] = "message", ["clientId"] = clientId,
            ["data"] = new JsonObject { ["t"] = "req", ["reqId"] = requestId, ["m"] = method, ["data"] = data },
        }.ToJsonString();
    }

    public static JsonObject TemporaryIntensity(DglabTarget target, double value, int durationMs)
    {
        ValidateTarget(target); ValidateDuration(durationMs);
        if (!double.IsFinite(value) || value < 0) throw new ArgumentOutOfRangeException(nameof(value));
        return new JsonObject
        {
            ["s"] = target.SlotId, ["c"] = (int)target.Channel, ["t"] = 4,
            ["v"] = value, ["d"] = durationMs, ["im"] = true, ["p"] = 1,
        };
    }

    public static JsonObject Reset(DglabTarget target)
    {
        ValidateTarget(target);
        return new JsonObject
        {
            ["s"] = target.SlotId, ["c"] = (int)target.Channel, ["t"] = 7,
            ["v"] = 0, ["im"] = true, ["p"] = 2,
        };
    }

    public static JsonObject Clear(DglabTarget target)
    {
        ValidateTarget(target);
        return new JsonObject { ["s"] = target.SlotId, ["c"] = (int)target.Channel };
    }

    public static JsonObject Pulse(DglabTarget target, IReadOnlyList<string> frames, int durationMs, int version = 3)
    {
        ValidateTarget(target); ValidateDuration(durationMs);
        if (version is not (2 or 3)) throw new ArgumentOutOfRangeException(nameof(version));
        if (frames.Count is < 1 or > MaximumPulseFrames) throw new ArgumentOutOfRangeException(nameof(frames));
        var data = new JsonArray();
        foreach (var frame in frames)
        {
            // Official V2 frames contain three bytes; V3 frames contain eight bytes.
            if (string.IsNullOrWhiteSpace(frame) || frame.Length != (version == 2 ? 6 : 16)
                || frame.Any(character => !Uri.IsHexDigit(character)))
                throw new ArgumentException("波形帧使用有界的十六进制字节 / Pulse frames must contain bounded hexadecimal bytes.", nameof(frames));
            data.Add(frame.ToUpperInvariant());
        }
        return new JsonObject
        {
            ["s"] = target.SlotId, ["c"] = (int)target.Channel, ["t"] = 0,
            ["v"] = data, ["d"] = durationMs, ["im"] = true, ["p"] = 1, ["ver"] = version,
        };
    }

    public static void ValidateTarget(DglabTarget target)
    {
        ArgumentNullException.ThrowIfNull(target);
        ValidateIdentifier(target.ClientId, nameof(target.ClientId));
        ValidateIdentifier(target.SlotId, nameof(target.SlotId));
        if (!Enum.IsDefined(target.Channel)) throw new ArgumentOutOfRangeException(nameof(target.Channel));
    }

    internal static void ValidateIdentifier(string value, string name)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 256 || value.Any(char.IsControl))
            throw new ArgumentException("DG-LAB identifiers require 1–256 visible characters.", name);
    }
    private static void ValidateDuration(int durationMs)
    {
        if (durationMs is < 1 or > MaximumTaskDurationMs) throw new ArgumentOutOfRangeException(nameof(durationMs));
    }
}
