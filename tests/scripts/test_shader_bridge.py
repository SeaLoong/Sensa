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
        def value(x, y):
            column, row = x * 40 // width, 31 - y * 32 // height
            if column < 4 or column >= 36 or row < 4 or row >= 28:
                return bridge.edge_bit(column, row)
            copy, bit = divmod(row - 4, 8)
            return packet[(column - 4 + copy * 11) % 32] & (1 << bit)
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


class NativeRootCaptureContracts(LabFixture):
    WIDTH, HEIGHT = 320, 256

    @staticmethod
    def image(**kwargs):
        return pixels(flags=3, producer_id=42, **kwargs)

    @staticmethod
    def obscure(image, cells, width=320, height=256, color=(128, 128, 128)):
        result = image.copy()
        for column, row in cells:
            for y in range((31 - row) * height // 32, (32 - row) * height // 32):
                for x in range(column * width // 40, (column + 1) * width // 40):
                    result[y * width + x] = color
        return result

    def test_native_fixed_golden_packet_and_bitmap_are_independent_of_the_test_encoder(self):
        path = Path(bridge.__file__).parents[1] / 'tests/fixtures/shader-native-format1.json'
        golden = json.loads(path.read_text(encoding='utf-8'))
        self.assertEqual(golden['packetHex'], '534E010300010080008000802A0000100000000000000000001000203E569803')
        packet = bytes.fromhex(golden['packetHex'])
        self.assertEqual(binascii.crc32(packet[:28]), int.from_bytes(packet[28:], 'little'))
        image = [(255, 255, 255) if golden['screenRows'][y // 4][x // 4] == '1' else (0, 0, 0)
                 for y in range(128) for x in range(160)]
        sample = bridge.decode_pixels(image, 160, 128)
        for key in ('frame', 'producerId', 'coordinateFrame'): self.assertEqual(sample[key], golden['expected'][key])
        for key in ('xyz', 'right', 'forward'):
            for actual, expected in zip(sample[key], golden['expected'][key]): self.assertAlmostEqual(actual, expected, delta=1e-12)
        self.assertAlmostEqual(sample['avatarScale'], golden['expected']['avatarScale'], delta=1e-12)

    def test_ci_native_png_fixtures_advance_and_recover_the_erased_band_without_capture(self):
        fixture = smoke.native_fixture()
        image = smoke.native_pixels(256)
        for y in range(128):
            for x in range(160):
                expected = 255 if fixture['screenRows'][y // 4][x // 4] == '1' else 0
                self.assertEqual(image[y * 160 + x], (expected,) * 3)
        first = bridge.decode_pixels(image, 160, 128)
        freshness = bridge.Freshness(.35, producer_id=42)
        self.assertFalse(freshness.accept(first, 0))
        next_frame = bridge.decode_pixels(smoke.native_pixels(257, erased_copy=1), 160, 128)
        self.assertTrue(freshness.accept(next_frame, .08))
        self.assertEqual(next_frame, {**first, 'frame': 257})
        self.assertEqual(smoke.NATIVE_FIELDS, ('Frame', 'X', 'Y', 'Z', 'RightX', 'RightY', 'RightZ',
                                             'ForwardX', 'ForwardY', 'ForwardZ', 'AvatarScale', 'Valid'))

    def test_native_shader_template_matches_the_frozen_grid_bit_mapping_and_crc(self):
        template = (Path(bridge.__file__).parents[1] / 'unity/top.sealoong.sensa/Editor/SensaRootTelemetry.shader.txt').read_text(encoding='utf-8')
        compact = ''.join(template.split())
        for expression in (
                'uintcolumn=min((uint)(input.uv.x*40),39u),row=min((uint)(input.uv.y*32),31u);',
                'if(column<2u||column>=38u||row<2u||row>=30u)value=1u;',
                'value=((0xD3A69C57u>>((column+28u)&31u))&1u)^(row-2u);',
                'value=((0x69C57D3Au>>((column+28u)&31u))&1u)^(row-28u);',
                'value=((0xA5D36Bu>>(row-4u))&1u)^(column-2u);',
                'value=((0x6E29C7u>>(row-4u))&1u)^(column-36u);',
                'uintbank=(row-4u)/8u,bit=(row-4u)%8u;',
                'uintbyteIndex=((column-4u)+bank*11u)%32u;',
                'value=(word>>((byteIndex&3u)*8u+bit))&1u;',
                'for(uinti=0;i<28;i++)', '0xEDB88320u', 'crc^=0xFFFFFFFFu;',
                'bytes[26]=qScale&255u;bytes[27]=qScale>>8;'):
            with self.subTest(expression=expression): self.assertIn(expression, compact)

    def test_position_basis_scale_quantization_identity_and_vertical_orientation(self):
        for producer in (1, 42, 65535):
            for target in ((0, 1, 0), (.2, 1.8, .1), (-2, -1, -2), (2, 3, 2)):
                with self.subTest(producer=producer, xyz=target):
                    image = pixels(xyz=target, flags=3, producer_id=producer,
                                   right=(.5, .25, 0), forward=(-.25, 0, 1.5), avatar_scale=1.25)
                    sample = bridge.decode_pixels(image, 320, 256)
                    self.assertEqual(sample['producerId'], producer)
                    self.assertEqual(sample['coordinateFrame'], 'AvatarRootLocal')
                    for actual, expected in zip(sample['xyz'], target):
                        self.assertAlmostEqual(actual, expected, delta=2 / 65535 + 1e-12)
                    for key, values in (('right', (.5, .25, 0)), ('forward', (-.25, 0, 1.5))):
                        for actual, expected in zip(sample[key], values):
                            self.assertAlmostEqual(actual, expected, delta=4 / 32767)
                    self.assertAlmostEqual(sample['avatarScale'], 1.25, delta=4 / 65535)
                    flipped = [pixel for y in reversed(range(256)) for pixel in image[y * 320:(y + 1) * 320]]
                    self.assertEqual(bridge.decode_pixels(flipped, 320, 256), sample)

    def test_two_white_guard_modules_buffer_two_module_diagonal_displacement(self):
        for width, height in ((160, 128), (240, 192), (320, 256)):
            image = self.image(width=width, height=height)
            expected = bridge.decode_pixels(image, width, height)
            for dx, dy in ((0, 0), (width // 20, height // 16), (-width // 20, -height // 16),
                           (width // 20, -height // 16)):
                shifted = [(80, 80, 80)] * (width * height)
                for y in range(height):
                    for x in range(width):
                        if 0 <= x + dx < width and 0 <= y + dy < height:
                            shifted[(y + dy) * width + x + dx] = image[y * width + x]
                with self.subTest(size=(width, height), shift=(dx, dy)):
                    self.assertEqual(bridge.decode_pixels(shifted, width, height), expected)
            # Quiet modules are real white pixels, even where the packet is all zero.
            for y in range(height):
                for x in range(width):
                    if x * 40 < width * 2 or x * 40 >= width * 38 or y * 32 < height * 2 or y * 32 >= height * 30:
                        self.assertEqual(image[y * width + x], (255, 255, 255))

    def test_erased_cells_are_reconstructed_only_from_consistent_same_capture_replicas(self):
        image = self.image()
        expected = bridge.decode_pixels(image, 320, 256)
        for copy in range(3):
            # A whole payload band can disappear; the other two still contain the packet.
            erased = self.obscure(image, [(x, y) for x in range(4, 36) for y in range(4 + copy * 8, 12 + copy * 8)])
            with self.subTest(erased_copy=copy):
                self.assertEqual(bridge.decode_pixels(erased, 320, 256), expected)
        # Each data byte can lose two replicas at different screen locations.
        cells = []
        for byte in range(32):
            for copy in (byte % 3, (byte + 1) % 3):
                cells += [((byte - copy * 11) % 32 + 4, bit + copy * 8 + 4) for bit in range(8)]
        self.assertEqual(bridge.decode_pixels(self.obscure(image, cells), 320, 256), expected)
        missing_all = [((7 - copy * 11) % 32 + 4, 5 + copy * 8) for copy in range(3)]
        with self.assertRaises(ValueError):
            bridge.decode_pixels(self.obscure(image, missing_all), 320, 256)

    def test_binary_conflicts_mixed_frames_and_crc_damage_are_rejected_without_majority_guessing(self):
        image = self.image()
        for byte in (4, 6, 14, 26, 28):
            # Flipping even one observed replica is a conflict, not an erasure.
            x, row = byte + 4, 4
            screen_y = (31 - row) * 8
            pixel = image[screen_y * 320 + x * 8]
            damage = self.obscure(image, [(x, row)], color=tuple(255 - value for value in pixel))
            with self.subTest(byte=byte), self.assertRaises(ValueError):
                bridge.decode_pixels(damage, 320, 256)
        next_frame = self.image(frame=257, xyz=(1, 0, 1))
        for copy in range(3):
            splice = image.copy()
            for row in range(4 + copy * 8, 12 + copy * 8):
                y = (31 - row) * 8
                for line in range(y, y + 8):
                    splice[line * 320 + 32:line * 320 + 288] = next_frame[line * 320 + 32:line * 320 + 288]
            with self.subTest(mixed_copy=copy), self.assertRaises(ValueError):
                bridge.decode_pixels(splice, 320, 256)
        # Identically flipping all three copies bypasses the agreement test but fails CRC32.
        byte, bit = 6, 0
        damaged = image.copy()
        for copy in range(3):
            x, y = (byte - copy * 11) % 32 + 4, bit + copy * 8 + 4
            original = image[(31 - y) * 8 * 320 + x * 8]
            damaged = self.obscure(damaged, [(x, y)], color=tuple(255 - value for value in original))
        with self.assertRaises(ValueError):
            bridge.decode_pixels(damaged, 320, 256)

    def test_markers_allow_one_lost_side_but_not_two_lost_sides(self):
        image = self.image(); expected = bridge.decode_pixels(image, 320, 256)
        sides = {'bottom': [(x, y) for x in range(2, 38) for y in (2, 3)],
                 'top': [(x, y) for x in range(2, 38) for y in (28, 29)],
                 'left': [(x, y) for x in (2, 3) for y in range(4, 28)],
                 'right': [(x, y) for x in (36, 37) for y in range(4, 28)]}
        for side, cells in sides.items():
            with self.subTest(side=side):
                self.assertEqual(bridge.decode_pixels(self.obscure(image, cells), 320, 256), expected)
        names = list(sides)
        for index, first in enumerate(names):
            for second in names[index + 1:]:
                with self.subTest(sides=(first, second)), self.assertRaises(ValueError):
                    bridge.decode_pixels(self.obscure(image, sides[first] + sides[second]), 320, 256)

    def test_native_source_validity_basis_degeneracy_and_quantization_limits_are_checked(self):
        for flags, producer in ((0, 0), (2, 42), (3, 0), (5, 42), (7, 42)):
            with self.subTest(flags=flags, producer=producer), self.assertRaises(ValueError):
                bridge.decode_pixels(pixels(xyz=(0, 1, 0), flags=flags, producer_id=producer), 320, 256)
        for patch in ({'right': (0, 0, 0)}, {'forward': (0, 0, 0)}, {'forward': (2, 0, 0)}, {'avatar_scale': 0}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                bridge.decode_pixels(self.image(**patch), 320, 256)
        # Reserved signed -32768 is not an alias for the physical -8 boundary.
        golden = json.loads((Path(bridge.__file__).parents[1] / 'tests/fixtures/shader-native-format1.json').read_text())
        packet = bytearray.fromhex(golden['packetHex']); struct.pack_into('<h', packet, 14, -32768)
        struct.pack_into('<I', packet, 28, binascii.crc32(packet[:28]))
        self.assertIsNone(bridge._packet(packet, native=True))

    def test_capture_minimum_size_and_no_unframed_native_fallback(self):
        for width, height in ((80, 48), (159, 128), (160, 127)):
            with self.subTest(size=(width, height)), self.assertRaises(ValueError):
                bridge.decode_pixels(self.image(width=width, height=height), width, height)
        with self.assertRaises(ValueError): bridge.capture_registration([0, 0, 80, 48], 42)
        image = self.image()
        unframed = [image[y * 320 + x] for y in range(32, 224) for x in range(32, 288)]
        with self.assertRaises(ValueError): bridge.decode_pixels(unframed, 256, 192)
        with self.assertRaises(ValueError): bridge.decode_pixels(image[:-1], 320, 256)
        noise = [(255, 255, 255) if (x * 13 + y * 7) % 5 < 2 else (0, 0, 0)
                 for y in range(256) for x in range(320)]
        with self.assertRaises(ValueError): bridge.decode_pixels(noise, 320, 256)
        tinted = [(255, 0, 0) if red else (0, 0, 0) for red, _, _ in image]
        with self.assertRaises(ValueError): bridge.decode_pixels(tinted, 320, 256)
        shifted = [(80, 80, 80)] * (320 * 256)
        for y in range(256): shifted[y * 320 + 24:(y + 1) * 320] = image[y * 320:y * 320 + 296]
        with self.assertRaises(ValueError): bridge.decode_pixels(shifted, 320, 256)

    def test_same_clock_with_changed_basis_or_scale_closes_freshness_and_requires_two_new_ticks(self):
        initial = bridge.decode_pixels(self.image(frame=1), 320, 256)
        freshness = bridge.Freshness(.35, producer_id=42)
        self.assertFalse(freshness.accept(initial, 0))
        self.assertTrue(freshness.accept({**initial, 'frame': 2}, .01))
        self.assertFalse(freshness.accept({**initial, 'frame': 2, 'right': [0, 1, 0]}, .02))
        self.assertFalse(freshness.accept({**initial, 'frame': 3}, .03))
        self.assertTrue(freshness.accept({**initial, 'frame': 4}, .04))
        self.assertFalse(freshness.accept({**initial, 'frame': 4, 'avatarScale': 2}, .05))

    def test_native_osc_fields_form_one_ordered_complete_commit_and_invalid_republishes_no_measurement(self):
        sample = bridge.decode_pixels(self.image(), 320, 256)
        values = osc_values(bridge.osc_bundle(sample, True)); prefix = '/avatar/parameters/Sensa/Shader/42/'
        fields = ('Frame', 'X', 'Y', 'Z', 'RightX', 'RightY', 'RightZ', 'ForwardX', 'ForwardY', 'ForwardZ', 'AvatarScale', 'Valid')
        self.assertEqual(list(values), [prefix + field for field in fields])
        for axis in 'YZ': self.assertEqual(values[prefix + 'Right' + axis], 0)
        self.assertAlmostEqual(values[prefix + 'AvatarScale'], sample['avatarScale'], places=6)
        for old in (None, sample):
            self.assertEqual(osc_values(bridge.osc_bundle(old, False, producer_id=42, native=True)), {prefix + 'Valid': 0})
        for producer in (0, -1, 65536):
            with self.subTest(producer=producer), self.assertRaisesRegex(ValueError, 'nonzero producer ID'):
                bridge.osc_bundle(None, False, producer_id=producer, native=True)

    def test_registered_identity_and_coordinate_profile_never_silently_retarget(self):
        initial = bridge.decode_pixels(self.image(frame=10), 320, 256)
        freshness = bridge.Freshness(.35, producer_id=42)
        self.assertFalse(freshness.accept(initial, 0)); self.assertTrue(freshness.accept({**initial, 'frame': 11}, .01))
        self.assertFalse(freshness.accept({**initial, 'frame': 12, 'producerId': 43}, .02))
        self.assertFalse(freshness.accept({**initial, 'frame': 12}, .03))
        self.assertTrue(freshness.accept({**initial, 'frame': 13}, .04))
        with self.assertRaisesRegex(ValueError, 'Diagnostic telemetry requires producer ID zero'):
            bridge.decode_pixels(pixels(flags=1, producer_id=42), 320, 256)
        with self.assertRaisesRegex(ValueError, 'native avatar-root coordinate profile'):
            bridge.validate_source({'producerId': 42}, 42)
        registration = bridge.capture_registration((-1440, 200, 320, 256), 42)
        path = self.write(self.root / 'capture.json', json.dumps(registration))
        self.assertEqual(bridge.load_registration(path), registration)
        for patch in ({'producerId': 0}, {'center': [0, 0, 0]}, {'halfRange': 1}, {'coordinateFrame': 'World'},
                      {'region': None}, {'region': [0, 0, 80, 48]}):
            path.write_text(json.dumps({**registration, **patch}), encoding='utf-8')
            with self.subTest(patch=patch), self.assertRaises(ValueError): bridge.load_registration(path)

    def test_screen_output_requires_identity_before_capture_or_socket_and_rejects_undersized_roi(self):
        for size in ((160, 128), (80, 48)):
            result = subprocess.run([sys.executable, str(Path(bridge.__file__)), '--region', '0', '0', *map(str, size),
                                     '--port', '19001'], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Screen-to-OSC requires --producer-id' if size == (160, 128) else 'Invalid capture rectangle size', result.stderr)
