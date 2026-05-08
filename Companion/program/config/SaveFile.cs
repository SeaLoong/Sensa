using Sensa.Core;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sensa.Config;

// SignalConfig lives in Sensa.Core to avoid circular dependency (core → config → core).
// This global using alias re-exports it for convenience within this namespace.
// (SaveFile.Signals is List<SignalConfig>, which resolves from Sensa.Core.)

// ═══════════════════════════════════════════════════════════════════════
//  TCode transmitter config
// ═══════════════════════════════════════════════════════════════════════

public sealed class TCodeConfig
{
    public string ComPort           { get; set; } = "COM3";
    public int    MaxPos            { get; set; } = 900;
    public int    MinPos            { get; set; } = 100;
    public int    MaxVelocity       { get; set; } = 2000;
    public bool   L0Invert          { get; set; } = false;
    public int    UpdatesPerSecond  { get; set; } = 50;
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

public sealed class TCodeAxisConfig
{
    public int  Min      { get; set; } = 100;
    public int  Max      { get; set; } = 900;
    public int  MaxSpeed { get; set; } = 2000;
    public bool Invert   { get; set; } = false;
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
    public List<SignalConfig> Mappings    { get; set; } = new();
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
    public int              UpdatesPerSecond    { get; set; } = 50;
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
    public bool   SendVibrate { get; set; } = true;
    public bool   Enabled     { get; set; } = true;
}

// ═══════════════════════════════════════════════════════════════════════
//  Root save file
// ═══════════════════════════════════════════════════════════════════════

public sealed class SaveFile
{
    private static readonly HashSet<string> BuiltInOscMappingPresetIds = BuildDefaultOscMappingPresets()
        .Select(preset => preset.Id)
        .Where(id => !string.IsNullOrWhiteSpace(id))
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    public int                  SchemaVersion { get; set; } = 0;
    public OscReceiverConfig     Osc          { get; set; } = new();
    public WebUiConfig           WebUi        { get; set; } = new();
    public IntifaceConfig         Intiface     { get; set; } = new();
    public TCodeConfig            TCode        { get; set; } = new();
    public TCodeProfilesConfig    TCodeProfiles { get; set; } = new();
    public List<AxisProfileConfig> AxisProfiles  { get; set; } = new();
    public List<OutputDeviceConfig> Outputs      { get; set; } = new();
    public UdpTCodeConfig         UdpTCode     { get; set; } = new();
    public TcpTCodeConfig         TcpTCode     { get; set; } = new();
    public List<SignalConfig>      Signals      { get; set; } = new();
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
        // LocalApplicationData (%LOCALAPPDATA%) is preferred over Roaming AppData
        // because config contains machine-specific settings (COM port, device addresses).
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(appData, "Sensa", "config.json");
    }

    public static SaveFile Load()
    {
        try
        {
            var path = ConfigPath();
            if (File.Exists(path))
            {
                var json = File.ReadAllText(path);
                var loaded = JsonSerializer.Deserialize<SaveFile>(json, JsonOpts) ?? new SaveFile();
                loaded.NormalizeForRuntime();
                return loaded;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Sensa] Failed to load config: {ex.Message}");
        }
        var empty = new SaveFile();
        empty.NormalizeForRuntime();
        return empty;
    }

