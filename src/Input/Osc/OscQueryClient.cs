using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace Sensa.Input.Osc;

public sealed class OscQueryClient : IAsyncDisposable, IDisposable
{
    private readonly HttpClient _httpClient;
    private readonly bool _ownsHttpClient;
    private readonly SemaphoreSlim _listenLifecycleGate = new(1, 1);
    private readonly SemaphoreSlim _listenSendGate = new(1, 1);
    private readonly object _listenStateLock = new();
    private OscQuerySnapshot _snapshot = OscQuerySnapshot.Empty();
    private ClientWebSocket? _listenSocket;
    private CancellationTokenSource? _listenCts;
    private Task? _listenTask;
    private HashSet<string> _activeSubscriptions = new(StringComparer.Ordinal);
    private string _activeWebSocketUrl = string.Empty;
    private OscSource _listenSource = OscSource.Unknown;
    private bool _isListenConnected;
    private int _listeningPathCount;
    private int _disposed;

    public OscQueryClient(HttpClient? httpClient = null)
    {
        _httpClient = httpClient ?? new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(6),
        };
        _ownsHttpClient = httpClient is null;
    }

    public OscQuerySnapshot Snapshot => _snapshot;
    public bool IsListenConnected
    {
        get
        {
            lock (_listenStateLock)
                return _isListenConnected;
        }
    }

    public int ListeningPathCount => Volatile.Read(ref _listeningPathCount);

    public string ActiveWebSocketUrl
    {
        get
        {
            lock (_listenStateLock)
                return _activeWebSocketUrl;
        }
    }

    public OscSource SnapshotSource => BuildSnapshotSource(_snapshot);

    public OscSource ListenSource
    {
        get
        {
            lock (_listenStateLock)
                return _listenSource;
        }
    }

    public event Action<string, OscValue, OscSource>? ValueReceived;
    public event Action? AvatarChanged;
    public event Action? StructureChanged;
    public event Action? ListenStateChanged;

    public void Clear(string? url = null)
    {
        _snapshot = OscQuerySnapshot.Empty(NormalizeUrl(url));
    }

    public async Task<OscQuerySnapshot> RefreshAsync(string? rawUrl, CancellationToken cancellationToken = default)
    {
        ThrowIfDisposed();

        var url = NormalizeUrl(rawUrl);
        if (string.IsNullOrWhiteSpace(url))
        {
            _snapshot = OscQuerySnapshot.Empty();
            return _snapshot;
        }

        try
        {
            using var rootDocument = await ReadJsonAsync(new Uri(url), cancellationToken).ConfigureAwait(false);
            using var hostInfoDocument = await ReadJsonAsync(BuildHostInfoUri(url), cancellationToken).ConfigureAwait(false);

            var hostInfo = ParseHostInfo(hostInfoDocument.RootElement);
            var nodes = ParseNodes(rootDocument.RootElement);

            _snapshot = new OscQuerySnapshot
            {
                Url = url,
                Name = hostInfo.Name,
                OscIp = hostInfo.OscIp,
                OscPort = hostInfo.OscPort,
                OscTransport = hostInfo.OscTransport,
                WsIp = hostInfo.WsIp,
                WsPort = hostInfo.WsPort,
                WebSocketUrl = BuildWebSocketUrl(url, hostInfo),
                SupportsListen = hostInfo.SupportsListen,
                RefreshedAtUtc = DateTimeOffset.UtcNow,
                Nodes = nodes,
            };
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _snapshot = new OscQuerySnapshot
            {
                Url = url,
                Error = ex.Message,
                RefreshedAtUtc = DateTimeOffset.UtcNow,
                Nodes = Array.Empty<OscQueryNodeInfo>(),
            };
        }

        return _snapshot;
    }

    public async Task StartListeningAsync(CancellationToken cancellationToken = default)
    {
        ThrowIfDisposed();

        var snapshot = Snapshot;
        if (!CanListen(snapshot))
        {
            await StopListeningAsync().ConfigureAwait(false);
            return;
        }

        var desiredUrl = snapshot.WebSocketUrl;
        var desiredSource = BuildListenSource(snapshot);

        await _listenLifecycleGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var hasRunningTask = _listenTask is not null && !_listenTask.IsCompleted;
            var isSameEndpoint = string.Equals(_activeWebSocketUrl, desiredUrl, StringComparison.OrdinalIgnoreCase);

            if (hasRunningTask && isSameEndpoint)
            {
                SetListenSource(desiredSource);
                await SynchronizeSubscriptionsAsync(snapshot, cancellationToken).ConfigureAwait(false);
                return;
            }

            await StopListeningCoreAsync().ConfigureAwait(false);

            var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            await ConnectListenSocketAsync(desiredUrl, desiredSource, linkedCts.Token).ConfigureAwait(false);
            lock (_listenStateLock)
            {
                _listenCts = linkedCts;
                _listenTask = Task.Run(() => ListenLoopAsync(linkedCts.Token), CancellationToken.None);
            }

            await SynchronizeSubscriptionsAsync(snapshot, linkedCts.Token).ConfigureAwait(false);
        }
        finally
        {
            _listenLifecycleGate.Release();
        }
    }

    public async Task StopListeningAsync()
    {
        if (Interlocked.CompareExchange(ref _disposed, 0, 0) != 0)
            return;

        await _listenLifecycleGate.WaitAsync().ConfigureAwait(false);
        try
        {
            await StopListeningCoreAsync().ConfigureAwait(false);
        }
        finally
        {
            _listenLifecycleGate.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0)
            return;

        await _listenLifecycleGate.WaitAsync().ConfigureAwait(false);
        try
        {
            await StopListeningCoreAsync().ConfigureAwait(false);
        }
        finally
        {
            _listenLifecycleGate.Release();
        }

        if (_ownsHttpClient)
            _httpClient.Dispose();
    }

    public void Dispose()
    {
        DisposeAsync().AsTask().GetAwaiter().GetResult();
    }

    public static string NormalizeUrl(string? rawUrl)
    {
        if (string.IsNullOrWhiteSpace(rawUrl))
            return string.Empty;

        var value = rawUrl.Trim();
        if (!value.Contains("://", StringComparison.Ordinal))
            value = $"http://{value}";

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
            return string.Empty;

        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            return string.Empty;
        }

        var builder = new UriBuilder(uri)
        {
            Fragment = string.Empty,
            Query = string.Empty,
        };

        builder.Path = string.IsNullOrWhiteSpace(builder.Path) || builder.Path == "/"
            ? "/"
            : builder.Path.TrimEnd('/') + "/";

        return builder.Uri.ToString();
    }

    private static Uri BuildHostInfoUri(string normalizedUrl)
    {
        var builder = new UriBuilder(normalizedUrl)
        {
            Query = "HOST_INFO",
        };

        return builder.Uri;
    }

    private static string BuildWebSocketUrl(string normalizedUrl, OscQueryHostInfo hostInfo)
    {
        var builder = new UriBuilder(normalizedUrl)
        {
            Scheme = string.Equals(new Uri(normalizedUrl).Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ? "wss" : "ws",
        };

        if (!string.IsNullOrWhiteSpace(hostInfo.WsIp))
            builder.Host = hostInfo.WsIp;

        if (hostInfo.WsPort is > 0 and <= 65535)
            builder.Port = hostInfo.WsPort.Value;

        return builder.Uri.ToString();
    }

    private async Task<JsonDocument> ReadJsonAsync(Uri uri, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
    }

    private static OscQueryHostInfo ParseHostInfo(JsonElement element)
    {
        var info = new OscQueryHostInfo
        {
            Name = ReadString(element, "NAME") ?? string.Empty,
            OscIp = ReadString(element, "OSC_IP") ?? string.Empty,
            OscPort = ReadNullableInt(element, "OSC_PORT"),
            OscTransport = ReadString(element, "OSC_TRANSPORT") ?? "UDP",
            WsIp = ReadString(element, "WS_IP") ?? string.Empty,
            WsPort = ReadNullableInt(element, "WS_PORT"),
        };

        if (element.TryGetProperty("EXTENSIONS", out var extensions)
            && extensions.ValueKind == JsonValueKind.Object)
        {
            info.SupportsListen = ReadExtensionFlag(extensions, "LISTEN");
        }

        return info;
    }

    private async Task ListenLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var socket = GetListenSocket();
            if (socket is null || socket.State != WebSocketState.Open)
            {
                try
                {
                    var snapshot = Snapshot;
                    if (!CanListen(snapshot))
                        return;

                    await ConnectListenSocketAsync(snapshot.WebSocketUrl, BuildListenSource(snapshot), cancellationToken).ConfigureAwait(false);
                    await SynchronizeSubscriptionsAsync(snapshot, cancellationToken).ConfigureAwait(false);
                    socket = GetListenSocket();
                    if (socket is null)
                    {
                        await DelayReconnectAsync(cancellationToken).ConfigureAwait(false);
                        continue;
                    }
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    break;
                }
                catch
                {
                    await DelayReconnectAsync(cancellationToken).ConfigureAwait(false);
                    continue;
                }
            }

            try
            {
                await ReceiveLoopAsync(socket, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch
            {
            }

            await HandleSocketDisconnectedAsync(socket).ConfigureAwait(false);

            if (!cancellationToken.IsCancellationRequested)
                await DelayReconnectAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task ReceiveLoopAsync(ClientWebSocket socket, CancellationToken cancellationToken)
    {
        var buffer = new byte[16 * 1024];

        while (!cancellationToken.IsCancellationRequested && socket.State == WebSocketState.Open)
        {
            using var messageBuffer = new MemoryStream();
            WebSocketReceiveResult? result;

            do
            {
                result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken).ConfigureAwait(false);
                if (result.MessageType == WebSocketMessageType.Close)
                    return;

                if (result.Count > 0)
                    await messageBuffer.WriteAsync(buffer.AsMemory(0, result.Count), cancellationToken).ConfigureAwait(false);
            }
            while (result is not null && !result.EndOfMessage);

            if (result is null)
                continue;

            var payload = messageBuffer.ToArray();
            if (result.MessageType == WebSocketMessageType.Binary)
            {
                HandleBinaryFrame(payload);
                continue;
            }

            if (result.MessageType == WebSocketMessageType.Text)
                HandleTextFrame(payload);
        }
    }

    private void HandleBinaryFrame(byte[] payload)
    {
        var source = ListenSource;
        OscPacketParser.ParseAvatarPacket(
            payload,
            source,
            (path, value, resolvedSource) => SafeInvoke(ValueReceived, path, value, resolvedSource),
            () => SafeInvoke(AvatarChanged));
    }

    private void HandleTextFrame(byte[] payload)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;
            var command = root.TryGetProperty("COMMAND", out var commandElement) ? commandElement.GetString() : null;
            if (string.IsNullOrWhiteSpace(command))
                return;

            switch (command.Trim().ToUpperInvariant())
            {
                case "PATH_CHANGED":
                case "PATH_RENAMED":
                case "PATH_REMOVED":
                case "PATH_ADDED":
                    SafeInvoke(StructureChanged);
                    break;
            }
        }
        catch
        {
        }
    }

    private async Task ConnectListenSocketAsync(string desiredUrl, OscSource desiredSource, CancellationToken cancellationToken)
    {
        var socket = new ClientWebSocket();
        socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(10);
        await socket.ConnectAsync(new Uri(desiredUrl), cancellationToken).ConfigureAwait(false);

        lock (_listenStateLock)
        {
            _listenSocket = socket;
            _activeWebSocketUrl = desiredUrl;
            _listenSource = desiredSource;
            _activeSubscriptions = new HashSet<string>(StringComparer.Ordinal);
            _listeningPathCount = 0;
        }

        SetListenConnected(true);
    }

    private async Task SynchronizeSubscriptionsAsync(OscQuerySnapshot snapshot, CancellationToken cancellationToken)
    {
        if (!CanListen(snapshot))
            return;

        var desiredPaths = snapshot.Nodes
            .Select(node => node.FullPath)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .ToHashSet(StringComparer.Ordinal);

        ClientWebSocket? socket;
        HashSet<string> currentSubscriptions;
        lock (_listenStateLock)
        {
            socket = _listenSocket;
            currentSubscriptions = new HashSet<string>(_activeSubscriptions, StringComparer.Ordinal);
            _listenSource = BuildListenSource(snapshot);
        }

        if (socket is null || socket.State != WebSocketState.Open)
            return;

        var toIgnore = currentSubscriptions.Except(desiredPaths, StringComparer.Ordinal).ToArray();
        var toListen = desiredPaths.Except(currentSubscriptions, StringComparer.Ordinal).ToArray();

        if (toIgnore.Length == 0 && toListen.Length == 0)
            return;

        await _listenSendGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (socket.State != WebSocketState.Open)
                return;

            foreach (var path in toIgnore)
                await SendListenCommandAsync(socket, "IGNORE", path, cancellationToken).ConfigureAwait(false);

            foreach (var path in toListen)
                await SendListenCommandAsync(socket, "LISTEN", path, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _listenSendGate.Release();
        }

        var shouldNotify = false;
        lock (_listenStateLock)
        {
            if (ReferenceEquals(_listenSocket, socket))
            {
                shouldNotify = _listeningPathCount != desiredPaths.Count;
                _activeSubscriptions = desiredPaths;
                _listeningPathCount = desiredPaths.Count;
            }
        }

        if (shouldNotify)
            SafeInvoke(ListenStateChanged);
    }

    private async Task SendListenCommandAsync(ClientWebSocket socket, string command, string path, CancellationToken cancellationToken)
    {
        var payload = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
        {
            COMMAND = command,
            DATA = path,
        }));

        await socket.SendAsync(new ArraySegment<byte>(payload), WebSocketMessageType.Text, true, cancellationToken).ConfigureAwait(false);
    }

    private async Task HandleSocketDisconnectedAsync(ClientWebSocket socket)
    {
        await CloseSocketAsync(socket, "OSCQuery listen socket closing", abortAfterClose: true).ConfigureAwait(false);

        var shouldNotify = false;
        lock (_listenStateLock)
        {
            if (!ReferenceEquals(_listenSocket, socket))
                return;

            shouldNotify = _isListenConnected || _listeningPathCount > 0;
            _listenSocket = null;
            _activeSubscriptions = new HashSet<string>(StringComparer.Ordinal);
            _listeningPathCount = 0;
            _isListenConnected = false;
        }

        if (shouldNotify)
            SafeInvoke(ListenStateChanged);
    }

    private async Task StopListeningCoreAsync()
    {
        CancellationTokenSource? cts;
        Task? listenTask;
        ClientWebSocket? socket;
        var shouldNotify = false;

        lock (_listenStateLock)
        {
            cts = _listenCts;
            listenTask = _listenTask;
            socket = _listenSocket;
            shouldNotify = _isListenConnected || _listeningPathCount > 0 || !string.IsNullOrWhiteSpace(_activeWebSocketUrl);

            _listenCts = null;
            _listenTask = null;
            _listenSocket = null;
            _activeSubscriptions = new HashSet<string>(StringComparer.Ordinal);
            _activeWebSocketUrl = string.Empty;
            _listenSource = OscSource.Unknown;
            _isListenConnected = false;
            _listeningPathCount = 0;
        }

        if (cts is not null)
        {
            try { cts.Cancel(); } catch { }
        }

        if (socket is not null)
            await CloseSocketAsync(socket, "Stopping OSCQuery listen", abortAfterClose: true).ConfigureAwait(false);

        if (listenTask is not null)
        {
            try { await listenTask.ConfigureAwait(false); } catch { }
        }

        cts?.Dispose();

        if (shouldNotify)
            SafeInvoke(ListenStateChanged);
    }

    private static async Task CloseSocketAsync(ClientWebSocket socket, string description, bool abortAfterClose = false)
    {
        try
        {
            using var timeout = new CancellationTokenSource(abortAfterClose ? TimeSpan.FromMilliseconds(200) : TimeSpan.FromMilliseconds(1000));

            switch (socket.State)
            {
                case WebSocketState.Open when abortAfterClose:
                    await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, description, timeout.Token).ConfigureAwait(false);
                    break;
                case WebSocketState.Open:
                case WebSocketState.CloseReceived:
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, description, timeout.Token).ConfigureAwait(false);
                    break;
            }
        }
        catch
        {
        }

        if (abortAfterClose && socket.State is not (WebSocketState.Closed or WebSocketState.None or WebSocketState.Aborted))
        {
            try { socket.Abort(); } catch { }
        }

        socket.Dispose();
    }

    private async Task DelayReconnectAsync(CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(1.5), cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private void SetListenSource(OscSource source)
    {
        lock (_listenStateLock)
            _listenSource = source;
    }

    private void SetListenConnected(bool connected)
    {
        var shouldNotify = false;
        lock (_listenStateLock)
        {
            if (_isListenConnected == connected)
                return;

            _isListenConnected = connected;
            shouldNotify = true;
        }

        if (shouldNotify)
            SafeInvoke(ListenStateChanged);
    }

    private ClientWebSocket? GetListenSocket()
    {
        lock (_listenStateLock)
            return _listenSocket;
    }

    private static OscSource BuildListenSource(OscQuerySnapshot snapshot)
    {
        if (string.IsNullOrWhiteSpace(snapshot.Url))
            return OscSource.Unknown;

        var wsUri = !string.IsNullOrWhiteSpace(snapshot.WebSocketUrl)
            ? new Uri(snapshot.WebSocketUrl)
            : new Uri(snapshot.Url);
        var label = !string.IsNullOrWhiteSpace(snapshot.Name)
            ? snapshot.Name.Trim()
            : $"OSCQuery {wsUri.Host}:{wsUri.Port}";
        var key = $"oscquery:{snapshot.Url.Trim().ToLowerInvariant()}";
        var persistentId = !string.IsNullOrWhiteSpace(snapshot.Name)
            ? $"oscquery:name:{snapshot.Name.Trim()}"
            : $"oscquery:url:{snapshot.Url.Trim()}";

        return new OscSource(key, label, persistentId, wsUri.Host, wsUri.Port);
    }

    public static OscSource BuildSnapshotSource(OscQuerySnapshot snapshot)
    {
        if (string.IsNullOrWhiteSpace(snapshot.Url))
            return OscSource.Unknown;

        var uri = new Uri(snapshot.Url);
        var address = !string.IsNullOrWhiteSpace(snapshot.OscIp)
            ? snapshot.OscIp.Trim()
            : uri.Host;
        var port = snapshot.OscPort is > 0 and <= 65535
            ? snapshot.OscPort.Value
            : uri.Port;
        var label = !string.IsNullOrWhiteSpace(snapshot.Name)
            ? snapshot.Name.Trim()
            : $"OSCQuery {address}:{port}";
        var key = $"oscquery:{snapshot.Url.Trim().ToLowerInvariant()}";
        var persistentId = !string.IsNullOrWhiteSpace(snapshot.Name)
            ? $"oscquery:name:{snapshot.Name.Trim()}"
            : $"oscquery:url:{snapshot.Url.Trim()}";

        return new OscSource(key, label, persistentId, address, port);
    }

    private static bool CanListen(OscQuerySnapshot snapshot)
    {
        return !string.IsNullOrWhiteSpace(snapshot.Url)
            && snapshot.SupportsListen
            && !string.IsNullOrWhiteSpace(snapshot.WebSocketUrl)
            && snapshot.Nodes.Count > 0;
    }

    private static bool ReadExtensionFlag(JsonElement extensions, string propertyName)
    {
        return extensions.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.True;
    }

    private void ThrowIfDisposed()
    {
        if (Interlocked.CompareExchange(ref _disposed, 0, 0) != 0)
            throw new ObjectDisposedException(nameof(OscQueryClient));
    }

    private static void SafeInvoke(Action? callback)
    {
        try { callback?.Invoke(); } catch { }
    }

    private static void SafeInvoke(Action<string, OscValue, OscSource>? callback, string path, OscValue value, OscSource source)
    {
        try { callback?.Invoke(path, value, source); } catch { }
    }

    private static IReadOnlyList<OscQueryNodeInfo> ParseNodes(JsonElement root)
    {
        var nodes = new List<OscQueryNodeInfo>();
        AppendNode(root, nodes);
        nodes.Sort((left, right) => string.Compare(left.Path, right.Path, StringComparison.OrdinalIgnoreCase));
        return nodes;
    }

    private static void AppendNode(JsonElement element, List<OscQueryNodeInfo> nodes)
    {
        var fullPath = ReadString(element, "FULL_PATH") ?? "/";
        var path = NormalizeOscParameterPath(fullPath);
        var type = ReadString(element, "TYPE") ?? string.Empty;
        var description = ReadString(element, "DESCRIPTION") ?? string.Empty;
        var access = ReadNullableInt(element, "ACCESS");
        var currentValue = ReadValueSummary(element);
        var hasParsedValue = TryReadOscValue(element, type, out var parsedValue);
        var range = ReadRange(element);

        if (!string.IsNullOrWhiteSpace(path) && !string.IsNullOrWhiteSpace(type))
        {
            nodes.Add(new OscQueryNodeInfo
            {
                Path = path,
                FullPath = fullPath,
                Type = type,
                Description = description,
                Access = access,
                CurrentValue = currentValue,
                ParsedValue = hasParsedValue ? parsedValue : null,
                Min = range.Min,
                Max = range.Max,
                AllowedValues = range.AllowedValues,
            });
        }

        if (!element.TryGetProperty("CONTENTS", out var contents) || contents.ValueKind != JsonValueKind.Object)
            return;

        foreach (var child in contents.EnumerateObject())
            AppendNode(child.Value, nodes);
    }

    private static string NormalizeOscParameterPath(string? fullPath)
    {
        if (string.IsNullOrWhiteSpace(fullPath))
            return string.Empty;

        const string avatarPrefix = "/avatar/parameters/";
        var trimmed = fullPath.Trim();
        if (trimmed.StartsWith(avatarPrefix, StringComparison.OrdinalIgnoreCase))
            return trimmed[avatarPrefix.Length..].Trim('/');

        return string.Empty;
    }

    private static string ReadValueSummary(JsonElement element)
    {
        if (!element.TryGetProperty("VALUE", out var valueElement))
            return string.Empty;

        return valueElement.ValueKind switch
        {
            JsonValueKind.Array => string.Join(", ", valueElement.EnumerateArray().Select(FormatValueElement).Where(text => !string.IsNullOrWhiteSpace(text))),
            _ => FormatValueElement(valueElement),
        };
    }

    private static bool TryReadOscValue(JsonElement element, string type, out OscValue value)
    {
        value = default;
        if (string.IsNullOrWhiteSpace(type) || type.Length != 1)
            return false;

        if (!element.TryGetProperty("VALUE", out var valueElement))
            return false;

        if (valueElement.ValueKind == JsonValueKind.Array)
        {
            var enumerator = valueElement.EnumerateArray();
            if (!enumerator.MoveNext())
                return false;

            valueElement = enumerator.Current;
        }

        switch (type[0])
        {
            case 'f':
            case 'd':
                if (valueElement.ValueKind == JsonValueKind.Number && valueElement.TryGetSingle(out var floatValue))
                {
                    value = OscValue.FromFloat(floatValue);
                    return true;
                }

                if (valueElement.ValueKind == JsonValueKind.Number && valueElement.TryGetDouble(out var doubleValue))
                {
                    value = OscValue.FromFloat((float)doubleValue);
                    return true;
                }

                return false;

            case 'i':
            case 'h':
                if (valueElement.ValueKind == JsonValueKind.Number && valueElement.TryGetInt32(out var intValue))
                {
                    value = OscValue.FromInt(intValue);
                    return true;
                }

                return false;

            case 'T':
            case 'F':
                if (valueElement.ValueKind == JsonValueKind.True || valueElement.ValueKind == JsonValueKind.False)
                {
                    value = OscValue.FromBool(valueElement.GetBoolean());
                    return true;
                }

                if (valueElement.ValueKind == JsonValueKind.Number && valueElement.TryGetInt32(out var boolAsInt))
                {
                    value = OscValue.FromBool(boolAsInt != 0);
                    return true;
                }

                return false;

            default:
                return false;
        }
    }

    private static (double? Min, double? Max, IReadOnlyList<string> AllowedValues) ReadRange(JsonElement element)
    {
        if (!element.TryGetProperty("RANGE", out var rangeElement))
            return (null, null, Array.Empty<string>());

        JsonElement target = rangeElement;
        if (rangeElement.ValueKind == JsonValueKind.Array)
        {
            var enumerator = rangeElement.EnumerateArray();
            if (!enumerator.MoveNext())
                return (null, null, Array.Empty<string>());
            target = enumerator.Current;
        }

        if (target.ValueKind != JsonValueKind.Object)
            return (null, null, Array.Empty<string>());

        var allowedValues = Array.Empty<string>();
        if (target.TryGetProperty("VALS", out var valsElement) && valsElement.ValueKind == JsonValueKind.Array)
        {
            allowedValues = valsElement.EnumerateArray()
                .Select(FormatValueElement)
                .Where(text => !string.IsNullOrWhiteSpace(text))
                .ToArray();
        }

        return (
            ReadNullableDouble(target, "MIN"),
            ReadNullableDouble(target, "MAX"),
            allowedValues);
    }

    private static string FormatValueElement(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString() ?? string.Empty,
            JsonValueKind.Number => element.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Null => string.Empty,
            JsonValueKind.Array or JsonValueKind.Object => element.GetRawText(),
            _ => string.Empty,
        };
    }

    private static string? ReadString(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.String
                ? property.GetString()?.Trim()
                : null;
    }

    private static int? ReadNullableInt(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.Number
            && property.TryGetInt32(out var value)
                ? value
                : null;
    }

    private static double? ReadNullableDouble(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.Number
            && property.TryGetDouble(out var value)
                ? value
                : null;
    }

    private sealed class OscQueryHostInfo
    {
        public string Name { get; set; } = string.Empty;
        public string OscIp { get; set; } = string.Empty;
        public int? OscPort { get; set; }
        public string OscTransport { get; set; } = "UDP";
        public string WsIp { get; set; } = string.Empty;
        public int? WsPort { get; set; }
        public bool SupportsListen { get; set; }
    }
}

