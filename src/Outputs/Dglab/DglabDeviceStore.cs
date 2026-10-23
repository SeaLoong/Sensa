using System.Text.Json;
using System.Text.Json.Nodes;

namespace Sensa.Outputs.Dglab;

/// <summary>Bounded APP discovery state; callers hold the protocol client's state lock.</summary>
internal sealed class DglabDeviceStore
{
    private const int MaximumClients = 32, MaximumDevices = 256;
    private readonly Dictionary<string, Client> _clients = new(StringComparer.Ordinal);
    private IReadOnlyList<DglabClientSnapshot>? _snapshot;
    public int Count => _clients.Count;
    public void Clear() { _clients.Clear(); _snapshot = null; }
    public bool ContainsClient(string id) => _clients.ContainsKey(id);
    public void Remove(string id) { if (_clients.Remove(id)) _snapshot = null; }
    public void Attach(string id, long nowMs)
    {
        DglabV4Protocol.ValidateIdentifier(id, nameof(id));
        if (!_clients.ContainsKey(id))
        {
            if (_clients.Count >= MaximumClients) throw new InvalidDataException("DG-LAB APP limit exceeded.");
            _clients.Add(id, new Client(id) { UpdatedAtMs = nowMs });
            _snapshot = null;
        }
    }

    public bool Apply(string clientId, JsonObject data, long nowMs)
    {
        if (!_clients.TryGetValue(clientId, out var client)) return false;
        var eventName = data["t"]?.GetValue<string>() == "ev" ? data["ev"]?.GetValue<string>() : null;
        if (eventName == "devices.snapshot") Replace(client, data["devices"] as JsonArray, nowMs);
        else if (eventName == "devices.patch")
        {
            if (data["added"] is JsonArray added) foreach (var node in added) Upsert(client, node as JsonObject, nowMs);
            if (data["removed"] is JsonArray removed) foreach (var id in removed)
                if (id is JsonValue value && value.TryGetValue<string>(out var key)) client.Devices.Remove(key);
        }
        else if (eventName == "slots.patch")
        {
            if (data["slots"] is JsonArray slots) foreach (var node in slots)
            {
                if (node is not JsonObject patch || ReadString(patch, "slotId") is not { } slotId
                    || !client.Devices.TryGetValue(slotId, out var device)) continue;
                if (patch["props"] is JsonObject props) Merge(device.Props, props);
                if (patch["slotState"] is JsonObject state) Merge(device.SlotState, state);
                ValidateSize(device);
                device.UpdatedAtMs = nowMs;
            }
        }
        else if (eventName == "custom.action")
        {
            if (data["action"] is not JsonValue action || !action.TryGetValue<int>(out var number) || number is < 0 or > 9)
                return false;
            client.LastAction = number; client.ActionSequence++;
        }
        else if (data["t"]?.GetValue<string>() == "resp" && data["result"] is JsonObject result && result["devices"] is JsonArray devices)
            Replace(client, devices, nowMs);
        else return false;
        client.UpdatedAtMs = nowMs;
        _snapshot = null;
        return true;
    }

    public bool CanOperate(DglabTarget target) => _clients.TryGetValue(target.ClientId, out var client)
        && client.Devices.TryGetValue(target.SlotId, out var device)
        && !IsFalse(device.SlotState["hasDevice"])
        && !(device.Props["connectState"] is JsonValue state && state.TryGetValue<string>(out var text) && text == "disconnected");

    public double LimitIntensity(DglabTarget target, double value)
    {
        if (!_clients.TryGetValue(target.ClientId, out var client)
            || !client.Devices.TryGetValue(target.SlotId, out var device)) return 0;
        var name = target.Channel == DglabChannel.A ? "channelA" : "channelB";
        if (device.SlotState[name] is not JsonObject channel) return value;
        if (IsTrue(channel["isMuted"])) return 0;
        if (TryNumber(channel["intensityMax"], out var maximum) && maximum >= 0) value = Math.Min(value, maximum);
        return value;
    }

    public bool TryRead(DglabTarget target, string path, out double value)
    {
        value = 0;
        if (string.IsNullOrWhiteSpace(path) || path.Length > 256 || !_clients.TryGetValue(target.ClientId, out var client)) return false;
        if (path == "action" && client.LastAction is { } action) { value = action; return true; }
        if (path == "actionSequence") { value = client.ActionSequence; return true; }
        if (path.StartsWith("action.", StringComparison.Ordinal) && int.TryParse(path[7..], out var wanted) && wanted is >= 0 and <= 9)
        { value = client.LastAction == wanted ? 1 : 0; return client.LastAction is not null; }
        if (!_clients[target.ClientId].Devices.TryGetValue(target.SlotId, out var device)) return false;
        if (path == "connected") { value = CanOperate(target) ? 1 : 0; return true; }
        JsonNode? node;
        if (path.StartsWith("props.", StringComparison.Ordinal)) { node = device.Props; path = path[6..]; }
        else if (path.StartsWith("slotState.", StringComparison.Ordinal)) { node = device.SlotState; path = path[10..]; }
        else return false;
        var segments = path.Split('.');
        if (segments.Length > 16) return false;
        foreach (var segment in segments)
        {
            if (node is not JsonObject item || !item.TryGetPropertyValue(segment, out node)) return false;
        }
        return TryNumber(node, out value);
    }

