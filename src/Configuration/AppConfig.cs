using Sensa.Signals;
using Sensa.Input.Protocols;
using Sensa.Outputs.Devices;
using Sensa.Outputs.Intiface;
using Sensa.Outputs;
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
    OscParameter,
    Dglab,
    Recording,
    HttpJson,
    WebSocketJson,
    Mqtt,
    Midi,
    Handy,
    Autoblow,
    VacuGlide,
    Lovense,
}

public enum TCodeAxisMode
{
    Normal,
    Locked,
    Ignored,
}

public enum TCodeCommandMode
{
    None,
    Interval,
    Speed,
}

public enum TCodeSpeedUnitBase
{
    Per100ms,
    PerSecond,
}

public enum TCodeSlopeMode
{
    None,
    Speed,
    Interval,
    NoSlope,
}

public enum TCodeRampType
{
    None,
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
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
    public TCodeCommandMode CommandMode { get; set; } = TCodeCommandMode.Interval;
    public TCodeRampType RampType { get; set; } = TCodeRampType.None;
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
    public TCodeAxisConfig A1        { get; set; } = new();
    public TCodeAxisConfig A2        { get; set; } = new();
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
    public DeviceProtocolOptions Device { get; set; } = new();
    public List<IntifaceFeatureRoute> IntifaceFeatures { get; set; } = new();
    public SignalOutputOptions Signal { get; set; } = new();
    public string           Id                  { get; set; } = "";
    public string           Name                { get; set; } = "";
    public OutputDeviceType Type                { get; set; } = OutputDeviceType.TCodeSerial;
    public bool             Enabled             { get; set; } = false;
    public string           MotionProfileId     { get; set; } = "global-default";
    public string           ComPort             { get; set; } = "COM3";
    public string           Host                { get; set; } = "127.0.0.1";
    public int              Port                { get; set; } = 0;
    public bool             PreferSpeedMode     { get; set; } = true;
    public TCodeSpeedUnitBase SpeedUnitBase     { get; set; } = TCodeSpeedUnitBase.Per100ms;
    public TCodeSlopeMode   SlopeMode           { get; set; } = TCodeSlopeMode.None;
    public bool             ManageEngineProcess { get; set; } = false;
    public string           WebsocketAddress    { get; set; } = "ws://localhost:12345";
    public string           VibrationAxis       { get; set; } = "V0";
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
    public List<IntifaceFeatureRoute> FeatureRoutes { get; set; } = new();
    public bool   Enabled              { get; set; } = true;
    public bool   ManageEngineProcess  { get; set; } = false;
    public string WebsocketAddress     { get; set; } = "ws://localhost:12345";
    public int    Port                 { get; set; } = 12345;
    public string VibrationAxis        { get; set; } = "V0";

    public static string NormalizeVibrationAxis(string? value) => value?.Trim().ToUpperInvariant() switch
    {
        "V1" => "V1",
        "V2" => "V2",
        "L0" => "L0",
        _ => "V0",
    };
}

public enum OscHubMode
{
    EventDriven,
    FixedRate,
}

public sealed class OscHubTargetConfig
{
    public string Id      { get; set; } = "";
    public string Name    { get; set; } = "";
    public bool   Enabled { get; set; } = true;
    public string Host    { get; set; } = "127.0.0.1";
    public int    Port    { get; set; } = 9002;
}

public sealed class OscHubConfig
{
    public bool                    Enabled             { get; set; } = false;
    public OscHubMode              Mode                { get; set; } = OscHubMode.EventDriven;
    public int                     FixedRateHz         { get; set; } = 10;
    public bool                    ForwardAvatarChange { get; set; } = false;
    public List<OscHubTargetConfig> Targets            { get; set; } = new();
}

public sealed class OscQueryReceiverAdvertiseConfig
{
    public bool   Enabled           { get; set; } = false;
    public string ServiceName       { get; set; } = "Sensa";
    public int    HttpPort          { get; set; } = 9010;
    public bool   AdvertiseAvatar   { get; set; } = true;
    public bool   AdvertiseTracking { get; set; } = true;
}

public sealed class OscQueryPollingConfig
{
    public bool Enabled { get; set; } = false;
    public int RateHz   { get; set; } = 10;
}

// ═══════════════════════════════════════════════════════════════════════
//  OSC receiver config
// ═══════════════════════════════════════════════════════════════════════

