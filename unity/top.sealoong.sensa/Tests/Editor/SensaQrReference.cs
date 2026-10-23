#if UNITY_INCLUDE_TESTS
using System;
using System.Collections.Generic;
using System.Linq;

namespace UnityBox.Sensa.Tests
{
    // Independent CPU reference for the GPU contract. This is test-only code;
    // the built avatar retains the native shader and needs no runtime script.
    internal static class SensaQrReference
    {
        internal const int Size = 33;
        internal const int Margin = 8;
        internal const int TileSize = Size + 2 * Margin;

        internal static int[] Encode(byte[] packet, out int chosenMask, out int[] scores)
        {
            if (packet.Length != 32) throw new ArgumentException("Expected 32 telemetry bytes.");
            var bits = new List<int>();
            Append(bits, 4, 4); Append(bits, packet.Length, 8);
            foreach (var value in packet) Append(bits, value, 8);
            Append(bits, 0, 4); Append(bits, 0xec, 8); Append(bits, 0x11, 8);
            var data = Enumerable.Range(0, 36).Select(i => Read(bits, i * 8, 8)).ToArray();
            var blocks = new int[4][];
            for (var block = 0; block < 4; block++) blocks[block] = AddParity(data.Skip(block * 9).Take(9).ToArray());
            var stream = new List<int>();
            for (var offset = 0; offset < 25; offset++) for (var block = 0; block < 4; block++) Append(stream, blocks[block][offset], 8);
            var functions = Functions();
            var candidates = new int[8][];
            scores = new int[8];
            for (var mask = 0; mask < 8; mask++)
            {
                var matrix = (int[])functions.Clone();
                var index = 0;
                foreach (var position in DataPositions(functions))
                {
                    matrix[position] = (index < stream.Count ? stream[index] : 0) ^ (Masked(mask, position % Size, position / Size) ? 1 : 0);
                    index++;
                }
                var format = Format(mask);
                foreach (var positions in FormatPositions()) for (var bit = 0; bit < 15; bit++) matrix[positions[bit]] = (format >> bit) & 1;
                candidates[mask] = matrix; scores[mask] = Penalty(matrix);
            }
            var penalties = scores;
            chosenMask = Enumerable.Range(0, 8).OrderBy(mask => penalties[mask]).First();
            return candidates[chosenMask];
        }

        internal static byte[] ReadPacket(int[] matrix)
        {
            if (matrix.Length != Size * Size || matrix.Any(value => value != 0 && value != 1)) throw new ArgumentException("Expected a binary 33-module symbol.");
            var formats = FormatPositions();
            var masks = Enumerable.Range(0, 8).Where(mask => formats.All(positions =>
                Enumerable.Range(0, 15).All(bit => matrix[positions[bit]] == ((Format(mask) >> bit) & 1)))).ToArray();
            if (masks.Length != 1) throw new InvalidOperationException("GPU format information differs from QR V4/H.");
            var bits = DataPositions(Functions()).Select(position => matrix[position] ^ (Masked(masks[0], position % Size, position / Size) ? 1 : 0)).ToArray();
            var interleaved = Enumerable.Range(0, 36).Select(i => Read(bits, i * 8, 8)).ToArray();
            var data = new List<int>();
            for (var block = 0; block < 4; block++) for (var offset = 0; offset < 9; offset++) Append(data, interleaved[offset * 4 + block], 8);
            if (Read(data, 0, 4) != 4 || Read(data, 4, 8) != 32) throw new InvalidOperationException("GPU byte-segment header differs.");
            return Enumerable.Range(0, 32).Select(i => (byte)Read(data, 12 + i * 8, 8)).ToArray();
        }

        private static int[] AddParity(int[] data)
        {
            var generator = new[] { 1 };
            var root = 1;
            for (var degree = 0; degree < 16; degree++)
            {
                var next = new int[generator.Length + 1];
                for (var i = 0; i < generator.Length; i++) { next[i] ^= generator[i]; next[i + 1] ^= Multiply(generator[i], root); }
                generator = next; root = Multiply(root, 2);
            }
            var result = data.Concat(new int[16]).ToArray();
            for (var i = 0; i < data.Length; i++)
            {
                var factor = result[i];
                for (var j = 0; j < generator.Length; j++) result[i + j] ^= Multiply(generator[j], factor);
            }
            Array.Copy(data, result, data.Length);
            return result;
        }

        private static int Multiply(int x, int y)
        {
            var result = 0;
            while (y != 0) { if ((y & 1) != 0) result ^= x; x <<= 1; if (x >= 256) x ^= 0x11d; y >>= 1; }
            return result;
        }

