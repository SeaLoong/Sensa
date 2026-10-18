using System.Net;
using System.Net.Sockets;
using Sensa.Configuration;

namespace Sensa.Input.Osc;

/// <summary>
/// Explicit, fixed-target OGB_ENABLED heartbeat; never infer a destination from
/// an incoming source port. / 显式固定目标的 OGB_ENABLED 心跳，不猜测来包端口。
/// UDP delivery has no acknowledgement. / UDP 发送不表示 VRChat 已确认启用。
/// </summary>
public sealed class OgbControlService : IDisposable
{
    private static readonly byte[] EnablePacket = OscPacketEncoder.BuildAvatarParameterPacket("OGB_ENABLED", OscValue.FromBool(true));
    private static readonly byte[] DisablePacket = OscPacketEncoder.BuildAvatarParameterPacket("OGB_ENABLED", OscValue.FromBool(false));
    private readonly object _sync = new();
    private readonly TimeProvider _clock;
    private readonly ITimer _timer;
    private readonly Action<string>? _logError;
    private UdpClient? _client;
    private IPEndPoint? _target;
    private bool _disposed;
    private string _lastError = "";
    private DateTimeOffset? _lastSentAtUtc;
    private bool? _lastSentValue;

    public event Action? StateChanged;

    public OgbControlService(TimeProvider? timeProvider = null, Action<string>? logError = null)
    {
        _clock = timeProvider ?? TimeProvider.System;
        _logError = logError;
        _timer = _clock.CreateTimer(_ =>
        {
            lock (_sync)
                if (!_disposed && _target is not null) SendLocked(true);
        }, null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
    }

    public OgbControlSnapshot Snapshot()
    {
        lock (_sync)
            return new(_target is not null, _target?.Address.ToString() ?? "", _target?.Port ?? 0,
                _lastError, _lastSentAtUtc, _lastSentValue);
    }

    public void Configure(OgbControlConfig? config, bool shouldRun)
    {
        lock (_sync)
        {
            if (_disposed) return;
            IPEndPoint? target;
            try { target = shouldRun && config?.Enabled == true ? config.ResolveTarget() : null; }
            catch (Exception ex) when (ex is InvalidOperationException or ArgumentException)
            {
                StopLocked();
                ReportErrorLocked(ex.Message);
                return;
            }
            if (Equals(_target, target)) return;
            // Timer callbacks and target changes share this lock: an old true
            // cannot race after its final false. / 旧目标最终 false 后不会再发 true。
            StopLocked();
            if (target is null) { StateChanged?.Invoke(); return; }
            try
            {
                _client = new UdpClient(target.AddressFamily);
                _target = target;
                SendLocked(true);
                _timer.Change(TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
            }
            catch (SocketException ex)
            {
                StopLocked();
                ReportErrorLocked(ex.Message);
            }
        }
    }

    private void SendLocked(bool enabled)
    {
        if (_client is null || _target is null) return;
        try
        {
            var packet = enabled ? EnablePacket : DisablePacket;
            _client.Send(packet, packet.Length, _target);
            _lastError = "";
            _lastSentAtUtc = _clock.GetUtcNow();
            _lastSentValue = enabled;
            StateChanged?.Invoke();
        }
        catch (Exception ex) when (ex is SocketException or ObjectDisposedException)
        {
            ReportErrorLocked(ex.Message);
        }
    }

    private void ReportErrorLocked(string message)
    {
        var changed = _lastError != message;
        _lastError = message;
        if (changed) _logError?.Invoke($"[OGB] OSC 控制发送失败 / OSC control send failed: {message}");
        StateChanged?.Invoke();
    }

    private void StopLocked()
    {
        _timer.Change(Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        SendLocked(false);
        _client?.Dispose();
        _client = null;
        _target = null;
    }

    public void Dispose()
    {
        lock (_sync)
        {
            if (_disposed) return;
            StopLocked();
            _disposed = true;
            _timer.Dispose();
        }
    }
}

public sealed record OgbControlSnapshot(bool Active, string Host, int Port, string LastError,
    DateTimeOffset? LastSentAtUtc, bool? LastSentValue);
