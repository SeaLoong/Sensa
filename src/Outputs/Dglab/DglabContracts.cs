using System.Text.Json;

namespace Sensa.Outputs.Dglab;

public enum DglabChannel { A = 0, B = 1 }

/// <summary>Connection settings for the official DG-LAB 4 APP WebSocket V4 relay.</summary>
public sealed class DglabConnectionOptions
{
    public string ServerUrl { get; set; } = "wss://trex.dungeon-lab.cn/v4";
    public int ConnectTimeoutMs { get; set; } = 8000;
    public int ResponseTimeoutMs { get; set; } = 3000;
}

public sealed record DglabTarget(string ClientId, string SlotId, DglabChannel Channel = DglabChannel.A);

public sealed record DglabDeviceSnapshot(string SlotId, string Name, string Type,
    JsonElement Props, JsonElement SlotState, long UpdatedAtMs);
public sealed record DglabClientSnapshot(string ClientId, IReadOnlyList<DglabDeviceSnapshot> Devices,
    int? LastAction, long ActionSequence, long UpdatedAtMs);
public sealed record DglabConnectionSnapshot(bool Connected, string State, string? TargetId,
    string? PairingUrl, string? AppPairingUrl, IReadOnlyList<DglabClientSnapshot> Clients,
    string? LastError, long Generation)
{
    public string Status => State;
    public IReadOnlyList<DglabDiscoveredDeviceSnapshot> Devices => Clients.SelectMany(client => client.Devices
        .Select(device => new DglabDiscoveredDeviceSnapshot(client.ClientId, device.SlotId, device.Name,
            device.Type, device.Props, device.SlotState, device.UpdatedAtMs))).ToArray();
}
public sealed record DglabDiscoveredDeviceSnapshot(string ClientId, string SlotId, string Name, string Type,
    JsonElement Props, JsonElement SlotState, long UpdatedAtMs);

/// <summary>One message-oriented transport; the protocol client owns RPC and lifecycle.</summary>
public interface IDglabSocket : IAsyncDisposable
{
    bool IsOpen { get; }
    Task ConnectAsync(Uri address, CancellationToken cancellationToken);
    Task SendTextAsync(string message, CancellationToken cancellationToken);
    Task<string?> ReceiveTextAsync(CancellationToken cancellationToken);
    void Abort();
}
