"""Isolated protocol codecs, lifecycle, mock BLE and real local PTY; never actuate hardware."""
import asyncio
from contextlib import suppress
from enum import Flag
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'tools/protocol-bridge/bridge.py'
SPEC = importlib.util.spec_from_file_location('sensa_protocol_bridge', SCRIPT)
bridge = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = bridge
SPEC.loader.exec_module(bridge)


class ProtocolCodecTests(unittest.TestCase):
    def test_captured_website_format_loob_big_endian_position_duration(self):
        codec = bridge.PROTOCOLS['loob']
        self.assertEqual(codec.encode(.5, 1234), bytes.fromhex('01f404d2'))
        self.assertEqual(codec.decode(bytes.fromhex('03e8ffff')), (1, 65535))
        self.assertEqual(codec.encode(0, 0), bytes.fromhex('00010000'))
        self.assertEqual(bridge.tcode_move(*codec.decode(bytes.fromhex('01f404d2'))), b'L0500I1234\n')

    def test_captured_website_format_thrust_sync(self):
        codec = bridge.PROTOCOLS['thrust-sync']
        self.assertEqual(codec.encode(.5, 1234), bytes.fromhex('5a04d2'))
        self.assertEqual(codec.decode(bytes.fromhex('b4ffff')), (1, 65535))
        self.assertEqual(codec.encode(0, 0), bytes.fromhex('000000'))
        self.assertEqual(bridge.tcode_move(*codec.decode(bytes.fromhex('5a04d2'))), b'L0500I1234\n')

    def test_invalid_length_range_and_nonfinite_values_are_rejected(self):
        for name, codec in bridge.PROTOCOLS.items():
            for packet in (b'', b'\xff' * codec.packet_size, b'\0' * (codec.packet_size + 1)):
                with self.subTest(name=name, packet=packet), self.assertRaises(ValueError):
                    codec.decode(packet)
            for position in (-1, 2, float('nan'), float('inf')):
                with self.assertRaises(ValueError):
                    codec.encode(position, 100)
            for duration in (-1, 65536, 1.5):
                with self.assertRaises(ValueError):
                    codec.encode(.5, duration)

    def test_tcode_decimal_precision_and_only_supported_semantics(self):
        for token, position in ((b'L05I123', .5), (b'L050I123', .5), (b'L0500I123', .5), (b'L05000I123', .5)):
            self.assertEqual(bridge.parse_tcode_move(token), (position, 123))
        self.assertEqual(bridge.parse_tcode_move(b'L0999'), (.999, 100))
        self.assertIsNone(bridge.parse_tcode_move(bridge.STOP))
        for token in (b'L0500S100', b'L1500I100', b'L0500I100 R0500', b'L0500I65536', b'L0500I100=', b'V0100', b'\xff'):
            with self.subTest(token=token), self.assertRaises(ValueError):
                bridge.parse_tcode_move(token)

    def test_framer_handles_fragmentation_crlf_and_clears_on_invalid_input(self):
        framer = bridge.LineFramer()
        self.assertEqual(framer.feed(b'L05'), [])
        self.assertEqual(framer.feed(b'00I12\r\nL0999\n'), [b'L0500I12\n', b'L0999\n'])
        framer.feed(b'L050')
        framer.clear()
        self.assertEqual(framer.feed(b'L0100\n'), [b'L0100\n'])
        for data in (b'\x00', b'x' * 1025):
            with self.assertRaises(ValueError):
                framer.feed(data)
            self.assertEqual(framer.buffer, b'')

    def test_endpoint_rejects_credentials_path_and_invalid_port(self):
        self.assertEqual(bridge.endpoint('tcp://127.0.0.1:12401'), ('127.0.0.1', 12401))
        for value in ('http://localhost:80', 'tcp://u:p@localhost:80', 'tcp://localhost:80/path',
                      'tcp://localhost', 'tcp://localhost:99999', 'tcp://localhost:80?q=x'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                bridge.endpoint(value)

    def test_idle_grace_starts_after_the_longest_valid_timed_move(self):
        self.assertEqual(bridge.inactivity_window(b'L0500I5000\n', 2), 7)
        self.assertEqual(bridge.inactivity_window(b'L0500I5000 R0100I10000<>\n', 2), 12)
        self.assertEqual(bridge.inactivity_window(b'DSTOP\n', 2), 2)
        self.assertEqual(bridge.inactivity_window(b'garbageI65000 L0500I99999\n', 2), 2)

    def test_cli_help_and_check_do_not_import_or_open_optional_backends(self):
        for args in (['--help'], ['--check'], ['ble-input', '--check'], ['serial-input', '--help']):
            result = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode, 0, result.stderr)
            if '--check' in args:
                self.assertFalse(json.loads(result.stdout)['hardwareProbed'])


