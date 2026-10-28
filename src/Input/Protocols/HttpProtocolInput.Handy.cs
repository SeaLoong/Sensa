using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace Sensa.Input.Protocols;

public sealed partial class HttpProtocolInput
{
    // RESTv2 (firmware3) percent-position/duration semantics. This is a named virtual device,
    // not a claim of manufacturer cloud registration or physical position feedback.
    // https://www.handyfeeling.com/api/handy-rest/v2/docs/spec.yaml
    private int _handyMode;
    private double _slideMin, _slideMax = 100;
    private int _handyOffset;
    private double _handyVelocity;
    private bool _hampActive;
    private CommandedMotion? _handyMotion;
    private long? _handyFiniteMoveAt;
    private int _handyFiniteMoveDuration;
    private sealed record CommandedMotion(double? Start, double Target, long At, int Duration);

    private Reply ProcessHandy(string path, string method, JsonElement body, string identity)
    {
        path = HandyPath(path);
        if (HttpMethods.IsGet(method))
        {
            return path switch
            {
                "/connected" => new(200, new { connected = _config.Enabled }),
                "/info" => new(200, new { fwVersion = "3.3.0", fwStatus = 0, hwVersion = "virtual", model = "Sensa Virtual Device", deviceName = _config.Name, virtualDevice = true }),
                "/mode" => new(200, new { result = 0, mode = _handyMode }),
                "/slide" => new(200, new { result = 0, min = _slideMin, max = _slideMax }),
                "/settings" => new(200, new { result = 0, slideMin = _slideMin, slideMax = _slideMax }),
                "/servertime" => new(200, new { serverTime = _clock.GetUtcNow().ToUnixTimeMilliseconds() }),
                "/hstp/time" => new(200, new { result = 0, time = _clock.GetUtcNow().ToUnixTimeMilliseconds() }),
                "/hstp/offset" => new(200, new { result = 0, offset = _handyOffset }),
                "/hamp/velocity" => new(200, new { result = 0, velocity = _handyVelocity }),
                "/hssp/loop" => new(200, new { result = 0, activated = _scriptLoop }),
                "/hssp/state" => new(200, new { result = 0, state = _scriptPlaying ? 4 : _handyScript is not null ? 3 : 0 }),
                "/hamp/state" => new(200, new { result = 0, state = _hampActive ? 2 : 1 }),
                _ => throw new InputException(404, "Unsupported Handy RESTv2 query."),
            };
        }
        if (!HttpMethods.IsPut(method)) throw new InputException(405, "Handy RESTv2 mutations require PUT.");
        switch (path)
        {
            case "/mode":
                var mode = Integer(body, "mode", 0, 2);
                Acquire(identity);
                _effect = null;
                CancelHandyPlayback();
                _hampActive = false;
                FreezeHandyPosition();
                _sink.Stop(_config.Id, _session!);
                _handyMode = mode;
                return HandyOk();
            case "/slide":
                ValidateObject(body);
                if (body.TryGetProperty("fixed", out _) && Bool(body, "fixed"))
                    throw new InputException(400, "Fixed-width slide translation is not supported; specify min and max.");
                var minimum = body.TryGetProperty("min", out _) ? Number(body, "min", 0, 100) : _slideMin;
                var maximum = body.TryGetProperty("max", out _) ? Number(body, "max", 0, 100) : _slideMax;
                if (minimum >= maximum) throw new InputException(400, "The slide minimum must be less than its maximum.");
                Acquire(identity);
                _hampActive = false;
                FreezeHandyPosition();
                _sink.Stop(_config.Id, _session!);
                _slideMin = minimum;
                _slideMax = maximum;
                return new(200, new { result = 0, min = minimum, max = maximum });
            case "/hstp/offset":
                var offset = Integer(body, "offset", -600000, 600000);
                Acquire(identity);
                _handyOffset = offset;
                return HandyOk();
            case "/hdsp/xpt":
                RequireMode(2);
                var position = Number(body, "position", 0, 100) / 100;
                var duration = Integer(body, "duration", 0, 600000);
                ValidateHandyFlags(body);
                Acquire(identity);
                _hampActive = false;
                SendHandyPosition(identity, position, duration, finiteExternalMove: true);
                // Accepted target is not an assertion that real hardware reached that target.
                return new(200, new { result = 1 });
            case "/hdsp/xpvp":
                RequireMode(2);
                position = Number(body, "position", 0, 100) / 100;
                var speed = Number(body, "velocity", 0, 100);
                ValidateHandyFlags(body);
                Acquire(identity);
                _hampActive = false;
                if (speed == 0) { FreezeHandyPosition(); _sink.Stop(_config.Id, _session!); return new(200, new { result = 3 }); }
                duration = TravelDuration(position, speed);
                SendHandyPosition(identity, position, duration, finiteExternalMove: true);
                return new(200, new { result = 1 });
            case "/hamp/velocity":
                RequireMode(0);
                var velocity = Number(body, "velocity", 0, 100);
                if (velocity > 0 && (_slideMax - _slideMin) / 100 / (_config.MaxSpeedPerSecond * velocity / 100) * 1000 > 600000)
                    throw new InputException(400, "A full alternating sweep exceeds the duration limit.");
                Acquire(identity);
                if (_hampActive && _handyMotion is { } active)
                {
                    if (velocity == 0)
                    {
                        _hampActive = false;
                        FreezeHandyPosition();
                        _sink.Stop(_config.Id, _session!);
                    }
                    else SendHandyPosition(identity, active.Target, TravelDuration(active.Target, velocity));
                }
                _handyVelocity = velocity;
                return new(200, new { result = 0, velocity });
            case "/hamp/start":
                RequireMode(0);
                Acquire(identity);
                if (_handyVelocity == 0) return new(200, new { result = 1, state = 1 });
                if ((_slideMax - _slideMin) / 100 / (_config.MaxSpeedPerSecond * _handyVelocity / 100) * 1000 > 600000)
                    throw new InputException(400, "A full alternating sweep exceeds the duration limit.");
                var current = CommandedHandyPosition() ?? throw new InputException(409, "Establish a commanded position with HDSP before starting a speed trajectory.");
                var target = current <= (_slideMin + _slideMax) / 200 ? _slideMax / 100 : _slideMin / 100;
                duration = TravelDuration(target, _handyVelocity);
                SendHandyPosition(identity, target, duration);
                _hampActive = true;
                return new(200, new { result = 0, state = 2 });
            case "/hamp/stop":
                RequireMode(0);
                Acquire(identity);
                _hampActive = false;
                FreezeHandyPosition();
                _sink.Stop(_config.Id, _session!);
                return new(200, new { result = 0, state = 1 });
            case "/hssp/play":
                PlayHandyScript(body, identity);
                return HandyOk();
            case "/hssp/loop":
                RequireMode(1);
                var loop = Bool(body, "activated");
                Acquire(identity);
                _scriptLoop = loop;
                return HandyOk();
            case "/hssp/stop":
                RequireMode(1);
                Acquire(identity);
                CancelHandyPlayback();
                _hampActive = false;
                FreezeHandyPosition();
                _sink.Stop(_config.Id, _session!);
                return HandyOk();
            default: throw new InputException(404, "Unsupported Handy RESTv2 operation.");
        }
    }

