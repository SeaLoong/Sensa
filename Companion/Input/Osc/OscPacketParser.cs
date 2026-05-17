using System.Text;

namespace Sensa.Input.Osc;

internal static class OscPacketParser
{
    private const string AvatarParameterPrefix = "/avatar/parameters/";

    public static void ParseAvatarPacket(byte[] data, OscSource source, Action<string, OscValue, OscSource> onValue, Action? onAvatarChange = null)
    {
        if (data is null || data.Length < 8)
            return;

        ParsePacketCore(data, source, onValue, onAvatarChange);
    }

    private static void ParsePacketCore(byte[] data, OscSource source, Action<string, OscValue, OscSource> onValue, Action? onAvatarChange)
    {
        var position = 0;
        var address = ReadOscString(data, ref position);
        if (address is null)
            return;

        if (string.Equals(address, "#bundle", StringComparison.Ordinal))
        {
            position += 8;
            while (position + 4 <= data.Length)
            {
                var size = ReadInt32(data, ref position);
                if (size <= 0 || position + size > data.Length)
                    break;

                var nested = new byte[size];
                Array.Copy(data, position, nested, 0, size);
                ParsePacketCore(nested, source, onValue, onAvatarChange);
                position += size;
            }

            return;
        }

        var typeTag = ReadOscString(data, ref position);
        if (typeTag is null || typeTag.Length < 2 || typeTag[0] != ',')
            return;

        if (string.Equals(address, "/avatar/change", StringComparison.Ordinal))
        {
            onAvatarChange?.Invoke();
            return;
        }

        if (!address.StartsWith(AvatarParameterPrefix, StringComparison.Ordinal))
            return;

        var parameterName = address[AvatarParameterPrefix.Length..];
        if (string.IsNullOrWhiteSpace(parameterName))
            return;

        OscValue value;
        switch (typeTag[1])
        {
            case 'f':
                if (position + 4 > data.Length)
                    return;
                value = OscValue.FromFloat(ReadFloat(data, ref position));
                break;
            case 'i':
                if (position + 4 > data.Length)
                    return;
                value = OscValue.FromInt(ReadInt32(data, ref position));
                break;
            case 'T':
                value = OscValue.FromBool(true);
                break;
            case 'F':
                value = OscValue.FromBool(false);
                break;
            default:
                return;
        }

        onValue(parameterName, value, source);
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
