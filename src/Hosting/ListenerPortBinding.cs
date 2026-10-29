using System.Net;
using System.Net.Sockets;
using Microsoft.AspNetCore.Server.Kestrel.Transport.Sockets;

namespace Sensa.Hosting;

internal static class ListenerPortBinding
{
    // The returned socket stays bound and is transferred directly to Kestrel.
    // No free-port probe/release window exists between selection and listening.
    internal static Socket BindTcp(EndPoint endpoint, Action<int>? onBound = null)
    {
        Socket socket;
        try { socket = SocketTransportOptions.CreateDefaultBoundListenSocket(endpoint); }
        catch (SocketException error) when (error.SocketErrorCode == SocketError.AddressAlreadyInUse && endpoint is IPEndPoint ip && ip.Port != 0)
        { socket = SocketTransportOptions.CreateDefaultBoundListenSocket(new IPEndPoint(ip.Address, 0)); }
        try
        {
            if (socket.LocalEndPoint is IPEndPoint actual) onBound?.Invoke(actual.Port);
            return socket;
        }
        catch { socket.Dispose(); throw; }
    }
}
