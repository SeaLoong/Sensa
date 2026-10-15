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
    if width < 64 or height < 32:
        raise ValueError('Expected a complete 16 x 8 grid, at least 64 x 32 pixels')
    for flip in (True, False):
        values = bytearray(16)
        for column in range(16):
            for row in range(8):
                x = int((column + .5) * width / 16)
                y = int(((7 - row if flip else row) + .5) * height / 8)
                # Require a uniform central patch; reject blended or shifted cells.
                samples = [pixels[(y + dy) * width + x + dx][0] for dy in (-1, 0, 1) for dx in (-1, 0, 1)]
                if min(samples) > 215:
                    values[column] |= 1 << row
                elif max(samples) >= 40:
                    break
            else:
                continue
            break
        else:
            if values[:4] == b'SN\x01\x01' and binascii.crc_hqx(values[:14], 0xffff) == int.from_bytes(values[14:], 'little'):
                xyz = [int.from_bytes(values[i:i+2], 'little') / 65535 * 2 - 1 for i in (6, 8, 10)]
                return {'frame': int.from_bytes(values[4:6], 'little'), 'xyz': xyz}
    raise ValueError('Invalid telemetry header, cell alignment or CRC')


class Freshness:
    def __init__(self, timeout=.35):
        self.timeout = timeout
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


def osc_bundle(sample, valid):
    values = [('Valid', float(valid))]
    if valid:
        values += [('Frame', sample['frame'])] + list(zip('XYZ', sample['xyz']))
    result = osc_string('#bundle') + struct.pack('!Q', 1)
    for name, value in values:
        packet = osc_string('/avatar/parameters/Sensa/Lab/Shader/' + name) + osc_string(',f') + struct.pack('!f', value)
        result += struct.pack('!I', len(packet)) + packet
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--image', type=Path, help='PNG exported by the Unity lab; can be updated while watching')
    source.add_argument('--region', nargs=4, type=int, metavar=('LEFT', 'TOP', 'WIDTH', 'HEIGHT'), help='Exact physical-pixel desktop rectangle; requires Pillow ImageGrab')
    parser.add_argument('--port', type=int, help='Explicit localhost OSC port; omit to decode only')
    parser.add_argument('--watch', action='store_true')
    parser.add_argument('--timeout', type=float, default=.35)
    parser.add_argument('--duration', type=float, default=30)
    args = parser.parse_args()
    if args.port is not None and not 1 <= args.port <= 65535: parser.error('Invalid port')
    if not .05 <= args.timeout <= 5 or not 0 < args.duration <= 3600: parser.error('Invalid time limit')
    if args.region and (args.region[2] < 64 or args.region[3] < 32): parser.error('Capture region too small')
    from PIL import Image, ImageGrab
    freshness = Freshness(args.timeout)
    started = time.monotonic()
    last_status = None
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
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
                    sample = decode_pixels(list(image.get_flattened_data()), *image.size)
                    valid = freshness.accept(sample, time.monotonic()) if args.watch or args.port else True
                    if not valid: error = freshness.reason
                except (OSError, ValueError) as ex:
                    freshness.invalidate()
                    error = str(ex)
                if args.port: udp.sendto(osc_bundle(sample, valid), ('127.0.0.1', args.port))
                status = (valid, error)
                if not args.watch or status != last_status: print(json.dumps({'valid': valid, 'sample': sample, 'error': error}), flush=True)
                last_status = status
                if not args.watch or time.monotonic() - started >= args.duration: break
                time.sleep(1/30)
        finally:
            if args.port: udp.sendto(osc_bundle(None, False), ('127.0.0.1', args.port))


if __name__ == '__main__': main()