class FakeSink:
    def __init__(self):
        self.lines = []
        self.closed = False
        self.received = asyncio.Event()

    async def send(self, line):
        self.lines.append(line)
        self.received.set()

    async def close(self):
        self.closed = True


class AsyncLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_tcp_stop_preempts_queued_ble_moves_while_a_write_is_blocked(self):
        started = asyncio.Event()
        delivered = []
        class Reader:
            def __init__(self):
                self.calls = 0
            async def read(self, count):
                self.calls += 1
                if self.calls == 1:
                    return b'L0500I200\nL0900I200\n'
                await started.wait()
                return bridge.STOP
        class Output:
            async def send(self, line):
                delivered.append(line)
                started.set()
                await asyncio.Event().wait()
        await asyncio.wait_for(bridge.pump_ble_output(Reader(), Output(), 2, asyncio.Event()), .5)
        self.assertEqual(delivered, [b'L0500I200\n'])

    async def test_fragmented_tcp_bytes_cannot_extend_idle_without_a_complete_new_move(self):
        now = [0.]
        class Reader:
            async def read(self, count):
                now[0] += .6
                return b'L0'
        output = FakeSink()
        with self.assertRaises(asyncio.TimeoutError):
            await bridge.pump_ble_output(Reader(), output, 1, asyncio.Event(), clock=lambda: now[0])
        self.assertEqual(output.lines, [])
        self.assertAlmostEqual(now[0], 1.2)

    async def test_forward_waits_for_a_long_command_interval_before_idle_grace(self):
        class Mailbox(bridge.Mailbox):
            def __init__(self, loop):
                super().__init__(loop)
                self.takes = 0
            async def get_entry(self):
                self.takes += 1
                if self.takes == 2:
                    self.disable(close=True)
                return await super().get_entry()
        mailbox = Mailbox(asyncio.get_running_loop())
        mailbox.put(b'L0500I5000\n')
        sink = FakeSink()
        timeouts = []
        original = asyncio.wait_for
        async def wait_for(awaitable, timeout):
            timeouts.append(timeout)
            return await original(awaitable, timeout)
        with mock.patch.object(bridge.asyncio, 'wait_for', side_effect=wait_for):
            await bridge.forward(mailbox, sink, idle=2)
        self.assertEqual(timeouts[:2], [2, 7])
    async def test_stop_clears_queued_moves_before_a_new_command(self):
        mailbox = bridge.Mailbox(asyncio.get_running_loop())
        mailbox.put(b'L0900I100\n')
        mailbox.put(bridge.STOP)
        mailbox.put(b'L0100I100\n')
        self.assertEqual(await mailbox.get(), bridge.STOP)
        self.assertEqual(await mailbox.get(), b'L0100I100\n')

    async def test_disable_between_dequeue_and_transport_send_cannot_deliver_old_move(self):
        class Mailbox(bridge.Mailbox):
            async def get_entry(self):
                entry = await super().get_entry()
                if entry[1] != bridge.STOP:
                    self.disable(close=True)
                return entry
        mailbox = Mailbox(asyncio.get_running_loop())
        sink = FakeSink()
        mailbox.put(b'L0900I100\n')
        await asyncio.wait_for(bridge.forward(mailbox, sink), .5)
        self.assertTrue(sink.lines)
        self.assertTrue(all(line == bridge.STOP for line in sink.lines))

    async def test_disable_discards_pending_generation_and_no_replay_on_enable(self):
        mailbox = bridge.Mailbox(asyncio.get_running_loop())
        mailbox.put(b'L0900I100\n')
        mailbox.disable()
        self.assertFalse(mailbox.put(b'L0800I100\n'))
        self.assertTrue(mailbox.enable())
        mailbox.put(b'L0100I100\n')
        self.assertEqual(await mailbox.get(), bridge.STOP)
        self.assertEqual(await mailbox.get(), b'L0100I100\n')
        mailbox.disable(close=True)
        self.assertFalse(mailbox.enable())
        self.assertFalse(mailbox.put(b'L0500I1\n'))
        self.assertEqual(await mailbox.get(), bridge.STOP)

    async def test_overflow_fails_closed_with_bounded_queue(self):
        mailbox = bridge.Mailbox(asyncio.get_running_loop(), capacity=2)
        mailbox.put(b'L0100\n')
        mailbox.put(b'L0200\n')
        self.assertFalse(mailbox.put(b'L0900\n'))
        self.assertEqual(len(mailbox.pending), 1)
        self.assertFalse(mailbox.enable())
        self.assertEqual(await mailbox.get(), bridge.STOP)
        self.assertIn('overflow', mailbox.error)

    async def test_forward_stop_and_cleanup_without_reconnecting(self):
        mailbox = bridge.Mailbox(asyncio.get_running_loop())
        sink = FakeSink()
        task = asyncio.create_task(bridge.forward(mailbox, sink))
        mailbox.put(b'L0500I100\n')
        await asyncio.wait_for(sink.received.wait(), .5)
        mailbox.disable(close=True)
        await asyncio.wait_for(task, .5)
        self.assertEqual(sink.lines[0], b'L0500I100\n')
        self.assertTrue(all(line == bridge.STOP for line in sink.lines[1:]))
        self.assertTrue(sink.closed)

    async def test_idle_sends_one_stop_until_new_data(self):
        mailbox = bridge.Mailbox(asyncio.get_running_loop())
        sink = FakeSink()
        task = asyncio.create_task(bridge.forward(mailbox, sink, idle=.01))
        await asyncio.wait_for(sink.received.wait(), .5)
        self.assertEqual(sink.lines, [bridge.STOP])
        sink.received.clear()
        mailbox.put(b'L0600I50\n')
        await asyncio.wait_for(sink.received.wait(), .5)
        self.assertEqual(sink.lines[1], b'L0600I50\n')
        mailbox.disable(close=True)
        await asyncio.wait_for(task, .5)

    async def test_tcp_failure_is_terminal_and_never_replayed(self):
        sink = bridge.TcpSink('tcp://127.0.0.1:12401')
        class Reader:
            def at_eof(self):
                return False
        class Writer:
            def __init__(self):
                self.lines = []
            def write(self, line):
                self.lines.append(line)
            async def drain(self):
                raise ConnectionResetError('isolated failure')
            def close(self):
                pass
            async def wait_closed(self):
                pass
        writer = Writer()
        sink.reader, sink.writer = Reader(), writer
        with self.assertRaises(ConnectionResetError):
            await sink.send(b'L0500\n')
        self.assertTrue(sink.failed)
        with self.assertRaises(RuntimeError):
            await sink.send(b'L0999\n')
        with self.assertRaises(RuntimeError):
            await sink.connect()
        self.assertEqual(writer.lines, [b'L0500\n'])

    async def test_mock_ble_output_encoding_stop_and_disconnect(self):
        class Client:
            is_connected = True
            def __init__(self):
                self.writes = []
            async def write_gatt_char(self, uuid, data, *, response):
                self.writes.append((uuid, data, response))
            async def disconnect(self):
                self.is_connected = False
        client = Client()
        codec = bridge.PROTOCOLS['loob']
        output = bridge.BleOutput(client, codec)
        await output.send(b'L0500I1234\n')
        self.assertEqual(client.writes, [(codec.characteristic, bytes.fromhex('01f404d2'), False)])
        await output.send(bridge.STOP)
        self.assertEqual(len(client.writes), 1)  # no position zero or guessed stop opcode
        self.assertIsNone(output.last)
        await output.stop()
        self.assertFalse(client.is_connected)
        with self.assertRaises(ConnectionError):
            await output.send(b'L0999I1\n')

    async def test_ble_write_timeout_marks_terminal_failure(self):
        class Client:
            is_connected = True
            def __init__(self):
                self.calls = 0
            async def write_gatt_char(self, *args, **kwargs):
                self.calls += 1
                await asyncio.Event().wait()
        client = Client()
        output = bridge.BleOutput(client, bridge.PROTOCOLS['thrust-sync'], timeout=.01)
        with self.assertRaises(asyncio.TimeoutError):
            await output.send(b'L0500I100\n')
        with self.assertRaises(ConnectionError):
            await output.send(b'L0900I100\n')
        self.assertEqual(client.calls, 1)
        self.assertIsNone(output.last)

    async def test_bless_registers_real_write_without_response_and_exact_uuids(self):
        class Properties(Flag):
            write = 1
            write_without_response = 2
        created = []
        class Server:
            def __init__(self, **kwargs):
                self.kwargs = kwargs
                self.services = []
                self.characteristics = []
                self.stopped = False
                self.app = types.SimpleNamespace(set_name=mock.AsyncMock(side_effect=AssertionError('must not modify adapter Alias')))
                created.append(self)
            async def add_new_service(self, uuid):
                self.services.append(uuid)
            async def add_new_characteristic(self, *args):
                self.characteristics.append(args)
            async def start(self):
                if sys.platform.startswith('linux'):
                    await self.app.set_name('adapter', self.kwargs['name'])
                return True
            async def stop(self):
                self.stopped = True
        fake = types.SimpleNamespace(BlessServer=Server, GATTCharacteristicProperties=Properties,
                                     GATTAttributePermissions=types.SimpleNamespace(writable=1))
        args = types.SimpleNamespace(protocol='loob', adapter=None)
        received, disconnected = [], []
        peripheral = bridge.BlessPeripheral(args, received.append, lambda: disconnected.append(True))
        with mock.patch.object(bridge, 'optional_import', return_value=fake):
            await peripheral.start()
        server = created[0]
        codec = bridge.PROTOCOLS['loob']
        self.assertEqual(server.kwargs['name'], 'LOOB Sensa')
        self.assertEqual(server.services, [codec.service])
        self.assertEqual(server.characteristics[0][:3], (codec.service, codec.characteristic,
                                                         Properties.write | Properties.write_without_response))
        server.write_request_func(None, bytes.fromhex('01f404d2'))
        self.assertEqual(received, [bytes.fromhex('01f404d2')])
        await peripheral.stop()
        self.assertTrue(server.stopped)

    async def test_mock_serial_disabled_bytes_and_partial_line_are_dropped(self):
        mailbox = bridge.Mailbox(asyncio.get_running_loop())
        framer = bridge.LineFramer()
        shutdown = asyncio.Event()
        class Port:
            def __init__(self):
                self.index = 0
            async def read(self):
                self.index += 1
                if self.index == 1:
                    return b'L05'
                if self.index == 2:
                    mailbox.disable()
                    return b'00I100\n'
                if self.index == 3:
                    mailbox.enable()
                    return b'L0100I100\n'
                mailbox.disable(close=True)
                shutdown.set()
                return b''
        # Observe accepted lines independently from the subsequent final stop.
        accepted = []
        original = mailbox.put
        def put(line):
            accepted.append(line)
            return original(line)
        mailbox.put = put
        await bridge.pump_serial(Port(), mailbox, framer, shutdown)
        self.assertEqual(accepted, [b'L0100I100\n'])


