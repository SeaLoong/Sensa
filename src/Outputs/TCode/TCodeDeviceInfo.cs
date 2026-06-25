namespace Sensa.Outputs.TCode;

public sealed class TCodeDeviceInfo
{
    public bool Supported { get; init; }
    public string? FirmwareVersion { get; init; }
    public string? TCodeVersion { get; init; }
    public IReadOnlyList<string> AxisDescriptors { get; init; } = Array.Empty<string>();
    public DateTimeOffset? UpdatedAtUtc { get; init; }
    public string? Status { get; init; }

    public static TCodeDeviceInfo Unsupported(string reason) => new()
    {
        Supported = false,
        Status = reason,
        UpdatedAtUtc = DateTimeOffset.UtcNow,
    };
}
