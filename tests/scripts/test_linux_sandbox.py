"""Isolated AppArmor registration tests; never load a profile or invoke sudo."""
import importlib.util
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('sensa_linux_sandbox', ROOT / 'scripts/sensa-linux-sandbox.py')
sandbox = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sandbox)


class FakeSystem:
    def __init__(self):
        self.calls = []
        self.loaded = []
        self.tools = {'parser': '/usr/sbin/apparmor_parser'}
        self.tool_identities = {'parser': {'path': self.tools['parser'], 'uid': 0, 'mode': '0755'}}
        self.fail_replace = False
        self.fail_remove = False

    def restriction(self):
        return '1'

    def profiles(self):
        return self.loaded

    def call(self, name, *args, data=None, privileged=True):
        self.calls.append((name, args, data, privileged))
        if name == 'install':
            shutil.copyfile(args[-2], args[-1])
            Path(args[-1]).chmod(0o644)
        elif name == 'ln':
            os.link(args[-2], args[-1])
        elif name == 'rm':
            Path(args[-1]).unlink(missing_ok='--force' in args)
        elif name == 'parser' and '--replace' in args:
            if self.fail_replace:
                raise subprocess.CalledProcessError(1, ['parser', '--replace'])
            name = data.decode().split('profile ', 1)[1].split(' ', 1)[0]
            self.loaded = [name + ' (unconfined)']
        elif name == 'parser' and '--remove' in args:
            if self.fail_remove:
                raise subprocess.CalledProcessError(1, ['parser', '--remove'])
            self.loaded = []
        return b''