    public IReadOnlyList<DglabClientSnapshot> Snapshot() => _snapshot ??= Array.AsReadOnly(_clients.Values.Select(client =>
        new DglabClientSnapshot(client.Id, Array.AsReadOnly(client.Devices.Values.Select(device =>
            new DglabDeviceSnapshot(device.Id, device.Name, device.Type,
                JsonSerializer.SerializeToElement(device.Props), JsonSerializer.SerializeToElement(device.SlotState),
                device.UpdatedAtMs)).ToArray()), client.LastAction, client.ActionSequence, client.UpdatedAtMs)).ToArray());

    private void Replace(Client client, JsonArray? devices, long nowMs)
    {
        if (devices is null) return;
        if (devices.Count > MaximumDevices) throw new InvalidDataException("DG-LAB device limit exceeded.");
        var wanted = devices.OfType<JsonObject>().Select(node => ReadString(node, "slotId"))
            .Where(id => id is not null).ToHashSet(StringComparer.Ordinal);
        foreach (var id in client.Devices.Keys.Where(id => !wanted.Contains(id)).ToArray()) client.Devices.Remove(id);
        var keep = new HashSet<string>(StringComparer.Ordinal);
        foreach (var node in devices)
        {
            var id = Upsert(client, node as JsonObject, nowMs);
            if (id is not null) keep.Add(id);
        }
        foreach (var id in client.Devices.Keys.Where(id => !keep.Contains(id)).ToArray()) client.Devices.Remove(id);
    }
    private string? Upsert(Client client, JsonObject? data, long nowMs)
    {
        if (data is null || ReadString(data, "slotId") is not { } id) return null;
        DglabV4Protocol.ValidateIdentifier(id, nameof(id));
        if (!client.Devices.TryGetValue(id, out var device))
        {
            if (_clients.Values.Sum(item => item.Devices.Count) >= MaximumDevices)
                throw new InvalidDataException("DG-LAB device limit exceeded.");
            device = new Device(id); client.Devices.Add(id, device);
        }
        device.Name = ReadString(data, "name") ?? device.Name;
        device.Type = ReadString(data, "type") ?? device.Type;
        if (device.Name.Length > 256 || device.Type.Length > 256) throw new InvalidDataException("DG-LAB descriptor exceeds its limit.");
        if (data["props"] is JsonObject props) device.Props = (JsonObject)props.DeepClone();
        if (data["slotState"] is JsonObject state) device.SlotState = (JsonObject)state.DeepClone();
        ValidateSize(device);
        device.UpdatedAtMs = nowMs;
        return id;
    }
    private static void ValidateSize(Device device)
    {
        if (JsonSerializer.SerializeToUtf8Bytes(device.Props).Length + JsonSerializer.SerializeToUtf8Bytes(device.SlotState).Length > 32768)
            throw new InvalidDataException("DG-LAB device properties exceed 32 KiB.");
    }
    private static string? ReadString(JsonObject data, string name) => data[name] is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
    private static bool IsTrue(JsonNode? node) => node is JsonValue value && value.TryGetValue<bool>(out var flag) && flag;
    private static bool IsFalse(JsonNode? node) => node is JsonValue value && value.TryGetValue<bool>(out var flag) && !flag;
    private static bool TryNumber(JsonNode? node, out double number)
    {
        number = 0;
        if (node is not JsonValue value) return false;
        if (value.TryGetValue<bool>(out var flag)) { number = flag ? 1 : 0; return true; }
        return value.TryGetValue<double>(out number) && double.IsFinite(number);
    }
    private static void Merge(JsonObject current, JsonObject patch, int depth = 0)
    {
        if (depth > 16) throw new InvalidDataException("DG-LAB property nesting exceeds its limit.");
        foreach (var pair in patch)
        {
            if (pair.Value is JsonObject child && current[pair.Key] is JsonObject previous) Merge(previous, child, depth + 1);
            else current[pair.Key] = pair.Value?.DeepClone();
        }
    }
    private sealed class Client(string id)
    {
        public string Id { get; } = id;
        public Dictionary<string, Device> Devices { get; } = new(StringComparer.Ordinal);
        public int? LastAction { get; set; }
        public long ActionSequence { get; set; }
        public long UpdatedAtMs { get; set; }
    }
    private sealed class Device(string id)
    {
        public string Id { get; } = id;
        public string Name { get; set; } = "";
        public string Type { get; set; } = "";
        public JsonObject Props { get; set; } = new();
        public JsonObject SlotState { get; set; } = new();
        public long UpdatedAtMs { get; set; }
    }
}
