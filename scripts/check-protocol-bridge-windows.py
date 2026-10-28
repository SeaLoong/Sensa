"""Verify installed native WinRT/Bleak APIs without discovering or opening hardware."""
import argparse
import importlib
from importlib import metadata
import json
import os
from pathlib import Path
import platform
import sys


ROOT = Path(__file__).resolve().parents[1]
NAMESPACES = (
    'winrt.system',
    'winrt.windows.devices.bluetooth',
    'winrt.windows.devices.bluetooth.genericattributeprofile',
    'winrt.windows.devices.bluetooth.advertisement',
    'winrt.windows.devices.enumeration',
    'winrt.windows.foundation',
    'winrt.windows.foundation.collections',
    'winrt.windows.storage.streams',
)


def check():
    if sys.platform != 'win32' or sys.version_info < (3, 11):
        raise RuntimeError('Native Windows BLE input requires Windows and Python 3.11+')
    installed = {}
    for name in ('requirements-ble-input-windows.txt', 'requirements-ble-output.txt'):
        for line in (ROOT / 'tools/protocol-bridge' / name).read_text(encoding='utf-8').splitlines():
            line = line.split('#', 1)[0].strip()
            if not line:
                continue
            distribution, expected = line.split(';', 1)[0].strip().split('==', 1)
            actual = metadata.version(distribution)
            if actual != expected:
                raise RuntimeError(f'{distribution}: expected {expected}, installed {actual}')
            installed[distribution] = actual

    modules = {name: importlib.import_module(name) for name in NAMESPACES}
    gatt = modules['winrt.windows.devices.bluetooth.genericattributeprofile']
    bluetooth = modules['winrt.windows.devices.bluetooth']
    streams = modules['winrt.windows.storage.streams']
    # Resolve actual projections, without calling adapter discovery or GATT APIs.
    types = {
        'BluetoothAdapter': (bluetooth.BluetoothAdapter, ('get_default_async',)),
        'GattServiceProvider': (gatt.GattServiceProvider, ('create_async', 'start_advertising', 'stop_advertising')),
        'GattLocalService': (gatt.GattLocalService, ('create_characteristic_async',)),
        'GattLocalCharacteristic': (gatt.GattLocalCharacteristic, ('add_write_requested', 'remove_write_requested')),
        'GattWriteRequestedEventArgs': (gatt.GattWriteRequestedEventArgs, ('get_deferral', 'get_request_async')),
        'GattWriteRequest': (gatt.GattWriteRequest, ('respond', 'respond_with_protocol_error')),
        'GattSession': (gatt.GattSession, ('add_session_status_changed', 'remove_session_status_changed')),
        'DataReader': (streams.DataReader, ('from_buffer', 'read_byte', 'close')),
    }
    for name, (type_, methods) in types.items():
        for method in methods:
            if not callable(getattr(type_, method, None)):
                raise RuntimeError(f'Missing native API {name}.{method}')

    # These WinRT value objects and stream buffers do not use a radio or device.
    parameters = gatt.GattLocalCharacteristicParameters()
    parameters.characteristic_properties = (gatt.GattCharacteristicProperties.WRITE
                                           | gatt.GattCharacteristicProperties.WRITE_WITHOUT_RESPONSE)
    parameters.write_protection_level = gatt.GattProtectionLevel.PLAIN
    advertising = gatt.GattServiceProviderAdvertisingParameters()
    advertising.is_connectable = advertising.is_discoverable = True
    if (parameters.characteristic_properties != (gatt.GattCharacteristicProperties.WRITE
                                                  | gatt.GattCharacteristicProperties.WRITE_WITHOUT_RESPONSE)
            or parameters.write_protection_level != gatt.GattProtectionLevel.PLAIN
            or not advertising.is_connectable or not advertising.is_discoverable):
        raise RuntimeError('Native WinRT GATT parameter properties did not round-trip')
    payload = bytes((0x01, 0xF4, 0x00, 0x64))
    writer = streams.DataWriter()
    reader = None
    try:
        for byte in payload:
            writer.write_byte(byte)
        reader = streams.DataReader.from_buffer(writer.detach_buffer())
        decoded = bytes(reader.read_byte() for _ in range(reader.unconsumed_buffer_length))
        if decoded != payload:
            raise RuntimeError('Native WinRT stream buffer round-trip changed protocol bytes')
    finally:
        if reader is not None:
            reader.close()
        writer.close()

    # Import both actual Windows backends to detect shared-runtime incompatibility.
    client = importlib.import_module('bleak.backends.winrt.client')
    scanner = importlib.import_module('bleak.backends.winrt.scanner')
    if not callable(client.BleakClientWinRT.connect) or not callable(scanner.BleakScannerWinRT.start):
        raise RuntimeError('Bleak Windows backend APIs did not load')
    return {
        'passed': True,
        'hardwareAccess': False,
        'adapterEnumeration': False,
        'gattServiceCreated': False,
        'advertisingStarted': False,
        'sourceCommit': os.environ.get('SENSA_SOURCE_COMMIT', ''),
        'runtime': os.environ.get('TARGET_RID', ''),
        'python': platform.python_version(),
        'architecture': platform.machine(),
        'packages': installed,
        'importedNamespaces': list(modules),
        'nativeApis': {name: list(methods) for name, (_type, methods) in types.items()},
        'nativeStreamRoundTripHex': decoded.hex(),
        'bleakWindowsClientAndScannerImported': True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    try:
        result = check()
    except Exception as error:
        result = {'passed': False, 'hardwareAccess': False,
                  'sourceCommit': os.environ.get('SENSA_SOURCE_COMMIT', ''),
                  'runtime': os.environ.get('TARGET_RID', ''),
                  'error': {'type': type(error).__name__, 'message': str(error)}}
        write_report(args.report, result)
        raise
    write_report(args.report, result)
    print(f'Native Windows protocol bridge dependencies verified without hardware: {args.report}')


def write_report(path, result):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
