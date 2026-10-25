using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Sensa.Configuration;
using Sensa.Motion;
using Sensa.Outputs;
using Sensa.Recording;
using Sensa.Signals;
using Sensa.Tests.Support;
using Xunit;

namespace Sensa.Tests;

[CollectionDefinition("Signal session files", DisableParallelization = true)]
public sealed class SignalSessionFileCollection { }

/// <summary>Only in-memory callbacks, temporary session files and loopback UDP peers are used.</summary>
[Collection("Signal session files")]
public sealed class SignalOutputRoutingContracts
{
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);
    private static SignalOutputBinding Binding(string id, string path, string address) => new()
    {
        Id = id, Name = id, Address = address,
        Source = new() { SourceMode = "Manual", OscPath = path },
    };
    private static OutputDeviceConfig Osc(string id, int port, params SignalOutputBinding[] bindings) => new()
    {
        Id = id, Type = OutputDeviceType.OscParameter, Enabled = true, Host = "127.0.0.1", Port = port,
        Signal = new() { Bindings = bindings.ToList() },
    };
    private static long Now(ManualTimeProvider clock) => clock.GetUtcNow().ToUnixTimeMilliseconds();
    private static int Port(UdpClient listener) => ((IPEndPoint)listener.Client.LocalEndPoint!).Port;
    private static UdpClient Listener() => new(new IPEndPoint(IPAddress.Loopback, 0));
    private static JsonElement Snapshot(SignalOutputCoordinator coordinator, string id) =>
        JsonSerializer.SerializeToElement(coordinator.Snapshot(id), WebJson);
    private static SignalOutputCoordinator Coordinator(AppConfig config, ManualTimeProvider clock) =>
        new(config, _ => false, (_, _) => Task.CompletedTask, _ => Task.CompletedTask, clock: clock) { CanSend = () => true };

    private static async Task<(string Address, double Value, IPEndPoint Sender)> Receive(UdpClient listener)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        var packet = await listener.ReceiveAsync(timeout.Token);
        var bytes = packet.Buffer;
        var addressEnd = Array.IndexOf(bytes, (byte)0);
        Assert.True(addressEnd > 0);
        var address = Encoding.UTF8.GetString(bytes, 0, addressEnd);
        var tagsAt = (addressEnd + 4) & ~3;
        var tagsEnd = Array.IndexOf(bytes, (byte)0, tagsAt);
        Assert.True(tagsEnd > tagsAt);
        var tags = Encoding.UTF8.GetString(bytes, tagsAt, tagsEnd - tagsAt);
        var dataAt = (tagsEnd + 4) & ~3;
        var value = tags switch
        {
            ",f" => BitConverter.Int32BitsToSingle(BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(dataAt))),
            ",i" => BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(dataAt)),
            ",T" => 1d,
            ",F" => 0d,
            _ => throw new InvalidDataException("Unexpected OSC wire type: " + tags),
        };
        return (address, value, packet.RemoteEndPoint);
    }

    [Fact]
    public async Task An_invalid_route_sends_its_stop_value_without_interrupting_its_sibling()
    {
        using var listener = Listener();
        var clock = new ManualTimeProvider();
        var first = Binding("first", "L0", "/avatar/parameters/First"); first.StopValue = .15;
        var second = Binding("second", "R0", "/avatar/parameters/Second");
        second.InputMin = 10; second.InputMax = 20; second.OutputMin = 2; second.OutputMax = 4;
        var config = new AppConfig { Outputs = [Osc("osc", Port(listener), first, second)] };
        await using var coordinator = Coordinator(config, clock);
        Assert.True(await coordinator.ConnectAsync("osc"));
        coordinator.Publish(input => ComputedSignalSample.Success(input.OscPath == "L0" ? .8f : 15, null, Now(clock)), Now(clock));
        var initial = new[] { await Receive(listener), await Receive(listener) }.ToDictionary(row => row.Address, row => row.Value);
        Assert.Equal(.8, initial[first.Address], 5); Assert.Equal(3, initial[second.Address]);

        clock.Advance(TimeSpan.FromMilliseconds(100));
        coordinator.Publish(input => input.OscPath == "L0" ? ComputedSignalSample.Invalid("source expired")
            : ComputedSignalSample.Success(20, null, Now(clock)), Now(clock));
        var changed = new[] { await Receive(listener), await Receive(listener) }.ToDictionary(row => row.Address, row => row.Value);
        Assert.Equal(.15, changed[first.Address], 5); Assert.Equal(4, changed[second.Address]);
        var routes = Snapshot(coordinator, "osc").GetProperty("routes").EnumerateArray().ToDictionary(row => row.GetProperty("id").GetString()!);
        Assert.False(routes["first"].GetProperty("valid").GetBoolean());
        Assert.Equal("source expired", routes["first"].GetProperty("reason").GetString());
        Assert.True(routes["second"].GetProperty("valid").GetBoolean());
        Assert.Equal(4, routes["second"].GetProperty("value").GetDouble());
    }

    [Fact]
    public async Task Stop_uses_the_configured_value_and_a_new_generation_can_resend_the_same_target()
    {
        using var listener = Listener(); var clock = new ManualTimeProvider(); var active = true;
        var binding = Binding("strength", "L0", "/feedback/strength"); binding.StopValue = .25;
        await using var coordinator = Coordinator(new() { Outputs = [Osc("osc", Port(listener), binding)] }, clock);
        coordinator.CanSend = () => active;
        Assert.True(await coordinator.ConnectAsync("osc"));
        coordinator.Publish(_ => ComputedSignalSample.Success(.8f, null, Now(clock)), Now(clock));
        Assert.Equal(.8, (await Receive(listener)).Value, 5);
        active = false;
        await coordinator.StopAsync();
        Assert.Equal(.25, (await Receive(listener)).Value);
        Assert.True(coordinator.IsConnected("osc"));
        Assert.Equal(1, coordinator.ReadFeedback("osc/connected", Now(clock)).Value);
        active = true; clock.Advance(TimeSpan.FromMilliseconds(100));
        coordinator.Publish(_ => ComputedSignalSample.Success(.8f, null, Now(clock)), Now(clock));
        Assert.Equal(.8, (await Receive(listener)).Value, 5);
    }

    [Fact]
    public async Task Stop_waits_for_an_irreversible_motion_write_and_discards_queued_old_values()
    {
        var clock = new ManualTimeProvider(); var active = true;
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var fresh = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var events = new ConcurrentQueue<string>(); var calls = 0;
        var output = new OutputDeviceConfig { Id = "motion", Type = OutputDeviceType.TCodeUdp, Enabled = true,
            Signal = new() { Bindings = [Binding("strength", "V0", "V0")] } };
        await using var coordinator = new SignalOutputCoordinator(new() { Outputs = [output] }, _ => true,
            async (_, frame) =>
            {
                if (Interlocked.Increment(ref calls) == 1) { entered.SetResult(); await release.Task; }
                events.Enqueue("frame:" + frame.V0.ToString("R", System.Globalization.CultureInfo.InvariantCulture));
                if (frame.V0 == .4f) fresh.TrySetResult();
            }, _ => { events.Enqueue("stop"); return Task.CompletedTask; }, clock: clock) { CanSend = () => active };
        try
        {
            coordinator.Publish(_ => ComputedSignalSample.Success(.2f, null, Now(clock)), Now(clock));
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(2));
            clock.Advance(TimeSpan.FromMilliseconds(100));
            coordinator.Publish(_ => ComputedSignalSample.Success(.8f, null, Now(clock)), Now(clock));
            active = false;
            var stopping = coordinator.StopAsync();
            var completedEarly = await Task.WhenAny(stopping, Task.Delay(50));
            release.TrySetResult();
            await stopping.WaitAsync(TimeSpan.FromSeconds(2));
            Assert.NotSame(stopping, completedEarly);
            Assert.Equal(["frame:0.2", "stop"], events.ToArray());
            active = true; clock.Advance(TimeSpan.FromMilliseconds(100));
            coordinator.Publish(_ => ComputedSignalSample.Success(.4f, null, Now(clock)), Now(clock));
            await fresh.Task.WaitAsync(TimeSpan.FromSeconds(2));
            Assert.Equal(["frame:0.2", "stop", "frame:0.4"], events.ToArray());
        }
        finally { release.TrySetResult(); }
    }

    [Fact]
    public async Task Invalidation_allows_replay_lookup_while_a_binding_is_being_resolved()
    {
        var clock = new ManualTimeProvider();
        var binding = Binding("replay", "motion/L0", "L0"); binding.Source.SourceMode = "RecordingReplay";
        var output = new OutputDeviceConfig { Id = "motion", Type = OutputDeviceType.TCodeUdp, Enabled = true,
            Signal = new() { Bindings = [binding] } };
        await using var coordinator = new SignalOutputCoordinator(new() { Outputs = [output] }, _ => true,
            (_, _) => Task.CompletedTask, _ => Task.CompletedTask, clock: clock) { CanSend = () => true };
        using var releaseResolver = new ManualResetEventSlim();
        var resolving = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var invalidated = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var invalidating = new Thread(() =>
        {
            try { coordinator.Invalidate(); invalidated.SetResult(); }
            catch (Exception ex) { invalidated.SetException(ex); }
        }) { IsBackground = true };
        var publishing = Task.Factory.StartNew(() => coordinator.Publish(_ =>
        {
            resolving.SetResult();
            Assert.True(releaseResolver.Wait(TimeSpan.FromSeconds(10)), "The test must release the binding resolver.");
            return ComputedSignalSample.Invalid("No replay loaded");
        }, Now(clock)), CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
        Task<ComputedSignalSample>? lookup = null;
        var invalidationStarted = false;
        try
        {
            await resolving.Task.WaitAsync(TimeSpan.FromSeconds(5));
            invalidating.Start(); invalidationStarted = true;
            // The resolver holds the destination lock. Wait until Invalidate actually waits for it,
            // so a fast lookup cannot accidentally run before the conflicting lock acquisition.
            Assert.True(SpinWait.SpinUntil(() => (invalidating.ThreadState & ThreadState.WaitSleepJoin) != 0,
                TimeSpan.FromSeconds(5)), "Invalidation must reach the held destination lock.");
            // Probe the same coordinator lookup a RecordingReplay resolver needs. Keep it separate
            // so a regression can release the resolver in finally instead of deadlocking the runner.
            lookup = Task.Factory.StartNew(() => coordinator.ReadReplay(binding.Source.OscPath, Now(clock)),
                CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
            var completed = await Task.WhenAny(lookup, Task.Delay(TimeSpan.FromSeconds(2)));
            Assert.Same(lookup, completed);
            Assert.False((await lookup).Valid);
        }
        finally
        {
            releaseResolver.Set();
            await publishing.WaitAsync(TimeSpan.FromSeconds(5));
            if (invalidationStarted) await invalidated.Task.WaitAsync(TimeSpan.FromSeconds(5));
            if (lookup is not null) await lookup.WaitAsync(TimeSpan.FromSeconds(5));
        }
    }

    [Fact]
    public async Task Reloading_bindings_at_the_same_osc_endpoint_preserves_the_connection()
    {
        using var listener = Listener(); var clock = new ManualTimeProvider(); var active = true;
        var config = new AppConfig { Outputs = [Osc("osc", Port(listener), Binding("before", "L0", "/before"))] };
        await using var coordinator = Coordinator(config, clock); coordinator.CanSend = () => active;
        Assert.True(await coordinator.ConnectAsync("osc"));
        coordinator.Publish(_ => ComputedSignalSample.Success(.2f, null, Now(clock)), Now(clock));
        var first = await Receive(listener);
        active = false; await coordinator.StopAsync(); await Receive(listener);
        var next = Binding("after", "R0", "/after"); next.OutputMin = 10; next.OutputMax = 20;
        config.Outputs[0] = Osc("osc", Port(listener), next);
        await coordinator.ReloadAsync();
        Assert.True(coordinator.IsConnected("osc"));
        active = true; clock.Advance(TimeSpan.FromMilliseconds(100));
        coordinator.Publish(_ => ComputedSignalSample.Success(.5f, null, Now(clock)), Now(clock));
        var second = await Receive(listener);
        Assert.Equal("/before", first.Address); Assert.Equal("/after", second.Address);
        Assert.Equal(15, second.Value); Assert.Equal(first.Sender, second.Sender);
        Assert.Equal("after", Snapshot(coordinator, "osc").GetProperty("routes")[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task Queued_events_preserve_fifo_order_and_space_actual_writes_at_the_configured_rate()
    {
        var clock = new ManualTimeProvider(); var epoch = Now(clock);
        var writes = new ConcurrentQueue<long>();
        var second = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var third = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var binding = Binding("event", "V0", "V0"); binding.SendMode = "OnEvent"; binding.RateHz = 1;
        var output = new OutputDeviceConfig { Id = "motion", Type = OutputDeviceType.TCodeUdp, Enabled = true,
            Signal = new() { Bindings = [binding] } };
        await using var coordinator = new SignalOutputCoordinator(new() { Outputs = [output] }, _ => true,
            (_, _) =>
            {
                writes.Enqueue(Now(clock) - epoch);
                if (writes.Count == 2) second.TrySetResult();
                if (writes.Count == 3) third.TrySetResult();
                return Task.CompletedTask;
            }, _ => Task.CompletedTask, clock: clock) { CanSend = () => true };
        void Publish(float value) => coordinator.Publish(_ => ComputedSignalSample.Success(value, null, Now(clock)), Now(clock));
        Publish(0); Publish(1);
        Assert.Equal([0L], writes.ToArray());
        clock.Advance(TimeSpan.FromMilliseconds(100)); Publish(0); Publish(1);
        clock.Advance(TimeSpan.FromMilliseconds(100)); Publish(0); Publish(1);
        clock.Advance(TimeSpan.FromMilliseconds(800));
        await second.Task.WaitAsync(TimeSpan.FromSeconds(2));
        await WaitUntil(() => Snapshot(coordinator, "motion").GetProperty("routes")[0].GetProperty("lastSentMs").GetInt64() > epoch);
        clock.Advance(TimeSpan.FromMilliseconds(100));
        await Task.WhenAny(third.Task, Task.Delay(50));
        Assert.False(third.Task.IsCompleted, "Event rate is measured between writes, including when events wait in a queue.");
        clock.Advance(TimeSpan.FromMilliseconds(900));
        await third.Task.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.Equal([0L, 1000L, 2000L], writes.ToArray());
    }

    [Fact]
    public async Task Invalidating_a_route_discards_an_event_already_waiting_for_its_send_window()
    {
        var clock = new ManualTimeProvider();
        var writes = new ConcurrentQueue<float>();
        var stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var binding = Binding("event", "V0", "V0"); binding.SendMode = "OnEvent"; binding.RateHz = 1;
        binding.StopValue = .125;
        var output = new OutputDeviceConfig { Id = "motion", Type = OutputDeviceType.TCodeUdp, Enabled = true,
            Signal = new() { Bindings = [binding] } };
        await using var coordinator = new SignalOutputCoordinator(new() { Outputs = [output] }, _ => true,
            (_, frame) =>
            {
                writes.Enqueue(frame.V0);
                if (frame.V0 == .125f) stopped.TrySetResult();
                return Task.CompletedTask;
            }, _ => Task.CompletedTask, clock: clock) { CanSend = () => true };
        void Publish(float value) => coordinator.Publish(_ => ComputedSignalSample.Success(value, null, Now(clock)), Now(clock));
        Publish(0); Publish(1);
        Assert.Equal([1f], writes.ToArray());
        clock.Advance(TimeSpan.FromMilliseconds(100)); Publish(0); Publish(.8f);
        clock.Advance(TimeSpan.FromMilliseconds(100));
        coordinator.Publish(_ => ComputedSignalSample.Invalid("source changed"), Now(clock));
        clock.Advance(TimeSpan.FromMilliseconds(800));
        await stopped.Task.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.Equal([1f, .125f], writes.ToArray());
        Assert.False(Snapshot(coordinator, "motion").GetProperty("routes")[0].GetProperty("valid").GetBoolean());
    }

    [Fact]
    public async Task An_invalid_rate_limited_event_does_not_delay_a_valid_sibling_route()
    {
        using var listener = Listener(); var clock = new ManualTimeProvider();
        var eventBinding = Binding("event", "L0", "/event"); eventBinding.SendMode = "OnEvent"; eventBinding.RateHz = 1;
        eventBinding.StopValue = .125;
        var sibling = Binding("sibling", "R0", "/sibling");
        await using var coordinator = Coordinator(new() { Outputs = [Osc("osc", Port(listener), eventBinding, sibling)] }, clock);
        Assert.True(await coordinator.ConnectAsync("osc"));
        var eventValue = 0f; var siblingValue = .2f; var valid = true;
        void Publish() => coordinator.Publish(input => input.OscPath == "R0"
            ? ComputedSignalSample.Success(siblingValue, null, Now(clock))
            : valid ? ComputedSignalSample.Success(eventValue, null, Now(clock)) : ComputedSignalSample.Invalid("expired"), Now(clock));
        Publish(); Assert.Equal("/sibling", (await Receive(listener)).Address);
        eventValue = 1; Publish(); Assert.Equal("/event", (await Receive(listener)).Address);
        clock.Advance(TimeSpan.FromMilliseconds(100)); eventValue = 0; Publish(); eventValue = .8f; Publish();
        clock.Advance(TimeSpan.FromMilliseconds(100)); valid = false; siblingValue = .7f; Publish();
        // UdpClient reuses its receive buffer; decode each packet before receiving the next.
        async Task<(string Address, double Value, IPEndPoint Sender)[]> ReceiveBoth() =>
            [await Receive(listener), await Receive(listener)];
        var delivery = ReceiveBoth();
        try
        {
            var rows = (await delivery.WaitAsync(TimeSpan.FromSeconds(1))).ToDictionary(row => row.Address, row => row.Value);
            Assert.Equal(.125, rows["/event"]); Assert.Equal(.7, rows["/sibling"], 5);
        }
        finally
        {
            // Advance the held window even on a failed assertion so disposal cannot leave a virtual timer pending.
            clock.Advance(TimeSpan.FromSeconds(1));
            try { await delivery; } catch (OperationCanceledException) { }
        }
        Assert.Equal(0, listener.Available);
    }

    [Fact]
    public async Task Routed_motion_frames_change_only_the_bound_axis_and_invalid_input_preserves_other_axes()
    {
        var clock = new ManualTimeProvider(); var frames = new ConcurrentQueue<MotionFrame>(); var globalStops = 0;
        var depth = Binding("depth", "L0", "L0"); depth.StopValue = .125;
        var vibration = Binding("vibration", "V0", "V0");
        var output = new OutputDeviceConfig { Id = "motion", Type = OutputDeviceType.TCodeUdp, Enabled = true,
            Signal = new() { Bindings = [depth, vibration] } };
        await using var coordinator = new SignalOutputCoordinator(new() { Outputs = [output] }, _ => true,
            (_, frame) => { frames.Enqueue(frame); return Task.CompletedTask; },
            _ => { Interlocked.Increment(ref globalStops); return Task.CompletedTask; }, clock: clock) { CanSend = () => true };
        coordinator.Publish(input => ComputedSignalSample.Success(input.OscPath == "L0" ? .6f : .2f, null, Now(clock)), Now(clock));
        await WaitUntil(() => frames.Count == 2);
        var initial = frames.ToArray();
        Assert.True(initial[0].ActiveAxes?.SetEquals([MotionAxis.L0]));
        Assert.True(initial[1].ActiveAxes?.SetEquals([MotionAxis.V0]));
        clock.Advance(TimeSpan.FromMilliseconds(100));
        coordinator.Publish(input => input.OscPath == "L0" ? ComputedSignalSample.Invalid("lost depth")
            : ComputedSignalSample.Success(.8f, null, Now(clock)), Now(clock));
        await WaitUntil(() => frames.Count == 4);
        var changed = frames.ToArray()[2..];
        var stoppedAxis = Assert.Single(changed, frame => frame.ActiveAxes?.Contains(MotionAxis.L0) == true);
        Assert.Single(stoppedAxis.ActiveAxes!); Assert.Equal(.125f, stoppedAxis.L0); Assert.Equal(.2f, stoppedAxis.V0);
        var validAxis = Assert.Single(changed, frame => frame.ActiveAxes?.Contains(MotionAxis.V0) == true);
        Assert.Single(validAxis.ActiveAxes!); Assert.Equal(.125f, validAxis.L0); Assert.Equal(.8f, validAxis.V0);
        Assert.Equal(0, globalStops);
    }

    private static async Task WaitUntil(Func<bool> condition)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        while (!condition()) await Task.Delay(1, timeout.Token);
    }

    [Fact]
    public async Task Classical_tcode_outputs_keep_independent_bindings_and_do_not_receive_the_global_frame()
    {
        using var first = Listener(); using var second = Listener(); using var classic = Listener();
        var config = new AppConfig { Outputs =
        [
            new() { Id = "first", Type = OutputDeviceType.TCodeUdp, Enabled = true, Host = "127.0.0.1", Port = Port(first),
                Signal = new() { Bindings = [Binding("first-value", "L0", "L0")] } },
            new() { Id = "second", Type = OutputDeviceType.TCodeUdp, Enabled = true, Host = "127.0.0.1", Port = Port(second),
                Signal = new() { Bindings = [Binding("second-value", "R0", "L0")] } },
            new() { Id = "classic", Type = OutputDeviceType.TCodeUdp, Enabled = true, Host = "127.0.0.1", Port = Port(classic) },
        ] };
        config.NormalizeForRuntime();
        var errors = new ConcurrentQueue<string>();
        await using var coordinator = new OutputCoordinator(config, _ => { }, _ => { }, errors.Enqueue)
            { CanSend = () => true, CanRouteSignals = () => true };
        foreach (var id in new[] { "first", "second", "classic" }) Assert.True(await coordinator.ConnectAsync(id));
        await coordinator.SendAsync(MotionAxisHelper.CreateNeutralFrame() with { L0 = .9f });
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        Assert.Contains("L0899", Encoding.ASCII.GetString((await classic.ReceiveAsync(timeout.Token)).Buffer));
        Assert.Equal(0, first.Available); Assert.Equal(0, second.Available);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        coordinator.SignalOutputs.Publish(input => ComputedSignalSample.Success(input.OscPath == "L0" ? .25f : .75f, null, now), now);
        Assert.Contains("L0250", Encoding.ASCII.GetString((await first.ReceiveAsync(timeout.Token)).Buffer));
        Assert.Contains("L0749", Encoding.ASCII.GetString((await second.ReceiveAsync(timeout.Token)).Buffer));
        Assert.Equal(0, classic.Available); Assert.Empty(errors);
    }

    [Theory]
    [InlineData("Linear", .5)]
    [InlineData("EaseIn", .25)]
    [InlineData("EaseOut", .75)]
    [InlineData("SCurve", .5)]
    public void Binding_curves_apply_after_input_calibration(string curve, double expected)
    {
        var binding = Binding("mapping", "L0", "/value"); binding.InputMin = 10; binding.InputMax = 20; binding.Curve = curve;
        Assert.Equal(expected, binding.Map(15), 6);
        Assert.Equal(0, binding.Map(-100)); Assert.Equal(1, binding.Map(100));
        binding.InputMin = 20; binding.InputMax = 10;
        Assert.Equal(0, binding.Map(20)); Assert.Equal(1, binding.Map(10));
    }

    [Theory]
    [InlineData(.25, 3)]
    [InlineData(.75, 8)]
    public void Integer_binding_rounding_agrees_with_the_protocol_codec(double input, int expected)
    {
        var binding = Binding("integer", "L0", "/value"); binding.OutputMax = 10; binding.ValueType = "Int";
        Assert.Equal(expected, binding.Map(input));
        binding.ValueType = "Bool"; binding.OutputMax = 1;
        Assert.Equal(input >= .5 ? 1 : 0, binding.Map(input));
    }

    [Theory]
    [InlineData("Feedback")]
    [InlineData("/avatar/parameters/Feedback")]
    [InlineData("**/Feedback")]
    public void Osc_feedback_validation_rejects_direct_aliases_and_matching_patterns(string read)
    {
        var binding = Binding("feedback", read, "/avatar/parameters/Feedback"); binding.Source.SourceMode = "Direct";
        var config = new AppConfig { Outputs = [Osc("osc", 32123, binding)] };
        config.Outputs[0].Signal.VrChat = true;
        Assert.Throws<ArgumentException>(() => SignalOutputConfiguration.Validate(config));
        binding.Address = "/avatar/parameters/SeparateResult";
        SignalOutputConfiguration.Validate(config);
    }

    [Fact]
    public void Osc_feedback_validation_follows_indirect_computation_dependencies()
    {
        var binding = Binding("feedback", "second", "/avatar/parameters/Feedback"); binding.Source.SourceMode = "Computed";
        var config = new AppConfig
        {
            ComputedSignals =
            [
                new() { Id = "first", Operation = ComputedSignalOperation.Sum, Inputs = [new() { OscPath = "Feedback" }] },
                new() { Id = "second", Operation = ComputedSignalOperation.Product,
                    Inputs = [new() { SourceMode = "Computed", OscPath = "first" }, new() { SourceMode = "Constant", Value = .5f }] },
            ],
            Outputs = [Osc("osc", 32123, binding)],
        };
        config.Outputs[0].Signal.VrChat = true;
        Assert.Throws<ArgumentException>(() => SignalOutputConfiguration.Validate(config));
        binding.Address = "/avatar/parameters/SeparateResult";
        SignalOutputConfiguration.Validate(config);
    }

    [Fact]
    public void Vrchat_shortcut_validates_the_actual_local_udp_target()
    {
        var output = Osc("osc", 32123, Binding("feedback", "L0", "/avatar/parameters/Feedback")); output.Signal.VrChat = true;
        var config = new AppConfig { Outputs = [output] }; config.Osc.Enabled = true; config.Osc.ReceiverPort = 9000;
        Assert.Throws<ArgumentException>(() => SignalOutputConfiguration.Validate(config));
        config.Osc.ReceiverPort = 9001; output.Port = 9001;
        SignalOutputConfiguration.Validate(config);
    }

    [Fact]
    public void Forwarding_a_named_value_to_a_separate_osc_application_can_keep_the_same_path()
    {
        var binding = Binding("forward", "Feedback", "/avatar/parameters/Feedback"); binding.Source.SourceMode = "Direct";
        var config = new AppConfig { Outputs = [Osc("other-application", 32123, binding)] };
        SignalOutputConfiguration.Validate(config);
    }

    [Theory]
    [InlineData("JsonLines")]
    [InlineData("Csv")]
    public void Session_recording_replays_invalid_intervals_pause_seek_and_completion(string format)
    {
        using var directory = new RecordingDirectory();
        string file;
        const string reason = "等待, \"来源\"";
        using (var recorder = new SignalSessionRecorder("session", format))
        {
            file = recorder.FileName;
            recorder.Append("first", ComputedSignalSample.Success(.2f, "avatar", 1000, "AvatarRootMeters"), 2, 1000);
            recorder.Append("first", ComputedSignalSample.Invalid(reason), null, 1100);
            recorder.Append("second", ComputedSignalSample.Success(.4f, "avatar", 1200), 4, 1200);
            recorder.Append("first", ComputedSignalSample.Success(.8f, "avatar", 1300, "AvatarRootMeters"), 8, 1300);
            recorder.Append("first", ComputedSignalSample.Invalid("stopped"), null, 2000);
        }
        var clock = new ManualTimeProvider(); var playback = new SignalSessionPlayback(clock);
        playback.Load(file);
        Assert.Equal(1000, playback.DurationMs);
        Assert.False(playback.Read("first", Now(clock)).Valid);
        playback.Play();
        var initial = playback.Read("first", Now(clock));
        Assert.Equal(.2f, initial.Value); Assert.Null(initial.SourceKey);
        Assert.Equal("AvatarRootMeters", initial.CoordinateFrame); Assert.Contains(file, initial.OriginKey);
        clock.Advance(TimeSpan.FromMilliseconds(150));
        Assert.Equal(reason, playback.Read("first", Now(clock)).Reason);
        Assert.False(playback.Read("second", Now(clock)).Valid);
        clock.Advance(TimeSpan.FromMilliseconds(100));
        Assert.Equal(.4f, playback.Read("second", Now(clock)).Value);
        playback.Seek(350); Assert.Equal(.8f, playback.Read("first", Now(clock)).Value);
        playback.Pause(); clock.Advance(TimeSpan.FromSeconds(1));
        Assert.False(playback.Read("first", Now(clock)).Valid);
        Assert.Equal(350, JsonSerializer.SerializeToElement(playback.Snapshot).GetProperty("timeMs").GetInt64());
        playback.Play(); Assert.Equal(.8f, playback.Read("first", Now(clock)).Value);
        clock.Advance(TimeSpan.FromMilliseconds(650));
        Assert.False(playback.Read("first", Now(clock)).Valid);
        playback.Play(); Assert.Equal(.2f, playback.Read("first", Now(clock)).Value);
        playback.Seek(-100); Assert.Equal(.2f, playback.Read("first", Now(clock)).Value);
        playback.Seek(long.MaxValue); Assert.False(playback.Read("first", Now(clock)).Valid);
    }

    [Fact]
    public async Task A_recording_output_records_one_invalid_transition_and_keeps_its_file_on_binding_reload()
    {
        using var directory = new RecordingDirectory(); var clock = new ManualTimeProvider(); var active = true;
        var output = new OutputDeviceConfig { Id = "record", Type = OutputDeviceType.Recording, Enabled = true,
            Signal = new() { RecordingFormat = "JsonLines", RecordingName = "routing", Bindings = [Binding("amount", "L0", "amount")] } };
        var config = new AppConfig { Outputs = [output] };
        await using var coordinator = Coordinator(config, clock); coordinator.CanSend = () => active;
        Assert.True(await coordinator.ConnectAsync("record"));
        var file = Snapshot(coordinator, "record").GetProperty("recordingFile").GetString()!;
        coordinator.Publish(_ => ComputedSignalSample.Success(.2f, null, Now(clock)), Now(clock));
        clock.Advance(TimeSpan.FromMilliseconds(100));
        coordinator.Publish(_ => ComputedSignalSample.Invalid("lost input"), Now(clock));
        clock.Advance(TimeSpan.FromMilliseconds(100));
        coordinator.Publish(_ => ComputedSignalSample.Invalid("lost input"), Now(clock));
        active = false; await coordinator.StopAsync();
        var rows = File.ReadLines(SignalSessionRecorder.ResolveFile(file)).Skip(1)
            .Select(line => JsonSerializer.Deserialize<SignalSessionRow>(line, WebJson)!).ToArray();
        Assert.Single(rows, row => !row.Valid && row.Reason == "lost input");
        Assert.Contains(rows, row => row.Valid && row.RawValue == .2f);
        output.Signal.Bindings = [Binding("other", "R0", "other")];
        await coordinator.ReloadAsync();
        Assert.True(coordinator.IsConnected("record"));
        Assert.Equal(file, Snapshot(coordinator, "record").GetProperty("recordingFile").GetString());
    }

    [Theory]
    [InlineData("{\"timeMs\":0,\"signalId\":null,\"rawValue\":0.5,\"valid\":true}")]
    [InlineData("{\"timeMs\":0,\"rawValue\":0.5,\"valid\":true}")]
    [InlineData("{\"timeMs\":0,\"signalId\":\"\",\"rawValue\":0.5,\"valid\":true}")]
    public void Replay_rejects_missing_signal_names_without_replacing_a_loaded_session(string row) =>
        AssertRejectedRecording("{\"type\":\"sensa-session\",\"format\":1}", row);

    [Theory]
    [InlineData("{\"type\":\"other-sensa-session\",\"format\":1}")]
    [InlineData("{\"type\":\"sensa-session\",\"format\":99}")]
    [InlineData("{\"type\":\"sensa-session\"}")]
    [InlineData("\"sensa-session\"")]
    public void Replay_requires_a_supported_session_header_without_replacing_a_loaded_session(string header) =>
        AssertRejectedRecording(header, "{\"timeMs\":0,\"signalId\":\"value\",\"rawValue\":0.5,\"valid\":true}");

    private static void AssertRejectedRecording(string header, string row)
    {
        using var directory = new RecordingDirectory(); string validFile;
        using (var recorder = new SignalSessionRecorder("valid", "JsonLines"))
        {
            validFile = recorder.FileName;
            recorder.Append("value", ComputedSignalSample.Success(.2f, null, 0), .2, 0);
            recorder.Append("value", ComputedSignalSample.Success(.8f, null, 1000), .8, 1000);
        }
        File.WriteAllText(SignalSessionRecorder.ResolveFile("invalid.jsonl"), header + "\n" + row + "\n");
        var clock = new ManualTimeProvider(); var playback = new SignalSessionPlayback(clock);
        playback.Load(validFile); playback.Play(); clock.Advance(TimeSpan.FromMilliseconds(100));
        Assert.Throws<ArgumentException>(() => playback.Load("invalid.jsonl"));
        Assert.Equal(validFile, playback.FileName); Assert.Equal(1000, playback.DurationMs);
        Assert.Equal(.2f, playback.Read("value", Now(clock)).Value);
        Assert.Equal(100, JsonSerializer.SerializeToElement(playback.Snapshot).GetProperty("timeMs").GetInt64());
    }

    [Theory]
    [InlineData("../outside.jsonl")]
    [InlineData("/outside.jsonl")]
    [InlineData("invalid.txt")]
    [InlineData("")]
    public void Recording_files_remain_inside_the_session_directory(string name) =>
        Assert.Throws<ArgumentException>(() => SignalSessionRecorder.ResolveFile(name));

    private sealed class RecordingDirectory : IDisposable
    {
        private readonly string? _previous = Environment.GetEnvironmentVariable("SENSA_RECORDINGS_PATH");
        private readonly string _directory = Path.Combine(Path.GetTempPath(), "sensa-sessions-" + Guid.NewGuid().ToString("N"));
        public RecordingDirectory() { Directory.CreateDirectory(_directory); Environment.SetEnvironmentVariable("SENSA_RECORDINGS_PATH", _directory); }
        public void Dispose()
        {
            Environment.SetEnvironmentVariable("SENSA_RECORDINGS_PATH", _previous);
            if (Directory.Exists(_directory)) Directory.Delete(_directory, recursive: true);
        }
    }
}
