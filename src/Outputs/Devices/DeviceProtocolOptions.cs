using Sensa.Motion;

namespace Sensa.Outputs.Devices;

/// <summary>Settings for explicitly selected vendor APIs. Credentials never form part of a URL.</summary>
public sealed class DeviceProtocolOptions
{
    public string Endpoint { get; set; } = "";
    public string ConnectionKey { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public string Axis { get; set; } = "L0";
    public int ApiVersion { get; set; } = 2;
    public string ApiKey { get; set; } = "";
    public string AuthToken { get; set; } = "";
    public string Function { get; set; } = "Vibrate";
    public int Speed { get; set; } = 50;
    public int OffsetMs { get; set; }
    public string TrustedClusterHost { get; set; } = "";
    public string ScriptUrl { get; set; } = "";
    public string ScriptFormat { get; set; } = "Csv";
    public int ScriptTimeoutMs { get; set; } = 90000;
    public int RequestTimeoutMs { get; set; } = 3000;
    public int MinIntervalMs { get; set; } = 100;

    public static DeviceProtocolOptions Clone(DeviceProtocolOptions? source) => new()
    {
        Endpoint = source?.Endpoint?.Trim() ?? "",
        ConnectionKey = source?.ConnectionKey?.Trim() ?? "",
        DeviceId = source?.DeviceId?.Trim() ?? "",
        Axis = source?.Axis ?? "L0",
        ApiVersion = source?.ApiVersion ?? 2,
        ApiKey = source?.ApiKey?.Trim() ?? "",
        AuthToken = source?.AuthToken?.Trim() ?? "",
        Function = source?.Function ?? "Vibrate",
        Speed = source?.Speed ?? 50,
        OffsetMs = source?.OffsetMs ?? 0,
        TrustedClusterHost = source?.TrustedClusterHost?.Trim().ToLowerInvariant() ?? "",
        ScriptUrl = source?.ScriptUrl?.Trim() ?? "",
        ScriptFormat = source?.ScriptFormat ?? "Csv",
        ScriptTimeoutMs = source?.ScriptTimeoutMs ?? 90000,
        RequestTimeoutMs = source?.RequestTimeoutMs ?? 3000,
        MinIntervalMs = source?.MinIntervalMs ?? 100,
    };

    public static bool Equivalent(DeviceProtocolOptions? left, DeviceProtocolOptions? right) =>
        System.Text.Json.JsonSerializer.Serialize(Clone(left)) == System.Text.Json.JsonSerializer.Serialize(Clone(right));

    public static void Validate(DeviceProtocolOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (!Enum.TryParse<MotionAxis>(options.Axis, out _) || !Enum.IsDefined(Enum.Parse<MotionAxis>(options.Axis)))
            throw new ArgumentException("Select a valid source axis for the device API.");
        if (options.ApiVersion is not (2 or 3)) throw new ArgumentException("Handy API version must be 2 or 3.");
        if (options.Function is not ("Vibrate" or "Rotate" or "Pump" or "Thrusting" or "Fingering" or "Suction"))
            throw new ArgumentException("Unsupported Lovense function.");
        if (options.Speed is < 0 or > 100) throw new ArgumentException("Device speed must be between 0 and 100.");
        if (options.OffsetMs is < -60000 or > 60000) throw new ArgumentException("Script offset must be within one minute.");
        if (options.RequestTimeoutMs is < 100 or > 15000) throw new ArgumentException("Device API timeout must be 100–15000 ms.");
        if (options.MinIntervalMs is < 25 or > 10000) throw new ArgumentException("Device API interval must be 25–10000 ms.");
        if (options.ScriptFormat is not ("Csv" or "Funscript")) throw new ArgumentException("Script format must be Csv or Funscript.");
        if (options.ScriptTimeoutMs is < 100 or > 180000) throw new ArgumentException("Script preparation timeout must be 100–180000 ms.");
        foreach (var value in new[] { options.ConnectionKey, options.ApiKey, options.AuthToken, options.DeviceId })
            if (value.Length > 4096 || value.Any(character => character < ' ' || character == '\u007f'))
                throw new ArgumentException("Device API credentials or identifier contain invalid characters.");
        foreach (var credential in new[] { options.ConnectionKey, options.ApiKey, options.AuthToken })
            if (credential.Any(character => character > '~' || character == ' '))
                throw new ArgumentException("Device API credentials must contain visible ASCII characters without spaces.");
        if (options.TrustedClusterHost.Length > 253 || options.TrustedClusterHost.Contains(':')
            || options.TrustedClusterHost.Contains('/') || options.TrustedClusterHost.Contains('@'))
            throw new ArgumentException("Trusted cluster must be an exact hostname without a port or path.");
        if (options.Endpoint.Length > 0) _ = ValidateEndpoint(options.Endpoint);
        if (options.ScriptUrl.Length > 0 && (!Uri.TryCreate(options.ScriptUrl, UriKind.Absolute, out var script)
            || script.Scheme is not ("https" or "http") || script.UserInfo.Length > 0 || options.ScriptUrl.Length > 8192))
            throw new ArgumentException("Script URL must be an absolute HTTP(S) URL without embedded credentials.");
    }

    internal static Uri ValidateEndpoint(string value)
    {
        if (!Uri.TryCreate(value.TrimEnd('/') + "/", UriKind.Absolute, out var uri)
            || uri.Scheme is not ("https" or "http") || uri.UserInfo.Length > 0
            || uri.Query.Length > 0 || uri.Fragment.Length > 0)
            throw new ArgumentException("Device API endpoint must be an absolute HTTP(S) URL without credentials, query or fragment.");
        if (uri.Scheme == "http" && !IsLocalHost(uri.Host))
            throw new ArgumentException("Remote device APIs require HTTPS; HTTP is available for explicit local endpoints.");
        return uri;
    }

    private static bool IsLocalHost(string host)
    {
        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || host.EndsWith(".local", StringComparison.OrdinalIgnoreCase)) return true;
        if (!System.Net.IPAddress.TryParse(host, out var address)) return false;
        if (System.Net.IPAddress.IsLoopback(address)) return true;
        var bytes = address.GetAddressBytes();
        return bytes.Length == 4
            ? bytes[0] == 10 || bytes[0] == 192 && bytes[1] == 168 || bytes[0] == 172 && bytes[1] is >= 16 and <= 31
            : address.IsIPv6LinkLocal || (bytes[0] & 0xfe) == 0xfc;
    }
}
