using System.Text.Json;

namespace Sensa.Input.Protocols;

public sealed partial class HttpProtocolInput
{
    private HttpClient? _scriptHttp;
    private bool _ownsScriptHttp;
    private ProtocolScriptTrajectory? _handyScript;
    private CancellationTokenSource? _preparation;
    private long _scriptGeneration;
    private bool _scriptPlaying;
    private bool _scriptLoop;
    private long _scriptStarted;
    private long _scriptTaskStarted;
    private long _scriptStartMs;

    private async Task<Reply> PrepareHandyScriptAsync(JsonElement body, string identity, CancellationToken cancellationToken)
    {
        var text = String(body, "url");
        if (!Uri.TryCreate(text, UriKind.Absolute, out var uri)) throw new InputException(400, "Use an absolute script URL.");
        var checksum = body.TryGetProperty("sha256", out var hash) ? Text(hash, "sha256") : null;
        if (checksum is not null && (checksum.Length != 64 || checksum.Any(character => !Uri.IsHexDigit(character))))
            throw new InputException(400, "sha256 must contain 64 hexadecimal characters.");
        var csv = !uri.AbsolutePath.EndsWith(".funscript", StringComparison.OrdinalIgnoreCase);
        if (body.TryGetProperty("format", out var format))
            csv = Text(format, "format") switch { "csv" => true, "funscript" => false, _ => throw new InputException(400, "Script format must be csv or funscript.") };
        long generation;
        CancellationTokenSource preparation;
        lock (_sync)
        {
            ThrowIfDisposed();
            RequireMode(1);
            Acquire(identity);
            CancelHandyPlayback();
            _handyScript = null;
            _sink.Stop(_config.Id, _session!);
            generation = _scriptGeneration;
            preparation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            _preparation = preparation;
        }
        try
        {
            var script = await ProtocolScriptLoader.DownloadAsync(uri, csv, _scriptHttp!, _clock, preparation.Token, checksum).ConfigureAwait(false);
            lock (_sync)
            {
                ThrowIfDisposed();
                if (generation != _scriptGeneration || _owner != identity || _handyMode != 1)
                    throw new InputException(409, "The script preparation was superseded.");
                _handyScript = script;
                return new(200, new { result = 1 });
            }
        }
        catch (InvalidDataException) { throw new InputException(400, "The script URL or trajectory was rejected."); }
        catch (HttpRequestException) { throw new InputException(502, "The script server could not be reached."); }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        { throw new InputException(409, "The script preparation timed out or was superseded."); }
        finally
        {
            lock (_sync) { if (ReferenceEquals(_preparation, preparation)) _preparation = null; }
            preparation.Dispose();
        }
    }

    private void PlayHandyScript(JsonElement body, string identity)
    {
        RequireMode(1);
        var script = _handyScript ?? throw new InputException(409, "Prepare a script before playback.");
        var position = Integer(body, "startTime", 0, checked((int)script.DurationMs));
        long age = 0;
        if (body.TryGetProperty("estimatedServerTime", out var estimated))
        {
            if (estimated.ValueKind != JsonValueKind.Number || !estimated.TryGetInt64(out var serverTime) || serverTime < 0)
                throw new InputException(400, "estimatedServerTime must be a nonnegative millisecond timestamp.");
            age = _clock.GetUtcNow().ToUnixTimeMilliseconds() - serverTime;
            if (age is < -600000 or > 600000) throw new InputException(400, "The server-time estimate is outside the synchronization window.");
        }
        Acquire(identity);
        CancelHandyPlayback();
        _scriptTaskStarted = _scriptStarted = _clock.GetTimestamp();
        _scriptStartMs = Math.Clamp(position + age, 0, script.DurationMs);
        _scriptPlaying = true;
        PublishScriptFrame();
    }
    private void CancelHandyPlayback()
    {
        _handyFiniteMoveAt = null;
        _scriptPlaying = false;
        ++_scriptGeneration;
        _preparation?.Cancel();
    }
    private void PublishScriptFrame()
    {
        if (!_scriptPlaying || _handyScript is not { } script || _session is null) return;
        if (_clock.GetElapsedTime(_scriptTaskStarted).TotalMilliseconds >= _config.MaxScriptDurationMs)
        {
            _scriptPlaying = false;
            _sink.Stop(_config.Id, _session, Actuator("Position").Channel);
            return;
        }
        var position = _scriptStartMs + (long)_clock.GetElapsedTime(_scriptStarted).TotalMilliseconds + _handyOffset;
        if (position < 0) return;
        var finished = position >= script.DurationMs && !_scriptLoop;
        var sampleAt = _scriptLoop && script.DurationMs > 0 ? position % script.DurationMs : Math.Min(position, script.DurationMs);
        var duration = finished ? 0 : (int)Math.Min(50, Math.Max(0, script.DurationMs - sampleAt));
        var target = Math.Clamp(script.Sample(sampleAt + duration), _slideMin / 100, _slideMax / 100);
        var current = CommandedHandyPosition();
        if (!_sink.Publish(_config.Id, _session, [new(Actuator("Position").Channel, target, duration)], out _)) { Release(); return; }
        _handyMotion = new(current, target, _clock.GetTimestamp(), duration);
        if (finished)
        {
            _scriptPlaying = false;
            _sink.Stop(_config.Id, _session, Actuator("Position").Channel);
        }
    }
}
