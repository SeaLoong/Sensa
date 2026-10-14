using System.Text.Json;
using System.Text.Json.Serialization;
using Sensa.Configuration;
using Sensa.Input.Osc;
using Sensa.Motion;
using Sensa.Outputs.TCode;
using Sensa.Runtime;
using Xunit;

namespace Sensa.Tests;

public class QuickStartTests
{
    static T Load<T>(string name)
    {
        using var stream = typeof(QuickStartTests).Assembly.GetManifestResourceStream(name)!;
        return JsonSerializer.Deserialize<T>(stream, new JsonSerializerOptions { PropertyNameCaseInsensitive = true, Converters = { new JsonStringEnumConverter() } })!;
    }

    [Theory]
    [InlineData(0f, 400)]
    [InlineData(.25f, 450)]
    [InlineData(.5f, 500)]
    [InlineData(.75f, 550)]
    [InlineData(1f, 600)]
    public async Task ShippedPresetsMapWorldStepsToOnlyL0AndStopOnGate(float depth, int target)
    {
        var preset = Load<List<OscMappingPresetConfig>>("QuickStart.OscPresets").Single(p => p.Id == "sensa-quick-start");
        var profile = Load<TCodeMotionProfile>("QuickStart.MotionProfile");
        var config = new AppConfig { Signals = preset.Mappings, Outputs = [] };
        config.NormalizeForRuntime();
        var store = new OscParameterStore();
        using var receiver = new OscInputReceiver(store);
        var sent = new TaskCompletionSource<MotionFrame>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var runtime = new MotionRuntime(config, store, receiver, sendOutputsAsync: frame => { sent.TrySetResult(frame); return Task.CompletedTask; });
        runtime.SetInputMode(RuntimeInputMode.Osc); runtime.SetInputActive(true);
        Assert.False(runtime.CanSend); // A missing activation value must not arm the test.
        store.Set("Sensa/QuickStart/Depth", OscValue.FromFloat(depth));
        store.Set("Sensa/QuickStart/Active", OscValue.FromBool(true));
        var frame = await sent.Task.WaitAsync(TimeSpan.FromSeconds(3));
        var (line, effective) = TCodeEncoder.BuildLine(profile, null, null, null, new(), null, frame, true);
        Assert.InRange(effective.L0 * 1000, target - 1f, target + 1f);
        Assert.Matches(@"^L0\d+I\d+$", line); // No orientation or auxiliary axes sneak into first use.
        store.Set("Sensa/QuickStart/Active", OscValue.FromBool(false));
        for (int i = 0; i < 100 && runtime.CanSend; i++) await Task.Delay(10);
        Assert.False(runtime.CanSend);
    }
}
