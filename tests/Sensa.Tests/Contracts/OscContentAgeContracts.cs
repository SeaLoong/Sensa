using Sensa.Input.Osc;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Reception versus content age / 收包活动与内容变化时间。</summary>
public sealed class OscContentAgeContracts
{
    private const string FramePath = "Sensa/Shader/42/Frame";
    private static OscSource Source(string key) => new(key, key, null, "127.0.0.1", 19000);

    [Fact]
    public void Repeating_a_frame_updates_reception_and_sequence_but_not_its_content_age()
    {
        var clock = new ManualTimeProvider();
        var store = new OscParameterStore(clock);
        var onSet = 0; var onSetWithSource = 0;
        store.OnSet += (_, _) => onSet++;
        store.OnSetWithSource += (_, _, _) => onSetWithSource++;
        store.Set(FramePath, OscValue.FromFloat(.3f), Source("a"));
        Assert.True(store.TryGetLatest(FramePath, "a", out var first));
        Assert.Equal(first.TimestampMs, first.ChangedAtMs);

        clock.Advance(TimeSpan.FromMilliseconds(600));
        store.Set(FramePath, OscValue.FromFloat(.3f), Source("a"));
        Assert.True(store.TryGetLatest(FramePath, "a", out var repeated));
        Assert.Equal(first.TimestampMs + 600, repeated.TimestampMs);
        Assert.Equal(first.ChangedAtMs, repeated.ChangedAtMs);
        Assert.True(repeated.Sequence > first.Sequence);
        Assert.Equal(2, onSet); Assert.Equal(2, onSetWithSource);
        // A 500 ms content-liveness rule expires despite continued reception.
        Assert.True(clock.GetUtcNow().ToUnixTimeMilliseconds() - repeated.ChangedAtMs > 500);
    }

    [Fact]
    public void Content_changes_update_only_the_corresponding_source_and_path()
    {
        var clock = new ManualTimeProvider();
        var store = new OscParameterStore(clock);
        store.Set(FramePath, OscValue.FromFloat(.3f), Source("a"));
        store.Set("Other", OscValue.FromFloat(.3f), Source("a"));
        Assert.True(store.TryGetLatest(FramePath, "a", out var original));
        clock.Advance(TimeSpan.FromMilliseconds(100));
        store.Set(FramePath, OscValue.FromFloat(.3f), Source("b"));
        Assert.True(store.TryGetLatest(FramePath, "b", out var otherSource));
        Assert.Equal(original.ChangedAtMs + 100, otherSource.ChangedAtMs);

        clock.Advance(TimeSpan.FromMilliseconds(200));
        store.Set(FramePath, OscValue.FromFloat(.4f), Source("a"));
        Assert.True(store.TryGetLatest(FramePath, "a", out var changed));
        Assert.Equal(original.ChangedAtMs + 300, changed.ChangedAtMs);
        Assert.Equal(changed.TimestampMs, changed.ChangedAtMs);
        Assert.True(store.TryGetLatest(FramePath, "b", out var unchangedSource));
        Assert.Equal(otherSource, unchangedSource);
        Assert.True(store.TryGetLatest("Other", "a", out var unchangedPath));
        Assert.Equal(original.ChangedAtMs, unchangedPath.ChangedAtMs);
    }

    [Fact]
    public void Interleaved_sources_preserve_each_sources_order_without_changing_global_order()
    {
        var store = new OscParameterStore(new ManualTimeProvider());
        var fields = new[] { "Valid", "Frame", "X", "Y", "Z", "Producer", "Profile" };
        for (var index = 0; index < fields.Length; index++)
        {
            store.Set("A/" + fields[index], OscValue.FromInt(index), Source("a"));
            store.Set("Unrelated", OscValue.FromInt(index), Source("b"));
        }
        var packet = fields.Select(field =>
        {
            Assert.True(store.TryGetLatest("A/" + field, "a", out var entry));
            return entry;
        }).ToArray();
        Assert.Equal(Enumerable.Range(1, 7).Select(value => (long)value), packet.Select(entry => entry.SourceSequence));
        Assert.Equal(new long[] { 1, 3, 5, 7, 9, 11, 13 }, packet.Select(entry => entry.Sequence));
        Assert.True(store.TryGetLatest("Unrelated", "b", out var lastOther));
        Assert.Equal(7, lastOther.SourceSequence);
        Assert.Equal(14, lastOther.Sequence);
    }

    [Fact]
    public void Source_order_resets_on_removal_without_resetting_another_live_source_or_global_order()
    {
        var clock = new ManualTimeProvider();
        var store = new OscParameterStore(clock);
        void Put(string source) => store.Set(FramePath, OscValue.FromInt(1), Source(source));
        OscParameterStore.Entry Read(string source)
        {
            Assert.True(store.TryGetLatest(FramePath, source, out var entry));
            return entry;
        }
        Put("a"); Put("b"); Put("a"); Put("b");
        var before = Read("b");
        store.ClearSource("a"); Put("a"); Put("b");
        Assert.Equal(1, Read("a").SourceSequence);
        Assert.Equal(before.SourceSequence + 1, Read("b").SourceSequence);
        Assert.True(Read("a").Sequence > before.Sequence);
        store.Clear(); Put("b");
        Assert.Equal(1, Read("b").SourceSequence);
        Assert.True(Read("b").Sequence > before.Sequence);

        // Expiration also removes the bounded source counter. / 过期也清除有界来源计数。
        clock.Advance(TimeSpan.FromMinutes(6));
        Put("fresh"); Put("b");
        Assert.Equal(1, Read("b").SourceSequence);
    }

    [Fact]
    public void Clearing_a_source_or_store_discards_previous_content_age()
    {
        var clock = new ManualTimeProvider();
        var store = new OscParameterStore(clock);
        store.Set(FramePath, OscValue.FromFloat(.3f), Source("a"));
        Assert.True(store.TryGetLatest(FramePath, "a", out var first));
        clock.Advance(TimeSpan.FromMilliseconds(100));
        store.ClearSource("a");
        store.Set(FramePath, OscValue.FromFloat(.3f), Source("a"));
        Assert.True(store.TryGetLatest(FramePath, "a", out var recreated));
        Assert.Equal(first.ChangedAtMs + 100, recreated.ChangedAtMs);

        clock.Advance(TimeSpan.FromMilliseconds(200));
        store.Clear();
        store.Set(FramePath, OscValue.FromFloat(.3f), Source("a"));
        Assert.True(store.TryGetLatest(FramePath, "a", out var cleared));
        Assert.Equal(first.ChangedAtMs + 300, cleared.ChangedAtMs);
    }
}
