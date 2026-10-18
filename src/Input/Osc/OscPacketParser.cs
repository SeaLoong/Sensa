using System.Text;
using System.Buffers.Binary;

namespace Sensa.Input.Osc;

internal static class OscPacketParser
{
    private const string AvatarParameterPrefix = "/avatar/parameters/";

    public static bool ParseAvatarPacket(byte[] data, OscSource source, Action<string, OscValue, OscSource> onValue, Action? onAvatarChange = null, Action<byte[]>? onUnhandled = null)
    {
        if (data is null) return false;
        return ParsePacketCore(data, source, onValue, onAvatarChange, onUnhandled);
    }

    private static bool ParsePacketCore(byte[] data, OscSource source, Action<string, OscValue, OscSource> onValue, Action? onAvatarChange, Action<byte[]>? onUnhandled, int depth = 0)
    {
        if (depth > 16) return false;
        bool Unhandled() { onUnhandled?.Invoke(data); return false; }
        if (data.Length < 8) return Unhandled();
        var position = 0;
        var address = ReadOscString(data, ref position);
        if (address is null)
            return Unhandled();

        if (string.Equals(address, "#bundle", StringComparison.Ordinal))
        {
            var handled = false;
            var raw = new List<byte[]>();
            position += 8;
            while (position + 4 <= data.Length)
            {
                var size = ReadInt32(data, ref position);
                if (size <= 0 || size > data.Length - position)
                    break;

                var nested = new byte[size];
                Array.Copy(data, position, nested, 0, size);
                handled |= ParsePacketCore(nested, source, onValue, onAvatarChange, raw.Add, depth + 1);
                position += size;
            }

            if (raw.Count > 0 && onUnhandled is not null)
            {
                if (!handled) onUnhandled(data);
                else
                {
                    // Preserve raw-message ordering and timetags. / 保留原始消息顺序和时间戳。
                    using var bundle = new MemoryStream();
                    bundle.Write(data.AsSpan(0, 16));
                    Span<byte> length = stackalloc byte[4];
                    foreach (var packet in raw)
                    {
                        BinaryPrimitives.WriteInt32BigEndian(length, packet.Length);
                        bundle.Write(length);
                        bundle.Write(packet);
                    }
                    onUnhandled(bundle.ToArray());
                }
            }
            return handled;
        }

        var typeTag = ReadOscString(data, ref position);
        if (typeTag is null || typeTag.Length < 2 || typeTag[0] != ',')
            return Unhandled();

        if (string.Equals(address, "/avatar/change", StringComparison.Ordinal))
        {
            onAvatarChange?.Invoke();
            return true;
        }

        if (!address.StartsWith(AvatarParameterPrefix, StringComparison.Ordinal))
            return Unhandled();

        var parameterName = address[AvatarParameterPrefix.Length..];
        if (string.IsNullOrWhiteSpace(parameterName))
            return Unhandled();

        OscValue value;
        switch (typeTag[1])
        {
            case 'f':
                if (position + 4 > data.Length)
                    return Unhandled();
                value = OscValue.FromFloat(ReadFloat(data, ref position));
                break;
            case 'i':
                if (position + 4 > data.Length)
                    return Unhandled();
                value = OscValue.FromInt(ReadInt32(data, ref position));
                break;
            case 'T':
                value = OscValue.FromBool(true);
                break;
            case 'F':
                value = OscValue.FromBool(false);
                break;
            default:
                return Unhandled();
        }

        if (!float.IsFinite(value.AsFloat())) return Unhandled();
        onValue(parameterName, value, source);
        return true;
    }

    private static string? ReadOscString(byte[] data, ref int position)
    {
        var start = position;
        var end = position;
        while (end < data.Length && data[end] != 0)
            end++;

        if (end >= data.Length)
            return null;

        var value = Encoding.ASCII.GetString(data, start, end - start);
        position = ((end + 1) + 3) & ~3;
        return value;
    }

    private static int ReadInt32(byte[] data, ref int position)
    {
        if (position + 4 > data.Length)
            return 0;

        var value = (data[position] << 24) | (data[position + 1] << 16) | (data[position + 2] << 8) | data[position + 3];
        position += 4;
        return value;
    }

    private static float ReadFloat(byte[] data, ref int position)
    {
        var raw = ReadInt32(data, ref position);
        return BitConverter.Int32BitsToSingle(raw);
    }
}
