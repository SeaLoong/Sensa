using Sensa.Configuration;
using Sensa.Signals;
using Xunit;

namespace Sensa.Tests.Contracts;

/// <summary>Configuration contracts / 配置契约。Each persistence test owns its temporary path.</summary>
public sealed class ConfigurationContracts
{
    [Fact]
    public void MissingAndCorruptFilesProduceDisarmedDefaultsAndPreserveInvalidBytes()
    {
        var folder = Path.Combine(Path.GetTempPath(), "sensa-config-contract-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        try
        {
            var path = Path.Combine(folder, "config.json");
            var missing = AppConfig.Load(path);
            Assert.False(File.Exists(path));
            Assert.All(missing.Outputs, output => Assert.False(output.Enabled));
            Assert.False(missing.Intiface.Enabled);
            File.WriteAllText(path, "{invalid original");
            var recovered = AppConfig.Load(path);
            Assert.All(recovered.Outputs, output => Assert.False(output.Enabled));
            Assert.Equal("{invalid original", File.ReadAllText(Assert.Single(Directory.GetFiles(folder, "*.invalid-*"))));
            Assert.Equal("{invalid original", File.ReadAllText(path));
        }
        finally { Directory.Delete(folder, recursive: true); }
    }

    [Fact]
    public void SavingAndLoadingKeepsSettingsButNeverPersistsArmedOutputs()
    {
        var folder = Path.Combine(Path.GetTempPath(), "sensa-config-contract-" + Guid.NewGuid().ToString("N"));
        try
        {
            var path = Path.Combine(folder, "nested", "config.json");
            var config = new AppConfig
            {
                Outputs = [new() { Id = "loopback", Type = OutputDeviceType.TCodeUdp, Host = "127.0.0.1", Port = 19444, Enabled = true }],
                Signals = [new() { OscPath = "custom/depth", VrchatMin = .2f, VrchatMax = .8f, MappedMin = 300, MappedMax = 700 }]
            };
            config.Osc.PreferredSourcePersistentId = "chosen-source";
            config.Osc.AllowExperimentalSpatialInput = true;
            config.NormalizeForRuntime();
            config.Save(path);
            Assert.True(config.Outputs.Single().Enabled);
            var loaded = AppConfig.Load(path);
            var output = Assert.Single(loaded.Outputs);
            Assert.Equal(("loopback", "127.0.0.1", 19444), (output.Id, output.Host, output.Port));
            Assert.False(output.Enabled);
            Assert.False(loaded.UdpTCode.Enabled);
            Assert.Equal("chosen-source", loaded.Osc.PreferredSourcePersistentId);
            Assert.True(loaded.Osc.AllowExperimentalSpatialInput);
            Assert.Equal("custom/depth", Assert.Single(loaded.Signals).OscPath);
            Assert.Equal(700, loaded.Signals[0].MappedMax);
            Assert.Empty(Directory.GetFiles(Path.GetDirectoryName(path)!, "*.tmp"));
        }
        finally { if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true); }
    }

    [Fact]
    public void ExperimentalContactInputRequiresExplicitOptInAndSurvivesConfigurationCopy()
    {
        var active = new AppConfig();
        Assert.False(active.Osc.AllowExperimentalSpatialInput);
        var candidate = new AppConfig();
        candidate.Osc.AllowExperimentalSpatialInput = true;
        active.CopyFrom(candidate);
        Assert.True(active.Osc.AllowExperimentalSpatialInput);
        active.CopyFrom(new AppConfig());
        Assert.False(active.Osc.AllowExperimentalSpatialInput);
    }

    [Fact]
    public void NormalizationMakesProfilesUsableAndResolvedProfilesAreIndependentSnapshots()
    {
        var config = new AppConfig
        {
            AxisProfiles = [new() { Id = "global-default", IsDefault = true, Motion = new()
            {
                L0 = new() { Min = 900, Max = 100, RemapMin = 1200, RemapMax = -20, MaxSpeed = 0,
                    Mode = (TCodeAxisMode)999, CommandMode = (TCodeCommandMode)999, RampType = (TCodeRampType)999, LockValue = 2 }
            }}],
            Outputs = [new() { Id = "out", Type = OutputDeviceType.TCodeUdp, MotionProfileId = "global-default", Host = " ", Port = -1 }]
        };
        config.NormalizeForRuntime();
        var profile = config.ResolveMotionProfile("GLOBAL-DEFAULT");
        Assert.Equal((100, 900, 0, 999, 1), (profile.L0.Min, profile.L0.Max, profile.L0.RemapMin, profile.L0.RemapMax, profile.L0.MaxSpeed));
        Assert.Equal((TCodeAxisMode.Normal, TCodeCommandMode.Interval, TCodeRampType.None, 1f),
            (profile.L0.Mode, profile.L0.CommandMode, profile.L0.RampType, profile.L0.LockValue));
        profile.L0.Min = 555;
        Assert.Equal(100, config.ResolveMotionProfile("global-default").L0.Min);
        Assert.Same(config.GetDefaultAxisProfile(), config.ResolveAxisProfile("missing"));
        Assert.Equal(("127.0.0.1", 9999), (config.Outputs[0].Host, config.Outputs[0].Port));
        Assert.True(config.UsesGlobalMotionProfile(TCodeProfileTarget.Udp));
    }

