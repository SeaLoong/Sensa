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

AVATAR_ROOT_CENTER = (0.0, 1.0, 0.0)
AVATAR_ROOT_HALF_RANGE = 1.5
REGISTRATION_SCHEMA = 'sensa.shader-capture.v1'


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


def decode_pixels(pixels, width, height):
    if width < 64 or height < 32 or len(pixels) != width * height:
        raise ValueError('Expected a complete 16 x 8 grid, at least 64 x 32 pixels')
    for flip in (True, False):
        values = bytearray(16)
        for column in range(16):
            for row in range(8):
                x = int((column + .5) * width / 16)
                y = int(((7 - row if flip else row) + .5) * height / 8)
                samples = [pixels[(y + dy) * width + x + dx][:3]
                           for dy in (-1, 0, 1) for dx in (-1, 0, 1)]
                # Read every color channel; a bright red/blue overlay is not a white cell.
                channels = [value for pixel in samples for value in pixel]
                if any(len(pixel) != 3 or max(pixel) - min(pixel) > 20 for pixel in samples):
                    break
                if min(channels) > 215:
                    values[column] |= 1 << row
                elif max(channels) >= 40:
                    break
            else:
                continue
            break
        else:
            header_valid = values[:3] == b'SN\x01' and values[3] in (1, 3)
            if header_valid and binascii.crc_hqx(values[:14], 0xffff) == int.from_bytes(values[14:], 'little'):
                xyz = [int.from_bytes(values[i:i+2], 'little') / 65535 * 2 - 1 for i in (6, 8, 10)]
                sample = {'frame': int.from_bytes(values[4:6], 'little'), 'xyz': xyz}
                producer = int.from_bytes(values[12:14], 'little')
                if values[3] & 2:
                    if producer == 0:
                        raise ValueError('Native root telemetry requires a nonzero producer ID')
                    sample.update(producerId=producer, coordinateFrame='AvatarRootLocal',
                                  xyz=[center + value * AVATAR_ROOT_HALF_RANGE
                                       for center, value in zip(AVATAR_ROOT_CENTER, xyz)])
                elif producer:
                    sample['producerId'] = producer
                return sample
    raise ValueError('Invalid telemetry header, source validity, cell alignment or CRC')


def capture_registration(region, producer_id):
    if not isinstance(region, (list, tuple)) or len(region) != 4 or any(type(value) is not int for value in region):
        raise ValueError('Registration requires four integer physical-pixel bounds')
    if region[2] < 64 or region[3] < 32 or region[2] > 8192 or region[3] > 8192:
        raise ValueError('Capture rectangle must be 64..8192 by 32..8192 physical pixels')
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
        payload = tuple(sample['xyz']) if 'xyz' in sample else None
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
                self.invalidate('frame ID reused with different coordinates')
            return self.phase == 2
        self.last, self.changed_at, self.payload = frame, now, payload
        self.phase = min(2, self.phase + 1)
        self.reason = None if self.phase == 2 else 'waiting for a second progressing frame'
        return self.phase == 2


def osc_string(value):
    data = value.encode('ascii') + b'\0'
    return data + b'\0' * (-len(data) % 4)


