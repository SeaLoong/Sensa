using Sensa.Signals;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sensa.Configuration;

// ═══════════════════════════════════════════════════════════════════════
//  TCode transmitter config
// ═══════════════════════════════════════════════════════════════════════

public sealed class TCodeConfig
{
    public string ComPort           { get; set; } = "COM3";
    public int    MaxPos            { get; set; } = 999;
    public int    MinPos            { get; set; } = 0;
    public int    MaxVelocity       { get; set; } = 999;
    public bool   L0Invert          { get; set; } = false;
    public bool   PreferSpeedMode   { get; set; } = true;
    public bool   Enabled           { get; set; } = false;
}

public enum TCodeProfileTarget
{
    Global,
    TCode,
    Udp,
    Tcp,
}

public enum OutputDeviceType
{
    TCodeSerial,
    TCodeUdp,
    TCodeTcp,
    Intiface,
}

public enum TCodeAxisMode
{
    Normal,
    Locked,
    Ignored,
}

public enum TCodeCommandMode
{
    Speed,
    Interval,
}

public sealed class TCodeAxisConfig
{
    public int           Min       { get; set; } = 0;
    public int           Max       { get; set; } = 999;
    public int           RemapMin  { get; set; } = 0;
    public int           RemapMax  { get; set; } = 999;
    public int           MaxSpeed  { get; set; } = 999;
    public bool          Invert    { get; set; } = false;
    public TCodeAxisMode Mode      { get; set; } = TCodeAxisMode.Normal;
    public TCodeCommandMode CommandMode { get; set; } = TCodeCommandMode.Speed;
    public float         LockValue { get; set; } = 0.5f;
}

public sealed class TCodeMotionProfile
{
    public bool            UseGlobal { get; set; } = false;
    public TCodeAxisConfig L0        { get; set; } = new();
    public TCodeAxisConfig L1        { get; set; } = new();
    public TCodeAxisConfig L2        { get; set; } = new();
    public TCodeAxisConfig R0        { get; set; } = new();
    public TCodeAxisConfig R1        { get; set; } = new();
    public TCodeAxisConfig R2        { get; set; } = new();
    public TCodeAxisConfig V0        { get; set; } = new();
    public TCodeAxisConfig V1        { get; set; } = new();
    public TCodeAxisConfig V2        { get; set; } = new();
    public TCodeAxisConfig A0        { get; set; } = new();
}

public sealed class TCodeProfilesConfig
{
    public TCodeMotionProfile Global { get; set; } = new();
    public TCodeMotionProfile Serial { get; set; } = new() { UseGlobal = true };
    public TCodeMotionProfile Udp    { get; set; } = new() { UseGlobal = true };
    public TCodeMotionProfile Tcp    { get; set; } = new() { UseGlobal = true };
}

public sealed class AxisProfileConfig
{
    public string             Id        { get; set; } = "global-default";
    public string             Name      { get; set; } = "全局默认";
    public bool               IsDefault { get; set; } = false;
    public TCodeMotionProfile Motion    { get; set; } = new();
}

public sealed class OscMappingPresetConfig
{
    public string             Id          { get; set; } = "";
    public string             Name        { get; set; } = "";
    public string             Description { get; set; } = "";
    public List<SignalMapping> Mappings   { get; set; } = new();
}

public sealed class OutputDeviceConfig
{
    public string           Id                  { get; set; } = "";
    public string           Name                { get; set; } = "";
    public OutputDeviceType Type                { get; set; } = OutputDeviceType.TCodeSerial;
    public bool             Enabled             { get; set; } = false;
    public string           MotionProfileId     { get; set; } = "global-default";
    public string           ComPort             { get; set; } = "COM3";
    public string           Host                { get; set; } = "127.0.0.1";
    public int              Port                { get; set; } = 0;
    public bool             PreferSpeedMode     { get; set; } = true;
    public bool             ManageEngineProcess { get; set; } = true;
    public string           WebsocketAddress    { get; set; } = "ws://localhost:12345";
}

public sealed class UdpTCodeConfig
{
    public bool   Enabled { get; set; } = false;
    public string Host    { get; set; } = "127.0.0.1";
    public int    Port    { get; set; } = 9999;
}

public sealed class TcpTCodeConfig
{
    public bool   Enabled { get; set; } = false;
    public string Host    { get; set; } = "127.0.0.1";
    public int    Port    { get; set; } = 9998;
}

// ═══════════════════════════════════════════════════════════════════════
//  Intiface config
// ═══════════════════════════════════════════════════════════════════════

public sealed class IntifaceConfig
{
    public bool   Enabled              { get; set; } = true;
    public bool   ManageEngineProcess  { get; set; } = true;
    public string WebsocketAddress     { get; set; } = "ws://localhost:12345";
    public int    Port                 { get; set; } = 12345;
}

// ═══════════════════════════════════════════════════════════════════════
//  OSC receiver config
// ═══════════════════════════════════════════════════════════════════════

public sealed class OscReceiverConfig
{
    public string ReceiverHost { get; set; } = "0.0.0.0";
    public int ReceiverPort { get; set; } = 9001;
    public bool OscQueryEnabled { get; set; } = true;
    public string OscQueryUrl { get; set; } = "http://127.0.0.1:9001/";
    public string PreferredSourcePersistentId { get; set; } = "";
}

