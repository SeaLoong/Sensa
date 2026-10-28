#!/usr/bin/env python3
"""Optional serial/BLE protocol bridges. No Sensa process or hardware starts on import."""
from __future__ import annotations

import argparse
import asyncio
from collections import deque
from contextlib import suppress
from dataclasses import dataclass
import importlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import struct
import sys
import threading
from urllib.parse import urlsplit

STOP = b'DSTOP\n'
MAX_LINE = 1024


@dataclass(frozen=True)
class BleProtocol:
    name: str
    service: str
    characteristic: str
    advertised_name: str
    maximum: int
    packet_size: int

    def decode(self, packet: bytes) -> tuple[float, int]:
        if len(packet) != self.packet_size:
            raise ValueError(f'{self.name}: expected {self.packet_size} bytes')
        position, duration = struct.unpack('>HH' if self.packet_size == 4 else '>BH', packet)
        if not (1 if self.name == 'loob' else 0) <= position <= self.maximum:
            raise ValueError(f'{self.name}: position outside protocol range')
        return position / self.maximum, duration

    def encode(self, position: float, duration: int) -> bytes:
        if not math.isfinite(position) or not 0 <= position <= 1:
            raise ValueError('Position must be finite and within 0..1')
        if not isinstance(duration, int) or not 0 <= duration <= 65535:
            raise ValueError('BLE duration must be an integer within 0..65535 ms')
        value = max(1 if self.name == 'loob' else 0, min(self.maximum, round(position * self.maximum)))
        return struct.pack('>HH' if self.packet_size == 4 else '>BH', value, duration)


PROTOCOLS = {
    'loob': BleProtocol('loob', 'b75c49d2-04a3-4071-a0b5-35853eb08307',
                        'ba5c49d2-04a3-4071-a0b5-35853eb08307', 'LOOB Sensa', 1000, 4),
    'thrust-sync': BleProtocol('thrust-sync', '0000ffe0-0000-1000-8000-00805f9b34fb',
                               '0000ffe1-0000-1000-8000-00805f9b34fb', 'Erojoy Thrust Sync', 180, 3),
}


def tcode_move(position: float, duration: int) -> bytes:
    """TCode decimal magnitude: three digits represent thousandths, 999 is its limit."""
    if not math.isfinite(position) or not 0 <= position <= 1 or not 0 <= duration <= 65535:
        raise ValueError('Invalid linear move')
    magnitude = min(999, round(position * 1000))
    return f'L0{magnitude:03}I{duration}\n'.encode('ascii')


def parse_tcode_move(line: bytes, default_duration: int = 100) -> tuple[float, int] | None:
    """The two BLE protocols represent L0 position + duration only; reject other semantics."""
    text = line.decode('ascii').strip()
    if text == 'DSTOP':
        return None
    match = re.fullmatch(r'L0([0-9]{1,5})(?:I([0-9]{1,5}))?', text)
    if not match:
        raise ValueError('BLE output accepts only one L0 position with optional I duration; use Interval slope and ignore other axes')
    digits, interval = match.groups()
    duration = int(interval) if interval is not None else default_duration
    if duration > 65535:
        raise ValueError('BLE duration exceeds 65535 ms')
    return int(digits) / 10 ** len(digits), duration


def inactivity_window(line: bytes, idle: float) -> float:
    """A timed movement remains live during its interval, then receives the idle grace."""
    intervals = re.findall(rb'(?:^|\s)[LRVA][0-9][0-9]{1,5}I([0-9]{1,5})(?:[=<>]*)(?=\s|$)', line.strip())
    duration = max((int(value) for value in intervals if int(value) <= 65535), default=0)
    return idle + duration / 1000


class LineFramer:
    """Bounded framing; a partial pre-disable line must never join post-enable bytes."""
    def __init__(self):
        self.buffer = bytearray()

    def clear(self):
        self.buffer.clear()

    def feed(self, data: bytes) -> list[bytes]:
        if any(c not in (9, 10, 13) and not 32 <= c <= 126 for c in data):
            self.clear()
            raise ValueError('Serial/TCode input must contain printable ASCII')
        result = []
        for byte in data:
            if byte == 10:
                line = bytes(self.buffer).strip()
                self.clear()
                if line:
                    result.append(line + b'\n')
            elif byte != 13:
                self.buffer.append(byte)
                if len(self.buffer) > MAX_LINE:
                    self.clear()
                    raise ValueError('TCode line exceeds 1024 bytes')
        return result


