using System.Text.Json;
using Makaretu.Dns;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Sensa.Configuration;

namespace Sensa.Input.Osc;

public sealed class OscQueryReceiverService : IAsyncDisposable, IDisposable
{
    private readonly object _sync = new();
    private readonly Action<string>? _logDebug;
    private readonly Action<string>? _logError;
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
    };

    private WebApplication? _app;
    private MulticastService? _mdns;
    private ServiceDiscovery? _serviceDiscovery;
    private string _signature = string.Empty;
    private OscQueryReceiverServiceSnapshot _snapshot = OscQueryReceiverServiceSnapshot.Disabled();
    private int _disposed;

    public OscQueryReceiverService(Action<string>? logDebug = null, Action<string>? logError = null)
    {
        _logDebug = logDebug;
        _logError = logError;
    }

    public event Action? StateChanged;

    public OscQueryReceiverServiceSnapshot Snapshot
    {
        get
        {
            lock (_sync)
                return _snapshot;
        }
    }

    public void Configure(bool oscModeActive, OscQueryReceiverAdvertiseConfig? config, int oscPort)
    {
        ThrowIfDisposed();

        var normalized = NormalizeConfig(config);
        var shouldRun = oscModeActive && normalized.Enabled && (normalized.AdvertiseAvatar || normalized.AdvertiseTracking);
        var signature = BuildSignature(shouldRun, normalized, oscPort);

        lock (_sync)
        {
            if (string.Equals(_signature, signature, StringComparison.Ordinal))
                return;
        }

        ReconfigureAsync(shouldRun, normalized, oscPort, signature).GetAwaiter().GetResult();
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0)
            return;

        await StopCoreAsync().ConfigureAwait(false);
    }

    public void Dispose()
    {
        DisposeAsync().AsTask().GetAwaiter().GetResult();
    }

    private async Task ReconfigureAsync(bool shouldRun, OscQueryReceiverAdvertiseConfig config, int oscPort, string signature)
    {
        var previousSnapshot = Snapshot;
        await StopCoreAsync().ConfigureAwait(false);

        var advertisedPaths = BuildAdvertisedPaths(config);
        if (!shouldRun)
        {
            UpdateSnapshot(new OscQueryReceiverServiceSnapshot
            {
                Enabled = config.Enabled,
                Running = false,
                ServiceName = config.ServiceName,
                HttpPort = config.HttpPort,
                HttpUrl = BuildQueryUrl(config.HttpPort),
                OscPort = NormalizeOscPort(oscPort),
                AdvertisedPaths = advertisedPaths,
            }, signature);

            if (previousSnapshot.Running)
                _logDebug?.Invoke("[OSCQuery/Receiver] Advertisement stopped.");

            return;
        }

        WebApplication? app = null;
        MulticastService? mdns = null;
        ServiceDiscovery? serviceDiscovery = null;

        try
        {
            app = BuildHttpApplication(config, oscPort, advertisedPaths);
            await app.StartAsync().ConfigureAwait(false);

            mdns = new MulticastService();
            serviceDiscovery = new ServiceDiscovery(mdns);

            var oscQueryProfile = new ServiceProfile(config.ServiceName, "_oscjson._tcp", checked((ushort)config.HttpPort));
            oscQueryProfile.AddProperty("txtvers", "1");
            oscQueryProfile.AddProperty("type", "OSCQuery");
            oscQueryProfile.AddProperty("path", "/");
            serviceDiscovery.Advertise(oscQueryProfile);

            var oscUdpProfile = new ServiceProfile(config.ServiceName, "_osc._udp", checked((ushort)NormalizeOscPort(oscPort)));
            oscUdpProfile.AddProperty("txtvers", "1");
            serviceDiscovery.Advertise(oscUdpProfile);

            mdns.Start();

            lock (_sync)
            {
                _app = app;
                _mdns = mdns;
                _serviceDiscovery = serviceDiscovery;
            }

            UpdateSnapshot(new OscQueryReceiverServiceSnapshot
            {
                Enabled = true,
                Running = true,
                ServiceName = config.ServiceName,
                HttpPort = config.HttpPort,
                HttpUrl = BuildQueryUrl(config.HttpPort),
                OscPort = NormalizeOscPort(oscPort),
                AdvertisedPaths = advertisedPaths,
                StartedAtUtc = DateTimeOffset.UtcNow,
            }, signature);

            _logDebug?.Invoke($"[OSCQuery/Receiver] Advertising {config.ServiceName} on {BuildQueryUrl(config.HttpPort)} → UDP {NormalizeOscPort(oscPort)} ({string.Join(", ", advertisedPaths)})");
        }
        catch (Exception ex)
        {
            _logError?.Invoke($"[OSCQuery/Receiver] Failed to start advertisement: {ex.Message}");
            await DisposeRuntimeObjectsAsync(app, mdns, serviceDiscovery).ConfigureAwait(false);
            UpdateSnapshot(new OscQueryReceiverServiceSnapshot
            {
                Enabled = config.Enabled,
                Running = false,
                ServiceName = config.ServiceName,
                HttpPort = config.HttpPort,
                HttpUrl = BuildQueryUrl(config.HttpPort),
                OscPort = NormalizeOscPort(oscPort),
                AdvertisedPaths = advertisedPaths,
                Error = ex.Message,
            }, string.Empty);
            throw;
        }
    }

    private async Task StopCoreAsync()
    {
        WebApplication? app;
        MulticastService? mdns;
        ServiceDiscovery? serviceDiscovery;
        var hadRuntime = false;

        lock (_sync)
        {
            app = _app;
            mdns = _mdns;
            serviceDiscovery = _serviceDiscovery;
            hadRuntime = _app is not null || _mdns is not null || _serviceDiscovery is not null;
            _app = null;
            _mdns = null;
            _serviceDiscovery = null;
            _signature = string.Empty;
        }

        await DisposeRuntimeObjectsAsync(app, mdns, serviceDiscovery).ConfigureAwait(false);

        if (hadRuntime)
            SafeInvoke(StateChanged);
    }

    private async Task DisposeRuntimeObjectsAsync(WebApplication? app, MulticastService? mdns, ServiceDiscovery? serviceDiscovery)
    {
        if (app is not null)
        {
            try { await app.StopAsync().ConfigureAwait(false); } catch { }
            try { await app.DisposeAsync().ConfigureAwait(false); } catch { }
        }

        if (serviceDiscovery is IDisposable serviceDiscoveryDisposable)
        {
            try { serviceDiscoveryDisposable.Dispose(); } catch { }
        }

        if (mdns is IDisposable mdnsDisposable)
        {
            try { mdnsDisposable.Dispose(); } catch { }
        }
    }

    private WebApplication BuildHttpApplication(OscQueryReceiverAdvertiseConfig config, int oscPort, IReadOnlyList<string> advertisedPaths)
    {
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions
        {
            Args = Array.Empty<string>(),
            ApplicationName = typeof(OscQueryReceiverService).Assembly.FullName,
        });
        builder.WebHost.UseUrls(BuildBindUrl(config.HttpPort));

        var app = builder.Build();
        app.Run(context => HandleRequestAsync(context, config.ServiceName, NormalizeOscPort(oscPort), advertisedPaths));
        return app;
    }

    private async Task HandleRequestAsync(HttpContext context, string serviceName, int oscPort, IReadOnlyList<string> advertisedPaths)
    {
        if (!HttpMethods.IsGet(context.Request.Method))
        {
            context.Response.StatusCode = StatusCodes.Status405MethodNotAllowed;
            return;
        }

        var root = BuildAddressTree(advertisedPaths);
        var requestedAttributes = context.Request.Query.Keys
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .Select(key => key.Trim())
            .ToArray();

        if (requestedAttributes.Any(key => string.Equals(key, "HOST_INFO", StringComparison.OrdinalIgnoreCase)))
        {
            await WriteJsonAsync(context, BuildHostInfo(serviceName, oscPort)).ConfigureAwait(false);
            return;
        }

        var requestPath = NormalizeRequestPath(context.Request.Path.Value);
        if (!TryFindNode(root, requestPath, out var node))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        if (requestedAttributes.Length == 0)
        {
            await WriteJsonAsync(context, node.ToPayload()).ConfigureAwait(false);
            return;
        }

        var payload = BuildAttributePayload(node, requestedAttributes);
        if (payload.Count == 0)
        {
            context.Response.StatusCode = StatusCodes.Status204NoContent;
            return;
        }

        await WriteJsonAsync(context, payload).ConfigureAwait(false);
    }

    private async Task WriteJsonAsync(HttpContext context, Dictionary<string, object?> payload)
    {
        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = "application/json";
        var json = JsonSerializer.Serialize(payload, _jsonOptions);
        await context.Response.WriteAsync(json).ConfigureAwait(false);
    }

    private void UpdateSnapshot(OscQueryReceiverServiceSnapshot snapshot, string signature)
    {
        lock (_sync)
        {
            _snapshot = snapshot;
            _signature = signature;
        }

        SafeInvoke(StateChanged);
    }

    private static OscQueryReceiverAdvertiseConfig NormalizeConfig(OscQueryReceiverAdvertiseConfig? config)
    {
        return new OscQueryReceiverAdvertiseConfig
        {
            Enabled = config?.Enabled ?? false,
            ServiceName = string.IsNullOrWhiteSpace(config?.ServiceName) ? "Sensa" : config!.ServiceName.Trim(),
            HttpPort = NormalizeHttpPort(config?.HttpPort ?? 9010),
            AdvertiseAvatar = config?.AdvertiseAvatar ?? true,
            AdvertiseTracking = config?.AdvertiseTracking ?? true,
        };
    }

    private static int NormalizeHttpPort(int port) => port is > 0 and <= 65535 ? port : 9010;

    private static int NormalizeOscPort(int port) => port is > 0 and <= 65535 ? port : 9001;

    private static string BuildSignature(bool shouldRun, OscQueryReceiverAdvertiseConfig config, int oscPort)
    {
        return string.Join("|",
            shouldRun ? "run" : "stop",
            config.Enabled ? "1" : "0",
            config.ServiceName,
            NormalizeHttpPort(config.HttpPort).ToString(),
            config.AdvertiseAvatar ? "1" : "0",
            config.AdvertiseTracking ? "1" : "0",
            NormalizeOscPort(oscPort).ToString());
    }

    private static string BuildBindUrl(int httpPort) => $"http://0.0.0.0:{NormalizeHttpPort(httpPort)}";

    private static string BuildQueryUrl(int httpPort) => $"http://127.0.0.1:{NormalizeHttpPort(httpPort)}/";

    private static string NormalizeRequestPath(string? rawPath)
    {
        if (string.IsNullOrWhiteSpace(rawPath) || rawPath == "/")
            return "/";

        var trimmed = rawPath.Trim();
        if (!trimmed.StartsWith('/'))
            trimmed = "/" + trimmed;

        return trimmed.TrimEnd('/');
    }

    private static IReadOnlyList<string> BuildAdvertisedPaths(OscQueryReceiverAdvertiseConfig config)
    {
        var result = new List<string>();
        if (config.AdvertiseAvatar)
            result.Add("/avatar");
        if (config.AdvertiseTracking)
            result.Add("/tracking/vrsystem");
        return result;
    }

    private static Dictionary<string, object?> BuildHostInfo(string serviceName, int oscPort)
    {
        return new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["NAME"] = string.IsNullOrWhiteSpace(serviceName) ? "Sensa" : serviceName,
            ["OSC_PORT"] = NormalizeOscPort(oscPort),
            ["OSC_TRANSPORT"] = "UDP",
            ["EXTENSIONS"] = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["ACCESS"] = true,
                ["DESCRIPTION"] = true,
            },
        };
    }

    private static Dictionary<string, object?> BuildAttributePayload(OscQueryAddressNode node, IReadOnlyList<string> attributes)
    {
        var payload = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var attribute in attributes)
        {
            switch (attribute.Trim().ToUpperInvariant())
            {
                case "FULL_PATH":
                    payload["FULL_PATH"] = node.FullPath;
                    break;
                case "DESCRIPTION":
                    payload["DESCRIPTION"] = node.Description;
                    break;
                case "ACCESS":
                    payload["ACCESS"] = node.Access;
                    break;
                case "TYPE" when !string.IsNullOrWhiteSpace(node.Type):
                    payload["TYPE"] = node.Type;
                    break;
                case "CONTENTS" when node.Children.Count > 0:
                    payload["CONTENTS"] = node.Children.ToDictionary(pair => pair.Key, pair => (object?)pair.Value.ToPayload(), StringComparer.Ordinal);
                    break;
            }
        }

        return payload;
    }

    private static OscQueryAddressNode BuildAddressTree(IReadOnlyList<string> advertisedPaths)
    {
        var root = new OscQueryAddressNode("/", "Sensa OSC receiver root", access: 0);

        if (advertisedPaths.Contains("/avatar", StringComparer.Ordinal))
        {
            var avatar = new OscQueryAddressNode("/avatar", "Receive VRChat avatar OSC data", access: 0);
            avatar.Children["change"] = new OscQueryAddressNode("/avatar/change", "Receive avatar change notifications", type: "s", access: 2);
            avatar.Children["parameters"] = new OscQueryAddressNode("/avatar/parameters", "Receive avatar parameter messages", access: 0);
            root.Children["avatar"] = avatar;
        }

        if (advertisedPaths.Contains("/tracking/vrsystem", StringComparer.Ordinal))
        {
            var tracking = new OscQueryAddressNode("/tracking", "Receive VRChat tracking OSC data", access: 0);
            tracking.Children["vrsystem"] = new OscQueryAddressNode("/tracking/vrsystem", "Receive head and wrist tracking messages for passthrough", access: 0);
            root.Children["tracking"] = tracking;
        }

        return root;
    }

    private static bool TryFindNode(OscQueryAddressNode root, string path, out OscQueryAddressNode node)
    {
        node = root;
        if (path == "/")
            return true;

        var segments = path.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        foreach (var segment in segments)
        {
            if (!node.Children.TryGetValue(segment, out var child))
                return false;

            node = child;
        }

        return true;
    }

    private void ThrowIfDisposed()
    {
        if (Interlocked.CompareExchange(ref _disposed, 0, 0) != 0)
            throw new ObjectDisposedException(nameof(OscQueryReceiverService));
    }

    private static void SafeInvoke(Action? callback)
    {
        try { callback?.Invoke(); } catch { }
    }
}