// ═══════════════════════════════════════════════════════════════════════
//  Web UI / HTTP service config
// ═══════════════════════════════════════════════════════════════════════

public sealed class WebUiConfig
{
    public string Host            { get; set; } = "127.0.0.1";
    public int    Port            { get; set; } = 5086;
    public bool   AutoOpenBrowser { get; set; } = false;
    public string Title           { get; set; } = "Sensa WebUI";
}

// ═══════════════════════════════════════════════════════════════════════
//  Device routing: one row per signal, one column per axis
//  Entry[signalIndex][axis] = weight (0 = disabled)
// ═══════════════════════════════════════════════════════════════════════

public sealed class DeviceRouteEntry
{
    public string DeviceName  { get; set; } = "";
    public bool   SendL0      { get; set; } = true;
    public bool   SendV0 { get; set; } = true;
    public bool   Enabled     { get; set; } = true;
}

// ═══════════════════════════════════════════════════════════════════════
//  Root save file
// ═══════════════════════════════════════════════════════════════════════

public sealed class AppConfig
{
    private static readonly HashSet<string> BuiltInOscMappingPresetIds = BuildDefaultOscMappingPresets()
        .Select(preset => preset.Id)
        .Where(id => !string.IsNullOrWhiteSpace(id))
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    public int                  SchemaVersion { get; set; } = 5;
    public OscReceiverConfig     Osc          { get; set; } = new();
    public WebUiConfig           WebUi        { get; set; } = new();
    public IntifaceConfig         Intiface     { get; set; } = new();
    public TCodeConfig            TCode        { get; set; } = new();
    public TCodeProfilesConfig    TCodeProfiles { get; set; } = new();
    public List<AxisProfileConfig> AxisProfiles  { get; set; } = new();
    public List<OutputDeviceConfig> Outputs      { get; set; } = new();
    public UdpTCodeConfig         UdpTCode     { get; set; } = new();
    public TcpTCodeConfig         TcpTCode     { get; set; } = new();
    public List<SignalMapping>     Signals      { get; set; } = new();
    public List<OscMappingPresetConfig> OscMappingPresets { get; set; } = new();
    public List<DeviceRouteEntry> DeviceRoutes { get; set; } = new();

