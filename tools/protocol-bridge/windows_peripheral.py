"""Native Windows GATT peripheral with PyWinRT 4.x; no global adapter changes."""
import asyncio
from contextlib import suppress
from uuid import UUID


class WindowsPeripheral:
    def __init__(self, protocol, receive, disconnected):
        self.protocol, self.receive, self.disconnected = protocol, receive, disconnected
        self.provider = self.characteristic = self.write_token = None
        self.sessions = {}
        self.pending = {}
        self.stopping = False
        self.failure = None

    async def start(self):
        try:
            from winrt.windows.devices.bluetooth import BluetoothAdapter, BluetoothError
            from winrt.windows.devices.bluetooth.genericattributeprofile import (
                GattCharacteristicProperties, GattLocalCharacteristicParameters,
                GattProtectionLevel, GattServiceProvider, GattServiceProviderAdvertisingParameters,
                GattServiceProviderAdvertisementStatus)
        except (ImportError, OSError) as error:
            raise RuntimeError('Install requirements-ble-input-windows.txt for native Windows peripheral support') from error
        self.loop = asyncio.get_running_loop()
        self.write_lock = asyncio.Lock()
        adapter = await BluetoothAdapter.get_default_async()
        if adapter is None or not adapter.is_peripheral_role_supported:
            raise RuntimeError('Windows Bluetooth adapter is missing or does not support peripheral role')
        result = await GattServiceProvider.create_async(UUID(self.protocol.service))
        if result.error != BluetoothError.SUCCESS or result.service_provider is None:
            raise RuntimeError(f'Windows GATT service creation failed: {result.error}')
        self.provider = result.service_provider
        parameters = GattLocalCharacteristicParameters()
        parameters.characteristic_properties = (GattCharacteristicProperties.WRITE
                                                | GattCharacteristicProperties.WRITE_WITHOUT_RESPONSE)
        parameters.write_protection_level = GattProtectionLevel.PLAIN
        result = await self.provider.service.create_characteristic_async(UUID(self.protocol.characteristic), parameters)
        if result.error != BluetoothError.SUCCESS or result.characteristic is None:
            raise RuntimeError(f'Windows GATT characteristic creation failed: {result.error}')
        self.characteristic = result.characteristic
        self.write_token = self.characteristic.add_write_requested(self._write_requested)
        advertising = GattServiceProviderAdvertisingParameters()
        advertising.is_connectable = True
        advertising.is_discoverable = True
        self.provider.start_advertising(advertising)
        deadline = self.loop.time() + 5
        while self.provider.advertisement_status != GattServiceProviderAdvertisementStatus.STARTED:
            if self.provider.advertisement_status == GattServiceProviderAdvertisementStatus.ABORTED:
                raise RuntimeError('Windows BLE advertisement aborted; check radio and OS permissions')
            if self.loop.time() >= deadline:
                raise RuntimeError('Windows BLE advertisement did not start within five seconds')
            await asyncio.sleep(.05)

    def _write_requested(self, sender, args):
        deferral = args.get_deferral()
        if deferral is None:
            return
        try:
            self.loop.call_soon_threadsafe(self._queue_write, args, deferral)
        except RuntimeError:
            deferral.complete()

    def _queue_write(self, args, deferral):
        # Runs only on the owning loop, including registration, cancellation and completion.
        if self.stopping or len(self.pending) >= 64:
            deferral.complete()
            if not self.stopping:
                self.disconnected()
            return
        task = self.loop.create_task(self._handle_write(args))
        self.pending[task] = deferral
        def completed(done):
            self.pending.pop(done).complete()  # also covers cancellation before coroutine startup
            if not done.cancelled() and done.exception() is not None and not self.stopping:
                self.failure = done.exception()
                self.disconnected()
        task.add_done_callback(completed)

    def _session_closed(self, identity, session):
        current = self.sessions.get(identity)
        if current is not None and current[0] is session:
            session.remove_session_status_changed(current[1])
            del self.sessions[identity]
            if not self.stopping:
                self.disconnected()

    async def _handle_write(self, args):
        async with self.write_lock:
            await self._read_write(args)

    async def _read_write(self, args):
        from winrt.windows.devices.bluetooth.genericattributeprofile import GattSessionStatus, GattWriteOption
        from winrt.windows.storage.streams import DataReader
        request = None
        try:
            request = await args.get_request_async()
            if request is None or self.stopping:
                return
            if request.offset != 0:
                raise ValueError('BLE partial/offset writes are not accepted')
            session = args.session
            identity = session.device_id.id
            if self.sessions and identity not in self.sessions:
                raise ValueError('Only one BLE central peer is accepted per bridge session')
            previous = self.sessions.get(identity)
            if previous is None or previous[0] is not session:
                if previous:
                    previous[0].remove_session_status_changed(previous[1])
                def status_changed(sender, changed):
                    if changed.status == GattSessionStatus.CLOSED:
                        self.loop.call_soon_threadsafe(self._session_closed, identity, session)
                token = session.add_session_status_changed(status_changed)
                self.sessions[identity] = (session, token, status_changed)
            reader = DataReader.from_buffer(request.value)
            try:
                size = reader.unconsumed_buffer_length
                if size != self.protocol.packet_size:
                    raise ValueError('Unexpected BLE packet length')
                data = bytes(reader.read_byte() for _ in range(size))
            finally:
                reader.close()
            self.receive(data)
            if request.option == GattWriteOption.WRITE_WITH_RESPONSE:
                request.respond()
        except (ValueError, RuntimeError, OSError) as error:
            self.failure = error
            if request is not None and request.option == GattWriteOption.WRITE_WITH_RESPONSE:
                with suppress(Exception):
                    request.respond_with_protocol_error(0x0D)
            self.disconnected()

    async def stop(self):
        self.stopping = True
        if self.provider:
            self.provider.stop_advertising()
        if self.characteristic is not None and self.write_token is not None:
            self.characteristic.remove_write_requested(self.write_token)
            self.write_token = None
        for session, token, _callback in self.sessions.values():
            session.remove_session_status_changed(token)
        self.sessions.clear()
        pending = list(self.pending)
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        self.provider = self.characteristic = None