public sealed class OscQuerySnapshot
{
    public string Url { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string OscIp { get; init; } = string.Empty;
    public int? OscPort { get; init; }
    public string OscTransport { get; init; } = "UDP";
    public string WsIp { get; init; } = string.Empty;
    public int? WsPort { get; init; }
    public string WebSocketUrl { get; init; } = string.Empty;
    public bool SupportsListen { get; init; }
    public DateTimeOffset? RefreshedAtUtc { get; init; }
    public string Error { get; init; } = string.Empty;
    public IReadOnlyList<OscQueryNodeInfo> Nodes { get; init; } = Array.Empty<OscQueryNodeInfo>();

    public static OscQuerySnapshot Empty(string? url = null) => new()
    {
        Url = string.IsNullOrWhiteSpace(url) ? string.Empty : url.Trim(),
        Nodes = Array.Empty<OscQueryNodeInfo>(),
    };
}

public sealed class OscQueryNodeInfo
{
    public string Path { get; init; } = string.Empty;
    public string FullPath { get; init; } = string.Empty;
    public string Type { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public int? Access { get; init; }
    public string CurrentValue { get; init; } = string.Empty;
    public OscValue? ParsedValue { get; init; }
    public double? Min { get; init; }
    public double? Max { get; init; }
    public IReadOnlyList<string> AllowedValues { get; init; } = Array.Empty<string>();
}