    // ── Persistence ────────────────────────────────────────────────

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented     = true,
        Converters        = { new JsonStringEnumConverter() },
        PropertyNameCaseInsensitive = true,
    };

    private static string ConfigPath()
    {
        return Path.Combine(AppContext.BaseDirectory, "config.json");
    }

    private static AppConfig CreateDefaultConfig()
    {
        var empty = new AppConfig
        {
            SchemaVersion = 5,
        };

        empty.TCode.MaxVelocity = 999;
        empty.Intiface.Enabled = false;
        empty.NormalizeForRuntime();
        empty.ResetTransientRuntimeState();
        return empty;
    }

    public static AppConfig Load()
    {
        try
        {
            var path = ConfigPath();
            if (File.Exists(path))
            {
                var json = File.ReadAllText(path);
                var loaded = JsonSerializer.Deserialize<AppConfig>(json, JsonOpts) ?? new AppConfig();
                loaded.NormalizeForRuntime();
                loaded.ResetTransientRuntimeState();
                return loaded;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Sensa] Failed to load config: {ex.Message}");
        }
        return CreateDefaultConfig();
    }

    public void Save()
    {
        try
        {
            NormalizeForRuntime();
            var path = ConfigPath();
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var snapshot = new AppConfig();
            snapshot.CopyFrom(this);
            snapshot.ResetTransientRuntimeState();
            var json = JsonSerializer.Serialize(snapshot, JsonOpts);
            File.WriteAllText(path, json);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Sensa] Failed to save config: {ex.Message}");
        }
    }

    public void CopyFrom(AppConfig other)
    {
        SchemaVersion = other.SchemaVersion > 0 ? other.SchemaVersion : 5;

        var osc = other.Osc ?? new OscReceiverConfig();
        Osc.ReceiverHost = string.IsNullOrWhiteSpace(osc.ReceiverHost) ? "0.0.0.0" : osc.ReceiverHost;
        Osc.ReceiverPort = osc.ReceiverPort is > 0 and <= 65535 ? osc.ReceiverPort : 9001;
        Osc.OscQueryEnabled = osc.OscQueryEnabled;
        Osc.OscQueryUrl = string.IsNullOrWhiteSpace(osc.OscQueryUrl) ? "http://127.0.0.1:9001/" : osc.OscQueryUrl.Trim();
        Osc.PreferredSourcePersistentId = string.IsNullOrWhiteSpace(osc.PreferredSourcePersistentId) ? string.Empty : osc.PreferredSourcePersistentId.Trim();

        var webUi = other.WebUi ?? new WebUiConfig();
        WebUi.Host            = string.IsNullOrWhiteSpace(webUi.Host) ? "127.0.0.1" : webUi.Host;
        WebUi.Port            = webUi.Port;
        WebUi.AutoOpenBrowser = webUi.AutoOpenBrowser;
        WebUi.Title           = string.IsNullOrWhiteSpace(webUi.Title) ? "Sensa WebUI" : webUi.Title;
        TCodeProfiles = CloneProfiles(other.TCodeProfiles);
        AxisProfiles = CloneAxisProfiles(other.AxisProfiles);
        Outputs = CloneOutputs(other.Outputs, AxisProfiles);

        Signals = (other.Signals ?? new List<SignalMapping>())
            .Select(CloneSignal)
            .ToList();

        OscMappingPresets = CloneOscMappingPresets(other.OscMappingPresets);

        DeviceRoutes = (other.DeviceRoutes ?? new List<DeviceRouteEntry>())
            .Select(route => new DeviceRouteEntry
            {
                DeviceName  = route.DeviceName,
                SendL0      = route.SendL0,
                SendV0 = route.SendV0,
                Enabled     = route.Enabled,
            })
            .ToList();

        NormalizeForRuntime();
    }

    public void NormalizeForRuntime()
    {
        Osc ??= new OscReceiverConfig();
        WebUi ??= new WebUiConfig();
        Intiface ??= new IntifaceConfig();
        TCode ??= new TCodeConfig();
        UdpTCode ??= new UdpTCodeConfig();
        TcpTCode ??= new TcpTCodeConfig();
        TCodeProfiles = CloneProfiles(TCodeProfiles);
        AxisProfiles = CloneAxisProfiles(AxisProfiles);
        Outputs = CloneOutputs(Outputs, AxisProfiles);
        OscMappingPresets = CloneOscMappingPresets(OscMappingPresets);
        SchemaVersion = 5;

        Osc.ReceiverHost = string.IsNullOrWhiteSpace(Osc.ReceiverHost) ? "0.0.0.0" : Osc.ReceiverHost;
        Osc.ReceiverPort = Osc.ReceiverPort is > 0 and <= 65535 ? Osc.ReceiverPort : 9001;
        Osc.OscQueryUrl = string.IsNullOrWhiteSpace(Osc.OscQueryUrl) ? "http://127.0.0.1:9001/" : Osc.OscQueryUrl.Trim();
        Osc.PreferredSourcePersistentId = string.IsNullOrWhiteSpace(Osc.PreferredSourcePersistentId) ? string.Empty : Osc.PreferredSourcePersistentId.Trim();

        WebUi.Host            = string.IsNullOrWhiteSpace(WebUi.Host) ? "127.0.0.1" : WebUi.Host;
        WebUi.Title           = string.IsNullOrWhiteSpace(WebUi.Title) ? "Sensa WebUI" : WebUi.Title;
        WebUi.Port            = WebUi.Port is > 0 and <= 65535 ? WebUi.Port : 5086;

        TCode.ComPort          = string.IsNullOrWhiteSpace(TCode.ComPort) ? "COM3" : TCode.ComPort;
        UdpTCode.Host = string.IsNullOrWhiteSpace(UdpTCode.Host) ? "127.0.0.1" : UdpTCode.Host;
        UdpTCode.Port = UdpTCode.Port is > 0 and <= 65535 ? UdpTCode.Port : 9999;

        TcpTCode.Host = string.IsNullOrWhiteSpace(TcpTCode.Host) ? "127.0.0.1" : TcpTCode.Host;
        TcpTCode.Port = TcpTCode.Port is > 0 and <= 65535 ? TcpTCode.Port : 9998;

        Signals = (Signals ?? new List<SignalMapping>())
            .Select(CloneSignal)
            .ToList();
        OscMappingPresets ??= new List<OscMappingPresetConfig>();
        DeviceRoutes ??= new List<DeviceRouteEntry>();

        SyncMirroredFieldsFromOutputs();
    }

    private void ResetTransientRuntimeState()
    {
        foreach (var output in Outputs)
            output.Enabled = false;

        TCode.Enabled = false;
        UdpTCode.Enabled = false;
        TcpTCode.Enabled = false;
        Intiface.Enabled = false;
    }

    public AxisProfileConfig GetDefaultAxisProfile()
    {
        if (AxisProfiles.Count == 0)
        {
            AxisProfiles = CloneAxisProfiles(new List<AxisProfileConfig>());
        }

        return AxisProfiles.FirstOrDefault(profile => profile.IsDefault) ?? AxisProfiles[0];
    }

    public AxisProfileConfig ResolveAxisProfile(string? profileId)
    {
        var defaultProfile = GetDefaultAxisProfile();
        if (string.IsNullOrWhiteSpace(profileId))
            return defaultProfile;

        return AxisProfiles.FirstOrDefault(profile => string.Equals(profile.Id, profileId, StringComparison.OrdinalIgnoreCase))
            ?? defaultProfile;
    }

    public string ResolveAxisProfileName(string? profileId) => ResolveAxisProfile(profileId).Name;

    public OutputDeviceConfig? FindOutput(string outputId) =>
        Outputs.FirstOrDefault(output => string.Equals(output.Id, outputId, StringComparison.OrdinalIgnoreCase));

    public OutputDeviceConfig? GetPrimaryOutput(OutputDeviceType type) => Outputs.FirstOrDefault(output => output.Type == type);

    public void ValidateUniqueOutputTargets()
    {
        var occupiedTargets = new Dictionary<string, OutputDeviceConfig>(StringComparer.OrdinalIgnoreCase);

        foreach (var output in Outputs)
        {
            foreach (var binding in EnumerateOutputTargetBindings(output))
            {
                if (occupiedTargets.TryGetValue(binding.Key, out var existing))
                {
                    throw new InvalidOperationException($"输出“{DescribeOutput(existing)}”与“{DescribeOutput(output)}”重复使用{binding.Label}。请改成未被占用的目标。");
                }

                occupiedTargets[binding.Key] = output;
            }
        }
    }

    public TCodeMotionProfile ResolveMotionProfile(string? profileId)
    {
        var resolved = ResolveAxisProfile(profileId).Motion;
        return CloneMotionProfile(resolved, useGlobal: false);
    }

    public TCodeMotionProfile ResolveMotionProfile(TCodeProfileTarget target)
    {
        var output = target switch
        {
            TCodeProfileTarget.TCode => GetPrimaryOutput(OutputDeviceType.TCodeSerial),
            TCodeProfileTarget.Udp   => GetPrimaryOutput(OutputDeviceType.TCodeUdp),
            TCodeProfileTarget.Tcp   => GetPrimaryOutput(OutputDeviceType.TCodeTcp),
            _                        => null,
        };

        if (output is not null)
            return ResolveMotionProfile(output.MotionProfileId);

        return target switch
        {
            TCodeProfileTarget.TCode => TCodeProfiles.Serial.UseGlobal ? TCodeProfiles.Global : TCodeProfiles.Serial,
            TCodeProfileTarget.Udp   => TCodeProfiles.Udp.UseGlobal ? TCodeProfiles.Global : TCodeProfiles.Udp,
            TCodeProfileTarget.Tcp   => TCodeProfiles.Tcp.UseGlobal ? TCodeProfiles.Global : TCodeProfiles.Tcp,
            _                        => ResolveMotionProfile(GetDefaultAxisProfile().Id),
        };
    }

    public bool UsesGlobalMotionProfile(TCodeProfileTarget target)
    {
        var output = target switch
        {
            TCodeProfileTarget.TCode => GetPrimaryOutput(OutputDeviceType.TCodeSerial),
            TCodeProfileTarget.Udp   => GetPrimaryOutput(OutputDeviceType.TCodeUdp),
            TCodeProfileTarget.Tcp   => GetPrimaryOutput(OutputDeviceType.TCodeTcp),
            _                        => null,
        };

        if (output is not null)
            return string.Equals(output.MotionProfileId, GetDefaultAxisProfile().Id, StringComparison.OrdinalIgnoreCase);

        return target switch
        {
            TCodeProfileTarget.TCode => TCodeProfiles.Serial.UseGlobal,
            TCodeProfileTarget.Udp   => TCodeProfiles.Udp.UseGlobal,
            TCodeProfileTarget.Tcp   => TCodeProfiles.Tcp.UseGlobal,
            _                        => false,
        };
    }

    private void SyncMirroredFieldsFromOutputs()
    {
        var defaultProfile = GetDefaultAxisProfile().Motion;
        var l0 = defaultProfile.L0;
        TCode.MinPos          = l0.Min;
        TCode.MaxPos          = l0.Max;
        TCode.MaxVelocity     = l0.MaxSpeed;
        TCode.L0Invert        = l0.Invert;

        TCodeProfiles.Global = CloneMotionProfile(defaultProfile, useGlobal: false);

        var serialOutput = GetPrimaryOutput(OutputDeviceType.TCodeSerial);
        if (serialOutput is not null)
        {
            TCode.ComPort          = string.IsNullOrWhiteSpace(serialOutput.ComPort) ? "COM3" : serialOutput.ComPort;
            TCode.Enabled          = serialOutput.Enabled;
            TCode.PreferSpeedMode  = ResolveMotionProfile(serialOutput.MotionProfileId).L0.CommandMode == TCodeCommandMode.Speed;
            TCodeProfiles.Serial   = BuildMirroredTargetProfile(serialOutput.MotionProfileId);
        }
        else
        {
            TCode.Enabled        = false;
            TCodeProfiles.Serial = CloneMotionProfile(defaultProfile, useGlobal: true);
            TCodeProfiles.Serial.UseGlobal = true;
        }

        var udpOutput = GetPrimaryOutput(OutputDeviceType.TCodeUdp);
        if (udpOutput is not null)
        {
            UdpTCode.Enabled       = udpOutput.Enabled;
            UdpTCode.Host          = string.IsNullOrWhiteSpace(udpOutput.Host) ? "127.0.0.1" : udpOutput.Host;
            UdpTCode.Port          = udpOutput.Port;
            TCodeProfiles.Udp      = BuildMirroredTargetProfile(udpOutput.MotionProfileId);
        }
        else
        {
            UdpTCode.Enabled  = false;
            TCodeProfiles.Udp = CloneMotionProfile(defaultProfile, useGlobal: true);
            TCodeProfiles.Udp.UseGlobal = true;
        }

        var tcpOutput = GetPrimaryOutput(OutputDeviceType.TCodeTcp);
        if (tcpOutput is not null)
        {
            TcpTCode.Enabled       = tcpOutput.Enabled;
            TcpTCode.Host          = string.IsNullOrWhiteSpace(tcpOutput.Host) ? "127.0.0.1" : tcpOutput.Host;
            TcpTCode.Port          = tcpOutput.Port;
            TCodeProfiles.Tcp      = BuildMirroredTargetProfile(tcpOutput.MotionProfileId);
        }
        else
        {
            TcpTCode.Enabled  = false;
            TCodeProfiles.Tcp = CloneMotionProfile(defaultProfile, useGlobal: true);
            TCodeProfiles.Tcp.UseGlobal = true;
        }

        var intifaceOutput = GetPrimaryOutput(OutputDeviceType.Intiface);
        if (intifaceOutput is not null)
        {
            Intiface.Enabled             = intifaceOutput.Enabled;
            Intiface.ManageEngineProcess = intifaceOutput.ManageEngineProcess;
            Intiface.WebsocketAddress    = string.IsNullOrWhiteSpace(intifaceOutput.WebsocketAddress) ? "ws://localhost:12345" : intifaceOutput.WebsocketAddress;
            Intiface.Port                = intifaceOutput.Port;
        }
        else
        {
            Intiface.Enabled = false;
        }
    }

    private static string DescribeOutput(OutputDeviceConfig output)
    {
        if (!string.IsNullOrWhiteSpace(output.Name))
            return output.Name.Trim();

        return output.Type switch
        {
            OutputDeviceType.TCodeSerial => "TCode 串口",
            OutputDeviceType.TCodeUdp => "TCode UDP",
            OutputDeviceType.TCodeTcp => "TCode TCP",
            OutputDeviceType.Intiface => "Intiface",
            _ => output.Type.ToString(),
        };
    }

    private static IEnumerable<(string Key, string Label)> EnumerateOutputTargetBindings(OutputDeviceConfig output)
    {
        switch (output.Type)
        {
            case OutputDeviceType.TCodeSerial:
            {
                var comPort = NormalizeComPort(output.ComPort);
                if (!string.IsNullOrWhiteSpace(comPort))
                    yield return ($"serial:{comPort}", $"串口 {comPort}");
                yield break;
            }

            case OutputDeviceType.TCodeUdp:
            case OutputDeviceType.TCodeTcp:
            {
                var host = NormalizeHost(output.Host, "127.0.0.1");
                var port = NormalizePort(output.Port, output.Type == OutputDeviceType.TCodeUdp ? 9999 : 9998);
                var label = output.Type == OutputDeviceType.TCodeUdp ? $"UDP 地址 {host}:{port}" : $"TCP 地址 {host}:{port}";
                yield return ($"net:{output.Type}:{host}:{port}", label);
                yield break;
            }

            case OutputDeviceType.Intiface:
            {
                var websocketAddress = NormalizeWebsocketAddress(output.WebsocketAddress, "ws://localhost:12345");
                if (!string.IsNullOrWhiteSpace(websocketAddress))
                    yield return ($"intiface-ws:{websocketAddress}", $"Intiface 地址 {websocketAddress}");

                if (output.ManageEngineProcess)
                {
                    var port = NormalizePort(output.Port, 12345);
                    yield return ($"intiface-engine:{port}", $"Intiface 引擎端口 {port}");
                }

                yield break;
            }
        }
    }

    private static string NormalizeComPort(string? value) => (value ?? string.Empty).Trim().ToUpperInvariant();

    private static string NormalizeHost(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback.ToLowerInvariant() : value.Trim().ToLowerInvariant();

    private static int NormalizePort(int value, int fallback) => value is > 0 and <= 65535 ? value : fallback;

    private static string NormalizeWebsocketAddress(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback.ToLowerInvariant() : value.Trim().ToLowerInvariant();

    private static TCodeProfilesConfig CloneProfiles(TCodeProfilesConfig? source)
    {
        var fallback = new TCodeMotionProfile();
        var global = NormalizeProfile(source?.Global, fallback, useGlobal: false);

        return new TCodeProfilesConfig
        {
            Global = global,
            Serial = NormalizeProfile(source?.Serial, global, useGlobal: true),
            Udp    = NormalizeProfile(source?.Udp, global, useGlobal: true),
            Tcp    = NormalizeProfile(source?.Tcp, global, useGlobal: true),
        };
    }

    private static List<AxisProfileConfig> CloneAxisProfiles(List<AxisProfileConfig>? source)
    {
        var result = new List<AxisProfileConfig>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var fallback = new TCodeMotionProfile();

        if (source is not null)
        {
            for (var index = 0; index < source.Count; index++)
            {
                var item = source[index] ?? new AxisProfileConfig();
                var idBase = string.IsNullOrWhiteSpace(item.Id) ? $"axis-profile-{index + 1}" : item.Id.Trim();
                var id = EnsureUniqueId(idBase, seenIds, $"axis-profile-{index + 1}");
                var name = string.IsNullOrWhiteSpace(item.Name)
                    ? (index == 0 ? "全局默认" : $"轴配置 {index + 1}")
                    : item.Name.Trim();

                result.Add(new AxisProfileConfig
                {
                    Id = id,
                    Name = name,
                    IsDefault = item.IsDefault,
                    Motion = CloneMotionProfile(NormalizeProfile(item.Motion, fallback, useGlobal: false), useGlobal: false),
                });
            }
        }

        if (result.Count == 0)
        {
            result.Add(new AxisProfileConfig
            {
                Id = "global-default",
                Name = "全局默认",
                IsDefault = true,
                Motion = CloneMotionProfile(fallback, useGlobal: false),
            });
        }

        var defaultProfile = result.FirstOrDefault(profile => profile.IsDefault) ?? result[0];
        foreach (var profile in result)
            profile.IsDefault = string.Equals(profile.Id, defaultProfile.Id, StringComparison.OrdinalIgnoreCase);

        if (!result.Any(profile => string.Equals(profile.Id, "global-default", StringComparison.OrdinalIgnoreCase)))
        {
            defaultProfile.Id = EnsureUniqueId("global-default", seenIds, "axis-profile-default");
        }

        return result;
    }

    private static List<OscMappingPresetConfig> CloneOscMappingPresets(List<OscMappingPresetConfig>? source)
    {
        if (source is null)
        {
            return new List<OscMappingPresetConfig>();
        }

        var result = new List<OscMappingPresetConfig>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var index = 0; index < source.Count; index++)
        {
            var item = source[index] ?? new OscMappingPresetConfig();
            if (!string.IsNullOrWhiteSpace(item.Id) && BuiltInOscMappingPresetIds.Contains(item.Id))
                continue;

            var id = EnsureUniqueId(item.Id, seenIds, $"osc-preset-{index + 1}");
            var name = string.IsNullOrWhiteSpace(item.Name) ? $"OSC 预设 {index + 1}" : item.Name.Trim();
            var description = item.Description?.Trim() ?? string.Empty;
            var mappings = (item.Mappings ?? new List<SignalMapping>())
                .Where(signal => !string.IsNullOrWhiteSpace(signal.OscPath))
                .Select(CloneSignal)
                .ToList();

            result.Add(new OscMappingPresetConfig
            {
                Id = id,
                Name = name,
                Description = description,
                Mappings = mappings,
            });
        }

        return result;
    }

    private static List<OutputDeviceConfig> CloneOutputs(
        List<OutputDeviceConfig>? source,
        List<AxisProfileConfig> axisProfiles)
    {
        var result = new List<OutputDeviceConfig>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var defaultProfileId = axisProfiles.First(profile => profile.IsDefault).Id;

        if (source is null)
            return result;

        var counters = new Dictionary<OutputDeviceType, int>();
        foreach (var item in source)
        {
            var type = item?.Type ?? OutputDeviceType.TCodeSerial;
            counters[type] = counters.TryGetValue(type, out var count) ? count + 1 : 1;

            var id = EnsureUniqueId(item?.Id, seenIds, BuildDefaultOutputId(type, counters[type]));
            var name = string.IsNullOrWhiteSpace(item?.Name)
                ? BuildDefaultOutputName(type, counters[type])
                : item!.Name.Trim();

            result.Add(new OutputDeviceConfig
            {
                Id = id,
                Name = name,
                Type = type,
                Enabled = item?.Enabled ?? false,
                MotionProfileId = IsTCodeOutput(type)
                    ? NormalizeMotionProfileId(item?.MotionProfileId, axisProfiles, defaultProfileId)
                    : defaultProfileId,
                ComPort = string.IsNullOrWhiteSpace(item?.ComPort) ? "COM3" : item!.ComPort,
                Host = string.IsNullOrWhiteSpace(item?.Host) ? "127.0.0.1" : item!.Host,
                Port = NormalizeOutputPort(type, item?.Port ?? 0),
                PreferSpeedMode = item?.PreferSpeedMode ?? true,
                ManageEngineProcess = item?.ManageEngineProcess ?? true,
                WebsocketAddress = string.IsNullOrWhiteSpace(item?.WebsocketAddress) ? "ws://localhost:12345" : item!.WebsocketAddress,
            });
        }

        return result;
    }

    private TCodeMotionProfile BuildMirroredTargetProfile(string? motionProfileId)
    {
        var defaultProfileId = GetDefaultAxisProfile().Id;
        var useGlobal = string.IsNullOrWhiteSpace(motionProfileId)
            || string.Equals(motionProfileId, defaultProfileId, StringComparison.OrdinalIgnoreCase);

        return CloneMotionProfile(ResolveMotionProfile(motionProfileId), useGlobal);
    }

    private static string NormalizeMotionProfileId(string? profileId, List<AxisProfileConfig> axisProfiles, string defaultProfileId)
    {
        if (string.IsNullOrWhiteSpace(profileId))
            return defaultProfileId;

        return axisProfiles.Any(profile => string.Equals(profile.Id, profileId, StringComparison.OrdinalIgnoreCase))
            ? profileId
            : defaultProfileId;
    }

    private static bool IsTCodeOutput(OutputDeviceType type) =>
        type == OutputDeviceType.TCodeSerial || type == OutputDeviceType.TCodeUdp || type == OutputDeviceType.TCodeTcp;

    private static int NormalizeOutputPort(OutputDeviceType type, int port)
    {
        return type switch
        {
            OutputDeviceType.TCodeUdp => port is > 0 and <= 65535 ? port : 9999,
            OutputDeviceType.TCodeTcp => port is > 0 and <= 65535 ? port : 9998,
            OutputDeviceType.Intiface => port is > 0 and <= 65535 ? port : 12345,
            _ => port,
        };
    }

    private static string BuildDefaultOutputId(OutputDeviceType type, int ordinal)
    {
        var prefix = type switch
        {
            OutputDeviceType.TCodeSerial => "output-tcode-serial",
            OutputDeviceType.TCodeUdp => "output-tcode-udp",
            OutputDeviceType.TCodeTcp => "output-tcode-tcp",
            OutputDeviceType.Intiface => "output-intiface",
            _ => "output-device",
        };

        return $"{prefix}-{ordinal}";
    }

    private static string BuildDefaultOutputName(OutputDeviceType type, int ordinal)
    {
        var label = type switch
        {
            OutputDeviceType.TCodeSerial => "TCode 串口",
            OutputDeviceType.TCodeUdp => "TCode UDP",
            OutputDeviceType.TCodeTcp => "TCode TCP",
            OutputDeviceType.Intiface => "Intiface",
            _ => "输出设备",
        };

        return $"{label} {ordinal}";
    }

    private static string EnsureUniqueId(string? candidate, HashSet<string> seenIds, string fallbackBase)
    {
        var baseId = string.IsNullOrWhiteSpace(candidate) ? fallbackBase : candidate.Trim();
        var unique = baseId;
        var suffix = 2;
        while (!seenIds.Add(unique))
        {
            unique = $"{baseId}-{suffix++}";
        }

        return unique;
    }

    private static TCodeMotionProfile CloneMotionProfile(TCodeMotionProfile source, bool useGlobal)
    {
        return new TCodeMotionProfile
        {
            UseGlobal = useGlobal,
            L0 = CloneAxis(source.L0),
            L1 = CloneAxis(source.L1),
            L2 = CloneAxis(source.L2),
            R0 = CloneAxis(source.R0),
            R1 = CloneAxis(source.R1),
            R2 = CloneAxis(source.R2),
            V0 = CloneAxis(source.V0),
            V1 = CloneAxis(source.V1),
            V2 = CloneAxis(source.V2),
            A0 = CloneAxis(source.A0),
        };
    }

    private static TCodeMotionProfile NormalizeProfile(TCodeMotionProfile? source, TCodeMotionProfile fallback, bool useGlobal)
    {
        return new TCodeMotionProfile
        {
            UseGlobal = source?.UseGlobal ?? useGlobal,
            L0        = NormalizeAxis(source?.L0, fallback.L0),
            L1        = NormalizeAxis(source?.L1, fallback.L1),
            L2        = NormalizeAxis(source?.L2, fallback.L2),
            R0        = NormalizeAxis(source?.R0, fallback.R0),
            R1        = NormalizeAxis(source?.R1, fallback.R1),
            R2        = NormalizeAxis(source?.R2, fallback.R2),
            V0        = NormalizeAxis(source?.V0, fallback.V0),
            V1        = NormalizeAxis(source?.V1, fallback.V1),
            V2        = NormalizeAxis(source?.V2, fallback.V2),
            A0        = NormalizeAxis(source?.A0, fallback.A0),
        };
    }

    private static TCodeAxisConfig NormalizeAxis(TCodeAxisConfig? source, TCodeAxisConfig fallback)
    {
        var min = Math.Clamp(source?.Min ?? fallback.Min, 0, 999);
        var max = Math.Clamp(source?.Max ?? fallback.Max, 0, 999);
        if (min > max)
            (min, max) = (max, min);

        var remapMin = Math.Clamp(source?.RemapMin ?? fallback.RemapMin, 0, 999);
        var remapMax = Math.Clamp(source?.RemapMax ?? fallback.RemapMax, 0, 999);
        if (remapMin > remapMax)
            (remapMin, remapMax) = (remapMax, remapMin);

        var mode = Enum.IsDefined(typeof(TCodeAxisMode), source?.Mode ?? fallback.Mode)
            ? source?.Mode ?? fallback.Mode
            : TCodeAxisMode.Normal;

        var commandMode = Enum.IsDefined(typeof(TCodeCommandMode), source?.CommandMode ?? fallback.CommandMode)
            ? source?.CommandMode ?? fallback.CommandMode
            : TCodeCommandMode.Speed;

        return new TCodeAxisConfig
        {
            Min       = min,
            Max       = max,
            RemapMin  = remapMin,
            RemapMax  = remapMax,
            MaxSpeed  = source is not null
                ? NormalizeSpeedValue(source.MaxSpeed)
                : Math.Clamp(fallback.MaxSpeed, 1, 999),
            Invert    = source?.Invert ?? fallback.Invert,
            Mode      = mode,
            CommandMode = commandMode,
            LockValue = Math.Clamp(source?.LockValue ?? fallback.LockValue, 0f, 1f),
        };
    }

    private static int NormalizeSpeedValue(int value) => Math.Clamp(value, 1, 999);

    private static TCodeAxisConfig CloneAxis(TCodeAxisConfig source)
    {
        return new TCodeAxisConfig
        {
            Min       = source.Min,
            Max       = source.Max,
            RemapMin  = source.RemapMin,
            RemapMax  = source.RemapMax,
            MaxSpeed  = source.MaxSpeed,
            Invert    = source.Invert,
            Mode      = source.Mode,
            CommandMode = source.CommandMode,
            LockValue = source.LockValue,
        };
    }

    private static SignalMapping CloneSignal(SignalMapping signal)
    {
        var mappedMin = Math.Clamp(signal.MappedMin ?? 0, 0, 999);
        var mappedMax = Math.Clamp(signal.MappedMax ?? 999, mappedMin, 999);
        return new SignalMapping
        {
            OscPath         = signal.OscPath,
            InvertDirection = signal.InvertDirection,
            VrchatMin       = signal.VrchatMin,
            VrchatMax       = signal.VrchatMax,
            Curve           = signal.Curve,
            Role            = signal.Role,
            MappedMin       = mappedMin,
            MappedMax       = mappedMax,
            IsOgbSocket     = signal.IsOgbSocket,
            IsOgbPlug       = signal.IsOgbPlug,
        };
    }

    private static List<OscMappingPresetConfig> BuildDefaultOscMappingPresets()
    {
        return new List<OscMappingPresetConfig>
        {
            new()
            {
                Id = "ogb-socket-full",
                Name = "OGB Socket · 深度 + 姿态",
                Description = "利用通配匹配任意 OGB Socket 孔位。深度使用完整行程；左右/上下姿态分别映射到 0-500 / 500-999 两段位置区间。",
                Mappings = new List<SignalMapping>
                {
                    new() { OscPath = "OGB/Orf/*/Main/PenOthers", Role = SignalRole.Depth, IsOgbSocket = true },
                    new() { OscPath = "OGB/Orf/*/Main/AngleRight_Raw", Role = SignalRole.AngleX, MappedMin = 500, MappedMax = 999, IsOgbSocket = true },
                    new() { OscPath = "OGB/Orf/*/Main/AngleLeft_Raw", Role = SignalRole.AngleX, MappedMin = 0, MappedMax = 500, IsOgbSocket = true },
                    new() { OscPath = "OGB/Orf/*/Main/AngleUp_Raw", Role = SignalRole.AngleY, MappedMin = 500, MappedMax = 999, IsOgbSocket = true },
                    new() { OscPath = "OGB/Orf/*/Main/AngleDown_Raw", Role = SignalRole.AngleY, MappedMin = 0, MappedMax = 500, IsOgbSocket = true },
                },
            },
            new()
            {
                Id = "ogb-plug-full",
                Name = "OGB Plug · 深度（插入 / 自插）",
                Description = "Plug 方标准深度，同时映射 PenOthers+PenSelf。深度自动反向。",
                Mappings = new List<SignalMapping>
                {
                    new() { OscPath = "OGB/Pen/*/PenOthers", Role = SignalRole.Depth, InvertDirection = true, IsOgbPlug = true },
                    new() { OscPath = "OGB/Pen/*/PenSelf", Role = SignalRole.Depth, InvertDirection = true, IsOgbPlug = true },
                },
            },
            new()
            {
                Id = "ogb-plug-others",
                Name = "OGB Plug · 仅插入他人",
                Description = "仅映射 PenOthers，不包含自插。",
                Mappings = new List<SignalMapping>
                {
                    new() { OscPath = "OGB/Pen/*/PenOthers", Role = SignalRole.Depth, InvertDirection = true, IsOgbPlug = true },
                },
            },
            new()
            {
                Id = "ogb-plug-self",
                Name = "OGB Plug · 仅自插",
                Description = "仅映射 PenSelf。需在 Sensa 组件中启用 generateSelfParam。",
                Mappings = new List<SignalMapping>
                {
                    new() { OscPath = "OGB/Pen/*/PenSelf", Role = SignalRole.Depth, InvertDirection = true, IsOgbPlug = true },
                },
            },
            new()
            {
                Id = "osr-inserted-pussy",
                Name = "OSR-VRChat · 被插入（小穴）",
                Description = "OGB/Orf/Pussy/PenOthers 插入深度（仅 Depth 单轴）。直接参考 OSR-VRChat。",
                Mappings = new List<SignalMapping>
                {
                    new() { OscPath = "OGB/Orf/Pussy/PenOthers", Role = SignalRole.Depth, IsOgbSocket = true },
                },
            },
            new()
            {
                Id = "osr-inserted-ass",
                Name = "OSR-VRChat · 被插入（后庭）",
                Description = "OGB/Orf/Ass/PenOthers 插入深度（仅 Depth 单轴）。直接参考 OSR-VRChat。",
                Mappings = new List<SignalMapping>
                {
                    new() { OscPath = "OGB/Orf/Ass/PenOthers", Role = SignalRole.Depth, IsOgbSocket = true },
                },
            },
        };
    }
}
