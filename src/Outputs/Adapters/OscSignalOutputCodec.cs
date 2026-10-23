using System.Buffers.Binary;
using System.Text;

namespace Sensa.Outputs.Adapters;

public static class OscSignalOutputCodec
{
    public static OutputPayload Encode(SignalOutputValue value)
    {
        ArgumentNullException.ThrowIfNull(value);
        var address = value.Address?.Trim() ?? "";
        if (address.Length is < 2 or > 512 || address[0] != '/'
            || address.Any(character => char.IsControl(character) || char.IsWhiteSpace(character)
                || character is '*' or '?' or '[' or ']' or '{' or '}' or ',' or '#'))
            throw new ArgumentException("Choose a complete OSC output address beginning with /.");
        var typed = value.TypedValue();
        using var stream = new MemoryStream();
        WriteString(stream, address);
        switch (typed)
        {
            case float number:
                WriteString(stream, ",f"); WriteInt(stream, BitConverter.SingleToInt32Bits(number)); break;
            case int number:
                WriteString(stream, ",i"); WriteInt(stream, number); break;
            case bool flag:
                WriteString(stream, flag ? ",T" : ",F"); break;
            default: throw new ArgumentException("Choose Float, Int or Bool for OSC output.");
        }
        return new(stream.ToArray(), address);
    }

    private static void WriteString(Stream stream, string value)
    {
        var bytes = Encoding.UTF8.GetBytes(value);
        stream.Write(bytes); stream.WriteByte(0);
        for (var padding = (4 - (bytes.Length + 1) % 4) % 4; padding > 0; padding--) stream.WriteByte(0);
    }

    private static void WriteInt(Stream stream, int value)
    {
        Span<byte> data = stackalloc byte[4]; BinaryPrimitives.WriteInt32BigEndian(data, value); stream.Write(data);
    }
}
