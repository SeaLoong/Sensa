"""Fixed QR Code Model 2, Version 4/H telemetry codec.

The public matrix uses a top-left origin and 1 means black. The 32-byte
application packet is a single Byte segment. Reed–Solomon works on four
RS(25,9) blocks over GF(256), primitive polynomial 0x11d.
"""
from functools import lru_cache
from itertools import combinations
import math

SIZE = 33
QUIET = 8
TOTAL_SIZE = SIZE + QUIET * 2
BLOCKS = 4
DATA_PER_BLOCK = 9
ECC_PER_BLOCK = 16
PACKET_SIZE = 32
MAX_FINDERS = 16
MAX_DECODE_ATTEMPTS = 32

_EXP = [0] * 512
_LOG = [0] * 256
_value = 1
for _index in range(255):
    _EXP[_index] = _value
    _LOG[_value] = _index
    _value <<= 1
    if _value & 256:
        _value ^= 0x11d
for _index in range(255, 512):
    _EXP[_index] = _EXP[_index - 255]


def gf_mul(a, b):
    return _EXP[_LOG[a] + _LOG[b]] if a and b else 0


def gf_div(a, b):
    if not b:
        raise ValueError('Zero GF divisor')
    return _EXP[(_LOG[a] - _LOG[b]) % 255] if a else 0


@lru_cache(maxsize=1)
def rs_generator():
    polynomial = [1]
    for power in range(ECC_PER_BLOCK):
        result = [0] * (len(polynomial) + 1)
        for i, coefficient in enumerate(polynomial):
            result[i] ^= coefficient
            result[i + 1] ^= gf_mul(coefficient, _EXP[power])
        polynomial = result
    return tuple(polynomial)


def rs_encode(data):
    if len(data) != DATA_PER_BLOCK:
        raise ValueError('QR block requires nine data bytes')
    remainder = list(data) + [0] * ECC_PER_BLOCK
    generator = rs_generator()
    for i in range(len(data)):
        factor = remainder[i]
        for j, coefficient in enumerate(generator):
            remainder[i + j] ^= gf_mul(factor, coefficient)
    return bytes(data) + bytes(remainder[-ECC_PER_BLOCK:])


def _syndromes(block):
    values = []
    for power in range(ECC_PER_BLOCK):
        value = 0
        for byte in block:
            value = gf_mul(value, _EXP[power]) ^ byte
        values.append(value)
    return values


def _locator(syndromes):
    count = len(syndromes)
    current, previous = [1] + [0] * count, [1] + [0] * count
    degree, shift, last = 0, 1, 1
    for index, value in enumerate(syndromes):
        discrepancy = value
        for i in range(1, degree + 1):
            discrepancy ^= gf_mul(current[i], syndromes[index - i])
        if not discrepancy:
            shift += 1
            continue
        original = current.copy()
        factor = gf_div(discrepancy, last)
        for i in range(count + 1 - shift):
            current[i + shift] ^= gf_mul(factor, previous[i])
        if 2 * degree <= index:
            degree, previous, last, shift = index + 1 - degree, original, discrepancy, 1
        else:
            shift += 1
    return current[:degree + 1]