class Mailbox:
    """Thread-safe bounded ingress; disable invalidates pending work before stop delivery."""
    def __init__(self, loop, capacity=64):
        self.loop = loop
        self.capacity = capacity
        self.event = asyncio.Event()
        self.lock = threading.Lock()
        self.pending = deque()
        self.enabled = True
        self.closed = False
        self.generation = 0
        self.error = None
        self.notified = False

    def _wake(self):
        if not self.notified:
            self.notified = True
            self.loop.call_soon_threadsafe(self.event.set)

    def put(self, line: bytes):
        with self.lock:
            if self.closed or not self.enabled:
                return False
            if line == STOP:
                self.generation += 1
                self.pending.clear()
            if len(self.pending) >= self.capacity:
                self.pending.clear()
                self.enabled = False
                self.generation += 1
                self.error = 'Input queue overflow; stopped. Restart bridge after diagnosing producer rate.'
                self.pending.append((self.generation, STOP))
            else:
                self.pending.append((self.generation, line))
            self._wake()
            return self.error is None

    def disable(self, *, close=False):
        with self.lock:
            self.enabled = False
            self.closed |= close
            self.generation += 1
            self.pending.clear()
            self.pending.append((self.generation, STOP))
            self._wake()

    def enable(self):
        with self.lock:
            if self.closed or self.error:
                return False
            # Preserve an already queued stop before accepting the new generation.
            self.enabled = True
            return True

    async def get_entry(self):
        while True:
            with self.lock:
                if self.pending:
                    generation, line = self.pending.popleft()
                    if generation == self.generation:
                        return generation, line
                    continue
                self.notified = False
                self.event.clear()
            await self.event.wait()

    async def get(self):
        return (await self.get_entry())[1]

    def is_current(self, generation):
        with self.lock:
            return generation == self.generation


def endpoint(value: str) -> tuple[str, int]:
    parts = urlsplit(value)
    try:
        valid = (parts.scheme == 'tcp' and parts.hostname and parts.port and not parts.username
                 and not parts.password and parts.path in ('', '/') and not parts.query and not parts.fragment)
    except ValueError as error:
        raise ValueError('Expected tcp://host:port') from error
    if not valid:
        raise ValueError('Expected tcp://host:port')
    return parts.hostname, parts.port


class TcpSink:
    """One connection per explicitly started bridge. Failure is terminal, no replay/reconnect."""
    def __init__(self, destination, timeout=2.0):
        self.host, self.port = endpoint(destination)
        self.timeout = timeout
        self.writer = None
        self.reader = None
        self.failed = False

    async def connect(self):
        if self.failed:
            raise RuntimeError('Sensa connection failed; restart explicitly')
        try:
            self.reader, self.writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port), self.timeout)
        except BaseException:
            self.failed = True
            raise

    async def send(self, line):
        if self.failed or self.writer is None:
            raise RuntimeError('Sensa connection is not available')
        try:
            if self.reader.at_eof():
                raise ConnectionError('Sensa closed the input connection')
            self.writer.write(line)
            await asyncio.wait_for(self.writer.drain(), self.timeout)
        except BaseException:
            self.failed = True
            await self.close()
            raise

    async def close(self):
        writer, self.writer = self.writer, None
        if writer is not None:
            writer.close()
            with suppress(Exception):
                await asyncio.wait_for(writer.wait_closed(), self.timeout)


async def forward(mailbox, sink, *, idle=2.0):
    stopped = False
    deadline = idle
    try:
        while True:
            try:
                generation, line = await asyncio.wait_for(mailbox.get_entry(), deadline)
            except asyncio.TimeoutError:
                if not stopped:
                    await sink.send(STOP)
                    stopped = True
                deadline = idle
                continue
            if not mailbox.is_current(generation):
                continue
            await sink.send(line)
            stopped = line == STOP
            deadline = inactivity_window(line, idle)
            if mailbox.error:
                raise RuntimeError(mailbox.error)
            if mailbox.closed and stopped:
                return
    finally:
        # This stop follows any bounded in-flight send. Pending older moves are discarded.
        mailbox.disable(close=True)
        with suppress(Exception):
            await sink.send(STOP)
        await sink.close()