    [Fact]
    public void UpdatingConfigurationRetainsSameTypeOutputAndReplacesChangedTransport()
    {
        var active = new AppConfig { Outputs = [new() { Id = "stable-id", Type = OutputDeviceType.TCodeUdp, Port = 19111 }] };
        active.NormalizeForRuntime();
        var original = active.Outputs[0];
        var candidate = new AppConfig
        {
            Outputs = [new() { Id = "stable-id", Type = OutputDeviceType.TCodeUdp, Port = 19222 }],
            Signals = [new() { OscPath = "custom" }]
        };
        active.CopyFrom(candidate);
        Assert.Same(original, active.FindOutput("STABLE-ID"));
        Assert.Equal(OutputDeviceType.TCodeUdp, original.Type);
        Assert.Equal(19222, original.Port);
        candidate.Signals[0].OscPath = "mutated";
        Assert.Equal("custom", active.Signals[0].OscPath);
        candidate.Outputs[0].Type = OutputDeviceType.TCodeTcp;
        active.CopyFrom(candidate);
        Assert.NotSame(original, active.FindOutput("stable-id"));
        Assert.Equal(OutputDeviceType.TCodeTcp, active.FindOutput("stable-id")!.Type);
        Assert.Equal(OutputDeviceType.TCodeUdp, original.Type);
    }

    [Fact]
    public void InvalidAllowlistIsRejectedInsteadOfWideningAccess()
    {
        var candidate = new AppConfig();
        candidate.Osc.AllowedSourceAddresses = ["not-an-ip"];
        Assert.Throws<ArgumentException>(() => new AppConfig().CopyFrom(candidate));
        candidate.Osc.AllowedSourceAddresses = [" 127.0.0.1 ", "127.0.0.1", "::1"];
        var config = new AppConfig();
        config.CopyFrom(candidate);
        Assert.Equal(["127.0.0.1", "::1"], config.Osc.AllowedSourceAddresses);
    }

    [Fact]
    public void DuplicateTargetsAreRejectedButDifferentTransportsCanShareAPort()
    {
        var config = new AppConfig { Outputs = [
            new() { Id = "a", Type = OutputDeviceType.TCodeUdp, Host = "LOCALHOST", Port = 19001 },
            new() { Id = "b", Type = OutputDeviceType.TCodeUdp, Host = "localhost", Port = 19001 }] };
        config.NormalizeForRuntime();
        Assert.Throws<InvalidOperationException>(() => config.ValidateUniqueOutputTargets());
        config.Outputs[1].Type = OutputDeviceType.TCodeTcp;
        config.ValidateUniqueOutputTargets();
    }

    [Fact]
    public void SpatialMappingsRequireOneCoordinateFrameAndOutputRoles()
    {
        var config = new AppConfig { Signals = [new() { SourceMode = "SensaPoint", OscPath = "Sensa/Point/v1/A/Self/**", PointMetric = PointMetric.X }] };
        config.NormalizeForRuntime();
        Assert.Equal(PointMetric.X, config.Signals[0].PointMetric);
        config.Signals.Add(new() { SourceMode = "SensaPose", OscPath = "Sensa/Pose/v1/**" });
        Assert.Throws<InvalidOperationException>(() => config.NormalizeForRuntime());
        config.Signals = [new() { SourceMode = "SensaPoint", OscPath = "point", Role = SignalRole.GateEnable }];
        Assert.Throws<InvalidOperationException>(() => config.NormalizeForRuntime());
        config.Signals = [new() { SourceMode = "SensaPoint", OscPath = "point/a" }, new() { SourceMode = "SensaPoint", OscPath = "point/b" }];
        Assert.Throws<InvalidOperationException>(() => config.NormalizeForRuntime());
    }

    [Fact]
    public void QueryAndHubValidationRejectsUnusableOrRecursiveEndpoints()
    {
        var config = new AppConfig();
        config.Osc.OscQueryPolling.Enabled = true;
        config.Osc.OscQueryEnabled = false;
        Assert.Throws<InvalidOperationException>(() => config.ValidateOscQueryPolling());
        config.Osc.OscQueryReceiver.Enabled = true;
        config.Osc.OscQueryReceiver.HttpPort = config.WebUi.Port;
        Assert.Throws<InvalidOperationException>(() => config.ValidateOscQueryReceiverService());
        config.Osc.OscQueryReceiver.HttpPort = 9010;
        config.Osc.OscQueryReceiver.AdvertiseAvatar = false;
        config.Osc.OscQueryReceiver.AdvertiseTracking = false;
        Assert.Throws<InvalidOperationException>(() => config.ValidateOscQueryReceiverService());
        config.Osc.Hub.Enabled = true;
        config.Osc.Hub.Targets = [new() { Host = "127.0.0.1", Port = config.Osc.ReceiverPort }];
        Assert.Throws<InvalidOperationException>(() => config.ValidateOscHubTargets());
    }
}
