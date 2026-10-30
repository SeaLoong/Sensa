#!/usr/bin/env python3
"""Register one Linux Desktop executable for AppArmor user namespaces.

Run as the desktop user. Only fixed, root-owned system utilities use sudo;
neither this script nor Sensa runs as root. No global kernel setting changes.
"""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import uuid

if sys.platform == 'linux':
    import fcntl
else:
    fcntl = None

POLICY_DIRECTORY = Path('/etc/apparmor.d')
PROFILE_LIST = Path('/sys/kernel/security/apparmor/profiles')
RESTRICTION = Path('/proc/sys/kernel/apparmor_restrict_unprivileged_userns')
TOOLS = {'sudo': '/usr/bin/sudo', 'install': '/usr/bin/install',
         'ln': '/usr/bin/ln', 'rm': '/usr/bin/rm', 'cat': '/usr/bin/cat',
         'parser': '/usr/sbin/apparmor_parser'}


def attachment(path):
    value = str(path)
    if not value.startswith('/') or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise ValueError('The executable needs an absolute path without control characters.')
    value.encode('utf-8', errors='strict')
    # Quoting alone does not disable AppArmor glob/variable expansion.
    return '"' + ''.join('\\' + c if c in '\\"*?[]{}^@' else c for c in value) + '"'


def plan(executable):
    executable = Path(executable).resolve(strict=True)
    for entry in [*reversed(executable.parents), executable]:
        attributes = entry.lstat()
        sticky_root = (stat.S_ISDIR(attributes.st_mode) and attributes.st_uid == 0
                       and attributes.st_mode & stat.S_ISVTX)
        if (attributes.st_uid not in (0, os.getuid())
                or (attributes.st_mode & 0o022 and not sticky_root)):
            raise ValueError('The executable and its directories must not be replaceable by other users.')
    with executable.open('rb') as stream:
        info = os.fstat(stream.fileno())
        if executable.name != 'Sensa' or not stat.S_ISREG(info.st_mode) or stream.read(5) != b'\x7fELF\x02':
            raise ValueError('Choose the extracted Linux Desktop Sensa executable.')
    name = 'sensa-desktop-' + hashlib.sha256(os.fsencode(executable)).hexdigest()
    policy = ('# Sensa: exact executable user-namespace permission.\n'
              'abi <abi/4.0>,\ninclude <tunables/global>\n'
              f'profile {name} {attachment(executable)} flags=(unconfined) {{\n  userns,\n}}\n').encode()
    return {'executable': str(executable), 'profileName': name,
            'profilePath': str(POLICY_DIRECTORY / name), 'policy': policy,
            'policySha256': hashlib.sha256(policy).hexdigest()}


def trusted(path, directory=False):
    """Validate the resolved system tool and every parent before sudo."""
    path = Path(path).resolve(strict=True)
    for item in [*reversed(path.parents), path]:
        info = item.lstat()
        if (info.st_uid != 0 or info.st_mode & 0o022 or stat.S_ISLNK(info.st_mode)
                or not (stat.S_ISDIR(info.st_mode) if item != path or directory else stat.S_ISREG(info.st_mode))):
            raise ValueError('System tools and profile directories must be root-owned and not writable by other users.')
    return path


class System:
    def __init__(self):
        if sys.platform != 'linux' or os.geteuid() == 0:
            raise ValueError('Run this helper as the Linux desktop user, without sudo.')
        self.directory = trusted(POLICY_DIRECTORY, directory=True)
        if self.directory != POLICY_DIRECTORY:
            raise ValueError('The AppArmor profile directory cannot be a symlink.')
        self.tools = {name: str(trusted(path)) for name, path in TOOLS.items()}
        self.tool_identities = {}
        for name, path in self.tools.items():
            attributes = Path(path).stat()
            self.tool_identities[name] = {'path': path, 'uid': attributes.st_uid,
                                          'mode': format(stat.S_IMODE(attributes.st_mode), '04o'),
                                          'identity': identity(attributes), 'parentChainValidated': True}

    def call(self, name, *arguments, data=None, privileged=True):
        command = [self.tools[name], *map(str, arguments)]
        if privileged:
            command = [self.tools['sudo'], '--', *command]
        result = subprocess.run(command, input=data, capture_output=True, check=True)
        return result.stdout

    def profiles(self):
        return self.call('cat', '--', PROFILE_LIST).decode('utf-8').splitlines()

    def restriction(self):
        return RESTRICTION.read_text().strip() if RESTRICTION.exists() else None


def identity(info):
    return f'{info.st_dev}:{info.st_ino}:{info.st_ctime_ns}'


