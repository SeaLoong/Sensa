using System.Security.Cryptography;
using System.Text;

namespace Sensa.Hosting;

internal sealed record DesktopLaunchOptions(string ConfigPath, string[] HostArguments)
{
    internal static DesktopLaunchOptions Parse(string[] arguments, string defaultConfigPath,
        Func<string>? createInstanceName = null)
    {
        string? config = null, instance = null;
        var remaining = new List<string>();
        for (var index = 0; index < arguments.Length; index++)
        {
            var argument = arguments[index];
            string ReadValue(string option)
            {
                if (++index >= arguments.Length || arguments[index].StartsWith("--", StringComparison.Ordinal))
                    throw new ArgumentException($"{option} requires a value.");
                return arguments[index];
            }
            if (argument is "--new-instance")
            {
                if (instance is not null) throw new ArgumentException("Choose --instance or --new-instance once.");
                instance = (createInstanceName ?? (() => "session-" + Guid.NewGuid().ToString("N")))();
            }
            else if (argument is "--instance" || argument.StartsWith("--instance=", StringComparison.Ordinal))
            {
                if (instance is not null) throw new ArgumentException("Choose --instance or --new-instance once.");
                instance = argument is "--instance" ? ReadValue(argument) : argument[11..];
            }
            else if (argument is "--config" || argument.StartsWith("--config=", StringComparison.Ordinal))
            {
                if (config is not null) throw new ArgumentException("Choose --config once.");
                config = argument is "--config" ? ReadValue(argument) : argument[9..];
                if (string.IsNullOrWhiteSpace(config)) throw new ArgumentException("--config requires a path.");
            }
            else remaining.Add(argument);
        }
        var path = Path.GetFullPath(config ?? defaultConfigPath);
        if (instance is not null)
        {
            if (instance.Length is < 1 or > 64 || instance is "." or ".."
                || instance.Any(value => !char.IsAsciiLetterOrDigit(value) && value is not '-' and not '_'))
                throw new ArgumentException("Instance names use 1–64 letters, digits, '-' or '_'.");
            path = Path.Combine(Path.GetDirectoryName(path)!, "instances", instance, "config.json");
        }
        return new(path, remaining.ToArray());
    }

    internal static string PipeName(string configPath)
    {
        var canonical = Path.GetFullPath(configPath);
        if (OperatingSystem.IsWindows()) canonical = canonical.ToUpperInvariant();
        return "sensa-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }
}
