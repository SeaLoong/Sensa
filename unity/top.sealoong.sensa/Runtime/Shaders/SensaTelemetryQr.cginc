// QR Code Model 2, Version 4/H. One 32-byte Byte segment, four RS(25,9)
// blocks over GF(256)/0x11D, eight standard masks with N1-N4 selection.
// Matrix coordinates start at the top left; 1 means black.
// This runs once per measured triangle in the geometry stage. Fragments
// only read the packed result, including all finder and alignment modules.
#ifndef SENSA_TELEMETRY_QR_INCLUDED
#define SENSA_TELEMETRY_QR_INCLUDED

uint SensaQrMultiply(uint x, uint y)
{
    uint result = 0u;
    [unroll] for (uint bit = 0u; bit < 8u; bit++) {
        result ^= (y & 1u) != 0u ? x : 0u;
        x = (x << 1u) ^ ((x & 128u) != 0u ? 0x11Du : 0u);
        y >>= 1u;
    }
    return result;
}

void SensaQrFunction(inout uint cells[1089], int x, int y, uint dark)
{
    if (x >= 0 && x < 33 && y >= 0 && y < 33) cells[y * 33 + x] = 2u | dark;
}

uint SensaQrFormatBits(uint mask)
{
    uint data = 16u | mask, remainder = data << 10u;
    [unroll] for (int bit = 14; bit >= 10; bit--)
        if (((remainder >> bit) & 1u) != 0u) remainder ^= 0x537u << (bit - 10);
    return ((data << 10u) | remainder) ^ 0x5412u;
}

void SensaQrFormat(inout uint cells[1089], uint mask)
{
    uint bits = SensaQrFormatBits(mask);
    [loop] for (int bit = 0; bit < 6; bit++) SensaQrFunction(cells, 8, bit, (bits >> bit) & 1u);
    SensaQrFunction(cells, 8, 7, (bits >> 6u) & 1u);
    SensaQrFunction(cells, 8, 8, (bits >> 7u) & 1u);
    SensaQrFunction(cells, 7, 8, (bits >> 8u) & 1u);
    [loop] for (int bit = 9; bit < 15; bit++) SensaQrFunction(cells, 14 - bit, 8, (bits >> bit) & 1u);
    [loop] for (int bit = 0; bit < 8; bit++) SensaQrFunction(cells, 32 - bit, 8, (bits >> bit) & 1u);
    [loop] for (int bit = 8; bit < 15; bit++) SensaQrFunction(cells, 8, 18 + bit, (bits >> bit) & 1u);
    SensaQrFunction(cells, 8, 25, 1u);
}

bool SensaQrMask(uint mask, uint x, uint y)
{
    if (mask == 0u) return ((x + y) & 1u) == 0u;
    if (mask == 1u) return (y & 1u) == 0u;
    if (mask == 2u) return x % 3u == 0u;
    if (mask == 3u) return (x + y) % 3u == 0u;
    if (mask == 4u) return ((y / 2u + x / 3u) & 1u) == 0u;
    if (mask == 5u) return (x * y) % 2u + (x * y) % 3u == 0u;
    if (mask == 6u) return (((x * y) % 2u + (x * y) % 3u) & 1u) == 0u;
    return (((x + y) % 2u + (x * y) % 3u) & 1u) == 0u;
}

void SensaQrApplyMask(inout uint cells[1089], uint mask)
{
    [loop] for (uint y = 0u; y < 33u; y++) [loop] for (uint x = 0u; x < 33u; x++)
        if ((cells[y * 33u + x] & 2u) == 0u && SensaQrMask(mask, x, y)) cells[y * 33u + x] ^= 1u;
}

uint SensaQrPenalty(uint cells[1089])
{
    uint score = 0u, dark = 0u;
    [loop] for (uint y = 0u; y < 33u; y++) {
        uint rowRun = 0u, columnRun = 0u, previousRow = 2u, previousColumn = 2u;
        uint rowPattern = 0u, columnPattern = 0u;
        [loop] for (uint x = 0u; x < 33u; x++) {
            uint row = cells[y * 33u + x] & 1u, column = cells[x * 33u + y] & 1u;
            dark += row;
            rowRun = row == previousRow ? rowRun + 1u : 1u;
            columnRun = column == previousColumn ? columnRun + 1u : 1u;
            if (rowRun == 5u) score += 3u; else if (rowRun > 5u) score++;
            if (columnRun == 5u) score += 3u; else if (columnRun > 5u) score++;
            previousRow = row; previousColumn = column;
            rowPattern = ((rowPattern << 1u) | row) & 2047u;
            columnPattern = ((columnPattern << 1u) | column) & 2047u;
            if (x >= 10u) {
                if (rowPattern == 1488u || rowPattern == 93u) score += 40u;
                if (columnPattern == 1488u || columnPattern == 93u) score += 40u;
            }
            if (x < 32u && y < 32u && row == (cells[y * 33u + x + 1u] & 1u)
                && row == (cells[(y + 1u) * 33u + x] & 1u) && row == (cells[(y + 1u) * 33u + x + 1u] & 1u)) score += 3u;
        }
    }
    return score + (uint)abs((int)dark * 20 - 10890) / 1089u * 10u;
}