    public void Save()
    {
        try
        {
            NormalizeForRuntime();
            var path = ConfigPath();
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var json = JsonSerializer.Serialize(this, JsonOpts);
            File.WriteAllText(path, json);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Sensa] Failed to save config: {ex.Message}");
        }
    }

    public void CopyFrom(SaveFile other)
    {
        SchemaVersion = other.SchemaVersion;

        var osc = other.Osc ?? new OscReceiverConfig();
        Osc.ReceiverHost = string.IsNullOrWhiteSpace(osc.ReceiverHost) ? "0.0.0.0" : osc.ReceiverHost;
        Osc.ReceiverPort = osc.ReceiverPort is > 0 and <= 65535 ? osc.ReceiverPort : 9001;

        var webUi = other.WebUi ?? new WebUiConfig();
        WebUi.Host            = string.IsNullOrWhiteSpace(webUi.Host) ? "127.0.0.1" : webUi.Host;
        WebUi.Port            = webUi.Port;
        WebUi.AutoOpenBrowser = webUi.AutoOpenBrowser;
        WebUi.Title           = string.IsNullOrWhiteSpace(webUi.Title) ? "Sensa WebUI" : webUi.Title;

        var intiface = other.Intiface ?? new IntifaceConfig();
        Intiface.Enabled             = intiface.Enabled;
        Intiface.ManageEngineProcess = intiface.ManageEngineProcess;
        Intiface.WebsocketAddress    = string.IsNullOrWhiteSpace(intiface.WebsocketAddress) ? "ws://localhost:12345" : intiface.WebsocketAddress;
        Intiface.Port                = intiface.Port;

        var tcode = other.TCode ?? new TCodeConfig();
        TCode.ComPort          = string.IsNullOrWhiteSpace(tcode.ComPort) ? "COM3" : tcode.ComPort;
        TCode.MaxPos           = tcode.MaxPos;
        TCode.MinPos           = tcode.MinPos;
        TCode.MaxVelocity      = tcode.MaxVelocity;
        TCode.L0Invert         = tcode.L0Invert;
        TCode.UpdatesPerSecond = tcode.UpdatesPerSecond;
        TCode.PreferSpeedMode  = tcode.PreferSpeedMode;
        TCode.Enabled          = tcode.Enabled;
        TCodeProfiles          = CloneProfiles(other.TCodeProfiles, tcode);

        var udpTCode = other.UdpTCode ?? new UdpTCodeConfig();
        UdpTCode.Enabled = udpTCode.Enabled;
        UdpTCode.Host    = string.IsNullOrWhiteSpace(udpTCode.Host) ? "127.0.0.1" : udpTCode.Host;
        UdpTCode.Port    = udpTCode.Port;

        var tcpTCode = other.TcpTCode ?? new TcpTCodeConfig();
        TcpTCode.Enabled = tcpTCode.Enabled;
        TcpTCode.Host    = string.IsNullOrWhiteSpace(tcpTCode.Host) ? "127.0.0.1" : tcpTCode.Host;
        TcpTCode.Port    = tcpTCode.Port;

        AxisProfiles = CloneAxisProfiles(
            SchemaVersion >= 2 ? other.AxisProfiles : null,
            other.TCodeProfiles,
            tcode);

        Outputs = CloneOutputs(
            SchemaVersion >= 2 ? other.Outputs : null,
            tcode,
            other.TCodeProfiles,
            udpTCode,
            tcpTCode,
            intiface,
            AxisProfiles);

        Signals = (other.Signals ?? new List<SignalConfig>())
            .Select(CloneSignal)
            .ToList();

        OscMappingPresets = CloneOscMappingPresets(
            SchemaVersion >= 3 ? other.OscMappingPresets : null);

        DeviceRoutes = (other.DeviceRoutes ?? new List<DeviceRouteEntry>())
            .Select(route => new DeviceRouteEntry
            {
                DeviceName  = route.DeviceName,
                SendL0      = route.SendL0,
                SendVibrate = route.SendVibrate,
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
        TCodeProfiles = CloneProfiles(TCodeProfiles, TCode);
        AxisProfiles = CloneAxisProfiles(
            SchemaVersion >= 2 ? AxisProfiles : null,
            TCodeProfiles,
            TCode);
        Outputs = CloneOutputs(
            SchemaVersion >= 2 ? Outputs : null,
            TCode,
            TCodeProfiles,
            UdpTCode,
            TcpTCode,
            Intiface,
            AxisProfiles);
        OscMappingPresets = CloneOscMappingPresets(
            SchemaVersion >= 3 ? OscMappingPresets : null);
        SchemaVersion = 3;

        Osc.ReceiverHost = string.IsNullOrWhiteSpace(Osc.ReceiverHost) ? "0.0.0.0" : Osc.ReceiverHost;
        Osc.ReceiverPort = Osc.ReceiverPort is > 0 and <= 65535 ? Osc.ReceiverPort : 9001;

        WebUi.Host            = string.IsNullOrWhiteSpace(WebUi.Host) ? "127.0.0.1" : WebUi.Host;
        WebUi.Title           = string.IsNullOrWhiteSpace(WebUi.Title) ? "Sensa WebUI" : WebUi.Title;
        WebUi.Port            = WebUi.Port is > 0 and <= 65535 ? WebUi.Port : 5086;

        TCode.ComPort          = string.IsNullOrWhiteSpace(TCode.ComPort) ? "COM3" : TCode.ComPort;
        TCode.UpdatesPerSecond = Math.Clamp(TCode.UpdatesPerSecond, 10, 240);

        UdpTCode.Host = string.IsNullOrWhiteSpace(UdpTCode.Host) ? "127.0.0.1" : UdpTCode.Host;
        UdpTCode.Port = UdpTCode.Port is > 0 and <= 65535 ? UdpTCode.Port : 9999;

        TcpTCode.Host = string.IsNullOrWhiteSpace(TcpTCode.Host) ? "127.0.0.1" : TcpTCode.Host;
        TcpTCode.Port = TcpTCode.Port is > 0 and <= 65535 ? TcpTCode.Port : 9998;

        Signals ??= new List<SignalConfig>();
        OscMappingPresets ??= new List<OscMappingPresetConfig>();
        DeviceRoutes ??= new List<DeviceRouteEntry>();

        SyncLegacyFieldsFromOutputs();
    }

    public AxisProfileConfig GetDefaultAxisProfile()
    {
        if (AxisProfiles.Count == 0)
        {
            AxisProfiles = CloneAxisProfiles(new List<AxisProfileConfig>(), TCodeProfiles, TCode);
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

    public int GetRecommendedLoopRate()
    {
        var serialRates = Outputs
            .Where(output => output.Type == OutputDeviceType.TCodeSerial && output.Enabled)
            .Select(output => Math.Clamp(output.UpdatesPerSecond, 10, 240));

        return serialRates.DefaultIfEmpty(Math.Clamp(TCode.UpdatesPerSecond, 10, 240)).Max();
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

    private void SyncLegacyFieldsFromOutputs()
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
            TCode.PreferSpeedMode  = serialOutput.PreferSpeedMode;
            TCode.UpdatesPerSecond = Math.Clamp(serialOutput.UpdatesPerSecond, 10, 240);
            TCodeProfiles.Serial   = BuildLegacyTargetProfile(serialOutput.MotionProfileId);
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
            TCodeProfiles.Udp      = BuildLegacyTargetProfile(udpOutput.MotionProfileId);
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
            TCodeProfiles.Tcp      = BuildLegacyTargetProfile(tcpOutput.MotionProfileId);
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

    private static TCodeProfilesConfig CloneProfiles(TCodeProfilesConfig? source, TCodeConfig legacyTCode)
    {
        var legacyGlobal = CreateLegacyProfile(legacyTCode);
        var globalSource = source?.Global;
        var useLegacyGlobal = IsDefaultProfile(globalSource) && HasLegacyMotionOverrides(legacyTCode);
        var global = NormalizeProfile(useLegacyGlobal ? legacyGlobal : globalSource, legacyGlobal, useGlobal: false);

        return new TCodeProfilesConfig
        {
            Global = global,
            Serial = NormalizeProfile(source?.Serial, global, useGlobal: true),
            Udp    = NormalizeProfile(source?.Udp, global, useGlobal: true),
            Tcp    = NormalizeProfile(source?.Tcp, global, useGlobal: true),
        };
    }

    private static List<AxisProfileConfig> CloneAxisProfiles(List<AxisProfileConfig>? source, TCodeProfilesConfig? legacyProfiles, TCodeConfig legacyTCode)
    {
        var normalizedLegacy = CloneProfiles(legacyProfiles, legacyTCode);
        var result = new List<AxisProfileConfig>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var fallback = normalizedLegacy.Global;

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
                Motion = CloneMotionProfile(normalizedLegacy.Global, useGlobal: false),
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
            var mappings = (item.Mappings ?? new List<SignalConfig>())
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
        TCodeConfig legacyTCode,
        TCodeProfilesConfig? legacyProfiles,
        UdpTCodeConfig legacyUdp,
        TcpTCodeConfig legacyTcp,
        IntifaceConfig legacyIntiface,
        List<AxisProfileConfig> axisProfiles)
    {
        var normalizedLegacy = CloneProfiles(legacyProfiles, legacyTCode);
        var result = new List<OutputDeviceConfig>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var defaultProfileId = axisProfiles.First(profile => profile.IsDefault).Id;

        if (source is not null)
        {
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
                    UpdatesPerSecond = Math.Clamp(item?.UpdatesPerSecond ?? 50, 10, 240),
                    PreferSpeedMode = item?.PreferSpeedMode ?? true,
                    ManageEngineProcess = item?.ManageEngineProcess ?? true,
                    WebsocketAddress = string.IsNullOrWhiteSpace(item?.WebsocketAddress) ? "ws://localhost:12345" : item!.WebsocketAddress,
                });
            }

            return result;
        }

        result.Add(new OutputDeviceConfig
        {
            Id = EnsureUniqueId("output-tcode-serial-1", seenIds, "output-tcode-serial-1"),
            Name = BuildDefaultOutputName(OutputDeviceType.TCodeSerial, 1),
            Type = OutputDeviceType.TCodeSerial,
            Enabled = legacyTCode.Enabled,
            MotionProfileId = normalizedLegacy.Serial.UseGlobal
                ? defaultProfileId
                : EnsureAxisProfile(axisProfiles, normalizedLegacy.Serial, "串口轴配置"),
            ComPort = string.IsNullOrWhiteSpace(legacyTCode.ComPort) ? "COM3" : legacyTCode.ComPort,
            UpdatesPerSecond = Math.Clamp(legacyTCode.UpdatesPerSecond, 10, 240),
            PreferSpeedMode = legacyTCode.PreferSpeedMode,
        });

        result.Add(new OutputDeviceConfig
        {
            Id = EnsureUniqueId("output-tcode-udp-1", seenIds, "output-tcode-udp-1"),
            Name = BuildDefaultOutputName(OutputDeviceType.TCodeUdp, 1),
            Type = OutputDeviceType.TCodeUdp,
            Enabled = legacyUdp.Enabled,
            MotionProfileId = normalizedLegacy.Udp.UseGlobal
                ? defaultProfileId
                : EnsureAxisProfile(axisProfiles, normalizedLegacy.Udp, "UDP 轴配置"),
            Host = string.IsNullOrWhiteSpace(legacyUdp.Host) ? "127.0.0.1" : legacyUdp.Host,
            Port = NormalizeOutputPort(OutputDeviceType.TCodeUdp, legacyUdp.Port),
            PreferSpeedMode = legacyTCode.PreferSpeedMode,
        });

        result.Add(new OutputDeviceConfig
        {
            Id = EnsureUniqueId("output-tcode-tcp-1", seenIds, "output-tcode-tcp-1"),
            Name = BuildDefaultOutputName(OutputDeviceType.TCodeTcp, 1),
            Type = OutputDeviceType.TCodeTcp,
            Enabled = legacyTcp.Enabled,
            MotionProfileId = normalizedLegacy.Tcp.UseGlobal
                ? defaultProfileId
                : EnsureAxisProfile(axisProfiles, normalizedLegacy.Tcp, "TCP 轴配置"),
            Host = string.IsNullOrWhiteSpace(legacyTcp.Host) ? "127.0.0.1" : legacyTcp.Host,
            Port = NormalizeOutputPort(OutputDeviceType.TCodeTcp, legacyTcp.Port),
            PreferSpeedMode = legacyTCode.PreferSpeedMode,
        });

        result.Add(new OutputDeviceConfig
        {
            Id = EnsureUniqueId("output-intiface-1", seenIds, "output-intiface-1"),
            Name = BuildDefaultOutputName(OutputDeviceType.Intiface, 1),
            Type = OutputDeviceType.Intiface,
            Enabled = legacyIntiface.Enabled,
            Port = NormalizeOutputPort(OutputDeviceType.Intiface, legacyIntiface.Port),
            ManageEngineProcess = legacyIntiface.ManageEngineProcess,
            WebsocketAddress = string.IsNullOrWhiteSpace(legacyIntiface.WebsocketAddress) ? "ws://localhost:12345" : legacyIntiface.WebsocketAddress,
        });

        return result;
    }

    private static bool HasLegacyMotionOverrides(TCodeConfig legacyTCode)
    {
        return legacyTCode.MinPos != 100
            || legacyTCode.MaxPos != 900
            || legacyTCode.MaxVelocity != 2000
            || legacyTCode.L0Invert;
    }

    private static bool IsDefaultProfile(TCodeMotionProfile? profile)
    {
        if (profile is null)
            return true;

        return IsDefaultAxis(profile.L0)
            && IsDefaultAxis(profile.R0)
            && IsDefaultAxis(profile.R1)
            && IsDefaultAxis(profile.R2)
            && IsDefaultAxis(profile.L1)
            && IsDefaultAxis(profile.L2);
    }

    private static bool IsDefaultAxis(TCodeAxisConfig? axis)
    {
        if (axis is null)
            return true;

        return axis.Min == 100
            && axis.Max == 900
            && axis.MaxSpeed == 2000
            && axis.Invert == false;
    }

    private static TCodeMotionProfile CreateLegacyProfile(TCodeConfig legacyTCode)
    {
        var axis = new TCodeAxisConfig
        {
            Min      = legacyTCode.MinPos,
            Max      = legacyTCode.MaxPos,
            MaxSpeed = legacyTCode.MaxVelocity,
            Invert   = false,
        };

        return new TCodeMotionProfile
        {
            UseGlobal = false,
            L0 = new TCodeAxisConfig
            {
                Min      = legacyTCode.MinPos,
                Max      = legacyTCode.MaxPos,
                MaxSpeed = legacyTCode.MaxVelocity,
                Invert   = legacyTCode.L0Invert,
            },
            R0 = CloneAxis(axis),
            R1 = CloneAxis(axis),
            R2 = CloneAxis(axis),
            L1 = CloneAxis(axis),
            L2 = CloneAxis(axis),
        };
    }

    private TCodeMotionProfile BuildLegacyTargetProfile(string? motionProfileId)
    {
        var defaultProfileId = GetDefaultAxisProfile().Id;
        var useGlobal = string.IsNullOrWhiteSpace(motionProfileId)
            || string.Equals(motionProfileId, defaultProfileId, StringComparison.OrdinalIgnoreCase);

        return CloneMotionProfile(ResolveMotionProfile(motionProfileId), useGlobal);
    }

    private static string EnsureAxisProfile(List<AxisProfileConfig> axisProfiles, TCodeMotionProfile profile, string preferredName)
    {
        var normalized = CloneMotionProfile(profile, useGlobal: false);
        normalized.UseGlobal = false;

        var existing = axisProfiles.FirstOrDefault(item => AreMotionProfilesEqual(item.Motion, normalized));
        if (existing is not null)
            return existing.Id;

        var seenIds = new HashSet<string>(axisProfiles.Select(profileItem => profileItem.Id), StringComparer.OrdinalIgnoreCase);
        var id = EnsureUniqueId(Slugify(preferredName), seenIds, $"axis-profile-{axisProfiles.Count + 1}");

        axisProfiles.Add(new AxisProfileConfig
        {
            Id = id,
            Name = preferredName,
            IsDefault = false,
            Motion = normalized,
        });

        return id;
    }

    private static bool AreMotionProfilesEqual(TCodeMotionProfile left, TCodeMotionProfile right)
    {
        return AreAxisEqual(left.L0, right.L0)
            && AreAxisEqual(left.R0, right.R0)
            && AreAxisEqual(left.R1, right.R1)
            && AreAxisEqual(left.R2, right.R2)
            && AreAxisEqual(left.L1, right.L1)
            && AreAxisEqual(left.L2, right.L2);
    }

    private static bool AreAxisEqual(TCodeAxisConfig left, TCodeAxisConfig right)
    {
        return left.Min == right.Min
            && left.Max == right.Max
            && left.MaxSpeed == right.MaxSpeed
            && left.Invert == right.Invert;
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

    private static string Slugify(string value)
    {
        var chars = value
            .Select(ch => char.IsLetterOrDigit(ch) ? char.ToLowerInvariant(ch) : '-')
            .ToArray();
        var text = new string(chars).Trim('-');
        return string.IsNullOrWhiteSpace(text) ? "axis-profile" : text;
    }

    private static TCodeMotionProfile CloneMotionProfile(TCodeMotionProfile source, bool useGlobal)
    {
        return new TCodeMotionProfile
        {
            UseGlobal = useGlobal,
            L0 = CloneAxis(source.L0),
            R0 = CloneAxis(source.R0),
            R1 = CloneAxis(source.R1),
            R2 = CloneAxis(source.R2),
            L1 = CloneAxis(source.L1),
            L2 = CloneAxis(source.L2),
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

        return new TCodeAxisConfig
        {
            Min      = min,
            Max      = max,
            MaxSpeed = Math.Clamp(source?.MaxSpeed ?? fallback.MaxSpeed, 1, 9999),
            Invert   = source?.Invert ?? fallback.Invert,
        };
    }

    private static TCodeAxisConfig CloneAxis(TCodeAxisConfig source)
    {
        return new TCodeAxisConfig
        {
            Min      = source.Min,
            Max      = source.Max,
            MaxSpeed = source.MaxSpeed,
            Invert   = source.Invert,
        };
    }

    private static SignalConfig CloneSignal(SignalConfig signal)
    {
        return new SignalConfig
        {
            OscPath         = signal.OscPath,
            InvertDirection = signal.InvertDirection,
            VrchatMin       = signal.VrchatMin,
            VrchatMax       = signal.VrchatMax,
            SmoothingAlpha  = signal.SmoothingAlpha,
            DeadZone        = signal.DeadZone,
            Curve           = signal.Curve,
            Role            = signal.Role,
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
                Id = "osr-inserted-pussy",
                Name = "OSR-VRChat · 被插入（小穴）",
                Description = "直接参考 OSR-VRChat 源码：监听 /avatar/parameters/OGB/Orf/Pussy/PenOthers。",
                Mappings = new List<SignalConfig>
                {
                    new()
                    {
                        OscPath = "OGB/Orf/Pussy/PenOthers",
                        Role = SignalRole.Depth,
                        IsOgbSocket = true,
                    },
                },
            },
            new()
            {
                Id = "osr-inserted-ass",
                Name = "OSR-VRChat · 被插入（后庭）",
                Description = "直接参考 OSR-VRChat 源码：监听 /avatar/parameters/OGB/Orf/Ass/PenOthers。",
                Mappings = new List<SignalConfig>
                {
                    new()
                    {
                        OscPath = "OGB/Orf/Ass/PenOthers",
                        Role = SignalRole.Depth,
                        IsOgbSocket = true,
                    },
                },
            },
            new()
            {
                Id = "osr-inserting-others",
                Name = "OSR-VRChat · 插入他人",
                Description = "直接参考 OSR-VRChat 源码：监听 /avatar/parameters/OGB/Pen/*，并按其 inserting_others 逻辑反向映射深度。",
                Mappings = new List<SignalConfig>
                {
                    new()
                    {
                        OscPath = "OGB/Pen/*",
                        Role = SignalRole.Depth,
                        InvertDirection = true,
                        IsOgbPlug = true,
                    },
                },
            },
            new()
            {
                Id = "osr-inserting-self",
                Name = "OSR-VRChat · 自插测试",
                Description = "直接参考 OSR-VRChat 源码：监听 /avatar/parameters/OGB/Pen/*，并按其 inserting_self 逻辑反向映射深度。",
                Mappings = new List<SignalConfig>
                {
                    new()
                    {
                        OscPath = "OGB/Pen/*",
                        Role = SignalRole.Depth,
                        InvertDirection = true,
                        IsOgbPlug = true,
                    },
                },
            },
            new()
            {
                Id = "ogb-socket-full",
                Name = "OGB Socket 完整（被插入 · 全部轴）",
                Description = "参照 osc.toys / OGB 标准：作为 Orifice/Socket 方，映射全部 SPS 参数轴。",
                Mappings = new List<SignalConfig>
                {
                    new() { OscPath = "OGB/Orf/Pussy/Main/PenOthers", Role = SignalRole.Depth, IsOgbSocket = true },
                    new() { OscPath = "OGB/Orf/Pussy/Main/AngleRight_Raw", Role = SignalRole.AngleX, IsOgbSocket = true },
                    new() { OscPath = "OGB/Orf/Pussy/Main/AngleUp_Raw", Role = SignalRole.AngleY, IsOgbSocket = true },
                    new() { OscPath = "OGB/Orf/Pussy/Main/Twist_Raw", Role = SignalRole.Twist, IsOgbSocket = true },
                    new() { OscPath = "OGB/Orf/Pussy/Main/Surge_Raw", Role = SignalRole.Surge, IsOgbSocket = true },
                    new() { OscPath = "OGB/Orf/Pussy/Main/Sway_Raw", Role = SignalRole.Sway, IsOgbSocket = true },
                    new() { OscPath = "OGB/Orf/Pussy/Main/Vibrate", Role = SignalRole.Vibrate, IsOgbSocket = true },
                },
            },
            new()
            {
                Id = "ogb-plug-full",
                Name = "OGB Plug 完整（插入方 · 全部轴）",
                Description = "参照 osc.toys / OGB 标准：作为 Pen/Plug 方，使用 OGB/Pen/* 通配路径映射全部 SPS 参数轴。",
                Mappings = new List<SignalConfig>
                {
                    new() { OscPath = "OGB/Pen/*", Role = SignalRole.Depth, InvertDirection = true, IsOgbPlug = true },
                    new() { OscPath = "OGB/Pen/*", Role = SignalRole.AngleX, InvertDirection = true, IsOgbPlug = true },
                    new() { OscPath = "OGB/Pen/*", Role = SignalRole.AngleY, InvertDirection = true, IsOgbPlug = true },
                    new() { OscPath = "OGB/Pen/*", Role = SignalRole.Twist, InvertDirection = true, IsOgbPlug = true },
                    new() { OscPath = "OGB/Pen/*", Role = SignalRole.Surge, InvertDirection = true, IsOgbPlug = true },
                    new() { OscPath = "OGB/Pen/*", Role = SignalRole.Sway, InvertDirection = true, IsOgbPlug = true },
                    new() { OscPath = "OGB/Pen/*", Role = SignalRole.Vibrate, IsOgbPlug = true },
                },
            },
            new()
            {
                Id = "sensa-socket-starter",
                Name = "Sensa / OGB Socket · 深度 + 姿态起点",
                Description = "按照 Sensa 生成的 OGB 参数命名，附带单边姿态起始映射。",
                Mappings = new List<SignalConfig>
                {
                    new()
                    {
                        OscPath = "OGB/Orf/Pussy/Main/PenOthers",
                        Role = SignalRole.Depth,
                        IsOgbSocket = true,
                    },
                    new()
                    {
                        OscPath = "OGB/Orf/Pussy/Main/AngleRight_Raw",
                        Role = SignalRole.AngleX,
                        IsOgbSocket = true,
                    },
                    new()
                    {
                        OscPath = "OGB/Orf/Pussy/Main/AngleUp_Raw",
                        Role = SignalRole.AngleY,
                        IsOgbSocket = true,
                    },
                },
            },
        };
    }
}
