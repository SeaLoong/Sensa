using System.Globalization;
using System.Text.Json;
using Sensa.Application;

namespace Sensa.Hosting;

/// <summary>HTTP framing and multipart upload adapter. / HTTP 帧及多部分上传适配器。</summary>
public sealed class HttpCommandAdapter(SensaApplication application)
{
    public async Task<IResult> HandleAsync(HttpRequest request)
    {
        try
        {
            CommandResult result;
            if (request.Method == "POST" && request.Path == "/api/input/script/load" && request.HasFormContentType)
            {
                var form = await request.ReadFormAsync(request.HttpContext.RequestAborted).ConfigureAwait(false);
                var file = form.Files.GetFile("file");
                if (file is null || file.Length == 0)
                    return Results.BadRequest(new { ok = false, error = "请先选择脚本文件。 / Select a script file first." });

                var loop = bool.TryParse(form["loop"], out var parsedLoop) && parsedLoop;
                var speed = double.TryParse(form["speed"], NumberStyles.Float, CultureInfo.InvariantCulture, out var parsedSpeed) ? parsedSpeed : 1.0;
                await using var stream = file.OpenReadStream();
                result = await application.LoadScriptAsync(file.FileName, stream, loop, speed).ConfigureAwait(false);
            }
            else
            {
                using var document = request.ContentLength is > 0 || request.Headers.TransferEncoding.Count > 0
                    ? await JsonDocument.ParseAsync(request.Body, cancellationToken: request.HttpContext.RequestAborted).ConfigureAwait(false)
                    : null;
                result = await application.ExecuteAsync(request.Method, request.Path.Value ?? string.Empty, document?.RootElement).ConfigureAwait(false);
            }
            return Results.Json(result.Data, statusCode: result.StatusCode);
        }
        catch (JsonException ex)
        {
            return Results.BadRequest(new { ok = false, error = $"请求 JSON 无效。 / Invalid request JSON: {ex.Message}" });
        }
        catch (InvalidDataException ex)
        {
            return Results.BadRequest(new { ok = false, error = ex.Message });
        }
    }
}
