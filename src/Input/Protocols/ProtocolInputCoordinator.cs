using System.Net;
using System.Net.Sockets;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.DependencyInjection;
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
        public TCodeWebSocketInput? TCodeWebSocket;
        public readonly SemaphoreSlim Slots = new(8, 8);
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
    private readonly List<WebApplication> _webApps = [];
    private bool _disposed;
    public event Action? Changed;
    public ProtocolInputCoordinator(ExternalControlStore store, Action<string> log)
    { _store = store; _log = log; _store.CommandsCleared += ResetCommands; }

    public async Task ReloadAsync(IEnumerable<ProtocolInputConfig> inputs, bool resolvePortConflicts = false)
    {
        var submitted = inputs.ToList();
        var config = ProtocolInputConfiguration.CloneAndValidate(submitted);
        await _reload.WaitAsync().ConfigureAwait(false);
        try
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            await StopListenersAsync().ConfigureAwait(false);
            _store.Configure(config);
            var candidates = config.Select(input => new Listener(input)).ToList();
            lock (_sync) _listeners = candidates;
            foreach (var listener in candidates.Where(item => item.Config.Enabled && !ProtocolInputConfiguration.IsWebType(item.Config.Type)))
            {
                var input = listener.Config;
                if (input.Type is "TCodeTcp" or "TCodeUdp" or "TCodeSerial")
                {
                    listener.TCode = new(input, _store);
                    try { await listener.TCode.StartAsync().ConfigureAwait(false); }
                    catch (Exception error) when (resolvePortConflicts && input.Type != "TCodeSerial" && IsAddressInUse(error))
                    {
                        input.Port = 0;
                        listener.TCode = new(input, _store);
                        await listener.TCode.StartAsync().ConfigureAwait(false);
                    }
                    if (input.Type != "TCodeSerial") input.Port = listener.TCode.BoundPort;
                }
                else
                {
                    listener.Intiface = new(input, _store);
                    await listener.Intiface.StartAsync().ConfigureAwait(false);
                }
                listener.Listening = true;
            }
            foreach (var group in candidates.Where(item => item.Config.Enabled && ProtocolInputConfiguration.IsWebType(item.Config.Type))
                .GroupBy(item => (item.Config.Host, item.Config.Port)))
            {
                var members = group.OrderByDescending(item => item.Config.Path.Length).ToArray();
                try { await StartWebListenerAsync(members).ConfigureAwait(false); }
                catch (Exception error) when (resolvePortConflicts && IsAddressInUse(error))
                {
                    foreach (var member in members) member.Config.Port = 0;
                    await StartWebListenerAsync(members).ConfigureAwait(false);
                }
                foreach (var member in members) member.Listening = true;
            }
            // Only a successful startup may update caller-owned configuration. Saved edits
            // use the default strict behavior, while independent instances opt in at startup.
            if (resolvePortConflicts)
                foreach (var original in submitted)
                    original.Port = config.Single(input => input.Id == original.Id.Trim()).Port;

        }
        catch (Exception error)
        {
            await StopListenersAsync().ConfigureAwait(false);
            _store.Configure([]);
            lock (_sync) _listeners = config.Select(input => new Listener(input)
            { Error = input.Enabled ? "Could not start protocol inputs: " + error.GetType().Name : null }).ToList();
            if (error is InvalidOperationException or ObjectDisposedException) throw;
            throw new InvalidOperationException("Could not start protocol inputs: " + error.GetType().Name, error);
        }
        finally { _reload.Release(); Changed?.Invoke(); }
    }

    private static bool IsAddressInUse(Exception error)
    {
        for (Exception? current = error; current is not null; current = current.InnerException)
            if (current is SocketException { SocketErrorCode: SocketError.AddressAlreadyInUse }) return true;
        return false;
    }

    private async Task StartWebListenerAsync(Listener[] listeners)
    {
        var first = listeners[0].Config;
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions { Args = [], ContentRootPath = AppContext.BaseDirectory });
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(options =>
        {
            options.Listen(IPAddress.Parse(first.Host), first.Port);
            options.Limits.MaxRequestBodySize = 1024 * 1024 + 16384;
            options.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(10);
        });
        var app = builder.Build();
        app.UseWebSockets(new() { KeepAliveInterval = TimeSpan.FromSeconds(5), KeepAliveTimeout = TimeSpan.FromSeconds(10) });
        foreach (var listener in listeners)
        {
            if (listener.Config.Type == "TCodeWebSocket") listener.TCodeWebSocket ??= new(listener.Config, _store);
            else if (listener.Config.Type != "Buttplug") listener.Http ??= new(listener.Config, _store);
        }
        app.Run(async context =>
        {
            var listener = listeners.FirstOrDefault(item => item.Config.Path == "/"
                || context.Request.Path.StartsWithSegments(item.Config.Path, StringComparison.Ordinal));
            if (listener is null) { context.Response.StatusCode = 404; return; }
            var input = listener.Config;
            if (!IsRequestAllowed(input, context.Request.Host.Host))
            { context.Response.StatusCode = 403; return; }
            context.Response.Headers.AccessControlAllowOrigin = "*";
            context.Response.Headers.AccessControlAllowMethods = "GET, POST, PUT, DELETE, OPTIONS";
            context.Response.Headers.AccessControlAllowHeaders = "Content-Type, X-Sensa-Session, X-Connection-Key, Authorization, X-Api-Key, X-Device-Token";
            if (context.Request.Method == "OPTIONS") { context.Response.StatusCode = 204; return; }
            if (!await listener.Slots.WaitAsync(0, context.RequestAborted).ConfigureAwait(false)) { context.Response.StatusCode = 429; return; }
            using var requestLifetime = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, app.Lifetime.ApplicationStopping);
            using var abortOnShutdown = app.Lifetime.ApplicationStopping.Register(context.Abort);
            try
            {
                if (input.Path != "/")
                {
                    context.Request.Path.StartsWithSegments(input.Path, StringComparison.Ordinal, out var remaining);
                    context.Request.PathBase = context.Request.PathBase.Add(input.Path);
                    context.Request.Path = remaining.HasValue ? remaining : new PathString("/");
                }
                if (input.Type == "Buttplug")
                {
                    if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode = 426; return; }
                    using var socket = await context.WebSockets.AcceptWebSocketAsync().ConfigureAwait(false);
                    using var session = new ButtplugInputSession(input, _store);
                    await session.RunAsync(socket, requestLifetime.Token).ConfigureAwait(false);
                }
                else if (input.Type is "JsonWebSocket" or "TCodeWebSocket")
                {
                    if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode = 426; return; }
                    using var socket = await context.WebSockets.AcceptWebSocketAsync().ConfigureAwait(false);
                    if (listener.TCodeWebSocket is { } tcode) await tcode.RunAsync(socket, requestLifetime.Token).ConfigureAwait(false);
                    else await listener.Http!.RunAsync(socket, requestLifetime.Token).ConfigureAwait(false);
                }
                else
                {
                    context.Features.Get<IHttpMaxRequestBodySizeFeature>()!.MaxRequestBodySize =
                        input.Type is "AutoblowHttp" or "VacuGlideHttp" ? 1024 * 1024 + 16384 : HttpProtocolInput.MaximumBodyBytes;
                    context.RequestAborted = requestLifetime.Token;
                    await listener.Http!.HandleAsync(context).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception error)
            {
                listener.Error = "Protocol request failed: " + error.GetType().Name;
                if (!context.Response.HasStarted) context.Response.StatusCode = 400;
                Changed?.Invoke();
            }
            finally { listener.Slots.Release(); }
        });
        try
        {
            await app.StartAsync().ConfigureAwait(false);
            var actualPort = new Uri(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single()).Port;
            foreach (var listener in listeners) listener.Config.Port = actualPort;
            _webApps.Add(app);
        }
        catch { await app.DisposeAsync().ConfigureAwait(false); throw; }
    }

    public static bool IsRequestAllowed(ProtocolInputConfig config, string host) =>
        host.Equals(config.Host, StringComparison.OrdinalIgnoreCase)
            || (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || IPAddress.TryParse(host, out var address) && IPAddress.IsLoopback(address))
                && IPAddress.TryParse(config.Host, out var bound) && IPAddress.IsLoopback(bound)
            || config.Host is "0.0.0.0" or "::" && IPAddress.TryParse(host, out _);

    private void ResetCommands()
    {
        Listener[] listeners;
        lock (_sync) listeners = _listeners.ToArray();
        foreach (var listener in listeners)
        { listener.TCode?.ResetCommands(); listener.Intiface?.ResetCommands(); listener.TCodeWebSocket?.ResetCommands(); }
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
                    : (listener.Config.Type is "Buttplug" or "JsonWebSocket" or "TCodeWebSocket" ? "ws://" : listener.Config.Type == "TCodeTcp" ? "tcp://" : listener.Config.Type == "TCodeUdp" ? "udp://" : "http://")
                        + (listener.Config.Host.Contains(':') ? "[" + listener.Config.Host + "]" : listener.Config.Host) + ":" + listener.Config.Port
                        + (ProtocolInputConfiguration.IsWebType(listener.Config.Type) && listener.Config.Path != "/" ? listener.Config.Path : ""),
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
                if (listener.TCode is not null) await listener.TCode.DisposeAsync().ConfigureAwait(false);
                if (listener.Intiface is not null) await listener.Intiface.DisposeAsync().ConfigureAwait(false);
            }
            catch (Exception error) { _log("[Protocol input] Cleanup failed: " + error.GetType().Name); }
        }
        foreach (var app in _webApps)
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            try { await app.StopAsync(timeout.Token).ConfigureAwait(false); } catch (OperationCanceledException) { }
            await app.DisposeAsync().ConfigureAwait(false);
        }
        _webApps.Clear();
        foreach (var listener in listeners) listener.Slots.Dispose();
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
