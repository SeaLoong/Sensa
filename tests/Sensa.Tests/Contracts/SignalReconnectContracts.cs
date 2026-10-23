using System.Collections.Concurrent;
using System.Text.Json;
using Sensa.Configuration;
using Sensa.Outputs;
using Sensa.Outputs.Adapters;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Reconnect contracts use injected adapters; no socket or device is opened.</summary>
public sealed class SignalReconnectContracts
{
    [Fact]
    public async Task A_failed_write_locks_the_destination_until_an_explicit_connection_request()
    {
        var failed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var adapter = new FakeAdapter { Write = _ => throw new IOException("simulated write failure") };
        await using var rig = new Rig([adapter], _ => failed.TrySetResult());
        Assert.True(await rig.Coordinator.ConnectAsync("output"));
        rig.Publish(.4f);
        await failed.Task.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.False(rig.Coordinator.IsConnected("output"));
        Assert.Equal("error", rig.Snapshot.GetProperty("status").GetString());
        rig.Advance(); rig.Publish(.8f); rig.Advance(); rig.Publish(.2f);
        Assert.Equal(1, rig.FactoryCalls); Assert.Equal(1, adapter.ConnectCalls);
        Assert.Single(adapter.Attempts); Assert.Empty(adapter.Delivered);
    }

    [Fact]
    public async Task Explicit_reconnection_discards_queued_values_and_allows_a_fresh_unchanged_target()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var failed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = new FakeAdapter
        {
            Write = async value =>
            {
                if (value.Value > .7) { entered.TrySetResult(); await release.Task; throw new IOException("simulated write failure"); }
            },
        };
        var replacement = new FakeAdapter();
        await using var rig = new Rig([first, replacement], _ => failed.TrySetResult());
        try
        {
            Assert.True(await rig.Coordinator.ConnectAsync("output"));
            rig.Publish(.4f); await WaitUntil(() => first.Delivered.Count == 1);
            rig.Advance(); rig.Publish(.8f); await entered.Task.WaitAsync(TimeSpan.FromSeconds(2));
            rig.Advance(); rig.Publish(.6f);
            release.TrySetResult(); await failed.Task.WaitAsync(TimeSpan.FromSeconds(2));
            Assert.True(await rig.Coordinator.ConnectAsync("output"));
            Assert.True(first.Disposed); Assert.Equal(2, rig.FactoryCalls);
            Assert.Empty(replacement.Attempts);
            rig.Advance(); rig.Publish(.4f);
            await WaitUntil(() => replacement.Delivered.Count == 1);
            Assert.Equal(.4, Assert.Single(replacement.Delivered).Value, 5);
            Assert.Equal(2, first.Attempts.Count);
        }
        finally { release.TrySetResult(); }
    }

    [Fact]
    public async Task A_passively_closed_adapter_reports_disconnected_and_does_not_reconnect_when_published()
    {
        var adapter = new FakeAdapter(); await using var rig = new Rig([adapter]);
        Assert.True(await rig.Coordinator.ConnectAsync("output"));
        Assert.Equal("connected", rig.Snapshot.GetProperty("status").GetString());
        adapter.Connected = false;
        Assert.False(rig.Coordinator.IsConnected("output"));
        Assert.False(rig.Snapshot.GetProperty("connected").GetBoolean());
        Assert.Equal("disconnected", rig.Snapshot.GetProperty("status").GetString());
        Assert.Equal(0, rig.Coordinator.ReadFeedback("output/connected", rig.Now).Value);
        rig.Publish(.9f);
        Assert.Empty(adapter.Attempts); Assert.Equal(1, rig.FactoryCalls); Assert.Equal(1, adapter.ConnectCalls);
    }

    [Fact]
    public async Task Invalid_input_sends_the_configured_stop_value_again_after_reconnection()
    {
        var first = new FakeAdapter(); var replacement = new FakeAdapter();
        await using var rig = new Rig([first, replacement]);
        Assert.True(await rig.Coordinator.ConnectAsync("output"));
        rig.PublishInvalid(); await WaitUntil(() => first.Delivered.Count == 1);
        Assert.Equal(.125, Assert.Single(first.Delivered).Value);
        first.Connected = false;
        Assert.True(await rig.Coordinator.ConnectAsync("output"));
        Assert.Empty(replacement.Attempts);
        rig.Advance(); rig.PublishInvalid();
        await WaitUntil(() => replacement.Delivered.Count == 1);
        Assert.Equal(.125, Assert.Single(replacement.Delivered).Value);
        Assert.False(rig.Snapshot.GetProperty("routes")[0].GetProperty("valid").GetBoolean());
    }

    private static async Task WaitUntil(Func<bool> condition)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        while (!condition()) await Task.Delay(1, deadline.Token);
    }

    private sealed class Rig : IAsyncDisposable
    {
        private readonly ManualTimeProvider _clock = new();
        private int _factoryCalls;
        public SignalOutputCoordinator Coordinator { get; }
        public int FactoryCalls => Volatile.Read(ref _factoryCalls);
        public long Now => _clock.GetUtcNow().ToUnixTimeMilliseconds();
        public JsonElement Snapshot => JsonSerializer.SerializeToElement(Coordinator.Snapshot("output"), new JsonSerializerOptions(JsonSerializerDefaults.Web));

        public Rig(FakeAdapter[] adapters, Action<string>? error = null)
        {
            var remaining = new Queue<FakeAdapter>(adapters);
            var config = new AppConfig
            {
                Outputs = [new()
                {
                    Id = "output", Type = OutputDeviceType.OscParameter, Enabled = true,
                    Signal = new() { Bindings = [new()
                    {
                        Id = "amount", Source = new() { SourceMode = "Manual", OscPath = "V0" },
                        Address = "/amount", StopValue = .125,
                    }] },
                }],
            };
            Coordinator = new(config, _ => false, (_, _) => Task.CompletedTask, _ => Task.CompletedTask,
                error: error, clock: _clock, adapterFactory: output =>
                {
                    Assert.Equal("output", output.Id); Interlocked.Increment(ref _factoryCalls);
                    return remaining.Dequeue();
                }) { CanSend = () => true };
        }
        public void Publish(float value) => Coordinator.Publish(_ => ComputedSignalSample.Success(value, null, Now), Now);
        public void PublishInvalid() => Coordinator.Publish(_ => ComputedSignalSample.Invalid("waiting for input"), Now);
        public void Advance() => _clock.Advance(TimeSpan.FromMilliseconds(100));
        public ValueTask DisposeAsync() => Coordinator.DisposeAsync();
    }

    private sealed class FakeAdapter : ISignalOutputAdapter
    {
        public volatile bool Connected;
        public bool Disposed { get; private set; }
        public int ConnectCalls { get; private set; }
        public Func<SignalOutputValue, ValueTask>? Write { get; init; }
        public ConcurrentQueue<SignalOutputValue> Attempts { get; } = new();
        public ConcurrentQueue<SignalOutputValue> Delivered { get; } = new();
        public bool IsConnected => Connected;
        public Task ConnectAsync(CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested(); ConnectCalls++; Connected = true; return Task.CompletedTask;
        }
        public async ValueTask SendAsync(SignalOutputValue value, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!Connected) throw new InvalidOperationException("adapter is disconnected");
            Attempts.Enqueue(value);
            if (Write is not null) await Write(value);
            Delivered.Enqueue(value);
        }
        public ValueTask StopAsync(CancellationToken cancellationToken = default) => ValueTask.CompletedTask;
        public ValueTask DisposeAsync() { Connected = false; Disposed = true; return ValueTask.CompletedTask; }
    }
}
