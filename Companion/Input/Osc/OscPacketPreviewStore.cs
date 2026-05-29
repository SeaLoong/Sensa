using System.Text;

namespace Sensa.Input.Osc;

public sealed class OscPacketPreviewStore
{
    private readonly object _sync = new();
    private readonly int _capacity;
    private readonly LinkedList<OscPacketPreviewEntry> _entries = new();

    public OscPacketPreviewStore(int capacity = 64)
    {
        _capacity = Math.Max(8, capacity);
    }

    public void AddPacket(byte[] payload, OscSource source)
    {
        if (payload is null || payload.Length == 0)
            return;

        var timestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var parsed = OscPacketPreviewParser.Parse(payload, source, timestampMs);
        if (parsed.Count == 0)
            return;

        lock (_sync)
        {
            foreach (var entry in parsed)
                _entries.AddFirst(entry);

            while (_entries.Count > _capacity)
                _entries.RemoveLast();
        }
    }

    public OscPacketPreviewEntry[] Snapshot(string? category = null)
    {
        lock (_sync)
        {
            return _entries
                .Where(entry => string.IsNullOrWhiteSpace(category) || string.Equals(entry.Category, category, StringComparison.OrdinalIgnoreCase))
                .ToArray();
        }
    }

    public void Clear()
    {
        lock (_sync)
            _entries.Clear();
    }
}

public sealed class OscPacketPreviewEntry
{
    public string Category { get; init; } = "raw";
    public string Address { get; init; } = string.Empty;
    public string TypeTag { get; init; } = string.Empty;
    public string ValueSummary { get; init; } = string.Empty;
    public long TimestampMs { get; init; }
    public string SourceKey { get; init; } = string.Empty;
    public string SourceLabel { get; init; } = string.Empty;
    public string? SourcePersistentId { get; init; }
    public string SourceAddress { get; init; } = string.Empty;
    public int SourcePort { get; init; }
}

internal static class OscPacketPreviewParser
{
    public static List<OscPacketPreviewEntry> Parse(byte[] data, OscSource source, long timestampMs)
    {
        var result = new List<OscPacketPreviewEntry>();
        AppendEntries(data, source, timestampMs, result);
        return result;
    }

    private static void AppendEntries(byte[] data, OscSource source, long timestampMs, List<OscPacketPreviewEntry> entries)
    {
        if (data is null || data.Length < 4)
            return;

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
                AppendEntries(nested, source, timestampMs, entries);
                position += size;
            }

            return;
        }

        var typeTag = ReadOscString(data, ref position);
        if (typeTag is null || typeTag.Length == 0 || typeTag[0] != ',')
            return;

        var valueSummary = ReadValueSummary(data, ref position, typeTag.AsSpan(1));
        entries.Add(new OscPacketPreviewEntry
        {
            Category = address.StartsWith("/tracking/", StringComparison.OrdinalIgnoreCase) ? "tracking" : "raw",
            Address = address,
            TypeTag = typeTag.Length > 1 ? typeTag[1..] : string.Empty,
            ValueSummary = valueSummary,
            TimestampMs = timestampMs,
            SourceKey = source.Key,
            SourceLabel = source.Label,
            SourcePersistentId = source.PersistentId,
            SourceAddress = source.Address,
            SourcePort = source.Port,
        });
    }

    private static string ReadValueSummary(byte[] data, ref int position, ReadOnlySpan<char> typeTags)
    {
        var values = new List<string>();
        foreach (var type in typeTags)
        {
            switch (type)
            {
                case 'f':
                    values.Add(ReadFloat(data, ref position).ToString("0.###"));
                    break;
                case 'd':
                    values.Add(ReadDouble(data, ref position).ToString("0.###"));
                    break;
                case 'i':
                    values.Add(ReadInt32(data, ref position).ToString());
                    break;
                case 'h':
                    values.Add(ReadInt64(data, ref position).ToString());
                    break;
                case 'T':
                    values.Add("true");
                    break;
                case 'F':
                    values.Add("false");
                    break;
                case 's':
                    values.Add(ReadOscString(data, ref position) ?? string.Empty);
                    break;
                default:
                    values.Add($"<{type}>");
                    break;
            }
        }

        return string.Join(", ", values.Where(value => !string.IsNullOrWhiteSpace(value)));
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

    private static long ReadInt64(byte[] data, ref int position)
    {
        if (position + 8 > data.Length)
            return 0;

        long value = 0;
        for (var index = 0; index < 8; index++)
            value = (value << 8) | data[position + index];

        position += 8;
        return value;
    }

    private static float ReadFloat(byte[] data, ref int position)
    {
        var raw = ReadInt32(data, ref position);
        return BitConverter.Int32BitsToSingle(raw);
    }

    private static double ReadDouble(byte[] data, ref int position)
    {
        var raw = ReadInt64(data, ref position);
        return BitConverter.Int64BitsToDouble(raw);
    }
}