@unittest.skipUnless(sys.platform == 'linux', 'AppArmor registration is Linux-only')
class LinuxSandboxTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        # This managed test container maps the host's root to uid 65534. Model
        # the two system-directory owners only; application/file ownership and
        # permission checks below continue to use their actual filesystem data.
        original_lstat = Path.lstat
        mapped_root_uid = Path('/').stat().st_uid
        def lstat(path, *args, **kwargs):
            info = original_lstat(path, *args, **kwargs)
            if mapped_root_uid != 0 and path in (Path('/'), Path(tempfile.gettempdir())) and info.st_uid == mapped_root_uid:
                values = {name: getattr(info, name) for name in dir(info) if name.startswith('st_')}
                values['st_uid'] = 0
                return SimpleNamespace(**values)
            return info
        metadata_patch = patch.object(Path, 'lstat', lstat)
        metadata_patch.start()
        self.addCleanup(metadata_patch.stop)
        self.policies = self.root / 'policies'
        self.policies.mkdir()
        self.directory_patch = patch.object(sandbox, 'POLICY_DIRECTORY', self.policies)
        self.directory_patch.start()
        self.addCleanup(self.directory_patch.stop)
        self.executable = self.root / 'Sensa'
        self.executable.write_bytes(b'\x7fELF\x02isolated non-executable fixture')
        self.item = sandbox.plan(self.executable)
        self.system = FakeSystem()

    def root_owned(self):
        original = os.fstat
        def fstat(fd):
            info = original(fd)
            return SimpleNamespace(st_uid=0, st_mode=info.st_mode, st_nlink=info.st_nlink,
                                   st_dev=info.st_dev, st_ino=info.st_ino, st_ctime_ns=info.st_ctime_ns, st_size=info.st_size)
        return patch.object(sandbox.os, 'fstat', side_effect=fstat)

    def test_exact_path_preserves_spaces_unicode_and_escapes_glob_variables(self):
        directory = self.root / '空 格*?[a-z]{one,two}^@{UNDEFINED}"back\\slash'
        directory.mkdir()
        executable = directory / 'Sensa'
        executable.write_bytes(self.executable.read_bytes())
        item = sandbox.plan(executable)
        expected = str(executable).replace('\\', '\\\\')
        for character in '"*?[]{}^@':
            expected = expected.replace(character, '\\' + character)
        self.assertIn('"' + expected + '" flags=(unconfined)', item['policy'].decode())
        self.assertEqual(item['policy'].decode().count('\nprofile '), 1)
        self.assertEqual(item['policy'].decode().count('  userns,'), 1)
        self.assertNotIn('sysctl', item['policy'].decode())

    def test_control_character_policy_injection_is_rejected(self):
        for character in ('\n', '\r', '\x00', '\x1f', '\x7f'):
            with self.subTest(character=repr(character)), self.assertRaises(ValueError):
                sandbox.attachment('/tmp/' + character + 'profile injected /bin/** { userns, }/Sensa')

    def test_symlink_input_attaches_only_the_resolved_executable(self):
        link = self.root / 'launcher'
        link.symlink_to(self.executable)
        self.assertEqual(sandbox.plan(link), self.item)

    def test_non_elf_and_wrong_entry_are_rejected_without_execution(self):
        self.executable.write_bytes(b'#!/bin/sh\necho should-never-run')
        with self.assertRaises(ValueError):
            sandbox.plan(self.executable)
        other = self.root / 'other'
        other.write_bytes(b'\x7fELF\x02fixture')
        with self.assertRaises(ValueError):
            sandbox.plan(other)

    def test_other_user_writable_executable_or_parent_is_rejected(self):
        self.executable.chmod(0o666)
        with self.assertRaisesRegex(ValueError, 'replaceable'):
            sandbox.plan(self.executable)
        self.executable.chmod(0o644)
        self.root.chmod(0o777)
        with self.assertRaisesRegex(ValueError, 'replaceable'):
            sandbox.plan(self.executable)

    def test_helper_refuses_running_as_root_before_system_operations(self):
        with patch.object(sandbox.os, 'geteuid', return_value=0), patch.object(sandbox, 'trusted') as trusted:
            with self.assertRaisesRegex(ValueError, 'without sudo'):
                sandbox.System()
            trusted.assert_not_called()

    def test_world_writable_parent_cannot_be_used_for_system_tools(self):
        self.root.chmod(0o777)
        with self.assertRaises(ValueError):
            sandbox.trusted(self.executable)

    def test_privilege_boundary_uses_fixed_system_tool_not_shell_or_target(self):
        system = object.__new__(sandbox.System)
        system.tools = {'sudo': '/usr/bin/sudo', 'parser': '/usr/sbin/apparmor_parser'}
        with patch.object(sandbox.subprocess, 'run', return_value=SimpleNamespace(stdout=b'')) as run:
            system.call('parser', '--replace', '--skip-cache', data=self.item['policy'])
        self.assertEqual(run.call_args.args[0], ['/usr/bin/sudo', '--', '/usr/sbin/apparmor_parser', '--replace', '--skip-cache'])
        self.assertEqual(run.call_args.kwargs['input'], self.item['policy'])
        self.assertNotIn('shell', run.call_args.kwargs)

    def test_install_load_and_remove_have_real_exclusive_file_lifecycle(self):
        with self.root_owned():
            result = sandbox.register(self.system, self.item)
            self.assertTrue(result['created'])
            self.assertEqual(Path(result['profilePath']).read_bytes(), self.item['policy'])
            self.assertEqual(result['loadedProfiles'], [self.item['profileName'] + ' (unconfined)'])
            self.assertEqual(result['restrictionBefore'], result['restrictionAfter'])
            removed = sandbox.unregister(self.system, self.item, result['fileIdentity'])
        self.assertTrue(removed['removed'])
        self.assertFalse(Path(self.item['profilePath']).exists())
        self.assertEqual(self.system.loaded, [])
        self.assertEqual(self.system.calls[0][0:2], ('parser', ('--skip-kernel-load', '--skip-cache')))
        self.assertFalse(self.system.calls[0][3])

    def test_preexisting_registration_is_preserved_on_load_failure(self):
        path = Path(self.item['profilePath'])
        path.write_bytes(self.item['policy'])
        self.system.fail_replace = True
        with self.root_owned(), self.assertRaises(subprocess.CalledProcessError):
            sandbox.register(self.system, self.item)
        self.assertEqual(path.read_bytes(), self.item['policy'])
        self.assertFalse(any(name == 'rm' for name, *_ in self.system.calls))

    def test_new_registration_is_rolled_back_when_parser_does_not_load(self):
        self.system.fail_replace = True
        with self.root_owned(), self.assertRaises(subprocess.CalledProcessError):
            sandbox.register(self.system, self.item)
        self.assertFalse(Path(self.item['profilePath']).exists())
        self.assertEqual(list(self.policies.iterdir()), [])

    def test_existing_different_profile_is_not_overwritten(self):
        path = Path(self.item['profilePath'])
        path.write_bytes(b'other administrator configuration')
        with self.root_owned(), self.assertRaisesRegex(ValueError, 'different content'):
            sandbox.register(self.system, self.item)
        self.assertEqual(path.read_bytes(), b'other administrator configuration')
        self.assertEqual([call[0] for call in self.system.calls], ['parser'])

    def test_exclusive_creation_cannot_overwrite_a_concurrent_registration(self):
        original = self.system.call
        def call(name, *args, **kwargs):
            if name == 'ln':
                Path(args[-1]).write_bytes(b'concurrent administrator registration')
                raise FileExistsError(args[-1])
            return original(name, *args, **kwargs)
        self.system.call = call
        with self.root_owned(), self.assertRaises(FileExistsError):
            sandbox.register(self.system, self.item)
        self.assertEqual(Path(self.item['profilePath']).read_bytes(), b'concurrent administrator registration')
        self.assertEqual(len(list(self.policies.iterdir())), 1)
        self.assertEqual(self.system.loaded, [])

    def test_orphan_kernel_profile_is_not_replaced_or_removed(self):
        self.system.loaded = [self.item['profileName'] + ' (unconfined)']
        with self.root_owned(), self.assertRaisesRegex(ValueError, 'kernel profile'):
            sandbox.register(self.system, self.item)
        self.assertEqual(self.system.loaded, [self.item['profileName'] + ' (unconfined)'])
        self.assertEqual(self.system.calls, [])
        self.assertFalse(Path(self.item['profilePath']).exists())

    def test_symlink_profile_is_never_followed_or_deleted(self):
        target = self.root / 'administrator-file'
        target.write_bytes(b'preserve me')
        Path(self.item['profilePath']).symlink_to(target)
        with self.root_owned(), self.assertRaises(OSError):
            sandbox.unregister(self.system, self.item)
        self.assertEqual(target.read_bytes(), b'preserve me')
        self.assertEqual(self.system.calls, [])

    def test_writable_or_hardlinked_profile_is_rejected(self):
        path = Path(self.item['profilePath'])
        path.write_bytes(self.item['policy'])
        path.chmod(0o666)
        with self.root_owned(), self.assertRaises(ValueError):
            sandbox.unregister(self.system, self.item)
        path.chmod(0o644)
        os.link(path, self.root / 'second-link')
        with self.root_owned(), self.assertRaises(ValueError):
            sandbox.unregister(self.system, self.item)
        self.assertEqual(self.system.calls, [])

    def test_special_profile_file_is_rejected_without_blocking(self):
        path = Path(self.item['profilePath'])
        os.mkfifo(path)
        with self.root_owned(), self.assertRaises(ValueError):
            sandbox.unregister(self.system, self.item)
        self.assertTrue(path.exists())
        self.assertEqual(self.system.calls, [])

    def test_profile_replaced_while_waiting_for_lock_is_not_touched(self):
        path = Path(self.item['profilePath'])
        path.write_bytes(self.item['policy'])
        def replaced(_descriptor, _operation):
            path.unlink()
            path.write_bytes(b'new registration while waiting')
        with self.root_owned(), patch.object(sandbox.fcntl, 'flock', side_effect=replaced), self.assertRaises(ValueError):
            sandbox.unregister(self.system, self.item)
        self.assertEqual(path.read_bytes(), b'new registration while waiting')
        self.assertEqual(self.system.calls, [])

    def test_old_cleanup_receipt_cannot_delete_new_registration(self):
        with self.root_owned():
            first = sandbox.register(self.system, self.item)
            sandbox.unregister(self.system, self.item, first['fileIdentity'])
            second = sandbox.register(self.system, self.item)
            self.assertNotEqual(first['fileIdentity'], second['fileIdentity'])
            calls = len(self.system.calls)
            removed = sandbox.unregister(self.system, self.item, first['fileIdentity'])
        self.assertEqual(removed['reason'], 'registration-replaced')
        self.assertFalse(removed['removed'])
        self.assertEqual(len(self.system.calls), calls)
        self.assertTrue(Path(self.item['profilePath']).exists())
        self.assertEqual(self.system.loaded, [self.item['profileName'] + ' (unconfined)'])

    def test_failed_unload_preserves_registration_file(self):
        with self.root_owned():
            installed = sandbox.register(self.system, self.item)
            self.system.fail_remove = True
            with self.assertRaises(subprocess.CalledProcessError):
                sandbox.unregister(self.system, self.item, installed['fileIdentity'])
        self.assertEqual(Path(self.item['profilePath']).read_bytes(), self.item['policy'])


if __name__ == '__main__':
    unittest.main()
