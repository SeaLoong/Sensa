using Sensa.Input.Osc;
using Sensa.Signals;
using Sensa.Tests.Support;
using UnityBox.Sensa;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class OscCatalogContracts
{
    private static OscSource Source(string key) => new(key, key, null, "127.0.0.1", 19000);

    [Fact]
    public void Capacity_counts_path_source_pairs_and_releases_slots_after_source_or_avatar_clear()
    {
        var store = new OscParameterStore(new ManualTimeProvider());
        for (var i = 0; i < OscParameterStore.MaxPaths / 2; i++)
            foreach (var source in new[] { Source("a"), Source("b") })
                store.Set("FT/" + i, OscValue.FromInt(i), source);
        store.Set("FT/0", OscValue.FromInt(42), Source("a"));
        store.Set("overflow", OscValue.FromInt(1), Source("a"));
        Assert.Equal(OscParameterStore.MaxPaths, store.SnapshotEntries().Length);
        Assert.True(store.TryGetLatest("FT/0", "a", out var updated));
        Assert.Equal(42, updated.Value.AsFloat());
        Assert.False(store.TryGetLatest("overflow", out _));
        Assert.All(store.SnapshotSources(), source => Assert.Equal(2048, source.ParameterCount));

        store.ClearSource("a");
        store.ClearSource("already-absent");
        for (var i = 0; i < OscParameterStore.MaxPaths / 2; i++)
            store.Set("New/" + i, OscValue.FromInt(i), Source("c"));
        Assert.Equal(OscParameterStore.MaxPaths, store.SnapshotEntries().Length);
        Assert.Equal(new[] { "b", "c" }, store.SnapshotSources().Select(s => s.Key).Order().ToArray());
        Assert.All(store.SnapshotSources(), source => Assert.Equal(2048, source.ParameterCount));
        store.ChangeAvatar();
        Assert.Empty(store.SnapshotSources());
        for (var i = 0; i < OscParameterStore.MaxPaths; i++) store.Set("Reloaded/" + i, OscValue.FromInt(i));
        Assert.Equal(OscParameterStore.MaxPaths, Assert.Single(store.SnapshotSources()).ParameterCount);
    }

    [Fact]
    public void Source_activity_keeps_stationary_channels_but_expires_only_idle_sources()
    {
        var clock = new ManualTimeProvider();
        var store = new OscParameterStore(clock);
        store.Set("stationary", OscValue.FromFloat(.5f), Source("live"));
        store.Set("old", OscValue.FromInt(1), Source("idle"));
        var initial = Assert.Single(store.MatchingEntries("stationary", "live")).Entry;
        clock.Advance(TimeSpan.FromMinutes(4));
        store.Set("heartbeat", OscValue.FromInt(1), Source("live"));
        clock.Advance(TimeSpan.FromMinutes(2));
        store.Set("other", OscValue.FromInt(2), Source("new"));
        Assert.Equal(new[] { "live", "new" }, store.SnapshotSources().Select(s => s.Key).Order().ToArray());
        var live = Assert.Single(store.SnapshotSources(), source => source.Key == "live");
        Assert.Equal(2, live.ParameterCount);
        Assert.Equal(initial, Assert.Single(store.MatchingEntries("stationary", "live")).Entry);
        Assert.Equal(clock.GetUtcNow().Subtract(TimeSpan.FromMinutes(2)).ToUnixTimeMilliseconds(), live.LastSeenTimestampMs);
        Assert.False(store.TryGetLatest("old", out _));
        Assert.Equal(store.SnapshotSources(), OscParameterStore.SourcesFromSnapshot(store.SnapshotEntries()));
    }

    [Fact]
    public void Source_metadata_uses_receive_sequence_even_with_equal_timestamps_and_reversed_snapshots()
    {
        var store = new OscParameterStore(new ManualTimeProvider());
        store.Set("first", OscValue.FromInt(1), new("a", "old", "old-avatar", "127.0.0.1", 19000));
        store.Set("second", OscValue.FromInt(1), new("a", "new", "new-avatar", "127.0.0.2", 19001));
        var expected = Assert.Single(store.SnapshotSources());
        Assert.Equal("new", expected.Label);
        Assert.Equal("new-avatar", expected.PersistentId);
        var entries = store.SnapshotEntries();
        Assert.Equal(expected, Assert.Single(OscParameterStore.SourcesFromSnapshot(entries)));
        Assert.Equal(expected, Assert.Single(OscParameterStore.SourcesFromSnapshot(entries.Reverse().ToArray())));
    }

    [Fact]
    public void Exact_matching_and_source_summaries_do_not_allocate_full_catalog_copies()
    {
        var store = new OscParameterStore(new ManualTimeProvider());
        for (var i = 0; i < 4096; i++) store.Set("FT/" + i, OscValue.FromInt(i));
        _ = store.MatchingEntries("FT/100");
        _ = store.SnapshotSources();
        var before = GC.GetAllocatedBytesForCurrentThread();
        for (var i = 0; i < 20; i++)
        {
            _ = store.MatchingEntries("FT/100");
            _ = store.SnapshotSources();
        }
        var allocated = GC.GetAllocatedBytesForCurrentThread() - before;
        // This is an allocation bound, not a wall-clock timing test. A full
        // 4096-entry snapshot per lookup used tens of megabytes for this workload.
        Assert.InRange(allocated, 0, 128_000);
    }

    [Fact]
    public void Scoped_matching_preserves_aliases_wildcards_and_source_identity_in_a_large_catalog()
    {
        var store = new OscParameterStore(new ManualTimeProvider());
        for (var i = 0; i < 4000; i++) store.Set("FT/Expression/" + i, OscValue.FromInt(i), Source("face"));
        foreach (var source in new[] { Source("a"), Source("b") })
            foreach (var path in new[] { "Target/Depth", "Target/Angle", "Target/*", "Other/Depth" })
                store.Set(path, OscValue.FromFloat(.5f), source);
        var snapshot = store.SnapshotEntries();
        var patterns = new[] { "Target/Depth", "missing", "Target/*", "Target/**; Target/Depth\n Other/Depth", "**/Depth",
            "", " ", string.Join(';', Enumerable.Repeat("missing", 32).Append("Target/Depth")) };
        foreach (var pattern in patterns)
            foreach (var source in new string?[] { null, " ", "a", " a ", "missing" })
            {
                var expected = snapshot.Where(entry => (string.IsNullOrWhiteSpace(source) || entry.Entry.Source.Key == source)
                    && OscParameterStore.MatchesPathPattern(pattern, entry.Path)).OrderBy(e => e.Path).ThenBy(e => e.Entry.Source.Key).ToArray();
                var actual = store.MatchingEntries(pattern, source).OrderBy(e => e.Path).ThenBy(e => e.Entry.Source.Key).ToArray();
                Assert.Equal(expected, actual);
            }
        Assert.Equal(2, store.MatchingEntries("Target/Depth;Target/Depth").Length);
        var captured = store.MatchingEntries("Target/Depth", "a");
        store.Set("Target/Depth", OscValue.FromFloat(.9f), Source("a"));
        Assert.Equal(.5f, Assert.Single(captured).Entry.Value.AsFloat());
    }

    [Fact]
    public void Prefix_snapshots_exclude_expression_parameters_and_preserve_pose_source_and_receive_metadata()
    {
        var clock = new ManualTimeProvider();
        var store = new OscParameterStore(clock);
        for (var i = 0; i < 4000; i++) store.Set("FT/" + i, OscValue.FromInt(i), Source("face"));
        SpatialSamples.Pose(store, new(0, 0, -.1), new(0, 0, .1), new(.03, 0, -.1));
        store.Set("Sensa/Pose/v1Fake/Root/A0", OscValue.FromFloat(.5f), Source("other"));
        var prefix = SensaPoseProtocol.Prefix + "/";
        var full = store.SnapshotEntries();
        var scoped = store.SnapshotEntries(prefix, "test");
        Assert.Equal(24, scoped.Length);
        Assert.Equal(full.Where(e => e.Path.StartsWith(prefix, StringComparison.Ordinal) && e.Entry.Source.Key == "test")
            .OrderBy(e => e.Path), scoped.OrderBy(e => e.Path));
        Assert.Empty(store.SnapshotEntries(prefix, "missing"));
        Assert.Equal(PoseReconstruction.Observe(full, "test"), PoseReconstruction.Observe(scoped, "test"));
        var before = GC.GetAllocatedBytesForCurrentThread();
        for (var i = 0; i < 20; i++) _ = store.SnapshotEntries("NoPose/");
        Assert.InRange(GC.GetAllocatedBytesForCurrentThread() - before, 0, 128_000);
        clock.Advance(TimeSpan.FromMilliseconds(1001));
        Assert.Equal(scoped.OrderBy(e => e.Path), store.SnapshotEntries(prefix, "test").OrderBy(e => e.Path));
        store.ChangeAvatar("test");
        Assert.Empty(store.SnapshotEntries(prefix));
    }

    [Fact]
    public async Task Concurrent_receivers_and_source_clear_leave_consistent_catalog_accounting()
    {
        var store = new OscParameterStore(new ManualTimeProvider());
        await Task.WhenAll(Enumerable.Range(0, 8).Select(source => Task.Run(() =>
        {
            for (var i = 0; i < 700; i++) store.Set("FT/" + i, OscValue.FromInt(i), Source("s" + source));
            if (source % 2 == 0) store.ClearSource("s" + source);
        })));
        var entries = store.SnapshotEntries();
        Assert.InRange(entries.Length, 1, OscParameterStore.MaxPaths);
        var sources = store.SnapshotSources();
        Assert.Equal(entries.Length, sources.Sum(source => source.ParameterCount));
        foreach (var source in sources)
            Assert.Equal(entries.Count(entry => entry.Entry.Source.Key == source.Key), source.ParameterCount);
        store.Clear();
        store.Set("after-clear", OscValue.FromInt(1));
        Assert.Equal(1, Assert.Single(store.SnapshotSources()).ParameterCount);
    }

    [Theory]
    [InlineData("Sensa/Point/v1/Bone/Self")]
    [InlineData("Sensa/Handle/v1/Grip/Self")]
    public void Large_expression_catalog_does_not_change_local_point_freshness_or_display_range(string prefix)
    {
        var clock = new ManualTimeProvider();
        var store = new OscParameterStore(clock);
        for (var i = 0; i < 4000; i++) store.Set("FT/" + i, OscValue.FromInt(i), Source("face"));
        SpatialSamples.Point(store, prefix, new(1.1, .2, -.3));
        if (prefix.Contains("Handle")) store.Set(prefix + "/Handle_IsGrabbed", OscValue.FromBool(true), Source("test"));
        var point = Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries(), "test", 1000, clock));
        Assert.True(point.Valid, point.Reason);
        Assert.Equal(SensaPoseProtocol.PositionRadius, point.DisplayHalfRange);
        Assert.True(point.Position.Length <= point.DisplayHalfRange);
        clock.Advance(TimeSpan.FromMilliseconds(1001));
        store.Set("FT/0", OscValue.FromInt(23), Source("face"));
        Assert.False(Assert.Single(SpsPositionTracking.Observe(store.SnapshotEntries(), "test", 1000, clock)).Valid);
    }
}