void SensaQrEncode(uint packet[32], out uint packed[36])
{
    uint data[36], codewords[100], cells[1089];
    // Byte mode (0100), eight-bit length (32), payload, four terminator bits.
    data[0] = 0x42u; data[1] = packet[0] >> 4u;
    [loop] for (uint i = 2u; i <= 32u; i++)
        data[i] = ((packet[i - 2u] << 4u) & 240u) | (packet[i - 1u] >> 4u);
    data[33] = (packet[31] << 4u) & 240u; data[34] = 0xECu; data[35] = 0x11u;
    // Generator coefficients for roots alpha^0..alpha^15, without the leading 1.
    const uint generator[16] = { 59u,13u,104u,189u,68u,209u,30u,8u,163u,65u,41u,229u,98u,50u,36u,59u };
    [loop] for (uint block = 0u; block < 4u; block++) {
        uint remainder[16];
        [loop] for (uint i = 0u; i < 16u; i++) remainder[i] = 0u;
        [loop] for (uint i = 0u; i < 9u; i++) {
            uint value = data[block * 9u + i], factor = value ^ remainder[0];
            codewords[i * 4u + block] = value;
            [loop] for (uint j = 0u; j < 15u; j++) remainder[j] = remainder[j + 1u] ^ SensaQrMultiply(generator[j], factor);
            remainder[15] = SensaQrMultiply(generator[15], factor);
        }
        [loop] for (uint i = 0u; i < 16u; i++) codewords[36u + i * 4u + block] = remainder[i];
    }
    [loop] for (uint i = 0u; i < 1089u; i++) cells[i] = 0u;
    [loop] for (uint finder = 0u; finder < 3u; finder++) {
        int cx = finder == 1u ? 29 : 3, cy = finder == 2u ? 29 : 3;
        [loop] for (int dy = -4; dy <= 4; dy++) [loop] for (int dx = -4; dx <= 4; dx++) {
            int distance = max(abs(dx), abs(dy));
            SensaQrFunction(cells, cx + dx, cy + dy, distance != 2 && distance != 4 ? 1u : 0u);
        }
    }
    [loop] for (int i = 8; i < 25; i++) {
        SensaQrFunction(cells, i, 6, (uint)(1 - i % 2));
        SensaQrFunction(cells, 6, i, (uint)(1 - i % 2));
    }
    [loop] for (int dy = -2; dy <= 2; dy++) [loop] for (int dx = -2; dx <= 2; dx++)
        SensaQrFunction(cells, 26 + dx, 26 + dy, max(abs(dx), abs(dy)) != 1 ? 1u : 0u);
    SensaQrFormat(cells, 0u);
    uint dataBit = 0u;
    bool upward = true;
    [loop] for (int right = 32; right >= 1; right -= 2) {
        if (right == 6) right = 5;
        [loop] for (int vertical = 0; vertical < 33; vertical++) [loop] for (int side = 0; side < 2; side++) {
            int x = right - side, y = upward ? 32 - vertical : vertical;
            if ((cells[y * 33 + x] & 2u) == 0u) {
                // Keep speculative/flattened reads in range for the seven remainder bits.
                cells[y * 33 + x] = dataBit < 800u ? (codewords[min(dataBit / 8u, 99u)] >> (7u - dataBit % 8u)) & 1u : 0u;
                dataBit++;
            }
        }
        upward = !upward;
    }
    uint bestMask = 0u, bestScore = 0xFFFFFFFFu;
    [loop] for (uint mask = 0u; mask < 8u; mask++) {
        SensaQrApplyMask(cells, mask); SensaQrFormat(cells, mask);
        uint score = SensaQrPenalty(cells);
        if (score < bestScore) { bestScore = score; bestMask = mask; }
        SensaQrApplyMask(cells, mask);
    }
    SensaQrApplyMask(cells, bestMask); SensaQrFormat(cells, bestMask);
    [loop] for (uint word = 0u; word < 36u; word++) packed[word] = 0u;
    [loop] for (uint bit = 0u; bit < 1089u; bit++) packed[bit / 32u] |= (cells[bit] & 1u) << (bit % 32u);
}

#endif
