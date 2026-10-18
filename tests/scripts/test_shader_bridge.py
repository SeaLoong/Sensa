"""Telemetry framing, freshness and file ownership contracts; no capture or socket.
遥测帧、新鲜度和文件所有权契约；不进行采集或网络连接。
"""
import binascii
import json
from pathlib import Path
import subprocess
import sys
import struct
import unittest

from lab_contract_fixtures import LabFixture, load_script

bridge = load_script('shader-osc-bridge')
smoke = load_script('smoke-shader-bridge')


def pixels(frame=256, xyz=(.25, -.5, .75), width=256, height=128, flags=1, producer_id=0):
    packet = bytearray(b'SN\x01') + bytes([flags]) + frame.to_bytes(2, 'little')
    if flags & 2:
        xyz = [(value - center) / 1.5 for value, center in zip(xyz, (0, 1, 0))]
    for value in xyz:
        packet.extend(round((value + 1) / 2 * 65535).to_bytes(2, 'little'))
    packet.extend(producer_id.to_bytes(2, 'little'))
    packet.extend(binascii.crc_hqx(packet, 0xffff).to_bytes(2, 'little'))
    return [(255, 255, 255) if packet[x * 16 // width] & (1 << (7 - y * 8 // height)) else (0, 0, 0)
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
        image = pixels()
        for y in range(16):
            for x in range(96, 112):
                image[y * 256 + x] = tuple(255 - value for value in image[y * 256 + x])
        with self.assertRaises(ValueError):
            bridge.decode_pixels(image, 256, 128)
        image = pixels()
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
        prefix = '/avatar/parameters/Sensa/Shader/v1/0/'
        self.assertEqual(values, {prefix + 'Valid': 1, prefix + 'Frame': 65535,
                                  prefix + 'X': .25, prefix + 'Y': -.5, prefix + 'Z': .75,
                                  prefix + 'Producer': 0, prefix + 'Profile': 0})
        self.assertEqual(list(values), [prefix + name for name in ('Valid', 'Frame', 'X', 'Y', 'Z', 'Producer', 'Profile')])

    def test_invalid_output_has_only_a_zero_gate_and_identity_even_when_old_coordinates_exist(self):
        prefix = '/avatar/parameters/Sensa/Shader/v1/0/'
        for sample in (None, {'frame': 1, 'xyz': [.25, -.5, .75]}):
            self.assertEqual(osc_values(bridge.osc_bundle(sample, False)),
                             {prefix + 'Valid': 0, prefix + 'Producer': 0, prefix + 'Profile': 0})


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


class NativeRootCaptureContracts(LabFixture):
    def test_native_root_coordinates_keep_the_shared_avatar_root_profile_and_producer(self):
        for producer in (1, 42, 65535):
            for target in ((0, 1, 0), (.2, 1.8, .1), (-1.5, -.5, -1.5), (1.5, 2.5, 1.5)):
                with self.subTest(producer=producer, xyz=target):
                    sample = bridge.decode_pixels(pixels(xyz=target, flags=3, producer_id=producer), 256, 128)
                    self.assertEqual(sample['producerId'], producer)
                    self.assertEqual(sample['coordinateFrame'], 'AvatarRootLocal')
                    for actual, expected in zip(sample['xyz'], target):
                        self.assertAlmostEqual(actual, expected, delta=3 / 65535)

    def test_source_invalid_unknown_flags_or_zero_native_identity_never_decode_as_valid(self):
        for flags, producer in ((0, 0), (2, 42), (3, 0), (5, 42), (7, 42)):
            with self.subTest(flags=flags, producer=producer), self.assertRaises(ValueError):
                bridge.decode_pixels(pixels(xyz=(0, 1, 0), flags=flags, producer_id=producer), 256, 128)

    def test_color_tinted_cells_do_not_pass_as_black_and_white_from_the_red_channel_alone(self):
        image = [(255, 0, 0) if red else (0, 0, 0) for red, _, _ in pixels()]
        with self.assertRaises(ValueError):
            bridge.decode_pixels(image, 256, 128)
        with self.assertRaises(ValueError):
            bridge.decode_pixels(pixels()[:-1], 256, 128)

    def test_explicit_producer_cannot_be_replaced_by_another_valid_camera_packet(self):
        freshness = bridge.Freshness(.35, producer_id=42)
        def sample(frame, producer=42):
            return {'frame': frame, 'producerId': producer, 'coordinateFrame': 'AvatarRootLocal', 'xyz': [0, 1, 0]}
        self.assertFalse(freshness.accept(sample(10), 0))
        self.assertTrue(freshness.accept(sample(11), .01))
        self.assertFalse(freshness.accept(sample(12, 43), .02))
        self.assertFalse(freshness.accept(sample(13, 43), .03))
        self.assertFalse(freshness.accept(sample(12), .04))
        self.assertTrue(freshness.accept(sample(13), .05))
        output = osc_values(bridge.osc_bundle(sample(13), True))
        prefix = '/avatar/parameters/Sensa/Shader/v1/42/'
        self.assertEqual(output[prefix + 'Producer'], 42)
        self.assertEqual(output[prefix + 'Profile'], 1)
        self.assertEqual(osc_values(bridge.osc_bundle(sample(13), False)),
                         {prefix + 'Valid': 0, prefix + 'Producer': 42, prefix + 'Profile': 1})
        self.assertEqual(osc_values(bridge.osc_bundle(None, False, producer_id=42, profile=1)),
                         {prefix + 'Valid': 0, prefix + 'Producer': 42, prefix + 'Profile': 1})
        self.assertEqual(list(output), [prefix + name for name in ('Valid', 'Frame', 'X', 'Y', 'Z', 'Producer', 'Profile')])

    def test_registered_root_never_accepts_a_same_id_diagnostic_coordinate_profile(self):
        freshness = bridge.Freshness(.35, producer_id=42)
        diagnostic = bridge.decode_pixels(pixels(flags=1, producer_id=42), 256, 128)
        with self.assertRaisesRegex(ValueError, 'native avatar-root coordinate profile'):
            bridge.validate_source(diagnostic, 42)
        self.assertFalse(freshness.accept(diagnostic, 0))
        self.assertIsNone(freshness.identity)
        for frame, moment, expected in ((1, .01, False), (2, .02, True)):
            native = bridge.decode_pixels(pixels(frame=frame, xyz=(0, 1, 0), flags=3, producer_id=42), 256, 128)
            bridge.validate_source(native, 42)
            self.assertEqual(freshness.accept(native, moment), expected)

    def test_unpinned_diagnostic_preview_still_does_not_silently_retarget(self):
        freshness = bridge.Freshness()
        self.assertFalse(freshness.accept({'frame': 1, 'producerId': 1}, 0))
        self.assertTrue(freshness.accept({'frame': 2, 'producerId': 1}, .01))
        self.assertFalse(freshness.accept({'frame': 3, 'producerId': 2}, .02))
        self.assertFalse(freshness.accept({'frame': 4, 'producerId': 2}, .03))

    def test_registration_preserves_explicit_multi_monitor_bounds_and_rejects_other_profiles(self):
        registration = bridge.capture_registration((-1440, 200, 256, 128), 42)
        path = self.write(self.root / '捕获区域.json', json.dumps(registration))
        self.assertEqual(bridge.load_registration(path), registration)
        for patch in ({'producerId': 0}, {'center': [0, 0, 0]}, {'halfRange': 1},
                      {'coordinateFrame': 'World'}, {'region': None}, {'region': [0, 0, 63, 32]}):
            path.write_text(json.dumps({**registration, **patch}), encoding='utf-8')
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                bridge.load_registration(path)

    def test_screen_to_osc_requires_identity_before_any_capture_or_socket(self):
        result = subprocess.run([sys.executable, str(Path(bridge.__file__)), '--region', '0', '0', '64', '32',
                                 '--port', '19001'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Screen-to-OSC requires --producer-id', result.stderr)
