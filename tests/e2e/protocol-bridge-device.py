#!/usr/bin/env python3
"""CI-only real bridge + mock GATT peer; never imports a Bluetooth backend."""
from __future__ import annotations

import argparse
import asyncio
from contextlib import redirect_stdout
import importlib.util
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = sys.stdout
spec = importlib.util.spec_from_file_location('sensa_e2e_protocol_bridge', ROOT / 'tools/protocol-bridge/bridge.py')
bridge = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = bridge
spec.loader.exec_module(bridge)


def emit(event, **values):
    OUTPUT.write(json.dumps({'event': event, **values}) + '\n')
    OUTPUT.flush()


class MockGattClient:
    is_connected = False

    async def connect(self):
        self.is_connected = True
        emit('ble-connected', hardwareExecution=False)

    async def write_gatt_char(self, uuid, packet, *, response):
        profile = bridge.PROTOCOLS['svakom-v1']
        if not self.is_connected or uuid != profile.characteristic or response is not False:
            raise AssertionError('Unexpected mock GATT operation')
        profile.decode(bytes(packet))  # Reject malformed native writes as a device would.
        emit('gatt-write', characteristic=uuid, packet=bytes(packet).hex(), response=response)

    async def disconnect(self):
        self.is_connected = False
        emit('ble-disconnected')


async def output_peer(listen_port):
    original = asyncio.start_server

    async def isolated_server(callback, host, _port, **options):
        if host != '127.0.0.1':
            raise AssertionError('The mock GATT harness must stay on loopback')

        async def observed(reader, writer):
            class ObservedReader:
                async def read(self, count):
                    data = await reader.read(count)
                    if data:
                        emit('tcode-bytes', text=data.decode('ascii'))
                    return data
            emit('tcp-connected')
            await callback(ObservedReader(), writer)

        server = await original(observed, host, listen_port, **options)
        emit('ready', role='output', port=server.sockets[0].getsockname()[1], hardwareExecution=False)
        return server

    # Only the listen socket uses a harness-selected ephemeral port. Actual
    # framing, queue, codec, stop/disconnect and failure handling stay unmodified.
    asyncio.start_server = isolated_server
    args = SimpleNamespace(protocol='svakom-v1', listen=f'tcp://127.0.0.1:{listen_port or 19432}',
                           allow_lan=False, device='ci-svakom-no-hardware', timeout=1, idle=20)
    try:
        await bridge.serve_ble_output(args, client_factory=lambda *_a, **_k: MockGattClient())
    finally:
        asyncio.start_server = original


class MockPeripheral:
    failure = None

    def __init__(self, args, receive, disconnected):
        self.receive, self.disconnected = receive, disconnected
        self.transport = self.task = None

    async def start(self):
        reader = asyncio.StreamReader(limit=2048)
        protocol = asyncio.StreamReaderProtocol(reader)
        self.transport, _ = await asyncio.get_running_loop().connect_read_pipe(lambda: protocol, sys.stdin)

        async def commands():
            try:
                while line := await reader.readline():
                    request = json.loads(line)
                    identity = request.get('id')
                    if request.get('action') == 'disconnect':
                        emit('ack', id=identity, accepted=True)
                        self.disconnected()
                        return
                    packet = request.get('packet')
                    if request.get('action') != 'frame' or not isinstance(packet, str) or len(packet) > 12:
                        raise ValueError('Expected a bounded mock BLE frame')
                    try:
                        self.receive(bytes.fromhex(packet))
                    except (ValueError, TypeError) as error:
                        self.failure = error
                        emit('ack', id=identity, accepted=False, errorType=type(error).__name__)
                        self.disconnected()
                        return
                    emit('ack', id=identity, accepted=True)
                self.disconnected()
            except Exception as error:
                self.failure = error
                self.disconnected()
        self.task = asyncio.create_task(commands())
        emit('ready', role='input', hardwareExecution=False)

    async def stop(self):
        if self.transport:
            self.transport.close()
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
        emit('advertising-stopped')


async def run(role, sensa, listen_port):
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('Protocol bridge process E2E is GitHub Actions only')
    try:
        # Library progress messages are diagnostics, not the structured wire.
        with redirect_stdout(sys.stderr):
            if role == 'output':
                await output_peer(listen_port)
            else:
                host, _port = bridge.endpoint(sensa)
                if host != '127.0.0.1':
                    raise ValueError('Only the isolated local Sensa fixture is allowed')
                args = SimpleNamespace(protocol='svakom-v1', sensa=sensa, timeout=1, idle=20)
                await bridge.run_input(args, peripheral_factory=MockPeripheral)
        success = True
    except Exception as error:
        emit('failure', errorType=type(error).__name__)
        success = False
    emit('complete', success=success, hardwareExecution=False,
         hardwareModules=[name for name in sys.modules if name.split('.')[0] in ('bleak', 'bless', 'winrt')])
    return 0 if success else 2


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('role', choices=('input', 'output'))
    parser.add_argument('--sensa', default='tcp://127.0.0.1:19431')
    parser.add_argument('--listen-port', type=int, default=0)
    args = parser.parse_args()
    if not 0 <= args.listen_port <= 65535:
        parser.error('Expected a local fixture port')
    raise SystemExit(asyncio.run(run(args.role, args.sensa, args.listen_port)))
