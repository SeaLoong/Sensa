using System.IO.Pipes;

namespace Sensa.Hosting;

/// <summary>Owns one configuration for the process lifetime; duplicate launches contact its owner.</summary>
internal sealed class DesktopInstanceCoordinator : IAsyncDisposable
{
    private readonly FileStream _ownership;
    private readonly string _pipeName;
    private readonly CancellationTokenSource _shutdown = new();
    private Task? _server;

    private DesktopInstanceCoordinator(FileStream ownership, string pipeName)
    { _ownership = ownership; _pipeName = pipeName; }

    internal static DesktopInstanceCoordinator? TryAcquire(string configPath)
    {
        configPath = Path.GetFullPath(configPath);
        Directory.CreateDirectory(Path.GetDirectoryName(configPath)!);
        var lockPath = configPath + ".instance.lock";
        FileStream ownership;
        try { ownership = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
        catch (IOException) { return null; }
        // Keep the file instead of deleting it: unlinking a lock could create two owners.
        return new(ownership, DesktopLaunchOptions.PipeName(configPath));
    }

    internal void Start(Func<bool, Task> requestOpen)
    {
        if (_server is not null) throw new InvalidOperationException("Instance coordination has already started.");
        _server = ServeAsync(requestOpen);
    }

    private async Task ServeAsync(Func<bool, Task> requestOpen)
    {
        while (!_shutdown.IsCancellationRequested)
        {
            using var pipe = new NamedPipeServerStream(_pipeName, PipeDirection.InOut, 1,
                PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            try
            {
                await pipe.WaitForConnectionAsync(_shutdown.Token).ConfigureAwait(false);
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_shutdown.Token);
                timeout.CancelAfter(TimeSpan.FromSeconds(3));
                var command = new byte[1];
                var length = await pipe.ReadAsync(command, timeout.Token).ConfigureAwait(false);
                if (length != 1 || command[0] is not (0 or 1)) continue;
                await requestOpen(command[0] == 1).ConfigureAwait(false);
                await pipe.WriteAsync(new byte[] { 1 }, timeout.Token).ConfigureAwait(false);
                await pipe.FlushAsync(timeout.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { }
            catch (IOException) { /* A short-lived launching process may exit before its acknowledgement. */ }
        }
    }

    internal static async Task<bool> NotifyOwnerAsync(string configPath, bool openBrowser,
        CancellationToken cancellationToken = default)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(12));
        try
        {
            using var pipe = new NamedPipeClientStream(".", DesktopLaunchOptions.PipeName(configPath),
                PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            await pipe.ConnectAsync(timeout.Token).ConfigureAwait(false);
            await pipe.WriteAsync(new byte[] { openBrowser ? (byte)1 : (byte)0 }, timeout.Token).ConfigureAwait(false);
            await pipe.FlushAsync(timeout.Token).ConfigureAwait(false);
            var answer = new byte[1];
            return await pipe.ReadAsync(answer, timeout.Token).ConfigureAwait(false) == 1 && answer[0] == 1;
        }
        catch (Exception error) when (error is IOException or TimeoutException || error is OperationCanceledException && !cancellationToken.IsCancellationRequested)
        { return false; }
    }

    public async ValueTask DisposeAsync()
    {
        _shutdown.Cancel();
        try { if (_server is not null) await _server.ConfigureAwait(false); }
        finally { _shutdown.Dispose(); _ownership.Dispose(); }
    }
}
