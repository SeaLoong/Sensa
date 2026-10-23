using System.Globalization;
using System.Text;
using Sensa.Signals;

namespace Sensa.Recording;

public sealed record SignalRecordingTrack(string SignalId, string Name = "", string? Axis = null);
public sealed record SignalRecordingFile(string FileName, string SignalId, int Segment, string? Axis,
    long TimeOffsetMs, bool Completed = true);

/// <summary>Standard single-track scripts; validity gaps become separate, independently playable clips.</summary>
internal sealed class FunscriptTrackRecorder : IDisposable
{
    public const int MaximumTracks = 64;
    public const int MaximumFiles = 1024;
    public const int MaximumActions = 250000;
    private const string Header = "{\"version\":\"1.0\",\"inverted\":false,\"range\":100,\"actions\":[";
    private static readonly Dictionary<string, string> AxisSuffixes = new(StringComparer.Ordinal)
    {
        ["L0"] = "", ["L1"] = ".surge", ["L2"] = ".sway", ["R0"] = ".twist", ["R1"] = ".roll",
        ["R2"] = ".pitch", ["V0"] = ".vib", ["A0"] = ".valve", ["A1"] = ".suck", ["A2"] = ".lube",
    };
    private readonly Dictionary<string, Track> _tracks = new(StringComparer.Ordinal);
    private readonly List<SignalRecordingFile> _files = [];
    private readonly HashSet<string> _suffixes = new(StringComparer.OrdinalIgnoreCase);
    private readonly string _stem;
    private long? _startedMs;
    private long _bytes;
    private int _actions;
    private bool _disposed;
    public bool Full { get; private set; }
    public string? Error { get; private set; }
    public string FileName => _files.FirstOrDefault()?.FileName ?? "";
    public IReadOnlyList<SignalRecordingFile> Files => _files.ToArray();

    public FunscriptTrackRecorder(string stem, IReadOnlyList<SignalRecordingTrack>? tracks)
    {
        _stem = stem;
        if (tracks?.Count > MaximumTracks) throw new ArgumentException("录制最多支持 64 条轨道 / Recording supports at most 64 tracks.");
        foreach (var track in tracks ?? []) AddTrack(track);
    }

    private Track AddTrack(SignalRecordingTrack definition)
    {
        if (string.IsNullOrWhiteSpace(definition.SignalId) || definition.SignalId.Length > 80 || _tracks.ContainsKey(definition.SignalId))
            throw new ArgumentException("请为录制轨道使用独立标识 / Use distinct recording track IDs.");
        var axis = definition.Axis;
        if (axis is null && AxisSuffixes.ContainsKey(definition.SignalId)) axis = definition.SignalId;
        if (axis is null && AxisSuffixes.ContainsKey(definition.Name)) axis = definition.Name;
        // V1/V2 have no agreed player suffix: retain their identity as generic tracks.
        var suffix = axis is not null && AxisSuffixes.TryGetValue(axis, out var known) ? known
            : ".track" + (_tracks.Count + 1).ToString("D2", CultureInfo.InvariantCulture) + "-" + SafeName(definition.SignalId);
        if (!_suffixes.Add(suffix))
        {
            suffix = ".track" + (_tracks.Count + 1).ToString("D2", CultureInfo.InvariantCulture) + "-" + SafeName(definition.SignalId);
            _suffixes.Add(suffix);
        }
        var result = new Track(definition.SignalId, axis, suffix);
        _tracks.Add(definition.SignalId, result); return result;
    }

