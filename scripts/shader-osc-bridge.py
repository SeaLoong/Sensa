"""Explicit, local-only diagnostic bridge: Sensa telemetry PNG/screen region -> OSC.
No device connection or automatic output activation. CRC and advancing frame IDs required.
"""
import argparse
import binascii
import json
import math
import os
from pathlib import Path
import socket
import struct
import time

import telemetry_qr

AVATAR_ROOT_CENTER = (0.0, 1.0, 0.0)
AVATAR_ROOT_HALF_RANGE = 2.0
REGISTRATION_SCHEMA = 'sensa.shader-capture.v1'
MAX_REGISTRATIONS = 16
MAX_DECODE_PIXELS = 4_000_000
MAX_SCREENSHOT_PIXELS = 16_000_000


def open_frame(path):
    """Read one frame without blocking an atomic producer rename on Windows."""
    if os.name != 'nt':
        return Path(path).open('rb')
    import ctypes
    from ctypes import wintypes
    import msvcrt
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    create = kernel.CreateFileW
    create.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                       wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    create.restype = wintypes.HANDLE
    close = kernel.CloseHandle
    close.argtypes = [wintypes.HANDLE]
    close.restype = wintypes.BOOL
    # GENERIC_READ, FILE_SHARE_READ | WRITE | DELETE, OPEN_EXISTING.
    # DELETE sharing also permits replacement/rename while this old frame is read.
    # https://learn.microsoft.com/windows/win32/api/fileapi/nf-fileapi-createfilew
    handle = create(str(Path(path).resolve()), 0x80000000, 7, None, 3, 0x80, None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        descriptor = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
    except BaseException:
        close(handle)
        raise
    try:
        return os.fdopen(descriptor, 'rb')
    except BaseException:
        os.close(descriptor)
        raise


NATIVE_COLUMNS = NATIVE_ROWS = telemetry_qr.TOTAL_SIZE
NATIVE_MIN_WIDTH = NATIVE_MIN_HEIGHT = telemetry_qr.TOTAL_SIZE * 4
NATIVE_BASIS_RANGE = 8.0


def _cell(pixels, width, height, x, y, redundant=False):
    x, y = int(x), int(y)
    if not 1 <= x < width - 1 or not 1 <= y < height - 1:
        return None
    votes = [0, 0]
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            pixel = pixels[(y + dy) * width + x + dx]
            if len(pixel) < 3:
                continue
            red, green, blue = pixel[:3]
            if red > 215 and green > 215 and blue > 215 and max(red, green, blue) - min(red, green, blue) <= 20:
                votes[1] += 1
            elif red < 40 and green < 40 and blue < 40 and max(red, green, blue) - min(red, green, blue) <= 20:
                votes[0] += 1
    required = 6 if redundant else 9
    return 0 if votes[0] >= required else 1 if votes[1] >= required else None


def _packet(values, native):
    if len(values) != (32 if native else 16) or values[:3] != b'SN\x01' or values[3] != (3 if native else 1):
        return None
    checksum = binascii.crc32(values[:28]) if native else binascii.crc_hqx(values[:14], 0xffff)
    if checksum != int.from_bytes(values[28:] if native else values[14:], 'little'):
        return None
    xyz = [int.from_bytes(values[i:i+2], 'little') / 65535 * 2 - 1 for i in (6, 8, 10)]
    sample = {'frame': int.from_bytes(values[4:6], 'little'), 'xyz': xyz}
    producer = int.from_bytes(values[12:14], 'little')
    if native:
        if producer == 0:
            raise ValueError('Native root telemetry requires a nonzero producer ID')
        sample.update(producerId=producer, coordinateFrame='AvatarRootLocal',
                      xyz=[center + value * AVATAR_ROOT_HALF_RANGE
                           for center, value in zip(AVATAR_ROOT_CENTER, xyz)])
        basis = struct.unpack_from('<6h', values, 14)
        if -32768 in basis:
            return None
        right, forward = ([value * NATIVE_BASIS_RANGE / 32767 for value in basis[:3]],
                          [value * NATIVE_BASIS_RANGE / 32767 for value in basis[3:]])
        right_size, forward_size = math.sqrt(sum(value * value for value in right)), math.sqrt(sum(value * value for value in forward))
        cross = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2],
                 right[0] * forward[1] - right[1] * forward[0]]
        scale = int.from_bytes(values[26:28], 'little') * NATIVE_BASIS_RANGE / 65535
        if (right_size <= 1e-6 or forward_size <= 1e-6 or scale <= 0
                or math.sqrt(sum(value * value for value in cross)) <= right_size * forward_size * 1e-4):
            return None
        sample.update(right=right, forward=forward, avatarScale=scale)
    elif producer:
        raise ValueError('Diagnostic telemetry requires producer ID zero')
    return sample