def osc_bundle(sample, valid, producer_id=None, profile=None):
    producer_id = (sample or {}).get('producerId', 0) if producer_id is None else producer_id
    profile = int((sample or {}).get('coordinateFrame') == 'AvatarRootLocal') if profile is None else int(profile)
    values = [('Valid', float(valid))]
    if valid:
        values += [('Frame', sample['frame'])] + list(zip('XYZ', sample['xyz']))
    values += [('Producer', producer_id), ('Profile', profile)]
    result = osc_string('#bundle') + struct.pack('!Q', 1)
    for name, value in values:
        packet = osc_string('/avatar/parameters/Sensa/Shader/v1/' + str(producer_id) + '/' + name) + osc_string(',f') + struct.pack('!f', value)
        result += struct.pack('!I', len(packet)) + packet
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--image', type=Path, help='PNG exported by the Unity lab; can be updated while watching')
    source.add_argument('--region', nargs=4, type=int, metavar=('LEFT', 'TOP', 'WIDTH', 'HEIGHT'), help='Explicit physical-pixel desktop rectangle; requires Pillow ImageGrab')
    source.add_argument('--registration', type=Path, help='Load an explicitly selected ROI and producer registration')
    parser.add_argument('--producer-id', type=int, help='Pin the producer ID; required for screen capture sent to OSC')
    parser.add_argument('--save-registration', type=Path, help='Save the explicit region and producer after a valid native-root decode')
    parser.add_argument('--port', type=int, help='Explicit localhost OSC port; omit to decode only')
    parser.add_argument('--watch', action='store_true')
    parser.add_argument('--timeout', type=float, default=.35)
    parser.add_argument('--duration', type=float, default=30)
    args = parser.parse_args()
    if args.registration:
        try:
            registration = load_registration(args.registration)
            if args.producer_id is not None and args.producer_id != registration['producerId']:
                parser.error('Producer ID differs from the explicit registration')
            args.region, args.producer_id = registration['region'], registration['producerId']
        except (OSError, ValueError) as error:
            parser.error(str(error))
    if args.port is not None and not 1 <= args.port <= 65535: parser.error('Invalid port')
    if not .05 <= args.timeout <= 5 or not 0 < args.duration <= 3600: parser.error('Invalid time limit')
    if args.producer_id is not None and not 1 <= args.producer_id <= 65535: parser.error('Invalid producer ID')
    if args.region:
        if args.region[2] < 64 or args.region[3] < 32 or args.region[2] > 8192 or args.region[3] > 8192:
            parser.error('Invalid capture rectangle size')
        if args.port and args.producer_id is None:
            parser.error('Screen-to-OSC requires --producer-id or --registration')
    if args.save_registration and (not args.region or args.producer_id is None):
        parser.error('Saving registration requires an explicit region and producer ID')
    from PIL import Image, ImageGrab
    freshness = Freshness(args.timeout, args.producer_id)
    registration_saved = False
    started = time.monotonic()
    last_status = None
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
        def emit(sample, valid):
            producer, coordinate_frame = freshness.identity or (args.producer_id or 0,
                'AvatarRootLocal' if args.producer_id is not None else 'DiagnosticUnit')
            udp.sendto(osc_bundle(sample, valid, producer, coordinate_frame == 'AvatarRootLocal'), ('127.0.0.1', args.port))
        try:
            while True:
                sample, valid, error = None, False, None
                try:
                    if args.image:
                        with open_frame(args.image) as frame_file, Image.open(frame_file) as source_image:
                            image = source_image.convert('RGB')
                    else:
                        x, y, w, h = args.region
                        image = ImageGrab.grab(bbox=(x, y, x+w, y+h), all_screens=True).convert('RGB')
                        if image.size != (w, h):
                            raise ValueError('Captured size differs from the registered physical-pixel rectangle')
                    sample = decode_pixels(list(image.get_flattened_data()), *image.size)
                    validate_source(sample, args.producer_id)
                    if args.save_registration and not registration_saved:
                        if sample.get('coordinateFrame') != 'AvatarRootLocal':
                            raise ValueError('Registration requires a native avatar-root producer')
                        args.save_registration.write_text(json.dumps(capture_registration(args.region, args.producer_id), indent=2) + '\n', encoding='utf-8')
                        registration_saved = True
                    valid = freshness.accept(sample, time.monotonic()) if args.watch or args.port else True
                    if not valid: error = freshness.reason
                except (OSError, ValueError) as ex:
                    freshness.invalidate()
                    error = str(ex)
                if args.port: emit(sample, valid)
                status = (valid, error)
                if not args.watch or status != last_status: print(json.dumps({'valid': valid, 'sample': sample, 'error': error}), flush=True)
                last_status = status
                if not args.watch or time.monotonic() - started >= args.duration: break
                time.sleep(1/30)
        finally:
            if args.port: emit(None, False)


if __name__ == '__main__': main()
