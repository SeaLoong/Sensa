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


def analyze(data, aperture_radius=None, min_incidence_degrees=0):
    if aperture_radius is not None and (type(aperture_radius) not in (int, float) or not math.isfinite(aperture_radius) or aperture_radius <= 0):
        raise ValueError('Aperture radius must be positive and finite')
    if type(min_incidence_degrees) not in (int, float) or not math.isfinite(min_incidence_degrees) or not 0 <= min_incidence_degrees < 90:
        raise ValueError('Minimum incidence must be between 0 and 90 degrees (exclusive upper bound)')
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
    coarse_length = sum(length(subtract(points[i+2], points[i])) for i in range(0, 32, 2))
    result['coarseToFineArcDifferenceMeters'] = max(0, sum(segments) - coarse_length)
    # This comparison reveals sampling sensitivity, not a bound on the unsampled curve's error.
    if min(segments) <= 1e-8:
        result['reason'] = 'Collapsed centerline segment; local direction is undefined'
        return result
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
    tangent = tuple(v / segments[index] for v in subtract(points[index + 1], points[index]))
    incidence = math.degrees(math.asin(max(0, min(1, dot(tangent, normal)))))
    offset = length(subtract(hit, origin))
    after = segments[index] * (1 - t) + sum(segments[index + 1:])
    result.update(usable=True, reason='Single model-plane crossing; not a calibrated device command',
                  materialFractionAfterPlane=1 - crossing / 32,
                  sampledArcAfterPlaneMeters=after,
                  sampledArcFractionAfterPlane=after / sum(segments),
                  entryTangent=dict(zip('xyz', tangent)), incidenceDegrees=incidence,
                  entryPlaneOffsetMeters=offset)
    if aperture_radius is not None and offset > aperture_radius:
        result.update(usable=False, reason='Crossing is outside the explicitly configured aperture')
    elif incidence < min_incidence_degrees:
        result.update(usable=False, reason='Crossing is too shallow for the configured incidence threshold')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture', type=Path)
    parser.add_argument('--aperture-radius', type=float, help='Optional calibrated entry radius in world meters')
    parser.add_argument('--min-incidence-degrees', type=float, default=0, help='Minimum chord angle to entry plane; 90 is perpendicular')
    args = parser.parse_args()
    try:
        if args.capture.stat().st_size > 65536:
            raise ValueError('Capture exceeds 64 KiB')
        result = analyze(json.loads(args.capture.read_text(encoding='utf-8')), args.aperture_radius, args.min_incidence_degrees)
    except (OSError, ValueError, TypeError, AttributeError) as error:
        parser.exit(2, f'Invalid capture: {error}\n')
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
