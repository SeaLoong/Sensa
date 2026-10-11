"""Analyze an explicitly exported Unity GPU model capture offline; never sends OSC or controls devices."""
import argparse
import json
import math
from pathlib import Path


def vector(value):
    if not isinstance(value, dict):
        raise ValueError('Expected xyz vector')
    result = tuple(value.get(axis) for axis in 'xyz')
    if any(type(v) not in (int, float) or not math.isfinite(v) or abs(v) > 1e6 for v in result):
        raise ValueError('Invalid or unbounded vector')
    return result


def subtract(a, b):
    return tuple(x - y for x, y in zip(a, b))


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def length(a):
    return math.sqrt(dot(a, a))


def analyze(data):
    if data.get('schema') != 'sensa.sps-gpu-model.v1' or data.get('valid') is not True:
        raise ValueError('Unsupported schema or invalid GPU capture')
    points = data.get('centerline', [])
    strength = data.get('firstSegmentStrength', [])
    world_length = data.get('worldLength')
    if type(world_length) not in (int, float) or not math.isfinite(world_length) or not .001 < world_length < 10:
        raise ValueError('Invalid model length')
    if len(points) != 33 or len(strength) != 33:
        raise ValueError('Expected exactly 33 ordered centerline samples')
    if any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 1 for v in strength):
        raise ValueError('Invalid deformation strength')
    points = [vector(p) for p in points]
    origin = vector(data.get('entryPosition'))
    normal = vector(data.get('entryNormal'))
    if abs(length(normal) - 1) > .01:
        raise ValueError('Entry normal must be unit length')
    normal = tuple(v / length(normal) for v in normal)
    distances = [dot(subtract(p, origin), normal) for p in points]
    segments = [length(subtract(b, a)) for a, b in zip(points, points[1:])]
    result = {'diagnosticOnly': True, 'usable': False, 'reason': '',
              'polylineLengthMeters': sum(segments), 'minimumFirstSegmentStrength': min(strength)}
    # This is the unblended centerline. Partial blend must not be presented as the visible mesh.
    if min(strength) < .999:
        result['reason'] = 'Partial deformation blend: model centerline is not the rendered centerline'
        return result
    epsilon = 1e-6
    intersections = []
    for i, (a, b) in enumerate(zip(distances, distances[1:])):
        if abs(a) <= epsilon and abs(b) <= epsilon:
            result['reason'] = 'A segment lies in the entry plane; crossing is not unique'
            return result
        if a < -epsilon and b > epsilon or a > epsilon and b < -epsilon:
            intersections.append(i + (-a / (b - a)))
    # Count exact sampled crossings once. Tangencies and endpoint contact do not prove entry.
    for i, distance in enumerate(distances):
        if abs(distance) <= epsilon:
            if i == 0 or i == len(points) - 1 or distances[i - 1] * distances[i + 1] >= 0:
                result['reason'] = 'Endpoint/tangent contact; no unique transversal entry'
                return result
            intersections.append(float(i))
    if len(intersections) != 1 or distances[0] >= -epsilon or distances[-1] <= epsilon:
        result['reason'] = 'No unique forward crossing of the entry plane'
        return result
    crossing = intersections[0]
    index = int(crossing)
    t = crossing - index
    hit = tuple(a + (b - a) * t for a, b in zip(points[index], points[index + 1]))
    result.update(usable=True, reason='Single model-plane crossing; not a calibrated device command',
                  materialFractionAfterPlane=1 - crossing / 32,
                  sampledArcAfterPlaneMeters=segments[index] * (1 - t) + sum(segments[index + 1:]),
                  entryPlaneOffsetMeters=length(subtract(hit, origin)))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture', type=Path)
    args = parser.parse_args()
    try:
        if args.capture.stat().st_size > 65536:
            raise ValueError('Capture exceeds 64 KiB')
        result = analyze(json.loads(args.capture.read_text(encoding='utf-8')))
    except (OSError, ValueError, TypeError, AttributeError) as error:
        parser.exit(2, f'Invalid capture: {error}\n')
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
