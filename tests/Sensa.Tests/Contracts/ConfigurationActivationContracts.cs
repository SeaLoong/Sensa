using System.Text.Json;
using Sensa.Application;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Input.Script;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Recording;
using Sensa.Runtime;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests.Contracts;

public sealed class ConfigurationActivationContracts
{
    private sealed class PausableTimeProvider : TimeProvider
    {
        private readonly ManualTimeProvider _clock = new();
        private int _pauseNextUtcRead;
        public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public void PauseNextUtcRead() => Interlocked.Exchange(ref _pauseNextUtcRead, 1);
        public override long TimestampFrequency => _clock.TimestampFrequency;
        public override long GetTimestamp() => _clock.GetTimestamp();
        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period) =>
            _clock.CreateTimer(callback, state, dueTime, period);
        public override DateTimeOffset GetUtcNow()
        {
            if (Interlocked.Exchange(ref _pauseNextUtcRead, 0) != 0)
            {
                Entered.TrySetResult();
                Release.Task.WaitAsync(TimeSpan.FromSeconds(5)).GetAwaiter().GetResult();
            }
            return _clock.GetUtcNow();
        }
    }

    private sealed class NullMotionOutput : IMotionOutput
    {
        public Task SendAsync(MotionFrame frame) => Task.CompletedTask;
        public Task EmergencyStopAsync() => Task.CompletedTask;
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Configuration_application_rejects_parallel_activation_until_success_or_rollback_finishes(bool failPersistence)
    {
        var config = new AppConfig { Outputs = [] };
        config.WebUi.Title = "previous";
        var clock = new ManualTimeProvider();
        using var player = new FunscriptPlayer(clock);
        using var runtime = new MotionRuntime(config, new OscParameterStore(clock), new NullMotionOutput(),
            scriptPlayer: player, timeProvider: clock);
        await using var outputs = new OutputCoordinator(config, _ => { }, _ => { }, _ => { });
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var update = new ConfigurationUpdate(config, runtime, outputs, (_, _) => { }, () => { }, _ =>
        {
            entered.TrySetResult();
            release.Task.GetAwaiter().GetResult();
            if (failPersistence) throw new IOException("controlled persistence failure");
        }, _ => { });
        var application = new SensaApplication(config, runtime, player, new MotionRecorder(clock), outputs,
            new ApplicationHost(() => new { }, () => new { }, () => new { }, update.ApplyAsync, _ => new { },
                () => Task.FromResult<object>(new { }), () => { }, () => false, () => { }, _ => { }, _ => { }, _ => { }));
        runtime.SetInputActive(true);
        var candidate = new AppConfig();
        candidate.CopyFrom(config);
        candidate.WebUi.Title = "candidate";
        var applying = Task.Run(() => application.ExecuteAsync("PUT", "/api/config", JsonSerializer.SerializeToElement(candidate)));
        try
        {
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            Assert.False(runtime.InputActive);
            var activation = await application.ExecuteAsync("PUT", "/api/input/active", JsonSerializer.SerializeToElement(new { active = true }))
                .WaitAsync(TimeSpan.FromSeconds(3));
            Assert.False(activation.Success);
            Assert.Contains("Updating input setup", JsonSerializer.Serialize(activation.Data));
            Assert.False(runtime.InputActive);
            Assert.False(runtime.CanSend);
            Assert.False(runtime.CanRouteSignals);

            // Neither emergency stop nor clearing it waits for configuration persistence.
            Assert.True((await application.ExecuteAsync("POST", "/api/control/runtime/emergency-stop")
                .WaitAsync(TimeSpan.FromSeconds(3))).Success);
            Assert.True(runtime.IsEmergency);
            Assert.True((await application.ExecuteAsync("POST", "/api/control/runtime/clear-emergency")
                .WaitAsync(TimeSpan.FromSeconds(3))).Success);
            Assert.False(runtime.InputActive);
            Assert.False(runtime.IsEmergency);
        }
        finally { release.TrySetResult(); }
        var applied = await applying.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(!failPersistence, applied.Success);
        Assert.Equal(failPersistence ? "previous" : "candidate", config.WebUi.Title);
        Assert.False(runtime.InputActive);
        Assert.False(runtime.CanRouteSignals);
        Assert.True((await application.ExecuteAsync("PUT", "/api/input/active", JsonSerializer.SerializeToElement(new { active = true }))).Success);
        Assert.True(runtime.InputActive);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A_prepared_activation_cannot_resume_after_an_entire_configuration_transaction(bool failPersistence)
    {
        var config = new AppConfig { Outputs = [] };
        var clock = new PausableTimeProvider();
        using var player = new FunscriptPlayer(clock);
        using var runtime = new MotionRuntime(config, new OscParameterStore(clock), new NullMotionOutput(),
            scriptPlayer: player, timeProvider: clock);
        await using var outputs = new OutputCoordinator(config, _ => { }, _ => { }, _ => { });
        var update = new ConfigurationUpdate(config, runtime, outputs, (_, _) => { }, () => { }, _ =>
        {
            if (failPersistence) throw new IOException("controlled persistence failure");
        }, _ => { });
        var candidate = new AppConfig();
        candidate.CopyFrom(config);
        candidate.WebUi.Title = "changed while activation was preparing";
        clock.PauseNextUtcRead();
        var activating = Task.Run(() => Record.Exception(() => runtime.SetInputActive(true)));
        try
        {
            await clock.Entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            if (failPersistence) await Assert.ThrowsAsync<IOException>(() => update.ApplyAsync(candidate));
            else await update.ApplyAsync(candidate);
            Assert.False(runtime.InputActive);
        }
        finally { clock.Release.TrySetResult(); }
        var failure = await activating.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.IsType<InvalidOperationException>(failure);
        Assert.Contains("Input state changed", failure.Message);
        Assert.False(runtime.InputActive);
        Assert.False(runtime.CanSend);
        Assert.False(runtime.CanRouteSignals);
        runtime.SetInputActive(true);
        Assert.True(runtime.InputActive);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Emergency_stop_revokes_a_prepared_activation_even_after_the_emergency_is_cleared(bool clearEmergency)
    {
        var config = new AppConfig { Outputs = [] };
        var clock = new PausableTimeProvider();
        using var player = new FunscriptPlayer(clock);
        using var runtime = new MotionRuntime(config, new OscParameterStore(clock), new NullMotionOutput(),
            scriptPlayer: player, timeProvider: clock);
        clock.PauseNextUtcRead();
        var activating = Task.Run(() => Record.Exception(() => runtime.SetInputActive(true)));
        try
        {
            await clock.Entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            runtime.EmergencyStop();
            Assert.True(runtime.IsEmergency);
            if (clearEmergency) runtime.ClearEmergency();
        }
        finally { clock.Release.TrySetResult(); }
        var failure = await activating.WaitAsync(TimeSpan.FromSeconds(3));
        if (clearEmergency) Assert.IsType<InvalidOperationException>(failure);
        else Assert.Null(failure);
        Assert.False(runtime.InputActive);
        Assert.False(runtime.CanSend);
        Assert.False(runtime.CanRouteSignals);
        runtime.ClearEmergency();
        Assert.False(runtime.InputActive);
        runtime.SetInputActive(true);
        Assert.True(runtime.InputActive);
    }
}