public sealed class OgbControlConfig
{
    public bool Enabled { get; set; } = false;
    public string Host { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 9000;

    public System.Net.IPEndPoint ResolveTarget()
    {
        var host = Host?.Trim() ?? "";
        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase)) host = "127.0.0.1";
        if (!System.Net.IPAddress.TryParse(host, out var ip))
            throw new InvalidOperationException("OGB 控制目标需要单播 IP 地址和有效 UDP 端口。 / OGB control requires a unicast IP address and valid UDP port.");
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (Port is < 1 or > 65535 || ip.Equals(System.Net.IPAddress.Any) || ip.Equals(System.Net.IPAddress.IPv6Any)
            || ip.Equals(System.Net.IPAddress.Broadcast) || ip.IsIPv6Multicast
            || ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && ip.GetAddressBytes()[0] is >= 224 and <= 239)
            throw new InvalidOperationException("OGB 控制目标需要单播 IP 地址和有效 UDP 端口。 / OGB control requires a unicast IP address and valid UDP port.");
        return new(ip, Port);
    }
}

public sealed class OscReceiverConfig
{
    public bool Enabled { get; set; } = true;
    public string ReceiverHost { get; set; } = "127.0.0.1";
    public int ReceiverPort { get; set; } = 9001;
    public int InputTimeoutMs { get; set; } = 0;
    public OgbControlConfig OgbControl { get; set; } = new();
    public bool AllowExperimentalSpatialInput { get; set; } = false;
    public List<string> AllowedSourceAddresses { get; set; } = new();
    public bool OscQueryEnabled { get; set; } = true;
    public string OscQueryUrl { get; set; } = "http://127.0.0.1:9001/";
    public OscQueryPollingConfig OscQueryPolling { get; set; } = new();
    public OscQueryReceiverAdvertiseConfig OscQueryReceiver { get; set; } = new();
    public string PreferredSourcePersistentId { get; set; } = "";
    public OscHubConfig Hub { get; set; } = new();
}

// ═══════════════════════════════════════════════════════════════════════
//  Web UI / HTTP service config
// ═══════════════════════════════════════════════════════════════════════

public sealed class WebUiConfig
{
    public string Host            { get; set; } = "127.0.0.1";
    public int    Port            { get; set; } = 5086;
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

public sealed partial class AppConfig
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
    public List<ComputedSignalConfig> ComputedSignals { get; set; } = new();
    public List<ProtocolInputConfig> ProtocolInputs { get; set; } = new();
    public List<OscMappingPresetConfig> OscMappingPresets { get; set; } = new();
    public List<DeviceRouteEntry> DeviceRoutes { get; set; } = new();

