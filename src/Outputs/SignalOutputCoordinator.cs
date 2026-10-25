using System.Text.Json;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Outputs.Adapters;
using Sensa.Outputs.Dglab;
using Sensa.Recording;
using Sensa.Signals;

namespace Sensa.Outputs;

/// <summary>Independent destinations consume a shared calculation frame through bounded latest-value mailboxes.</summary>
public sealed class SignalOutputCoordinator : IAsyncDisposable
{
    private readonly object _sync = new();
    private readonly AppConfig _config;
    private readonly Action<string> _error;
    private readonly Dictionary<string, SignalDestination> _destinations = new(StringComparer.OrdinalIgnoreCase);
    private readonly TimeProvider _clock;
    private readonly Func<string, bool> _motionConnected;
    private readonly Func<string, MotionFrame, Task> _motionSend;
    private readonly Func<string, Task> _motionStop;
    private readonly Func<DglabV4Client> _dglabFactory;
    private readonly Func<OutputDeviceConfig, ISignalOutputAdapter>? _adapterFactory;
    public Func<bool> CanSend { get; set; } = () => false;
    public event Action? StateChanged;

    public SignalOutputCoordinator(AppConfig config, Func<string, bool> motionConnected,
        Func<string, MotionFrame, Task> motionSend, Func<string, Task> motionStop,
        Action<string>? error = null, TimeProvider? clock = null, Func<DglabV4Client>? dglabFactory = null,
        Func<OutputDeviceConfig, ISignalOutputAdapter>? adapterFactory = null)
    {
        _config = config; _motionConnected = motionConnected; _motionSend = motionSend; _motionStop = motionStop;
        _error = error ?? (_ => { }); _clock = clock ?? TimeProvider.System;
        _dglabFactory = dglabFactory ?? (() => new(clock: _clock));
        _adapterFactory = adapterFactory;
        Build();
    }
    public bool HasBindings { get { lock (_sync) return _destinations.Count > 0; } }
    private void Build()
    {
        foreach (var output in _config.Outputs.Where(SignalOutputConfiguration.UsesBindings))
            _destinations.Add(output.Id, new(output, _clock, _motionConnected, _motionSend, _motionStop, () => CanSend(),
                () => StateChanged?.Invoke(), _error, _dglabFactory, _adapterFactory));
    }
    public async Task ReloadAsync()
    {
        Dictionary<string, SignalDestination> previous;
        lock (_sync) { previous = new(_destinations, StringComparer.OrdinalIgnoreCase); _destinations.Clear(); }
        foreach (var output in _config.Outputs.Where(SignalOutputConfiguration.UsesBindings))
        {
            if (previous.Remove(output.Id, out var existing) && existing.CanReuse(output))
            {
                existing.Reconfigure(output);
                lock (_sync) _destinations.Add(output.Id, existing);
            }
            else
            {
                if (existing is not null) await existing.DisposeAsync();
                var destination = new SignalDestination(output, _clock, _motionConnected, _motionSend, _motionStop,
                    () => CanSend(), () => StateChanged?.Invoke(), _error, _dglabFactory, _adapterFactory);
                lock (_sync) _destinations.Add(output.Id, destination);
            }
        }
        foreach (var destination in previous.Values) await destination.DisposeAsync();
    }
    private SignalDestination? Find(string id) { lock (_sync) return _destinations.GetValueOrDefault(id); }
    public async Task<bool> ConnectAsync(string id) => Find(id) is { } destination && await destination.ConnectAsync();
    public async Task DisconnectAsync(string id) { if (Find(id) is { } destination) await destination.DisconnectAsync(); }
    public bool IsConnected(string id) => Find(id)?.IsConnected ?? false;
    public object? Snapshot(string id) => Find(id)?.Snapshot;
    public IReadOnlyList<ComputedSignalInputConfig> Sources
    {
        get { lock (_sync) return _destinations.Values.SelectMany(destination => destination.Bindings.Select(binding => binding.Source)).ToArray(); }
    }
    public void Publish(Func<ComputedSignalInputConfig, ComputedSignalSample> resolve, long nowMs)
    {
        SignalDestination[] destinations;
        lock (_sync) destinations = _destinations.Values.ToArray();
        foreach (var destination in destinations) destination.Publish(resolve, nowMs);
    }
    public ComputedSignalSample ReadFeedback(string path, long nowMs)
    {
        var separator = path.IndexOf('/');
        if (separator < 1 || Find(path[..separator]) is not { } destination)
            return ComputedSignalSample.Invalid("请选择输出和反馈项 / Choose an output and feedback field");
        return destination.ReadFeedback(path[(separator + 1)..], nowMs);
    }
    public ComputedSignalSample ReadReplay(string path, long nowMs)
    {
        var separator = path.IndexOf('/');
        return separator > 0 && Find(path[..separator]) is { } destination
            ? destination.Playback.Read(path[(separator + 1)..], nowMs)
            : ComputedSignalSample.Invalid("请选择录制输出和回放信号 / Choose a recording output and replay signal");
    }
    public object ReplayAction(string outputId, string action, string? fileName, long timeMs)
    {
        var destination = Find(outputId) ?? throw new ArgumentException("请选择已有输出 / Choose an existing output");
        switch (action)
        {
            case "load": destination.Playback.Load(fileName ?? ""); break;
            case "play": destination.Playback.Play(); break;
            case "pause": destination.Playback.Pause(); break;
            case "seek": destination.Playback.Seek(timeMs); break;
            default: throw new ArgumentException("请选择回放操作 / Choose a replay operation");
        }
        StateChanged?.Invoke(); return destination.Playback.Snapshot;
    }
    public void Invalidate()
    {
        SignalDestination[] destinations;
        lock (_sync) destinations = _destinations.Values.ToArray();
        // Resolving a binding can read another destination through this coordinator.
        // Release its lock before waiting for any destination's routing lock.
        foreach (var destination in destinations) destination.Invalidate();
    }
    public async Task StopAsync()
    {
        SignalDestination[] destinations;
        lock (_sync) destinations = _destinations.Values.ToArray();
        await Task.WhenAll(destinations.Select(destination => destination.StopAsync()));
    }
    public void PauseReplays() { lock (_sync) foreach (var destination in _destinations.Values) destination.Playback.Pause(); }
    public async ValueTask DisposeAsync()
    {
        SignalDestination[] destinations;
        lock (_sync) { destinations = _destinations.Values.ToArray(); _destinations.Clear(); }
        foreach (var destination in destinations) await destination.DisposeAsync();
    }

