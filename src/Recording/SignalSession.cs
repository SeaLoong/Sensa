using System.Globalization;
using System.Text;
using System.Text.Json;
using Sensa.Signals;

namespace Sensa.Recording;

public sealed record SignalSessionRow(long TimeMs, string SignalId, float? RawValue, double? Value,
    bool Valid, string Reason, string? SourceKey, string? CoordinateFrame);

/// <summary>Bounded multi-signal recording, independent of any device protocol.</summary>
public sealed class SignalSessionRecorder : IDisposable
{
    public const long MaximumBytes = 64 * 1024 * 1024;
    private readonly object _sync = new();
    private StreamWriter? _writer;
    private readonly FunscriptTrackRecorder? _funscript;
    private readonly string _fileName = "";
    private readonly string _format;
    private long? _startedMs;
    private long _bytes;
    private int _rows;
    private long _lastFlushMs;
    public string FileName { get { lock (_sync) return _funscript?.FileName ?? _fileName; } }
    private bool _full;
    public bool Full { get { lock (_sync) return _funscript?.Full ?? _full; } }
    public string? Error { get { lock (_sync) return _funscript?.Error; } }
    public IReadOnlyList<SignalRecordingFile> Files { get { lock (_sync) return _funscript?.Files ?? [new(_fileName, "", 1, null, 0)]; } }
    public static string DirectoryPath => Path.GetFullPath(Environment.GetEnvironmentVariable("SENSA_RECORDINGS_PATH")
        is { Length: > 0 } directory ? directory : Path.Combine(AppContext.BaseDirectory, "recordings"));

    public SignalSessionRecorder(string name, string format, IReadOnlyList<SignalRecordingTrack>? tracks = null)
    {
        if (format is not ("Funscript" or "JsonLines" or "Csv")) throw new ArgumentException("请选择录制格式 / Choose a recording format.");
        _format = format;
        Directory.CreateDirectory(DirectoryPath);
        var safe = string.Concat(name.Where(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_')).Trim('_', '-');
        if (safe.Length > 40) safe = safe[..40];
        if (safe.Length == 0) safe = "session";
        var stem = safe + "-" + DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss-fff", CultureInfo.InvariantCulture)
            + "-" + Guid.NewGuid().ToString("N")[..6];
        if (format == "Funscript") { _funscript = new(stem, tracks); return; }
        _fileName = stem + (format == "Csv" ? ".csv" : ".jsonl");
        var file = new FileStream(ResolveFile(FileName), FileMode.CreateNew, FileAccess.Write, FileShare.Read);
        _writer = new StreamWriter(file, new UTF8Encoding(false)) { NewLine = "\n" };
        Write(format == "Csv" ? "timeMs,signalId,rawValue,value,valid,reason,sourceKey,coordinateFrame"
            : "{\"type\":\"sensa-session\",\"format\":1}");
        _writer.Flush();
    }

    public void Append(string id, ComputedSignalSample sample, double? value, long nowMs)
    {
        lock (_sync)
        {
            if (_funscript is not null) { _funscript.Append(id, sample, value, nowMs); return; }
            if (_writer is null || Full) return;
            if (_rows++ >= 250000) { _full = true; _writer.Flush(); return; }
            _startedMs ??= nowMs;
            var row = new SignalSessionRow(Math.Max(0, nowMs - _startedMs.Value), id, sample.Value,
                sample.Valid ? value : null, sample.Valid, sample.Reason, sample.SourceKey, sample.CoordinateFrame);
            Write(_format == "Csv" ? string.Join(',', row.TimeMs.ToString(CultureInfo.InvariantCulture), Escape(id),
                row.RawValue?.ToString("R", CultureInfo.InvariantCulture) ?? "", row.Value?.ToString("R", CultureInfo.InvariantCulture) ?? "",
                row.Valid ? "true" : "false", Escape(row.Reason), Escape(row.SourceKey ?? ""), Escape(row.CoordinateFrame ?? ""))
                : JsonSerializer.Serialize(row, JsonOptions));
            if (nowMs - _lastFlushMs >= 1000) { _writer.Flush(); _lastFlushMs = nowMs; }
        }
    }
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private void Write(string line)
    {
        var size = Encoding.UTF8.GetByteCount(line) + 1;
        if (_bytes + size > MaximumBytes) { _full = true; _writer?.Flush(); return; }
        _writer!.WriteLine(line); _bytes += size;
    }
    private static string Escape(string value) => '"' + value.Replace("\"", "\"\"").Replace("\r", " ").Replace("\n", " ") + '"';
    public void Complete(long? nowMs = null) { lock (_sync) { _funscript?.Complete(nowMs); _writer?.Flush(); } }
    public void Flush() { lock (_sync) { _funscript?.Flush(); _writer?.Flush(); } }
    public void Dispose() { lock (_sync) { _funscript?.Dispose(); _writer?.Dispose(); _writer = null; } }
    public static string ResolveFile(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName) || fileName != Path.GetFileName(fileName)
            || Path.GetExtension(fileName) is not (".funscript" or ".jsonl" or ".csv"))
            throw new ArgumentException("请选择录制目录中的 Funscript、JSONL 或 CSV 文件 / Choose a Funscript, JSONL or CSV file from the recording directory.");
        return Path.Combine(DirectoryPath, fileName);
    }
    public static object[] ListFiles() => !Directory.Exists(DirectoryPath) ? []
        : new DirectoryInfo(DirectoryPath).EnumerateFiles().Where(file => file.Extension is ".funscript" or ".jsonl" or ".csv")
            .OrderByDescending(file => file.LastWriteTimeUtc).Take(200)
            .Select(file => (object)new { fileName = file.Name, size = file.Length, modifiedAt = file.LastWriteTimeUtc }).ToArray();
}

