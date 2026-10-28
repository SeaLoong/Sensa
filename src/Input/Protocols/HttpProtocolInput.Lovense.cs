using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace Sensa.Input.Protocols;

public sealed partial class HttpProtocolInput
{
    // Lovense LAN command semantics, not its cloud/QR registration service.
    // https://github.com/lovense/lovense-developer/blob/main/docs/docs/standard-solutions/standard-api.md
    private sealed record Effect(ExternalControlCommand[] Commands, long Started, int Duration, int Running, int Pause)
    {
        public bool IsRunning { get; set; } = true;
    }
    private Effect? _effect;

    private Reply ProcessLovense(string path, string method, JsonElement body, IQueryCollection query, string identity)
    {
        if (path == "/command")
        {
            if (!HttpMethods.IsPost(method)) throw new InputException(405, "The command API requires POST.");
            ValidateObject(body);
            var operation = String(body, "command");
            if (operation == "GetToys") return new(200, new { code = 200, type = "OK", data = new
            {
                toys = JsonSerializer.Serialize(new Dictionary<string, object>
                {
                    [_config.Id] = new { id = _config.Id, name = "Sensa Virtual Device", nickName = _config.Name, status = "1", version = "", capabilities = _config.Features.Select(feature => feature.Actuator).Distinct().ToArray() },
                }), platform = "sensa", appType = "remote",
            } });
            if (operation == "GetToyName") return new(200, new { code = 200, type = "OK", data = new[] { "Sensa Virtual Device" } });
            if (operation != "Function") throw new InputException(400, "Unsupported Lovense command. Use GetToys, GetToyName or Function.");
            if (body.TryGetProperty("apiVer", out _) && Integer(body, "apiVer", 1, 1) != 1) throw new InputException(400, "Only apiVer1 is supported.");
            if (body.TryGetProperty("toy", out var toy) && Text(toy, "toy") != _config.Id) throw new InputException(400, "Unknown toy ID.");
            var action = String(body, "action");
            var duration = body.TryGetProperty("timeSec", out _) ? Seconds(body, "timeSec", allowZero: true) : throw new InputException(400, "timeSec is required.");
            var running = body.TryGetProperty("loopRunningSec", out _) ? Seconds(body, "loopRunningSec", allowZero: false) : 0;
            var pause = body.TryGetProperty("loopPauseSec", out _) ? Seconds(body, "loopPauseSec", allowZero: false) : 0;
            if ((running == 0) != (pause == 0)) throw new InputException(400, "Provide both loopRunningSec and loopPauseSec.");
            var stopPrevious = !body.TryGetProperty("stopPrevious", out _) || Integer(body, "stopPrevious", 0, 1) == 1;
            if (!stopPrevious && _effect is not null) throw new InputException(400, "Concurrent timed Function effects are not supported.");
            if (action == "Stop")
            {
                Acquire(identity);
                _effect = null;
                _sink.Stop(_config.Id, _session!);
                return LovenseOk();
            }
            var commands = ParseLovenseActions(action);
            Acquire(identity);
            if (stopPrevious) { _effect = null; _sink.Stop(_config.Id, _session!); }
            Publish(identity, commands);
            _effect = duration != 0 || running != 0 ? new(commands, _clock.GetTimestamp(), duration, running, pause) : null;
            return LovenseOk();
        }
        // The older public LAN GET API uses v=0..20 and optional t=toy ID.
        if (!HttpMethods.IsGet(method)) throw new InputException(405, "This LAN operation requires GET.");
        if (query.TryGetValue("t", out var id) && id.ToString() != _config.Id) throw new InputException(400, "Unknown toy ID.");
        if (path == "/Stop") { Acquire(identity); _effect = null; _sink.Stop(_config.Id, _session!); return LovenseOk(); }
        if (path is not ("/Vibrate" or "/Vibrate1" or "/Vibrate2" or "/Rotate" or "/RotateClockwise" or "/RotateAntiClockwise"))
            throw new InputException(404, "Unsupported Lovense LAN operation.");
        if (!int.TryParse(query["v"], NumberStyles.None, CultureInfo.InvariantCulture, out var speed) || speed is < 0 or > 20)
            throw new InputException(400, "v must be an integer from 0 to 20.");
        var actuator = path.StartsWith("/Vibrate", StringComparison.Ordinal) ? "Scalar" : "Rotation";
        var featureIndex = path == "/Vibrate2" ? 1 : 0;
        var selected = actuator == "Scalar"
            ? _config.Features.Where(feature => feature.Actuator == "Scalar" && feature.ScalarType == "Vibrate").ElementAtOrDefault(featureIndex)
                ?? throw new InputException(400, "This vibration feature is not configured.")
            : Actuator(actuator, featureIndex);
        Publish(identity, [new(selected.Channel, speed / 20d, Clockwise: path != "/RotateAntiClockwise")]);
        _effect = null;
        return LovenseOk();
    }