    // ── Persistence ────────────────────────────────────────────────

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented     = true,
        Converters        = { new JsonStringEnumConverter() },
        PropertyNameCaseInsensitive = true,
    };

    internal static string ConfigPath()
    {
        return Environment.GetEnvironmentVariable("SENSA_CONFIG_PATH") is { Length: > 0 } path
            ? Path.GetFullPath(path) : Path.Combine(AppContext.BaseDirectory, "config.json");
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

    public static AppConfig Load(string? configPath = null)
    {
        try
        {
            var path = string.IsNullOrWhiteSpace(configPath) ? ConfigPath() : Path.GetFullPath(configPath);
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
            var path = string.IsNullOrWhiteSpace(configPath) ? ConfigPath() : Path.GetFullPath(configPath);
            if (File.Exists(path)) File.Copy(path, path + ".invalid-" + DateTime.UtcNow.ToString("yyyyMMddHHmmssfff"), overwrite: false);
        }
        return CreateDefaultConfig();
    }

    private static readonly object SaveGate = new();
    public void Save(string? configPath = null)
    {
        lock (SaveGate)
        {
            var path = string.IsNullOrWhiteSpace(configPath) ? ConfigPath() : Path.GetFullPath(configPath);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var snapshot = new AppConfig();
            snapshot.CopyFrom(this);
            snapshot.ResetTransientRuntimeState();
            var json = JsonSerializer.Serialize(snapshot, JsonOpts);
            var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                using (var file = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    using var writer = new StreamWriter(file, leaveOpen: true);
                    writer.Write(json); writer.Flush(); file.Flush(true);
                }
                File.Move(temp, path, overwrite: true);
            }
            finally { if (File.Exists(temp)) File.Delete(temp); }
        }
    }

    public void CopyFrom(AppConfig other)
    {
        SchemaVersion = other.SchemaVersion > 0 ? other.SchemaVersion : 5;

        var osc = other.Osc ?? new OscReceiverConfig();
        Osc.Enabled = osc.Enabled;
        Osc.InputTimeoutMs = Math.Clamp(osc.InputTimeoutMs, 0, 600000);
        Osc.AllowExperimentalSpatialInput = osc.AllowExperimentalSpatialInput;
        Osc.OgbControl = CloneOgbControlConfig(osc.OgbControl);
        Osc.AllowedSourceAddresses = (osc.AllowedSourceAddresses ?? new()).Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => System.Net.IPAddress.TryParse(s.Trim(), out var ip) ? ip.ToString() : throw new ArgumentException($"Invalid OSC source IP: {s}")).Distinct().Take(32).ToList();
        Osc.ReceiverHost = string.IsNullOrWhiteSpace(osc.ReceiverHost) ? "127.0.0.1" : osc.ReceiverHost;
        Osc.ReceiverPort = osc.ReceiverPort is > 0 and <= 65535 ? osc.ReceiverPort : 9001;
        Osc.OscQueryEnabled = osc.OscQueryEnabled;
        Osc.OscQueryUrl = string.IsNullOrWhiteSpace(osc.OscQueryUrl) ? "http://127.0.0.1:9001/" : osc.OscQueryUrl.Trim();
        Osc.OscQueryPolling = CloneOscQueryPollingConfig(osc.OscQueryPolling);
        Osc.OscQueryReceiver = CloneOscQueryReceiverAdvertiseConfig(osc.OscQueryReceiver);
        Osc.PreferredSourcePersistentId = string.IsNullOrWhiteSpace(osc.PreferredSourcePersistentId) ? string.Empty : osc.PreferredSourcePersistentId.Trim();
        Osc.Hub = CloneOscHubConfig(osc.Hub);

        var webUi = other.WebUi ?? new WebUiConfig();
        WebUi.Host            = string.IsNullOrWhiteSpace(webUi.Host) ? "127.0.0.1" : webUi.Host;
        WebUi.Port            = webUi.Port;
        WebUi.Title           = string.IsNullOrWhiteSpace(webUi.Title) ? "Sensa WebUI" : webUi.Title;
        TCodeProfiles = CloneProfiles(other.TCodeProfiles);
        AxisProfiles = CloneAxisProfiles(other.AxisProfiles);
        MergeOutputsPreservingReferences(other.Outputs);

        Signals = (other.Signals ?? new List<SignalMapping>())
            .Select(CloneSignal)
            .ToList();
        ComputedSignals = ComputedSignalEvaluator.CloneAndValidate(other.ComputedSignals);
        ProtocolInputs = ProtocolInputConfiguration.CloneAndValidate(other.ProtocolInputs);

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
        Intiface.VibrationAxis = IntifaceConfig.NormalizeVibrationAxis(Intiface.VibrationAxis);
        TCode ??= new TCodeConfig();
        UdpTCode ??= new UdpTCodeConfig();
        TcpTCode ??= new TcpTCodeConfig();
        TCodeProfiles = CloneProfiles(TCodeProfiles);
        AxisProfiles = CloneAxisProfiles(AxisProfiles);
        MergeOutputsPreservingReferences(Outputs);
        OscMappingPresets = CloneOscMappingPresets(OscMappingPresets);
        SchemaVersion = 5;

        Osc.ReceiverHost = string.IsNullOrWhiteSpace(Osc.ReceiverHost) ? "127.0.0.1" : Osc.ReceiverHost;
        Osc.ReceiverPort = Osc.ReceiverPort is > 0 and <= 65535 ? Osc.ReceiverPort : 9001;
        Osc.OscQueryUrl = string.IsNullOrWhiteSpace(Osc.OscQueryUrl) ? "http://127.0.0.1:9001/" : Osc.OscQueryUrl.Trim();
        Osc.OscQueryPolling = CloneOscQueryPollingConfig(Osc.OscQueryPolling);
        Osc.OscQueryReceiver = CloneOscQueryReceiverAdvertiseConfig(Osc.OscQueryReceiver);
        Osc.PreferredSourcePersistentId = string.IsNullOrWhiteSpace(Osc.PreferredSourcePersistentId) ? string.Empty : Osc.PreferredSourcePersistentId.Trim();
        Osc.Hub = CloneOscHubConfig(Osc.Hub);
        Osc.OgbControl = CloneOgbControlConfig(Osc.OgbControl);

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
        ComputedSignals = ComputedSignalEvaluator.CloneAndValidate(ComputedSignals);
        ProtocolInputs = ProtocolInputConfiguration.CloneAndValidate(ProtocolInputs);
        ValidateProtocolInputTargets();
        foreach (var output in Outputs.Where(output => output.Type is OutputDeviceType.Handy or OutputDeviceType.Autoblow or OutputDeviceType.VacuGlide or OutputDeviceType.Lovense))
            DeviceProtocolOptions.Validate(output.Device);
        SignalOutputConfiguration.Validate(this);
        ComputedSignalEvaluator.ValidateMappingReferences(Signals, ComputedSignals);
        ComputedSignalEvaluator.ValidateMappingReferences(OscMappingPresets.SelectMany(preset => preset.Mappings), ComputedSignals);
        if (Signals.Any(s=>s.SourceMode=="SensaPose") && Signals.Any(s=>s.SourceMode=="SensaPoint"))
            throw new InvalidOperationException("Use one spatial input mode per configuration; do not mix point and pose coordinates.");
        if (Signals.Where(s => s.SourceMode == "SensaPoint").Select(s => s.OscPath).Distinct(StringComparer.Ordinal).Count() > 1
            || Signals.Any(s=>s.SourceMode=="SensaPoint" && s.Role is SignalRole.GateEnable or SignalRole.DepthOverride))
            throw new InvalidOperationException("Point mappings require one shared path pattern and ordinary output roles.");
        if (Signals.Where(s => s.SourceMode == "SensaPose").Select(s => s.OscPath).Distinct(StringComparer.Ordinal).Count() > 1)
            throw new ArgumentException("精确定位的各轴必须使用同一个 Socket 路径，避免混合不同目标的坐标。");
        if (Signals.Any(s => s.SourceMode == "SensaPose" && s.Role is SignalRole.GateEnable or SignalRole.DepthOverride))
            throw new ArgumentException("精确定位请映射到具体输出轴；门控请使用直接映射。");
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

    public void ValidateOscQueryReceiverService()
    {
        var receiver = Osc?.OscQueryReceiver ?? new OscQueryReceiverAdvertiseConfig();
        if (!receiver.Enabled)
            return;

        if (!receiver.AdvertiseAvatar && !receiver.AdvertiseTracking)
        {
            throw new InvalidOperationException("OSCQuery 接收器广播至少需要启用 /avatar 或 /tracking/vrsystem 其中之一。");
        }

        var httpPort = NormalizeOscQueryReceiverHttpPort(receiver.HttpPort);
        var webUiPort = NormalizePort(WebUi?.Port ?? 5086, 5086);
        if (httpPort == webUiPort)
        {
            throw new InvalidOperationException($"OSCQuery 接收器 HTTP 端口 {httpPort} 与 WebUI 端口 {webUiPort} 冲突。请改用其他端口。");
        }
    }

    public void ValidateOscQueryPolling()
    {
        var osc = Osc ?? new OscReceiverConfig();
        var polling = osc.OscQueryPolling ?? new OscQueryPollingConfig();
        if (!polling.Enabled)
            return;

        if (!osc.OscQueryEnabled)
            throw new InvalidOperationException("启用 OSCQuery 轮询回退前，请先开启 OSCQuery 客户端。");
    }

    public void ValidateOgbControlTarget()
    {
        var control = Osc?.OgbControl ?? new OgbControlConfig();
        if (!control.Enabled) return;
        var target = control.ResolveTarget();
        var receiverHost = NormalizeHost(Osc!.ReceiverHost, "127.0.0.1");
        if (System.Net.IPAddress.TryParse(receiverHost, out var receiverIp))
            receiverHost = (receiverIp.IsIPv4MappedToIPv6 ? receiverIp.MapToIPv4() : receiverIp).ToString();
        if (Osc.Enabled && target.Port == Osc.ReceiverPort && IsOscReceiverLoopTarget(target.Address.ToString(), receiverHost))
            throw new InvalidOperationException("OGB 控制目标不能指向 Sensa 的 OSC 监听端口。 / OGB control cannot target Sensa's OSC listener.");
    }

    public void ValidateOscHubTargets()
    {
        var occupiedTargets = new Dictionary<string, OscHubTargetConfig>(StringComparer.OrdinalIgnoreCase);
        var osc = Osc ?? new OscReceiverConfig();
        var hub = osc.Hub ?? new OscHubConfig();
        var receiverHost = NormalizeHost(osc.ReceiverHost, "127.0.0.1");
        var receiverPort = NormalizePort(osc.ReceiverPort, 9001);

        foreach (var target in hub.Targets)
        {
            var host = NormalizeHost(target.Host, "127.0.0.1");
            var port = NormalizePort(target.Port, 9002);
            var key = $"osc-hub:{host}:{port}";

            if (occupiedTargets.TryGetValue(key, out var existing))
            {
                throw new InvalidOperationException($"OSC Hub 目标“{DescribeOscHubTarget(existing)}”与“{DescribeOscHubTarget(target)}”重复使用 UDP 地址 {host}:{port}。请改成未被占用的地址。");
            }

            occupiedTargets[key] = target;

            if (hub.Enabled && osc.Enabled && port == receiverPort && IsOscReceiverLoopTarget(host, receiverHost))
            {
                throw new InvalidOperationException($"OSC Hub 目标“{DescribeOscHubTarget(target)}”指向当前 OSC 监听端口 {host}:{port}，这会形成回环。请改成其他端口。");
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
            Intiface.VibrationAxis       = intifaceOutput.VibrationAxis;
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

    private static string DescribeOscHubTarget(OscHubTargetConfig target)
    {
        if (!string.IsNullOrWhiteSpace(target.Name))
            return target.Name.Trim();

        var host = NormalizeHost(target.Host, "127.0.0.1");
        var port = NormalizePort(target.Port, 9002);
        return $"{host}:{port}";
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

            case OutputDeviceType.Handy:
            case OutputDeviceType.Autoblow:
            case OutputDeviceType.VacuGlide:
            case OutputDeviceType.Lovense:
            {
                var identity = output.Type == OutputDeviceType.Lovense ? output.Device.DeviceId : output.Device.ConnectionKey;
                if (string.IsNullOrWhiteSpace(identity)) yield break;
                var endpoint = output.Device.Endpoint.Length > 0 ? output.Device.Endpoint : output.Type switch
                {
                    OutputDeviceType.Handy => "https://www.handyfeeling.com/",
                    OutputDeviceType.Autoblow or OutputDeviceType.VacuGlide => "https://latency.autoblowapi.com/",
                    _ => "https://127-0-0-1.lovense.club:30010/",
                };
                if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var api)) yield break;
                var host = api.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ? "127.0.0.1" : api.Host.ToLowerInvariant();
                var digest = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(identity)));
                yield return ($"vendor:{output.Type}:{api.Scheme}:{host}:{api.Port}:{digest}", $"{output.Type} API device");
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

    private static string NormalizeOscQueryReceiverServiceName(string? value) => string.IsNullOrWhiteSpace(value) ? "Sensa" : value.Trim();

    private static int NormalizeOscQueryReceiverHttpPort(int value) => value is > 0 and <= 65535 ? value : 9010;

    private static int NormalizeOscQueryPollingRate(int value) => Math.Clamp(value, 1, 30);

    private static string NormalizeWebsocketAddress(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback.ToLowerInvariant() : value.Trim().ToLowerInvariant();

    private static int NormalizeOscHubRate(int value) => Math.Clamp(value, 1, 240);

    private static bool IsOscAnyHost(string host)
    {
        return host == "0.0.0.0"
            || host == "::"
            || host == "*"
            || host.Equals("any", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsOscLoopbackHost(string host)
    {
        return host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || System.Net.IPAddress.TryParse(host, out var ip)
                && System.Net.IPAddress.IsLoopback(ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip);
    }

    private static bool IsOscReceiverLoopTarget(string targetHost, string receiverHost)
    {
        if (IsOscAnyHost(receiverHost))
            return true;

        if (string.Equals(targetHost, receiverHost, StringComparison.OrdinalIgnoreCase))
            return true;

        return IsOscLoopbackHost(targetHost) && IsOscLoopbackHost(receiverHost);
    }

    private static OscQueryReceiverAdvertiseConfig CloneOscQueryReceiverAdvertiseConfig(OscQueryReceiverAdvertiseConfig? source)
    {
        return new OscQueryReceiverAdvertiseConfig
        {
            Enabled = source?.Enabled ?? false,
            ServiceName = NormalizeOscQueryReceiverServiceName(source?.ServiceName),
            HttpPort = NormalizeOscQueryReceiverHttpPort(source?.HttpPort ?? 9010),
            AdvertiseAvatar = source?.AdvertiseAvatar ?? true,
            AdvertiseTracking = source?.AdvertiseTracking ?? true,
        };
    }

    private static OscQueryPollingConfig CloneOscQueryPollingConfig(OscQueryPollingConfig? source)
    {
        return new OscQueryPollingConfig
        {
            Enabled = source?.Enabled ?? false,
            RateHz = NormalizeOscQueryPollingRate(source?.RateHz ?? 10),
        };
    }

    private static OgbControlConfig CloneOgbControlConfig(OgbControlConfig? source) => new()
    {
        Enabled = source?.Enabled ?? false,
        Host = string.IsNullOrWhiteSpace(source?.Host) ? "127.0.0.1" : source.Host.Trim(),
        Port = source?.Port is > 0 and <= 65535 ? source.Port : 9000,
    };

    private static OscHubConfig CloneOscHubConfig(OscHubConfig? source)
    {
        return new OscHubConfig
        {
            Enabled = source?.Enabled ?? false,
            Mode = Enum.IsDefined(typeof(OscHubMode), source?.Mode ?? OscHubMode.EventDriven)
                ? source?.Mode ?? OscHubMode.EventDriven
                : OscHubMode.EventDriven,
            FixedRateHz = NormalizeOscHubRate(source?.FixedRateHz ?? 10),
            ForwardAvatarChange = source?.ForwardAvatarChange ?? false,
            Targets = CloneOscHubTargets(source?.Targets),
        };
    }

    private static List<OscHubTargetConfig> CloneOscHubTargets(List<OscHubTargetConfig>? source)
    {
        var result = new List<OscHubTargetConfig>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (source is null)
            return result;

        for (var index = 0; index < source.Count; index++)
        {
            var item = source[index] ?? new OscHubTargetConfig();
            var id = EnsureUniqueId(item.Id, seenIds, $"osc-hub-target-{index + 1}");
            var host = string.IsNullOrWhiteSpace(item.Host) ? "127.0.0.1" : item.Host.Trim();
            var port = item.Port is > 0 and <= 65535 ? item.Port : 9002 + index;
            var name = string.IsNullOrWhiteSpace(item.Name) ? $"Hub 目标 {index + 1}" : item.Name.Trim();

            result.Add(new OscHubTargetConfig
            {
                Id = id,
                Name = name,
                Enabled = item.Enabled,
                Host = host,
                Port = port,
            });
        }

        return result;
    }

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
                    ? $"轴配置 {index + 1}"
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
                Signal = SignalOutputConfiguration.Clone(item?.Signal),
                Device = DeviceProtocolOptions.Clone(item?.Device),
                IntifaceFeatures = IntifaceFeatureRoute.CloneAndValidate(item?.IntifaceFeatures),
                Enabled = item?.Enabled ?? false,
                MotionProfileId = IsTCodeOutput(type)
                    ? NormalizeMotionProfileId(item?.MotionProfileId, axisProfiles, defaultProfileId)
                    : defaultProfileId,
                ComPort = string.IsNullOrWhiteSpace(item?.ComPort) ? "COM3" : item!.ComPort,
                Host = string.IsNullOrWhiteSpace(item?.Host) ? "127.0.0.1" : item!.Host,
                Port = NormalizeOutputPort(type, item?.Port ?? 0),
                PreferSpeedMode = item?.PreferSpeedMode ?? true,
                SpeedUnitBase = Enum.IsDefined(typeof(TCodeSpeedUnitBase), item?.SpeedUnitBase ?? TCodeSpeedUnitBase.Per100ms)
                    ? item?.SpeedUnitBase ?? TCodeSpeedUnitBase.Per100ms
                    : TCodeSpeedUnitBase.Per100ms,
                SlopeMode = Enum.IsDefined(typeof(TCodeSlopeMode), item?.SlopeMode ?? TCodeSlopeMode.None)
                    ? item?.SlopeMode ?? TCodeSlopeMode.None
                    : TCodeSlopeMode.None,
                ManageEngineProcess = item?.ManageEngineProcess ?? false,
                VibrationAxis = IntifaceConfig.NormalizeVibrationAxis(item?.VibrationAxis),
                WebsocketAddress = string.IsNullOrWhiteSpace(item?.WebsocketAddress)
                    ? type is OutputDeviceType.HttpJson or OutputDeviceType.WebSocketJson ? "" : "ws://localhost:12345"
                    : item!.WebsocketAddress,
            });
        }

        return result;
    }

    private void MergeOutputsPreservingReferences(List<OutputDeviceConfig>? source)
    {
        var normalized = CloneOutputs(source, AxisProfiles);
        var existingById = (Outputs ?? new List<OutputDeviceConfig>())
            .Where(output => output is not null && !string.IsNullOrWhiteSpace(output.Id))
            .ToDictionary(output => output.Id, StringComparer.OrdinalIgnoreCase);

        var result = new List<OutputDeviceConfig>(normalized.Count);
        foreach (var next in normalized)
        {
            if (existingById.TryGetValue(next.Id, out var existing) && existing.Type == next.Type)
            {
                CopyOutput(existing, next);
                result.Add(existing);
            }
            else
            {
                result.Add(next);
            }
        }

        Outputs = result;
    }

    private static void CopyOutput(OutputDeviceConfig target, OutputDeviceConfig source)
    {
        target.Id = source.Id;
        target.Name = source.Name;
        target.Type = source.Type;
        target.Enabled = source.Enabled;
        target.MotionProfileId = source.MotionProfileId;
        target.ComPort = source.ComPort;
        target.Host = source.Host;
        target.Port = source.Port;
        target.PreferSpeedMode = source.PreferSpeedMode;
        target.SpeedUnitBase = source.SpeedUnitBase;
        target.SlopeMode = source.SlopeMode;
        target.ManageEngineProcess = source.ManageEngineProcess;
        target.VibrationAxis = source.VibrationAxis;
        target.WebsocketAddress = source.WebsocketAddress;
        target.Signal = SignalOutputConfiguration.Clone(source.Signal);
        target.Device = DeviceProtocolOptions.Clone(source.Device);
        target.IntifaceFeatures = IntifaceFeatureRoute.CloneAndValidate(source.IntifaceFeatures);
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
            OutputDeviceType.OscParameter => port is > 0 and <= 65535 ? port : 9000,
            OutputDeviceType.Mqtt => port is > 0 and <= 65535 ? port : 1883,
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
            A1 = CloneAxis(source.A1),
            A2 = CloneAxis(source.A2),
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
            A1        = NormalizeAxis(source?.A1, fallback.A1),
            A2        = NormalizeAxis(source?.A2, fallback.A2),
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
            : TCodeCommandMode.Interval;

        var rampType = Enum.IsDefined(typeof(TCodeRampType), source?.RampType ?? fallback.RampType)
            ? source?.RampType ?? fallback.RampType
            : TCodeRampType.None;

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
            RampType = rampType,
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
            RampType = source.RampType,
            LockValue = source.LockValue,
        };
    }

    private static SignalMapping CloneSignal(SignalMapping signal)
    {
        var mappedMin = Math.Clamp(signal.MappedMin ?? 0, 0, 999);
        var mappedMax = Math.Clamp(signal.MappedMax ?? 999, mappedMin, 999);
        return new SignalMapping
        {
            OscPath         = (signal.OscPath ?? "").Trim(),
            SourceMode      = signal.SourceMode is "OgbDepth" or "OgbTouch" or "SpsSocketDepth" or "SensaPose" or "SensaPoint" or "Computed" ? signal.SourceMode : "Direct",
            PoseMetric      = Enum.IsDefined(signal.PoseMetric) ? signal.PoseMetric : PoseMetric.Depth,
            PointMetric     = Enum.IsDefined(signal.PointMetric) ? signal.PointMetric : PointMetric.Z,
            InvertDirection = signal.InvertDirection,
            VrchatMin       = float.IsFinite(signal.VrchatMin) ? signal.VrchatMin : 0,
            VrchatMax       = float.IsFinite(signal.VrchatMax) ? signal.VrchatMax : 1,
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
        using var stream = typeof(AppConfig).Assembly.GetManifestResourceStream("Sensa.OscPresets.json")
            ?? throw new InvalidOperationException("Built-in presets are missing.");
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return JsonSerializer.Deserialize<List<OscMappingPresetConfig>>(stream, options) ?? new();
    }
}