/// <summary>Replay keeps validity intervals and source metadata; loading never starts playback.</summary>
public sealed class SignalSessionPlayback(TimeProvider? timeProvider = null)
{
    private static readonly JsonSerializerOptions ReplayJsonOptions = new(JsonSerializerDefaults.Web);
    private readonly TimeProvider _clock = timeProvider ?? TimeProvider.System;
    private readonly object _sync = new();
    private Dictionary<string, SignalSessionRow[]> _signals = new(StringComparer.Ordinal);
    private long _positionMs, _startedAt;
    private bool _playing, _funscript;
    public string FileName { get; private set; } = "";
    public long DurationMs { get; private set; }
    private long ElapsedMs => (long)_clock.GetElapsedTime(_startedAt, _clock.GetTimestamp()).TotalMilliseconds;
    private long PositionCore => Math.Clamp(_positionMs + (_playing ? ElapsedMs : 0), 0, DurationMs);
    public object Snapshot { get { lock (_sync) return new { loaded = _signals.Count > 0, playing = _playing && PositionCore < DurationMs,
        timeMs = PositionCore, durationMs = DurationMs, fileName = FileName, signals = _signals.Keys.ToArray() }; } }

    public void Load(string fileName)
    {
        var file = new FileInfo(SignalSessionRecorder.ResolveFile(fileName));
        if (!file.Exists || file.Length > SignalSessionRecorder.MaximumBytes)
            throw new ArgumentException("录制文件不存在或超过 64 MiB / The recording is missing or exceeds 64 MiB.");
        if (file.Extension == ".funscript") { LoadFunscript(file); return; }
        var rows = new List<SignalSessionRow>();
        using var reader = new StreamReader(new FileStream(file.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite));
        var header = reader.ReadLine() ?? "";
        var csv = file.Extension == ".csv";
        var validHeader = csv ? header == "timeMs,signalId,rawValue,value,valid,reason,sourceKey,coordinateFrame" : ValidHeader(header);
        if (!validHeader) throw new ArgumentException("请选择 Sensa 会话录制 / Choose a Sensa session recording.");
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            if (line.Length > 32768 || rows.Count >= 250000) throw new ArgumentException("录制数据超过回放限制 / The recording exceeds replay limits.");
            var row = csv ? ReadCsv(line) : JsonSerializer.Deserialize<SignalSessionRow>(line, ReplayJsonOptions);
            if (row is null || row.TimeMs < 0 || row.TimeMs > 7L * 24 * 3600 * 1000 || string.IsNullOrEmpty(row.SignalId) || row.SignalId.Length > 80
                || row.RawValue is { } raw && !float.IsFinite(raw) || row.Value is { } value && !double.IsFinite(value)
                || row.Valid && row.RawValue is null) throw new ArgumentException("录制包含无效采样 / The recording contains invalid samples.");
            rows.Add(row);
        }
        var signals = rows.GroupBy(row => row.SignalId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.OrderBy(row => row.TimeMs).ToArray(), StringComparer.Ordinal);
        if (signals.Count > 64) throw new ArgumentException("回放最多包含 64 个信号 / A replay supports at most 64 signals.");
        lock (_sync)
        {
            _signals = signals; FileName = file.Name; DurationMs = rows.Count > 0 ? rows.Max(row => row.TimeMs) : 0;
            _positionMs = 0; _playing = false; _funscript = false;
        }
    }
    private void LoadFunscript(FileInfo file)
    {
        using var stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read, FileShare.Read);
        using var json = JsonDocument.Parse(stream);
        if (json.RootElement.ValueKind != JsonValueKind.Object || !json.RootElement.TryGetProperty("actions", out var actions)
            || actions.ValueKind != JsonValueKind.Array)
            throw new ArgumentException("脚本需要 actions 数组 / The script needs an actions array.");
        var inverted = json.RootElement.TryGetProperty("inverted", out var inversion) && inversion.ValueKind == JsonValueKind.True;
        var rows = new Dictionary<long, SignalSessionRow>(); var count = 0;
        foreach (var action in actions.EnumerateArray())
        {
            if (++count > FunscriptTrackRecorder.MaximumActions) throw new ArgumentException("录制数据超过回放限制 / The recording exceeds replay limits.");
            if (action.ValueKind != JsonValueKind.Object || !action.TryGetProperty("at", out var at)
                || !action.TryGetProperty("pos", out var pos) || at.ValueKind != JsonValueKind.Number || pos.ValueKind != JsonValueKind.Number
                || !at.TryGetInt64(out var time) || !pos.TryGetDouble(out var value) || !double.IsFinite(value)) continue;
            time = Math.Max(0, time);
            if (time > 7L * 24 * 3600 * 1000) throw new ArgumentException("录制数据超过回放限制 / The recording exceeds replay limits.");
            var normal = (float)Math.Clamp(value / 100, 0, 1);
            if (inverted) normal = 1 - normal;
            rows[time] = new(time, "value", normal, normal, true, "", null, null);
        }
        if (rows.Count == 0) throw new ArgumentException("脚本中没有可播放的动作 / The script contains no playable actions.");
        var ordered = rows.OrderBy(item => item.Key).Select(item => item.Value).ToArray();
        lock (_sync)
        {
            _signals = new(StringComparer.Ordinal) { ["value"] = ordered }; _funscript = true;
            FileName = file.Name; DurationMs = Math.Max(1, ordered[^1].TimeMs); _positionMs = 0; _playing = false;
        }
    }
    private static bool ValidHeader(string header)
    {
        try
        {
            using var json = JsonDocument.Parse(header);
            return json.RootElement.ValueKind == JsonValueKind.Object
                && json.RootElement.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "sensa-session"
                && json.RootElement.TryGetProperty("format", out var format) && format.ValueKind == JsonValueKind.Number && format.TryGetInt32(out var version) && version == 1;
        }
        catch (JsonException) { return false; }
    }
    public void Play() { lock (_sync) { if (_signals.Count == 0) throw new InvalidOperationException("请先载入录制 / Load a recording first.");
        if (_playing && PositionCore < DurationMs) return; if (PositionCore >= DurationMs) _positionMs = DurationMs; if (_positionMs >= DurationMs) _positionMs = 0; _startedAt = _clock.GetTimestamp(); _playing = true; } }
    public void Pause() { lock (_sync) { _positionMs = PositionCore; _playing = false; } }
    public void Seek(long timeMs) { lock (_sync) { _positionMs = Math.Clamp(timeMs, 0, DurationMs); _startedAt = _clock.GetTimestamp(); } }
    public ComputedSignalSample Read(string signalId, long nowMs)
    {
        lock (_sync)
        {
            if (!_signals.TryGetValue(signalId, out var rows) || rows.Length == 0)
                return ComputedSignalSample.Invalid("等待回放信号 / Waiting for a replay signal");
            var position = PositionCore;
            if (!_playing || position >= DurationMs) return ComputedSignalSample.Invalid("回放已暂停或结束 / Replay is paused or complete");
            var low = 0; var high = rows.Length - 1; var index = -1;
            while (low <= high) { var middle = (low + high) / 2; if (rows[middle].TimeMs <= position) { index = middle; low = middle + 1; } else high = middle - 1; }
            if (index < 0) return _funscript && rows[0].RawValue is { } initial
                ? ComputedSignalSample.Success(initial, null, nowMs, originKey: "replay:" + FileName + ":value")
                : ComputedSignalSample.Invalid("等待首个回放采样 / Waiting for the first replay sample");
            var row = rows[index];
            if (_funscript && row.RawValue is { } current)
            {
                if (index + 1 < rows.Length && rows[index + 1].RawValue is { } next)
                {
                    var nextRow = rows[index + 1];
                    current += (next - current) * ((position - row.TimeMs) / (float)Math.Max(1, nextRow.TimeMs - row.TimeMs));
                }
                return ComputedSignalSample.Success(current, null, nowMs, originKey: "replay:" + FileName + ":value");
            }
            return row.Valid && row.RawValue is { } value
                ? ComputedSignalSample.Success(value, null, nowMs, row.CoordinateFrame, "replay:" + FileName + ":" + signalId)
                : ComputedSignalSample.Invalid(row.Reason);
        }
    }
    private static SignalSessionRow ReadCsv(string line)
    {
        var fields = new List<string>(); var field = new StringBuilder(); var quoted = false;
        for (var i = 0; i < line.Length; i++)
        {
            if (line[i] == '"') { if (quoted && i + 1 < line.Length && line[i + 1] == '"') { field.Append('"'); i++; } else quoted = !quoted; }
            else if (line[i] == ',' && !quoted) { fields.Add(field.ToString()); field.Clear(); }
            else field.Append(line[i]);
        }
        fields.Add(field.ToString());
        if (fields.Count != 8 || quoted) throw new ArgumentException("CSV 录制格式无效 / Invalid CSV recording.");
        return new(long.Parse(fields[0], CultureInfo.InvariantCulture), fields[1],
            fields[2].Length == 0 ? null : float.Parse(fields[2], CultureInfo.InvariantCulture),
            fields[3].Length == 0 ? null : double.Parse(fields[3], CultureInfo.InvariantCulture),
            bool.Parse(fields[4]), fields[5], fields[6].Length == 0 ? null : fields[6], fields[7].Length == 0 ? null : fields[7]);
    }
}
