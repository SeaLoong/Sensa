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
    private readonly string _format;
    private long? _startedMs;
    private long _bytes;
    private int _rows;
    private long _lastFlushMs;
    public string FileName { get; }
    public bool Full { get; private set; }
    public static string DirectoryPath => Path.GetFullPath(Environment.GetEnvironmentVariable("SENSA_RECORDINGS_PATH")
        is { Length: > 0 } directory ? directory : Path.Combine(AppContext.BaseDirectory, "recordings"));

    public SignalSessionRecorder(string name, string format)
    {
        _format = format;
        Directory.CreateDirectory(DirectoryPath);
        var safe = string.Concat(name.Where(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_')).Trim('_', '-');
        if (safe.Length > 40) safe = safe[..40];
        if (safe.Length == 0) safe = "session";
        FileName = safe + "-" + DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss-fff", CultureInfo.InvariantCulture)
            + "-" + Guid.NewGuid().ToString("N")[..6] + (format == "Csv" ? ".csv" : ".jsonl");
        var file = new FileStream(ResolveFile(FileName), FileMode.CreateNew, FileAccess.Write, FileShare.Read);
        _writer = new StreamWriter(file, new UTF8Encoding(false));
        Write(format == "Csv" ? "timeMs,signalId,rawValue,value,valid,reason,sourceKey,coordinateFrame"
            : "{\"type\":\"sensa-session\",\"format\":1}");
        _writer.Flush();
    }

    public void Append(string id, ComputedSignalSample sample, double? value, long nowMs)
    {
        lock (_sync)
        {
            if (_writer is null || Full) return;
            if (_rows++ >= 250000) { Full = true; _writer.Flush(); return; }
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
        if (_bytes + size > MaximumBytes) { Full = true; _writer?.Flush(); return; }
        _writer!.WriteLine(line); _bytes += size;
    }
    private static string Escape(string value) => '"' + value.Replace("\"", "\"\"").Replace("\r", " ").Replace("\n", " ") + '"';
    public void Flush() { lock (_sync) _writer?.Flush(); }
    public void Dispose() { lock (_sync) { _writer?.Dispose(); _writer = null; } }
    public static string ResolveFile(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName) || fileName != Path.GetFileName(fileName)
            || Path.GetExtension(fileName) is not (".jsonl" or ".csv"))
            throw new ArgumentException("请选择录制目录中的 JSONL 或 CSV 文件 / Choose a JSONL or CSV file from the recording directory.");
        return Path.Combine(DirectoryPath, fileName);
    }
    public static object[] ListFiles() => !Directory.Exists(DirectoryPath) ? []
        : new DirectoryInfo(DirectoryPath).EnumerateFiles().Where(file => file.Extension is ".jsonl" or ".csv")
            .OrderByDescending(file => file.LastWriteTimeUtc).Take(200)
            .Select(file => (object)new { fileName = file.Name, size = file.Length, modifiedAt = file.LastWriteTimeUtc }).ToArray();
}

/// <summary>Replay keeps validity intervals and source metadata; loading never starts playback.</summary>
public sealed class SignalSessionPlayback(TimeProvider? timeProvider = null)
{
    private readonly TimeProvider _clock = timeProvider ?? TimeProvider.System;
    private readonly object _sync = new();
    private Dictionary<string, SignalSessionRow[]> _signals = new(StringComparer.Ordinal);
    private long _positionMs, _startedAt;
    private bool _playing;
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
            var row = csv ? ReadCsv(line) : JsonSerializer.Deserialize<SignalSessionRow>(line, new JsonSerializerOptions(JsonSerializerDefaults.Web));
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
            _positionMs = 0; _playing = false;
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
            if (index < 0) return ComputedSignalSample.Invalid("等待首个回放采样 / Waiting for the first replay sample");
            var row = rows[index];
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
