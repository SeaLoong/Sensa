"""Synthetic Pose v1 UDP fixture. Explicit port required; never enables outputs."""
import argparse
import math
import socket
import struct
import time

def osc_string(value):
    data = value.encode('ascii') + b'\0'
    return data + b'\0' * (-len(data) % 4)

def samples(root, tip, side, instance='Demo', party='Others', radius=.001):
    result = []
    for marker, point in [('Root', root), ('Tip', tip), ('Side', side)]:
        for i in range(8):
            anchor = tuple(.06 if i & (1 << axis) else -.06 for axis in range(3))
            distance = math.sqrt(sum((point[k] - anchor[k]) ** 2 for k in range(3)))
            value = max(0, min(1, 1 - max(0, distance - radius) / .35))
            result.append((f'Sensa/Pose/v1/{instance}/{party}/{marker}/A{i}', value))
    return result

def bundle(values):
    result = osc_string('#bundle') + struct.pack('!Q', 1)
    for path, value in values:
        packet = osc_string('/avatar/parameters/' + path) + osc_string(',f') + struct.pack('!f', value)
        result += struct.pack('!i', len(packet)) + packet
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', required=True, type=int)
    parser.add_argument('--duration', type=float, default=10)
    parser.add_argument('--static', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535: parser.error('Invalid UDP port')
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
        start = time.monotonic()
        while time.monotonic() - start < args.duration:
            t = 0 if args.static else time.monotonic() - start
            angle = math.radians(20)
            axis = (math.sin(angle), 0, math.cos(angle))
            depth = .55 + .2 * math.sin(t * 1.5)
            crossing = (.022, .008, 0)
            root = tuple(crossing[k] - (1 - depth) * .18 * axis[k] for k in range(3))
            tip = tuple(crossing[k] + depth * .18 * axis[k] for k in range(3))
            side = (root[0] + .03 * axis[2], root[1], root[2] - .03 * axis[0])
            udp.sendto(bundle(samples(root, tip, side)), ('127.0.0.1', args.port))
            time.sleep(1 / 30)

if __name__ == '__main__': main()
