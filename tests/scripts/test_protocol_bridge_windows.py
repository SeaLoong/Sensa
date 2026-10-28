"""WinRT server contracts with isolated projection doubles; no Bluetooth hardware."""
import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import AsyncMock, Mock, patch
from uuid import UUID


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    'sensa_protocol_bridge_windows', ROOT / 'tools/protocol-bridge/windows_peripheral.py')
WINDOWS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WINDOWS)


class Reader:
    def __init__(self, payload):
        self.payload = list(payload)
        self.closed = False

    @property
    def unconsumed_buffer_length(self):
        return len(self.payload)

    def read_byte(self):
        return self.payload.pop(0)

    def close(self):
        self.closed = True


class WinRTDoubles:
    def __init__(self):
        self.adapter = types.SimpleNamespace(is_peripheral_role_supported=True)
        self.characteristic = types.SimpleNamespace(
            add_write_requested=Mock(return_value='write-token'),
            remove_write_requested=Mock())
        self.parameters = []
        self.service = types.SimpleNamespace(create_characteristic_async=AsyncMock(
            return_value=types.SimpleNamespace(error=0, characteristic=self.characteristic)))
        self.provider = types.SimpleNamespace(
            service=self.service,
            start_advertising_with_parameters=Mock(), stop_advertising=Mock(),
            advertisement_status=2,
            add_advertisement_status_changed=Mock(return_value='advertising-token'),
            remove_advertisement_status_changed=Mock())
        self.bluetooth = types.ModuleType('winrt.windows.devices.bluetooth')
        self.bluetooth.BluetoothAdapter = types.SimpleNamespace(
            get_default_async=AsyncMock(return_value=self.adapter))
        self.bluetooth.BluetoothError = types.SimpleNamespace(SUCCESS=0)
        self.gatt = types.ModuleType('winrt.windows.devices.bluetooth.genericattributeprofile')
        self.gatt.GattCharacteristicProperties = types.SimpleNamespace(WRITE=8, WRITE_WITHOUT_RESPONSE=4)
        self.gatt.GattProtectionLevel = types.SimpleNamespace(PLAIN=0)
        self.gatt.GattSessionStatus = types.SimpleNamespace(CLOSED=0, ACTIVE=1)
        self.gatt.GattWriteOption = types.SimpleNamespace(WRITE_WITH_RESPONSE=0, WRITE_WITHOUT_RESPONSE=1)
        self.gatt.GattServiceProviderAdvertisementStatus = types.SimpleNamespace(
            CREATED=0, STOPPED=1, STARTED=2, ABORTED=3, STARTED_WITHOUT_ALL_ADVERTISEMENT_DATA=4)
        self.gatt.GattServiceProvider = types.SimpleNamespace(create_async=AsyncMock(
            return_value=types.SimpleNamespace(error=0, service_provider=self.provider)))
        self.gatt.GattLocalCharacteristicParameters = self.new_parameters
        self.gatt.GattServiceProviderAdvertisingParameters = types.SimpleNamespace
        self.streams = types.ModuleType('winrt.windows.storage.streams')
        self.readers = []

        def read(payload):
            reader = Reader(payload)
            self.readers.append(reader)
            return reader

        self.streams.DataReader = types.SimpleNamespace(from_buffer=Mock(side_effect=read))
        self.modules = {name: types.ModuleType(name) for name in (
            'winrt', 'winrt.windows', 'winrt.windows.devices', 'winrt.windows.storage')}
        self.modules.update({
            self.bluetooth.__name__: self.bluetooth,
            self.gatt.__name__: self.gatt,
            self.streams.__name__: self.streams})

    def new_parameters(self):
        value = types.SimpleNamespace()
        self.parameters.append(value)
        return value

    @staticmethod
    def session(identity='test-peer'):
        return types.SimpleNamespace(device_id=types.SimpleNamespace(id=identity),
                                     session_status=1,
                                     add_session_status_changed=Mock(return_value='session-token'),
                                     remove_session_status_changed=Mock())

    def args(self, payload=b'\x01\xf4\x00\x64', offset=0, option=0, session=None):
        request = types.SimpleNamespace(value=payload, offset=offset, option=option,
                                        respond=Mock(), respond_with_protocol_error=Mock())
        return types.SimpleNamespace(
            session=session or self.session(),
            get_request_async=AsyncMock(return_value=request),
            get_deferral=Mock(return_value=types.SimpleNamespace(complete=Mock()))), request