@unittest.skipIf(os.name == 'nt', 'PTY exists only on Unix-like platforms')
class LocalPtyTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_pty_raw_bytes_and_disconnect(self):
        with bridge.PseudoSerialPort() as port:
            slave = os.open(port.path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
            try:
                os.write(slave, b'L0500I123\n')
                data = await asyncio.wait_for(port.read(), .5)
                self.assertEqual(data, b'L0500I123\n')
                # Raw mode prevents echoing the peer's bytes back to it.
                with self.assertRaises(BlockingIOError):
                    os.read(slave, 4096)
            finally:
                os.close(slave)
            self.assertEqual(await asyncio.wait_for(port.read(), .5), b'')

    async def test_symlink_lifecycle_and_existing_path_ownership(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'virtual-serial'
            with bridge.PseudoSerialPort(path) as port:
                self.assertTrue(path.is_symlink())
                self.assertEqual(os.readlink(path), port.path)
            self.assertFalse(path.is_symlink())
            path.write_text('owned by user')
            with self.assertRaises(FileExistsError):
                with bridge.PseudoSerialPort(path):
                    pass
            self.assertEqual(path.read_text(), 'owned by user')

    async def test_existing_symlink_is_not_removed_when_creation_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'user-link'
            path.symlink_to('user-owned-target')
            with self.assertRaises(FileExistsError):
                with bridge.PseudoSerialPort(path):
                    pass
            self.assertTrue(path.is_symlink())
            self.assertEqual(os.readlink(path), 'user-owned-target')


if __name__ == '__main__':
    unittest.main()