        private static int[] Functions()
        {
            var cells = Enumerable.Repeat(-1, Size * Size).ToArray();
            void Set(int x, int y, int value) { if (x >= 0 && x < Size && y >= 0 && y < Size) cells[y * Size + x] = value; }
            foreach (var origin in new[] { (0, 0), (26, 0), (0, 26) })
                for (var y = -1; y < 8; y++) for (var x = -1; x < 8; x++)
                    Set(origin.Item1 + x, origin.Item2 + y, x >= 0 && x <= 6 && y >= 0 && y <= 6 &&
                        (x == 0 || x == 6 || y == 0 || y == 6 || x >= 2 && x <= 4 && y >= 2 && y <= 4) ? 1 : 0);
            for (var coordinate = 8; coordinate < 25; coordinate++) { Set(6, coordinate, 1 - coordinate % 2); Set(coordinate, 6, 1 - coordinate % 2); }
            for (var y = -2; y <= 2; y++) for (var x = -2; x <= 2; x++) Set(26 + x, 26 + y, Math.Max(Math.Abs(x), Math.Abs(y)) != 1 ? 1 : 0);
            foreach (var positions in FormatPositions()) foreach (var position in positions) cells[position] = 0;
            Set(8, 25, 1);
            return cells;
        }

        private static IEnumerable<int> DataPositions(int[] functions)
        {
            var upward = true;
            for (var right = 32; right >= 1; right -= 2)
            {
                if (right == 6) right = 5;
                for (var vertical = 0; vertical < Size; vertical++) for (var side = 0; side < 2; side++)
                {
                    var position = (upward ? 32 - vertical : vertical) * Size + right - side;
                    if (functions[position] < 0) yield return position;
                }
                upward = !upward;
            }
        }

        private static int[][] FormatPositions() => new[] {
            Enumerable.Range(0, 6).Select(y => y * Size + 8).Concat(new[] { 7 * Size + 8, 8 * Size + 8, 8 * Size + 7 })
                .Concat(Enumerable.Range(9, 6).Select(i => 8 * Size + 14 - i)).ToArray(),
            Enumerable.Range(0, 8).Select(i => 8 * Size + 32 - i)
                .Concat(Enumerable.Range(8, 7).Select(i => (18 + i) * Size + 8)).ToArray()
        };

        private static int Format(int mask)
        {
            var data = 16 | mask; var remainder = data << 10;
            for (var bit = 14; bit >= 10; bit--) if (((remainder >> bit) & 1) != 0) remainder ^= 0x537 << (bit - 10);
            return ((data << 10) | remainder) ^ 0x5412;
        }

        private static bool Masked(int mask, int x, int y)
        {
            switch (mask)
            {
                case 0: return (x + y) % 2 == 0;
                case 1: return y % 2 == 0;
                case 2: return x % 3 == 0;
                case 3: return (x + y) % 3 == 0;
                case 4: return (y / 2 + x / 3) % 2 == 0;
                case 5: return x * y % 2 + x * y % 3 == 0;
                case 6: return (x * y % 2 + x * y % 3) % 2 == 0;
                default: return ((x + y) % 2 + x * y % 3) % 2 == 0;
            }
        }

        private static int Penalty(int[] cells)
        {
            var score = 0;
            for (var direction = 0; direction < 2; direction++) for (var line = 0; line < Size; line++)
            {
                var values = Enumerable.Range(0, Size).Select(i => cells[direction == 0 ? line * Size + i : i * Size + line]).ToArray();
                var streak = 1;
                for (var i = 1; i < Size; i++)
                {
                    streak = values[i] == values[i - 1] ? streak + 1 : 1;
                    if (streak == 5) score += 3; else if (streak > 5) score++;
                }
                for (var i = 0; i < Size - 10; i++) { var pattern = Read(values, i, 11); if (pattern == 1488 || pattern == 93) score += 40; }
            }
            for (var y = 0; y < Size - 1; y++) for (var x = 0; x < Size - 1; x++)
            {
                var value = cells[y * Size + x];
                if (value == cells[y * Size + x + 1] && value == cells[(y + 1) * Size + x] && value == cells[(y + 1) * Size + x + 1]) score += 3;
            }
            return score + Math.Abs(cells.Sum() * 20 - 10890) / 1089 * 10;
        }

        private static void Append(List<int> bits, int value, int width) { for (var shift = width - 1; shift >= 0; shift--) bits.Add((value >> shift) & 1); }
        private static int Read(IList<int> bits, int offset, int count) { var value = 0; for (var i = 0; i < count; i++) value = value * 2 + bits[offset + i]; return value; }
    }
}
#endif