    private static string SafeName(string name)
    {
        var safe = string.Concat(name.Where(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_'));
        return safe.Length == 0 ? "signal" : safe[..Math.Min(safe.Length, 32)];
    }

    public void Append(string id, ComputedSignalSample sample, double? value, long nowMs)
    {
        if (_disposed || Full) return;
        _startedMs ??= nowMs;
        if (!sample.Valid || value is not { } number || !double.IsFinite(number))
        {
            if (_tracks.TryGetValue(id, out var inactive)) End(inactive, nowMs);
            return;
        }
        if (!_tracks.TryGetValue(id, out var track))
        {
            if (_tracks.Count >= MaximumTracks) { Limit("录制已达到 64 条轨道上限 / Recording reached the 64-track limit"); return; }
            track = AddTrack(new(id));
        }
        var pos = (int)Math.Round(Math.Clamp(number, 0, 1) * 100, MidpointRounding.AwayFromZero);
        if (track.Stream is null && !Start(track, nowMs, pos)) return;
        var at = Math.Max(track.LastAt, Math.Max(0, nowMs - track.StartedMs));
        WriteAction(track, at, pos);
    }

    private bool Start(Track track, long nowMs, int pos)
    {
        var header = Encoding.UTF8.GetBytes(Header);
        if (_actions >= MaximumActions) { Limit("录制已达到 250000 条动作上限 / Recording reached the 250000-action limit"); return false; }
        if (_files.Count >= MaximumFiles) { Limit("录制已达到 1024 个片段上限 / Recording reached the 1024-clip limit"); return false; }
        // Reserve the footer before opening a file, so every accepted clip can be finalized.
        var firstActionBytes = Encoding.UTF8.GetByteCount("{\"at\":0,\"pos\":" + pos.ToString(CultureInfo.InvariantCulture) + "}");
        if (_bytes + header.Length + firstActionBytes + 2 > SignalSessionRecorder.MaximumBytes)
        { Limit("录制已达到 64 MiB 上限 / Recording reached the 64 MiB limit"); return false; }
        track.Segment++;
        var part = track.Segment > 1 ? "-part" + track.Segment.ToString("D2", CultureInfo.InvariantCulture) : "";
        var fileName = _stem + part + track.Suffix + ".funscript";
        var fullPath = SignalSessionRecorder.ResolveFile(fileName);
        track.PendingPath = fullPath + ".pending";
        track.Stream = new FileStream(track.PendingPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        track.Stream.Write(header);
        _bytes += header.Length + 2;
        track.StartedMs = nowMs; track.LastAt = -1; track.LastOffset = header.Length; track.LastLength = 0;
        track.FileIndex = _files.Count;
        _files.Add(new(fileName, track.Id, track.Segment, track.Axis, Math.Max(0, nowMs - _startedMs!.Value), false));
        return true;
    }

    private void WriteAction(Track track, long at, int pos)
    {
        if (track.Stream is not { } stream || Full) return;
        var replace = at == track.LastAt;
        if (!replace && _actions >= MaximumActions) { Limit("录制已达到 250000 条动作上限 / Recording reached the 250000-action limit"); return; }
        var prefix = replace ? track.LastPrefix : track.LastAt >= 0 ? "," : "";
        var bytes = Encoding.UTF8.GetBytes(prefix + "{\"at\":" + at.ToString(CultureInfo.InvariantCulture)
            + ",\"pos\":" + pos.ToString(CultureInfo.InvariantCulture) + "}");
        var delta = bytes.Length - (replace ? track.LastLength : 0);
        if (_bytes + delta > SignalSessionRecorder.MaximumBytes)
        { Limit("录制已达到 64 MiB 上限 / Recording reached the 64 MiB limit"); return; }
        if (replace) stream.Position = track.LastOffset;
        else { track.LastOffset = stream.Position; track.LastPrefix = prefix; _actions++; }
        stream.Write(bytes); stream.SetLength(stream.Position);
        _bytes += delta; track.LastLength = bytes.Length; track.LastAt = at; track.LastPos = pos;
    }

    private void End(Track track, long? nowMs)
    {
        if (track.Stream is null) return;
        if (!Full && nowMs is { } end && end > track.StartedMs + track.LastAt)
            WriteAction(track, end - track.StartedMs, track.LastPos);
        if (track.Stream is not { } stream) return; // A limit may have closed all tracks.
        track.Stream = null;
        try
        {
            stream.Write("]}"u8); stream.Flush(); stream.Dispose();
            File.Move(track.PendingPath!, SignalSessionRecorder.ResolveFile(_files[track.FileIndex].FileName));
            _files[track.FileIndex] = _files[track.FileIndex] with { Completed = true };
        }
        catch
        {
            stream.Dispose(); TryDelete(track.PendingPath); Error = "录制文件写入失败 / Recording file could not be written"; throw;
        }
        finally { track.PendingPath = null; }
    }

    private void Limit(string error)
    {
        Full = true; Error = error;
        foreach (var track in _tracks.Values) End(track, null);
    }

    public void Complete(long? nowMs = null)
    {
        if (_disposed) return;
        foreach (var track in _tracks.Values) End(track, nowMs);
    }
    public void Flush() { foreach (var track in _tracks.Values) track.Stream?.Flush(); }
    public void Dispose()
    {
        if (_disposed) return;
        try { Complete(); }
        finally
        {
            _disposed = true;
            foreach (var track in _tracks.Values) { track.Stream?.Dispose(); track.Stream = null; TryDelete(track.PendingPath); }
        }
    }
    private static void TryDelete(string? file) { if (file is not null) { try { File.Delete(file); } catch (IOException) { } } }
    private sealed class Track(string id, string? axis, string suffix)
    {
        public string Id { get; } = id;
        public string? Axis { get; } = axis;
        public string Suffix { get; } = suffix;
        public int Segment, FileIndex, LastPos, LastLength;
        public long StartedMs, LastAt, LastOffset;
        public string LastPrefix = "";
        public string? PendingPath;
        public FileStream? Stream;
    }
}
