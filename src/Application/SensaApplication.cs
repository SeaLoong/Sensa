using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sensa.Configuration;
using Sensa.Hosting;
using Sensa.Input.Script;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Recording;
using Sensa.Runtime;
using Sensa.Outputs.Adapters;

namespace Sensa.Application;

public sealed record CommandResult(int StatusCode, object Data)
{
    public bool Success => StatusCode is >= 200 and < 300;
    public static CommandResult Ok(object data) => new(200, data);
    public static CommandResult Error(int statusCode, string message) => new(statusCode, new { ok = false, error = message });
}

public sealed record ApplicationHost(
    Func<object> Overview,
    Func<object> Logs,
    Func<object> SerialPorts,
    Func<AppConfig, Task<AppConfig>> UpdateConfiguration,
    Func<string?, object> SelectOscSource,
    Func<Task<object>> RefreshOscQuery,
    Action SyncOsc,
    Func<bool> IsOscListening,
    Action NotifyStateChanged,
    Action<string> Log,
    Action<string> LogDebug,
    Action<string> LogError);

/// <summary>
/// Coordinates user commands once for both transport adapters.
/// 同时为两种传输适配器集中协调用户命令。
/// </summary>
public sealed class SensaApplication(
    AppConfig config,
    MotionRuntime runtime,
    FunscriptPlayer scriptPlayer,
    MotionRecorder recorder,
    OutputCoordinator outputs,
    ApplicationHost host)
{
    private const int ManualDefaultSpeed = 999;
    private const int ManualDefaultIntervalMs = 100;
    private const int ManualIntervalMaxMs = 1000;
    private static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();

    public async Task<CommandResult> ExecuteAsync(string method, string path, JsonElement? body = null)
    {
        method = method.ToUpperInvariant();
        try
        {
            object result;
            switch ((method, path))
            {
                case ("GET", "/api/config"):
                    result = config;
                    break;
                case ("PUT", "/api/config"):
                    result = await host.UpdateConfiguration(Read<AppConfig>(body)).ConfigureAwait(false);
                    break;
                case ("GET", "/api/state/overview"):
                    result = host.Overview();
                    break;
                case ("GET", "/api/state/logs"):
                    result = host.Logs();
                    break;
                case ("GET", "/api/meta/midi-ports"):
                    result = MidiOutputTransport.ListPorts();
                    break;
                case ("GET", "/api/output/recordings"):
                    result = SignalSessionRecorder.ListFiles();
                    break;
                case ("POST", "/api/output/replay/load"):
                case ("POST", "/api/output/replay/play"):
                case ("POST", "/api/output/replay/pause"):
                case ("POST", "/api/output/replay/seek"):
                {
                    var request = Read<SignalReplayRequest>(body);
                    var action = path.Split('/')[^1];
                    if (action == "load") { runtime.SetInputActive(false); await outputs.SignalOutputs.StopAsync(); }
                    runtime.ResetSignalProcessing();
                    result = outputs.SignalOutputs.ReplayAction(request.OutputId, action, request.FileName, request.TimeMs);
                    break;
                }
                case ("GET", "/api/meta/serial-ports"):
                    result = host.SerialPorts();
                    break;
                case ("PUT", "/api/input/osc/source"):
                    result = host.SelectOscSource(Read<OscSourceSelectionRequest>(body).SourceKey);
                    break;
                case ("POST", "/api/input/oscquery/refresh"):
                    result = await host.RefreshOscQuery().ConfigureAwait(false);
                    break;
                case ("PUT", "/api/input/active"):
                    RequireProperty(body, "active");
                    result = SetInputActiveCore(Read<InputActiveRequest>(body).Active);
                    break;
                case ("PUT", "/api/input/mode"):
                    RequireProperty(body, "mode");
                    result = SetInputModeCore(Read<InputModeRequest>(body).Mode);
                    break;
                case ("PUT", "/api/input/manual"):
                    result = ApplyManualInputCore(Read<ManualInputRequest>(body));
                    break;
                case ("DELETE", "/api/input/manual"):
                    result = ClearManualInputCore();
                    break;
                case ("POST", "/api/control/runtime/emergency-stop"):
                case ("POST", "/api/control/loop/emergency-stop"):
                    runtime.EmergencyStop();
                    result = new { ok = true, runtime.IsEmergency };
                    break;
                case ("POST", "/api/control/runtime/clear-emergency"):
                case ("POST", "/api/control/loop/clear-emergency"):
                    runtime.ClearEmergency();
                    result = new { ok = true, runtime.IsEmergency };
                    break;
                case ("POST", "/api/input/script/load"):
                    result = await LoadScriptFromTextCoreAsync(Read<ScriptUploadRequest>(body)).ConfigureAwait(false);
                    break;
                case ("POST", "/api/input/script/load-recording"):
                    result = await LoadScriptFromRecordingCoreAsync(Read<LoadRecordingScriptRequest>(body)).ConfigureAwait(false);
                    break;
                case ("POST", "/api/input/script/play"):
                    result = PlayScriptCore(Read<ScriptPlaybackRequest>(body));
                    break;
                case ("POST", "/api/input/script/pause"):
                    result = PauseScriptCore();
                    break;
                case ("POST", "/api/input/script/stop"):
                    result = StopScriptCore();
                    break;
                case ("PUT", "/api/input/script/configure"):
                    result = ConfigureScriptCore(Read<ScriptConfigureRequest>(body));
                    break;
                case ("PUT", "/api/input/script/seek"):
                    result = SeekScriptCore(Read<ScriptSeekRequest>(body));
                    break;
                case ("POST", "/api/input/script/action-prev"):
                    result = StepScriptActionCore(-1);
                    break;
                case ("POST", "/api/input/script/action-next"):
                    result = StepScriptActionCore(1);
                    break;
                case ("DELETE", "/api/input/script"):
                    result = ClearScriptCore();
                    break;
                case ("POST", "/api/recording/start"):
                case ("POST", "/api/recording/stop"):
                case ("POST", "/api/recording/export"):
                    result = RecordingAction(path.Split('/')[^1]);
                    break;
                default:
                    if (method != "POST")
                        return UnknownCommand(method, path);
                    var outputResult = await OutputActionAsync(path).ConfigureAwait(false);
                    if (outputResult is null)
                        return UnknownCommand(method, path);
                    if (outputResult.Success)
                        host.NotifyStateChanged();
                    return outputResult;
            }

            if (method != "GET")
                host.NotifyStateChanged();
            return CommandResult.Ok(result);
        }
        catch (Exception ex)
        {
            host.LogError($"[Command] {method} {path}: {ex.Message}");
            return CommandResult.Error(400, ex.Message);
        }
    }

    public async Task<CommandResult> LoadScriptAsync(string fileName, Stream content, bool loop, double speed)
    {
        try
        {
            var result = await LoadScriptFromStreamCoreAsync(fileName, content, loop, speed).ConfigureAwait(false);
            host.NotifyStateChanged();
            return CommandResult.Ok(result);
        }
        catch (Exception ex)
        {
            host.LogError($"[Input/Script] Load failed / 加载失败: {ex.Message}");
            return CommandResult.Error(400, ex.Message);
        }
    }

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }

    private static T Read<T>(JsonElement? body)
    {
        if (!body.HasValue || body.Value.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException("缺少请求正文。 / Missing request body.");
        return body.Value.Deserialize<T>(JsonOptions)
            ?? throw new InvalidOperationException("请求正文无效。 / Invalid request body.");
    }

    private static void RequireProperty(JsonElement? body, string name)
    {
        if (!body.HasValue || body.Value.ValueKind != JsonValueKind.Object || !body.Value.TryGetProperty(name, out _))
            throw new InvalidOperationException($"缺少字段 / Missing field: {name}");
    }

    private static CommandResult UnknownCommand(string method, string path) =>
        CommandResult.Error(404, $"未知命令 / Unknown command: {method} {path}");

    private object RecordingAction(string action)
    {
        if (action == "start") recorder.Start();
        else recorder.Stop();
        return action == "export"
            ? new { fileName = $"sensa-{DateTime.Now:yyyyMMdd-HHmmss}.funscript", content = FunscriptExporter.Serialize(recorder) }
            : (object)new { recorder.IsActive, recorder.FrameCount };
    }

    private async Task<CommandResult?> OutputActionAsync(string path)
    {
        var segments = path.Split('/');
        if (segments.Length == 6 && segments[1] == "api" && segments[2] == "control" && segments[3] == "output")
        {
            var outputId = segments[4];
            var action = segments[5];
            if (action is not ("connect" or "disconnect" or "scan-start" or "scan-stop" or "device-info-refresh"))
                return null;
            var output = config.FindOutput(outputId);
            if (output is null)
                return CommandResult.Error(404, "输出不存在。 / Output does not exist.");

            switch (action)
            {
                case "connect":
                    var connected = await outputs.ConnectAsync(outputId).ConfigureAwait(false);
                    return CommandResult.Ok(new
                    {
                        ok = connected,
                        connected = outputs.IsConnected(outputId),
                        isConnected = outputs.IsConnected(outputId),
                        outputId,
                        type = output.Type,
                        message = connected ? $"{output.Name} 已连接。 / Connected." : $"{output.Name} 连接失败。 / Connection failed.",
                    });
                case "disconnect":
                    await outputs.DisconnectAsync(outputId).ConfigureAwait(false);
                    return CommandResult.Ok(new
                    {
                        ok = true,
                        connected = outputs.IsConnected(outputId),
                        isConnected = outputs.IsConnected(outputId),
                        outputId,
                        type = output.Type,
                        message = $"{output.Name} 已断开。 / Disconnected.",
                    });
                case "scan-start":
                case "scan-stop":
                    if (output.Type != OutputDeviceType.Intiface)
                        return CommandResult.Error(400, "只有 Intiface 输出支持扫描。 / Only Intiface outputs support scanning.");
                    if (action == "scan-start") await outputs.StartScanAsync(outputId).ConfigureAwait(false);
                    else await outputs.StopScanAsync(outputId).ConfigureAwait(false);
                    break;
                case "device-info-refresh":
                    if (!OutputConfigHelpers.IsTCodeOutput(output.Type))
                        return CommandResult.Error(400, "只有 TCode 输出支持设备信息。 / Only TCode outputs support device information.");
                    await outputs.RefreshTCodeDeviceInfoAsync(outputId).ConfigureAwait(false);
                    break;
            }
            return CommandResult.Ok(new { ok = true, outputId });
        }

        if (segments.Length != 5 || segments[1] != "api" || segments[2] != "control")
            return null;
        var type = segments[3] switch
        {
            "tcode" => (OutputDeviceType?)OutputDeviceType.TCodeSerial,
            "udp" => OutputDeviceType.TCodeUdp,
            "tcp" => OutputDeviceType.TCodeTcp,
            "intiface" => OutputDeviceType.Intiface,
            _ => null,
        };
        if (!type.HasValue)
            return null;
        var primary = config.GetPrimaryOutput(type.Value);
        switch (segments[4])
        {
            case "connect":
                var connected = await outputs.ConnectPrimaryAsync(type.Value).ConfigureAwait(false);
                return CommandResult.Ok(new
                {
                    ok = connected,
                    connected = outputs.IsConnected(primary?.Id),
                    message = connected ? $"{segments[3]} 已连接。 / Connected." : $"{segments[3]} 连接失败，请检查配置和目标。 / Connection failed; check configuration and target.",
                });
            case "disconnect":
                await outputs.DisconnectPrimaryAsync(type.Value).ConfigureAwait(false);
                return CommandResult.Ok(new { ok = true, connected = outputs.IsConnected(primary?.Id), message = $"{segments[3]} 已断开。 / Disconnected." });
            case "scan-start" when type == OutputDeviceType.Intiface:
                await outputs.StartPrimaryScanAsync(type.Value).ConfigureAwait(false);
                return CommandResult.Ok(new { ok = true });
            case "scan-stop" when type == OutputDeviceType.Intiface:
                await outputs.StopPrimaryScanAsync(type.Value).ConfigureAwait(false);
                return CommandResult.Ok(new { ok = true });
            default:
                return null;
        }
    }

    object SetInputActiveCore(bool active)
    {
        runtime.SetInputActive(active);
        host.SyncOsc();
        return new { ok = true, active = runtime.InputActive, oscListening = host.IsOscListening() };
    }

    object SetInputModeCore(string modeText)
    {
        if (!Enum.TryParse<RuntimeInputMode>(modeText, ignoreCase: true, out var mode) || !Enum.IsDefined(mode))
            throw new InvalidOperationException($"未知输入模式 / Unknown input mode: {modeText}");

        runtime.SetInputMode(mode);
        host.SyncOsc();
        return new { ok = true, mode = runtime.CurrentInputMode.ToString().ToLowerInvariant(), oscListening = host.IsOscListening() };
    }

    object ApplyManualInputCore(ManualInputRequest request)
    {
        var requestedCommandMode = request.MotionMode;
        var requestedMotionValue = NormalizeManualMotionValue(requestedCommandMode, request.MotionValue);
        var frame = new MotionFrame
        {
            L0 = NormalizeManualInputValue(request.L0),
            R0 = NormalizeManualInputValue(request.R0),
            R1 = NormalizeManualInputValue(request.R1),
            R2 = NormalizeManualInputValue(request.R2),
            L1 = NormalizeManualInputValue(request.L1),
            L2 = NormalizeManualInputValue(request.L2),
            V0 = NormalizeManualInputValue(request.V0),
            V1 = NormalizeManualInputValue(request.V1),
            V2 = NormalizeManualInputValue(request.V2),
            A0 = NormalizeManualInputValue(request.A0),
            A1 = NormalizeManualInputValue(request.A1),
            A2 = NormalizeManualInputValue(request.A2),
            RequestedCommandMode = requestedCommandMode,
            RequestedMotionValue = requestedMotionValue,
        };

        if (request.Enabled)
        {
            runtime.SetManualOverride(frame);
            if (runtime.CurrentInputMode != RuntimeInputMode.Combined) runtime.SetInputMode(RuntimeInputMode.Manual);
            host.LogDebug($"[Input/Manual] 手动原值 / raw L0={request.L0} R0={request.R0} R1={request.R1} R2={request.R2} L1={request.L1} L2={request.L2} V0={request.V0} V1={request.V1} V2={request.V2} A0={request.A0} A1={request.A1} A2={request.A2} motionMode={(requestedCommandMode?.ToString() ?? "profile")} motionValue={(requestedMotionValue?.ToString() ?? "profile")}");
        }
        else
        {
            runtime.ClearManualOverride();
            host.LogDebug("[Input/Manual] 已清除。 / Cleared.");
        }
        return new
        {
            ok = true,
            inputMode = runtime.CurrentInputMode.ToString().ToLowerInvariant(),
            command = runtime.ManualOverrideCommand,
        };
    }

    object ClearManualInputCore()
    {
        runtime.ClearManualOverride();
        return new
        {
            ok = true,
            inputMode = runtime.CurrentInputMode.ToString().ToLowerInvariant(),
        };
    }

    async Task<object> LoadScriptFromStreamCoreAsync(string fileName, Stream content, bool loop, double speed)
    {
        runtime.SetInputActive(false);
        scriptPlayer.Load(fileName, content);
        scriptPlayer.Configure(loop: loop, speed: speed);
        if (runtime.CurrentInputMode != RuntimeInputMode.Combined) runtime.SetInputMode(RuntimeInputMode.Script);
        host.Log($"[Input/Script] 已加载 / Loaded: {fileName}");

        return await Task.FromResult(new
        {
            ok = true,
            inputMode = runtime.CurrentInputMode.ToString().ToLowerInvariant(),
            script = scriptPlayer.GetSnapshot(),
        }).ConfigureAwait(false);
    }

    async Task<object> LoadScriptFromTextCoreAsync(ScriptUploadRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FileName))
            throw new InvalidOperationException("请先选择脚本文件。 / Select a script file first.");
        if (string.IsNullOrWhiteSpace(request.Content))
            throw new InvalidOperationException("脚本内容为空。 / Script content is empty.");

        var buffer = Encoding.UTF8.GetBytes(request.Content);
        await using var stream = new MemoryStream(buffer, writable: false);
        return await LoadScriptFromStreamCoreAsync(request.FileName, stream, request.Loop ?? false, request.Speed ?? 1.0).ConfigureAwait(false);
    }

    async Task<object> LoadScriptFromRecordingCoreAsync(LoadRecordingScriptRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FileName) || request.FileName.Length > 255
            || Path.GetExtension(request.FileName) != ".funscript")
            throw new ArgumentException("请选择已完成的 Funscript 录制 / Choose a completed Funscript recording.");
        var file = SignalSessionRecorder.ResolveFile(request.FileName);
        if (!File.Exists(file))
            throw new ArgumentException("录制文件尚未完成或已不存在 / The recording is unfinished or no longer exists.");
        await using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (stream.Length > SignalSessionRecorder.MaximumBytes)
            throw new ArgumentException("录制文件超过 64 MiB / The recording exceeds 64 MiB.");
        var settings = scriptPlayer.GetSnapshot();
        return await LoadScriptFromStreamCoreAsync(request.FileName, stream, settings.Loop, settings.Speed).ConfigureAwait(false);
    }

    object PlayScriptCore(ScriptPlaybackRequest request)
    {
        if (runtime.CurrentInputMode != RuntimeInputMode.Combined) runtime.SetInputMode(RuntimeInputMode.Script);
        runtime.ResetSignalProcessing();
        var snapshot = scriptPlayer.Play(request.Restart, request.Loop, request.Speed);
        host.Log($"[Input/Script] 已开始播放 / Playback started: {snapshot.FileName}");
        return new
        {
            ok = true,
            inputMode = runtime.CurrentInputMode.ToString().ToLowerInvariant(),
            script = snapshot,
        };
    }

    object PauseScriptCore()
    {
        runtime.ResetSignalProcessing();
        var snapshot = scriptPlayer.Pause();
        host.Log("[Input/Script] 已暂停。 / Playback paused.");
        return new { ok = true, script = snapshot };
    }

    object StopScriptCore()
    {
        runtime.ResetSignalProcessing();
        var snapshot = scriptPlayer.Stop();
        host.Log("[Input/Script] 已停止。 / Playback stopped.");
        return new { ok = true, script = snapshot };
    }

    object ConfigureScriptCore(ScriptConfigureRequest request)
    {
        var snapshot = scriptPlayer.Configure(request.Loop, request.Speed, request.UpdateLoopRange, request.LoopStartMs, request.LoopEndMs);
        var loopRangeText = snapshot.LoopRangeActive
            ? $"{snapshot.LoopStartMs ?? 0}ms-{snapshot.LoopEndMs ?? 0}ms"
            : "full";
        host.LogDebug($"[Input/Script] 设置已更新 / Settings updated: loop={snapshot.Loop} speed={snapshot.Speed:0.##}x range={loopRangeText}");
        return new { ok = true, script = snapshot };
    }

    object SeekScriptCore(ScriptSeekRequest request)
    {
        runtime.ResetSignalProcessing();
        var snapshot = scriptPlayer.Seek(request.PositionMs);
        host.LogDebug($"[Input/Script] 跳转 / Seek: {snapshot.PositionMs}ms");
        return new { ok = true, script = snapshot };
    }

    object StepScriptActionCore(int direction)
    {
        var snapshot = scriptPlayer.StepAction(direction);
        host.LogDebug($"[Input/Script] 关键帧步进 / Step {(direction >= 0 ? "next" : "previous")} action: {snapshot.PositionMs}ms");
        return new { ok = true, script = snapshot };
    }

    object ClearScriptCore()
    {
        var snapshot = scriptPlayer.Clear();
        host.Log("[Input/Script] 已清除当前脚本。 / Cleared current script.");
        return new { ok = true, script = snapshot };
    }


    private static float NormalizeManualInputValue(int raw) => Math.Clamp(raw, 0, 999) / 1000f;

    private static int? NormalizeManualMotionValue(TCodeCommandMode? mode, int? rawValue)
    {
        if (!mode.HasValue)
        {
            var resolvedSpeed = rawValue is > 0 ? rawValue.Value : ManualDefaultSpeed;
            return Math.Clamp(resolvedSpeed, 1, 999);
        }

        var resolvedMode = mode.Value;

        if (resolvedMode == TCodeCommandMode.None)
            return null;

        if (resolvedMode == TCodeCommandMode.Interval)
        {
            var requested = rawValue is > 0 ? rawValue.Value : ManualDefaultIntervalMs;
            return Math.Clamp(requested, 1, ManualIntervalMaxMs);
        }

        var requestedSpeed = rawValue is > 0 ? rawValue.Value : ManualDefaultSpeed;

        return Math.Clamp(requestedSpeed, 1, 999);
    }


}

public sealed record SignalReplayRequest(string OutputId, string? FileName = null, long TimeMs = 0);
public sealed record LoadRecordingScriptRequest(string FileName);