class WindowsPeripheralContracts(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.winrt = WinRTDoubles()
        self.patch = patch.dict(sys.modules, self.winrt.modules)
        self.patch.start()
        self.protocol = types.SimpleNamespace(
            service='b75c49d2-04a3-4071-a0b5-35853eb08307',
            characteristic='ba5c49d2-04a3-4071-a0b5-35853eb08307', packet_size=4)
        self.receive = Mock()
        self.disconnected = Mock()
        self.server = WINDOWS.WindowsPeripheral(self.protocol, self.receive, self.disconnected)

    async def asyncTearDown(self):
        await self.server.stop()
        self.patch.stop()

    async def deliver(self, args):
        self.server._write_requested(self.winrt.characteristic, args)
        for _ in range(20):
            await asyncio.sleep(0)
            if args.get_deferral.return_value.complete.called:
                break
        args.get_deferral.return_value.complete.assert_called_once_with()

    async def test_service_uuid_write_permissions_and_real_projection_start_signature(self):
        await self.server.start()
        self.winrt.gatt.GattServiceProvider.create_async.assert_awaited_once_with(UUID(self.protocol.service))
        self.winrt.service.create_characteristic_async.assert_awaited_once_with(
            UUID(self.protocol.characteristic), self.winrt.parameters[0])
        self.assertEqual(self.winrt.parameters[0].characteristic_properties, 12)
        self.assertEqual(self.winrt.parameters[0].write_protection_level, 0)
        self.winrt.characteristic.add_write_requested.assert_called_once()
        self.winrt.provider.start_advertising_with_parameters.assert_called_once()
        advertising = self.winrt.provider.start_advertising_with_parameters.call_args.args[0]
        self.assertTrue(advertising.is_connectable)
        self.assertTrue(advertising.is_discoverable)
        self.assertFalse(hasattr(advertising, 'local_name'))

    async def test_missing_peripheral_adapter_fails_before_service_creation(self):
        self.winrt.adapter.is_peripheral_role_supported = False
        with self.assertRaisesRegex(RuntimeError, 'peripheral role'):
            await self.server.start()
        self.winrt.gatt.GattServiceProvider.create_async.assert_not_awaited()

    async def test_creation_error_is_not_reported_as_started(self):
        self.winrt.gatt.GattServiceProvider.create_async.return_value = types.SimpleNamespace(
            error=5, service_provider=None)
        with self.assertRaisesRegex(RuntimeError, 'service creation failed'):
            await self.server.start()
        self.winrt.provider.start_advertising_with_parameters.assert_not_called()

    async def test_received_write_is_read_acked_and_deferral_completed(self):
        await self.server.start()
        args, request = self.winrt.args()
        deferral = args.get_deferral()
        await self.deliver(args)
        self.receive.assert_called_once_with(b'\x01\xf4\x00\x64')
        request.respond.assert_called_once_with()
        request.respond_with_protocol_error.assert_not_called()
        deferral.complete.assert_called_once_with()
        args.session.add_session_status_changed.assert_called_once()
        self.assertTrue(self.winrt.readers[0].closed)

    async def test_offset_fragment_is_rejected_without_motion_delivery(self):
        await self.server.start()
        args, request = self.winrt.args(offset=1)
        deferral = args.get_deferral()
        await self.deliver(args)
        self.receive.assert_not_called()
        request.respond.assert_not_called()
        request.respond_with_protocol_error.assert_called_once_with(0x0D)
        deferral.complete.assert_called_once_with()
        self.disconnected.assert_called_once_with()

    async def test_invalid_packet_length_does_not_deliver_partial_motion(self):
        await self.server.start()
        args, request = self.winrt.args(payload=b'\x01\xf4')
        deferral = args.get_deferral()
        await self.deliver(args)
        self.receive.assert_not_called()
        request.respond_with_protocol_error.assert_called_once_with(0x0D)
        self.assertTrue(self.winrt.readers[0].closed)
        deferral.complete.assert_called_once_with()

    async def test_no_response_write_does_not_send_ack_and_closed_session_stops(self):
        await self.server.start()
        args, request = self.winrt.args(option=1)
        await self.deliver(args)
        request.respond.assert_not_called()
        callback = args.session.add_session_status_changed.call_args.args[0]
        callback(args.session, types.SimpleNamespace(status=0))
        await asyncio.sleep(0)
        self.disconnected.assert_called_once_with()

    async def test_stop_unregisters_write_and_session_events(self):
        await self.server.start()
        args, _request = self.winrt.args()
        await self.deliver(args)
        await self.server.stop()
        self.winrt.provider.stop_advertising.assert_called_once_with()
        self.winrt.characteristic.remove_write_requested.assert_called_once_with('write-token')
        args.session.remove_session_status_changed.assert_called_once_with('session-token')
        self.assertEqual(self.server.sessions, {})
        self.assertEqual(self.server.pending, {})

    async def test_closed_session_is_removed_and_same_peer_reconnect_is_observed(self):
        await self.server.start()
        first = self.winrt.session('same-peer')
        first_args, _ = self.winrt.args(session=first)
        await self.deliver(first_args)
        first_closed = first.add_session_status_changed.call_args.args[0]
        first_closed(first, types.SimpleNamespace(status=0))
        await asyncio.sleep(0)
        self.assertEqual(self.server.sessions, {})
        first.remove_session_status_changed.assert_called_once_with('session-token')
        second = self.winrt.session('same-peer')
        second_args, _ = self.winrt.args(session=second)
        await self.deliver(second_args)
        second.add_session_status_changed.assert_called_once()
        self.disconnected.reset_mock()
        first_closed(first, types.SimpleNamespace(status=0))
        await asyncio.sleep(0)
        self.disconnected.assert_not_called()
        second_closed = second.add_session_status_changed.call_args.args[0]
        second_closed(second, types.SimpleNamespace(status=0))
        await asyncio.sleep(0)
        self.disconnected.assert_called_once_with()

    async def test_replaced_session_cannot_stop_new_session_with_late_event(self):
        await self.server.start()
        first = self.winrt.session('same-peer')
        first_args, _ = self.winrt.args(session=first)
        await self.deliver(first_args)
        first_closed = first.add_session_status_changed.call_args.args[0]
        second = self.winrt.session('same-peer')
        second_args, _ = self.winrt.args(session=second)
        await self.deliver(second_args)
        first.remove_session_status_changed.assert_called_once_with('session-token')
        first_closed(first, types.SimpleNamespace(status=0))
        await asyncio.sleep(0)
        self.disconnected.assert_not_called()
        self.assertIs(self.server.sessions['same-peer'][0], second)

    async def test_delayed_native_request_does_not_reverse_motion_order(self):
        await self.server.start()
        first_args, first_request = self.winrt.args(payload=b'\x00\x64\x00\x32')
        second_args, _ = self.winrt.args(payload=b'\x03\x84\x00\x32', session=first_args.session)
        release_first = asyncio.Event()
        async def delayed_first():
            await release_first.wait()
            return first_request
        first_args.get_request_async.side_effect = delayed_first
        self.server._write_requested(self.winrt.characteristic, first_args)
        self.server._write_requested(self.winrt.characteristic, second_args)
        for _ in range(5):
            await asyncio.sleep(0)
        self.receive.assert_not_called()
        release_first.set()
        for _ in range(20):
            await asyncio.sleep(0)
            if second_args.get_deferral.return_value.complete.called:
                break
        self.assertEqual([entry.args[0] for entry in self.receive.call_args_list],
                         [b'\x00\x64\x00\x32', b'\x03\x84\x00\x32'])
        first_args.get_deferral.return_value.complete.assert_called_once_with()
        second_args.get_deferral.return_value.complete.assert_called_once_with()

    async def test_advertisement_aborted_is_reported_as_failure(self):
        self.winrt.provider.advertisement_status = 3
        with self.assertRaisesRegex(RuntimeError, 'advertisement aborted'):
            await self.server.start()

    async def test_stopping_cancels_queued_write_before_it_can_deliver(self):
        await self.server.start()
        args, _ = self.winrt.args()
        self.server._write_requested(self.winrt.characteristic, args)
        # Native callback has queued task registration, not started its coroutine.
        await asyncio.sleep(0)
        await self.server.stop()
        await asyncio.sleep(0)
        self.receive.assert_not_called()
        args.get_deferral.return_value.complete.assert_called_once_with()
        self.assertEqual(self.server.pending, {})

    async def test_inflight_request_deferral_completes_on_stop(self):
        await self.server.start()
        args, _ = self.winrt.args()
        blocker = asyncio.Event()
        async def delayed_request():
            await blocker.wait()
        args.get_request_async.side_effect = delayed_request
        self.server._write_requested(self.winrt.characteristic, args)
        for _ in range(3):
            await asyncio.sleep(0)
        await self.server.stop()
        self.receive.assert_not_called()
        args.get_deferral.return_value.complete.assert_called_once_with()
        self.assertEqual(self.server.pending, {})

    async def test_stopping_callback_completes_deferral_without_queuing_write(self):
        await self.server.start()
        args, request = self.winrt.args()
        self.server.stopping = True
        self.server._write_requested(self.winrt.characteristic, args)
        await asyncio.sleep(0)
        args.get_deferral.return_value.complete.assert_called_once_with()
        args.get_request_async.assert_not_awaited()
        self.receive.assert_not_called()


if __name__ == '__main__':
    unittest.main()
