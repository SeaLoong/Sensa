using System.Net;
using System.Net.Sockets;
using Sensa.Configuration;

namespace Sensa.Input.Osc;

public sealed class OscHubForwarder : IDisposable
{
    private readonly object _sync = new();
    private readonly Action<string>? _logDebug;
    private readonly Action<string>? _logError;
    private Dictionary<string, TargetState> _targets = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, byte[]> _pendingPackets = new(StringComparer.Ordinal);
    private CancellationTokenSource? _pumpCts;
    private Task? _pumpTask;
    private bool _enabled;
    private OscHubMode _mode = OscHubMode.EventDriven;
    private int _fixedRateHz = 10;
    private bool _forwardAvatarChange;
    private bool _pendingAvatarChange;
    private long _forwardedPacketCount;
    private long _droppedPacketCount;
    private DateTimeOffset? _lastForwardedAtUtc;
    private DateTimeOffset? _lastDroppedAtUtc;
    private string _lastDropReason = string.Empty;

    private static readonly byte[] AvatarChangePacket = OscPacketEncoder.BuildAvatarChangePacket();

    public OscHubForwarder(Action<string>? logDebug = null, Action<string>? logError = null)
    {
        _logDebug = logDebug;
        _logError = logError;
    }

    public void Configure(OscHubConfig? config)
    {
        var normalized = config ?? new OscHubConfig();
        var nextTargets = BuildTargetStates(normalized);
        var nextMode = normalized.Mode;
        var nextRate = Math.Clamp(normalized.FixedRateHz, 1, 240);
        var shouldStartPump = normalized.Enabled
            && nextMode == OscHubMode.FixedRate
            && nextTargets.Values.Any(state => state.IsActive);

        CancellationTokenSource? previousPumpCts;
        Task? previousPumpTask;
        Dictionary<string, TargetState> previousTargets;

        lock (_sync)
        {
            previousPumpCts = _pumpCts;
            previousPumpTask = _pumpTask;
            previousTargets = _targets;

            _pumpCts = null;
            _pumpTask = null;
            _targets = nextTargets;
            _enabled = normalized.Enabled;
            _mode = nextMode;
            _fixedRateHz = nextRate;
            _forwardAvatarChange = normalized.ForwardAvatarChange;
            _pendingPackets = new Dictionary<string, byte[]>(StringComparer.Ordinal);
            _pendingAvatarChange = false;
            _forwardedPacketCount = 0;
            _droppedPacketCount = 0;
            _lastForwardedAtUtc = null;
            _lastDroppedAtUtc = null;
            _lastDropReason = string.Empty;

            if (shouldStartPump)
            {
                var cts = new CancellationTokenSource();
                _pumpCts = cts;
                _pumpTask = Task.Run(() => PumpLoopAsync(cts.Token), CancellationToken.None);
            }
        }

        StopPumpAndDispose(previousPumpCts, previousPumpTask, previousTargets);

        if (_enabled)
        {
            _logDebug?.Invoke($"[OSC/Hub] {(shouldStartPump ? $"FixedRate {nextRate}Hz" : "EventDriven")} relay ready with {nextTargets.Values.Count(state => state.IsActive)} target(s).");
        }
        else
        {
            _logDebug?.Invoke("[OSC/Hub] Relay disabled.");
        }
    }

    public void ForwardParameter(string path, OscValue value)
    {
        if (string.IsNullOrWhiteSpace(path))
            return;

        var payload = OscPacketEncoder.BuildAvatarParameterPacket(path, value);
        if (payload.Length == 0)
            return;

        lock (_sync)
        {
            if (!_enabled)
                return;

            if (_mode == OscHubMode.FixedRate)
            {
                _pendingPackets[path.Trim()] = payload;
                return;
            }

            SendPacketLocked(payload, $"/avatar/parameters/{path.Trim().Trim('/')}");
        }
    }

    public void ForwardRawPacket(byte[] payload, string description = "raw")
    {
        if (payload is null || payload.Length == 0)
            return;

        lock (_sync)
        {
            if (!_enabled)
                return;

            SendPacketLocked(payload, description);
        }
    }

    public void ReplaySnapshot(IEnumerable<OscParameterStore.SnapshotEntry> entries)
    {
        if (entries is null)
            return;

        foreach (var entry in entries)
            ForwardParameter(entry.Path, entry.Entry.Value);
    }