class PseudoSerialPort:
    def __init__(self, link=None):
        self.link = Path(link) if link else None
        self.master = None
        self.path = None
        self.created_link = False

    def __enter__(self):
        if os.name == 'nt':
            raise RuntimeError('PTY is unavailable on Windows; use an existing COM pair with serial-input')
        import pty
        import tty
        master, slave = pty.openpty()
        self.master = master
        try:
            tty.setraw(slave)
            self.path = os.ttyname(slave)
            os.set_blocking(master, False)
            if self.link:
                # Never replace an existing path, even a symlink from an earlier run.
                self.link.symlink_to(self.path)
                self.created_link = True
        except BaseException:
            self.__exit__(None, None, None)
            raise
        finally:
            os.close(slave)
        return self

    def __exit__(self, *_):
        if self.created_link and self.link.is_symlink() and os.readlink(self.link) == self.path:
            self.link.unlink()
        if self.master is not None:
            os.close(self.master)
            self.master = None

    async def read(self, count=4096):
        import errno
        import select
        ready = await asyncio.to_thread(select.select, [self.master], [], [], .2)
        if not ready[0]:
            return None
        try:
            return os.read(self.master, count)
        except BlockingIOError:
            return None
        except OSError as error:
            if error.errno == errno.EIO:
                return b''  # no slave currently open
            raise


class SerialPort:
    def __init__(self, port, baud):
        self.name, self.baud = port, baud
        self.port = None

    async def open(self):
        serial = optional_import('serial', 'requirements-serial.txt')
        self.port = await asyncio.to_thread(serial.Serial, self.name, self.baud, timeout=.2, write_timeout=.5)
        self.port.reset_input_buffer()

    async def read(self, count=4096):
        data = await asyncio.to_thread(self.port.read, count)
        return data or None

    def close(self):
        if self.port:
            self.port.close()


def optional_import(name, requirement):
    try:
        return importlib.import_module(name)
    except (ImportError, OSError) as error:
        raise RuntimeError(f'Optional backend {name} is unavailable; install {requirement} in your Python environment: {error}') from error


async def pump_serial(port, mailbox, framer, shutdown):
    had_data = False
    while not shutdown.is_set():
        data = await port.read()
        if data == b'':
            if had_data:
                mailbox.disable(close=True)
                return
            await asyncio.sleep(.05)
        elif data:
            had_data = True
            if not mailbox.enabled:
                framer.clear()
                continue
            for line in framer.feed(data):
                mailbox.put(line)


async def console_controls(mailbox, shutdown, framer=None):
    """TTY commands are optional; stdin pipes are not interpreted as control or motion."""
    if not sys.stdin.isatty():
        await shutdown.wait()
        return
    print('Controls: disable | enable | disconnect | unpair | quit (unpair exits; remove OS bonds separately)', flush=True)
    while not shutdown.is_set():
        # A daemon reader cannot keep the process alive after Ctrl+C/EOF.
        future = asyncio.get_running_loop().create_future()
        loop = asyncio.get_running_loop()
        def completed(value):
            if not future.done():
                future.set_result(value)
        threading.Thread(target=lambda: loop.call_soon_threadsafe(completed, sys.stdin.readline()), daemon=True).start()
        line = (await future).strip().lower()
        if line == 'disable':
            mailbox.disable()
            if framer:
                framer.clear()
        elif line == 'enable':
            mailbox.enable()
        elif line in ('disconnect', 'unpair', 'quit') or not line:
            mailbox.disable(close=True)
            shutdown.set()
            return