    private ExternalControlCommand[] ParseLovenseActions(string action)
    {
        var commands = new Dictionary<string, ExternalControlCommand>(StringComparer.Ordinal);
        int? allStrength = null;
        var entries = action.Split(',');
        if (entries.Length is < 1 or > 16) throw new InputException(400, "Use 1–16 actions.");
        foreach (var entry in entries)
        {
            var pair = entry.Split(':');
            if (pair.Length != 2 || !int.TryParse(pair[1], NumberStyles.None, CultureInfo.InvariantCulture, out var strength) || strength is < 0 or > 20)
                throw new InputException(400, "Actions require an integer strength from 0 to 20.");
            if (pair[0] == "All")
            {
                if (allStrength.HasValue) throw new InputException(400, "Repeated All action.");
                allStrength = strength;
                continue;
            }
            var features = pair[0] switch
            {
                "Vibrate" => _config.Features.Where(feature => feature.Actuator == "Scalar" && feature.ScalarType == "Vibrate").ToArray(),
                "Rotate" => _config.Features.Where(feature => feature.Actuator == "Rotation").ToArray(),
                _ => throw new InputException(400, "Unsupported action. Scalar strength is not a linear position."),
            };
            if (features.Length == 0) throw new InputException(400, "This actuator is not configured.");
            foreach (var feature in features)
                if (!commands.TryAdd(feature.Channel, new(feature.Channel, strength / 20d)))
                    throw new InputException(400, "Repeated or overlapping action channel.");
        }
        if (allStrength is { } all)
            foreach (var feature in _config.Features.Where(feature => feature.Actuator == "Rotation" || feature.Actuator == "Scalar" && feature.ScalarType == "Vibrate"))
                commands.TryAdd(feature.Channel, new(feature.Channel, all / 20d));
        if (commands.Count == 0) throw new InputException(400, "No compatible actuators are configured.");
        return commands.Values.ToArray();
    }

    private void TickLovense()
    {
        if (_effect is not { } effect || _session is null) return;
        var elapsed = _clock.GetElapsedTime(effect.Started).TotalMilliseconds;
        if (effect.Duration != 0 && elapsed >= effect.Duration)
        {
            _effect = null;
            foreach (var command in effect.Commands) _sink.Stop(_config.Id, _session, command.Channel);
            return;
        }
        // A positive timeSec is a bounded task accepted by this virtual device,
        // not a stream requiring an external heartbeat. This also retains the
        // lease during loop pauses. Indefinite effects never self-renew.
        if (effect.Duration > 0) _sink.Heartbeat(_config.Id, _session);
        if (effect.Running == 0) return;
        var running = elapsed % (effect.Running + effect.Pause) < effect.Running;
        if (running == effect.IsRunning) return;
        effect.IsRunning = running;
        var commands = running ? effect.Commands : effect.Commands.Select(command => command with { Value = 0 }).ToArray();
        if (!_sink.Publish(_config.Id, _session, commands, out _)) Release();
    }
    private bool FiniteLovenseEffectActive() => _effect is { Duration: > 0 } effect
        && _clock.GetElapsedTime(effect.Started).TotalMilliseconds < effect.Duration;
    private static int Seconds(JsonElement body, string name, bool allowZero)
    {
        var seconds = Number(body, name, 0, 600);
        if (seconds == 0 && allowZero) return 0;
        if (seconds <= 1) throw new InputException(400, name + " must be greater than one second, or zero for indefinite timeSec.");
        return checked((int)Math.Round(seconds * 1000));
    }
    private static Reply LovenseOk() => new(200, new { code = 200, type = "OK" });
}