    public void ForwardAvatarChange()
    {
        lock (_sync)
        {
            _pendingPackets.Clear();

            if (!_enabled || !_forwardAvatarChange)
                return;

            if (_mode == OscHubMode.FixedRate)
            {
                _pendingAvatarChange = true;
                return;
            }

            SendPacketLocked(AvatarChangePacket, "/avatar/change");
        }
    }

    public void ClearPending()
    {
        lock (_sync)
        {
            _pendingPackets.Clear();
            _pendingAvatarChange = false;
        }
    }

    public OscHubRuntimeSnapshot BuildSnapshot()
    {
        lock (_sync)
        {
            var targets = _targets.Values
                .OrderBy(target => target.Config.Name, StringComparer.OrdinalIgnoreCase)
                .ThenBy(target => target.Config.Host, StringComparer.OrdinalIgnoreCase)
                .ThenBy(target => target.Config.Port)
                .Select(target => new OscHubTargetRuntimeSnapshot
                {
                    Id = target.Config.Id,
                    Name = target.Config.Name,
                    Enabled = target.Config.Enabled,
                    Host = target.Config.Host,
                    Port = target.Config.Port,
                    ResolvedEndpoint = target.ResolvedEndpoint,
                    SentPackets = target.SentPackets,
                    LastSentAtUtc = target.LastSentAtUtc,
                    LastError = target.LastError,
                    LastErrorAtUtc = target.LastErrorAtUtc,
                })
                .ToArray();

            return new OscHubRuntimeSnapshot
            {
                Enabled = _enabled,
                Mode = _mode,
                FixedRateHz = _fixedRateHz,
                ForwardAvatarChange = _forwardAvatarChange,
                TargetCount = targets.Length,
                ActiveTargetCount = _targets.Values.Count(target => target.IsActive),
                PendingPacketCount = _pendingPackets.Count,
                PendingAvatarChange = _pendingAvatarChange,
                ForwardedPacketCount = _forwardedPacketCount,
                DroppedPacketCount = _droppedPacketCount,
                LastForwardedAtUtc = _lastForwardedAtUtc,
                LastDroppedAtUtc = _lastDroppedAtUtc,
                LastDropReason = _lastDropReason,
                Targets = targets,
            };
        }
    }

    public void Dispose()
    {
        CancellationTokenSource? pumpCts;
        Task? pumpTask;
        Dictionary<string, TargetState> targets;

        lock (_sync)
        {
            pumpCts = _pumpCts;
            pumpTask = _pumpTask;
            targets = _targets;
            _pumpCts = null;
            _pumpTask = null;
            _targets = new Dictionary<string, TargetState>(StringComparer.OrdinalIgnoreCase);
            _pendingPackets = new Dictionary<string, byte[]>(StringComparer.Ordinal);
            _pendingAvatarChange = false;
            _enabled = false;
        }

        StopPumpAndDispose(pumpCts, pumpTask, targets);
    }