async def run_input(args, port=None, peripheral_factory=None):
    loop = asyncio.get_running_loop()
    shutdown = asyncio.Event()
    mailbox = Mailbox(loop)
    sink = TcpSink(args.sensa, args.timeout)
    framer = LineFramer()
    tasks = []
    peripheral = None
    shutdown_task = None
    await sink.connect()
    try:
        tasks.append(asyncio.create_task(forward(mailbox, sink, idle=args.idle)))
        tasks.append(asyncio.create_task(console_controls(mailbox, shutdown, framer)))
        if port:
            tasks.append(asyncio.create_task(pump_serial(port, mailbox, framer, shutdown)))
        else:
            protocol = PROTOCOLS[args.protocol]
            def receive(data):
                position, duration = protocol.decode(bytes(data))
                mailbox.put(tcode_move(position, duration))
            def disconnected():
                mailbox.disable()
                loop.call_soon_threadsafe(shutdown.set)  # explicit restart; no old-session replay
            peripheral = (peripheral_factory or make_peripheral)(args, receive, disconnected)
            await asyncio.wait_for(peripheral.start(), args.timeout * 5)
            print(f'BLE input advertising {protocol.advertised_name}, service {protocol.service}', flush=True)
        shutdown_task = asyncio.create_task(shutdown.wait())
        done, _ = await asyncio.wait([*tasks, shutdown_task], return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
        if peripheral is not None and getattr(peripheral, 'failure', None) is not None:
            raise RuntimeError(f'BLE input stopped: {peripheral.failure}')
    finally:
        shutdown.set()
        mailbox.disable(close=True)
        if peripheral:
            with suppress(Exception):
                await asyncio.wait_for(peripheral.stop(), args.timeout)
        if tasks:
            try:
                await asyncio.wait_for(asyncio.shield(tasks[0]), args.timeout * 2)
            except (Exception, asyncio.CancelledError):
                pass
        for task in tasks:
            task.cancel()
        if shutdown_task:
            shutdown_task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if shutdown_task:
            await asyncio.gather(shutdown_task, return_exceptions=True)
        await sink.close()


class BlessPeripheral:
    """Linux/macOS peripheral; inactivity watchdog covers write-only peers without subscription events."""
    def __init__(self, args, receive, disconnected):
        self.args, self.receive, self.disconnected = args, receive, disconnected
        self.server = None
        self.failure = None

    async def start(self):
        bless = optional_import('bless', 'requirements-ble-input.txt')
        protocol = PROTOCOLS[self.args.protocol]
        options = {'adapter': self.args.adapter} if self.args.adapter else {}
        self.server = bless.BlessServer(name=protocol.advertised_name, loop=asyncio.get_running_loop(), **options)
        def write(characteristic, value, **kwargs):
            try:
                self.receive(bytes(value))
            except (ValueError, TypeError) as error:
                # An invalid packet terminates this session instead of forwarding partial motion.
                self.failure = error
                self.disconnected()
        self.server.write_request_func = write
        await self.server.add_new_service(protocol.service)
        properties = bless.GATTCharacteristicProperties.write | bless.GATTCharacteristicProperties.write_without_response
        await self.server.add_new_characteristic(protocol.service, protocol.characteristic, properties,
                                                  bytearray(), bless.GATTAttributePermissions.writable)
        if sys.platform.startswith('linux'):
            # Bless 0.3.0 otherwise sets the global Adapter1.Alias in addition to
            # LEAdvertisement1.LocalName. Preserve the system name; the per-advertisement
            # LocalName already contains our protocol-specific name.
            if not hasattr(self.server, 'app') or not hasattr(self.server.app, 'set_name'):
                raise RuntimeError('Unsupported Bless Linux backend; install the pinned requirements')
            async def preserve_system_name(adapter, name):
                return None
            self.server.app.set_name = preserve_system_name
        result = await self.server.start()
        if result is False:
            raise RuntimeError('BLE advertisement failed; check Bluetooth power, peripheral-role support and OS permissions')

    async def stop(self):
        if self.server:
            try:
                await self.server.stop()
            finally:
                bus = getattr(self.server, 'bus', None)
                if bus is not None:
                    bus.disconnect()
        if self.failure:
            raise self.failure


def make_peripheral(args, receive, disconnected):
    if sys.platform == 'win32':
        if args.protocol == 'loob' and not args.confirm_windows_loob_name:
            raise RuntimeError('Windows GATT uses the system Bluetooth name. LOOB requires a LOOB-prefixed advertisement; configure this explicitly in OS settings then pass --confirm-windows-loob-name, or use an external peripheral. No system name is changed by this tool.')
        from windows_peripheral import WindowsPeripheral
        return WindowsPeripheral(PROTOCOLS[args.protocol], receive, disconnected)
    return BlessPeripheral(args, receive, disconnected)


class BleOutput:
    def __init__(self, client, protocol, timeout=2.0):
        self.client, self.protocol, self.timeout = client, protocol, timeout
        self.last = None
        self.stopped = True
        self.failed = False

    async def send(self, line):
        if self.failed or not self.client.is_connected:
            raise ConnectionError('BLE disconnected; restart explicitly, no buffered command replay')
        move = parse_tcode_move(line)
        if move is None:
            # Neither researched protocol has an emergency-stop opcode. Do not send position 0.
            self.last = None
            self.stopped = True
            return
        try:
            await asyncio.wait_for(self.client.write_gatt_char(
                self.protocol.characteristic, self.protocol.encode(*move), response=False), self.timeout)
            self.last = move
            self.stopped = False
        except BaseException:
            self.failed = True
            self.last = None
            raise

    async def stop(self):
        self.last = None
        self.stopped = True
        await asyncio.wait_for(self.client.disconnect(), self.timeout)


async def pump_ble_output(reader, output, idle, disconnected, *, clock=None):
    clock = clock or asyncio.get_running_loop().time
    mailbox = Mailbox(asyncio.get_running_loop())
    async def receive():
        expires = clock() + idle
        framer = LineFramer()
        try:
            while not disconnected.is_set():
                remaining = expires - clock()
                if remaining <= 0:
                    raise asyncio.TimeoutError('No complete new TCode move before the idle deadline')
                data = await asyncio.wait_for(reader.read(4096), remaining)
                if clock() > expires:
                    raise asyncio.TimeoutError('TCode bytes arrived after the idle deadline')
                if not data:
                    return
                for line in framer.feed(data):
                    if parse_tcode_move(line) is None:
                        return
                    if not mailbox.put(line):
                        raise RuntimeError(mailbox.error or 'BLE output ingress is disabled')
                    expires = clock() + inactivity_window(line, idle)
        finally:
            mailbox.disable(close=True)
    async def send():
        while not disconnected.is_set():
            generation, line = await mailbox.get_entry()
            if not mailbox.is_current(generation):
                continue
            if line == STOP:
                return
            await output.send(line)
    tasks = [asyncio.create_task(receive()), asyncio.create_task(send())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    finally:
        mailbox.disable(close=True)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def serve_ble_output(args, client_factory=None):
    protocol = PROTOCOLS[args.protocol]
    host, port = endpoint(args.listen)
    if host not in ('127.0.0.1', 'localhost', '::1') and not args.allow_lan:
        raise ValueError('BLE output listener is loopback by default; pass --allow-lan to expose it deliberately')
    if client_factory is None:
        bleak = optional_import('bleak', 'requirements-ble-output.txt')
        client_factory = bleak.BleakClient
    disconnected = asyncio.Event()
    loop = asyncio.get_running_loop()
    client = client_factory(args.device, disconnected_callback=lambda _: loop.call_soon_threadsafe(disconnected.set),
                            timeout=args.timeout * 5)
    await asyncio.wait_for(client.connect(), args.timeout * 5)
    output = BleOutput(client, protocol, args.timeout)
    occupied = False
    finished = asyncio.Event()
    active_writer = None
    clients = set()
    waits = []
    async def connection(reader, writer):
        nonlocal occupied, active_writer
        clients.add(asyncio.current_task())
        if occupied:
            writer.close()
            with suppress(Exception):
                await writer.wait_closed()
            clients.discard(asyncio.current_task())
            return
        occupied, active_writer = True, writer
        try:
            await pump_ble_output(reader, output, args.idle, disconnected)
        except Exception as error:
            print(f'BLE output session stopped: {error}', file=sys.stderr)
        finally:
            finished.set()
            writer.close()
            with suppress(Exception):
                await writer.wait_closed()
            clients.discard(asyncio.current_task())
    try:
        server = await asyncio.start_server(connection, host, port, limit=MAX_LINE + 1)
        async with server:
            print(f'BLE output ready at {args.listen}; configure Sensa TCode TCP, L0 only, Interval slope', flush=True)
            waits = [asyncio.create_task(finished.wait()), asyncio.create_task(disconnected.wait())]
            await asyncio.wait(waits, return_when=asyncio.FIRST_COMPLETED)
    finally:
        if active_writer:
            active_writer.close()
        pending = list(clients) + waits
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        await output.stop()


def diagnostics():
    dependencies = {}
    for name in ('serial', 'bleak', 'bless', 'winrt.windows.devices.bluetooth.genericattributeprofile'):
        try:
            dependencies[name] = importlib.util.find_spec(name) is not None
        except (ImportError, ModuleNotFoundError):
            dependencies[name] = False
    return {'platform': sys.platform, 'python': sys.version.split()[0], 'dependencies': dependencies,
            'hardwareProbed': False, 'supportedBleProtocols': list(PROTOCOLS),
            'pty': os.name != 'nt', 'windowsVirtualCom': 'Use an existing signed-driver COM pair; no driver installation is performed',
            'stop': 'DSTOP clears pending work and closes BLE output. BLE protocol has no verified emergency-stop opcode.'}


def parser():
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument('--check', action='store_true', help='Report platform/dependencies without opening hardware or sockets')
    sub = root.add_subparsers(dest='command')
    ports = sub.add_parser('serial-ports', help='Enumerate available serial endpoints without opening them')
    ports.add_argument('--check', action='store_true', default=argparse.SUPPRESS)
    for command in ('pty-input', 'serial-input', 'ble-input', 'ble-output'):
        p = sub.add_parser(command)
        p.add_argument('--check', action='store_true', default=argparse.SUPPRESS)
        p.add_argument('--timeout', type=float, default=2.0, help='Bound each transport operation in seconds')
        p.add_argument('--idle', type=float, default=2.0, help='No-input deadline, seconds; stop/clear once on inactivity')
        if command != 'ble-output':
            p.add_argument('--sensa', default='tcp://127.0.0.1:12401', help='Sensa network TCode INPUT')
        if command == 'pty-input':
            p.add_argument('--link', help='Create a new optional symlink; never replace an existing path')
        elif command == 'serial-input':
            p.add_argument('--port', help='Existing serial/COM-pair bridge end (browser opens the other end)')
            p.add_argument('--baud', type=int, default=115200)
        else:
            p.add_argument('--protocol', choices=PROTOCOLS, default='loob')
            if command == 'ble-input':
                p.add_argument('--adapter', help='Optional Bless Linux adapter path, e.g. /org/bluez/hci1')
                p.add_argument('--confirm-windows-loob-name', action='store_true')
            else:
                p.add_argument('--listen', default='tcp://127.0.0.1:12411', help='Sensa TCode TCP OUTPUT connects here')
                p.add_argument('--device', help='Actual BLE address/OS device identifier; explicit, no automatic selection')
                p.add_argument('--allow-lan', action='store_true')
    return root


async def execute(args):
    if args.command == 'serial-ports':
        ports = optional_import('serial.tools.list_ports', 'requirements-serial.txt')
        print(json.dumps([{'port': p.device, 'description': p.description, 'hardwareId': p.hwid}
                          for p in ports.comports()], ensure_ascii=False, indent=2))
        return
    if not .05 <= args.timeout <= 60 or not .05 <= args.idle <= 120:
        raise ValueError('timeout must be .05..60 and idle .05..120 seconds')
    if args.command == 'pty-input':
        with PseudoSerialPort(args.link) as port:
            print(f'Virtual serial endpoint: {port.path}', flush=True)
            print('Browser serial pickers may not enumerate PTYs; use Intiface input if the port is absent.', flush=True)
            await run_input(args, port)
    elif args.command == 'serial-input':
        if not args.port:
            raise ValueError('serial-input requires --port; use an existing COM pair, no driver is installed')
        port = SerialPort(args.port, args.baud)
        await port.open()
        try:
            await run_input(args, port)
        finally:
            port.close()
    elif args.command == 'ble-input':
        await run_input(args)
    elif args.command == 'ble-output':
        if not args.device:
            raise ValueError('ble-output requires an explicit --device address/identifier')
        await serve_ble_output(args)


def main(argv=None):
    p = parser()
    args = p.parse_args(argv)
    if args.check:
        print(json.dumps(diagnostics(), ensure_ascii=False, indent=2))
        return 0
    if not args.command:
        p.print_help()
        return 0
    try:
        asyncio.run(execute(args))
        return 0
    except KeyboardInterrupt:
        return 0
    except Exception as error:
        print(f'Protocol bridge stopped: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