def _native_pixels(pixels, width, height):
    packet = telemetry_qr.decode_pixels(pixels, width, height)
    return _packet(packet, native=True) if packet is not None else None


def decode_pixels(pixels, width, height):
    if width < 64 or height < 32 or len(pixels) != width * height:
        raise ValueError('Expected a complete grid: native QR 49 x 49 (196 x 196 px), diagnostic 16 x 8 (64 x 32 px)')
    native = _native_pixels(pixels, width, height)
    if native is not None:
        return native
    # Diagnostic lab images have a separate 16 x 8 layout and can never be
    # interpreted as native input. There is no unframed native fallback.
    for flip in (True, False):
        values = bytearray(16)
        for column in range(16):
            for row in range(8):
                bit = _cell(pixels, width, height, (column + .5) * width / 16,
                            ((7 - row if flip else row) + .5) * height / 8)
                if bit is None:
                    break
                values[column] |= bit << row
            else:
                continue
            break
        else:
            sample = _packet(values, native=False)
            if sample is not None:
                return sample
    raise ValueError('Invalid telemetry QR, correction budget, header, source validity or CRC')


def capture_registration(region, producer_id):
    if not isinstance(region, (list, tuple)) or len(region) != 4 or any(type(value) is not int for value in region):
        raise ValueError('Registration requires four integer physical-pixel bounds')
    if region[2] < NATIVE_MIN_WIDTH or region[3] < NATIVE_MIN_HEIGHT or region[2] > 8192 or region[3] > 8192:
        raise ValueError('Native capture rectangle must be 196..8192 by 196..8192 physical pixels')
    if region[2] * region[3] > MAX_DECODE_PIXELS:
        raise ValueError('Capture regions may contain at most 4 million pixels in total')
    if min(region[:2]) < -(2 ** 31) or max(region[0] + region[2], region[1] + region[3]) > 2 ** 31 - 1:
        raise ValueError('Capture rectangle coordinates must fit within signed 32-bit screen bounds')
    if type(producer_id) is not int or not 1 <= producer_id <= 65535:
        raise ValueError('Registration requires an explicit producer ID from 1..65535')
    return {'schema': REGISTRATION_SCHEMA, 'region': list(region), 'producerId': producer_id,
            'coordinateFrame': 'AvatarRootLocal', 'center': list(AVATAR_ROOT_CENTER),
            'halfRange': AVATAR_ROOT_HALF_RANGE}


