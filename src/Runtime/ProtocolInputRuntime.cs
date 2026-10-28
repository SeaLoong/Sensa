using Sensa.Configuration;
using Sensa.Input.Protocols;
using Sensa.Motion;

namespace Sensa.Runtime;

public sealed partial class MotionRuntime
{
    public ExternalControlStore? ExternalControls { get; private set; }
    private sealed record ProtocolWork(ExternalControlBatch? Batch, ExternalControlCommand? Command,
        string InputId, string? StopChannel, long Sequence, long Generation);
    private readonly Dictionary<string, ProtocolWork> _protocolPending = new(StringComparer.Ordinal);
    private bool _protocolWorkerRunning;

    public void AttachExternalControls(ExternalControlStore controls)
    {
        if (ExternalControls is not null) throw new InvalidOperationException("External controls are already attached.");
        ExternalControls = controls;
        controls.CommandsReceived += ReceiveProtocolCommands;
        controls.Stopped += ReceiveProtocolStop;
    }

    private void ReceiveProtocolCommands(ExternalControlBatch batch)
    {
        if (!CanSend || _inputMode is not (RuntimeInputMode.Protocol or RuntimeInputMode.Combined)) return;
        var input = _config.ProtocolInputs.FirstOrDefault(input => input.Id == batch.InputId && input.Enabled && input.RouteToMotion);
        if (input is null) return;
        lock (_sync)
        {
            foreach (var command in batch.Commands)
                if (input.Features.Any(feature => feature.Channel == command.Channel && feature.TargetAxis.Length > 0))
                    _protocolPending[batch.InputId + "/" + command.Channel] = new(batch, command, batch.InputId, null, batch.Sequence, Interlocked.Read(ref _generation));
            StartProtocolWorker();
        }
    }

    private void ReceiveProtocolStop(string inputId, string? channel, long sequence)
    {
        if (!CanRouteSignals || _inputMode is not (RuntimeInputMode.Protocol or RuntimeInputMode.Combined)) return;
        var input = _config.ProtocolInputs.FirstOrDefault(input => input.Id == inputId && input.RouteToMotion);
        if (input is null) return;
        (_output as Sensa.Outputs.OutputCoordinator)?.CancelPendingVendorCommands();
        lock (_sync)
        {
            foreach (var key in _protocolPending.Where(pair => pair.Value.InputId == inputId
                && (channel is null || pair.Value.Command?.Channel == channel)).Select(pair => pair.Key).ToArray())
                _protocolPending.Remove(key);
            _protocolPending[inputId + "/!stop"] = new(null, null, inputId, channel, sequence, Interlocked.Read(ref _generation));
            StartProtocolWorker();
        }
    }

    // One owner sends one channel at a time. Coalescing is per channel so a newer
    // L0 target never discards an independent R0 target or its travel duration.
    private void StartProtocolWorker()
    {
        if (_protocolWorkerRunning || _protocolPending.Count == 0) return;
        _protocolWorkerRunning = true;
        _ = Task.Run(async () =>
        {
            while (true)
            {
                await _sendGate.WaitAsync().ConfigureAwait(false);
                try
                {
                    ProtocolWork work;
                    lock (_sync)
                    {
                        if (_protocolPending.Count == 0) { _protocolWorkerRunning = false; return; }
                        var first = _protocolPending.OrderBy(pair => pair.Value.Sequence).First(); work = first.Value; _protocolPending.Remove(first.Key);
                    }
                    if (!CanSend || work.Generation != Interlocked.Read(ref _generation) || ExternalControls is null) continue;
                    if (work.Command is null)
                    {
                        _forceNextFrame = true; _appliedGeneration = -1; await StopOutputsAsync().ConfigureAwait(false);
                        continue;
                    }
                    if (work.Batch is null || !ExternalControls.IsCurrent(work.Batch, work.Command.Channel)) continue;
                    var feature = _config.ProtocolInputs.FirstOrDefault(input => input.Id == work.InputId)?.Features
                        .FirstOrDefault(feature => feature.Channel == work.Command.Channel);
                    if (feature is null || !Enum.TryParse<MotionAxis>(feature.TargetAxis, out var axis)) continue;
                    var patch = new MotionPatch(); patch.Set(axis, (float)work.Command.Value);
                    _forceNextFrame = true;
                    await ApplyPatchCoreAsync(patch, "Protocol/" + work.InputId,
                        work.Command.DurationMs > 0 ? TCodeCommandMode.Interval : TCodeCommandMode.None,
                        work.Command.DurationMs > 0 ? work.Command.DurationMs : null, new HashSet<MotionAxis> { axis }).ConfigureAwait(false);
                }
                catch (Exception error) { OnLog?.Invoke("[Protocol input] " + error.GetType().Name); }
                finally { _sendGate.Release(); }
            }
        });
    }

    private void ResetProtocolCommands()
    {
        ExternalControls?.ClearCommands();
        lock (_sync) _protocolPending.Clear();
    }

    private void DetachExternalControls()
    {
        if (ExternalControls is null) return;
        ExternalControls.CommandsReceived -= ReceiveProtocolCommands;
        ExternalControls.Stopped -= ReceiveProtocolStop;
        ResetProtocolCommands();
    }
}
