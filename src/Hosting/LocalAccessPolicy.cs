using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace Sensa.Hosting;

/// <summary>Local browser sessions plus explicit credentials for LAN access.</summary>
public sealed class LocalAccessPolicy
{
    private readonly string _session = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    private readonly string? _remoteToken = Environment.GetEnvironmentVariable("SENSA_ACCESS_TOKEN");
    private const string CookieName = "SensaSession";

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        var local = context.Connection.RemoteIpAddress is { } ip && IPAddress.IsLoopback(ip);
        var host = context.Request.Host.Host;
        if (local && !(host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || IPAddress.TryParse(host, out var hostIp) && IPAddress.IsLoopback(hostIp)))
        { context.Response.StatusCode = 403; return; }
        var origin = context.Request.Headers.Origin.ToString();
        if (origin.Length > 0 && (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)
            || !string.Equals(uri.Authority, context.Request.Host.Value, StringComparison.OrdinalIgnoreCase)
            || uri.Scheme != context.Request.Scheme))
        { context.Response.StatusCode = 403; return; }
        if (context.Request.Headers["Sec-Fetch-Site"] == "cross-site")
        { context.Response.StatusCode = 403; return; }

        var authorized = Matches(context.Request.Cookies[CookieName], _session) || HasRemoteCredential(context);
        if (!local && !authorized)
        {
            context.Response.StatusCode = 401;
            context.Response.Headers.WWWAuthenticate = "Basic realm=\"Sensa (password: SENSA_ACCESS_TOKEN)\"";
            return;
        }
        if (context.Request.Path == "/api/session" && HttpMethods.IsGet(context.Request.Method))
        {
            context.Response.Cookies.Append(CookieName, _session, new CookieOptions
            { HttpOnly = true, SameSite = SameSiteMode.Strict, Secure = context.Request.IsHttps, IsEssential = true });
            context.Response.Headers.CacheControl = "no-store";
            context.Response.StatusCode = 204; return;
        }
        if (context.Request.Path.StartsWithSegments("/api") && !authorized)
        { context.Response.StatusCode = 401; return; }
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["X-Frame-Options"] = "DENY";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        await next(context);
    }

    private bool HasRemoteCredential(HttpContext context)
    {
        if (string.IsNullOrEmpty(_remoteToken)) return false;
        var header = context.Request.Headers.Authorization.ToString();
        if (header.StartsWith("Bearer ", StringComparison.Ordinal)) return Matches(header[7..], _remoteToken);
        if (!header.StartsWith("Basic ", StringComparison.Ordinal)) return false;
        try
        {
            var credential = Encoding.UTF8.GetString(Convert.FromBase64String(header[6..]));
            var colon = credential.IndexOf(':');
            return colon >= 0 && Matches(credential[(colon + 1)..], _remoteToken);
        }
        catch (FormatException) { return false; }
    }

    private static bool Matches(string? value, string expected) => value is not null
        && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(value), Encoding.UTF8.GetBytes(expected));
}