def rs_decode(block):
    """Correct bytes/None erasures when 2*errors + erasures <= 16.

    A successful result has zero syndromes. Application CRC and packet checks
    remain necessary: errors outside the bound can reach another codeword.
    """
    if len(block) != DATA_PER_BLOCK + ECC_PER_BLOCK:
        raise ValueError('QR block requires 25 symbols')
    erased = [i for i, value in enumerate(block) if value is None]
    if len(erased) > ECC_PER_BLOCK:
        raise ValueError('QR block has too many erasures')
    received = [0 if value is None else value for value in block]
    if any(type(value) is not int or not 0 <= value <= 255 for value in received):
        raise ValueError('Invalid QR symbol')
    syndromes = _syndromes(received)
    reduced = syndromes.copy()
    for position in erased:
        root = _EXP[len(block) - 1 - position]
        reduced = [gf_mul(value, root) ^ reduced[i + 1] for i, value in enumerate(reduced[:-1])]
    locator = _locator(reduced)
    degree = len(locator) - 1
    if 2 * degree + len(erased) > ECC_PER_BLOCK:
        raise ValueError('QR block exceeds correction budget')
    errors = []
    for position in range(len(block)):
        root = _EXP[(255 - (len(block) - 1 - position)) % 255]
        value = 0
        for coefficient in reversed(locator):
            value = gf_mul(value, root) ^ coefficient
        if value == 0:
            errors.append(position)
    if len(errors) != degree or set(errors) & set(erased):
        raise ValueError('QR error locator has no consistent roots')
    positions = erased + errors
    if positions:
        # Solve the syndrome Vandermonde system for error magnitudes.
        count = len(positions)
        matrix = [[_EXP[(row * (len(block) - 1 - position)) % 255] for position in positions]
                  + [syndromes[row]] for row in range(count)]
        for column in range(count):
            pivot = next((row for row in range(column, count) if matrix[row][column]), None)
            if pivot is None:
                raise ValueError('Singular QR correction system')
            matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
            divisor = matrix[column][column]
            matrix[column] = [gf_div(value, divisor) for value in matrix[column]]
            for row in range(count):
                if row == column:
                    continue
                factor = matrix[row][column]
                if factor:
                    matrix[row] = [value ^ gf_mul(factor, other)
                                   for value, other in zip(matrix[row], matrix[column])]
        for row, position in enumerate(positions):
            received[position] ^= matrix[row][-1]
    if any(_syndromes(received)):
        raise ValueError('QR block correction failed')
    return bytes(received[:DATA_PER_BLOCK])


def format_bits(mask):
    if type(mask) is not int or not 0 <= mask <= 7:
        raise ValueError('QR mask must be 0..7')
    value = 0b10 << 3 | mask  # H error-correction level.
    remainder = value << 10
    for bit in range(14, 9, -1):
        if remainder >> bit & 1:
            remainder ^= 0x537 << (bit - 10)
    return ((value << 10) | remainder) ^ 0x5412


def format_positions():
    first = [(8, y) for y in range(6)] + [(8, 7), (8, 8), (7, 8)] + [(14 - i, 8) for i in range(9, 15)]
    second = [(SIZE - 1 - i, 8) for i in range(8)] + [(8, SIZE - 15 + i) for i in range(8, 15)]
    return first, second


@lru_cache(maxsize=1)
def function_modules():
    """Flat 33x33 immutable map: None=data, 0=white, 1=black.

    Format locations are reserved white here; encode() writes the actual bits.
    """
    matrix = [None] * (SIZE * SIZE)
    def put(x, y, value):
        if 0 <= x < SIZE and 0 <= y < SIZE:
            matrix[y * SIZE + x] = value
    for x0, y0 in ((0, 0), (SIZE - 7, 0), (0, SIZE - 7)):
        for dy in range(-1, 8):
            for dx in range(-1, 8):
                black = 0 <= dx <= 6 and 0 <= dy <= 6 and (dx in (0, 6) or dy in (0, 6) or 2 <= dx <= 4 and 2 <= dy <= 4)
                put(x0 + dx, y0 + dy, int(black))
    for coordinate in range(8, SIZE - 8):
        put(coordinate, 6, 1 - coordinate % 2)
        put(6, coordinate, 1 - coordinate % 2)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            put(26 + dx, 26 + dy, int(max(abs(dx), abs(dy)) != 1))
    for locations in format_positions():
        for x, y in locations:
            put(x, y, 0)
    put(8, SIZE - 8, 1)
    return tuple(matrix)


@lru_cache(maxsize=1)
def data_positions():
    functions = function_modules()
    result = []
    right, upward = SIZE - 1, True
    while right >= 1:
        if right == 6:
            right -= 1
        for y in (range(SIZE - 1, -1, -1) if upward else range(SIZE)):
            for x in (right, right - 1):
                if functions[y * SIZE + x] is None:
                    result.append((x, y))
        upward = not upward
        right -= 2
    assert len(result) == 807
    return tuple(result)