@contextmanager
def locked_profile(path, policy, expected=None):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        info = os.fstat(descriptor)
        current = Path(path).lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022
                or info.st_nlink != 1 or identity(info) != identity(current)):
            raise ValueError('Refusing an unowned, linked or replaced AppArmor profile.')
        if expected is not None and identity(info) != expected:
            yield None
            return
        with os.fdopen(os.dup(descriptor), 'rb') as stream:
            if stream.read(len(policy) + 1) != policy:
                raise ValueError('An existing profile has different content; it will not be overwritten.')
        yield identity(info)
    finally:
        os.close(descriptor)


def visible(system, item):
    return [line for line in system.profiles() if line.startswith(item['profileName'] + ' (')]


def register(system, item):
    policy, path = item['policy'], Path(item['profilePath'])
    before = system.restriction()
    if not path.exists() and not path.is_symlink() and visible(system, item):
        raise ValueError('A kernel profile without this registration already exists; it will not be replaced.')
    # Grammar validation cannot alter kernel state and happens before file writes.
    system.call('parser', '--skip-kernel-load', '--skip-cache', data=policy, privileged=False)
    created = False
    if not path.exists() and not path.is_symlink():
        stage = POLICY_DIRECTORY / ('.sensa-sandbox-' + uuid.uuid4().hex)
        try:
            with tempfile.NamedTemporaryFile(prefix='sensa-apparmor-') as source:
                source.write(policy)
                source.flush()
                system.call('install', '--mode=0644', '--owner=root', '--group=root', '--', source.name, stage)
            # A hard link gives exclusive creation: never overwrite a concurrent registration.
            system.call('ln', '--', stage, path)
            created = True
        finally:
            system.call('rm', '--force', '--', stage)
    with locked_profile(path, policy) as lease:
        try:
            system.call('parser', '--replace', '--skip-cache', data=policy)
            loaded = visible(system, item)
            if len(loaded) != 1 or system.restriction() != before:
                raise ValueError('The exact profile was not loaded or a kernel restriction changed.')
            attributes = path.lstat()
            metadata = {'uid': attributes.st_uid, 'mode': format(stat.S_IMODE(attributes.st_mode), '04o'),
                        'links': attributes.st_nlink, 'identity': identity(attributes)}
        except BaseException:
            if created:
                # Only our locked, unchanged file is rolled back. Existing profiles stay intact.
                if visible(system, item):
                    system.call('parser', '--remove', '--skip-cache', data=policy)
                    if visible(system, item):
                        raise ValueError('Rollback could not unload the profile; preserving its registration file.')
                system.call('rm', '--', path)
            raise
    return {'schema': 1, 'operation': 'install', 'created': created, 'fileIdentity': lease,
            'executable': item['executable'], 'profileName': item['profileName'],
            'profilePath': item['profilePath'], 'policySha256': item['policySha256'],
            'loadedProfiles': loaded, 'restrictionBefore': before, 'restrictionAfter': system.restriction(),
            'systemTools': system.tool_identities, 'fileMetadata': metadata}


def unregister(system, item, expected=None):
    path = Path(item['profilePath'])
    before = system.restriction()
    if not path.exists() and not path.is_symlink():
        return {'schema': 1, 'operation': 'remove', 'removed': False, 'reason': 'absent'}
    with locked_profile(path, item['policy'], expected) as lease:
        if lease is None:
            return {'schema': 1, 'operation': 'remove', 'removed': False, 'reason': 'registration-replaced'}
        system.call('parser', '--remove', '--skip-cache', data=item['policy'])
        if visible(system, item):
            raise ValueError('The profile remains loaded; preserving its registration file.')
        system.call('rm', '--', path)
    if system.restriction() != before:
        raise ValueError('The kernel restriction changed during removal.')
    return {'schema': 1, 'operation': 'remove', 'removed': True, 'fileIdentity': lease,
            'profileName': item['profileName'], 'profilePath': item['profilePath'],
            'loadedProfiles': [], 'restrictionBefore': before, 'restrictionAfter': system.restriction()}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('install', 'remove'))
    parser.add_argument('--executable', default=str(Path(__file__).resolve().with_name('Sensa')))
    parser.add_argument('--expected-file', help='Only remove this dev:inode:ctime_ns registration (CI cleanup).')
    args = parser.parse_args(argv)
    if args.expected_file and (args.operation != 'remove' or not all(p.isdecimal() for p in args.expected_file.split(':'))
                               or len(args.expected_file.split(':')) != 3):
        raise ValueError('Expected file identity must be dev:inode:ctime_ns and is only used during removal.')
    item = plan(args.executable)
    system = System()
    result = register(system, item) if args.operation == 'install' else unregister(system, item, args.expected_file)
    result['userId'] = os.getuid()
    result['effectiveUserId'] = os.geteuid()
    result['helperSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    print(json.dumps(result, ensure_ascii=False))
    return result


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print('Linux sandbox registration failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
