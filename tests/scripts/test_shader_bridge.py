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
        xyz = [(value - center) / 2 for value, center in zip(xyz, (0, 1, 0))]
    for value in xyz:
        packet.extend(round((value + 1) / 2 * 65535).to_bytes(2, 'little'))
    packet.extend(producer_id.to_bytes(2, 'little'))
    packet.extend(binascii.crc_hqx(packet, 0xffff).to_bytes(2, 'little'))
    if flags & 2:
        def value(x, y):
            column, row = x * 20 // width, 11 - y * 12 // height
            if column < 2 or column >= 18 or row < 2 or row >= 10:
                return bridge.edge_bit(column, row)
            return packet[column - 2] & (1 << (row - 2))
    else:
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


class NativeRootCaptureContracts(LabFixture):
    def test_native_root_coordinates_keep_the_shared_avatar_root_profile_and_producer(self):
        for producer in (1, 42, 65535):
            for target in ((0, 1, 0), (.2, 1.8, .1), (-2, -1, -2), (2, 3, 2)):
                with self.subTest(producer=producer, xyz=target):
                    sample = bridge.decode_pixels(pixels(xyz=target, flags=3, producer_id=producer), 256, 128)
                    self.assertEqual(sample['producerId'], producer)
                    self.assertEqual(sample['coordinateFrame'], 'AvatarRootLocal')
                    for actual, expected in zip(sample['xyz'], target):
                        self.assertAlmostEqual(actual, expected, delta=4 / 65535)

    def test_native_golden_bitmap_keeps_edge_orientation_byte_order_and_crc(self):
        # Independent fixed bitmap: producer 42, frame 256, root (0, 1, 0).
        # Literal rows intentionally do not call the synthetic encoder above.
        rows = (
            '00010101110001101001', '11101010001110010110',
            '10000000010101001101', '01110000000000000110',
            '10000000000000100010', '01100000000000001101',
            '01010000000000100110', '10010000000000000110',
            '01110100000000101010', '10101101000000000001',
            '00101001101000110100', '11010110010111001011',
        )
        image = [(255, 255, 255) if rows[y // 4][x // 4] == '1' else (0, 0, 0)
                 for y in range(48) for x in range(80)]
        sample = bridge.decode_pixels(image, 80, 48)
        self.assertEqual(sample['producerId'], 42)
        self.assertEqual(sample['frame'], 256)
        for actual, expected in zip(sample['xyz'], (0, 1, 0)):
            self.assertAlmostEqual(actual, expected, delta=4 / 65535)

    def test_native_shader_template_uses_the_decoder_grid_and_edge_bit_order(self):
        template = (Path(bridge.__file__).parents[1] / 'unity/top.sealoong.sensa/Editor/SensaRootTelemetry.shader.txt').read_text(encoding='utf-8')
        compact = ''.join(template.split())
        # Catch encoder/decoder drift before the real Unity shader import check.
        # The source assertions supplement the independent golden bitmap; they
        # do not establish that a graphics driver produces these pixels.
        for expression in (
                'uintcolumn=min((uint)(input.uv.x*20),19u),row=min((uint)(input.uv.y*12),11u);',
                'if(row<2u)value=((0xD3A6Bu>>column)&1u)^row;',
                'elseif(row>=10u)value=((0x69C57u>>column)&1u)^(row-10u);',
                'elseif(column<2u)value=((0xA5u>>(row-2u))&1u)^column;',
                'elseif(column>=18u)value=((0x6Eu>>(row-2u))&1u)^(column-18u);',
                'column-=2u;row-=2u;',
                'uintbit=((column&3u)*8u)+row;',
                'value=(input.packet[column>>2]>>bit)&1u;',
                'all(abs(normalized)<=1)'):
            with self.subTest(expression=expression):
                self.assertIn(expression, compact)

    def test_native_edges_recover_translation_and_one_occluded_edge_without_repairing_data(self):
        for width, height in ((80, 48), (200, 120), (256, 128)):
            original = pixels(frame=356, xyz=(.2, 1.8, .1), flags=3, producer_id=42,
                              width=width, height=height)
            expected = bridge.decode_pixels(original, width, height)
            for dx, dy in ((0, 0), (width // 20, height // 12),
                           (-width // 20, -height // 12), (width // 20, -height // 12)):
                shifted = [(80, 80, 80)] * (width * height)
                for y in range(height):
                    for x in range(width):
                        if 0 <= x + dx < width and 0 <= y + dy < height:
                            shifted[(y + dy) * width + x + dx] = original[y * width + x]
                with self.subTest(size=(width, height), offset=(dx, dy)):
                    self.assertEqual(bridge.decode_pixels(shifted, width, height), expected)
            for side in ('top', 'bottom', 'left', 'right'):
                occluded = original.copy()
                for y in range(height):
                    for x in range(width):
                        if ((side == 'top' and y * 12 < height * 2)
                                or (side == 'bottom' and y * 12 >= height * 10)
                                or (side == 'left' and x * 20 < width * 2)
                                or (side == 'right' and x * 20 >= width * 18)):
                            occluded[y * width + x] = (80, 80, 80)
                with self.subTest(size=(width, height), occluded_side=side):
                    self.assertEqual(bridge.decode_pixels(occluded, width, height), expected)
            flipped = [pixel for y in reversed(range(height))
                       for pixel in original[y * width:(y + 1) * width]]
            self.assertEqual(bridge.decode_pixels(flipped, width, height), expected)

    def test_marker_redundancy_does_not_hide_payload_damage_or_multiple_lost_edges(self):
        width, height = 200, 120
        original = pixels(width=width, height=height, flags=3, producer_id=42)
        for first, second in (('top', 'bottom'), ('top', 'left'), ('top', 'right'),
                              ('bottom', 'left'), ('bottom', 'right'), ('left', 'right')):
            damage = original.copy()
            for y in range(height):
                for x in range(width):
                    hidden = {'top': y < 20, 'bottom': y >= 100,
                              'left': x < 20, 'right': x >= 180}
                    if hidden[first] or hidden[second]:
                        damage[y * width + x] = (80, 80, 80)
            with self.subTest(occluded_sides=(first, second)), self.assertRaises(ValueError):
                bridge.decode_pixels(damage, width, height)
        # A whole data module changed to the opposite binary value must fail CRC.
        damage = original.copy()
        for y in range(20, 30):
            for x in range(80, 90):
                damage[y * width + x] = tuple(255 - value for value in damage[y * width + x])
        with self.assertRaises(ValueError):
            bridge.decode_pixels(damage, width, height)
        # A gray overlay in the payload is not silently voted into a data bit.
        damage = original.copy()
        for y in range(20, 30):
            for x in range(80, 90):
                damage[y * width + x] = (128, 128, 128)
        with self.assertRaises(ValueError):
            bridge.decode_pixels(damage, width, height)
        # Splicing payload columns from two valid renders invalidates the CRC.
        next_frame = pixels(frame=257, xyz=(1, 0, 1), width=width, height=height,
                            flags=3, producer_id=42)
        damage = original.copy()
        for y in range(20, 100):
            damage[y * width + 20:y * width + 100] = next_frame[y * width + 20:y * width + 100]
        with self.assertRaises(ValueError):
            bridge.decode_pixels(damage, width, height)

    def test_edge_sample_noise_is_tolerated_but_native_minimum_cell_size_is_enforced(self):
        image = pixels(width=200, height=120, flags=3, producer_id=42)
        expected = bridge.decode_pixels(image, 200, 120)
        image[5 * 200 + 5] = (128, 128, 128)
        self.assertEqual(bridge.decode_pixels(image, 200, 120), expected)
        with self.assertRaises(ValueError):
            bridge.decode_pixels(pixels(width=64, height=32, flags=3, producer_id=42), 64, 32)
        with self.assertRaises(ValueError):
            bridge.capture_registration([0, 0, 64, 32], 42)

    def test_native_fiducials_do_not_accept_unframed_native_data_or_random_pixels(self):
        image = pixels(width=200, height=120, flags=3, producer_id=42)
        # Removing both edge bands is not a supported native protocol alias.
        unframed = [image[y * 200 + x] for y in range(20, 100) for x in range(20, 180)]
        with self.assertRaises(ValueError):
            bridge.decode_pixels(unframed, 160, 80)
        noise = [(255, 255, 255) if (x * 13 + y * 7) % 5 < 2 else (0, 0, 0)
                 for y in range(120) for x in range(200)]
        with self.assertRaises(ValueError):
            bridge.decode_pixels(noise, 200, 120)
        # At two modules of movement the tile is outside bounded reacquisition.
        shifted = [(80, 80, 80)] * 24000
        for y in range(120):
            shifted[y * 200 + 20:(y + 1) * 200] = image[y * 200:y * 200 + 180]
        with self.assertRaises(ValueError):
            bridge.decode_pixels(shifted, 200, 120)
        # A producer marks saturated/out-of-range source coordinates invalid.
        with self.assertRaises(ValueError):
            bridge.decode_pixels(pixels(xyz=(2, 3, 2), flags=2, producer_id=42), 256, 128)

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
        prefix = '/avatar/parameters/Sensa/Shader/42/'
        self.assertEqual(set(output), {prefix + name for name in ('Frame', 'X', 'Y', 'Z', 'Valid')})
        self.assertEqual(len(bridge.osc_bundle(sample(13), True)), 284)
        self.assertEqual(osc_values(bridge.osc_bundle(sample(13), False)),
                         {prefix + 'Valid': 0})
        self.assertEqual(osc_values(bridge.osc_bundle(None, False, producer_id=42, native=True)),
                         {prefix + 'Valid': 0})
        self.assertEqual(list(output), [prefix + name for name in ('Frame', 'X', 'Y', 'Z', 'Valid')])

    def test_zero_identity_cannot_serialize_as_native_even_for_invalidation(self):
        for producer in (0, -1, 65536):
            with self.subTest(producer=producer), self.assertRaisesRegex(ValueError, 'nonzero producer ID'):
                bridge.osc_bundle(None, False, producer_id=producer, native=True)

    def test_registered_root_never_accepts_a_same_id_diagnostic_coordinate_profile(self):
        freshness = bridge.Freshness(.35, producer_id=42)
        with self.assertRaisesRegex(ValueError, 'Diagnostic telemetry requires producer ID zero'):
            bridge.decode_pixels(pixels(flags=1, producer_id=42), 256, 128)
        diagnostic = {'frame': 1, 'producerId': 42, 'xyz': [0, 1, 0]}
        with self.assertRaisesRegex(ValueError, 'native avatar-root coordinate profile'):
            bridge.validate_source(diagnostic, 42)
        with self.assertRaisesRegex(ValueError, 'native avatar-root coordinate profile'):
            bridge.osc_bundle(diagnostic, True, producer_id=42, native=True)
        self.assertFalse(freshness.accept(diagnostic, 0))
        self.assertIsNone(freshness.identity)
        for frame, moment, expected in ((1, .01, False), (2, .02, True)):
            native = bridge.decode_pixels(pixels(frame=frame, xyz=(0, 1, 0), flags=3, producer_id=42), 256, 128)
            bridge.validate_source(native, 42)
            self.assertEqual(freshness.accept(native, moment), expected)

    def test_unpinned_native_preview_still_does_not_silently_retarget(self):
        freshness = bridge.Freshness()
        self.assertFalse(freshness.accept({'frame': 1, 'producerId': 1, 'coordinateFrame': 'AvatarRootLocal'}, 0))
        self.assertTrue(freshness.accept({'frame': 2, 'producerId': 1, 'coordinateFrame': 'AvatarRootLocal'}, .01))
        self.assertFalse(freshness.accept({'frame': 3, 'producerId': 2, 'coordinateFrame': 'AvatarRootLocal'}, .02))
        self.assertFalse(freshness.accept({'frame': 4, 'producerId': 2, 'coordinateFrame': 'AvatarRootLocal'}, .03))

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
        result = subprocess.run([sys.executable, str(Path(bridge.__file__)), '--region', '0', '0', '80', '48',
                                 '--port', '19001'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Screen-to-OSC requires --producer-id', result.stderr)
