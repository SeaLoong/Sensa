using System.Buffers.Binary;
using System.Text;

namespace Sensa.Input.Osc;

internal static class OscPacketEncoder
{
    public static byte[] BuildAvatarParameterPacket(string path, OscValue value)
    {
        var normalizedPath = NormalizePath(path);
        if (string.IsNullOrWhiteSpace(normalizedPath))
            return Array.Empty<byte>();

        using var buffer = new MemoryStream();
        WriteOscString(buffer, $"/avatar/parameters/{normalizedPath}");

        switch (value.Type)
        {
            case OscValueType.Float:
                WriteOscString(buffer, ",f");
                WriteFloat(buffer, value.Float);
                break;

            case OscValueType.Int:
                WriteOscString(buffer, ",i");
                WriteInt32(buffer, value.Int);
                break;

            case OscValueType.Bool:
                WriteOscString(buffer, value.Bool ? ",T" : ",F");
                break;

            default:
                return Array.Empty<byte>();
        }

        return buffer.ToArray();
    }

    public static byte[] BuildAvatarChangePacket()
    {
        using var buffer = new MemoryStream();
        WriteOscString(buffer, "/avatar/change");
        WriteOscString(buffer, ",s");
        WriteOscString(buffer, string.Empty);
        return buffer.ToArray();
    }

    private static string NormalizePath(string? path)
    {
        return string.IsNullOrWhiteSpace(path)
            ? string.Empty
            : path.Trim().Trim('/');
    }

    private static void WriteOscString(Stream stream, string value)
    {
        var text = value ?? string.Empty;
        var bytes = Encoding.ASCII.GetBytes(text);
        stream.Write(bytes, 0, bytes.Length);
        stream.WriteByte(0);

        var padding = (4 - ((bytes.Length + 1) % 4)) % 4;
        for (var index = 0; index < padding; index++)
            stream.WriteByte(0);
    }

    private static void WriteInt32(Stream stream, int value)
    {
        Span<byte> bytes = stackalloc byte[4];
        BinaryPrimitives.WriteInt32BigEndian(bytes, value);
        stream.Write(bytes);
    }

    private static void WriteFloat(Stream stream, float value)
    {
        WriteInt32(stream, BitConverter.SingleToInt32Bits(value));
    }
}