    private static string HandyPath(string path)
    {
        foreach (var prefix in new[] { "/api/handy/v2", "/api/handy-rest/v2" })
            if (path.StartsWith(prefix + "/", StringComparison.Ordinal)) return path[prefix.Length..];
        return path;
    }
    private void RequireMode(int mode)
    {
        if (_handyMode != mode) throw new InputException(409, "Select the matching Handy operation mode first.");
    }
    private static void ValidateHandyFlags(JsonElement body)
    {
        if (body.TryGetProperty("stopOnTarget", out _)) _ = Bool(body, "stopOnTarget");
        if (body.TryGetProperty("immediateResponse", out _)) _ = Bool(body, "immediateResponse");
    }
    private int TravelDuration(double target, double percentSpeed)
    {
        var current = CommandedHandyPosition() ?? throw new InputException(409, "A speed command needs a known commanded starting position.");
        var speed = _config.MaxSpeedPerSecond * percentSpeed / 100;
        if (!double.IsFinite(speed) || speed <= 0) throw new InputException(400, "Configure a positive virtual full-strokes-per-second speed.");
        var duration = Math.Ceiling(Math.Abs(Math.Clamp(target, _slideMin / 100, _slideMax / 100) - current) / speed * 1000);
        if (duration > 600000) throw new InputException(400, "The commanded movement exceeds the duration limit.");
        return (int)duration;
    }
    private double? CommandedHandyPosition()
    {
        if (_handyMotion is not { } motion) return null;
        var elapsed = _clock.GetElapsedTime(motion.At).TotalMilliseconds;
        if (elapsed >= motion.Duration) return motion.Target;
        return motion.Start is { } start ? start + (motion.Target - start) * Math.Clamp(elapsed / motion.Duration, 0, 1) : null;
    }
    private void FreezeHandyPosition()
    {
        _handyFiniteMoveAt = null;
        var position = CommandedHandyPosition();
        _handyMotion = position is { } value ? new(value, value, _clock.GetTimestamp(), 0) : null;
    }
    private void SendHandyPosition(string identity, double position, int duration, bool finiteExternalMove = false)
    {
        var current = CommandedHandyPosition();
        var target = Math.Clamp(position, _slideMin / 100, _slideMax / 100);
        Publish(identity, [new(Actuator("Position").Channel, target, duration)]);
        var now = _clock.GetTimestamp();
        _handyMotion = new(current, target, now, duration);
        // Only an externally accepted HDSP move owns this finite deadline. HAMP's
        // internally generated sweeps cannot extend a disappeared client's stream lease.
        _handyFiniteMoveAt = finiteExternalMove ? now : null;
        _handyFiniteMoveDuration = duration;
    }
    private void TickHandy()
    {
        if (!_hampActive || _session is null || _handyMotion is not { } previous
            || _clock.GetElapsedTime(previous.At).TotalMilliseconds < previous.Duration) return;
        var target = previous.Target >= (_slideMin + _slideMax) / 200 ? _slideMin / 100 : _slideMax / 100;
        var duration = TravelDuration(target, _handyVelocity);
        if (!_sink.Publish(_config.Id, _session, [new(Actuator("Position").Channel, target, duration)], out _)) { Release(); return; }
        _handyMotion = new(previous.Target, target, _clock.GetTimestamp(), duration);
    }
    private static Reply HandyOk() => new(200, new { result = 0 });
}
