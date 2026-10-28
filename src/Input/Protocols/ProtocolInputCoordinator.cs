using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Sensa.Input.Protocols;

/// <summary>Owns protocol listeners separately from the authenticated management interface.</summary>
public sealed class ProtocolInputCoordinator : IAsyncDisposable
{
    private sealed class Listener(ProtocolInputConfig config)
    {
        public readonly ProtocolInputConfig Config = config;
        public WebApplication? App;
        public TCodeInputService? TCode;
        public IntifaceDeviceInput? Intiface;
        public HttpProtocolInput? Http;
        public bool Listening;
        public string? Error;
    }
    private readonly ExternalControlStore _store;
    private readonly Action<string> _log;
    private readonly SemaphoreSlim _reload = new(1, 1);
    private readonly object _sync = new();
    private List<Listener> _listeners = [];
    private bool _disposed;
    public event Action? Changed;
    public ProtocolInputCoordinator(ExternalControlStore store, Action<string> log)
    { _store = store; _log = log; _store.CommandsCleared += ResetCommands; }

    public async Task ReloadAsync(IEnumerable<ProtocolInputConfig> inputs)
    {
        var config = ProtocolInputConfiguration.CloneAndValidate(inputs);
        await _reload.WaitAsync().ConfigureAwait(false);
        try
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            await StopListenersAsync().ConfigureAwait(false);
            _store.Configure(config);
            foreach (var input in config)
            {
                var listener = new Listener(input);
                lock (_sync) _listeners.Add(listener);
                if (!input.Enabled) continue;
                try
                {
                    if (input.Type is "TCodeTcp" or "TCodeUdp" or "TCodeSerial")
                    { listener.TCode = new(input, _store); await listener.TCode.StartAsync().ConfigureAwait(false); }
                    else if (input.Type == "IntifaceDevice")
                    { listener.Intiface = new(input, _store); await listener.Intiface.StartAsync().ConfigureAwait(false); }
                    else await StartWebListenerAsync(listener).ConfigureAwait(false);
                    listener.Listening = true;
                }
                catch (Exception error)
                {
                    listener.Error = "Could not start protocol input: " + error.GetType().Name;
                    _log("[Protocol input/" + input.Id + "] " + listener.Error);
                    throw new InvalidOperationException(listener.Error, error);
                }
            }
        }
        catch (Exception error)
        {
            await StopListenersAsync().ConfigureAwait(false);
            _store.Configure([]);
            lock (_sync) _listeners = config.Select(input => new Listener(input)
            { Error = input.Enabled ? "Could not start protocol inputs: " + error.GetType().Name : null }).ToList();
            throw;
        }
        finally { _reload.Release(); Changed?.Invoke(); }
    }

    private async Task StartWebListenerAsync(Listener listener)
    {
        var input = listener.Config;
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions { Args = [], ContentRootPath = AppContext.BaseDirectory });
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(options =>
        {
            options.Listen(IPAddress.Parse(input.Host), input.Port);
            options.Limits.MaxRequestBodySize = input.Type is "AutoblowHttp" or "VacuGlideHttp" ? 1024 * 1024 + 16384 : 64 * 1024;
            options.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(10);
        });
        var app = builder.Build(); listener.App = app;
        app.UseWebSockets(new() { KeepAliveInterval = TimeSpan.FromSeconds(5), KeepAliveTimeout = TimeSpan.FromSeconds(10) });
        if (input.Type != "Buttplug") listener.Http = new(input, _store);
        var slots = new SemaphoreSlim(8, 8);
        app.Run(async context =>
        {
            if (!IsRequestAllowed(input, context.Request.Host.Host, context.Request.Headers.Origin.ToString(), context.Connection.RemoteIpAddress))
            { context.Response.StatusCode = 403; return; }
            var origin = context.Request.Headers.Origin.ToString();
            if (origin.Length > 0)
            {
                context.Response.Headers.AccessControlAllowOrigin = origin;
                context.Response.Headers.Vary = "Origin";
                context.Response.Headers.AccessControlAllowMethods = "GET, POST, PUT, DELETE, OPTIONS";
                context.Response.Headers.AccessControlAllowHeaders = "Content-Type, X-Sensa-Session, X-Connection-Key, Authorization, X-Api-Key, X-Device-Token";
            }
            if (context.Request.Method == "OPTIONS") { context.Response.StatusCode = 204; return; }
            if (!await slots.WaitAsync(0, context.RequestAborted).ConfigureAwait(false)) { context.Response.StatusCode = 429; return; }
            using var requestLifetime = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, app.Lifetime.ApplicationStopping);
            using var abortOnShutdown = app.Lifetime.ApplicationStopping.Register(context.Abort);
            try
            {
                if (input.Type == "Buttplug")
                {
                    if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode = 426; return; }
                    using var socket = await context.WebSockets.AcceptWebSocketAsync().ConfigureAwait(false);
                    using var session = new ButtplugInputSession(input, _store);
                    await session.RunAsync(socket, requestLifetime.Token).ConfigureAwait(false);
                }
                else if (input.Type == "JsonWebSocket")
                {
                    if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode = 426; return; }
                    using var socket = await context.WebSockets.AcceptWebSocketAsync().ConfigureAwait(false);
                    await listener.Http!.RunAsync(socket, requestLifetime.Token).ConfigureAwait(false);
                }
                else
                {
                    context.RequestAborted = requestLifetime.Token;
                    await listener.Http!.HandleAsync(context).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception error)
            {
                // Do not log URLs, request bodies, vendor keys or supplied headers.
                listener.Error = "Protocol request failed: " + error.GetType().Name;
                if (!context.Response.HasStarted) context.Response.StatusCode = 400;
                Changed?.Invoke();
            }
            finally { slots.Release(); }
        });
        await app.StartAsync().ConfigureAwait(false);
    }

    public static bool IsRequestAllowed(ProtocolInputConfig config, string host, string origin, IPAddress? remote)
    {
        var hostAllowed = host.Equals(config.Host, StringComparison.OrdinalIgnoreCase)
            || (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || IPAddress.TryParse(host, out var address) && IPAddress.IsLoopback(address))
                && IPAddress.TryParse(config.Host, out var bound) && IPAddress.IsLoopback(bound)
            || config.Host is "0.0.0.0" or "::" && IPAddress.TryParse(host, out _);
        if (!hostAllowed) return false;
        if (origin.Length == 0) return remote is not null && IPAddress.IsLoopback(remote);
        return config.AllowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase);
    }

    private void ResetCommands()
    {
        Listener[] listeners;
        lock (_sync) listeners = _listeners.ToArray();
        foreach (var listener in listeners)
        { listener.TCode?.ResetCommands(); listener.Intiface?.ResetCommands(); }
    }

    public object[] Snapshot()
    {
        Listener[] listeners;
        lock (_sync) listeners = _listeners.ToArray();
        return listeners.Select(listener =>
        {
            var state = _store.GetStatus(listener.Config.Id);
            return (object)new
            {
                id = listener.Config.Id, name = listener.Config.Name, type = listener.Config.Type, enabled = listener.Config.Enabled,
                listening = listener.Listening, connected = state?.Session is not null || listener.Intiface?.IsConnected == true,
                session = state?.Session, receivedCommands = state?.ReceivedCommands ?? 0, channels = state?.Channels ?? [],
                lastError = listener.Error ?? listener.TCode?.LastError ?? listener.Intiface?.LastError,
                address = listener.Config.Type == "IntifaceDevice" ? listener.Config.Address : listener.Config.Type == "TCodeSerial" ? listener.Config.ComPort
                    : (listener.Config.Type is "Buttplug" or "JsonWebSocket" ? "ws://" : listener.Config.Type == "TCodeTcp" ? "tcp://" : listener.Config.Type == "TCodeUdp" ? "udp://" : "http://")
                        + (listener.Config.Host.Contains(':') ? "[" + listener.Config.Host + "]" : listener.Config.Host) + ":" + listener.Config.Port,
            };
        }).ToArray();
    }

    private async Task StopListenersAsync()
    {
        Listener[] listeners;
        lock (_sync) { listeners = _listeners.ToArray(); _listeners.Clear(); }
        foreach (var listener in listeners)
        {
            try
            {
                listener.Http?.Dispose();
            }
            catch (Exception error) { _log("[Protocol input] Cleanup failed: " + error.GetType().Name); }
            try
            {
                if (listener.App is not null)
                {
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                    try { await listener.App.StopAsync(timeout.Token).ConfigureAwait(false); } catch (OperationCanceledException) { }
                    await listener.App.DisposeAsync().ConfigureAwait(false);
                }
                if (listener.TCode is not null) await listener.TCode.DisposeAsync().ConfigureAwait(false);
                if (listener.Intiface is not null) await listener.Intiface.DisposeAsync().ConfigureAwait(false);
            }
            catch (Exception error) { _log("[Protocol input] Cleanup failed: " + error.GetType().Name); }
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _reload.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_disposed) return; _disposed = true;
            _store.CommandsCleared -= ResetCommands;
            await StopListenersAsync().ConfigureAwait(false);
        }
        finally { _reload.Release(); }
    }
}