    private async Task PumpLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var delayMs = 1000 / Math.Max(1, SnapshotFixedRate());
            try
            {
                await Task.Delay(delayMs, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }

            FlushPending();
        }
    }

    private int SnapshotFixedRate()
    {
        lock (_sync)
            return _fixedRateHz;
    }

    private void FlushPending()
    {
        lock (_sync)
        {
            if (!_enabled || _mode != OscHubMode.FixedRate)
                return;

            if (_pendingAvatarChange)
            {
                SendPacketLocked(AvatarChangePacket, "/avatar/change");
                _pendingAvatarChange = false;
            }

            if (_pendingPackets.Count == 0)
                return;

            var pending = _pendingPackets.ToArray();
            _pendingPackets.Clear();

            foreach (var (_, payload) in pending)
                SendPacketLocked(payload, "snapshot");
        }
    }

    private void SendPacketLocked(byte[] payload, string description)
    {
        if (payload.Length == 0)
            return;

        var activeTargets = _targets.Values.Where(target => target.IsActive).ToArray();
        if (activeTargets.Length == 0)
            return;

        var timestamp = DateTimeOffset.UtcNow;

        foreach (var target in activeTargets)
        {
            try
            {
                target.Client!.Send(payload, payload.Length, target.EndPoint!);
                target.SentPackets += 1;
                target.LastSentAtUtc = timestamp;
                target.LastError = string.Empty;
                target.LastErrorAtUtc = null;
                _forwardedPacketCount += 1;
                _lastForwardedAtUtc = timestamp;
            }
            catch (Exception ex)
            {
                target.LastError = ex.Message;
                target.LastErrorAtUtc = timestamp;
                _droppedPacketCount += 1;
                _lastDroppedAtUtc = timestamp;
                _lastDropReason = $"{target.Config.Name}: {ex.Message}";
                _logError?.Invoke($"[OSC/Hub] Failed to relay {description} to {target.ResolvedEndpoint}: {ex.Message}");
            }
        }

    }

    private static Dictionary<string, TargetState> BuildTargetStates(OscHubConfig config)
    {
        var result = new Dictionary<string, TargetState>(StringComparer.OrdinalIgnoreCase);
        foreach (var target in config.Targets ?? new List<OscHubTargetConfig>())
        {
            var state = new TargetState(target);
            if (state.Config.Enabled)
            {
                var endPoint = ResolveEndpoint(state.Config.Host, state.Config.Port);
                state.EndPoint = endPoint;
                state.Client = new UdpClient(endPoint.AddressFamily);
                state.ResolvedEndpoint = $"{endPoint.Address}:{endPoint.Port}";
            }

            result[state.Config.Id] = state;
        }

        return result;
    }

    private static IPEndPoint ResolveEndpoint(string host, int port)
    {
        var resolvedPort = port is > 0 and <= 65535 ? port : 9002;
        var normalizedHost = string.IsNullOrWhiteSpace(host) ? "127.0.0.1" : host.Trim();
        var addresses = Dns.GetHostAddresses(normalizedHost);
        var address = addresses.FirstOrDefault(candidate => candidate.AddressFamily == AddressFamily.InterNetwork)
            ?? addresses.FirstOrDefault(candidate => candidate.AddressFamily == AddressFamily.InterNetworkV6)
            ?? throw new InvalidOperationException($"Cannot resolve OSC Hub host '{normalizedHost}'.");

        return new IPEndPoint(address, resolvedPort);
    }

    private static void StopPumpAndDispose(CancellationTokenSource? pumpCts, Task? pumpTask, Dictionary<string, TargetState>? targets)
    {
        if (pumpCts is not null)
        {
            try { pumpCts.Cancel(); } catch { }
        }

        if (pumpTask is not null)
        {
            try { pumpTask.GetAwaiter().GetResult(); } catch { }
        }

        pumpCts?.Dispose();

        if (targets is null)
            return;

        foreach (var target in targets.Values)
            target.Dispose();
    }

    private sealed class TargetState : IDisposable
    {
        public TargetState(OscHubTargetConfig config)
        {
            Config = new OscHubTargetConfig
            {
                Id = config.Id,
                Name = config.Name,
                Enabled = config.Enabled,
                Host = config.Host,
                Port = config.Port,
            };
        }

        public OscHubTargetConfig Config { get; }
        public bool IsActive => Config.Enabled && Client is not null && EndPoint is not null;
        public UdpClient? Client { get; set; }
        public IPEndPoint? EndPoint { get; set; }
        public string ResolvedEndpoint { get; set; } = string.Empty;
        public long SentPackets { get; set; }
        public DateTimeOffset? LastSentAtUtc { get; set; }
        public string LastError { get; set; } = string.Empty;
        public DateTimeOffset? LastErrorAtUtc { get; set; }

        public void Dispose()
        {
            try { Client?.Dispose(); } catch { }
            Client = null;
            EndPoint = null;
        }
    }
}

public sealed class OscHubRuntimeSnapshot
{
    public bool Enabled { get; init; }
    public OscHubMode Mode { get; init; } = OscHubMode.EventDriven;
    public int FixedRateHz { get; init; }
    public bool ForwardAvatarChange { get; init; }
    public int TargetCount { get; init; }
    public int ActiveTargetCount { get; init; }
    public int PendingPacketCount { get; init; }
    public bool PendingAvatarChange { get; init; }
    public long ForwardedPacketCount { get; init; }
    public long DroppedPacketCount { get; init; }
    public DateTimeOffset? LastForwardedAtUtc { get; init; }
    public DateTimeOffset? LastDroppedAtUtc { get; init; }
    public string LastDropReason { get; init; } = string.Empty;
    public IReadOnlyList<OscHubTargetRuntimeSnapshot> Targets { get; init; } = Array.Empty<OscHubTargetRuntimeSnapshot>();
}

public sealed class OscHubTargetRuntimeSnapshot
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public bool Enabled { get; init; }
    public string Host { get; init; } = string.Empty;
    public int Port { get; init; }
    public string ResolvedEndpoint { get; init; } = string.Empty;
    public long SentPackets { get; init; }
    public DateTimeOffset? LastSentAtUtc { get; init; }
    public string LastError { get; init; } = string.Empty;
    public DateTimeOffset? LastErrorAtUtc { get; init; }
}
