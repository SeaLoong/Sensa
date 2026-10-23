using System.Text.Json;
using Sensa.Recording;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

[Collection("Signal session files")]
public sealed class FunscriptSignalRecordingContracts
{
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);
    private static ComputedSignalSample Valid(float raw = .9f) => ComputedSignalSample.Success(raw, null, 0);
    private static JsonElement Read(SignalRecordingFile file)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(SignalSessionRecorder.ResolveFile(file.FileName)));
        return document.RootElement.Clone();
    }
    private static (long At, int Pos)[] Actions(SignalRecordingFile file) => Read(file).GetProperty("actions")
        .EnumerateArray().Select(action => (action.GetProperty("at").GetInt64(), action.GetProperty("pos").GetInt32())).ToArray();
    private static void StandardHeader(JsonElement document)
    {
        Assert.Equal("1.0", document.GetProperty("version").GetString());
        Assert.False(document.GetProperty("inverted").GetBoolean());
        Assert.Equal(100, document.GetProperty("range").GetInt32());
    }

    [Fact]
    public void Each_binding_records_a_standard_funscript_using_its_mapped_and_clamped_value()
    {
        using var directory = new RecordingDirectory();
        using var recorder = new SignalSessionRecorder("mapped", "Funscript",
            [new("first"), new("second")]);
        recorder.Append("first", Valid(), -.25, 1000);
        recorder.Append("second", Valid(.1f), .75, 1000);
        recorder.Append("first", Valid(), .25, 1100);
        recorder.Append("first", Valid(), 1.8, 1200);
        recorder.Append("second", Valid(), .1, 1200);
        recorder.Complete(1200);

        Assert.Equal(2, recorder.Files.Count);
        var first = Assert.Single(recorder.Files, file => file.SignalId == "first");
        var second = Assert.Single(recorder.Files, file => file.SignalId == "second");
        Assert.NotEqual(first.FileName, second.FileName);
        foreach (var file in recorder.Files)
        {
            Assert.True(file.Completed); Assert.EndsWith(".funscript", file.FileName);
            Assert.Equal(1, file.Segment); Assert.Equal(0, file.TimeOffsetMs);
            StandardHeader(Read(file));
        }
        Assert.Equal([(0L, 0), (100L, 25), (200L, 100)], Actions(first));
        Assert.Equal([(0L, 75), (200L, 10)], Actions(second));
        Assert.Equal(first.FileName, recorder.FileName);
        Assert.False(recorder.Full); Assert.True(string.IsNullOrEmpty(recorder.Error));
    }

    [Fact]
    public void Invalid_input_creates_no_empty_files_and_recovery_starts_a_new_segment_without_bridging_the_gap()
    {
        using var directory = new RecordingDirectory();
        using var recorder = new SignalSessionRecorder("gaps", "Funscript");
        recorder.Append("track", ComputedSignalSample.Invalid("waiting"), null, 1000);
        recorder.Flush();
        Assert.Empty(recorder.Files); Assert.Empty(Directory.GetFiles(directory.Path));
        recorder.Append("track", Valid(), .25, 1100);
        recorder.Append("track", Valid(), .75, 1200);
        recorder.Append("track", ComputedSignalSample.Invalid("expired"), null, 1300);
        var first = Assert.Single(recorder.Files);
        Assert.True(first.Completed); Assert.Equal(100, first.TimeOffsetMs); Assert.Equal(1, first.Segment);
        recorder.Append("track", ComputedSignalSample.Invalid("still expired"), null, 1400);
        Assert.Single(recorder.Files);
        recorder.Append("track", Valid(), .1, 1600);
        recorder.Append("track", Valid(), .9, 1700);
        recorder.Complete(1800);
        var second = Assert.Single(recorder.Files, file => file.Segment == 2);
        Assert.Equal(600, second.TimeOffsetMs);
        Assert.Equal(0, Actions(first)[0].At); Assert.Equal(0, Actions(second)[0].At);
        Assert.Equal(25, Actions(first)[0].Pos); Assert.Equal(10, Actions(second)[0].Pos);
        Assert.NotEqual(first.FileName, second.FileName);
        Assert.All(recorder.Files, file => { Assert.True(file.Completed); StandardHeader(Read(file)); });
        Assert.Equal(2, Directory.GetFiles(directory.Path, "*.funscript").Length);
    }

    [Fact]
    public void Flush_keeps_one_private_active_segment_while_complete_and_dispose_publish_finished_files()
    {
        using var directory = new RecordingDirectory();
        var recorder = new SignalSessionRecorder("lifecycle", "Funscript");
        try
        {
            recorder.Append("track", Valid(), .25, 1000);
            recorder.Append("track", Valid(), .75, 1100);
            recorder.Flush();
            var active = Assert.Single(recorder.Files);
            Assert.False(active.Completed);
            Assert.False(File.Exists(SignalSessionRecorder.ResolveFile(active.FileName)));
            Assert.Empty(SignalSessionRecorder.ListFiles());
            recorder.Append("track", Valid(), .5, 1200);
            recorder.Flush(); Assert.Single(recorder.Files);
            recorder.Complete(1300);
            var first = Assert.Single(recorder.Files);
            Assert.True(first.Completed); Assert.Equal((300L, 50), Actions(first)[^1]);
            Assert.Single(SignalSessionRecorder.ListFiles());
            recorder.Append("track", Valid(), .6, 1400);
            Assert.Equal(2, recorder.Files.Count);
            Assert.False(recorder.Files[^1].Completed);
            recorder.Dispose();
            Assert.True(recorder.Files[^1].Completed);
            Assert.Equal(400, recorder.Files[^1].TimeOffsetMs);
            recorder.Append("track", Valid(), .8, 1500);
            Assert.Equal(2, recorder.Files.Count);
            Assert.All(recorder.Files, file => StandardHeader(Read(file)));
            Assert.Equal(2, Directory.GetFiles(directory.Path).Length);
        }
        finally { recorder.Dispose(); }
    }

    [Fact]
    public void Axis_metadata_uses_standard_multi_axis_filenames_without_changing_recorded_positions()
    {
        using var directory = new RecordingDirectory();
        using var recorder = new SignalSessionRecorder("axes", "Funscript",
            [new("linear", "Position", "L0"), new("rotation", "Rotation", "R0")]);
        recorder.Append("linear", Valid(), .2, 1000);
        recorder.Append("rotation", Valid(), .7, 1000);
        recorder.Complete(1100);
        var linear = Assert.Single(recorder.Files, file => file.SignalId == "linear");
        var rotation = Assert.Single(recorder.Files, file => file.SignalId == "rotation");
        Assert.Equal("L0", linear.Axis); Assert.Equal("R0", rotation.Axis);
        Assert.EndsWith(".funscript", linear.FileName);
        Assert.DoesNotContain(".twist.", linear.FileName);
        Assert.EndsWith(".twist.funscript", rotation.FileName);
        Assert.Equal(20, Actions(linear)[0].Pos); Assert.Equal(70, Actions(rotation)[0].Pos);
    }

    [Fact]
    public void Standard_funscript_replay_interpolates_normalized_value_and_pausing_or_finishing_invalidates_input()
    {
        using var directory = new RecordingDirectory();
        File.WriteAllText(System.IO.Path.Combine(directory.Path, "external.funscript"),
            "{\"version\":\"1.0\",\"inverted\":false,\"range\":100,\"actions\":[{\"at\":0,\"pos\":0},{\"at\":1000,\"pos\":100},{\"at\":2000,\"pos\":0}]}");
        var clock = new ManualTimeProvider(); var replay = new SignalSessionPlayback(clock);
        replay.Load("external.funscript");
        var snapshot = JsonSerializer.SerializeToElement(replay.Snapshot, WebJson);
        Assert.Equal(["value"], snapshot.GetProperty("signals").EnumerateArray().Select(value => value.GetString()!).ToArray());
        Assert.Equal(2000, replay.DurationMs); Assert.False(replay.Read("value", 0).Valid);
        replay.Play(); clock.Advance(TimeSpan.FromMilliseconds(500));
        var middle = replay.Read("value", 500);
        Assert.True(middle.Valid); Assert.Equal(.5f, middle.Value);
        replay.Pause(); Assert.False(replay.Read("value", 500).Valid);
        replay.Seek(1500); replay.Play(); Assert.Equal(.5f, replay.Read("value", 1500).Value);
        Assert.False(replay.Read("missing", 1500).Valid);
        clock.Advance(TimeSpan.FromMilliseconds(500));
        Assert.False(replay.Read("value", 2000).Valid);
        Assert.False(JsonSerializer.SerializeToElement(replay.Snapshot, WebJson).GetProperty("playing").GetBoolean());
    }

    [Fact]
    public void Sample_limit_is_shared_between_tracks_and_closes_existing_files_as_valid_funscripts()
    {
        using var directory = new RecordingDirectory();
        using var recorder = new SignalSessionRecorder("sample-limit", "Funscript", [new("a"), new("b")]);
        for (var sample = 0; sample < 250000; sample++)
            recorder.Append(sample % 2 == 0 ? "a" : "b", Valid(), (sample & 2) == 0 ? .2 : .8, sample);
        Assert.False(recorder.Full);
        recorder.Append("new-track", Valid(), .5, 250000);
        Assert.True(recorder.Full); Assert.False(string.IsNullOrWhiteSpace(recorder.Error));
        Assert.Equal(2, recorder.Files.Count);
        Assert.DoesNotContain(recorder.Files, file => file.SignalId == "new-track");
        Assert.All(recorder.Files, file => { Assert.True(file.Completed); StandardHeader(Read(file)); });
        Assert.All(recorder.Files.SelectMany(Actions), action => Assert.InRange(action.Pos, 0, 100));
        Assert.Equal(2, Directory.GetFiles(directory.Path).Length);
    }

    [Fact]
    public void File_limit_closes_segments_and_does_not_publish_a_1025th_file()
    {
        using var directory = new RecordingDirectory();
        using var recorder = new SignalSessionRecorder("file-limit", "Funscript");
        for (var segment = 0; segment < 1024; segment++)
        {
            recorder.Append("track", Valid(), .4, segment * 200L);
            recorder.Append("track", ComputedSignalSample.Invalid("gap"), null, segment * 200L + 100);
        }
        Assert.False(recorder.Full); Assert.Equal(1024, recorder.Files.Count);
        recorder.Append("track", Valid(), .8, 204800);
        Assert.True(recorder.Full); Assert.False(string.IsNullOrWhiteSpace(recorder.Error));
        Assert.Equal(1024, recorder.Files.Count);
        Assert.Equal(1024, Directory.GetFiles(directory.Path, "*.funscript").Length);
        Assert.Equal(1024, Directory.GetFiles(directory.Path).Length);
        Assert.All(recorder.Files, file => { Assert.True(file.Completed); StandardHeader(Read(file)); });
    }

    [Fact]
    public void Track_limit_rejects_oversized_configuration_and_stops_runtime_track_growth()
    {
        using var directory = new RecordingDirectory();
        var oversized = Enumerable.Range(0, 65).Select(index => new SignalRecordingTrack("track-" + index)).ToArray();
        Assert.Throws<ArgumentException>(() => new SignalSessionRecorder("too-many", "Funscript", oversized));
        using var recorder = new SignalSessionRecorder("track-limit", "Funscript");
        for (var track = 0; track < 64; track++) recorder.Append("track-" + track, Valid(), .3, track);
        recorder.Append("track-64", Valid(), .7, 65);
        Assert.True(recorder.Full); Assert.False(string.IsNullOrWhiteSpace(recorder.Error));
        Assert.Equal(64, recorder.Files.Count);
        Assert.All(recorder.Files, file => { Assert.True(file.Completed); StandardHeader(Read(file)); });
        Assert.Equal(64, Directory.GetFiles(directory.Path).Length);
    }

    private sealed class RecordingDirectory : IDisposable
    {
        private readonly string? _previous = Environment.GetEnvironmentVariable("SENSA_RECORDINGS_PATH");
        public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "sensa-funscript-" + Guid.NewGuid().ToString("N"));
        public RecordingDirectory() { Directory.CreateDirectory(Path); Environment.SetEnvironmentVariable("SENSA_RECORDINGS_PATH", Path); }
        public void Dispose()
        {
            Environment.SetEnvironmentVariable("SENSA_RECORDINGS_PATH", _previous);
            if (Directory.Exists(Path)) Directory.Delete(Path, recursive: true);
        }
    }
}
