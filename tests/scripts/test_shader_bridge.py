"""Telemetry framing, freshness and file ownership contracts; no capture or socket.
遥测帧、新鲜度和文件所有权契约；不进行采集或网络连接。
"""
import binascii
import contextlib
import hashlib
import io
import math
import random
import json
from pathlib import Path
import subprocess
import sys
import struct
import types
import unittest
from unittest import mock

from lab_contract_fixtures import LabFixture, load_script

bridge = load_script('shader-osc-bridge')
smoke = load_script('smoke-shader-bridge')


def pixels(frame=256, xyz=(.25, -.5, .75), width=320, height=256, flags=1, producer_id=0,
           right=(1, 0, 0), forward=(0, 0, 1), avatar_scale=1):
    packet = bytearray(b'SN\x01') + bytes([flags]) + frame.to_bytes(2, 'little')
    if flags & 2:
        xyz = [(value - center) / 2 for value, center in zip(xyz, (0, 1, 0))]
    for value in xyz:
        packet.extend(round((value + 1) / 2 * 65535).to_bytes(2, 'little'))
    packet.extend(producer_id.to_bytes(2, 'little'))
    if flags & 2:
        packet.extend(struct.pack('<6h', *(round(value / 8 * 32767) for value in (*right, *forward))))
        packet.extend(round(avatar_scale / 8 * 65535).to_bytes(2, 'little'))
        packet.extend(binascii.crc32(packet).to_bytes(4, 'little'))
        return bridge.telemetry_qr.render(packet, width, height)
    else:
        packet.extend(binascii.crc_hqx(packet, 0xffff).to_bytes(2, 'little'))
        def value(x, y):
            return packet[x * 16 // width] & (1 << (7 - y * 8 // height))
    return [(255, 255, 255) if value(x, y) else (0, 0, 0)
            for y in range(height) for x in range(width)]


def osc_values(bundle):
    if bundle[:16] != b'#bundle\0' + struct.pack('!Q', 1):
        raise AssertionError('Expected an immediate OSC bundle')
    values, offset = {}, 16
    while offset < len(bundle):
        size = struct.unpack_from('!I', bundle, offset)[0]
        packet = bundle[offset + 4:offset + 4 + size]
        end = packet.index(0)
        address = packet[:end].decode('ascii')
        arguments = (end + 4) // 4 * 4
        if packet[arguments:arguments + 4] != b',f\0\0':
            raise AssertionError('Expected one float argument')
        values[address] = struct.unpack_from('!f', packet, arguments + 4)[0]
        offset += 4 + size
    if offset != len(bundle):
        raise AssertionError('Invalid OSC packet size')
    return values


class TelemetryDecodeContracts(unittest.TestCase):
    def test_real_packet_layout_sequence_quantization_orientation_and_scaling(self):
        for frame in (0, 256, 65535):
            for width, height in ((64, 32), (256, 128), (512, 256)):
                with self.subTest(frame=frame, size=(width, height)):
                    image = pixels(frame=frame, width=width, height=height)
                    expected = bridge.decode_pixels(image, width, height)
                    self.assertEqual(expected['frame'], frame)
                    for actual, target in zip(expected['xyz'], (.25, -.5, .75)):
                        self.assertAlmostEqual(actual, target, delta=.00004)
                    flipped = [pixel for y in reversed(range(height)) for pixel in image[y * width:(y + 1) * width]]
                    self.assertEqual(bridge.decode_pixels(flipped, width, height), expected)

    def test_uniform_crc_corruption_and_blended_cells_are_rejected(self):
        image = pixels(width=256, height=128)
        for y in range(16):
            for x in range(96, 112):
                image[y * 256 + x] = tuple(255 - value for value in image[y * 256 + x])
        with self.assertRaises(ValueError):
            bridge.decode_pixels(image, 256, 128)
        image = pixels(width=256, height=128)
        image[8 * 256 + 8] = (128, 128, 128)
        with self.assertRaises(ValueError):
            bridge.decode_pixels(image, 256, 128)

    def test_incomplete_grid_dimensions_are_rejected(self):
        for width, height in ((63, 32), (64, 31), (0, 0)):
            with self.subTest(size=(width, height)), self.assertRaises(ValueError):
                bridge.decode_pixels([], width, height)


class TelemetryFreshnessContracts(unittest.TestCase):
    def assert_sequence(self, samples):
        freshness = bridge.Freshness(.35)
        for frame, moment, expected in samples:
            with self.subTest(frame=frame, moment=moment):
                self.assertEqual(freshness.accept({'frame': frame}, moment), expected)
        return freshness

    def test_initial_frozen_reordered_and_wrapped_frames_follow_the_same_rule(self):
        self.assert_sequence(((65535, 0, False), (65535, .1, False), (0, .2, True),
                              (65534, .3, False), (0, .6, False), (1, .7, False), (2, .8, True)))

    def test_a_long_capture_gap_requires_two_new_progressing_frames(self):
        self.assert_sequence(((10, 0, False), (11, .1, True), (12, 2, False),
                              (12, 2.1, False), (13, 2.2, True)))

    def test_payload_identity_and_capture_error_cannot_revalidate_a_duplicate(self):
        freshness = bridge.Freshness(.35)
        for frame, value, moment, expected in (
                (1, .06, 0, False), (2, .06, .01, True), (2, .07, .02, False),
                (2, .06, .03, False), (3, .06, .04, False), (4, .06, .05, True)):
            with self.subTest(frame=frame, moment=moment):
                self.assertEqual(freshness.accept({'frame': frame, 'xyz': [value, 0, .12]}, moment), expected)
        freshness.invalidate()
        for frame, moment, expected in ((4, .06, False), (5, .07, False), (6, .08, True)):
            self.assertEqual(freshness.accept({'frame': frame, 'xyz': [.06, 0, .12]}, moment), expected)


class OscTelemetryContracts(unittest.TestCase):
    def test_valid_output_has_an_explicit_gate_frame_and_xyz_float_values(self):
        values = osc_values(bridge.osc_bundle({'frame': 65535, 'xyz': [.25, -.5, .75]}, True))
        prefix = '/avatar/parameters/Sensa/Diagnostics/Shader/0/'
        self.assertEqual(values, {prefix + 'Valid': 1, prefix + 'Frame': 65535,
                                  prefix + 'X': .25, prefix + 'Y': -.5, prefix + 'Z': .75})
        self.assertFalse(any('/Sensa/Shader/' in path for path in values))
        self.assertEqual(list(values), [prefix + name for name in ('Frame', 'X', 'Y', 'Z', 'Valid')])

    def test_invalid_output_has_only_a_zero_commit_even_when_old_coordinates_exist(self):
        prefix = '/avatar/parameters/Sensa/Diagnostics/Shader/0/'
        for sample in (None, {'frame': 1, 'xyz': [.25, -.5, .75]}):
            self.assertEqual(osc_values(bridge.osc_bundle(sample, False)),
                             {prefix + 'Valid': 0})


class FrameFileOwnershipContracts(LabFixture):
    def test_atomic_replacement_keeps_each_open_reader_on_its_own_generation(self):
        current = self.write(self.root / '帧.png', 'old frame')
        pending = self.root / 'next.png'
        with bridge.open_frame(current) as original:
            for index in range(20):
                payload = ('new frame ' + str(index)).encode()
                pending.write_bytes(payload)
                smoke.replace_frame(pending, current)
                with bridge.open_frame(current) as latest:
                    self.assertEqual(latest.read(), payload)
            self.assertEqual(original.read(), b'old frame')
        current.unlink()

    def test_missing_frame_raises_without_creating_a_file(self):
        missing = self.root / 'missing.png'
        with self.assertRaises(OSError):
            bridge.open_frame(missing)
        self.assertFalse(missing.exists())


class MultipleCaptureContracts(LabFixture):
    def registration(self, name, producer, region):
        return self.write(self.root / name, json.dumps(bridge.capture_registration(region, producer)))

    def test_repeated_registrations_share_one_capture_bounds_with_negative_monitor_coordinates(self):
        first = self.registration('surface.json', 42, [-400, 100, 196, 196])
        second = self.registration('target.json', 43, [0, -200, 294, 294])
        args = bridge.parse_args(['--registration', str(first), '--registration', str(second), '--port', '19001'])
        self.assertEqual([source.producer_id for source in args.sources], [42, 43])
        self.assertEqual(bridge.capture_bounds([source.region for source in args.sources]), (-400, -200, 294, 296))
        self.assertIsNot(args.sources[0].freshness, args.sources[1].freshness)
        single = bridge.parse_args(['--registration', str(first), '--producer-id', '42'])
        self.assertEqual(single.region, [-400, 100, 196, 196])

    def test_ambiguous_duplicate_and_oversized_registrations_fail_before_capture(self):
        first = self.registration('first.json', 42, [0, 0, 196, 196])
        duplicate_id = self.registration('id.json', 42, [196, 0, 196, 196])
        duplicate_roi = self.registration('roi.json', 43, [0, 0, 196, 196])
        remote_roi = self.registration('far.json', 43, [8192, 0, 196, 196])
        for other in (duplicate_id, duplicate_roi, remote_roi):
            with self.subTest(other=other.name), self.assertRaises(ValueError):
                bridge.load_registrations([first, other])
        with self.assertRaises(ValueError): bridge.load_registrations([first] * 17)
        for region in ([2 ** 31 - 100, 0, 196, 196], [0, -(2 ** 31) - 1, 196, 196]):
            with self.subTest(region=region), self.assertRaises(ValueError): bridge.capture_registration(region, 42)
        with self.assertRaisesRegex(ValueError, '4 million'): bridge.capture_registration([0, 0, 2001, 2000], 42)
        with self.assertRaisesRegex(ValueError, '4 million'): bridge.capture_bounds([[0, 0, 1500, 1500], [1, 1, 1500, 1500]])
        with self.assertRaisesRegex(ValueError, '16 million'): bridge.capture_bounds([[0, 0, 196, 196], [5000, 5000, 196, 196]])
        second = self.registration('second.json', 43, [196, 0, 196, 196])
        base = ['--registration', str(first), '--registration', str(second)]
        for extra in (['--producer-id', '42'], ['--save-registration', str(self.root / 'combined.json')]):
            with self.subTest(extra=extra), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                bridge.parse_args(base + extra)

    def test_one_bundle_preserves_independent_freshness_identity_and_failure(self):
        sources = [bridge.CaptureSource(producer, [index * 196, 0, 196, 196]) for index, producer in enumerate((42, 43))]
        def decode(frame, now):
            return [source.decode(pixels(flags=3, producer_id=source.producer_id, frame=frame,
                                          width=196, height=196), 196, 196, now) for source in sources]
        self.assertTrue(all(not item['valid'] for item in decode(10, 0)))
        statuses = decode(11, .01)
        self.assertTrue(all(item['valid'] for item in statuses))
        values = osc_values(bridge.capture_bundle(sources, statuses))
        self.assertEqual(len(values), 24)
        for producer in (42, 43):
            prefix = '/avatar/parameters/Sensa/Shader/' + str(producer)
            self.assertEqual(values[prefix + '/Frame'], 11)
            self.assertEqual(values[prefix + '/Valid'], 1)
        # The second crop fails while the first producer continues in the same source.
        statuses[0] = sources[0].decode(pixels(flags=3, producer_id=42, frame=12, width=196, height=196), 196, 196, .02)
        statuses[1] = sources[1].decode([(255, 255, 255)] * (196 * 196), 196, 196, .02)
        values = osc_values(bridge.capture_bundle(sources, statuses))
        self.assertEqual(values['/avatar/parameters/Sensa/Shader/42/Valid'], 1)
        self.assertEqual(values['/avatar/parameters/Sensa/Shader/43/Valid'], 0)
        self.assertNotIn('/avatar/parameters/Sensa/Shader/43/X', values)
        self.assertFalse(sources[1].decode(pixels(flags=3, producer_id=42, frame=13, width=196, height=196), 196, 196, .03)['valid'])
        self.assertFalse(decode(13, .04)[1]['valid'])
        self.assertTrue(decode(14, .05)[1]['valid'])
        # Freeze and slow decode retain the last advancing frame's age.
        repeated = decode(14, .06)
        self.assertFalse(sources[0].expire(repeated[0], .5)['valid'])
        self.assertFalse(sources[1].decode([], 195, 196, .5)['valid'])
        stopped = [source.reject('capture stopped') for source in sources]
        self.assertEqual(osc_values(bridge.capture_bundle(sources, stopped)), {
            '/avatar/parameters/Sensa/Shader/42/Valid': 0, '/avatar/parameters/Sensa/Shader/43/Valid': 0})

    def test_main_crops_one_in_memory_capture_and_sends_both_producers_from_one_mock_socket(self):
        first = self.registration('surface.json', 42, [-196, 0, 196, 196])
        second = self.registration('target.json', 43, [0, 0, 196, 196])
        crops, order = [], []
        class Image:
            def __init__(self, frame, producer=None):
                self.frame, self.producer = frame, producer
                self.size = (392, 196) if producer is None else (196, 196)
            def convert(self, mode):
                self.assert_mode = mode
                return self
            def close(self): pass
            def __enter__(self): return self
            def __exit__(self, *_): self.close()
            def crop(self, bounds):
                crops.append(bounds)
                return Image(self.frame, 42 if bounds[0] == 0 else 43)
            def get_flattened_data(self):
                return pixels(frame=self.frame, producer_id=self.producer, flags=3, width=196, height=196)
        frames, times = iter((Image(10), Image(11))), iter((0, 0, 0, 0, .01, .01, .02))
        def grab_image(**kwargs):
            order.append('capture')
            return next(frames)
        def time_now():
            order.append('clock')
            return next(times)
        grab = mock.Mock(side_effect=grab_image)
        udp = mock.MagicMock(); udp.__enter__.return_value = udp
        with mock.patch.dict(sys.modules, {'PIL': types.SimpleNamespace(Image=Image, ImageGrab=types.SimpleNamespace(grab=grab))}), \
                mock.patch.object(sys, 'argv', ['bridge', '--registration', str(first), '--registration', str(second),
                                               '--watch', '--port', '19001', '--duration', '.015']), \
                mock.patch.object(bridge.socket, 'socket', return_value=udp) as create_socket, \
                mock.patch.object(bridge.time, 'monotonic', side_effect=time_now), \
                mock.patch.object(bridge.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
            bridge.main()
        create_socket.assert_called_once()
        self.assertEqual(order[:3], ['clock', 'clock', 'capture'])
        self.assertEqual(grab.call_args_list, [mock.call(bbox=(-196, 0, 196, 196), all_screens=True)] * 2)
        self.assertEqual(crops, [(0, 0, 196, 196), (196, 0, 392, 196)] * 2)
        sent = udp.sendto.call_args_list
        self.assertEqual(len(sent), 3)
        self.assertTrue(all(call.args[1] == ('127.0.0.1', 19001) for call in sent))
        valid = osc_values(sent[1].args[0]); stopped = osc_values(sent[2].args[0])
        self.assertEqual(len(valid), 24)
        for producer in (42, 43):
            prefix = '/avatar/parameters/Sensa/Shader/' + str(producer)
            self.assertEqual(valid[prefix + '/Frame'], 11)
            self.assertEqual(valid[prefix + '/Valid'], 1)
            self.assertEqual(stopped[prefix + '/Valid'], 0)


class NativeRootCaptureContracts(LabFixture):
    WIDTH = HEIGHT = 196

    @staticmethod
    def image(**kwargs):
        return pixels(flags=3, producer_id=42, **{'width': 196, 'height': 196, **kwargs})

    @staticmethod
    def fixture():
        return json.loads((Path(bridge.__file__).parents[1] / 'tests/fixtures/shader-native-format1.json').read_text())

    @staticmethod
    def obscure(image, cells, width=196, height=196, color=(128, 128, 128)):
        result = image.copy()
        assert width == height and width % 49 == 0
        pitch = width // 49
        for column, row in cells:
            for y in range((row + 8) * pitch, (row + 9) * pitch):
                for x in range((column + 8) * pitch, (column + 9) * pitch):
                    original = result[y * width + x]
                    result[y * width + x] = color if color is not None else tuple(255 - value for value in original)
        return result

    def test_independent_standard_vectors_match_all_masks_and_interleaved_codewords(self):
        qr, golden = bridge.telemetry_qr, self.fixture()
        packet = bytes.fromhex(golden['packetHex'])
        self.assertEqual(golden['mask'], 1)
        self.assertEqual(binascii.crc32(packet[:28]), int.from_bytes(packet[28:], 'little'))
        for mask in range(8):
            encoded = qr.encode(packet, mask)
            flattened = ''.join(str(int(bit)) for row in encoded['matrix'] for bit in row)
            with self.subTest(mask=mask):
                self.assertEqual(hashlib.sha256(flattened.encode('ascii')).hexdigest(), golden['maskMatrixSha256'][mask])
                self.assertEqual(encoded['codewords'].hex().upper(), golden['codewordsHex'])
                self.assertEqual(encoded['scores'], golden['maskPenalties'])
                self.assertEqual(qr.decode_matrix(encoded['matrix']), packet)
        self.assertEqual(qr.encode(packet)['mask'], golden['mask'])
        image = [(255, 255, 255) if golden['screenRows'][y // 4][x // 4] == '1' else (0, 0, 0)
                 for y in range(196) for x in range(196)]
        sample = bridge.decode_pixels(image, 196, 196)
        for key in ('frame', 'producerId', 'coordinateFrame'): self.assertEqual(sample[key], golden['expected'][key])
        for key in ('xyz', 'right', 'forward'):
            for actual, expected in zip(sample[key], golden['expected'][key]): self.assertAlmostEqual(actual, expected, delta=1e-12)
        self.assertAlmostEqual(sample['avatarScale'], golden['expected']['avatarScale'], delta=1e-12)

    def test_synthetic_native_png_source_advances_and_recovers_erased_codewords(self):
        fixture = self.fixture()
        image = smoke.native_pixels(256)
        self.assertEqual(image, [(255, 255, 255) if fixture['screenRows'][y // 4][x // 4] == '1' else (0, 0, 0)
                                 for y in range(196) for x in range(196)])
        first = bridge.decode_pixels(image, 196, 196)
        freshness = bridge.Freshness(.35, producer_id=42)
        self.assertFalse(freshness.accept(first, 0))
        next_frame = bridge.decode_pixels(smoke.native_pixels(257, damaged=True), 196, 196)
        self.assertTrue(freshness.accept(next_frame, .08))
        self.assertEqual(next_frame, {**first, 'frame': 257})
        self.assertEqual(smoke.NATIVE_FIELDS, ('Frame', 'X', 'Y', 'Z', 'RightX', 'RightY', 'RightZ',
                                             'ForwardX', 'ForwardY', 'ForwardZ', 'AvatarScale', 'Valid'))

    def test_reed_solomon_recovers_error_erasure_combinations_at_the_bound(self):
        qr = bridge.telemetry_qr
        randomizer = random.Random(401)
        for erasures in range(17):
            errors = (16 - erasures) // 2
            for trial in range(8):
                data = bytes(randomizer.randrange(256) for _ in range(9))
                damaged = list(qr.rs_encode(data))
                positions = randomizer.sample(range(25), errors + erasures)
                for index in positions[:erasures]: damaged[index] = None
                for index in positions[erasures:]: damaged[index] ^= randomizer.randrange(1, 256)
                with self.subTest(erasures=erasures, errors=errors, trial=trial):
                    self.assertEqual(qr.rs_decode(damaged), data)
        with self.assertRaises(ValueError): qr.rs_decode([None] * 17 + [0] * 8)

    def test_opaque_damage_and_gray_erasures_recover_within_each_block_budget(self):
        qr = bridge.telemetry_qr
        image = self.image(); expected = bridge.decode_pixels(image, 196, 196)
        # Thirty-two interleaved byte errors are eight errors in each block.
        flipped = self.obscure(image, [qr.data_positions()[byte * 8] for byte in range(32)], color=None)
        self.assertEqual(bridge.decode_pixels(flipped, 196, 196), expected)
        # Sixty-four interleaved erasures are sixteen erasures in each block.
        erased = self.obscure(image, [qr.data_positions()[byte * 8] for byte in range(64)])
        self.assertEqual(bridge.decode_pixels(erased, 196, 196), expected)
        excess = self.obscure(image, [qr.data_positions()[byte * 8] for byte in range(68)])
        with self.assertRaises(ValueError): bridge.decode_pixels(excess, 196, 196)
        # A contiguous patch affects data/ECC modules instead of a repeated copy.
        patch = [(x, y) for y in range(11, 17) for x in range(11, 17)]
        for color in ((0, 0, 0), (255, 255, 255), (128, 128, 128)):
            with self.subTest(patch=color):
                self.assertEqual(bridge.decode_pixels(self.obscure(image, patch, color=color), 196, 196), expected)

    def test_wrong_crc_and_large_cross_frame_splice_do_not_produce_new_measurements(self):
        qr = bridge.telemetry_qr
        packet = bytearray.fromhex(self.fixture()['packetHex']); packet[6] ^= 1
        # A perfectly readable QR with an invalid application CRC still fails.
        with self.assertRaises(ValueError): bridge.decode_pixels(qr.render(packet), 196, 196)
        image = self.image(frame=256, xyz=(0, 1, 0))
        other = self.image(frame=55000, xyz=(1.3, 2.5, -.8), right=(0, 2, 0), forward=(1, 0, 0), avatar_scale=2)
        splice = image[:98 * 196] + other[98 * 196:]
        with self.assertRaises(ValueError): bridge.decode_pixels(splice, 196, 196)
        # A tiny splice can correct to the whole earlier packet. Frame freshness
        # keeps its original age; correction never creates a fresh clock.
        expected = bridge.decode_pixels(image, 196, 196)
        small = image.copy()
        for y in range(80, 84): small[y * 196 + 80:y * 196 + 84] = other[y * 196 + 80:y * 196 + 84]
        restored = bridge.decode_pixels(small, 196, 196)
        self.assertEqual(restored, expected)
        freshness = bridge.Freshness(.35, producer_id=42)
        self.assertFalse(freshness.accept({**expected, 'frame': 255}, 0))
        self.assertTrue(freshness.accept(expected, .01))
        self.assertTrue(freshness.accept(restored, .02))
        self.assertEqual(freshness.changed_at, .01)
        self.assertFalse(freshness.accept(restored, .37))

    def test_finder_patterns_align_rotations_reflections_padding_and_four_module_motion(self):
        for width in (196, 294):
            image = self.image(width=width, height=width)
            expected = bridge.decode_pixels(image, width, width)
            for turn in range(4):
                for mirror in (False, True):
                    oriented = image.copy()
                    for _ in range(turn): oriented = [oriented[(width - 1 - x) * width + y] for y in range(width) for x in range(width)]
                    if mirror: oriented = [oriented[y * width + width - 1 - x] for y in range(width) for x in range(width)]
                    with self.subTest(width=width, turn=turn, mirror=mirror):
                        self.assertEqual(bridge.decode_pixels(oriented, width, width), expected)
            pitch = width // 49
            for dx, dy in ((4 * pitch, 4 * pitch), (-4 * pitch, -4 * pitch), (4 * pitch, -4 * pitch)):
                shifted = [(255, 255, 255)] * (width * width)
                for y in range(width):
                    for x in range(width):
                        if 0 <= x + dx < width and 0 <= y + dy < width:
                            shifted[(y + dy) * width + x + dx] = image[y * width + x]
                self.assertEqual(bridge.decode_pixels(shifted, width, width), expected)
            for y in range(width):
                for x in range(width):
                    if min(x, y, width - 1 - x, width - 1 - y) < 8 * pitch:
                        self.assertEqual(image[y * width + x], (255, 255, 255))
        for width, height in ((320, 256), (400, 196), (196, 400)):
            image = self.image(width=width, height=height)
            self.assertEqual(bridge.decode_pixels(image, width, height), expected)

    def test_qr_format_information_corrects_three_bit_errors_and_rejects_ambiguity(self):
        qr = bridge.telemetry_qr
        packet = bytes.fromhex(self.fixture()['packetHex']); matrix = qr.encode(packet)['matrix']
        first, second = qr.format_positions()
        for positions in (first, second):
            for x, y in positions[:3]: matrix[y][x] ^= 1
        self.assertEqual(qr.decode_matrix(matrix), packet)
        # Two intact copies naming different masks are ambiguous, even with a CRC.
        matrix = qr.encode(packet)['matrix']
        for bit, (x, y) in enumerate(second): matrix[y][x] = qr.format_bits(2) >> bit & 1
        with self.assertRaises(ValueError): qr.decode_matrix(matrix)

    def test_finder_cross_sections_align_oblique_rotations(self):
        image = self.image(); expected = bridge.decode_pixels(image, 196, 196)
        canvas = 294
        for degrees in (15, 30, 45):
            angle = math.radians(degrees); cosine, sine = math.cos(angle), math.sin(angle)
            rotated = []
            for y in range(canvas):
                for x in range(canvas):
                    dx, dy = x - (canvas - 1) / 2, y - (canvas - 1) / 2
                    source_x = round(cosine * dx + sine * dy + 97.5)
                    source_y = round(-sine * dx + cosine * dy + 97.5)
                    rotated.append(image[source_y * 196 + source_x] if 0 <= source_x < 196 and 0 <= source_y < 196 else (255, 255, 255))
            with self.subTest(degrees=degrees):
                self.assertEqual(bridge.decode_pixels(rotated, canvas, canvas), expected)

    def test_black_white_balance_is_improved_by_the_best_standard_mask(self):
        qr = bridge.telemetry_qr
        for packet in (bytes(32), bytes([255]) * 32, bytes(range(32)), bytes.fromhex(self.fixture()['packetHex'])):
            encoded = qr.encode(packet)
            self.assertEqual(encoded['scores'][encoded['mask']], min(encoded['scores']))
            fraction = sum(sum(row) for row in encoded['matrix']) / (33 * 33)
            self.assertGreater(fraction, .4); self.assertLess(fraction, .6)

    def test_position_basis_scale_quantization_and_identity_are_preserved(self):
        for producer in (1, 42, 65535):
            for target in ((0, 1, 0), (.2, 1.8, .1), (-2, -1, -2), (2, 3, 2)):
                sample = bridge.decode_pixels(pixels(xyz=target, flags=3, producer_id=producer, width=196, height=196,
                                                      right=(.5, .25, 0), forward=(-.25, 0, 1.5), avatar_scale=1.25), 196, 196)
                self.assertEqual(sample['producerId'], producer)
                self.assertEqual(sample['coordinateFrame'], 'AvatarRootLocal')
                for actual, expected in zip(sample['xyz'], target): self.assertAlmostEqual(actual, expected, delta=2 / 65535 + 1e-12)
                for key, values in (('right', (.5, .25, 0)), ('forward', (-.25, 0, 1.5))):
                    for actual, expected in zip(sample[key], values): self.assertAlmostEqual(actual, expected, delta=4 / 32767)
                self.assertAlmostEqual(sample['avatarScale'], 1.25, delta=4 / 65535)

    def test_arbitrary_pose_and_sheared_tangent_plane_survive_qr_loss_without_axis_normalization(self):
        def cross(a, b):
            return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
        def unit(vector):
            length = math.sqrt(sum(value * value for value in vector))
            return tuple(value / length for value in vector)
        axis = unit((.3, .7, .2)); angle = 1.93
        def rotate(vector):
            dot = sum(a * b for a, b in zip(axis, vector))
            return tuple(v * math.cos(angle) + c * math.sin(angle) + a * dot * (1 - math.cos(angle))
                         for v, c, a in zip(vector, cross(axis, vector), axis))
        right, forward = rotate((2, .4, 0)), rotate((.3, -.2, 1.4))
        target = (.3, 1.7, -.2)
        image = self.image(xyz=target, right=right, forward=forward, avatar_scale=1.3)
        damaged = self.obscure(image, [bridge.telemetry_qr.data_positions()[byte * 8] for byte in range(48)])
        sample = bridge.decode_pixels(damaged, 196, 196)
        for actual, expected in zip(sample['xyz'], target): self.assertAlmostEqual(actual, expected, delta=2 / 65535)
        for key, expected in (('right', right), ('forward', forward)):
            for actual, component in zip(sample[key], expected): self.assertAlmostEqual(actual, component, delta=4 / 32767)
        restored_normal = unit(cross(sample['forward'], sample['right']))
        expected_normal = unit(cross(forward, right))
        for actual, expected in zip(restored_normal, expected_normal): self.assertAlmostEqual(actual, expected, delta=.0003)
        self.assertGreater(math.sqrt(sum(value * value for value in sample['right'])), 2)
        self.assertGreater(abs(sum(a * b for a, b in zip(sample['right'], sample['forward']))), .4)

    def test_native_validity_basis_and_quantization_limits_are_checked(self):
        for flags, producer in ((0, 0), (2, 42), (3, 0), (5, 42), (7, 42)):
            with self.subTest(flags=flags, producer=producer), self.assertRaises(ValueError):
                bridge.decode_pixels(pixels(flags=flags, producer_id=producer, width=196, height=196), 196, 196)
        for patch in ({'right': (0, 0, 0)}, {'forward': (0, 0, 0)}, {'forward': (2, 0, 0)}, {'avatar_scale': 0}):
            with self.subTest(patch=patch), self.assertRaises(ValueError): bridge.decode_pixels(self.image(**patch), 196, 196)
        packet = bytearray.fromhex(self.fixture()['packetHex']); struct.pack_into('<h', packet, 14, -32768)
        struct.pack_into('<I', packet, 28, binascii.crc32(packet[:28]))
        self.assertIsNone(bridge._packet(packet, native=True))

    def test_capture_minimum_and_unrecognizable_or_multiple_symbols_are_rejected(self):
        for width, height in ((80, 48), (195, 196), (196, 195)):
            with self.subTest(size=(width, height)), self.assertRaises(ValueError):
                bridge.decode_pixels(self.image(width=width, height=height), width, height)
        image = self.image()
        with self.assertRaises(ValueError): bridge.decode_pixels(image[:-1], 196, 196)
        for invalid in ([(0, 0, 0)] * len(image), [(255, 255, 255)] * len(image),
                        [(255, 0, 0) if red else (0, 0, 0) for red, _, _ in image],
                        [(255, 255, 255) if (x * 13 + y * 7) % 5 < 2 else (0, 0, 0) for y in range(196) for x in range(196)]):
            with self.assertRaises(ValueError): bridge.decode_pixels(invalid, 196, 196)
        other = self.image(frame=257)
        multiple = [pixel for y in range(196) for pixel in image[y * 196:(y + 1) * 196] + other[y * 196:(y + 1) * 196]]
        with self.assertRaises(ValueError): bridge.decode_pixels(multiple, 392, 196)
        # Six symbols have at least eighteen finders: exceeding the candidate
        # budget rejects the ROI rather than silently dropping another symbol.
        crowded = [pixel for y in range(392) for pixel in image[(y % 196) * 196:(y % 196 + 1) * 196] * 3]
        self.assertIsNone(bridge.telemetry_qr.decode_pixels(crowded, 588, 392))
        missing_finder = self.obscure(image, [(x, y) for x in range(7) for y in range(7)])
        with self.assertRaises(ValueError): bridge.decode_pixels(missing_finder, 196, 196)

    def test_same_clock_with_changed_basis_or_scale_requires_two_new_ticks(self):
        initial = bridge.decode_pixels(self.image(frame=1), 196, 196)
        freshness = bridge.Freshness(.35, producer_id=42)
        self.assertFalse(freshness.accept(initial, 0))
        self.assertTrue(freshness.accept({**initial, 'frame': 2}, .01))
        self.assertFalse(freshness.accept({**initial, 'frame': 2, 'right': [0, 1, 0]}, .02))
        self.assertFalse(freshness.accept({**initial, 'frame': 3}, .03))
        self.assertTrue(freshness.accept({**initial, 'frame': 4}, .04))
        self.assertFalse(freshness.accept({**initial, 'frame': 4, 'avatarScale': 2}, .05))

    def test_native_osc_fields_form_one_ordered_commit_and_invalid_has_only_valid_zero(self):
        sample = bridge.decode_pixels(self.image(), 196, 196)
        values = osc_values(bridge.osc_bundle(sample, True)); prefix = '/avatar/parameters/Sensa/Shader/42/'
        fields = ('Frame', 'X', 'Y', 'Z', 'RightX', 'RightY', 'RightZ', 'ForwardX', 'ForwardY', 'ForwardZ', 'AvatarScale', 'Valid')
        self.assertEqual(list(values), [prefix + field for field in fields])
        for axis in 'YZ': self.assertEqual(values[prefix + 'Right' + axis], 0)
        self.assertAlmostEqual(values[prefix + 'AvatarScale'], sample['avatarScale'], places=6)
        for old in (None, sample): self.assertEqual(bridge.osc_bundle(old, False, producer_id=42, native=True), bridge.osc_bundle(None, False, producer_id=42, native=True))
        for producer in (0, -1, 65536):
            with self.subTest(producer=producer), self.assertRaisesRegex(ValueError, 'nonzero producer ID'):
                bridge.osc_bundle(None, False, producer_id=producer, native=True)

    def test_registered_identity_and_coordinate_profile_do_not_silently_retarget(self):
        initial = bridge.decode_pixels(self.image(frame=10), 196, 196)
        freshness = bridge.Freshness(.35, producer_id=42)
        self.assertFalse(freshness.accept(initial, 0)); self.assertTrue(freshness.accept({**initial, 'frame': 11}, .01))
        self.assertFalse(freshness.accept({**initial, 'frame': 12, 'producerId': 43}, .02))
        self.assertFalse(freshness.accept({**initial, 'frame': 12}, .03))
        self.assertTrue(freshness.accept({**initial, 'frame': 13}, .04))
        with self.assertRaisesRegex(ValueError, 'Diagnostic telemetry requires producer ID zero'):
            bridge.decode_pixels(pixels(flags=1, producer_id=42), 320, 256)
        with self.assertRaisesRegex(ValueError, 'native avatar-root coordinate profile'): bridge.validate_source({'producerId': 42}, 42)
        registration = bridge.capture_registration((-1440, 200, 320, 256), 42)
        path = self.write(self.root / 'capture.json', json.dumps(registration))
        self.assertEqual(bridge.load_registration(path), registration)
        for patch in ({'producerId': 0}, {'center': [0, 0, 0]}, {'halfRange': 1}, {'coordinateFrame': 'World'},
                      {'region': None}, {'region': [0, 0, 195, 196]}):
            path.write_text(json.dumps({**registration, **patch}), encoding='utf-8')
            with self.subTest(patch=patch), self.assertRaises(ValueError): bridge.load_registration(path)

    def test_screen_output_requires_identity_before_capture_or_socket(self):
        for size in ((196, 196), (80, 48)):
            result = subprocess.run([sys.executable, str(Path(bridge.__file__)), '--region', '0', '0', *map(str, size),
                                     '--port', '19001'], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Screen-to-OSC requires --producer-id' if size == (196, 196) else 'Invalid capture rectangle size', result.stderr)
