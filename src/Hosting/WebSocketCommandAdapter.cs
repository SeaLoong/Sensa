using System.Text.Json;
using Sensa.Application;

namespace Sensa.Hosting;

public sealed record WebSocketCommandResponse(string? Id, bool Ok, object Data);

/// <summary>WebSocket correlation and framing adapter. / WebSocket 关联及帧适配器。</summary>
public sealed class WebSocketCommandAdapter(SensaApplication application)
{
    public async Task<WebSocketCommandResponse> HandleAsync(string json)
    {
        string? id = string.Empty;
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            id = root.TryGetProperty("id", out var idElement) ? idElement.GetString() : string.Empty;
            var method = root.TryGetProperty("method", out var methodElement) ? methodElement.GetString() ?? string.Empty : string.Empty;
            var path = root.TryGetProperty("path", out var pathElement) ? pathElement.GetString() ?? string.Empty : string.Empty;
            var body = root.TryGetProperty("body", out var bodyElement) ? (JsonElement?)bodyElement : null;
            var result = await application.ExecuteAsync(method, path, body).ConfigureAwait(false);
            return new WebSocketCommandResponse(id, result.Success, result.Data);
        }
        catch (Exception ex)
        {
            return new WebSocketCommandResponse(id, false, new { error = ex.Message });
        }
    }
}