def load_registration(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(data, dict) or data.get('schema') != REGISTRATION_SCHEMA:
        raise ValueError('Unsupported capture registration')
    expected = capture_registration(data.get('region', []), data.get('producerId'))
    if any(data.get(key) != expected[key] for key in ('coordinateFrame', 'center', 'halfRange')):
        raise ValueError('Capture registration does not match the avatar-root coordinate profile')
    return expected


def capture_bounds(regions):
    """One physical-pixel screenshot supplies every registered crop in a cycle."""
    if not regions or sum(region[2] * region[3] for region in regions) > MAX_DECODE_PIXELS:
        raise ValueError('Capture regions may contain at most 4 million pixels in total')
    left = min(region[0] for region in regions)
    top = min(region[1] for region in regions)
    right = max(region[0] + region[2] for region in regions)
    bottom = max(region[1] + region[3] for region in regions)
    if right - left > 8192 or bottom - top > 8192:
        raise ValueError('Combined capture rectangle must fit within 8192 by 8192 physical pixels')
    if (right - left) * (bottom - top) > MAX_SCREENSHOT_PIXELS:
        raise ValueError('Combined screenshot may contain at most 16 million pixels')
    return left, top, right, bottom


def load_registrations(paths):
    if not 1 <= len(paths) <= MAX_REGISTRATIONS:
        raise ValueError('Choose between 1 and 16 capture registrations')
    registrations = [load_registration(path) for path in paths]
    if len({entry['producerId'] for entry in registrations}) != len(registrations):
        raise ValueError('Capture registrations must have distinct producer IDs')
    if len({tuple(entry['region']) for entry in registrations}) != len(registrations):
        raise ValueError('Capture registrations must have distinct screen rectangles')
    capture_bounds([entry['region'] for entry in registrations])
    return registrations


def validate_source(sample, producer_id):
    if producer_id is None:
        return
    if sample.get('producerId') != producer_id:
        raise ValueError('Captured producer does not match the explicit producer ID')
    if sample.get('coordinateFrame') != 'AvatarRootLocal':
        raise ValueError('Explicit capture requires the native avatar-root coordinate profile')


class Freshness:
    def __init__(self, timeout=.35, producer_id=None):
        self.timeout = timeout
        self.expected_producer = producer_id
        self.identity = None
        self.last = None
        self.changed_at = -math.inf
        self.payload = None
        self.phase = 0
        self.reason = 'waiting for two progressing frames'

    def invalidate(self, reason='invalid telemetry'):
        # Keep the last sequence so an old/frozen frame cannot become a new
        # baseline just because capture failed or the watchdog expired.
        self.phase = 0
        self.reason = reason

    def accept(self, sample, now):
        producer = sample.get('producerId', 0)
        identity = (producer, sample.get('coordinateFrame', 'DiagnosticUnit'))
        try:
            validate_source(sample, self.expected_producer)
        except ValueError as error:
            self.invalidate(str(error))
            return False
        if self.identity is None:
            self.identity = identity
        elif identity != self.identity:
            self.invalidate('producer identity or coordinate frame changed; select the source explicitly')
            return False
        frame = sample['frame']
        payload = ((tuple(sample['xyz']), tuple(sample.get('right', [])), tuple(sample.get('forward', [])), sample.get('avatarScale'))
                   if 'xyz' in sample else None)
        if self.phase and now - self.changed_at > self.timeout:
            self.invalidate('frozen frame')
        if self.last is None:
            self.last, self.changed_at = frame, now
            self.payload, self.phase = payload, 1
            return False
        advance = (frame - self.last) & 65535
        if advance >= 32768:
            self.invalidate('reordered frame; restart bridge if the producer reset')
            return False
        if not advance:
            if payload != self.payload:
                self.invalidate('frame ID reused with different payload')
            return self.phase == 2
        self.last, self.changed_at, self.payload = frame, now, payload
        self.phase = min(2, self.phase + 1)
        self.reason = None if self.phase == 2 else 'waiting for a second progressing frame'
        return self.phase == 2


def osc_string(value):
    data = value.encode('ascii') + b'\0'
    return data + b'\0' * (-len(data) % 4)


def osc_bundle(sample, valid, producer_id=None, native=None):
    producer_id = (sample or {}).get('producerId', 0) if producer_id is None else producer_id
    native = (sample or {}).get('coordinateFrame') == 'AvatarRootLocal' if native is None else native
    if native:
        if type(producer_id) is not int or not 1 <= producer_id <= 65535:
            raise ValueError('Native OSC requires a nonzero producer ID')
        if valid:
            validate_source(sample, producer_id)
        prefix = 'Sensa/Shader/' + str(producer_id)
    else:
        prefix = 'Sensa/Diagnostics/Shader/0'
    values = []
    if valid:
        values = [('Frame', sample['frame'])] + list(zip('XYZ', sample['xyz']))
        if native:
            values += list(zip(('RightX', 'RightY', 'RightZ'), sample['right']))
            values += list(zip(('ForwardX', 'ForwardY', 'ForwardZ'), sample['forward']))
            values.append(('AvatarScale', sample['avatarScale']))
    # Valid is the commit marker; invalidation never republishes old coordinates.
    values.append(('Valid', float(valid)))
    result = osc_string('#bundle') + struct.pack('!Q', 1)
    for name, value in values:
        packet = osc_string('/avatar/parameters/' + prefix + '/' + name) + osc_string(',f') + struct.pack('!f', value)
        result += struct.pack('!I', len(packet)) + packet
    return result


class CaptureSource:
    """One registered producer keeps its own identity, timeout and recovery state."""
    def __init__(self, producer_id=None, region=None, timeout=.35):
        self.producer_id, self.region = producer_id, region
        self.freshness = Freshness(timeout, producer_id)

    def reject(self, error):
        self.freshness.invalidate(str(error))
        return {'producerId': self.producer_id, 'valid': False, 'sample': None, 'error': str(error)}

    def decode(self, pixels, width, height, now, require_freshness=True):
        try:
            if self.region and (width, height) != tuple(self.region[2:]):
                raise ValueError('Captured size differs from the registered physical-pixel rectangle')
            sample = decode_pixels(pixels, width, height)
            validate_source(sample, self.producer_id)
            valid = self.freshness.accept(sample, now) if require_freshness else True
            return {'producerId': self.producer_id, 'valid': valid, 'sample': sample,
                    'error': None if valid else self.freshness.reason}
        except (OSError, ValueError) as error:
            return self.reject(error)

    def bundle(self, status):
        producer, coordinate_frame = self.freshness.identity or (self.producer_id or 0,
            'AvatarRootLocal' if self.producer_id is not None else 'DiagnosticUnit')
        return osc_bundle(status.get('sample'), status['valid'], producer, coordinate_frame == 'AvatarRootLocal')

    def expire(self, status, now):
        if status['valid'] and now - self.freshness.changed_at > self.freshness.timeout:
            return self.reject('captured frame expired before delivery')
        return status


def capture_bundle(sources, statuses):
    if not sources or len(sources) != len(statuses) or len(sources) > MAX_REGISTRATIONS:
        raise ValueError('Each capture source requires one status')
    # A single datagram/socket preserves the OSC transport source for calculations
    # combining producers. Each twelve-field packet retains its own Valid commit.
    return osc_string('#bundle') + struct.pack('!Q', 1) + b''.join(
        source.bundle(status)[16:] for source, status in zip(sources, statuses))


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--image', type=Path, help='PNG exported by the Unity lab; can be updated while watching')
    source.add_argument('--region', nargs=4, type=int, metavar=('LEFT', 'TOP', 'WIDTH', 'HEIGHT'), help='Explicit physical-pixel desktop rectangle; requires Pillow ImageGrab')
    source.add_argument('--registration', type=Path, action='append', help='Load a registered ROI and producer; repeat for up to 16 tiles sharing one OSC source')
    parser.add_argument('--producer-id', type=int, help='Pin the producer ID; required for screen capture sent to OSC')
    parser.add_argument('--save-registration', type=Path, help='Save the explicit region and producer after a valid native-root decode')
    parser.add_argument('--port', type=int, help='Explicit localhost OSC port; omit to decode only')
    parser.add_argument('--watch', action='store_true')
    parser.add_argument('--timeout', type=float, default=.35)
    parser.add_argument('--duration', type=float, default=30)
    args = parser.parse_args(argv)
    registrations = []
    if args.registration:
        try:
            registrations = load_registrations(args.registration)
            if len(registrations) > 1 and args.producer_id is not None:
                parser.error('Each registration supplies its own producer ID; omit --producer-id for multiple tiles')
            if args.producer_id is not None and args.producer_id != registrations[0]['producerId']:
                parser.error('Producer ID differs from the explicit registration')
            if len(registrations) == 1:
                args.region, args.producer_id = registrations[0]['region'], registrations[0]['producerId']
        except (OSError, ValueError) as error:
            parser.error(str(error))
    if args.port is not None and not 1 <= args.port <= 65535: parser.error('Invalid port')
    if not .05 <= args.timeout <= 5 or not 0 < args.duration <= 3600: parser.error('Invalid time limit')
    if args.producer_id is not None and not 1 <= args.producer_id <= 65535: parser.error('Invalid producer ID')
    if args.region:
        if args.region[2] < NATIVE_MIN_WIDTH or args.region[3] < NATIVE_MIN_HEIGHT or args.region[2] > 8192 or args.region[3] > 8192:
            parser.error('Invalid capture rectangle size')
        try:
            capture_registration(args.region, args.producer_id or 1)
        except ValueError as error:
            parser.error(str(error))
        if args.port and args.producer_id is None:
            parser.error('Screen-to-OSC requires --producer-id or --registration')
    if args.save_registration and (not args.region or args.producer_id is None):
        parser.error('Saving registration requires one explicit region and producer ID')
    args.sources = ([CaptureSource(entry['producerId'], entry['region'], args.timeout) for entry in registrations]
                    if registrations else [CaptureSource(args.producer_id, args.region, args.timeout)])
    return args


def main():
    args = parse_args()
    from PIL import Image, ImageGrab
    registration_saved = False
    started = time.monotonic()
    last_status = None
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
        def emit(statuses):
            udp.sendto(capture_bundle(args.sources, statuses), ('127.0.0.1', args.port))
        try:
            while True:
                statuses = []
                captured_at = time.monotonic()
                try:
                    if args.image:
                        with open_frame(args.image) as frame_file, Image.open(frame_file) as source_image:
                            if source_image.size[0] * source_image.size[1] > MAX_DECODE_PIXELS:
                                raise ValueError('Capture image may contain at most 4 million pixels')
                            image = source_image.convert('RGB')
                        try:
                            statuses.append(args.sources[0].decode(list(image.get_flattened_data()), *image.size, captured_at,
                                                                  require_freshness=args.watch or args.port is not None))
                        finally:
                            image.close()
                    else:
                        bounds = capture_bounds([source.region for source in args.sources])
                        image = ImageGrab.grab(bbox=bounds, all_screens=True).convert('RGB')
                        try:
                            if image.size != (bounds[2] - bounds[0], bounds[3] - bounds[1]):
                                raise ValueError('Captured size differs from the registered physical-pixel rectangle')
                            for source in args.sources:
                                x, y, w, h = source.region
                                try:
                                    with image.crop((x - bounds[0], y - bounds[1], x + w - bounds[0], y + h - bounds[1])) as crop:
                                        statuses.append(source.decode(list(crop.get_flattened_data()), *crop.size, captured_at,
                                                                      require_freshness=args.watch or args.port is not None))
                                except (OSError, ValueError) as error:
                                    statuses.append(source.reject(error))
                        finally:
                            image.close()
                    if args.watch or args.port is not None:
                        delivery_time = time.monotonic()
                        statuses = [source.expire(status, delivery_time) for source, status in zip(args.sources, statuses)]
                    if args.save_registration and not registration_saved and statuses[0]['sample'] is not None:
                        if statuses[0]['sample'].get('coordinateFrame') != 'AvatarRootLocal':
                            raise ValueError('Registration requires a native avatar-root producer')
                        args.save_registration.write_text(json.dumps(capture_registration(args.region, args.producer_id), indent=2) + '\n', encoding='utf-8')
                        registration_saved = True
                except (OSError, ValueError) as ex:
                    statuses = [source.reject(ex) for source in args.sources]
                if args.port: emit(statuses)
                status = tuple((entry['valid'], entry['error']) for entry in statuses)
                if not args.watch or status != last_status:
                    print(json.dumps(statuses[0] if len(statuses) == 1 else {'sources': statuses}), flush=True)
                last_status = status
                if not args.watch or time.monotonic() - started >= args.duration: break
                time.sleep(1/30)
        finally:
            if args.port: emit([source.reject('capture stopped') for source in args.sources])


if __name__ == '__main__': main()