    private sealed class SignalDestination : IAsyncDisposable
    {
        private OutputDeviceConfig _output;
        private readonly string _identity;
        private SignalOutputOptions _options;
        private readonly object _sync = new();
        private readonly SemaphoreSlim _sendGate = new(1, 1);
        private readonly Func<string, bool> _motionConnected;
        private readonly Func<string, MotionFrame, Task> _motionSend;
        private readonly Func<string, Task> _motionStop;
        private readonly Func<bool> _canSend;
        private readonly Action _changed;
        private readonly Action<string> _error;
        private readonly TimeProvider _clock;
        private readonly Func<DglabV4Client> _dglabFactory;
        private readonly Func<OutputDeviceConfig, ISignalOutputAdapter>? _adapterFactory;
        private readonly Dictionary<string, RouteState> _routes;
        private readonly Dictionary<string, Delivery> _pending = new(StringComparer.Ordinal);
        private readonly Queue<Delivery> _events = new();
        private readonly Dictionary<string, double> _sent = new(StringComparer.Ordinal);
        private CancellationTokenSource _generationCancellation = new();
        private long _generation;
        private long _droppedEvents;
        private bool _worker, _disposed, _faulted;
        private ISignalOutputAdapter? _adapter;
        private DglabV4Client? _dglab;
        private SignalSessionRecorder? _recorder;
        private MotionFrame _motionFrame = MotionAxisHelper.CreateNeutralFrame();
        private string _status = "disconnected";
        public SignalSessionPlayback Playback { get; }
        public IReadOnlyList<SignalOutputBinding> Bindings => _options.Bindings;
        private bool IsMotion => !SignalOutputConfiguration.IsProtocolOutput(_output.Type);
        public bool IsConnected => !_disposed && !_faulted && _dglab?.Snapshot.State != "CommandError" && (IsMotion ? _motionConnected(_output.Id)
            : _dglab?.Snapshot.Connected ?? _adapter?.IsConnected ?? (_recorder is not null));
        public object Snapshot
        {
            get
            {
                lock (_sync)
                {
                    var dg = _dglab?.Snapshot;
                    return new { connected = IsConnected, status = _status is "error" or "stop-unconfirmed" ? _status : _recorder?.Full == true ? "recording-limit"
                        : dg?.State ?? (_status == "connected" && !IsConnected ? "disconnected" : _status),
                        error = _recorder?.Error ?? dg?.LastError, targetId = dg?.TargetId, pairingUrl = dg?.AppPairingUrl ?? dg?.PairingUrl,
                        devices = dg?.Devices ?? [], routes = _routes.Values.Select(route => new { route.Id, route.Name,
                            route.Valid, route.Reason, route.RawValue, route.Value, route.LastSentMs }).ToArray(),
                        recordingFile = _recorder?.FileName, recordingFiles = _recorder?.Files ?? [],
                        replay = Playback.Snapshot, droppedEvents = _droppedEvents };
                }
            }
        }
        public SignalDestination(OutputDeviceConfig output, TimeProvider clock, Func<string, bool> motionConnected,
            Func<string, MotionFrame, Task> motionSend, Func<string, Task> motionStop, Func<bool> canSend,
            Action changed, Action<string> error, Func<DglabV4Client> dglabFactory, Func<OutputDeviceConfig, ISignalOutputAdapter>? adapterFactory)
        {
            _output = output; _identity = Identity(output); _options = SignalOutputConfiguration.Clone(output.Signal); _clock = clock;
            _motionConnected = motionConnected; _motionSend = motionSend; _motionStop = motionStop; _canSend = canSend;
            _changed = changed; _error = error; Playback = new(clock);
            _dglabFactory = dglabFactory;
            _adapterFactory = adapterFactory;
            _routes = _options.Bindings.ToDictionary(binding => binding.Id, binding => new RouteState(binding.Id, binding.Name));
        }
        private static string Identity(OutputDeviceConfig output) => JsonSerializer.Serialize(new
        {
            output.Type, output.Host, output.Port, output.WebsocketAddress, output.ComPort,
            output.Signal.ServerUrl, output.Signal.VrChat, output.Signal.MqttClientId, output.Signal.MqttUseTls,
            output.Signal.MidiPortName, output.Signal.RecordingFormat, output.Signal.RecordingName,
        });
        public bool CanReuse(OutputDeviceConfig output) => !_disposed && Identity(output) == _identity;
        public void Reconfigure(OutputDeviceConfig output)
        {
            lock (_sync)
            {
                _output = output; _options = SignalOutputConfiguration.Clone(output.Signal);
                foreach (var route in _routes.Values) route.WaitCancellation.Cancel();
                _routes.Clear(); _sent.Clear(); _pending.Clear(); _events.Clear();
                foreach (var binding in _options.Bindings) _routes.Add(binding.Id, new(binding.Id, binding.Name));
            }
        }
        public void Invalidate()
        {
            CancellationTokenSource old;
            lock (_sync)
            {
                if (_disposed) return;
                Interlocked.Increment(ref _generation); old = _generationCancellation; _generationCancellation = new();
                _pending.Clear(); _events.Clear(); _sent.Clear();
                foreach (var route in _routes.Values) { route.QueuedAtMs = 0; route.EventHigh = false; route.WaveStartedMs = 0; route.Observed = false; route.Valid = false; }
            }
            old.Cancel(); old.Dispose();
        }
        public async Task<bool> ConnectAsync()
        {
            await _sendGate.WaitAsync();
            try
            {
                if (IsConnected) return true;
                if (IsMotion) return _motionConnected(_output.Id);
                Invalidate();
                await CloseTransportAsync();
                _faulted = false;
                _status = "connecting";
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                if (_output.Type == OutputDeviceType.Dglab)
                {
                    _dglab = _dglabFactory(); _dglab.Changed += _changed;
                    await _dglab.ConnectAsync(new() { ServerUrl = string.IsNullOrWhiteSpace(_options.ServerUrl)
                        ? "wss://trex.dungeon-lab.cn/v4" : _options.ServerUrl }, timeout.Token);
                }
                else if (_output.Type == OutputDeviceType.Recording)
                    _recorder = new(_options.RecordingName, _options.RecordingFormat,
                        _options.Bindings.Select(binding => new SignalRecordingTrack(RecordingId(binding), binding.Name, RecordingAxis(binding))).ToArray());
                else
                {
                    _adapter = _adapterFactory?.Invoke(_output) ?? (_output.Type switch
                    {
                        OutputDeviceType.OscParameter => SignalOutputAdapters.OscUdp(_options.VrChat ? "127.0.0.1" : _output.Host,
                            _options.VrChat ? 9000 : _output.Port),
                        OutputDeviceType.HttpJson => SignalOutputAdapters.HttpJson(new Uri(_output.WebsocketAddress)),
                        OutputDeviceType.WebSocketJson => SignalOutputAdapters.WebSocketJson(new Uri(_output.WebsocketAddress)),
                        OutputDeviceType.Midi => SignalOutputAdapters.Midi(_options.MidiPortName),
                        OutputDeviceType.Mqtt => SignalOutputAdapters.Mqtt(new() { Host = _output.Host, Port = _output.Port,
                            ClientId = string.IsNullOrWhiteSpace(_options.MqttClientId) ? "sensa-" + _output.Id : _options.MqttClientId,
                            UseTls = _options.MqttUseTls }),
                        _ => throw new ArgumentException("请选择输出方式 / Choose an output type"),
                    });
                    await _adapter.ConnectAsync(timeout.Token);
                }
                _status = "connected"; _changed(); return IsConnected;
            }
            catch (Exception ex) { _faulted = true; _status = "error"; await CloseTransportAsync(); _error("[Output] Connection failed: " + ex.GetType().Name); _changed(); return false; }
            finally { _sendGate.Release(); }
        }
        public void Publish(Func<ComputedSignalInputConfig, ComputedSignalSample> resolve, long nowMs)
        {
            if (_disposed || !_output.Enabled || !IsConnected || !_canSend()) return;
            lock (_sync)
            {
                var targetReady = _dglab is null || _dglab.Snapshot.Devices.Any(device => device.ClientId == _options.ClientId && device.SlotId == _options.SlotId);
                foreach (var binding in _options.Bindings)
                {
                    if (!targetReady)
                    {
                        var waiting = _routes[binding.Id];
                        if (waiting.Valid)
                        {
                            waiting.Revision++; waiting.WaitCancellation.Cancel(); waiting.WaitCancellation.Dispose(); waiting.WaitCancellation = new();
                            waiting.EventHigh = false; waiting.WaveStartedMs = 0; _pending.Remove(binding.Id);
                        }
                        waiting.Valid = false; waiting.Reason = "请选择已连接的设备 / Choose a connected device"; continue;
                    }
                    var sample = resolve(binding.Source); var route = _routes[binding.Id];
                    var value = sample.Valid && sample.Value is { } raw ? binding.Map(raw) : (double?)null;
                    var interval = 1000d / binding.RateHz;
                    if (_output.Type == OutputDeviceType.Dglab && binding.Address == "Intensity")
                        interval = Math.Min(interval, _options.TaskDurationMs / 2d);
                    var becameInvalid = route.Valid && !sample.Valid;
                    if (route.Valid != sample.Valid)
                    {
                        route.Revision++; route.WaitCancellation.Cancel(); route.WaitCancellation.Dispose(); route.WaitCancellation = new();
                        route.EventHigh = false; route.WaveStartedMs = 0;
                    }
                    route.Valid = sample.Valid; route.Reason = sample.Reason; route.RawValue = sample.Value; route.Value = value;
                    if (!sample.Valid)
                    {
                        if (becameInvalid || !route.Observed)
                        {
                            _recorder?.Append(RecordingId(binding), sample, null, nowMs);
                            _pending[binding.Id] = new(binding, sample, binding.StopValue, nowMs, true, _generation, route.Revision);
                        }
                        route.Observed = true; continue;
                    }
                    route.Observed = true;
                    if (binding.SendMode == "OnEvent" || _output.Type == OutputDeviceType.Dglab && binding.Address == "Pulse" && binding.SendMode != "FixedRate")
                    {
                        var high = _output.Type == OutputDeviceType.Dglab && binding.Address == "Pulse" ? value!.Value >= .5 : value!.Value > 0;
                        if (high && !route.EventHigh)
                        {
                            if (_events.Count < 64) _events.Enqueue(new(binding, sample, value.Value, nowMs, false, _generation, route.Revision));
                            else _droppedEvents++;
                        }
                        route.EventHigh = high; continue;
                    }
                    if (_output.Type == OutputDeviceType.Dglab && binding.Address == "Pulse")
                        interval = Math.Max(100, Math.Floor(Math.Min(interval, Math.Max(100, _options.TaskDurationMs / 2d)) / 100) * 100);
                    if (nowMs - route.QueuedAtMs < interval) continue;
                    var heartbeat = _output.Type == OutputDeviceType.Dglab && binding.Address == "Intensity";
                    if (!heartbeat && binding.SendMode == "OnChange" && _sent.TryGetValue(binding.Id, out var previous)
                        && Math.Abs(previous - value!.Value) <= binding.Epsilon) continue;
                    route.QueuedAtMs = nowMs;
                    _pending[binding.Id] = new(binding, sample, value!.Value, nowMs, false, _generation, route.Revision);
                }
                if (_worker || _pending.Count == 0 && _events.Count == 0) return;
                _worker = true; _ = DrainAsync();
            }
        }
        private async Task DrainAsync()
        {
            while (true)
            {
                Delivery[] deliveries; CancellationToken cancellation;
                lock (_sync)
                {
                    if (_pending.Count == 0 && _events.Count == 0 || _disposed) { _worker = false; return; }
                    deliveries = _pending.Values.Concat(_events).ToArray(); _pending.Clear(); _events.Clear(); cancellation = _generationCancellation.Token;
                }
                await _sendGate.WaitAsync();
                try
                {
                    foreach (var delivery in deliveries)
                    {
                        if (!_canSend() || !_output.Enabled || _faulted || delivery.Generation != Interlocked.Read(ref _generation) || cancellation.IsCancellationRequested) continue;
                        CancellationToken routeCancellation;
                        lock (_sync) { if (!_routes.TryGetValue(delivery.Binding.Id, out var current) || current.Revision != delivery.RouteRevision) continue; routeCancellation = current.WaitCancellation.Token; }
                        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
                        deadline.CancelAfter(TimeSpan.FromSeconds(3));
                        try
                        {
                        if (!delivery.Stop && delivery.Binding.SendMode == "OnEvent")
                        {
                            long lastSent;
                            lock (_sync) lastSent = _routes[delivery.Binding.Id].LastSentMs;
                            var delayMs = 1000d / delivery.Binding.RateHz - (_clock.GetUtcNow().ToUnixTimeMilliseconds() - lastSent);
                            using var waiting = CancellationTokenSource.CreateLinkedTokenSource(deadline.Token, routeCancellation);
                            if (delayMs > 0) await Task.Delay(TimeSpan.FromMilliseconds(delayMs), _clock, waiting.Token);
                        }
                        if (!_canSend() || cancellation.IsCancellationRequested || delivery.Generation != Interlocked.Read(ref _generation)) continue;
                        lock (_sync) { if (!_routes.TryGetValue(delivery.Binding.Id, out var current) || current.Revision != delivery.RouteRevision) continue; }
                        await DeliverAsync(delivery, deadline.Token, cancellation);
                        lock (_sync)
                        {
                            _sent[delivery.Binding.Id] = delivery.Value;
                            _routes[delivery.Binding.Id].LastSentMs = _clock.GetUtcNow().ToUnixTimeMilliseconds();
                        }
                        }
                        catch (OperationCanceledException) when (cancellation.IsCancellationRequested || routeCancellation.IsCancellationRequested) { }
                    }
                }
                catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
                catch (Exception ex)
                {
                    lock (_sync) { _faulted = true; _status = "error"; _pending.Clear(); _events.Clear(); foreach (var route in _routes.Values) { route.Valid = false; route.Reason = "输出发送失败 / Output send failed"; } }
                    _error("[Output] Send failed: " + ex.GetType().Name); _changed();
                }
                finally { _sendGate.Release(); }
            }
        }
        private static string RecordingId(SignalOutputBinding binding) => string.IsNullOrWhiteSpace(binding.Address) ? binding.Id : binding.Address;
        private static string? RecordingAxis(SignalOutputBinding binding)
        {
            foreach (var candidate in new[] { binding.Address, binding.Name })
                if (Enum.TryParse<MotionAxis>(candidate, out var axis) && Enum.IsDefined(axis) && axis.ToString() == candidate) return candidate;
            return null;
        }
        private DglabTarget Target(SignalOutputBinding? binding = null) => new(_options.ClientId, _options.SlotId,
            (DglabChannel)(binding?.Channel ?? _options.Channel));
        private async Task DeliverAsync(Delivery delivery, CancellationToken cancellation, CancellationToken generation)
        {
            if (_recorder is not null) { if (!delivery.Stop) _recorder.Append(RecordingId(delivery.Binding), delivery.Sample, delivery.Value, delivery.AtMs); return; }
            if (_dglab is not null)
            {
                if (delivery.Stop)
                {
                    if (delivery.Binding.Address == "Pulse") await StopPulseAsync(delivery.Binding, generation);
                    else await _dglab.DispatchTemporaryIntensityAsync(Target(delivery.Binding), 0, 100, generation);
                    return;
                }
                if (delivery.Binding.Address == "Pulse")
                {
                    if (delivery.Value >= .5 && _options.WaveformFrames.Count > 0)
                    {
                        var frames = _options.WaveformFrames.ToArray();
                        if (delivery.Binding.SendMode == "FixedRate")
                        {
                            var route = _routes[delivery.Binding.Id];
                            if (route.WaveStartedMs == 0) route.WaveStartedMs = delivery.AtMs;
                            var offset = (int)((delivery.AtMs - route.WaveStartedMs) / 100 % frames.Length);
                            frames = Enumerable.Range(0, (_options.TaskDurationMs + 99) / 100)
                                .Select(index => _options.WaveformFrames[(offset + index) % _options.WaveformFrames.Count]).ToArray();
                        }
                        await _dglab.DispatchPulseAsync(Target(delivery.Binding), frames, _options.TaskDurationMs,
                            generation, version: frames[0].Length == 6 ? 2 : 3);
                    }
                    else { _routes[delivery.Binding.Id].WaveStartedMs = 0; await StopPulseAsync(delivery.Binding, generation); }
                }
                else await _dglab.DispatchTemporaryIntensityAsync(Target(delivery.Binding),
                    Math.Clamp(delivery.Value, 0, 1) * _options.MaxIntensity, _options.TaskDurationMs, generation);
                return;
            }
            if (IsMotion)
            {
                var patch = new MotionPatch();
                var axis = Enum.Parse<MotionAxis>(delivery.Binding.Address);
                patch.Set(axis, (float)delivery.Value);
                _motionFrame = MotionAxisHelper.ApplyPatch(_motionFrame, patch, 1000d / delivery.Binding.RateHz) with { ActiveAxes = new HashSet<MotionAxis> { axis } };
                await _motionSend(_output.Id, _motionFrame); return;
            }
            if (_adapter is not null)
                await _adapter.SendAsync(new(_output.Type == OutputDeviceType.Mqtt ? _options.MqttTopicPrefix + delivery.Binding.Address : delivery.Binding.Address,
                    delivery.Value, Enum.Parse<SignalOutputValueType>(delivery.Binding.ValueType), delivery.Binding.Id,
                    "", delivery.AtMs, CoordinateFrame: delivery.Sample.CoordinateFrame), cancellation);
        }
        private async Task StopPulseAsync(SignalOutputBinding binding, CancellationToken cancellation)
        {
            if (_dglab is null) return;
            if (_options.WaveformFrames.FirstOrDefault()?.Length != 6)
            {
                await _dglab.DispatchPulseAsync(Target(binding), ["0A0A0A0A00000000"], 100, cancellation); return;
            }
            await _dglab.ClearAsync(Target(binding), cancellation);
            foreach (var intensity in _options.Bindings.Where(candidate => candidate.Address == "Intensity"
                && (candidate.Channel ?? _options.Channel) == (binding.Channel ?? _options.Channel)))
                if (_routes[intensity.Id] is { Valid: true, Value: { } value })
                    await _dglab.DispatchTemporaryIntensityAsync(Target(intensity), Math.Clamp(value, 0, 1) * _options.MaxIntensity,
                        _options.TaskDurationMs, cancellation);
        }
        public ComputedSignalSample ReadFeedback(string path, long nowMs)
        {
            var target = Target();
            if (_dglab is not null && _dglab.TryReadFeedback(target, path, out var value) && double.IsFinite(value) && float.IsFinite((float)value))
                {
                var device = _dglab.Snapshot.Devices.FirstOrDefault(device => device.ClientId == target.ClientId && device.SlotId == target.SlotId);
                var at = path is "connected" or "action" || path.StartsWith("action.", StringComparison.Ordinal) ? nowMs : device?.UpdatedAtMs ?? nowMs;
                return ComputedSignalSample.Success((float)value, null, at, originKey: "device:" + _output.Id + ":" + _dglab.Snapshot.TargetId + ":" + target.ClientId + ":" + target.SlotId + ":" + path);
            }
            if (path == "connected") return ComputedSignalSample.Success(IsConnected ? 1 : 0, null, nowMs, originKey: "device:" + _output.Id);
            return ComputedSignalSample.Invalid("等待设备反馈 / Waiting for device feedback");
        }
        public async Task StopAsync()
        {
            CancellationTokenSource old;
            lock (_sync)
            {
                Interlocked.Increment(ref _generation); old = _generationCancellation; _generationCancellation = new();
                _pending.Clear(); _events.Clear(); _sent.Clear(); foreach (var route in _routes.Values) { route.QueuedAtMs = 0; route.WaveStartedMs = 0; route.EventHigh = false; }
            }
            old.Cancel();
            await _sendGate.WaitAsync();
            try
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                if (_dglab?.Snapshot.Connected == true)
                {
                    if (_options.ClientId.Length > 0 && _options.SlotId.Length > 0)
                        await Task.WhenAll(_options.Bindings.Select(binding => binding.Channel ?? _options.Channel).Distinct()
                            .Select(channel => _dglab.StopAsync(new(_options.ClientId, _options.SlotId, (DglabChannel)channel), timeout.Token)));
                }
                else if (IsMotion) await _motionStop(_output.Id).WaitAsync(timeout.Token);
                else if (_adapter?.IsConnected == true)
                {
                    foreach (var binding in _options.Bindings)
                        await _adapter.SendAsync(new(_output.Type == OutputDeviceType.Mqtt ? _options.MqttTopicPrefix + binding.Address : binding.Address, binding.StopValue,
                            Enum.Parse<SignalOutputValueType>(binding.ValueType), binding.Id), timeout.Token);
                    await _adapter.StopAsync(timeout.Token);
                }
                if (_recorder is not null)
                {
                    var now = _clock.GetUtcNow().ToUnixTimeMilliseconds();
                    foreach (var binding in _options.Bindings)
                        _recorder.Append(RecordingId(binding), ComputedSignalSample.Invalid("输入已停止 / Input stopped"), null, now);
                    _recorder.Complete(now);
                }
            }
            catch (Exception ex) { _status = "stop-unconfirmed"; _error("[Output] Stop could not complete: " + ex.GetType().Name); }
            finally { _sendGate.Release(); old.Dispose(); }
        }
        public async Task DisconnectAsync()
        {
            await StopAsync();
            await _sendGate.WaitAsync();
            try
            {
                await CloseTransportAsync();
                _faulted = false; _status = "disconnected"; _changed();
            }
            finally { _sendGate.Release(); }
        }
        private async Task CloseTransportAsync()
        {
            if (_adapter is not null) { await _adapter.DisposeAsync(); _adapter = null; }
            if (_dglab is not null) { _dglab.Changed -= _changed; await _dglab.DisposeAsync(); _dglab = null; }
            _recorder?.Dispose(); _recorder = null;
        }
        public async ValueTask DisposeAsync()
        {
            if (_disposed) return; _disposed = true; await DisconnectAsync(); Playback.Pause();
            lock (_sync) { _generationCancellation.Dispose(); foreach (var route in _routes.Values) route.WaitCancellation.Dispose(); }
        }
        private sealed class RouteState(string id, string name)
        {
            public string Id = id, Name = name, Reason = "";
            public bool Valid, Observed, EventHigh;
            public CancellationTokenSource WaitCancellation = new();
            public float? RawValue;
            public double? Value;
            public long LastSentMs, QueuedAtMs, Revision, WaveStartedMs;
        }
        private sealed record Delivery(SignalOutputBinding Binding, ComputedSignalSample Sample, double Value, long AtMs, bool Stop, long Generation, long RouteRevision);
    }
}
