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
    public int    MaxVelocity       { get; set; } = 1400;
    public bool   L0Invert          { get; set; } = false;
    public int    UpdatesPerSecond  { get; set; } = 50;
    public bool   PreferSpeedMode   { get; set; } = true;
    public bool   Enabled           { get; set; } = false;
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
//  Safety config
// ═══════════════════════════════════════════════════════════════════════

public enum IdleBehavior { Park, StayAtPosition, RetractToZero }

public sealed class SafetyConfig
{
    public float        GlobalIntensityCap { get; set; } = 0.80f;
    public int          RampUpMs           { get; set; } = 2000;
    public IdleBehavior Idle               { get; set; } = IdleBehavior.RetractToZero;
    public string       EmergencyStopKey   { get; set; } = "Escape";
}

// ═══════════════════════════════════════════════════════════════════════
//  Rhythm detector config
// ═══════════════════════════════════════════════════════════════════════

public sealed class RhythmConfig
{
    public bool  Enabled       { get; set; } = false;
    public int   WindowMs      { get; set; } = 3000;
    public float MinBpm        { get; set; } = 5f;
    public float MaxBpm        { get; set; } = 300f;
}

// ═══════════════════════════════════════════════════════════════════════
//  OSC receiver config
// ═══════════════════════════════════════════════════════════════════════

public sealed class OscReceiverConfig
{
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
    public OscReceiverConfig     Osc          { get; set; } = new();
    public WebUiConfig           WebUi        { get; set; } = new();
    public IntifaceConfig         Intiface     { get; set; } = new();
    public TCodeConfig            TCode        { get; set; } = new();
    public SafetyConfig           Safety       { get; set; } = new();
    public RhythmConfig           Rhythm       { get; set; } = new();
    public List<SignalConfig>      Signals      { get; set; } = new();
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
                return JsonSerializer.Deserialize<SaveFile>(json, JsonOpts) ?? new SaveFile();
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Sensa] Failed to load config: {ex.Message}");
        }
        return new SaveFile();
    }

    public void Save()
    {
        try
        {
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
        Osc          = other.Osc          ?? new OscReceiverConfig();
        WebUi        = other.WebUi        ?? new WebUiConfig();
        Intiface     = other.Intiface     ?? new IntifaceConfig();
        TCode        = other.TCode        ?? new TCodeConfig();
        Safety       = other.Safety       ?? new SafetyConfig();
        Rhythm       = other.Rhythm       ?? new RhythmConfig();
        Signals      = other.Signals      ?? new List<SignalConfig>();
        DeviceRoutes = other.DeviceRoutes ?? new List<DeviceRouteEntry>();
    }
}