def mask_bit(mask, x, y):
    if mask == 0: return (x + y) % 2 == 0
    if mask == 1: return y % 2 == 0
    if mask == 2: return x % 3 == 0
    if mask == 3: return (x + y) % 3 == 0
    if mask == 4: return (y // 2 + x // 3) % 2 == 0
    if mask == 5: return x * y % 2 + x * y % 3 == 0
    if mask == 6: return (x * y % 2 + x * y % 3) % 2 == 0
    if mask == 7: return ((x + y) % 2 + x * y % 3) % 2 == 0
    raise ValueError('QR mask must be 0..7')


def penalty(matrix):
    """QR N1–N4 penalties; deterministic lowest-index mask wins ties."""
    score = 0
    for lines in (matrix, list(zip(*matrix))):
        for line in lines:
            streak = 1
            for i in range(1, SIZE):
                streak = streak + 1 if line[i] == line[i - 1] else 1
                if streak == 5: score += 3
                elif streak > 5: score += 1
            # The standard 1:1:3:1:1 finder-like runs with four light modules.
            for i in range(SIZE - 10):
                if tuple(line[i:i + 11]) in ((1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0),
                                            (0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1)):
                    score += 40
    for y in range(SIZE - 1):
        for x in range(SIZE - 1):
            if matrix[y][x] == matrix[y][x + 1] == matrix[y + 1][x] == matrix[y + 1][x + 1]:
                score += 3
    black = sum(sum(row) for row in matrix)
    score += abs(black * 20 - SIZE * SIZE * 10) // (SIZE * SIZE) * 10
    return score


def encode(packet, mask=None):
    """Return {matrix, mask, codewords, scores} for a 32-byte packet."""
    if len(packet) != PACKET_SIZE:
        raise ValueError('Telemetry QR requires exactly 32 payload bytes')
    bits = '0100' + f'{PACKET_SIZE:08b}' + ''.join(f'{value:08b}' for value in packet) + '0000'
    data = bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits), 8)) + bytes((0xec, 0x11))
    assert len(data) == BLOCKS * DATA_PER_BLOCK
    blocks = [rs_encode(data[i * DATA_PER_BLOCK:(i + 1) * DATA_PER_BLOCK]) for i in range(BLOCKS)]
    codewords = bytes(blocks[block][offset] for offset in range(DATA_PER_BLOCK + ECC_PER_BLOCK)
                      for block in range(BLOCKS))
    candidates, scores = [], []
    for current in range(8):
        flat = list(function_modules())
        for i, (x, y) in enumerate(data_positions()):
            value = codewords[i // 8] >> (7 - i % 8) & 1 if i < 800 else 0
            flat[y * SIZE + x] = value ^ mask_bit(current, x, y)
        for locations in format_positions():
            for bit, (x, y) in enumerate(locations):
                flat[y * SIZE + x] = format_bits(current) >> bit & 1
        matrix = [flat[y * SIZE:(y + 1) * SIZE] for y in range(SIZE)]
        candidates.append(matrix)
        scores.append(penalty(matrix))
    if mask is None:
        mask = min(range(8), key=lambda candidate: scores[candidate])
    elif type(mask) is not int or not 0 <= mask <= 7:
        raise ValueError('QR mask must be 0..7')
    return {'matrix': candidates[mask], 'mask': mask, 'codewords': codewords, 'scores': scores}


def _read_mask(matrix):
    possibilities = []
    for mask in range(8):
        bits = format_bits(mask)
        costs = []
        for locations in format_positions():
            errors, erasures = 0, 0
            for bit, (x, y) in enumerate(locations):
                value = matrix[y][x]
                if value is None: erasures += 1
                elif value != (bits >> bit & 1): errors += 1
            costs.append(2 * errors + erasures)
        if min(costs) <= 6:
            possibilities.append(mask)
    if len(possibilities) != 1:
        raise ValueError('QR format information is damaged or ambiguous')
    return possibilities[0]


def decode_matrix(matrix):
    """Decode a top-left-origin 33x33 matrix; None modules are erasures."""
    if len(matrix) != SIZE or any(len(row) != SIZE for row in matrix):
        raise ValueError('Telemetry QR requires a 33x33 matrix')
    if any(value not in (0, 1, None) for row in matrix for value in row):
        raise ValueError('Invalid QR module')
    mask = _read_mask(matrix)
    codewords = []
    for byte in range(100):
        value, erased = 0, False
        for bit in range(8):
            x, y = data_positions()[byte * 8 + bit]
            module = matrix[y][x]
            if module is None:
                erased = True
            else:
                value |= (module ^ mask_bit(mask, x, y)) << (7 - bit)
        codewords.append(None if erased else value)
    data = b''.join(rs_decode(codewords[block::BLOCKS]) for block in range(BLOCKS))
    bits = ''.join(f'{byte:08b}' for byte in data)
    if bits[:12] != '010000100000' or bits[268:272] != '0000' or data[-2:] != b'\xec\x11':
        raise ValueError('QR payload is not the fixed telemetry Byte segment')
    return bytes(int(bits[i:i + 8], 2) for i in range(12, 268, 8))


def render(packet, width=196, height=196, mask=None):
    """Render a telemetry QR to RGB tuples, including the white shift margin."""
    matrix = encode(packet, mask)['matrix']
    result = []
    side = min(width, height)
    for y in range(height):
        row = (2 * y + 1 - (height - side)) * TOTAL_SIZE // (2 * side) - QUIET
        for x in range(width):
            column = (2 * x + 1 - (width - side)) * TOTAL_SIZE // (2 * side) - QUIET
            dark = 0 <= column < SIZE and 0 <= row < SIZE and matrix[row][column]
            result.append((0, 0, 0) if dark else (255, 255, 255))
    return result


def _ratio(counts):
    unit = sum(counts) / 7
    return unit if unit >= 2 and all(abs(count - unit * expected) <= unit * .7
                                    for count, expected in zip(counts, (1, 1, 3, 1, 1))) else None


def _cross(binary, width, height, x, y, vertical):
    """Measure a finder through its central dark square."""
    limit = height if vertical else width
    coordinate = y if vertical else x
    def read(value):
        return binary[value * width + x] if vertical else binary[y * width + value]
    if not 0 <= coordinate < limit or read(coordinate) != 1:
        return None
    low, high = coordinate, coordinate
    while low > 0 and read(low - 1) == 1: low -= 1
    while high + 1 < limit and read(high + 1) == 1: high += 1
    counts = [0, 0, high - low + 1, 0, 0]
    previous = low - 1
    while previous >= 0 and read(previous) == 0: counts[1] += 1; previous -= 1
    while previous >= 0 and read(previous) == 1: counts[0] += 1; previous -= 1
    following = high + 1
    while following < limit and read(following) == 0: counts[3] += 1; following += 1
    while following < limit and read(following) == 1: counts[4] += 1; following += 1
    unit = _ratio(counts)
    return ((low + high + 1) / 2, unit) if unit else None


def _finder_centers(binary, width, height):
    candidates = []
    # At the minimum 4 px/module, scanning every second row still crosses
    # each finder center several times. Work stays inside the selected image.
    for y in range(0, height, max(1, min(width, height) // 98)):
        runs, colors = [], []
        start, previous = 0, binary[y * width]
        for x in range(1, width + 1):
            color = binary[y * width + x] if x < width else -2
            if color == previous:
                continue
            runs.append(x - start); colors.append(previous)
            if len(runs) > 5: runs.pop(0); colors.pop(0)
            if colors == [1, 0, 1, 0, 1] and _ratio(runs):
                cx = x - runs[4] - runs[3] - runs[2] / 2
                vertical = _cross(binary, width, height, int(cx), y, True)
                if vertical:
                    cy, pitch = vertical
                    horizontal = _cross(binary, width, height, int(cx), int(cy), False)
                    if horizontal and abs(horizontal[1] - pitch) <= pitch * .45:
                        cx, pitch_x = horizontal
                        pitch = (pitch + pitch_x) / 2
                        found = next((item for item in candidates if math.hypot(item[0] - cx, item[1] - cy) < pitch * 1.5), None)
                        if found:
                            weight = found[3]
                            found[:3] = [(old * weight + new) / (weight + 1) for old, new in zip(found[:3], (cx, cy, pitch))]
                            found[3] += 1
                        else:
                            candidates.append([cx, cy, pitch, 1])
                            if len(candidates) > MAX_FINDERS * 4:
                                return []
            start, previous = x, color
    recognized = [item for item in candidates if item[3] >= 2]
    # Reject an overfull ROI rather than dropping a possible second symbol.
    return sorted(recognized, key=lambda item: -item[3]) if len(recognized) <= MAX_FINDERS else []


def decode_pixels(pixels, width, height):
    """Locate three finder patterns and decode one telemetry symbol in an ROI.

    Affine sampling covers rotation, reflection, white padding and planar scale.
    Large perspective distortion is outside this fixed capture profile.
    """
    if width < TOTAL_SIZE * 4 or height < TOTAL_SIZE * 4 or len(pixels) != width * height:
        return None
    binary = []
    for pixel in pixels:
        red, green, blue = pixel[0], pixel[1], pixel[2]
        binary.append(1 if red < 80 and green < 80 and blue < 80 else
                      0 if red > 175 and green > 175 and blue > 175 else -1)
    centers = _finder_centers(binary, width, height)
    decoded = set()
    attempts = 0
    formats = {point for locations in format_positions() for point in locations}
    fixed = [(x, y, value) for y in range(SIZE) for x in range(SIZE)
             if (value := function_modules()[y * SIZE + x]) is not None and (x, y) not in formats]
    for triple in combinations(centers, 3):
        for origin_index in range(3):
            origin = triple[origin_index]
            other = [triple[index] for index in range(3) if index != origin_index]
            for first, second in (other, other[::-1]):
                dx = ((first[0] - origin[0]) / 26, (first[1] - origin[1]) / 26)
                dy = ((second[0] - origin[0]) / 26, (second[1] - origin[1]) / 26)
                pitch_x, pitch_y = math.hypot(*dx), math.hypot(*dy)
                if min(pitch_x, pitch_y) < 3 or not .5 <= pitch_x / pitch_y <= 2:
                    continue
                if abs(dx[0] * dy[0] + dx[1] * dy[1]) > pitch_x * pitch_y * .15:
                    continue
                # A finder rotated 45 degrees has sqrt(2)-wider horizontal and
                # vertical cross sections. Compare the measured scan width to
                # that implied by the basis instead of the module side length.
                scan_x = 1 / max(abs(dx[0]) / pitch_x ** 2, abs(dy[0]) / pitch_y ** 2)
                scan_y = 1 / max(abs(dx[1]) / pitch_x ** 2, abs(dy[1]) / pitch_y ** 2)
                expected_scan = (scan_x + scan_y) / 2
                if any(abs(item[2] - expected_scan) > expected_scan * .4 for item in triple):
                    continue
                # Finder ratios alone also occur in noise. Verify the complete
                # fixed geometry before allocating/sampling all data modules.
                mismatches = 0
                for column, row, value in fixed:
                    x = int(origin[0] + (column - 3) * dx[0] + (row - 3) * dy[0])
                    y = int(origin[1] + (column - 3) * dx[1] + (row - 3) * dy[1])
                    if not 0 <= x < width or not 0 <= y < height or binary[y * width + x] != value:
                        mismatches += 1
                    if mismatches > 24:
                        break
                if mismatches > 24:
                    continue
                attempts += 1
                if attempts > MAX_DECODE_ATTEMPTS:
                    return None
                matrix = []
                for row in range(SIZE):
                    values = []
                    for column in range(SIZE):
                        x = origin[0] + (column - 3) * dx[0] + (row - 3) * dy[0]
                        y = origin[1] + (column - 3) * dx[1] + (row - 3) * dy[1]
                        votes = [0, 0]
                        for offset_y in (-.16, 0, .16):
                            for offset_x in (-.16, 0, .16):
                                sx = int(x + offset_x * dx[0] + offset_y * dy[0])
                                sy = int(y + offset_x * dx[1] + offset_y * dy[1])
                                if 0 <= sx < width and 0 <= sy < height:
                                    bit = binary[sy * width + sx]
                                    if bit >= 0: votes[bit] += 1
                        values.append(0 if votes[0] >= 6 else 1 if votes[1] >= 6 else None)
                    matrix.append(values)
                try:
                    decoded.add(decode_matrix(matrix))
                except ValueError:
                    continue
                if len(decoded) > 1:
                    return None
    return next(iter(decoded)) if len(decoded) == 1 else None