internal sealed class OscQueryAddressNode
{
    public OscQueryAddressNode(string fullPath, string description, string? type = null, int access = 0)
    {
        FullPath = fullPath;
        Description = description;
        Type = type;
        Access = access;
    }

    public string FullPath { get; }
    public string Description { get; }
    public string? Type { get; }
    public int Access { get; }
    public Dictionary<string, OscQueryAddressNode> Children { get; } = new(StringComparer.Ordinal);

    public Dictionary<string, object?> ToPayload()
    {
        var payload = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["FULL_PATH"] = FullPath,
            ["DESCRIPTION"] = Description,
            ["ACCESS"] = Access,
        };

        if (!string.IsNullOrWhiteSpace(Type))
            payload["TYPE"] = Type;

        if (Children.Count > 0)
        {
            payload["CONTENTS"] = Children.ToDictionary(pair => pair.Key, pair => (object?)pair.Value.ToPayload(), StringComparer.Ordinal);
        }

        return payload;
    }
}

public sealed class OscQueryReceiverServiceSnapshot
{
    public bool Enabled { get; init; }
    public bool Running { get; init; }
    public string ServiceName { get; init; } = "Sensa";
    public int HttpPort { get; init; }
    public string HttpUrl { get; init; } = string.Empty;
    public int OscPort { get; init; }
    public DateTimeOffset? StartedAtUtc { get; init; }
    public IReadOnlyList<string> AdvertisedPaths { get; init; } = Array.Empty<string>();
    public string Error { get; init; } = string.Empty;

    public static OscQueryReceiverServiceSnapshot Disabled() => new()
    {
        Enabled = false,
        Running = false,
        ServiceName = "Sensa",
        HttpPort = 9010,
        HttpUrl = "http://127.0.0.1:9010/",
        OscPort = 9001,
        AdvertisedPaths = Array.Empty<string>(),
    };
}
